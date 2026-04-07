import test from "node:test";
import assert from "node:assert/strict";

import { createTrustedLocalHandoffRuntimeController } from "../src/public/trusted-local-handoff-runtime-controller.js";

function createButton() {
  const listeners = new Map();
  return {
    disabled: false,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    click() {
      listeners.get("click")?.();
    }
  };
}

test("trusted-local handoff runtime controller renders a startup prompt for takeable sessions", () => {
  const promptEl = { hidden: true };
  const promptMessageEl = { textContent: "" };
  const openBtn = { disabled: true };
  const dialogMetaEl = { textContent: "" };
  const controller = createTrustedLocalHandoffRuntimeController({
    promptEl,
    promptMessageEl,
    openBtn,
    dialogMetaEl,
    getState: () => ({
      sessions: [{ id: "s1", deckId: "default", name: "one" }],
      activeSessionId: "s1",
      activeDeckId: "default"
    }),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "default", name: "one" }),
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    resolveDeckName: () => "Default",
    formatSessionToken: () => "A1",
    formatSessionDisplayName: () => "one",
    canTakeSessionControl: () => true
  });

  controller.render();

  assert.equal(promptEl.hidden, false);
  assert.match(promptMessageEl.textContent, /active controller/i);
  assert.equal(openBtn.disabled, false);
  assert.match(dialogMetaEl.textContent, /Deck:/);
  assert.match(dialogMetaEl.textContent, /Session:/);
});

test("trusted-local handoff runtime controller takes control for all sessions and applies the local layout", async () => {
  const feedback = [];
  const runtimeEvents = [];
  const controller = createTrustedLocalHandoffRuntimeController({
    promptEl: { hidden: true },
    promptMessageEl: { textContent: "" },
    promptYesBtn: createButton(),
    promptNoBtn: createButton(),
    openBtn: createButton(),
    dialogEl: { hidden: true },
    dialogMetaEl: { textContent: "" },
    dialogCloseBtn: createButton(),
    dialogTakeAllBtn: createButton(),
    dialogTakeDeckBtn: createButton(),
    dialogTakeSessionBtn: createButton(),
    getState: () => ({
      sessions: [
        { id: "s1", deckId: "default", name: "one" },
        { id: "s2", deckId: "default", name: "two" }
      ],
      activeSessionId: "s1",
      activeDeckId: "default"
    }),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "default", name: sessionId === "s1" ? "one" : "two" }),
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    resolveDeckName: () => "Default",
    canTakeSessionControl: () => true,
    takeSessionControlScope: async () => ({
      updatedSessions: [
        { id: "s1", deckId: "default", name: "one" },
        { id: "s2", deckId: "default", name: "two" }
      ]
    }),
    applyRuntimeEvent: (event) => runtimeEvents.push(event),
    applyDeviceLocalLayout: async () => ({ applied: true, captured: false }),
    setCommandFeedback: (message) => feedback.push(message)
  });

  const result = await controller.takeControlScope("all");

  assert.equal(result.updatedSessions.length, 2);
  assert.equal(runtimeEvents.length, 2);
  assert.match(feedback[0], /controls all available operator sessions/i);
  assert.match(feedback[0], /Applied this device's local layout/i);
});
