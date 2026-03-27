import test from "node:test";
import assert from "node:assert/strict";

import {
  createLayoutProfileRuntimeController,
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
    { id: "focus", name: "Focus Layout", createdAt: 1, updatedAt: 1, layout: { activeDeckId: "default", sidebarVisible: true, sessionFilterText: "", deckTerminalSettings: {} } },
    { id: "ops", name: "Ops Layout", createdAt: 2, updatedAt: 2, layout: { activeDeckId: "ops", sidebarVisible: false, sessionFilterText: "ops", deckTerminalSettings: {} } }
  ];

  assert.equal(resolveLayoutProfileToken(profiles, "focus").profile?.id, "focus");
  assert.equal(resolveLayoutProfileToken(profiles, "Ops Layout").profile?.id, "ops");
  assert.equal(resolveLayoutProfileToken(profiles, "op").profile?.id, "ops");
  assert.match(resolveLayoutProfileToken(profiles, "missing").error, /Unknown layout profile/);
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
              deckTerminalSettings: {
                default: { cols: 80, rows: 20 }
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

  const createFeedback = await controller.createProfileFromCurrentLayout("Ops Focus");
  assert.equal(createFeedback, "Saved layout profile [layout-1] Ops Focus.");
  assert.equal(controller.listProfiles().length, 2);
  assert.deepEqual(apiCalls[1][1].layout, {
    activeDeckId: "ops",
    sidebarVisible: false,
    sessionFilterText: "ops critical",
    deckTerminalSettings: {
      default: { cols: 96, rows: 24 },
      ops: { cols: 132, rows: 40 }
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
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 120, rows: 32 } : { cols: 96, rows: 24 }),
    setSidebarVisible: (value) => sidebarChanges.push(value),
    setSessionFilterText: (value) => filterChanges.push(value),
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
  assert.deepEqual(activeDeckChanges, ["ops"]);
  assert.deepEqual(renderCalls, ["render"]);
});
