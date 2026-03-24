import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeEventController } from "../src/public/runtime-event-controller.js";

test("runtime-event controller applies snapshot payloads and clears runtime errors", () => {
  const calls = [];
  const controller = createRuntimeEventController({
    getPreferredActiveDeckId: () => "deck-a",
    setDecks: (decks, options) => calls.push(["decks", decks, options.preferredActiveDeckId]),
    replaceCustomCommandState: (commands) => calls.push(["commands", commands.length]),
    setSessions: (sessions) => calls.push(["sessions", sessions.length]),
    replaySnapshotOutputs: (outputs) => calls.push(["outputs", outputs.length]),
    scheduleCommandPreview: () => calls.push(["preview"]),
    scheduleCommandSuggestions: () => calls.push(["suggestions"]),
    clearError: () => calls.push(["clearError"]),
    markRuntimeBootstrapReady: (source) => calls.push(["bootstrap", source])
  });

  const applied = controller.applyRuntimeEvent({
    type: "snapshot",
    decks: [{ id: "deck-a" }],
    customCommands: [{ name: "go" }],
    sessions: [{ id: "s1" }, { id: "s2" }],
    outputs: [{ sessionId: "s1", data: "ok" }]
  });

  assert.equal(applied, true);
  assert.deepEqual(calls, [
    ["decks", [{ id: "deck-a" }], "deck-a"],
    ["commands", 1],
    ["sessions", 2],
    ["outputs", 1],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["bootstrap", "ws"]
  ]);
});

test("runtime-event controller guards direct terminal input for unrestored and exited sessions", async () => {
  const errors = [];
  const activeSessions = [];
  const sendCalls = [];
  const sessions = new Map([
    ["s1", { id: "s1", state: "unrestored" }],
    ["s2", { id: "s2", state: "exited" }],
    ["s3", { id: "s3", state: "running" }]
  ]);
  const controller = createRuntimeEventController({
    getSessionById: (sessionId) => sessions.get(sessionId),
    setActiveSession: (sessionId) => activeSessions.push(sessionId),
    isSessionUnrestored: (session) => session?.state === "unrestored",
    getUnrestoredSessionMessage: () => "unrestored",
    isSessionExited: (session) => session?.state === "exited",
    getExitedSessionMessage: () => "exited",
    setError: (message) => errors.push(message),
    sendInput: (sessionId, data) => {
      sendCalls.push([sessionId, data]);
      return Promise.resolve();
    }
  });

  controller.handleSessionTerminalInput("s1", "pwd");
  controller.handleSessionTerminalInput("s2", "pwd");
  controller.handleSessionTerminalInput("s3", "pwd");
  await Promise.resolve();

  assert.deepEqual(activeSessions, ["s1", "s2", "s3"]);
  assert.deepEqual(errors, ["unrestored", "exited"]);
  assert.deepEqual(sendCalls, [["s3", "pwd"]]);
});

test("runtime-event controller applies representative runtime updates and deck fallback defaults", () => {
  const calls = [];
  const sessions = new Map([["s2", { id: "s2", name: "two" }]]);
  const controller = createRuntimeEventController({
    defaultDeckId: "deck-default",
    getPreferredActiveDeckId: () => "deck-active",
    upsertSession: (session) => calls.push(["session", session.id]),
    markSessionExited: (sessionId, event) => calls.push(["exit", sessionId, event.exitCode]),
    markSessionClosed: (sessionId) => calls.push(["closed", sessionId]),
    upsertDeckInState: (deck, options) => calls.push(["deck", deck.id, options.preferredActiveDeckId]),
    removeDeckFromState: (deckId, options) => calls.push(["deckDeleted", deckId, options.fallbackDeckId]),
    upsertCustomCommandState: (command) => calls.push(["command", command.name]),
    removeCustomCommandState: (commandName) => calls.push(["commandDeleted", commandName]),
    scheduleCommandPreview: () => calls.push(["preview"]),
    scheduleCommandSuggestions: () => calls.push(["suggestions"]),
    clearError: () => calls.push(["clearError"]),
    activityCompletionNotifier: {
      queueCompletion: (session, completedAt) => calls.push(["completion", session.id, completedAt])
    },
    getSessionById: (sessionId) => sessions.get(sessionId)
  });

  assert.equal(controller.applyRuntimeEvent({ type: "session.updated", session: { id: "s1" } }), true);
  assert.equal(controller.applyRuntimeEvent({ type: "session.exit", sessionId: "s1", exitCode: 7 }), true);
  assert.equal(
    controller.applyRuntimeEvent({ type: "session.activity.completed", sessionId: "s2", activityCompletedAt: 42 }),
    true
  );
  assert.equal(controller.applyRuntimeEvent({ type: "session.closed", sessionId: "s1" }), true);
  assert.equal(controller.applyRuntimeEvent({ type: "deck.updated", deck: { id: "deck-b" } }), true);
  assert.equal(controller.applyRuntimeEvent({ type: "deck.deleted", deckId: "deck-b" }), true);
  assert.equal(controller.applyRuntimeEvent({ type: "custom-command.updated", command: { name: "go" } }), true);
  assert.equal(controller.applyRuntimeEvent({ type: "custom-command.deleted", command: { name: "go" } }), true);

  assert.deepEqual(calls, [
    ["session", "s1"],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["exit", "s1", 7],
    ["clearError"],
    ["completion", "s2", 42],
    ["clearError"],
    ["closed", "s1"],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["deck", "deck-b", "deck-active"],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["deckDeleted", "deck-b", "deck-default"],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["command", "go"],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["commandDeleted", "go"],
    ["preview"],
    ["suggestions"],
    ["clearError"]
  ]);
});
