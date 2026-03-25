import test from "node:test";
import assert from "node:assert/strict";

import { createSessionRuntimeController } from "../src/public/session-runtime-controller.js";
import { createStore } from "../src/public/store.js";

function createTerminal() {
  return {
    writes: [],
    clearSelectionCalls: 0,
    write(data, callback) {
      this.writes.push(data);
      if (typeof callback === "function") {
        callback();
      }
    }
  };
}

test("session-runtime controller assigns and prunes quick ids deterministically", () => {
  const controller = createSessionRuntimeController({
    sessionQuickIds: new Map(),
    quickIdPool: ["1", "2", "3"]
  });

  assert.equal(controller.ensureQuickId("s1"), "1");
  assert.equal(controller.ensureQuickId("s2"), "2");
  assert.equal(controller.ensureQuickId("s1"), "1");
  controller.pruneQuickIds(["s2"]);
  assert.equal(controller.ensureQuickId("s3"), "1");
});

test("session-runtime controller appends chunks and retries replay for late terminal mounts", () => {
  const terminals = new Map();
  const terminal = createTerminal();
  const callbacks = [];
  const marks = [];
  const searchCalls = [];

  const controller = createSessionRuntimeController({
    terminals,
    terminalSearchState: { query: "alpha" },
    refreshTerminalViewport: () => callbacks.push("refresh"),
    syncTerminalScrollArea: () => callbacks.push("scroll"),
    markSessionActivity: (sessionId) => marks.push(sessionId),
    syncActiveTerminalSearch: (payload) => searchCalls.push(payload),
    getActiveSessionId: () => "s1",
    windowRef: {
      setTimeout(fn) {
        callbacks.push("retry");
        fn();
        return 1;
      }
    }
  });

  terminals.set("s1", { terminal, isVisible: true, searchRevision: 0 });
  assert.equal(controller.appendTerminalChunk("s1", "hello"), true);
  assert.deepEqual(terminal.writes, ["hello"]);
  assert.deepEqual(callbacks, ["scroll", "refresh", "scroll"]);
  assert.deepEqual(marks, ["s1"]);
  assert.deepEqual(searchCalls, [{ preserveSelection: true }]);

  const hiddenTerminal = createTerminal();
  terminals.set("s2", { terminal: hiddenTerminal, isVisible: false, pendingViewportSync: false, searchRevision: 0 });
  controller.appendTerminalChunk("s2", "hidden", { markActivity: false });
  assert.equal(terminals.get("s2").pendingViewportSync, true);

  terminals.delete("late");
  controller.replaySnapshotOutputs([{ sessionId: "late", data: "chunk" }]);
  terminals.set("late", { terminal: createTerminal(), isVisible: true, searchRevision: 0 });
  controller.replaySnapshotOutputs([{ sessionId: "late", data: "chunk" }]);
  assert.ok(callbacks.includes("retry"));
  assert.deepEqual(terminals.get("late").terminal.writes, ["chunk"]);
});

test("session-runtime controller updates session lifecycle and delegates runtime/view-model helpers", () => {
  const store = createStore();
  store.upsertSession({ id: "s1", name: "Alpha", deckId: "default" });
  store.setActiveSession("s1");
  store.markSessionActivity("s1", { timestamp: 10 });

  const disposed = [];
  const feedback = [];
  const runtimeCalls = [];
  const controller = createSessionRuntimeController({
    store,
    terminals: new Map(),
    sessionQuickIds: new Map(),
    quickIdPool: ["1"],
    getSessionById: (sessionId) => store.getState().sessions.find((session) => session.id === sessionId) || null,
    streamAdapter: {
      disposeSession(sessionId) {
        disposed.push(sessionId);
      }
    },
    setCommandFeedback: (message) => feedback.push(message),
    getExitedSessionMessage: (session) => `Exited ${session?.id}`,
    getActiveSessionId: () => store.getState().activeSessionId,
    getRuntimeEventController: () => ({
      handleSessionTerminalInput(sessionId, data) {
        runtimeCalls.push(["input", sessionId, data]);
      },
      applyRuntimeEvent(event, options) {
        runtimeCalls.push(["event", event.type, options.source || ""]);
        return true;
      }
    }),
    getSessionViewModel: () => ({
      formatSessionDisplayName(session) {
        return `vm:${session.name}`;
      }
    })
  });

  controller.markSessionExited("s1", { exitCode: 7, signal: "TERM" });
  const exited = store.getState().sessions.find((session) => session.id === "s1");
  assert.equal(exited.state, "exited");
  assert.equal(exited.exitCode, 7);
  assert.equal(exited.exitSignal, "TERM");
  assert.deepEqual(disposed, ["s1"]);
  assert.deepEqual(feedback, ["Exited s1"]);
  assert.equal(exited.activityState, "inactive");

  controller.handleSessionTerminalInput("s1", "ls\n");
  assert.equal(controller.applyRuntimeEvent({ type: "session.updated" }, { source: "ws" }), true);
  assert.deepEqual(runtimeCalls, [
    ["input", "s1", "ls\n"],
    ["event", "session.updated", "ws"]
  ]);
  assert.equal(controller.formatSessionDisplayName({ id: "s1", name: "Alpha" }), "vm:Alpha");
  assert.equal(controller.formatSessionToken("s1"), "1");
});
