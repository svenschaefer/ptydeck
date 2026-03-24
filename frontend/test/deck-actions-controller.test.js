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
    windowRef: {
      prompt() {
        return prompts.shift() ?? null;
      },
      confirm() {
        return true;
      }
    },
    api,
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
    windowRef: {
      prompt() {
        return null;
      },
      confirm() {
        return confirms.shift() ?? false;
      }
    },
    api,
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
