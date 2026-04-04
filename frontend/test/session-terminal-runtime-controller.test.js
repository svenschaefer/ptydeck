import test from "node:test";
import assert from "node:assert/strict";

import { createSessionTerminalRuntimeController } from "../src/public/ui/session-terminal-runtime-controller.js";

class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.dataHandler = null;
    this.customKeyEventHandler = null;
    this.openedMount = null;
    this.selection = "";
    this.focusCalls = 0;
    this.rows = 24;
    this.refreshCalls = [];
    this.scrollToBottomCalls = 0;
    this.textarea = null;
  }
  open(mount) {
    this.openedMount = mount;
    if (mount && typeof mount.querySelector === "function") {
      this.textarea = mount.querySelector(".xterm-helper-textarea");
    }
  }
  onData(handler) {
    this.dataHandler = handler;
  }
  attachCustomKeyEventHandler(handler) {
    this.customKeyEventHandler = handler;
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
  refresh(start, end) {
    this.refreshCalls.push([start, end]);
  }
  scrollToBottom() {
    this.scrollToBottomCalls += 1;
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
    this.helperTextarea = new FakeEventTarget(`${id}-textarea`);
    this.viewport = new FakeViewport(`${id}-viewport`);
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

  querySelector(selector) {
    if (selector === ".xterm-helper-textarea") {
      return this.helperTextarea;
    }
    if (selector === ".xterm-viewport") {
      return this.viewport;
    }
    return null;
  }
}

class FakeEventTarget {
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

class FakeViewport {
  constructor(id) {
    this.id = id;
    this.scrollTop = 0;
    this.scrollHeight = 2400;
    this.clientHeight = 240;
    this.offsetWidth = 640;
    this.clientWidth = 624;
  }

  getBoundingClientRect() {
    return {
      top: 100,
      bottom: 340,
      left: 10,
      right: 650,
      width: 640,
      height: 240
    };
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

function createCtrlCEvent() {
  const event = createKeyEvent("c");
  event.ctrlKey = true;
  return event;
}

function createPasteShortcutEvent() {
  const event = createKeyEvent("v");
  event.ctrlKey = true;
  return event;
}

function createShiftInsertEvent() {
  const event = createKeyEvent("Insert");
  event.shiftKey = true;
  return event;
}

function createClipboardPasteEvent(text) {
  return {
    type: "paste",
    clipboardData: {
      getData(format) {
        return format === "text" ? text : "";
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
}

function createMouseEvent(type, button) {
  return {
    type,
    button,
    clientX: 0,
    clientY: 0,
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

class FakeWindowEventTarget extends FakeEventTarget {
  constructor() {
    super("window");
    this.Terminal = FakeTerminal;
    this.ResizeObserver = FakeResizeObserver;
  }

  setTimeout(fn) {
    return fn;
  }

  clearTimeout() {}
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
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => {},
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
    settingsTabStartupBtn: {},
    settingsTabNoteBtn: {},
    settingsTabThemeBtn: {},
    settingsPanelStartup: {},
    settingsPanelNote: {},
    settingsPanelTheme: {},
    startCwdInput: {},
    startCommandInput: {},
    startEnvInput: {},
    mouseForwardingModeSelect: {},
    sessionNoteInput: {},
    sessionSendTerminatorSelect: {},
    sessionTagsInput: {},
    startFeedback: {},
    tagListEl: {},
    settingsApplyBtn: {},
    settingsCancelBtn: {},
    settingsStatus: {},
    themeCategory: {},
    themeSearch: {},
    themeSlotSelect: {},
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
    applyResizeForSession: (sessionId, options) =>
      calls.push(`resize:${sessionId}:${options?.force === true}:${options?.skipRemote === true}`)
  });

  assert.equal(gridEl.appended.length, 1);
  assert.equal(terminals.get("s1"), entry);
  assert.equal(terminalObservers.has("s1"), true);
  assert.equal(entry.isVisible, true);
  assert.equal(entry.pendingViewportSync, false);
  assert.equal(entry.mouseForwardingModeSelect, refs.mouseForwardingModeSelect);
  assert.equal(entry.settingsTabNoteBtn, refs.settingsTabNoteBtn);
  assert.equal(entry.settingsPanelTheme, refs.settingsPanelTheme);
  assert.equal(entry.sessionNoteInput, refs.sessionNoteInput);
  assert.equal(entry.themeSlotSelect, refs.themeSlotSelect);
  assert.equal(entry.settingsCancelBtn, refs.settingsCancelBtn);
  assert.deepEqual(timers, [120, 400, 900]);
  assert.deepEqual(entry.terminal.refreshCalls, [[0, 23]]);
  assert.equal(entry.terminal.scrollToBottomCalls, 1);
  entry.terminal.emitData("ls\n");
  assert.deepEqual(calls, [
    "debug:terminal.created:s1",
    "mounted:s1",
    "registered:s1:true",
    "first-mounted",
    "resize:s1:false:false",
    "resize:s1:true:true",
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
  assert.equal(entry.terminal.focusCalls, 2);
});

test("session-terminal-runtime controller does not intercept middle click when mouse forwarding is enabled", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "pwd\n",
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "application" })
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
  controller.mountSessionTerminalCard({
    session: { id: "s1", mouseForwardingMode: "application" },
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

  assert.equal(middleDown.defaultPrevented, false);
  assert.deepEqual(pasted, []);
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

test("session-terminal-runtime controller bridges scrollbar gutter drag to the xterm viewport", () => {
  const windowRef = new FakeWindowEventTarget();
  const controller = createSessionTerminalRuntimeController({
    windowRef
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
  controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: () => {},
    applyResizeForSession() {}
  });

  const downEvent = createMouseEvent("mousedown", 0);
  downEvent.clientX = 645;
  downEvent.clientY = 112;
  refs.mount.dispatchEvent(downEvent);

  assert.equal(downEvent.defaultPrevented, true);
  assert.equal(refs.mount.viewport.scrollTop, 0);

  const moveEvent = createMouseEvent("mousemove", 0);
  moveEvent.clientX = 645;
  moveEvent.clientY = 220;
  windowRef.dispatchEvent(moveEvent);

  assert.ok(refs.mount.viewport.scrollTop > 0);

  const scrollAfterMove = refs.mount.viewport.scrollTop;
  const upEvent = createMouseEvent("mouseup", 0);
  upEvent.clientX = 645;
  upEvent.clientY = 220;
  windowRef.dispatchEvent(upEvent);

  const moveAfterRelease = createMouseEvent("mousemove", 0);
  moveAfterRelease.clientX = 645;
  moveAfterRelease.clientY = 300;
  windowRef.dispatchEvent(moveAfterRelease);

  assert.equal(refs.mount.viewport.scrollTop, scrollAfterMove);
});

test("session-terminal-runtime controller pastes clipboard text on explicit Ctrl-V shortcuts via native paste events", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "git status\n"
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

  const shortcutEvent = createPasteShortcutEvent();
  const handled = entry.terminal.customKeyEventHandler?.(shortcutEvent);
  assert.equal(handled, false);
  assert.deepEqual(pasted, []);

  const pasteEvent = createClipboardPasteEvent("git status\n");
  refs.mount.helperTextarea.dispatchEvent(pasteEvent);

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "git status\n"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller intercepts explicit paste shortcuts through xterm custom key handling without immediate duplicate paste", async () => {
  const pasted = [];
  const timers = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn, delay) {
        const token = { fn, delay };
        timers.push(token);
        return token;
      },
      clearTimeout() {}
    },
    readClipboardText: async () => "npm run test\n"
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

  const pasteEvent = createPasteShortcutEvent();
  const timerCountBeforeShortcut = timers.length;
  const handled = entry.terminal.customKeyEventHandler?.(pasteEvent);

  assert.equal(handled, false);
  assert.deepEqual(pasted, []);
  assert.equal(entry.terminal.focusCalls, 0);

  const fallbackTimer = timers.slice(timerCountBeforeShortcut).find((timer) => timer.delay === 120);
  assert.ok(fallbackTimer);
  await fallbackTimer.fn();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(pasted, [["s1", "npm run test\n"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller treats Shift-Insert and beforeinput paste as one terminal paste", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "ignored\n"
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

  const shiftInsertEvent = createShiftInsertEvent();
  const keyHandledByTerminal = entry.terminal.customKeyEventHandler?.(shiftInsertEvent);
  assert.equal(keyHandledByTerminal, false);
  await Promise.resolve();

  const beforeInputEvent = {
    type: "beforeinput",
    inputType: "insertFromPaste",
    data: "echo beforeinput",
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
  refs.mount.helperTextarea.dispatchEvent(beforeInputEvent);

  const trailingPasteEvent = createClipboardPasteEvent("echo beforeinput");
  refs.mount.helperTextarea.dispatchEvent(trailingPasteEvent);

  assert.equal(beforeInputEvent.defaultPrevented, true);
  assert.equal(trailingPasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "echo beforeinput"]]);
});

test("session-terminal-runtime controller focuses the terminal surface on direct mouse interaction", () => {
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
    applyResizeForSession() {}
  });

  refs.mount.dispatchEvent(createMouseEvent("mousedown", 0));

  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller prompts for Ctrl-C intent when terminal selection makes copy ambiguous", async () => {
  const clipboardWrites = [];
  const promptCalls = [];
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    canWriteClipboardText: () => true,
    requestTerminalCtrlCAction: async ({ session, selection }) => {
      promptCalls.push([session.id, selection]);
      return "copy";
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
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1", name: "one" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "selected text";
  const ctrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(ctrlCEvent);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(ctrlCEvent.defaultPrevented, true);
  assert.deepEqual(promptCalls, [["s1", "selected text"]]);
  assert.deepEqual(clipboardWrites, ["selected text"]);
  assert.deepEqual(terminalWrites, []);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller sends terminal cancel after Ctrl-C prompt chooses cancel", async () => {
  const clipboardWrites = [];
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    canWriteClipboardText: () => true,
    requestTerminalCtrlCAction: async () => "cancel",
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
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "selected text";
  const ctrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(ctrlCEvent);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(ctrlCEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, []);
  assert.deepEqual(terminalWrites, [["s1", "\u0003"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller leaves unambiguous Ctrl-C untouched when nothing is selected", () => {
  let promptCalled = false;
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    canWriteClipboardText: () => true,
    requestTerminalCtrlCAction: async () => {
      promptCalled = true;
      return "copy";
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
  controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    applyResizeForSession() {}
  });

  const ctrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(ctrlCEvent);

  assert.equal(ctrlCEvent.defaultPrevented, false);
  assert.equal(promptCalled, false);
  assert.deepEqual(terminalWrites, []);
});
