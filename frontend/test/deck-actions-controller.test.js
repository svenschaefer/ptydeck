import test from "node:test";
import assert from "node:assert/strict";

import { createDeckActionsController } from "../src/public/ui/deck-actions-controller.js";

test("deck-actions controller handles create and rename flows", async () => {
  const prompts = ["New Deck", "Renamed Deck"];
  const events = [];
  const feedback = [];
  const errors = [];
  const apiCalls = [];

  const api = {
    async createDeck(payload) {
      apiCalls.push({ op: "create", payload });
      return { id: "deck-1", name: payload.name };
    },
    async updateDeck(deckId, payload) {
      apiCalls.push({ op: "update", deckId, payload });
      return { id: deckId, name: payload.name };
    },
    async deleteDeck() {
      throw new Error("not used");
    }
  };

  const controller = createDeckActionsController({
    api,
    requestText: async () => prompts.shift() ?? null,
    confirmAction: async () => true,
    getActiveDeck: () => ({ id: "deck-1", name: "Deck One" }),
    getDecks: () => [{ id: "default", name: "Default" }, { id: "deck-1", name: "Deck One" }],
    getTerminalSettings: () => ({ cols: 58, rows: 40 }),
    applyRuntimeEvent: (event, options) => events.push({ event, options }),
    setCommandFeedback: (text) => feedback.push(text),
    setError: (text) => errors.push(text),
    defaultDeckId: "default"
  });

  await controller.createDeckFlow();
  await controller.renameDeckFlow();

  assert.equal(errors.length, 0);
  assert.equal(apiCalls[0].op, "create");
  assert.deepEqual(apiCalls[0].payload.settings.terminal, { cols: 58, rows: 40 });
  assert.equal(apiCalls[1].op, "update");
  assert.equal(apiCalls[1].deckId, "deck-1");
  assert.equal(events[0].event.type, "deck.created");
  assert.equal(events[1].event.type, "deck.updated");
  assert.match(feedback[0], /Created deck/);
  assert.match(feedback[1], /Renamed deck/);
});

test("deck-actions controller handles 409 force-delete flow", async () => {
  const confirms = [true, true];
  const deleteCalls = [];
  const events = [];

  const api = {
    async createDeck() {
      throw new Error("not used");
    },
    async updateDeck() {
      throw new Error("not used");
    },
    async deleteDeck(deckId, payload) {
      deleteCalls.push({ deckId, payload });
      if (deleteCalls.length === 1) {
        const err = new Error("conflict");
        err.status = 409;
        throw err;
      }
      return undefined;
    }
  };

  const controller = createDeckActionsController({
    api,
    requestText: async () => null,
    confirmAction: async () => confirms.shift() ?? false,
    getActiveDeck: () => ({ id: "deck-a", name: "Deck A" }),
    getDecks: () => [{ id: "default", name: "Default" }, { id: "deck-a", name: "Deck A" }],
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    applyRuntimeEvent: (event, options) => events.push({ event, options }),
    setCommandFeedback: () => {},
    setError: () => {},
    defaultDeckId: "default"
  });

  await controller.deleteDeckFlow();

  assert.equal(deleteCalls.length, 2);
  assert.deepEqual(deleteCalls[0].payload, { force: false });
  assert.deepEqual(deleteCalls[1].payload, { force: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].event.type, "deck.deleted");
  assert.equal(events[0].event.fallbackDeckId, "default");
});

test("deck-actions controller covers fallback prompt and confirm adapters plus validation branches", async () => {
  const promptCalls = [];
  const confirmCalls = [];
  const errors = [];
  const apiCalls = [];
  const controller = createDeckActionsController({
    api: {
      async createDeck(payload) {
        apiCalls.push(["create", payload.name]);
        return { id: "deck-2", name: payload.name };
      },
      async updateDeck() {
        throw new Error("not used");
      },
      async deleteDeck() {
        throw new Error("not used");
      }
    },
    windowRef: {
      prompt(message, defaultValue) {
        promptCalls.push([message, defaultValue]);
        return promptCalls.length === 1 ? "  " : "Notebook";
      },
      confirm(message) {
        confirmCalls.push(message);
        return false;
      }
    },
    getActiveDeck: () => ({ id: "deck-1", name: "Deck One" }),
    getDecks: () => [{ id: "deck-1", name: "Deck One" }],
    getTerminalSettings: () => ({ cols: 90, rows: 24 }),
    applyRuntimeEvent: () => {},
    setCommandFeedback: () => {},
    setError: (message) => errors.push(message)
  });

  await controller.createDeckFlow();
  await controller.createDeckFlow();
  await controller.deleteDeckFlow();

  assert.equal(apiCalls.length, 1);
  assert.deepEqual(apiCalls[0], ["create", "Notebook"]);
  assert.equal(confirmCalls.length, 1);
  assert.deepEqual(errors, ["Deck name cannot be empty."]);
});

test("deck-actions controller reports missing active decks, blank rename input, and force-delete aborts", async () => {
  const errors = [];
  const deleteCalls = [];
  const controllerWithoutDeck = createDeckActionsController({
    api: {},
    requestText: async () => "ignored",
    confirmAction: async () => true,
    getActiveDeck: () => null,
    setError: (message) => errors.push(message)
  });

  await controllerWithoutDeck.renameDeckFlow();
  await controllerWithoutDeck.deleteDeckFlow();

  const controllerWithDeck = createDeckActionsController({
    api: {
      async updateDeck() {
        throw new Error("not used");
      },
      async deleteDeck(deckId, payload) {
        deleteCalls.push([deckId, payload.force]);
        const error = new Error("conflict");
        error.status = 409;
        throw error;
      }
    },
    requestText: async () => "   ",
    confirmAction: async () => (deleteCalls.length === 0),
    getActiveDeck: () => ({ id: "deck-a", name: "Deck A" }),
    getDecks: () => [{ id: "deck-a", name: "Deck A" }],
    setError: (message) => errors.push(message)
  });

  await controllerWithDeck.renameDeckFlow();
  await controllerWithDeck.deleteDeckFlow();

  assert.deepEqual(errors, [
    "No active deck to rename.",
    "No active deck to delete.",
    "Deck name cannot be empty."
  ]);
  assert.deepEqual(deleteCalls, [["deck-a", false]]);
});

test("deck-actions controller rethrows non-conflict delete errors", async () => {
  const controller = createDeckActionsController({
    api: {
      async deleteDeck() {
        const error = new Error("boom");
        error.status = 500;
        throw error;
      }
    },
    confirmAction: async () => true,
    getActiveDeck: () => ({ id: "deck-a", name: "Deck A" }),
    getDecks: () => [{ id: "deck-a", name: "Deck A" }]
  });

  await assert.rejects(
    controller.deleteDeckFlow(),
    /boom/
  );
});
