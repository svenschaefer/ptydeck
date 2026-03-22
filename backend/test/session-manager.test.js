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
