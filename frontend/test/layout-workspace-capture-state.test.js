import test from "node:test";
import assert from "node:assert/strict";

import {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  serializeSplitLayoutRoot
} from "../src/public/layout-workspace-capture-state.js";

test("layout workspace capture state clones workspace groups and normalizes control pane state deterministically", () => {
  assert.deepEqual(cloneWorkspaceDeckGroups(null), {
    activeGroupId: "",
    groups: []
  });
  assert.deepEqual(
    cloneWorkspaceDeckGroups({
      activeGroupId: "focus",
      groups: [
        { id: "focus", name: "Focus", sessionIds: ["s-1", "s-2", "s-1"] },
        { id: "focus", name: "Duplicate", sessionIds: ["s-3"] },
        { id: "ops", name: "Ops", sessionIds: ["s-3", "", "s-4"] }
      ]
    }),
    {
      activeGroupId: "focus",
      groups: [
        { id: "focus", name: "Focus", sessionIds: ["s-1", "s-2"] },
        { id: "ops", name: "Ops", sessionIds: ["s-3", "s-4"] }
      ]
    }
  );
  assert.deepEqual(normalizeControlPaneState({ controlPaneVisible: false, controlPanePosition: "left", controlPaneSize: "240" }), {
    controlPaneVisible: false,
    controlPanePosition: "left",
    controlPaneSize: 240
  });
  assert.deepEqual(normalizeControlPaneState({ controlPaneVisible: true, controlPanePosition: "bad", controlPaneSize: 20 }), {
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 185
  });
});

test("layout workspace capture state clones workspace snapshots and layout captures deterministically", () => {
  const workspace = cloneWorkspaceState({
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

  const currentWorkspace = captureCurrentWorkspace({
    workspaceState: workspace,
    getActiveDeckId: () => "ops",
    getSelectedLayoutProfileId: () => "wide",
    getControlPaneState: () => ({ controlPaneVisible: true, controlPanePosition: "top", controlPaneSize: 320 }),
    getDeckSplitLayouts: () => ({
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-3"] }
      }
    })
  });

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

  assert.deepEqual(currentWorkspace, {
    activeDeckId: "ops",
    layoutProfileId: "wide",
    controlPaneVisible: true,
    controlPanePosition: "top",
    controlPaneSize: 320,
    deckGroups: {
      ops: {
        activeGroupId: "focus",
        groups: [{ id: "focus", name: "Focus", sessionIds: ["s-2", "s-3"] }]
      }
    },
    deckSplitLayouts: {
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-3"] }
      }
    }
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
  assert.equal(serializeSplitLayoutRoot({ type: "pane", paneId: "main" }), JSON.stringify({ type: "pane", paneId: "main" }));
});
