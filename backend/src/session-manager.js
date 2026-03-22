import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { basename } from "node:path";
import { ApiError } from "./errors.js";

function now() {
  return Date.now();
}

const MAX_OUTPUT_BUFFER_CHARS = 16 * 1024;
const THEME_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
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

function consumeCwdMarkers(session, chunk) {
  const markerStart = "__CWD__";
  const markerEnd = "__";
  const combined = `${session.cwdMarkerBuffer || ""}${chunk}`;
  let dataForScan = combined;
  session.cwdMarkerBuffer = "";

  const lastStart = dataForScan.lastIndexOf(markerStart);
  if (lastStart >= 0) {
    const endFromLast = dataForScan.indexOf(markerEnd, lastStart + markerStart.length);
    if (endFromLast < 0) {
      session.cwdMarkerBuffer = dataForScan.slice(lastStart);
      dataForScan = dataForScan.slice(0, lastStart);
    }
  }

  const markerRegex = /__CWD__(.*?)__/g;
  let match = markerRegex.exec(dataForScan);
  let lastCwdCandidate = "";
  while (match) {
    lastCwdCandidate = String(match[1] || "").trim();
    match = markerRegex.exec(dataForScan);
  }
  if (lastCwdCandidate) {
    session.meta.cwd = lastCwdCandidate;
  }

  return dataForScan.replace(/__CWD__(.*?)__\r?\n?/g, "");
}

function withCwdMarkerPromptCommand(shell, env) {
  const shellName = basename(shell || "").toLowerCase();
  if (!shellName.includes("bash")) {
    return env;
  }

  const markerCommand = 'printf "__CWD__%s__\\n" "$PWD"';
  const existing = typeof env.PROMPT_COMMAND === "string" ? env.PROMPT_COMMAND.trim() : "";
  return {
    ...env,
    PROMPT_COMMAND: existing ? `${markerCommand};${existing}` : markerCommand
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

export class SessionManager {
  constructor({
    defaultShell = "bash",
    createPty,
    sessionMaxConcurrent = 0,
    sessionIdleTimeoutMs = 0,
    sessionMaxLifetimeMs = 0,
    nowFn = now
  } = {}) {
    this.defaultShell = defaultShell;
    this.sessions = new Map();
    this.events = new EventEmitter();
    this.sessionMaxConcurrent =
      Number.isInteger(sessionMaxConcurrent) && sessionMaxConcurrent > 0 ? sessionMaxConcurrent : 0;
    this.sessionIdleTimeoutMs = Number.isInteger(sessionIdleTimeoutMs) && sessionIdleTimeoutMs > 0 ? sessionIdleTimeoutMs : 0;
    this.sessionMaxLifetimeMs =
      Number.isInteger(sessionMaxLifetimeMs) && sessionMaxLifetimeMs > 0 ? sessionMaxLifetimeMs : 0;
    this.nowFn = typeof nowFn === "function" ? nowFn : now;
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

  list() {
    return Array.from(this.sessions.values()).map((session) => session.meta);
  }

  getSnapshot() {
    const sessions = [];
    const outputs = [];
    for (const session of this.sessions.values()) {
      sessions.push(session.meta);
      if (session.outputBuffer) {
        outputs.push({ sessionId: session.id, data: session.outputBuffer });
      }
    }
    return { sessions, outputs };
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    return session;
  }

  create({
    id = randomUUID(),
    cwd,
    shell = this.defaultShell,
    name,
    startCwd,
    startCommand = "",
    env = {},
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
    const normalizedThemeProfile = normalizeSessionThemeProfile(themeProfile);
    const spawnCwd = typeof cwd === "string" && cwd.trim() ? cwd : normalizedStartCwd;

    const ptyEnv = withCwdMarkerPromptCommand(shell, {
      ...process.env,
      ...normalizedEnv
    });
    const ptyProcess = this.createPty({ shell, cwd: spawnCwd, cols: 80, rows: 24, env: ptyEnv });

    const session = {
      id,
      ptyProcess,
      cwdMarkerBuffer: "",
      outputBuffer: "",
      lastActivityAt: initialActivityTimestamp,
      meta: {
        id,
        cwd: spawnCwd,
        shell,
        ...(typeof name === "string" ? { name } : {}),
        startCwd: normalizedStartCwd,
        startCommand: normalizedStartCommand,
        env: normalizedEnv,
        themeProfile: normalizedThemeProfile,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      }
    };

    ptyProcess.onData((data) => {
      const cleaned = consumeCwdMarkers(session, data);
      if (cleaned) {
        const timestamp = this.nowFn();
        session.lastActivityAt = timestamp;
        session.meta.updatedAt = timestamp;
        session.outputBuffer = `${session.outputBuffer}${cleaned}`;
        if (session.outputBuffer.length > MAX_OUTPUT_BUFFER_CHARS) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_OUTPUT_BUFFER_CHARS);
        }
        this.events.emit("session.data", { sessionId: id, data: cleaned });
      }
    });

    ptyProcess.onExit((exit) => {
      this.events.emit("session.exit", {
        sessionId: id,
        exitCode: exit.exitCode,
        signal: exit.signal
      });
      const current = this.sessions.get(id);
      if (current === session) {
        this.sessions.delete(id);
      }
    });

    this.sessions.set(id, session);
    if (normalizedStartCommand.trim()) {
      ptyProcess.write(`${normalizedStartCommand}\n`);
    }
    this.events.emit("session.created", { session: session.meta });
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
      themeProfile: snapshot.themeProfile || {},
      createdAt: snapshot.createdAt,
      updatedAt: this.nowFn()
    });
  }

  closeWithReason(sessionId, reason) {
    const session = this.get(sessionId);
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
