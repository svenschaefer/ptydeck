export function createSessionRuntimeController(options = {}) {
  const store = options.store || null;
  const terminals = options.terminals || new Map();
  const sessionQuickIds = options.sessionQuickIds || new Map();
  const quickIdPool = Array.isArray(options.quickIdPool) ? options.quickIdPool.slice() : [];
  const terminalSearchState = options.terminalSearchState || { query: "" };
  const refreshTerminalViewport =
    typeof options.refreshTerminalViewport === "function" ? options.refreshTerminalViewport : () => {};
  const syncTerminalScrollArea =
    typeof options.syncTerminalScrollArea === "function" ? options.syncTerminalScrollArea : () => {};
  const markSessionActivity =
    typeof options.markSessionActivity === "function" ? options.markSessionActivity : () => {};
  const syncActiveTerminalSearch =
    typeof options.syncActiveTerminalSearch === "function" ? options.syncActiveTerminalSearch : () => {};
  const getActiveSessionId =
    typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const streamPluginEngine = options.streamPluginEngine || { ensureSession() {}, disposeSession() {} };
  const streamAdapter = options.streamAdapter || { disposeSession() {} };
  const setCommandFeedback =
    typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const getExitedSessionMessage =
    typeof options.getExitedSessionMessage === "function" ? options.getExitedSessionMessage : () => "";
  const getRuntimeEventController =
    typeof options.getRuntimeEventController === "function" ? options.getRuntimeEventController : () => null;
  const getSessionViewModel =
    typeof options.getSessionViewModel === "function" ? options.getSessionViewModel : () => null;
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const setTimeoutRef =
    typeof windowRef?.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : typeof globalThis.setTimeout === "function"
        ? globalThis.setTimeout.bind(globalThis)
        : null;

  function findNextQuickId() {
    const used = new Set(sessionQuickIds.values());
    for (const candidate of quickIdPool) {
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return "?";
  }

  function ensureQuickId(sessionId) {
    if (!sessionQuickIds.has(sessionId)) {
      sessionQuickIds.set(sessionId, findNextQuickId());
    }
    return sessionQuickIds.get(sessionId);
  }

  function pruneQuickIds(activeSessionIds) {
    const activeSet = new Set(activeSessionIds);
    for (const sessionId of sessionQuickIds.keys()) {
      if (!activeSet.has(sessionId)) {
        sessionQuickIds.delete(sessionId);
      }
    }
  }

  function appendTerminalChunk(sessionId, data, options = {}) {
    const entry = terminals.get(sessionId);
    if (!entry || typeof data !== "string" || data.length === 0) {
      return false;
    }
    if (entry.isVisible === false) {
      entry.pendingViewportSync = true;
    }
    const terminal = entry.terminal;
    terminal.write(data, () => {
      entry.searchRevision = (Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0) + 1;
      if (entry.isVisible !== false) {
        syncTerminalScrollArea(terminal);
      }
      refreshTerminalViewport(terminal);
      if (entry.isVisible !== false) {
        syncTerminalScrollArea(terminal);
      }
      if (getActiveSessionId() === sessionId && terminalSearchState.query) {
        syncActiveTerminalSearch({ preserveSelection: true });
      }
    });
    if (options.markActivity !== false) {
      markSessionActivity(sessionId);
    }
    return true;
  }

  function replaySnapshotOutputs(outputs, attempt = 0) {
    if (!Array.isArray(outputs) || outputs.length === 0) {
      return;
    }

    let missing = 0;
    for (const entry of outputs) {
      if (!entry || typeof entry.sessionId !== "string" || typeof entry.data !== "string" || entry.data.length === 0) {
        continue;
      }
      if (!terminals.has(entry.sessionId)) {
        missing += 1;
        continue;
      }
      appendTerminalChunk(entry.sessionId, entry.data, { markActivity: false });
    }

    if (missing > 0 && attempt < 4 && setTimeoutRef) {
      setTimeoutRef(() => replaySnapshotOutputs(outputs, attempt + 1), 80);
    }
  }

  function upsertSession(nextSession) {
    store?.upsertSession(nextSession);
  }

  function ensureSessionRuntime(session) {
    if (!session) {
      return false;
    }
    streamPluginEngine.ensureSession(session);
    return true;
  }

  function disposeSessionRuntime(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return false;
    }
    streamPluginEngine.disposeSession(sessionId);
    streamAdapter.disposeSession(sessionId);
    return true;
  }

  function markSessionExited(sessionId, exitDetails = {}) {
    const session = getSessionById(sessionId);
    if (!session) {
      return;
    }
    store?.markSessionExited(sessionId, {
      exitCode: exitDetails.exitCode,
      signal: exitDetails.signal,
      exitedAt: Date.now(),
      updatedAt: Date.now()
    });
    disposeSessionRuntime(sessionId);
    store?.clearSessionActivity(sessionId);
    const nextSession = getSessionById(sessionId);
    if (getActiveSessionId() === sessionId) {
      setCommandFeedback(getExitedSessionMessage(nextSession));
    }
  }

  function removeSession(sessionId) {
    store?.removeSession(sessionId);
  }

  function markSessionClosed(sessionId) {
    store?.markSessionClosed(sessionId);
  }

  function handleSessionTerminalInput(sessionId, data) {
    getRuntimeEventController()?.handleSessionTerminalInput(sessionId, data);
  }

  function applyRuntimeEvent(event, options = {}) {
    return getRuntimeEventController()?.applyRuntimeEvent(event, options) === true;
  }

  function formatSessionDisplayName(session) {
    return getSessionViewModel()?.formatSessionDisplayName(session) || String(session?.name || session?.id || "");
  }

  function formatSessionToken(sessionId) {
    return sessionQuickIds.get(sessionId) || ensureQuickId(sessionId);
  }

  return {
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
