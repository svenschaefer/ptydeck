import test from "node:test";
import assert from "node:assert/strict";

import {
  createSendHistoryRuntimeController,
  SEND_HISTORY_STORAGE_KEY,
  formatHistoryStats,
  formatHistoryTimestamp,
  normalizeSendHistoryText,
  summarizeSendHistoryText
} from "../src/public/send-history-runtime-controller.js";

class FakeClassList {
  constructor() {
    this.set = new Set();
  }

  add(token) {
    this.set.add(token);
  }

  remove(token) {
    this.set.delete(token);
  }

  contains(token) {
    return this.set.has(token);
  }
}

class FakeElement {
  constructor({ id = "", tagName = "div" } = {}) {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.open = false;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const handler of list) {
      handler(event);
    }
  }

  click() {
    this.dispatchEvent({ type: "click", target: this });
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) || null;
  }

  focus() {}

  setSelectionRange() {}
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement({ tagName });
  }
}

class FakeStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }
}

class ThrowingReadStorage extends FakeStorage {
  getItem() {
    throw new Error("storage read failed");
  }
}

class ThrowingWriteStorage extends FakeStorage {
  constructor(initial = {}, failuresBeforeSuccess = Number.POSITIVE_INFINITY) {
    super(initial);
    this.failuresBeforeSuccess = failuresBeforeSuccess;
  }

  setItem(key, value) {
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw new Error("storage write failed");
    }
    super.setItem(key, value);
  }
}

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const token = { fn, delay };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      const index = timers.indexOf(token);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    }
  };
}

function flushTimers(windowRef) {
  while (windowRef.timers.length > 0) {
    const timer = windowRef.timers.shift();
    timer.fn();
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("send-history utility helpers normalize whitespace, line counts, and invalid timestamps deterministically", () => {
  assert.equal(normalizeSendHistoryText("one\r\ntwo\rthree"), "one\ntwo\nthree");
  assert.equal(summarizeSendHistoryText("  \n \t "), "(whitespace only input)");
  assert.equal(formatHistoryStats({}), "0 lines · 0 chars");
  assert.equal(formatHistoryStats({ text: "one\ntwo" }), "2 lines · 7 chars");
  assert.equal(formatHistoryTimestamp("bad"), "");
  assert.equal(formatHistoryTimestamp(1e20), "");
});

test("send-history runtime controller records, searches, persists, and restores entries", () => {
  const windowRef = createFakeWindow();
  const documentRef = new FakeDocument();
  const localStorageRef = new FakeStorage();
  const dialogEl = new FakeElement({ id: "send-history-dialog", tagName: "dialog" });
  const openBtn = new FakeElement({ id: "send-history-open", tagName: "button" });
  const closeBtn = new FakeElement({ id: "send-history-close", tagName: "button" });
  const switchSessionBtn = new FakeElement({ id: "send-history-switch-session", tagName: "button" });
  const metaEl = new FakeElement({ id: "send-history-meta", tagName: "p" });
  const searchInputEl = new FakeElement({ id: "send-history-search", tagName: "input" });
  const deleteSelectedBtn = new FakeElement({ id: "send-history-delete-selected", tagName: "button" });
  const clearSessionBtn = new FakeElement({ id: "send-history-clear-session", tagName: "button" });
  const emptyEl = new FakeElement({ id: "send-history-empty", tagName: "p" });
  const listEl = new FakeElement({ id: "send-history-list", tagName: "div" });
  const detailMetaEl = new FakeElement({ id: "send-history-detail-meta", tagName: "p" });
  const detailTextEl = new FakeElement({ id: "send-history-detail-text", tagName: "pre" });
  const useBtn = new FakeElement({ id: "send-history-use", tagName: "button" });
  let activeSession = { id: "s1", name: "ops" };
  let commandValue = "";
  let previewCalls = 0;
  let suggestionCalls = 0;

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef,
    localStorageRef,
    dialogEl,
    openBtn,
    closeBtn,
    switchSessionBtn,
    metaEl,
    searchInputEl,
    deleteSelectedBtn,
    clearSessionBtn,
    emptyEl,
    listEl,
    detailMetaEl,
    detailTextEl,
    useBtn,
    getActiveSession: () => activeSession,
    formatSessionToken: (sessionId) => sessionId.toUpperCase(),
    formatSessionDisplayName: (session) => session.name,
    setCommandValue: (value) => {
      commandValue = value;
    },
    focusCommandInput: () => {},
    scheduleCommandPreview: () => {
      previewCalls += 1;
    },
    scheduleCommandSuggestions: () => {
      suggestionCalls += 1;
    },
    requestRender: () => {}
  });

  const longText = "printf 'alpha beta gamma delta epsilon'\ncat /tmp/file\necho done";
  controller.recordSend("s1", longText, { submittedAt: 10 });
  controller.recordSend("s1", "npm test", { submittedAt: 20 });
  flushTimers(windowRef);

  openBtn.click();
  assert.equal(dialogEl.open, true);
  assert.match(metaEl.textContent, /History for \[S1\] ops/);
  assert.equal(listEl.children.length, 2);
  assert.equal(listEl.children[0].children[0].textContent, "npm test");

  searchInputEl.value = "alpha beta";
  searchInputEl.dispatchEvent({ type: "input", target: searchInputEl });
  flushTimers(windowRef);
  assert.equal(listEl.children.length, 1);
  assert.equal(listEl.children[0].children[0].textContent, summarizeSendHistoryText(longText));

  listEl.children[0].click();
  assert.equal(useBtn.disabled, false);
  assert.equal(detailTextEl.textContent, longText);
  useBtn.click();
  assert.equal(commandValue, longText);
  assert.equal(previewCalls, 1);
  assert.equal(suggestionCalls, 1);
  assert.equal(dialogEl.open, false);

  const persisted = JSON.parse(localStorageRef.getItem(SEND_HISTORY_STORAGE_KEY));
  assert.equal(persisted.sessions.s1.length, 2);

  controller.dispose();
});

test("send-history runtime controller hydrates persisted state and prunes bounded history", () => {
  const now = Date.UTC(2026, 3, 4, 10, 0, 0);
  const localStorageRef = new FakeStorage({
    [SEND_HISTORY_STORAGE_KEY]: JSON.stringify({
      sessions: {
        s1: [
          { id: "a", sessionId: "s1", submittedAt: now + 1, text: "one", preview: "one", textLength: 3, lineCount: 1 },
          { id: "b", sessionId: "s1", submittedAt: now + 2, text: "two", preview: "two", textLength: 3, lineCount: 1 },
          { id: "c", sessionId: "s1", submittedAt: now + 3, text: "three", preview: "three", textLength: 5, lineCount: 1 }
        ],
        s2: [
          { id: "d", sessionId: "s2", submittedAt: now + 4, text: "zzzzzz", preview: "zzzzzz", textLength: 6, lineCount: 1 }
        ]
      }
    })
  });

  const controller = createSendHistoryRuntimeController({
    windowRef: createFakeWindow(),
    documentRef: new FakeDocument(),
    localStorageRef,
    maxEntriesPerSession: 2,
    maxTotalChars: 11,
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });

  const s1Entries = controller.listEntriesForSession("s1");
  const s2Entries = controller.listEntriesForSession("s2");
  assert.deepEqual(
    s1Entries.map((entry) => entry.text),
    ["three"]
  );
  assert.deepEqual(
    s2Entries.map((entry) => entry.text),
    ["zzzzzz"]
  );
});

test("send-history runtime controller pins the opened session, guards draft replacement, and supports delete and clear flows", async () => {
  const windowRef = createFakeWindow();
  const documentRef = new FakeDocument();
  const localStorageRef = new FakeStorage();
  const dialogEl = new FakeElement({ id: "send-history-dialog", tagName: "dialog" });
  const openBtn = new FakeElement({ id: "send-history-open", tagName: "button" });
  const closeBtn = new FakeElement({ id: "send-history-close", tagName: "button" });
  const switchSessionBtn = new FakeElement({ id: "send-history-switch-session", tagName: "button" });
  const metaEl = new FakeElement({ id: "send-history-meta", tagName: "p" });
  const searchInputEl = new FakeElement({ id: "send-history-search", tagName: "input" });
  const deleteSelectedBtn = new FakeElement({ id: "send-history-delete-selected", tagName: "button" });
  const clearSessionBtn = new FakeElement({ id: "send-history-clear-session", tagName: "button" });
  const emptyEl = new FakeElement({ id: "send-history-empty", tagName: "p" });
  const listEl = new FakeElement({ id: "send-history-list", tagName: "div" });
  const detailMetaEl = new FakeElement({ id: "send-history-detail-meta", tagName: "p" });
  const detailTextEl = new FakeElement({ id: "send-history-detail-text", tagName: "pre" });
  const useBtn = new FakeElement({ id: "send-history-use", tagName: "button" });
  const sessionsById = {
    s1: { id: "s1", name: "ops" },
    s2: { id: "s2", name: "deploy" }
  };
  let activeSession = sessionsById.s1;
  let commandValue = "existing draft";
  const confirmCalls = [];

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef,
    localStorageRef,
    dialogEl,
    openBtn,
    closeBtn,
    switchSessionBtn,
    metaEl,
    searchInputEl,
    deleteSelectedBtn,
    clearSessionBtn,
    emptyEl,
    listEl,
    detailMetaEl,
    detailTextEl,
    useBtn,
    getActiveSession: () => activeSession,
    getSessionById: (sessionId) => sessionsById[sessionId] || null,
    formatSessionToken: (sessionId) => sessionId.toUpperCase(),
    formatSessionDisplayName: (session) => session?.name || session?.id || "session",
    getCommandValue: () => commandValue,
    setCommandValue: (value) => {
      commandValue = value;
    },
    confirmAction: async (options) => {
      confirmCalls.push(options);
      return options.title !== "Replace Draft";
    },
    focusCommandInput: () => {},
    scheduleCommandPreview: () => {},
    scheduleCommandSuggestions: () => {},
    requestRender: () => {}
  });

  controller.recordSend("s1", "echo one", { submittedAt: 10 });
  controller.recordSend("s2", "echo two", { submittedAt: 20 });
  flushTimers(windowRef);

  openBtn.click();
  assert.equal(dialogEl.open, true);
  assert.match(metaEl.textContent, /History for \[S1\] ops/);
  assert.equal(controller.getState().pinnedSessionId, "s1");

  activeSession = sessionsById.s2;
  searchInputEl.value = "echo";
  searchInputEl.dispatchEvent({ type: "input", target: searchInputEl });
  flushTimers(windowRef);
  controller.render();
  assert.match(metaEl.textContent, /History for \[S1\] ops/);
  assert.equal(searchInputEl.value, "echo");
  assert.equal(switchSessionBtn.disabled, false);

  controller.switchToActiveSession();
  assert.match(metaEl.textContent, /History for \[S2\] deploy/);
  assert.equal(searchInputEl.value, "");

  const replaced = await controller.useSelectedEntry();
  assert.equal(replaced, false);
  assert.equal(commandValue, "existing draft");
  assert.equal(confirmCalls[0].title, "Replace Draft");

  commandValue = "";
  const deleted = await controller.deleteSelectedEntry();
  assert.equal(deleted, true);
  flushTimers(windowRef);
  assert.deepEqual(controller.listEntriesForSession("s2"), []);

  controller.switchToActiveSession();
  activeSession = sessionsById.s1;
  controller.switchToActiveSession();
  const cleared = await controller.clearSessionHistory();
  assert.equal(cleared, true);
  flushTimers(windowRef);
  assert.deepEqual(controller.listEntriesForSession("s1"), []);
  assert.equal(clearSessionBtn.disabled, true);
});

test("send-history runtime controller ignores malformed persisted payloads and flushes pending persistence on dispose", () => {
  const windowRef = createFakeWindow();
  const localStorageRef = new FakeStorage({
    [SEND_HISTORY_STORAGE_KEY]: JSON.stringify({
      sessions: {
        s1: [null, { id: "bad", sessionId: "s1", submittedAt: "x", text: "", preview: "", textLength: 0, lineCount: 0 }],
        broken: "nope"
      }
    })
  });

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef: new FakeDocument(),
    localStorageRef,
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });

  assert.deepEqual(controller.listEntriesForSession("s1"), []);

  controller.recordSend("s1", "echo hi", { submittedAt: 10 });
  controller.dispose();

  const persisted = JSON.parse(localStorageRef.getItem(SEND_HISTORY_STORAGE_KEY));
  assert.equal(persisted.sessions.s1.length, 1);
  assert.equal(persisted.sessions.s1[0].text, "echo hi");
});

test("send-history runtime controller falls back cleanly when storage reads fail during startup", () => {
  const windowRef = createFakeWindow();
  const localStorageRef = new ThrowingReadStorage();

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef: new FakeDocument(),
    localStorageRef,
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });

  assert.deepEqual(controller.listEntriesForSession("s1"), []);
  controller.recordSend("s1", "echo hi", { submittedAt: 10 });
  flushTimers(windowRef);
  assert.deepEqual(
    controller.listEntriesForSession("s1").map((entry) => entry.text),
    ["echo hi"]
  );
});

test("send-history runtime controller tolerates dialogless guards, duplicate bindings, and pending search cleanup", async () => {
  const windowRef = createFakeWindow();
  const documentRef = new FakeDocument();
  const openBtn = new FakeElement({ id: "send-history-open", tagName: "button" });
  const searchInputEl = new FakeElement({ id: "send-history-search", tagName: "input" });
  const emptyEl = new FakeElement({ id: "send-history-empty", tagName: "p" });
  const detailMetaEl = new FakeElement({ id: "send-history-detail-meta", tagName: "p" });
  const detailTextEl = new FakeElement({ id: "send-history-detail-text", tagName: "pre" });
  const useBtn = new FakeElement({ id: "send-history-use", tagName: "button" });
  let activeSession = null;

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef,
    openBtn,
    searchInputEl,
    emptyEl,
    detailMetaEl,
    detailTextEl,
    useBtn,
    getActiveSession: () => activeSession
  });

  assert.equal(emptyEl.textContent, "Select an active session to browse send history.");
  assert.equal(openBtn.disabled, true);
  assert.equal(openBtn.getAttribute("title"), "No active session available for send history");
  assert.equal(controller.open(), false);
  assert.equal(await controller.useSelectedEntry(), false);
  assert.equal(await controller.deleteSelectedEntry(), false);
  assert.equal(await controller.clearSessionHistory(), false);
  assert.equal(controller.recordSend("", "echo hi"), null);
  assert.equal(controller.recordSend("s1", ""), null);

  controller.bindUiEvents();

  searchInputEl.value = "alpha";
  searchInputEl.dispatchEvent({ type: "input", target: searchInputEl });
  searchInputEl.value = "beta";
  searchInputEl.dispatchEvent({ type: "input", target: searchInputEl });
  assert.equal(windowRef.timers.length, 1);

  activeSession = { id: "s1", name: "ops" };
  controller.recordSend("s1", "echo hi", { submittedAt: 10 });
  assert.equal(controller.open(), true);
  controller.close();
  controller.dispose();
  assert.equal(windowRef.timers.length, 0);

  const plainDialogController = createSendHistoryRuntimeController({
    windowRef: createFakeWindow(),
    documentRef,
    dialogEl: { open: false },
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });
  assert.equal(plainDialogController.open(), true);
  assert.equal(plainDialogController.getState().pinnedSessionId, "s1");
  plainDialogController.close();
  assert.equal(plainDialogController.getState().pinnedSessionId, "");
});

test("send-history runtime controller tolerates malformed source payloads, write failures, and event-driven actions", async () => {
  const malformedSourceController = createSendHistoryRuntimeController({
    windowRef: createFakeWindow(),
    documentRef: new FakeDocument(),
    localStorageRef: new FakeStorage({
      [SEND_HISTORY_STORAGE_KEY]: JSON.stringify({ foo: "bar" })
    }),
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });
  assert.deepEqual(malformedSourceController.listEntriesForSession("s1"), []);

  const malformedJsonController = createSendHistoryRuntimeController({
    windowRef: createFakeWindow(),
    documentRef: new FakeDocument(),
    localStorageRef: new FakeStorage({
      [SEND_HISTORY_STORAGE_KEY]: "{"
    }),
    getActiveSession: () => ({ id: "s1", name: "ops" })
  });
  assert.deepEqual(malformedJsonController.listEntriesForSession("s1"), []);

  const windowRef = createFakeWindow();
  const documentRef = new FakeDocument();
  const localStorageRef = new ThrowingWriteStorage({}, Number.POSITIVE_INFINITY);
  const dialogEl = new FakeElement({ id: "send-history-dialog", tagName: "dialog" });
  const openBtn = new FakeElement({ id: "send-history-open", tagName: "button" });
  const closeBtn = new FakeElement({ id: "send-history-close", tagName: "button" });
  const switchSessionBtn = new FakeElement({ id: "send-history-switch-session", tagName: "button" });
  const metaEl = new FakeElement({ id: "send-history-meta", tagName: "p" });
  const searchInputEl = new FakeElement({ id: "send-history-search", tagName: "input" });
  const deleteSelectedBtn = new FakeElement({ id: "send-history-delete-selected", tagName: "button" });
  const clearSessionBtn = new FakeElement({ id: "send-history-clear-session", tagName: "button" });
  const emptyEl = new FakeElement({ id: "send-history-empty", tagName: "p" });
  const listEl = new FakeElement({ id: "send-history-list", tagName: "div" });
  const detailMetaEl = new FakeElement({ id: "send-history-detail-meta", tagName: "p" });
  const detailTextEl = new FakeElement({ id: "send-history-detail-text", tagName: "pre" });
  const useBtn = new FakeElement({ id: "send-history-use", tagName: "button" });
  const sessionsById = {
    s1: { id: "s1", name: "ops" },
    s2: { id: "s2", name: "deploy" }
  };
  let activeSession = sessionsById.s1;
  const confirmResults = new Map([
    ["Delete Send History Entry", false],
    ["Clear Session History", false]
  ]);

  const controller = createSendHistoryRuntimeController({
    windowRef,
    documentRef,
    localStorageRef,
    dialogEl,
    openBtn,
    closeBtn,
    switchSessionBtn,
    metaEl,
    searchInputEl,
    deleteSelectedBtn,
    clearSessionBtn,
    emptyEl,
    listEl,
    detailMetaEl,
    detailTextEl,
    useBtn,
    maxTotalChars: 15,
    getActiveSession: () => activeSession,
    getSessionById: (sessionId) => sessionsById[sessionId] || null,
    formatSessionToken: (sessionId) => sessionId.toUpperCase(),
    formatSessionDisplayName: (session) => session?.name || session?.id || "session",
    confirmAction: async (options) => confirmResults.get(options.title) ?? true
  });

  controller.recordSend("s1", "12345", { submittedAt: 10 });
  controller.recordSend("s1", "67890", { submittedAt: 20 });
  openBtn.click();
  assert.equal(dialogEl.open, true);
  controller.recordSend("s1", "abcde", { submittedAt: 30 });
  assert.equal(listEl.children.length, 3);

  activeSession = sessionsById.s2;
  controller.recordSend("s2", "other", { submittedAt: 40 });
  switchSessionBtn.click();
  assert.match(metaEl.textContent, /History for \[S2\] deploy/);

  let prevented = false;
  dialogEl.dispatchEvent({
    type: "cancel",
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(prevented, true);
  assert.equal(dialogEl.open, false);

  activeSession = sessionsById.s1;
  openBtn.click();
  listEl.children[0].click();
  deleteSelectedBtn.click();
  await flushMicrotasks();
  assert.equal(controller.listEntriesForSession("s1").length, 2);

  clearSessionBtn.click();
  await flushMicrotasks();
  assert.equal(controller.listEntriesForSession("s1").length, 2);

  closeBtn.click();
  assert.equal(dialogEl.open, false);

  flushTimers(windowRef);
  assert.deepEqual(
    controller.listEntriesForSession("s1").map((entry) => entry.text),
    ["abcde"]
  );

  controller.recordSend("s1", "vwxyz", { submittedAt: 50 });
  controller.dispose();
  assert.deepEqual(
    controller.listEntriesForSession("s1").map((entry) => entry.text),
    ["vwxyz"]
  );
});
