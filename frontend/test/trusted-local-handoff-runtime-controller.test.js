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

function createDialog() {
  return {
    hidden: true,
    open: false,
    showModal() {
      this.open = true;
      this.hidden = false;
    },
    close() {
      this.open = false;
      this.hidden = true;
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

test("trusted-local handoff runtime controller uses plural startup copy when multiple sessions are takeable", () => {
  const promptMessageEl = { textContent: "" };
  const controller = createTrustedLocalHandoffRuntimeController({
    promptEl: { hidden: true },
    promptMessageEl,
    getState: () => ({
      sessions: [
        { id: "s1", deckId: "default", name: "one" },
        { id: "s2", deckId: "default", name: "two" }
      ],
      activeSessionId: "s1",
      activeDeckId: "default"
    }),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "default", name: sessionId }),
    canTakeSessionControl: () => true
  });

  controller.render();

  assert.match(promptMessageEl.textContent, /for 2 sessions/i);
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

test("trusted-local handoff runtime controller dismisses the startup prompt after the operator declines takeover", () => {
  const promptEl = { hidden: false };
  const promptMessageEl = { textContent: "" };
  const promptNoBtn = createButton();
  let renderCalls = 0;
  const controller = createTrustedLocalHandoffRuntimeController({
    promptEl,
    promptMessageEl,
    promptNoBtn,
    getState: () => ({
      sessions: [{ id: "s1", deckId: "default", name: "one" }],
      activeSessionId: "s1",
      activeDeckId: "default"
    }),
    getSessionById: () => ({ id: "s1", deckId: "default", name: "one" }),
    canTakeSessionControl: () => true,
    requestRender: () => {
      renderCalls += 1;
    }
  });

  controller.bindUiEvents();
  controller.render();
  assert.equal(promptEl.hidden, false);

  promptNoBtn.click();
  controller.render();

  assert.equal(renderCalls, 1);
  assert.equal(promptEl.hidden, true);
});

test("trusted-local handoff runtime controller keeps controls disabled when runtime metadata is malformed or read-only", () => {
  const promptEl = { hidden: true };
  const promptMessageEl = { textContent: "" };
  const openBtn = { disabled: false };
  const dialogMetaEl = { textContent: "" };
  const dialogTakeAllBtn = { disabled: false };
  const dialogTakeDeckBtn = { disabled: false };
  const dialogTakeSessionBtn = { disabled: false };
  const controller = createTrustedLocalHandoffRuntimeController({
    promptEl,
    promptMessageEl,
    openBtn,
    dialogMetaEl,
    dialogTakeAllBtn,
    dialogTakeDeckBtn,
    dialogTakeSessionBtn,
    getState: () => ({
      sessions: [{ id: "s1", deckId: "default", name: "one" }],
      activeSessionId: "missing",
      activeDeckId: ""
    }),
    getSessionById: () => null,
    getActiveDeck: () => null,
    canTakeSessionControl: () => true,
    isReadOnlyMode: () => true
  });

  controller.render();

  assert.equal(promptEl.hidden, true);
  assert.equal(openBtn.disabled, true);
  assert.equal(dialogTakeAllBtn.disabled, true);
  assert.equal(dialogTakeDeckBtn.disabled, true);
  assert.equal(dialogTakeSessionBtn.disabled, true);
  assert.equal(dialogMetaEl.textContent, "");
});

test("trusted-local handoff runtime controller validates session takeover scope before calling the backend", async () => {
  const errors = [];
  let renderCalls = 0;
  const controller = createTrustedLocalHandoffRuntimeController({
    setError: (message) => errors.push(message),
    requestRender: () => {
      renderCalls += 1;
    }
  });

  await assert.rejects(
    controller.takeControlScope("session", { sessionId: " " }),
    /requires an active session/i
  );

  assert.deepEqual(errors, ["Failed to take control on this device."]);
  assert.equal(renderCalls, 1);
});

test("trusted-local handoff runtime controller reports backend takeover failures and ignores malformed updated sessions", async () => {
  const feedback = [];
  const errors = [];
  const runtimeEvents = [];
  const dialogEl = createDialog();
  const controller = createTrustedLocalHandoffRuntimeController({
    dialogEl,
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
    canTakeSessionControl: () => true,
    takeSessionControlScope: async () => {
      throw new Error("scope failed");
    },
    setError: (message) => errors.push(message),
    setCommandFeedback: (message) => feedback.push(message),
    applyRuntimeEvent: (event) => runtimeEvents.push(event)
  });

  await assert.rejects(
    controller.takeControlScope("deck", { deckId: "default" }),
    /scope failed/
  );
  assert.deepEqual(errors, ["Failed to take control on this device."]);
  assert.deepEqual(feedback, []);
  assert.deepEqual(runtimeEvents, []);

  const successController = createTrustedLocalHandoffRuntimeController({
    dialogEl,
    getState: () => ({
      sessions: [{ id: "s1", deckId: "default", name: "one" }],
      activeSessionId: "s1",
      activeDeckId: "default"
    }),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "default", name: "one" }),
    canTakeSessionControl: () => true,
    takeSessionControlScope: async () => ({
      updatedSessions: [null, { id: "", deckId: "default" }, { id: "s1", deckId: "default", name: "one" }]
    }),
    applyRuntimeEvent: (event) => runtimeEvents.push(event),
    applyDeviceLocalLayout: async () => ({ applied: false, captured: true }),
    setCommandFeedback: (message) => feedback.push(message)
  });

  const result = await successController.takeControlScope("all");

  assert.equal(result.updatedSessions.length, 3);
  assert.equal(runtimeEvents.at(-1)?.session?.id, "s1");
  assert.equal(runtimeEvents.filter((event) => event?.session?.id === "s1").length, 1);
  assert.match(feedback.at(-1), /Captured this device's current layout for future takeovers/i);
  assert.equal(dialogEl.hidden, true);
});

test("trusted-local handoff runtime controller binds subtle UI actions for dialog open, close, deck, and session scope takeover", async () => {
  const openBtn = createButton();
  const dialogCloseBtn = createButton();
  const dialogTakeDeckBtn = createButton();
  const dialogTakeSessionBtn = createButton();
  const promptYesBtn = createButton();
  const dialogEl = createDialog();
  const scopeCalls = [];
  const sessionCalls = [];
  const controller = createTrustedLocalHandoffRuntimeController({
    promptYesBtn,
    openBtn,
    dialogEl,
    dialogCloseBtn,
    dialogTakeDeckBtn,
    dialogTakeSessionBtn,
    getState: () => ({
      sessions: [{ id: "s1", deckId: "ops", name: "one" }],
      activeSessionId: "s1",
      activeDeckId: "ops"
    }),
    getSessionById: () => ({ id: "s1", deckId: "ops", name: "one" }),
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    canTakeSessionControl: () => true,
    takeSessionControlScope: async (payload) => {
      scopeCalls.push(payload);
      return { updatedSessions: [{ id: "s1", deckId: "ops", name: "one" }] };
    },
    takeSessionControl: async (sessionId) => {
      sessionCalls.push(sessionId);
      return { id: sessionId, deckId: "ops", name: "one" };
    }
  });

  controller.bindUiEvents();

  openBtn.click();
  assert.equal(dialogEl.open, true);
  dialogCloseBtn.click();
  assert.equal(dialogEl.hidden, true);

  promptYesBtn.click();
  dialogTakeDeckBtn.click();
  dialogTakeSessionBtn.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(scopeCalls[0], { scope: "all" });
  assert.deepEqual(scopeCalls[1], { scope: "deck", deckId: "ops" });
  assert.deepEqual(sessionCalls, ["s1"]);
});

test("trusted-local handoff runtime controller returns generic feedback for unknown scope and session-specific feedback for single-session takeovers", async () => {
  const feedback = [];
  const controller = createTrustedLocalHandoffRuntimeController({
    getState: () => ({
      sessions: [{ id: "s1", deckId: "ops", name: "one" }],
      activeSessionId: "s1",
      activeDeckId: "ops"
    }),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "ops", name: "one" }),
    formatSessionToken: () => "A1",
    formatSessionDisplayName: () => "one",
    canTakeSessionControl: () => true,
    takeSessionControl: async (sessionId) => ({ id: sessionId, deckId: "ops", name: "one" }),
    setCommandFeedback: (message) => feedback.push(message)
  });

  const sessionResult = await controller.takeControlScope("session", { sessionId: "s1" });
  assert.equal(sessionResult.updatedSessions[0].id, "s1");
  assert.match(feedback[0], /This device now controls \[A1\] one/i);

  await assert.rejects(
    controller.takeControlScope("unknown"),
    /requires a known claim scope/i
  );
});
