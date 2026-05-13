import { createRuntimeEventController as defaultCreateRuntimeEventController } from "./runtime-event-controller.js";

function createNoopTraceDebugController() {
  return {
    record() {}
  };
}

export function createAppRuntimeRecoveryComposition(options = {}) {
  const createRuntimeEventController =
    typeof options.createRuntimeEventController === "function"
      ? options.createRuntimeEventController
      : defaultCreateRuntimeEventController;
  const defaultDeckId = String(options.defaultDeckId || "default");
  const traceDebugController =
    options.traceDebugController && typeof options.traceDebugController.record === "function"
      ? options.traceDebugController
      : createNoopTraceDebugController();
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const maybeAutoRepairOriginHandoffControl =
    typeof options.maybeAutoRepairOriginHandoffControl === "function"
      ? options.maybeAutoRepairOriginHandoffControl
      : () => {};
  const setSessions = typeof options.setSessions === "function" ? options.setSessions : () => {};
  const upsertSession = typeof options.upsertSession === "function" ? options.upsertSession : () => {};
  const getErrorMessage =
    typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_error, fallback) => fallback;

  function scheduleOriginHandoffAutoRepair() {
    Promise.resolve(maybeAutoRepairOriginHandoffControl()).catch(() => {});
  }

  const runtimeEventController = createRuntimeEventController({
    defaultDeckId,
    getPreferredActiveDeckId:
      typeof options.getPreferredActiveDeckId === "function" ? options.getPreferredActiveDeckId : () => "",
    setDecks: typeof options.setDecks === "function" ? options.setDecks : () => {},
    replaceCustomCommandState:
      typeof options.replaceCustomCommandState === "function" ? options.replaceCustomCommandState : () => {},
    setSessions: (sessions) => {
      setSessions(sessions);
      scheduleOriginHandoffAutoRepair();
    },
    replaySnapshotOutputs:
      typeof options.replaySnapshotOutputs === "function" ? options.replaySnapshotOutputs : () => {},
    scheduleSnapshotTerminalStabilization:
      typeof options.scheduleSnapshotTerminalStabilization === "function"
        ? options.scheduleSnapshotTerminalStabilization
        : () => {},
    scheduleCommandPreview:
      typeof options.scheduleCommandPreview === "function" ? options.scheduleCommandPreview : () => {},
    scheduleCommandSuggestions:
      typeof options.scheduleCommandSuggestions === "function" ? options.scheduleCommandSuggestions : () => {},
    clearError: typeof options.clearError === "function" ? options.clearError : () => {},
    markRuntimeBootstrapReady:
      typeof options.markRuntimeBootstrapReady === "function" ? options.markRuntimeBootstrapReady : () => {},
    setRuntimeClientId: typeof options.setRuntimeClientId === "function" ? options.setRuntimeClientId : () => {},
    setComposerPlacementState:
      typeof options.setComposerPlacementState === "function" ? options.setComposerPlacementState : () => {},
    applySessionInterpretationActions:
      typeof options.applySessionInterpretationActions === "function" ? options.applySessionInterpretationActions : () => {},
    upsertSession: (session) => {
      upsertSession(session);
      scheduleOriginHandoffAutoRepair();
    },
    markSessionExited: typeof options.markSessionExited === "function" ? options.markSessionExited : () => {},
    markSessionClosed: typeof options.markSessionClosed === "function" ? options.markSessionClosed : () => {},
    upsertDeckInState: typeof options.upsertDeckInState === "function" ? options.upsertDeckInState : () => {},
    removeDeckFromState: typeof options.removeDeckFromState === "function" ? options.removeDeckFromState : () => {},
    upsertCustomCommandState:
      typeof options.upsertCustomCommandState === "function" ? options.upsertCustomCommandState : () => {},
    removeCustomCommandState:
      typeof options.removeCustomCommandState === "function" ? options.removeCustomCommandState : () => {},
    getSessionById: typeof options.getSessionById === "function" ? options.getSessionById : () => null,
    setActiveSession: typeof options.setActiveSession === "function" ? options.setActiveSession : () => {},
    isSessionUnrestored: typeof options.isSessionUnrestored === "function" ? options.isSessionUnrestored : () => false,
    getUnrestoredSessionMessage:
      typeof options.getUnrestoredSessionMessage === "function" ? options.getUnrestoredSessionMessage : () => "",
    isSessionExited: typeof options.isSessionExited === "function" ? options.isSessionExited : () => false,
    getExitedSessionMessage:
      typeof options.getExitedSessionMessage === "function" ? options.getExitedSessionMessage : () => "",
    canWriteToSession: typeof options.canWriteToSession === "function" ? options.canWriteToSession : () => true,
    getSessionWriteBlockedMessage:
      typeof options.getSessionWriteBlockedMessage === "function"
        ? options.getSessionWriteBlockedMessage
        : () => "This client cannot send input to the selected session.",
    showBlockedWriteReclaimUi:
      typeof options.showBlockedWriteReclaimUi === "function" ? options.showBlockedWriteReclaimUi : () => false,
    isReadOnlyMode: typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false,
    getReadOnlyModeMessage:
      typeof options.getReadOnlyModeMessage === "function"
        ? options.getReadOnlyModeMessage
        : () => "Read-only spectator mode. Write actions are disabled.",
    setError: typeof options.setError === "function" ? options.setError : () => {},
    sendInput: typeof options.sendInput === "function" ? options.sendInput : () => Promise.resolve(),
    getErrorMessage,
    reportTerminalInputError: (sessionId, error, runtimeOptions = {}) => {
      const message = getErrorMessage(error, "Failed to send terminal input.") || "Failed to send terminal input.";
      const payload = {
        sessionId: String(sessionId || "").trim(),
        source: String(runtimeOptions?.source || "").trim() || "terminal-input",
        suppressed: runtimeOptions?.suppressed === true,
        name: typeof error?.name === "string" ? error.name : "",
        message
      };
      traceDebugController.record("terminal.input.error", payload);
      debugLog("terminal.input.error", payload);
    }
  });

  return {
    runtimeEventController
  };
}
