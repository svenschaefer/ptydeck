import test from "node:test";
import assert from "node:assert/strict";

import {
  captureCurrentVisibleDeckSessions,
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  formatWorkspacePresetDetail,
  normalizeWorkspacePresetRecord,
  resolveWorkspaceDeckSessions,
  serializeSplitLayoutRoot
} from "../src/public/layout-workspace-runtime-state.js";

test("layout workspace runtime state captures layout profile snapshots with geometry, control pane, and split layout clones", () => {
  const snapshot = captureLayoutProfileSnapshot({
    selectedProfile: {
      layout: {
        controlPaneVisible: false,
        controlPanePosition: "left",
        controlPaneSize: 240,
        deckSplitLayouts: {
          ops: {
            root: { type: "pane", paneId: "main" },
            paneSessions: { main: ["s-1"] }
          }
        }
      }
    },
    getDecks: () => [{ id: "ops" }, { id: "empty" }],
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 132, rows: 36 } : { cols: "", rows: "" }),
    getActiveDeckId: () => "ops",
    getSidebarVisible: () => false,
    getSessionFilterText: () => "ssh",
    getControlPaneState: null,
    getDeckSplitLayouts: null
  });

  assert.deepEqual(snapshot, {
    activeDeckId: "ops",
    sidebarVisible: false,
    sessionFilterText: "ssh",
    controlPaneVisible: false,
    controlPanePosition: "left",
    controlPaneSize: 240,
    deckTerminalSettings: {
      ops: { cols: 132, rows: 36 }
    },
    deckSplitLayouts: {
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-1"] }
      }
    }
  });
});

test("layout workspace runtime state resolves grouped deck sessions and current workspace snapshots deterministically", () => {
  const groupedSessions = resolveWorkspaceDeckSessions(
    "ops",
    [{ id: "s-1" }, { id: "s-2" }, { id: "s-3" }],
    {
      ops: {
        activeGroupId: "focus",
        groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2", "s-3", "missing"] }]
      }
    }
  );

  const workspace = captureCurrentWorkspace({
    workspaceState: {
      activeDeckId: "ops",
      layoutProfileId: "wide",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 185,
      deckGroups: {
        ops: {
          activeGroupId: "focus",
          groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2", "s-3"] }]
        }
      },
      deckSplitLayouts: {}
    },
    getActiveDeckId: () => "ops",
    getSelectedLayoutProfileId: () => "wide",
    getControlPaneState: () => ({ controlPaneVisible: false, controlPanePosition: "right", controlPaneSize: 260 }),
    getDeckSplitLayouts: () => ({
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-2"] }
      }
    })
  });

  assert.deepEqual(groupedSessions.map((session) => session.id), ["s-2", "s-3"]);
  assert.deepEqual(workspace, {
    activeDeckId: "ops",
    layoutProfileId: "wide",
    controlPaneVisible: false,
    controlPanePosition: "right",
    controlPaneSize: 260,
    deckGroups: {
      ops: {
        activeGroupId: "focus",
        groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2", "s-3"] }]
      }
    },
    deckSplitLayouts: {
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-2"] }
      }
    }
  });
});

test("layout workspace runtime state filters visible deck sessions and preserves workspace preset detail contracts", () => {
  const visibleSessions = captureCurrentVisibleDeckSessions({
    deckId: "ops",
    getActiveDeckId: () => "ops",
    getSessions: () => [
      { id: "s-1", deckId: "ops" },
      { id: "s-2", deckId: "ops" },
      { id: "s-3", deckId: "infra" }
    ],
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    resolveSessionDeckId: (session) => session.deckId,
    deckGroups: {
      ops: {
        activeGroupId: "focus",
        groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2", "s-1"] }]
      }
    },
    getSessionFilterText: () => "filtered",
    resolveFilterSelectors: (_text, sessions) => ({ sessions: sessions.filter((session) => session.id === "s-2") })
  });

  const normalizedPreset = normalizeWorkspacePresetRecord({
    id: "ops",
    name: "Ops Workspace",
    workspace: {
      activeDeckId: "default",
      layoutProfileId: "",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 185,
      deckGroups: {},
      deckSplitLayouts: {}
    }
  });

  assert.deepEqual(visibleSessions.map((session) => session.id), ["s-2"]);
  assert.equal(
    formatWorkspacePresetDetail(normalizedPreset),
    "[ops] Ops Workspace\nWhen applied, this preset opens deck [default].\nIt keeps whichever layout profile is already active.\nThe input pane becomes visible on bottom at 185px.\nIt does not restore any saved deck groups.\nIt does not restore any split-pane layout."
  );
  assert.equal(serializeSplitLayoutRoot({ type: "pane", paneId: "main" }), JSON.stringify({ type: "pane", paneId: "main" }));
});

test("layout workspace runtime state falls back to ordered deck sessions when the active group reference is stale", () => {
  const orderedSessions = [{ id: "s-1" }, { id: "s-2" }];

  assert.deepEqual(
    resolveWorkspaceDeckSessions("ops", orderedSessions, {
      ops: {
        activeGroupId: "missing",
        groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2"] }]
      }
    }),
    orderedSessions
  );
});
