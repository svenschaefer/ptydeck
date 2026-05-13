import test from "node:test";
import assert from "node:assert/strict";

import { createSessionRuntimeController } from "../src/public/session-runtime-controller.js";
import { getMouseTrackingResetSequence } from "../src/public/session-mouse-forwarding.js";
import { createStore } from "../src/public/store.js";

function createTerminal() {
  return {
    writes: [],
    resetCalls: 0,
    clearSelectionCalls: 0,
    scrollToBottomCalls: 0,
    refreshCalls: [],
    rows: 24,
    write(data, callback) {
      this.writes.push(data);
      if (typeof callback === "function") {
        callback();
      }
    },
    refresh(start, end) {
      this.refreshCalls.push([start, end]);
    },
    reset() {
      this.resetCalls += 1;
    },
    scrollToBottom() {
      this.scrollToBottomCalls += 1;
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

test("session-runtime controller syncs backend quick-id tokens deterministically", () => {
  const store = createStore();
  store.upsertSession({ id: "s1", name: "one", deckId: "default", quickIdToken: "2" });
  store.upsertSession({ id: "s2", name: "two", deckId: "default", quickIdToken: "1" });
  const controller = createSessionRuntimeController({
    store,
    sessionQuickIds: new Map(),
    quickIdPool: ["1", "2", "3"],
    getSessionById: (sessionId) => store.getState().sessions.find((session) => session.id === sessionId) || null
  });

  assert.equal(controller.ensureQuickId("s1"), "2");
  assert.equal(controller.ensureQuickId("s2"), "1");
  assert.equal(controller.formatSessionToken("s1"), "2");
  assert.equal(controller.formatSessionToken("s2"), "1");
  assert.deepEqual(
    controller.sortSessionsByQuickId([
      { id: "s1", name: "one", quickIdToken: "2" },
      { id: "s2", name: "two", quickIdToken: "1" }
    ]).map((session) => session.id),
    ["s2", "s1"]
  );
});

test("session-runtime controller swaps fallback quick ids locally when no backend token is present", () => {
  const controller = createSessionRuntimeController({
    sessionQuickIds: new Map(),
    quickIdPool: ["1", "2", "3"]
  });

  assert.equal(controller.ensureQuickId("s1"), "1");
  assert.equal(controller.ensureQuickId("s2"), "2");
  assert.equal(controller.swapSessionTokens("s1", "s2"), true);
  assert.equal(controller.formatSessionToken("s1"), "2");
  assert.equal(controller.formatSessionToken("s2"), "1");
  assert.equal(controller.swapSessionTokens("s1", "s1"), false);
});

test("session-runtime controller appends chunks and retries replay for late terminal mounts", () => {
  const terminals = new Map();
  const terminal = createTerminal();
  const callbacks = [];
  const marks = [];
  const searchCalls = [];
  const resizeCalls = [];

  const controller = createSessionRuntimeController({
    terminals,
    terminalSearchState: { query: "alpha" },
    refreshTerminalViewport: () => callbacks.push("refresh"),
    syncTerminalScrollArea: () => callbacks.push("scroll"),
    markSessionActivity: (sessionId) => marks.push(sessionId),
    syncActiveTerminalSearch: (payload) => searchCalls.push(payload),
    getActiveSessionId: () => "s1",
    applyResizeForSession: (sessionId, options) =>
      resizeCalls.push([sessionId, options?.force === true, options?.skipRemote === true]),
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
  assert.equal(controller.appendTerminalChunk("s1", "\u001b[2J\u001b[H"), true);
  assert.equal(controller.appendTerminalChunk("s1", "\r\n\t "), true);
  assert.equal(controller.appendTerminalChunk("s1", "\u001b7\u001b8\u001b=\u001b>"), true);
  assert.equal(controller.appendTerminalChunk("s1", "\u001b(B\u001b)0\u001b#8"), true);
  assert.equal(controller.appendTerminalChunk("s1", "\u001bP1$r0 q\u001b\\"), true);
  assert.equal(controller.appendTerminalChunk("s1", "\u200b\u200c\u200d\ufeff"), true);
  assert.equal(
    controller.appendTerminalChunk(
      "s1",
      "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l"
    ),
    true
  );
  assert.equal(
    controller.appendTerminalChunk(
      "s1",
      "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[42;92H\u001b[2m1\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l"
    ),
    true
  );
  assert.deepEqual(terminal.writes, [
    "hello",
    "\u001b[2J\u001b[H",
    "\r\n\t ",
    "\u001b7\u001b8\u001b=\u001b>",
    "\u001b(B\u001b)0\u001b#8",
    "\u001bP1$r0 q\u001b\\",
    "\u200b\u200c\u200d\ufeff",
    "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l",
    "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[42;92H\u001b[2m1\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l"
  ]);
  assert.deepEqual(callbacks, Array.from({ length: 9 }, () => ["scroll", "refresh", "scroll"]).flat());
  assert.deepEqual(marks, ["s1", "s1"]);
  assert.deepEqual(searchCalls, [
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true },
    { preserveSelection: true }
  ]);

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
  assert.deepEqual(
    resizeCalls.filter(([sessionId]) => sessionId === "late"),
    [
      ["late", true, true],
      ["late", true, true]
    ]
  );
});

test("session-runtime controller strips mouse-tracking control sequences when forwarding is off", () => {
  const terminals = new Map();
  const terminal = createTerminal();
  const controller = createSessionRuntimeController({
    terminals,
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "off" })
  });
  terminals.set("s1", { terminal, isVisible: true, searchRevision: 0, mouseForwardingMode: "off" });

  assert.equal(controller.appendTerminalChunk("s1", "\u001b[?1000hvisible\u001b[?1006h"), true);
  assert.deepEqual(terminal.writes, ["visible"]);
});

test("session-runtime controller buffers split CSI fragments and strips split mouse-tracking sequences", () => {
  const terminals = new Map();
  const terminal = createTerminal();
  const controller = createSessionRuntimeController({
    terminals,
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "off" })
  });
  terminals.set("s1", {
    terminal,
    isVisible: true,
    searchRevision: 0,
    mouseForwardingMode: "off",
    mouseForwardingOutputPending: ""
  });

  assert.equal(controller.appendTerminalChunk("s1", "\u001b[?100"), true);
  assert.equal(controller.appendTerminalChunk("s1", "0h\u001b[40;2"), true);
  assert.equal(controller.appendTerminalChunk("s1", "Hdone"), true);
  assert.deepEqual(terminal.writes, ["\u001b[40;2Hdone"]);
});

test("session-runtime controller resets mouse tracking when switching back to off", () => {
  const terminals = new Map();
  const terminal = createTerminal();
  const controller = createSessionRuntimeController({
    terminals,
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "off" })
  });
  terminals.set("s1", { terminal, isVisible: true, searchRevision: 0, mouseForwardingMode: "application" });

  controller.upsertSession({ id: "s1", mouseForwardingMode: "off" });

  assert.deepEqual(terminal.writes, [getMouseTrackingResetSequence()]);
});

test("session-runtime controller stabilizes mounted terminals after runtime snapshots", () => {
  const terminals = new Map();
  const visibleTerminal = createTerminal();
  const hiddenTerminal = createTerminal();
  const callbacks = [];
  const resizeCalls = [];
  const controller = createSessionRuntimeController({
    terminals,
    terminalSearchState: { query: "needle" },
    refreshTerminalViewport: () => callbacks.push("refresh"),
    syncTerminalScrollArea: () => callbacks.push("scroll"),
    syncActiveTerminalSearch: (payload) => callbacks.push(["search", payload.preserveSelection]),
    applyResizeForSession: (sessionId, options) =>
      resizeCalls.push([sessionId, options?.force === true, options?.skipRemote === true]),
    getActiveSessionId: () => "s1",
    windowRef: {
      setTimeout(fn) {
        callbacks.push("timer");
        fn();
        return 1;
      }
    }
  });

  terminals.set("s1", {
    terminal: visibleTerminal,
    isVisible: true,
    pendingViewportSync: false,
    followOnShow: true,
    searchRevision: 0
  });
  terminals.set("s2", {
    terminal: hiddenTerminal,
    isVisible: false,
    pendingViewportSync: false,
    followOnShow: true,
    searchRevision: 0
  });

  controller.scheduleSnapshotTerminalStabilization(["s1", "s2"]);

  assert.deepEqual(resizeCalls, [
    ["s1", true, true],
    ["s1", true, true],
    ["s1", true, true],
    ["s1", true, true]
  ]);
  assert.deepEqual(visibleTerminal.refreshCalls, [
    [0, 23],
    [0, 23],
    [0, 23],
    [0, 23]
  ]);
  assert.equal(visibleTerminal.scrollToBottomCalls, 4);
  assert.equal(terminals.get("s1").pendingViewportSync, false);
  assert.equal(terminals.get("s2").pendingViewportSync, true);
  assert.equal(callbacks.filter((entry) => entry === "timer").length, 3);
  assert.equal(callbacks.filter((entry) => entry === "refresh").length, 4);
  assert.equal(callbacks.filter((entry) => entry === "scroll").length, 8);
  assert.equal(
    callbacks.filter((entry) => Array.isArray(entry) && entry[0] === "search" && entry[1] === true).length,
    4
  );
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

  assert.equal(controller.ensureSessionRuntime({ id: "s1" }), true);
  assert.equal(controller.disposeSessionRuntime("s2"), true);
  controller.markSessionExited("s1", { exitCode: 7, signal: "TERM" });
  const exited = store.getState().sessions.find((session) => session.id === "s1");
  assert.equal(exited.state, "exited");
  assert.equal(exited.exitCode, 7);
  assert.equal(exited.exitSignal, "TERM");
  assert.deepEqual(disposed, ["s2", "s1"]);
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

test("session-runtime controller fails closed for invalid inputs and falls back deterministically for display and token sorting", () => {
  const removals = [];
  const closures = [];
  const controller = createSessionRuntimeController({
    store: {
      removeSession(sessionId) {
        removals.push(sessionId);
      },
      markSessionClosed(sessionId) {
        closures.push(sessionId);
      },
      getState() {
        return { sessions: [] };
      }
    },
    terminals: new Map(),
    sessionQuickIds: new Map([
      ["s1", "1"],
      ["s2", "1"],
      ["s4", "1"],
      ["s3", "2"]
    ]),
    quickIdPool: ["1", "2", "3"]
  });

  assert.equal(controller.ensureQuickId(""), "?");
  assert.equal(controller.appendTerminalChunk("missing", ""), false);
  assert.equal(controller.ensureSessionRuntime(null), false);
  assert.equal(controller.disposeSessionRuntime(""), false);
  controller.markSessionExited("missing", { exitCode: 1 });
  controller.removeSession("s1");
  controller.markSessionClosed("s2");
  assert.equal(controller.applyRuntimeEvent({ type: "session.updated" }), false);
  assert.equal(controller.formatSessionDisplayName({ id: "s9" }), "s9");

  const sortedByNameThenId = controller.sortSessionsByQuickId([
    { id: "s2", name: "Beta" },
    { id: "s4", name: "Alpha" },
    { id: "s1", name: "Alpha" }
  ]);
  assert.deepEqual(
    sortedByNameThenId.map((session) => session.id),
    ["s1", "s4", "s2"]
  );
  assert.deepEqual(removals, ["s1"]);
  assert.deepEqual(closures, ["s2"]);
});

test("session-runtime controller clears mounted terminal state when a session becomes stopped", () => {
  const store = createStore();
  const terminal = createTerminal();
  const terminals = new Map([
    [
      "s1",
      {
        terminal,
        isVisible: true,
        pendingViewportSync: true,
        followOnShow: true,
        searchRevision: 0
      }
    ]
  ]);
  const controller = createSessionRuntimeController({
    store,
    terminals,
    getActiveSessionId: () => "s1",
    getStoppedSessionMessage: () => "stopped"
  });

  controller.upsertSession({ id: "s1", name: "one", deckId: "default", state: "stopped" });

  assert.equal(terminal.resetCalls, 1);
  assert.equal(terminals.get("s1").pendingViewportSync, false);
});
