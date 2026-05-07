import test from "node:test";
import assert from "node:assert/strict";

import {
  createLayoutProfileRuntimeController,
  normalizeLayoutProfileRecord,
  resolveLayoutProfileToken
} from "../src/public/layout-profile-runtime-controller.js";

function createElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    value: "",
    textContent: "",
    disabled: false,
    selected: false,
    hidden: false,
    children: [],
    listeners: new Map(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      return child;
    },
    addEventListener(type, handler) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler({ type, preventDefault() {}, ...event });
      }
    },
    click() {
      this.dispatch("click");
    }
  };
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

function createDomLikeSelectElement() {
  const nodes = [];
  const children = {};
  Object.defineProperty(children, "length", {
    get() {
      return nodes.length;
    }
  });
  Object.defineProperty(children, "0", {
    get() {
      return nodes[0];
    }
  });
  children.item = (index) => nodes[index] || null;

  return {
    tagName: "SELECT",
    value: "",
    textContent: "",
    disabled: false,
    selected: false,
    hidden: false,
    children,
    get firstChild() {
      return nodes[0] || null;
    },
    appendChild(child) {
      nodes.push(child);
      return child;
    },
    removeChild(child) {
      const index = nodes.indexOf(child);
      if (index >= 0) {
        nodes.splice(index, 1);
      }
      return child;
    },
    addEventListener() {},
    dispatch() {},
    click() {}
  };
}

test("resolveLayoutProfileToken matches exact and unique prefix selectors", () => {
  const profiles = [
    {
      id: "focus",
      name: "Focus Layout",
      createdAt: 1,
      updatedAt: 1,
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    },
    {
      id: "ops",
      name: "Ops Layout",
      createdAt: 2,
      updatedAt: 2,
      layout: {
        activeDeckId: "ops",
        sidebarVisible: false,
        sessionFilterText: "ops",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    }
  ];

  assert.equal(resolveLayoutProfileToken(profiles, "focus").profile?.id, "focus");
  assert.equal(resolveLayoutProfileToken(profiles, "Ops Layout").profile?.id, "ops");
  assert.equal(resolveLayoutProfileToken(profiles, "op").profile?.id, "ops");
  assert.match(resolveLayoutProfileToken(profiles, "missing").error, /Unknown layout profile/);
});

test("resolveLayoutProfileToken rejects ambiguous profile prefixes deterministically", () => {
  const profiles = [
    {
      id: "ops-a",
      name: "Ops Alpha",
      createdAt: 1,
      updatedAt: 1,
      layout: {
        activeDeckId: "ops",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    },
    {
      id: "ops-b",
      name: "Ops Beta",
      createdAt: 2,
      updatedAt: 2,
      layout: {
        activeDeckId: "ops",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    }
  ];

  const resolved = resolveLayoutProfileToken(profiles, "ops");
  assert.equal(resolved.profile, null);
  assert.match(resolved.error, /Ambiguous layout profile 'ops'/);
});

test("normalizeLayoutProfileRecord filters malformed terminal settings and split-layout branches", () => {
  const normalized = normalizeLayoutProfileRecord({
    id: " ops ",
    name: " Ops Layout ",
    createdAt: "bad",
    updatedAt: 7,
    layout: {
      activeDeckId: " dev ",
      controlPanePosition: "left",
      controlPaneSize: "500",
      deckTerminalSettings: {
        dev: { cols: 120, rows: 40 },
        broken: { cols: "wide", rows: 20 },
        "": { cols: 80, rows: 24 }
      },
      deckSplitLayouts: {
        dev: {
          root: {
            type: "column",
            children: [
              { type: "pane", paneId: " Main " },
              { type: "pane", paneId: "" },
              {
                type: "row",
                children: [{ type: "pane", paneId: "side" }]
              }
            ],
            weights: [3, -1, 0]
          },
          paneSessions: {
            main: ["s-1", "s-1", "s-2"],
            side: ["s-3"],
            ghost: ["s-4"]
          }
        }
      }
    }
  });

  assert.deepEqual(normalized, {
    id: "ops",
    name: "Ops Layout",
    createdAt: 0,
    updatedAt: 7,
    layout: {
      activeDeckId: "dev",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "left",
      controlPaneSize: 500,
      deckTerminalSettings: {
        dev: { cols: 120, rows: 40 }
      },
      deckSplitLayouts: {
        dev: {
          root: {
            type: "column",
            children: [{ type: "pane", paneId: "main" }, { type: "pane", paneId: "side" }],
            weights: [0.5, 0.5]
          },
          paneSessions: {
            main: ["s-1", "s-2"],
            side: ["s-3"]
          }
        }
      }
    }
  });
});

test("layout profile runtime controller loads, saves, renames, and deletes profiles", async () => {
  const selectEl = createElement("select");
  const statusEl = createElement("p");
  const apiCalls = [];
  let nextCreatedId = 1;
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl,
    statusEl,
    api: {
      async listLayoutProfiles() {
        apiCalls.push(["list"]);
        return [
          {
            id: "focus",
            name: "Focus Layout",
            createdAt: 1,
            updatedAt: 2,
            layout: {
              activeDeckId: "default",
              sidebarVisible: true,
              sessionFilterText: "",
              controlPaneVisible: true,
              controlPanePosition: "bottom",
              controlPaneSize: 240,
              deckTerminalSettings: {
                default: { cols: 80, rows: 20 }
              },
              deckSplitLayouts: {
                default: {
                  root: {
                    type: "pane",
                    paneId: "main"
                  },
                  paneSessions: {
                    main: ["s-default"]
                  }
                }
              }
            }
          }
        ];
      },
      async createLayoutProfile(payload) {
        apiCalls.push(["create", payload]);
        const created = {
          id: `layout-${nextCreatedId++}`,
          name: payload.name,
          createdAt: 3,
          updatedAt: 3,
          layout: payload.layout
        };
        return created;
      },
      async updateLayoutProfile(profileId, payload) {
        apiCalls.push(["update", profileId, payload]);
        return {
          id: profileId,
          name: payload.name || "unchanged",
          createdAt: 3,
          updatedAt: 4,
          layout: {
            activeDeckId: "default",
            sidebarVisible: true,
            sessionFilterText: "",
            controlPaneVisible: true,
            controlPanePosition: "bottom",
            controlPaneSize: 240,
            deckTerminalSettings: {}
          }
        };
      },
      async deleteLayoutProfile(profileId) {
        apiCalls.push(["delete", profileId]);
      }
    },
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "ops critical",
    getSidebarVisible: () => false,
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 132, rows: 40 } : { cols: 96, rows: 24 })
  });

  const loaded = await controller.loadProfiles();
  assert.equal(loaded.length, 1);
  assert.equal(selectEl.children.length, 1);
  assert.equal(statusEl.textContent, "1 profile(s)");

  controller.replaceProfiles([
    {
      id: "focus",
      name: "Focus Layout",
      createdAt: 1,
      updatedAt: 2,
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {
          default: { cols: 80, rows: 20 }
        },
        deckSplitLayouts: {
          ops: {
              root: {
                type: "row",
                weights: [0.5, 0.5],
                children: [
                  { type: "pane", paneId: "left" },
                  { type: "pane", paneId: "right" }
                ]
            },
            paneSessions: {
              left: ["s-ops-1"],
              right: ["s-ops-2"]
            }
          }
        }
      }
    }
  ]);

  const createFeedback = await controller.createProfileFromCurrentLayout("Ops Focus");
  assert.equal(createFeedback, "Saved layout profile [layout-1] Ops Focus.");
  assert.equal(controller.listProfiles().length, 2);
  assert.deepEqual(apiCalls[1][1].layout, {
    activeDeckId: "ops",
    sidebarVisible: false,
    sessionFilterText: "ops critical",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 240,
    deckTerminalSettings: {
      default: { cols: 96, rows: 24 },
      ops: { cols: 132, rows: 40 }
    },
    deckSplitLayouts: {
      ops: {
        root: {
          type: "row",
          weights: [0.5, 0.5],
          children: [
            { type: "pane", paneId: "left" },
            { type: "pane", paneId: "right" }
          ]
        },
        paneSessions: {
          left: ["s-ops-1"],
          right: ["s-ops-2"]
        }
      }
    }
  });

  const resolved = controller.resolveProfile("layout-1");
  assert.equal(resolved.profile?.id, "layout-1");

  const renameFeedback = await controller.renameProfileById("layout-1", "Ops Focus Updated");
  assert.equal(renameFeedback, "Renamed layout profile [layout-1] to Ops Focus Updated.");
  assert.equal(controller.getProfile("layout-1")?.name, "Ops Focus Updated");

  const deleteFeedback = await controller.deleteProfileById("layout-1");
  assert.equal(deleteFeedback, "Deleted layout profile [layout-1] Ops Focus Updated.");
  assert.equal(controller.listProfiles().length, 1);
});

test("layout profile runtime controller prompt flows use injected request and confirm actions", async () => {
  const prompts = ["Current Layout", "Renamed Layout"];
  const confirms = [true];
  const apiCalls = [];
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl: createElement("select"),
    statusEl: createElement("p"),
    requestText: async () => prompts.shift() ?? null,
    confirmAction: async () => confirms.shift() ?? false,
    api: {
      async createLayoutProfile(payload) {
        apiCalls.push(["create", payload.name]);
        return {
          id: "layout-1",
          name: payload.name,
          createdAt: 1,
          updatedAt: 1,
          layout: payload.layout
        };
      },
      async updateLayoutProfile(profileId, payload) {
        apiCalls.push(["update", profileId, payload.name]);
        return {
          id: profileId,
          name: payload.name,
          createdAt: 1,
          updatedAt: 2,
          layout: {
            activeDeckId: "default",
            sidebarVisible: true,
            sessionFilterText: "",
            controlPaneVisible: true,
            controlPanePosition: "bottom",
            controlPaneSize: 185,
            deckTerminalSettings: {}
          }
        };
      },
      async deleteLayoutProfile(profileId) {
        apiCalls.push(["delete", profileId]);
      }
    }
  });

  await controller.createProfileFlow();
  await controller.renameSelectedProfileFlow();
  await controller.deleteSelectedProfileFlow();

  assert.deepEqual(apiCalls, [
    ["create", "Current Layout"],
    ["update", "layout-1", "Renamed Layout"],
    ["delete", "layout-1"]
  ]);
});

test("layout profile runtime controller clears DOM-like select children before rerender", async () => {
  const selectEl = createDomLikeSelectElement();
  const statusEl = createElement("p");
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl,
    statusEl,
    api: {
      async listLayoutProfiles() {
        return [
          {
            id: "focus",
            name: "Focus Layout",
            createdAt: 1,
            updatedAt: 2,
            layout: {
              activeDeckId: "default",
              sidebarVisible: true,
              sessionFilterText: "",
              controlPaneVisible: true,
              controlPanePosition: "bottom",
              controlPaneSize: 240,
              deckTerminalSettings: {
                default: { cols: 80, rows: 20 }
              }
            }
          }
        ];
      }
    }
  });

  await controller.loadProfiles();
  assert.equal(selectEl.children.length, 1);

  await controller.loadProfiles();
  assert.equal(selectEl.children.length, 1);
  assert.equal(selectEl.children.item(0)?.value, "focus");
  assert.equal(statusEl.textContent, "1 profile(s)");
});

test("layout profile runtime controller applies persisted layout state through shared runtime hooks", async () => {
  const updates = [];
  const runtimeEvents = [];
  const sidebarChanges = [];
  const filterChanges = [];
  const controlPaneChanges = [];
  const activeDeckChanges = [];
  const renderCalls = [];
  const decks = [
    { id: "default", name: "Default", settings: { terminal: { cols: 96, rows: 24 } } },
    { id: "ops", name: "Ops", settings: { terminal: { cols: 120, rows: 32 } } }
  ];
  const controller = createLayoutProfileRuntimeController({
    api: {
      async updateDeck(deckId, payload) {
        updates.push([deckId, payload]);
        return {
          ...decks.find((deck) => deck.id === deckId),
          settings: payload.settings
        };
      }
    },
    getDecks: () => decks,
    getDeckById: (deckId) => decks.find((deck) => deck.id === deckId) || null,
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    getSidebarVisible: () => true,
    getControlPaneState: () => ({ controlPaneVisible: true, controlPanePosition: "bottom", controlPaneSize: 240 }),
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 120, rows: 32 } : { cols: 96, rows: 24 }),
    setSidebarVisible: (value) => sidebarChanges.push(value),
    setSessionFilterText: (value) => filterChanges.push(value),
    setControlPaneState: (value) => controlPaneChanges.push(value),
    setActiveDeck: (deckId) => {
      activeDeckChanges.push(deckId);
      return true;
    },
    applyRuntimeEvent: (event, options) => runtimeEvents.push({ event, options }),
    requestRender: () => renderCalls.push("render")
  });

  controller.replaceProfiles([
    {
      id: "ops-focus",
      name: "Ops Focus",
      createdAt: 1,
      updatedAt: 2,
      layout: {
        activeDeckId: "ops",
        sidebarVisible: false,
        sessionFilterText: "ops critical",
        controlPaneVisible: false,
        controlPanePosition: "left",
        controlPaneSize: 320,
        deckTerminalSettings: {
          default: { cols: 96, rows: 24 },
          ops: { cols: 132, rows: 40 }
        }
      }
    }
  ]);

  const feedback = await controller.applyProfileById("ops-focus");
  assert.equal(feedback, "Applied layout profile [ops-focus] Ops Focus.");
  assert.deepEqual(updates, [
    [
      "ops",
      {
        settings: {
          terminal: { cols: 132, rows: 40 }
        }
      }
    ]
  ]);
  assert.equal(runtimeEvents.length, 1);
  assert.equal(runtimeEvents[0].event.type, "deck.updated");
  assert.deepEqual(runtimeEvents[0].options, { preferredActiveDeckId: "ops" });
  assert.deepEqual(sidebarChanges, [false]);
  assert.deepEqual(filterChanges, ["ops critical"]);
  assert.deepEqual(controlPaneChanges, [
    { controlPaneVisible: false, controlPanePosition: "left", controlPaneSize: 320 }
  ]);
  assert.deepEqual(activeDeckChanges, ["ops"]);
  assert.deepEqual(renderCalls, ["render"]);
});

test("layout profile runtime controller clears stale deck split layouts during deck-scoped reapply when the snapshot has none", async () => {
  const updates = [];
  let currentLayouts = {
    default: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-default"] }
    },
    ops: {
      root: {
        type: "row",
        weights: [0.5, 0.5],
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ]
      },
      paneSessions: {
        left: ["s-ops-1"],
        right: ["s-ops-2"]
      }
    }
  };
  const controller = createLayoutProfileRuntimeController({
    api: {
      async updateDeck(deckId, payload) {
        updates.push([deckId, payload]);
        return {
          id: deckId,
          name: deckId.toUpperCase(),
          settings: payload.settings
        };
      }
    },
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getDeckById: (deckId) => ({ id: deckId, settings: {} }),
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    getSidebarVisible: () => true,
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 120, rows: 32 } : { cols: 96, rows: 24 }),
    getDeckSplitLayouts: () => currentLayouts,
    setDeckSplitLayouts: (layouts) => {
      currentLayouts = layouts;
    },
    setSidebarVisible() {},
    setSessionFilterText() {},
    setControlPaneState() {},
    setActiveDeck() {},
    applyRuntimeEvent() {},
    requestRender() {}
  });

  const feedback = await controller.applyLayoutSnapshot(
    {
      activeDeckId: "ops",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 240,
      deckTerminalSettings: {
        ops: { cols: 132, rows: 40 }
      },
      deckSplitLayouts: {}
    },
    {
      scope: "deck",
      targetDeckId: "ops"
    }
  );

  assert.equal(feedback, "Applied layout snapshot for deck [ops].");
  assert.deepEqual(updates, [
    [
      "ops",
      {
        settings: {
          terminal: { cols: 132, rows: 40 }
        }
      }
    ]
  ]);
  assert.ok(currentLayouts.default);
  assert.equal(currentLayouts.ops, undefined);
});

test("layout profile runtime controller prefers the injected split-layout merge seam when available", async () => {
  const mergedLayouts = [];
  const controller = createLayoutProfileRuntimeController({
    api: {
      async updateDeck() {
        throw new Error("updateDeck should not run");
      }
    },
    getDecks: () => [{ id: "ops" }],
    getDeckById: () => ({ id: "ops", settings: {} }),
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    getSidebarVisible: () => true,
    getDeckTerminalGeometry: () => ({ cols: 132, rows: 40 }),
    getDeckSplitLayouts: () => ({
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-1"] }
      }
    }),
    setDeckSplitLayouts() {
      throw new Error("setDeckSplitLayouts should not run");
    },
    mergeDeckSplitLayouts(layouts, runtimeOptions) {
      mergedLayouts.push([layouts, runtimeOptions]);
    },
    setSidebarVisible() {},
    setSessionFilterText() {},
    setControlPaneState() {},
    setActiveDeck() {},
    applyRuntimeEvent() {},
    requestRender() {}
  });

  const feedback = await controller.applyLayoutSnapshot({
    activeDeckId: "ops",
    sidebarVisible: true,
    sessionFilterText: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 240,
    deckTerminalSettings: {},
    deckSplitLayouts: {
      ops: {
        root: { type: "pane", paneId: "detail" },
        paneSessions: { detail: ["s-1"] }
      }
    }
  });

  assert.equal(feedback, "Applied layout snapshot for deck [ops].");
  assert.deepEqual(mergedLayouts, [
    [
      {
        ops: {
          root: { type: "pane", paneId: "detail" },
          paneSessions: { detail: ["s-1"] }
        }
      },
      {
        scope: "all",
        targetDeckId: "ops"
      }
    ]
  ]);
});

test("layout profile runtime controller rejects malformed create and update payloads deterministically", async () => {
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl: createElement("select"),
    statusEl: createElement("p"),
    api: {
      async createLayoutProfile() {
        return {
          id: "",
          name: "",
          layout: null
        };
      },
      async updateLayoutProfile(profileId) {
        return {
          id: profileId,
          name: "",
          layout: null
        };
      }
    },
    getDecks: () => [{ id: "default" }],
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    getSidebarVisible: () => true,
    getDeckTerminalGeometry: () => ({ cols: 96, rows: 24 })
  });

  await assert.rejects(
    () => controller.createProfileFromCurrentLayout("Broken Layout"),
    /Layout profile API returned an invalid profile record for layout profile save/
  );

  controller.replaceProfiles([
    {
      id: "focus",
      name: "Focus Layout",
      createdAt: 1,
      updatedAt: 2,
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    }
  ]);

  await assert.rejects(
    () => controller.renameProfileById("focus", "Broken Focus"),
    /Layout profile API returned an invalid profile record for layout profile rename/
  );
});

test("layout profile runtime controller handles fail-closed helper branches deterministically", async () => {
  const errors = [];
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl: createElement("select"),
    statusEl: createElement("p"),
    requestText: async () => "",
    confirmAction: async () => false,
    setError: (message) => errors.push(message),
    getErrorMessage: (error, fallback) => `${fallback} ${error.message}`,
    api: {
      async listLayoutProfiles() {
        throw new Error("offline");
      }
    },
    getDecks: () => [{ id: "" }, { id: "ops" }],
    getActiveDeckId: () => "",
    getSessionFilterText: () => " current ",
    getSidebarVisible: () => true,
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 120, rows: 40 } : { cols: "bad", rows: 0 })
  });

  assert.deepEqual(await controller.loadProfiles(), []);
  assert.match(errors[0], /Failed to load layout profiles\./);
  assert.equal(controller.getProfile(""), null);
  assert.equal(controller.getProfile("missing"), null);
  assert.equal(controller.removeProfile(""), false);
  assert.equal(controller.removeProfile("missing"), false);
  assert.deepEqual(controller.captureCurrentLayout(), {
    activeDeckId: "default",
    sidebarVisible: true,
    sessionFilterText: "current",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185,
    deckTerminalSettings: {
      ops: { cols: 120, rows: 40 }
    },
    deckSplitLayouts: {}
  });

  await assert.rejects(() => controller.applyProfileById("missing"), /Unknown layout profile/);
  await assert.rejects(() => controller.renameProfileById("missing", "Renamed"), /Unknown layout profile/);
  await assert.rejects(() => controller.deleteProfileById("missing"), /Unknown layout profile/);
  await assert.rejects(() => controller.createProfileFromCurrentLayout(""), /Layout profile name is required/);

  assert.equal(await controller.createProfileFlow(""), "");
  assert.equal(await controller.renameSelectedProfileFlow(""), "");
  assert.equal(await controller.deleteSelectedProfileFlow(), "");
});

test("layout profile runtime controller tolerates missing API helpers and cancelled prompt flows", async () => {
  const selectEl = createElement("select");
  const statusEl = createElement("p");
  const controller = createLayoutProfileRuntimeController({
    documentRef: createDocumentRef(),
    selectEl,
    statusEl,
    requestText: async () => null,
    confirmAction: async () => false,
    api: {},
    getDecks: () => [{ id: "default" }],
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    getSidebarVisible: () => true,
    getDeckTerminalGeometry: () => ({ cols: 96, rows: 24 })
  });

  assert.deepEqual(await controller.loadProfiles(), []);
  assert.equal(statusEl.textContent, "No saved layout profiles.");
  assert.equal(selectEl.children.length, 1);
  assert.equal(await controller.applySelectedProfileFlow(), "");
  assert.equal(await controller.createProfileFlow(), "");

  controller.replaceProfiles([
    {
      id: "focus",
      name: "Focus Layout",
      createdAt: 1,
      updatedAt: 2,
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 240,
        deckTerminalSettings: {}
      }
    }
  ]);

  assert.equal(await controller.renameSelectedProfileFlow(), "");
  assert.equal(await controller.deleteSelectedProfileFlow(), "");
});
