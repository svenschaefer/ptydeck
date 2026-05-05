import { createAppRuntimeBootstrapAssembly as defaultCreateAppRuntimeBootstrapAssembly } from "./app-runtime-bootstrap-assembly.js";
import { createAppRuntimeInitializationController as defaultCreateAppRuntimeInitializationController } from "./app-runtime-initialization-controller.js";
import { createCommandPaletteRuntimeController as defaultCreateCommandPaletteRuntimeController } from "./command-palette-runtime-controller.js";
import { createSlashWorkflowRuntimeController as defaultCreateSlashWorkflowRuntimeController } from "./slash-workflow-runtime-controller.js";

export function createAppRuntimeStartupComposition(options = {}) {
  const createAppRuntimeBootstrapAssembly =
    typeof options.createAppRuntimeBootstrapAssembly === "function"
      ? options.createAppRuntimeBootstrapAssembly
      : defaultCreateAppRuntimeBootstrapAssembly;
  const createSlashWorkflowRuntimeController =
    typeof options.createSlashWorkflowRuntimeController === "function"
      ? options.createSlashWorkflowRuntimeController
      : defaultCreateSlashWorkflowRuntimeController;
  const createCommandPaletteRuntimeController =
    typeof options.createCommandPaletteRuntimeController === "function"
      ? options.createCommandPaletteRuntimeController
      : defaultCreateCommandPaletteRuntimeController;
  const createAppRuntimeInitializationController =
    typeof options.createAppRuntimeInitializationController === "function"
      ? options.createAppRuntimeInitializationController
      : defaultCreateAppRuntimeInitializationController;

  const store = options.store || null;
  const api = options.api || null;
  const config = options.config || null;
  const debugLogs = options.debugLogs === true;
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const uiState = options.uiState || {};
  const commandInput = options.commandInput || null;
  const terminals = options.terminals instanceof Map ? options.terminals : new Map();
  const terminalObservers = options.terminalObservers instanceof Map ? options.terminalObservers : new Map();
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => null;
  const recordTrace = typeof options.recordTrace === "function" ? options.recordTrace : () => {};
  const defaultDeckId = String(options.defaultDeckId || "default");
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const terminalThemePresets = Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [];
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys : [];
  const defaultTerminalTheme =
    options.defaultTerminalTheme && typeof options.defaultTerminalTheme === "object"
      ? options.defaultTerminalTheme
      : {};
  const streamInterpretationPluginEngine =
    options.streamInterpretationPluginEngine && typeof options.streamInterpretationPluginEngine === "object"
      ? options.streamInterpretationPluginEngine
      : null;
  const streamDebugTraceController =
    options.streamDebugTraceController && typeof options.streamDebugTraceController === "object"
      ? options.streamDebugTraceController
      : null;
  const traceDebugController =
    options.traceDebugController && typeof options.traceDebugController === "object"
      ? options.traceDebugController
      : null;
  const pasteObservationRuntimeController =
    options.pasteObservationRuntimeController && typeof options.pasteObservationRuntimeController === "object"
      ? options.pasteObservationRuntimeController
      : null;
  const appCommandUiFacadeController =
    options.appCommandUiFacadeController && typeof options.appCommandUiFacadeController === "object"
      ? options.appCommandUiFacadeController
      : null;
  const appLayoutDeckFacadeController =
    options.appLayoutDeckFacadeController && typeof options.appLayoutDeckFacadeController === "object"
      ? options.appLayoutDeckFacadeController
      : null;
  const appRuntimeStateController =
    options.appRuntimeStateController && typeof options.appRuntimeStateController === "object"
      ? options.appRuntimeStateController
      : null;
  const appSessionRuntimeFacadeController =
    options.appSessionRuntimeFacadeController && typeof options.appSessionRuntimeFacadeController === "object"
      ? options.appSessionRuntimeFacadeController
      : null;
  const sessionUiFacadeController =
    options.sessionUiFacadeController && typeof options.sessionUiFacadeController === "object"
      ? options.sessionUiFacadeController
      : null;
  const streamAdapter = options.streamAdapter || null;
  const sessionViewModel = options.sessionViewModel || null;
  const runtimeEventController = options.runtimeEventController || null;
  const deckRuntimeController = options.deckRuntimeController || null;
  const commandDiscoveryUsageStore =
    options.commandDiscoveryUsageStore && typeof options.commandDiscoveryUsageStore === "object"
      ? options.commandDiscoveryUsageStore
      : null;
  const clipboardRuntimeController =
    options.clipboardRuntimeController && typeof options.clipboardRuntimeController === "object"
      ? options.clipboardRuntimeController
      : null;
  const trustedLocalClientRuntimeController =
    options.trustedLocalClientRuntimeController && typeof options.trustedLocalClientRuntimeController === "object"
      ? options.trustedLocalClientRuntimeController
      : null;
  const replayViewerRuntimeController =
    options.replayViewerRuntimeController && typeof options.replayViewerRuntimeController === "object"
      ? options.replayViewerRuntimeController
      : null;
  const replayExportRuntimeController =
    options.replayExportRuntimeController && typeof options.replayExportRuntimeController === "object"
      ? options.replayExportRuntimeController
      : null;
  const fileTransferRuntimeController =
    options.fileTransferRuntimeController && typeof options.fileTransferRuntimeController === "object"
      ? options.fileTransferRuntimeController
      : null;
  const layoutRuntimeController = options.layoutRuntimeController || null;
  const terminalSearchController = options.terminalSearchController || null;
  const layoutProfileRuntimeController = options.layoutProfileRuntimeController || null;
  const connectionProfileRuntimeController = options.connectionProfileRuntimeController || null;
  const workspacePresetRuntimeController = options.workspacePresetRuntimeController || null;
  const workspaceManagerRuntimeController = options.workspaceManagerRuntimeController || null;
  const sendHistoryRuntimeController = options.sendHistoryRuntimeController || null;
  const broadcastInputRuntimeController = options.broadcastInputRuntimeController || null;
  const sessionTerminalResizeController = options.sessionTerminalResizeController || null;
  const sessionQuickSendRuntimeController =
    options.sessionQuickSendRuntimeController && typeof options.sessionQuickSendRuntimeController === "object"
      ? options.sessionQuickSendRuntimeController
      : null;
  const createBtn = options.createBtn || null;
  const deckCreateBtn = options.deckCreateBtn || null;
  const startupWarmupSkipBtn = options.startupWarmupSkipBtn || null;
  const sendBtn = options.sendBtn || null;
  const commandFeedbackActionBtn = options.commandFeedbackActionBtn || null;
  const commandGuardSendOnceBtn = options.commandGuardSendOnceBtn || null;
  const commandGuardCancelBtn = options.commandGuardCancelBtn || null;
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || globalThis.document || null;
  const wsStateRef = options.wsStateRef || { current: null };
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const getReadOnlyModeMessage =
    typeof options.getReadOnlyModeMessage === "function"
      ? options.getReadOnlyModeMessage
      : () => "Read-only spectator mode. Write actions are disabled.";
  const canWriteToSession = typeof options.canWriteToSession === "function" ? options.canWriteToSession : () => true;
  const getSessionWriteBlockedMessage =
    typeof options.getSessionWriteBlockedMessage === "function"
      ? options.getSessionWriteBlockedMessage
      : () => "This client cannot send input to the selected session.";
  const showBlockedWriteReclaimUi =
    typeof options.showBlockedWriteReclaimUi === "function" ? options.showBlockedWriteReclaimUi : () => false;
  const setAccessState = typeof options.setAccessState === "function" ? options.setAccessState : () => {};
  const handleCommandFeedbackAction =
    typeof options.handleCommandFeedbackAction === "function"
      ? options.handleCommandFeedbackAction
      : () => Promise.resolve(false);
  const devAuthRefreshMinDelayMs = Number.isFinite(options.devAuthRefreshMinDelayMs)
    ? options.devAuthRefreshMinDelayMs
    : 15000;
  const devAuthRefreshSafetyMs = Number.isFinite(options.devAuthRefreshSafetyMs)
    ? options.devAuthRefreshSafetyMs
    : 60000;
  const devAuthRetryDelayMs = Number.isFinite(options.devAuthRetryDelayMs) ? options.devAuthRetryDelayMs : 30000;

  const slashWorkflowRuntimeController = createSlashWorkflowRuntimeController({
    store,
    executeControlCommandDetailed: (interpreted) =>
      appCommandUiFacadeController?.executeControlCommandDetailed?.(interpreted) || { ok: true, feedback: "" },
    setWorkflowRunState: (nextState) => appRuntimeStateController?.setWorkflowRunState?.(nextState),
    clearWorkflowRunState: (runtimeOptions) => appRuntimeStateController?.clearWorkflowRunState?.(runtimeOptions),
    requestRender: () => appCommandUiFacadeController?.render?.(),
    formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    getTerminalEntry: (sessionId) => terminals.get(sessionId) || null,
    apiInterruptSession: (sessionId) => api?.interruptSession?.(sessionId),
    apiKillSession: (sessionId) => api?.killSession?.(sessionId),
    debugLog
  });

  const bootstrapComposition = createAppRuntimeBootstrapAssembly({
    store,
    api,
    config,
    debugLogs,
    debugLog,
    uiState,
    commandInput,
    terminals,
    terminalObservers,
    getTerminalSettings,
    recordTrace,
    defaultDeckId,
    delayedSubmitMs,
    systemSlashCommands,
    terminalThemePresets,
    themeProfileKeys,
    defaultTerminalTheme,
    streamInterpretationPluginEngine,
    streamDebugTraceController,
    traceDebugController,
    pasteObservationRuntimeController,
    appCommandUiFacadeController,
    appLayoutDeckFacadeController,
    appRuntimeStateController,
    appSessionRuntimeFacadeController,
    sessionUiFacadeController,
    streamAdapter,
    sessionViewModel,
    runtimeEventController,
    deckRuntimeController,
    commandDiscoveryUsageStore,
    clipboardRuntimeController,
    trustedLocalClientRuntimeController,
    replayViewerRuntimeController,
    replayExportRuntimeController,
    fileTransferRuntimeController,
    layoutRuntimeController,
    terminalSearchController,
    layoutProfileRuntimeController,
    connectionProfileRuntimeController,
    workspacePresetRuntimeController,
    workspaceManagerRuntimeController,
    sendHistoryRuntimeController,
    broadcastInputRuntimeController,
    sessionTerminalResizeController,
    sessionQuickSendRuntimeController,
    slashWorkflowRuntimeController,
    createBtn,
    deckCreateBtn,
    startupWarmupSkipBtn,
    sendBtn,
    commandFeedbackActionBtn,
    commandGuardSendOnceBtn,
    commandGuardCancelBtn,
    windowRef,
    documentRef,
    wsStateRef,
    isReadOnlyMode,
    getReadOnlyModeMessage,
    canWriteToSession,
    getSessionWriteBlockedMessage,
    showBlockedWriteReclaimUi,
    setAccessState,
    handleCommandFeedbackAction,
    devAuthRefreshMinDelayMs,
    devAuthRefreshSafetyMs,
    devAuthRetryDelayMs
  });

  const commandTargetRuntimeController = bootstrapComposition?.commandTargetRuntimeController || null;
  const commandPaletteRuntimeController = createCommandPaletteRuntimeController({
    windowRef,
    documentRef,
    dialogEl: options.commandPaletteDialogEl || null,
    searchInputEl: options.commandPaletteInputEl || null,
    resultsEl: options.commandPaletteResultsEl || null,
    emptyEl: options.commandPaletteEmptyEl || null,
    metaEl: options.commandPaletteMetaEl || null,
    closeBtn: options.commandPaletteCloseBtn || null,
    commandInput,
    systemSlashCommands,
    getState: () => store?.getState?.() || {},
    getUsageScore: (key) => commandDiscoveryUsageStore?.getUsageScore?.(key) || 0,
    recordUsage: (key) => commandDiscoveryUsageStore?.record?.(key),
    listCustomCommands: () => appCommandUiFacadeController?.listCustomCommands?.() || [],
    formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    activateSessionTarget: (session) =>
      commandTargetRuntimeController?.activateSessionTarget?.(session) || { ok: false, message: "" },
    activateDeckTarget: (deck) =>
      commandTargetRuntimeController?.activateDeckTarget?.(deck) || { ok: false, message: "" },
    setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
    setComposerValue: (value) => {
      if (!commandInput) {
        return;
      }
      commandInput.value = String(value || "");
      if (typeof commandInput.setSelectionRange === "function") {
        const length = commandInput.value.length;
        commandInput.setSelectionRange(length, length);
      }
      commandInput.focus?.();
      if (typeof commandInput.dispatchEvent === "function") {
        if (typeof windowRef?.Event === "function") {
          commandInput.dispatchEvent(new windowRef.Event("input", { bubbles: true }));
        } else {
          commandInput.dispatchEvent({ type: "input" });
        }
      }
    }
  });

  const appBootstrapCompositionController = bootstrapComposition?.appBootstrapCompositionController || null;
  const appRuntimeInitializationController = createAppRuntimeInitializationController({
    maybeRedirectToCanonicalOrigin: options.maybeRedirectToCanonicalOrigin,
    consumeOriginHandoffSourceFromWindow: options.consumeOriginHandoffSourceFromWindow,
    ensureStartupBackup: options.ensureStartupBackup,
    getTrustedLocalClientIdentity: options.getTrustedLocalClientIdentity,
    ensureTrustedLocalClientIdentity: options.ensureTrustedLocalClientIdentity,
    setRuntimeClientIdentityCreatedOnThisOrigin: options.setRuntimeClientIdentityCreatedOnThisOrigin,
    setTrustedLocalClientLabel: options.setTrustedLocalClientLabel,
    setRuntimeClientId: options.setRuntimeClientId,
    bootstrapUiAndRuntime: () => appBootstrapCompositionController?.bootstrapUiAndRuntime?.(),
    applyInitializationError: options.applyInitializationError
  });

  return {
    ...bootstrapComposition,
    slashWorkflowRuntimeController,
    commandPaletteRuntimeController,
    appRuntimeInitializationController
  };
}
