import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSplitLayoutPaneId,
  computeSplitLayoutPairWeights,
  getSplitLayoutNodeByPath,
  normalizeLayoutControlPaneState,
  normalizeLayoutProfileRecord,
  removeSplitLayoutPaneFromNode,
  replaceSplitLayoutPaneWithSplit,
  resolveLayoutProfileToken
} from "../src/public/layout-runtime-state.js";

test("layout runtime state normalizes profile records and resolves selectors deterministically", () => {
  const profile = normalizeLayoutProfileRecord({
    id: " ops ",
    name: " Ops Layout ",
    createdAt: "bad",
    updatedAt: 7,
    layout: {
      activeDeckId: " dev ",
      controlPaneVisible: false,
      controlPanePosition: "left",
      controlPaneSize: "500",
      deckTerminalSettings: {
        dev: { cols: 120, rows: 40 },
        broken: { cols: "wide", rows: 20 }
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
            side: ["s-3"]
          }
        }
      }
    }
  });

  assert.deepEqual(profile, {
    id: "ops",
    name: "Ops Layout",
    createdAt: 0,
    updatedAt: 7,
    layout: {
      activeDeckId: "dev",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: false,
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

  const profiles = [
    profile,
    {
      id: "focus",
      name: "Focus Layout",
      createdAt: 1,
      updatedAt: 1,
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        ...normalizeLayoutControlPaneState({}),
        deckTerminalSettings: {},
        deckSplitLayouts: {}
      }
    }
  ];

  assert.equal(resolveLayoutProfileToken(profiles, "ops").profile?.id, "ops");
  assert.equal(resolveLayoutProfileToken(profiles, "Focus Layout").profile?.id, "focus");
  assert.match(resolveLayoutProfileToken(profiles, "missing").error, /Unknown layout profile/);
});

test("layout runtime state isolates split-layout tree mutations deterministically", () => {
  const root = {
    type: "column",
    children: [
      { type: "pane", paneId: "main" },
      {
        type: "row",
        children: [{ type: "pane", paneId: "side-a" }, { type: "pane", paneId: "side-b" }],
        weights: [1, 3]
      }
    ],
    weights: [2, 3]
  };

  assert.equal(getSplitLayoutNodeByPath(root, [1, 0])?.paneId, "side-a");
  assert.equal(buildSplitLayoutPaneId("main", "right", new Set(["main-right"])), "main-right-2");

  const replaced = replaceSplitLayoutPaneWithSplit(root, "side-a", "column", "side-a-lower");
  assert.equal(replaced.changed, true);
  assert.deepEqual(replaced.node.children[1].children[0], {
    type: "column",
    children: [
      { type: "pane", paneId: "side-a" },
      { type: "pane", paneId: "side-a-lower" }
    ],
    weights: [0.5, 0.5]
  });

  const removed = removeSplitLayoutPaneFromNode(replaced.node, "side-b");
  assert.deepEqual(removed.removedPaneIds, ["side-b"]);
  assert.equal(getSplitLayoutNodeByPath(removed.node, [1, 1])?.paneId, "side-a-lower");
  assert.deepEqual(computeSplitLayoutPairWeights([0.5, 0.3, 0.2], 0, 0.8), [0.64, 0.16, 0.2]);
  assert.deepEqual(computeSplitLayoutPairWeights([0.5, 0.3, 0.2], 0, 0.01), [0.08, 0.72, 0.2]);
});
