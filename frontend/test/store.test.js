import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/public/store.js";

test("store tracks sessions and active session", () => {
  const store = createStore();
  store.setSessions([
    { id: "a" },
    { id: "b" }
  ]);

  assert.equal(store.getState().activeSessionId, "a");

  store.setActiveSession("b");
  assert.equal(store.getState().activeSessionId, "b");
});

test("store tracks connection state", () => {
  const store = createStore();
  store.setConnectionState("connected");
  assert.equal(store.getState().connectionState, "connected");
});

test("store manages deck state, active deck switching, and fallback removal", () => {
  const store = createStore();

  store.hydrateRuntimePreferences({
    activeDeckId: "ops",
    sessionFilterText: "  tag:ops  "
  });
  store.setDecks([
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ]);
  store.setSessions([
    { id: "a", deckId: "default" },
    { id: "b", deckId: "ops" }
  ]);

  let state = store.getState();
  assert.equal(state.activeDeckId, "ops");
  assert.equal(state.sessionFilterText, "tag:ops");

  store.setActiveDeck("ops");
  state = store.getState();
  assert.equal(state.activeDeckId, "ops");
  assert.equal(state.activeSessionId, "b");

  store.removeDeck("ops", { fallbackDeckId: "default" });
  state = store.getState();
  assert.equal(state.activeDeckId, "default");
  assert.deepEqual(
    state.decks.map((deck) => deck.id),
    ["default"]
  );
});

test("store manages normalized custom commands and protects internal snapshots", () => {
  const store = createStore();

  store.setSessions([{ id: "a", deckId: "default" }]);
  store.replaceCustomCommands([
    { name: " Go ", content: "echo go", createdAt: 1, updatedAt: 2 },
    { name: "ls", content: "ls -al", createdAt: 3, updatedAt: 4 }
  ]);
  store.upsertCustomCommand({ name: "go", content: "echo replaced", createdAt: 5, updatedAt: 6 });

  let state = store.getState();
  assert.deepEqual(
    state.customCommands.map((command) => command.name),
    ["go", "ls"]
  );
  assert.equal(store.getCustomCommand("GO")?.content, "echo replaced");

  state.sessions.push({ id: "mutated" });
  state.customCommands[0].content = "broken";
  state.decks.push({ id: "bad", name: "Bad" });

  state = store.getState();
  assert.deepEqual(
    state.sessions.map((session) => session.id),
    ["a"]
  );
  assert.equal(store.getCustomCommand("go")?.content, "echo replaced");
  assert.equal(state.decks.length, 0);
});

test("store tracks live and unread session activity and clears unread on activation", () => {
  const store = createStore();

  store.setDecks([{ id: "default", name: "Default" }]);
  store.setSessions([
    { id: "a", deckId: "default" },
    { id: "b", deckId: "default" }
  ]);

  store.markSessionActivity("b", { timestamp: 100 });
  let state = store.getState();
  let target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, true);
  assert.equal(target.hasUnreadActivity, true);
  assert.equal(target.lastOutputAt, 100);

  store.setActiveSession("b");
  state = store.getState();
  target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, true);
  assert.equal(target.hasUnreadActivity, false);

  store.clearSessionActivity("b", { timestamp: 100 });
  state = store.getState();
  target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, false);
  assert.equal(target.hasUnreadActivity, false);
  assert.equal(target.lifecycleState, "idle");
});

test("store derives formal lifecycle transitions from runtime state and activity", () => {
  const store = createStore();

  store.setSessions([
    { id: "a", state: "starting" },
    { id: "b", state: "running" }
  ]);

  let state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "starting");
  assert.equal(state.sessions.find((session) => session.id === "b")?.lifecycleState, "running");

  store.upsertSession({ id: "a", state: "running" });
  store.markSessionActivity("a", { timestamp: 50 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "busy");

  store.clearSessionActivity("a", { timestamp: 50 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "idle");

  store.setSessions([{ id: "a", state: "running" }]);
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "idle");

  store.markSessionExited("a", { exitCode: 7, signal: "SIGTERM", exitedAt: 100 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "exited");
  assert.equal(state.sessions.find((session) => session.id === "a")?.exitCode, 7);

  store.markSessionClosed("a");
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a"), undefined);
});

test("store avoids repeated publishes for already-live session activity", () => {
  const store = createStore();
  let publishes = 0;
  store.subscribe(() => {
    publishes += 1;
  });

  store.setSessions([{ id: "a", state: "running" }]);
  publishes = 0;

  store.markSessionActivity("a", { timestamp: 10 });
  store.markSessionActivity("a", { timestamp: 11 });
  store.markSessionActivity("a", { timestamp: 12 });

  assert.equal(publishes, 1);
  assert.equal(store.getState().sessions[0].lifecycleState, "busy");
});
