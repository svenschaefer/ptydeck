import test from "node:test";
import assert from "node:assert/strict";

import { createSessionGridController } from "../src/public/ui/session-grid-controller.js";

test("session-grid controller aborts render when filter handling switches active session", () => {
  const calls = [];
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals: new Map(),
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    getActiveDeck: () => ({ id: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "tag:x",
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ switchedActiveSession: true })
    },
    pruneQuickIds: () => calls.push("prune")
  });

  const result = controller.renderWorkspace({
    state: {
      sessions: [{ id: "s1", deckId: "d1" }],
      decks: [{ id: "d1" }],
      activeSessionId: "s1",
      connectionState: "connected"
    },
    uiState: { loading: false, error: "" },
    startupPerf: { firstNonEmptyRenderAtMs: null, firstTerminalMountedAtMs: null },
    nowMs: () => 10,
    maybeReportStartupPerf: () => calls.push("perf")
  });

  assert.equal(result.aborted, true);
  assert.deepEqual(calls, ["tabs"]);
});

test("session-grid controller updates existing cards without creating new terminals", () => {
  const calls = [];
  const terminals = new Map([["s1", { id: "entry-1" }]]);
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals,
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    getActiveDeck: () => ({ id: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s1"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
    syncStatusTicker: () => calls.push("ticker"),
    syncActiveTerminalSearch: () => calls.push("search"),
    sessionDisposalController: {
      cleanupRemovedSessions: () => false
    },
    sessionCardRenderController: {
      updateExistingSessionCard: (payload) => calls.push(["update", payload.session.id, payload.nextVisible])
    },
    debugLog: () => calls.push("debug")
  });

  const result = controller.renderWorkspace({
    state: {
      sessions: [{ id: "s1", deckId: "d1" }],
      decks: [{ id: "d1" }],
      activeSessionId: "s1",
      connectionState: "connected"
    },
    uiState: {
      loading: false,
      error: "",
      commandFeedback: "",
      commandInlineHint: "",
      commandInlineHintPrefixPx: 0,
      commandPreview: "",
      commandSuggestions: ""
    },
    startupPerf: { firstNonEmptyRenderAtMs: null, firstTerminalMountedAtMs: null },
    nowMs: () => 42,
    maybeReportStartupPerf: () => calls.push("perf")
  });

  assert.equal(result.aborted, false);
  assert.deepEqual(calls, [
    "tabs",
    "prune",
    "perf",
    "debug",
    "ticker",
    "empty",
    "status",
    "search",
    ["update", "s1", true],
    "search"
  ]);
});

test("session-grid controller creates new cards and schedules resize passes", () => {
  const calls = [];
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals: new Map(),
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    template: { id: "tpl" },
    gridEl: { id: "grid" },
    themeProfileKeys: ["background"],
    getActiveDeck: () => ({ id: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s2"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
    syncStatusTicker: () => calls.push("ticker"),
    syncActiveTerminalSearch: () => calls.push("search"),
    sessionDisposalController: { cleanupRemovedSessions: () => false },
    sessionCardFactoryController: {
      createSessionCardView: ({ session }) => {
        calls.push(["factory", session.id]);
        return {
          node: {},
          focusBtn: {},
          quickIdEl: {},
          stateBadgeEl: {},
          pluginBadgesEl: {},
          unrestoredHintEl: {},
          sessionStatusEl: {},
          sessionArtifactsEl: {},
          settingsBtn: {},
          renameBtn: {},
          closeBtn: {},
          settingsDialog: {},
          settingsDismissBtn: {},
          startCwdInput: {},
          startCommandInput: {},
          startEnvInput: {},
          sessionSendTerminatorSelect: {},
          sessionTagsInput: {},
          startFeedback: {},
          tagListEl: {},
          themeCategory: {},
          themeSearch: {},
          themeSelect: {},
          themeBg: {},
          themeFg: {},
          themeInputs: {},
          settingsApplyBtn: {},
          settingsCancelBtn: {},
          settingsStatus: {},
          mount: {}
        };
      }
    },
    sessionCardInteractionsController: {
      bindSessionCardInteractions: ({ session }) => calls.push(["bind", session.id])
    },
    onSessionMounted: (session) => calls.push(["mounted-contract", session.id]),
    sessionTerminalRuntimeController: {
      mountSessionTerminalCard: ({ session, onSessionMounted, onFirstTerminalMounted, afterEntryRegistered }) => {
        calls.push(["mount", session.id]);
        onSessionMounted(session);
        afterEntryRegistered({ id: "entry" }, session);
        onFirstTerminalMounted();
      }
    },
    resolveInitialTheme: () => ({ background: "#000" }),
    handleSessionTerminalInput: () => calls.push("input"),
    syncSessionStartupControls: () => calls.push("startup-sync"),
    syncSessionThemeControls: () => calls.push("theme-sync"),
    setSettingsDirty: () => calls.push("dirty"),
    applyResizeForSession: () => calls.push("resize-one"),
    scheduleGlobalResize: () => calls.push("resize-global"),
    scheduleDeferredResizePasses: () => calls.push("resize-deferred"),
    setActiveSession: () => calls.push("active"),
    getSessionById: () => ({ id: "s2" }),
    toggleSettingsDialog: () => {},
    closeSettingsDialog: () => {},
    confirmSessionDelete: () => true,
    removeSession: () => {},
    setCommandFeedback: () => {},
    formatSessionToken: () => "1",
    formatSessionDisplayName: () => "session",
    setError: () => {},
    clearError: () => {},
    applyRuntimeEvent: () => true,
    applyThemeForSession: () => {},
    getSessionThemeConfig: () => ({}),
    setSessionSendTerminator: () => {},
    setStartupSettingsFeedback: () => {},
    requestRender: () => {},
    api: {},
    debugLog: () => calls.push("debug")
  });

  const startupPerf = { firstNonEmptyRenderAtMs: null, firstTerminalMountedAtMs: null };
  const result = controller.renderWorkspace({
    state: {
      sessions: [{ id: "s2", deckId: "d1" }],
      decks: [{ id: "d1" }],
      activeSessionId: "s2",
      connectionState: "connected"
    },
    uiState: {
      loading: false,
      error: "",
      commandFeedback: "",
      commandInlineHint: "",
      commandInlineHintPrefixPx: 0,
      commandPreview: "",
      commandSuggestions: ""
    },
    startupPerf,
    nowMs: () => 99,
    maybeReportStartupPerf: () => calls.push("perf")
  });

  assert.equal(result.aborted, false);
  assert.equal(startupPerf.firstNonEmptyRenderAtMs, 99);
  assert.equal(startupPerf.firstTerminalMountedAtMs, 99);
  assert.deepEqual(calls, [
    "tabs",
    "prune",
    "perf",
    "debug",
    "ticker",
    "empty",
    "status",
    "search",
    ["factory", "s2"],
    ["bind", "s2"],
    ["mount", "s2"],
    ["mounted-contract", "s2"],
    "startup-sync",
    "theme-sync",
    "dirty",
    "perf",
    "search",
    "resize-global",
    "resize-deferred"
  ]);
});
