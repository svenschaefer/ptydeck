import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./errors.js";
import { normalizeSessionInputSafetyProfile } from "./session-input-safety-profile.js";
import { normalizeSessionMouseForwardingMode } from "./session-mouse-forwarding.js";
import { createShellAdapter } from "./shell-adapter.js";

function now() {
  return Date.now();
}

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const DEFAULT_SSH_CLIENT = "ssh";
const DEFAULT_SSH_PORT = 22;
const SESSION_KIND_LOCAL = "local";
const SESSION_KIND_SSH = "ssh";
const SSH_AUTH_METHOD_PASSWORD = "password";
const SSH_AUTH_METHOD_PRIVATE_KEY = "privateKey";
const SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE = "keyboardInteractive";
const THEME_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_NOTE_MAX_LENGTH = 512;
const REMOTE_HOST_MAX_LENGTH = 255;
const REMOTE_USERNAME_MAX_LENGTH = 64;
const REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH = 1024;
const REMOTE_SECRET_MAX_LENGTH = 4096;
const REMOTE_NON_WHITESPACE_PATTERN = /^\S+$/;
const SESSION_MANAGER_DIRNAME = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SSH_ASKPASS_PATH = join(SESSION_MANAGER_DIRNAME, "../libexec/ssh-askpass.sh");
const DEFAULT_SSH_KNOWN_HOSTS_PATH = join(SESSION_MANAGER_DIRNAME, "../data/ssh_known_hosts");
const DEFAULT_SESSION_THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};
const SESSION_STATE_STARTING = "starting";
const SESSION_STATE_RUNNING = "running";
const SESSION_STATE_EXITED = "exited";
const SESSION_ACTIVITY_STATE_ACTIVE = "active";
const SESSION_ACTIVITY_STATE_INACTIVE = "inactive";
const DEFAULT_SESSION_ACTIVITY_QUIET_MS = 1400;
const REMOTE_CONNECTIVITY_CONNECTED = "connected";
const REMOTE_CONNECTIVITY_DEGRADED = "degraded";
const REMOTE_CONNECTIVITY_OFFLINE = "offline";
const DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS = 3;
const DEFAULT_REMOTE_RECONNECT_DELAY_MS = 1500;
const DEFAULT_REMOTE_RECONNECT_STABLE_MS = 500;
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

function normalizeSessionEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeSessionThemeProfile(themeProfile) {
  const input = themeProfile && typeof themeProfile === "object" && !Array.isArray(themeProfile) ? themeProfile : {};
  const normalized = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_SESSION_THEME_PROFILE)) {
    const candidate = typeof input[key] === "string" ? input[key] : defaultValue;
    normalized[key] = THEME_COLOR_HEX_PATTERN.test(candidate) ? candidate : defaultValue;
  }
  return normalized;
}

function normalizeSessionThemeSlots({ themeProfile, activeThemeProfile, inactiveThemeProfile } = {}) {
  const fallbackTheme = normalizeSessionThemeProfile(themeProfile);
  const normalizedActiveThemeProfile =
    activeThemeProfile !== undefined
      ? normalizeSessionThemeProfile(activeThemeProfile)
      : fallbackTheme;
  const normalizedInactiveThemeProfile =
    inactiveThemeProfile !== undefined
      ? normalizeSessionThemeProfile(inactiveThemeProfile)
      : fallbackTheme;
  return {
    themeProfile: normalizedActiveThemeProfile,
    activeThemeProfile: normalizedActiveThemeProfile,
    inactiveThemeProfile: normalizedInactiveThemeProfile
  };
}

function normalizeSessionTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of tags) {
    if (typeof entry !== "string") {
      continue;
    }
    const candidate = entry.trim().toLowerCase();
    if (!candidate || !SESSION_TAG_PATTERN.test(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  normalized.sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
  return normalized;
}

function normalizeSessionNote(note) {
  if (typeof note !== "string") {
    return undefined;
  }
  const normalized = note
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > SESSION_NOTE_MAX_LENGTH) {
    return normalized.slice(0, SESSION_NOTE_MAX_LENGTH);
  }
  return normalized;
}

function normalizeQuickIdToken(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeSessionKind(kind) {
  return String(kind || "").trim().toLowerCase() === SESSION_KIND_SSH ? SESSION_KIND_SSH : SESSION_KIND_LOCAL;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRemoteConnection(remoteConnection, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteConnection !== undefined && remoteConnection !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteConnection' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (!remoteConnection || typeof remoteConnection !== "object" || Array.isArray(remoteConnection)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection' is required for ssh sessions and must be an object."
    );
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(remoteConnection, unsupportedField)) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteConnection.${unsupportedField}' is not supported in the H38 remote baseline.`
      );
    }
  }
  const host = typeof remoteConnection.host === "string" ? remoteConnection.host.trim() : "";
  if (!host || host.length > REMOTE_HOST_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(host)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection.host' must be a non-empty hostname or address without whitespace."
    );
  }
  const port =
    remoteConnection.port === undefined || remoteConnection.port === null ? DEFAULT_SSH_PORT : Number(remoteConnection.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(400, "ValidationError", "Field 'remoteConnection.port' must be an integer between 1 and 65535.");
  }
  const usernameRaw = typeof remoteConnection.username === "string" ? remoteConnection.username.trim() : "";
  if (
    usernameRaw &&
    (usernameRaw.length > REMOTE_USERNAME_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(usernameRaw))
  ) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection.username' must be a non-empty token without whitespace."
    );
  }
  return {
    host,
    port,
    ...(usernameRaw ? { username: usernameRaw } : {})
  };
}

function normalizeRemoteAuth(remoteAuth, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteAuth !== undefined && remoteAuth !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteAuth' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (remoteAuth === undefined || remoteAuth === null) {
    return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
  }
  if (!isPlainObject(remoteAuth)) {
    throw new ApiError(400, "ValidationError", "Field 'remoteAuth' must be an object for ssh sessions.");
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(remoteAuth, unsupportedField)) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteAuth.${unsupportedField}' is not supported in the H38 authentication baseline.`
      );
    }
  }
  const methodRaw =
    typeof remoteAuth.method === "string" && remoteAuth.method.trim()
      ? remoteAuth.method.trim()
      : SSH_AUTH_METHOD_PRIVATE_KEY;
  const method = methodRaw;
  if (
    method !== SSH_AUTH_METHOD_PASSWORD &&
    method !== SSH_AUTH_METHOD_PRIVATE_KEY &&
    method !== SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  ) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteAuth.method' must be 'password', 'privateKey', or 'keyboardInteractive'."
    );
  }
  const privateKeyPath =
    typeof remoteAuth.privateKeyPath === "string" ? remoteAuth.privateKeyPath.trim() : "";
  if (method !== SSH_AUTH_METHOD_PRIVATE_KEY && privateKeyPath) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteAuth.privateKeyPath' is only supported for privateKey ssh auth."
    );
  }
  if (privateKeyPath && privateKeyPath.length > REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'remoteAuth.privateKeyPath' must not exceed ${REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH} characters.`
    );
  }
  return {
    method,
    ...(privateKeyPath ? { privateKeyPath } : {})
  };
}

function remoteAuthRequiresSecret(remoteAuth) {
  if (!remoteAuth) {
    return false;
  }
  return (
    remoteAuth.method === SSH_AUTH_METHOD_PASSWORD ||
    remoteAuth.method === SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  );
}

function normalizeRemoteSecret(remoteSecret, remoteAuth, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteSecret !== undefined && remoteSecret !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteSecret' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (remoteSecret === undefined || remoteSecret === null) {
    if (remoteAuthRequiresSecret(remoteAuth)) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteSecret' is required for password and keyboardInteractive ssh auth."
      );
    }
    return undefined;
  }
  if (!remoteAuthRequiresSecret(remoteAuth)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteSecret' is only supported for password and keyboardInteractive ssh auth."
    );
  }
  if (typeof remoteSecret !== "string" || remoteSecret.length < 1 || remoteSecret.length > REMOTE_SECRET_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'remoteSecret' must be a non-empty string up to ${REMOTE_SECRET_MAX_LENGTH} characters.`
    );
  }
  return remoteSecret;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function buildSshRemoteCommand({ startCwd, startCommand }) {
  const steps = [];
  if (typeof startCwd === "string" && startCwd.trim() && startCwd.trim() !== "~") {
    steps.push(`cd -- ${shellQuote(startCwd.trim())} >/dev/null 2>&1 || true`);
  }
  if (typeof startCommand === "string" && startCommand.trim()) {
    steps.push(startCommand);
  }
  if (steps.length === 0) {
    return "";
  }
  steps.push('exec "${SHELL:-/bin/sh}" -il');
  return `sh -lc ${shellQuote(steps.join("; "))}`;
}

function buildSessionLaunchSpec({
  kind,
  shell,
  spawnCwd,
  startCwd,
  startCommand,
  remoteConnection,
  remoteAuth,
  remoteSecret,
  sshAskpassPath,
  sshKnownHostsPath
}) {
  if (kind !== SESSION_KIND_SSH) {
    return {
      shellAdapterId: shell,
      command: shell,
      args: [],
      spawnCwd,
      metaCwd: spawnCwd,
      ptyEnvAdditions: {},
      postStartInput: typeof startCommand === "string" && startCommand.trim() ? `${startCommand}\n` : ""
    };
  }

  const sshClient = typeof shell === "string" && shell.trim() ? shell.trim() : DEFAULT_SSH_CLIENT;
  const args = [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${sshKnownHostsPath}`,
    "-o",
    "GlobalKnownHostsFile=/dev/null"
  ];
  if (remoteAuth?.method === SSH_AUTH_METHOD_PASSWORD) {
    args.push(
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no",
      "-o",
      "NumberOfPasswordPrompts=1"
    );
  } else if (remoteAuth?.method === SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE) {
    args.push(
      "-o",
      "PreferredAuthentications=keyboard-interactive",
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=yes",
      "-o",
      "NumberOfPasswordPrompts=1"
    );
  } else {
    args.push(
      "-o",
      "PreferredAuthentications=publickey",
      "-o",
      "PasswordAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no"
    );
    if (typeof remoteAuth?.privateKeyPath === "string" && remoteAuth.privateKeyPath) {
      args.push("-i", remoteAuth.privateKeyPath);
    }
  }
  if (remoteConnection.port !== DEFAULT_SSH_PORT) {
    args.push("-p", String(remoteConnection.port));
  }
  if (typeof remoteConnection.username === "string" && remoteConnection.username.trim()) {
    args.push("-l", remoteConnection.username.trim());
  }
  args.push(remoteConnection.host);
  const remoteCommand = buildSshRemoteCommand({ startCwd, startCommand });
  if (remoteCommand) {
    args.push(remoteCommand);
  }

  const ptyEnvAdditions = {};
  if (remoteAuthRequiresSecret(remoteAuth)) {
    ptyEnvAdditions.DISPLAY = "ptydeck-ssh-askpass";
    ptyEnvAdditions.SSH_ASKPASS_REQUIRE = "force";
    ptyEnvAdditions.SSH_ASKPASS = sshAskpassPath;
    ptyEnvAdditions.PTYDECK_SSH_SECRET = remoteSecret;
  }

  return {
    shellAdapterId: DEFAULT_SSH_CLIENT,
    command: sshClient,
    args,
    spawnCwd: homedir(),
    metaCwd: startCwd,
    ptyEnvAdditions,
    postStartInput: ""
  };
}

function buildRemoteRuntimeMeta({
  reconnectMaxAttempts = DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS,
  reconnectDelayMs = DEFAULT_REMOTE_RECONNECT_DELAY_MS
} = {}) {
  return {
    connectivityState: REMOTE_CONNECTIVITY_CONNECTED,
    reconnectPolicy: {
      maxAttempts:
        Number.isInteger(reconnectMaxAttempts) && reconnectMaxAttempts >= 0
          ? reconnectMaxAttempts
          : DEFAULT_REMOTE_RECONNECT_MAX_ATTEMPTS,
      delayMs:
        Number.isInteger(reconnectDelayMs) && reconnectDelayMs > 0
          ? reconnectDelayMs
          : DEFAULT_REMOTE_RECONNECT_DELAY_MS
    },
    reconnectAttempts: 0,
    disconnectedAt: null,
    nextReconnectAt: null,
    lastReconnectAt: null,
    lastDisconnectReason: "",
    lastExitCode: null,
    lastExitSignal: ""
  };
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
    nowFn = now,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    createTraceId = randomUUID
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
    this.nowFn = typeof nowFn === "function" ? nowFn : now;
    this.setTimeoutFn = typeof setTimeoutFn === "function" ? setTimeoutFn : setTimeout;
    this.clearTimeoutFn = typeof clearTimeoutFn === "function" ? clearTimeoutFn : clearTimeout;
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
    if (!session?.activityTimer) {
      return;
    }
    this.clearTimeoutFn(session.activityTimer);
    session.activityTimer = null;
  }

  clearRemoteReconnectTimer(session) {
    if (!session?.remoteReconnectTimer) {
      return;
    }
    this.clearTimeoutFn(session.remoteReconnectTimer);
    session.remoteReconnectTimer = null;
  }

  clearRemoteReconnectStabilizeTimer(session) {
    if (!session?.remoteReconnectStabilizeTimer) {
      return;
    }
    this.clearTimeoutFn(session.remoteReconnectStabilizeTimer);
    session.remoteReconnectStabilizeTimer = null;
  }

  clearRemoteReconnectTimers(session) {
    this.clearRemoteReconnectTimer(session);
    this.clearRemoteReconnectStabilizeTimer(session);
  }

  clearExpectedExitReason(session) {
    if (!session) {
      return;
    }
    if (session.expectedExitReasonTimer) {
      this.clearTimeoutFn(session.expectedExitReasonTimer);
      session.expectedExitReasonTimer = null;
    }
    session.expectedExitReason = "";
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
    const launchSpec = buildSessionLaunchSpec({
      kind,
      shell,
      spawnCwd: cwd,
      startCwd,
      startCommand,
      remoteConnection,
      remoteAuth,
      remoteSecret,
      sshAskpassPath: this.sshAskpassPath,
      sshKnownHostsPath: this.sshKnownHostsPath
    });
    const shellAdapter = createShellAdapter(launchSpec.shellAdapterId);
    const ptyEnv = shellAdapter.prepareSpawnEnv({
      ...process.env,
      ...normalizeSessionEnv(env),
      ...launchSpec.ptyEnvAdditions
    });
    const ptyProcess = this.createPty({
      shell: launchSpec.command,
      command: launchSpec.command,
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

  markRemoteSessionConnected(session, timestamp = this.nowFn()) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return;
    }
    this.clearRemoteReconnectTimers(session);
    session.meta.remoteRuntime.connectivityState = REMOTE_CONNECTIVITY_CONNECTED;
    session.meta.remoteRuntime.reconnectAttempts = 0;
    session.meta.remoteRuntime.disconnectedAt = null;
    session.meta.remoteRuntime.nextReconnectAt = null;
    session.meta.remoteRuntime.lastReconnectAt = timestamp;
    session.meta.updatedAt = timestamp;
    this.emitSessionUpdated(session);
  }

  markRemoteSessionUnavailable(session, connectivityState, timestamp, details = {}) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return;
    }
    session.meta.remoteRuntime.connectivityState = connectivityState;
    session.meta.remoteRuntime.disconnectedAt = timestamp;
    session.meta.remoteRuntime.nextReconnectAt =
      Number.isInteger(details.nextReconnectAt) && details.nextReconnectAt > 0 ? details.nextReconnectAt : null;
    session.meta.remoteRuntime.lastDisconnectReason =
      typeof details.reason === "string" && details.reason ? details.reason : "";
    session.meta.remoteRuntime.lastExitCode =
      Number.isInteger(details.exitCode) || details.exitCode === null ? details.exitCode : null;
    session.meta.remoteRuntime.lastExitSignal = typeof details.exitSignal === "string" ? details.exitSignal : "";
    session.meta.updatedAt = timestamp;
    this.emitSessionUpdated(session);
  }

  attachPtyProcess(session, { ptyProcess, shellAdapter, launchSpec }) {
    session.ptyProcess = ptyProcess;
    session.shellAdapter = shellAdapter;
    session.cwdTrackingBuffer = "";
    ptyProcess.onData((data) => {
      const cleaned = session.shellAdapter.consumeOutput(session, data);
      if (cleaned) {
        const timestamp = this.nowFn();
        if (session.meta.kind === SESSION_KIND_SSH && session.meta.remoteRuntime?.connectivityState !== REMOTE_CONNECTIVITY_CONNECTED) {
        this.markRemoteSessionConnected(session, timestamp);
      }
      session.lastActivityAt = timestamp;
      const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
        sessionId: session.id,
        source: "pty"
      });
      this.updateSessionTraceSeed(session, trace, { source: "pty" });
      if (session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
        this.emitSessionActivityStarted(session, timestamp);
      } else {
        session.meta.updatedAt = timestamp;
      }
        const replayOutput = this.buildReplayRetentionResult(`${session.outputBuffer}${cleaned}`);
        session.outputBuffer = replayOutput.value;
        session.outputTruncated = session.outputTruncated === true || replayOutput.truncated === true;
        this.scheduleSessionActivityCompletion(session);
        this.events.emit("session.data", {
          sessionId: session.id,
          data: cleaned,
          trace
        });
      }
    });

    ptyProcess.onExit((exit) => {
      this.handlePtyExit(session, exit);
    });

    if (launchSpec.postStartInput) {
      ptyProcess.write(launchSpec.postStartInput);
    }
  }

  buildReconnectUnavailableError(session) {
    const connectivityState = session?.meta?.remoteRuntime?.connectivityState || REMOTE_CONNECTIVITY_OFFLINE;
    const errorCode =
      connectivityState === REMOTE_CONNECTIVITY_DEGRADED ? "RemoteSessionDegraded" : "RemoteSessionOffline";
    const message =
      connectivityState === REMOTE_CONNECTIVITY_DEGRADED
        ? `Remote SSH session '${session.id}' is reconnecting. Wait for recovery or restart the session explicitly.`
        : `Remote SSH session '${session.id}' is offline. Restart the session to retry immediately.`;
    return new ApiError(409, errorCode, message);
  }

  scheduleRemoteReconnect(session, details = {}) {
    if (session?.meta?.kind !== SESSION_KIND_SSH || !session.meta.remoteRuntime) {
      return false;
    }
    this.clearRemoteReconnectTimers(session);
    const policy = session.meta.remoteRuntime.reconnectPolicy || buildRemoteRuntimeMeta();
    const timestamp = Number.isInteger(details.timestamp) ? details.timestamp : this.nowFn();
    if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts <= 0) {
      this.markRemoteSessionUnavailable(session, REMOTE_CONNECTIVITY_OFFLINE, timestamp, details);
      return false;
    }
    if (session.meta.remoteRuntime.reconnectAttempts >= policy.maxAttempts) {
      this.markRemoteSessionUnavailable(session, REMOTE_CONNECTIVITY_OFFLINE, timestamp, details);
      return false;
    }
    const nextReconnectAt = timestamp + policy.delayMs;
    this.markRemoteSessionUnavailable(session, REMOTE_CONNECTIVITY_DEGRADED, timestamp, {
      ...details,
      nextReconnectAt
    });
    session.remoteReconnectTimer = this.setTimeoutFn(() => {
      session.remoteReconnectTimer = null;
      this.attemptRemoteReconnect(session.id, details.reason);
    }, policy.delayMs);
    return true;
  }

  attemptRemoteReconnect(sessionId, reason = "ssh-transport-exit") {
    const session = this.sessions.get(sessionId);
    if (!session || session.meta.kind !== SESSION_KIND_SSH || session.expectedExitReason) {
      return;
    }
    if (session.ptyProcess) {
      return;
    }
    const policy = session.meta.remoteRuntime?.reconnectPolicy || buildRemoteRuntimeMeta().reconnectPolicy;
    const timestamp = this.nowFn();
    session.meta.remoteRuntime.reconnectAttempts += 1;
    session.meta.remoteRuntime.nextReconnectAt = null;
    session.meta.remoteRuntime.lastDisconnectReason = reason;
    session.meta.updatedAt = timestamp;
    this.emitSessionUpdated(session);

    try {
      const launchBundle = this.buildLaunchBundle({
        kind: session.meta.kind,
        shell: session.meta.shell,
        cwd: homedir(),
        startCwd: session.meta.startCwd || session.meta.cwd,
        startCommand: session.meta.startCommand || "",
        env: session.meta.env || {},
        remoteConnection: session.meta.remoteConnection,
        remoteAuth: session.meta.remoteAuth,
        remoteSecret: session.remoteSecret
      });
      session.meta.cwd = launchBundle.launchSpec.metaCwd;
      session.meta.shell = launchBundle.launchSpec.command;
      this.clearExpectedExitReason(session);
      this.attachPtyProcess(session, launchBundle);
      session.remoteReconnectStabilizeTimer = this.setTimeoutFn(() => {
        session.remoteReconnectStabilizeTimer = null;
        if (this.sessions.get(session.id) !== session || session.ptyProcess !== launchBundle.ptyProcess) {
          return;
        }
        this.markRemoteSessionConnected(session, this.nowFn());
      }, this.remoteReconnectStableMs);
    } catch (error) {
      const retryTimestamp = this.nowFn();
      const failureReason = error instanceof Error && error.message ? error.message : reason;
      if (session.meta.remoteRuntime.reconnectAttempts >= policy.maxAttempts) {
        this.markRemoteSessionUnavailable(session, REMOTE_CONNECTIVITY_OFFLINE, retryTimestamp, {
          reason: failureReason,
          exitCode: null,
          exitSignal: ""
        });
        return;
      }
      const nextReconnectAt = retryTimestamp + policy.delayMs;
      this.markRemoteSessionUnavailable(session, REMOTE_CONNECTIVITY_DEGRADED, retryTimestamp, {
        reason: failureReason,
        exitCode: null,
        exitSignal: "",
        nextReconnectAt
      });
      session.remoteReconnectTimer = this.setTimeoutFn(() => {
        session.remoteReconnectTimer = null;
        this.attemptRemoteReconnect(session.id, failureReason);
      }, policy.delayMs);
    }
  }

  handlePtyExit(session, exit) {
    this.clearSessionActivityTimer(session);
    this.clearRemoteReconnectStabilizeTimer(session);
    const exitTimestamp = this.nowFn();
    const exitCode = Number.isInteger(exit?.exitCode) ? exit.exitCode : null;
    const exitSignal = typeof exit?.signal === "string" ? exit.signal : "";
    session.meta.activityState = SESSION_ACTIVITY_STATE_INACTIVE;
    session.meta.activityUpdatedAt = exitTimestamp;
    session.meta.activityCompletedAt = exitTimestamp;
    session.lastActivityAt = exitTimestamp;

    const isExpectedExit = Boolean(session.expectedExitReason);
    const current = this.sessions.get(session.id);
    if (session.meta.kind === SESSION_KIND_SSH && !isExpectedExit && current === session) {
      session.ptyProcess = null;
      session.meta.updatedAt = exitTimestamp;
      this.scheduleRemoteReconnect(session, {
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
    const trace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: session.traceSeed?.source || "pty"
    });
    this.updateSessionTraceSeed(session, trace, { source: session.traceSeed?.source || "pty" });
    this.events.emit("session.exit", {
      sessionId: session.id,
      exitCode: session.meta.exitCode,
      signal: session.meta.exitSignal,
      exitedAt: session.meta.exitedAt,
      updatedAt: session.meta.updatedAt,
      trace
    });
    if (current === session) {
      this.sessions.delete(session.id);
    }
  }

  list() {
    return Array.from(this.sessions.values()).map((session) => session.meta);
  }

  buildReplayRetentionResult(value, maxChars = this.sessionReplayMemoryMaxChars) {
    if (typeof value !== "string" || value.length === 0) {
      return { value: "", truncated: false };
    }
    if (!Number.isInteger(maxChars) || maxChars <= 0) {
      return { value: "", truncated: true };
    }
    if (value.length > maxChars) {
      return { value: value.slice(-maxChars), truncated: true };
    }
    return { value, truncated: false };
  }

  trimReplayOutput(value, maxChars = this.sessionReplayMemoryMaxChars) {
    return this.buildReplayRetentionResult(value, maxChars).value;
  }

  getSnapshot({ outputMaxChars, includeTruncationMetadata = false, includeEmptyOutputs = false } = {}) {
    const effectiveOutputMaxChars =
      Number.isInteger(outputMaxChars) && outputMaxChars >= 0
        ? Math.min(outputMaxChars, this.sessionReplayMemoryMaxChars)
        : this.sessionReplayMemoryMaxChars;
    const sessions = [];
    const outputs = [];
    for (const session of this.sessions.values()) {
      sessions.push(session.meta);
      const retainedReplayOutput = this.buildReplayRetentionResult(session.outputBuffer, effectiveOutputMaxChars);
      const replayOutputTruncated = session.outputTruncated === true || retainedReplayOutput.truncated === true;
      if (retainedReplayOutput.value || (includeEmptyOutputs && replayOutputTruncated)) {
        outputs.push({
          sessionId: session.id,
          data: retainedReplayOutput.value,
          ...(includeTruncationMetadata ? { truncated: replayOutputTruncated } : {})
        });
      }
    }
    return { sessions, outputs };
  }

  getReplayExport(sessionId) {
    const session = this.get(sessionId);
    return {
      sessionId: session.id,
      data: session.outputBuffer,
      retainedChars: session.outputBuffer.length,
      retentionLimitChars: this.sessionReplayMemoryMaxChars,
      truncated: session.outputTruncated === true
    };
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    return session;
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
    replayOutput = "",
    replayOutputTruncated = false,
    note,
    mouseForwardingMode,
    inputSafetyProfile,
    tags = [],
    themeProfile = {},
    activeThemeProfile,
    inactiveThemeProfile,
    createdAt,
    updatedAt,
    trace
  } = {}) {
    if (this.sessionMaxConcurrent > 0 && this.sessions.size >= this.sessionMaxConcurrent) {
      throw new ApiError(
        409,
        "SessionLimitExceeded",
        `Maximum concurrent session limit (${this.sessionMaxConcurrent}) reached.`
      );
    }

    const createdTimestamp = Number.isInteger(createdAt) ? createdAt : this.nowFn();
    const updatedTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;
    const initialActivityTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;
    const normalizedKind = normalizeSessionKind(kind);
    const normalizedStartCwd =
      typeof startCwd === "string" && startCwd.trim()
        ? startCwd
        : typeof cwd === "string" && cwd.trim()
          ? cwd
          : normalizedKind === SESSION_KIND_SSH
            ? "~"
            : homedir();
    const normalizedStartCommand = typeof startCommand === "string" ? startCommand : "";
    const normalizedEnv = normalizeSessionEnv(env);
    const normalizedNote = normalizeSessionNote(note);
    const normalizedMouseForwardingMode = normalizeSessionMouseForwardingMode(mouseForwardingMode, { strict: false });
    const normalizedInputSafetyProfile = normalizeSessionInputSafetyProfile(inputSafetyProfile, { strict: false });
    const normalizedTags = normalizeSessionTags(tags);
    const normalizedQuickIdToken = normalizeQuickIdToken(quickIdToken);
    const normalizedRemoteConnection = normalizeRemoteConnection(remoteConnection, normalizedKind);
    const normalizedRemoteAuth = normalizeRemoteAuth(remoteAuth, normalizedKind);
    const normalizedRemoteSecret = normalizeRemoteSecret(remoteSecret, normalizedRemoteAuth, normalizedKind);
    const normalizedShell =
      typeof shell === "string" && shell.trim()
        ? shell.trim()
        : normalizedKind === SESSION_KIND_SSH
          ? DEFAULT_SSH_CLIENT
          : this.defaultShell;
    const normalizedThemeSlots = normalizeSessionThemeSlots({
      themeProfile,
      activeThemeProfile,
      inactiveThemeProfile
    });
    const localSpawnCwd =
      normalizedKind === SESSION_KIND_SSH
        ? homedir()
        : typeof cwd === "string" && cwd.trim()
          ? cwd
          : normalizedStartCwd;
    const launchBundle = this.buildLaunchBundle({
      kind: normalizedKind,
      shell: normalizedShell,
      cwd: localSpawnCwd,
      startCwd: normalizedStartCwd,
      startCommand: normalizedStartCommand,
      env: normalizedEnv,
      remoteConnection: normalizedRemoteConnection,
      remoteAuth: normalizedRemoteAuth,
      remoteSecret: normalizedRemoteSecret
    });

    const initialReplayOutput = this.buildReplayRetentionResult(replayOutput);
    const session = {
      id,
      ptyProcess: null,
      shellAdapter: null,
      cwdTrackingBuffer: "",
      outputBuffer: initialReplayOutput.value,
      outputTruncated: replayOutputTruncated === true || initialReplayOutput.truncated,
      activityTimer: null,
      remoteReconnectTimer: null,
      remoteReconnectStabilizeTimer: null,
      expectedExitReasonTimer: null,
      expectedExitReason: "",
      lastActivityAt: initialActivityTimestamp,
      remoteSecret: normalizedRemoteSecret,
      traceSeed: normalizeTraceSeed(trace),
      meta: {
        id,
        kind: normalizedKind,
        ...(normalizedRemoteConnection ? { remoteConnection: normalizedRemoteConnection } : {}),
        ...(normalizedRemoteAuth ? { remoteAuth: normalizedRemoteAuth } : {}),
        cwd: launchBundle.launchSpec.metaCwd,
        shell: launchBundle.launchSpec.command,
        ...(typeof name === "string" ? { name } : {}),
        ...(normalizedQuickIdToken ? { quickIdToken: normalizedQuickIdToken } : {}),
        startCwd: normalizedStartCwd,
        startCommand: normalizedStartCommand,
        env: normalizedEnv,
        ...(normalizedNote ? { note: normalizedNote } : {}),
        mouseForwardingMode: normalizedMouseForwardingMode,
        inputSafetyProfile: normalizedInputSafetyProfile,
        tags: normalizedTags,
        ...(normalizedKind === SESSION_KIND_SSH
          ? {
              remoteRuntime: buildRemoteRuntimeMeta({
                reconnectMaxAttempts: this.remoteReconnectMaxAttempts,
                reconnectDelayMs: this.remoteReconnectDelayMs
              })
            }
          : {}),
        themeProfile: normalizedThemeSlots.themeProfile,
        activeThemeProfile: normalizedThemeSlots.activeThemeProfile,
        inactiveThemeProfile: normalizedThemeSlots.inactiveThemeProfile,
        state: SESSION_STATE_STARTING,
        activityState: SESSION_ACTIVITY_STATE_INACTIVE,
        activityUpdatedAt: initialActivityTimestamp,
        activityCompletedAt: null,
        startedAt: null,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      }
    };

    this.sessions.set(id, session);
    this.attachPtyProcess(session, launchBundle);
    const createdTrace = createTraceEnvelope(this.createTraceId, session.traceSeed, {
      sessionId: session.id,
      source: session.traceSeed?.source || "rest"
    });
    this.updateSessionTraceSeed(session, createdTrace, { source: session.traceSeed?.source || "rest" });
    this.events.emit("session.created", { session: session.meta, trace: createdTrace });
    this.transitionToRunning(session);
    return session.meta;
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
    session.ptyProcess.write(data);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
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
    const nextKind = normalizeSessionKind(patch.kind !== undefined ? patch.kind : session.meta.kind);
    const nextRemoteAuth =
      patch.remoteAuth !== undefined || patch.kind !== undefined
        ? normalizeRemoteAuth(
            patch.remoteAuth !== undefined ? patch.remoteAuth : session.meta.remoteAuth,
            nextKind
          )
        : session.meta.remoteAuth;
    if (patch.name !== undefined) {
      session.meta.name = patch.name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "quickIdToken")) {
      const normalizedQuickIdToken = normalizeQuickIdToken(patch.quickIdToken);
      if (normalizedQuickIdToken) {
        session.meta.quickIdToken = normalizedQuickIdToken;
      } else {
        delete session.meta.quickIdToken;
      }
    }
    if (patch.startCwd !== undefined) {
      session.meta.startCwd = patch.startCwd;
    }
    if (patch.startCommand !== undefined) {
      session.meta.startCommand = patch.startCommand;
    }
    if (patch.kind !== undefined) {
      session.meta.kind = nextKind;
      session.meta.shell = nextKind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : this.defaultShell;
      if (patch.startCwd === undefined) {
        session.meta.startCwd = nextKind === SESSION_KIND_SSH ? "~" : homedir();
      }
      session.meta.cwd = nextKind === SESSION_KIND_SSH ? session.meta.startCwd || "~" : session.meta.startCwd || homedir();
      if (nextKind === SESSION_KIND_SSH) {
        session.meta.remoteRuntime = buildRemoteRuntimeMeta({
          reconnectMaxAttempts: this.remoteReconnectMaxAttempts,
          reconnectDelayMs: this.remoteReconnectDelayMs
        });
      } else {
        delete session.meta.remoteRuntime;
        this.clearRemoteReconnectTimers(session);
        this.clearExpectedExitReason(session);
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "remoteConnection")) {
      const normalizedRemoteConnection = normalizeRemoteConnection(patch.remoteConnection, nextKind);
      if (normalizedRemoteConnection) {
        session.meta.remoteConnection = normalizedRemoteConnection;
      } else {
        delete session.meta.remoteConnection;
      }
    }
    if (patch.remoteAuth !== undefined || patch.kind !== undefined) {
      if (nextRemoteAuth) {
        session.meta.remoteAuth = nextRemoteAuth;
      } else {
        delete session.meta.remoteAuth;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "remoteSecret")) {
      session.remoteSecret = normalizeRemoteSecret(patch.remoteSecret, nextRemoteAuth, nextKind);
    } else if (remoteAuthRequiresSecret(nextRemoteAuth) && !session.remoteSecret) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteSecret' is required when changing to password or keyboardInteractive ssh auth."
      );
    } else if (!remoteAuthRequiresSecret(nextRemoteAuth)) {
      session.remoteSecret = undefined;
    }
    if (patch.env !== undefined) {
      session.meta.env = normalizeSessionEnv(patch.env);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "note")) {
      const normalizedNote = normalizeSessionNote(patch.note);
      if (normalizedNote) {
        session.meta.note = normalizedNote;
      } else {
        delete session.meta.note;
      }
    }
    if (patch.mouseForwardingMode !== undefined) {
      session.meta.mouseForwardingMode = normalizeSessionMouseForwardingMode(patch.mouseForwardingMode, { strict: false });
    }
    if (patch.inputSafetyProfile !== undefined) {
      session.meta.inputSafetyProfile = normalizeSessionInputSafetyProfile(patch.inputSafetyProfile, { strict: false });
    }
    if (patch.tags !== undefined) {
      session.meta.tags = normalizeSessionTags(patch.tags);
    }
    if (
      patch.themeProfile !== undefined ||
      patch.activeThemeProfile !== undefined ||
      patch.inactiveThemeProfile !== undefined
    ) {
      const nextActiveThemeInput =
        patch.activeThemeProfile !== undefined
          ? patch.activeThemeProfile
          : patch.themeProfile !== undefined
            ? patch.themeProfile
            : session.meta.activeThemeProfile;
      const normalizedThemeSlots = normalizeSessionThemeSlots({
        themeProfile: nextActiveThemeInput,
        activeThemeProfile: nextActiveThemeInput,
        inactiveThemeProfile:
          patch.inactiveThemeProfile !== undefined ? patch.inactiveThemeProfile : session.meta.inactiveThemeProfile
      });
      session.meta.themeProfile = normalizedThemeSlots.themeProfile;
      session.meta.activeThemeProfile = normalizedThemeSlots.activeThemeProfile;
      session.meta.inactiveThemeProfile = normalizedThemeSlots.inactiveThemeProfile;
    }
    session.meta.updatedAt = now();
    return session.meta;
  }

  rename(sessionId, name) {
    return this.updateSession(sessionId, { name });
  }

  restart(sessionId, options = {}) {
    const session = this.get(sessionId);
    const snapshot = { ...session.meta };
    const trace = normalizeTraceSeed(options.trace);
    this.delete(sessionId, { trace });
    return this.create({
      id: snapshot.id,
      kind: snapshot.kind,
      remoteConnection: snapshot.remoteConnection,
      remoteAuth: snapshot.remoteAuth,
      remoteSecret: session.remoteSecret,
      quickIdToken: snapshot.quickIdToken,
      cwd: snapshot.startCwd || snapshot.cwd,
      shell: snapshot.shell,
      name: snapshot.name,
      startCwd: snapshot.startCwd || snapshot.cwd,
      startCommand: snapshot.startCommand || "",
      env: snapshot.env || {},
      note: snapshot.note,
      mouseForwardingMode: snapshot.mouseForwardingMode,
      inputSafetyProfile: snapshot.inputSafetyProfile,
      tags: snapshot.tags || [],
      themeProfile: snapshot.themeProfile || {},
      activeThemeProfile: snapshot.activeThemeProfile,
      inactiveThemeProfile: snapshot.inactiveThemeProfile,
      createdAt: snapshot.createdAt,
      updatedAt: this.nowFn(),
      trace
    });
  }

  closeWithReason(sessionId, reason, options = {}) {
    const session = this.get(sessionId);
    this.updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    this.clearSessionActivityTimer(session);
    this.clearRemoteReconnectTimers(session);
    this.clearExpectedExitReason(session);
    session.expectedExitReason = reason;
    if (session.ptyProcess) {
      const ptyProcess = session.ptyProcess;
      session.ptyProcess = null;
      ptyProcess.kill();
    }
    this.sessions.delete(sessionId);
    this.events.emit("session.closed", {
      sessionId,
      reason,
      trace: createTraceEnvelope(this.createTraceId, session.traceSeed, {
        sessionId,
        source: session.traceSeed?.source || "rest"
      })
    });
  }

  enforceGuardrails(currentTime = this.nowFn()) {
    if (this.sessionIdleTimeoutMs <= 0 && this.sessionMaxLifetimeMs <= 0) {
      return;
    }

    const toClose = [];
    for (const session of this.sessions.values()) {
      if (
        this.sessionIdleTimeoutMs > 0 &&
        Number.isInteger(session.lastActivityAt) &&
        currentTime - session.lastActivityAt >= this.sessionIdleTimeoutMs
      ) {
        toClose.push({ sessionId: session.id, reason: "idle-timeout" });
        continue;
      }
      if (
        this.sessionMaxLifetimeMs > 0 &&
        Number.isInteger(session.meta.createdAt) &&
        currentTime - session.meta.createdAt >= this.sessionMaxLifetimeMs
      ) {
        toClose.push({ sessionId: session.id, reason: "max-lifetime" });
      }
    }

    for (const item of toClose) {
      if (this.sessions.has(item.sessionId)) {
        this.closeWithReason(item.sessionId, item.reason);
      }
    }
  }

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  off(eventName, listener) {
    this.events.off(eventName, listener);
  }
}
