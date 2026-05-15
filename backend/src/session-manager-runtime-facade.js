import { randomUUID } from "node:crypto";

import { ApiError } from "./errors.js";

const SESSION_KIND_LOCAL = "local";

export function createSessionManagerRuntimeFacade(dependencies = {}) {
  const {
    sessions = new Map(),
    nowFn = Date.now,
    foregroundProcessRefreshDelayMs = 90,
    sessionReplayMemoryMaxChars = 0,
    launchRuntime = {},
    ptyRuntime = {},
    startupRuntime = {},
    terminalRuntime = {},
    replayRuntime = {},
    mutationRuntime = {},
    sessionRuntime = {}
  } = dependencies;

  return {
    updateSessionTraceSeed(session, trace, overrides = {}) {
      return terminalRuntime.updateSessionTraceSeed(session, trace, overrides);
    },

    emitSessionActivityStarted(session, timestamp) {
      return terminalRuntime.emitSessionActivityStarted(session, timestamp);
    },

    emitSessionActivityCompleted(session, timestamp) {
      return terminalRuntime.emitSessionActivityCompleted(session, timestamp);
    },

    scheduleSessionActivityCompletion(session) {
      return terminalRuntime.scheduleSessionActivityCompletion(session);
    },

    buildLaunchBundle({
      kind,
      shell,
      cwd,
      startCwd,
      startCommand,
      env,
      remoteConnection,
      remoteAuth,
      remoteSecret
    }) {
      return launchRuntime.buildLaunchBundle({
        kind,
        shell,
        cwd,
        startCwd,
        startCommand,
        env,
        remoteConnection,
        remoteAuth,
        remoteSecret
      });
    },

    markRemoteSessionConnected(session, timestamp = nowFn()) {
      return launchRuntime.markRemoteSessionConnected(session, timestamp);
    },

    markRemoteSessionUnavailable(session, connectivityState, timestamp, details = {}) {
      return launchRuntime.markRemoteSessionUnavailable(session, connectivityState, timestamp, details);
    },

    attachPtyProcess(session, { ptyProcess, shellAdapter, launchSpec }) {
      return ptyRuntime.attachPtyProcess(session, { ptyProcess, shellAdapter, launchSpec });
    },

    dispatchLaunchPostStartInput(session) {
      return startupRuntime.dispatchLaunchPostStartInput(session);
    },

    scheduleLaunchPostStartInputDispatch(session, reason = "", delayMs = 0) {
      return startupRuntime.scheduleLaunchPostStartInputDispatch(session, reason, delayMs);
    },

    armLaunchPostStartInput(session, launchSpec, options = {}) {
      return startupRuntime.armLaunchPostStartInput(session, launchSpec, options);
    },

    observePendingLaunchPostStartInput(session, { rawData = "", promptBoundaries = [] } = {}) {
      return startupRuntime.observePendingLaunchPostStartInput(session, { rawData, promptBoundaries });
    },

    observeStartupTerminalQueryFallback(session, { rawData = "", trace = null } = {}) {
      return startupRuntime.observeStartupTerminalQueryFallback(session, { rawData, trace });
    },

    handleAsyncPtyWriteEvent(session, event = {}) {
      return terminalRuntime.handleAsyncPtyWriteEvent(session, event);
    },

    buildReconnectUnavailableError(session) {
      return launchRuntime.buildReconnectUnavailableError(session);
    },

    scheduleRemoteReconnect(session, details = {}) {
      return launchRuntime.scheduleRemoteReconnect(session, details);
    },

    attemptRemoteReconnect(sessionId, reason = "ssh-transport-exit") {
      return launchRuntime.attemptRemoteReconnect(sessionId, reason);
    },

    handlePtyExit(session, exit) {
      return launchRuntime.handlePtyExit(session, exit);
    },

    list() {
      return Array.from(sessions.values()).map((session) => session.meta);
    },

    buildReplayRetentionResult(value, maxChars = sessionReplayMemoryMaxChars) {
      return replayRuntime.buildReplayRetentionResult(value, maxChars);
    },

    buildReplayRetentionState(value, shellBlocks = [], currentShellBlockStart = null, maxChars = sessionReplayMemoryMaxChars) {
      return replayRuntime.buildReplayRetentionState(value, shellBlocks, currentShellBlockStart, maxChars);
    },

    appendReplayOutput(session, cleaned, promptBoundaries = []) {
      return replayRuntime.appendReplayOutput(session, cleaned, promptBoundaries);
    },

    trimReplayOutput(value, maxChars = sessionReplayMemoryMaxChars) {
      return replayRuntime.trimReplayOutput(value, maxChars);
    },

    getSnapshot({ outputMaxChars, includeTruncationMetadata = false, includeEmptyOutputs = false } = {}) {
      return replayRuntime.getSnapshot(sessions.values(), {
        outputMaxChars,
        includeTruncationMetadata,
        includeEmptyOutputs
      });
    },

    getReplayExport(sessionId) {
      const session = this.get(sessionId);
      return replayRuntime.getReplayExport(session);
    },

    getReplayExcerpt(sessionId, selectorText) {
      const session = this.get(sessionId);
      return replayRuntime.getReplayExcerpt(sessionId, session, selectorText);
    },

    get(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
      }
      return session;
    },

    emitSessionUpdated(session, { trace = null, updatedAt = nowFn() } = {}) {
      return terminalRuntime.emitSessionUpdated(session, { trace, updatedAt });
    },

    applySessionAppIdentity(session, nextIdentity, { emitUpdatedEvent = false, trace = null, updatedAt = nowFn() } = {}) {
      return mutationRuntime.applySessionAppIdentity(session, nextIdentity, {
        emitUpdatedEvent,
        trace,
        updatedAt
      });
    },

    reconcileSessionAppIdentity(
      session,
      candidateUpdates,
      { emitUpdatedEvent = false, trace = null, updatedAt = nowFn(), metaChanged = false } = {}
    ) {
      return mutationRuntime.reconcileSessionAppIdentity(session, candidateUpdates, {
        emitUpdatedEvent,
        trace,
        updatedAt,
        metaChanged
      });
    },

    refreshSessionAppIdentity(sessionId, options = {}) {
      return mutationRuntime.refreshSessionAppIdentity(sessionId, options);
    },

    setSessionAppIdentity(sessionId, appIdentity, options = {}) {
      return mutationRuntime.setSessionAppIdentity(sessionId, appIdentity, options);
    },

    refreshSessionForegroundProcessIdentity(sessionId, options = {}) {
      return mutationRuntime.refreshSessionForegroundProcessIdentity(sessionId, options);
    },

    observeSessionTerminalSignals(session, chunk, options = {}) {
      return mutationRuntime.observeSessionTerminalSignals(session, chunk, options);
    },

    observeSessionOutputHeuristics(session, output, options = {}) {
      return mutationRuntime.observeSessionOutputHeuristics(session, output, options);
    },

    scheduleSessionForegroundProcessIdentityRefresh(session, { delayMs = foregroundProcessRefreshDelayMs, trace = null } = {}) {
      return mutationRuntime.scheduleSessionForegroundProcessIdentityRefresh(session, {
        delayMs,
        trace
      });
    },

    transitionToRunning(session) {
      return terminalRuntime.transitionToRunning(session);
    },

    create({
      id = randomUUID(),
      quickIdToken,
      kind = SESSION_KIND_LOCAL,
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
      initialState,
      exitCode,
      exitSignal,
      exitedAt
    } = {}) {
      return sessionRuntime.createSession({
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
        trace,
        initialState,
        exitCode,
        exitSignal,
        exitedAt
      });
    },

    delete(sessionId, options = {}) {
      return this.closeWithReason(sessionId, "deleted", options);
    },

    sendInput(sessionId, data, options = {}) {
      return terminalRuntime.sendInput(sessionId, data, options);
    },

    resize(sessionId, cols, rows, options = {}) {
      return terminalRuntime.resize(sessionId, cols, rows, options);
    },

    signal(sessionId, signal, options = {}) {
      return terminalRuntime.signal(sessionId, signal, options);
    },

    interrupt(sessionId, options = {}) {
      return this.signal(sessionId, "SIGINT", options);
    },

    terminate(sessionId, options = {}) {
      return this.signal(sessionId, "SIGTERM", options);
    },

    kill(sessionId, options = {}) {
      return this.signal(sessionId, "SIGKILL", options);
    },

    updateSession(sessionId, patch = {}, options = {}) {
      return mutationRuntime.updateSession(sessionId, patch, options);
    },

    rename(sessionId, name) {
      return mutationRuntime.rename(sessionId, name);
    },

    restart(sessionId, options = {}) {
      return sessionRuntime.restartSession(sessionId, options);
    },

    start(sessionId, options = {}) {
      return sessionRuntime.startSession(sessionId, options);
    },

    stop(sessionId, options = {}) {
      return sessionRuntime.stopSession(sessionId, options);
    },

    closeWithReason(sessionId, reason, options = {}) {
      return sessionRuntime.closeSessionWithReason(sessionId, reason, options);
    },

    enforceGuardrails(currentTime = nowFn()) {
      return sessionRuntime.enforceGuardrails(currentTime);
    }
  };
}
