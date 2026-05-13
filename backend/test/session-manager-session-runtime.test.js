import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createSessionManagerSessionRuntime } from "../src/session-manager-session-runtime.js";

function createFakePty() {
  return {
    killed: false,
    killCalls: 0,
    kill() {
      this.killed = true;
      this.killCalls += 1;
    }
  };
}

function createHarness(overrides = {}) {
  let now = overrides.now ?? 1710000000000;
  const sessions = new Map();
  const attached = [];
  const armed = [];
  const started = [];
  const createdEvents = [];
  const sessionUpdates = [];
  const closedEvents = [];
  const traceUpdates = [];
  const runtime = createSessionManagerSessionRuntime({
    sessions,
    defaultShell: "bash",
    sessionMaxConcurrent: overrides.sessionMaxConcurrent ?? 0,
    sessionIdleTimeoutMs: overrides.sessionIdleTimeoutMs ?? 0,
    sessionMaxLifetimeMs: overrides.sessionMaxLifetimeMs ?? 0,
    remoteReconnectMaxAttempts: 3,
    remoteReconnectDelayMs: 1500,
    sessionReplayMemoryMaxChars: 8,
    nowFn: () => now,
    normalizeTraceSeed: (value) => (value && typeof value === "object" ? { ...value } : null),
    buildLaunchBundle: (input) => {
      const ptyProcess = createFakePty();
      return {
        ptyProcess,
        shellAdapter: {},
        launchSpec: {
          metaCwd: input.kind === "ssh" ? input.startCwd || "~" : input.startCwd || input.cwd || "/tmp",
          command: input.kind === "ssh" ? "ssh" : input.shell || "bash"
        }
      };
    },
    createInitialIdentityRuntime: () => ({
      appIdentityState: {},
      terminalSignalState: {},
      appIdentity: {
        title: "shell",
        terminalType: "shell"
      }
    }),
    createTraceEnvelope(seed, overridesInput = {}) {
      return {
        traceId: `trace-${overridesInput.sessionId || "unknown"}`,
        correlationId: `corr-${overridesInput.sessionId || "unknown"}`,
        ...(seed?.requestId ? { requestId: seed.requestId } : {}),
        ...(overridesInput.sessionId ? { sessionId: overridesInput.sessionId } : {}),
        ...(overridesInput.source ? { source: overridesInput.source } : {})
      };
    },
    updateSessionTraceSeed(session, trace, updateOverrides = {}) {
      traceUpdates.push({ sessionId: session.id, trace, overrides: updateOverrides });
      session.traceSeed = {
        ...(session.traceSeed || {}),
        ...(trace || {}),
        ...(updateOverrides || {})
      };
      return session.traceSeed;
    },
    transitionToRunning(session) {
      session.meta.state = "running";
      started.push(session.id);
    },
    attachPtyProcess(session, launchBundle) {
      session.ptyProcess = launchBundle.ptyProcess;
      attached.push({ sessionId: session.id, launchSpec: launchBundle.launchSpec });
    },
    armLaunchPostStartInput(session, launchSpec, options = {}) {
      armed.push({ sessionId: session.id, launchSpec, trace: options.trace || null });
    },
    emitSessionCreated(event) {
      createdEvents.push(event);
    },
    emitSessionUpdated(session, options) {
      sessionUpdates.push({ sessionId: session.id, state: session.meta.state, options });
    },
    emitSessionClosed(event) {
      closedEvents.push(event);
    },
    clearSessionActivityTimer(session) {
      session.activityTimer = null;
    },
    clearLaunchPostStartInputTimer(session) {
      session.launchPostStartInputTimer = null;
    },
    clearForegroundProcessRefreshTimer(session) {
      session.foregroundProcessRefreshTimer = null;
    },
    clearRemoteReconnectTimers(session) {
      session.remoteReconnectTimer = null;
      session.remoteReconnectStabilizeTimer = null;
    },
    clearExpectedExitReason(session) {
      session.expectedExitReason = "";
      session.expectedExitReasonTimer = null;
    }
  });

  return {
    runtime,
    sessions,
    attached,
    armed,
    started,
    createdEvents,
    sessionUpdates,
    closedEvents,
    traceUpdates,
    setNow(value) {
      now = value;
    }
  };
}

test("session-manager session runtime creates and restarts sessions deterministically", () => {
  const harness = createHarness();

  const created = harness.runtime.createSession({
    id: "session-1",
    cwd: "/tmp/work",
    shell: "bash",
    name: "ops-shell",
    note: "  restart marker  ",
    quickIdToken: " A7 ",
    quickSendUsage: [{ lookupKey: "cmd::deploy", count: 2, lastUsedAt: 1700000000000 }],
    trace: { requestId: "req-1" }
  });

  assert.equal(created.id, "session-1");
  assert.equal(created.quickIdToken, "A7");
  assert.equal(created.note, "restart marker");
  assert.equal(harness.sessions.has("session-1"), true);
  assert.equal(harness.attached.length, 1);
  assert.equal(harness.started.length, 1);
  assert.equal(harness.armed.length, 1);
  assert.equal(harness.createdEvents.length, 1);
  assert.equal(harness.createdEvents[0].trace.sessionId, "session-1");

  const firstPty = harness.sessions.get("session-1").ptyProcess;
  harness.setNow(1710000000500);
  const restarted = harness.runtime.restartSession("session-1", {
    trace: { requestId: "req-2", source: "rest" }
  });

  assert.equal(firstPty.killed, true);
  assert.equal(restarted.id, "session-1");
  assert.equal(restarted.name, "ops-shell");
  assert.equal(restarted.quickIdToken, "A7");
  assert.equal(restarted.note, "restart marker");
  assert.equal(harness.createdEvents.length, 2);
  assert.equal(harness.closedEvents.length, 1);
  assert.equal(harness.closedEvents[0].reason, "deleted");
  assert.equal(harness.sessions.get("session-1").ptyProcess.killed, false);
});

test("session-manager session runtime closes sessions with deterministic traces and kill behavior", () => {
  const harness = createHarness();
  harness.runtime.createSession({
    id: "session-close",
    cwd: "/tmp/work",
    shell: "bash",
    trace: { requestId: "req-close" }
  });

  const current = harness.sessions.get("session-close");
  current.meta.createdAt = 1710000000000;
  current.lastActivityAt = 1710000000000;

  harness.runtime.closeSessionWithReason("session-close", "deleted", {
    trace: { requestId: "req-delete", source: "rest" }
  });

  assert.equal(harness.sessions.has("session-close"), false);
  assert.equal(harness.closedEvents.length, 1);
  assert.equal(harness.closedEvents[0].sessionId, "session-close");
  assert.equal(harness.closedEvents[0].trace.sessionId, "session-close");
  assert.equal(harness.closedEvents[0].trace.source, "rest");
  assert.equal(current.ptyProcess, null);
});

test("session-manager session runtime enforces concurrency and closes idle and over-lifetime sessions", () => {
  const harness = createHarness({
    sessionMaxConcurrent: 1,
    sessionIdleTimeoutMs: 500,
    sessionMaxLifetimeMs: 300
  });

  const created = harness.runtime.createSession({
    id: "session-guardrail",
    cwd: "/tmp/work",
    shell: "bash"
  });
  const session = harness.sessions.get(created.id);
  session.lastActivityAt = 1000;
  session.meta.createdAt = 1200;

  assert.throws(() => harness.runtime.createSession({ id: "session-over-limit", cwd: "/tmp/next" }), /Maximum concurrent session limit/);

  harness.setNow(1499);
  harness.runtime.enforceGuardrails(1499);
  assert.equal(harness.sessions.has(created.id), true);

  harness.setNow(1500);
  harness.runtime.enforceGuardrails(1500);
  assert.equal(harness.sessions.has(created.id), false);
  assert.equal(harness.closedEvents.at(-1).reason, "idle-timeout");

  const second = harness.runtime.createSession({ id: "session-lifetime", cwd: "/tmp/life" });
  const secondSession = harness.sessions.get(second.id);
  secondSession.lastActivityAt = 5000;
  secondSession.meta.createdAt = 5000;

  harness.setNow(5300);
  harness.runtime.enforceGuardrails(5300);
  assert.equal(harness.sessions.has(second.id), false);
  assert.equal(harness.closedEvents.at(-1).reason, "max-lifetime");
});

test("session-manager session runtime stops and restarts sessions while preserving identity", () => {
  const harness = createHarness();

  harness.runtime.createSession({
    id: "session-stop",
    cwd: "/tmp/work",
    shell: "bash",
    name: "ops-shell",
    quickIdToken: "A7",
    trace: { requestId: "req-start" }
  });

  const firstRecord = harness.sessions.get("session-stop");
  const firstPty = firstRecord.ptyProcess;

  const stopped = harness.runtime.stopSession("session-stop", {
    trace: { requestId: "req-stop", source: "rest" }
  });

  assert.equal(firstPty.killed, true);
  assert.equal(stopped.id, "session-stop");
  assert.equal(stopped.state, "stopped");
  assert.equal(harness.sessions.get("session-stop").ptyProcess, null);
  assert.equal(harness.sessions.get("session-stop").meta.state, "stopped");
  assert.equal(harness.sessionUpdates.at(-1).state, "stopped");

  const restarted = harness.runtime.startSession("session-stop", {
    trace: { requestId: "req-restart", source: "rest" }
  });

  assert.equal(restarted.id, "session-stop");
  assert.equal(restarted.state, "running");
  assert.equal(harness.sessions.get("session-stop").meta.state, "running");
  assert.equal(harness.sessions.get("session-stop").ptyProcess.killed, false);
  assert.equal(harness.attached.length, 2);
  assert.equal(harness.started.length, 2);
});

test("session-manager session runtime marks restored stopped secret-backed ssh sessions as start-blocked", () => {
  const harness = createHarness();

  const stopped = harness.runtime.createSession({
    id: "session-secret-stop",
    kind: "ssh",
    shell: "ssh",
    cwd: "/tmp/work",
    startCwd: "/tmp/work",
    remoteConnection: { host: "example.internal", port: 22, username: "ops" },
    remoteAuth: { method: "password" },
    initialState: "stopped"
  });

  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.startBlockedReason, "remote-secret-unavailable");

  assert.throws(
    () => harness.runtime.startSession("session-secret-stop", {
      trace: { requestId: "req-secret-restart", source: "rest" }
    }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.error, "SessionStartSecretRequired");
      return true;
    }
  );
});
