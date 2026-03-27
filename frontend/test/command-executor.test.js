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
    systemSlashCommands: ["new", "deck", "move", "size", "filter", "close", "switch", "swap", "next", "prev", "list", "rename", "restart", "note", "layout", "workspace", "broadcast", "replay", "settings", "custom", "help"],
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyRuntimeEvent: () => {},
    setActiveDeck: () => true,
    resolveSessionDeckId: (session) => String(session?.deckId || "default"),
    formatSessionToken: (id) => String(id || ""),
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
    listWorkspacePresets: () => [],
    resolveWorkspacePreset: () => ({ preset: null, error: "Unknown workspace preset." }),
    createWorkspacePresetFromCurrent: async () => "",
    applyWorkspacePreset: async () => "",
    renameWorkspacePreset: async () => "",
    deleteWorkspacePreset: async () => "",
    getBroadcastStatus: () => "Broadcast: off.",
    enableGroupBroadcast: async () => "",
    disableBroadcast: async () => "Broadcast mode disabled."
  });
}

test("command executor help and usage strings derive from declarative schema metadata", async () => {
  const executor = createExecutor();

  const helpText = await executor.execute({ command: "help", args: [], raw: "/help" });
  assert.equal(
    helpText,
    "Commands: @ > / new deck move size filter close switch swap next prev list rename restart note layout workspace broadcast replay settings custom help"
  );

  const topicHelp = await executor.execute({ command: "help", args: ["deck"], raw: "/help deck" });
  assert.match(topicHelp, /^\/deck$/m);
  assert.match(topicHelp, /Subcommands: list new rename switch delete/);

  const subcommandHelp = await executor.execute({ command: "help", args: ["deck", "switch"], raw: "/help deck switch" });
  assert.equal(subcommandHelp, ["/deck switch", "Usage: /deck switch <deckSelector>", "switch active deck"].join("\n"));

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

  const layoutUsage = await executor.execute({ command: "layout", args: ["wat"], raw: "/layout wat" });
  assert.equal(layoutUsage, "Usage: /layout list | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");

  const workspaceUsage = await executor.execute({ command: "workspace", args: ["wat"], raw: "/workspace wat" });
  assert.equal(
    workspaceUsage,
    "Usage: /workspace list | /workspace save <name> | /workspace apply <preset> | /workspace rename <preset> <name> | /workspace delete <preset>"
  );

  const broadcastUsage = await executor.execute({ command: "broadcast", args: ["wat"], raw: "/broadcast wat" });
  assert.equal(broadcastUsage, "Usage: /broadcast status | /broadcast off | /broadcast group [group]");

  const replayUsage = await executor.execute({ command: "replay", args: [], raw: "/replay" });
  assert.equal(replayUsage, "Usage: /replay view [selector|active] | /replay export [selector|active] | /replay copy [selector|active]");

  const renameUsage = await executor.execute({ command: "rename", args: [], raw: "/rename" });
  assert.equal(renameUsage, "Usage: /rename <name> | /rename <selector> <name>");

  const settingsUsage = await executor.execute({ command: "settings", args: [], raw: "/settings" });
  assert.equal(settingsUsage, "Usage: /settings show [selector] | /settings apply <selector|active> <json>");

  const customShowUsage = await executor.execute({ command: "custom", args: ["show"], raw: "/custom show" });
  assert.equal(customShowUsage, "Usage: /custom show <name>");

  const customPreviewUsage = await executor.execute({ command: "custom", args: ["preview"], raw: "/custom preview" });
  assert.equal(customPreviewUsage, "Usage: /custom preview <name> [key=value ...] [-- <targetSelector>]");
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
  assert.equal(
    await executor.execute({ command: "workspace", args: ["apply", "ops"], raw: "/workspace apply ops" }),
    "Applied workspace preset [ops] Ops Workspace."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["rename", "ops", "New", "Name"], raw: "/workspace rename ops New Name" }),
    "Renamed workspace preset [ops] to New Name."
  );
  assert.equal(
    await executor.execute({ command: "workspace", args: ["delete", "ops"], raw: "/workspace delete ops" }),
    "Deleted workspace preset [ops] Ops Workspace."
  );
  assert.deepEqual(calls, [
    ["save", "Ops Workspace"],
    ["apply", "ops"],
    ["rename", "ops", "New Name"],
    ["delete", "ops"]
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
    sortSessionsByQuickId: (list) => list.slice().sort((left, right) => (left.id === "s2" ? -1 : right.id === "s2" ? 1 : 0)),
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
  assert.equal(preview, "/deploy -> [s1] one\n---\necho prod from /srv/one\n---");

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
