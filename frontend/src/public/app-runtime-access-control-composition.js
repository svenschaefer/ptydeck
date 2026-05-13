import { createAppRuntimeAccessControlAssembly as defaultCreateAppRuntimeAccessControlAssembly } from "./app-runtime-access-control-assembly.js";

export function createAppRuntimeAccessControlComposition(options = {}) {
  const createAppRuntimeAccessControlAssembly =
    typeof options.createAppRuntimeAccessControlAssembly === "function"
      ? options.createAppRuntimeAccessControlAssembly
      : defaultCreateAppRuntimeAccessControlAssembly;

  const appRuntimeAccessControlAssembly = createAppRuntimeAccessControlAssembly({
    initializationAccessOptions: {
      windowRef: options.windowRef,
      documentRef: options.documentRef,
      config: options.config,
      uiState: options.uiState,
      startupPerf: options.startupPerf,
      nowMs: options.nowMs,
      wsBootstrapFallbackMs: options.wsBootstrapFallbackMs,
      debugLog: options.debugLog,
      terminalSearchState: options.terminalSearchState,
      store: options.store,
      getAppRuntimeStateController: options.getAppRuntimeStateController,
      getAppCommandUiFacadeController: options.getAppCommandUiFacadeController,
      getAuthBootstrapRuntimeController: options.getAuthBootstrapRuntimeController,
      getTerminalSearchController: options.getTerminalSearchController,
      getCommandComposerAutocompleteController: options.getCommandComposerAutocompleteController,
      getCommandComposerRuntimeController: options.getCommandComposerRuntimeController,
      getCommandTargetRuntimeController: options.getCommandTargetRuntimeController,
      getSessionGridController: options.getSessionGridController,
      getConnectionProfileRuntimeController: options.getConnectionProfileRuntimeController,
      getControlPaneRuntimeController: options.getControlPaneRuntimeController,
      getOperatorComposerPlacementRuntimeController: options.getOperatorComposerPlacementRuntimeController,
      getWorkspacePresetRuntimeController: options.getWorkspacePresetRuntimeController,
      getWorkspaceManagerRuntimeController: options.getWorkspaceManagerRuntimeController,
      getSendHistoryRuntimeController: options.getSendHistoryRuntimeController,
      getTrustedLocalHandoffRuntimeController: options.getTrustedLocalHandoffRuntimeController,
      getPasteObservationRuntimeController: options.getPasteObservationRuntimeController,
      getCommandExecutor: options.getCommandExecutor,
      api: options.api,
      getSessions: options.getSessions,
      getSessionById: options.getSessionById,
      formatSessionToken: options.formatSessionToken,
      formatSessionDisplayName: options.formatSessionDisplayName,
      takeSessionControlScope: options.takeSessionControlScope,
      renameTrustedLocalClientIdentity: options.renameTrustedLocalClientIdentity,
      retryBlockedAction: options.retryBlockedAction,
      applyResizeForSession: options.applyResizeForSession,
      showControlPane: options.showControlPane,
      listCustomCommands: options.listCustomCommands,
      resolveDeckForSession: options.resolveDeckForSession,
      canReadClipboardText: options.canReadClipboardText,
      readClipboardText: options.readClipboardText,
      submitTerminalPaste: options.submitTerminalPaste,
      apiSendInput: options.apiSendInput,
      sendInputWithConfiguredTerminator: options.sendInputWithConfiguredTerminator,
      normalizeCustomCommandPayloadForShell: options.normalizeCustomCommandPayloadForShell,
      normalizeSendTerminatorMode: options.normalizeSendTerminatorMode,
      getSessionSendTerminator: options.getSessionSendTerminator,
      delayedSubmitMs: options.delayedSubmitMs,
      recordCommandSubmission: options.recordCommandSubmission,
      isSessionActionBlocked: options.isSessionActionBlocked,
      getBlockedSessionActionMessage: options.getBlockedSessionActionMessage,
      defaultDeckId: options.defaultDeckId
    },
    testHooks: options.testHooks,
    uiState: options.uiState,
    api: options.api,
    store: options.store,
    streamAdapter: options.streamAdapter,
    getInitializationErrorMessage:
      typeof options.getInitializationErrorMessage === "function" ? options.getInitializationErrorMessage : () => "",
    getTrustedLocalHandoffRuntimeController:
      typeof options.getTrustedLocalHandoffRuntimeController === "function"
        ? options.getTrustedLocalHandoffRuntimeController
        : () => null,
    getOriginHandoffSourceOrigin:
      typeof options.getOriginHandoffSourceOrigin === "function" ? options.getOriginHandoffSourceOrigin : () => "",
    setOriginHandoffSourceOrigin:
      typeof options.setOriginHandoffSourceOrigin === "function" ? options.setOriginHandoffSourceOrigin : () => {},
    setRuntimeClientIdentityCreatedOnThisOrigin:
      typeof options.setRuntimeClientIdentityCreatedOnThisOrigin === "function"
        ? options.setRuntimeClientIdentityCreatedOnThisOrigin
        : () => {},
    normalizeCommandFeedbackActionSessionId:
      typeof options.normalizeCommandFeedbackActionSessionId === "function"
        ? options.normalizeCommandFeedbackActionSessionId
        : (sessionId) => sessionId,
    collaboratorSetters: {
      appSessionRuntimeFacadeController: (value) => options.setAppSessionRuntimeFacadeController?.(value),
      appRuntimeStateController: (value) => options.setAppRuntimeStateController?.(value),
      appCommandUiFacadeController: (value) => options.setAppCommandUiFacadeController?.(value),
      trustedLocalHandoffRuntimeController: (value) => options.setTrustedLocalHandoffRuntimeController?.(value),
      commandComposerRuntimeController: (value) => options.setCommandComposerRuntimeController?.(value),
      sessionTerminalResizeController: (value) => options.setSessionTerminalResizeController?.(value),
      controlPaneRuntimeController: (value) => options.setControlPaneRuntimeController?.(value)
    }
  });

  return {
    appRuntimeAccessControlAssembly,
    appRuntimeStateController: appRuntimeAccessControlAssembly.appRuntimeStateController,
    appCommandUiFacadeController: appRuntimeAccessControlAssembly.appCommandUiFacadeController,
    sessionControlRuntimeController: appRuntimeAccessControlAssembly.sessionControlRuntimeController,
    sessionQuickSendRuntimeController: appRuntimeAccessControlAssembly.sessionQuickSendRuntimeController,
    ...appRuntimeAccessControlAssembly
  };
}
