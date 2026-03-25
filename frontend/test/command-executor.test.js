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
    systemSlashCommands: ["new", "deck", "move", "size", "filter", "close", "switch", "next", "prev", "list", "rename", "restart", "settings", "custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: (session) => String(session?.deckId || "default"),
    formatSessionToken: (id) => String(id || ""),
    formatSessionDisplayName: (session) => String(session?.name || ""),
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
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
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

  const renameUsage = await executor.execute({ command: "rename", args: [], raw: "/rename" });
  assert.equal(renameUsage, "Usage: /rename <name> | /rename <selector> <name>");

  const settingsUsage = await executor.execute({ command: "settings", args: [], raw: "/settings" });
  assert.equal(settingsUsage, "Usage: /settings show [selector] | /settings apply <selector|active> <json>");

  const customShowUsage = await executor.execute({ command: "custom", args: ["show"], raw: "/custom show" });
  assert.equal(customShowUsage, "Usage: /custom show <name>");
});
