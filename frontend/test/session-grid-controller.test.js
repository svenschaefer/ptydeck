import test from "node:test";
import assert from "node:assert/strict";

import { createSessionGridController } from "../src/public/ui/session-grid-controller.js";

function createDomLikeGridElement(initialNodes = []) {
  const nodes = initialNodes.slice();
  const children = {};
  Object.defineProperty(children, "length", {
    get() {
      return nodes.length;
    }
  });
  children.item = (index) => nodes[index] || null;
  return {
    children,
    appendCalls: [],
    appendChild(node) {
      const existingIndex = nodes.indexOf(node);
      if (existingIndex >= 0) {
        nodes.splice(existingIndex, 1);
      }
      nodes.push(node);
      this.appendCalls.push(node.id);
      return node;
    }
  };
}

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
          unrestoredHintEl: {},
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

test("session-grid controller mounts new cards into split-layout parking and delegates layout rendering", () => {
  const calls = [];
  const parkingEl = { id: "parking" };
  const splitLayoutRuntimeController = {
    getCardParkingContainer: () => parkingEl,
    renderDeckLayout: (payload) => calls.push(["split-render", payload.deckId, payload.deckSessions.map((session) => session.id).join(",")])
  };
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals: new Map(),
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    template: { id: "tpl" },
    gridEl: { id: "grid" },
    splitLayoutRuntimeController,
    getActiveDeck: () => ({ id: "ops" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s1"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
    syncActiveTerminalSearch: () => calls.push("search"),
    sessionDisposalController: { cleanupRemovedSessions: () => false },
    sessionCardFactoryController: {
      createSessionCardView: () => ({
        node: {},
        focusBtn: {},
        quickIdEl: {},
        stateBadgeEl: {},
        sessionMetaRowEl: {},
        sessionNoteEl: {},
        unrestoredHintEl: {},
        settingsBtn: {},
        renameBtn: {},
        closeBtn: {},
        settingsDialog: {},
        settingsDismissBtn: {},
        startCwdInput: {},
        startCommandInput: {},
        startEnvInput: {},
        sessionSendTerminatorSelect: {},
        inputSafetyPresetSelect: {},
        sessionTagsInput: {},
        startFeedback: {},
        tagListEl: {},
        themeCategory: {},
        themeSearch: {},
        themeSlotSelect: {},
        themeSelect: {},
        themeBg: {},
        themeFg: {},
        themeInputs: {},
        settingsApplyBtn: {},
        settingsCancelBtn: {},
        settingsStatus: {},
        mount: {}
      })
    },
    sessionCardInteractionsController: {
      bindSessionCardInteractions: () => {}
    },
    onSessionMounted: () => {},
    sessionTerminalRuntimeController: {
      mountSessionTerminalCard: ({ containerEl, afterEntryRegistered }) => {
        calls.push(["mount-container", containerEl.id]);
        afterEntryRegistered({}, { id: "s1" });
      }
    },
    syncSessionStartupControls: () => {},
    syncSessionInputSafetyControls: () => {},
    syncSessionThemeControls: () => {},
    setSettingsDirty: () => {},
    scheduleGlobalResize: () => calls.push("resize-global"),
    scheduleDeferredResizePasses: () => calls.push("resize-deferred"),
    setActiveSession: () => {},
    getSessionById: () => ({ id: "s1" }),
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
    debugLog: () => {}
  });

  controller.renderWorkspace({
    state: {
      sessions: [{ id: "s1", deckId: "ops" }],
      decks: [{ id: "ops" }],
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
    nowMs: () => 12,
    maybeReportStartupPerf: () => {}
  });

  assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "mount-container" && entry[1] === "parking"));
  assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "split-render" && entry[1] === "ops"));
});

test("session-grid controller reorders existing cards by quick-id order", () => {
  const calls = [];
  const appended = [];
  const entryOne = { element: { id: "node-s1" } };
  const entryTwo = { element: { id: "node-s2" } };
  const terminals = new Map([
    ["s1", entryOne],
    ["s2", entryTwo]
  ]);
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals,
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    gridEl: {
      appendChild(node) {
        appended.push(node.id);
      }
    },
    getActiveDeck: () => ({ id: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    sortSessionsByQuickId: (sessions) => sessions.slice().reverse(),
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s1", "s2"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
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
      sessions: [
        { id: "s1", deckId: "d1" },
        { id: "s2", deckId: "d1" }
      ],
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
  assert.deepEqual(appended, ["node-s2", "node-s1"]);
});

test("session-grid controller does not reappend existing cards when DOM order already matches quick-id order", () => {
  const calls = [];
  const entryOne = { element: { id: "node-s1" } };
  const entryTwo = { element: { id: "node-s2" } };
  const terminals = new Map([
    ["s1", entryOne],
    ["s2", entryTwo]
  ]);
  const gridEl = createDomLikeGridElement([entryOne.element, entryTwo.element]);
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals,
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    gridEl,
    getActiveDeck: () => ({ id: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s1", "s2"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
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
      sessions: [
        { id: "s1", deckId: "d1" },
        { id: "s2", deckId: "d1" }
      ],
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
  assert.deepEqual(gridEl.appendCalls, []);
});

test("session-grid controller does not reappend active-deck cards when global DOM order already matches all sessions", () => {
  const calls = [];
  const entryZero = { element: { id: "node-s0" } };
  const entryOne = { element: { id: "node-s1" } };
  const entryTwo = { element: { id: "node-s2" } };
  const entryThree = { element: { id: "node-s3" } };
  const terminals = new Map([
    ["s0", entryZero],
    ["s1", entryOne],
    ["s2", entryTwo],
    ["s3", entryThree]
  ]);
  const gridEl = createDomLikeGridElement([entryZero.element, entryOne.element, entryTwo.element, entryThree.element]);
  const controller = createSessionGridController({
    defaultDeckId: "default",
    terminals,
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    gridEl,
    getActiveDeck: () => ({ id: "d2" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionFilterText: () => "",
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: () => ({ visibleSessionIds: new Set(["s2", "s3"]), filterActive: false, switchedActiveSession: false }),
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
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
      sessions: [
        { id: "s0", deckId: "d1" },
        { id: "s1", deckId: "d1" },
        { id: "s2", deckId: "d2" },
        { id: "s3", deckId: "d2" }
      ],
      decks: [{ id: "d1" }, { id: "d2" }],
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
    startupPerf: { firstNonEmptyRenderAtMs: null, firstTerminalMountedAtMs: null },
    nowMs: () => 42,
    maybeReportStartupPerf: () => calls.push("perf")
  });

  assert.equal(result.aborted, false);
  assert.deepEqual(gridEl.appendCalls, []);
});

test("session-grid controller applies deck session group resolution before filter visibility", () => {
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
    getSessionFilterText: () => "",
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    resolveDeckSessions: (_deckId, sessions) => sessions.filter((session) => session.id !== "s1"),
    renderDeckTabs: () => calls.push("tabs"),
    workspaceRenderController: {
      resolveVisibleSessions: ({ deckSessions }) => {
        calls.push(["deck-sessions", deckSessions.map((session) => session.id)]);
        return { visibleSessionIds: new Set(deckSessions.map((session) => session.id)), filterActive: false, switchedActiveSession: false };
      },
      renderEmptyState: () => calls.push("empty"),
      renderStatus: () => calls.push("status")
    },
    pruneQuickIds: () => calls.push("prune"),
    syncActiveTerminalSearch: () => calls.push("search"),
    sessionDisposalController: {
      cleanupRemovedSessions: () => false
    },
    debugLog: () => calls.push("debug")
  });

  const result = controller.renderWorkspace({
    state: {
      sessions: [
        { id: "s1", deckId: "d1" },
        { id: "s2", deckId: "d1" }
      ],
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
    startupPerf: { firstNonEmptyRenderAtMs: null, firstTerminalMountedAtMs: null },
    nowMs: () => 42,
    maybeReportStartupPerf: () => calls.push("perf")
  });

  assert.equal(result.aborted, false);
  assert.deepEqual(calls[1], ["deck-sessions", ["s2"]]);
});
