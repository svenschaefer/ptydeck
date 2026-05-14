import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeEventController } from "../src/public/runtime-event-controller.js";

test("runtime-event controller applies snapshot payloads and clears runtime errors", () => {
  const calls = [];
  const controller = createRuntimeEventController({
    setRuntimeClientId: (clientId) => calls.push(["clientId", clientId]),
    setComposerPlacementState: (state) => calls.push(["composerPlacement", state?.mode || ""]),
    getPreferredActiveDeckId: () => "deck-a",
    setDecks: (decks, options) => calls.push(["decks", decks, options.preferredActiveDeckId]),
    replaceCustomCommandState: (commands) => calls.push(["commands", commands.length]),
    setSessions: (sessions) => calls.push(["sessions", sessions.length]),
    replaySnapshotOutputs: (outputs) => calls.push(["outputs", outputs.length]),
    scheduleCommandPreview: () => calls.push(["preview"]),
    scheduleCommandSuggestions: () => calls.push(["suggestions"]),
    clearError: () => calls.push(["clearError"]),
    markRuntimeBootstrapReady: (source) => calls.push(["bootstrap", source]),
    scheduleSnapshotTerminalStabilization: (sessionIds) => calls.push(["stabilize", sessionIds])
  });

  const applied = controller.applyRuntimeEvent({
    type: "snapshot",
    composerPlacement: { mode: "active-overlay" },
    decks: [{ id: "deck-a" }],
    customCommands: [{ name: "go" }],
    sessions: [{ id: "s1" }, { id: "s2" }],
    outputs: [{ sessionId: "s1", data: "ok" }]
  });

  assert.equal(applied, true);
  assert.deepEqual(calls, [
    ["clientId", ""],
    ["composerPlacement", "active-overlay"],
    ["decks", [{ id: "deck-a" }], "deck-a"],
    ["commands", 1],
    ["sessions", 2],
    ["outputs", 1],
    ["preview"],
    ["suggestions"],
    ["clearError"],
    ["bootstrap", "ws"],
    ["stabilize", ["s1", "s2"]]
  ]);
});

test("runtime-event controller preserves an established runtime client id across conflicting snapshots", () => {
  const calls = [];
  const controller = createRuntimeEventController({
    getRuntimeClientId: () => "trusted-local-1",
    setRuntimeClientId: (clientId) => calls.push(["clientId", clientId]),
    setComposerPlacementState: (state) => calls.push(["composerPlacement", state?.mode || ""]),
    setDecks: () => calls.push(["decks"]),
    replaceCustomCommandState: () => calls.push(["commands"]),
    setSessions: () => calls.push(["sessions"]),
    replaySnapshotOutputs: () => calls.push(["outputs"]),
    scheduleCommandPreview: () => calls.push(["preview"]),
    scheduleCommandSuggestions: () => calls.push(["suggestions"]),
    clearError: () => calls.push(["clearError"]),
    markRuntimeBootstrapReady: (source) => calls.push(["bootstrap", source]),
    scheduleSnapshotTerminalStabilization: (sessionIds) => calls.push(["stabilize", sessionIds])
  });

  controller.applyRuntimeEvent({
    type: "snapshot",
    clientId: "",
    composerPlacement: { mode: "shared-footer" },
    sessions: []
  });
  controller.applyRuntimeEvent({
    type: "snapshot",
    clientId: "ws-ephemeral-1",
    composerPlacement: { mode: "active-overlay" },
    sessions: []
  });

  assert.deepEqual(
    calls.filter(([type]) => type === "clientId"),
    []
  );
  assert.deepEqual(
    calls.filter(([type]) => type === "composerPlacement"),
    [["composerPlacement", "shared-footer"], ["composerPlacement", "active-overlay"]]
  );
});

test("runtime-event controller applies composer placement updates", () => {
  const calls = [];
  const controller = createRuntimeEventController({
    setComposerPlacementState: (state) => calls.push(state)
  });

  const applied = controller.applyRuntimeEvent({
    type: "composer-placement.updated",
    composerPlacement: {
      clientId: "client-1",
      mode: "active-overlay",
      pinnedSessionIds: ["s-2"],
      sharedDraft: "",
      pinnedDrafts: { "s-2": "pwd" }
    }
  });

  assert.equal(applied, true);
  assert.deepEqual(calls, [
    {
      clientId: "client-1",
      mode: "active-overlay",
      pinnedSessionIds: ["s-2"],
      sharedDraft: "",
      pinnedDrafts: { "s-2": "pwd" }
    }
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

test("runtime-event controller blocks direct terminal input for stopped sessions", async () => {
  const errors = [];
  const sendCalls = [];
  const controller = createRuntimeEventController({
    getSessionById: () => ({ id: "s1", state: "stopped" }),
    isSessionStopped: (session) => session?.state === "stopped",
    getStoppedSessionMessage: () => "stopped",
    setError: (message) => errors.push(message),
    sendInput: (sessionId, data) => {
      sendCalls.push([sessionId, data]);
      return Promise.resolve();
    }
  });

  controller.handleSessionTerminalInput("s1", "pwd");
  await Promise.resolve();

  assert.deepEqual(errors, ["stopped"]);
  assert.deepEqual(sendCalls, []);
});

test("runtime-event controller blocks direct terminal input in read-only spectator mode", async () => {
  const errors = [];
  const sendCalls = [];
  const controller = createRuntimeEventController({
    isReadOnlyMode: () => true,
    getReadOnlyModeMessage: () => "Spectator · Read-only session s-1. Write actions are disabled.",
    setError: (message) => errors.push(message),
    sendInput: (sessionId, data) => {
      sendCalls.push([sessionId, data]);
      return Promise.resolve();
    }
  });

  controller.handleSessionTerminalInput("s-1", "pwd");
  await Promise.resolve();

  assert.deepEqual(errors, ["Spectator · Read-only session s-1. Write actions are disabled."]);
  assert.deepEqual(sendCalls, []);
});

test("runtime-event controller blocks direct terminal input when this client does not control the session", async () => {
  const errors = [];
  const reclaimCalls = [];
  const sendCalls = [];
  const controller = createRuntimeEventController({
    getSessionById: () => ({ id: "s-1", state: "running" }),
    canWriteToSession: () => false,
    getSessionWriteBlockedMessage: () => "This session is currently controlled by another client. Input and resize are disabled.",
    setError: (message) => errors.push(message),
    showBlockedWriteReclaimUi: (session, options) => reclaimCalls.push([session.id, options.source, options.message]),
    sendInput: (sessionId, data) => {
      sendCalls.push([sessionId, data]);
      return Promise.resolve();
    }
  });

  controller.handleSessionTerminalInput("s-1", "pwd");
  await Promise.resolve();

  assert.deepEqual(errors, ["This session is currently controlled by another client. Input and resize are disabled."]);
  assert.deepEqual(sendCalls, []);
  assert.deepEqual(reclaimCalls, [
    [
      "s-1",
      "terminal-input",
      "This session is currently controlled by another client. Input and resize are disabled."
    ]
  ]);
});

test("runtime-event controller surfaces the concrete terminal input error message", async () => {
  const errors = [];
  const reports = [];
  const controller = createRuntimeEventController({
    getSessionById: () => ({ id: "s-1", state: "running" }),
    getErrorMessage: (error, fallback) => error?.message || fallback,
    reportTerminalInputError: (sessionId, error, options) =>
      reports.push([sessionId, error?.message || "", options?.suppressed === true]),
    setError: (message) => errors.push(message),
    sendInput: () => Promise.reject(new Error("Network timeout while sending input."))
  });

  controller.handleSessionTerminalInput("s-1", "pwd");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, ["Network timeout while sending input."]);
  assert.deepEqual(reports, [["s-1", "Network timeout while sending input.", false]]);
});

test("runtime-event controller suppresses abort-like terminal input errors", async () => {
  const errors = [];
  const reports = [];
  const controller = createRuntimeEventController({
    getSessionById: () => ({ id: "s-1", state: "running" }),
    reportTerminalInputError: (sessionId, error, options) =>
      reports.push([sessionId, error?.name || "", options?.suppressed === true]),
    setError: (message) => errors.push(message),
    sendInput: () => Promise.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))
  });

  controller.handleSessionTerminalInput("s-1", "pwd");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, []);
  assert.deepEqual(reports, [["s-1", "AbortError", true]]);
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
    ["commandDeleted", { name: "go" }],
    ["preview"],
    ["suggestions"],
    ["clearError"]
  ]);
});

test("runtime-event controller applies session interpretation events through the store sink", () => {
  const calls = [];
  const controller = createRuntimeEventController({
    applySessionInterpretationActions: (sessionId, actions) => calls.push(["interpretation", sessionId, actions]),
    clearError: () => calls.push(["clearError"])
  });

  assert.equal(
    controller.applyRuntimeEvent({
      type: "session.interpretation.apply",
      sessionId: "s1",
      actions: [{ type: "setSessionStatus", value: "Ready" }]
    }),
    true
  );
  assert.equal(
    controller.applyRuntimeEvent({
      type: "session.interpretation.apply",
      sessionId: "s1",
      actions: []
    }),
    false
  );

  assert.deepEqual(calls, [
    ["interpretation", "s1", [{ type: "setSessionStatus", value: "Ready" }]],
    ["clearError"]
  ]);
});
