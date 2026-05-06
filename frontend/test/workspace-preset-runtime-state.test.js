import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspacePresetRuntimeState } from "../src/public/workspace-preset-runtime-state.js";

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
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createWorkspacePresetState(options = {}) {
  return createWorkspacePresetRuntimeState({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    presetNameInputEl: new FakeElement("input"),
    presetDeleteBtn: new FakeElement("button"),
    presetDeleteConfirmEl: new FakeElement("div"),
    presetDeleteConfirmMessageEl: new FakeElement("p"),
    groupSelectEl: new FakeElement("select"),
    groupNameInputEl: new FakeElement("input"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    groupDeleteConfirmEl: new FakeElement("div"),
    groupDeleteConfirmMessageEl: new FakeElement("p"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [],
    getActiveDeckId: () => "default",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session?.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "",
    listLayoutProfiles: () => [],
    requestRender: () => {},
    ...options
  });
}

test("workspace preset runtime state normalizes stale workspace references and syncs preset and group selection", () => {
  const refs = {
    presetSelectEl: new FakeElement("select"),
    presetNameInputEl: new FakeElement("input"),
    presetDeleteBtn: new FakeElement("button"),
    presetDeleteConfirmEl: new FakeElement("div"),
    presetDeleteConfirmMessageEl: new FakeElement("p"),
    groupSelectEl: new FakeElement("select"),
    groupNameInputEl: new FakeElement("input"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    groupDeleteConfirmEl: new FakeElement("div"),
    groupDeleteConfirmMessageEl: new FakeElement("p"),
    statusEl: new FakeElement("p"),
    summaryEl: new FakeElement("p"),
    detailEl: new FakeElement("pre"),
    groupSummaryEl: new FakeElement("p"),
    groupPersistenceEl: new FakeElement("p")
  };
  const state = createWorkspacePresetRuntimeState({
    documentRef: createDocumentRef(),
    ...refs,
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
    listLayoutProfiles: () => [{ id: "focus" }]
  });

  state.replaceWorkspaceState({
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
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["missing"] }
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
  state.replacePresets([
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: state.getWorkspaceState()
    }
  ]);
  state.setSelectedPresetId("missing");
  state.setPendingDeletePresetId("ghost");
  state.setSelectedGroupIdForDeck("ops", "ghost");
  state.setPendingDeleteGroupKey("ops:ghost");
  state.render();

  const normalized = state.getWorkspaceState();
  assert.equal(normalized.activeDeckId, "default");
  assert.equal(normalized.layoutProfileId, "");
  assert.equal(normalized.controlPaneVisible, false);
  assert.equal(normalized.controlPanePosition, "left");
  assert.equal(normalized.controlPaneSize, 185);
  assert.equal(normalized.deckGroups.ghost, undefined);
  assert.deepEqual(normalized.deckGroups.ops.groups[0].sessionIds, ["s2"]);
  assert.equal(normalized.deckSplitLayouts.ghost, undefined);
  assert.deepEqual(normalized.deckSplitLayouts.ops.paneSessions, {
    left: ["s2", "s3"],
    right: []
  });
  assert.equal(state.getSelectedPresetId(), "ops");
  assert.equal(state.getPendingDeletePresetId(), "");
  assert.equal(state.getSelectedGroupIdForDeck("ops"), "ops-team");
  assert.equal(state.getPendingDeleteGroupKey(), "");
  assert.equal(refs.presetSelectEl.value, "ops");
  assert.equal(refs.groupSelectEl.value, "ops-team");
  assert.match(refs.summaryEl.textContent, /returns you to deck \[default\]/);
  assert.match(refs.detailEl.textContent, /It does not restore any split-pane layout\.|It restores saved split panes/);
  assert.match(refs.groupSummaryEl.textContent, /active group \[ops-team\]/);
  assert.match(refs.groupPersistenceEl.textContent, /saved into preset \[ops\]/i);
  assert.equal(refs.groupNameInputEl.value, "Ops Team");
});

test("workspace preset runtime state captures filtered visible sessions and current workspace deterministically", () => {
  const splitLayouts = {
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
        left: ["s2", "s3"],
        right: ["s4"]
      }
    }
  };
  const state = createWorkspacePresetState({
    getSessions: () => [
      { id: "s1", deckId: "default" },
      { id: "s2", deckId: "ops" },
      { id: "s3", deckId: "ops" },
      { id: "s4", deckId: "ops" }
    ],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "s3",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    resolveFilterSelectors: (_filterText, sessions) => ({
      sessions: sessions.filter((session) => session.id === "s3")
    }),
    getSelectedLayoutProfileId: () => "focus",
    listLayoutProfiles: () => [{ id: "focus" }],
    getControlPaneState: () => ({
      controlPaneVisible: false,
      controlPanePosition: "right",
      controlPaneSize: 320
    }),
    getDeckSplitLayouts: () => splitLayouts
  });

  state.replaceWorkspaceState({
    activeDeckId: "ops",
    layoutProfileId: "focus",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185,
    deckGroups: {
      ops: {
        activeGroupId: "build",
        groups: [{ id: "build", name: "Build", sessionIds: ["s2", "s3"] }]
      }
    },
    deckSplitLayouts: splitLayouts
  });

  assert.deepEqual(
    state.captureCurrentVisibleDeckSessions("ops").map((session) => session.id),
    ["s3"]
  );
  assert.deepEqual(state.resolveDeckSessions("ops", [{ id: "s2" }, { id: "s3" }, { id: "s4" }]).map((session) => session.id), [
    "s2",
    "s3"
  ]);
  assert.deepEqual(state.captureCurrentWorkspace(), {
    activeDeckId: "ops",
    layoutProfileId: "focus",
    controlPaneVisible: false,
    controlPanePosition: "right",
    controlPaneSize: 320,
    deckGroups: {
      ops: {
        activeGroupId: "build",
        groups: [{ id: "build", name: "Build", sessionIds: ["s2", "s3"] }]
      }
    },
    deckSplitLayouts: splitLayouts
  });
});

test("workspace preset runtime state fails closed when preset reload fails and when the preset API hook is absent", async () => {
  const errors = [];
  const failingState = createWorkspacePresetState({
    api: {
      async listWorkspacePresets() {
        throw new Error("reload failed");
      }
    },
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }],
    getActiveDeckId: () => "ops",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    setError: (message) => errors.push(message),
    getErrorMessage: (_, fallback) => fallback
  });

  failingState.replacePresets([
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
  failingState.setSelectedPresetId("ops");
  assert.deepEqual(await failingState.loadPresets(), []);
  assert.deepEqual(failingState.listPresets(), []);
  assert.equal(failingState.getSelectedPreset(), null);
  assert.equal(errors[0], "Failed to load workspace presets.");

  const apiLessState = createWorkspacePresetState();
  assert.deepEqual(await apiLessState.loadPresets(), []);
  assert.deepEqual(apiLessState.listPresets(), []);
});
