import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./errors.js";
import { normalizeSessionInputSafetyProfile } from "./session-input-safety-profile.js";
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
  const normalized = note.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > SESSION_NOTE_MAX_LENGTH) {
    return normalized.slice(0, SESSION_NOTE_MAX_LENGTH);
  }
  return normalized;
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
  sshAskpassPath
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
  const args = ["-tt", "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no", "-o", "ForwardX11=no"];
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

export class SessionManager {
  constructor({
    defaultShell = "bash",
    createPty,
    sessionMaxConcurrent = 0,
    sessionIdleTimeoutMs = 0,
    sessionMaxLifetimeMs = 0,
    sessionReplayMemoryMaxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS,
    sessionActivityQuietMs = DEFAULT_SESSION_ACTIVITY_QUIET_MS,
    sshAskpassPath = DEFAULT_SSH_ASKPASS_PATH,
    nowFn = now,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
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
    this.sessionActivityQuietMs =
      Number.isInteger(sessionActivityQuietMs) && sessionActivityQuietMs > 0
        ? sessionActivityQuietMs
        : DEFAULT_SESSION_ACTIVITY_QUIET_MS;
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

  clearSessionActivityTimer(session) {
    if (!session?.activityTimer) {
      return;
    }
    this.clearTimeoutFn(session.activityTimer);
    session.activityTimer = null;
  }

  emitSessionActivityStarted(session, timestamp) {
    session.meta.activityState = SESSION_ACTIVITY_STATE_ACTIVE;
    session.meta.activityUpdatedAt = timestamp;
    session.meta.activityCompletedAt = null;
    session.meta.updatedAt = timestamp;
    this.events.emit("session.activity.started", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      session: session.meta
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
    this.events.emit("session.activity.completed", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      activityCompletedAt: session.meta.activityCompletedAt,
      session: session.meta
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
    this.events.emit("session.started", {
      sessionId: session.id,
      startedAt: session.meta.startedAt,
      updatedAt: session.meta.updatedAt,
      session: session.meta
    });
    this.events.emit("session.updated", { session: session.meta });
    return session.meta;
  }

  create({
    id = randomUUID(),
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
    inputSafetyProfile,
    tags = [],
    themeProfile = {},
    activeThemeProfile,
    inactiveThemeProfile,
    createdAt,
    updatedAt
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
    const normalizedInputSafetyProfile = normalizeSessionInputSafetyProfile(inputSafetyProfile, { strict: false });
    const normalizedTags = normalizeSessionTags(tags);
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
    const launchSpec = buildSessionLaunchSpec({
      kind: normalizedKind,
      shell: normalizedShell,
      spawnCwd: localSpawnCwd,
      startCwd: normalizedStartCwd,
      startCommand: normalizedStartCommand,
      remoteConnection: normalizedRemoteConnection,
      remoteAuth: normalizedRemoteAuth,
      remoteSecret: normalizedRemoteSecret,
      sshAskpassPath: this.sshAskpassPath
    });
    const shellAdapter = createShellAdapter(launchSpec.shellAdapterId);

    const ptyEnv = shellAdapter.prepareSpawnEnv({
      ...process.env,
      ...normalizedEnv,
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

    const initialReplayOutput = this.buildReplayRetentionResult(replayOutput);
    const session = {
      id,
      ptyProcess,
      shellAdapter,
      cwdTrackingBuffer: "",
      outputBuffer: initialReplayOutput.value,
      outputTruncated: replayOutputTruncated === true || initialReplayOutput.truncated,
      activityTimer: null,
      lastActivityAt: initialActivityTimestamp,
      remoteSecret: normalizedRemoteSecret,
      meta: {
        id,
        kind: normalizedKind,
        ...(normalizedRemoteConnection ? { remoteConnection: normalizedRemoteConnection } : {}),
        ...(normalizedRemoteAuth ? { remoteAuth: normalizedRemoteAuth } : {}),
        cwd: launchSpec.metaCwd,
        shell: launchSpec.command,
        ...(typeof name === "string" ? { name } : {}),
        startCwd: normalizedStartCwd,
        startCommand: normalizedStartCommand,
        env: normalizedEnv,
        ...(normalizedNote ? { note: normalizedNote } : {}),
        inputSafetyProfile: normalizedInputSafetyProfile,
        tags: normalizedTags,
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

    ptyProcess.onData((data) => {
      const cleaned = session.shellAdapter.consumeOutput(session, data);
      if (cleaned) {
        const timestamp = this.nowFn();
        session.lastActivityAt = timestamp;
        if (session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
          this.emitSessionActivityStarted(session, timestamp);
        } else {
          session.meta.updatedAt = timestamp;
        }
        const replayOutput = this.buildReplayRetentionResult(`${session.outputBuffer}${cleaned}`);
        session.outputBuffer = replayOutput.value;
        session.outputTruncated = session.outputTruncated === true || replayOutput.truncated === true;
        this.scheduleSessionActivityCompletion(session);
        this.events.emit("session.data", { sessionId: id, data: cleaned });
      }
    });

    ptyProcess.onExit((exit) => {
      this.clearSessionActivityTimer(session);
      const exitTimestamp = this.nowFn();
      session.meta.state = SESSION_STATE_EXITED;
      session.meta.activityState = SESSION_ACTIVITY_STATE_INACTIVE;
      session.meta.activityUpdatedAt = exitTimestamp;
      session.meta.activityCompletedAt = exitTimestamp;
      session.meta.exitCode = Number.isInteger(exit.exitCode) ? exit.exitCode : null;
      session.meta.exitSignal = typeof exit.signal === "string" ? exit.signal : "";
      session.meta.exitedAt = exitTimestamp;
      session.meta.updatedAt = exitTimestamp;
      this.events.emit("session.exit", {
        sessionId: id,
        exitCode: session.meta.exitCode,
        signal: session.meta.exitSignal,
        exitedAt: session.meta.exitedAt,
        updatedAt: session.meta.updatedAt
      });
      const current = this.sessions.get(id);
      if (current === session) {
        this.sessions.delete(id);
      }
    });

    this.sessions.set(id, session);
    this.events.emit("session.created", { session: session.meta });
    this.transitionToRunning(session);
    if (launchSpec.postStartInput) {
      ptyProcess.write(launchSpec.postStartInput);
    }
    return session.meta;
  }

  delete(sessionId) {
    this.closeWithReason(sessionId, "deleted");
  }

  sendInput(sessionId, data) {
    const session = this.get(sessionId);
    session.ptyProcess.write(data);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  resize(sessionId, cols, rows) {
    const session = this.get(sessionId);
    session.ptyProcess.resize(cols, rows);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  signal(sessionId, signal) {
    const session = this.get(sessionId);
    session.ptyProcess.kill(signal);
    const timestamp = this.nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  interrupt(sessionId) {
    this.signal(sessionId, "SIGINT");
  }

  terminate(sessionId) {
    this.signal(sessionId, "SIGTERM");
  }

  kill(sessionId) {
    this.signal(sessionId, "SIGKILL");
  }

  updateSession(sessionId, patch = {}) {
    const session = this.get(sessionId);
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

  restart(sessionId) {
    const session = this.get(sessionId);
    const snapshot = { ...session.meta };
    this.delete(sessionId);
    return this.create({
      id: snapshot.id,
      kind: snapshot.kind,
      remoteConnection: snapshot.remoteConnection,
      remoteAuth: snapshot.remoteAuth,
      remoteSecret: session.remoteSecret,
      cwd: snapshot.startCwd || snapshot.cwd,
      shell: snapshot.shell,
      name: snapshot.name,
      startCwd: snapshot.startCwd || snapshot.cwd,
      startCommand: snapshot.startCommand || "",
      env: snapshot.env || {},
      note: snapshot.note,
      inputSafetyProfile: snapshot.inputSafetyProfile,
      tags: snapshot.tags || [],
      themeProfile: snapshot.themeProfile || {},
      activeThemeProfile: snapshot.activeThemeProfile,
      inactiveThemeProfile: snapshot.inactiveThemeProfile,
      createdAt: snapshot.createdAt,
      updatedAt: this.nowFn()
    });
  }

  closeWithReason(sessionId, reason) {
    const session = this.get(sessionId);
    this.clearSessionActivityTimer(session);
    session.ptyProcess.kill();
    this.sessions.delete(sessionId);
    this.events.emit("session.closed", { sessionId, reason });
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
