import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCardRenderController } from "../src/public/ui/session-card-render-controller.js";

class ClassList {
  constructor() {
    this.values = new Set();
  }
  toggle(key, force) {
    const value = String(key);
    if (force === true) {
      this.values.add(value);
      return;
    }
    if (force === false) {
      this.values.delete(value);
      return;
    }
    if (this.values.has(value)) {
      this.values.delete(value);
      return;
    }
    this.values.add(value);
  }
  contains(key) {
    return this.values.has(String(key));
  }
}

function createEntry() {
  const startStopAttrs = new Map();
  const mount = {
    contains(element) {
      return element === this.child;
    },
    child: null
  };
  const terminal = {
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    }
  };
  return {
    element: { classList: new ClassList() },
    terminal,
    focusBtn: { textContent: "" },
    quickIdEl: { textContent: "" },
    startStopBtn: {
      disabled: false,
      setAttribute(name, value) {
        startStopAttrs.set(String(name), String(value));
      },
      getAttribute(name) {
        return startStopAttrs.get(String(name)) || null;
      }
    },
    startStopIconEl: { classList: new ClassList() },
    quickSendPanelEl: {},
    quickSendActionsEl: {},
    stateBadgeEl: { hidden: true, textContent: "" },
    sessionAppIdentityEl: { hidden: true, textContent: "", title: "" },
    unrestoredHintEl: { hidden: true, textContent: "" },
    settingsDirty: false,
    isVisible: true,
    pendingViewportSync: false,
    followOnShow: true,
    mount
  };
}

test("session-card-render controller updates visibility and metadata", () => {
  const calls = [];
  const controller = createSessionCardRenderController({
    isSessionUnrestored: () => false,
    isSessionExited: () => false,
    getSessionHeaderLabel: (session) => `${session.name} (codex)`,
    getSessionStateBadgeText: () => "RUNNING",
    getSessionStateHintText: () => "",
    isTerminalAtBottom: () => false,
    setSessionCardVisibility: (_node, visible) => calls.push(`visible:${visible}`),
    syncTerminalViewportAfterShow: (sessionId) => calls.push(`sync:${sessionId}`),
    ensureQuickId: () => "A",
    renderSessionAppIdentity: () => calls.push("app"),
    renderSessionTagList: () => calls.push("tags"),
    renderSessionNote: () => calls.push("note"),
    renderSessionQuickSend: () => calls.push("quick"),
    syncSessionStartupControls: () => calls.push("startup"),
    syncSessionNoteControls: () => calls.push("note-sync"),
    syncSessionThemeControls: () => calls.push("theme"),
    setSettingsDirty: () => calls.push("dirty:false")
  });

  const entry = createEntry();
  const session = { id: "s1", name: "alpha" };

  controller.updateExistingSessionCard({
    entry,
    session,
    activeSessionId: "s1",
    nextVisible: false
  });

  assert.equal(entry.element.classList.contains("active"), true);
  assert.equal(entry.element.classList.contains("attention"), false);
  assert.equal(entry.stateBadgeEl.hidden, false);
  assert.equal(entry.stateBadgeEl.textContent, "RUNNING");
  assert.equal(entry.focusBtn.textContent, "alpha (codex)");
  assert.equal(entry.quickIdEl.textContent, "A");
  assert.equal(entry.isVisible, false);
  assert.equal(entry.followOnShow, false);
  assert.deepEqual(calls.includes("sync:s1"), false);
  assert.deepEqual(calls.includes("app"), true);
  assert.deepEqual(calls.includes("tags"), true);
  assert.deepEqual(calls.includes("note"), true);
  assert.deepEqual(calls.includes("quick"), true);
  assert.deepEqual(calls.includes("theme"), false);
});

test("session-card-render controller performs viewport sync on show", () => {
  const calls = [];
  const controller = createSessionCardRenderController({
    syncTerminalViewportAfterShow: (sessionId) => calls.push(`sync:${sessionId}`),
    setSessionCardVisibility: () => {}
  });

  const entry = createEntry();
  entry.isVisible = false;
  entry.pendingViewportSync = true;

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s2", name: "" },
    activeSessionId: "other",
    nextVisible: true
  });

  assert.deepEqual(calls, ["sync:s2"]);
});

test("session-card-render controller only syncs settings controls while dialog is open", () => {
  const calls = [];
  const controller = createSessionCardRenderController({
    setSessionCardVisibility: () => {},
    syncSessionStartupControls: () => calls.push("startup"),
    syncSessionNoteControls: () => calls.push("note-sync"),
    syncSessionInputSafetyControls: () => calls.push("input-safety"),
    syncSessionThemeControls: () => calls.push("theme"),
    setSettingsDirty: () => calls.push("dirty:false")
  });

  const entry = createEntry();
  entry.settingsDialog = { open: true };

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s3", name: "beta" },
    activeSessionId: "other",
    nextVisible: true
  });

  assert.deepEqual(calls, ["startup", "note-sync", "input-safety", "theme", "dirty:false"]);
});

test("session-card-render controller restores terminal focus when a render interrupts a focused terminal", () => {
  const entry = createEntry();
  const focusedTextarea = { className: "xterm-helper-textarea" };
  entry.mount.child = focusedTextarea;

  const controller = createSessionCardRenderController({
    setSessionCardVisibility: () => {},
    getActiveElement: () => focusedTextarea
  });

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s4", name: "gamma" },
    activeSessionId: "s4",
    nextVisible: true
  });

  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-card-render controller falls back to the base session label when no derived header label function is provided", () => {
  const entry = createEntry();
  const controller = createSessionCardRenderController({
    setSessionCardVisibility: () => {}
  });

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s9", name: "gamma" },
    activeSessionId: "other",
    nextVisible: true
  });

  assert.equal(entry.focusBtn.textContent, "gamma");
});

test("session-card-render controller toggles the start-stop control for stopped sessions", () => {
  const entry = createEntry();
  const controller = createSessionCardRenderController({
    setSessionCardVisibility: () => {},
    getSessionRuntimeState: (session) => session.state,
    isSessionStopped: (session) => session.state === "stopped"
  });

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s10", name: "delta", state: "stopped" },
    activeSessionId: "other",
    nextVisible: true
  });

  assert.equal(entry.element.classList.contains("stopped"), true);
  assert.equal(entry.startStopBtn.disabled, false);
  assert.equal(entry.startStopBtn.getAttribute("aria-label"), "Start session");
  assert.equal(entry.startStopIconEl.classList.contains("icon-tabler-player-play-filled"), true);
  assert.equal(entry.startStopIconEl.classList.contains("icon-tabler-player-stop-filled"), false);
});

test("session-card-render controller disables start for start-blocked stopped sessions", () => {
  const entry = createEntry();
  const controller = createSessionCardRenderController({
    setSessionCardVisibility: () => {},
    getSessionRuntimeState: (session) => session.state,
    isSessionStopped: (session) => session.state === "stopped",
    isSessionStartBlocked: (session) => session.startBlockedReason === "remote-secret-unavailable",
    getSessionStartBlockedMessage: () => "Start is unavailable until a new remote secret is provided."
  });

  controller.updateExistingSessionCard({
    entry,
    session: { id: "s11", name: "ssh", state: "stopped", startBlockedReason: "remote-secret-unavailable" },
    activeSessionId: "other",
    nextVisible: true
  });

  assert.equal(entry.startStopBtn.disabled, true);
  assert.equal(entry.startStopBtn.getAttribute("aria-label"), "Start session unavailable");
  assert.equal(entry.startStopBtn.getAttribute("title"), "Start is unavailable until a new remote secret is provided.");
  assert.equal(entry.startStopIconEl.classList.contains("icon-tabler-player-play-filled"), true);
});
