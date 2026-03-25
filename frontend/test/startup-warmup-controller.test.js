import test from "node:test";
import assert from "node:assert/strict";

import { createStartupWarmupController } from "../src/public/startup-warmup-controller.js";

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const token = { fn, delay, cleared: false };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      if (token) {
        token.cleared = true;
      }
    }
  };
}

test("startup warmup controller waits through starting_sessions and then resolves ready", async () => {
  const windowRef = createFakeWindow();
  const states = [];
  const connectionStates = [];
  let clearCalls = 0;
  const payloads = [
    {
      status: "starting",
      phase: "starting_sessions",
      warmup: {
        enabled: true,
        activeSessionCount: 2,
        quietPeriodMs: 1000,
        quietMsRemaining: 1000
      }
    },
    {
      status: "ready",
      phase: "ready",
      warmup: {
        enabled: true,
        activeSessionCount: 0,
        quietPeriodMs: 1000,
        quietMsRemaining: 0
      }
    }
  ];

  const controller = createStartupWarmupController({
    windowRef,
    api: {
      async getReadyStatus() {
        return payloads.shift();
      }
    },
    pollIntervalMs: 25,
    setConnectionState: (value) => connectionStates.push(value),
    setStartupGateState: (value) => states.push(value),
    clearStartupGateState: () => {
      clearCalls += 1;
    }
  });

  const waitPromise = controller.waitForServerWarmup();
  await Promise.resolve();
  assert.equal(states.length, 1);
  assert.equal(states[0].message, "Server is starting sessions.");
  assert.match(states[0].detail, /restored sessions are still active/i);
  assert.equal(windowRef.timers.length, 1);
  assert.equal(windowRef.timers[0].delay, 25);

  await windowRef.timers[0].fn();
  const result = await waitPromise;

  assert.equal(result, "ready");
  assert.deepEqual(connectionStates, ["starting sessions", "connecting"]);
  assert.equal(clearCalls, 1);
});

test("startup warmup controller allows skipping an active wait loop", async () => {
  const windowRef = createFakeWindow();
  const states = [];
  let clearCalls = 0;
  let polls = 0;
  const controller = createStartupWarmupController({
    windowRef,
    api: {
      async getReadyStatus() {
        polls += 1;
        return {
          status: "starting",
          phase: "booting",
          warmup: {
            enabled: false,
            activeSessionCount: 0,
            quietPeriodMs: 0,
            quietMsRemaining: 0
          }
        };
      }
    },
    pollIntervalMs: 25,
    setConnectionState: () => {},
    setStartupGateState: (value) => states.push(value),
    clearStartupGateState: () => {
      clearCalls += 1;
    }
  });

  const waitPromise = controller.waitForServerWarmup();
  await Promise.resolve();
  assert.equal(states.length, 1);
  controller.skipWait();
  const result = await waitPromise;

  assert.equal(result, "skipped");
  assert.equal(polls, 1);
  assert.equal(clearCalls, 1);
});
