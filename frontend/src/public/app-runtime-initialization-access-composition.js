import { createAppCommandUiFacadeController as defaultCreateAppCommandUiFacadeController } from "./app-command-ui-facade-controller.js";
import { createAppRuntimeSessionAccessAssembly as defaultCreateAppRuntimeSessionAccessAssembly } from "./app-runtime-session-access-assembly.js";
import { createAppRuntimeStateController as defaultCreateAppRuntimeStateController } from "./app-runtime-state-controller.js";

function createFallbackStore() {
  return {
    getState() {
      return {
        sessions: [],
        decks: []
      };
    },
    recordSessionCommandSubmission() {}
  };
}

export function createAppRuntimeInitializationAccessComposition(options = {}) {
  const createAppRuntimeStateController =
    typeof options.createAppRuntimeStateController === "function"
      ? options.createAppRuntimeStateController
      : defaultCreateAppRuntimeStateController;
  const createAppCommandUiFacadeController =
    typeof options.createAppCommandUiFacadeController === "function"
      ? options.createAppCommandUiFacadeController
      : defaultCreateAppCommandUiFacadeController;
  const createAppRuntimeSessionAccessAssembly =
    typeof options.createAppRuntimeSessionAccessAssembly === "function"
      ? options.createAppRuntimeSessionAccessAssembly
      : defaultCreateAppRuntimeSessionAccessAssembly;

  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const config = options.config && typeof options.config === "object" ? options.config : {};
  const uiState = options.uiState && typeof options.uiState === "object" ? options.uiState : {};
  const startupPerf = options.startupPerf && typeof options.startupPerf === "object" ? options.startupPerf : {};
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const wsBootstrapFallbackMs = Number.isFinite(options.wsBootstrapFallbackMs) ? options.wsBootstrapFallbackMs : 250;
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const terminalSearchState =
    options.terminalSearchState && typeof options.terminalSearchState === "object" ? options.terminalSearchState : {};
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createFallbackStore();
  const getAuthBootstrapRuntimeController =
    typeof options.getAuthBootstrapRuntimeController === "function" ? options.getAuthBootstrapRuntimeController : () => null;
  const getTerminalSearchController =
    typeof options.getTerminalSearchController === "function" ? options.getTerminalSearchController : () => null;
  const getCommandComposerAutocompleteController =
    typeof options.getCommandComposerAutocompleteController === "function"
      ? options.getCommandComposerAutocompleteController
      : () => null;
  const getCommandComposerRuntimeController =
    typeof options.getCommandComposerRuntimeController === "function" ? options.getCommandComposerRuntimeController : () => null;
  const getCommandTargetRuntimeController =
    typeof options.getCommandTargetRuntimeController === "function" ? options.getCommandTargetRuntimeController : () => null;
  const getSessionGridController =
    typeof options.getSessionGridController === "function" ? options.getSessionGridController : () => null;
  const getConnectionProfileRuntimeController =
    typeof options.getConnectionProfileRuntimeController === "function"
      ? options.getConnectionProfileRuntimeController
      : () => null;
  const getControlPaneRuntimeController =
    typeof options.getControlPaneRuntimeController === "function" ? options.getControlPaneRuntimeController : () => null;
  const getOperatorComposerPlacementRuntimeController =
    typeof options.getOperatorComposerPlacementRuntimeController === "function"
      ? options.getOperatorComposerPlacementRuntimeController
      : () => null;
  const getWorkspacePresetRuntimeController =
    typeof options.getWorkspacePresetRuntimeController === "function"
      ? options.getWorkspacePresetRuntimeController
      : () => null;
  const getWorkspaceManagerRuntimeController =
    typeof options.getWorkspaceManagerRuntimeController === "function"
      ? options.getWorkspaceManagerRuntimeController
      : () => null;
  const getSendHistoryRuntimeController =
    typeof options.getSendHistoryRuntimeController === "function" ? options.getSendHistoryRuntimeController : () => null;
  const getTrustedLocalHandoffRuntimeController =
    typeof options.getTrustedLocalHandoffRuntimeController === "function"
      ? options.getTrustedLocalHandoffRuntimeController
      : () => null;
  const getPasteObservationRuntimeController =
    typeof options.getPasteObservationRuntimeController === "function" ? options.getPasteObservationRuntimeController : () => null;
  const getCommandExecutor = typeof options.getCommandExecutor === "function" ? options.getCommandExecutor : () => null;
  let appRuntimeStateController = null;
  let appCommandUiFacadeController = null;
  const getAppRuntimeStateController =
    typeof options.getAppRuntimeStateController === "function"
      ? options.getAppRuntimeStateController
      : () => appRuntimeStateController;
  const getAppCommandUiFacadeController =
    typeof options.getAppCommandUiFacadeController === "function"
      ? options.getAppCommandUiFacadeController
      : () => appCommandUiFacadeController;

  appRuntimeStateController = createAppRuntimeStateController({
    windowRef,
    uiState,
    startupPerf,
    nowMs,
    wsBootstrapFallbackMs,
    debugLog,
    requestRender: () => getAppCommandUiFacadeController()?.render?.(),
    hasBootstrapInFlight: () => getAuthBootstrapRuntimeController()?.hasBootstrapInFlight?.() === true,
    runBootstrapFallback: () => getAuthBootstrapRuntimeController()?.bootstrapRuntimeFallback?.(),
    runBootstrapDevAuthToken: (runtimeOptions) =>
      getAuthBootstrapRuntimeController()?.bootstrapDevAuthToken?.(runtimeOptions) || false
  });

  appCommandUiFacadeController = createAppCommandUiFacadeController({
    store,
    uiState,
    startupPerf,
    nowMs,
    terminalSearchState,
    getAppRuntimeStateController,
    getTerminalSearchController,
    getCommandComposerAutocompleteController,
    getCommandComposerRuntimeController,
    getCommandTargetRuntimeController,
    getSessionGridController,
    getConnectionProfileRuntimeController,
    getControlPaneRuntimeController,
    getOperatorComposerPlacementRuntimeController,
    getWorkspacePresetRuntimeController,
    getWorkspaceManagerRuntimeController,
    getSendHistoryRuntimeController,
    getTrustedLocalHandoffRuntimeController,
    getPasteObservationRuntimeController,
    getCommandExecutor
  });

  const sessionAccessAssembly = createAppRuntimeSessionAccessAssembly({
    windowRef,
    documentRef,
    config,
    uiState,
    api: options.api || null,
    store,
    debugLog,
    requestRender: () => getAppCommandUiFacadeController()?.render?.(),
    setCommandFeedback: (message) => getAppCommandUiFacadeController()?.setCommandFeedback?.(message),
    clearCommandFeedbackAction: (runtimeOptions) => getAppRuntimeStateController()?.clearCommandFeedbackAction?.(runtimeOptions),
    setCommandFeedbackAction: (nextState) => getAppRuntimeStateController()?.setCommandFeedbackAction?.(nextState),
    clearError: () => getAppRuntimeStateController()?.clearError?.(),
    setError: (message) => getAppCommandUiFacadeController()?.setError?.(message),
    getErrorMessage: (error, fallback) => getAppCommandUiFacadeController()?.getErrorMessage?.(error, fallback) || fallback,
    getSessions: typeof options.getSessions === "function" ? options.getSessions : undefined,
    getSessionById: typeof options.getSessionById === "function" ? options.getSessionById : undefined,
    formatSessionToken: typeof options.formatSessionToken === "function" ? options.formatSessionToken : undefined,
    formatSessionDisplayName:
      typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : undefined,
    takeSessionControlScope:
      typeof options.takeSessionControlScope === "function" ? options.takeSessionControlScope : undefined,
    renameTrustedLocalClientIdentity:
      typeof options.renameTrustedLocalClientIdentity === "function"
        ? options.renameTrustedLocalClientIdentity
        : undefined,
    retryBlockedAction: typeof options.retryBlockedAction === "function" ? options.retryBlockedAction : undefined,
    applyResizeForSession: typeof options.applyResizeForSession === "function" ? options.applyResizeForSession : undefined,
    showControlPane: typeof options.showControlPane === "function" ? options.showControlPane : undefined,
    listCustomCommands: typeof options.listCustomCommands === "function" ? options.listCustomCommands : undefined,
    resolveDeckForSession: typeof options.resolveDeckForSession === "function" ? options.resolveDeckForSession : undefined,
    canReadClipboardText:
      typeof options.canReadClipboardText === "function" ? options.canReadClipboardText : undefined,
    readClipboardText: typeof options.readClipboardText === "function" ? options.readClipboardText : undefined,
    submitTerminalPaste: typeof options.submitTerminalPaste === "function" ? options.submitTerminalPaste : undefined,
    apiSendInput: typeof options.apiSendInput === "function" ? options.apiSendInput : undefined,
    sendInputWithConfiguredTerminator:
      typeof options.sendInputWithConfiguredTerminator === "function"
        ? options.sendInputWithConfiguredTerminator
        : undefined,
    normalizeCustomCommandPayloadForShell:
      typeof options.normalizeCustomCommandPayloadForShell === "function"
        ? options.normalizeCustomCommandPayloadForShell
        : undefined,
    normalizeSendTerminatorMode:
      typeof options.normalizeSendTerminatorMode === "function" ? options.normalizeSendTerminatorMode : undefined,
    getSessionSendTerminator:
      typeof options.getSessionSendTerminator === "function" ? options.getSessionSendTerminator : undefined,
    delayedSubmitMs: Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : undefined,
    recordCommandSubmission:
      typeof options.recordCommandSubmission === "function" ? options.recordCommandSubmission : undefined,
    isSessionActionBlocked:
      typeof options.isSessionActionBlocked === "function" ? options.isSessionActionBlocked : undefined,
    getBlockedSessionActionMessage:
      typeof options.getBlockedSessionActionMessage === "function" ? options.getBlockedSessionActionMessage : undefined,
    defaultDeckId: options.defaultDeckId
  });

  return {
    appRuntimeStateController,
    appCommandUiFacadeController,
    ...sessionAccessAssembly
  };
}
