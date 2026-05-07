import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneDeckSplitLayoutEntry,
  cloneDeckSplitLayoutMap,
  cloneSplitLayoutNode,
  collectSplitLayoutPaneIds
} from "../src/public/split-layout-state.js";

test("split-layout state normalizes weights, pane ids, and duplicate session assignments", () => {
  const cloned = cloneDeckSplitLayoutEntry(
    {
      root: {
        type: "column",
        children: [
          { type: "pane", paneId: " Main " },
          { type: "pane", paneId: "side" }
        ],
        weights: [3, 1]
      },
      paneSessions: {
        main: ["s-1", "s-1", "s-2"],
        side: ["s-3"],
        ghost: ["s-4"]
      }
    },
    { fallbackToDefault: true }
  );

  assert.deepEqual(cloned, {
    root: {
      type: "column",
      children: [{ type: "pane", paneId: "main" }, { type: "pane", paneId: "side" }],
      weights: [0.75, 0.25]
    },
    paneSessions: {
      main: ["s-1", "s-2"],
      side: ["s-3"]
    }
  });
});

test("split-layout state falls back to a default main pane only when requested", () => {
  assert.equal(cloneDeckSplitLayoutEntry({ root: null }, { fallbackToDefault: false }), null);
  assert.deepEqual(cloneDeckSplitLayoutEntry({ root: null }, { fallbackToDefault: true }), {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: [] }
  });
});

test("split-layout state clones deck maps deterministically and filters malformed entries", () => {
  const cloned = cloneDeckSplitLayoutMap(
    {
      ops: {
        root: {
          type: "row",
          children: [{ type: "pane", paneId: "left" }, { type: "pane", paneId: "right" }],
          weights: [1, 1]
        },
        paneSessions: {
          left: ["s-1"],
          right: ["s-2"]
        }
      },
      broken: {
        root: {
          type: "row",
          children: [{ type: "pane", paneId: "" }]
        }
      }
    },
    { fallbackToDefault: false }
  );

  assert.deepEqual(Object.keys(cloned), ["ops"]);
  assert.deepEqual(cloned.ops.root.weights, [0.5, 0.5]);
});

test("split-layout state exposes cloned pane ids without mutating the source tree", () => {
  const node = {
    type: "row",
    children: [
      { type: "pane", paneId: "left" },
      {
        type: "column",
        children: [{ type: "pane", paneId: "right-top" }, { type: "pane", paneId: "right-bottom" }],
        weights: [1, 1]
      }
    ],
    weights: [1, 3]
  };

  const cloned = cloneSplitLayoutNode(node);
  assert.deepEqual(collectSplitLayoutPaneIds(cloned), ["left", "right-top", "right-bottom"]);
  assert.deepEqual(node.weights, [1, 3]);
});
