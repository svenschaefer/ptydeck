export function createRuntimeEventController(options = {}) {
  const defaultDeckId = String(options.defaultDeckId || "").trim();
  const getPreferredActiveDeckId = options.getPreferredActiveDeckId || (() => "");
  const setDecks = options.setDecks || (() => {});
  const replaceCustomCommandState = options.replaceCustomCommandState || (() => {});
  const setSessions = options.setSessions || (() => {});
  const replaySnapshotOutputs = options.replaySnapshotOutputs || (() => {});
  const scheduleCommandPreview = options.scheduleCommandPreview || (() => {});
  const scheduleCommandSuggestions = options.scheduleCommandSuggestions || (() => {});
  const clearError = options.clearError || (() => {});
  const markRuntimeBootstrapReady = options.markRuntimeBootstrapReady || (() => {});
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
  const setError = options.setError || (() => {});
  const sendInput = options.sendInput || (() => Promise.resolve());

  function applyRuntimeSnapshot(event) {
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
  }

  function handleSessionTerminalInput(sessionId, data) {
    setActiveSession(sessionId);
    const latestSession = getSessionById(sessionId);
    if (isSessionUnrestored(latestSession)) {
      setError(getUnrestoredSessionMessage(latestSession));
      return;
    }
    if (isSessionExited(latestSession)) {
      setError(getExitedSessionMessage(latestSession));
      return;
    }
    sendInput(sessionId, data).catch(() => setError("Failed to send terminal input."));
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
      default:
        return false;
    }
  }

  return {
    handleSessionTerminalInput,
    applyRuntimeEvent
  };
}
