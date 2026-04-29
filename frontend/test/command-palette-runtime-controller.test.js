import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommandPaletteEntries,
  createCommandPaletteRuntimeController,
  filterCommandPaletteEntries
} from "../src/public/command-palette-runtime-controller.js";

class ClassList {
  constructor(initial = "") {
    this.tokens = new Set(String(initial || "").split(/\s+/).filter(Boolean));
  }

  add(token) {
    this.tokens.add(token);
  }

  remove(token) {
    this.tokens.delete(token);
  }

  toggle(token, force) {
    const next = typeof force === "boolean" ? force : !this.tokens.has(token);
    if (next) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    return next;
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

function createElement(tagName = "div") {
  const listeners = new Map();
  return {
    tagName: String(tagName).toUpperCase(),
    className: "",
    classList: new ClassList(),
    children: [],
    textContent: "",
    value: "",
    hidden: false,
    open: false,
    selectionStart: 0,
    selectionEnd: 0,
    listeners,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      return child;
    },
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      if (!event || !event.type) {
        return;
      }
      const list = listeners.get(String(event.type)) || [];
      for (const handler of list) {
        handler(event);
      }
    },
    click() {
      this.dispatchEvent({ type: "click" });
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    setAttribute() {}
  };
}

function createWindowStub() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      if (!event || !event.type) {
        return;
      }
      const list = listeners.get(String(event.type)) || [];
      for (const handler of list) {
        handler(event);
      }
    }
  };
}

function createDocumentStub() {
  return {
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

test("buildCommandPaletteEntries keeps deterministic command-session-deck ordering", () => {
  const entries = buildCommandPaletteEntries({
    systemSlashCommands: ["new", "switch", "help"],
    customCommands: [{ name: "deploy", content: "./deploy.sh" }],
    sessions: [
      { id: "s-2", name: "beta", deckId: "ops", tags: ["api"] },
      { id: "s-1", name: "alpha", deckId: "default" }
    ],
    decks: [
      { id: "ops", name: "Ops" },
      { id: "default", name: "Default" }
    ],
    activeSessionId: "s-1",
    activeDeckId: "default",
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "1" : "2"),
    formatSessionDisplayName: (session) => session.name
  });

  assert.deepEqual(
    entries.map((entry) => [entry.group, entry.title]),
    [
      ["commands", "/new"],
      ["commands", "/switch"],
      ["commands", "/help"],
      ["commands", "/session.new"],
      ["commands", "/session.switch"],
      ["commands", "/deploy"],
      ["sessions", "[1] alpha"],
      ["sessions", "[2] beta"],
      ["decks", "[default] Default"],
      ["decks", "[ops] Ops"]
    ]
  );

  const filtered = filterCommandPaletteEntries(entries, "beta api");
  assert.deepEqual(filtered.map((entry) => entry.title), ["[2] beta"]);
});

test("command palette filtering keeps group order, supports fuzzy matches, and personalizes equal matches", () => {
  const entries = buildCommandPaletteEntries({
    systemSlashCommands: ["restart", "rename", "switch"],
    customCommands: [{ name: "deploy", content: "./deploy.sh" }, { name: "destroy", content: "./destroy.sh" }],
    sessions: [
      { id: "s-1", name: "alpha", deckId: "default" },
      { id: "s-2", name: "beta", deckId: "default", tags: ["api"] }
    ],
    decks: [{ id: "default", name: "Default" }]
  });

  const fuzzyFiltered = filterCommandPaletteEntries(entries, "rstrt");
  assert.equal(fuzzyFiltered[0]?.title, "/restart");

  const personalized = filterCommandPaletteEntries(entries, "d", {
    getUsageScore: (key) => (key === "palette-custom:destroy" ? 5 : 0)
  });
  assert.deepEqual(
    personalized.filter((entry) => entry.group === "commands").slice(0, 2).map((entry) => entry.title),
    ["/destroy", "/deploy"]
  );
});

test("buildCommandPaletteEntries aggregates scoped custom commands into one entry with scope summary", () => {
  const entries = buildCommandPaletteEntries({
    systemSlashCommands: [],
    customCommands: [
      { name: "deploy", content: "echo global", scope: "global" },
      { name: "deploy", content: "echo project", scope: "project" },
      { name: "deploy", content: "echo beta", scope: "session", sessionId: "s-2" }
    ],
    sessions: [{ id: "s-2", name: "beta", deckId: "ops" }],
    decks: [],
    formatSessionToken: () => "2",
    formatSessionDisplayName: (session) => session.name
  });

  const customEntry = entries.find((entry) => entry.title === "/deploy");
  assert.ok(customEntry);
  assert.match(customEntry.subtitle, /Saved custom command · session \[2\] beta · project · global/);
});

test("command palette entry builders normalize fallback labels and ignore malformed inputs deterministically", () => {
  const entries = buildCommandPaletteEntries({
    systemSlashCommands: [],
    customCommands: [null, { name: " ", content: "ignored" }, { name: "saved", content: "echo ok" }],
    sessions: [
      { id: "session-1", name: "", deckId: "ops", tags: ["", " qa "] },
      { name: "broken" }
    ],
    decks: [
      { id: "ops", name: "" },
      { name: "invalid" }
    ],
    activeDeckId: "ops",
    formatSessionToken: () => "",
    formatSessionDisplayName: () => ""
  });

  const sessionEntry = entries.find((entry) => entry.group === "sessions");
  const deckEntry = entries.find((entry) => entry.group === "decks");
  const customEntry = entries.find((entry) => entry.group === "commands" && entry.kind === "custom-command");
  assert.equal(sessionEntry.title, "[session-] session-");
  assert.equal(sessionEntry.subtitle, "Active deck (ops)");
  assert.equal(sessionEntry.detail, "Tags: qa");
  assert.equal(deckEntry.title, "[ops] ops");
  assert.equal(customEntry?.title, "/saved");
  assert.deepEqual(filterCommandPaletteEntries(null, "ops"), []);
});

test("command palette opens from the global shortcut and fills the composer for command picks", () => {
  const win = createWindowStub();
  const dialogEl = createElement("dialog");
  const searchInputEl = createElement("input");
  const resultsEl = createElement("div");
  const emptyEl = createElement("p");
  const metaEl = createElement("p");
  const closeBtn = createElement("button");
  const commandInput = createElement("textarea");
  let composerValue = "";

  const controller = createCommandPaletteRuntimeController({
    windowRef: win,
    documentRef: createDocumentStub(),
    dialogEl,
    searchInputEl,
    resultsEl,
    emptyEl,
    metaEl,
    closeBtn,
    commandInput,
    systemSlashCommands: ["new", "note", "help"],
    getState: () => ({ sessions: [], decks: [], activeSessionId: "", activeDeckId: "" }),
    setComposerValue: (value) => {
      composerValue = value;
      commandInput.value = value;
    }
  });

  const shortcutEvent = {
    type: "keydown",
    key: "k",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  win.dispatchEvent(shortcutEvent);

  assert.equal(controller.isOpen(), true);
  assert.equal(searchInputEl.focused, true);
  assert.equal(controller.getSelectedEntry()?.title, "/new");

  searchInputEl.value = "note";
  searchInputEl.dispatchEvent({ type: "input" });
  searchInputEl.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {
      this.defaultPrevented = true;
    }
  });

  assert.equal(composerValue, "/note [text...]");
  assert.equal(commandInput.value, "/note [text...]");
  assert.equal(controller.isOpen(), false);
});

test("command palette controller degrades safely without dialog primitives or DOM event constructors", () => {
  const win = createWindowStub();
  const dialogEl = createElement("div");
  dialogEl.showModal = undefined;
  dialogEl.close = undefined;
  const searchInputEl = createElement("input");
  const resultsEl = createElement("div");
  resultsEl.replaceChildren = undefined;
  const emptyEl = createElement("p");
  const metaEl = createElement("p");
  const closeBtn = createElement("button");
  const commandInput = createElement("textarea");
  const dispatchedEvents = [];
  commandInput.dispatchEvent = (event) => {
    dispatchedEvents.push(event);
  };

  const originalEvent = globalThis.Event;
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    writable: true,
    value: undefined
  });

  try {
    const controller = createCommandPaletteRuntimeController({
      windowRef: win,
      documentRef: createDocumentStub(),
      dialogEl,
      searchInputEl,
      resultsEl,
      emptyEl,
      metaEl,
      closeBtn,
      commandInput,
      systemSlashCommands: ["help"],
      getState: () => ({ sessions: [], decks: [], activeSessionId: "", activeDeckId: "" })
    });

    controller.openPalette("help");
    assert.equal(dialogEl.open, true);
    assert.equal(dialogEl.classList.contains("open"), true);

    searchInputEl.dispatchEvent({
      type: "keydown",
      key: "Enter",
      preventDefault() {}
    });
    assert.equal(commandInput.value, "/help");
    assert.equal(dispatchedEvents.length, 1);
    assert.equal(dispatchedEvents[0].type, "input");
    assert.equal(commandInput.selectionStart, commandInput.value.length);
    assert.equal(commandInput.selectionEnd, commandInput.value.length);

    controller.openPalette("help");
    dialogEl.dispatchEvent({
      type: "cancel",
      preventDefault() {
        this.defaultPrevented = true;
      }
    });
    assert.equal(dialogEl.open, false);
    assert.equal(dialogEl.classList.contains("open"), false);

    const searchKeydown = searchInputEl.listeners.get("keydown")[0];
    const windowKeydown = win.addEventListener ? undefined : undefined;
    assert.doesNotThrow(() => searchKeydown(null));
    assert.doesNotThrow(() => win.dispatchEvent({ type: "keydown", key: "k", ctrlKey: true, metaKey: false, altKey: false, preventDefault() {} }));
    assert.equal(controller.isOpen(), true);
    assert.doesNotThrow(() => win.dispatchEvent({ type: "keydown", key: "Escape", ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }));
    assert.equal(controller.isOpen(), false);
  } finally {
    Object.defineProperty(globalThis, "Event", {
      configurable: true,
      writable: true,
      value: originalEvent
    });
  }
});

test("command palette can switch sessions and decks directly", () => {
  const win = createWindowStub();
  const dialogEl = createElement("dialog");
  const searchInputEl = createElement("input");
  const resultsEl = createElement("div");
  const emptyEl = createElement("p");
  const metaEl = createElement("p");
  const closeBtn = createElement("button");
  const feedback = [];
  const activations = [];

  const controller = createCommandPaletteRuntimeController({
    windowRef: win,
    documentRef: createDocumentStub(),
    dialogEl,
    searchInputEl,
    resultsEl,
    emptyEl,
    metaEl,
    closeBtn,
    systemSlashCommands: ["help"],
    getState: () => ({
      activeSessionId: "s-1",
      activeDeckId: "default",
      sessions: [
        { id: "s-1", name: "alpha", deckId: "default" },
        { id: "s-2", name: "beta", deckId: "ops", tags: ["api"] }
      ],
      decks: [
        { id: "default", name: "Default" },
        { id: "ops", name: "Ops" }
      ]
    }),
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "1" : "2"),
    formatSessionDisplayName: (session) => session.name,
    activateSessionTarget: (session) => {
      activations.push(["session", session.id]);
      return { ok: true, message: `Active session: ${session.id}` };
    },
    activateDeckTarget: (deck) => {
      activations.push(["deck", deck.id]);
      return { ok: true, message: `Active deck: ${deck.id}` };
    },
    setCommandFeedback: (message) => feedback.push(message)
  });

  controller.openPalette();
  searchInputEl.value = "beta";
  searchInputEl.dispatchEvent({ type: "input" });
  searchInputEl.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {}
  });

  assert.deepEqual(activations, [["session", "s-2"]]);
  assert.deepEqual(feedback, ["Active session: s-2"]);
  assert.equal(controller.isOpen(), false);

  controller.openPalette();
  searchInputEl.value = "[ops]";
  searchInputEl.dispatchEvent({ type: "input" });
  searchInputEl.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {}
  });

  assert.deepEqual(activations, [
    ["session", "s-2"],
    ["deck", "ops"]
  ]);
  assert.deepEqual(feedback, ["Active session: s-2", "Active deck: ops"]);
});

test("command palette records usage for explicit selections", () => {
  const win = createWindowStub();
  const dialogEl = createElement("dialog");
  const searchInputEl = createElement("input");
  const resultsEl = createElement("div");
  const emptyEl = createElement("p");
  const metaEl = createElement("p");
  const closeBtn = createElement("button");
  const commandInput = createElement("textarea");
  const usage = [];

  const controller = createCommandPaletteRuntimeController({
    windowRef: win,
    documentRef: createDocumentStub(),
    dialogEl,
    searchInputEl,
    resultsEl,
    emptyEl,
    metaEl,
    closeBtn,
    commandInput,
    systemSlashCommands: ["help"],
    getState: () => ({ sessions: [], decks: [], activeSessionId: "", activeDeckId: "" }),
    recordUsage: (key) => usage.push(key)
  });

  controller.openPalette("help");
  searchInputEl.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {
      this.defaultPrevented = true;
    }
  });

  assert.deepEqual(usage, ["slash:help"]);
});

test("command palette controller handles empty matches, result clicks, shortcut toggles, and DOM-light fallbacks", () => {
  const win = createWindowStub();
  const dialogEl = createElement("dialog");
  const searchInputEl = createElement("input");
  const resultsEl = createElement("div");
  const emptyEl = createElement("p");
  const metaEl = createElement("p");
  const commandInput = createElement("textarea");

  const controller = createCommandPaletteRuntimeController({
    windowRef: win,
    documentRef: createDocumentStub(),
    dialogEl,
    searchInputEl,
    resultsEl,
    emptyEl,
    metaEl,
    closeBtn: createElement("button"),
    commandInput,
    systemSlashCommands: ["help", "rename"],
    getState: () => ({ sessions: [], decks: [], activeSessionId: "", activeDeckId: "" })
  });

  controller.openPalette("zzz");
  assert.equal(controller.getSelectedEntry(), null);
  assert.equal(emptyEl.hidden, false);
  assert.equal(metaEl.textContent, "No matches · Esc closes");

  searchInputEl.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {}
  });
  assert.equal(commandInput.value, "");
  assert.equal(controller.isOpen(), true);

  win.dispatchEvent(null);

  controller.openPalette("help");
  const resultButton = resultsEl.children.find((child) => child.tagName === "BUTTON");
  assert.ok(resultButton);
  resultButton.click();
  assert.equal(commandInput.value, "/help");
  assert.equal(controller.isOpen(), false);

  win.dispatchEvent({
    type: "keydown",
    key: "k",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault() {}
  });
  assert.equal(controller.isOpen(), true);
  win.dispatchEvent({
    type: "keydown",
    key: "k",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault() {}
  });
  assert.equal(controller.isOpen(), false);

  const domLightController = createCommandPaletteRuntimeController({
    windowRef: { addEventListener() {} },
    documentRef: null,
    dialogEl: null,
    searchInputEl: createElement("input"),
    resultsEl: null,
    emptyEl: null,
    metaEl: null,
    closeBtn: null,
    commandInput: null,
    systemSlashCommands: ["help"],
    getState: () => ({ sessions: [], decks: [], activeSessionId: "", activeDeckId: "" })
  });

  assert.doesNotThrow(() => domLightController.openPalette("help"));
  assert.doesNotThrow(() => domLightController.closePalette());
  assert.doesNotThrow(() => domLightController.refresh());
});
