import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerMutationRuntime } from "../src/session-manager-mutation-runtime.js";

function createHarness(overrides = {}) {
  const sessions = overrides.sessions || new Map();
  const applyCalls = [];
  const refreshCalls = [];
  const traceSeedCalls = [];
  const scheduledRefreshes = [];
  const appIdentityRuntime = {
    applySessionAppIdentity: (session, nextIdentity, options) => {
      applyCalls.push({ sessionId: session.id, nextIdentity, options });
      return { ...nextIdentity, applied: true };
    },
    reconcileSessionAppIdentity: (session, candidateUpdates, options) => ({
      sessionId: session.id,
      candidateUpdates,
      options
    }),
    refreshSessionAppIdentity: (session, options) => {
      refreshCalls.push({ sessionId: session.id, options });
      return { family: "shell", label: session.meta.name || session.meta.shell, updatedAt: options.updatedAt };
    },
    refreshSessionForegroundProcessIdentity: (session, options) => ({
      sessionId: session.id,
      refreshed: true,
      options
    }),
    observeSessionTerminalSignals: (session, chunk, options) => ({
      sessionId: session.id,
      chunk,
      options
    }),
    observeSessionOutputHeuristics: (session, output, options) => ({
      sessionId: session.id,
      output,
      options
    }),
    scheduleSessionForegroundProcessIdentityRefresh: (session, options) => {
      scheduledRefreshes.push({ sessionId: session.id, options });
      return true;
    },
    ...(overrides.appIdentityRuntime || {})
  };

  const runtime = createSessionManagerMutationRuntime({
    getSessionOrThrow(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`missing session ${sessionId}`);
      }
      return session;
    },
    nowFn: overrides.nowFn || (() => 1700000000000),
    defaultShell: overrides.defaultShell || "bash",
    remoteReconnectMaxAttempts: overrides.remoteReconnectMaxAttempts || 3,
    remoteReconnectDelayMs: overrides.remoteReconnectDelayMs || 1500,
    foregroundProcessRefreshDelayMs: overrides.foregroundProcessRefreshDelayMs || 90,
    clearRemoteReconnectTimers: overrides.clearRemoteReconnectTimers || (() => {}),
    clearExpectedExitReason: overrides.clearExpectedExitReason || (() => {}),
    updateSessionTraceSeed: (session, trace, options) => {
      traceSeedCalls.push({ sessionId: session.id, trace, options });
      return overrides.updateSessionTraceSeed?.(session, trace, options);
    },
    applySessionPatch: (session, patch, options) => {
      if (typeof overrides.applySessionPatch === "function") {
        return overrides.applySessionPatch(session, patch, options);
      }
      Object.assign(session.meta, patch);
      session.meta.updatedAt = 1700000000123;
      return { updatedAt: session.meta.updatedAt };
    },
    appIdentityRuntime
  });

  return {
    applyCalls,
    refreshCalls,
    runtime,
    scheduledRefreshes,
    traceSeedCalls
  };
}

test("session-manager mutation runtime updates session patches and refreshes app identity deterministically", () => {
  const session = {
    id: "session-1",
    meta: {
      id: "session-1",
      name: "shell",
      shell: "bash",
      appIdentity: { family: "shell", label: "bash" },
      updatedAt: 10
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]])
  });

  const updated = harness.runtime.updateSession("session-1", {
    name: "build",
    startCommand: "npm test"
  }, {
    trace: { source: "rest", requestId: "req-1" }
  });

  assert.equal(updated.name, "build");
  assert.deepEqual(harness.traceSeedCalls, [{
    sessionId: "session-1",
    trace: { source: "rest", requestId: "req-1" },
    options: { sessionId: "session-1", source: "rest" }
  }]);
  assert.deepEqual(harness.refreshCalls, [{
    sessionId: "session-1",
    options: { updatedAt: 1700000000123 }
  }]);
  assert.deepEqual(updated.appIdentity, {
    family: "shell",
    label: "build",
    updatedAt: 1700000000123
  });
});

test("session-manager mutation runtime renames sessions through the same update seam", () => {
  const session = {
    id: "session-1",
    meta: {
      id: "session-1",
      name: "shell",
      shell: "bash",
      updatedAt: 1
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]])
  });

  const updated = harness.runtime.rename("session-1", "ops-shell");
  assert.equal(updated.name, "ops-shell");
  assert.equal(harness.refreshCalls.length, 1);
});

test("session-manager mutation runtime delegates app-identity coordination and uses default foreground refresh delay", () => {
  const session = {
    id: "session-1",
    meta: {
      id: "session-1",
      name: "shell",
      shell: "bash",
      updatedAt: 1
    }
  };
  const harness = createHarness({
    sessions: new Map([["session-1", session]]),
    foregroundProcessRefreshDelayMs: 45
  });

  const applied = harness.runtime.setSessionAppIdentity("session-1", {
    family: "coding-agent",
    label: "codex"
  }, {
    trace: { source: "foreground-process" }
  });
  const reconciled = harness.runtime.reconcileSessionAppIdentity(session, { "explicit-hint": { family: "shell" } }, {
    metaChanged: true
  });
  const refreshedForeground = harness.runtime.refreshSessionForegroundProcessIdentity("session-1", {
    emitUpdatedEvent: true
  });
  const observedSignals = harness.runtime.observeSessionTerminalSignals(session, "chunk", {
    updatedAt: 12
  });
  const observedHeuristics = harness.runtime.observeSessionOutputHeuristics(session, "output", {
    updatedAt: 13
  });

  assert.deepEqual(applied, {
    family: "coding-agent",
    label: "codex",
    applied: true
  });
  assert.equal(reconciled.sessionId, "session-1");
  assert.equal(refreshedForeground.refreshed, true);
  assert.equal(observedSignals.chunk, "chunk");
  assert.equal(observedHeuristics.output, "output");

  harness.runtime.scheduleSessionForegroundProcessIdentityRefresh(session, {
    trace: { source: "pty" }
  });
  assert.deepEqual(harness.scheduledRefreshes, [{
    sessionId: "session-1",
    options: {
      delayMs: 45,
      trace: { source: "pty" }
    }
  }]);

  assert.deepEqual(harness.applyCalls, [{
    sessionId: "session-1",
    nextIdentity: { family: "coding-agent", label: "codex" },
    options: {
      emitUpdatedEvent: true,
      trace: { source: "foreground-process" },
      updatedAt: 1700000000000
    }
  }]);
});
