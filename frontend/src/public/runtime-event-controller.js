export function createRuntimeEventController(options = {}) {
  const defaultDeckId = String(options.defaultDeckId || "").trim();
  const getPreferredActiveDeckId = options.getPreferredActiveDeckId || (() => "");
  const setDecks = options.setDecks || (() => {});
  const replaceCustomCommandState = options.replaceCustomCommandState || (() => {});
  const setSessions = options.setSessions || (() => {});
  const replaySnapshotOutputs = options.replaySnapshotOutputs || (() => {});
  const scheduleSnapshotTerminalStabilization = options.scheduleSnapshotTerminalStabilization || (() => {});
  const scheduleCommandPreview = options.scheduleCommandPreview || (() => {});
  const scheduleCommandSuggestions = options.scheduleCommandSuggestions || (() => {});
  const clearError = options.clearError || (() => {});
  const markRuntimeBootstrapReady = options.markRuntimeBootstrapReady || (() => {});
  const setRuntimeClientId = typeof options.setRuntimeClientId === "function" ? options.setRuntimeClientId : () => {};
  const setComposerPlacementState =
    typeof options.setComposerPlacementState === "function" ? options.setComposerPlacementState : () => {};
  const applySessionInterpretationActions =
    typeof options.applySessionInterpretationActions === "function"
      ? options.applySessionInterpretationActions
      : () => {};
  const upsertSession = options.upsertSession || (() => {});
  const markSessionExited = options.markSessionExited || (() => {});
  const markSessionClosed = options.markSessionClosed || (() => {});
  const upsertDeckInState = options.upsertDeckInState || (() => {});
  const removeDeckFromState = options.removeDeckFromState || (() => {});
  const upsertCustomCommandState = options.upsertCustomCommandState || (() => {});
  const removeCustomCommandState = options.removeCustomCommandState || (() => {});
  const getSessionById = options.getSessionById || (() => null);
  const setActiveSession = options.setActiveSession || (() => {});
  const isSessionUnrestored = options.isSessionUnrestored || (() => false);
  const getUnrestoredSessionMessage = options.getUnrestoredSessionMessage || (() => "");
  const isSessionExited = options.isSessionExited || (() => false);
  const getExitedSessionMessage = options.getExitedSessionMessage || (() => "");
  const isSessionStopped = options.isSessionStopped || (() => false);
  const getStoppedSessionMessage = options.getStoppedSessionMessage || (() => "");
  const canWriteToSession = typeof options.canWriteToSession === "function" ? options.canWriteToSession : () => true;
  const getSessionWriteBlockedMessage =
    typeof options.getSessionWriteBlockedMessage === "function"
      ? options.getSessionWriteBlockedMessage
      : () => "This client cannot send input to the current session.";
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const getReadOnlyModeMessage =
    typeof options.getReadOnlyModeMessage === "function"
      ? options.getReadOnlyModeMessage
      : () => "Read-only spectator mode. Write actions are disabled.";
  const showBlockedWriteReclaimUi =
    typeof options.showBlockedWriteReclaimUi === "function" ? options.showBlockedWriteReclaimUi : () => false;
  const setError = options.setError || (() => {});
  const sendInput = options.sendInput || (() => Promise.resolve());
  const getErrorMessage =
    typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_error, fallback) => fallback;
  const reportTerminalInputError =
    typeof options.reportTerminalInputError === "function" ? options.reportTerminalInputError : () => {};

  function isAbortLikeTerminalInputError(error) {
    const name = typeof error?.name === "string" ? error.name.trim() : "";
    const message = typeof error?.message === "string" ? error.message.trim() : "";
    if (name === "AbortError") {
      return true;
    }
    if (!message) {
      return false;
    }
    return /abort(?:ed|ing)?/iu.test(message);
  }

  function applyRuntimeSnapshot(event) {
    setRuntimeClientId(event?.clientId || "");
    setComposerPlacementState(event?.composerPlacement || null);
    const sessionIds = Array.isArray(event.sessions)
      ? event.sessions.map((session) => String(session?.id || "").trim()).filter(Boolean)
      : [];
    if (Array.isArray(event.decks)) {
      setDecks(event.decks, { preferredActiveDeckId: getPreferredActiveDeckId() });
    }
    replaceCustomCommandState(event.customCommands || []);
    setSessions(event.sessions || []);
    replaySnapshotOutputs(event.outputs);
    scheduleCommandPreview();
    scheduleCommandSuggestions();
    clearError();
    markRuntimeBootstrapReady("ws");
    scheduleSnapshotTerminalStabilization(sessionIds);
  }

  function handleSessionTerminalInput(sessionId, data) {
    setActiveSession(sessionId);
    if (isReadOnlyMode()) {
      setError(getReadOnlyModeMessage());
      return;
    }
    const latestSession = getSessionById(sessionId);
    if (isSessionUnrestored(latestSession)) {
      setError(getUnrestoredSessionMessage(latestSession));
      return;
    }
    if (isSessionExited(latestSession)) {
      setError(getExitedSessionMessage(latestSession));
      return;
    }
    if (isSessionStopped(latestSession)) {
      setError(getStoppedSessionMessage(latestSession));
      return;
    }
    if (!canWriteToSession(latestSession)) {
      const message = getSessionWriteBlockedMessage(latestSession);
      setError(message);
      showBlockedWriteReclaimUi(latestSession, { source: "terminal-input", message });
      return;
    }
    sendInput(sessionId, data).catch((error) => {
      const suppressed = isAbortLikeTerminalInputError(error);
      reportTerminalInputError(sessionId, error, { suppressed, source: "terminal-input" });
      if (suppressed) {
        return;
      }
      setError(getErrorMessage(error, "Failed to send terminal input."));
    });
  }

  function applyRuntimeEvent(event, options = {}) {
    if (!event || typeof event !== "object") {
      return false;
    }

    switch (event.type) {
      case "snapshot":
        applyRuntimeSnapshot(event);
        return true;
      case "session.created":
      case "session.updated":
        if (event.session) {
          upsertSession(event.session);
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "session.exit":
        if (event.sessionId) {
          markSessionExited(event.sessionId, event);
          clearError();
          return true;
        }
        return false;
      case "session.activity.completed":
        if (event.session) {
          upsertSession(event.session);
          clearError();
          return true;
        }
        if (event.sessionId) {
          const session = getSessionById(event.sessionId);
          if (session) {
            clearError();
            return true;
          }
        }
        return false;
      case "session.closed":
        if (event.sessionId) {
          markSessionClosed(event.sessionId);
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "session.interpretation.apply": {
        const sessionId = event.sessionId || event.session?.id;
        if (sessionId && Array.isArray(event.actions) && event.actions.length > 0) {
          applySessionInterpretationActions(sessionId, event.actions);
          clearError();
          return true;
        }
        return false;
      }
      case "deck.created":
      case "deck.updated":
        if (event.deck) {
          upsertDeckInState(event.deck, {
            preferredActiveDeckId: options.preferredActiveDeckId || getPreferredActiveDeckId()
          });
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "deck.deleted":
        if (event.deckId) {
          removeDeckFromState(event.deckId, {
            preferredActiveDeckId: options.preferredActiveDeckId,
            fallbackDeckId: event.fallbackDeckId || defaultDeckId
          });
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "custom-command.created":
      case "custom-command.updated":
        if (event.command) {
          upsertCustomCommandState(event.command);
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "custom-command.deleted":
        if (event.command) {
          removeCustomCommandState(event.command);
          scheduleCommandPreview();
          scheduleCommandSuggestions();
          clearError();
          return true;
        }
        return false;
      case "composer-placement.updated":
        setComposerPlacementState(event?.composerPlacement || null);
        clearError();
        return true;
      default:
        return false;
    }
  }

  return {
    handleSessionTerminalInput,
    applyRuntimeEvent
  };
}
