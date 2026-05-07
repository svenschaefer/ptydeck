export function createAppRuntimeCompositionHelperAssembly(options = {}) {
  const {
    testHooks = null,
    uiState,
    api,
    store,
    streamAdapter,
    setAccessState,
    setRuntimeClientId,
    sessionControlRuntimeController,
    getInitializationErrorMessage,
    showBlockedWriteReclaimUi,
    maybeAutoRepairOriginHandoffControl,
    handleCommandFeedbackAction,
    getTrustedLocalHandoffRuntimeController,
    getOriginHandoffSourceOrigin,
    setOriginHandoffSourceOrigin,
    setRuntimeClientIdentityCreatedOnThisOrigin,
    normalizeCommandFeedbackActionSessionId = (sessionId) => sessionId,
    collaboratorSetters = {}
  } = options;

  function setCollaborators(overrides = {}) {
    if (!overrides || typeof overrides !== "object") {
      return;
    }
    for (const [key, setter] of Object.entries(collaboratorSetters)) {
      if (Object.prototype.hasOwnProperty.call(overrides, key) && typeof setter === "function") {
        setter(overrides[key]);
      }
    }
  }

  function installTestHooks() {
    if (!testHooks || typeof testHooks !== "object") {
      return;
    }
    Object.assign(testHooks, {
      uiState,
      getApi: () => api,
      getStoreState: () => store.getState(),
      getStreamAdapter: () => streamAdapter,
      setAccessState,
      setRuntimeClientId,
      setTrustedLocalClientLabel(label) {
        sessionControlRuntimeController.setTrustedLocalClientLabel(label);
      },
      getInitializationErrorMessage: () => getInitializationErrorMessage() || "",
      getSessionWriteBlockMessage: (...args) => sessionControlRuntimeController.getSessionWriteBlockMessage(...args),
      getSessionControlSummary: (...args) => sessionControlRuntimeController.getSessionControlSummary(...args),
      getSessionControlBadgeState: (...args) => sessionControlRuntimeController.getSessionControlBadgeState(...args),
      getTakeOrReclaimControlLabel: (...args) =>
        sessionControlRuntimeController.getTakeOrReclaimControlLabel(...args),
      renderSessionControlClients: (...args) => sessionControlRuntimeController.renderSessionControlClients(...args),
      showBlockedWriteReclaimUi,
      maybeAutoRepairOriginHandoffControl,
      handleCommandFeedbackAction,
      getCommandFeedbackActionMeta: () => sessionControlRuntimeController.getCommandFeedbackActionMeta(),
      getTrustedLocalHandoffRuntimeController: () => getTrustedLocalHandoffRuntimeController(),
      getOriginHandoffSourceOrigin: () => getOriginHandoffSourceOrigin(),
      setOriginHandoffSourceOrigin(origin) {
        setOriginHandoffSourceOrigin(origin);
      },
      setRuntimeClientIdentityCreatedOnThisOrigin(value) {
        setRuntimeClientIdentityCreatedOnThisOrigin(value);
      },
      setSessionsForTest(sessions) {
        store.setSessions(Array.isArray(sessions) ? sessions : []);
      },
      setCommandFeedbackActionSessionId(sessionId) {
        uiState.commandFeedbackActionSessionId = normalizeCommandFeedbackActionSessionId(sessionId);
      },
      setCommandFeedbackActionMeta(meta) {
        sessionControlRuntimeController.setCommandFeedbackActionMeta(meta);
      },
      setCollaborators
    });
  }

  return {
    installTestHooks,
    setCollaborators
  };
}
