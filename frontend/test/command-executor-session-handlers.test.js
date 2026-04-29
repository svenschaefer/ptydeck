import test from "node:test";
import assert from "node:assert/strict";

import {
  createCommandExecutorSessionHandlers,
  resolveActiveOrDirectTargetSession,
  resolveDirectTargetSession,
  resolveSingleSessionForCommand
} from "../src/public/command-executor-session-handlers.js";

function createHandlers(overrides = {}) {
  return createCommandExecutorSessionHandlers({
    formatUsage: overrides.formatUsage || ((command, subcommand = "") => `usage:${command}:${subcommand}`),
    getActiveDeck: overrides.getActiveDeck || (() => ({ id: "default", name: "Default" })),
    setActiveDeck: overrides.setActiveDeck || (() => true),
    setActiveSession: overrides.setActiveSession || (() => {}),
    resolveTargetSelectors: overrides.resolveTargetSelectors || (() => ({ sessions: [], error: "" })),
    resolveSessionDeckId: overrides.resolveSessionDeckId || ((session) => String(session?.deckId || "default")),
    formatSessionToken: overrides.formatSessionToken || ((id) => String(id || "")),
    formatSessionDisplayName: overrides.formatSessionDisplayName || ((session) => String(session?.name || "")),
    isSessionExited: overrides.isSessionExited || ((session) => session?.exited === true),
    isSessionActionBlocked: overrides.isSessionActionBlocked || ((session) => session?.blocked === true),
    getBlockedSessionActionMessage:
      overrides.getBlockedSessionActionMessage ||
      ((sessions, actionLabel) => `${actionLabel} blocked: ${sessions.map((session) => session.id).join(",")}`),
    requestRender: overrides.requestRender || (() => {}),
    resolveDirectTargetSession: overrides.resolveDirectTargetSession,
    resolveActiveOrDirectTargetSession: overrides.resolveActiveOrDirectTargetSession,
    swapSessionTokens: overrides.swapSessionTokens || (() => false),
    applyRuntimeEvent: overrides.applyRuntimeEvent || (() => {}),
    api: overrides.api || {}
  });
}

test("session command helpers resolve active, direct, and selector-based targets deterministically", () => {
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "ops" }
  ];
  const resolveTargetSelectors = (selector) => {
    if (selector === "two") {
      return { sessions: [sessions[1]], error: "" };
    }
    if (selector === "many") {
      return { sessions: sessions.slice(), error: "" };
    }
    return { sessions: [], error: `Unknown session identifier: ${selector}` };
  };

  assert.deepEqual(
    resolveSingleSessionForCommand("", sessions, "s1", "No active session.", "Selector", resolveTargetSelectors),
    { error: "", session: sessions[0] }
  );
  assert.deepEqual(
    resolveSingleSessionForCommand("two", sessions, "s1", "No active session.", "Selector", resolveTargetSelectors),
    { error: "", session: sessions[1] }
  );
  assert.equal(
    resolveSingleSessionForCommand("many", sessions, "s1", "No active session.", "Selector", resolveTargetSelectors).error,
    "Selector must resolve to exactly one session."
  );
  assert.equal(
    resolveSingleSessionForCommand("missing", sessions, "s1", "No active session.", "Selector", resolveTargetSelectors).error,
    "Unknown session identifier: missing"
  );
  assert.deepEqual(
    resolveDirectTargetSession({ targetSelector: "two" }, sessions, "s1", "No active session.", "Selector", resolveTargetSelectors),
    { error: "", session: sessions[1] }
  );
  assert.deepEqual(
    resolveActiveOrDirectTargetSession({}, sessions, "s1", "No active session.", "Selector", resolveTargetSelectors),
    { error: "", session: sessions[0] }
  );
  assert.equal(
    resolveActiveOrDirectTargetSession({}, sessions, "", "No active session.", "Selector", resolveTargetSelectors).error,
    "No active session."
  );
});

test("session handlers close live and exited targets through extracted side-effect gates", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default", exited: true }
  ];
  const handlers = createHandlers({
    resolveTargetSelectors: (selector) => {
      if (selector === "both") {
        return { sessions: sessions.slice(), error: "" };
      }
      if (selector === "exited") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: "" };
    },
    formatSessionToken: (id) => (id === "s1" ? "1" : id === "s2" ? "2" : String(id || "")),
    api: {
      async deleteSession(sessionId) {
        calls.push(["delete", sessionId]);
      }
    },
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.sessionId])
  });

  assert.equal(
    await handlers.executeStructuredCommand({ command: "close", args: ["both"], sessions, activeSessionId: "s1" }),
    "Closed 2 sessions."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "close", args: ["exited"], sessions, activeSessionId: "s1" }),
    "Removed exited session [2] two."
  );
  assert.equal(await handlers.executeStructuredCommand({ command: "noop" }), null);
  assert.deepEqual(calls, [
    ["delete", "s1"],
    ["event", "session.closed", "s1"],
    ["event", "session.closed", "s2"],
    ["event", "session.closed", "s2"]
  ]);
});

test("session handlers switch and cycle sessions with deck-aware handoff", async () => {
  const calls = [];
  const activeDeckState = { id: "default" };
  const activeSessionState = { id: "s1" };
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "ops" },
    { id: "s3", name: "three", deckId: "ops" }
  ];
  const handlers = createHandlers({
    getActiveDeck: () => ({ id: activeDeckState.id, name: activeDeckState.id.toUpperCase() }),
    setActiveDeck: (deckId) => {
      activeDeckState.id = deckId;
      calls.push(["deck", deckId]);
      return true;
    },
    setActiveSession: (sessionId) => {
      activeSessionState.id = sessionId;
      calls.push(["session", sessionId]);
    },
    formatSessionToken: (id) => (id === "s1" ? "1" : id === "s2" ? "2" : id === "s3" ? "3" : String(id || "")),
    resolveTargetSelectors: (selector) => {
      if (selector === "amb") {
        return { sessions: [sessions[1], sessions[2]], error: "" };
      }
      if (selector === "2") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    }
  });

  assert.equal(
    await handlers.executeStructuredCommand({ command: "switch", args: ["amb"], sessions, activeSessionId: activeSessionState.id }),
    "Switch selector must resolve to exactly one session."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "switch", args: ["2"], sessions, activeSessionId: activeSessionState.id }),
    "Active session: [2] two."
  );
  assert.equal(activeDeckState.id, "ops");
  assert.equal(activeSessionState.id, "s2");

  assert.equal(
    await handlers.executeStructuredCommand({ command: "next", args: [], sessions, activeSessionId: activeSessionState.id }),
    "Active session: [3] three."
  );
  assert.equal(activeSessionState.id, "s3");
  assert.deepEqual(calls, [
    ["deck", "ops"],
    ["session", "s2"],
    ["session", "s3"]
  ]);
});

test("session handlers swap quick IDs through backend or fail closed when the swap contract is unavailable", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default" }
  ];
  const resolvingHandlers = createHandlers({
    formatSessionToken: (id) => (id === "s1" ? "7" : id === "s2" ? "8" : String(id || "")),
    resolveTargetSelectors: (selector) => {
      if (selector === "7") {
        return { sessions: [sessions[0]], error: "" };
      }
      if (selector === "8") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    requestRender: () => calls.push(["render"]),
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.id, event.session.quickIdToken]),
    api: {
      async swapSessionQuickIds(leftId, rightId) {
        calls.push(["swap", leftId, rightId]);
        return {
          leftSession: { ...sessions[0], quickIdToken: "8" },
          rightSession: { ...sessions[1], quickIdToken: "7" }
        };
      }
    }
  });

  assert.equal(
    await resolvingHandlers.executeStructuredCommand({ command: "swap", args: ["7", "7"], sessions }),
    "Swap targets resolve to the same session."
  );
  assert.equal(
    await resolvingHandlers.executeStructuredCommand({ command: "swap", args: ["7", "8"], sessions }),
    "Swapped quick IDs: [7] one <-> [8] two."
  );

  const fallbackHandlers = createHandlers({
    resolveTargetSelectors: (selector) => ({
      sessions: selector === "1" ? [sessions[0]] : selector === "2" ? [sessions[1]] : [],
      error: ""
    }),
    swapSessionTokens: () => false
  });
  assert.equal(
    await fallbackHandlers.executeStructuredCommand({ command: "swap", args: ["1", "2"], sessions }),
    "Failed to swap session quick IDs."
  );
  assert.deepEqual(calls, [
    ["swap", "s1", "s2"],
    ["event", "session.updated", "s1", "8"],
    ["event", "session.updated", "s2", "7"],
    ["render"]
  ]);
});

test("session handlers restart, rename, and note preserve direct-target routing and gating feedback", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default", blocked: true },
    { id: "s2", name: "two", deckId: "ops" },
    { id: "s3", name: "three", deckId: "ops", exited: true }
  ];
  const handlers = createHandlers({
    formatSessionToken: (id) => (id === "s1" ? "1" : id === "s2" ? "2" : id === "s3" ? "3" : String(id || "")),
    resolveTargetSelectors: (selector) => {
      if (selector === "blocked") {
        return { sessions: [sessions[0]], error: "" };
      }
      if (selector === "two") {
        return { sessions: [sessions[1]], error: "" };
      }
      if (selector === "three") {
        return { sessions: [sessions[2]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    setActiveSession: (sessionId) => calls.push(["active", sessionId]),
    api: {
      async restartSession(sessionId) {
        calls.push(["restart", sessionId]);
        return { ...sessions.find((session) => session.id === sessionId), restarted: true };
      },
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload]);
        const current = sessions.find((session) => session.id === sessionId) || { id: sessionId, name: sessionId };
        return {
          ...current,
          ...payload,
          note: Object.prototype.hasOwnProperty.call(payload, "note") ? payload.note : current.note
        };
      }
    },
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.id, event.session.note ?? ""])
  });

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "restart",
      args: ["blocked"],
      interpreted: {},
      sessions,
      activeSessionId: "s2"
    }),
    "Restart blocked: s1"
  );
  assert.equal(
    await handlers.executeStructuredCommand({
      command: "restart",
      args: [],
      interpreted: { targetSelector: "two" },
      sessions,
      activeSessionId: "s1"
    }),
    "Restarted session [2] two."
  );
  assert.equal(
    await handlers.executeStructuredCommand({
      command: "rename",
      args: ["Renamed"],
      interpreted: { targetSelector: "three" },
      sessions,
      activeSessionId: "s2"
    }),
    "Rename blocked: s3"
  );
  assert.equal(
    await handlers.executeStructuredCommand({
      command: "note",
      args: ["needs", "review"],
      interpreted: { targetSelector: "two" },
      sessions,
      activeSessionId: "s1"
    }),
    "Updated note for [2] two."
  );
  assert.equal(
    await handlers.executeStructuredCommand({
      command: "note",
      args: [],
      interpreted: { targetSelector: "two" },
      sessions,
      activeSessionId: "s1"
    }),
    "Cleared note for [2] two."
  );
  assert.deepEqual(calls, [
    ["restart", "s2"],
    ["event", "session.updated", "s2", ""],
    ["active", "s2"],
    ["patch", "s2", { note: "needs review" }],
    ["event", "session.updated", "s2", "needs review"],
    ["patch", "s2", { note: "" }],
    ["event", "session.updated", "s2", ""]
  ]);
});

test("session handlers fail closed on usage-only and missing-active branches", async () => {
  const handlers = createHandlers();

  assert.equal(await handlers.executeStructuredCommand({ command: "close", args: [], sessions: [], activeSessionId: "" }), "No sessions available.");
  assert.equal(await handlers.executeStructuredCommand({ command: "switch", args: [], sessions: [] }), "usage:switch:");
  assert.equal(await handlers.executeStructuredCommand({ command: "swap", args: ["only"], sessions: [] }), "usage:swap:");
  assert.equal(await handlers.executeStructuredCommand({ command: "next", args: [], sessions: [], activeSessionId: "" }), "No sessions available.");
  assert.equal(await handlers.executeStructuredCommand({ command: "rename", args: [], sessions: [], activeSessionId: "" }), "usage:rename:");
  assert.equal(await handlers.executeStructuredCommand({ command: "restart", args: [], sessions: [], activeSessionId: "" }), "No sessions available.");
  assert.equal(
    await handlers.executeStructuredCommand({ command: "note", args: [], interpreted: {}, sessions: [], activeSessionId: "" }),
    "No active session for /note."
  );
});

test("session handlers propagate selector failures and reject invalid backend swap responses", async () => {
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default" }
  ];
  const handlers = createHandlers({
    resolveTargetSelectors: (selector) => {
      if (selector === "bad") {
        return { sessions: [], error: "Selector failed." };
      }
      if (selector === "one") {
        return { sessions: [sessions[0]], error: "" };
      }
      if (selector === "two") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: "" };
    },
    api: {
      async swapSessionQuickIds() {
        return {};
      }
    }
  });

  assert.equal(
    await handlers.executeStructuredCommand({ command: "close", args: ["bad"], sessions, activeSessionId: "s1" }),
    "Selector failed."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "switch", args: ["bad"], sessions, activeSessionId: "s1" }),
    "Selector failed."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "restart", args: ["bad"], sessions, activeSessionId: "s1" }),
    "Selector failed."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "swap", args: ["one", "two"], sessions }),
    "Failed to swap session quick IDs."
  );
  assert.equal(
    await handlers.executeStructuredCommand({
      command: "rename",
      args: ["   "],
      interpreted: { targetSelector: "two" },
      sessions,
      activeSessionId: "s1"
    }),
    "usage:rename:"
  );
});
