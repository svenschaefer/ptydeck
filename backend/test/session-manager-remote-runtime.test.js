import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReconnectUnavailableErrorDetails,
  buildRemoteReconnectAttemptState,
  buildRemoteRuntimeConnectedState,
  buildRemoteRuntimeMeta,
  buildRemoteRuntimeUnavailableState,
  planRemoteReconnectFailure,
  planRemoteReconnectSchedule
} from "../src/session-manager-remote-runtime.js";

test("remote runtime helpers normalize the persisted reconnect baseline deterministically", () => {
  const runtime = buildRemoteRuntimeMeta({
    reconnectMaxAttempts: -1,
    reconnectDelayMs: 0
  });

  assert.deepEqual(runtime, {
    connectivityState: "connected",
    reconnectPolicy: {
      maxAttempts: 3,
      delayMs: 1500
    },
    reconnectAttempts: 0,
    disconnectedAt: null,
    nextReconnectAt: null,
    lastReconnectAt: null,
    lastDisconnectReason: "",
    lastExitCode: null,
    lastExitSignal: ""
  });
});

test("remote runtime helpers build degraded reconnect schedules and preserve disconnect details", () => {
  const reconnectPlan = planRemoteReconnectSchedule(
    {
      reconnectPolicy: {
        maxAttempts: 4,
        delayMs: 250
      },
      reconnectAttempts: 1,
      lastReconnectAt: 1700000000000
    },
    {
      timestamp: 1700000001000,
      reason: "ssh-transport-exit",
      exitCode: 255,
      exitSignal: "SIGTERM"
    }
  );

  assert.equal(reconnectPlan.shouldSchedule, true);
  assert.equal(reconnectPlan.delayMs, 250);
  assert.deepEqual(reconnectPlan.remoteRuntime, {
    connectivityState: "degraded",
    reconnectPolicy: {
      maxAttempts: 4,
      delayMs: 250
    },
    reconnectAttempts: 1,
    disconnectedAt: 1700000001000,
    nextReconnectAt: 1700000001250,
    lastReconnectAt: 1700000000000,
    lastDisconnectReason: "ssh-transport-exit",
    lastExitCode: 255,
    lastExitSignal: "SIGTERM"
  });
});

test("remote runtime helpers fail closed when reconnects are disabled or exhausted", () => {
  const disabledPlan = planRemoteReconnectSchedule(
    {
      reconnectPolicy: {
        maxAttempts: 0,
        delayMs: 250
      },
      reconnectAttempts: 0
    },
    {
      timestamp: 1700000001000,
      reason: "ssh-transport-exit"
    }
  );

  assert.equal(disabledPlan.shouldSchedule, false);
  assert.equal(disabledPlan.delayMs, null);
  assert.equal(disabledPlan.remoteRuntime.connectivityState, "offline");
  assert.equal(disabledPlan.remoteRuntime.nextReconnectAt, null);
  assert.equal(disabledPlan.remoteRuntime.lastDisconnectReason, "ssh-transport-exit");

  const exhaustedFailure = planRemoteReconnectFailure(
    {
      reconnectPolicy: {
        maxAttempts: 2,
        delayMs: 250
      },
      reconnectAttempts: 2,
      connectivityState: "degraded"
    },
    {
      timestamp: 1700000002000,
      reason: "reconnect spawn failed"
    }
  );

  assert.equal(exhaustedFailure.shouldSchedule, false);
  assert.equal(exhaustedFailure.remoteRuntime.connectivityState, "offline");
  assert.equal(exhaustedFailure.remoteRuntime.disconnectedAt, 1700000002000);
  assert.equal(exhaustedFailure.remoteRuntime.lastDisconnectReason, "reconnect spawn failed");
});

test("remote runtime helpers advance reconnect attempts and distinguish degraded from offline errors", () => {
  const attempted = buildRemoteReconnectAttemptState(
    {
      reconnectPolicy: {
        maxAttempts: 3,
        delayMs: 250
      },
      reconnectAttempts: 1,
      nextReconnectAt: 1700000001250,
      disconnectedAt: 1700000001000,
      lastDisconnectReason: "ssh-transport-exit"
    },
    {
      timestamp: 1700000001500,
      reason: "reconnect spawn failed 2"
    }
  );

  assert.deepEqual(attempted, {
    connectivityState: "connected",
    reconnectPolicy: {
      maxAttempts: 3,
      delayMs: 250
    },
    reconnectAttempts: 2,
    disconnectedAt: 1700000001000,
    nextReconnectAt: null,
    lastReconnectAt: null,
    lastDisconnectReason: "reconnect spawn failed 2",
    lastExitCode: null,
    lastExitSignal: ""
  });

  assert.deepEqual(buildReconnectUnavailableErrorDetails({ sessionId: "session-1", connectivityState: "degraded" }), {
    errorCode: "RemoteSessionDegraded",
    message: "Remote SSH session 'session-1' is reconnecting. Wait for recovery or restart the session explicitly."
  });
  assert.deepEqual(buildReconnectUnavailableErrorDetails({ sessionId: "session-1", connectivityState: "offline" }), {
    errorCode: "RemoteSessionOffline",
    message: "Remote SSH session 'session-1' is offline. Restart the session to retry immediately."
  });
});

test("remote runtime helpers reconnect cleanly and preserve prior disconnect evidence until replacement", () => {
  const unavailable = buildRemoteRuntimeUnavailableState(
    buildRemoteRuntimeMeta({
      reconnectMaxAttempts: 5,
      reconnectDelayMs: 400
    }),
    "degraded",
    1700000001000,
    {
      reason: "ssh-transport-exit",
      nextReconnectAt: 1700000001400
    }
  );
  const reconnected = buildRemoteRuntimeConnectedState(unavailable, 1700000002000);

  assert.equal(reconnected.connectivityState, "connected");
  assert.equal(reconnected.reconnectAttempts, 0);
  assert.equal(reconnected.disconnectedAt, null);
  assert.equal(reconnected.nextReconnectAt, null);
  assert.equal(reconnected.lastReconnectAt, 1700000002000);
  assert.equal(reconnected.lastDisconnectReason, "ssh-transport-exit");
});
