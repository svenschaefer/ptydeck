import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { ApiError } from "./errors.js";

function now() {
  return Date.now();
}

export class SessionManager {
  constructor({ defaultShell = "bash", createPty } = {}) {
    this.defaultShell = defaultShell;
    this.sessions = new Map();
    this.events = new EventEmitter();
    this.createPty =
      createPty ||
      (({ shell, cwd, cols, rows }) =>
        pty.spawn(shell, [], {
          name: "xterm-color",
          cwd,
          cols,
          rows,
          env: process.env
        }));
  }

  list() {
    return Array.from(this.sessions.values()).map((session) => session.meta);
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
    cwd = process.cwd(),
    shell = this.defaultShell,
    createdAt,
    updatedAt
  } = {}) {
    const createdTimestamp = Number.isInteger(createdAt) ? createdAt : now();
    const updatedTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;

    const ptyProcess = this.createPty({ shell, cwd, cols: 80, rows: 24 });

    const session = {
      id,
      ptyProcess,
      meta: {
        id,
        cwd,
        shell,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      }
    };

    ptyProcess.onData((data) => {
      const markerMatches = data.match(/__CWD__(.*?)__/g);
      if (markerMatches && markerMatches.length > 0) {
        const last = markerMatches[markerMatches.length - 1];
        const cwdCandidate = last.replace("__CWD__", "").replace("__", "").trim();
        if (cwdCandidate) {
          session.meta.cwd = cwdCandidate;
          session.meta.updatedAt = now();
        }
      }

      this.events.emit("session.data", { sessionId: id, data });
    });

    ptyProcess.onExit((exit) => {
      this.events.emit("session.exit", {
        sessionId: id,
        exitCode: exit.exitCode,
        signal: exit.signal
      });
      this.sessions.delete(id);
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

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  off(eventName, listener) {
    this.events.off(eventName, listener);
  }
}
