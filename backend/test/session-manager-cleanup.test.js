import test from "node:test";
import assert from "node:assert/strict";

import {
  clearExpectedExitReason,
  clearForegroundProcessRefreshTimer,
  clearLaunchPostStartInputTimer,
  clearPendingLaunchPostStartInput,
  clearRemoteReconnectStabilizeTimer,
  clearRemoteReconnectTimer,
  clearRemoteReconnectTimers,
  clearSessionActivityTimer,
  clearStartupTerminalQueryFallback
} from "../src/session-manager-cleanup.js";

function createSession() {
  return {
    activityTimer: { id: "activity" },
    launchPostStartInputTimer: { id: "launch" },
    foregroundProcessRefreshTimer: { id: "foreground" },
    remoteReconnectTimer: { id: "reconnect" },
    remoteReconnectStabilizeTimer: { id: "stabilize" },
    pendingLaunchPostStartInput: { input: "pwd\n" },
    pendingStartupTerminalQueryFallback: { remainingResponses: 2 },
    expectedExitReason: "SIGTERM",
    expectedExitReasonTimer: { id: "expected" }
  };
}

test("session manager cleanup helpers clear individual timers only when present", () => {
  const cleared = [];
  const clearTimeoutFn = (timer) => cleared.push(timer.id);
  const session = createSession();

  clearSessionActivityTimer(session, clearTimeoutFn);
  clearLaunchPostStartInputTimer(session, clearTimeoutFn);
  clearForegroundProcessRefreshTimer(session, clearTimeoutFn);
  clearRemoteReconnectTimer(session, clearTimeoutFn);
  clearRemoteReconnectStabilizeTimer(session, clearTimeoutFn);

  assert.deepEqual(cleared, ["activity", "launch", "foreground", "reconnect", "stabilize"]);
  assert.equal(session.activityTimer, null);
  assert.equal(session.launchPostStartInputTimer, null);
  assert.equal(session.foregroundProcessRefreshTimer, null);
  assert.equal(session.remoteReconnectTimer, null);
  assert.equal(session.remoteReconnectStabilizeTimer, null);

  clearSessionActivityTimer(session, clearTimeoutFn);
  clearRemoteReconnectTimer(session, clearTimeoutFn);
  assert.deepEqual(cleared, ["activity", "launch", "foreground", "reconnect", "stabilize"]);
});

test("session manager cleanup helpers clear composite pending and reconnect state deterministically", () => {
  const cleared = [];
  const clearTimeoutFn = (timer) => cleared.push(timer.id);
  const session = createSession();

  clearPendingLaunchPostStartInput(session, clearTimeoutFn);
  clearStartupTerminalQueryFallback(session);
  clearRemoteReconnectTimers(session, clearTimeoutFn);
  clearExpectedExitReason(session, clearTimeoutFn);

  assert.deepEqual(cleared, ["launch", "reconnect", "stabilize", "expected"]);
  assert.equal(session.pendingLaunchPostStartInput, null);
  assert.equal(session.pendingStartupTerminalQueryFallback, null);
  assert.equal(session.remoteReconnectTimer, null);
  assert.equal(session.remoteReconnectStabilizeTimer, null);
  assert.equal(session.expectedExitReason, "");
  assert.equal(session.expectedExitReasonTimer, null);

  clearPendingLaunchPostStartInput(null, clearTimeoutFn);
  clearStartupTerminalQueryFallback(null);
  clearExpectedExitReason(null, clearTimeoutFn);
});
