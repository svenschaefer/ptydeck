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
  const selectors = [
    ".session-quick-id",
    ".session-focus",
    ".session-state-badge",
    ".session-plugin-badges",
    ".session-unrestored-hint",
    ".session-status-text",
    ".session-artifacts-overlay",
    ".session-artifacts",
    ".session-artifacts-dismiss",
    ".session-settings",
    ".session-rename",
    ".session-close",
    ".session-settings-dialog",
    ".session-settings-dismiss",
    ".session-start-cwd",
    ".session-start-command",
    ".session-start-env",
    ".session-send-terminator",
    ".session-tags-input",
    ".session-start-feedback",
    ".session-tag-list",
    ".session-theme-category",
    ".session-theme-search",
    ".session-theme-select",
    ".session-theme-bg",
    ".session-theme-fg",
    ".session-settings-apply",
    ".session-settings-cancel",
    ".session-settings-status",
    ".terminal-mount",
    ".session-theme-bright-red"
  ];
  for (const selector of selectors) {
    map.set(selector, make());
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
    getSessionStateBadgeText: () => "RUNNING",
    getSessionStateHintText: () => "hint",
    isSessionUnrestored: () => false,
    isSessionExited: () => false,
    renderSessionTagList: () => calls.push("tags"),
    renderSessionPluginBadges: () => calls.push("badges"),
    renderSessionStatus: () => calls.push("status"),
    renderSessionArtifacts: () => calls.push("artifacts"),
    setSessionCardVisibility: (_node, visible) => calls.push(`visible:${visible}`)
  });

  const result = controller.createSessionCardView({
    template,
    session: { id: "s1", name: "alpha", attentionActive: true },
    themeProfileKeys: ["brightRed"],
    activeSessionId: "s1",
    visible: true
  });

  assert.equal(result.focusBtn.textContent, "alpha");
  assert.equal(result.quickIdEl.textContent, "Q");
  assert.equal(result.stateBadgeEl.hidden, false);
  assert.equal(result.stateBadgeEl.textContent, "RUNNING");
  assert.equal(result.unrestoredHintEl.hidden, false);
  assert.equal(result.unrestoredHintEl.textContent, "hint");
  assert.equal(result.node.classList.contains("active"), true);
  assert.equal(result.node.classList.contains("attention"), true);
  assert.ok(result.themeInputs.brightRed);
  assert.deepEqual(calls, ["tags", "badges", "status", "artifacts", "visible:true"]);
});
