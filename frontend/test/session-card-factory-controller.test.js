import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCardFactoryController } from "../src/public/ui/session-card-factory-controller.js";

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

function createNodeStub() {
  const map = new Map();
  const make = () => ({ textContent: "", hidden: true, classList: new ClassList(), addEventListener() {} });
  const makeButton = () => {
    const attrs = new Map();
    return {
      disabled: false,
      classList: new ClassList(),
      addEventListener() {},
      setAttribute(name, value) {
        attrs.set(String(name), String(value));
      },
      getAttribute(name) {
        return attrs.get(String(name)) || null;
      }
    };
  };
  const selectors = [
    ".session-quick-id",
    ".session-focus",
    ".session-state-badge",
    ".session-app-identity",
    ".terminal-toolbar-meta",
    ".session-note-text",
    ".session-unrestored-hint",
    ".session-start-stop",
    ".session-refresh",
    ".session-settings",
    ".session-quick-send-panel",
    ".session-quick-send-title",
    ".session-quick-send-target",
    ".session-quick-send-actions",
    ".session-rename",
    ".session-close",
    ".session-settings-dialog",
    ".session-settings-dismiss",
    ".session-settings-tab-startup",
    ".session-settings-tab-input",
    ".session-settings-tab-note",
    ".session-settings-tab-theme",
    ".session-settings-layout",
    ".session-settings-panel-startup",
    ".session-settings-panel-input",
    ".session-settings-panel-note",
    ".session-settings-panel-theme",
    ".session-start-cwd",
    ".session-start-command",
    ".session-start-env",
    ".session-mouse-forwarding-mode",
    ".session-note-input",
    ".session-send-terminator",
    ".session-tags-input",
    ".session-start-feedback",
    ".session-settings-feedback",
    ".session-start-feedback",
    ".session-tag-list",
    ".session-theme-category",
    ".session-theme-search",
    ".session-theme-slot",
    ".session-theme-select",
    ".session-theme-bg",
    ".session-theme-fg",
    ".session-settings-apply",
    ".session-settings-cancel",
    ".session-settings-status",
    ".terminal-mount",
    ".session-theme-bright-red",
    ".session-start-stop-icon"
  ];
  for (const selector of selectors) {
    map.set(
      selector,
      selector === ".session-start-stop" ? makeButton() : make()
    );
  }
  const node = {
    classList: new ClassList(),
    style: { display: "" },
    querySelector(selector) {
      return map.get(selector) || null;
    },
    cloneNode() {
      return createNodeStub();
    }
  };
  return node;
}

test("session-card-factory controller builds refs and applies initial UI state", () => {
  const calls = [];
  const template = {
    content: {
      firstElementChild: {
        cloneNode() {
          return createNodeStub();
        }
      }
    }
  };
  const controller = createSessionCardFactoryController({
    ensureQuickId: () => "Q",
    getSessionHeaderLabel: (session) => `${session.name} (codex)`,
    getSessionStateBadgeText: () => "RUNNING",
    getSessionStateHintText: () => "hint",
    isSessionUnrestored: () => false,
    isSessionExited: () => false,
    renderSessionAppIdentity: () => calls.push("app"),
    renderSessionTagList: () => calls.push("tags"),
    renderSessionNote: () => calls.push("note"),
    renderSessionQuickSend: () => calls.push("quick"),
    setSessionCardVisibility: (_node, visible) => calls.push(`visible:${visible}`)
  });

  const result = controller.createSessionCardView({
    template,
    session: { id: "s1", name: "alpha" },
    themeProfileKeys: ["brightRed"],
    activeSessionId: "s1",
    visible: true
  });

  assert.equal(result.focusBtn.textContent, "alpha (codex)");
  assert.equal(result.quickIdEl.textContent, "Q");
  assert.equal(result.stateBadgeEl.hidden, false);
  assert.equal(result.stateBadgeEl.textContent, "RUNNING");
  assert.equal(result.unrestoredHintEl.hidden, false);
  assert.equal(result.unrestoredHintEl.textContent, "hint");
  assert.ok(result.sessionMetaRowEl);
  assert.ok(result.sessionNoteEl);
  assert.ok(result.quickSendPanelEl);
  assert.ok(result.quickSendTitleEl);
  assert.ok(result.quickSendTargetEl);
  assert.ok(result.quickSendActionsEl);
  assert.ok(result.settingsTabStartupBtn);
  assert.ok(result.settingsTabInputBtn);
  assert.ok(result.settingsTabNoteBtn);
  assert.ok(result.settingsTabThemeBtn);
  assert.ok(result.settingsLayout);
  assert.ok(result.settingsPanelInput);
  assert.ok(result.settingsPanelNote);
  assert.ok(result.sessionNoteInput);
  assert.ok(result.mouseForwardingModeSelect);
  assert.ok(result.themeSlotSelect);
  assert.equal(result.node.classList.contains("active"), true);
  assert.ok(result.themeInputs.brightRed);
  assert.deepEqual(calls, ["app", "tags", "note", "quick", "visible:true"]);
});

test("session-card-factory controller applies the initial start icon state for stopped sessions", () => {
  const template = {
    content: {
      firstElementChild: {
        cloneNode() {
          return createNodeStub();
        }
      }
    }
  };
  const controller = createSessionCardFactoryController({
    getSessionRuntimeState: (session) => session.state,
    isSessionStopped: (session) => session.state === "stopped",
    renderSessionAppIdentity: () => {},
    renderSessionTagList: () => {},
    renderSessionNote: () => {},
    setSessionCardVisibility: () => {}
  });

  const result = controller.createSessionCardView({
    template,
    session: { id: "s2", name: "ssh", state: "stopped" },
    visible: true
  });

  assert.equal(result.startStopBtn.getAttribute("aria-label"), "Start session");
  assert.equal(result.startStopBtn.getAttribute("title"), "Start session");
  assert.equal(result.startStopIconEl.classList.contains("icon-tabler-player-play-filled"), true);
  assert.equal(result.startStopIconEl.classList.contains("icon-tabler-player-stop-filled"), false);
});

test("session-card-factory controller uses the derived session header label", () => {
  const template = {
    content: {
      firstElementChild: {
        cloneNode() {
          return createNodeStub();
        }
      }
    }
  };
  const controller = createSessionCardFactoryController({
    ensureQuickId: () => "Q",
    getSessionHeaderLabel: (session) => `${session.name} (codex)`,
    renderSessionAppIdentity: () => {},
    renderSessionTagList: () => {},
    renderSessionNote: () => {},
    setSessionCardVisibility: () => {}
  });

  const result = controller.createSessionCardView({
    template,
    session: { id: "s1", name: "ptydeck" },
    visible: true
  });

  assert.equal(result.focusBtn.textContent, "ptydeck (codex)");
});
