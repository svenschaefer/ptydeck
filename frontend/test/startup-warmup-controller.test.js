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

test("startup warmup controller treats missing ready-status support as immediately ready", async () => {
  const connectionStates = [];
  let clearCalls = 0;
  const debugEvents = [];
  const controller = createStartupWarmupController({
    api: {},
    setConnectionState: (value) => connectionStates.push(value),
    clearStartupGateState: () => {
      clearCalls += 1;
    },
    debugLog: (event) => debugEvents.push(event)
  });

  const result = await controller.waitForServerWarmup();

  assert.equal(result, "ready");
  assert.deepEqual(connectionStates, ["connecting"]);
  assert.equal(clearCalls, 1);
  assert.deepEqual(debugEvents, ["startup.warmup.unavailable"]);
});

test("startup warmup controller dedupes concurrent waiters and recovers from poll errors", async () => {
  const windowRef = createFakeWindow();
  const states = [];
  const connectionStates = [];
  const debugEvents = [];
  let polls = 0;
  const controller = createStartupWarmupController({
    windowRef,
    api: {
      async getReadyStatus() {
        polls += 1;
        if (polls === 1) {
          throw new Error("not ready");
        }
        return {
          status: "ready",
          phase: "ready",
          warmup: {
            enabled: true,
            gateReleased: true,
            activeSessionCount: 0,
            quietPeriodMs: 0,
            quietMsRemaining: 0
          }
        };
      }
    },
    pollIntervalMs: 25,
    setConnectionState: (value) => connectionStates.push(value),
    setStartupGateState: (value) => states.push(value),
    clearStartupGateState: () => {},
    debugLog: (event) => debugEvents.push(event)
  });

  const waitPromise = controller.waitForServerWarmup();
  const secondWaitPromise = controller.waitForServerWarmup();

  await Promise.resolve();
  assert.equal(polls, 1);
  assert.equal(states.length, 1);
  assert.equal(states[0].phase, "booting");
  assert.deepEqual(connectionStates, ["starting"]);
  assert.ok(debugEvents.includes("startup.warmup.poll_error"));
  assert.equal(windowRef.timers.length, 1);

  await windowRef.timers[0].fn();
  const [result, secondResult] = await Promise.all([waitPromise, secondWaitPromise]);

  assert.equal(result, "ready");
  assert.equal(secondResult, "ready");
  assert.equal(polls, 2);
  assert.equal(connectionStates.at(-1), "connecting");
  assert.ok(debugEvents.includes("startup.warmup.ready"));
});
