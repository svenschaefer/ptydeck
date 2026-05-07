import test from "node:test";
import assert from "node:assert/strict";

import { createLayoutSplitLayoutRuntimeModel } from "../src/public/layout-split-layout-runtime-model.js";

test("layout split-layout runtime model isolates stateful layout mutations and merge flows deterministically", () => {
  const changeReasons = [];
  const model = createLayoutSplitLayoutRuntimeModel({
    defaultDeckId: "default",
    onLayoutsChanged() {
      changeReasons.push("changed");
    }
  });

  assert.deepEqual(model.replaceDeckSplitLayouts({
    ops: {
      root: {
        type: "row",
        weights: [2, 1],
        children: [{ type: "pane", paneId: "left" }, { type: "pane", paneId: "right" }]
      },
      paneSessions: {
        left: ["s-1"],
        right: ["s-2"]
      }
    }
  }), {
    ops: {
      root: {
        type: "row",
        weights: [0.666667, 0.333333],
        children: [{ type: "pane", paneId: "left" }, { type: "pane", paneId: "right" }]
      },
      paneSessions: {
        left: ["s-1"],
        right: ["s-2"]
      }
    }
  });
  assert.equal(changeReasons.length, 1);

  const ensured = model.ensureDeckLayoutEntry("ops", ["s-2", "s-3", "", "s-3"]);
  assert.deepEqual(ensured.paneSessions, {
    left: ["s-3"],
    right: ["s-2"]
  });
  assert.equal(changeReasons.length, 1);

  assert.deepEqual(model.assignSessionToPane("ops", "left", "s-2"), {
    root: {
      type: "row",
      weights: [0.666667, 0.333333],
      children: [{ type: "pane", paneId: "left" }, { type: "pane", paneId: "right" }]
    },
    paneSessions: {
      left: ["s-3", "s-2"],
      right: []
    }
  });
  assert.equal(changeReasons.length, 2);

  const splitEntry = model.splitPane("ops", "right", "column");
  assert.equal(splitEntry.root.children[1].type, "column");
  assert.deepEqual(splitEntry.paneSessions, {
    left: ["s-3", "s-2"],
    right: [],
    "right-lower": []
  });
  assert.equal(changeReasons.length, 3);

  const weightedEntry = model.setContainerWeightRatio("ops", [1], 0, 0.8);
  assert.deepEqual(weightedEntry.root.children[1].weights, [0.8, 0.2]);
  assert.equal(changeReasons.length, 4);

  const removedEntry = model.removePane("ops", "right-lower");
  assert.deepEqual(removedEntry.paneSessions, {
    left: ["s-3", "s-2"],
    right: []
  });
  assert.equal(changeReasons.length, 5);

  const mergedLayouts = model.mergeDeckSplitLayouts(
    {
      ops: {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: ["s-9"] }
      }
    },
    {
      scope: "deck",
      targetDeckId: "ops"
    }
  );
  assert.deepEqual(mergedLayouts.ops, {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: ["s-9"] }
  });
  assert.equal(changeReasons.length, 6);

  const captured = model.captureDeckSplitLayouts();
  captured.ops.root.paneId = "mutated";
  assert.deepEqual(model.getDeckSplitLayout("ops").root, { type: "pane", paneId: "main" });
});

test("layout split-layout runtime model fails closed for invalid mutations", () => {
  const changeReasons = [];
  const model = createLayoutSplitLayoutRuntimeModel({
    onLayoutsChanged() {
      changeReasons.push("changed");
    }
  });

  model.replaceDeckSplitLayouts({
    default: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-1"] }
    }
  });
  assert.equal(model.assignSessionToPane("default", "", "s-1"), null);
  assert.equal(model.splitPane("default", "main", "diagonal"), null);
  assert.equal(model.removePane("default", ""), null);
  assert.equal(model.setContainerWeightRatio("default", [], "bad", 0.5), null);
  assert.deepEqual(model.mergeDeckSplitLayouts({}, { scope: "deck" }), {
    default: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s-1"] }
    }
  });
  assert.equal(changeReasons.length, 2);
});
