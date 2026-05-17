import { createSessionManagerAppIdentityRuntime } from "./session-manager-app-identity-runtime.js";
import { createSessionManagerLaunchRuntime } from "./session-manager-launch-runtime.js";
import { applySessionPatch } from "./session-manager-lifecycle.js";
import { createSessionManagerMutationRuntime } from "./session-manager-mutation-runtime.js";
import { createSessionManagerPtyRuntime } from "./session-manager-pty-runtime.js";
import { createSessionManagerReplayRuntime } from "./session-manager-replay-runtime.js";
import { createSessionManagerSessionRuntime } from "./session-manager-session-runtime.js";
import { createSessionManagerStartupRuntime } from "./session-manager-startup-runtime.js";
import { createSessionManagerTerminalRuntime } from "./session-manager-terminal-runtime.js";
import { createSessionManagerTraceRuntime } from "./session-manager-trace-runtime.js";
import { inspectLinuxTerminalForegroundProcess } from "./terminal-foreground-process.js";

export function createSessionManagerRuntimeAssembly(dependencies = {}) {
  const {
    createTraceRuntimeImpl = createSessionManagerTraceRuntime,
    createLaunchRuntimeImpl = createSessionManagerLaunchRuntime,
    createSessionRuntimeImpl = createSessionManagerSessionRuntime,
    createStartupRuntimeImpl = createSessionManagerStartupRuntime,
    createReplayRuntimeImpl = createSessionManagerReplayRuntime,
    createTerminalRuntimeImpl = createSessionManagerTerminalRuntime,
    createPtyRuntimeImpl = createSessionManagerPtyRuntime,
    createAppIdentityRuntimeImpl = createSessionManagerAppIdentityRuntime,
    createMutationRuntimeImpl = createSessionManagerMutationRuntime,
    applySessionPatchImpl = applySessionPatch,
    sessions = new Map(),
    defaultShell = "bash",
    sessionMaxConcurrent = 0,
    sessionIdleTimeoutMs = 0,
    sessionMaxLifetimeMs = 0,
    sessionReplayMemoryMaxChars = 0,
    sessionActivityQuietMs = 0,
    remoteReconnectMaxAttempts = 0,
    remoteReconnectDelayMs = 0,
    remoteReconnectStableMs = 0,
    sshAskpassPath = "",
    sshKnownHostsPath = "",
    resolveSshTrustedHostKeyTypes = null,
    baseEnv = process.env,
    createPty = () => null,
    nowFn = Date.now,
    setTimeoutFn = setTimeout,
    createTraceId,
    inspectTerminalForegroundProcess,
    foregroundProcessRefreshDelayMs = 90,
    startupPostInputFallbackMs = 1500,
    startupTerminalQueryFallbackWindowMs = 15000,
    startupTerminalQueryFallbackMaxResponses = 4,
    captureSessionStreamChunk = null,
    nodePtyAsyncWriteOptions = {},
    emitEvent = () => {},
    clearExpectedExitReason = () => {},
    clearRemoteReconnectTimers = () => {},
    clearSessionActivityTimer = () => {},
    clearLaunchPostStartInputTimer = () => {},
    clearPendingLaunchPostStartInput = () => {},
    clearStartupTerminalQueryFallback = () => {},
    clearForegroundProcessRefreshTimer = () => {},
    clearRemoteReconnectStabilizeTimer = () => {},
    attachPtyProcess = () => {},
    emitSessionUpdated = () => {},
    getSessionById = () => null,
    getSessionOrThrow = () => null,
    sendInput = () => {},
    updateSessionTraceSeed = () => {},
    transitionToRunning = () => {},
    armLaunchPostStartInput = () => {},
    scheduleLaunchPostStartInputDispatch = () => {},
    buildReconnectUnavailableError = () => null,
    appendReplayOutput = () => {},
    observePendingLaunchPostStartInput = () => {},
    observeStartupTerminalQueryFallback = () => {},
    observeSessionTerminalSignals = () => {},
    observeSessionOutputHeuristics = () => {},
    markRemoteSessionConnected = () => {},
    emitSessionActivityStarted = () => {},
    scheduleSessionActivityCompletion = () => {},
    scheduleSessionForegroundProcessIdentityRefresh = () => {},
    handleAsyncPtyWriteEvent = () => {},
    handlePtyExit = () => {}
  } = dependencies;

  const resolvedInspectTerminalForegroundProcess =
    typeof inspectTerminalForegroundProcess === "function"
      ? inspectTerminalForegroundProcess
      : inspectLinuxTerminalForegroundProcess;

  const traceRuntime = createTraceRuntimeImpl({
    createTraceId
  });

  const launchRuntime = createLaunchRuntimeImpl({
    baseEnv,
    createPty,
    sshAskpassPath,
    sshKnownHostsPath,
    resolveSshTrustedHostKeyTypes,
    remoteReconnectMaxAttempts,
    remoteReconnectDelayMs,
    remoteReconnectStableMs,
    nowFn,
    setTimeoutFn,
    clearExpectedExitReason,
    clearRemoteReconnectTimers,
    clearSessionActivityTimer,
    clearLaunchPostStartInputTimer,
    clearStartupTerminalQueryFallback,
    clearForegroundProcessRefreshTimer,
    clearRemoteReconnectStabilizeTimer,
    attachPtyProcess,
    emitSessionUpdated,
    emitSessionExit: (session, { exitCode, exitSignal, exitTimestamp }) => {
      const trace = traceRuntime.createTraceEnvelope(session.traceSeed, {
        sessionId: session.id,
        source: session.traceSeed?.source || "pty"
      });
      updateSessionTraceSeed(session, trace, {
        source: session.traceSeed?.source || "pty"
      });
      emitEvent("session.exit", {
        sessionId: session.id,
        exitCode,
        signal: exitSignal,
        exitedAt: exitTimestamp,
        updatedAt: session.meta.updatedAt,
        session: { ...session.meta },
        trace
      });
    },
    getSessionById
  });

  const terminalRuntime = createTerminalRuntimeImpl({
    sessions,
    getSessionOrThrow,
    createTraceEnvelope: (seed, overrides = {}) => traceRuntime.createTraceEnvelope(seed, overrides),
    normalizeTraceSeed: traceRuntime.normalizeTraceSeed,
    emit: (eventName, payload) => emitEvent(eventName, payload),
    nowFn,
    setTimeoutFn,
    sessionActivityQuietMs,
    foregroundProcessRefreshDelayMs,
    clearSessionActivityTimer,
    clearExpectedExitReason,
    scheduleLaunchPostStartInputDispatch,
    buildReconnectUnavailableError,
    scheduleSessionForegroundProcessIdentityRefresh
  });

  const startupRuntime = createStartupRuntimeImpl({
    nowFn,
    setTimeoutFn,
    getSessionById,
    clearPendingLaunchPostStartInput,
    clearLaunchPostStartInputTimer,
    clearStartupTerminalQueryFallback,
    sendInput,
    normalizeTraceSeed: traceRuntime.normalizeTraceSeed,
    countCursorPositionQueries: traceRuntime.countCursorPositionQueries,
    buildCursorPositionReport: traceRuntime.buildCursorPositionReport,
    startupPostInputFallbackMs,
    startupTerminalQueryFallbackWindowMs,
    startupTerminalQueryFallbackMaxResponses
  });

  const replayRuntime = createReplayRuntimeImpl({
    sessionReplayMemoryMaxChars
  });

  const appIdentityRuntime = createAppIdentityRuntimeImpl({
    nowFn,
    setTimeoutFn,
    foregroundProcessRefreshDelayMs,
    inspectTerminalForegroundProcess: resolvedInspectTerminalForegroundProcess,
    clearForegroundProcessRefreshTimer,
    emitSessionUpdated,
    getSessionById
  });

  const sessionRuntime = createSessionRuntimeImpl({
    sessions,
    defaultShell,
    sessionMaxConcurrent,
    sessionIdleTimeoutMs,
    sessionMaxLifetimeMs,
    sessionReplayMemoryMaxChars,
    remoteReconnectMaxAttempts,
    remoteReconnectDelayMs,
    nowFn,
    normalizeTraceSeed: traceRuntime.normalizeTraceSeed,
    buildLaunchBundle: (options) => launchRuntime.buildLaunchBundle(options),
    createInitialIdentityRuntime: (identityInput, options) =>
      appIdentityRuntime.createInitialIdentityRuntime(identityInput, options),
    createTraceEnvelope: (seed, overrides = {}) => traceRuntime.createTraceEnvelope(seed, overrides),
    updateSessionTraceSeed,
    transitionToRunning,
    attachPtyProcess,
    armLaunchPostStartInput,
    clearSessionActivityTimer,
    clearLaunchPostStartInputTimer,
    clearForegroundProcessRefreshTimer,
    clearRemoteReconnectTimers,
    clearExpectedExitReason,
    emitSessionUpdated,
    emitSessionCreated: (event) => emitEvent("session.created", event),
    emitSessionClosed: (event) => emitEvent("session.closed", event)
  });

  const mutationRuntime = createMutationRuntimeImpl({
    getSessionOrThrow,
    nowFn,
    defaultShell,
    remoteReconnectMaxAttempts,
    remoteReconnectDelayMs,
    foregroundProcessRefreshDelayMs,
    clearRemoteReconnectTimers,
    clearExpectedExitReason,
    updateSessionTraceSeed,
    applySessionPatch: applySessionPatchImpl,
    appIdentityRuntime
  });

  const ptyRuntime = createPtyRuntimeImpl({
    nowFn,
    foregroundProcessRefreshDelayMs,
    nodePtyAsyncWriteOptions,
    emit: (eventName, payload) => emitEvent(eventName, payload),
    createTraceEnvelope: (seed, overrides = {}) => traceRuntime.createTraceEnvelope(seed, overrides),
    updateSessionTraceSeed,
    observeStartupTerminalQueryFallback,
    observeSessionTerminalSignals,
    observeSessionOutputHeuristics,
    captureSessionStreamChunk,
    emitSessionUpdated,
    appendReplayOutput,
    observePendingLaunchPostStartInput,
    markRemoteSessionConnected,
    emitSessionActivityStarted,
    scheduleSessionActivityCompletion,
    scheduleSessionForegroundProcessIdentityRefresh,
    handleAsyncPtyWriteEvent,
    handlePtyExit
  });

  return {
    appIdentityRuntime,
    launchRuntime,
    mutationRuntime,
    ptyRuntime,
    replayRuntime,
    sessionRuntime,
    startupRuntime,
    terminalRuntime,
    traceRuntime
  };
}
