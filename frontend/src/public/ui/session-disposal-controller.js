export function createSessionDisposalController(options = {}) {
  const onClearSessionStatusAnchor = options.onClearSessionStatusAnchor || (() => {});

  function cleanupRemovedSessions(args = {}) {
    const activeSessionIds = args.activeSessionIds instanceof Set ? args.activeSessionIds : new Set();
    const terminals = args.terminals;
    const terminalObservers = args.terminalObservers;
    const closeSettingsDialog = args.closeSettingsDialog || (() => {});
    const streamPluginEngine = args.streamPluginEngine;
    const streamAdapter = args.streamAdapter;
    const terminalSearchState = args.terminalSearchState || {};
    const clearTerminalSearchSelection = args.clearTerminalSearchSelection || (() => {});
    const resizeTimers = args.resizeTimers;
    const terminalSizes = args.terminalSizes;
    const sessionThemeDrafts = args.sessionThemeDrafts;

    let shouldRunResizePass = false;
    for (const sessionId of terminals.keys()) {
      if (activeSessionIds.has(sessionId)) {
        continue;
      }
      const entry = terminals.get(sessionId);
      const observer = terminalObservers.get(sessionId);
      if (observer && typeof observer.disconnect === "function") {
        observer.disconnect();
      }
      if (entry?.terminal && typeof entry.terminal.dispose === "function") {
        entry.terminal.dispose();
      }
      if (entry?.element && typeof entry.element.remove === "function") {
        entry.element.remove();
      }
      terminals.delete(sessionId);
      terminalObservers.delete(sessionId);
      closeSettingsDialog(entry?.settingsDialog);
      streamPluginEngine?.disposeSession?.(sessionId);
      streamAdapter?.disposeSession?.(sessionId);

      if (terminalSearchState.selectedSessionId === sessionId || terminalSearchState.sessionId === sessionId) {
        clearTerminalSearchSelection(sessionId);
        terminalSearchState.sessionId = "";
        terminalSearchState.matches = [];
        terminalSearchState.activeIndex = -1;
        terminalSearchState.revision = -1;
      }

      const timer = resizeTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
      }
      resizeTimers.delete(sessionId);
      terminalSizes.delete(sessionId);
      sessionThemeDrafts.delete(sessionId);
      onClearSessionStatusAnchor(sessionId);
      shouldRunResizePass = true;
    }
    return shouldRunResizePass;
  }

  return {
    cleanupRemovedSessions
  };
}
