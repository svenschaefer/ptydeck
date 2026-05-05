import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeRecoveryComposition } from "../src/public/app-runtime-recovery-composition.js";

test("app runtime recovery composition delegates runtime-event recovery wiring and suppresses auto-repair failures", async () => {
  const calls = [];
  let capturedOptions = null;
  let repairCalls = 0;
  const runtimeEventController = { id: "runtime-events" };

  const composition = createAppRuntimeRecoveryComposition({
    createRuntimeEventController(options) {
      capturedOptions = options;
      return runtimeEventController;
    },
    setSessions(sessions) {
      calls.push(["set-sessions", sessions]);
    },
    upsertSession(session) {
      calls.push(["upsert-session", session]);
    },
    maybeAutoRepairOriginHandoffControl() {
      repairCalls += 1;
      if (repairCalls === 1) {
        return Promise.reject(new Error("handoff stale"));
      }
      return Promise.resolve({ repaired: true });
    }
  });

  assert.equal(composition.runtimeEventController, runtimeEventController);
  assert.equal(typeof capturedOptions.setSessions, "function");
  assert.equal(typeof capturedOptions.upsertSession, "function");

  const snapshotSessions = [{ id: "s-1" }];
  const updatedSession = { id: "s-2" };
  capturedOptions.setSessions(snapshotSessions);
  capturedOptions.upsertSession(updatedSession);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(repairCalls, 2);
  assert.deepEqual(calls, [
    ["set-sessions", snapshotSessions],
    ["upsert-session", updatedSession]
  ]);
});

test("app runtime recovery composition normalizes terminal input error tracing with a stable fallback message", () => {
  const calls = [];
  let capturedOptions = null;

  createAppRuntimeRecoveryComposition({
    createRuntimeEventController(options) {
      capturedOptions = options;
      return {};
    },
    traceDebugController: {
      record(eventType, payload) {
        calls.push(["trace", eventType, payload]);
      }
    },
    debugLog(eventType, payload) {
      calls.push(["debug", eventType, payload]);
    },
    getErrorMessage() {
      return "";
    }
  });

  const error = new Error("socket broke");
  error.name = "NetworkError";
  capturedOptions.reportTerminalInputError(" s-1 ", error, {
    source: "paste",
    suppressed: true
  });

  assert.deepEqual(calls, [
    [
      "trace",
      "terminal.input.error",
      {
        sessionId: "s-1",
        source: "paste",
        suppressed: true,
        name: "NetworkError",
        message: "Failed to send terminal input."
      }
    ],
    [
      "debug",
      "terminal.input.error",
      {
        sessionId: "s-1",
        source: "paste",
        suppressed: true,
        name: "NetworkError",
        message: "Failed to send terminal input."
      }
    ]
  ]);
});
