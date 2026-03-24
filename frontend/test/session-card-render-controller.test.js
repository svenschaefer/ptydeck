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
  return {
    element: { classList: new ClassList() },
    terminal: {},
    focusBtn: { textContent: "" },
    quickIdEl: { textContent: "" },
    stateBadgeEl: { hidden: true, textContent: "" },
    unrestoredHintEl: { hidden: true, textContent: "" },
    settingsDirty: false,
    isVisible: true,
    pendingViewportSync: false,
    followOnShow: true
  };
}

test("session-card-render controller updates visibility and metadata", () => {
  const calls = [];
  const controller = createSessionCardRenderController({
    isSessionUnrestored: () => false,
    isSessionExited: () => false,
    getSessionStateBadgeText: () => "RUNNING",
    getSessionStateHintText: () => "",
    isTerminalAtBottom: () => false,
    setSessionCardVisibility: (_node, visible) => calls.push(`visible:${visible}`),
    syncTerminalViewportAfterShow: (sessionId) => calls.push(`sync:${sessionId}`),
    ensureQuickId: () => "A",
    renderSessionTagList: () => calls.push("tags"),
    renderSessionPluginBadges: () => calls.push("badges"),
    renderSessionStatus: () => calls.push("status"),
    renderSessionArtifacts: () => calls.push("artifacts"),
    syncSessionStartupControls: () => calls.push("startup"),
    syncSessionThemeControls: () => calls.push("theme"),
    setSettingsDirty: () => calls.push("dirty:false")
  });

  const entry = createEntry();
  const session = { id: "s1", name: "alpha", attentionActive: true };

  controller.updateExistingSessionCard({
    entry,
    session,
    activeSessionId: "s1",
    nextVisible: false
  });

  assert.equal(entry.element.classList.contains("active"), true);
  assert.equal(entry.element.classList.contains("attention"), true);
  assert.equal(entry.stateBadgeEl.hidden, false);
  assert.equal(entry.stateBadgeEl.textContent, "RUNNING");
  assert.equal(entry.focusBtn.textContent, "alpha");
  assert.equal(entry.quickIdEl.textContent, "A");
  assert.equal(entry.isVisible, false);
  assert.equal(entry.followOnShow, false);
  assert.deepEqual(calls.includes("sync:s1"), false);
  assert.deepEqual(calls.includes("tags"), true);
  assert.deepEqual(calls.includes("theme"), true);
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
