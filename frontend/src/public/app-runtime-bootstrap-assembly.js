import { createAppBootstrapCompositionController as defaultCreateAppBootstrapCompositionController } from "./app-bootstrap-composition-controller.js";

function createNoopTraceController() {
  return {
    record() {},
    dispose() {}
  };
}

function createNoopUsageStore() {
  return {
    getUsageScore() {
      return 0;
    },
    record() {}
  };
}

function createNoopClipboardRuntimeController() {
  return {
    async readText() {
      return "";
    },
    async writeText() {
      return false;
    }
  };
}

function createNoopReplayExportRuntimeController() {
  return {
    exportSessionReplay() {
      return Promise.resolve(null);
    },
    loadSessionReplayExcerpt() {
      return Promise.resolve(null);
    },
    copySessionReplayExcerpt() {
      return Promise.resolve(null);
    },
    previewSessionReplayExcerpt() {
      return null;
    }
  };
}

function createNoopFileTransferRuntimeController() {
  return {
    uploadSessionFile() {
      return Promise.resolve(null);
    },
    downloadSessionFile() {
      return Promise.resolve(null);
    }
  };
}

function createNoopTrustedLocalClientRuntimeController() {
  return {
    getWsTicketPayload() {
      return {};
    }
  };
}

export function createAppRuntimeBootstrapAssembly(options = {}) {
  const createAppBootstrapCompositionController =
    typeof options.createAppBootstrapCompositionController === "function"
      ? options.createAppBootstrapCompositionController
      : defaultCreateAppBootstrapCompositionController;
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
      : {
          interpretRuntimeEvent() {
            return { batches: [], errors: [] };
          }
        };
  const streamDebugTraceController =
    options.streamDebugTraceController && typeof options.streamDebugTraceController === "object"
      ? options.streamDebugTraceController
      : createNoopTraceController();
  const traceDebugController =
    options.traceDebugController && typeof options.traceDebugController === "object"
      ? options.traceDebugController
      : createNoopTraceController();
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
      : createNoopUsageStore();
  const clipboardRuntimeController =
    options.clipboardRuntimeController && typeof options.clipboardRuntimeController === "object"
      ? options.clipboardRuntimeController
      : createNoopClipboardRuntimeController();
  const trustedLocalClientRuntimeController =
    options.trustedLocalClientRuntimeController && typeof options.trustedLocalClientRuntimeController === "object"
      ? options.trustedLocalClientRuntimeController
      : createNoopTrustedLocalClientRuntimeController();
  const replayViewerRuntimeController =
    options.replayViewerRuntimeController && typeof options.replayViewerRuntimeController === "object"
      ? options.replayViewerRuntimeController
      : null;
  const replayExportRuntimeController =
    options.replayExportRuntimeController && typeof options.replayExportRuntimeController === "object"
      ? options.replayExportRuntimeController
      : createNoopReplayExportRuntimeController();
  const fileTransferRuntimeController =
    options.fileTransferRuntimeController && typeof options.fileTransferRuntimeController === "object"
      ? options.fileTransferRuntimeController
      : createNoopFileTransferRuntimeController();
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
  const slashWorkflowRuntimeController =
    options.slashWorkflowRuntimeController && typeof options.slashWorkflowRuntimeController === "object"
      ? options.slashWorkflowRuntimeController
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

  const appBootstrapCompositionController = createAppBootstrapCompositionController({
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
    commandFeedbackActionBtn,
    commandGuardSendOnceBtn,
    commandGuardCancelBtn,
    windowRef,
    documentRef,
    wsStateRef,
    interpretRuntimeEvent: (event) =>
      streamInterpretationPluginEngine.interpretRuntimeEvent(event, {
        getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId)
      }),
    applySessionInterpretationActions: (sessionId, actions) => store?.applySessionInterpretationActions?.(sessionId, actions),
    observeSessionData: (sessionId, data) => {
      streamDebugTraceController.record(sessionId, "ws.session.data", {
        chunk: data,
        hasTerminal: terminals.has(sessionId)
      });
      pasteObservationRuntimeController?.observeSessionOutput?.(sessionId, data);
    },
    createBtn,
    deckCreateBtn,
    startupWarmupSkipBtn,
    sendBtn,
    layoutRuntimeController,
    terminalSearchController,
    layoutProfileRuntimeController,
    connectionProfileRuntimeController,
    workspacePresetRuntimeController,
    workspaceManagerRuntimeController,
    sendHistoryRuntimeController,
    pasteObservationRuntimeController,
    broadcastInputRuntimeController,
    sessionTerminalResizeController,
    appCommandUiFacadeController,
    appLayoutDeckFacadeController,
    appRuntimeStateController,
    appSessionRuntimeFacadeController,
    sessionUiFacadeController,
    streamAdapter,
    sessionViewModel,
    runtimeEventController,
    deckRuntimeController,
    buildCustomCommandUsageApiOptions: (command) =>
      sessionQuickSendRuntimeController?.buildCustomCommandUsageApiOptions?.(command),
    getDiscoveryUsageScore: (key) => commandDiscoveryUsageStore.getUsageScore(key),
    recordDiscoveryUsage: (key) => commandDiscoveryUsageStore.record(key),
    readClipboardText: () => clipboardRuntimeController.readText(),
    writeClipboardText: (text) => clipboardRuntimeController.writeText(text),
    isReadOnlyMode,
    getReadOnlyModeMessage,
    canWriteToSession,
    getSessionWriteBlockedMessage,
    showBlockedWriteReclaimUi,
    getWsTicketPayload: () => trustedLocalClientRuntimeController.getWsTicketPayload?.() || {},
    setAccessState,
    handleCommandFeedbackAction,
    openSessionReplayViewer: (session) => replayViewerRuntimeController?.openSessionReplayViewer?.(session),
    exportSessionReplayDownload: (session) =>
      replayExportRuntimeController.exportSessionReplay(session, { mode: "download" }),
    exportSessionReplayCopy: (session) => replayExportRuntimeController.exportSessionReplay(session, { mode: "copy" }),
    loadSessionReplayExcerpt: (session, selector) =>
      replayExportRuntimeController.loadSessionReplayExcerpt(session, selector),
    copySessionReplayExcerpt: (session, selector, runtimeOptions) =>
      replayExportRuntimeController.copySessionReplayExcerpt(session, selector, runtimeOptions),
    previewSessionReplayExcerpt: (session, payload) =>
      replayExportRuntimeController.previewSessionReplayExcerpt(session, payload),
    listShares: () => api?.listShares?.() || Promise.resolve([]),
    createShareLink: (payload) => api?.createShareLink?.(payload) || Promise.resolve(null),
    revokeShareLink: (shareId) => api?.revokeShareLink?.(shareId) || Promise.resolve(false),
    uploadSessionFile: (session, runtimeOptions) =>
      fileTransferRuntimeController.uploadSessionFile(session, runtimeOptions),
    downloadSessionFile: (session, runtimeOptions) =>
      fileTransferRuntimeController.downloadSessionFile(session, runtimeOptions),
    runWorkflowDetailed: (interpreted) => slashWorkflowRuntimeController?.runWorkflowDetailed?.(interpreted),
    stopWorkflow: () => slashWorkflowRuntimeController?.stopActiveWorkflow?.() === true,
    interruptWorkflowSession: () => slashWorkflowRuntimeController?.interruptWorkflowSession?.() || Promise.resolve(""),
    killWorkflowSession: () => slashWorkflowRuntimeController?.killWorkflowSession?.() || Promise.resolve(""),
    disposeWorkflowRuntime: () => slashWorkflowRuntimeController?.dispose?.(),
    disposeStreamDebugTrace: () => {
      streamDebugTraceController.dispose();
      traceDebugController.dispose();
    },
    devAuthRefreshMinDelayMs,
    devAuthRefreshSafetyMs,
    devAuthRetryDelayMs
  });

  const composedControllers = appBootstrapCompositionController.composeControllers?.() || {};

  return {
    appBootstrapCompositionController,
    ...composedControllers
  };
}
