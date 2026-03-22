import { randomUUID } from "node:crypto";
import pty from "node-pty";
import { ApiError } from "./errors.js";

function now() {
  return Date.now();
}

export class SessionManager {
  constructor({ defaultShell = "bash", createPty } = {}) {
    this.defaultShell = defaultShell;
    this.sessions = new Map();
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

  create({ cwd = process.cwd(), shell = this.defaultShell } = {}) {
    const id = randomUUID();
    const createdAt = now();

    const ptyProcess = this.createPty({ shell, cwd, cols: 80, rows: 24 });

    const session = {
      id,
      ptyProcess,
      meta: {
        id,
        cwd,
        shell,
        createdAt,
        updatedAt: createdAt
      }
    };

    ptyProcess.onExit(() => {
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    return session.meta;
  }

  delete(sessionId) {
    const session = this.get(sessionId);
    session.ptyProcess.kill();
    this.sessions.delete(sessionId);
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
}
