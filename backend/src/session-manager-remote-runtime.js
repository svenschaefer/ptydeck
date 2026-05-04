export const REMOTE_CONNECTIVITY_CONNECTED = "connected";
export const REMOTE_CONNECTIVITY_DEGRADED = "degraded";
export const REMOTE_CONNECTIVITY_OFFLINE = "offline";

export const DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS = 3;
export const DEFAULT_REMOTE_RECONNECT_DELAY_MS = 1500;

function normalizeReconnectMaxAttempts(value) {
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS;
}

function normalizeReconnectDelayMs(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_REMOTE_RECONNECT_DELAY_MS;
}

function normalizeReconnectPolicy(policy, { reconnectMaxAttempts, reconnectDelayMs } = {}) {
  const snapshot = policy && typeof policy === "object" && !Array.isArray(policy) ? policy : {};
  return {
    maxAttempts: normalizeReconnectMaxAttempts(
      Object.prototype.hasOwnProperty.call(snapshot, "maxAttempts") ? snapshot.maxAttempts : reconnectMaxAttempts
    ),
    delayMs: normalizeReconnectDelayMs(
      Object.prototype.hasOwnProperty.call(snapshot, "delayMs") ? snapshot.delayMs : reconnectDelayMs
    )
  };
}

function normalizeConnectivityState(value) {
  if (value === REMOTE_CONNECTIVITY_DEGRADED || value === REMOTE_CONNECTIVITY_OFFLINE) {
    return value;
  }
  return REMOTE_CONNECTIVITY_CONNECTED;
}

function normalizeTimestamp(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeExitCode(value) {
  return Number.isInteger(value) || value === null ? value : null;
}

function normalizeRemoteRuntime(remoteRuntime, policyOptions = {}) {
  const snapshot = remoteRuntime && typeof remoteRuntime === "object" && !Array.isArray(remoteRuntime) ? remoteRuntime : {};
  return {
    connectivityState: normalizeConnectivityState(snapshot.connectivityState),
    reconnectPolicy: normalizeReconnectPolicy(snapshot.reconnectPolicy, policyOptions),
    reconnectAttempts: Number.isInteger(snapshot.reconnectAttempts) && snapshot.reconnectAttempts >= 0 ? snapshot.reconnectAttempts : 0,
    disconnectedAt: normalizeTimestamp(snapshot.disconnectedAt),
    nextReconnectAt: normalizeTimestamp(snapshot.nextReconnectAt),
    lastReconnectAt: normalizeTimestamp(snapshot.lastReconnectAt),
    lastDisconnectReason: typeof snapshot.lastDisconnectReason === "string" ? snapshot.lastDisconnectReason : "",
    lastExitCode: normalizeExitCode(snapshot.lastExitCode),
    lastExitSignal: typeof snapshot.lastExitSignal === "string" ? snapshot.lastExitSignal : ""
  };
}

export function buildRemoteRuntimeMeta({ reconnectMaxAttempts, reconnectDelayMs } = {}) {
  return normalizeRemoteRuntime(null, { reconnectMaxAttempts, reconnectDelayMs });
}

export function buildReconnectUnavailableErrorDetails({ sessionId, connectivityState } = {}) {
  const normalizedSessionId = typeof sessionId === "string" && sessionId ? sessionId : "";
  if (connectivityState === REMOTE_CONNECTIVITY_DEGRADED) {
    return {
      errorCode: "RemoteSessionDegraded",
      message: `Remote SSH session '${normalizedSessionId}' is reconnecting. Wait for recovery or restart the session explicitly.`
    };
  }
  return {
    errorCode: "RemoteSessionOffline",
    message: `Remote SSH session '${normalizedSessionId}' is offline. Restart the session to retry immediately.`
  };
}

export function buildRemoteRuntimeConnectedState(remoteRuntime, timestamp, policyOptions = {}) {
  const nextState = normalizeRemoteRuntime(remoteRuntime, policyOptions);
  nextState.connectivityState = REMOTE_CONNECTIVITY_CONNECTED;
  nextState.reconnectAttempts = 0;
  nextState.disconnectedAt = null;
  nextState.nextReconnectAt = null;
  nextState.lastReconnectAt = normalizeTimestamp(timestamp);
  return nextState;
}

export function buildRemoteRuntimeUnavailableState(remoteRuntime, connectivityState, timestamp, details = {}, policyOptions = {}) {
  const nextState = normalizeRemoteRuntime(remoteRuntime, policyOptions);
  nextState.connectivityState =
    connectivityState === REMOTE_CONNECTIVITY_DEGRADED ? REMOTE_CONNECTIVITY_DEGRADED : REMOTE_CONNECTIVITY_OFFLINE;
  nextState.disconnectedAt = normalizeTimestamp(timestamp);
  nextState.nextReconnectAt = normalizeTimestamp(details.nextReconnectAt);
  nextState.lastDisconnectReason = typeof details.reason === "string" && details.reason ? details.reason : "";
  nextState.lastExitCode = normalizeExitCode(details.exitCode);
  nextState.lastExitSignal = typeof details.exitSignal === "string" ? details.exitSignal : "";
  return nextState;
}

export function planRemoteReconnectSchedule(remoteRuntime, { timestamp, reason, exitCode, exitSignal, ...policyOptions } = {}) {
  const currentState = normalizeRemoteRuntime(remoteRuntime, policyOptions);
  const policy = currentState.reconnectPolicy;
  if (policy.maxAttempts <= 0 || currentState.reconnectAttempts >= policy.maxAttempts) {
    return {
      shouldSchedule: false,
      delayMs: null,
      remoteRuntime: buildRemoteRuntimeUnavailableState(
        currentState,
        REMOTE_CONNECTIVITY_OFFLINE,
        timestamp,
        { reason, exitCode, exitSignal },
        policyOptions
      )
    };
  }
  const nextReconnectAt = normalizeTimestamp(timestamp) + policy.delayMs;
  return {
    shouldSchedule: true,
    delayMs: policy.delayMs,
    remoteRuntime: buildRemoteRuntimeUnavailableState(
      currentState,
      REMOTE_CONNECTIVITY_DEGRADED,
      timestamp,
      { reason, exitCode, exitSignal, nextReconnectAt },
      policyOptions
    )
  };
}

export function buildRemoteReconnectAttemptState(remoteRuntime, { timestamp, reason, ...policyOptions } = {}) {
  const nextState = normalizeRemoteRuntime(remoteRuntime, policyOptions);
  nextState.reconnectAttempts += 1;
  nextState.nextReconnectAt = null;
  nextState.lastDisconnectReason = typeof reason === "string" && reason ? reason : "";
  nextState.lastReconnectAt = normalizeTimestamp(nextState.lastReconnectAt);
  nextState.disconnectedAt = normalizeTimestamp(nextState.disconnectedAt) ?? normalizeTimestamp(timestamp);
  return nextState;
}

export function planRemoteReconnectFailure(remoteRuntime, { timestamp, reason, exitCode, exitSignal, ...policyOptions } = {}) {
  const currentState = normalizeRemoteRuntime(remoteRuntime, policyOptions);
  const policy = currentState.reconnectPolicy;
  if (currentState.reconnectAttempts >= policy.maxAttempts) {
    return {
      shouldSchedule: false,
      delayMs: null,
      remoteRuntime: buildRemoteRuntimeUnavailableState(
        currentState,
        REMOTE_CONNECTIVITY_OFFLINE,
        timestamp,
        { reason, exitCode, exitSignal },
        policyOptions
      )
    };
  }
  const nextReconnectAt = normalizeTimestamp(timestamp) + policy.delayMs;
  return {
    shouldSchedule: true,
    delayMs: policy.delayMs,
    remoteRuntime: buildRemoteRuntimeUnavailableState(
      currentState,
      REMOTE_CONNECTIVITY_DEGRADED,
      timestamp,
      { reason, exitCode, exitSignal, nextReconnectAt },
      policyOptions
    )
  };
}
