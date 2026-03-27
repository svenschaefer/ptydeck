import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { ApiError } from "./errors.js";
import { normalizeSessionInputSafetyProfile } from "./session-input-safety-profile.js";
import { createShellAdapter } from "./shell-adapter.js";

function now() {
  return Date.now();
}

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const THEME_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_NOTE_MAX_LENGTH = 512;
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

export class SessionManager {
  constructor({
    defaultShell = "bash",
    createPty,
    sessionMaxConcurrent = 0,
    sessionIdleTimeoutMs = 0,
    sessionMaxLifetimeMs = 0,
    sessionReplayMemoryMaxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS,
    sessionActivityQuietMs = DEFAULT_SESSION_ACTIVITY_QUIET_MS,
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
    this.sessionActivityQuietMs =
      Number.isInteger(sessionActivityQuietMs) && sessionActivityQuietMs > 0
        ? sessionActivityQuietMs
        : DEFAULT_SESSION_ACTIVITY_QUIET_MS;
    this.nowFn = typeof nowFn === "function" ? nowFn : now;
    this.setTimeoutFn = typeof setTimeoutFn === "function" ? setTimeoutFn : setTimeout;
    this.clearTimeoutFn = typeof clearTimeoutFn === "function" ? clearTimeoutFn : clearTimeout;
    this.createPty =
      createPty ||
      (({ shell, cwd, cols, rows, env }) =>
        pty.spawn(shell, [], {
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
    cwd,
    shell = this.defaultShell,
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
    const normalizedStartCwd =
      typeof startCwd === "string" && startCwd.trim()
        ? startCwd
        : typeof cwd === "string" && cwd.trim()
          ? cwd
          : homedir();
    const normalizedStartCommand = typeof startCommand === "string" ? startCommand : "";
    const normalizedEnv = normalizeSessionEnv(env);
    const normalizedNote = normalizeSessionNote(note);
    const normalizedInputSafetyProfile = normalizeSessionInputSafetyProfile(inputSafetyProfile, { strict: false });
    const normalizedTags = normalizeSessionTags(tags);
    const normalizedThemeProfile = normalizeSessionThemeProfile(themeProfile);
    const spawnCwd = typeof cwd === "string" && cwd.trim() ? cwd : normalizedStartCwd;
    const shellAdapter = createShellAdapter(shell);

    const ptyEnv = shellAdapter.prepareSpawnEnv({
      ...process.env,
      ...normalizedEnv
    });
    const ptyProcess = this.createPty({ shell, cwd: spawnCwd, cols: 80, rows: 24, env: ptyEnv });

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
      meta: {
        id,
        cwd: spawnCwd,
        shell,
        ...(typeof name === "string" ? { name } : {}),
        startCwd: normalizedStartCwd,
        startCommand: normalizedStartCommand,
        env: normalizedEnv,
        ...(normalizedNote ? { note: normalizedNote } : {}),
        inputSafetyProfile: normalizedInputSafetyProfile,
        tags: normalizedTags,
        themeProfile: normalizedThemeProfile,
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
    if (normalizedStartCommand.trim()) {
      ptyProcess.write(`${normalizedStartCommand}\n`);
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

  updateSession(sessionId, patch = {}) {
    const session = this.get(sessionId);
    if (patch.name !== undefined) {
      session.meta.name = patch.name;
    }
    if (patch.startCwd !== undefined) {
      session.meta.startCwd = patch.startCwd;
    }
    if (patch.startCommand !== undefined) {
      session.meta.startCommand = patch.startCommand;
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
    if (patch.themeProfile !== undefined) {
      session.meta.themeProfile = normalizeSessionThemeProfile(patch.themeProfile);
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
