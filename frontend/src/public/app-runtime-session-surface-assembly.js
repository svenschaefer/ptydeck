import { createDeckActionsController as defaultCreateDeckActionsController } from "./ui/deck-actions-controller.js";
import { createDeckSidebarController as defaultCreateDeckSidebarController } from "./ui/deck-sidebar-controller.js";
import { createReplayViewerRuntimeController as defaultCreateReplayViewerRuntimeController } from "./replay-viewer-runtime-controller.js";
import { createSessionCardFactoryController as defaultCreateSessionCardFactoryController } from "./ui/session-card-factory-controller.js";
import { createSessionCardInteractionsController as defaultCreateSessionCardInteractionsController } from "./ui/session-card-interactions-controller.js";
import { createSessionCardRenderController as defaultCreateSessionCardRenderController } from "./ui/session-card-render-controller.js";
import { createSessionDisposalController as defaultCreateSessionDisposalController } from "./ui/session-disposal-controller.js";
import { createSessionGridController as defaultCreateSessionGridController } from "./ui/session-grid-controller.js";
import { createSessionSettingsDialogController as defaultCreateSessionSettingsDialogController } from "./ui/session-settings-dialog-controller.js";
import { createSessionSettingsStateController as defaultCreateSessionSettingsStateController } from "./ui/session-settings-state-controller.js";
import { createSessionTerminalResizeController as defaultCreateSessionTerminalResizeController } from "./ui/session-terminal-resize-controller.js";
import { createSessionTerminalRuntimeController as defaultCreateSessionTerminalRuntimeController } from "./ui/session-terminal-runtime-controller.js";
import { createTerminalSearchController as defaultCreateTerminalSearchController } from "./ui/terminal-search-controller.js";
import { createWorkspaceRenderController as defaultCreateWorkspaceRenderController } from "./ui/workspace-render-controller.js";

function createNoopStore() {
  return {
    getState() {
      return {
        activeSessionId: ""
      };
    }
  };
}

export function createAppRuntimeSessionSurfaceAssembly(options = {}) {
  const createDeckActionsController =
    typeof options.createDeckActionsController === "function"
      ? options.createDeckActionsController
      : defaultCreateDeckActionsController;
  const createDeckSidebarController =
    typeof options.createDeckSidebarController === "function"
      ? options.createDeckSidebarController
      : defaultCreateDeckSidebarController;
  const createReplayViewerRuntimeController =
    typeof options.createReplayViewerRuntimeController === "function"
      ? options.createReplayViewerRuntimeController
      : defaultCreateReplayViewerRuntimeController;
  const createSessionCardFactoryController =
    typeof options.createSessionCardFactoryController === "function"
      ? options.createSessionCardFactoryController
      : defaultCreateSessionCardFactoryController;
  const createSessionCardInteractionsController =
    typeof options.createSessionCardInteractionsController === "function"
      ? options.createSessionCardInteractionsController
      : defaultCreateSessionCardInteractionsController;
  const createSessionCardRenderController =
    typeof options.createSessionCardRenderController === "function"
      ? options.createSessionCardRenderController
      : defaultCreateSessionCardRenderController;
  const createSessionDisposalController =
    typeof options.createSessionDisposalController === "function"
      ? options.createSessionDisposalController
      : defaultCreateSessionDisposalController;
  const createSessionGridController =
    typeof options.createSessionGridController === "function"
      ? options.createSessionGridController
      : defaultCreateSessionGridController;
  const createSessionSettingsDialogController =
    typeof options.createSessionSettingsDialogController === "function"
      ? options.createSessionSettingsDialogController
      : defaultCreateSessionSettingsDialogController;
  const createSessionSettingsStateController =
    typeof options.createSessionSettingsStateController === "function"
      ? options.createSessionSettingsStateController
      : defaultCreateSessionSettingsStateController;
  const createSessionTerminalResizeController =
    typeof options.createSessionTerminalResizeController === "function"
      ? options.createSessionTerminalResizeController
      : defaultCreateSessionTerminalResizeController;
  const createSessionTerminalRuntimeController =
    typeof options.createSessionTerminalRuntimeController === "function"
      ? options.createSessionTerminalRuntimeController
      : defaultCreateSessionTerminalRuntimeController;
  const createTerminalSearchController =
    typeof options.createTerminalSearchController === "function"
      ? options.createTerminalSearchController
      : defaultCreateTerminalSearchController;
  const createWorkspaceRenderController =
    typeof options.createWorkspaceRenderController === "function"
      ? options.createWorkspaceRenderController
      : defaultCreateWorkspaceRenderController;

  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createNoopStore();
  const appLayoutDeckFacadeController = options.appLayoutDeckFacadeController || null;
  const appSessionRuntimeFacadeController = options.appSessionRuntimeFacadeController || null;
  const appCommandUiFacadeController = options.appCommandUiFacadeController || null;
  const appRuntimeStateController = options.appRuntimeStateController || null;
  const sessionUiFacadeController = options.sessionUiFacadeController || null;
  const sessionQuickSendRuntimeController = options.sessionQuickSendRuntimeController || null;
  const actionDialogController = options.actionDialogController || null;
  const appRuntimeSessionGridActions = options.appRuntimeSessionGridActions || null;
  const clipboardRuntimeController = options.clipboardRuntimeController || null;
  const replayExportRuntimeController = options.replayExportRuntimeController || null;
  const terminalCtrlCRuntimeController = options.terminalCtrlCRuntimeController || null;
  const workspacePresetRuntimeController = options.workspacePresetRuntimeController || null;
  const getCommandTargetRuntimeController =
    typeof options.getCommandTargetRuntimeController === "function"
      ? options.getCommandTargetRuntimeController
      : () => options.commandTargetRuntimeController || null;
  const getCommandComposerRuntimeController =
    typeof options.getCommandComposerRuntimeController === "function"
      ? options.getCommandComposerRuntimeController
      : () => options.commandComposerRuntimeController || null;

  const sessionDisposalController = createSessionDisposalController();

  const sessionCardFactoryController = createSessionCardFactoryController({
    ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId?.(sessionId) || "?",
    getSessionHeaderLabel: sessionUiFacadeController?.getSessionHeaderLabel,
    getSessionStateBadgeText: sessionUiFacadeController?.getSessionStateBadgeText,
    getSessionStateHintText: sessionUiFacadeController?.getSessionStateHintText,
    getSessionRuntimeState: sessionUiFacadeController?.getSessionRuntimeState,
    isSessionStopped: sessionUiFacadeController?.isSessionStopped,
    isSessionStartBlocked: sessionUiFacadeController?.isSessionStartBlocked,
    isSessionUnrestored: sessionUiFacadeController?.isSessionUnrestored,
    isSessionExited: sessionUiFacadeController?.isSessionExited,
    getSessionStartBlockedMessage: sessionUiFacadeController?.getSessionStartBlockedMessage,
    isReadOnlyMode: options.isReadOnlyMode,
    getReadOnlyModeMessage: options.getReadOnlyModeMessage,
    renderSessionAppIdentity: sessionUiFacadeController?.renderSessionAppIdentity,
    renderSessionTagList: sessionUiFacadeController?.renderSessionTagList,
    renderSessionNote: sessionUiFacadeController?.renderSessionNote,
    renderSessionQuickSend: (entry, session) => sessionQuickSendRuntimeController?.renderSessionQuickSend?.(entry, session),
    setSessionCardVisibility: (node, visible) => appSessionRuntimeFacadeController?.setSessionCardVisibility?.(node, visible)
  });

  const sessionSettingsStateController = createSessionSettingsStateController({
    themeProfileKeys: options.themeProfileKeys || [],
    defaultTerminalTheme: options.defaultTerminalTheme || {},
    themeFilterCategorySet: options.themeFilterCategorySet || new Set(),
    terminalThemePresetMap: options.terminalThemePresetMap || new Map(),
    terminalThemePresets: options.terminalThemePresets || [],
    terminalThemeModeSet: options.terminalThemeModeSet || new Set(),
    sessionThemeDrafts: options.sessionThemeDrafts || new Map(),
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId),
    getActiveSessionId: () => String(store.getState()?.activeSessionId || ""),
    getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator?.(sessionId) || "auto",
    normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode?.(value) || "auto",
    formatSessionEnv: sessionUiFacadeController?.formatSessionEnv,
    formatSessionTags: sessionUiFacadeController?.formatSessionTags,
    parseSessionEnv: sessionUiFacadeController?.parseSessionEnv,
    parseSessionTags: sessionUiFacadeController?.parseSessionTags,
    normalizeSessionStartupFromSession: sessionUiFacadeController?.normalizeSessionStartupFromSession,
    terminals: options.terminals || new Map(),
    documentRef
  });

  const sessionCardInteractionsController = createSessionCardInteractionsController({
    windowRef,
    themeModeSet: options.terminalThemeModeSet || new Set(),
    themeProfileKeys: options.themeProfileKeys || [],
    getThemePresetById: sessionUiFacadeController?.getThemePresetById,
    normalizeThemeSlot: sessionUiFacadeController?.normalizeThemeSlot,
    normalizeThemeProfile: sessionUiFacadeController?.normalizeThemeProfile,
    normalizeThemeFilterCategory: sessionUiFacadeController?.normalizeThemeFilterCategory,
    readThemeProfileFromControls: sessionUiFacadeController?.readThemeProfileFromControls,
    importThemeProfileIntoDraft: sessionUiFacadeController?.importThemeProfileIntoDraft,
    exportThemeProfileFromDraft: sessionUiFacadeController?.exportThemeProfileFromDraft,
    updateSessionThemeDraftFromControls: sessionUiFacadeController?.updateSessionThemeDraftFromControls,
    readSessionThemeProfilesForSave: sessionUiFacadeController?.readSessionThemeProfilesForSave,
    readSessionStartupFromControls: sessionUiFacadeController?.readSessionStartupFromControls,
    readSessionNoteFromControls: sessionUiFacadeController?.readSessionNoteFromControls,
    readSessionInputSafetyFromControls: sessionUiFacadeController?.readSessionInputSafetyFromControls,
    isValidHexColor: sessionUiFacadeController?.isValidHexColor,
    detectThemePreset: sessionUiFacadeController?.detectThemePreset,
    isSessionSettingsDirty: sessionUiFacadeController?.isSessionSettingsDirty,
    isSessionExited: sessionUiFacadeController?.isSessionExited,
    isSessionStopped: sessionUiFacadeController?.isSessionStopped,
    isSessionStartBlocked: sessionUiFacadeController?.isSessionStartBlocked,
    getSessionRuntimeState: sessionUiFacadeController?.getSessionRuntimeState,
    getSessionStartBlockedMessage: sessionUiFacadeController?.getSessionStartBlockedMessage,
    setActiveSettingsTab: sessionUiFacadeController?.setActiveSettingsTab,
    stabilizeSettingsLayout: sessionUiFacadeController?.stabilizeSettingsLayout,
    getBlockedSessionActionMessage: sessionUiFacadeController?.getBlockedSessionActionMessage,
    canWriteToSession: options.canWriteToSession,
    getSessionWriteBlockedMessage: options.getSessionWriteBlockedMessage,
    showBlockedWriteReclaimUi: options.showBlockedWriteReclaimUi,
    writeClipboardText: (text) => clipboardRuntimeController?.writeText?.(text),
    getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback
  });

  const sessionCardRenderController = createSessionCardRenderController({
    isSessionUnrestored: sessionUiFacadeController?.isSessionUnrestored,
    isSessionExited: sessionUiFacadeController?.isSessionExited,
    isSessionStopped: sessionUiFacadeController?.isSessionStopped,
    isSessionStartBlocked: sessionUiFacadeController?.isSessionStartBlocked,
    getSessionRuntimeState: sessionUiFacadeController?.getSessionRuntimeState,
    getSessionStateBadgeText: sessionUiFacadeController?.getSessionStateBadgeText,
    getSessionStateHintText: sessionUiFacadeController?.getSessionStateHintText,
    getSessionStartBlockedMessage: sessionUiFacadeController?.getSessionStartBlockedMessage,
    isTerminalAtBottom: options.isTerminalAtBottom,
    setSessionCardVisibility: (node, visible) => appSessionRuntimeFacadeController?.setSessionCardVisibility?.(node, visible),
    syncTerminalViewportAfterShow: (sessionId, entry) =>
      appSessionRuntimeFacadeController?.syncTerminalViewportAfterShow?.(sessionId, entry),
    ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId?.(sessionId) || "?",
    getSessionHeaderLabel: sessionUiFacadeController?.getSessionHeaderLabel,
    renderSessionAppIdentity: sessionUiFacadeController?.renderSessionAppIdentity,
    renderSessionTagList: sessionUiFacadeController?.renderSessionTagList,
    renderSessionNote: sessionUiFacadeController?.renderSessionNote,
    renderSessionQuickSend: (entry, session) => sessionQuickSendRuntimeController?.renderSessionQuickSend?.(entry, session),
    syncSessionStartupControls: sessionUiFacadeController?.syncSessionStartupControls,
    syncSessionNoteControls: sessionUiFacadeController?.syncSessionNoteControls,
    syncSessionInputSafetyControls: sessionUiFacadeController?.syncSessionInputSafetyControls,
    syncSessionThemeControls: sessionUiFacadeController?.syncSessionThemeControls,
    setSettingsDirty: sessionUiFacadeController?.setSettingsDirty,
    applyThemeForSession: sessionUiFacadeController?.applyThemeForSession,
    renderSessionControl: options.renderSessionControl,
    isReadOnlyMode: options.isReadOnlyMode,
    getReadOnlyModeMessage: options.getReadOnlyModeMessage
  });

  const sessionTerminalResizeController = createSessionTerminalResizeController({
    windowRef,
    documentRef,
    terminals: options.terminals || new Map(),
    resizeTimers: options.resizeTimers || new Map(),
    terminalSizes: options.terminalSizes || new Map(),
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId),
    resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
    getSessionTerminalGeometry: (sessionOrId) => appLayoutDeckFacadeController?.getSessionTerminalGeometry?.(sessionOrId),
    isSessionActionBlocked: sessionUiFacadeController?.isSessionActionBlocked,
    isSessionStopped: sessionUiFacadeController?.isSessionStopped,
    canWriteToSession: options.canWriteToSession,
    showBlockedWriteReclaimUi: options.showBlockedWriteReclaimUi,
    computeFixedMountHeightPx: (rows) => appLayoutDeckFacadeController?.computeFixedMountHeightPx?.(rows),
    computeFixedCardWidthPx: (cols) => appLayoutDeckFacadeController?.computeFixedCardWidthPx?.(cols),
    getTerminalCellHeightPx: options.getTerminalCellHeightPx,
    getTerminalCellWidthPx: options.getTerminalCellWidthPx,
    terminalCardHorizontalChromePx: options.terminalCardHorizontalChromePx,
    terminalMountVerticalChromePx: options.terminalMountVerticalChromePx,
    debugLog: options.debugLog,
    api: options.api
  });

  const sessionTerminalRuntimeController = createSessionTerminalRuntimeController({
    windowRef,
    terminals: options.terminals || new Map(),
    terminalFontSize: options.terminalFontSize,
    terminalLineHeight: options.terminalLineHeight,
    terminalFontFamily: options.terminalFontFamily,
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId),
    refreshTerminalViewport: options.refreshTerminalViewport,
    syncTerminalScrollArea: options.syncTerminalScrollArea,
    canWriteClipboardText: () => clipboardRuntimeController?.canWriteText?.() === true,
    readClipboardText: () => clipboardRuntimeController?.readText?.(),
    requestTerminalCtrlCAction: ({ session, selection }) =>
      terminalCtrlCRuntimeController?.requestIntent?.({ session, selection }),
    writeClipboardText: (text) => clipboardRuntimeController?.writeText?.(text),
    debugLog: options.debugLog
  });

  const sessionSettingsDialogController = createSessionSettingsDialogController({
    windowRef,
    confirmAction: (runtimeOptions) => actionDialogController?.confirm?.(runtimeOptions)
  });

  const workspaceRenderController = createWorkspaceRenderController({
    stateEl: options.stateEl || null,
    accessStateEl: options.accessStateEl || null,
    emptyStateEl: options.emptyStateEl || null,
    statusMessageEl: options.statusMessageEl || null,
    commandTargetEl: options.commandTargetEl || null,
    commandFeedbackEl: options.commandFeedbackEl || null,
    commandFeedbackActionBtn: options.commandFeedbackActionBtn || null,
    commandInlineHintEl: options.commandInlineHintEl || null,
    commandPreviewEl: options.commandPreviewEl || null,
    commandSuggestionsEl: options.commandSuggestionsEl || null,
    commandGuardEl: options.commandGuardEl || null,
    commandGuardSummaryEl: options.commandGuardSummaryEl || null,
    commandGuardReasonsEl: options.commandGuardReasonsEl || null,
    commandGuardPreviewEl: options.commandGuardPreviewEl || null,
    workflowPanelEl: options.workflowPanelEl || null,
    workflowStatusEl: options.workflowStatusEl || null,
    workflowTargetEl: options.workflowTargetEl || null,
    workflowProgressEl: options.workflowProgressEl || null,
    workflowDetailEl: options.workflowDetailEl || null,
    workflowResultEl: options.workflowResultEl || null,
    workflowStopBtn: options.workflowStopBtn || null,
    workflowInterruptBtn: options.workflowInterruptBtn || null,
    workflowKillBtn: options.workflowKillBtn || null,
    createBtn: options.createBtn || null,
    deckCreateBtn: options.deckCreateBtn || null,
    commandInput: options.commandInput || null,
    sendBtn: options.sendBtn || null,
    startupWarmupGateEl: options.startupWarmupGateEl || null,
    startupWarmupMessageEl: options.startupWarmupMessageEl || null,
    startupWarmupDetailEl: options.startupWarmupDetailEl || null,
    startupWarmupSkipBtn: options.startupWarmupSkipBtn || null
  });

  const replayViewerRuntimeController = createReplayViewerRuntimeController({
    dialogEl: options.replayViewerDialogEl || null,
    titleEl: options.replayViewerTitleEl || null,
    metaEl: options.replayViewerMetaEl || null,
    statusEl: options.replayViewerStatusEl || null,
    contentEl: options.replayViewerContentEl || null,
    refreshBtn: options.replayViewerRefreshBtn || null,
    downloadBtn: options.replayViewerDownloadBtn || null,
    copyBtn: options.replayViewerCopyBtn || null,
    closeBtn: options.replayViewerCloseBtn || null,
    loadSessionReplay: (session) => replayExportRuntimeController?.loadSessionReplay?.(session),
    exportSessionReplay: (session, runtimeOptions) => replayExportRuntimeController?.exportSessionReplay?.(session, runtimeOptions),
    buildReplayRetentionSummary: replayExportRuntimeController?.buildReplayRetentionSummary,
    formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
    getErrorMessage: (error, fallback) => appRuntimeStateController?.getErrorMessage?.(error, fallback) || fallback
  });

  const terminalSearchController = createTerminalSearchController({
    terminalSearchState: options.terminalSearchState || {
      query: "",
      sessionId: "",
      selectedSessionId: "",
      matches: [],
      activeIndex: -1,
      revision: -1,
      wrapped: false,
      direction: "next",
      missingActiveSession: false
    },
    terminals: options.terminals || new Map(),
    inputEl: options.terminalSearchInputEl || null,
    prevBtn: options.terminalSearchPrevBtn || null,
    nextBtn: options.terminalSearchNextBtn || null,
    clearBtn: options.terminalSearchClearBtn || null,
    statusEl: options.terminalSearchStatusEl || null,
    getActiveSessionId: () => String(store.getState()?.activeSessionId || "")
  });

  const deckActionsController = createDeckActionsController({
    windowRef,
    api: options.api,
    getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
    getDecks: () => store.getState()?.decks || [],
    getTerminalSettings: () => options.getTerminalSettings?.(),
    applyRuntimeEvent: (event, runtimeOptions) =>
      appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
    setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
    setError: (message) => appCommandUiFacadeController?.setError?.(message),
    requestText: (runtimeOptions) => actionDialogController?.requestText?.(runtimeOptions),
    confirmAction: (runtimeOptions) => actionDialogController?.confirm?.(runtimeOptions),
    defaultDeckId: options.defaultDeckId || ""
  });

  const deckSidebarController = createDeckSidebarController({
    containerEl: options.deckTabsEl || null,
    documentRef,
    resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
    ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId?.(sessionId) || "?",
    sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
    resolveDeckSessions: (deckId, sessions, runtimeOptions) =>
      workspacePresetRuntimeController?.resolveDeckSessions?.(deckId, sessions, runtimeOptions) ||
      (Array.isArray(sessions) ? sessions.slice() : []),
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    getSessionActivityIndicatorState: sessionUiFacadeController?.getSessionActivityIndicatorState,
    onActivateDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId),
    onActivateSession: (session) => getCommandTargetRuntimeController()?.activateSessionTarget?.(session),
    onRenameDeck: appRuntimeSessionGridActions?.onRenameDeck,
    onDeleteDeck: appRuntimeSessionGridActions?.onDeleteDeck,
    onSwapDeckSessions: appRuntimeSessionGridActions?.onSwapDeckSessions,
    canDeleteDeck: appRuntimeSessionGridActions?.canDeleteDeck,
    isReadOnlyMode: options.isReadOnlyMode,
    getReadOnlyModeMessage: options.getReadOnlyModeMessage
  });

  const sessionGridController = createSessionGridController({
    defaultDeckId: options.defaultDeckId || "",
    terminals: options.terminals || new Map(),
    terminalObservers: options.terminalObservers || new Map(),
    resizeTimers: options.resizeTimers || new Map(),
    terminalSizes: options.terminalSizes || new Map(),
    sessionThemeDrafts: options.sessionThemeDrafts || new Map(),
    template: options.template || null,
    gridEl: options.gridEl || null,
    splitLayoutRuntimeController: options.splitLayoutRuntimeController || null,
    getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
    resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
    getSessionFilterText: () => appLayoutDeckFacadeController?.getSessionFilterText?.() || "",
    sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
    resolveDeckSessions: (deckId, sessions, runtimeOptions) =>
      workspacePresetRuntimeController?.resolveDeckSessions?.(deckId, sessions, runtimeOptions) ||
      (Array.isArray(sessions) ? sessions.slice() : []),
    pruneQuickIds: (activeSessionIds) => appSessionRuntimeFacadeController?.pruneQuickIds?.(activeSessionIds),
    renderDeckTabs: (sessions) => appLayoutDeckFacadeController?.renderDeckTabs?.(sessions),
    workspaceRenderController,
    getCommandTargetSummary: () => getCommandTargetRuntimeController()?.formatActiveTargetSummary?.() || "",
    syncActiveTerminalSearch: (runtimeOptions) => appCommandUiFacadeController?.syncActiveTerminalSearch?.(runtimeOptions),
    sessionDisposalController,
    closeSettingsDialog: (dialog) => appLayoutDeckFacadeController?.closeSettingsDialog?.(dialog),
    onSessionDisposed: (sessionId) => appSessionRuntimeFacadeController?.disposeSessionRuntime?.(sessionId),
    terminalSearchState: options.terminalSearchState,
    clearTerminalSearchSelection: (sessionId) => appCommandUiFacadeController?.clearTerminalSearchSelection?.(sessionId),
    sessionCardRenderController,
    sessionCardFactoryController,
    sessionCardInteractionsController,
    syncSessionQuickSendState: (sessions) => sessionQuickSendRuntimeController?.syncSessions?.(sessions),
    sessionTerminalRuntimeController,
    onSessionMounted: (session) => appSessionRuntimeFacadeController?.ensureSessionRuntime?.(session),
    resolveInitialTheme: (sessionId) =>
      sessionUiFacadeController?.buildThemeFromConfig?.(
        sessionUiFacadeController?.getSessionThemeConfig?.(
          sessionId,
          store.getState()?.activeSessionId === sessionId ? "active" : "inactive"
        )
      ),
    handleSessionTerminalInput: (sessionId, data) => appSessionRuntimeFacadeController?.handleSessionTerminalInput?.(sessionId, data),
    handleSessionTerminalPaste: (sessionId, text) => getCommandComposerRuntimeController()?.submitTerminalPaste?.(sessionId, text),
    syncSessionStartupControls: sessionUiFacadeController?.syncSessionStartupControls,
    syncSessionNoteControls: sessionUiFacadeController?.syncSessionNoteControls,
    syncSessionInputSafetyControls: sessionUiFacadeController?.syncSessionInputSafetyControls,
    syncSessionThemeControls: sessionUiFacadeController?.syncSessionThemeControls,
    setSettingsDirty: sessionUiFacadeController?.setSettingsDirty,
    renderSessionControl: options.renderSessionControl,
    canWriteToSession: options.canWriteToSession,
    getSessionWriteBlockedMessage: options.getSessionWriteBlockedMessage,
    applyResizeForSession: (sessionId, runtimeOptions) => appLayoutDeckFacadeController?.applyResizeForSession?.(sessionId, runtimeOptions),
    scheduleGlobalResize: (runtimeOptions) => appLayoutDeckFacadeController?.scheduleGlobalResize?.(runtimeOptions),
    scheduleDeferredResizePasses: (runtimeOptions) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses?.(runtimeOptions),
    setActiveSession: (sessionId) => store.setActiveSession?.(sessionId),
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId),
    toggleSettingsDialog: (dialog) => appLayoutDeckFacadeController?.toggleSettingsDialog?.(dialog),
    confirmSessionDelete: (session) => appLayoutDeckFacadeController?.confirmSessionDelete?.(session),
    requestSessionRename: appRuntimeSessionGridActions?.requestSessionRename,
    renameTrustedLocalDevice: appRuntimeSessionGridActions?.renameTrustedLocalDevice,
    takeTrustedLocalControl: appRuntimeSessionGridActions?.takeTrustedLocalControl,
    confirmForgetSessionControlClient: appRuntimeSessionGridActions?.confirmForgetSessionControlClient,
    removeSession: (sessionId) => appSessionRuntimeFacadeController?.removeSession?.(sessionId),
    setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
    formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    setError: (message) => appCommandUiFacadeController?.setError?.(message),
    clearError: () => appRuntimeStateController?.clearError?.(),
    applyRuntimeEvent: (event, runtimeOptions) =>
      appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
    applyThemeForSession: sessionUiFacadeController?.applyThemeForSession,
    getSessionThemeConfig: sessionUiFacadeController?.getSessionThemeConfig,
    setSessionSendTerminator: (sessionId, mode) => appLayoutDeckFacadeController?.setSessionSendTerminator?.(sessionId, mode),
    setStartupSettingsFeedback: sessionUiFacadeController?.setStartupSettingsFeedback,
    requestRender: () => appCommandUiFacadeController?.render?.(),
    api: options.api,
    themeProfileKeys: options.themeProfileKeys || [],
    debugLog: options.debugLog
  });

  return {
    sessionDisposalController,
    sessionCardFactoryController,
    sessionSettingsStateController,
    sessionCardInteractionsController,
    sessionCardRenderController,
    sessionTerminalResizeController,
    sessionTerminalRuntimeController,
    sessionSettingsDialogController,
    workspaceRenderController,
    replayViewerRuntimeController,
    terminalSearchController,
    deckActionsController,
    deckSidebarController,
    sessionGridController
  };
}
