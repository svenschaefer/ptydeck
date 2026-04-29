import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeStartupWarmup } from "../src/runtime-startup-warmup.js";

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(token) {
      const id = typeof token === "object" && token ? token.id : token;
      timers.delete(id);
    },
    runNext() {
      const iterator = timers.entries().next();
      if (iterator.done) {
        return false;
      }
      const [id, entry] = iterator.value;
      timers.delete(id);
      entry.callback();
      return true;
    },
    setTimeout(callback, delay) {
      const token = { id: nextId++, delay };
      timers.set(token.id, { callback, delay });
      return token;
    },
    size() {
      return timers.size;
    }
  };
}

test("startup warmup marks the runtime ready immediately when no persisted sessions need gating", () => {
  const timers = createFakeTimers();
  let readyCount = 0;
  const gate = createRuntimeStartupWarmup({
    quietMs: 25,
    countActiveSessions: () => 0,
    onReady: () => {
      readyCount += 1;
    },
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout
  });

  gate.prepareForStart();
  gate.reconcile();

  assert.equal(readyCount, 1);
  assert.equal(gate.getState().ready, true);
  assert.equal(gate.getState().quietDeadlineAt, 0);
  assert.equal(timers.size(), 0);
});

test("startup warmup waits for a quiet window after the gate releases and re-checks active sessions before ready", () => {
  const timers = createFakeTimers();
  let nowMs = 1_000;
  let activeSessionCount = 1;
  let readyCount = 0;
  const debugEvents = [];
  const gate = createRuntimeStartupWarmup({
    quietMs: 50,
    countActiveSessions: () => activeSessionCount,
    onReady: () => {
      readyCount += 1;
    },
    onDebug: (event, details) => {
      debugEvents.push({ event, details });
    },
    now: () => nowMs,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout
  });

  gate.prepareForStart();
  gate.setEnabled(true);
  gate.reconcile();
  assert.equal(readyCount, 0);
  assert.equal(timers.size(), 0);
  assert.equal(debugEvents.length, 0);

  gate.releaseGate();
  gate.reconcile();
  assert.equal(readyCount, 0);
  assert.equal(timers.size(), 0);
  assert.deepEqual(debugEvents.pop(), {
    event: "runtime.startup_warmup.active",
    details: { activeSessionCount: 1 }
  });

  activeSessionCount = 0;
  gate.reconcile();
  assert.equal(timers.size(), 1);
  assert.equal(gate.getState().quietDeadlineAt, 1_050);
  assert.deepEqual(debugEvents.pop(), {
    event: "runtime.startup_warmup.quiet_wait",
    details: { quietMs: 50 }
  });

  activeSessionCount = 1;
  nowMs = 1_025;
  assert.equal(timers.runNext(), true);
  assert.equal(readyCount, 0);
  assert.equal(timers.size(), 0);
  assert.deepEqual(debugEvents.pop(), {
    event: "runtime.startup_warmup.active",
    details: { activeSessionCount: 1 }
  });

  activeSessionCount = 0;
  nowMs = 1_030;
  gate.reconcile();
  assert.equal(timers.size(), 1);
  nowMs = 1_080;
  assert.equal(timers.runNext(), true);
  assert.equal(readyCount, 1);
  assert.equal(gate.getState().ready, true);
  assert.equal(gate.getState().quietDeadlineAt, 0);
});

test("startup warmup abort clears a pending quiet timer and suppresses ready callbacks", () => {
  const timers = createFakeTimers();
  let readyCount = 0;
  const gate = createRuntimeStartupWarmup({
    quietMs: 10,
    countActiveSessions: () => 0,
    onReady: () => {
      readyCount += 1;
    },
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout
  });

  gate.prepareForStart();
  gate.setEnabled(true);
  gate.releaseGate();
  gate.reconcile();
  assert.equal(timers.size(), 1);

  gate.abort();
  assert.equal(timers.size(), 0);
  assert.equal(gate.getState().ready, false);
  assert.equal(readyCount, 0);
});
