import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { SessionManager } from "../src/session-manager.js";

function createFakePty() {
  let lastExitHandler = null;
  let lastDataHandler = null;

  return {
    writes: [],
    resizeCalls: [],
    killed: false,
    onExit(handler) {
      lastExitHandler = handler;
    },
    onData(handler) {
      lastDataHandler = handler;
    },
    write(data) {
      this.writes.push(data);
      if (lastDataHandler) {
        lastDataHandler(data);
      }
    },
    resize(cols, rows) {
      this.resizeCalls.push({ cols, rows });
    },
    kill() {
      this.killed = true;
      if (lastExitHandler) {
        lastExitHandler({ exitCode: 0, signal: 0 });
      }
    }
  };
}

test("SessionManager create/list/get/delete lifecycle", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    defaultShell: "bash",
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  assert.equal(typeof created.id, "string");
  assert.equal(created.cwd, "/tmp");
  assert.equal(created.startCwd, "/tmp");
  assert.equal(created.startCommand, "");
  assert.deepEqual(created.env, {});
  assert.deepEqual(created.tags, []);
  assert.equal(typeof created.themeProfile, "object");
  assert.equal(created.themeProfile.background, "#0a0d12");

  const listed = manager.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const session = manager.get(created.id);
  assert.equal(session.meta.shell, "bash");

  manager.delete(created.id);
  assert.equal(fakePty.killed, true);
  assert.equal(manager.list().length, 0);
});

test("SessionManager sendInput and resize call PTY", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({});
  manager.sendInput(created.id, "ls\n");
  manager.resize(created.id, 120, 40);

  assert.deepEqual(fakePty.writes, ["ls\n"]);
  assert.deepEqual(fakePty.resizeCalls, [{ cols: 120, rows: 40 }]);
});

test("SessionManager updates cwd from marker output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp" });
  fakePty.write("__CWD__/home/wsl/workspace__");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl/workspace");
});

test("SessionManager strips cwd markers from terminal output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });
  const chunks = [];
  manager.on("session.data", (event) => {
    if (event.sessionId === created.id) {
      chunks.push(event.data);
    }
  });

  fakePty.write("__CWD__/home/wsl__\r\n");
  fakePty.write("pwd\r\n/home/wsl\r\n");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl");
  assert.deepEqual(chunks, ["pwd\r\n/home/wsl\r\n"]);
});

test("SessionManager strips split cwd markers across chunks", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });
  const chunks = [];
  manager.on("session.data", (event) => {
    if (event.sessionId === created.id) {
      chunks.push(event.data);
    }
  });

  fakePty.write("__CWD__/home/");
  fakePty.write("wsl__\r\n");
  fakePty.write("echo ok\r\nok\r\n");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl");
  assert.deepEqual(chunks, ["echo ok\r\nok\r\n"]);
});

test("SessionManager snapshot includes buffered terminal output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });

  fakePty.write("hello\r\n");

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.sessions[0].id, created.id);
  assert.equal(snapshot.outputs.length, 1);
  assert.equal(snapshot.outputs[0].sessionId, created.id);
  assert.equal(snapshot.outputs[0].data, "hello\r\n");
});

test("SessionManager throws on unknown session", () => {
  const manager = new SessionManager({
    createPty: () => createFakePty()
  });

  assert.throws(() => manager.get("missing"));
  assert.throws(() => manager.sendInput("missing", "pwd\n"));
  assert.throws(() => manager.resize("missing", 80, 24));
  assert.throws(() => manager.delete("missing"));
});

test("SessionManager create honors persisted timestamps when provided", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({
    id: "restore-1",
    cwd: "/tmp",
    shell: "bash",
    createdAt: 1710000000000,
    updatedAt: 1710000001234
  });

  assert.equal(created.createdAt, 1710000000000);
  assert.equal(created.updatedAt, 1710000001234);
});

test("SessionManager defaults cwd to user home when not provided", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ shell: "bash" });
  assert.equal(created.cwd, homedir());
});

test("SessionManager can rename sessions", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const updated = manager.rename(created.id, "ops-shell");
  assert.equal(updated.name, "ops-shell");
});

test("SessionManager injects cwd marker into bash PROMPT_COMMAND", () => {
  const originalPromptCommand = process.env.PROMPT_COMMAND;
  const fakePty = createFakePty();
  let capturedEnv = null;
  const manager = new SessionManager({
    createPty: ({ env }) => {
      capturedEnv = env;
      return fakePty;
    }
  });

  try {
    process.env.PROMPT_COMMAND = "echo existing";
    manager.create({ shell: "bash" });
    assert.ok(capturedEnv);
    assert.ok(typeof capturedEnv.PROMPT_COMMAND === "string");
    assert.ok(capturedEnv.PROMPT_COMMAND.includes('printf "__CWD__%s__\\n" "$PWD"'));
    assert.ok(capturedEnv.PROMPT_COMMAND.includes("echo existing"));
  } finally {
    if (originalPromptCommand === undefined) {
      delete process.env.PROMPT_COMMAND;
    } else {
      process.env.PROMPT_COMMAND = originalPromptCommand;
    }
  }
});

test("SessionManager restart preserves identity and restarts PTY", () => {
  const firstPty = createFakePty();
  const secondPty = createFakePty();
  let spawnCount = 0;
  const manager = new SessionManager({
    createPty: () => {
      spawnCount += 1;
      return spawnCount === 1 ? firstPty : secondPty;
    }
  });

  const created = manager.create({
    cwd: "/tmp",
    shell: "bash",
    name: "ops-shell",
    startCwd: "/var/tmp",
    startCommand: "echo START",
    env: { FOO: "BAR" }
  });
  const restarted = manager.restart(created.id);

  assert.equal(firstPty.killed, true);
  assert.equal(restarted.id, created.id);
  assert.equal(restarted.cwd, "/var/tmp");
  assert.equal(restarted.shell, "bash");
  assert.equal(restarted.name, "ops-shell");
  assert.equal(restarted.startCwd, "/var/tmp");
  assert.equal(restarted.startCommand, "echo START");
  assert.deepEqual(restarted.env, { FOO: "BAR" });
  assert.deepEqual(restarted.tags, []);
  assert.equal(restarted.themeProfile.cursor, "#8ec07c");
  assert.equal(restarted.createdAt, created.createdAt);
  assert.ok(restarted.updatedAt >= created.createdAt);
  assert.equal(manager.get(created.id).ptyProcess, secondPty);
  assert.deepEqual(secondPty.writes, ["echo START\n"]);
});

test("SessionManager passes startup env overrides to PTY spawn", () => {
  const fakePty = createFakePty();
  let spawnOptions = null;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions = options;
      return fakePty;
    }
  });

  manager.create({
    shell: "bash",
    startCwd: "/opt/work",
    startCommand: "",
    env: { FOO: "BAR", HELLO: "WORLD" }
  });

  assert.ok(spawnOptions);
  assert.equal(spawnOptions.cwd, "/opt/work");
  assert.equal(spawnOptions.env.FOO, "BAR");
  assert.equal(spawnOptions.env.HELLO, "WORLD");
});

test("SessionManager normalizes tags deterministically", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({
    tags: [" Ops ", "ops", "prod", "Dev", "invalid tag"]
  });
  assert.deepEqual(created.tags, ["dev", "ops", "prod"]);

  const updated = manager.updateSession(created.id, {
    tags: ["prod", "Zebra", "alpha", "alpha", " "]
  });
  assert.deepEqual(updated.tags, ["alpha", "prod", "zebra"]);
});

test("SessionManager stores and updates full theme profile deterministically", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({
    themeProfile: {
      background: "#111111",
      foreground: "#eeeeee",
      cursor: "#ffcc00",
      black: "#000000",
      red: "#ff0000",
      green: "#00ff00",
      yellow: "#ffff00",
      blue: "#0000ff",
      magenta: "#ff00ff",
      cyan: "#00ffff",
      white: "#ffffff",
      brightBlack: "#222222",
      brightRed: "#ff6666",
      brightGreen: "#66ff66",
      brightYellow: "#ffff66",
      brightBlue: "#6666ff",
      brightMagenta: "#ff66ff",
      brightCyan: "#66ffff",
      brightWhite: "#fefefe"
    }
  });
  assert.equal(created.themeProfile.background, "#111111");
  assert.equal(created.themeProfile.brightWhite, "#fefefe");

  const updated = manager.updateSession(created.id, {
    themeProfile: {
      background: "invalid",
      foreground: "#010203"
    }
  });
  assert.equal(updated.themeProfile.background, "#0a0d12");
  assert.equal(updated.themeProfile.foreground, "#010203");
  assert.equal(updated.themeProfile.cursor, "#8ec07c");
});

test("SessionManager enforces max concurrent session guardrail", () => {
  const manager = new SessionManager({
    sessionMaxConcurrent: 1,
    createPty: () => createFakePty()
  });

  manager.create({ cwd: "/tmp/a" });
  assert.throws(() => manager.create({ cwd: "/tmp/b" }), /Maximum concurrent session limit/);
});

test("SessionManager closes idle sessions via guardrail enforcement", () => {
  let currentTime = 1_000;
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionIdleTimeoutMs: 500,
    nowFn: () => currentTime
  });
  const closed = [];
  manager.on("session.closed", (event) => closed.push(event));

  const created = manager.create({ cwd: "/tmp" });
  currentTime = 1_400;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 1);

  currentTime = 1_500;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 0);
  assert.deepEqual(closed, [{ sessionId: created.id, reason: "idle-timeout" }]);
});

test("SessionManager closes over-lifetime sessions via guardrail enforcement", () => {
  let currentTime = 5_000;
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionMaxLifetimeMs: 300,
    nowFn: () => currentTime
  });
  const closed = [];
  manager.on("session.closed", (event) => closed.push(event));

  const created = manager.create({ cwd: "/tmp" });
  currentTime = 5_250;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 1);

  currentTime = 5_300;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 0);
  assert.deepEqual(closed, [{ sessionId: created.id, reason: "max-lifetime" }]);
});
