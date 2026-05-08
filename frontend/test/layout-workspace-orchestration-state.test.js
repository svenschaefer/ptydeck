import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLayoutProfileSnapshot,
  captureCurrentVisibleDeckSessions,
  resolveWorkspaceDeckSessions,
  serializeSplitLayoutRoot
} from "../src/public/layout-workspace-orchestration-state.js";

test("layout workspace orchestration state applies layout snapshots across deck geometry and split-layout merge hooks", async () => {
  const calls = [];
  const feedback = await applyLayoutProfileSnapshot({
    layout: {
      activeDeckId: "ops",
      sidebarVisible: false,
      sessionFilterText: "ssh",
      controlPaneVisible: false,
      controlPanePosition: "left",
      controlPaneSize: 240,
      deckTerminalSettings: {
        ops: { cols: 132, rows: 36 },
        infra: { cols: 100, rows: 30 }
      },
      deckSplitLayouts: {
        ops: {
          root: { type: "pane", paneId: "main" },
          paneSessions: { main: ["s-1"] }
        }
      }
    },
    getDecks: () => [{ id: "ops" }, { id: "infra" }],
    getDeckTerminalGeometry: (deckId) => (deckId === "ops" ? { cols: 120, rows: 36 } : { cols: 100, rows: 30 }),
    updateDeckGeometry: async (deckId, nextGeometry, preferredActiveDeckId) => {
      calls.push(["geometry", deckId, nextGeometry, preferredActiveDeckId]);
    },
    setSidebarVisible: (value) => calls.push(["sidebar", value]),
    setSessionFilterText: (value) => calls.push(["filter", value]),
    setControlPaneState: (value) => calls.push(["control-pane", value]),
    mergeDeckSplitLayouts: (layouts, options) => calls.push(["merge", layouts, options]),
    setActiveDeck: (deckId) => calls.push(["active-deck", deckId]),
    requestRender: () => calls.push(["request-render"]),
    render: () => calls.push(["render"])
  });

  assert.equal(feedback, "Applied layout snapshot for deck [ops].");
  assert.deepEqual(calls, [
    ["geometry", "ops", { cols: 132, rows: 36 }, "ops"],
    ["sidebar", false],
    ["filter", "ssh"],
    ["control-pane", { controlPaneVisible: false, controlPanePosition: "left", controlPaneSize: 240 }],
    [
      "merge",
      {
        ops: {
          root: { type: "pane", paneId: "main" },
          paneSessions: { main: ["s-1"] }
        }
      },
      { scope: "all", targetDeckId: "ops" }
    ],
    ["active-deck", "ops"],
    ["request-render"],
    ["render"]
  ]);
});

test("layout workspace orchestration state falls back to current split-layout state when merge hooks are unavailable", async () => {
  let mergedLayouts = null;

  const feedback = await applyLayoutProfileSnapshot({
    layout: {
      activeDeckId: "ops",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 185,
      deckTerminalSettings: {},
      deckSplitLayouts: {
        ops: {
          root: { type: "pane", paneId: "next" },
          paneSessions: { next: ["s-2"] }
        }
      }
    },
    scope: "single",
    targetDeckId: "ops",
    getDecks: () => [{ id: "ops" }, { id: "infra" }],
    getDeckSplitLayouts: () => ({
      ops: {
        root: { type: "pane", paneId: "current" },
        paneSessions: { current: ["s-1"] }
      },
      infra: {
        root: { type: "pane", paneId: "infra" },
        paneSessions: { infra: ["s-3"] }
      }
    }),
    setDeckSplitLayouts: (value) => {
      mergedLayouts = value;
    }
  });

  assert.equal(feedback, "Applied layout snapshot for deck [ops].");
  assert.deepEqual(mergedLayouts, {
    ops: {
      root: { type: "pane", paneId: "next" },
      paneSessions: { next: ["s-2"] }
    },
    infra: {
      root: { type: "pane", paneId: "infra" },
      paneSessions: { infra: ["s-3"] }
    }
  });

  assert.equal(
    await applyLayoutProfileSnapshot({ layout: null }),
    "Applied layout snapshot for deck [default]."
  );
});

test("layout workspace orchestration state resolves grouped and filtered deck sessions deterministically", () => {
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

  assert.deepEqual(groupedSessions.map((session) => session.id), ["s-2", "s-3"]);
  assert.deepEqual(visibleSessions.map((session) => session.id), ["s-2"]);
  assert.equal(serializeSplitLayoutRoot({ type: "pane", paneId: "main" }), JSON.stringify({ type: "pane", paneId: "main" }));
});
