import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutor } from "../src/public/command-executor.js";

function createExecutor(overrides = {}) {
  return createCommandExecutor({
    store: overrides.store || {
      getState() {
        return {
          sessions: [],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: ""
        };
      }
    },
    api: overrides.api || {
      async createSession(payload) {
        return { id: "s-new", name: payload?.shell || "Session", deckId: "default" };
      }
    },
    systemSlashCommands:
      overrides.systemSlashCommands ||
      ["new", "deck", "move", "size", "filter", "close", "switch", "swap", "next", "prev", "list", "rename", "restart", "note", "connection", "layout", "workspace", "broadcast", "share", "replay", "transfer", "settings", "custom", "help", "run"],
    getActiveDeck: overrides.getActiveDeck || (() => ({ id: "default", name: "Default" })),
    getSessionCountForDeck: overrides.getSessionCountForDeck || (() => 0),
    applyRuntimeEvent: overrides.applyRuntimeEvent || (() => {}),
    setActiveDeck: overrides.setActiveDeck || (() => true),
    resolveSessionDeckId: overrides.resolveSessionDeckId || ((session) => String(session?.deckId || "default")),
    formatSessionToken: overrides.formatSessionToken || ((id) => String(id || "")),
    formatSessionDisplayName: overrides.formatSessionDisplayName || ((session) => String(session?.name || "")),
    sortSessionsByQuickId: overrides.sortSessionsByQuickId || ((sessions) => (Array.isArray(sessions) ? sessions.slice() : [])),
    swapSessionTokens: overrides.swapSessionTokens || (() => false),
    getSessionRuntimeState: overrides.getSessionRuntimeState || (() => ({})),
    isSessionExited: overrides.isSessionExited || (() => false),
    isSessionActionBlocked: overrides.isSessionActionBlocked || (() => false),
    getBlockedSessionActionMessage: overrides.getBlockedSessionActionMessage || (() => ""),
    listCustomCommandState: overrides.listCustomCommandState || (() => []),
    getCustomCommandState: overrides.getCustomCommandState || (() => null),
    removeCustomCommandState: overrides.removeCustomCommandState || (() => false),
    parseCustomDefinition: overrides.parseCustomDefinition || (() => ({ ok: false, error: "unsupported" })),
    upsertCustomCommandState: overrides.upsertCustomCommandState || (() => null),
    resolveTargetSelectors: overrides.resolveTargetSelectors || (() => ({ sessions: [], error: "" })),
    resolveDeckToken: overrides.resolveDeckToken || (() => ({ deck: null, error: "unknown deck" })),
    parseSizeCommandArgs: overrides.parseSizeCommandArgs || (() => ({ ok: false, error: "bad size" })),
    applyTerminalSizeSettings: overrides.applyTerminalSizeSettings || (() => {}),
    setSessionFilterText: overrides.setSessionFilterText || (() => {}),
    resolveSettingsTargets: overrides.resolveSettingsTargets || (() => ({ sessions: [], error: "" })),
    parseSettingsPayload: overrides.parseSettingsPayload || (() => ({ ok: false, error: "bad json" })),
    normalizeSendTerminatorMode: overrides.normalizeSendTerminatorMode || (() => "auto"),
    setSessionSendTerminator: overrides.setSessionSendTerminator || (() => {}),
    getSessionSendTerminator: overrides.getSessionSendTerminator || (() => "auto"),
    sendInputWithConfiguredTerminator: overrides.sendInputWithConfiguredTerminator || (async () => {}),
    recordCommandSubmission: overrides.recordCommandSubmission || (() => null),
    buildCustomCommandUsageApiOptions: overrides.buildCustomCommandUsageApiOptions || (() => undefined),
    normalizeCustomCommandPayloadForShell: overrides.normalizeCustomCommandPayloadForShell || ((value) => value),
    normalizeSessionTags: overrides.normalizeSessionTags || ((tags) => (Array.isArray(tags) ? tags : [])),
    normalizeThemeProfile: overrides.normalizeThemeProfile || ((profile) => profile || {}),
    getTerminalSettings: overrides.getTerminalSettings || (() => ({ cols: 80, rows: 20 })),
    requestRender: overrides.requestRender || (() => {}),
    listWorkspacePresets: overrides.listWorkspacePresets || (() => []),
    resolveWorkspacePreset: overrides.resolveWorkspacePreset || (() => ({ preset: null, error: "Unknown workspace preset." })),
    createWorkspacePresetFromCurrent: overrides.createWorkspacePresetFromCurrent || (async () => ""),
    applyWorkspacePreset: overrides.applyWorkspacePreset || (async () => ""),
    renameWorkspacePreset: overrides.renameWorkspacePreset || (async () => ""),
    deleteWorkspacePreset: overrides.deleteWorkspacePreset || (async () => ""),
    getBroadcastStatus: overrides.getBroadcastStatus || (() => "Broadcast: off."),
    enableGroupBroadcast: overrides.enableGroupBroadcast || (async () => ""),
    disableBroadcast: overrides.disableBroadcast || (async () => "Broadcast mode disabled."),
    listShares: overrides.listShares || (async () => []),
    createShareLink: overrides.createShareLink || (async () => null),
    revokeShareLink: overrides.revokeShareLink || (async () => null),
    writeClipboardText: overrides.writeClipboardText || (async () => false)
  });
}

test("command executor help and usage strings derive from declarative schema metadata", async () => {
  const executor = createExecutor();

  const helpText = await executor.execute({ command: "help", args: [], raw: "/help" });
  assert.equal(
    helpText,
    "Commands: @ > / broadcast close connection custom deck filter help layout list move new next note prev rename replay restart run settings share size swap switch transfer workspace"
  );

  const topicHelp = await executor.execute({ command: "help", args: ["deck"], raw: "/help deck" });
  assert.match(topicHelp, /^\/deck$/m);
  assert.match(topicHelp, /Subcommands: list new rename switch delete/);

  const subcommandHelp = await executor.execute({ command: "help", args: ["deck", "switch"], raw: "/help deck switch" });
  assert.equal(
    subcommandHelp,
    ["/deck switch", "Usage: /deck switch <deckSelector>", "switch active deck", "Aliases: /deck.switch"].join("\n")
  );

  const aliasHelp = await executor.execute({ command: "help", args: ["deck.switch"], raw: "/help deck.switch" });
  assert.equal(
    aliasHelp,
    ["/deck.switch", "Usage: /deck.switch <deckSelector>", "switch active deck", "Alias for: /deck switch"].join("\n")
  );

  const deckUsage = await executor.execute({ command: "deck", args: ["wat"], raw: "/deck wat" });
  assert.equal(
    deckUsage,
    "Usage: /deck list | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]"
  );

  const moveUsage = await executor.execute({ command: "move", args: ["1"], raw: "/move 1" });
  assert.equal(moveUsage, "Usage: /move <sessionSelector> <deckSelector>");

  const switchUsage = await executor.execute({ command: "switch", args: [], raw: "/switch" });
  assert.equal(switchUsage, "Usage: /switch <sessionSelector>");

  const swapUsage = await executor.execute({ command: "swap", args: ["1"], raw: "/swap 1" });
  assert.equal(swapUsage, "Usage: /swap <selectorA> <selectorB>");

  const noteUsage = await executor.execute({ command: "note", args: [], raw: "/note" });
  assert.equal(noteUsage, "No active session for /note.");

  const connectionUsage = await executor.execute({ command: "connection", args: ["wat"], raw: "/connection wat" });
  assert.equal(
    connectionUsage,
    "Usage: /connection list | /connection new <name> | /connection save <name> | /connection show <profile> | /connection apply <profile> | /connection duplicate <profile> <name> | /connection rename <profile> <name> | /connection delete <profile> | /connection draft show | /connection draft new [name] | /connection draft active | /connection draft set <json> | /connection draft save [name] | /connection draft reset"
  );

  const layoutUsage = await executor.execute({ command: "layout", args: ["wat"], raw: "/layout wat" });
  assert.equal(layoutUsage, "Usage: /layout list | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");

  const workspaceUsage = await executor.execute({ command: "workspace", args: ["wat"], raw: "/workspace wat" });
  assert.equal(
    workspaceUsage,
    "Usage: /workspace list | /workspace save <name> | /workspace show <preset> | /workspace apply <preset> | /workspace duplicate <preset> <name> | /workspace rename <preset> <name> | /workspace delete <preset> | /workspace group list | /workspace group save <name> | /workspace group apply <group> | /workspace group rename <group> <name> | /workspace group delete <group> | /workspace group clear"
  );

  const broadcastUsage = await executor.execute({ command: "broadcast", args: ["wat"], raw: "/broadcast wat" });
  assert.equal(broadcastUsage, "Usage: /broadcast status | /broadcast off | /broadcast group [group]");

  const shareUsage = await executor.execute({ command: "share", args: ["wat"], raw: "/share wat" });
  assert.equal(shareUsage, "Usage: /share list | /share session | /share deck [deckSelector] | /share revoke <shareId>");

  const replayUsage = await executor.execute({ command: "replay", args: [], raw: "/replay" });
  assert.equal(
    replayUsage,
    "Usage: /replay view | /replay export | /replay copy | /replay copy <sourceSelector> <sliceSelector> | /replay preview <sourceSelector> <sliceSelector> | /replay paste <sourceSelector> <targetSelector> <sliceSelector>"
  );

  const transferUsage = await executor.execute({ command: "transfer", args: [], raw: "/transfer" });
  assert.equal(transferUsage, "Usage: /transfer upload [path] | /transfer download <path>");

  const shareTopicHelp = await executor.execute({ command: "help", args: ["share"], raw: "/help share" });
  assert.match(shareTopicHelp, /^\/share$/m);
  assert.match(shareTopicHelp, /Subcommands: list session deck revoke/);

  const renameUsage = await executor.execute({ command: "rename", args: [], raw: "/rename" });
  assert.equal(renameUsage, "Usage: /rename <name>");

  const settingsUsage = await executor.execute({ command: "settings", args: [], raw: "/settings" });
  assert.equal(
    settingsUsage,
    "Usage: /settings show | /settings startup show | /settings startup cwd <path> | /settings startup command <text...> | /settings startup env <json> | /settings startup tags <tag[,tag...]> | /settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay> | /settings note show | /settings note set <text...> | /settings note clear | /settings theme show [active|inactive] | /settings theme preset <active|inactive> <theme> | /settings theme set <active|inactive> <key> <#rrggbb> | /settings theme reset <active|inactive> | /settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...> | /settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources> | /settings input-safety show | /settings input-safety set <field> <value> | /settings mouse-forwarding show | /settings mouse-forwarding set <off|application>"
  );

  const customShowUsage = await executor.execute({ command: "custom", args: ["show"], raw: "/custom show" });
  assert.equal(customShowUsage, "Usage: /custom show [scope:global|scope:project|scope:session:<selector>] <name>");

  const customPreviewUsage = await executor.execute({ command: "custom", args: ["preview"], raw: "/custom preview" });
  assert.equal(
    customPreviewUsage,
    "Usage: /custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]"
  );

  const runUsage = await executor.execute({ command: "run", args: [], raw: "/run" });
  assert.equal(runUsage, "Usage: /run + newline-separated slash commands | /cmd1 + newline + /cmd2");
});

test("command executor reports ambiguous switch targets and missing replay sources explicitly", async () => {
  const executor = createExecutor({
    store: {
      getState() {
        return {
          sessions: [
            { id: "s-1", deckId: "default", name: "one" },
            { id: "s-2", deckId: "default", name: "two" }
          ],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: ""
        };
      }
    },
    resolveTargetSelectors: () => ({
      sessions: [
        { id: "s-1", name: "one" },
        { id: "s-2", name: "two" }
      ],
      error: ""
    })
  });

  assert.equal(
    await executor.execute({ command: "switch", args: ["ops"], raw: "/switch ops" }),
    "Switch selector must resolve to exactly one session."
  );
  assert.equal(
    await executor.execute({ command: "replay", args: ["view"], raw: "/replay view" }),
    "No active session for /replay."
  );
});

test("command executor manages share links through shared runtime hooks", async () => {
  const createCalls = [];
  const revokeCalls = [];
  const clipboardWrites = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [
            { id: "s-1", deckId: "default", name: "one" },
            { id: "s-2", deckId: "ops", name: "two" }
          ],
          decks: [
            { id: "default", name: "Default" },
            { id: "ops", name: "Ops" }
          ],
          activeSessionId: "s-1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["share", "help"],
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: (session) => String(session?.deckId || "default"),
    formatSessionToken: (id) => (id === "s-1" ? "1" : id === "s-2" ? "2" : String(id || "")),
    formatSessionDisplayName: (session) => String(session?.name || ""),
    sortSessionsByQuickId: (sessions) => (Array.isArray(sessions) ? sessions.slice() : []),
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
    resolveTargetSelectors: (selector, sessions) => ({
      sessions: sessions.filter((session) => (selector === "2" ? session.id === "s-2" : false)),
      error: ""
    }),
    resolveDeckToken: (token, decks) => ({
      deck: decks.find((deck) => deck.id === token) || null,
      error: `Unknown deck: ${token}`
    }),
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
    listShares: async () => [
      {
        id: "share-1",
        targetType: "session",
        targetId: "s-1",
        permissionMode: "read_only",
        expiresAt: 1_700_000_000_000,
        revokedAt: null,
        active: true
      }
    ],
    createShareLink: async (payload) => {
      createCalls.push(payload);
      return {
        id: "share-2",
        targetType: payload.targetType,
        targetId: payload.targetId,
        permissionMode: "read_only",
        expiresAt: 1_700_000_000_000,
        revokedAt: null,
        active: true,
        joinUrl: "http://example.invalid/?share_token=abc"
      };
    },
    revokeShareLink: async (shareId) => {
      revokeCalls.push(shareId);
      return {
        id: shareId,
        targetType: "deck",
        targetId: "ops",
        permissionMode: "read_only",
        expiresAt: 1_700_000_000_000,
        revokedAt: 1_700_000_000_100,
        active: false
      };
    },
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    }
  });

  const listFeedback = await executor.execute({ command: "share", args: ["list"], raw: "/share list" });
  assert.match(listFeedback, /^\[share-1\] session \[1\] one · read_only · active · expires=/);

  const sessionFeedback = await executor.execute({ command: "share", args: ["session"], raw: "/share session" });
  assert.deepEqual(createCalls[0], {
    targetType: "session",
    targetId: "s-1",
    permissionMode: "read_only"
  });
  assert.deepEqual(clipboardWrites, ["http://example.invalid/?share_token=abc"]);
  assert.match(sessionFeedback, /^\[share-2\] session \[1\] one · read_only · active · expires=/);
  assert.match(sessionFeedback, /Copied join URL to clipboard\./);

  const deckFeedback = await executor.execute({ command: "share", args: ["deck"], raw: "/share deck" });
  assert.deepEqual(createCalls[1], {
    targetType: "deck",
    targetId: "ops",
    permissionMode: "read_only"
  });
  assert.match(deckFeedback, /^\[share-2\] deck \[ops\] Ops · read_only · active · expires=/);

  const revokeFeedback = await executor.execute({
    command: "share",
    args: ["revoke", "share-2"],
    raw: "/share revoke share-2"
  });
  assert.deepEqual(revokeCalls, ["share-2"]);
  assert.equal(
    revokeFeedback,
    "Revoked [share-2] deck [ops] Ops · read_only · revoked · expires=2023-11-14T22:13:20.000Z."
  );
});

test("command executor reports empty share lists explicitly", async () => {
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [{ id: "s-1", deckId: "default", name: "one" }],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s-1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["share", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: (session) => String(session?.deckId || "default"),
    formatSessionToken: () => "1",
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
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    listShares: async () => []
  });

  assert.equal(
    await executor.execute({ command: "share", args: ["list"], raw: "/share list" }),
    "No share links available."
  );
});

test("command executor resolves namespaced aliases through the canonical command path", async () => {
  const deckCalls = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [],
          decks: [
            { id: "default", name: "Default" },
            { id: "ops", name: "Ops" }
          ],
          activeSessionId: ""
        };
      },
      setActiveSession(sessionId) {
        deckCalls.push(["setActiveSession", sessionId]);
      }
    },
    api: {
      async createSession(payload) {
        return { id: "s-new", name: payload?.shell || "Session", deckId: "default" };
      }
    },
    systemSlashCommands: ["new", "deck", "close", "help", "run"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: (deckId) => {
      deckCalls.push(["setActiveDeck", deckId]);
      return true;
    },
    resolveSessionDeckId: () => "default",
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
    resolveDeckToken: (token, decks) => ({ deck: decks.find((deck) => deck.id === token) || null, error: `Unknown deck: ${token}` }),
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

  assert.equal(
    await executor.execute({ command: "deck.switch", args: ["ops"], raw: "/deck.switch ops" }),
    "Active deck: [ops] Ops."
  );
  assert.equal(
    await executor.execute({ command: "session.new", args: ["bash"], raw: "/session.new bash" }),
    "Created session [s-new] bash."
  );
  assert.equal(
    await executor.execute({ command: "session.close", args: [], raw: "/session.close" }),
    "No sessions available."
  );
  assert.deepEqual(deckCalls, [
    ["setActiveDeck", "ops"],
    ["setActiveSession", "s-new"]
  ]);
});

test("command executor manages layout profiles through shared runtime hooks", async () => {
  const calls = [];
  const profiles = [
    {
      id: "focus",
      name: "Focus Layout",
      layout: {
        activeDeckId: "default",
        sidebarVisible: true,
        sessionFilterText: "",
        deckTerminalSettings: {}
      }
    }
  ];
  const executor = createCommandExecutor({
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
    systemSlashCommands: ["layout", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
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
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    listLayoutProfiles: () => profiles,
    resolveLayoutProfile: (selector) =>
      selector === "focus" ? { profile: profiles[0], error: "" } : { profile: null, error: `Unknown layout profile: ${selector}` },
    createLayoutProfileFromCurrent: async (name) => {
      calls.push(["save", name]);
      return `Saved layout profile [focus] ${name}.`;
    },
    applyLayoutProfile: async (profileId) => {
      calls.push(["apply", profileId]);
      return `Applied layout profile [${profileId}] Focus Layout.`;
    },
    renameLayoutProfile: async (profileId, name) => {
      calls.push(["rename", profileId, name]);
      return `Renamed layout profile [${profileId}] to ${name}.`;
    },
    deleteLayoutProfile: async (profileId) => {
      calls.push(["delete", profileId]);
      return `Deleted layout profile [${profileId}] Focus Layout.`;
    }
  });

  assert.equal(
    await executor.execute({ command: "layout", args: ["list"], raw: "/layout list" }),
    "[focus] Focus Layout -> deck=default filter=\"\""
  );
  assert.equal(
    await executor.execute({ command: "layout", args: ["save", "Ops", "Layout"], raw: "/layout save Ops Layout" }),
    "Saved layout profile [focus] Ops Layout."
  );
  assert.equal(
    await executor.execute({ command: "layout", args: ["apply", "focus"], raw: "/layout apply focus" }),
    "Applied layout profile [focus] Focus Layout."
  );
  assert.equal(
    await executor.execute({ command: "layout", args: ["rename", "focus", "New", "Name"], raw: "/layout rename focus New Name" }),
    "Renamed layout profile [focus] to New Name."
  );
  assert.equal(
    await executor.execute({ command: "layout", args: ["delete", "focus"], raw: "/layout delete focus" }),
    "Deleted layout profile [focus] Focus Layout."
  );
  assert.deepEqual(calls, [
    ["save", "Ops Layout"],
    ["apply", "focus"],
    ["rename", "focus", "New Name"],
    ["delete", "focus"]
  ]);
});

test("command executor manages connection profiles through shared runtime hooks", async () => {
  const calls = [];
  let draftState = {
    mode: "profile",
    profileId: "ops",
    name: "Ops Shell",
    launch: {
      kind: "local",
      deckId: "ops",
      shell: "bash",
      startCwd: "/srv/ops",
      startCommand: "",
      env: {},
      tags: ["ops"],
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" }
    }
  };
  const sessions = [
    {
      id: "s1",
      name: "Ops Shell",
      deckId: "ops",
      shell: "bash",
      startCwd: "/srv/ops",
      cwd: "/srv/ops",
      startCommand: "tmux a || tmux",
      env: { LANG: "en_US.UTF-8" },
      tags: ["ops"],
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" }
    }
  ];
  const profiles = [
    {
      id: "ops",
      name: "Ops Shell",
      launch: {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: {},
        tags: ["ops"],
        activeThemeProfile: { background: "#111111" },
        inactiveThemeProfile: { background: "#222222" },
        remoteConnection: { host: "ops.example", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
      }
    }
  ];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions,
          decks: [{ id: "ops", name: "Ops" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["connection", "help"],
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    getSessionCountForDeck: () => sessions.length,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "ops",
    formatSessionToken: (id) => (id === "s1" ? "1" : String(id || "")),
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
    resolveTargetSelectors: (selector, availableSessions) => ({
      sessions: availableSessions.filter(
        (session) => session.id === selector || session.name.toLowerCase() === String(selector || "").toLowerCase()
      ),
      error: ""
    }),
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
    listConnectionProfiles: () => profiles,
    resolveConnectionProfile: (selector) =>
      selector === "ops" ? { profile: profiles[0], error: "" } : { profile: null, error: `Unknown connection profile: ${selector}` },
    createConnectionProfileFromSession: async (session, name) => {
      calls.push(["save", session.id, name]);
      return `Saved connection profile [ops] ${name} from [1] Ops Shell.`;
    },
    getConnectionProfileDraft: () => draftState,
    setConnectionProfileDraft: (nextDraft) => {
      draftState = { ...nextDraft };
      calls.push(["draft-set", draftState.name]);
      return draftState;
    },
    loadConnectionProfileDraftFromActive: (session) => {
      calls.push(["draft-active", session.id]);
      draftState = {
        mode: "session",
        profileId: "",
        name: `${session.name} Profile`,
        launch: {
          kind: "local",
          deckId: session.deckId,
          shell: session.shell,
          startCwd: session.startCwd,
          startCommand: session.startCommand,
          env: session.env,
          tags: session.tags,
          activeThemeProfile: session.activeThemeProfile,
          inactiveThemeProfile: session.inactiveThemeProfile
        }
      };
      return draftState;
    },
    saveConnectionProfileDraft: async () => {
      calls.push(["draft-save", draftState.name]);
      return `Saved connection profile [draft] ${draftState.name}.`;
    },
    resetConnectionProfileDraft: async () => {
      calls.push(["draft-reset"]);
      draftState = {
        mode: "profile",
        profileId: "ops",
        name: "Ops Shell",
        launch: profiles[0].launch
      };
      return "Reset the connection profile draft.";
    },
    applyConnectionProfile: async (profileId) => {
      calls.push(["apply", profileId]);
      return `Started session [8] Ops Shell from connection profile [${profileId}] Ops Shell.`;
    },
    duplicateConnectionProfile: async (profileId, name) => {
      calls.push(["duplicate", profileId, name]);
      return `Duplicated connection profile [${profileId}] Ops Shell as [copy] ${name}.`;
    },
    renameConnectionProfile: async (profileId, name) => {
      calls.push(["rename", profileId, name]);
      return `Renamed connection profile [${profileId}] to ${name}.`;
    },
    deleteConnectionProfile: async (profileId) => {
      calls.push(["delete", profileId]);
      return `Deleted connection profile [${profileId}] Ops Shell.`;
    }
  });

  assert.equal(
    await executor.execute({ command: "connection", args: ["list"], raw: "/connection list" }),
    "[ops] Ops Shell -> kind=ssh deck=ops shell=ssh target=ops@ops.example:22"
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["new", "Blank", "Shell"], raw: "/connection new Blank Shell" }),
    "Saved connection profile [draft] Blank Shell."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["save", "Ops", "Saved"], raw: "/connection save Ops Saved" }),
    "Saved connection profile [ops] Ops Saved from [1] Ops Shell."
  );
  assert.match(
    await executor.execute({ command: "connection", args: ["show", "ops"], raw: "/connection show ops" }),
    /\[ops\] Ops Shell/
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["apply", "ops"], raw: "/connection apply ops" }),
    "Started session [8] Ops Shell from connection profile [ops] Ops Shell."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["duplicate", "ops", "Ops", "Copy"], raw: "/connection duplicate ops Ops Copy" }),
    "Duplicated connection profile [ops] Ops Shell as [copy] Ops Copy."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["rename", "ops", "Prod", "Shell"], raw: "/connection rename ops Prod Shell" }),
    "Renamed connection profile [ops] to Prod Shell."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["delete", "ops"], raw: "/connection delete ops" }),
    "Deleted connection profile [ops] Ops Shell."
  );
  assert.match(
    await executor.execute({ command: "connection", args: ["draft", "show"], raw: "/connection draft show" }),
    /Connection profile draft/
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["draft", "active"], raw: "/connection draft active" }),
    "Loaded the active session into a new connection profile draft."
  );
  assert.equal(
    await executor.execute({
      command: "connection",
      args: [
        "draft",
        "set",
        "{\"kind\":\"local\",\"deckId\":\"ops\",\"shell\":\"bash\",\"startCwd\":\"/tmp\",\"startCommand\":\"\",\"env\":{},\"tags\":[],\"activeThemeProfile\":{\"background\":\"#111111\"},\"inactiveThemeProfile\":{\"background\":\"#222222\"}}"
      ],
      raw: "/connection draft set {\"kind\":\"local\",\"deckId\":\"ops\",\"shell\":\"bash\",\"startCwd\":\"/tmp\",\"startCommand\":\"\",\"env\":{},\"tags\":[],\"activeThemeProfile\":{\"background\":\"#111111\"},\"inactiveThemeProfile\":{\"background\":\"#222222\"}}"
    }),
    "Updated the connection profile draft."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["draft", "save", "Draft", "Shell"], raw: "/connection draft save Draft Shell" }),
    "Saved connection profile [draft] Draft Shell."
  );
  assert.equal(
    await executor.execute({ command: "connection", args: ["draft", "reset"], raw: "/connection draft reset" }),
    "Reset the connection profile draft."
  );
  assert.deepEqual(calls, [
    ["draft-set", "Blank Shell"],
    ["draft-save", "Blank Shell"],
    ["save", "s1", "Ops Saved"],
    ["apply", "ops"],
    ["duplicate", "ops", "Ops Copy"],
    ["rename", "ops", "Prod Shell"],
    ["delete", "ops"],
    ["draft-active", "s1"],
    ["draft-set", "Ops Shell Profile"],
    ["draft-set", "Draft Shell"],
    ["draft-save", "Draft Shell"],
    ["draft-reset"]
  ]);
});

test("command executor manages workspace presets through shared runtime hooks", async () => {
  const calls = [];
  const presets = [
    {
      id: "ops",
      name: "Ops Workspace",
      workspace: {
        activeDeckId: "default",
        layoutProfileId: "focus",
        deckGroups: {
          default: {
            activeGroupId: "ops",
            groups: [{ id: "ops", name: "Ops", sessionIds: ["s1"] }]
          }
        }
      }
    }
  ];
  const groups = [{ id: "ops", name: "Ops", sessionIds: ["s1"] }];
  const executor = createCommandExecutor({
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
    systemSlashCommands: ["workspace", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
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
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    listWorkspacePresets: () => presets,
    resolveWorkspacePreset: (selector) =>
      selector === "ops" ? { preset: presets[0], error: "" } : { preset: null, error: `Unknown workspace preset: ${selector}` },
    createWorkspacePresetFromCurrent: async (name) => {
      calls.push(["save", name]);
      return `Saved workspace preset [ops] ${name}.`;
    },
    duplicateWorkspacePreset: async (presetId, name) => {
      calls.push(["duplicate", presetId, name]);
      return `Duplicated workspace preset [${presetId}] Ops Workspace as [copy] ${name}.`;
    },
    applyWorkspacePreset: async (presetId) => {
      calls.push(["apply", presetId]);
      return `Applied workspace preset [${presetId}] Ops Workspace.`;
    },
    renameWorkspacePreset: async (presetId, name) => {
      calls.push(["rename", presetId, name]);
      return `Renamed workspace preset [${presetId}] to ${name}.`;
    },
    deleteWorkspacePreset: async (presetId) => {
      calls.push(["delete", presetId]);
      return `Deleted workspace preset [${presetId}] Ops Workspace.`;
    },
    listWorkspaceGroupsForDeck: () => groups,
    resolveWorkspaceGroup: (selector) =>
      selector === "ops" ? { group: groups[0], error: "" } : { group: null, error: `Unknown workspace group: ${selector}` },
    saveWorkspaceGroup: async (name, deckId) => {
      calls.push(["group-save", deckId, name]);
      return `Saved workspace group [ops] ${name} for deck [${deckId}].`;
    },
    applyWorkspaceGroup: async (groupId, deckId) => {
      calls.push(["group-apply", deckId, groupId]);
      return `Active workspace group for deck [${deckId}] is now [${groupId}].`;
    },
    renameWorkspaceGroup: async (groupId, name, deckId) => {
      calls.push(["group-rename", deckId, groupId, name]);
      return `Renamed workspace group [${groupId}] to ${name}.`;
    },
    deleteWorkspaceGroup: async (groupId, deckId) => {
      calls.push(["group-delete", deckId, groupId]);
      return `Deleted workspace group [${groupId}] Ops.`;
    },
    clearWorkspaceGroup: async (deckId) => {
      calls.push(["group-clear", deckId]);
      return `Cleared the active workspace group for deck [${deckId}].`;
    }
  });

  assert.equal(
    await executor.execute({ command: "workspace", args: ["list"], raw: "/workspace list" }),
    "[ops] Ops Workspace -> deck=default layout=focus decks=1"
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["save", "Ops", "Workspace"], raw: "/workspace save Ops Workspace" }),
    "Saved workspace preset [ops] Ops Workspace."
  );
  assert.match(
    await executor.execute({ command: "workspace", args: ["show", "ops"], raw: "/workspace show ops" }),
    /When applied, this preset opens deck \[default\]\./
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["apply", "ops"], raw: "/workspace apply ops" }),
    "Applied workspace preset [ops] Ops Workspace."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["duplicate", "ops", "Ops", "Copy"], raw: "/workspace duplicate ops Ops Copy" }),
    "Duplicated workspace preset [ops] Ops Workspace as [copy] Ops Copy."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["rename", "ops", "New", "Name"], raw: "/workspace rename ops New Name" }),
    "Renamed workspace preset [ops] to New Name."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["delete", "ops"], raw: "/workspace delete ops" }),
    "Deleted workspace preset [ops] Ops Workspace."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "list"], raw: "/workspace group list" }),
    "Deck [default] workspace groups:\n[ops] Ops -> 1 session(s)"
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "save", "Build"], raw: "/workspace group save Build" }),
    "Saved workspace group [ops] Build for deck [default]."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "apply", "ops"], raw: "/workspace group apply ops" }),
    "Active workspace group for deck [default] is now [ops]."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "rename", "ops", "Ops", "Main"], raw: "/workspace group rename ops Ops Main" }),
    "Renamed workspace group [ops] to Ops Main."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "delete", "ops"], raw: "/workspace group delete ops" }),
    "Deleted workspace group [ops] Ops."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["group", "clear"], raw: "/workspace group clear" }),
    "Cleared the active workspace group for deck [default]."
  );
  assert.deepEqual(calls, [
    ["save", "Ops Workspace"],
    ["apply", "ops"],
    ["duplicate", "ops", "Ops Copy"],
    ["rename", "ops", "New Name"],
    ["delete", "ops"],
    ["group-save", "default", "Build"],
    ["group-apply", "default", "ops"],
    ["group-rename", "default", "ops", "Ops Main"],
    ["group-delete", "default", "ops"],
    ["group-clear", "default"]
  ]);
});

test("command executor manages broadcast mode through shared runtime hooks", async () => {
  const calls = [];
  const executor = createCommandExecutor({
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
    systemSlashCommands: ["broadcast", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
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
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {},
    getBroadcastStatus: () => "Broadcast: off.",
    enableGroupBroadcast: async (selector) => {
      calls.push(["group", selector]);
      return "Broadcasting to workspace group [build] Build on deck [ops].";
    },
    disableBroadcast: async () => {
      calls.push(["off"]);
      return "Broadcast mode disabled.";
    }
  });

  assert.equal(await executor.execute({ command: "broadcast", args: [], raw: "/broadcast" }), "Broadcast: off.");
  assert.equal(
    await executor.execute({ command: "broadcast", args: ["group", "build"], raw: "/broadcast group build" }),
    "Broadcasting to workspace group [build] Build on deck [ops]."
  );
  assert.equal(await executor.execute({ command: "broadcast", args: ["off"], raw: "/broadcast off" }), "Broadcast mode disabled.");
  assert.deepEqual(calls, [
    ["group", "build"],
    ["off"]
  ]);
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
    args: ["needs", "review"],
    raw: "/note needs review"
  });
  assert.equal(setFeedback, "Updated note for [7] one.");

  const clearFeedback = await executor.execute({
    command: "note",
    args: [],
    raw: "/note"
  });
  assert.equal(clearFeedback, "Cleared note for [7] one.");

  assert.deepEqual(calls, [
    ["patch", "s1", "needs review"],
    ["event", "session.updated", "s1", "needs review"],
    ["patch", "s1", ""],
    ["event", "session.updated", "s1", ""]
  ]);
});

test("command executor accepts direct-targeted note commands without selector args", async () => {
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
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload.note]);
        return { ...sessions.find((session) => session.id === sessionId), note: payload.note };
      }
    },
    systemSlashCommands: ["note", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.id, event.session.note]),
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

  const feedback = await executor.execute({
    command: "note",
    args: ["needs", "review"],
    raw: "/note needs review",
    targetSelector: "8"
  });

  assert.equal(feedback, "Updated note for [8] two.");
  assert.deepEqual(calls, [
    ["patch", "s2", "needs review"],
    ["event", "session.updated", "s2", "needs review"]
  ]);
});

test("command executor swaps quick ids through the backend contract and requests a rerender", async () => {
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
    api: {
      async swapSessionQuickIds(leftId, rightId) {
        calls.push(["api-swap", leftId, rightId]);
        return {
          leftSession: { ...sessions[0], quickIdToken: "8" },
          rightSession: { ...sessions[1], quickIdToken: "7" }
        };
      }
    },
    systemSlashCommands: ["swap", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.id, event.session.quickIdToken]),
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s1" ? "7" : id === "s2" ? "8" : id),
    formatSessionDisplayName: (session) => session.name,
    sortSessionsByQuickId: (list) => list.slice().sort((left, right) => (left.id === "s2" ? -1 : right.id === "s2" ? 1 : 0)),
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
    ["api-swap", "s1", "s2"],
    ["event", "session.updated", "s1", "8"],
    ["event", "session.updated", "s2", "7"],
    ["render"]
  ]);
});

test("command executor uses quick-id order for list and next navigation", async () => {
  const activeSessionState = { value: "s1" };
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
          activeSessionId: activeSessionState.value
        };
      },
      setActiveSession(sessionId) {
        activeSessionState.value = sessionId;
      }
    },
    api: {},
    systemSlashCommands: ["list", "next", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s1" ? "2" : id === "s2" ? "1" : id),
    formatSessionDisplayName: (session) => session.name,
    sortSessionsByQuickId: (list) => list.slice().sort((left, right) => (left.id === "s2" ? -1 : right.id === "s2" ? 1 : 0)),
    swapSessionTokens: () => false,
    getSessionRuntimeState: () => "inactive",
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

  const listText = await executor.execute({ command: "list", args: [], raw: "/list" });
  assert.match(listText, /^\s+\[1\] two/m);
  assert.match(listText, /^\* \[2\] one/m);

  const nextText = await executor.execute({ command: "next", args: [], raw: "/next" });
  assert.equal(nextText, "Active session: [1] two.");
  assert.equal(activeSessionState.value, "s2");
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

  const feedback = await executor.execute({ command: "replay", args: ["view"], raw: "/replay view", targetSelector: "8" });

  assert.equal(feedback, "Opened replay viewer for [8] two.");
  assert.deepEqual(calls, [["view", "s2"]]);
});

test("command executor uploads a picked file to the active session by default", async () => {
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
    systemSlashCommands: ["transfer", "help"],
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
    uploadSessionFile: async (currentSession, options) => {
      calls.push(["upload", currentSession.id, options]);
      return {
        feedback: "Uploaded logs/output.txt to [7] one (7 bytes)."
      };
    }
  });

  const feedback = await executor.execute({ command: "transfer", args: ["upload", "logs/output.txt"], raw: "/transfer upload logs/output.txt" });

  assert.equal(feedback, "Uploaded logs/output.txt to [7] one (7 bytes).");
  assert.deepEqual(calls, [["upload", "s1", { remotePath: "logs/output.txt" }]]);
});

test("command executor downloads a file for an explicitly selected session", async () => {
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
    systemSlashCommands: ["transfer", "help"],
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
    downloadSessionFile: async (currentSession, options) => {
      calls.push(["download", currentSession.id, options]);
      return {
        feedback: "Downloaded logs/output.txt from [8] two (7 bytes)."
      };
    }
  });

  const feedback = await executor.execute({
    command: "transfer",
    args: ["download", "logs/output.txt"],
    raw: "/transfer download logs/output.txt",
    targetSelector: "8"
  });

  assert.equal(feedback, "Downloaded logs/output.txt from [8] two (7 bytes).");
  assert.deepEqual(calls, [["download", "s2", { remotePath: "logs/output.txt" }]]);
});

test("command executor opens the replay viewer for a direct-targeted session without selector args", async () => {
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

  const feedback = await executor.execute({
    command: "replay",
    args: ["view"],
    raw: "/replay view",
    targetSelector: "8"
  });

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

  const feedback = await executor.execute({
    command: "replay",
    args: ["copy"],
    raw: "/replay copy",
    targetSelector: "8"
  });

  assert.equal(feedback, "Copied replay tail for [8] two (0 chars retained).");
  assert.deepEqual(calls, [["copy", "s2"]]);
});

test("command executor previews normalized replay excerpts for an explicitly selected session", async () => {
  const excerptCalls = [];
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
    requestRender: () => {},
    loadSessionReplayExcerpt: async (session, selector) => {
      excerptCalls.push([session.id, selector]);
      return {
        selector,
        selectorKind: "lines",
        resolvedCount: 20,
        availableCount: 20,
        selectorSatisfied: true,
        chars: 120,
        lines: 20,
        data: "line one\nline two\n"
      };
    },
    previewSessionReplayExcerpt: (session, payload) =>
      `Preview from [8] ${session.name} (${payload.selector} -> ${payload.resolvedCount}/${payload.availableCount} units, ${payload.chars} chars, ${payload.lines} lines).\n\n${payload.data}`
  });

  const feedback = await executor.execute({
    command: "replay",
    args: ["preview", "8", "l:20"],
    raw: "/replay preview 8 l:20"
  });

  assert.equal(
    feedback,
    "Preview from [8] two (l:20 -> 20/20 units, 120 chars, 20 lines).\n\nline one\nline two\n"
  );
  assert.deepEqual(excerptCalls, [["s2", "l:20"]]);
});

test("command executor copies normalized replay excerpts for an explicitly selected session", async () => {
  const excerptCalls = [];
  const copyCalls = [];
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
    requestRender: () => {},
    loadSessionReplayExcerpt: async (session, selector) => {
      excerptCalls.push([session.id, selector]);
      return {
        selector,
        selectorKind: "chars",
        resolvedCount: 500,
        availableCount: 500,
        selectorSatisfied: true,
        chars: 500,
        lines: 10,
        data: "excerpt"
      };
    },
    copySessionReplayExcerpt: async (session, selector, options) => {
      copyCalls.push([session.id, selector, options.payload.data]);
      return {
        feedback: "Copied replay excerpt from [8] two (c:500 -> 500/500 units, 500 chars, 10 lines)."
      };
    }
  });

  const feedback = await executor.execute({
    command: "replay",
    args: ["copy", "8", "c:500"],
    raw: "/replay copy 8 c:500"
  });

  assert.equal(feedback, "Copied replay excerpt from [8] two (c:500 -> 500/500 units, 500 chars, 10 lines).");
  assert.deepEqual(excerptCalls, [["s2", "c:500"]]);
  assert.deepEqual(copyCalls, [["s2", "c:500", "excerpt"]]);
});

test("command executor pastes replay excerpts through the terminal paste path", async () => {
  const excerptCalls = [];
  const pasteCalls = [];
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
    requestRender: () => {},
    loadSessionReplayExcerpt: async (session, selector) => {
      excerptCalls.push([session.id, selector]);
      return {
        selector,
        selectorKind: "shell_blocks",
        resolvedCount: 2,
        availableCount: 2,
        selectorSatisfied: true,
        chars: 44,
        lines: 6,
        data: "prompt\noutput\n"
      };
    },
    submitTerminalPaste: async (sessionId, text, runtimeOptions) => {
      pasteCalls.push([sessionId, text, runtimeOptions]);
      return { ok: true, status: "sent", feedback: "" };
    }
  });

  const feedback = await executor.execute({
    command: "replay",
    args: ["paste", "8", "7", "sp:2"],
    raw: "/replay paste 8 7 sp:2"
  });

  assert.equal(
    feedback,
    "Pasted replay excerpt sp:2 -> 2/2 units, 44 chars, 6 lines from [8] two to [7] one."
  );
  assert.deepEqual(excerptCalls, [["s2", "sp:2"]]);
  assert.deepEqual(pasteCalls, [["s1", "prompt\noutput\n", { source: "replay-paste", activateTargetBeforeSend: true }]]);
});

test("command executor routes the ccp alias through replay paste and preserves blocked feedback", async () => {
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
    requestRender: () => {},
    loadSessionReplayExcerpt: async () => ({
      selector: "l:20",
      selectorKind: "lines",
      resolvedCount: 20,
      availableCount: 20,
      selectorSatisfied: true,
      chars: 120,
      lines: 20,
      data: "line one\nline two\n"
    }),
    submitTerminalPaste: async () => ({
      ok: false,
      status: "blocked",
      feedback: "This session is currently controlled by another client."
    })
  });

  const feedback = await executor.execute({
    command: "ccp",
    args: ["8", "7", "l:20"],
    raw: "/ccp 8 7 l:20"
  });

  assert.equal(feedback, "This session is currently controlled by another client.");
});

test("command executor reports unavailable replay paste paths directly", async () => {
  const sessions = [
    { id: "s1", name: "source", deckId: "default" },
    { id: "s2", name: "target", deckId: "default" }
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
    getSessionCountForDeck: () => sessions.length,
    applyRuntimeEvent: () => {},
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
    resolveTargetSelectors: (selector) => ({
      sessions: sessions.filter((session) => selector === "7" ? session.id === "s1" : session.id === "s2"),
      error: ""
    }),
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
    loadSessionReplayExcerpt: async () => ({
      data: "build output",
      selector: "l:20",
      selectorKind: "lines",
      resolvedCount: 20,
      availableCount: 20,
      selectorSatisfied: true,
      chars: 12,
      lines: 1,
      meta: { truncated: false }
    })
  });

  assert.equal(
    await executor.execute({ command: "replay", args: ["paste", "7", "8", "l:20"], raw: "/replay paste 7 8 l:20" }),
    "Replay paste path is unavailable."
  );
});

test("command executor applies explicit input safety profiles through settings payloads", async () => {
  const calls = [];
  const sessions = [{ id: "s1", name: "one", deckId: "default" }];
  const requestedProfile = {
    confirmOnAnyInput: true,
    requireValidShellSyntax: true,
    confirmOnIncompleteShellConstruct: true,
    confirmOnNaturalLanguageInput: true,
    confirmOnDangerousShellCommand: true
  };
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
    parseSettingsPayload: () => ({ ok: true, payload: { inputSafetyProfile: requestedProfile } }),
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
    args: ["apply", "{\"inputSafetyProfile\":{\"requireValidShellSyntax\":true}}"],
    raw: "/settings apply {\"inputSafetyProfile\":{\"requireValidShellSyntax\":true}}"
  });

  assert.equal(feedback, "Applied settings to [7] one: inputSafetyProfile.");
  assert.deepEqual(calls, [
    [
      "patch",
      "s1",
      {
        confirmOnAnyInput: true,
        requireValidShellSyntax: true,
        confirmOnIncompleteShellConstruct: true,
        confirmOnNaturalLanguageInput: true,
        confirmOnDangerousShellCommand: true,
        confirmOnMultilineInput: false,
        autoContinueStalledPaste: false,
        confirmOnRecentTargetSwitch: false,
        targetSwitchGraceMs: 4000,
        pasteLengthConfirmThreshold: 400,
        pasteLineConfirmThreshold: 5
      }
    ],
    [
      "event",
      "session.updated",
      {
        confirmOnAnyInput: true,
        requireValidShellSyntax: true,
        confirmOnIncompleteShellConstruct: true,
        confirmOnNaturalLanguageInput: true,
        confirmOnDangerousShellCommand: true,
        confirmOnMultilineInput: false,
        autoContinueStalledPaste: false,
        confirmOnRecentTargetSwitch: false,
        targetSwitchGraceMs: 4000,
        pasteLengthConfirmThreshold: 400,
        pasteLineConfirmThreshold: 5
      }
    ]
  ]);
});

test("command executor applies typed settings to a direct-targeted session without selector args", async () => {
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
        calls.push(["patch", sessionId, payload.tags]);
        return { ...sessions[0], ...payload };
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.tags]),
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
    resolveTargetSelectors: (selector) => (selector === "7" ? { sessions, error: "" } : { sessions: [], error: `Unknown session identifier: ${selector}` }),
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
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
    args: ["startup", "tags", "ops"],
    raw: "/settings startup tags ops",
    targetSelector: "7"
  });

  assert.equal(feedback, "Applied settings to [7] one: tags.");
  assert.deepEqual(calls, [
    ["patch", "s1", ["ops"]],
    ["event", "session.updated", ["ops"]]
  ]);
});

test("command executor applies typed theme, mouse forwarding, and input safety settings", async () => {
  const calls = [];
  const sessions = [
    {
      id: "s1",
      name: "one",
      deckId: "default",
      activeThemeProfile: { background: "#000000", foreground: "#ffffff" },
      inactiveThemeProfile: { background: "#111111", foreground: "#dddddd" },
      mouseForwardingMode: "off",
      inputSafetyProfile: {}
    }
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
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload]);
        sessions[0] = { ...sessions[0], ...payload };
        return sessions[0];
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session]),
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
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    themeProfileKeys: ["background", "foreground"],
    defaultTerminalTheme: { background: "#000000", foreground: "#ffffff" },
    terminalThemePresets: [
      {
        id: "night",
        name: "Night",
        profile: { background: "#222222", foreground: "#eeeeee" }
      }
    ],
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => ({
      background: profile?.background || "#000000",
      foreground: profile?.foreground || "#ffffff"
    }),
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });

  assert.equal(
    await executor.execute({ command: "settings", args: ["theme", "preset", "active", "night"], raw: "/settings theme preset active night" }),
    "Applied settings to [7] one: activeThemeProfile."
  );
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["mouse-forwarding", "set", "application"],
      raw: "/settings mouse-forwarding set application"
    }),
    "Applied settings to [7] one: mouseForwardingMode."
  );
  assert.equal(
    await executor.execute({ command: "settings", args: ["input-safety", "set", "syntax", "on"], raw: "/settings input-safety set syntax on" }),
    "Applied settings to [7] one: inputSafetyProfile.requireValidShellSyntax."
  );
  assert.deepEqual(calls[0], [
    "patch",
    "s1",
    {
      activeThemeProfile: { background: "#222222", foreground: "#eeeeee" }
    }
  ]);
  assert.deepEqual(calls[2], [
    "patch",
    "s1",
    {
      mouseForwardingMode: "application"
    }
  ]);
  assert.equal(calls[4][0], "patch");
  assert.equal(calls[4][1], "s1");
  assert.equal(calls[4][2].inputSafetyProfile.requireValidShellSyntax, true);
});

test("command executor imports and exports external theme formats through settings theme", async () => {
  const calls = [];
  const themeKeys = ["background", "foreground", "cursor", "magenta", "brightMagenta"];
  const defaultTheme = {
    background: "#000000",
    foreground: "#ffffff",
    cursor: "#00ff00",
    magenta: "#111111",
    brightMagenta: "#222222"
  };
  const sessions = [
    {
      id: "s1",
      name: "one",
      deckId: "default",
      activeThemeProfile: defaultTheme,
      inactiveThemeProfile: {
        ...defaultTheme,
        background: "#101010"
      }
    }
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
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload]);
        sessions[0] = { ...sessions[0], ...payload };
        return sessions[0];
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.activeThemeProfile]),
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
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    themeProfileKeys: themeKeys,
    defaultTerminalTheme: defaultTheme,
    terminalThemePresets: [],
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => {
      const source = profile || {};
      return Object.fromEntries(themeKeys.map((key) => [key, source[key] || defaultTheme[key]]));
    },
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });

  const importPayload = JSON.stringify({
    background: "#010203",
    foreground: "#fefefe",
    cursorColor: "#123456",
    purple: "#445566",
    brightPurple: "#778899"
  });
  const importFeedback = await executor.execute({
    command: "settings",
    args: ["theme", "import", "active", "windows-terminal", importPayload],
    raw: `/settings theme import active windows-terminal ${importPayload}`
  });
  const exported = await executor.execute({
    command: "settings",
    args: ["theme", "export", "active", "xresources"],
    raw: "/settings theme export active xresources"
  });

  assert.equal(importFeedback, "Imported windows-terminal theme into [7] one: activeThemeProfile.");
  assert.deepEqual(calls[0], [
    "patch",
    "s1",
    {
      activeThemeProfile: {
        background: "#010203",
        foreground: "#fefefe",
        cursor: "#123456",
        magenta: "#445566",
        brightMagenta: "#778899"
      }
    }
  ]);
  assert.match(exported, /\*\.background: #010203/);
  assert.match(exported, /\*\.cursorColor: #123456/);
  assert.match(exported, /\*\.color13: #778899/);
});

test("command executor rejects invalid typed input safety values", async () => {
  const sessions = [{ id: "s1", name: "one", deckId: "default", inputSafetyProfile: {} }];
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
      async updateSession() {
        throw new Error("Invalid input safety values should not patch sessions.");
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
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

  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["input-safety", "set", "syntax", "maybe"],
      raw: "/settings input-safety set syntax maybe"
    }),
    "Invalid boolean value: maybe"
  );
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["input-safety", "set", "paste-lines", "-1"],
      raw: "/settings input-safety set paste-lines -1"
    }),
    "Invalid numeric value: -1"
  );
});

test("command executor rejects malformed settings payloads and suppresses mutation side effects", async () => {
  const sessions = [{ id: "s1", name: "one", deckId: "default" }];
  let updateCalls = 0;
  let runtimeEvents = 0;
  let parsedSettingsPayload = { ok: false, error: "bad json" };
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
      async updateSession() {
        updateCalls += 1;
        return sessions[0];
      }
    },
    systemSlashCommands: ["settings", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {
      runtimeEvents += 1;
    },
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
    parseSettingsPayload: () => parsedSettingsPayload,
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

  await assert.rejects(
    executor.execute({
      command: "settings",
      args: ["startup", "env", "{"],
      raw: "/settings startup env {"
    }),
    /Startup env JSON is invalid:/
  );
  await assert.rejects(
    executor.execute({
      command: "settings",
      args: ["startup", "env", "[]"],
      raw: "/settings startup env []"
    }),
    /Startup env JSON must be an object\./
  );

  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["apply", "{}"],
      raw: "/settings apply {}"
    }),
    "bad json"
  );

  parsedSettingsPayload = { ok: true, payload: { unsupported: true } };
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["apply", "{\"unsupported\":true}"],
      raw: "/settings apply {\"unsupported\":true}"
    }),
    "Unknown settings key(s): unsupported"
  );

  parsedSettingsPayload = { ok: true, payload: {} };
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["apply", "{}"],
      raw: "/settings apply {}"
    }),
    "No applicable settings keys in payload."
  );

  parsedSettingsPayload = { ok: true, payload: { sendTerminator: "weird" } };
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["apply", "{\"sendTerminator\":\"weird\"}"],
      raw: "/settings apply {\"sendTerminator\":\"weird\"}"
    }),
    "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay."
  );

  assert.equal(updateCalls, 0);
  assert.equal(runtimeEvents, 0);
});

test("command executor surfaces theme validation and template custom preview failure branches", async () => {
  const sessions = [{ id: "s1", name: "one", deckId: "default", cwd: "/srv/one", activeThemeProfile: {}, inactiveThemeProfile: {} }];
  const templateCommand = {
    name: "deploy",
    content: "echo {{param:env}} from {{var:session.cwd}}",
    kind: "template",
    templateVariables: ["session.cwd"],
    scope: "project"
  };
  let updateCalls = 0;
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
      async updateSession() {
        updateCalls += 1;
        return sessions[0];
      }
    },
    systemSlashCommands: ["settings", "custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: () => "7",
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [templateCommand],
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) =>
      selector === "unknown"
        ? { sessions: [], error: "Unknown session identifier: unknown" }
        : { sessions, error: "" },
    resolveDeckToken: () => ({ deck: null, error: "unknown deck" }),
    parseSizeCommandArgs: () => ({ ok: false, error: "bad size" }),
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: () => {},
    parseSettingsPayload: () => ({ ok: false, error: "bad json" }),
    normalizeSendTerminatorMode: () => "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    themeProfileKeys: ["background", "foreground"],
    defaultTerminalTheme: { background: "#000000", foreground: "#ffffff" },
    terminalThemePresets: [
      { id: "night", name: "Night", profile: { background: "#111111", foreground: "#eeeeee" } },
      { id: "nimbus", name: "Nimbus", profile: { background: "#222222", foreground: "#dddddd" } }
    ],
    sendInputWithConfiguredTerminator: async () => {},
    recordCommandSubmission: () => null,
    normalizeCustomCommandPayloadForShell: (value) => value,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 }),
    requestRender: () => {}
  });

  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["theme", "preset", "active", "ni"],
      raw: "/settings theme preset active ni"
    }),
    "Ambiguous theme preset: ni"
  );
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["theme", "preset", "active", "dusk"],
      raw: "/settings theme preset active dusk"
    }),
    "Unknown theme preset: dusk"
  );
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["theme", "set", "active", "mystery", "#010203"],
      raw: "/settings theme set active mystery #010203"
    }),
    "Unknown theme key: mystery"
  );
  assert.equal(
    await executor.execute({
      command: "settings",
      args: ["theme", "set", "active", "bg", "blue"],
      raw: "/settings theme set active bg blue"
    }),
    "Theme value must be a #rrggbb color."
  );

  const showFeedback = await executor.execute({
    command: "custom",
    args: ["show", "deploy"],
    raw: "/custom show deploy"
  });
  assert.match(showFeedback, /^\/deploy$/m);
  assert.match(showFeedback, /^kind: template$/m);
  assert.match(showFeedback, /parameters: env/);
  assert.match(showFeedback, /templateVariables: session\.cwd/);

  assert.match(
    await executor.execute({
      command: "custom",
      args: ["preview", "deploy"],
      raw: "/custom preview deploy"
    }),
    /Missing template parameter\(s\) for \/deploy: env\./
  );
  assert.equal(
    await executor.execute({
      command: "custom",
      args: ["preview", "deploy", "env=prod", "--", "unknown"],
      raw: "/custom preview deploy env=prod -- unknown"
    }),
    "Unknown session identifier: unknown"
  );
  assert.equal(
    await executor.execute({
      command: "custom",
      args: ["preview", "missing"],
      raw: "/custom preview missing"
    }),
    "Custom command not found: /missing"
  );
  assert.equal(updateCalls, 0);
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
    listCustomCommandState: () => [{ name: "go", content: "echo hi", kind: "plain", templateVariables: [] }],
    getCustomCommandState: () => ({ name: "go", content: "echo hi", kind: "plain", templateVariables: [] }),
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

test("command executor builds server-backed quick-send usage metadata when executing custom commands", async () => {
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
    listCustomCommandState: () => [{ name: "go", content: "echo hi", kind: "plain", scope: "project", templateVariables: [] }],
    getCustomCommandState: () => ({ name: "go", content: "echo hi", kind: "plain", scope: "project", templateVariables: [] }),
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
    sendInputWithConfiguredTerminator: async () => {},
    buildCustomCommandUsageApiOptions: (command) => {
      calls.push(["usage-options", command.name, command.scope]);
      return { customCommandUsage: { lookupKey: `${command.scope}::${command.name}` } };
    },
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.commandName, submission.label]);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const feedback = await executor.execute({ command: "go", args: [], raw: "/go" });

  assert.equal(feedback, "Executed /go on [s1].");
  assert.deepEqual(calls, [
    ["usage-options", "go", "project"],
    ["record", "s1", "go", "/go"]
  ]);
});

test("command executor previews and executes template custom commands with parameter assignments", async () => {
  const calls = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [{ id: "s1", name: "one", deckId: "default", cwd: "/srv/one" }],
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
    listCustomCommandState: () => [
      {
        name: "deploy",
        content: "echo {{param:env}} from {{var:session.cwd}}",
        kind: "template",
        templateVariables: ["session.cwd"]
      }
    ],
    getCustomCommandState: () => ({
      name: "deploy",
      content: "echo {{param:env}} from {{var:session.cwd}}",
      kind: "template",
      templateVariables: ["session.cwd"]
    }),
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
      calls.push(["record", sessionId, submission.commandName, submission.text]);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const preview = await executor.execute({
    command: "custom",
    args: ["preview", "deploy", "env=prod"],
    raw: "/custom preview deploy env=prod"
  });
  assert.equal(preview, "/deploy · project -> [s1] one\n---\necho prod from /srv/one\n---");

  const feedback = await executor.execute({
    command: "deploy",
    args: ["env=prod"],
    raw: "/deploy env=prod"
  });

  assert.equal(feedback, "Executed /deploy on [s1].");
  assert.deepEqual(calls, [
    ["send", "s1", "echo prod from /srv/one\n"],
    ["record", "s1", "deploy", "echo prod from /srv/one\n"]
  ]);
});

test("command executor resolves scoped custom commands by session precedence", async () => {
  const calls = [];
  const commands = [
    { name: "deploy", content: "echo global", scope: "global", kind: "plain" },
    { name: "deploy", content: "echo project", scope: "project", kind: "plain" },
    { name: "deploy", content: "echo session one", scope: "session", sessionId: "s1", kind: "plain" },
    { name: "deploy", content: "echo session two", scope: "session", sessionId: "s2", kind: "plain" }
  ];
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
    api: { sendInput() {} },
    systemSlashCommands: ["custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 2,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: (id) => (id === "s1" ? "1" : "2"),
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => commands,
    getCustomCommandState: () => null,
    removeCustomCommandState: () => false,
    parseCustomDefinition: () => ({ ok: false, error: "unsupported" }),
    upsertCustomCommandState: () => null,
    resolveTargetSelectors: (selector) => {
      if (selector === "2") {
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
    normalizeSendTerminatorMode: () => "crlf",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "CRLF",
    sendInputWithConfiguredTerminator: async (_sendInput, sessionId, payload) => {
      calls.push(["send", sessionId, payload]);
    },
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.commandName, submission.label, submission.text]);
    },
    normalizeCustomCommandPayloadForShell: (value) => `${value}\n`,
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    normalizeThemeProfile: (profile) => profile || {},
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const feedbackActive = await executor.execute({ command: "deploy", args: [], raw: "/deploy" });
  const feedbackOther = await executor.execute({ command: "deploy", args: ["2"], raw: "/deploy 2" });

  assert.equal(feedbackActive, "Executed /deploy on [1].");
  assert.equal(feedbackOther, "Executed /deploy on [2].");
  assert.deepEqual(calls, [
    ["send", "s1", "echo session one\n"],
    ["record", "s1", "deploy", "/deploy", "echo session one\n"],
    ["send", "s2", "echo session two\n"],
    ["record", "s2", "deploy", "/deploy", "echo session two\n"]
  ]);
});

test("command executor requires explicit scope when removing an ambiguous scoped custom command", async () => {
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [{ id: "s1", name: "one", deckId: "default" }],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {},
    systemSlashCommands: ["custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [
      { name: "deploy", content: "echo global", scope: "global", kind: "plain" },
      { name: "deploy", content: "echo project", scope: "project", kind: "plain" }
    ],
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
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const feedback = await executor.execute({
    command: "custom",
    args: ["remove", "deploy"],
    raw: "/custom remove deploy"
  });

  assert.equal(feedback, "Multiple scoped custom commands share /deploy. Use scope:global, scope:project, or scope:session:<selector>.");
});

test("command executor exposes structured detailed results for success and failure paths", async () => {
  const executor = createExecutor();

  assert.deepEqual(
    await executor.executeDetailed({ command: "help", args: [], raw: "/help" }),
    {
      ok: true,
      feedback:
        "Commands: @ > / broadcast close connection custom deck filter help layout list move new next note prev rename replay restart run settings share size swap switch transfer workspace"
    }
  );

  assert.deepEqual(
    await executor.executeDetailed({ command: "unknown", args: [], raw: "/unknown" }),
    {
      ok: false,
      feedback: "Unknown command: /unknown"
    }
  );
});

test("command executor returns retry guidance for non-empty deck deletion and emits deck-deleted events on forced success", async () => {
  const events = [];
  let deleteCalls = 0;
  const executor = createExecutor({
    store: {
      getState() {
        return {
          sessions: [],
          decks: [
            { id: "default", name: "Default" },
            { id: "ops", name: "Ops" }
          ],
          activeSessionId: ""
        };
      }
    },
    api: {
      async deleteDeck(deckId, options = {}) {
        deleteCalls += 1;
        assert.equal(deckId, "ops");
        if (options.force !== true) {
          const error = new Error("conflict");
          error.status = 409;
          throw error;
        }
      }
    },
    defaultDeckId: "default",
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    applyRuntimeEvent: (event, runtimeOptions) => events.push([event, runtimeOptions]),
    resolveDeckToken: (token, decks) => ({
      deck: decks.find((deck) => deck.id === token) || null,
      error: `Unknown deck: ${token}`
    })
  });

  const retryFeedback = await executor.execute({
    command: "deck",
    args: ["delete"],
    raw: "/deck delete"
  });
  const successFeedback = await executor.execute({
    command: "deck",
    args: ["delete", "ops", "force"],
    raw: "/deck delete ops force"
  });

  assert.equal(retryFeedback, "Deck 'Ops' is not empty. Retry with '/deck delete ops force'.");
  assert.equal(successFeedback, "Deleted deck [ops] Ops.");
  assert.equal(deleteCalls, 2);
  assert.deepEqual(events, [
    [
      {
        type: "deck.deleted",
        deckId: "ops",
        fallbackDeckId: "default"
      },
      { preferredActiveDeckId: "default" }
    ]
  ]);
});

test("command executor surfaces missing scoped custom commands cleanly when custom removal receives a 404", async () => {
  const removedCommands = [];
  const executor = createCommandExecutor({
    store: {
      getState() {
        return {
          sessions: [{ id: "s1", name: "one", deckId: "default" }],
          decks: [{ id: "default", name: "Default" }],
          activeSessionId: "s1"
        };
      }
    },
    api: {
      async deleteCustomCommand() {
        const error = new Error("missing");
        error.status = 404;
        throw error;
      }
    },
    systemSlashCommands: ["custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 1,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: () => "default",
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    getSessionRuntimeState: () => ({}),
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    listCustomCommandState: () => [
      { name: "deploy", content: "echo project", scope: "project", kind: "plain" }
    ],
    getCustomCommandState: () => null,
    removeCustomCommandState: (command) => removedCommands.push(command),
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
    getTerminalSettings: () => ({ cols: 80, rows: 20 })
  });

  const feedback = await executor.execute({
    command: "custom",
    args: ["remove", "scope:project", "deploy"],
    raw: "/custom remove scope:project deploy"
  });

  assert.equal(feedback, "Custom command not found: /deploy");
  assert.deepEqual(removedCommands, []);
});
