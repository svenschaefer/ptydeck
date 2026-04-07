import test from "node:test";
import assert from "node:assert/strict";

import { createTrustedLocalLayoutRuntimeController } from "../src/public/trusted-local-layout-runtime-controller.js";

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test("trusted-local layout runtime controller captures a first-use baseline when no device layout exists", async () => {
  const storage = createStorage();
  const applied = [];
  const controller = createTrustedLocalLayoutRuntimeController({
    localStorageRef: storage,
    captureCurrentLayout: () => ({
      activeDeckId: "default",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 185,
      deckTerminalSettings: {
        default: { cols: 80, rows: 24 }
      },
      deckSplitLayouts: {}
    }),
    applyLayoutSnapshot: async (layout, options) => {
      applied.push([layout, options]);
    }
  });

  const result = await controller.applyLayoutForClient("trusted-1", {
    scope: "all",
    targetDeckId: "default"
  });

  assert.deepEqual(result, { applied: false, captured: true });
  assert.equal(applied.length, 0);
  assert.equal(controller.getLayoutForClient("trusted-1")?.layout?.activeDeckId, "default");
});

test("trusted-local layout runtime controller reapplies a stored device layout snapshot", async () => {
  const storage = createStorage();
  const applied = [];
  const controller = createTrustedLocalLayoutRuntimeController({
    localStorageRef: storage,
    captureCurrentLayout: () => ({
      activeDeckId: "default",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 185,
      deckTerminalSettings: {
        default: { cols: 80, rows: 24 }
      },
      deckSplitLayouts: {}
    }),
    applyLayoutSnapshot: async (layout, options) => {
      applied.push([layout, options]);
    }
  });

  controller.saveCurrentLayoutForClient("trusted-2");
  const result = await controller.applyLayoutForClient("trusted-2", {
    scope: "deck",
    targetDeckId: "ops"
  });

  assert.deepEqual(result, { applied: true, captured: false });
  assert.equal(applied.length, 1);
  assert.equal(applied[0][1].scope, "deck");
  assert.equal(applied[0][1].targetDeckId, "ops");
});
