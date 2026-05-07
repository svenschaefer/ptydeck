import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeSessionSurfaceAssembly } from "../src/public/app-runtime-session-surface-assembly.js";

test("app runtime session surface assembly wires session/grid/operator surface controllers", async () => {
  const state = {
    activeSessionId: "s-1",
    decks: [{ id: "ops", name: "Ops" }]
  };
  const sessions = [
    { id: "s-1", deckId: "ops", name: "Alpha" },
    { id: "s-2", deckId: "ops", name: "Beta" }
  ];

  let sessionCardFactoryArgs = null;
  let sessionSettingsStateArgs = null;
  let sessionTerminalResizeArgs = null;
  let sessionTerminalRuntimeArgs = null;
  let sessionSettingsDialogArgs = null;
  let replayViewerArgs = null;
  let terminalSearchArgs = null;
  let deckActionsArgs = null;
  let deckSidebarArgs = null;
  let sessionGridArgs = null;

  const sessionSurface = createAppRuntimeSessionSurfaceAssembly({
    windowRef: {},
    documentRef: {},
    store: {
      getState() {
        return state;
      },
      setActiveSession(sessionId) {
        state.activeSessionId = sessionId;
      }
    },
    api: { id: "api" },
    terminals: new Map([["s-1", { id: "terminal-1" }]]),
    terminalObservers: new Map(),
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    sessionThemeDrafts: new Map(),
    terminalSearchState: { sessionId: "", selectedSessionId: "", matches: [], activeIndex: -1 },
    themeProfileKeys: ["background"],
    defaultTerminalTheme: { background: "#000000" },
    themeFilterCategorySet: new Set(["all"]),
    terminalThemePresetMap: new Map([["default", { id: "default" }]]),
    terminalThemePresets: [{ id: "default" }],
    terminalThemeModeSet: new Set(["custom", "default"]),
    terminalFontSize: 16,
    terminalLineHeight: 1.2,
    terminalFontFamily: "monospace",
    terminalCardHorizontalChromePx: 6,
    terminalMountVerticalChromePx: 18,
    defaultDeckId: "default",
    appLayoutDeckFacadeController: {
      getActiveDeck() {
        return { id: "ops", name: "Ops" };
      },
      getSessionSendTerminator() {
        return "auto";
      },
      normalizeSendTerminatorMode(value) {
        return value === "lf" ? "lf" : "auto";
      },
      getSessionTerminalGeometry() {
        return { cols: 80, rows: 24 };
      },
      computeFixedMountHeightPx(rows) {
        return rows * 10;
      },
      computeFixedCardWidthPx(cols) {
        return cols * 8;
      },
      renderDeckTabs(payload) {
        return payload.length;
      },
      applyResizeForSession(sessionId) {
        return { sessionId };
      },
      scheduleGlobalResize() {
        return "global-resize";
      },
      scheduleDeferredResizePasses() {
        return "deferred-resize";
      },
      toggleSettingsDialog(dialog) {
        return dialog;
      },
      closeSettingsDialog(dialog) {
        return dialog;
      },
      confirmSessionDelete(session) {
        return session?.id || "";
      },
      setActiveDeck(deckId) {
        return deckId;
      },
      getSessionFilterText() {
        return "filter";
      },
      setSessionSendTerminator(sessionId, mode) {
        return `${sessionId}:${mode}`;
      }
    },
    appSessionRuntimeFacadeController: {
      ensureQuickId(sessionId) {
        return sessionId === "s-1" ? "1" : "2";
      },
      getSessionById(sessionId) {
        return sessions.find((session) => session.id === sessionId) || null;
      },
      resolveSessionDeckId(session) {
        return session?.deckId || "default";
      },
      setSessionCardVisibility(node, visible) {
        return { node, visible };
      },
      syncTerminalViewportAfterShow(sessionId, entry) {
        return { sessionId, entry };
      },
      sortSessionsByQuickId(payload) {
        return payload.slice().reverse();
      },
      pruneQuickIds(ids) {
        return ids.length;
      },
      disposeSessionRuntime(sessionId) {
        return sessionId;
      },
      ensureSessionRuntime(session) {
        return session?.id || "";
      },
      handleSessionTerminalInput(sessionId, data) {
        return { sessionId, data };
      },
      removeSession(sessionId) {
        return sessionId;
      },
      formatSessionToken(sessionId) {
        return sessionId === "s-1" ? "1" : "?";
      },
      formatSessionDisplayName(session) {
        return session?.name || "";
      },
      applyRuntimeEvent() {
        return true;
      }
    },
    appCommandUiFacadeController: {
      getErrorMessage(error, fallback) {
        return error?.message || fallback;
      },
      setCommandFeedback(message) {
        return message;
      },
      setError(message) {
        return message;
      },
      syncActiveTerminalSearch(runtimeOptions) {
        return runtimeOptions;
      },
      clearTerminalSearchSelection(sessionId) {
        return sessionId;
      },
      render() {
        return "rendered";
      }
    },
    appRuntimeStateController: {
      clearError() {
        return "cleared";
      },
      getErrorMessage(error, fallback) {
        return error?.message || fallback;
      }
    },
    sessionUiFacadeController: {
      getSessionHeaderLabel() {
        return "Session";
      },
      getSessionStateBadgeText() {
        return "running";
      },
      getSessionStateHintText() {
        return "ok";
      },
      isSessionUnrestored() {
        return false;
      },
      isSessionExited() {
        return false;
      },
      renderSessionAppIdentity() {
        return "identity";
      },
      renderSessionTagList() {
        return "tags";
      },
      renderSessionNote() {
        return "note";
      },
      formatSessionEnv() {
        return "ENV=1";
      },
      formatSessionTags() {
        return "ops";
      },
      parseSessionEnv() {
        return { ENV: "1" };
      },
      parseSessionTags() {
        return ["ops"];
      },
      normalizeSessionStartupFromSession(session) {
        return session?.id || "";
      },
      getThemePresetById(id) {
        return { id };
      },
      normalizeThemeSlot(value) {
        return value;
      },
      normalizeThemeProfile(value) {
        return value || {};
      },
      normalizeThemeFilterCategory(value) {
        return value || "all";
      },
      readThemeProfileFromControls() {
        return {};
      },
      importThemeProfileIntoDraft() {
        return true;
      },
      exportThemeProfileFromDraft() {
        return {};
      },
      updateSessionThemeDraftFromControls() {
        return true;
      },
      readSessionThemeProfilesForSave() {
        return {};
      },
      readSessionStartupFromControls() {
        return {};
      },
      readSessionNoteFromControls() {
        return "";
      },
      readSessionInputSafetyFromControls() {
        return {};
      },
      isValidHexColor() {
        return true;
      },
      detectThemePreset() {
        return "default";
      },
      isSessionSettingsDirty() {
        return false;
      },
      setActiveSettingsTab(tabId) {
        return tabId;
      },
      stabilizeSettingsLayout() {
        return true;
      },
      getBlockedSessionActionMessage() {
        return "";
      },
      syncSessionStartupControls() {
        return true;
      },
      syncSessionNoteControls() {
        return true;
      },
      syncSessionInputSafetyControls() {
        return true;
      },
      syncSessionThemeControls() {
        return true;
      },
      setSettingsDirty() {
        return true;
      },
      applyThemeForSession() {
        return true;
      },
      getSessionThemeConfig(sessionId, mode) {
        return { sessionId, mode };
      },
      buildThemeFromConfig(config) {
        return { built: config };
      },
      setStartupSettingsFeedback(message) {
        return message;
      },
      getSessionActivityIndicatorState() {
        return "idle";
      }
    },
    sessionQuickSendRuntimeController: {
      renderSessionQuickSend(entry, session) {
        return { entry, session };
      },
      syncSessions(payload) {
        return payload.length;
      }
    },
    actionDialogController: {
      requestText(options) {
        return { type: "text", options };
      },
      confirm(options) {
        return Promise.resolve({ type: "confirm", options });
      }
    },
    appRuntimeSessionGridActions: {
      onRenameDeck: async () => "rename-deck",
      onDeleteDeck: async () => "delete-deck",
      onSwapDeckSessions: async () => "swap-sessions",
      canDeleteDeck() {
        return true;
      },
      requestSessionRename() {
        return "rename-session";
      },
      renameTrustedLocalDevice() {
        return "rename-trusted-local";
      },
      takeTrustedLocalControl() {
        return "take-control";
      },
      confirmForgetSessionControlClient() {
        return "forget-client";
      }
    },
    clipboardRuntimeController: {
      canWriteText() {
        return true;
      },
      readText() {
        return Promise.resolve("clipboard");
      },
      writeText(value) {
        return value;
      }
    },
    replayExportRuntimeController: {
      loadSessionReplay(session) {
        return session?.id || "";
      },
      exportSessionReplay(session) {
        return session?.id || "";
      },
      buildReplayRetentionSummary() {
        return "retention";
      }
    },
    terminalCtrlCRuntimeController: {
      requestIntent(payload) {
        return payload;
      }
    },
    workspacePresetRuntimeController: {
      resolveDeckSessions(deckId, payload) {
        return deckId === "ops" ? payload : [];
      }
    },
    commandTargetRuntimeController: {
      activateSessionTarget(session) {
        return session?.id || "";
      },
      formatActiveTargetSummary() {
        return "target";
      }
    },
    commandComposerRuntimeController: {
      submitTerminalPaste(sessionId, text) {
        return { sessionId, text };
      }
    },
    splitLayoutRuntimeController: { id: "split-layout" },
    renderSessionControl(session) {
      return session?.id || "";
    },
    canWriteToSession() {
      return true;
    },
    getSessionWriteBlockedMessage() {
      return "";
    },
    showBlockedWriteReclaimUi() {
      return "reclaim";
    },
    isReadOnlyMode() {
      return false;
    },
    getReadOnlyModeMessage() {
      return "";
    },
    getTerminalCellHeightPx() {
      return 20;
    },
    getTerminalCellWidthPx() {
      return 10;
    },
    isTerminalAtBottom() {
      return true;
    },
    refreshTerminalViewport() {
      return true;
    },
    syncTerminalScrollArea() {
      return true;
    },
    getTerminalSettings() {
      return { cols: 80, rows: 24 };
    },
    debugLog() {},
    createSessionDisposalController() {
      return { id: "session-disposal" };
    },
    createSessionCardFactoryController(args) {
      sessionCardFactoryArgs = args;
      return { id: "session-card-factory" };
    },
    createSessionSettingsStateController(args) {
      sessionSettingsStateArgs = args;
      return { id: "session-settings-state" };
    },
    createSessionCardInteractionsController() {
      return { id: "session-card-interactions" };
    },
    createSessionCardRenderController() {
      return { id: "session-card-render" };
    },
    createSessionTerminalResizeController(args) {
      sessionTerminalResizeArgs = args;
      return { id: "session-terminal-resize" };
    },
    createSessionTerminalRuntimeController(args) {
      sessionTerminalRuntimeArgs = args;
      return { id: "session-terminal-runtime" };
    },
    createSessionSettingsDialogController(args) {
      sessionSettingsDialogArgs = args;
      return { id: "session-settings-dialog" };
    },
    createWorkspaceRenderController() {
      return { id: "workspace-render" };
    },
    createReplayViewerRuntimeController(args) {
      replayViewerArgs = args;
      return { id: "replay-viewer" };
    },
    createTerminalSearchController(args) {
      terminalSearchArgs = args;
      return { id: "terminal-search" };
    },
    createDeckActionsController(args) {
      deckActionsArgs = args;
      return { id: "deck-actions" };
    },
    createDeckSidebarController(args) {
      deckSidebarArgs = args;
      return { id: "deck-sidebar" };
    },
    createSessionGridController(args) {
      sessionGridArgs = args;
      return { id: "session-grid" };
    }
  });

  assert.equal(sessionSurface.sessionSettingsDialogController.id, "session-settings-dialog");
  assert.equal(sessionSurface.deckActionsController.id, "deck-actions");
  assert.equal(sessionSurface.sessionGridController.id, "session-grid");

  assert.equal(sessionCardFactoryArgs.ensureQuickId("s-1"), "1");
  assert.deepEqual(sessionCardFactoryArgs.renderSessionQuickSend("entry", sessions[0]), {
    entry: "entry",
    session: sessions[0]
  });
  assert.equal(sessionSettingsStateArgs.getActiveSessionId(), "s-1");
  assert.equal(sessionSettingsStateArgs.getSessionById("s-2").id, "s-2");
  assert.equal(sessionSettingsStateArgs.normalizeSendTerminatorMode("lf"), "lf");

  assert.equal(sessionTerminalResizeArgs.getSessionById("s-1").id, "s-1");
  assert.deepEqual(sessionTerminalResizeArgs.getSessionTerminalGeometry("s-1"), { cols: 80, rows: 24 });
  assert.equal(sessionTerminalResizeArgs.computeFixedMountHeightPx(12), 120);
  assert.equal(sessionTerminalResizeArgs.computeFixedCardWidthPx(12), 96);

  assert.equal(sessionTerminalRuntimeArgs.canWriteClipboardText(), true);
  assert.equal(await sessionTerminalRuntimeArgs.readClipboardText(), "clipboard");
  assert.deepEqual(
    sessionTerminalRuntimeArgs.requestTerminalCtrlCAction({ session: sessions[0], selection: "ls" }),
    { session: sessions[0], selection: "ls" }
  );

  assert.deepEqual(await sessionSettingsDialogArgs.confirmAction({ label: "Apply" }), {
    type: "confirm",
    options: { label: "Apply" }
  });
  assert.equal(replayViewerArgs.formatSessionToken("s-1"), "1");
  assert.equal(replayViewerArgs.loadSessionReplay(sessions[0]), "s-1");
  assert.equal(terminalSearchArgs.getActiveSessionId(), "s-1");
  assert.equal(deckActionsArgs.getActiveDeck().id, "ops");
  assert.deepEqual(await deckActionsArgs.requestText({ label: "Rename" }), {
    type: "text",
    options: { label: "Rename" }
  });
  assert.equal(deckSidebarArgs.onRenameDeck, sessionSurface.deckSidebarController.id ? deckSidebarArgs.onRenameDeck : null);
  assert.equal(deckSidebarArgs.canDeleteDeck(), true);
  assert.equal(sessionGridArgs.syncSessionQuickSendState(sessions), 2);
  assert.deepEqual(sessionGridArgs.resolveInitialTheme("s-1"), {
    built: { sessionId: "s-1", mode: "active" }
  });
  assert.deepEqual(sessionGridArgs.handleSessionTerminalPaste("s-1", "pwd"), { sessionId: "s-1", text: "pwd" });
});

test("app runtime session surface assembly fails closed for missing optional controllers", () => {
  let sessionCardFactoryArgs = null;
  let sessionSettingsStateArgs = null;
  let terminalSearchArgs = null;

  createAppRuntimeSessionSurfaceAssembly({
    createSessionDisposalController() {
      return {};
    },
    createSessionCardFactoryController(args) {
      sessionCardFactoryArgs = args;
      return {};
    },
    createSessionSettingsStateController(args) {
      sessionSettingsStateArgs = args;
      return {};
    },
    createSessionCardInteractionsController() {
      return {};
    },
    createSessionCardRenderController() {
      return {};
    },
    createSessionTerminalResizeController() {
      return {};
    },
    createSessionTerminalRuntimeController() {
      return {};
    },
    createSessionSettingsDialogController() {
      return {};
    },
    createWorkspaceRenderController() {
      return {};
    },
    createReplayViewerRuntimeController() {
      return {};
    },
    createTerminalSearchController(args) {
      terminalSearchArgs = args;
      return {};
    },
    createDeckActionsController() {
      return {};
    },
    createDeckSidebarController() {
      return {};
    },
    createSessionGridController() {
      return {};
    }
  });

  assert.equal(sessionCardFactoryArgs.ensureQuickId("missing"), "?");
  assert.equal(sessionCardFactoryArgs.renderSessionQuickSend("entry", { id: "missing" }), undefined);
  assert.equal(sessionSettingsStateArgs.getActiveSessionId(), "");
  assert.equal(sessionSettingsStateArgs.getSessionById("missing"), undefined);
  assert.equal(sessionSettingsStateArgs.normalizeSendTerminatorMode("lf"), "auto");
  assert.equal(terminalSearchArgs.getActiveSessionId(), "");
});
