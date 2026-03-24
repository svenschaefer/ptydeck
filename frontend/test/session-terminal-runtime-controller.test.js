import test from "node:test";
import assert from "node:assert/strict";

import { createSessionTerminalRuntimeController } from "../src/public/ui/session-terminal-runtime-controller.js";

class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.dataHandler = null;
    this.openedMount = null;
  }
  open(mount) {
    this.openedMount = mount;
  }
  onData(handler) {
    this.dataHandler = handler;
  }
  emitData(data) {
    this.dataHandler?.(data);
  }
}

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
  }
  observe(target) {
    this.observed.push(target);
  }
}

test("session-terminal-runtime controller mounts terminal, registers entry, and schedules resize", () => {
  const calls = [];
  const timers = [];
  const windowRef = {
    Terminal: FakeTerminal,
    ResizeObserver: FakeResizeObserver,
    setTimeout(fn, delay) {
      timers.push(delay);
      return fn;
    }
  };
  const controller = createSessionTerminalRuntimeController({
    windowRef,
    terminalFontSize: 16,
    terminalLineHeight: 1.2,
    terminalFontFamily: "mono",
    debugLog: (event, details) => calls.push(`debug:${event}:${details.sessionId}`)
  });
  const gridEl = {
    appended: [],
    appendChild(node) {
      this.appended.push(node);
    }
  };
  const terminals = new Map();
  const terminalObservers = new Map();
  const refs = {
    node: { id: "node" },
    mount: { id: "mount" },
    focusBtn: {},
    quickIdEl: {},
    stateBadgeEl: {},
    pluginBadgesEl: {},
    unrestoredHintEl: {},
    sessionStatusEl: {},
    sessionArtifactsEl: {},
    settingsDialog: {},
    startCwdInput: {},
    startCommandInput: {},
    startEnvInput: {},
    sessionSendTerminatorSelect: {},
    sessionTagsInput: {},
    startFeedback: {},
    tagListEl: {},
    settingsApplyBtn: {},
    settingsStatus: {},
    themeCategory: {},
    themeSearch: {},
    themeSelect: {},
    themeBg: {},
    themeFg: {},
    themeInputs: {}
  };

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl,
    terminals,
    terminalObservers,
    resolveInitialTheme: () => ({ background: "#000000" }),
    streamPluginEngine: { ensureSession: (session) => calls.push(`ensure:${session.id}`) },
    onTerminalData: (sessionId, data) => calls.push(`data:${sessionId}:${data}`),
    afterEntryRegistered: (registeredEntry, session) => calls.push(`registered:${session.id}:${registeredEntry.isVisible}`),
    onFirstTerminalMounted: () => calls.push("first-mounted"),
    applyResizeForSession: (sessionId) => calls.push(`resize:${sessionId}`)
  });

  assert.equal(gridEl.appended.length, 1);
  assert.equal(terminals.get("s1"), entry);
  assert.equal(terminalObservers.has("s1"), true);
  assert.equal(entry.isVisible, true);
  assert.equal(entry.pendingViewportSync, false);
  assert.deepEqual(timers, [120, 400, 900]);
  entry.terminal.emitData("ls\n");
  assert.deepEqual(calls, [
    "debug:terminal.created:s1",
    "ensure:s1",
    "registered:s1:true",
    "first-mounted",
    "resize:s1",
    "data:s1:ls\n"
  ]);
  assert.equal(entry.terminal.options.fontSize, 16);
});
