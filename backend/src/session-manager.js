import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { createSessionManagerRuntimeAssembly } from "./session-manager-runtime-assembly.js";
import { createSessionManagerRuntimeFacade } from "./session-manager-runtime-facade.js";

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const SESSION_MANAGER_DIRNAME = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SSH_ASKPASS_PATH = join(SESSION_MANAGER_DIRNAME, "../libexec/ssh-askpass.sh");
const DEFAULT_SSH_KNOWN_HOSTS_PATH = join(SESSION_MANAGER_DIRNAME, "../data/ssh_known_hosts");
const DEFAULT_SESSION_ACTIVITY_QUIET_MS = 1400;
const DEFAULT_REMOTE_RECONNECT_STABLE_MS = 500;
const DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS = 90;
const DEFAULT_STARTUP_POST_INPUT_FALLBACK_MS = 1500;
const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS = 15000;
const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES = 4;

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
    this.inspectTerminalForegroundProcess = inspectTerminalForegroundProcess;
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
    const runtimeAssembly = createSessionManagerRuntimeAssembly({
      sessions: this.sessions,
      defaultShell: this.defaultShell,
      sessionMaxConcurrent: this.sessionMaxConcurrent,
      sessionIdleTimeoutMs: this.sessionIdleTimeoutMs,
      sessionMaxLifetimeMs: this.sessionMaxLifetimeMs,
      sessionReplayMemoryMaxChars: this.sessionReplayMemoryMaxChars,
      sessionActivityQuietMs: this.sessionActivityQuietMs,
      remoteReconnectMaxAttempts: this.remoteReconnectMaxAttempts,
      remoteReconnectDelayMs: this.remoteReconnectDelayMs,
      remoteReconnectStableMs: this.remoteReconnectStableMs,
      sshAskpassPath: this.sshAskpassPath,
      sshKnownHostsPath: this.sshKnownHostsPath,
      resolveSshTrustedHostKeyTypes: this.resolveSshTrustedHostKeyTypes,
      baseEnv: process.env,
      createPty: this.createPty,
      nowFn: this.nowFn,
      setTimeoutFn: this.setTimeoutFn,
      createTraceId: this.createTraceId,
      inspectTerminalForegroundProcess: this.inspectTerminalForegroundProcess,
      foregroundProcessRefreshDelayMs: this.foregroundProcessRefreshDelayMs,
      startupPostInputFallbackMs: this.startupPostInputFallbackMs,
      startupTerminalQueryFallbackWindowMs: DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS,
      startupTerminalQueryFallbackMaxResponses: DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES,
      captureSessionStreamChunk: this.captureSessionStreamChunk,
      nodePtyAsyncWriteOptions: this.nodePtyAsyncWriteOptions,
      emitEvent: (eventName, payload) => this.events.emit(eventName, payload),
      clearExpectedExitReason: (session) => this.clearExpectedExitReason(session),
      clearRemoteReconnectTimers: (session) => this.clearRemoteReconnectTimers(session),
      clearSessionActivityTimer: (session) => this.clearSessionActivityTimer(session),
      clearLaunchPostStartInputTimer: (session) => this.clearLaunchPostStartInputTimer(session),
      clearPendingLaunchPostStartInput: (session) => this.clearPendingLaunchPostStartInput(session),
      clearStartupTerminalQueryFallback: (session) => this.clearStartupTerminalQueryFallback(session),
      clearForegroundProcessRefreshTimer: (session) => this.clearForegroundProcessRefreshTimer(session),
      clearRemoteReconnectStabilizeTimer: (session) => this.clearRemoteReconnectStabilizeTimer(session),
      attachPtyProcess: (session, launchBundle) => this.attachPtyProcess(session, launchBundle),
      emitSessionUpdated: (session, options) => this.emitSessionUpdated(session, options),
      getSessionById: (sessionId) => this.sessions.get(sessionId),
      getSessionOrThrow: (sessionId) => this.get(sessionId),
      removeSessionById: (sessionId) => this.sessions.delete(sessionId),
      sendInput: (sessionId, data, options) => this.sendInput(sessionId, data, options),
      updateSessionTraceSeed: (session, trace, overrides = {}) => this.updateSessionTraceSeed(session, trace, overrides),
      transitionToRunning: (session) => this.transitionToRunning(session),
      armLaunchPostStartInput: (session, launchSpec, options = {}) =>
        this.armLaunchPostStartInput(session, launchSpec, options),
      scheduleLaunchPostStartInputDispatch: (session, reason, delayMs = 0) =>
        this.scheduleLaunchPostStartInputDispatch(session, reason, delayMs),
      buildReconnectUnavailableError: (session) => this.buildReconnectUnavailableError(session),
      appendReplayOutput: (session, cleaned, promptBoundaries = []) =>
        this.appendReplayOutput(session, cleaned, promptBoundaries),
      observePendingLaunchPostStartInput: (session, options = {}) =>
        this.observePendingLaunchPostStartInput(session, options),
      observeStartupTerminalQueryFallback: (session, options = {}) =>
        this.observeStartupTerminalQueryFallback(session, options),
      observeSessionTerminalSignals: (session, chunk, options = {}) =>
        this.observeSessionTerminalSignals(session, chunk, options),
      observeSessionOutputHeuristics: (session, output, options = {}) =>
        this.observeSessionOutputHeuristics(session, output, options),
      markRemoteSessionConnected: (session, timestamp) => this.markRemoteSessionConnected(session, timestamp),
      emitSessionActivityStarted: (session, timestamp) => this.emitSessionActivityStarted(session, timestamp),
      scheduleSessionActivityCompletion: (session) => this.scheduleSessionActivityCompletion(session),
      scheduleSessionForegroundProcessIdentityRefresh: (session, options = {}) =>
        this.scheduleSessionForegroundProcessIdentityRefresh(session, options),
      handleAsyncPtyWriteEvent: (session, event = {}) => this.handleAsyncPtyWriteEvent(session, event),
      handlePtyExit: (session, exit) => this.handlePtyExit(session, exit)
    });
    this.traceRuntime = runtimeAssembly.traceRuntime;
    this.launchRuntime = runtimeAssembly.launchRuntime;
    this.terminalRuntime = runtimeAssembly.terminalRuntime;
    this.startupRuntime = runtimeAssembly.startupRuntime;
    this.replayRuntime = runtimeAssembly.replayRuntime;
    this.appIdentityRuntime = runtimeAssembly.appIdentityRuntime;
    this.sessionRuntime = runtimeAssembly.sessionRuntime;
    this.mutationRuntime = runtimeAssembly.mutationRuntime;
    this.ptyRuntime = runtimeAssembly.ptyRuntime;
    Object.assign(this, createSessionManagerRuntimeFacade({
      sessions: this.sessions,
      nowFn: this.nowFn,
      foregroundProcessRefreshDelayMs: this.foregroundProcessRefreshDelayMs,
      sessionReplayMemoryMaxChars: this.sessionReplayMemoryMaxChars,
      launchRuntime: this.launchRuntime,
      ptyRuntime: this.ptyRuntime,
      startupRuntime: this.startupRuntime,
      terminalRuntime: this.terminalRuntime,
      replayRuntime: this.replayRuntime,
      mutationRuntime: this.mutationRuntime,
      sessionRuntime: this.sessionRuntime
    }));
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

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  off(eventName, listener) {
    this.events.off(eventName, listener);
  }
}
