import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutorOperatorHandlers } from "../src/public/command-executor-operator-handlers.js";

function createHarness(overrides = {}) {
  const calls = [];
  const state = overrides.state || {
    sessions: [
      { id: "s-default", name: "Default shell", deckId: "default" },
      { id: "s-ops", name: "Ops shell", deckId: "ops" }
    ],
    decks: [
      { id: "default", name: "Default" },
      { id: "ops", name: "Ops" }
    ],
    activeSessionId: "s-default"
  };
  let activeDeckId = overrides.activeDeckId || "default";

  const store = {
    getState() {
      return state;
    },
    setActiveSession(sessionId) {
      calls.push(["set-active-session", sessionId]);
      state.activeSessionId = sessionId;
    }
  };

  const api = {
    async createDeck(payload) {
      calls.push(["create-deck", payload]);
      const deck = { id: "deck-new", name: payload.name };
      state.decks.push(deck);
      return deck;
    },
    async updateDeck(deckId, payload) {
      calls.push(["update-deck", deckId, payload]);
      const deck = state.decks.find((entry) => entry.id === deckId);
      assert.ok(deck);
      deck.name = payload.name;
      return { ...deck };
    },
    async deleteDeck(deckId, options) {
      calls.push(["delete-deck", deckId, options]);
      const deck = state.decks.find((entry) => entry.id === deckId);
      if (deckId === "ops" && options.force !== true && overrides.deleteConflict !== false) {
        const error = new Error("conflict");
        error.status = 409;
        throw error;
      }
      state.decks = state.decks.filter((entry) => entry.id !== deckId);
    },
    async moveSessionToDeck(deckId, sessionId) {
      calls.push(["move-session", deckId, sessionId]);
      const session = state.sessions.find((entry) => entry.id === sessionId);
      assert.ok(session);
      session.deckId = deckId;
      return { ...session };
    },
    async createSession(payload) {
      calls.push(["create-session", payload]);
      const session = { id: "s-new", name: payload.shell || "New shell", deckId: activeDeckId };
      state.sessions.push(session);
      return session;
    },
    ...(overrides.api || {})
  };

  const handlers = createCommandExecutorOperatorHandlers({
    store,
    api,
    defaultDeckId: "default",
    systemSlashCommands: ["deck", "filter", "help", "list", "move", "new", "run", "size"],
    formatUsage: (commandName, subcommandName = "") => `usage:${commandName}${subcommandName ? `:${subcommandName}` : ""}`,
    resolveTargetSelectors: overrides.resolveTargetSelectors || ((selector, sessions) => ({
      sessions: sessions.filter((session) => session.id === selector),
      error: sessions.some((session) => session.id === selector) ? "" : `Unknown session: ${selector}`
    })),
    resolveDeckToken:
      overrides.resolveDeckToken ||
      ((selector, decks) => {
        const normalized = String(selector || "").trim().toLowerCase();
        const deck = decks.find(
          (entry) => entry.id.toLowerCase() === normalized || entry.name.toLowerCase() === normalized
        );
        return deck ? { deck, error: "" } : { deck: null, error: `Unknown deck: ${selector}` };
      }),
    parseSizeCommandArgs:
      overrides.parseSizeCommandArgs ||
      ((args, defaultCols, defaultRows) => {
        if (args[0] === "bad") {
          return { ok: false, error: "bad size" };
        }
        return {
          ok: true,
          cols: Number.parseInt(args[0], 10) || defaultCols,
          rows: Number.parseInt(args[1], 10) || defaultRows
        };
      }),
    applyTerminalSizeSettings: overrides.applyTerminalSizeSettings || (async (cols, rows) => calls.push(["size", cols, rows])),
    setSessionFilterText: overrides.setSessionFilterText || ((value) => calls.push(["filter", value])),
    resolveFilterSelectors:
      overrides.resolveFilterSelectors ||
      ((selectorText, sessions, context) => {
        calls.push(["resolve-filter", selectorText, context]);
        if (selectorText === "ops::s-ops") {
          return {
            sessions: sessions.filter((session) => session.id === "s-ops"),
            error: ""
          };
        }
        const matches = sessions.filter(
          (session) => session.id === selectorText || session.name.toLowerCase().includes(selectorText.toLowerCase())
        );
        return { sessions: matches, error: matches.length > 0 ? "" : `Unknown filter selector: ${selectorText}` };
      }),
    getActiveDeck: overrides.getActiveDeck || (() => state.decks.find((deck) => deck.id === activeDeckId) || null),
    getSessionCountForDeck:
      overrides.getSessionCountForDeck ||
      ((deckId, sessions) => sessions.filter((session) => session.deckId === deckId).length),
    applyRuntimeEvent:
      overrides.applyRuntimeEvent ||
      ((event, runtimeOptions) => {
        calls.push(["event", event, runtimeOptions]);
      }),
    setActiveDeck:
      overrides.setActiveDeck ||
      ((deckId) => {
        calls.push(["set-active-deck", deckId]);
        activeDeckId = deckId;
        return true;
      }),
    resolveSessionDeckId: overrides.resolveSessionDeckId || ((session) => session.deckId || "default"),
    formatSessionToken: overrides.formatSessionToken || ((sessionId) => sessionId.replace("s-", "").toUpperCase()),
    formatSessionDisplayName: overrides.formatSessionDisplayName || ((session) => session.name),
    getSessionRuntimeState:
      overrides.getSessionRuntimeState || ((session) => (session.id === "s-ops" ? "offline" : "active")),
    getTerminalSettings: overrides.getTerminalSettings || (() => ({ cols: 80, rows: 24 }))
  });

  return {
    calls,
    handlers,
    state
  };
}

test("operator handlers expose the extracted help and usage discovery seam", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "missing",
      args: [],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    null
  );

  const helpText = await harness.handlers.executeStructuredCommand({
    command: "help",
    args: [],
    sessions: harness.state.sessions,
    decks: harness.state.decks,
    activeSessionId: harness.state.activeSessionId,
    state: harness.state
  });
  assert.equal(helpText, "Commands: @ > / deck filter help list move new run size");

  const topicHelp = await harness.handlers.executeStructuredCommand({
    command: "help",
    args: ["deck"],
    sessions: harness.state.sessions,
    decks: harness.state.decks,
    activeSessionId: harness.state.activeSessionId,
    state: harness.state
  });
  assert.match(topicHelp, /^\/deck$/m);
  assert.match(topicHelp, /Subcommands: list new rename switch delete/);

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["wat"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "usage:deck"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "move",
      args: ["s-default"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "usage:move"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "run",
      args: [],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "usage:run"
  );
});

test("operator handlers route deck, move, size, filter, list, and new through the extracted seam", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: [],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "* [default] Default (1 sessions)\n  [ops] Ops (1 sessions)"
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["new", "Night", "Shift"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Created deck [deck-new] Night Shift."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "move",
      args: ["s-default", "ops"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Moved session [DEFAULT] to deck [ops] Ops."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "size",
      args: ["101", "33"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Terminal size set to 101x33 (cols x rows) for deck 'Default'."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "filter",
      args: ["ops::s-ops"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: "s-default",
      state: harness.state
    }),
    "Display filter active (1/2): ops::s-ops"
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "list",
      args: [],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "  [DEFAULT] Default shell (s-defaul)\n* [OPS] Ops shell (s-ops) [offline]"
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "new",
      args: ["zsh"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Created session [NEW] zsh."
  );

  assert.deepEqual(harness.calls, [
    ["create-deck", { name: "Night Shift", settings: { terminal: { cols: 80, rows: 24 } } }],
    ["event", { type: "deck.created", deck: { id: "deck-new", name: "Night Shift" } }, { preferredActiveDeckId: "deck-new" }],
    ["move-session", "ops", "s-default"],
    ["event", { type: "session.updated", session: { id: "s-default", name: "Default shell", deckId: "ops" } }, undefined],
    ["size", 101, 33],
    ["resolve-filter", "ops::s-ops", { scopeMode: "active-deck", activeDeckId: "default" }],
    ["filter", "ops::s-ops"],
    ["set-active-deck", "ops"],
    ["set-active-session", "s-ops"],
    ["create-session", { shell: "zsh" }],
    ["event", { type: "session.created", session: { id: "s-new", name: "zsh", deckId: "ops" } }, undefined],
    ["set-active-session", "s-new"]
  ]);
});

test("operator handlers honor extracted deck rename and delete edge cases", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["rename", "ops", "Operations"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Renamed deck [ops] to Operations."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete", "ops"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Deck 'Operations' is not empty. Retry with '/deck delete ops force'."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Default deck cannot be deleted."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete", "ops", "force"],
      sessions: harness.state.sessions,
      decks: harness.state.decks,
      activeSessionId: harness.state.activeSessionId,
      state: harness.state
    }),
    "Deleted deck [ops] Operations."
  );

  assert.deepEqual(harness.calls, [
    ["update-deck", "ops", { name: "Operations" }],
    ["event", { type: "deck.updated", deck: { id: "ops", name: "Operations" } }, { preferredActiveDeckId: "ops" }],
    ["delete-deck", "ops", { force: false }],
    ["delete-deck", "ops", { force: true }],
    ["event", { type: "deck.deleted", deckId: "ops", fallbackDeckId: "default" }, { preferredActiveDeckId: "default" }]
  ]);
});

test("operator handlers fail closed across retained operator edge cases", async () => {
  const noDeckHarness = createHarness({ getActiveDeck: () => null });
  assert.equal(
    await noDeckHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["rename", "Ops"],
      sessions: noDeckHarness.state.sessions,
      decks: noDeckHarness.state.decks,
      activeSessionId: noDeckHarness.state.activeSessionId,
      state: noDeckHarness.state
    }),
    "No active deck to rename."
  );
  assert.equal(
    await noDeckHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete"],
      sessions: noDeckHarness.state.sessions,
      decks: noDeckHarness.state.decks,
      activeSessionId: noDeckHarness.state.activeSessionId,
      state: noDeckHarness.state
    }),
    "No active deck to delete."
  );

  const unavailableHarness = createHarness({
    api: {
      createDeck: null,
      updateDeck: null,
      deleteDeck: null,
      moveSessionToDeck: null,
      createSession: null
    }
  });
  assert.equal(
    await unavailableHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["new", "Ops"],
      sessions: unavailableHarness.state.sessions,
      decks: unavailableHarness.state.decks,
      activeSessionId: unavailableHarness.state.activeSessionId,
      state: unavailableHarness.state
    }),
    "Deck creation is unavailable."
  );
  assert.equal(
    await unavailableHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["rename", "Ops"],
      sessions: unavailableHarness.state.sessions,
      decks: unavailableHarness.state.decks,
      activeSessionId: unavailableHarness.state.activeSessionId,
      state: unavailableHarness.state
    }),
    "Deck rename is unavailable."
  );
  assert.equal(
    await unavailableHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete"],
      sessions: unavailableHarness.state.sessions,
      decks: unavailableHarness.state.decks,
      activeSessionId: unavailableHarness.state.activeSessionId,
      state: unavailableHarness.state
    }),
    "Deck deletion is unavailable."
  );
  assert.equal(
    await unavailableHarness.handlers.executeStructuredCommand({
      command: "move",
      args: ["s-default", "ops"],
      sessions: unavailableHarness.state.sessions,
      decks: unavailableHarness.state.decks,
      activeSessionId: unavailableHarness.state.activeSessionId,
      state: unavailableHarness.state
    }),
    "Session move is unavailable."
  );
  assert.equal(
    await unavailableHarness.handlers.executeStructuredCommand({
      command: "new",
      args: ["bash"],
      sessions: unavailableHarness.state.sessions,
      decks: unavailableHarness.state.decks,
      activeSessionId: unavailableHarness.state.activeSessionId,
      state: unavailableHarness.state
    }),
    "Session creation is unavailable."
  );

  const fallbackHarness = createHarness({
    resolveTargetSelectors: (selector, sessions) => {
      if (selector === "none") {
        return { sessions: [], error: "" };
      }
      if (selector === "many") {
        return { sessions: sessions.slice(), error: "" };
      }
      if (selector === "bad") {
        return { sessions: [], error: "Target resolution failed." };
      }
      if (selector === "ops::s-ops") {
        return { sessions: sessions.filter((session) => session.id === "s-ops"), error: "" };
      }
      return { sessions: sessions.filter((session) => session.id === selector), error: "" };
    },
    resolveFilterSelectors: (selectorText, sessions) => {
      if (selectorText === "bad-filter") {
        return { sessions: [], error: "Display filter failed." };
      }
      if (selectorText === "ops::s-ops") {
        return { sessions: sessions.filter((session) => session.id === "s-ops"), error: "" };
      }
      return { sessions: [], error: "" };
    },
    resolveDeckToken: (selector, decks) => {
      const deck = decks.find((entry) => entry.id === selector) || null;
      return deck ? { deck, error: "" } : { deck: null, error: `Unknown deck: ${selector}` };
    },
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    setActiveDeck: () => false
  });

  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "help",
      args: ["unknown"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Commands: @ > / deck filter help list move new run size"
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["new"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "usage:deck:new"
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["switch", "ops"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Failed to switch deck: ops"
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "deck",
      args: ["delete", "ops", "later"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "usage:deck:delete"
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "move",
      args: ["bad", "ops"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Target resolution failed."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "move",
      args: ["none", "ops"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "No sessions resolved for /move."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "move",
      args: ["many", "ops"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Moved 2 sessions to deck [ops] Ops."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "size",
      args: ["bad"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "bad size"
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "filter",
      args: [],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Display filter cleared."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "filter",
      args: ["bad-filter"],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Display filter failed."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "list",
      args: [],
      sessions: [],
      decks: fallbackHarness.state.decks,
      activeSessionId: "",
      state: { ...fallbackHarness.state, sessions: [], activeSessionId: "" }
    }),
    "No sessions available."
  );
  assert.equal(
    await fallbackHarness.handlers.executeStructuredCommand({
      command: "new",
      args: [],
      sessions: fallbackHarness.state.sessions,
      decks: fallbackHarness.state.decks,
      activeSessionId: fallbackHarness.state.activeSessionId,
      state: fallbackHarness.state
    }),
    "Created session [NEW] New shell."
  );
});
