import test from "node:test";
import assert from "node:assert/strict";

import {
  assignSessionToDeckSplitLayoutPane,
  ensureDeckSplitLayoutEntry,
  getDeckSplitLayoutEntry,
  mergeDeckSplitLayoutSnapshot,
  normalizeDeckSplitLayoutMap,
  removeDeckSplitLayoutPane,
  setDeckSplitLayoutContainerWeightRatio,
  splitDeckSplitLayoutPane
} from "../src/public/layout-split-layout-runtime-state.js";

test("layout split-layout runtime state normalizes deck maps and keeps session assignments deterministic", () => {
  const normalized = normalizeDeckSplitLayoutMap({
    ops: {
      root: {
        type: "row",
        children: [
          { type: "pane", paneId: " Left " },
          { type: "pane", paneId: "right" }
        ],
        weights: [3, 1]
      },
      paneSessions: {
        left: ["s-1", "s-1", "s-2"],
        right: ["s-3"],
        ghost: ["s-9"]
      }
    }
  });

  assert.deepEqual(normalized, {
    ops: {
      root: {
        type: "row",
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ],
        weights: [0.75, 0.25]
      },
      paneSessions: {
        left: ["s-1", "s-2"],
        right: ["s-3"]
      }
    }
  });

  const ensured = ensureDeckSplitLayoutEntry(
    {
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-2"] }
      }
    },
    "ops",
    ["s-2", "s-1", "s-1", "", "s-3"]
  );

  assert.deepEqual(ensured.entry, {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: ["s-2", "s-1", "s-3"] }
  });
  assert.deepEqual(getDeckSplitLayoutEntry(ensured.deckSplitLayouts, "ops"), ensured.entry);
});

test("layout split-layout runtime state isolates pane assignment, split, remove, and weight mutations", () => {
  const initial = {
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-1", "s-2"] }
    }
  };

  const splitResult = splitDeckSplitLayoutPane(initial, "ops", "main", "row");
  assert.deepEqual(splitResult.entry.root, {
    type: "row",
    children: [
      { type: "pane", paneId: "main" },
      { type: "pane", paneId: "main-right" }
    ],
    weights: [0.5, 0.5]
  });
  assert.deepEqual(splitResult.entry.paneSessions, {
    main: ["s-1", "s-2"],
    "main-right": []
  });

  const assignResult = assignSessionToDeckSplitLayoutPane(splitResult.deckSplitLayouts, "ops", "main-right", "s-2");
  assert.deepEqual(assignResult.entry.paneSessions, {
    main: ["s-1"],
    "main-right": ["s-2"]
  });

  const weightResult = setDeckSplitLayoutContainerWeightRatio(assignResult.deckSplitLayouts, "ops", [], 0, 0.8);
  assert.deepEqual(weightResult.entry.root.weights, [0.8, 0.2]);

  const removeResult = removeDeckSplitLayoutPane(weightResult.deckSplitLayouts, "ops", "main-right");
  assert.deepEqual(removeResult.entry, {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: ["s-1", "s-2"] }
  });

  assert.equal(assignSessionToDeckSplitLayoutPane(splitResult.deckSplitLayouts, "ops", "", "s-2"), null);
  assert.equal(splitDeckSplitLayoutPane(splitResult.deckSplitLayouts, "ops", "main", "diagonal"), null);
  assert.equal(removeDeckSplitLayoutPane(splitResult.deckSplitLayouts, "ops", ""), null);
  assert.equal(setDeckSplitLayoutContainerWeightRatio(splitResult.deckSplitLayouts, "ops", [], "bad", 0.5), null);
});

test("layout split-layout runtime state merges snapshot layouts fail-closed for all-deck and single-deck apply paths", () => {
  const currentLayouts = {
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-1"] }
    },
    docs: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-2"] }
    }
  };
  const snapshotLayouts = {
    ops: {
      root: {
        type: "row",
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ],
        weights: [1, 1]
      },
      paneSessions: {
        left: ["s-1"],
        right: []
      }
    }
  };

  assert.deepEqual(mergeDeckSplitLayoutSnapshot(currentLayouts, snapshotLayouts, { scope: "all" }), {
    ops: {
      root: {
        type: "row",
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ],
        weights: [0.5, 0.5]
      },
      paneSessions: {
        left: ["s-1"],
        right: []
      }
    }
  });

  assert.deepEqual(mergeDeckSplitLayoutSnapshot(currentLayouts, snapshotLayouts, {
    scope: "deck",
    targetDeckId: "ops"
  }), {
    ops: {
      root: {
        type: "row",
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ],
        weights: [0.5, 0.5]
      },
      paneSessions: {
        left: ["s-1"],
        right: []
      }
    },
    docs: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-2"] }
    }
  });

  assert.deepEqual(mergeDeckSplitLayoutSnapshot(currentLayouts, {}, {
    scope: "deck",
    targetDeckId: "ops"
  }), {
    docs: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-2"] }
    }
  });
});
