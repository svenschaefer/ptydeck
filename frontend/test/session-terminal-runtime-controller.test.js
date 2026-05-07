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

function flushAsyncEvents() {
  return new Promise((resolve) => setImmediate(resolve));
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

function createTerminalCardRefs(id = "mount") {
  return {
    node: { id: `${id}-node` },
    mount: new FakeMount(id),
    focusBtn: {},
    quickIdEl: {},
    stateBadgeEl: {},
    sessionMetaRowEl: {},
    sessionAppIdentityEl: {},
    sessionNoteEl: {},
    unrestoredHintEl: {},
    refreshBtn: {},
    settingsDialog: {},
    settingsTabStartupBtn: {},
    settingsTabInputBtn: {},
    settingsTabNoteBtn: {},
    settingsTabThemeBtn: {},
    settingsPanelStartup: {},
    settingsPanelInput: {},
    settingsPanelNote: {},
    settingsPanelTheme: {},
    startCwdInput: {},
    startCommandInput: {},
    startEnvInput: {},
    mouseForwardingModeSelect: {},
    sessionNoteInput: {},
    sessionSendTerminatorSelect: {},
    inputSafetyControls: {},
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
  entry.terminal.emitData("\u001b[I\u001b[O");
  refs.mount.dispatchEvent(createMouseEvent("mousedown", 0));
  refs.mount.helperTextarea.dispatchEvent(createKeyEvent("l"));
  entry.terminal.emitData("ls\n");
  assert.deepEqual(calls, [
    "debug:terminal.created:s1",
    "mounted:s1",
    "registered:s1:true",
    "first-mounted",
    "resize:s1:false:false",
    "resize:s1:true:true",
    "debug:terminal.input.bootstrap_suppressed:s1",
    "debug:terminal.input.forwarding_armed:s1",
    "data:s1:ls\n"
  ]);
  assert.equal(entry.terminal.focusCalls, 1);
  assert.equal(entry.terminal.options.fontSize, 16);
});

test("session-terminal-runtime controller mounts safely when helper textarea and viewport are unavailable", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => {}
  });
  const refs = createTerminalCardRefs("minimal");
  refs.mount.querySelector = () => null;
  const terminals = new Map();

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers: new Map(),
    resolveInitialTheme: () => ({ background: "#000000" }),
    onSessionMounted() {},
    onTerminalData() {},
    onFirstTerminalMounted() {},
    applyResizeForSession() {}
  });

  assert.equal(entry.terminal.textarea, null);
  assert.equal(controller.refreshMountedTerminal("s1"), false);
});

test("session-terminal-runtime controller exposes manual refresh through the mounted entry stabilization path", () => {
  const calls = [];
  const terminals = new Map();
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    terminals,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => calls.push("sync")
  });
  const refs = {
    node: { id: "node" },
    mount: new FakeMount("mount"),
    focusBtn: {},
    quickIdEl: {},
    stateBadgeEl: {},
    sessionMetaRowEl: {},
    sessionNoteEl: {},
    unrestoredHintEl: {},
    refreshBtn: {},
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
    inputSafetyControls: {},
    sessionTagsInput: {},
    startFeedback: {},
    settingsFeedback: {},
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
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers: new Map(),
    applyResizeForSession: (sessionId, options) =>
      calls.push(`resize:${sessionId}:${options?.force === true}:${options?.skipRemote === true}`)
  });

  entry.terminal.refreshCalls.length = 0;
  calls.length = 0;

  const refreshed = controller.refreshMountedTerminal("s1");

  assert.equal(refreshed, true);
  assert.deepEqual(calls, ["resize:s1:true:true", "sync", "sync"]);
  assert.deepEqual(entry.terminal.refreshCalls, [[0, 23]]);
  assert.equal(entry.terminal.scrollToBottomCalls, 2);
});

test("session-terminal-runtime controller defers manual refresh while the terminal is hidden", () => {
  const calls = [];
  const terminals = new Map();
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    terminals,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => calls.push("sync")
  });
  const refs = {
    node: { id: "node" },
    mount: new FakeMount("mount"),
    focusBtn: {},
    quickIdEl: {},
    stateBadgeEl: {},
    sessionMetaRowEl: {},
    sessionNoteEl: {},
    unrestoredHintEl: {},
    refreshBtn: {},
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
    inputSafetyControls: {},
    sessionTagsInput: {},
    startFeedback: {},
    settingsFeedback: {},
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
    initialVisible: false,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers: new Map(),
    applyResizeForSession: (sessionId, options) =>
      calls.push(`resize:${sessionId}:${options?.force === true}:${options?.skipRemote === true}`)
  });

  entry.terminal.refreshCalls.length = 0;
  entry.terminal.scrollToBottomCalls = 0;
  calls.length = 0;

  const refreshed = controller.refreshMountedTerminal("s1");

  assert.equal(refreshed, false);
  assert.equal(entry.pendingViewportSync, true);
  assert.deepEqual(calls, []);
  assert.deepEqual(entry.terminal.refreshCalls, []);
  assert.equal(entry.terminal.scrollToBottomCalls, 0);
});

test("session-terminal-runtime controller returns false for unknown manual refresh targets", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });

  assert.equal(controller.refreshMountedTerminal("missing"), false);
  assert.equal(controller.refreshMountedTerminal(""), false);
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

test("session-terminal-runtime controller resolves ctrl-c selection copy and cancel flows through the guarded action seam", async () => {
  const clipboardWrites = [];
  const forwarded = [];
  let requestedSelection = "";
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    canWriteClipboardText: () => true,
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    },
    requestTerminalCtrlCAction: async ({ selection }) => {
      requestedSelection = selection;
      return clipboardWrites.length === 0 ? "copy" : "cancel";
    }
  });
  const refs = createTerminalCardRefs("ctrl-c");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => forwarded.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "copied text";
  const firstCtrlC = createCtrlCEvent();
  refs.mount.dispatchEvent(firstCtrlC);
  await flushAsyncEvents();

  assert.equal(firstCtrlC.defaultPrevented, true);
  assert.equal(requestedSelection, "copied text");
  assert.deepEqual(clipboardWrites, ["copied text"]);
  assert.deepEqual(forwarded, []);

  const secondCtrlC = createCtrlCEvent();
  refs.mount.dispatchEvent(secondCtrlC);
  await flushAsyncEvents();

  assert.equal(secondCtrlC.defaultPrevented, true);
  assert.deepEqual(forwarded, [["s1", "\u0003"]]);
  assert.equal(entry.terminal.focusCalls >= 2, true);
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

test("session-terminal-runtime controller swallows clipboard-read failures for middle-click paste", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => {
      throw new Error("Clipboard unavailable.");
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

  const middleDown = createMouseEvent("mousedown", 1);
  refs.mount.dispatchEvent(middleDown);
  await Promise.resolve();

  assert.equal(middleDown.defaultPrevented, true);
  assert.deepEqual(pasted, []);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller suppresses duplicate clipboard events and restores the custom key handler on dispose", () => {
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
  const refs = createTerminalCardRefs("paste-dup");
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

  const duplicateEvent = createClipboardPasteEvent("echo once");
  refs.mount.dispatchEvent(duplicateEvent);
  refs.mount.helperTextarea.dispatchEvent(duplicateEvent);

  assert.deepEqual(pasted, [["s1", "echo once"]]);
  assert.equal(duplicateEvent.defaultPrevented, true);
  assert.equal(duplicateEvent.propagationStopped, true);

  entry.disposeClipboardBindings();
  assert.equal(entry.terminal.customKeyEventHandler?.(createPasteShortcutEvent()), true);
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

test("session-terminal-runtime controller reads paste payloads from dataTransfer and leaves non-shortcut custom keys alone", () => {
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
  const refs = createTerminalCardRefs("paste-datatransfer");
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

  assert.equal(entry.terminal.customKeyEventHandler?.(createKeyEvent("x")), true);

  const pasteEvent = {
    type: "paste",
    dataTransfer: {
      getData(format) {
        return format === "text" ? "echo via dataTransfer" : "";
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
  refs.mount.helperTextarea.dispatchEvent(pasteEvent);

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "echo via dataTransfer"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller falls back to reading clipboard text when a paste event has no inline text payload", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "echo fallback\n"
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

  const pasteEvent = createClipboardPasteEvent("");
  refs.mount.helperTextarea.dispatchEvent(pasteEvent);
  await Promise.resolve();

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [["s1", "echo fallback\n"]]);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller swallows clipboard-read failures for empty paste payloads", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => {
      throw new Error("Clipboard unavailable.");
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

  const pasteEvent = createClipboardPasteEvent("");
  refs.mount.helperTextarea.dispatchEvent(pasteEvent);
  await Promise.resolve();

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, []);
  assert.equal(entry.terminal.focusCalls, 0);
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

test("session-terminal-runtime controller falls back to document-level drag listeners when window listeners are unavailable", () => {
  const documentRef = new FakeEventTarget("document");
  const windowRef = {
    Terminal: FakeTerminal,
    ResizeObserver: FakeResizeObserver,
    document: documentRef,
    setTimeout(fn) {
      return fn;
    }
  };
  const controller = createSessionTerminalRuntimeController({ windowRef });
  const refs = createTerminalCardRefs("document-drag-fallback");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  const downEvent = createMouseEvent("mousedown", 0);
  downEvent.clientX = 645;
  downEvent.clientY = 112;
  refs.mount.dispatchEvent(downEvent);

  assert.equal(downEvent.defaultPrevented, true);
  assert.equal(entry.terminal.focusCalls, 1);
  assert.equal(documentRef.listeners.get("mousemove")?.length || 0, 1);
  assert.equal(documentRef.listeners.get("mouseup")?.length || 0, 1);

  const moveEvent = createMouseEvent("mousemove", 0);
  moveEvent.clientX = 645;
  moveEvent.clientY = 220;
  documentRef.dispatchEvent(moveEvent);
  assert.ok(refs.mount.viewport.scrollTop > 0);

  documentRef.dispatchEvent(createMouseEvent("mouseup", 0));
  assert.equal(documentRef.listeners.get("mousemove")?.length || 0, 0);
  assert.equal(documentRef.listeners.get("mouseup")?.length || 0, 0);
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

test("session-terminal-runtime controller ignores duplicate clipboard events and suppresses the immediate middle-click follow-up paste when mouse forwarding is enabled", async () => {
  const pasted = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "application" }),
    readClipboardText: async () => "ignored\n"
  });
  const refs = createTerminalCardRefs("duplicate-paste-events");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1", mouseForwardingMode: "application" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalPaste: (sessionId, data) => pasted.push([sessionId, data]),
    applyResizeForSession() {}
  });

  const duplicatePasteEvent = createClipboardPasteEvent("echo once\n");
  refs.mount.helperTextarea.dispatchEvent(duplicatePasteEvent);
  refs.mount.dispatchEvent(duplicatePasteEvent);

  assert.equal(duplicatePasteEvent.defaultPrevented, true);
  assert.equal(duplicatePasteEvent.propagationStopped, true);
  assert.deepEqual(pasted, [["s1", "echo once\n"]]);

  const middleDown = createMouseEvent("mousedown", 1);
  refs.mount.dispatchEvent(middleDown);
  const suppressedPasteEvent = createClipboardPasteEvent("echo suppressed\n");
  refs.mount.helperTextarea.dispatchEvent(suppressedPasteEvent);
  const nextPasteEvent = createClipboardPasteEvent("echo allowed\n");
  refs.mount.helperTextarea.dispatchEvent(nextPasteEvent);

  assert.equal(middleDown.defaultPrevented, false);
  assert.equal(suppressedPasteEvent.defaultPrevented, false);
  assert.equal(nextPasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, [
    ["s1", "echo once\n"],
    ["s1", "echo allowed\n"]
  ]);
  assert.equal(entry.terminal.focusCalls, 3);
});

test("session-terminal-runtime controller removes focus-intent listeners during clipboard-binding disposal", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
  const refs = createTerminalCardRefs("focus-intent-disposal");
  refs.focusBtn = new FakeEventTarget("focus-intent-button");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  refs.focusBtn.dispatchEvent({ type: "mousedown" });
  assert.equal(entry.terminal.focusCalls, 1);

  entry.disposeClipboardBindings();
  refs.focusBtn.dispatchEvent({ type: "mousedown" });

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

test("session-terminal-runtime controller suppresses terminal onData until explicit operator interaction", () => {
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
  const refs = createTerminalCardRefs("bootstrap-input-guard");
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

  entry.terminal.emitData("\u001b[I\u001b[O");
  entry.terminal.emitData("\u001b[I");
  refs.mount.dispatchEvent(createMouseEvent("mousedown", 0));
  entry.terminal.emitData("pwd\n");

  assert.deepEqual(terminalWrites, []);

  refs.mount.helperTextarea.dispatchEvent(createKeyEvent("p"));
  entry.terminal.emitData("pwd\n");

  assert.deepEqual(terminalWrites, [["s1", "pwd\n"]]);
});

test("session-terminal-runtime controller forwards bootstrap-safe terminal control responses before operator arming", () => {
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
  const refs = createTerminalCardRefs("bootstrap-control-response");
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

  entry.terminal.emitData("\u001b[1;1R");
  entry.terminal.emitData("\u001b[I");

  assert.deepEqual(terminalWrites, [["s1", "\u001b[1;1R"]]);
});

test("session-terminal-runtime controller suppresses empty bootstrap input before operator arming", () => {
  const calls = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    refreshTerminalViewport: () => {},
    syncTerminalScrollArea: () => {},
    debugLog: (event, payload) => calls.push(`${event}:${payload?.sessionId || ""}:${payload?.count || 0}`),
    navigatorRef: {
      clipboard: {
        writeText: async () => {},
        readText: async () => ""
      }
    }
  });

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: createTerminalCardRefs("bootstrap-empty"),
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onSessionMounted: () => {},
    onTerminalData: (sessionId, data) => calls.push(`data:${sessionId}:${data}`),
    afterEntryRegistered: () => {},
    onFirstTerminalMounted: () => {},
    applyResizeForSession: () => {}
  });

  entry.terminal.emitData("");

  assert.deepEqual(calls, ["terminal.created:s1:0", "terminal.input.bootstrap_suppressed:s1:1"]);
});

test("session-terminal-runtime controller focuses but does not arm terminal input forwarding from focus button interaction", () => {
  const terminalWrites = [];
  const refs = createTerminalCardRefs("focus-button-intent");
  refs.focusBtn = new FakeEventTarget("focus-button");
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
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

  entry.terminal.emitData("\u001b[I");
  refs.focusBtn.dispatchEvent({ type: "mousedown" });
  entry.terminal.emitData("ls\n");
  refs.mount.helperTextarea.dispatchEvent(createKeyEvent("l"));
  entry.terminal.emitData("ls\n");

  assert.equal(entry.terminal.focusCalls, 1);
  assert.deepEqual(terminalWrites, [["s1", "ls\n"]]);
});

test("session-terminal-runtime controller arms terminal input forwarding from mouse interaction only when mouse forwarding is enabled", () => {
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    getSessionById: () => ({ id: "s1", mouseForwardingMode: "application" })
  });
  const refs = createTerminalCardRefs("mouse-forwarding-intent");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1", mouseForwardingMode: "application" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.emitData("\u001b[I");
  refs.mount.dispatchEvent(createMouseEvent("mousedown", 0));
  entry.terminal.emitData("\u001b[M");

  assert.deepEqual(terminalWrites, [["s1", "\u001b[M"]]);
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

test("session-terminal-runtime controller resets the Ctrl-C prompt guard after an intent request rejects", async () => {
  const promptOutcomes = [new Error("Prompt failed."), "cancel"];
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
      const next = promptOutcomes.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }
  });
  const refs = createTerminalCardRefs("ctrl-c-reject-reset");
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
  const firstCtrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(firstCtrlCEvent);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  const secondCtrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(secondCtrlCEvent);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(firstCtrlCEvent.defaultPrevented, true);
  assert.equal(secondCtrlCEvent.defaultPrevented, true);
  assert.deepEqual(promptCalls, [
    ["s1", "selected text"],
    ["s1", "selected text"]
  ]);
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

test("session-terminal-runtime controller leaves Ctrl-C untouched when clipboard copy is unavailable", () => {
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
    canWriteClipboardText: () => false,
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

  assert.equal(ctrlCEvent.defaultPrevented, false);
  assert.equal(promptCalled, false);
  assert.deepEqual(terminalWrites, []);
});

test("session-terminal-runtime controller refresh fails closed when no mounted terminal registry exists", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });

  assert.equal(controller.refreshMountedTerminal("s1"), false);
});

test("session-terminal-runtime controller disposes clipboard bindings and restores the custom key handler", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      },
      clearTimeout() {}
    }
  });
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: {
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
    },
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  assert.equal(entry.terminal.customKeyEventHandler(createPasteShortcutEvent()), false);
  entry.disposeClipboardBindings();
  assert.equal(entry.terminal.customKeyEventHandler(createPasteShortcutEvent()), true);
});

test("session-terminal-runtime controller mounts without ResizeObserver support", () => {
  const calls = [];
  const terminals = new Map();
  const terminalObservers = new Map();
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      setTimeout(fn) {
        return fn;
      }
    },
    terminals,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => calls.push("sync")
  });

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: createTerminalCardRefs("no-resize-observer"),
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers,
    applyResizeForSession: (sessionId, options) =>
      calls.push(`resize:${sessionId}:${options?.force === true}:${options?.skipRemote === true}`)
  });

  assert.equal(terminals.get("s1"), entry);
  assert.equal(terminalObservers.size, 0);
  assert.deepEqual(entry.terminal.refreshCalls, [[0, 23]]);
  assert.equal(entry.terminal.scrollToBottomCalls, 1);
  assert.deepEqual(calls, ["resize:s1:false:false", "resize:s1:true:true", "sync", "sync"]);
});

test("session-terminal-runtime controller skips follow-on scroll during manual refresh when disabled", () => {
  const calls = [];
  const terminals = new Map();
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    terminals,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => calls.push("sync")
  });

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: createTerminalCardRefs("no-follow-on-show"),
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers: new Map(),
    applyResizeForSession: (sessionId, options) =>
      calls.push(`resize:${sessionId}:${options?.force === true}:${options?.skipRemote === true}`)
  });

  entry.followOnShow = false;
  entry.terminal.refreshCalls.length = 0;
  entry.terminal.scrollToBottomCalls = 0;
  calls.length = 0;

  assert.equal(controller.refreshMountedTerminal("s1"), true);
  assert.deepEqual(entry.terminal.refreshCalls, [[0, 23]]);
  assert.equal(entry.terminal.scrollToBottomCalls, 0);
  assert.deepEqual(calls, ["resize:s1:true:true", "sync", "sync"]);
});

test("session-terminal-runtime controller degrades safely when clipboard APIs are unavailable by default", async () => {
  const pasted = [];
  const terminalWrites = [];
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    navigatorRef: {}
  });
  const refs = createTerminalCardRefs("no-clipboard-api");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    onTerminalPaste: (sessionId, data) => pasted.push([sessionId, data]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "copy text";
  const enterEvent = createKeyEvent("Enter");
  refs.mount.dispatchEvent(enterEvent);
  await Promise.resolve();

  const ctrlCEvent = createCtrlCEvent();
  refs.mount.dispatchEvent(ctrlCEvent);

  const middleDown = createMouseEvent("mousedown", 1);
  refs.mount.dispatchEvent(middleDown);
  await Promise.resolve();

  const emptyPasteEvent = createClipboardPasteEvent("");
  refs.mount.helperTextarea.dispatchEvent(emptyPasteEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(ctrlCEvent.defaultPrevented, false);
  assert.equal(middleDown.defaultPrevented, true);
  assert.equal(emptyPasteEvent.defaultPrevented, true);
  assert.deepEqual(pasted, []);
  assert.deepEqual(terminalWrites, []);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller falls back to selection text coercion when hasSelection is unavailable", async () => {
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
  const refs = createTerminalCardRefs("selection-fallback");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  entry.terminal.hasSelection = undefined;
  entry.terminal.getSelection = () => 12345;

  const enterEvent = createKeyEvent("Enter");
  refs.mount.dispatchEvent(enterEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["12345"]);
});

test("session-terminal-runtime controller tolerates missing mount listener APIs and stale terminal entries", () => {
  const terminals = new Map([["broken", { isVisible: true, applyResizeForSession() {} }]]);
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    terminals,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => {}
  });
  const refs = createTerminalCardRefs("missing-mount-api");
  refs.mount = {
    id: "missing-mount-api",
    querySelector() {
      return null;
    }
  };

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  assert.equal(entry.terminal.textarea, null);
  assert.equal(controller.refreshMountedTerminal("broken"), false);
  entry.disposeClipboardBindings();
});

test("session-terminal-runtime controller tolerates focus and clipboard targets without removeEventListener during disposal", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    refreshTerminalViewport: () => {},
    syncTerminalScrollArea: () => {}
  });
  const refs = createTerminalCardRefs("dispose-missing-remove");
  const focusListeners = new Map();
  refs.focusBtn = {
    addEventListener(type, handler) {
      const handlers = focusListeners.get(type) || [];
      handlers.push(handler);
      focusListeners.set(type, handlers);
    }
  };
  refs.mount.helperTextarea.removeEventListener = undefined;

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  assert.doesNotThrow(() => entry.disposeClipboardBindings());
});

test("session-terminal-runtime controller falls back cleanly when no global scrollbar drag target exists", () => {
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    documentRef: {}
  });
  const refs = createTerminalCardRefs("no-global-drag");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  const downEvent = createMouseEvent("mousedown", 0);
  downEvent.clientX = 645;
  downEvent.clientY = 112;
  refs.mount.dispatchEvent(downEvent);

  assert.equal(downEvent.defaultPrevented, false);
  assert.equal(entry.terminal.focusCalls, 1);
});

test("session-terminal-runtime controller suppresses auxclick paste locally and arms terminal forwarding from context menu when mouse forwarding is enabled", () => {
  const localController = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });
  const localRefs = createTerminalCardRefs("auxclick-local");
  const localEntry = localController.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: localRefs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  const auxClickEvent = createMouseEvent("auxclick", 1);
  localRefs.mount.dispatchEvent(auxClickEvent);
  assert.equal(auxClickEvent.defaultPrevented, true);
  assert.equal(auxClickEvent.propagationStopped, true);
  assert.equal(localEntry.terminal.focusCalls, 0);

  const terminalWrites = [];
  const forwardingController = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    getSessionById: () => ({ id: "s2", mouseForwardingMode: "application" })
  });
  const forwardingRefs = createTerminalCardRefs("contextmenu-forwarding");
  const forwardingEntry = forwardingController.mountSessionTerminalCard({
    session: { id: "s2", mouseForwardingMode: "application" },
    refs: forwardingRefs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData: (sessionId, data) => terminalWrites.push([sessionId, data]),
    applyResizeForSession() {}
  });

  forwardingEntry.terminal.emitData("\u001b[I");
  forwardingRefs.mount.dispatchEvent({ type: "contextmenu" });
  forwardingEntry.terminal.emitData("\u001b[M");

  assert.equal(forwardingEntry.terminal.focusCalls, 1);
  assert.deepEqual(terminalWrites, [["s2", "\u001b[M"]]);
});

test("session-terminal-runtime controller releases active scrollbar drag during clipboard-binding disposal", () => {
  const windowRef = new FakeWindowEventTarget();
  const controller = createSessionTerminalRuntimeController({
    windowRef
  });
  const refs = createTerminalCardRefs("dispose-drag");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    applyResizeForSession() {}
  });

  const downEvent = createMouseEvent("mousedown", 0);
  downEvent.clientX = 645;
  downEvent.clientY = 112;
  refs.mount.dispatchEvent(downEvent);

  assert.equal(windowRef.listeners.get("mousemove")?.length || 0, 1);
  assert.equal(windowRef.listeners.get("mouseup")?.length || 0, 1);

  entry.disposeClipboardBindings();

  assert.equal(windowRef.listeners.get("mousemove")?.length || 0, 0);
  assert.equal(windowRef.listeners.get("mouseup")?.length || 0, 0);
});

test("session-terminal-runtime controller tolerates ResizeObserver instances without an observe method", () => {
  class IncompleteResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
  }

  const terminals = new Map();
  const terminalObservers = new Map();
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: IncompleteResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    }
  });

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs: createTerminalCardRefs("incomplete-resize-observer"),
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals,
    terminalObservers,
    applyResizeForSession() {}
  });

  assert.equal(terminals.get("s1"), entry);
  assert.equal(terminalObservers.size, 1);
  assert.ok(terminalObservers.get("s1") instanceof IncompleteResizeObserver);
});

test("session-terminal-runtime controller uses the default browser clipboard helpers when custom overrides are absent", async () => {
  const clipboardWrites = [];
  const pasted = [];
  const navigatorRef = {
    clipboard: {
      async writeText(text) {
        clipboardWrites.push(text);
      },
      async readText() {
        return 55;
      }
    }
  };
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    navigatorRef,
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => {},
    requestTerminalCtrlCAction: async () => "copy"
  });
  const refs = createTerminalCardRefs("clipboard-defaults");
  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers: new Map(),
    onTerminalData() {},
    onTerminalPaste: (sessionId, text) => pasted.push([sessionId, text]),
    applyResizeForSession() {}
  });

  entry.terminal.selection = "pwd";
  refs.mount.helperTextarea.dispatchEvent(createKeyEvent("Enter"));
  await flushAsyncEvents();

  refs.mount.dispatchEvent(createMouseEvent("mousedown", 1));
  await flushAsyncEvents();

  assert.deepEqual(clipboardWrites, ["pwd"]);
  assert.deepEqual(pasted, [["s1", "55"]]);
});

test("session-terminal-runtime controller reruns resize from observer callbacks and ignores empty middle-click clipboard reads", async () => {
  const resizeCalls = [];
  const terminalObservers = new Map();
  const refs = createTerminalCardRefs("observer-refresh");
  const controller = createSessionTerminalRuntimeController({
    windowRef: {
      Terminal: FakeTerminal,
      ResizeObserver: FakeResizeObserver,
      setTimeout(fn) {
        return fn;
      }
    },
    readClipboardText: async () => "",
    refreshTerminalViewport: (terminal) => terminal.refresh(0, terminal.rows - 1),
    syncTerminalScrollArea: () => {}
  });

  const entry = controller.mountSessionTerminalCard({
    session: { id: "s1", mouseForwardingMode: "off" },
    refs,
    initialVisible: true,
    gridEl: { appendChild() {} },
    terminals: new Map(),
    terminalObservers,
    onTerminalPaste() {},
    applyResizeForSession(sessionId) {
      resizeCalls.push(sessionId);
    }
  });

  const observer = terminalObservers.get("s1");
  assert.ok(observer instanceof FakeResizeObserver);

  observer.callback();
  refs.mount.dispatchEvent(createMouseEvent("mousedown", 1));
  await flushAsyncEvents();

  assert.ok(resizeCalls.length >= 2);
  assert.equal(entry.terminal.focusCalls >= 1, true);
});
