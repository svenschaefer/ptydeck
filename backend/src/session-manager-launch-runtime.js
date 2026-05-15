import { homedir } from "node:os";

import { ApiError } from "./errors.js";
import { buildSessionLaunchSpec, normalizeLocalShellCommand, resolveLocalShellCommand } from "./session-launch-spec.js";
import {
  buildReconnectUnavailableErrorDetails,
  buildRemoteReconnectAttemptState,
  buildRemoteRuntimeConnectedState,
  buildRemoteRuntimeUnavailableState,
  planRemoteReconnectFailure,
  planRemoteReconnectSchedule
} from "./session-manager-remote-runtime.js";
import { createShellAdapter } from "./shell-adapter.js";

const SESSION_KIND_SSH = "ssh";
const SESSION_ACTIVITY_STATE_INACTIVE = "inactive";
const SESSION_STATE_EXITED = "exited";
const SESSION_STATE_STOPPED = "stopped";

function normalizeEnv(env) {
  return env && typeof env === "object" && !Array.isArray(env) ? env : {};
}

export function createSessionManagerLaunchRuntime(dependencies = {}) {
  const baseEnv = dependencies.baseEnv && typeof dependencies.baseEnv === "object" ? dependencies.baseEnv : process.env;
  const createPty = typeof dependencies.createPty === "function" ? dependencies.createPty : () => null;
  const resolveLocalShellCommandFn =
    typeof dependencies.resolveLocalShellCommand === "function"
      ? dependencies.resolveLocalShellCommand
      : (shell) => resolveLocalShellCommand(shell, { pathEnv: baseEnv.PATH });
  const sshAskpassPath = typeof dependencies.sshAskpassPath === "string" ? dependencies.sshAskpassPath : "";
  const sshKnownHostsPath = typeof dependencies.sshKnownHostsPath === "string" ? dependencies.sshKnownHostsPath : "";
  const resolveSshTrustedHostKeyTypes =
    typeof dependencies.resolveSshTrustedHostKeyTypes === "function" ? dependencies.resolveSshTrustedHostKeyTypes : null;
  const remoteReconnectMaxAttempts =
    Number.isInteger(dependencies.remoteReconnectMaxAttempts) && dependencies.remoteReconnectMaxAttempts >= 0
      ? dependencies.remoteReconnectMaxAttempts
      : 3;
  const remoteReconnectDelayMs =
    Number.isInteger(dependencies.remoteReconnectDelayMs) && dependencies.remoteReconnectDelayMs > 0
      ? dependencies.remoteReconnectDelayMs
      : 1500;
  const remoteReconnectStableMs =
    Number.isInteger(dependencies.remoteReconnectStableMs) && dependencies.remoteReconnectStableMs > 0
      ? dependencies.remoteReconnectStableMs
      : 500;
  const nowFn = typeof dependencies.nowFn === "function" ? dependencies.nowFn : Date.now;
  const setTimeoutFn = typeof dependencies.setTimeoutFn === "function" ? dependencies.setTimeoutFn : setTimeout;
  const homedirFn = typeof dependencies.homedirFn === "function" ? dependencies.homedirFn : homedir;
  const clearExpectedExitReason =
    typeof dependencies.clearExpectedExitReason === "function" ? dependencies.clearExpectedExitReason : () => {};
  const clearRemoteReconnectTimers =
    typeof dependencies.clearRemoteReconnectTimers === "function" ? dependencies.clearRemoteReconnectTimers : () => {};
  const clearSessionActivityTimer =
    typeof dependencies.clearSessionActivityTimer === "function" ? dependencies.clearSessionActivityTimer : () => {};
  const clearLaunchPostStartInputTimer =
    typeof dependencies.clearLaunchPostStartInputTimer === "function" ? dependencies.clearLaunchPostStartInputTimer : () => {};
  const clearStartupTerminalQueryFallback =
    typeof dependencies.clearStartupTerminalQueryFallback === "function" ? dependencies.clearStartupTerminalQueryFallback : () => {};
  const clearForegroundProcessRefreshTimer =
    typeof dependencies.clearForegroundProcessRefreshTimer === "function" ? dependencies.clearForegroundProcessRefreshTimer : () => {};
  const clearRemoteReconnectStabilizeTimer =
    typeof dependencies.clearRemoteReconnectStabilizeTimer === "function"
      ? dependencies.clearRemoteReconnectStabilizeTimer
      : () => {};
  const attachPtyProcess = typeof dependencies.attachPtyProcess === "function" ? dependencies.attachPtyProcess : () => {};
  const emitSessionUpdated = typeof dependencies.emitSessionUpdated === "function" ? dependencies.emitSessionUpdated : () => {};
  const emitSessionExit = typeof dependencies.emitSessionExit === "function" ? dependencies.emitSessionExit : () => {};
  const getSessionById = typeof dependencies.getSessionById === "function" ? dependencies.getSessionById : () => null;

  function buildLocalShellNotFoundError(shell) {
    const normalizedShell = normalizeLocalShellCommand(shell);
    if (normalizedShell === "pwsh.exe") {
      return new ApiError(
        400,
        "ValidationError",
        "Local shell launcher 'pwsh.exe' was not found on the backend PATH or in supported Windows PowerShell install locations. Install PowerShell 7 or use '/new powershell'."
      );
    }
    if (normalizedShell === "powershell.exe") {
      return new ApiError(
        400,
        "ValidationError",
        "Local shell launcher 'powershell.exe' was not found on the backend PATH or in supported Windows PowerShell install locations."
      );
    }
    return new ApiError(
      400,
      "ValidationError",
      `Local shell launcher '${normalizedShell || shell || "default"}' was not found on the backend PATH.`
    );
  }

  function resolveLocalSpawnCommand(launchSpec) {
    if (!launchSpec || typeof launchSpec.command !== "string" || !launchSpec.command) {
      return "";
    }
    if (launchSpec.command === "powershell.exe" || launchSpec.command === "pwsh.exe") {
      return resolveLocalShellCommandFn(launchSpec.command);
    }
    return launchSpec.command;
  }

  function buildLaunchBundle({
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
    const launchSpec = buildSessionLaunchSpec({
      kind,
      shell,
      spawnCwd: cwd,
      startCwd,
      startCommand,
      remoteConnection,
      remoteAuth,
      remoteSecret,
      trustedHostKeyTypes:
        kind === SESSION_KIND_SSH && resolveSshTrustedHostKeyTypes && remoteConnection
          ? resolveSshTrustedHostKeyTypes(remoteConnection.host, remoteConnection.port)
          : undefined,
      sshAskpassPath,
      sshKnownHostsPath
    });
    const resolvedSpawnCommand =
      kind === SESSION_KIND_SSH ? launchSpec.command : resolveLocalSpawnCommand(launchSpec);
    if (kind !== SESSION_KIND_SSH && !resolvedSpawnCommand) {
      throw buildLocalShellNotFoundError(launchSpec.command);
    }
    const shellAdapter = createShellAdapter(launchSpec.shellAdapterId);
    const ptyEnv = shellAdapter.prepareSpawnEnv({
      ...baseEnv,
      ...normalizeEnv(env),
      ...launchSpec.ptyEnvAdditions
    });
    const ptyProcess = createPty({
      shell: resolvedSpawnCommand,
      command: resolvedSpawnCommand,
      args: launchSpec.args,
      cwd: launchSpec.spawnCwd,
      cols: 80,
      rows: 24,
      env: ptyEnv
    });
    return {
      launchSpec,
      shellAdapter,
      ptyProcess
    };
  }

  function markRemoteSessionConnected(session, timestamp = nowFn()) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return;
    }
    clearRemoteReconnectTimers(session);
    session.meta.remoteRuntime = buildRemoteRuntimeConnectedState(session.meta.remoteRuntime, timestamp, {
      reconnectMaxAttempts: remoteReconnectMaxAttempts,
      reconnectDelayMs: remoteReconnectDelayMs
    });
    session.meta.updatedAt = timestamp;
    emitSessionUpdated(session);
  }

  function markRemoteSessionUnavailable(session, connectivityState, timestamp, details = {}) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return;
    }
    session.meta.remoteRuntime = buildRemoteRuntimeUnavailableState(
      session.meta.remoteRuntime,
      connectivityState,
      timestamp,
      details,
      {
        reconnectMaxAttempts: remoteReconnectMaxAttempts,
        reconnectDelayMs: remoteReconnectDelayMs
      }
    );
    session.meta.updatedAt = timestamp;
    emitSessionUpdated(session);
  }

  function buildReconnectUnavailableError(session) {
    if (session?.meta?.state === SESSION_STATE_STOPPED) {
      return new ApiError(
        409,
        "SessionStopped",
        `Session '${session?.id || "unknown"}' is stopped. Start it before sending input, resizing, or signaling it.`
      );
    }
    const { errorCode, message } = buildReconnectUnavailableErrorDetails({
      sessionId: session?.id,
      connectivityState: session?.meta?.remoteRuntime?.connectivityState || "offline"
    });
    return new ApiError(409, errorCode, message);
  }

  function attemptRemoteReconnect(sessionId, reason = "ssh-transport-exit") {
    const session = getSessionById(sessionId);
    if (!session || session.meta.kind !== SESSION_KIND_SSH || session.expectedExitReason) {
      return;
    }
    if (session.ptyProcess) {
      return;
    }
    const timestamp = nowFn();
    session.meta.remoteRuntime = buildRemoteReconnectAttemptState(session.meta.remoteRuntime, {
      timestamp,
      reason,
      reconnectMaxAttempts: remoteReconnectMaxAttempts,
      reconnectDelayMs: remoteReconnectDelayMs
    });
    session.meta.updatedAt = timestamp;
    emitSessionUpdated(session);

    try {
      const launchBundle = buildLaunchBundle({
        kind: session.meta.kind,
        shell: session.meta.shell,
        cwd: homedirFn(),
        startCwd: session.meta.startCwd || session.meta.cwd,
        startCommand: session.meta.startCommand || "",
        env: session.meta.env || {},
        remoteConnection: session.meta.remoteConnection,
        remoteAuth: session.meta.remoteAuth,
        remoteSecret: session.remoteSecret
      });
      session.meta.cwd = launchBundle.launchSpec.metaCwd;
      session.meta.shell = launchBundle.launchSpec.command;
      clearExpectedExitReason(session);
      attachPtyProcess(session, launchBundle);
      session.remoteReconnectStabilizeTimer = setTimeoutFn(() => {
        session.remoteReconnectStabilizeTimer = null;
        if (getSessionById(session.id) !== session || session.ptyProcess !== launchBundle.ptyProcess) {
          return;
        }
        markRemoteSessionConnected(session, nowFn());
      }, remoteReconnectStableMs);
    } catch (error) {
      const retryTimestamp = nowFn();
      const failureReason = error instanceof Error && error.message ? error.message : reason;
      const reconnectPlan = planRemoteReconnectFailure(session.meta.remoteRuntime, {
        timestamp: retryTimestamp,
        reason: failureReason,
        exitCode: null,
        exitSignal: "",
        reconnectMaxAttempts: remoteReconnectMaxAttempts,
        reconnectDelayMs: remoteReconnectDelayMs
      });
      session.meta.remoteRuntime = reconnectPlan.remoteRuntime;
      session.meta.updatedAt = retryTimestamp;
      emitSessionUpdated(session);
      if (!reconnectPlan.shouldSchedule) {
        return;
      }
      session.remoteReconnectTimer = setTimeoutFn(() => {
        session.remoteReconnectTimer = null;
        attemptRemoteReconnect(session.id, failureReason);
      }, reconnectPlan.delayMs);
    }
  }

  function scheduleRemoteReconnect(session, details = {}) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return false;
    }
    clearRemoteReconnectTimers(session);
    const timestamp = Number.isInteger(details.timestamp) ? details.timestamp : nowFn();
    const reconnectPlan = planRemoteReconnectSchedule(session.meta.remoteRuntime, {
      timestamp,
      reason: details.reason,
      exitCode: details.exitCode,
      exitSignal: details.exitSignal,
      reconnectMaxAttempts: remoteReconnectMaxAttempts,
      reconnectDelayMs: remoteReconnectDelayMs
    });
    session.meta.remoteRuntime = reconnectPlan.remoteRuntime;
    session.meta.updatedAt = timestamp;
    emitSessionUpdated(session);
    if (!reconnectPlan.shouldSchedule) {
      return false;
    }
    session.remoteReconnectTimer = setTimeoutFn(() => {
      session.remoteReconnectTimer = null;
      attemptRemoteReconnect(session.id, details.reason);
    }, reconnectPlan.delayMs);
    return true;
  }

  function handlePtyExit(session, exit) {
    clearSessionActivityTimer(session);
    clearLaunchPostStartInputTimer(session);
    clearStartupTerminalQueryFallback(session);
    clearForegroundProcessRefreshTimer(session);
    clearRemoteReconnectStabilizeTimer(session);
    const exitTimestamp = nowFn();
    const exitCode = Number.isInteger(exit?.exitCode) ? exit.exitCode : null;
    const exitSignal = typeof exit?.signal === "string" ? exit.signal : "";
    session.meta.activityState = SESSION_ACTIVITY_STATE_INACTIVE;
    session.meta.activityUpdatedAt = exitTimestamp;
    session.meta.activityCompletedAt = exitTimestamp;
    session.lastActivityAt = exitTimestamp;

    const isExpectedExit = Boolean(session.expectedExitReason);
    if (session.expectedExitReason === SESSION_STATE_STOPPED) {
      clearExpectedExitReason(session);
      return;
    }
    const current = getSessionById(session.id);
    if (session.meta.kind === SESSION_KIND_SSH && !isExpectedExit && current === session) {
      session.ptyProcess = null;
      session.meta.updatedAt = exitTimestamp;
      scheduleRemoteReconnect(session, {
        timestamp: exitTimestamp,
        reason: "ssh-transport-exit",
        exitCode,
        exitSignal
      });
      return;
    }

    session.meta.state = SESSION_STATE_EXITED;
    session.meta.exitCode = exitCode;
    session.meta.exitSignal = exitSignal;
    session.meta.exitedAt = exitTimestamp;
    session.meta.updatedAt = exitTimestamp;
    emitSessionExit(session, {
      exitCode,
      exitSignal,
      exitTimestamp
    });
  }

  return {
    attemptRemoteReconnect,
    buildLaunchBundle,
    buildReconnectUnavailableError,
    handlePtyExit,
    markRemoteSessionConnected,
    markRemoteSessionUnavailable,
    scheduleRemoteReconnect
  };
}
