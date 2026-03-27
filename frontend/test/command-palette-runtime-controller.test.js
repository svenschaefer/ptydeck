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
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
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

  assert.equal(composerValue, "/note <selector|active> [text...]");
  assert.equal(commandInput.value, "/note <selector|active> [text...]");
  assert.equal(controller.isOpen(), false);
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
