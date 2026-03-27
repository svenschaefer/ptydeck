import test from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../src/session-manager.js";

function createFakePty() {
  let exitHandler = null;
  let dataHandler = null;
  return {
    onExit(handler) {
      exitHandler = handler;
    },
    onData(handler) {
      dataHandler = handler;
    },
    write(data) {
      if (dataHandler) {
        dataHandler(String(data));
      }
    },
    resize() {},
    kill() {
      if (exitHandler) {
        exitHandler({ exitCode: 0, signal: 0 });
      }
    }
  };
}

test("shell/runtime compatibility matrix keeps cwd tracking and prompt-marker behavior explicit", () => {
  const cases = [
    {
      shell: "bash",
      markerChunk: "__CWD__/srv/bash__",
      expectedCwd: "/srv/bash",
      promptMarkerExpected: true
    },
    {
      shell: "zsh",
      markerChunk: "",
      expectedCwd: "/tmp/zsh",
      promptMarkerExpected: false
    },
    {
      shell: "fish",
      markerChunk: "",
      expectedCwd: "/tmp/fish",
      promptMarkerExpected: false
    }
  ];

  for (const item of cases) {
    let capturedEnv = null;
    let fakePty = null;
    const manager = new SessionManager({
      sessionReplayMemoryMaxChars: 8,
      createPty({ env }) {
        capturedEnv = env;
        fakePty = createFakePty();
        return fakePty;
      }
    });
    const created = manager.create({
      id: `session-${item.shell}`,
      cwd: `/tmp/${item.shell}`,
      shell: item.shell
    });

    if (item.markerChunk) {
      fakePty.write(item.markerChunk);
    }
    fakePty.write("0123456789AB");

    assert.equal(manager.get(created.id).meta.cwd, item.expectedCwd, `${item.shell} cwd expectation`);
    if (item.promptMarkerExpected) {
      assert.match(String(capturedEnv?.PROMPT_COMMAND || ""), /__CWD__%s__/);
    } else {
      assert.equal(capturedEnv?.PROMPT_COMMAND, process.env.PROMPT_COMMAND);
    }
  }
});

test("shell/runtime compatibility matrix keeps replay and persisted snapshot tails consistent across shells", () => {
  const shells = ["bash", "zsh", "fish"];

  for (const shell of shells) {
    let fakePty = null;
    const manager = new SessionManager({
      sessionReplayMemoryMaxChars: 8,
      createPty() {
        fakePty = createFakePty();
        return fakePty;
      }
    });
    const created = manager.create({
      id: `session-${shell}`,
      cwd: `/tmp/${shell}`,
      shell,
      replayOutput: "seed567890"
    });

    const restoredSnapshot = manager.getSnapshot();
    assert.deepEqual(restoredSnapshot.outputs, [{ sessionId: created.id, data: "ed567890" }]);

    fakePty.write(shell === "bash" ? "__CWD__/srv/runtime__" : "");
    fakePty.write("0123456789AB");

    const reconnectSnapshot = manager.getSnapshot();
    assert.deepEqual(reconnectSnapshot.outputs, [{ sessionId: created.id, data: "456789AB" }]);

    const persistedSnapshot = manager.getSnapshot({ outputMaxChars: 4 });
    assert.deepEqual(persistedSnapshot.outputs, [{ sessionId: created.id, data: "89AB" }]);
  }
});
