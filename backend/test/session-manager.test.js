import test from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../src/session-manager.js";

function createFakePty() {
  let lastExitHandler = null;

  return {
    writes: [],
    resizeCalls: [],
    killed: false,
    onExit(handler) {
      lastExitHandler = handler;
    },
    write(data) {
      this.writes.push(data);
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

test("SessionManager throws on unknown session", () => {
  const manager = new SessionManager({
    createPty: () => createFakePty()
  });

  assert.throws(() => manager.get("missing"));
  assert.throws(() => manager.sendInput("missing", "pwd\n"));
  assert.throws(() => manager.resize("missing", 80, 24));
  assert.throws(() => manager.delete("missing"));
});
