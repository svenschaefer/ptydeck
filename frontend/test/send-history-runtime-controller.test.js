import test from "node:test";
import assert from "node:assert/strict";

import {
  createSendHistoryRuntimeController,
  SEND_HISTORY_STORAGE_KEY,
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

test("send-history runtime controller records, searches, persists, and restores entries", () => {
  const windowRef = createFakeWindow();
  const documentRef = new FakeDocument();
  const localStorageRef = new FakeStorage();
  const dialogEl = new FakeElement({ id: "send-history-dialog", tagName: "dialog" });
  const openBtn = new FakeElement({ id: "send-history-open", tagName: "button" });
  const closeBtn = new FakeElement({ id: "send-history-close", tagName: "button" });
  const metaEl = new FakeElement({ id: "send-history-meta", tagName: "p" });
  const searchInputEl = new FakeElement({ id: "send-history-search", tagName: "input" });
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
    metaEl,
    searchInputEl,
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
