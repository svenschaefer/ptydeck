import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorkspacePresetRuntimeController,
  formatWorkspacePresetDetail,
  normalizeWorkspacePresetRecord,
  resolveWorkspacePresetToken,
  resolveWorkspaceGroupToken
} from "../src/public/workspace-preset-runtime-controller.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(type) {
    const list = this.listeners.get(type) || [];
    for (const handler of list) {
      handler({ target: this, type });
    }
  }

  click() {
    this.dispatchEvent("click");
  }
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

test("workspace preset runtime controller manages preset lifecycle through backend-backed hooks", async () => {
  const calls = [];
  let activeDeckId = "ops";
  const presetSelectEl = new FakeElement("select");
  const groupSelectEl = new FakeElement("select");
  const statusEl = new FakeElement("p");
  const summaryEl = new FakeElement("p");
  const detailEl = new FakeElement("pre");
  const groupSummaryEl = new FakeElement("p");
  const groupPersistenceEl = new FakeElement("p");
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async listWorkspacePresets() {
        calls.push(["list"]);
        return [
          {
            id: "ops",
            name: "Ops Workspace",
            workspace: {
              activeDeckId: "ops",
              layoutProfileId: "focus",
              controlPaneVisible: true,
              controlPanePosition: "bottom",
              controlPaneSize: 240,
              deckGroups: {},
              deckSplitLayouts: {
                ops: {
                  root: {
                    type: "pane",
                    paneId: "main"
                  },
                  paneSessions: {
                    main: ["s1"]
                  }
                }
              }
            }
          }
        ];
      },
      async createWorkspacePreset(payload) {
        calls.push(["create", payload]);
        return {
          id: payload.name === "Ops Copy" ? "ops-copy" : "ops-2",
          name: payload.name,
          createdAt: 1,
          updatedAt: 2,
          workspace: payload.workspace
        };
      },
      async updateWorkspacePreset(presetId, payload) {
        calls.push(["update", presetId, payload]);
        return {
          id: presetId,
          name: payload.name || "Ops Workspace",
          createdAt: 1,
          updatedAt: 3,
          workspace:
            payload.workspace || {
              activeDeckId: "ops",
              layoutProfileId: "focus",
              controlPaneVisible: true,
              controlPanePosition: "bottom",
              controlPaneSize: 240,
              deckGroups: {},
              deckSplitLayouts: {
                ops: {
                  root: {
                    type: "pane",
                    paneId: "main"
                  },
                  paneSessions: {
                    main: ["s1"]
                  }
                }
              }
            }
        };
      },
      async deleteWorkspacePreset(presetId) {
        calls.push(["delete", presetId]);
      }
    },
    presetSelectEl,
    presetSaveBtn: new FakeElement("button"),
    presetApplyBtn: new FakeElement("button"),
    presetDuplicateBtn: new FakeElement("button"),
    presetRenameBtn: new FakeElement("button"),
    presetDeleteBtn: new FakeElement("button"),
    groupSelectEl,
    groupSaveBtn: new FakeElement("button"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    statusEl,
    summaryEl,
    detailEl,
    groupSummaryEl,
    groupPersistenceEl,
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }, { id: "s2", deckId: "ops" }],
    getActiveDeckId: () => activeDeckId,
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "focus",
    listLayoutProfiles: () => [{ id: "focus" }],
    applyLayoutProfileById: async (profileId) => {
      calls.push(["apply-layout", profileId]);
      return "";
    },
    setActiveDeck: (deckId) => {
      calls.push(["set-active-deck", deckId]);
      activeDeckId = deckId;
      return true;
    },
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    requestRender: () => calls.push(["render"])
  });

  await controller.loadPresets();
  assert.equal(controller.listPresets().length, 1);
  assert.equal(presetSelectEl.children.length, 1);
  assert.match(summaryEl.textContent, /returns you to deck \[ops\]/);
  assert.match(detailEl.textContent, /When applied, this preset opens deck \[ops\]\./);
  assert.match(groupPersistenceEl.textContent, /saved into preset/i);

  controller.replaceWorkspaceState({
    activeDeckId: "ops",
    layoutProfileId: "focus",
    controlPaneVisible: false,
    controlPanePosition: "left",
    controlPaneSize: 320,
    deckGroups: {},
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
          left: ["s1"],
          right: ["s2"]
        }
      }
    }
  });

  const saveFeedback = await controller.createPresetFromCurrentWorkspace("Ops Snapshot");
  assert.equal(saveFeedback, "Saved workspace preset [ops-2] Ops Snapshot.");
  const createCall = calls.find((entry) => entry[0] === "create");
  assert.ok(createCall);
  assert.equal(createCall[1].workspace.activeDeckId, "ops");
  assert.equal(createCall[1].workspace.layoutProfileId, "focus");
  assert.equal(createCall[1].workspace.controlPaneVisible, false);
  assert.equal(createCall[1].workspace.controlPanePosition, "left");
  assert.equal(createCall[1].workspace.controlPaneSize, 320);
  assert.deepEqual(createCall[1].workspace.deckSplitLayouts, {
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
        left: ["s1"],
        right: ["s2"]
      }
    }
  });

  const applyFeedback = await controller.applyPresetById("ops");
  assert.equal(applyFeedback, "Applied workspace preset [ops] Ops Workspace.");
  assert.ok(calls.some((entry) => entry[0] === "apply-layout" && entry[1] === "focus"));
  assert.ok(calls.some((entry) => entry[0] === "set-active-deck" && entry[1] === "ops"));

  const renameFeedback = await controller.renamePresetById("ops", "Ops Renamed");
  assert.equal(renameFeedback, "Renamed workspace preset [ops] to Ops Renamed.");

  const duplicateFeedback = await controller.duplicatePresetById("ops", "Ops Copy");
  assert.equal(duplicateFeedback, "Duplicated workspace preset [ops] Ops Renamed as [ops-copy] Ops Copy.");

  const deleteFeedback = await controller.deletePresetById("ops");
  assert.equal(deleteFeedback, "Deleted workspace preset [ops] Ops Renamed.");
  assert.equal(controller.getPreset("ops"), null);
  assert.match(statusEl.textContent, /preset/);
});

test("workspace preset runtime controller normalizes stale references and resolves active deck groups", () => {
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [
      { id: "s1", deckId: "default" },
      { id: "s2", deckId: "ops" },
      { id: "s3", deckId: "ops" }
    ],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "",
    listLayoutProfiles: () => [{ id: "focus" }]
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ghost",
    layoutProfileId: "missing",
    controlPaneVisible: false,
    controlPanePosition: "left",
    controlPaneSize: 80,
    deckGroups: {
      ghost: {
        activeGroupId: "ghost",
        groups: [{ id: "ghost", name: "Ghost", sessionIds: ["missing"] }]
      },
      ops: {
        activeGroupId: "ops-team",
        groups: [{ id: "ops-team", name: "Ops Team", sessionIds: ["s2", "missing"] }]
      }
    },
    deckSplitLayouts: {
      ghost: {
        root: {
          type: "pane",
          paneId: "main"
        },
        paneSessions: {
          main: ["missing"]
        }
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
          left: ["s2", "missing", "s3"],
          right: ["s3"]
        }
      }
    }
  });

  const normalized = controller.getWorkspaceState();
  assert.equal(normalized.activeDeckId, "default");
  assert.equal(normalized.layoutProfileId, "");
  assert.equal(normalized.controlPaneVisible, false);
  assert.equal(normalized.controlPanePosition, "left");
  assert.equal(normalized.controlPaneSize, 185);
  assert.equal(normalized.deckGroups.ghost, undefined);
  assert.deepEqual(normalized.deckGroups.ops.groups[0].sessionIds, ["s2"]);
  assert.equal(normalized.deckSplitLayouts.ghost, undefined);
  assert.deepEqual(normalized.deckSplitLayouts.ops.root, {
    type: "row",
    weights: [0.5, 0.5],
    children: [
      { type: "pane", paneId: "left" },
      { type: "pane", paneId: "right" }
    ]
  });
  assert.deepEqual(normalized.deckSplitLayouts.ops.paneSessions, {
    left: ["s2", "s3"],
    right: []
  });

  const resolved = controller.resolveDeckSessions("ops", [
    { id: "s2", deckId: "ops" },
    { id: "s3", deckId: "ops" }
  ]);
  assert.deepEqual(
    resolved.map((session) => session.id),
    ["s2"]
  );
});

test("workspace preset runtime controller normalizes replacement state before pushing split layouts into runtime hooks", () => {
  const appliedLayouts = [];
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [
      { id: "s1", deckId: "ops" },
      { id: "s2", deckId: "ops" }
    ],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "",
    listLayoutProfiles: () => [{ id: "focus" }],
    setDeckSplitLayouts: (layouts) => appliedLayouts.push(layouts)
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ghost",
    layoutProfileId: "missing",
    controlPaneVisible: true,
    controlPanePosition: "left",
    controlPaneSize: 80,
    deckGroups: {},
    deckSplitLayouts: {
      ghost: {
        root: {
          type: "pane",
          paneId: "main"
        },
        paneSessions: {
          main: ["missing"]
        }
      },
      ops: {
        root: {
          type: "row",
          weights: [0.7, 0.3],
          children: [
            { type: "pane", paneId: "left" },
            { type: "pane", paneId: "right" }
          ]
        },
        paneSessions: {
          left: ["s1", "missing", "s2"],
          right: ["s2"]
        }
      }
    }
  });

  assert.deepEqual(appliedLayouts, [
    {
      ops: {
        root: {
          type: "row",
          weights: [0.7, 0.3],
          children: [
            { type: "pane", paneId: "left" },
            { type: "pane", paneId: "right" }
          ]
        },
        paneSessions: {
          left: ["s1", "s2"],
          right: []
        }
      }
    }
  ]);
  assert.deepEqual(controller.getWorkspaceState().deckSplitLayouts, appliedLayouts[0]);
});

test("workspace preset runtime controller exposes explicit deck-group lifecycle with persisted-vs-local feedback", async () => {
  const feedback = [];
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async updateWorkspacePreset(presetId, payload) {
        return {
          id: presetId,
          name: "Ops Workspace",
          updatedAt: 2,
          createdAt: 1,
          workspace: payload.workspace
        };
      }
    },
    presetSelectEl: new FakeElement("select"),
    presetSaveBtn: new FakeElement("button"),
    presetApplyBtn: new FakeElement("button"),
    presetDuplicateBtn: new FakeElement("button"),
    presetRenameBtn: new FakeElement("button"),
    presetDeleteBtn: new FakeElement("button"),
    groupSelectEl: new FakeElement("select"),
    groupSaveBtn: new FakeElement("button"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }, { id: "s2", deckId: "ops" }],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    setCommandFeedback: (message) => feedback.push(message)
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ops",
    layoutProfileId: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185,
    deckGroups: {},
    deckSplitLayouts: {}
  });

  const localSave = await controller.saveGroupByName("Build");
  assert.equal(
    localSave,
    "Saved workspace group [build] Build for deck [ops]. It is local-only until you save or select a workspace preset."
  );
  assert.equal(controller.resolveGroup("build", "ops").group?.id, "build");

  controller.replacePresets([
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: controller.getWorkspaceState()
    }
  ]);

  const persistedApply = await controller.applyGroupById("build", "ops");
  assert.equal(
    persistedApply,
    "Active workspace group for deck [ops] is now [build] and persisted into preset [ops] Ops Workspace."
  );

  const renamed = await controller.renameGroupById("build", "Build Main", "ops");
  assert.equal(
    renamed,
    "Renamed workspace group [build] to Build Main and persisted it into preset [ops] Ops Workspace."
  );

  const cleared = await controller.clearGroupForDeck("ops");
  assert.equal(
    cleared,
    "Cleared the active workspace group for deck [ops] and persisted it into preset [ops] Ops Workspace."
  );
});

test("workspace preset helpers normalize records and resolve ambiguous group selectors", () => {
  const normalized = normalizeWorkspacePresetRecord({
    id: "ops",
    name: "Ops Workspace",
    workspace: {
      activeDeckId: "ops",
      layoutProfileId: "focus",
      controlPaneVisible: true,
      controlPanePosition: "sideways",
      controlPaneSize: 40,
      deckGroups: {
        ops: {
          activeGroupId: "team",
          groups: [
            { id: "team", name: "Team", sessionIds: ["s1", "s1", "s2"] }
          ]
        }
      }
    }
  });

  assert.equal(normalized.workspace.controlPanePosition, "bottom");
  assert.equal(normalized.workspace.controlPaneSize, 185);
  assert.deepEqual(normalized.workspace.deckGroups.ops.groups[0].sessionIds, ["s1", "s2"]);
  assert.match(formatWorkspacePresetDetail(normalized), /When applied, this preset opens deck \[ops\]\./);
  assert.match(resolveWorkspaceGroupToken([
    { id: "build-a", name: "Build Alpha" },
    { id: "build-b", name: "Build Beta" }
  ], "build").error, /Ambiguous workspace group/);
});

test("workspace preset helpers report missing, unknown, and ambiguous preset selectors", () => {
  const presets = [
    {
      id: "ops-east",
      name: "Ops East",
      workspace: {
        activeDeckId: "ops"
      }
    },
    {
      id: "ops-west",
      name: "Ops West",
      workspace: {
        activeDeckId: "ops"
      }
    }
  ];

  assert.equal(resolveWorkspacePresetToken(presets, "").error, "Workspace preset target is required.");
  assert.equal(resolveWorkspacePresetToken(presets, "missing").error, "Unknown workspace preset: missing");
  assert.equal(
    resolveWorkspacePresetToken(presets, "ops").error,
    "Ambiguous workspace preset 'ops': ops-east, ops-west"
  );
});

test("workspace preset helpers handle malformed records and group selector failures defensively", () => {
  assert.equal(normalizeWorkspacePresetRecord({ id: "", name: "Ops", workspace: {} }), null);
  assert.equal(resolveWorkspaceGroupToken([], "").error, "Workspace group target is required.");
  assert.equal(resolveWorkspaceGroupToken([], "missing").error, "Unknown workspace group: missing");
  assert.equal(
    formatWorkspacePresetDetail({
      id: "ops",
      name: "Ops Workspace",
      workspace: null
    }),
    "[ops] Ops Workspace\nWhen applied, this preset opens deck [default].\nIt keeps whichever layout profile is already active.\nThe input pane becomes visible on bottom at 185px.\nIt does not restore any saved deck groups.\nIt does not restore any split-pane layout."
  );
});

test("workspace preset runtime controller guards local-only group save and silent no-op rename paths", async () => {
  const feedback = [];
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    setCommandFeedback: (message) => feedback.push(message)
  });

  await assert.rejects(() => controller.saveGroupByName("Filtered", "ops"), /No visible deck sessions/);
  assert.equal(await controller.renameGroupById("", "Ignored", "ops"), "");
  assert.equal(await controller.deleteGroupById("", "ops"), "");
  assert.equal(feedback.length, 0);
});

test("workspace preset runtime controller supports prompt-free preset and group flows with inline confirmations", async () => {
  const calls = [];
  const presetSelectEl = new FakeElement("select");
  const presetNameInputEl = new FakeElement("input");
  const presetDeleteConfirmEl = new FakeElement("div");
  presetDeleteConfirmEl.hidden = true;
  const presetDeleteConfirmMessageEl = new FakeElement("p");
  const groupSelectEl = new FakeElement("select");
  const groupNameInputEl = new FakeElement("input");
  const groupDeleteConfirmEl = new FakeElement("div");
  groupDeleteConfirmEl.hidden = true;
  const groupDeleteConfirmMessageEl = new FakeElement("p");
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async createWorkspacePreset(payload) {
        calls.push(["create", payload]);
        return {
          id: payload.name === "Ops Copy" ? "ops-copy" : "ops-new",
          name: payload.name,
          createdAt: 2,
          updatedAt: 2,
          workspace: payload.workspace
        };
      },
      async updateWorkspacePreset(presetId, payload) {
        calls.push(["update", presetId, payload]);
        return {
          id: presetId,
          name: payload.name || "Ops Workspace",
          createdAt: 1,
          updatedAt: 3,
          workspace: payload.workspace || {
            activeDeckId: "ops",
            layoutProfileId: "",
            controlPaneVisible: true,
            controlPanePosition: "bottom",
            controlPaneSize: 185,
            deckGroups: {},
            deckSplitLayouts: {}
          }
        };
      },
      async deleteWorkspacePreset(presetId) {
        calls.push(["delete", presetId]);
      }
    },
    presetSelectEl,
    presetNameInputEl,
    presetSaveBtn: new FakeElement("button"),
    presetApplyBtn: new FakeElement("button"),
    presetDuplicateBtn: new FakeElement("button"),
    presetRenameBtn: new FakeElement("button"),
    presetDeleteBtn: new FakeElement("button"),
    presetDeleteConfirmEl,
    presetDeleteConfirmMessageEl,
    presetDeleteConfirmBtn: new FakeElement("button"),
    presetDeleteCancelBtn: new FakeElement("button"),
    groupSelectEl,
    groupNameInputEl,
    groupSaveBtn: new FakeElement("button"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupDeleteConfirmEl,
    groupDeleteConfirmMessageEl,
    groupDeleteConfirmBtn: new FakeElement("button"),
    groupDeleteCancelBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }, { id: "s2", deckId: "ops" }],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    setCommandFeedback: (message) => calls.push(["feedback", message])
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ops",
    layoutProfileId: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185,
    deckGroups: {},
    deckSplitLayouts: {}
  });
  controller.replacePresets([
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: controller.getWorkspaceState()
    }
  ]);

  presetNameInputEl.value = "Ops Copy";
  const duplicateFeedback = await controller.duplicateSelectedPresetFlow();
  assert.equal(
    duplicateFeedback,
    "Duplicated workspace preset [ops] Ops Workspace as [ops-copy] Ops Copy."
  );

  presetSelectEl.value = "ops";
  controller.bindUiEvents();
  presetSelectEl.dispatchEvent("change");
  presetNameInputEl.value = "Ops Primary";
  const renameFeedback = await controller.renameSelectedPresetFlow();
  assert.equal(renameFeedback, "Renamed workspace preset [ops] to Ops Primary.");

  const presetDeletePending = await controller.deleteSelectedPresetFlow();
  assert.equal(presetDeletePending, "Confirm deletion for workspace preset [ops] Ops Primary.");
  assert.equal(presetDeleteConfirmEl.hidden, false);
  assert.match(presetDeleteConfirmMessageEl.textContent, /Ops Primary/);
  assert.equal(calls.some((entry) => entry[0] === "delete"), false);

  const presetDeleteCancelled = await controller.cancelDeleteSelectedPresetFlow();
  assert.equal(presetDeleteCancelled, "Cancelled deletion of the workspace preset.");
  assert.equal(presetDeleteConfirmEl.hidden, true);

  await controller.deleteSelectedPresetFlow();
  const presetDeleteFeedback = await controller.deleteSelectedPresetFlow();
  assert.equal(presetDeleteFeedback, "Deleted workspace preset [ops] Ops Primary.");
  controller.replacePresets([]);

  groupNameInputEl.value = "Ops Team";
  const groupSaveFeedback = await controller.saveGroupFlow();
  assert.equal(
    groupSaveFeedback,
    "Saved workspace group [ops-team] Ops Team for deck [ops]. It is local-only until you save or select a workspace preset."
  );

  groupNameInputEl.value = "Ops Core";
  const groupRenameFeedback = await controller.renameSelectedGroupFlow();
  assert.equal(
    groupRenameFeedback,
    "Renamed workspace group [ops-team] to Ops Core. The change is local-only until you save or select a workspace preset."
  );

  const groupDeletePending = await controller.deleteSelectedGroupFlow();
  assert.equal(groupDeletePending, "Confirm deletion for workspace group [ops-team] Ops Core on deck [ops].");
  assert.equal(groupDeleteConfirmEl.hidden, false);
  assert.match(groupDeleteConfirmMessageEl.textContent, /Ops Core/);

  const groupDeleteCancelled = await controller.cancelDeleteSelectedGroupFlow();
  assert.equal(groupDeleteCancelled, "Cancelled deletion of the workspace group.");
  assert.equal(groupDeleteConfirmEl.hidden, true);

  await controller.deleteSelectedGroupFlow();
  const groupDeleteFeedback = await controller.deleteSelectedGroupFlow();
  assert.equal(
    groupDeleteFeedback,
    "Deleted workspace group [ops-team] Ops Core. The change is local-only until you save or select a workspace preset."
  );
});

test("workspace preset runtime controller rejects malformed preset API payloads deterministically", async () => {
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async createWorkspacePreset() {
        return {
          id: "",
          name: "",
          workspace: null
        };
      },
      async updateWorkspacePreset(presetId) {
        return {
          id: presetId,
          name: "",
          workspace: null
        };
      }
    },
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ops",
    layoutProfileId: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185,
    deckGroups: {},
    deckSplitLayouts: {}
  });

  await assert.rejects(
    () => controller.createPresetFromCurrentWorkspace("Broken Preset"),
    /Workspace preset API returned an invalid preset record for workspace preset save/
  );

  controller.replacePresets([
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: controller.getWorkspaceState()
    }
  ]);
  controller.createGroupFromVisibleDeckSessions("Build", "ops");

  await assert.rejects(
    () => controller.applyGroupById("build", "ops"),
    /Workspace preset API returned an invalid preset record for workspace persistence/
  );
});

test("workspace preset runtime controller clears stale preset state when reload fails", async () => {
  const errors = [];
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async listWorkspacePresets() {
        throw new Error("reload failed");
      }
    },
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    setError: (message) => errors.push(message),
    getErrorMessage: (_, fallback) => fallback
  });

  controller.replacePresets([
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: {
        activeDeckId: "ops",
        layoutProfileId: "",
        controlPaneVisible: true,
        controlPanePosition: "bottom",
        controlPaneSize: 185,
        deckGroups: {},
        deckSplitLayouts: {}
      }
    }
  ]);

  const loaded = await controller.loadPresets();
  assert.deepEqual(loaded, []);
  assert.equal(controller.listPresets().length, 0);
  assert.equal(controller.getSelectedPreset(), null);
  assert.equal(errors[0], "Failed to load workspace presets.");
});

test("workspace preset helpers resolve exact names and prefixes, and loadPresets fails closed without an API hook", async () => {
  const presets = [
    {
      id: "ops-east",
      name: "Ops East",
      workspace: {
        activeDeckId: "ops"
      }
    },
    {
      id: "ops-west",
      name: "Ops West",
      workspace: {
        activeDeckId: "ops"
      }
    }
  ];

  assert.equal(resolveWorkspacePresetToken(presets, "Ops East").preset?.id, "ops-east");
  assert.equal(resolveWorkspacePresetToken(presets, "ops-ea").preset?.id, "ops-east");
  assert.equal(
    resolveWorkspaceGroupToken(
      [
        { id: "build-core", name: "Build Core" },
        { id: "deploy", name: "Deploy" }
      ],
      "Build Core"
    ).group?.id,
    "build-core"
  );
  assert.equal(
    resolveWorkspaceGroupToken(
      [
        { id: "build-core", name: "Build Core" },
        { id: "deploy", name: "Deploy" }
      ],
      "bui"
    ).group?.id,
    "build-core"
  );

  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }],
    getSessions: () => [],
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  const loaded = await controller.loadPresets();
  assert.deepEqual(loaded, []);
  assert.deepEqual(controller.listPresets(), []);
});
