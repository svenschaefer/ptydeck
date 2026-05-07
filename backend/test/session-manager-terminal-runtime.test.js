import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerTerminalRuntime } from "../src/session-manager-terminal-runtime.js";

function createHarness(overrides = {}) {
  const sessions = overrides.sessions || new Map();
  const events = [];
  const scheduledForegroundRefreshes = [];
  const scheduledLaunchPostStartInputs = [];
  const timers = [];
  let traceCounter = 0;

  const runtime = createSessionManagerTerminalRuntime({
    sessions,
    getSessionOrThrow(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`missing session ${sessionId}`);
      }
      return session;
    },
    createTraceEnvelope(seed, overrides = {}) {
      const normalizedSeed = seed && typeof seed === "object" && !Array.isArray(seed) ? seed : {};
      const normalizedOverrides =
        overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
      traceCounter += 1;
      return {
        ...normalizedSeed,
        ...normalizedOverrides,
        traceId: `trace-${traceCounter}`
      };
    },
    normalizeTraceSeed(trace) {
      if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
        return null;
      }
      const normalized = Object.fromEntries(
        Object.entries(trace).filter(([, value]) => typeof value === "string" && value.trim())
      );
      return Object.keys(normalized).length ? normalized : null;
    },
    emit(eventName, payload) {
      events.push({ eventName, payload });
    },
    nowFn: overrides.nowFn || (() => 1000),
    setTimeoutFn(handler, delay) {
      timers.push({ handler, delay });
      return handler;
    },
    sessionActivityQuietMs: overrides.sessionActivityQuietMs || 25,
    foregroundProcessRefreshDelayMs: overrides.foregroundProcessRefreshDelayMs || 90,
    clearSessionActivityTimer(session) {
      session.activityTimer = null;
    },
    clearExpectedExitReason(session) {
      session.expectedExitReason = "";
      session.expectedExitReasonTimer = null;
      if (typeof overrides.onClearExpectedExitReason === "function") {
        overrides.onClearExpectedExitReason(session);
      }
    },
    scheduleLaunchPostStartInputDispatch(session, reason, delayMs = 0) {
      scheduledLaunchPostStartInputs.push({ sessionId: session.id, reason, delayMs });
    },
    buildReconnectUnavailableError: overrides.buildReconnectUnavailableError || (() => new Error("reconnect unavailable")),
    scheduleSessionForegroundProcessIdentityRefresh(session, options = {}) {
      scheduledForegroundRefreshes.push({ sessionId: session.id, options });
    }
  });

  return {
    events,
    runtime,
    scheduledForegroundRefreshes,
    scheduledLaunchPostStartInputs,
    sessions,
    timers
  };
}

test("session-manager terminal runtime updates traces and emits running lifecycle events deterministically", () => {
  const session = {
    id: "session-1",
    traceSeed: { correlationId: "corr-1", source: "rest" },
    meta: {
      id: "session-1",
      state: "starting",
      updatedAt: 10
    }
  };
  const { events, runtime, sessions } = createHarness({
    sessions: new Map([["session-1", session]]),
    nowFn: () => 55
  });

  assert.deepEqual(
    runtime.updateSessionTraceSeed(session, { requestId: "req-1" }, { sessionId: "session-1", source: "rest" }),
    {
      correlationId: "corr-1",
      source: "rest",
      requestId: "req-1",
      sessionId: "session-1"
    }
  );

  const updateTrace = runtime.emitSessionUpdated(session, {
    updatedAt: 42,
    trace: { source: "messaging:telegram" }
  });
  assert.equal(updateTrace.traceId, "trace-1");
  assert.equal(session.meta.updatedAt, 42);

  const runningModel = runtime.transitionToRunning(session);
  assert.equal(runningModel.state, "running");
  assert.equal(runningModel.startedAt, 55);
  assert.equal(sessions.get("session-1").meta.state, "running");

  assert.deepEqual(
    events.map((entry) => entry.eventName),
    ["session.updated", "session.started", "session.updated"]
  );
});

test("session-manager terminal runtime completes activity timers only for retained sessions and schedules post-start fallback dispatch", () => {
  const session = {
    id: "session-1",
    traceSeed: { source: "pty" },
    pendingLaunchPostStartInput: { observedPtyData: true },
    meta: {
      id: "session-1",
      activityState: "inactive",
      activityUpdatedAt: 0,
      activityCompletedAt: null,
      updatedAt: 0
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]]),
    nowFn: () => 77,
    sessionActivityQuietMs: 30
  });

  harness.runtime.emitSessionActivityStarted(session, 50);
  harness.runtime.scheduleSessionActivityCompletion(session);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 30);
  harness.timers[0].handler();

  assert.equal(session.meta.activityState, "inactive");
  assert.equal(session.meta.activityCompletedAt, 77);
  assert.deepEqual(harness.scheduledLaunchPostStartInputs, [
    { sessionId: "session-1", reason: "activity_completed", delayMs: 0 }
  ]);

  const staleSession = {
    id: "session-stale",
    traceSeed: { source: "pty" },
    meta: {
      id: "session-stale",
      activityState: "active",
      activityUpdatedAt: 1,
      activityCompletedAt: null,
      updatedAt: 1
    }
  };
  const staleHarness = createHarness({
    sessions: new Map(),
    nowFn: () => 90
  });
  staleHarness.runtime.scheduleSessionActivityCompletion(staleSession);
  staleHarness.timers[0].handler();
  assert.equal(staleSession.meta.activityCompletedAt, null);
});

test("session-manager terminal runtime drives input, resize, signal, and async write events deterministically", () => {
  const ptyProcess = {
    writes: [],
    resizeCalls: [],
    killSignals: [],
    write(data) {
      this.writes.push(data);
    },
    resize(cols, rows) {
      this.resizeCalls.push({ cols, rows });
    },
    kill(signal) {
      this.killSignals.push(signal);
    }
  };
  let clearExpectedExitReasonCalls = 0;
  const session = {
    id: "session-1",
    ptyProcess,
    traceSeed: { source: "rest" },
    meta: {
      id: "session-1",
      quickSendUsage: [],
      updatedAt: 0
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]]),
    nowFn: () => 120,
    onClearExpectedExitReason: () => {
      clearExpectedExitReasonCalls += 1;
    }
  });

  harness.runtime.sendInput("session-1", "pwd\r", {
    writeKind: "submit_cr",
    trace: { source: "messaging:telegram", requestId: "req-1" },
    customCommandUsage: { lookupKey: "custom:pwd", label: "pwd", content: "pwd" }
  });
  harness.runtime.resize("session-1", 132, 40, {
    trace: { source: "resize" }
  });
  harness.runtime.signal("session-1", "SIGINT", {
    trace: { source: "rest" }
  });
  harness.timers[harness.timers.length - 1].handler();
  harness.runtime.handleAsyncPtyWriteEvent(session, {
    phase: "queued",
    writeKind: "submit_cr",
    bytes: 4,
    retryCount: 1,
    trace: { source: "pty-async" }
  });

  assert.deepEqual(ptyProcess.writes, ["pwd\r"]);
  assert.deepEqual(ptyProcess.resizeCalls, [{ cols: 132, rows: 40 }]);
  assert.deepEqual(ptyProcess.killSignals, ["SIGINT"]);
  assert.equal(clearExpectedExitReasonCalls, 1);
  assert.equal(session.expectedExitReason, "");
  assert.equal(session.meta.quickSendUsage.length, 1);
  assert.equal(session.lastActivityAt, 120);
  assert.equal(harness.scheduledForegroundRefreshes.length, 1);
  assert.deepEqual(
    harness.events
      .filter((entry) => entry.eventName === "session.input.write")
      .map((entry) => ({
        phase: entry.payload.phase,
        writeKind: entry.payload.writeKind,
        source: entry.payload.trace.source
      })),
    [
      { phase: "attempt", writeKind: "submit_cr", source: "messaging:telegram" },
      { phase: "ok", writeKind: "submit_cr", source: "messaging:telegram" },
      { phase: "queued", writeKind: "submit_cr", source: "pty-async" }
    ]
  );
});

test("session-manager terminal runtime fails closed for unavailable or broken PTY transports", () => {
  const failingSession = {
    id: "session-1",
    ptyProcess: {
      write() {
        throw new Error("write failed");
      }
    },
    traceSeed: { source: "rest" },
    meta: {
      id: "session-1",
      quickSendUsage: [],
      updatedAt: 0
    }
  };
  const unavailableSession = {
    id: "session-2",
    ptyProcess: null,
    traceSeed: { source: "rest" },
    meta: {
      id: "session-2",
      updatedAt: 0
    }
  };
  const harness = createHarness({
    sessions: new Map([
      ["session-1", failingSession],
      ["session-2", unavailableSession]
    ])
  });

  assert.throws(() => harness.runtime.sendInput("session-1", "pwd\r"), /write failed/);
  assert.throws(() => harness.runtime.sendInput("session-2", "pwd\r"), /reconnect unavailable/);
  assert.throws(() => harness.runtime.resize("session-2", 120, 40), /reconnect unavailable/);
  assert.throws(() => harness.runtime.signal("session-2", "SIGTERM"), /reconnect unavailable/);

  assert.deepEqual(
    harness.events
      .filter((entry) => entry.eventName === "session.input.write")
      .map((entry) => entry.payload.phase),
    ["attempt", "failed"]
  );
});

test("session-manager terminal runtime covers retained guard rails and optional async-write metadata deterministically", () => {
  const session = {
    id: "session-1",
    ptyProcess: {
      kill() {}
    },
    traceSeed: { source: "rest" },
    meta: {
      id: "session-1",
      state: "running",
      updatedAt: 0,
      activityState: "inactive"
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]])
  });

  assert.equal(harness.runtime.updateSessionTraceSeed(null, { traceId: "ignored" }), null);
  assert.equal(harness.runtime.emitSessionUpdated(null), null);
  harness.runtime.emitSessionActivityStarted(null, 10);
  harness.runtime.emitSessionActivityCompleted(null, 10);
  harness.runtime.emitSessionActivityCompleted(session, 10);
  harness.runtime.scheduleSessionActivityCompletion(null);
  harness.runtime.handleAsyncPtyWriteEvent(null, { phase: "queued" });
  assert.equal(harness.runtime.transitionToRunning(null), null);
  assert.equal(harness.runtime.transitionToRunning(session), session.meta);

  harness.runtime.handleAsyncPtyWriteEvent(session, {
    error: "write failed",
    code: "EIO",
    failureStage: "queue",
    queueDroppedCount: 2,
    droppedByQueueFailure: true,
    retryable: true
  });
  harness.runtime.signal("session-1", "", {
    trace: { source: "rest" }
  });

  const asyncWriteEvent = harness.events.find((entry) => entry.eventName === "session.input.write");
  assert.deepEqual(
    {
      phase: asyncWriteEvent.payload.phase,
      writeKind: asyncWriteEvent.payload.writeKind,
      code: asyncWriteEvent.payload.code,
      failureStage: asyncWriteEvent.payload.failureStage,
      queueDroppedCount: asyncWriteEvent.payload.queueDroppedCount,
      droppedByQueueFailure: asyncWriteEvent.payload.droppedByQueueFailure,
      retryable: asyncWriteEvent.payload.retryable
    },
    {
      phase: "failed",
      writeKind: "direct",
      code: "EIO",
      failureStage: "queue",
      queueDroppedCount: 2,
      droppedByQueueFailure: true,
      retryable: true
    }
  );
  assert.equal(session.expectedExitReason, "signal");
});
