export function createAppCommandUiFacadeController(options = {}) {
  const store = options.store || null;
  const uiState = options.uiState || {};
  const startupPerf = options.startupPerf || null;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const terminalSearchState = options.terminalSearchState || null;
  const getAppRuntimeStateController =
    typeof options.getAppRuntimeStateController === "function" ? options.getAppRuntimeStateController : () => null;
  const getTerminalSearchController =
    typeof options.getTerminalSearchController === "function" ? options.getTerminalSearchController : () => null;
  const getCommandComposerAutocompleteController =
    typeof options.getCommandComposerAutocompleteController === "function"
      ? options.getCommandComposerAutocompleteController
      : () => null;
  const getCommandComposerRuntimeController =
    typeof options.getCommandComposerRuntimeController === "function"
      ? options.getCommandComposerRuntimeController
      : () => null;
  const getCommandTargetRuntimeController =
    typeof options.getCommandTargetRuntimeController === "function" ? options.getCommandTargetRuntimeController : () => null;
  const getSessionGridController =
    typeof options.getSessionGridController === "function" ? options.getSessionGridController : () => null;
  const getWorkspacePresetRuntimeController =
    typeof options.getWorkspacePresetRuntimeController === "function"
      ? options.getWorkspacePresetRuntimeController
      : () => null;
  const getConnectionProfileRuntimeController =
    typeof options.getConnectionProfileRuntimeController === "function"
      ? options.getConnectionProfileRuntimeController
      : () => null;
  const getControlPaneRuntimeController =
    typeof options.getControlPaneRuntimeController === "function" ? options.getControlPaneRuntimeController : () => null;
  const getCommandExecutor =
    typeof options.getCommandExecutor === "function" ? options.getCommandExecutor : () => null;

  function listCustomCommands() {
    return store?.listCustomCommands?.() || [];
  }

  function getCustomCommand(name) {
    return store?.getCustomCommand?.(name) || null;
  }

  function upsertCustomCommand(command) {
    return store?.upsertCustomCommand?.(command) || null;
  }

  function removeCustomCommand(name) {
    return store?.removeCustomCommand?.(name) === true;
  }

  function replaceCustomCommands(commands) {
    store?.replaceCustomCommands?.(commands);
  }

  function setError(message) {
    getAppRuntimeStateController()?.setError?.(message);
  }

  function setCommandFeedback(message) {
    getAppRuntimeStateController()?.setCommandFeedback?.(message);
  }

  function getErrorMessage(err, fallback) {
    return getAppRuntimeStateController()?.getErrorMessage?.(err, fallback) || fallback;
  }

  function setCommandPreview(message) {
    getAppRuntimeStateController()?.setCommandPreview?.(message);
  }

  function setCommandGuardState(nextState) {
    getAppRuntimeStateController()?.setCommandGuardState?.(nextState);
  }

  function clearCommandGuardState(options) {
    getAppRuntimeStateController()?.clearCommandGuardState?.(options);
  }

  function clearTerminalSearchSelection(sessionId = terminalSearchState?.selectedSessionId || "") {
    getTerminalSearchController()?.clearSelection?.(sessionId);
  }

  function syncActiveTerminalSearch({ preserveSelection = true } = {}) {
    getTerminalSearchController()?.syncActiveTerminalSearch?.({ preserveSelection });
  }

  function navigateActiveTerminalSearch(direction) {
    getTerminalSearchController()?.navigateActiveTerminalSearch?.(direction);
  }

  function clearCommandSuggestions() {
    getCommandComposerAutocompleteController()?.clearSuggestions?.();
  }

  function scheduleCommandSuggestions() {
    getCommandComposerAutocompleteController()?.scheduleSuggestions?.();
  }

  function maybeReportStartupPerf() {
    getAppRuntimeStateController()?.maybeReportStartupPerf?.();
  }

  function markRuntimeBootstrapReady(source) {
    getAppRuntimeStateController()?.markRuntimeBootstrapReady?.(source);
  }

  function scheduleBootstrapFallback() {
    getAppRuntimeStateController()?.scheduleBootstrapFallback?.();
  }

  function render() {
    const state =
      store?.getState?.() || {
        sessions: [],
        activeSessionId: "",
        activeDeckId: "",
        sessionFilterText: "",
        connectionState: "connecting"
      };
    getSessionGridController()?.renderWorkspace?.({
      state,
      uiState,
      startupPerf,
      nowMs,
      maybeReportStartupPerf,
      resolveFilterSelectors: getCommandTargetRuntimeController()?.resolveFilterSelectors
    });
    getConnectionProfileRuntimeController()?.render?.();
    getControlPaneRuntimeController()?.render?.();
    getWorkspacePresetRuntimeController()?.render?.();
  }

  async function executeControlCommand(interpreted) {
    return getCommandExecutor()?.execute?.(interpreted);
  }

  async function executeControlCommandDetailed(interpreted) {
    return getCommandExecutor()?.executeDetailed?.(interpreted) || { ok: true, feedback: "" };
  }

  async function submitCommand() {
    return getCommandComposerRuntimeController()?.submitCommand?.();
  }

  async function refreshCommandPreview() {
    return getCommandComposerRuntimeController()?.refreshCommandPreview?.();
  }

  function scheduleCommandPreview() {
    getCommandComposerRuntimeController()?.scheduleCommandPreview?.();
  }

  return {
    listCustomCommands,
    getCustomCommand,
    upsertCustomCommand,
    removeCustomCommand,
    replaceCustomCommands,
    setError,
    setCommandFeedback,
    getErrorMessage,
    setCommandPreview,
    setCommandGuardState,
    clearCommandGuardState,
    clearTerminalSearchSelection,
    syncActiveTerminalSearch,
    navigateActiveTerminalSearch,
    clearCommandSuggestions,
    scheduleCommandSuggestions,
    maybeReportStartupPerf,
    markRuntimeBootstrapReady,
    scheduleBootstrapFallback,
    render,
    executeControlCommand,
    executeControlCommandDetailed,
    submitCommand,
    refreshCommandPreview,
    scheduleCommandPreview
  };
}
