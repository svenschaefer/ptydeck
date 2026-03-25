import test from "node:test";
import assert from "node:assert/strict";

import { createAppSessionRuntimeFacadeController } from "../src/public/app-session-runtime-facade-controller.js";

test("app-session-runtime facade delegates session/runtime behavior and viewport sync", () => {
  const calls = [];
  const store = {
    state: { sessions: [{ id: "s1", deckId: "deck-a", name: "Alpha" }] },
    getState() {
      return this.state;
    },
    markSessionActivity(sessionId, payload) {
      calls.push(["mark-activity", sessionId, payload.timestamp]);
    }
  };
  const sessionViewModel = {
    resolveSessionDeckId(session) {
      calls.push(["resolve-deck", session.id]);
      return session.deckId || "default";
    }
  };
  const sessionRuntimeController = {
    findNextQuickId() {
      calls.push(["find-quick-id"]);
      return "7";
    },
    ensureQuickId(sessionId) {
      calls.push(["ensure-quick-id", sessionId]);
      return "7";
    },
    pruneQuickIds(activeSessionIds) {
      calls.push(["prune-quick-ids", activeSessionIds.join(",")]);
    },
    appendTerminalChunk(sessionId, data, options) {
      calls.push(["append", sessionId, data, options.markActivity]);
      return true;
    },
    replaySnapshotOutputs(outputs, attempt) {
      calls.push(["replay", outputs.length, attempt]);
    },
    upsertSession(nextSession) {
      calls.push(["upsert", nextSession.id]);
    },
    markSessionExited(sessionId, exitDetails) {
      calls.push(["exited", sessionId, exitDetails.exitCode]);
    },
    removeSession(sessionId) {
      calls.push(["remove", sessionId]);
    },
    markSessionClosed(sessionId) {
      calls.push(["closed", sessionId]);
    },
    handleSessionTerminalInput(sessionId, data) {
      calls.push(["input", sessionId, data]);
    },
    applyRuntimeEvent(event, options) {
      calls.push(["runtime-event", event.type, options.source]);
      return true;
    },
    formatSessionDisplayName(session) {
      calls.push(["display-name", session.id]);
      return `Display ${session.id}`;
    },
    formatSessionToken(sessionId) {
      calls.push(["token", sessionId]);
      return "Q";
    }
  };
  const layoutDeckFacade = {
    applyResizeForSession(sessionId, options) {
      calls.push(["resize", sessionId, options.force]);
    }
  };
  const terminal = {
    scrollToBottom() {
      calls.push(["scroll-bottom"]);
    }
  };
  const timeouts = [];
  const controller = createAppSessionRuntimeFacadeController({
    store,
    defaultDeckId: "default",
    getSessionViewModel: () => sessionViewModel,
    getSessionRuntimeController: () => sessionRuntimeController,
    getAppLayoutDeckFacadeController: () => layoutDeckFacade,
    refreshTerminalViewport: () => calls.push(["refresh-viewport"]),
    syncTerminalScrollArea: () => calls.push(["sync-scroll"]),
    nowFn: () => 1234,
    setTimeoutRef(callback, delay) {
      timeouts.push(delay);
      callback();
      return delay;
    }
  });

  assert.deepEqual(controller.getSessionById("s1"), { id: "s1", deckId: "deck-a", name: "Alpha" });
  assert.equal(controller.resolveSessionDeckId({ id: "s1", deckId: "deck-a" }), "deck-a");
  const node = { hidden: false, style: { display: "block" } };
  controller.setSessionCardVisibility(node, false);
  assert.equal(node.hidden, true);
  assert.equal(node.style.display, "none");
  assert.equal(controller.markSessionActivity("s1"), 1234);
  const entry = { terminal, followOnShow: true, pendingViewportSync: true };
  assert.equal(controller.syncTerminalViewportAfterShow("s1", entry), true);
  assert.equal(entry.pendingViewportSync, false);
  assert.deepEqual(timeouts, [80, 220]);
  assert.equal(controller.findNextQuickId(), "7");
  assert.equal(controller.ensureQuickId("s1"), "7");
  controller.pruneQuickIds(["s1", "s2"]);
  assert.equal(controller.appendTerminalChunk("s1", "hi", { markActivity: false }), true);
  controller.replaySnapshotOutputs([{ sessionId: "s1", data: "hi" }], 2);
  controller.upsertSession({ id: "s2" });
  controller.markSessionExited("s1", { exitCode: 1 });
  controller.removeSession("s1");
  controller.markSessionClosed("s1");
  controller.handleSessionTerminalInput("s1", "pwd\n");
  assert.equal(controller.applyRuntimeEvent({ type: "session.updated" }, { source: "ws" }), true);
  assert.equal(controller.formatSessionDisplayName({ id: "s1" }), "Display s1");
  assert.equal(controller.formatSessionToken("s1"), "Q");

  assert.deepEqual(calls, [
    ["resolve-deck", "s1"],
    ["mark-activity", "s1", 1234],
    ["resize", "s1", true],
    ["sync-scroll"],
    ["refresh-viewport"],
    ["scroll-bottom"],
    ["sync-scroll"],
    ["resize", "s1", true],
    ["sync-scroll"],
    ["refresh-viewport"],
    ["scroll-bottom"],
    ["sync-scroll"],
    ["resize", "s1", true],
    ["sync-scroll"],
    ["refresh-viewport"],
    ["scroll-bottom"],
    ["sync-scroll"],
    ["find-quick-id"],
    ["ensure-quick-id", "s1"],
    ["prune-quick-ids", "s1,s2"],
    ["append", "s1", "hi", false],
    ["replay", 1, 2],
    ["upsert", "s2"],
    ["exited", "s1", 1],
    ["remove", "s1"],
    ["closed", "s1"],
    ["input", "s1", "pwd\n"],
    ["runtime-event", "session.updated", "ws"],
    ["display-name", "s1"],
    ["token", "s1"]
  ]);
});

test("app-session-runtime facade falls back safely without controllers", () => {
  const store = {
    getState() {
      return { sessions: [] };
    },
    markSessionActivity() {}
  };
  const controller = createAppSessionRuntimeFacadeController({
    store,
    defaultDeckId: "default",
    nowFn: () => 55,
    setTimeoutRef() {}
  });

  assert.equal(controller.getSessionById("missing"), null);
  assert.equal(controller.resolveSessionDeckId({}), "default");
  assert.equal(controller.markSessionActivity("s1"), 55);
  assert.equal(controller.syncTerminalViewportAfterShow("s1", null), false);
  assert.equal(controller.findNextQuickId(), "?");
  assert.equal(controller.ensureQuickId("s1"), "?");
  assert.equal(controller.appendTerminalChunk("s1", "x"), false);
  assert.equal(controller.applyRuntimeEvent({ type: "x" }), false);
  assert.equal(controller.formatSessionDisplayName({ id: "s1" }), "s1");
  assert.equal(controller.formatSessionToken("s1"), "?");
});
