import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeLifecycle } from "../src/runtime-lifecycle.js";

function createHarness(overrides = {}) {
  const observed = {
    calls: [],
    debug: [],
    ensured: [],
    terminatedSockets: [],
    reconciled: [],
    deletedSessions: [],
    clearHeartbeat: 0,
    clearGuardrailTimer: 0,
    clearPersistTimer: 0,
    pruneClears: 0,
    savedSnapshots: [],
    closeIdleConnections: 0,
    closeAllConnections: 0,
    wsServerClose: 0,
    setPersistedReplayOutputs: []
  };

  const sessions = overrides.sessions || [
    { id: "session-1", state: "running" },
    { id: "session-2", state: "running" }
  ];
  const sockets = new Set([
    {
      closeReasonHint: null,
      terminate() {
        observed.terminatedSockets.push("socket-1");
      }
    },
    {
      closeReasonHint: null,
      terminate() {
        observed.terminatedSockets.push("socket-2");
      }
    }
  ]);

  const harness = createRuntimeLifecycle({
    accessTokenVerifier: {
      async prewarm() {
        observed.calls.push("accessTokenVerifier.prewarm");
      }
    },
    messagingRuntime: {
      prepareForRuntimeStart() {
        observed.calls.push("messagingRuntime.prepareForRuntimeStart");
      },
      async start() {
        observed.calls.push("messagingRuntime.start");
      },
      async stop() {
        observed.calls.push("messagingRuntime.stop");
      },
      async ensureSessionTarget(session, trace) {
        observed.ensured.push({ session, trace });
        if (typeof overrides.ensureSessionTarget === "function") {
          return overrides.ensureSessionTarget(session, trace);
        }
        return null;
      }
    },
    runtimeStartupReadiness: {
      prepareForStart() {
        observed.calls.push("runtimeStartupReadiness.prepareForStart");
      },
      async releaseGateAndAwaitReadiness() {
        observed.calls.push("runtimeStartupReadiness.releaseGateAndAwaitReadiness");
      },
      beginStop() {
        observed.calls.push("runtimeStartupReadiness.beginStop");
      },
      markStopped() {
        observed.calls.push("runtimeStartupReadiness.markStopped");
      }
    },
    runtimeStartupRestore: {
      async restorePersistedRuntimeState() {
        observed.calls.push("runtimeStartupRestore.restorePersistedRuntimeState");
        return { persistedReplayOutputs: ["persisted-output"] };
      }
    },
    setPersistedReplayOutputs(value) {
      observed.setPersistedReplayOutputs.push(value);
    },
    server: {
      listening: true,
      listen(_port, callback) {
        observed.calls.push("server.listen");
        callback();
      },
      close(callback) {
        observed.calls.push("server.close");
        callback();
      },
      closeIdleConnections() {
        observed.closeIdleConnections += 1;
      },
      closeAllConnections() {
        observed.closeAllConnections += 1;
      }
    },
    manager: {
      list() {
        observed.calls.push("manager.list");
        return sessions;
      },
      delete(sessionId) {
        observed.deletedSessions.push(sessionId);
        if (typeof overrides.deleteSession === "function") {
          overrides.deleteSession(sessionId);
        }
      }
    },
    toApiSession(session, explicitState) {
      return {
        id: session.id,
        state: explicitState || session.state,
        deckId: session.deckId || "default"
      };
    },
    logDebug(event, details, trace) {
      observed.debug.push({ event, details, trace });
    },
    config: {
      port: 18080,
      async onBeforeReady() {
        observed.calls.push("config.onBeforeReady");
      }
    },
    persistence: {
      async saveState(snapshot) {
        observed.savedSnapshots.push(snapshot);
      }
    },
    snapshotRuntimeState() {
      return {
        sessions: [{ id: "persisted-session" }],
        customCommands: [{ name: "deploy" }],
        decks: [{ id: "default" }]
      };
    },
    sockets,
    wsServer: {
      close() {
        observed.wsServerClose += 1;
      }
    },
    clearHeartbeat() {
      observed.clearHeartbeat += 1;
    },
    clearGuardrailTimer() {
      observed.clearGuardrailTimer += 1;
    },
    clearPersistTimer() {
      observed.clearPersistTimer += 1;
    },
    sessionControlAttachmentRegistry: {
      clearPruneTimer() {
        observed.pruneClears += 1;
      }
    },
    listSessionIdsForAuth() {
      return ["session-1", "session-2"];
    },
    reconcileSessionControllerForSession(sessionId) {
      observed.reconciled.push(sessionId);
    },
    ...overrides.dependencies
  });

  return {
    lifecycle: harness,
    observed,
    sockets
  };
}

test("runtime lifecycle start restores persisted state, starts transports, and keeps messaging-target failures fail-closed", async () => {
  const harness = createHarness({
    ensureSessionTarget(session) {
      if (session.id === "session-2") {
        throw new Error("topic setup failed");
      }
      return null;
    }
  });

  await harness.lifecycle.start();

  assert.deepEqual(harness.observed.calls, [
    "accessTokenVerifier.prewarm",
    "messagingRuntime.prepareForRuntimeStart",
    "runtimeStartupReadiness.prepareForStart",
    "runtimeStartupRestore.restorePersistedRuntimeState",
    "server.listen",
    "messagingRuntime.start",
    "manager.list",
    "config.onBeforeReady",
    "runtimeStartupReadiness.releaseGateAndAwaitReadiness"
  ]);
  assert.deepEqual(harness.observed.setPersistedReplayOutputs, [["persisted-output"]]);
  assert.deepEqual(harness.observed.ensured, [
    {
      session: { id: "session-1", state: "running", deckId: "default" },
      trace: { source: "runtime.start" }
    },
    {
      session: { id: "session-2", state: "running", deckId: "default" },
      trace: { source: "runtime.start" }
    }
  ]);
  assert.equal(
    harness.observed.debug.some(
      ({ event, details, trace }) =>
        event === "messaging.target.ensure_failed" &&
        details.sessionId === "session-2" &&
        trace?.source === "runtime.start"
    ),
    true
  );
});

test("runtime lifecycle stop clears timers, terminates sockets, persists state, and closes transports deterministically", async () => {
  const harness = createHarness({
    deleteSession(sessionId) {
      if (sessionId === "session-2") {
        throw new Error("delete failed");
      }
    }
  });

  await harness.lifecycle.stopInternal();

  assert.equal(harness.observed.clearHeartbeat, 1);
  assert.equal(harness.observed.clearGuardrailTimer, 1);
  assert.equal(harness.observed.clearPersistTimer, 1);
  assert.equal(harness.observed.pruneClears, 1);
  assert.deepEqual(harness.observed.reconciled, ["session-1", "session-2"]);
  assert.deepEqual(harness.observed.deletedSessions, ["session-1", "session-2"]);
  assert.deepEqual(harness.observed.savedSnapshots, [
    {
      sessions: [{ id: "persisted-session" }],
      customCommands: [{ name: "deploy" }],
      decks: [{ id: "default" }]
    }
  ]);
  assert.deepEqual(harness.observed.terminatedSockets, ["socket-1", "socket-2"]);
  assert.equal(harness.sockets.size, 0);
  assert.equal(harness.observed.wsServerClose, 1);
  assert.equal(harness.observed.closeIdleConnections, 1);
  assert.equal(harness.observed.closeAllConnections, 1);
  assert.equal(
    harness.observed.debug.some(
      ({ event, details }) =>
        event === "runtime.stop.start" &&
        details.sessionCount === 1 &&
        details.customCommandCount === 1 &&
        details.deckCount === 1 &&
        details.socketCount === 0
    ),
    true
  );
  assert.equal(
    harness.observed.debug.some(
      ({ event, details }) =>
        event === "runtime.stop.persisted" &&
        details.persistedSessionCount === 1 &&
        details.persistedCustomCommandCount === 1 &&
        details.persistedDeckCount === 1
    ),
    true
  );
  assert.deepEqual(harness.observed.calls, [
    "runtimeStartupReadiness.beginStop",
    "messagingRuntime.stop",
    "manager.list",
    "server.close",
    "runtimeStartupReadiness.markStopped"
  ]);
});
