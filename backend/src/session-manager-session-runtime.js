import { ApiError } from "./errors.js";
import { remoteAuthRequiresSecret } from "./session-launch-spec.js";
import { buildRestartSessionCreatePayload, buildSessionRecord } from "./session-manager-lifecycle.js";

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const SESSION_STATE_STOPPED = "stopped";

export function createSessionManagerSessionRuntime(dependencies = {}) {
  const sessions = dependencies.sessions instanceof Map ? dependencies.sessions : new Map();
  const defaultShell = typeof dependencies.defaultShell === "string" && dependencies.defaultShell ? dependencies.defaultShell : "bash";
  const sessionMaxConcurrent =
    Number.isInteger(dependencies.sessionMaxConcurrent) && dependencies.sessionMaxConcurrent > 0
      ? dependencies.sessionMaxConcurrent
      : 0;
  const sessionIdleTimeoutMs =
    Number.isInteger(dependencies.sessionIdleTimeoutMs) && dependencies.sessionIdleTimeoutMs > 0
      ? dependencies.sessionIdleTimeoutMs
      : 0;
  const sessionMaxLifetimeMs =
    Number.isInteger(dependencies.sessionMaxLifetimeMs) && dependencies.sessionMaxLifetimeMs > 0
      ? dependencies.sessionMaxLifetimeMs
      : 0;
  const sessionReplayMemoryMaxChars =
    Number.isInteger(dependencies.sessionReplayMemoryMaxChars) && dependencies.sessionReplayMemoryMaxChars >= 0
      ? dependencies.sessionReplayMemoryMaxChars
      : DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS;
  const remoteReconnectMaxAttempts =
    Number.isInteger(dependencies.remoteReconnectMaxAttempts) && dependencies.remoteReconnectMaxAttempts >= 0
      ? dependencies.remoteReconnectMaxAttempts
      : 0;
  const remoteReconnectDelayMs =
    Number.isInteger(dependencies.remoteReconnectDelayMs) && dependencies.remoteReconnectDelayMs > 0
      ? dependencies.remoteReconnectDelayMs
      : 0;
  const nowFn = typeof dependencies.nowFn === "function" ? dependencies.nowFn : Date.now;
  const normalizeTraceSeed = typeof dependencies.normalizeTraceSeed === "function" ? dependencies.normalizeTraceSeed : (value) => value;
  const buildLaunchBundle =
    typeof dependencies.buildLaunchBundle === "function" ? dependencies.buildLaunchBundle : () => ({ launchSpec: { metaCwd: "", command: defaultShell } });
  const createInitialIdentityRuntime =
    typeof dependencies.createInitialIdentityRuntime === "function"
      ? dependencies.createInitialIdentityRuntime
      : () => ({ appIdentityState: {}, terminalSignalState: {}, appIdentity: {} });
  const createTraceEnvelope = typeof dependencies.createTraceEnvelope === "function" ? dependencies.createTraceEnvelope : () => ({});
  const updateSessionTraceSeed =
    typeof dependencies.updateSessionTraceSeed === "function" ? dependencies.updateSessionTraceSeed : () => null;
  const emitSessionUpdated =
    typeof dependencies.emitSessionUpdated === "function" ? dependencies.emitSessionUpdated : () => null;
  const transitionToRunning = typeof dependencies.transitionToRunning === "function" ? dependencies.transitionToRunning : () => null;
  const attachPtyProcess = typeof dependencies.attachPtyProcess === "function" ? dependencies.attachPtyProcess : () => {};
  const armLaunchPostStartInput =
    typeof dependencies.armLaunchPostStartInput === "function" ? dependencies.armLaunchPostStartInput : () => {};
  const clearSessionActivityTimer =
    typeof dependencies.clearSessionActivityTimer === "function" ? dependencies.clearSessionActivityTimer : () => {};
  const clearLaunchPostStartInputTimer =
    typeof dependencies.clearLaunchPostStartInputTimer === "function" ? dependencies.clearLaunchPostStartInputTimer : () => {};
  const clearForegroundProcessRefreshTimer =
    typeof dependencies.clearForegroundProcessRefreshTimer === "function" ? dependencies.clearForegroundProcessRefreshTimer : () => {};
  const clearRemoteReconnectTimers =
    typeof dependencies.clearRemoteReconnectTimers === "function" ? dependencies.clearRemoteReconnectTimers : () => {};
  const clearExpectedExitReason =
    typeof dependencies.clearExpectedExitReason === "function" ? dependencies.clearExpectedExitReason : () => {};
  const emitSessionCreated = typeof dependencies.emitSessionCreated === "function" ? dependencies.emitSessionCreated : () => {};
  const emitSessionClosed = typeof dependencies.emitSessionClosed === "function" ? dependencies.emitSessionClosed : () => {};

  function getSessionOrThrow(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    return session;
  }

  function createSession({
    id,
    quickIdToken,
    kind,
    remoteConnection,
    remoteAuth,
    remoteSecret,
    cwd,
    shell,
    name,
    startCwd,
    startCommand = "",
    env = {},
    deckId = "",
    replayOutput = "",
    replayOutputTruncated = false,
    note,
    mouseForwardingMode,
    inputSafetyProfile,
    tags = [],
    quickSendUsage = [],
    themeProfile = {},
    activeThemeProfile,
    inactiveThemeProfile,
    createdAt,
    updatedAt,
    trace,
    initialState = undefined
  } = {}) {
    const normalizedInitialState = initialState === SESSION_STATE_STOPPED ? SESSION_STATE_STOPPED : undefined;
    if (sessionMaxConcurrent > 0 && sessions.size >= sessionMaxConcurrent) {
      throw new ApiError(
        409,
        "SessionLimitExceeded",
        `Maximum concurrent session limit (${sessionMaxConcurrent}) reached.`
      );
    }

    const { session, launchBundle } = buildSessionRecord(
      {
        id,
        quickIdToken,
        kind,
        remoteConnection,
        remoteAuth,
        remoteSecret,
        cwd,
        shell,
        name,
        startCwd,
        startCommand,
        env,
        deckId,
        replayOutput,
        replayOutputTruncated,
        note,
        mouseForwardingMode,
        inputSafetyProfile,
        tags,
        quickSendUsage,
        themeProfile,
        activeThemeProfile,
        inactiveThemeProfile,
        createdAt,
        updatedAt,
        traceSeed: normalizeTraceSeed(trace),
        initialState: normalizedInitialState
      },
      {
        defaultShell,
        buildLaunchBundle,
        createInitialIdentityRuntime,
        remoteReconnectMaxAttempts,
        remoteReconnectDelayMs,
        sessionReplayMemoryMaxChars,
        nowFn
      }
    );

    sessions.set(session.id, session);
    const createdTrace = createTraceEnvelope(session.traceSeed, {
      sessionId: session.id,
      source: session.traceSeed?.source || "rest"
    });
    updateSessionTraceSeed(session, createdTrace, { source: session.traceSeed?.source || "rest" });
    emitSessionCreated({ session: session.meta, trace: createdTrace });
    if (launchBundle) {
      attachPtyProcess(session, launchBundle);
      transitionToRunning(session);
      armLaunchPostStartInput(session, launchBundle.launchSpec, { trace: createdTrace });
    }
    return session.meta;
  }

  function buildExistingSessionCreatePayload(session, { trace = null, updatedAt = nowFn(), initialState = undefined } = {}) {
    return {
      id: session.id,
      quickIdToken: session.meta.quickIdToken,
      kind: session.meta.kind,
      remoteConnection: session.meta.remoteConnection,
      remoteAuth: session.meta.remoteAuth,
      remoteSecret: session.remoteSecret,
      cwd: session.meta.startCwd || session.meta.cwd,
      shell: session.meta.shell,
      name: session.meta.name,
      deckId: session.meta.deckId,
      startCwd: session.meta.startCwd || session.meta.cwd,
      startCommand: session.meta.startCommand || "",
      env: session.meta.env || {},
      replayOutput: "",
      replayOutputTruncated: false,
      note: session.meta.note,
      mouseForwardingMode: session.meta.mouseForwardingMode,
      inputSafetyProfile: session.meta.inputSafetyProfile,
      tags: session.meta.tags || [],
      quickSendUsage: session.meta.quickSendUsage || [],
      themeProfile: session.meta.themeProfile || {},
      activeThemeProfile: session.meta.activeThemeProfile,
      inactiveThemeProfile: session.meta.inactiveThemeProfile,
      createdAt: session.meta.createdAt,
      updatedAt,
      trace,
      initialState
    };
  }

  function stopSession(sessionId, options = {}) {
    const session = getSessionOrThrow(sessionId);
    if (session.meta.state === SESSION_STATE_STOPPED) {
      throw new ApiError(409, "SessionAlreadyStopped", `Session '${sessionId}' is already stopped.`);
    }
    const trace = normalizeTraceSeed(options.trace);
    const updatedAt = nowFn();
    updateSessionTraceSeed(session, trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    const { session: stoppedSession } = buildSessionRecord(
      buildExistingSessionCreatePayload(session, {
        trace: session.traceSeed,
        updatedAt,
        initialState: SESSION_STATE_STOPPED
      }),
      {
        defaultShell,
        buildLaunchBundle,
        createInitialIdentityRuntime,
        remoteReconnectMaxAttempts,
        remoteReconnectDelayMs,
        sessionReplayMemoryMaxChars,
        nowFn
      }
    );
    clearSessionActivityTimer(session);
    clearLaunchPostStartInputTimer(session);
    clearForegroundProcessRefreshTimer(session);
    clearRemoteReconnectTimers(session);
    clearExpectedExitReason(session);
    session.expectedExitReason = "stopped";
    sessions.set(sessionId, stoppedSession);
    if (session.ptyProcess) {
      const ptyProcess = session.ptyProcess;
      session.ptyProcess = null;
      ptyProcess.kill();
    }
    updateSessionTraceSeed(stoppedSession, trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    emitSessionUpdated(stoppedSession, {
      trace,
      updatedAt
    });
    return stoppedSession.meta;
  }

  function startSession(sessionId, options = {}) {
    const session = getSessionOrThrow(sessionId);
    if (session.meta.state !== SESSION_STATE_STOPPED) {
      throw new ApiError(409, "SessionAlreadyRunning", `Session '${sessionId}' is already running.`);
    }
    if (remoteAuthRequiresSecret(session.meta.remoteAuth) && !session.remoteSecret) {
      throw new ApiError(
        409,
        "SessionStartSecretRequired",
        "This stopped ssh session requires a secret that is no longer available after restore. Update the session and provide the secret again before starting it."
      );
    }
    const trace = normalizeTraceSeed(options.trace);
    const updatedAt = nowFn();
    const { session: startedSession, launchBundle } = buildSessionRecord(
      buildExistingSessionCreatePayload(session, {
        trace,
        updatedAt
      }),
      {
        defaultShell,
        buildLaunchBundle,
        createInitialIdentityRuntime,
        remoteReconnectMaxAttempts,
        remoteReconnectDelayMs,
        sessionReplayMemoryMaxChars,
        nowFn
      }
    );
    sessions.set(sessionId, startedSession);
    attachPtyProcess(startedSession, launchBundle);
    const startTrace = createTraceEnvelope(startedSession.traceSeed, {
      sessionId,
      source: startedSession.traceSeed?.source || "rest"
    });
    updateSessionTraceSeed(startedSession, startTrace, {
      sessionId,
      source: startedSession.traceSeed?.source || "rest"
    });
    transitionToRunning(startedSession);
    armLaunchPostStartInput(startedSession, launchBundle.launchSpec, { trace: startTrace });
    return startedSession.meta;
  }

  function closeSessionWithReason(sessionId, reason, options = {}) {
    const session = getSessionOrThrow(sessionId);
    updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    clearSessionActivityTimer(session);
    clearLaunchPostStartInputTimer(session);
    clearForegroundProcessRefreshTimer(session);
    clearRemoteReconnectTimers(session);
    clearExpectedExitReason(session);
    session.expectedExitReason = reason;
    if (session.ptyProcess) {
      const ptyProcess = session.ptyProcess;
      session.ptyProcess = null;
      ptyProcess.kill();
    }
    sessions.delete(sessionId);
    emitSessionClosed({
      sessionId,
      reason,
      session: { ...session.meta },
      trace: createTraceEnvelope(session.traceSeed, {
        sessionId,
        source: session.traceSeed?.source || "rest"
      })
    });
  }

  function restartSession(sessionId, options = {}) {
    const session = getSessionOrThrow(sessionId);
    const trace = normalizeTraceSeed(options.trace);
    const restartPayload = buildRestartSessionCreatePayload({
      sessionMeta: session.meta,
      remoteSecret: session.remoteSecret,
      updatedAt: nowFn(),
      trace
    });
    closeSessionWithReason(sessionId, "deleted", { trace });
    return createSession(restartPayload);
  }

  function enforceGuardrails(currentTime = nowFn()) {
    if (sessionIdleTimeoutMs <= 0 && sessionMaxLifetimeMs <= 0) {
      return;
    }

    const toClose = [];
    for (const session of sessions.values()) {
      if (session.meta.state === SESSION_STATE_STOPPED || !session.ptyProcess || session.expectedExitReason === "stopped") {
        continue;
      }
      if (
        sessionIdleTimeoutMs > 0 &&
        Number.isInteger(session.lastActivityAt) &&
        currentTime - session.lastActivityAt >= sessionIdleTimeoutMs
      ) {
        toClose.push({ sessionId: session.id, reason: "idle-timeout" });
        continue;
      }
      if (
        sessionMaxLifetimeMs > 0 &&
        Number.isInteger(session.meta.createdAt) &&
        currentTime - session.meta.createdAt >= sessionMaxLifetimeMs
      ) {
        toClose.push({ sessionId: session.id, reason: "max-lifetime" });
      }
    }

    for (const item of toClose) {
      if (sessions.has(item.sessionId)) {
        closeSessionWithReason(item.sessionId, item.reason);
      }
    }
  }

  return {
    closeSessionWithReason,
    createSession,
    enforceGuardrails,
    getSessionOrThrow,
    restartSession,
    startSession,
    stopSession
  };
}
