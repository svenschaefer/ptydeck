import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./errors.js";
import {
  attachNodePtyAsyncWritePatch,
  clearNodePtyAsyncWriteMeta,
  queueNodePtyAsyncWriteMeta
} from "./node-pty-write-retry.js";
import {
  clearExpectedExitReason as clearSessionManagerExpectedExitReason,
  clearForegroundProcessRefreshTimer as clearSessionManagerForegroundProcessRefreshTimer,
  clearLaunchPostStartInputTimer as clearSessionManagerLaunchPostStartInputTimer,
  clearPendingLaunchPostStartInput as clearSessionManagerPendingLaunchPostStartInput,
  clearRemoteReconnectStabilizeTimer as clearSessionManagerRemoteReconnectStabilizeTimer,
  clearRemoteReconnectTimer as clearSessionManagerRemoteReconnectTimer,
  clearRemoteReconnectTimers as clearSessionManagerRemoteReconnectTimers,
  clearSessionActivityTimer as clearSessionManagerActivityTimer,
  clearStartupTerminalQueryFallback as clearSessionManagerStartupTerminalQueryFallback
} from "./session-manager-cleanup.js";
import {
  DEFAULT_REMOTE_RECONNECT_DELAY_MS,
  DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS,
} from "./session-manager-remote-runtime.js";
import { createSessionManagerLaunchRuntime } from "./session-manager-launch-runtime.js";
import { createSessionManagerSessionRuntime } from "./session-manager-session-runtime.js";
import { createSessionManagerStartupRuntime } from "./session-manager-startup-runtime.js";
import { createSessionManagerReplayRuntime } from "./session-manager-replay-runtime.js";
import {
  recordQuickSendUsageEntry
} from "./session-quick-send-usage.js";
import { inspectLinuxTerminalForegroundProcess } from "./terminal-foreground-process.js";
import { createSessionManagerAppIdentityRuntime } from "./session-manager-app-identity-runtime.js";
import {
  applySessionPatch
} from "./session-manager-lifecycle.js";

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const SESSION_KIND_LOCAL = "local";
const SESSION_KIND_SSH = "ssh";
const SESSION_MANAGER_DIRNAME = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SSH_ASKPASS_PATH = join(SESSION_MANAGER_DIRNAME, "../libexec/ssh-askpass.sh");
const DEFAULT_SSH_KNOWN_HOSTS_PATH = join(SESSION_MANAGER_DIRNAME, "../data/ssh_known_hosts");
const SESSION_STATE_RUNNING = "running";
const SESSION_STATE_EXITED = "exited";
const SESSION_ACTIVITY_STATE_ACTIVE = "active";
const SESSION_ACTIVITY_STATE_INACTIVE = "inactive";
const DEFAULT_SESSION_ACTIVITY_QUIET_MS = 1400;
const DEFAULT_REMOTE_RECONNECT_STABLE_MS = 500;
const DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS = 90;
const DEFAULT_STARTUP_POST_INPUT_FALLBACK_MS = 1500;
const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS = 15000;
const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES = 4;
const TRACE_TOKEN_MAX_LENGTH = 128;

function normalizeTraceToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > TRACE_TOKEN_MAX_LENGTH) {
    return "";
  }
  return normalized;
}

function normalizeTraceSeed(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }
  const traceId = normalizeTraceToken(trace.traceId);
  const correlationId = normalizeTraceToken(trace.correlationId);
  const requestId = normalizeTraceToken(trace.requestId);
  const connectionId = normalizeTraceToken(trace.connectionId);
  const sessionId = normalizeTraceToken(trace.sessionId);
  const deckId = normalizeTraceToken(trace.deckId);
  const source = normalizeTraceToken(trace.source);
  const normalized = {
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(connectionId ? { connectionId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(deckId ? { deckId } : {}),
    ...(source ? { source } : {})
  };
  return Object.keys(normalized).length ? normalized : null;
}

function createTraceEnvelope(createTraceId, seed, overrides = {}) {
  const normalizedSeed = normalizeTraceSeed(seed);
  const normalizedOverrides = normalizeTraceSeed(overrides);
  const traceId = typeof createTraceId === "function" ? normalizeTraceToken(createTraceId()) : "";
  const correlationId =
    normalizedOverrides?.correlationId ||
    normalizedSeed?.correlationId ||
    traceId ||
    normalizeTraceToken(randomUUID());
  const parentTraceId = normalizedOverrides?.traceId || normalizedSeed?.traceId || "";
  return {
    traceId: traceId || normalizeTraceToken(randomUUID()),
    correlationId,
    ...(parentTraceId ? { parentTraceId } : {}),
    ...(normalizedOverrides?.requestId || normalizedSeed?.requestId
      ? { requestId: normalizedOverrides?.requestId || normalizedSeed?.requestId }
      : {}),
    ...(normalizedOverrides?.connectionId || normalizedSeed?.connectionId
      ? { connectionId: normalizedOverrides?.connectionId || normalizedSeed?.connectionId }
      : {}),
    ...(normalizedOverrides?.sessionId || normalizedSeed?.sessionId
      ? { sessionId: normalizedOverrides?.sessionId || normalizedSeed?.sessionId }
      : {}),
    ...(normalizedOverrides?.deckId || normalizedSeed?.deckId
      ? { deckId: normalizedOverrides?.deckId || normalizedSeed?.deckId }
      : {}),
    ...(normalizedOverrides?.source || normalizedSeed?.source
      ? { source: normalizedOverrides?.source || normalizedSeed?.source }
      : {})
  };
}

function countCursorPositionQueries(rawData) {
  if (typeof rawData !== "string" || rawData.length === 0) {
    return 0;
  }
  return (rawData.match(/\u001b\[6n/g) || []).length;
}

function buildCursorPositionReport(row = 1, col = 1) {
  const normalizedRow = Number.isInteger(row) && row > 0 ? row : 1;
  const normalizedCol = Number.isInteger(col) && col > 0 ? col : 1;
  return `\u001b[${normalizedRow};${normalizedCol}R`;
}

export class SessionManager {
  constructor({
    defaultShell = "bash",
    createPty,
    sessionMaxConcurrent = 0,
    sessionIdleTimeoutMs = 0,
    sessionMaxLifetimeMs = 0,
    sessionReplayMemoryMaxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS,
    sessionActivityQuietMs = DEFAULT_SESSION_ACTIVITY_QUIET_MS,
    remoteReconnectMaxAttempts = DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS,
    remoteReconnectDelayMs = DEFAULT_REMOTE_RECONNECT_DELAY_MS,
    remoteReconnectStableMs = DEFAULT_REMOTE_RECONNECT_STABLE_MS,
    sshAskpassPath = DEFAULT_SSH_ASKPASS_PATH,
    sshKnownHostsPath = DEFAULT_SSH_KNOWN_HOSTS_PATH,
    resolveSshTrustedHostKeyTypes,
    nowFn = Date.now,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    createTraceId = randomUUID,
    inspectTerminalForegroundProcess,
    foregroundProcessRefreshDelayMs = DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS,
    startupPostInputFallbackMs = DEFAULT_STARTUP_POST_INPUT_FALLBACK_MS,
    captureSessionStreamChunk,
    nodePtyAsyncWriteOptions
  } = {}) {
    this.defaultShell = defaultShell;
    this.sessions = new Map();
    this.events = new EventEmitter();
    this.sessionMaxConcurrent =
      Number.isInteger(sessionMaxConcurrent) && sessionMaxConcurrent > 0 ? sessionMaxConcurrent : 0;
    this.sessionIdleTimeoutMs = Number.isInteger(sessionIdleTimeoutMs) && sessionIdleTimeoutMs > 0 ? sessionIdleTimeoutMs : 0;
    this.sessionMaxLifetimeMs =
      Number.isInteger(sessionMaxLifetimeMs) && sessionMaxLifetimeMs > 0 ? sessionMaxLifetimeMs : 0;
    this.sessionReplayMemoryMaxChars =
      Number.isInteger(sessionReplayMemoryMaxChars) && sessionReplayMemoryMaxChars >= 0
        ? sessionReplayMemoryMaxChars
        : DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS;
    this.sshAskpassPath =
      typeof sshAskpassPath === "string" && sshAskpassPath.trim() ? sshAskpassPath.trim() : DEFAULT_SSH_ASKPASS_PATH;
    this.sshKnownHostsPath =
      typeof sshKnownHostsPath === "string" && sshKnownHostsPath.trim()
        ? sshKnownHostsPath.trim()
        : DEFAULT_SSH_KNOWN_HOSTS_PATH;
    this.resolveSshTrustedHostKeyTypes =
      typeof resolveSshTrustedHostKeyTypes === "function" ? resolveSshTrustedHostKeyTypes : null;
    this.sessionActivityQuietMs =
      Number.isInteger(sessionActivityQuietMs) && sessionActivityQuietMs > 0
        ? sessionActivityQuietMs
        : DEFAULT_SESSION_ACTIVITY_QUIET_MS;
    this.remoteReconnectMaxAttempts =
      Number.isInteger(remoteReconnectMaxAttempts) && remoteReconnectMaxAttempts >= 0
        ? remoteReconnectMaxAttempts
        : DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS;
    this.remoteReconnectDelayMs =
      Number.isInteger(remoteReconnectDelayMs) && remoteReconnectDelayMs > 0
        ? remoteReconnectDelayMs
        : DEFAULT_REMOTE_RECONNECT_DELAY_MS;
    this.remoteReconnectStableMs =
      Number.isInteger(remoteReconnectStableMs) && remoteReconnectStableMs > 0
        ? remoteReconnectStableMs
        : DEFAULT_REMOTE_RECONNECT_STABLE_MS;
    this.createTraceId = typeof createTraceId === "function" ? createTraceId : randomUUID;
    this.nowFn = typeof nowFn === "function" ? nowFn : Date.now;
    this.setTimeoutFn = typeof setTimeoutFn === "function" ? setTimeoutFn : setTimeout;
    this.clearTimeoutFn = typeof clearTimeoutFn === "function" ? clearTimeoutFn : clearTimeout;
    this.inspectTerminalForegroundProcess =
      typeof inspectTerminalForegroundProcess === "function" ? inspectTerminalForegroundProcess : inspectLinuxTerminalForegroundProcess;
    this.foregroundProcessRefreshDelayMs =
      Number.isInteger(foregroundProcessRefreshDelayMs) && foregroundProcessRefreshDelayMs >= 0
        ? foregroundProcessRefreshDelayMs
        : DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS;
    this.startupPostInputFallbackMs =
      Number.isInteger(startupPostInputFallbackMs) && startupPostInputFallbackMs >= 0
        ? startupPostInputFallbackMs
        : DEFAULT_STARTUP_POST_INPUT_FALLBACK_MS;
    this.captureSessionStreamChunk =
      typeof captureSessionStreamChunk === "function" ? captureSessionStreamChunk : null;
    this.nodePtyAsyncWriteOptions =
      nodePtyAsyncWriteOptions && typeof nodePtyAsyncWriteOptions === "object" && !Array.isArray(nodePtyAsyncWriteOptions)
        ? { ...nodePtyAsyncWriteOptions }
        : {};
    this.createPty =
      createPty ||
      (({ command, shell, args = [], cwd, cols, rows, env }) =>
        pty.spawn(command || shell, Array.isArray(args) ? args : [], {
          name: "xterm-color",
          cwd,
          cols,
          rows,
          env: env || process.env
        }));
    this.launchRuntime = createSessionManagerLaunchRuntime({
      baseEnv: process.env,
      createPty: this.createPty,
      sshAskpassPath: this.sshAskpassPath,
      sshKnownHostsPath: this.sshKnownHostsPath,
      resolveSshTrustedHostKeyTypes: this.resolveSshTrustedHostKeyTypes,
      remoteReconnectMaxAttempts: this.remoteReconnectMaxAttempts,
      remoteReconnectDelayMs: this.remoteReconnectDelayMs,
      remoteReconnectStableMs: this.remoteReconnectStableMs,
      nowFn: this.nowFn,
      setTimeoutFn: this.setTimeoutFn,
      clearExpectedExitReason: (session) => this.clearExpectedExitReason(session),
      clearRemoteReconnectTimers: (session) => this.clearRemoteReconnectTimers(session),
      clearSessionActivityTimer: (session) => this.clearSessionActivityTimer(session),
      clearLaunchPostStartInputTimer: (session) => this.clearLaunchPostStartInputTimer(session),
      clearStartupTerminalQueryFallback: (session) => this.clearStartupTerminalQueryFallback(session),
      clearForegroundProcessRefreshTimer: (session) => this.clearForegroundProcessRefreshTimer(session),
      clearRemoteReconnectStabilizeTimer: (session) => this.clearRemoteReconnectStabilizeTimer(session),
      attachPtyProcess: (session, launchBundle) => this.attachPtyProcess(session, launchBundle),
      emitSessionUpdated: (session) => this.emitSessionUpdated(session),
      emitSessionExit: (session, { exitCode, exitSignal, exitTimestamp }) => {
        const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
          sessionId: session.id,
          source: session.traceSeed?.source || "pty"
        });
        this.updateSessionTraceSeed(session, trace, { source: session.traceSeed?.source || "pty" });
        this.events.emit("session.exit", {
          sessionId: session.id,
          exitCode,
          signal: exitSignal,
          exitedAt: exitTimestamp,
          updatedAt: session.meta.updatedAt,
          session: { ...session.meta },
          trace
        });
      },
      getSessionById: (sessionId) => this.sessions.get(sessionId),
      removeSessionById: (sessionId) => this.sessions.delete(sessionId)
    });
    this.startupRuntime = createSessionManagerStartupRuntime({
      nowFn: this.nowFn,
      setTimeoutFn: this.setTimeoutFn,
      getSessionById: (sessionId) => this.sessions.get(sessionId),
      clearPendingLaunchPostStartInput: (session) => this.clearPendingLaunchPostStartInput(session),
      clearLaunchPostStartInputTimer: (session) => this.clearLaunchPostStartInputTimer(session),
      clearStartupTerminalQueryFallback: (session) => this.clearStartupTerminalQueryFallback(session),
      sendInput: (sessionId, data, options) => this.sendInput(sessionId, data, options),
      normalizeTraceSeed,
      countCursorPositionQueries,
      buildCursorPositionReport,
      startupPostInputFallbackMs: this.startupPostInputFallbackMs,
      startupTerminalQueryFallbackWindowMs: DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS,
      startupTerminalQueryFallbackMaxResponses: DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES
    });
    this.replayRuntime = createSessionManagerReplayRuntime({
      sessionReplayMemoryMaxChars: this.sessionReplayMemoryMaxChars
    });
    this.appIdentityRuntime = createSessionManagerAppIdentityRuntime({
      nowFn: this.nowFn,
      setTimeoutFn: this.setTimeoutFn,
      foregroundProcessRefreshDelayMs: this.foregroundProcessRefreshDelayMs,
      inspectTerminalForegroundProcess: this.inspectTerminalForegroundProcess,
      clearForegroundProcessRefreshTimer: (session) => this.clearForegroundProcessRefreshTimer(session),
      emitSessionUpdated: (session, options) => this.emitSessionUpdated(session, options),
      getSessionById: (sessionId) => this.sessions.get(sessionId)
    });
    this.sessionRuntime = createSessionManagerSessionRuntime({
      sessions: this.sessions,
      defaultShell: this.defaultShell,
      sessionMaxConcurrent: this.sessionMaxConcurrent,
      sessionIdleTimeoutMs: this.sessionIdleTimeoutMs,
      sessionMaxLifetimeMs: this.sessionMaxLifetimeMs,
      sessionReplayMemoryMaxChars: this.sessionReplayMemoryMaxChars,
      remoteReconnectMaxAttempts: this.remoteReconnectMaxAttempts,
      remoteReconnectDelayMs: this.remoteReconnectDelayMs,
      nowFn: this.nowFn,
      normalizeTraceSeed,
      buildLaunchBundle: (options) => this.buildLaunchBundle(options),
      createInitialIdentityRuntime: (identityInput, options) =>
        this.appIdentityRuntime.createInitialIdentityRuntime(identityInput, options),
      createTraceEnvelope: (seed, overrides = {}) => createTraceEnvelope(this.createTraceId, seed, overrides),
      updateSessionTraceSeed: (session, trace, overrides = {}) => this.updateSessionTraceSeed(session, trace, overrides),
      transitionToRunning: (session) => this.transitionToRunning(session),
      attachPtyProcess: (session, launchBundle) => this.attachPtyProcess(session, launchBundle),
      armLaunchPostStartInput: (session, launchSpec, options = {}) =>
        this.armLaunchPostStartInput(session, launchSpec, options),
      clearSessionActivityTimer: (session) => this.clearSessionActivityTimer(session),
      clearLaunchPostStartInputTimer: (session) => this.clearLaunchPostStartInputTimer(session),
      clearForegroundProcessRefreshTimer: (session) => this.clearForegroundProcessRefreshTimer(session),
      clearRemoteReconnectTimers: (session) => this.clearRemoteReconnectTimers(session),
      clearExpectedExitReason: (session) => this.clearExpectedExitReason(session),
      emitSessionCreated: (event) => this.events.emit("session.created", event),
      emitSessionClosed: (event) => this.events.emit("session.closed", event)
    });
  }

  emitSessionUpdated(session) {
    if (!session?.meta) {
      return;
    }
    this.events.emit("session.updated", {
      session: session.meta,
      trace: createTraceEnvelope(this.createTraceId, session.traceSeed, {
        sessionId: session.id,
        source: session.traceSeed?.source || "pty"
      })
    });
  }

  updateSessionTraceSeed(session, trace, overrides = {}) {
    if (!session) {
      return null;
    }
    const nextTraceSeed = {
      ...(normalizeTraceSeed(session.traceSeed) || {}),
      ...(normalizeTraceSeed(trace) || {}),
      ...(normalizeTraceSeed(overrides) || {})
    };
    session.traceSeed = normalizeTraceSeed(nextTraceSeed);
    return session.traceSeed;
  }

  clearSessionActivityTimer(session) {
    clearSessionManagerActivityTimer(session, this.clearTimeoutFn);
  }

  clearLaunchPostStartInputTimer(session) {
    clearSessionManagerLaunchPostStartInputTimer(session, this.clearTimeoutFn);
  }

  clearForegroundProcessRefreshTimer(session) {
    clearSessionManagerForegroundProcessRefreshTimer(session, this.clearTimeoutFn);
  }

  clearRemoteReconnectTimer(session) {
    clearSessionManagerRemoteReconnectTimer(session, this.clearTimeoutFn);
  }

  clearRemoteReconnectStabilizeTimer(session) {
    clearSessionManagerRemoteReconnectStabilizeTimer(session, this.clearTimeoutFn);
  }

  clearRemoteReconnectTimers(session) {
    clearSessionManagerRemoteReconnectTimers(session, this.clearTimeoutFn);
  }

  clearPendingLaunchPostStartInput(session) {
    clearSessionManagerPendingLaunchPostStartInput(session, this.clearTimeoutFn);
  }

  clearStartupTerminalQueryFallback(session) {
    clearSessionManagerStartupTerminalQueryFallback(session);
  }

  clearExpectedExitReason(session) {
    clearSessionManagerExpectedExitReason(session, this.clearTimeoutFn);
  }

  emitSessionActivityStarted(session, timestamp) {
    session.meta.activityState = SESSION_ACTIVITY_STATE_ACTIVE;
    session.meta.activityUpdatedAt = timestamp;
    session.meta.activityCompletedAt = null;
    session.meta.updatedAt = timestamp;
    const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: "pty"
    });
    this.updateSessionTraceSeed(session, trace, { source: "pty" });
    this.events.emit("session.activity.started", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      session: session.meta,
      trace
    });
  }

  emitSessionActivityCompleted(session, timestamp) {
    session.activityTimer = null;
    if (!session || session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
      return;
    }
    session.meta.activityState = SESSION_ACTIVITY_STATE_INACTIVE;
    session.meta.activityUpdatedAt = timestamp;
    session.meta.activityCompletedAt = timestamp;
    session.meta.updatedAt = timestamp;
    const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: "pty"
    });
    this.updateSessionTraceSeed(session, trace, { source: "pty" });
    this.events.emit("session.activity.completed", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      activityCompletedAt: session.meta.activityCompletedAt,
      session: session.meta,
      trace
    });
    if (session.pendingLaunchPostStartInput?.observedPtyData === true) {
      this.scheduleLaunchPostStartInputDispatch(session, "activity_completed");
    }
  }

  scheduleSessionActivityCompletion(session) {
    if (!session) {
      return;
    }
    this.clearSessionActivityTimer(session);
    session.activityTimer = this.setTimeoutFn(() => {
      if (!this.sessions.has(session.id)) {
        return;
      }
      this.emitSessionActivityCompleted(session, this.nowFn());
    }, this.sessionActivityQuietMs);
  }

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
    return this.launchRuntime.buildLaunchBundle({
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
  }

  markRemoteSessionConnected(session, timestamp = this.nowFn()) {
    return this.launchRuntime.markRemoteSessionConnected(session, timestamp);
  }

  markRemoteSessionUnavailable(session, connectivityState, timestamp, details = {}) {
    return this.launchRuntime.markRemoteSessionUnavailable(session, connectivityState, timestamp, details);
  }

  attachPtyProcess(session, { ptyProcess, shellAdapter, launchSpec }) {
    session.ptyProcess = ptyProcess;
    session.shellAdapter = shellAdapter;
    session.cwdTrackingBuffer = "";
    session.replayShellBlockTrackingSupported = shellAdapter?.capability?.shellBlockTrackingSupported === true;
    this.scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs: this.foregroundProcessRefreshDelayMs
    });
    attachNodePtyAsyncWritePatch(ptyProcess, {
      ...this.nodePtyAsyncWriteOptions,
      onAsyncWriteEvent: (event) => {
        this.handleAsyncPtyWriteEvent(session, event);
      }
    });
    ptyProcess.onData((data) => {
      let timestamp = null;
      let trace = null;
      const getTimestamp = () => {
        if (!Number.isInteger(timestamp)) {
          timestamp = this.nowFn();
        }
        return timestamp;
      };
      const getTrace = () => {
        if (!trace) {
          trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
            sessionId: session.id,
            source: "pty"
          });
          this.updateSessionTraceSeed(session, trace, { source: "pty" });
        }
        return trace;
      };
      this.observeStartupTerminalQueryFallback(session, {
        rawData: typeof data === "string" ? data : String(data ?? "")
      });
      const signalResult = this.observeSessionTerminalSignals(session, data, {
        updatedAt: getTimestamp()
      });
      const streamResult = session.shellAdapter.consumeOutput(session, data);
      const cleaned = typeof streamResult?.cleaned === "string" ? streamResult.cleaned : "";
      const promptBoundaries = Array.isArray(streamResult?.promptBoundaries) ? streamResult.promptBoundaries : [];
      const outputHintResult = cleaned
        ? this.observeSessionOutputHeuristics(session, cleaned, {
            updatedAt: getTimestamp()
          })
        : {
            candidateMatched: false,
            appIdentityChanged: false,
            metaChanged: false
          };
      if (this.captureSessionStreamChunk) {
        this.captureSessionStreamChunk({
          session: session.meta,
          rawData: typeof data === "string" ? data : "",
          cleanedData: cleaned,
          promptBoundaries,
          terminalSignalKinds: Array.isArray(signalResult?.signals)
            ? signalResult.signals
                .map((entry) => (typeof entry?.kind === "string" ? entry.kind : ""))
                .filter(Boolean)
            : [],
          trace: getTrace()
        });
      }
      if (!cleaned && promptBoundaries.length > 0) {
        if (signalResult.metaChanged) {
          this.emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: getTimestamp()
          });
        }
        this.appendReplayOutput(session, "", promptBoundaries);
        this.events.emit("session.data", {
          sessionId: session.id,
          data: "",
          promptBoundaries,
          trace: getTrace()
        });
        this.scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: this.foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
        return;
      }
      this.observePendingLaunchPostStartInput(session, {
        rawData: typeof data === "string" ? data : "",
        promptBoundaries
      });
      if (cleaned) {
        const activityTimestamp = getTimestamp();
        if (session.meta.kind === SESSION_KIND_SSH && session.meta.remoteRuntime?.connectivityState !== "connected") {
          this.markRemoteSessionConnected(session, activityTimestamp);
        }
        session.lastActivityAt = activityTimestamp;
        if (session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
          this.emitSessionActivityStarted(session, activityTimestamp);
        } else {
          session.meta.updatedAt = activityTimestamp;
        }
        if (signalResult.metaChanged || outputHintResult.metaChanged) {
          this.emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: activityTimestamp
          });
        }
        this.appendReplayOutput(session, cleaned, promptBoundaries);
        this.scheduleSessionActivityCompletion(session);
        this.events.emit("session.data", {
          sessionId: session.id,
          data: cleaned,
          promptBoundaries,
          trace: getTrace()
        });
        this.scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: this.foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
      } else if (signalResult.signals.length > 0) {
        if (signalResult.metaChanged) {
          this.emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: getTimestamp()
          });
        }
        this.scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: this.foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
      }
    });

    ptyProcess.onExit((exit) => {
      this.handlePtyExit(session, exit);
    });

  }

  dispatchLaunchPostStartInput(session) {
    return this.startupRuntime.dispatchLaunchPostStartInput(session);
  }

  scheduleLaunchPostStartInputDispatch(session, _reason = "", delayMs = 0) {
    return this.startupRuntime.scheduleLaunchPostStartInputDispatch(session, _reason, delayMs);
  }

  armLaunchPostStartInput(session, launchSpec, options = {}) {
    return this.startupRuntime.armLaunchPostStartInput(session, launchSpec, options);
  }

  observePendingLaunchPostStartInput(session, { rawData = "", promptBoundaries = [] } = {}) {
    return this.startupRuntime.observePendingLaunchPostStartInput(session, { rawData, promptBoundaries });
  }

  observeStartupTerminalQueryFallback(session, { rawData = "", trace = null } = {}) {
    return this.startupRuntime.observeStartupTerminalQueryFallback(session, { rawData, trace });
  }

  handleAsyncPtyWriteEvent(session, event = {}) {
    if (!session) {
      return;
    }
    const trace = createTraceEnvelope(this.createTraceId, event.trace || session.traceSeed, {
      sessionId: session.id,
      source: event.trace?.source || session.traceSeed?.source || "pty"
    });
    this.events.emit("session.input.write", {
      sessionId: session.id,
      phase: typeof event.phase === "string" && event.phase ? event.phase : "failed",
      writeKind: typeof event.writeKind === "string" && event.writeKind ? event.writeKind : "direct",
      bytes: Number.isInteger(event.bytes) ? event.bytes : 0,
      ...(event.error ? { error: event.error } : {}),
      ...(typeof event.code === "string" && event.code ? { code: event.code } : {}),
      ...(typeof event.failureStage === "string" && event.failureStage ? { failureStage: event.failureStage } : {}),
      ...(Number.isInteger(event.retryCount) ? { retryCount: event.retryCount } : {}),
      ...(Number.isInteger(event.queueDroppedCount) ? { queueDroppedCount: event.queueDroppedCount } : {}),
      ...(event.droppedByQueueFailure === true ? { droppedByQueueFailure: true } : {}),
      ...(event.retryable === true ? { retryable: true } : {}),
      trace
    });
  }

  buildReconnectUnavailableError(session) {
    return this.launchRuntime.buildReconnectUnavailableError(session);
  }

  scheduleRemoteReconnect(session, details = {}) {
    return this.launchRuntime.scheduleRemoteReconnect(session, details);
  }

  attemptRemoteReconnect(sessionId, reason = "ssh-transport-exit") {
    return this.launchRuntime.attemptRemoteReconnect(sessionId, reason);
  }

  handlePtyExit(session, exit) {
    return this.launchRuntime.handlePtyExit(session, exit);
  }

  list() {
    return Array.from(this.sessions.values()).map((session) => session.meta);
  }

  buildReplayRetentionResult(value, maxChars = this.sessionReplayMemoryMaxChars) {
    return this.replayRuntime.buildReplayRetentionResult(value, maxChars);
  }

  buildReplayRetentionState(value, shellBlocks = [], currentShellBlockStart = null, maxChars = this.sessionReplayMemoryMaxChars) {
    return this.replayRuntime.buildReplayRetentionState(value, shellBlocks, currentShellBlockStart, maxChars);
  }

  appendReplayOutput(session, cleaned, promptBoundaries = []) {
    return this.replayRuntime.appendReplayOutput(session, cleaned, promptBoundaries);
  }

  trimReplayOutput(value, maxChars = this.sessionReplayMemoryMaxChars) {
    return this.replayRuntime.trimReplayOutput(value, maxChars);
  }

  getSnapshot({ outputMaxChars, includeTruncationMetadata = false, includeEmptyOutputs = false } = {}) {
    return this.replayRuntime.getSnapshot(this.sessions.values(), {
      outputMaxChars,
      includeTruncationMetadata,
      includeEmptyOutputs
    });
  }

  getReplayExport(sessionId) {
    const session = this.get(sessionId);
    return this.replayRuntime.getReplayExport(session);
  }

  getReplayExcerpt(sessionId, selectorText) {
    const session = this.get(sessionId);
    return this.replayRuntime.getReplayExcerpt(sessionId, session, selectorText);
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    return session;
  }

  emitSessionUpdated(session, { trace = null, updatedAt = this.nowFn() } = {}) {
    const updateTrace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: trace?.source || session.traceSeed?.source || "runtime"
    });
    this.updateSessionTraceSeed(session, updateTrace, {
      sessionId: session.id,
      source: updateTrace.source || "runtime"
    });
    session.meta.updatedAt = updatedAt;
    this.events.emit("session.updated", {
      session: session.meta,
      trace: updateTrace
    });
    return updateTrace;
  }

  applySessionAppIdentity(session, nextIdentity, { emitUpdatedEvent = false, trace = null, updatedAt = this.nowFn() } = {}) {
    return this.appIdentityRuntime.applySessionAppIdentity(session, nextIdentity, {
      emitUpdatedEvent,
      trace,
      updatedAt
    });
  }

  reconcileSessionAppIdentity(
    session,
    candidateUpdates,
    { emitUpdatedEvent = false, trace = null, updatedAt = this.nowFn(), metaChanged = false } = {}
  ) {
    return this.appIdentityRuntime.reconcileSessionAppIdentity(session, candidateUpdates, {
      emitUpdatedEvent,
      trace,
      updatedAt,
      metaChanged
    });
  }

  refreshSessionAppIdentity(sessionId, options = {}) {
    const session = typeof sessionId === "string" ? this.get(sessionId) : sessionId;
    return this.appIdentityRuntime.refreshSessionAppIdentity(session, options);
  }

  setSessionAppIdentity(sessionId, appIdentity, options = {}) {
    const session = this.get(sessionId);
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : this.nowFn();
    return this.applySessionAppIdentity(session, appIdentity, {
      emitUpdatedEvent: options.emitUpdatedEvent !== false,
      trace: options.trace || null,
      updatedAt
    });
  }

  refreshSessionForegroundProcessIdentity(sessionId, options = {}) {
    const session = typeof sessionId === "string" ? this.get(sessionId) : sessionId;
    return this.appIdentityRuntime.refreshSessionForegroundProcessIdentity(session, options);
  }

  observeSessionTerminalSignals(session, chunk, options = {}) {
    return this.appIdentityRuntime.observeSessionTerminalSignals(session, chunk, options);
  }

  observeSessionOutputHeuristics(session, output, options = {}) {
    return this.appIdentityRuntime.observeSessionOutputHeuristics(session, output, options);
  }

  scheduleSessionForegroundProcessIdentityRefresh(
    session,
    { delayMs = this.foregroundProcessRefreshDelayMs, trace = null } = {}
  ) {
    return this.appIdentityRuntime.scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs,
      trace
    });
  }

  transitionToRunning(session) {
    if (!session || session.meta.state === SESSION_STATE_RUNNING) {
      return session?.meta || null;
    }
    const timestamp = this.nowFn();
    session.meta.state = SESSION_STATE_RUNNING;
    session.meta.startedAt = Number.isInteger(session.meta.startedAt) ? session.meta.startedAt : timestamp;
    const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: session.traceSeed?.source || "rest"
    });
    this.updateSessionTraceSeed(session, trace, { source: session.traceSeed?.source || "rest" });
    this.events.emit("session.started", {
      sessionId: session.id,
      startedAt: session.meta.startedAt,
      updatedAt: session.meta.updatedAt,
      session: session.meta,
      trace
    });
    this.events.emit("session.updated", {
      session: session.meta,
      trace: createTraceEnvelope(this.createTraceId, session.traceSeed, {
        sessionId: session.id,
        source: session.traceSeed?.source || "rest"
      })
    });
    return session.meta;
  }

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
    trace
  } = {}) {
    return this.sessionRuntime.createSession({
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
      trace
    });
  }

  delete(sessionId, options = {}) {
    this.closeWithReason(sessionId, "deleted", options);
  }

  sendInput(sessionId, data, options = {}) {
    const session = this.get(sessionId);
    if (!session.ptyProcess) {
      throw this.buildReconnectUnavailableError(session);
    }
    this.updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    const eventTrace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId,
      source: options.trace?.source || session.traceSeed?.source || "rest"
    });
    const writeKind = typeof options.writeKind === "string" && options.writeKind.trim() ? options.writeKind.trim() : "direct";
    const bytes = Buffer.byteLength(String(data || ""), "utf8");
    this.events.emit("session.input.write", {
      sessionId,
      phase: "attempt",
      writeKind,
      bytes,
      trace: eventTrace
    });
    queueNodePtyAsyncWriteMeta(session.ptyProcess, {
      sessionId,
      writeKind,
      bytes,
      trace: eventTrace
    });
    try {
      session.ptyProcess.write(data);
    } catch (error) {
      clearNodePtyAsyncWriteMeta(session.ptyProcess);
      this.events.emit("session.input.write", {
        sessionId,
        phase: "failed",
        writeKind,
        bytes,
        error: error instanceof Error ? error.message : String(error || "write failed"),
        trace: eventTrace
      });
      throw error;
    }
    this.events.emit("session.input.write", {
      sessionId,
      phase: "ok",
      writeKind,
      bytes,
      trace: eventTrace
    });
    const timestamp = this.nowFn();
    if (options.customCommandUsage) {
      session.meta.quickSendUsage = recordQuickSendUsageEntry(session.meta.quickSendUsage, options.customCommandUsage, {
        usedAt: timestamp
      });
    }
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
    this.scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs: this.foregroundProcessRefreshDelayMs,
      trace: options.trace || null
    });
  }

  resize(sessionId, cols, rows, options = {}) {
    const session = this.get(sessionId);
    if (!session.ptyProcess) {
      throw this.buildReconnectUnavailableError(session);
    }
    this.updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    session.ptyProcess.resize(cols, rows);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  signal(sessionId, signal, options = {}) {
    const session = this.get(sessionId);
    if (!session.ptyProcess) {
      throw this.buildReconnectUnavailableError(session);
    }
    this.updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    this.clearExpectedExitReason(session);
    session.expectedExitReason = signal || "signal";
    session.expectedExitReasonTimer = this.setTimeoutFn(() => {
      session.expectedExitReasonTimer = null;
      session.expectedExitReason = "";
    }, 250);
    session.ptyProcess.kill(signal);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  interrupt(sessionId, options = {}) {
    this.signal(sessionId, "SIGINT", options);
  }

  terminate(sessionId, options = {}) {
    this.signal(sessionId, "SIGTERM", options);
  }

  kill(sessionId, options = {}) {
    this.signal(sessionId, "SIGKILL", options);
  }

  updateSession(sessionId, patch = {}, options = {}) {
    const session = this.get(sessionId);
    this.updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    const { updatedAt } = applySessionPatch(session, patch, {
      defaultShell: this.defaultShell,
      remoteReconnectMaxAttempts: this.remoteReconnectMaxAttempts,
      remoteReconnectDelayMs: this.remoteReconnectDelayMs,
      clearRemoteReconnectTimers: (currentSession) => this.clearRemoteReconnectTimers(currentSession),
      clearExpectedExitReason: (currentSession) => this.clearExpectedExitReason(currentSession),
      nowFn: this.nowFn
    });
    const refreshedIdentity = this.refreshSessionAppIdentity(session, {
      updatedAt
    });
    session.meta.appIdentity = refreshedIdentity;
    return session.meta;
  }

  rename(sessionId, name) {
    return this.updateSession(sessionId, { name });
  }

  restart(sessionId, options = {}) {
    return this.sessionRuntime.restartSession(sessionId, options);
  }

  closeWithReason(sessionId, reason, options = {}) {
    return this.sessionRuntime.closeSessionWithReason(sessionId, reason, options);
  }

  enforceGuardrails(currentTime = this.nowFn()) {
    return this.sessionRuntime.enforceGuardrails(currentTime);
  }

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  off(eventName, listener) {
    this.events.off(eventName, listener);
  }
}
