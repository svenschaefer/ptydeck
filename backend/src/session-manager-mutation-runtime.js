import { applySessionPatch as applySessionPatchBase } from "./session-manager-lifecycle.js";

export function createSessionManagerMutationRuntime(dependencies = {}) {
  const {
    getSessionOrThrow = () => null,
    nowFn = Date.now,
    defaultShell = "bash",
    remoteReconnectMaxAttempts = 0,
    remoteReconnectDelayMs = 0,
    foregroundProcessRefreshDelayMs = 90,
    clearRemoteReconnectTimers = () => {},
    clearExpectedExitReason = () => {},
    updateSessionTraceSeed = () => {},
    applySessionPatch = applySessionPatchBase,
    appIdentityRuntime = {
      applySessionAppIdentity: () => null,
      reconcileSessionAppIdentity: () => null,
      refreshSessionAppIdentity: () => null,
      refreshSessionForegroundProcessIdentity: () => null,
      observeSessionTerminalSignals: () => null,
      observeSessionOutputHeuristics: () => null,
      scheduleSessionForegroundProcessIdentityRefresh: () => null
    }
  } = dependencies;

  function applySessionAppIdentity(session, nextIdentity, { emitUpdatedEvent = false, trace = null, updatedAt = nowFn() } = {}) {
    return appIdentityRuntime.applySessionAppIdentity(session, nextIdentity, {
      emitUpdatedEvent,
      trace,
      updatedAt
    });
  }

  function reconcileSessionAppIdentity(
    session,
    candidateUpdates,
    { emitUpdatedEvent = false, trace = null, updatedAt = nowFn(), metaChanged = false } = {}
  ) {
    return appIdentityRuntime.reconcileSessionAppIdentity(session, candidateUpdates, {
      emitUpdatedEvent,
      trace,
      updatedAt,
      metaChanged
    });
  }

  function refreshSessionAppIdentity(sessionOrId, options = {}) {
    const session = typeof sessionOrId === "string" ? getSessionOrThrow(sessionOrId) : sessionOrId;
    return appIdentityRuntime.refreshSessionAppIdentity(session, options);
  }

  function setSessionAppIdentity(sessionId, appIdentity, options = {}) {
    const session = getSessionOrThrow(sessionId);
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : nowFn();
    return applySessionAppIdentity(session, appIdentity, {
      emitUpdatedEvent: options.emitUpdatedEvent !== false,
      trace: options.trace || null,
      updatedAt
    });
  }

  function refreshSessionForegroundProcessIdentity(sessionOrId, options = {}) {
    const session = typeof sessionOrId === "string" ? getSessionOrThrow(sessionOrId) : sessionOrId;
    return appIdentityRuntime.refreshSessionForegroundProcessIdentity(session, options);
  }

  function observeSessionTerminalSignals(session, chunk, options = {}) {
    return appIdentityRuntime.observeSessionTerminalSignals(session, chunk, options);
  }

  function observeSessionOutputHeuristics(session, output, options = {}) {
    return appIdentityRuntime.observeSessionOutputHeuristics(session, output, options);
  }

  function scheduleSessionForegroundProcessIdentityRefresh(
    session,
    { delayMs = foregroundProcessRefreshDelayMs, trace = null } = {}
  ) {
    return appIdentityRuntime.scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs,
      trace
    });
  }

  function updateSession(sessionId, patch = {}, options = {}) {
    const session = getSessionOrThrow(sessionId);
    updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    const { updatedAt } = applySessionPatch(session, patch, {
      defaultShell,
      remoteReconnectMaxAttempts,
      remoteReconnectDelayMs,
      clearRemoteReconnectTimers,
      clearExpectedExitReason,
      nowFn
    });
    const refreshedIdentity = refreshSessionAppIdentity(session, {
      updatedAt
    });
    session.meta.appIdentity = refreshedIdentity;
    return session.meta;
  }

  function rename(sessionId, name) {
    return updateSession(sessionId, { name });
  }

  return {
    applySessionAppIdentity,
    observeSessionOutputHeuristics,
    observeSessionTerminalSignals,
    reconcileSessionAppIdentity,
    refreshSessionAppIdentity,
    refreshSessionForegroundProcessIdentity,
    rename,
    scheduleSessionForegroundProcessIdentityRefresh,
    setSessionAppIdentity,
    updateSession
  };
}
