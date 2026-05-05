export function clearSessionActivityTimer(session, clearTimeoutFn = () => {}) {
  if (!session?.activityTimer) {
    return;
  }
  clearTimeoutFn(session.activityTimer);
  session.activityTimer = null;
}

export function clearLaunchPostStartInputTimer(session, clearTimeoutFn = () => {}) {
  if (!session?.launchPostStartInputTimer) {
    return;
  }
  clearTimeoutFn(session.launchPostStartInputTimer);
  session.launchPostStartInputTimer = null;
}

export function clearForegroundProcessRefreshTimer(session, clearTimeoutFn = () => {}) {
  if (!session?.foregroundProcessRefreshTimer) {
    return;
  }
  clearTimeoutFn(session.foregroundProcessRefreshTimer);
  session.foregroundProcessRefreshTimer = null;
}

export function clearRemoteReconnectTimer(session, clearTimeoutFn = () => {}) {
  if (!session?.remoteReconnectTimer) {
    return;
  }
  clearTimeoutFn(session.remoteReconnectTimer);
  session.remoteReconnectTimer = null;
}

export function clearRemoteReconnectStabilizeTimer(session, clearTimeoutFn = () => {}) {
  if (!session?.remoteReconnectStabilizeTimer) {
    return;
  }
  clearTimeoutFn(session.remoteReconnectStabilizeTimer);
  session.remoteReconnectStabilizeTimer = null;
}

export function clearRemoteReconnectTimers(session, clearTimeoutFn = () => {}) {
  clearRemoteReconnectTimer(session, clearTimeoutFn);
  clearRemoteReconnectStabilizeTimer(session, clearTimeoutFn);
}

export function clearPendingLaunchPostStartInput(session, clearTimeoutFn = () => {}) {
  if (!session) {
    return;
  }
  clearLaunchPostStartInputTimer(session, clearTimeoutFn);
  session.pendingLaunchPostStartInput = null;
}

export function clearStartupTerminalQueryFallback(session) {
  if (!session) {
    return;
  }
  session.pendingStartupTerminalQueryFallback = null;
}

export function clearExpectedExitReason(session, clearTimeoutFn = () => {}) {
  if (!session) {
    return;
  }
  if (session.expectedExitReasonTimer) {
    clearTimeoutFn(session.expectedExitReasonTimer);
    session.expectedExitReasonTimer = null;
  }
  session.expectedExitReason = "";
}
