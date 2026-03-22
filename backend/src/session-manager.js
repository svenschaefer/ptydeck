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
    session.meta.updatedAt = now();
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

export class SessionManager {
  constructor({ defaultShell = "bash", createPty } = {}) {
    this.defaultShell = defaultShell;
    this.sessions = new Map();
    this.events = new EventEmitter();
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
    cwd = homedir(),
    shell = this.defaultShell,
    name,
    createdAt,
    updatedAt
  } = {}) {
    const createdTimestamp = Number.isInteger(createdAt) ? createdAt : now();
    const updatedTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;

    const ptyEnv = withCwdMarkerPromptCommand(shell, process.env);
    const ptyProcess = this.createPty({ shell, cwd, cols: 80, rows: 24, env: ptyEnv });

    const session = {
      id,
      ptyProcess,
      cwdMarkerBuffer: "",
      outputBuffer: "",
      meta: {
        id,
        cwd,
        shell,
        ...(typeof name === "string" ? { name } : {}),
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      }
    };

    ptyProcess.onData((data) => {
      const cleaned = consumeCwdMarkers(session, data);
      if (cleaned) {
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
    this.events.emit("session.created", { session: session.meta });
    return session.meta;
  }

  delete(sessionId) {
    const session = this.get(sessionId);
    session.ptyProcess.kill();
    this.sessions.delete(sessionId);
    this.events.emit("session.closed", { sessionId });
  }

  sendInput(sessionId, data) {
    const session = this.get(sessionId);
    session.ptyProcess.write(data);
    session.meta.updatedAt = now();
  }

  resize(sessionId, cols, rows) {
    const session = this.get(sessionId);
    session.ptyProcess.resize(cols, rows);
    session.meta.updatedAt = now();
  }

  rename(sessionId, name) {
    const session = this.get(sessionId);
    session.meta.name = name;
    session.meta.updatedAt = now();
    return session.meta;
  }

  restart(sessionId) {
    const session = this.get(sessionId);
    const snapshot = { ...session.meta };
    this.delete(sessionId);
    return this.create({
      id: snapshot.id,
      cwd: snapshot.cwd,
      shell: snapshot.shell,
      name: snapshot.name,
      createdAt: snapshot.createdAt,
      updatedAt: now()
    });
  }

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  off(eventName, listener) {
    this.events.off(eventName, listener);
  }
}
