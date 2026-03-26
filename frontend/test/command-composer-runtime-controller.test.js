import test from "node:test";
import assert from "node:assert/strict";

import { createCommandComposerRuntimeController } from "../src/public/command-composer-runtime-controller.js";

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const token = { fn, delay };
      timers.push(token);
      return token;
    },
    clearTimeout() {}
  };
}

test("command-composer runtime controller handles quick-switch submit", async () => {
  const calls = [];
  let value = ">deck";
  const controller = createCommandComposerRuntimeController({
    getCommandValue: () => value,
    setCommandValue: (next) => {
      value = next;
      calls.push(["value", next]);
    },
    interpretComposerInput: () => ({ kind: "quick-switch", selector: "deck" }),
    getState: () => ({ sessions: [{ id: "s1" }], activeSessionId: "s1" }),
    resolveQuickSwitchTarget: () => ({ kind: "deck", target: { id: "d1" } }),
    activateDeckTarget: () => ({ message: "Active deck: [d1] Deck." }),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    setCommandPreview: (message) => calls.push(["preview", message]),
    clearCommandSuggestions: () => calls.push(["clearSuggestions"]),
    render: () => calls.push(["render"])
  });

  await controller.submitCommand();

  assert.deepEqual(calls, [
    ["feedback", "Active deck: [d1] Deck."],
    ["value", ""],
    ["preview", ""],
    ["clearSuggestions"],
    ["render"]
  ]);
});

test("command-composer runtime controller handles control submit and preview scheduling", async () => {
  const calls = [];
  let value = "/go";
  const windowRef = createFakeWindow();
  const controller = createCommandComposerRuntimeController({
    windowRef,
    getCommandValue: () => value,
    setCommandValue: (next) => {
      value = next;
      calls.push(["value", next]);
    },
    interpretComposerInput: () => ({ kind: "control", command: "go", args: [] }),
    executeControlCommand: async () => "ok",
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    setCommandPreview: (message) => calls.push(["preview", message]),
    clearCommandSuggestions: () => calls.push(["clearSuggestions"]),
    recordSlashHistory: (raw) => calls.push(["history", raw]),
    resetSlashHistoryNavigationState: () => calls.push(["historyReset"]),
    render: () => calls.push(["render"]),
    debugLog: (event, payload) => calls.push(["debug", event, payload.command || ""]),
    getCustomCommandState: () => ({ content: "payload" })
  });

  controller.scheduleCommandPreview();
  assert.equal(windowRef.timers[0].delay, 120);
  await windowRef.timers[0].fn();
  await controller.submitCommand();

  assert.deepEqual(calls, [
    ["preview", "payload"],
    ["debug", "command.control.start", "go"],
    ["feedback", "ok"],
    ["history", "/go"],
    ["debug", "command.control.ok", "go"],
    ["value", ""],
    ["preview", ""],
    ["clearSuggestions"],
    ["historyReset"],
    ["render"]
  ]);
});

test("command-composer runtime controller sends command input via configured terminator", async () => {
  const calls = [];
  let value = "ls -al";
  const controller = createCommandComposerRuntimeController({
    getCommandValue: () => value,
    setCommandValue: (next) => {
      value = next;
      calls.push(["value", next]);
    },
    interpretComposerInput: () => ({ kind: "input", data: "ls -al" }),
    getState: () => ({
      sessions: [{ id: "s1", name: "one" }],
      activeSessionId: "s1"
    }),
    isSessionActionBlocked: () => false,
    getSessionSendTerminator: () => "CRLF",
    sendInputWithConfiguredTerminator: async (sendFn, sessionId, payload, mode, options) => {
      calls.push(["send", sessionId, payload, mode, options.delayedSubmitMs]);
      await sendFn(sessionId, payload);
    },
    apiSendInput: async (sessionId, payload) => {
      calls.push(["api", sessionId, payload]);
    },
    normalizeSendTerminatorMode: (mode) => mode,
    delayedSubmitMs: 75,
    recordCommandSubmission: (sessionId, submission) => calls.push(["record", sessionId, submission.source, submission.text]),
    setCommandPreview: (message) => calls.push(["preview", message]),
    clearCommandSuggestions: () => calls.push(["clearSuggestions"]),
    clearError: () => calls.push(["clearError"]),
    resetSlashHistoryNavigationState: () => calls.push(["historyReset"]),
    render: () => calls.push(["render"]),
    debugLog: (event, payload) => calls.push(["debug", event, payload.activeSessionId || ""])
  });

  await controller.submitCommand();

  assert.deepEqual(calls, [
    ["debug", "command.send.start", "s1"],
    ["send", "s1", "ls -al", "CRLF", 75],
    ["api", "s1", "ls -al"],
    ["record", "s1", "input", "ls -al"],
    ["value", ""],
    ["preview", ""],
    ["clearSuggestions"],
    ["clearError"],
    ["historyReset"],
    ["debug", "command.send.ok", "s1"],
    ["render"]
  ]);
});

test("command-composer runtime controller records one submission per direct-route target", async () => {
  const calls = [];
  let value = "@ops pwd";
  const controller = createCommandComposerRuntimeController({
    getCommandValue: () => value,
    setCommandValue: (next) => {
      value = next;
      calls.push(["value", next]);
    },
    interpretComposerInput: () => ({ kind: "input", data: "@ops pwd" }),
    getState: () => ({
      sessions: [
        { id: "s1", name: "one" },
        { id: "s2", name: "two" }
      ],
      activeSessionId: "s1"
    }),
    parseDirectTargetRoutingInput: () => ({ matched: true, payload: "pwd", targetToken: "ops" }),
    resolveTargetSelectors: () => ({
      sessions: [
        { id: "s1", name: "one" },
        { id: "s2", name: "two" }
      ],
      error: ""
    }),
    getActiveDeck: () => ({ id: "default" }),
    isSessionActionBlocked: () => false,
    getSessionSendTerminator: () => "CR",
    sendInputWithConfiguredTerminator: async (_sendFn, sessionId, payload) => {
      calls.push(["send", sessionId, payload]);
    },
    normalizeSendTerminatorMode: (mode) => mode,
    recordCommandSubmission: (sessionId, submission) => calls.push(["record", sessionId, submission.text]),
    formatSessionToken: (sessionId) => sessionId,
    formatSessionDisplayName: (session) => session.name,
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    setCommandPreview: () => {},
    clearCommandSuggestions: () => {},
    clearError: () => {},
    resetSlashHistoryNavigationState: () => {},
    render: () => {}
  });

  await controller.submitCommand();

  assert.deepEqual(calls, [
    ["send", "s1", "pwd"],
    ["send", "s2", "pwd"],
    ["record", "s1", "pwd"],
    ["record", "s2", "pwd"],
    ["value", ""],
    ["feedback", "Sent to 2 sessions."]
  ]);
});

test("command-composer runtime controller guards risky sends until confirmed or cancelled", async () => {
  const calls = [];
  let value = "please fix the tests";
  const controller = createCommandComposerRuntimeController({
    getCommandValue: () => value,
    setCommandValue: (next) => {
      value = next;
      calls.push(["value", next]);
    },
    interpretComposerInput: () => ({ kind: "input", data: value }),
    getState: () => ({
      sessions: [{ id: "s1", name: "ops" }],
      activeSessionId: "s1"
    }),
    evaluateSendSafety: () => ({
      requiresConfirmation: true,
      summary: "Confirmation required before sending to [7] ops.",
      reasons: [{ label: "Input looks like natural-language text.", targets: ["[7] ops"] }]
    }),
    setCommandGuardState: (nextState) => calls.push(["guard", nextState.summary, nextState.reasons, nextState.preview]),
    clearCommandGuardState: ({ render } = {}) => calls.push(["clear-guard", render === true]),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    sendInputWithConfiguredTerminator: async (_sendFn, sessionId, payload) => calls.push(["send", sessionId, payload]),
    recordCommandSubmission: (sessionId, submission) => calls.push(["record", sessionId, submission.text]),
    clearCommandSuggestions: () => calls.push(["clear-suggestions"]),
    clearError: () => calls.push(["clear-error"]),
    resetSlashHistoryNavigationState: () => calls.push(["history-reset"]),
    render: () => calls.push(["render"])
  });

  await controller.submitCommand();
  assert.deepEqual(calls, [
    ["clear-guard", false],
    [
      "guard",
      "Confirmation required before sending to [7] ops.",
      "- Input looks like natural-language text. ([7] ops)",
      "please fix the tests"
    ],
    ["render"]
  ]);

  calls.length = 0;
  const confirmed = await controller.confirmPendingSend();
  assert.equal(confirmed, true);
  assert.deepEqual(calls, [
    ["send", "s1", "please fix the tests"],
    ["record", "s1", "please fix the tests"],
    ["clear-guard", false],
    ["value", ""],
    ["clear-suggestions"],
    ["clear-error"],
    ["history-reset"],
    ["render"]
  ]);

  value = "please fix the tests";
  await controller.submitCommand();
  calls.length = 0;
  assert.equal(controller.cancelPendingSend(), true);
  assert.deepEqual(calls, [
    ["clear-guard", true],
    ["feedback", "Command send cancelled."]
  ]);
});
