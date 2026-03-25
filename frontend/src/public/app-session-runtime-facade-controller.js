export function createAppSessionRuntimeFacadeController(options = {}) {
  const store = options.store || null;
  const defaultDeckId = String(options.defaultDeckId || "default");
  const getSessionViewModel =
    typeof options.getSessionViewModel === "function" ? options.getSessionViewModel : () => null;
  const getSessionRuntimeController =
    typeof options.getSessionRuntimeController === "function" ? options.getSessionRuntimeController : () => null;
  const getAppLayoutDeckFacadeController =
    typeof options.getAppLayoutDeckFacadeController === "function" ? options.getAppLayoutDeckFacadeController : () => null;
  const refreshTerminalViewport =
    typeof options.refreshTerminalViewport === "function" ? options.refreshTerminalViewport : () => {};
  const syncTerminalScrollArea =
    typeof options.syncTerminalScrollArea === "function" ? options.syncTerminalScrollArea : () => {};
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const setTimeoutRef =
    typeof options.setTimeoutRef === "function"
      ? options.setTimeoutRef
      : typeof windowRef?.setTimeout === "function"
        ? windowRef.setTimeout.bind(windowRef)
        : typeof globalThis.setTimeout === "function"
          ? globalThis.setTimeout.bind(globalThis)
          : null;

  function getSessionById(sessionId) {
    return store?.getState?.().sessions.find((session) => session.id === sessionId) || null;
  }

  function resolveSessionDeckId(session) {
    return getSessionViewModel()?.resolveSessionDeckId?.(session) || String(session?.deckId || defaultDeckId);
  }

  function setSessionCardVisibility(node, visible) {
    if (!node) {
      return;
    }
    node.hidden = !visible;
    node.style.display = visible ? "" : "none";
  }

  function markSessionActivity(sessionId) {
    const timestamp = nowFn();
    store?.markSessionActivity?.(sessionId, { timestamp });
    return timestamp;
  }

  function syncTerminalViewportAfterShow(sessionId, entry) {
    if (!entry || !entry.terminal) {
      return false;
    }
    const shouldFollow = entry.followOnShow !== false;
    const runPass = () => {
      getAppLayoutDeckFacadeController()?.applyResizeForSession?.(sessionId, { force: true });
      syncTerminalScrollArea(entry.terminal);
      refreshTerminalViewport(entry.terminal);
      if (shouldFollow && typeof entry.terminal.scrollToBottom === "function") {
        entry.terminal.scrollToBottom();
      }
      syncTerminalScrollArea(entry.terminal);
    };
    runPass();
    if (setTimeoutRef) {
      setTimeoutRef(runPass, 80);
      setTimeoutRef(runPass, 220);
    }
    entry.pendingViewportSync = false;
    return true;
  }

  function findNextQuickId() {
    return getSessionRuntimeController()?.findNextQuickId?.() || "?";
  }

  function ensureQuickId(sessionId) {
    return getSessionRuntimeController()?.ensureQuickId?.(sessionId) || "?";
  }

  function pruneQuickIds(activeSessionIds) {
    getSessionRuntimeController()?.pruneQuickIds?.(activeSessionIds);
  }

  function appendTerminalChunk(sessionId, data, options = {}) {
    return getSessionRuntimeController()?.appendTerminalChunk?.(sessionId, data, options) === true;
  }

  function replaySnapshotOutputs(outputs, attempt = 0) {
    getSessionRuntimeController()?.replaySnapshotOutputs?.(outputs, attempt);
  }

  function upsertSession(nextSession) {
    getSessionRuntimeController()?.upsertSession?.(nextSession);
  }

  function ensureSessionRuntime(session) {
    return getSessionRuntimeController()?.ensureSessionRuntime?.(session) === true;
  }

  function disposeSessionRuntime(sessionId) {
    return getSessionRuntimeController()?.disposeSessionRuntime?.(sessionId) === true;
  }

  function markSessionExited(sessionId, exitDetails = {}) {
    getSessionRuntimeController()?.markSessionExited?.(sessionId, exitDetails);
  }

  function removeSession(sessionId) {
    getSessionRuntimeController()?.removeSession?.(sessionId);
  }

  function markSessionClosed(sessionId) {
    getSessionRuntimeController()?.markSessionClosed?.(sessionId);
  }

  function handleSessionTerminalInput(sessionId, data) {
    getSessionRuntimeController()?.handleSessionTerminalInput?.(sessionId, data);
  }

  function applyRuntimeEvent(event, options = {}) {
    return getSessionRuntimeController()?.applyRuntimeEvent?.(event, options) === true;
  }

  function formatSessionDisplayName(session) {
    return getSessionRuntimeController()?.formatSessionDisplayName?.(session) || String(session?.name || session?.id || "");
  }

  function formatSessionToken(sessionId) {
    return getSessionRuntimeController()?.formatSessionToken?.(sessionId) || "?";
  }

  return {
    getSessionById,
    resolveSessionDeckId,
    setSessionCardVisibility,
    markSessionActivity,
    syncTerminalViewportAfterShow,
    findNextQuickId,
    ensureQuickId,
    pruneQuickIds,
    appendTerminalChunk,
    replaySnapshotOutputs,
    upsertSession,
    ensureSessionRuntime,
    disposeSessionRuntime,
    markSessionExited,
    removeSession,
    markSessionClosed,
    handleSessionTerminalInput,
    applyRuntimeEvent,
    formatSessionDisplayName,
    formatSessionToken
  };
}
