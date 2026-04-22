import test from "node:test";
import assert from "node:assert/strict";

import { createCommandDiscoveryUsageStore, rankDiscoveryItems } from "../src/public/command-discovery-ranking.js";

function createStorageStub() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    }
  };
}

test("rankDiscoveryItems preserves exact-prefix priority ahead of fuzzy matches", () => {
  const ranked = rankDiscoveryItems(
    [
      { key: "stack", label: "stack" },
      { key: "haystack", label: "haystack" },
      { key: "angle", label: "angle" }
    ],
    "st",
    {
      getKey: (entry) => entry.key,
      getTexts: (entry) => [entry.label]
    }
  );

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["stack", "haystack"]
  );
});

test("rankDiscoveryItems uses recency only after deterministic fuzzy scoring", () => {
  const ranked = rankDiscoveryItems(
    [
      { key: "alpha", label: "alpha" },
      { key: "atlas", label: "atlas" }
    ],
    "a",
    {
      getKey: (entry) => entry.key,
      getTexts: (entry) => [entry.label],
      getUsageScore: (key) => (key === "atlas" ? 10 : 0)
    }
  );

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["atlas", "alpha"]
  );
});

test("rankDiscoveryItems prefers the shortest exact-prefix completion before recency", () => {
  const ranked = rankDiscoveryItems(
    [
      { key: "doc-en", label: "doc-en" },
      { key: "doc", label: "doc" }
    ],
    "do",
    {
      getKey: (entry) => entry.key,
      getTexts: (entry) => [entry.label],
      getUsageScore: (key) => (key === "doc-en" ? 10 : 0)
    }
  );

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["doc", "doc-en"]
  );
});

test("rankDiscoveryItems still personalizes exact-prefix ties with the same completion length", () => {
  const ranked = rankDiscoveryItems(
    [
      { key: "close", label: "close" },
      { key: "clone", label: "clone" }
    ],
    "cl",
    {
      getKey: (entry) => entry.key,
      getTexts: (entry) => [entry.label],
      getUsageScore: (key) => (key === "clone" ? 10 : 0)
    }
  );

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["clone", "close"]
  );
});

test("createCommandDiscoveryUsageStore persists bounded recency order", () => {
  const storageRef = createStorageStub();
  const store = createCommandDiscoveryUsageStore({
    storageRef,
    storageKey: "test.discovery",
    limit: 3
  });

  assert.equal(store.record("cmd:switch"), true);
  assert.equal(store.record("session:alpha"), true);
  assert.equal(store.record("deck:ops"), true);
  assert.equal(store.record("session:alpha"), true);

  assert.deepEqual(store.snapshot(), ["session:alpha", "deck:ops", "cmd:switch"]);
  assert.ok(store.getUsageScore("session:alpha") > store.getUsageScore("cmd:switch"));

  const reloadedStore = createCommandDiscoveryUsageStore({
    storageRef,
    storageKey: "test.discovery",
    limit: 3
  });
  assert.deepEqual(reloadedStore.snapshot(), ["session:alpha", "deck:ops", "cmd:switch"]);

  store.clear();
  assert.deepEqual(store.snapshot(), []);
  assert.equal(storageRef.getItem("test.discovery"), null);
});
