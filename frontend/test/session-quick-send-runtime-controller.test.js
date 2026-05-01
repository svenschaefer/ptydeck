import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionQuickSendRuntimeController,
  SESSION_QUICK_SEND_USAGE_STORAGE_KEY
} from "../src/public/session-quick-send-runtime-controller.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.type = "";
    this.className = "";
    this.textContent = "";
    this.title = "";
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this.childNodes = this.children;
    this.firstChild = null;
    this.attributes = new Map();
    this.listeners = new Map();
  }

  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    this.firstChild = this.children[0] || null;
    return child;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    const payload = event || {};
    payload.target ||= this;
    const list = this.listeners.get(payload.type) || [];
    for (const handler of list) {
      handler(payload);
    }
    return true;
  }

  click() {
    return this.dispatchEvent({ type: "click" });
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createLocalStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function flushAsyncEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createSessions() {
  return [
    { id: "s1", name: "Alpha", deckId: "default" },
    { id: "s2", name: "Beta", deckId: "default" }
  ];
}

test("session quick-send controller ranks favorites per session and prunes stale usage entries", () => {
  const localStorageRef = createLocalStorage({
    [SESSION_QUICK_SEND_USAGE_STORAGE_KEY]: JSON.stringify({
      sessions: {
        s1: [
          { lookupKey: "project::build", count: 2, lastUsedAt: 200 },
          { lookupKey: "global::deploy", count: 1, lastUsedAt: 150 },
          { lookupKey: "project::removed", count: 9, lastUsedAt: 300 }
        ],
        s2: [{ lookupKey: "project::ship", count: 1, lastUsedAt: 120 }]
      }
    })
  });
  const sessions = createSessions();
  const commands = [
    { name: "build", scope: "project", content: "npm run build" },
    { name: "deploy", scope: "global", content: "./deploy.sh" },
    { name: "ship", scope: "project", content: "./ship.sh" }
  ];
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef,
    listCustomCommands: () => commands,
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null
  });

  const topCommands = controller.listTopCustomCommands("s1");

  assert.deepEqual(
    topCommands.map((entry) => [entry.command.lookupKey, entry.count, entry.lastUsedAt]),
    [
      ["project::build", 2, 200],
      ["global::deploy", 1, 150]
    ]
  );
  assert.deepEqual(controller.snapshot(), {
    s1: [
      { lookupKey: "project::build", count: 2, lastUsedAt: 200 },
      { lookupKey: "global::deploy", count: 1, lastUsedAt: 150 }
    ],
    s2: [{ lookupKey: "project::ship", count: 1, lastUsedAt: 120 }]
  });

  controller.syncSessions([{ id: "s1", name: "Alpha", deckId: "default" }]);

  assert.deepEqual(controller.snapshot(), {
    s1: [
      { lookupKey: "project::build", count: 2, lastUsedAt: 200 },
      { lookupKey: "global::deploy", count: 1, lastUsedAt: 150 }
    ]
  });
  assert.deepEqual(JSON.parse(localStorageRef.getItem(SESSION_QUICK_SEND_USAGE_STORAGE_KEY)), {
    sessions: {
      s1: [
        { lookupKey: "project::build", count: 2, lastUsedAt: 200 },
        { lookupKey: "global::deploy", count: 1, lastUsedAt: 150 }
      ]
    }
  });
});

test("session quick-send controller tolerates malformed persistence and enforces deterministic pruning caps", () => {
  let readAttempts = 0;
  const localStorageRef = {
    getItem() {
      readAttempts += 1;
      if (readAttempts === 1) {
        throw new Error("storage read failed");
      }
      return JSON.stringify({
        sessions: {
          " ": [{ lookupKey: "project::ignored", count: 2, lastUsedAt: 10 }],
          s1: [
            { lookupKey: "project::deploy", count: 1, lastUsedAt: 10 },
            { lookupKey: "project::deploy", count: 2, lastUsedAt: 20 }
          ]
        }
      });
    },
    setItem() {
      throw new Error("storage write failed");
    }
  };
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef,
    maxEntriesPerSession: 1,
    maxSessions: 1,
    nowMs: () => 30
  });

  assert.equal(controller.recordCustomCommandUsage("", { name: "deploy", scope: "project", content: "echo deploy" }), false);
  assert.deepEqual(controller.listTopCustomCommands(""), []);

  controller.recordCustomCommandUsage("s1", { name: "deploy", scope: "project", content: "echo deploy" }, { usedAt: 10 });
  controller.recordCustomCommandUsage("s1", { name: "restart", scope: "project", content: "echo restart" }, { usedAt: 20 });
  controller.recordCustomCommandUsage("s2", { name: "logs", scope: "project", content: "echo logs" }, { usedAt: 30 });
  controller.recordCustomCommandUsage("s2", { name: "logs", scope: "project", content: "echo logs" }, { usedAt: 40 });

  assert.deepEqual(controller.snapshot(), {
    s2: [{ lookupKey: "project::logs", count: 2, lastUsedAt: 40 }]
  });
});

test("session quick-send controller dispatches custom favorites through the configured send seam", async () => {
  const calls = [];
  const feedback = [];
  const errors = [];
  const sessions = [createSessions()[0]];
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    listCustomCommands: () => [{ name: "deploy", scope: "project", content: "./deploy.sh" }],
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    apiSendInput: async (sessionId, payload) => {
      calls.push(["api", sessionId, payload]);
    },
    sendInputWithConfiguredTerminator: async (sendInput, sessionId, payload, mode, runtimeOptions) => {
      calls.push(["terminator", sessionId, payload, mode, runtimeOptions.normalizeMode(mode), runtimeOptions.delayedSubmitMs]);
      await sendInput(sessionId, payload);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    normalizeSendTerminatorMode: (mode) => String(mode || "").toLowerCase(),
    getSessionSendTerminator: () => "CRLF",
    delayedSubmitMs: 25,
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.source, submission.commandName, submission.label, submission.text]);
    },
    setCommandFeedback: (message) => feedback.push(message),
    setError: (message) => errors.push(message),
    clearError: () => errors.push("clear"),
    requestRender: () => calls.push(["render"]),
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });

  const result = await controller.sendCustomCommand("s1", "project::deploy");

  assert.deepEqual(result, {
    ok: true,
    status: "sent",
    feedback: "Executed /deploy on [1]."
  });
  assert.deepEqual(calls, [
    ["terminator", "s1", "./deploy.sh\n", "CRLF", "crlf", 25],
    ["api", "s1", "./deploy.sh\n"],
    ["record", "s1", "custom-command", "deploy", "/deploy", "./deploy.sh\n"],
    ["render"]
  ]);
  assert.deepEqual(controller.snapshot(), {
    s1: [{ lookupKey: "project::deploy", count: 1, lastUsedAt: controller.snapshot().s1[0].lastUsedAt }]
  });
  assert.equal(typeof controller.snapshot().s1[0].lastUsedAt, "number");
  assert.deepEqual(feedback, ["Executed /deploy on [1]."]);
  assert.deepEqual(errors, ["clear"]);
});

test("session quick-send controller sends clipboard content through the existing paste seam and reports empty clipboards", async () => {
  const calls = [];
  const feedback = [];
  const errors = [];
  const sessions = [createSessions()[0]];
  let clipboardText = "pwd";
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    canReadClipboardText: () => true,
    readClipboardText: async () => clipboardText,
    submitTerminalPaste: async (sessionId, text, runtimeOptions) => {
      calls.push(["paste", sessionId, text, runtimeOptions]);
      return { ok: true, status: "sent" };
    },
    setCommandFeedback: (message) => feedback.push(message),
    setError: (message) => errors.push(message),
    clearError: () => errors.push("clear"),
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });

  const sent = await controller.sendClipboard("s1");
  clipboardText = "";
  const empty = await controller.sendClipboard("s1");

  assert.deepEqual(sent, {
    ok: true,
    status: "sent",
    feedback: "Sent clipboard to [1] Alpha."
  });
  assert.deepEqual(calls, [["paste", "s1", "pwd", { source: "paste", activateTargetBeforeSend: false }]]);
  assert.deepEqual(empty, {
    ok: false,
    status: "empty",
    feedback: "Clipboard is empty."
  });
  assert.deepEqual(feedback, ["Sent clipboard to [1] Alpha.", "Clipboard is empty."]);
  assert.deepEqual(errors, ["clear", "clear"]);
});

test("session quick-send controller renders hover actions, differentiates duplicate names, and wires click handlers", async () => {
  const calls = [];
  const feedback = [];
  const sessions = [createSessions()[0]];
  const commands = [
    { name: "deploy", scope: "global", content: "echo global" },
    { name: "deploy", scope: "project", content: "echo project" }
  ];
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    listCustomCommands: () => commands,
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    canReadClipboardText: () => true,
    readClipboardText: async () => "whoami",
    submitTerminalPaste: async (sessionId, text, runtimeOptions) => {
      calls.push(["paste", sessionId, text, runtimeOptions]);
      return { ok: true, status: "sent" };
    },
    apiSendInput: async (sessionId, payload) => {
      calls.push(["api", sessionId, payload]);
    },
    sendInputWithConfiguredTerminator: async (sendInput, sessionId, payload) => {
      calls.push(["send", sessionId, payload]);
      await sendInput(sessionId, payload);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.commandName, submission.label]);
    },
    setCommandFeedback: (message) => feedback.push(message),
    clearError: () => {},
    requestRender: () => calls.push(["render"]),
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });

  controller.recordCustomCommandUsage("s1", commands[0], { usedAt: 100 });
  controller.recordCustomCommandUsage("s1", commands[1], { usedAt: 200 });
  const panelEl = new FakeElement("div");
  const actionsEl = new FakeElement("div");

  controller.renderSessionQuickSend({ quickSendPanelEl: panelEl, quickSendActionsEl: actionsEl }, sessions[0]);

  assert.equal(panelEl.hidden, false);
  assert.equal(panelEl.getAttribute("aria-label"), "Quick send actions for [1] Alpha");
  assert.deepEqual(
    actionsEl.children.map((child) => child.textContent),
    ["/deploy · project", "/deploy · global", "Clipboard"]
  );

  actionsEl.children[0].click();
  await flushAsyncEvents();
  actionsEl.children[2].click();
  await flushAsyncEvents();

  assert.deepEqual(calls, [
    ["send", "s1", "echo project\n"],
    ["api", "s1", "echo project\n"],
    ["record", "s1", "deploy", "/deploy"],
    ["render"],
    ["paste", "s1", "whoami", { source: "paste", activateTargetBeforeSend: false }]
  ]);
  assert.deepEqual(feedback, ["Executed /deploy on [1].", "Sent clipboard to [1] Alpha."]);
});

test("session quick-send controller fails closed for blocked sessions and unavailable clipboards", async () => {
  const errors = [];
  const sessions = [createSessions()[0]];
  const controller = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    listCustomCommands: () => [{ name: "deploy", scope: "project", content: "./deploy.sh" }],
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    canReadClipboardText: () => false,
    isReadOnlyMode: () => true,
    getReadOnlyModeMessage: () => "Read-only spectator mode. Write actions are disabled.",
    setError: (message) => errors.push(message)
  });
  const panelEl = new FakeElement("div");
  const actionsEl = new FakeElement("div");

  controller.renderSessionQuickSend({ quickSendPanelEl: panelEl, quickSendActionsEl: actionsEl }, sessions[0]);
  const blocked = await controller.sendClipboard("s1");

  assert.equal(panelEl.hidden, true);
  assert.equal(actionsEl.children.length, 0);
  assert.deepEqual(blocked, {
    ok: false,
    status: "blocked",
    feedback: "Read-only spectator mode. Write actions are disabled."
  });
  assert.deepEqual(errors, ["Read-only spectator mode. Write actions are disabled."]);
});

test("session quick-send controller reports missing, invalid, and failed custom-command dispatches", async () => {
  const sessions = [createSessions()[0]];
  const errors = [];

  const missingSessionController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessionById: () => null,
    setError: (message) => errors.push(["missing-session", message])
  });
  assert.deepEqual(await missingSessionController.sendCustomCommand("s1", "project::deploy"), {
    ok: false,
    status: "missing-session",
    feedback: "Quick-send command target is unavailable."
  });

  const missingCommandController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    listCustomCommands: () => [],
    requestRender: () => errors.push(["missing-command-render"]),
    setError: (message) => errors.push(["missing-command", message]),
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name
  });
  assert.deepEqual(await missingCommandController.sendCustomCommand("s1", "project::deploy"), {
    ok: false,
    status: "missing-command",
    feedback: "Quick-send command is no longer available for [1] Alpha."
  });

  const invalidCommandController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    listCustomCommands: () => [{ name: "deploy", scope: "project", kind: "template", content: "echo {{param:env}}" }],
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    setError: (message) => errors.push(["invalid", message])
  });
  assert.match((await invalidCommandController.sendCustomCommand("s1", "project::deploy")).feedback, /Missing template parameter\(s\) for \/deploy: env\./);

  const failedCommandController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    listCustomCommands: () => [{ name: "deploy", scope: "project", content: "echo deploy" }],
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    sendInputWithConfiguredTerminator: async () => {
      throw new Error("terminal send failed");
    },
    setError: (message) => errors.push(["error", message])
  });
  assert.deepEqual(await failedCommandController.sendCustomCommand("s1", "project::deploy"), {
    ok: false,
    status: "error",
    feedback: "terminal send failed"
  });

  assert.deepEqual(errors, [
    ["missing-session", "Quick-send command target is unavailable."],
    ["missing-command", "Quick-send command is no longer available for [1] Alpha."],
    ["missing-command-render"],
    ["invalid", "Missing template parameter(s) for /deploy: env."],
    ["error", "terminal send failed"]
  ]);
});

test("session quick-send controller reports clipboard read and paste failures explicitly", async () => {
  const sessions = [createSessions()[0]];
  const errors = [];

  const unavailableController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    canReadClipboardText: () => false,
    setError: (message) => errors.push(["unavailable", message])
  });
  assert.deepEqual(await unavailableController.sendClipboard("s1"), {
    ok: false,
    status: "clipboard-unavailable",
    feedback: "Clipboard read is unavailable in this browser."
  });

  const readErrorController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    canReadClipboardText: () => true,
    readClipboardText: async () => {
      throw new Error("clipboard read failed");
    },
    setError: (message) => errors.push(["read-error", message])
  });
  assert.deepEqual(await readErrorController.sendClipboard("s1"), {
    ok: false,
    status: "clipboard-error",
    feedback: "clipboard read failed"
  });

  const pasteFailureController = createSessionQuickSendRuntimeController({
    documentRef: createDocumentRef(),
    localStorageRef: createLocalStorage(),
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    canReadClipboardText: () => true,
    readClipboardText: async () => "pwd",
    submitTerminalPaste: async () => ({ ok: false, status: "rejected", feedback: "Paste rejected." })
  });
  assert.deepEqual(await pasteFailureController.sendClipboard("s1"), {
    ok: false,
    status: "rejected",
    feedback: "Paste rejected."
  });

  assert.deepEqual(errors, [
    ["unavailable", "Clipboard read is unavailable in this browser."],
    ["read-error", "clipboard read failed"]
  ]);
});
