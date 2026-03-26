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
    systemSlashCommands: ["new", "deck", "move", "size", "filter", "close", "switch", "swap", "next", "prev", "list", "rename", "restart", "settings", "custom", "help"],
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

  const renameUsage = await executor.execute({ command: "rename", args: [], raw: "/rename" });
  assert.equal(renameUsage, "Usage: /rename <name> | /rename <selector> <name>");

  const settingsUsage = await executor.execute({ command: "settings", args: [], raw: "/settings" });
  assert.equal(settingsUsage, "Usage: /settings show [selector] | /settings apply <selector|active> <json>");

  const customShowUsage = await executor.execute({ command: "custom", args: ["show"], raw: "/custom show" });
  assert.equal(customShowUsage, "Usage: /custom show <name>");
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
