import test from "node:test";
import assert from "node:assert/strict";

import {
  createPasteObservationRuntimeController,
  PASTE_OBSERVATION_MAX_AUTO_CONTINUES
} from "../src/public/paste-observation-runtime-controller.js";

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

class FakeButton {
  constructor() {
    this.hidden = true;
    this.disabled = true;
    this.textContent = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  click() {
    this.listeners.get("click")?.({ type: "click" });
  }
}

class FakeTextNode {
  constructor() {
    this.hidden = true;
    this.textContent = "";
  }
}

test("paste observation runtime controller tracks partial echo and offers manual continue after a quiet stall", async () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const continueCalls = [];
  const activeSession = { id: "s1", name: "alpha" };

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    requestContinuePaste: async (sessionId, options) => {
      continueCalls.push([sessionId, options.source, options.auto]);
      return true;
    }
  });

  controller.recordTerminalPaste("s1", "abcdef\n", { autoContinueEnabled: false });
  controller.observeSessionOutput("s1", "\u001b[31mabc\u001b[0m");

  assert.equal(summaryEl.textContent, "Paste into [1] alpha is being echoed back in chunks.");
  assert.match(detailEl.textContent, /Observed 3 pasted chars/);
  assert.equal(continueBtn.hidden, true);

  await windowRef.timers[0].fn();

  assert.equal(summaryEl.textContent, "Paste into [1] alpha looks stalled.");
  assert.equal(continueBtn.hidden, false);

  continueBtn.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(continueCalls, [["s1", "manual", false]]);
  assert.match(detailEl.textContent, /Waiting for raw session output|Observed 3 pasted chars/);

  controller.dispose();
});

test("paste observation runtime controller auto-continues bounded placeholder stalls when enabled", async () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const continueCalls = [];
  const activeSession = {
    id: "s1",
    name: "alpha",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.91,
      details: {},
      updatedAt: 42
    }
  };
  let showCount = 0;

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    requestContinuePaste: async (sessionId, options) => {
      continueCalls.push([sessionId, options.source, options.attempt]);
      return true;
    },
    showCommandUi: () => {
      showCount += 1;
    }
  });

  controller.recordTerminalPaste("s1", "abcdefghij", { autoContinueEnabled: true });
  controller.observeSessionOutput("s1", "[Pasted Content 4 chars]");
  await windowRef.timers[0].fn();
  await Promise.resolve();

  assert.equal(showCount, 1);
  assert.deepEqual(continueCalls, [["s1", "auto", 1]]);
  assert.match(summaryEl.textContent, /Sent Continue Paste automatically/);
  assert.match(detailEl.textContent, /Codex placeholder acknowledgement/i);
  assert.equal(continueBtn.hidden, true);

  const observation = controller.getObservation("s1");
  assert.equal(observation.autoContinueAttempts, 1);
  assert.equal(PASTE_OBSERVATION_MAX_AUTO_CONTINUES >= observation.autoContinueAttempts, true);

  controller.dispose();
});

test("paste observation runtime controller marks full echo as complete without a continue action", () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const activeSession = { id: "s1", name: "alpha" };

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });

  controller.recordTerminalPaste("s1", "echo hi\n", { autoContinueEnabled: false });
  controller.observeSessionOutput("s1", "echo hi\n");

  assert.equal(summaryEl.textContent, "Paste into [1] alpha looks complete.");
  assert.equal(continueBtn.hidden, true);
  assert.match(detailEl.textContent, /Observed 7 pasted chars/);

  controller.dispose();
});

test("paste observation runtime controller suppresses codex placeholder heuristics for confidently different app labels", async () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const continueCalls = [];
  const activeSession = {
    id: "s1",
    name: "alpha",
    appIdentity: {
      family: "coding-agent",
      label: "gemini",
      source: "foreground-process",
      confidence: 0.88,
      details: {},
      updatedAt: 42
    }
  };

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    requestContinuePaste: async (sessionId, options) => {
      continueCalls.push([sessionId, options.source, options.attempt]);
      return true;
    }
  });

  controller.recordTerminalPaste("s1", "abcdefghij", { autoContinueEnabled: true });
  controller.observeSessionOutput("s1", "[Pasted Content 4 chars]");
  await windowRef.timers[0].fn();
  await Promise.resolve();

  assert.deepEqual(continueCalls, []);
  assert.equal(summaryEl.textContent, "Paste into [1] alpha looks stalled.");
  assert.match(detailEl.textContent, /No matching echo or known placeholder acknowledgement/i);
  assert.equal(continueBtn.hidden, false);

  controller.dispose();
});

test("paste observation runtime controller leaves stalled observations actionable when continue dispatch fails", async () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const continueCalls = [];
  const activeSession = { id: "s1", name: "alpha" };

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    requestContinuePaste: async (sessionId, options) => {
      continueCalls.push([sessionId, options.source, options.auto]);
      return false;
    }
  });

  controller.recordTerminalPaste("s1", "abcdef", { autoContinueEnabled: true });
  controller.observeSessionOutput("s1", "abc");
  await windowRef.timers[0].fn();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(continueCalls, [["s1", "auto", true]]);
  assert.equal(summaryEl.textContent, "Paste into [1] alpha looks stalled.");
  assert.equal(continueBtn.hidden, false);

  continueBtn.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(continueCalls, [
    ["s1", "auto", true],
    ["s1", "manual", false]
  ]);
  assert.equal(summaryEl.textContent, "Paste into [1] alpha looks stalled.");

  controller.dispose();
});

test("paste observation runtime controller replaces prior observation state when a new paste starts for the same session", () => {
  const windowRef = createFakeWindow();
  const panelEl = new FakeTextNode();
  const summaryEl = new FakeTextNode();
  const detailEl = new FakeTextNode();
  const continueBtn = new FakeButton();
  const activeSession = { id: "s1", name: "alpha" };

  const controller = createPasteObservationRuntimeController({
    windowRef,
    panelEl,
    summaryEl,
    detailEl,
    continueBtn,
    getActiveSession: () => activeSession,
    getSessionById: () => activeSession,
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });

  controller.recordTerminalPaste("s1", "first payload", { autoContinueEnabled: true });
  controller.observeSessionOutput("s1", "first");
  const firstObservation = controller.getObservation("s1");
  assert.equal(firstObservation.status, "partial");
  assert.equal(firstObservation.echoedChars > 0, true);

  controller.recordTerminalPaste("s1", "second payload", { autoContinueEnabled: false });
  const secondObservation = controller.getObservation("s1");
  assert.notEqual(secondObservation, firstObservation);
  assert.equal(secondObservation.status, "watching");
  assert.equal(secondObservation.echoedChars, 0);
  assert.equal(secondObservation.autoContinueAttempts, 0);
  assert.equal(secondObservation.autoContinueEnabled, false);
  assert.equal(windowRef.timers.length, 1);

  controller.dispose();
});
