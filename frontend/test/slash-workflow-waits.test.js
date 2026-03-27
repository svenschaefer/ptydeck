import test from "node:test";
import assert from "node:assert/strict";
import {
  createSlashWorkflowWaitAbortError,
  createSlashWorkflowWaitStepRunner,
  createSlashWorkflowWaitTimeoutError,
  waitDelay,
  waitIdle,
  waitUntilMatch
} from "../src/public/slash-workflow-waits.js";

function createManualTimeouts() {
  let nextId = 1;
  const scheduled = new Map();
  return {
    setTimeoutFn(callback, delay) {
      const id = nextId;
      nextId += 1;
      scheduled.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      scheduled.delete(id);
    },
    fireNext() {
      const first = scheduled.keys().next();
      if (first.done) {
        throw new Error("No scheduled timeout.");
      }
      const id = first.value;
      const entry = scheduled.get(id);
      scheduled.delete(id);
      entry.callback();
      return entry.delay;
    },
    get size() {
      return scheduled.size;
    }
  };
}

test("waitDelay resolves after the requested timeout and supports abort", async () => {
  const timers = createManualTimeouts();
  const controller = new AbortController();
  const pending = waitDelay(50, {
    signal: controller.signal,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn
  });
  assert.equal(timers.size, 1);
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "workflow.aborted");

  const timers2 = createManualTimeouts();
  const resolved = waitDelay(25, {
    setTimeoutFn: timers2.setTimeoutFn,
    clearTimeoutFn: timers2.clearTimeoutFn
  });
  assert.equal(timers2.fireNext(), 25);
  await resolved;
});

test("waitIdle resets on activity and resolves after one quiet window", async () => {
  const timers = createManualTimeouts();
  const listeners = [];
  const pending = waitIdle(100, {
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    subscribeActivity(listener) {
      listeners.push(listener);
      return () => {};
    }
  });
  assert.equal(timers.size, 1);
  listeners[0]();
  assert.equal(timers.size, 1);
  assert.equal(timers.fireNext(), 100);
  await pending;
});

test("waitUntilMatch resolves on pattern match, times out, and aborts", async () => {
  const timers = createManualTimeouts();
  const listeners = [];
  const matched = waitUntilMatch({ source: "done", flags: "i" }, 200, {
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    subscribe(listener) {
      listeners.push(listener);
      return () => {};
    }
  });
  listeners[0]("working");
  listeners[0]("Done now");
  const result = await matched;
  assert.deepEqual(result.match, ["Done"]);

  const timers2 = createManualTimeouts();
  const timeoutPending = waitUntilMatch(/done/i, 30, {
    setTimeoutFn: timers2.setTimeoutFn,
    clearTimeoutFn: timers2.clearTimeoutFn,
    subscribe() {
      return () => {};
    }
  });
  timers2.fireNext();
  await assert.rejects(timeoutPending, (error) => error.code === "workflow.timeout");

  const timers3 = createManualTimeouts();
  const controller = new AbortController();
  const abortPending = waitUntilMatch(/done/i, 30, {
    signal: controller.signal,
    setTimeoutFn: timers3.setTimeoutFn,
    clearTimeoutFn: timers3.clearTimeoutFn,
    subscribe() {
      return () => {};
    }
  });
  controller.abort();
  await assert.rejects(abortPending, (error) => error.code === "workflow.aborted");
});

test("wait step runner maps parsed wait steps to the correct primitive", async () => {
  const calls = [];
  const runner = createSlashWorkflowWaitStepRunner({
    waitDelay(durationMs) {
      calls.push(["delay", durationMs]);
      return Promise.resolve("delay");
    },
    waitIdle(durationMs) {
      calls.push(["idle", durationMs]);
      return Promise.resolve("idle");
    },
    waitUntilMatch(pattern, timeoutMs) {
      calls.push(["until", pattern.source, pattern.flags, timeoutMs]);
      return Promise.resolve("until");
    },
    resolveSourceSubscription() {
      return () => () => {};
    },
    subscribeActivity() {
      return () => {};
    }
  });
  assert.equal(
    await runner.execute({ type: "wait", mode: "delay", duration: { ms: 10 } }),
    "delay"
  );
  assert.equal(
    await runner.execute({ type: "wait", mode: "idle", duration: { ms: 20 } }),
    "idle"
  );
  assert.equal(
    await runner.execute({ type: "wait", mode: "until", pattern: { source: "done", flags: "i" }, timeout: { ms: 30 }, source: "line" }),
    "until"
  );
  assert.deepEqual(calls, [
    ["delay", 10],
    ["idle", 20],
    ["until", "done", "i", 30]
  ]);
});

test("workflow wait helper factories create deterministic error codes", () => {
  assert.equal(createSlashWorkflowWaitAbortError().code, "workflow.aborted");
  assert.equal(createSlashWorkflowWaitTimeoutError().code, "workflow.timeout");
});
