import { createSessionControlRuntimeController as defaultCreateSessionControlRuntimeController } from "./session-control-runtime-controller.js";
import { createSessionQuickSendRuntimeController as defaultCreateSessionQuickSendRuntimeController } from "./session-quick-send-runtime-controller.js";

function createNoopStore() {
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

function resolveStateArray(state, key) {
  const value = state && Array.isArray(state[key]) ? state[key] : [];
  return value;
}

function resolveDeckSummaryFromState(store, session, fallbackDeckId = "default") {
  const state = store?.getState?.() || {};
  const decks = resolveStateArray(state, "decks");
  const deckId = String(session?.deckId || fallbackDeckId || "default").trim() || "default";
  const deck = decks.find((entry) => String(entry?.id || "").trim() === deckId) || null;
  return {
    id: deck?.id || deckId,
    name: deck?.name || deckId || "Default"
  };
}

export function createAppRuntimeSessionAccessAssembly(options = {}) {
  const createSessionControlRuntimeController =
    typeof options.createSessionControlRuntimeController === "function"
      ? options.createSessionControlRuntimeController
      : defaultCreateSessionControlRuntimeController;
  const createSessionQuickSendRuntimeController =
    typeof options.createSessionQuickSendRuntimeController === "function"
      ? options.createSessionQuickSendRuntimeController
      : defaultCreateSessionQuickSendRuntimeController;
  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const config = options.config && typeof options.config === "object" ? options.config : {};
  const uiState = options.uiState && typeof options.uiState === "object" ? options.uiState : {};
  const api = options.api || null;
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createNoopStore();
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const clearCommandFeedbackAction =
    typeof options.clearCommandFeedbackAction === "function" ? options.clearCommandFeedbackAction : () => {};
  const setCommandFeedbackAction =
    typeof options.setCommandFeedbackAction === "function" ? options.setCommandFeedbackAction : () => {};
  const clearError = typeof options.clearError === "function" ? options.clearError : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage =
    typeof options.getErrorMessage === "function"
      ? options.getErrorMessage
      : (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);
  const getSessions =
    typeof options.getSessions === "function" ? options.getSessions : () => resolveStateArray(store.getState(), "sessions");
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "").trim() || "?";
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "").trim();
  const takeSessionControlScope =
    typeof options.takeSessionControlScope === "function" ? options.takeSessionControlScope : async () => ({});
  const renameTrustedLocalClientIdentity =
    typeof options.renameTrustedLocalClientIdentity === "function"
      ? options.renameTrustedLocalClientIdentity
      : (label) => ({ label });
  const retryBlockedAction =
    typeof options.retryBlockedAction === "function" ? options.retryBlockedAction : async () => false;
  const applyResizeForSession =
    typeof options.applyResizeForSession === "function" ? options.applyResizeForSession : () => {};
  const showControlPane = typeof options.showControlPane === "function" ? options.showControlPane : () => {};
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const resolveDeckForSession =
    typeof options.resolveDeckForSession === "function"
      ? options.resolveDeckForSession
      : (session) => resolveDeckSummaryFromState(store, session, options.defaultDeckId);
  const canReadClipboardText =
    typeof options.canReadClipboardText === "function" ? options.canReadClipboardText : () => false;
  const readClipboardText =
    typeof options.readClipboardText === "function" ? options.readClipboardText : async () => "";
  const submitTerminalPaste =
    typeof options.submitTerminalPaste === "function"
      ? options.submitTerminalPaste
      : async () => ({ ok: false, status: "unavailable", feedback: "Clipboard send is unavailable." });
  const apiSendInput =
    typeof options.apiSendInput === "function"
      ? options.apiSendInput
      : typeof api?.sendInput === "function"
        ? (sessionId, data, requestOptions) => api.sendInput(sessionId, data, requestOptions)
        : async () => undefined;
  const sendInputWithConfiguredTerminator =
    typeof options.sendInputWithConfiguredTerminator === "function"
      ? options.sendInputWithConfiguredTerminator
      : async () => undefined;
  const normalizeCustomCommandPayloadForShell =
    typeof options.normalizeCustomCommandPayloadForShell === "function"
      ? options.normalizeCustomCommandPayloadForShell
      : (value) => String(value ?? "");
  const normalizeSendTerminatorMode =
    typeof options.normalizeSendTerminatorMode === "function" ? options.normalizeSendTerminatorMode : () => "auto";
  const getSessionSendTerminator =
    typeof options.getSessionSendTerminator === "function" ? options.getSessionSendTerminator : () => "auto";
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const recordCommandSubmission =
    typeof store.recordSessionCommandSubmission === "function"
      ? (sessionId, submission) => store.recordSessionCommandSubmission(sessionId, submission)
      : typeof options.recordCommandSubmission === "function"
        ? options.recordCommandSubmission
        : () => {};
  const isSessionActionBlocked =
    typeof options.isSessionActionBlocked === "function" ? options.isSessionActionBlocked : () => false;
  const getBlockedSessionActionMessage =
    typeof options.getBlockedSessionActionMessage === "function"
      ? options.getBlockedSessionActionMessage
      : () => "Quick send is unavailable for this session.";

  const sessionControlRuntimeController = createSessionControlRuntimeController({
    windowRef,
    documentRef,
    config,
    uiState,
    api,
    requestRender,
    setCommandFeedback,
    clearCommandFeedbackAction,
    setCommandFeedbackAction,
    clearError,
    getSessions,
    getSessionById,
    formatSessionToken,
    formatSessionDisplayName,
    takeSessionControlScope,
    renameTrustedLocalClientIdentity,
    retryBlockedAction,
    applyResizeForSession,
    showControlPane,
    debugLog
  });

  const setAccessState = sessionControlRuntimeController.setAccessState;
  const isReadOnlyMode = sessionControlRuntimeController.isReadOnlyMode;
  const getReadOnlyModeMessage = sessionControlRuntimeController.getReadOnlyModeMessage;
  const canWriteToSession = sessionControlRuntimeController.canWriteToSession;
  const getSessionWriteBlockMessage = sessionControlRuntimeController.getSessionWriteBlockMessage;
  const canTakeSessionControl = sessionControlRuntimeController.canTakeSessionControl;
  const setRuntimeClientId = sessionControlRuntimeController.setRuntimeClientId;
  const getRuntimeClientId = sessionControlRuntimeController.getRuntimeClientId;
  const renameTrustedLocalDevice = sessionControlRuntimeController.renameTrustedLocalDevice;
  const showBlockedWriteReclaimUi = sessionControlRuntimeController.showBlockedWriteReclaimUi;
  const renderSessionControl = sessionControlRuntimeController.renderSessionControl;
  const maybeRedirectToCanonicalOrigin = sessionControlRuntimeController.maybeRedirectToCanonicalOrigin;
  const maybeAutoRepairOriginHandoffControl = () => sessionControlRuntimeController.maybeAutoRepairOriginHandoffControl();

  const sessionQuickSendRuntimeController = createSessionQuickSendRuntimeController({
    windowRef,
    documentRef,
    listCustomCommands,
    getSessionById,
    getSessions,
    resolveDeckForSession: (session) => resolveDeckForSession(session) || resolveDeckSummaryFromState(store, session, options.defaultDeckId),
    canReadClipboardText,
    readClipboardText,
    submitTerminalPaste,
    apiSendInput,
    sendInputWithConfiguredTerminator,
    normalizeCustomCommandPayloadForShell,
    normalizeSendTerminatorMode,
    getSessionSendTerminator,
    delayedSubmitMs,
    recordCommandSubmission,
    canWriteToSession,
    isSessionActionBlocked,
    getBlockedSessionActionMessage,
    isReadOnlyMode,
    getReadOnlyModeMessage,
    getSessionWriteBlockedMessage: getSessionWriteBlockMessage,
    setCommandFeedback,
    setError,
    clearError,
    getErrorMessage,
    requestRender,
    formatSessionToken,
    formatSessionDisplayName
  });

  function handleCommandFeedbackAction() {
    return sessionControlRuntimeController.handleCommandFeedbackAction(uiState.commandFeedbackActionSessionId);
  }

  return {
    sessionControlRuntimeController,
    sessionQuickSendRuntimeController,
    setAccessState,
    isReadOnlyMode,
    getReadOnlyModeMessage,
    canWriteToSession,
    getSessionWriteBlockMessage,
    canTakeSessionControl,
    setRuntimeClientId,
    getRuntimeClientId,
    renameTrustedLocalDevice,
    showBlockedWriteReclaimUi,
    renderSessionControl,
    maybeRedirectToCanonicalOrigin,
    maybeAutoRepairOriginHandoffControl,
    handleCommandFeedbackAction
  };
}
