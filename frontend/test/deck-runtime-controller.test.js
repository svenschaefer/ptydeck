import test from "node:test";
import assert from "node:assert/strict";

import { createDeckRuntimeController } from "../src/public/deck-runtime-controller.js";
import { createStore } from "../src/public/store.js";

function createLocalStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

test("deck-runtime controller loads and saves active deck preference", () => {
  const localStorage = createLocalStorage();
  const controller = createDeckRuntimeController({
    store: createStore(),
    windowRef: { localStorage }
  });

  assert.equal(controller.loadStoredActiveDeckId(), "");
  controller.saveStoredActiveDeckId("ops");
  assert.equal(controller.loadStoredActiveDeckId(), "ops");
  controller.saveStoredActiveDeckId("");
  assert.equal(controller.loadStoredActiveDeckId(), "");
});

test("deck-runtime controller normalizes decks and syncs active deck geometry", () => {
  const store = createStore();
  const localStorage = createLocalStorage();
  const resizeCalls = [];
  let terminalSettings = { cols: 80, rows: 20, sidebarVisible: true };

  const controller = createDeckRuntimeController({
    store,
    windowRef: { localStorage },
    defaultDeckId: "default",
    defaultTerminalCols: 80,
    defaultTerminalRows: 20,
    getTerminalSettings: () => terminalSettings,
    setTerminalSettings: (nextSettings) => {
      terminalSettings = nextSettings;
    },
    persistTerminalSettings: () => resizeCalls.push("persist"),
    syncSettingsUi: () => resizeCalls.push("sync-ui"),
    applySettingsToAllTerminals: (payload) => resizeCalls.push(["apply", payload]),
    scheduleGlobalResize: (payload) => resizeCalls.push(["global", payload]),
    resolveSessionDeckId: (session) => session?.deckId || "default",
    getSessionById: () => null
  });

  controller.setDecks(
    [
      { id: " default ", name: " Default ", settings: { terminal: { cols: 58, rows: 20 } } },
      { id: " ops ", name: " Ops ", settings: { terminal: { cols: "121", rows: "41" } } }
    ],
    { preferredActiveDeckId: "ops" }
  );

  const state = store.getState();
  assert.deepEqual(
    state.decks.map((deck) => ({ id: deck.id, name: deck.name })),
    [
      { id: "default", name: "Default" },
      { id: "ops", name: "Ops" }
    ]
  );
  assert.equal(state.activeDeckId, "ops");
  assert.equal(localStorage.getItem("ptydeck.active-deck.v1"), "ops");
  assert.equal(terminalSettings.cols, 121);
  assert.equal(terminalSettings.rows, 41);
  assert.deepEqual(resizeCalls, [
    "persist",
    "sync-ui",
    ["apply", { deckId: "ops", force: true }],
    ["global", { deckId: "ops", force: true }]
  ]);
});

test("deck-runtime controller switches active deck and routes sidebar helpers", () => {
  const store = createStore();
  store.setDecks([
    { id: "default", name: "Default", settings: { terminal: { cols: 80, rows: 20 } } },
    { id: "ops", name: "Ops", settings: { terminal: { cols: 120, rows: 40 } } }
  ]);

  const localStorage = createLocalStorage();
  const sidebarCalls = [];
  let terminalSettings = { cols: 80, rows: 20, sidebarVisible: true };
  const sidebarController = {
    getSessionCountForDeck(deckId, sessions) {
      sidebarCalls.push(["count", deckId, sessions.length]);
      return 7;
    },
    render(payload) {
      sidebarCalls.push(["render", payload.activeDeckId, payload.activeSessionId, payload.sessions.length]);
    }
  };

  const controller = createDeckRuntimeController({
    store,
    windowRef: { localStorage },
    defaultDeckId: "default",
    getTerminalSettings: () => terminalSettings,
    setTerminalSettings: (nextSettings) => {
      terminalSettings = nextSettings;
    },
    persistTerminalSettings: () => sidebarCalls.push("persist"),
    syncSettingsUi: () => sidebarCalls.push("sync-ui"),
    applySettingsToAllTerminals: (payload) => sidebarCalls.push(["apply", payload]),
    scheduleGlobalResize: (payload) => sidebarCalls.push(["global", payload]),
    scheduleDeferredResizePasses: (payload) => sidebarCalls.push(["deferred", payload]),
    getDeckSidebarController: () => sidebarController,
    resolveSessionDeckId: (session) => session?.deckId || "default",
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "ops" })
  });

  assert.equal(controller.getSessionCountForDeck("ops", [{ id: "s1", deckId: "ops" }]), 7);
  controller.renderDeckTabs([{ id: "s1", deckId: "ops" }]);
  assert.deepEqual(sidebarCalls.slice(0, 2), [
    ["count", "ops", 1],
    ["render", "default", null, 1]
  ]);

  const switched = controller.setActiveDeck("ops");
  assert.equal(switched, true);
  assert.equal(store.getState().activeDeckId, "ops");
  assert.equal(terminalSettings.cols, 120);
  assert.equal(terminalSettings.rows, 40);
  assert.equal(localStorage.getItem("ptydeck.active-deck.v1"), "ops");
  assert.deepEqual(sidebarCalls.slice(2), [
    "persist",
    "sync-ui",
    ["apply", { deckId: "ops", force: true }],
    ["global", { deckId: "ops", force: true }],
    ["global", { deckId: "ops", force: true }],
    ["deferred", { deckId: "ops", force: true }]
  ]);

  assert.equal(controller.setActiveDeck("ops"), true);
  assert.equal(controller.setActiveDeck("missing"), false);
  assert.deepEqual(controller.getSessionTerminalGeometry("s1"), { cols: 120, rows: 40 });
});
