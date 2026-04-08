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
    },
    removeItem(key) {
      data.delete(key);
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

test("trusted-local layout runtime controller rejects invalid client ids and non-object layout snapshots", async () => {
  const controller = createTrustedLocalLayoutRuntimeController({
    localStorageRef: createStorage(),
    captureCurrentLayout: () => null
  });

  assert.throws(
    () => controller.saveCurrentLayoutForClient(" "),
    /requires a stable client id/i
  );
  await assert.rejects(
    controller.applyLayoutForClient(" ", {}),
    /requires a stable client id/i
  );
  assert.throws(
    () => controller.saveCurrentLayoutForClient("trusted-3"),
    /requires a serializable layout snapshot/i
  );
});

test("trusted-local layout runtime controller ignores malformed storage and verifies writes exactly", () => {
  const storage = createStorage();
  storage.setItem(controllerStorageKey(), JSON.stringify({
    format: "ptydeck.trusted-local-layouts.v1",
    clients: {
      "bad-client": {
        updatedAt: "wrong",
        layout: {}
      }
    }
  }));

  const controller = createTrustedLocalLayoutRuntimeController({
    localStorageRef: storage,
    captureCurrentLayout: () => ({
      activeDeckId: "default",
      sidebarVisible: true
    })
  });

  assert.equal(controller.getLayoutForClient("bad-client"), null);
  const result = controller.saveCurrentLayoutForClient("trusted-4");
  assert.equal(result.layout.activeDeckId, "default");
});

test("trusted-local layout runtime controller fails when a storage write cannot be verified", () => {
  const storageKey = controllerStorageKey();
  const existingRecord = JSON.stringify({
    format: "ptydeck.trusted-local-layouts.v1",
    clients: {
      "trusted-old": {
        updatedAt: 1,
        layout: {
          activeDeckId: "old"
        }
      }
    }
  });
  let currentValue = existingRecord;
  const storage = {
    getItem(key) {
      return key === storageKey ? currentValue : null;
    },
    setItem(key, _value) {
      if (key === storageKey) {
        // Simulate a silent write failure that leaves the previous valid record in place.
        currentValue = existingRecord;
      }
    }
  };
  const controller = createTrustedLocalLayoutRuntimeController({
    localStorageRef: storage,
    captureCurrentLayout: () => ({
      activeDeckId: "default",
      sidebarVisible: true
    })
  });

  assert.throws(
    () => controller.saveCurrentLayoutForClient("trusted-5"),
    /Failed to verify trusted-local device layout storage/i
  );
});

function controllerStorageKey() {
  return "ptydeck.trusted-local-layouts.v1";
}
