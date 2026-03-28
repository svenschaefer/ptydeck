import test from "node:test";
import assert from "node:assert/strict";

import { createDeckSidebarController } from "../src/public/ui/deck-sidebar-controller.js";

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) {
    this.values.add(String(value));
  }
  remove(value) {
    this.values.delete(String(value));
  }
  contains(value) {
    return this.values.has(String(value));
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.className = "";
    this.classList = new ClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
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

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  click() {
    const list = this.listeners.get("click") || [];
    for (const handler of list) {
      handler();
    }
  }
}

function findFirst(root, predicate) {
  if (!root) {
    return null;
  }
  if (predicate(root)) {
    return root;
  }
  for (const child of root.children || []) {
    const match = findFirst(child, predicate);
    if (match) {
      return match;
    }
  }
  return null;
}

test("deck-sidebar controller renders deck/session buttons and dispatches activation callbacks", () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };

  const activations = [];
  const sessionActivations = [];
  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => (sessionId === "s-1" ? "1" : "2"),
    formatSessionDisplayName: (session) => session.name,
    getSessionActivityIndicatorState: (session) => (session.id === "s-2" ? "live" : ""),
    onActivateDeck: (deckId) => activations.push(deckId),
    onActivateSession: (session) => sessionActivations.push(session.id)
  });

  controller.render({
    decks: [
      { id: "default", name: "Default" },
      { id: "deck-b", name: "Deck B" }
    ],
    sessions: [
      { id: "s-1", name: "One", deckId: "default" },
      { id: "s-2", name: "Two", deckId: "deck-b" }
    ],
    activeDeckId: "deck-b",
    activeSessionId: "s-2"
  });

  const activeDeckTab = findFirst(container, (el) => el.className === "deck-tab" && el.classList.contains("active"));
  assert.ok(activeDeckTab);
  assert.equal(activeDeckTab.getAttribute("data-deck-id"), "deck-b");

  const activeSessionBtn = findFirst(
    container,
    (el) => el.className === "deck-session-btn" && el.getAttribute("data-session-id") === "s-2"
  );
  assert.ok(activeSessionBtn);
  assert.equal(activeSessionBtn.classList.contains("active"), true);

  const liveIndicator = findFirst(container, (el) => el.className === "deck-session-activity-indicator" && !el.hidden);
  assert.ok(liveIndicator);
  assert.equal(liveIndicator.classList.contains("live"), true);

  activeDeckTab.click();
  activeSessionBtn.click();
  assert.deepEqual(activations, ["deck-b"]);
  assert.deepEqual(sessionActivations, ["s-2"]);
});

test("deck-sidebar controller renders sessions in quick-id order", () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };

  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => (sessionId === "s-1" ? "2" : "1"),
    sortSessionsByQuickId: (sessions) =>
      sessions.slice().sort((left, right) => {
        const leftToken = left.id === "s-1" ? "2" : "1";
        const rightToken = right.id === "s-1" ? "2" : "1";
        return leftToken.localeCompare(rightToken, "en-US");
      }),
    formatSessionDisplayName: (session) => session.name
  });

  controller.render({
    decks: [{ id: "default", name: "Default" }],
    sessions: [
      { id: "s-1", name: "One", deckId: "default" },
      { id: "s-2", name: "Two", deckId: "default" }
    ],
    activeDeckId: "default",
    activeSessionId: "s-1"
  });

  const group = findFirst(container, (el) => el.getAttribute?.("data-deck-id") === "default");
  const sessionList = findFirst(group, (el) => el.className === "deck-session-list");
  assert.ok(sessionList);
  assert.deepEqual(
    sessionList.children.map((entry) => entry.getAttribute("data-session-id")),
    ["s-2", "s-1"]
  );
});

test("deck-sidebar controller applies deck session group resolution before rendering session buttons", () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };

  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => String(sessionId || ""),
    formatSessionDisplayName: (session) => session.name,
    resolveDeckSessions: (_deckId, sessions) => sessions.filter((session) => session.id !== "s-1")
  });

  controller.render({
    decks: [{ id: "default", name: "Default" }],
    sessions: [
      { id: "s-1", name: "One", deckId: "default" },
      { id: "s-2", name: "Two", deckId: "default" }
    ],
    activeDeckId: "default",
    activeSessionId: "s-2"
  });

  const group = findFirst(container, (el) => el.getAttribute?.("data-deck-id") === "default");
  const sessionList = findFirst(group, (el) => el.className === "deck-session-list");
  assert.ok(sessionList);
  assert.deepEqual(
    sessionList.children.map((entry) => entry.getAttribute("data-session-id")),
    ["s-2"]
  );
});

test("deck-sidebar controller exposes active-deck settings and routes rename/delete through the settings panel", async () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };
  const calls = [];

  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => String(sessionId || ""),
    formatSessionDisplayName: (session) => session.name,
    onRenameDeck: async (deck) => {
      calls.push(["rename", deck.id]);
    },
    onDeleteDeck: async (deck) => {
      calls.push(["delete", deck.id]);
    },
    canDeleteDeck: (deck) => deck.id !== "default"
  });

  controller.render({
    decks: [
      { id: "default", name: "Default" },
      { id: "ops", name: "Ops" }
    ],
    sessions: [],
    activeDeckId: "ops",
    activeSessionId: ""
  });

  const settingsButton = findFirst(container, (el) => el.className === "deck-tab-settings");
  assert.ok(settingsButton);
  settingsButton.click();

  const settingsPanel = findFirst(container, (el) => el.className === "deck-settings-panel");
  assert.ok(settingsPanel);
  const renameButton = findFirst(settingsPanel, (el) => el.tagName === "button" && el.textContent === "Rename Deck");
  const deleteButton = findFirst(settingsPanel, (el) => el.tagName === "button" && el.textContent === "Delete Deck");
  assert.ok(renameButton);
  assert.ok(deleteButton);
  assert.equal(deleteButton.disabled, false);

  renameButton.click();
  deleteButton.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["rename", "ops"],
    ["delete", "ops"]
  ]);
});

test("deck-sidebar controller disables delete in active deck settings for the default deck", () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };

  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => String(sessionId || ""),
    formatSessionDisplayName: (session) => session.name,
    canDeleteDeck: (deck) => deck.id !== "default"
  });

  controller.render({
    decks: [{ id: "default", name: "Default" }],
    sessions: [],
    activeDeckId: "default",
    activeSessionId: ""
  });

  const settingsButton = findFirst(container, (el) => el.className === "deck-tab-settings");
  assert.ok(settingsButton);
  settingsButton.click();

  const deleteButton = findFirst(container, (el) => el.tagName === "button" && el.textContent === "Delete Deck");
  assert.ok(deleteButton);
  assert.equal(deleteButton.disabled, true);
});

test("deck-sidebar controller exposes visible deck session order and swaps adjacent sessions from settings", async () => {
  const container = new FakeElement("div");
  const documentRef = {
    createElement(tag) {
      return new FakeElement(tag);
    }
  };
  const swapCalls = [];

  const controller = createDeckSidebarController({
    containerEl: container,
    documentRef,
    resolveSessionDeckId: (session) => session.deckId,
    ensureQuickId: (sessionId) => (sessionId === "s-1" ? "1" : sessionId === "s-2" ? "2" : "3"),
    formatSessionDisplayName: (session) => session.name,
    onSwapDeckSessions: async (leftSession, rightSession) => {
      swapCalls.push([leftSession.id, rightSession.id]);
    }
  });

  controller.render({
    decks: [{ id: "ops", name: "Ops" }],
    sessions: [
      { id: "s-1", name: "One", deckId: "ops" },
      { id: "s-2", name: "Two", deckId: "ops" },
      { id: "s-3", name: "Three", deckId: "ops" }
    ],
    activeDeckId: "ops",
    activeSessionId: "s-2"
  });

  const settingsButton = findFirst(container, (el) => el.className === "deck-tab-settings");
  assert.ok(settingsButton);
  settingsButton.click();

  const orderRows = [];
  (function collect(root) {
    if (!root) {
      return;
    }
    if (root.className === "deck-settings-order-row") {
      orderRows.push(root);
    }
    for (const child of root.children || []) {
      collect(child);
    }
  })(container);

  assert.equal(orderRows.length, 3);
  assert.equal(orderRows[0].getAttribute("data-session-id"), "s-1");
  assert.equal(orderRows[1].getAttribute("data-session-id"), "s-2");
  assert.equal(orderRows[2].getAttribute("data-session-id"), "s-3");

  const upButton = findFirst(orderRows[1], (el) => el.tagName === "button" && el.textContent === "↑");
  const downButton = findFirst(orderRows[1], (el) => el.tagName === "button" && el.textContent === "↓");
  const firstUpButton = findFirst(orderRows[0], (el) => el.tagName === "button" && el.textContent === "↑");
  const lastDownButton = findFirst(orderRows[2], (el) => el.tagName === "button" && el.textContent === "↓");

  assert.ok(upButton);
  assert.ok(downButton);
  assert.ok(firstUpButton);
  assert.ok(lastDownButton);
  assert.equal(firstUpButton.disabled, true);
  assert.equal(lastDownButton.disabled, true);

  upButton.click();
  downButton.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(swapCalls, [
    ["s-2", "s-1"],
    ["s-2", "s-3"]
  ]);
});
