import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionEventAuthority } from "../src/runtime-session-event-authority.js";

function createHarness(overrides = {}) {
  const manager = overrides.manager || new EventEmitter();
  const observed = {
    activityStarted: [],
    idle: [],
    lifecycle: [],
    data: [],
    ensured: [],
    broadcasts: [],
    persistSoon: [],
    persistNow: [],
    warmup: [],
    debug: [],
    errors: []
  };
  const metrics = {
    sessionsCreatedTotal: 0,
    sessionsStartedTotal: 0,
    sessionsExitedTotal: 0
  };
  const authority = createRuntimeSessionEventAuthority({
    manager,
    messagingRuntime: {
      observeSessionActivityStarted: async (payload) => observed.activityStarted.push(payload),
      observeSessionIdle: async (payload) => observed.idle.push(payload),
      observeSessionData: async (payload) => observed.data.push(payload),
      observeSessionLifecycle: async (...args) => observed.lifecycle.push(args),
      ensureSessionTarget: async (session, trace) => {
        observed.ensured.push([session, trace]);
        if (typeof overrides.ensureSessionTarget === "function") {
          return overrides.ensureSessionTarget(session, trace);
        }
        return null;
      },
      ...(overrides.messagingRuntime || {})
    },
    startupWarmup: {
      reconcile: () => observed.warmup.push("reconcile"),
      ...(overrides.startupWarmup || {})
    },
    metrics,
    logDebug: (event, details, trace) => observed.debug.push([event, details, trace]),
    logError: (...args) => observed.errors.push(args),
    getApiSessionOrThrow: overrides.getApiSessionOrThrow || ((sessionId) => ({
      id: sessionId,
      deckId: "default",
      state: "running"
    })),
    toApiSession: overrides.toApiSession || ((session, explicitState) => ({
      ...session,
      deckId: session.deckId || "default",
      state: explicitState || session.state || "running",
      api: true
    })),
    broadcast: (payload, traceSeed) => observed.broadcasts.push([payload, traceSeed]),
    persistSoon: () => observed.persistSoon.push(true),
    persistNow: async (reason) => observed.persistNow.push(reason),
    normalizeTraceSeed: (trace) => ({
      traceId: trace?.traceId || "",
      correlationId: trace?.correlationId || ""
    }),
    ...overrides.dependencies
  });
  return {
    authority,
    manager,
    metrics,
    observed
  };
}

test("runtime session event authority persists and broadcasts completed activity updates", async () => {
  const harness = createHarness();

  await harness.authority.handleSessionActivityCompleted({
    sessionId: "session-1",
    activityCompletedAt: 55,
    trace: { traceId: "trace-complete", correlationId: "corr-complete" }
  });

  assert.deepEqual(harness.observed.persistNow, ["session.activity.completed"]);
  assert.deepEqual(harness.observed.warmup, ["reconcile"]);
  assert.deepEqual(harness.observed.idle, [
    {
      session: { id: "session-1", deckId: "default", state: "running" },
      trace: { traceId: "trace-complete", correlationId: "corr-complete" }
    }
  ]);
  assert.deepEqual(harness.observed.broadcasts, [
    [
      {
        type: "session.activity.completed",
        sessionId: "session-1",
        activityCompletedAt: 55,
        session: { id: "session-1", deckId: "default", state: "running" },
        trace: { traceId: "trace-complete", correlationId: "corr-complete" }
      },
      { traceId: "trace-complete", correlationId: "corr-complete" }
    ]
  ]);
});

test("runtime session event authority bridges created lifecycle events without dropping broadcasts on ensure failure", async () => {
  const harness = createHarness({
    ensureSessionTarget() {
      throw new Error("topic provisioning failed");
    }
  });

  await harness.authority.dispatchManagerSessionEvent("session.created", {
    session: {
      id: "session-7",
      deckId: "ops",
      state: "running",
      name: "deploy"
    },
    trace: { traceId: "trace-created", correlationId: "corr-created" }
  });

  assert.equal(harness.metrics.sessionsCreatedTotal, 1);
  assert.equal(harness.metrics.sessionsStartedTotal, 0);
  assert.equal(harness.metrics.sessionsExitedTotal, 0);
  assert.equal(harness.observed.lifecycle.length, 1);
  assert.deepEqual(harness.observed.lifecycle[0], [
    "session.created",
    { id: "session-7", deckId: "default", state: "running" },
    { traceId: "trace-created", correlationId: "corr-created" }
  ]);
  assert.deepEqual(harness.observed.ensured, [
    [
      { id: "session-7", deckId: "default", state: "running" },
      { traceId: "trace-created", correlationId: "corr-created" }
    ]
  ]);
  assert.deepEqual(harness.observed.broadcasts, [
    [
      {
        type: "session.created",
        session: {
          id: "session-7",
          deckId: "ops",
          state: "running",
          name: "deploy",
          api: true
        },
        trace: { traceId: "trace-created", correlationId: "corr-created" }
      },
      { traceId: "trace-created", correlationId: "corr-created" }
    ]
  ]);
  assert.deepEqual(harness.observed.warmup, ["reconcile"]);
  assert.deepEqual(harness.observed.persistSoon, [true]);
  assert.equal(
    harness.observed.debug.some(
      ([event, details]) => event === "messaging.target.ensure_failed" && details.sessionId === "session-7"
    ),
    true
  );
});

test("runtime session event authority swallows missing session data after deletion", async () => {
  const harness = createHarness({
    getApiSessionOrThrow() {
      throw new ApiError(404, "SessionNotFound", "missing");
    }
  });

  const handled = await harness.authority.handleManagerSessionEvent("session.data", {
    sessionId: "session-missing",
    data: "orphan"
  });

  assert.equal(handled, false);
  assert.deepEqual(harness.observed.data, []);
  assert.deepEqual(harness.observed.broadcasts, []);
  assert.deepEqual(harness.observed.errors, []);
});

test("runtime session event authority registers manager listeners for the extracted bridge", async () => {
  const manager = new EventEmitter();
  const harness = createHarness({ manager });
  harness.authority.registerManagerEventHandlers();

  manager.emit("session.activity.started", {
    sessionId: "session-2",
    trace: { traceId: "trace-start", correlationId: "corr-start" }
  });
  manager.emit("session.input.write", {
    sessionId: "session-2",
    phase: "write_ok",
    writeKind: "body",
    bytes: 12,
    trace: { traceId: "trace-write", correlationId: "corr-write" }
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.observed.activityStarted, [
    {
      sessionId: "session-2",
      trace: { traceId: "trace-start", correlationId: "corr-start" }
    }
  ]);
  assert.deepEqual(harness.observed.persistSoon, [true]);
  assert.equal(
    harness.observed.debug.some(([event, details]) => event === "session.input.write" && details.writeKind === "body"),
    true
  );
});
