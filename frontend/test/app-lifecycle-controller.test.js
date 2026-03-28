import test from "node:test";
import assert from "node:assert/strict";

import { createAppLifecycleController } from "../src/public/app-lifecycle-controller.js";

function createEventTarget() {
  return {
    listeners: new Map(),
    addEventListener(type, handler) {
      const next = this.listeners.get(type) || [];
      next.push(handler);
      this.listeners.set(type, next);
    },
    async dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        await handler({
          type,
          preventDefault() {},
          ...event
        });
      }
    }
  };
}

test("app lifecycle controller initializes runtime in warmup -> auth -> ws -> fallback order", async () => {
  const calls = [];
  let wsClient = null;
  const expectedClient = { close() {} };

  const controller = createAppLifecycleController({
    waitForStartupWarmup: async () => {
      calls.push("warmup");
      return "ready";
    },
    bootstrapDevAuthToken: async () => {
      calls.push("auth");
    },
    startWsRuntime: () => {
      calls.push("ws");
      return expectedClient;
    },
    setWsClient: (value) => {
      calls.push("set");
      wsClient = value;
    },
    scheduleBootstrapFallback: () => {
      calls.push("fallback");
    }
  });

  await controller.initializeRuntime();

  assert.deepEqual(calls, ["warmup", "auth", "ws", "set", "fallback"]);
  assert.equal(wsClient, expectedClient);
});

test("app lifecycle controller wires create-session flow and moves session into active deck when needed", async () => {
  const createBtn = createEventTarget();
  const debugEvents = [];
  const runtimeEvents = [];
  const errors = [];
  let clearCalls = 0;

  const controller = createAppLifecycleController({
    createBtn,
    api: {
      async createSession() {
        return {
          id: "s-1",
          deckId: "default"
        };
      },
      async moveSessionToDeck(deckId, sessionId) {
        assert.equal(deckId, "ops");
        assert.equal(sessionId, "s-1");
        return {
          id: "s-1",
          deckId: "ops"
        };
      }
    },
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    resolveSessionDeckId: (session) => session.deckId,
    applyRuntimeEvent: (event) => runtimeEvents.push(event),
    setError: (message) => errors.push(message),
    clearUiError: () => {
      clearCalls += 1;
    },
    debugLog: (event, payload) => debugEvents.push({ event, payload })
  });

  controller.bindUiEvents();
  await createBtn.dispatch("click");

  assert.deepEqual(runtimeEvents, [
    {
      type: "session.updated",
      session: {
        id: "s-1",
        deckId: "ops"
      }
    }
  ]);
  assert.equal(clearCalls, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    debugEvents.map((entry) => entry.event),
    ["sessions.create.start", "sessions.create.ok"]
  );
});

test("app lifecycle controller binds deck/send actions and window cleanup hooks", async () => {
  const listeners = new Map();
  const deckCreateBtn = createEventTarget();
  const startupWarmupSkipBtn = createEventTarget();
  const sendBtn = createEventTarget();
  const commandGuardSendOnceBtn = createEventTarget();
  const commandGuardCancelBtn = createEventTarget();
  const workflowStopBtn = createEventTarget();
  const workflowInterruptBtn = createEventTarget();
  const workflowKillBtn = createEventTarget();
  const errors = [];
  const feedback = [];
  const cleanup = [];
  let clearCalls = 0;
  let resizeCalls = 0;
  let sendCalls = 0;
  let confirmCalls = 0;
  let cancelCalls = 0;
  let stopCalls = 0;
  let interruptCalls = 0;
  let killCalls = 0;

  const controller = createAppLifecycleController({
    windowRef: {
      addEventListener(type, handler) {
        const next = listeners.get(type) || [];
        next.push(handler);
        listeners.set(type, next);
      }
    },
    deckCreateBtn,
    startupWarmupSkipBtn,
    sendBtn,
    commandGuardSendOnceBtn,
    commandGuardCancelBtn,
    workflowStopBtn,
    workflowInterruptBtn,
    workflowKillBtn,
    createDeckFlow: async () => {},
    submitCommand: async () => {
      sendCalls += 1;
    },
    confirmPendingCommandSend: async () => {
      confirmCalls += 1;
      return true;
    },
    cancelPendingCommandSend: () => {
      cancelCalls += 1;
    },
    stopWorkflow: () => {
      stopCalls += 1;
      return true;
    },
    interruptWorkflowSession: async () => {
      interruptCalls += 1;
      return "Interrupted workflow session [7] ops.";
    },
    killWorkflowSession: async () => {
      killCalls += 1;
      return "Killed workflow session [7] ops.";
    },
    skipStartupWarmupWait: () => cleanup.push("skip-warmup"),
    setError: (message) => errors.push(message),
    setCommandFeedback: (message) => feedback.push(message),
    clearUiError: () => {
      clearCalls += 1;
    },
    getErrorMessage: (error, fallback) => error?.message || fallback,
    scheduleGlobalResize: () => {
      resizeCalls += 1;
    },
    disposeAppRuntimeState: () => cleanup.push("app-runtime"),
    disposeStartupWarmup: () => cleanup.push("startup-warmup"),
    disposeStreamDebugTrace: () => cleanup.push("stream-debug"),
    closeWsClient: () => cleanup.push("ws"),
    disposeAuthBootstrapRuntime: () => cleanup.push("auth"),
    disposeSessionTerminalResize: () => cleanup.push("resize"),
    disposeTerminalSearch: () => cleanup.push("search"),
    disposeCommandComposerRuntime: () => cleanup.push("composer"),
    disposeCommandComposerAutocomplete: () => cleanup.push("autocomplete"),
    disposeWorkflowRuntime: () => cleanup.push("workflow"),
    disconnectTerminalObservers: () => cleanup.push("observers"),
    disposeTerminals: () => cleanup.push("terminals")
  });

  controller.bindUiEvents();
  controller.bindWindowEvents();

  await deckCreateBtn.dispatch("click");
  await startupWarmupSkipBtn.dispatch("click");
  await sendBtn.dispatch("click");
  await commandGuardSendOnceBtn.dispatch("click");
  await commandGuardCancelBtn.dispatch("click");
  await workflowStopBtn.dispatch("click");
  await workflowInterruptBtn.dispatch("click");
  await workflowKillBtn.dispatch("click");

  assert.equal(clearCalls, 4);
  assert.equal(sendCalls, 1);
  assert.equal(confirmCalls, 1);
  assert.equal(cancelCalls, 1);
  assert.equal(stopCalls, 1);
  assert.equal(interruptCalls, 1);
  assert.equal(killCalls, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(feedback, [
    "Workflow stop requested.",
    "Interrupted workflow session [7] ops.",
    "Killed workflow session [7] ops."
  ]);

  for (const handler of listeners.get("resize") || []) {
    handler({ type: "resize" });
  }
  assert.equal(resizeCalls, 1);

  for (const handler of listeners.get("beforeunload") || []) {
    handler({ type: "beforeunload" });
  }
  assert.deepEqual(cleanup, [
    "skip-warmup",
    "app-runtime",
    "startup-warmup",
    "stream-debug",
    "ws",
    "auth",
    "resize",
    "search",
    "composer",
    "autocomplete",
    "workflow",
    "observers",
    "terminals"
  ]);
});
