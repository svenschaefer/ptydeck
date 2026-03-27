import test from "node:test";
import assert from "node:assert/strict";

import { createSessionTerminalRuntimeController } from "../src/public/ui/session-terminal-runtime-controller.js";

class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.dataHandler = null;
    this.openedMount = null;
    this.selection = "";
    this.focusCalls = 0;
  }
  open(mount) {
    this.openedMount = mount;
  }
  onData(handler) {
    this.dataHandler = handler;
  }
  getSelection() {
    return this.selection;
  }
  hasSelection() {
    return this.selection.length > 0;
  }
  focus() {
    this.focusCalls += 1;
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

class FakeMount {
  constructor(id) {
    this.id = id;
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((entry) => entry !== handler)
    );
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }
}

function createKeyEvent(key) {
  return {
    type: "keydown",
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
}

function createMouseEvent(type, button) {
  return {
    type,
    button,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
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
    mount: new FakeMount("mount"),
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
    onSessionMounted: (session) => calls.push(`mounted:${session.id}`),
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
    "mounted:s1",
    "registered:s1:true",
    "first-mounted",
    "resize:s1",
    "data:s1:ls\n"
  ]);
  assert.equal(entry.terminal.options.fontSize, 16);
});

test("session-terminal-runtime controller copies the terminal selection on plain Enter", async () => {
  const clipboardWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    }
  });
  const refs = {
    node: { id: "node" },
    mount: new FakeMount("mount"),
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
  const calls = [];
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => calls.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "copied text";
  const enterEvent = createKeyEvent("Enter");
  refs.mount.dispatchEvent(enterEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["copied text"]);
  assert.deepEqual(calls, []);
});

test("session-terminal-runtime controller pastes clipboard text into the terminal on middle click", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "pwd\n"
  });
  const refs = {
    node: { id: "node" },
    mount: new FakeMount("mount"),
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
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: () => pasted.push(["data"]),
    onTerminalPaste: (sessionId, data) => pasted.push([sessionId, data]),
    applyResizeForSession() {}
  });

  const middleDown = createMouseEvent("mousedown", 1);
  refs.mount.dispatchEvent(middleDown);
  await Promise.resolve();

  assert.equal(middleDown.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "pwd\n"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller routes clipboard paste events through guarded paste handling", () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
  const refs = {
    node: { id: "node" },
    mount: new FakeMount("mount"),
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
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalPaste: (sessionId, data) => pasted.push([sessionId, data]),
    applyResizeForSession() {}
  });

  const pasteEvent = {
    type: "paste",
    clipboardData: {
      getData(format) {
        return format === "text" ? "echo hi" : "";
      }
    },
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
  refs.mount.dispatchEvent(pasteEvent);

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "echo hi"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});
