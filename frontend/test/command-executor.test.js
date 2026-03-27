import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutor } from "../src/public/command-executor.js";

function createExecutor() {
  return createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: ""
        };
      }
    },
    api: {},
    systemSlashCommands: ["new", "deck", "move", "size", "filter", "close", "switch", "swap", "next", "prev", "list", "rename", "restart", "note", "replay", "settings", "custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: (session) => String(session?.deckId || "default"),
    formatSessionToken: (id) => String(id || ""),
    formatSessionDisplayName: (session) => String(session?.name || ""),
    swapSessionTokens: () => false,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: () => ({ sessions: [], error: "" }),
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });
}

test("command executor help and usage strings derive from declarative schema metadata", async () => {
  const executor = createExecutor();

  const helpText = await executor.execute({ command: "help", args: [], raw: "/help" });
  assert.match(helpText, /\/deck list\|new\|rename\|switch\|delete/);
  assert.match(helpText, /\/custom <name> <text>, \/custom <name> \+ block/);

  const deckUsage = await executor.execute({ command: "deck", args: ["wat"], raw: "/deck wat" });
  assert.equal(
    deckUsage,
    "Usage: /deck list | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]"
  );

  const moveUsage = await executor.execute({ command: "move", args: ["1"], raw: "/move 1" });
  assert.equal(moveUsage, "Usage: /move <sessionSelector> <deckSelector>");

  const switchUsage = await executor.execute({ command: "switch", args: [], raw: "/switch" });
  assert.equal(switchUsage, "Usage: /switch <id>");

  const swapUsage = await executor.execute({ command: "swap", args: ["1"], raw: "/swap 1" });
  assert.equal(swapUsage, "Usage: /swap <selectorA> <selectorB>");

  const noteUsage = await executor.execute({ command: "note", args: [], raw: "/note" });
  assert.equal(noteUsage, "Usage: /note <selector|active> [text...]");

  const replayUsage = await executor.execute({ command: "replay", args: [], raw: "/replay" });
  assert.equal(replayUsage, "Usage: /replay view [selector|active] | /replay export [selector|active] | /replay copy [selector|active]");

  const renameUsage = await executor.execute({ command: "rename", args: [], raw: "/rename" });
  assert.equal(renameUsage, "Usage: /rename <name> | /rename <selector> <name>");

  const settingsUsage = await executor.execute({ command: "settings", args: [], raw: "/settings" });
  assert.equal(settingsUsage, "Usage: /settings show [selector] | /settings apply <selector|active> <json>");

  const customShowUsage = await executor.execute({ command: "custom", args: ["show"], raw: "/custom show" });
  assert.equal(customShowUsage, "Usage: /custom show <name>");
});

test("command executor updates and clears persisted session notes", async () => {
  const sessions = [
    { id: "s1", name: "one", deckId: "default", note: "" },
    { id: "s2", name: "two", deckId: "default", note: "old" }
  ];
  const calls = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload.note]);
        return {
          ...sessions.find((session) => session.id === sessionId),
          note: payload.note ? String(payload.note).trim() : undefined
        };
      }
    },
    systemSlashCommands: ["note", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.id, event.session.note ?? ""]),
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s1" ? "7" : "8"),
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) => {
      if (selector === "8") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });

  const setFeedback = await executor.execute({
    command: "note",
    args: ["8", "needs", "review"],
    raw: "/note 8 needs review"
  });
  assert.equal(setFeedback, "Updated note for [8] two.");

  const clearFeedback = await executor.execute({
    command: "note",
    args: ["active"],
    raw: "/note active"
  });
  assert.equal(clearFeedback, "Cleared note for [7] one.");

  assert.deepEqual(calls, [
    ["patch", "s2", "needs review"],
    ["event", "session.updated", "s2", "needs review"],
    ["patch", "s1", ""],
    ["event", "session.updated", "s1", ""]
  ]);
});

test("command executor swaps quick ids between two resolved sessions and requests a rerender", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default" }
  ];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["swap", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s1" ? "7" : id === "s2" ? "8" : id),
    formatSessionDisplayName: (session) => session.name,
    swapSessionTokens: (left, right) => {
      calls.push(["swap", left, right]);
      return true;
    },
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) => {
      if (selector === "7") {
        return { sessions: [sessions[0]], error: "" };
      }
      if (selector === "8") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => calls.push(["render"])
  });

  const feedback = await executor.execute({ command: "swap", args: ["7", "8"], raw: "/swap 7 8" });

  assert.equal(feedback, "Swapped quick IDs: [7] one <-> [8] two.");
  assert.deepEqual(calls, [
    ["swap", "s1", "s2"],
    ["render"]
  ]);
});

test("command executor downloads retained replay tails for the active session by default", async () => {
  const calls = [];
  const session = { id: "s1", name: "one", deckId: "default" };
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [session],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["replay", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: () => "7",
    formatSessionDisplayName: (currentSession) => currentSession.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: () => ({ sessions: [], error: "" }),
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    exportSessionReplayDownload: async (currentSession) => {
      calls.push(["download", currentSession.id]);
      return {
        feedback: "Downloaded replay tail for [7] one (12 chars retained)."
      };
    }
  });

  const feedback = await executor.execute({ command: "replay", args: ["export"], raw: "/replay export" });

  assert.equal(feedback, "Downloaded replay tail for [7] one (12 chars retained).");
  assert.deepEqual(calls, [["download", "s1"]]);
});

test("command executor opens the replay viewer for an explicitly selected session", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default" }
  ];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["replay", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s2" ? "8" : "7"),
    formatSessionDisplayName: (currentSession) => currentSession.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) => {
      if (selector === "8") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    openSessionReplayViewer: async (currentSession) => {
      calls.push(["view", currentSession.id]);
      return {
        feedback: "Opened replay viewer for [8] two."
      };
    }
  });

  const feedback = await executor.execute({ command: "replay", args: ["view", "8"], raw: "/replay view 8" });

  assert.equal(feedback, "Opened replay viewer for [8] two.");
  assert.deepEqual(calls, [["view", "s2"]]);
});

test("command executor copies retained replay tails for an explicitly selected session", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one", deckId: "default" },
    { id: "s2", name: "two", deckId: "default" }
  ];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["replay", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s2" ? "8" : "7"),
    formatSessionDisplayName: (currentSession) => currentSession.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) => {
      if (selector === "8") {
        return { sessions: [sessions[1]], error: "" };
      }
      return { sessions: [], error: `Unknown session identifier: ${selector}` };
    },
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    exportSessionReplayCopy: async (currentSession) => {
      calls.push(["copy", currentSession.id]);
      return {
        feedback: "Copied replay tail for [8] two (0 chars retained)."
      };
    }
  });

  const feedback = await executor.execute({ command: "replay", args: ["copy", "8"], raw: "/replay copy 8" });

  assert.equal(feedback, "Copied replay tail for [8] two (0 chars retained).");
  assert.deepEqual(calls, [["copy", "s2"]]);
});

test("command executor applies input safety presets through settings payloads", async () => {
  const calls = [];
  const sessions = [{ id: "s1", name: "one", deckId: "default" }];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload.inputSafetyProfile]);
        return { ...sessions[0], ...payload };
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.inputSafetyProfile]),
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: () => "7",
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: () => ({ sessions, error: "" }),
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions, error: "" }),
    parseSettingsPayload: () => ({ ok: true, payload: { inputSafetyPreset: "shell_strict" } }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });

  const feedback = await executor.execute({
    command: "settings",
    args: ["apply", "active"],
    raw: "/settings apply active {\"inputSafetyPreset\":\"shell_strict\"}"
  });

  assert.equal(feedback, "Applied settings to 1 session(s): inputSafetyProfile.");
  assert.deepEqual(calls, [
    [
      "patch",
      "s1",
      {
        requireValidShellSyntax: true,
        confirmOnIncompleteShellConstruct: true,
        confirmOnNaturalLanguageInput: true,
        confirmOnDangerousShellCommand: true,
        confirmOnMultilineInput: true,
        confirmOnRecentTargetSwitch: true,
        targetSwitchGraceMs: 6000,
        pasteLengthConfirmThreshold: 200,
        pasteLineConfirmThreshold: 3
      }
    ],
    [
      "event",
      "session.updated",
      {
        requireValidShellSyntax: true,
        confirmOnIncompleteShellConstruct: true,
        confirmOnNaturalLanguageInput: true,
        confirmOnDangerousShellCommand: true,
        confirmOnMultilineInput: true,
        confirmOnRecentTargetSwitch: true,
        targetSwitchGraceMs: 6000,
        pasteLengthConfirmThreshold: 200,
        pasteLineConfirmThreshold: 3
      }
    ]
  ]);
});

test("command executor records correlated custom-command submissions per target session", async () => {
  const calls = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [{ id: "s1", name: "one" }],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {
      sendInput() {}
    },
    systemSlashCommands: ["custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => id,
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [{ name: "go", content: "echo hi" }],
    getCustomCommandState: () => ({ name: "go", content: "echo hi" }),
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: () => ({ sessions: [], error: "" }),
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    resolveSettingsTargets: () => ({ sessions: [], error: "" }),
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "crlf",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "CRLF",
    sendInputWithConfiguredTerminator: async (_sendInput, sessionId, payload) => {
      calls.push(["send", sessionId, payload]);
    },
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.source, submission.commandName, submission.label, submission.text]);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const feedback = await executor.execute({ command: "go", args: [], raw: "/go" });

  assert.equal(feedback, "Executed /go on [s1].");
  assert.deepEqual(calls, [
    ["send", "s1", "echo hi\n"],
    ["record", "s1", "custom-command", "go", "/go", "echo hi\n"]
  ]);
});
