import { hasMeaningfulStreamActivity } from "./terminal-stream.js";

export function createSessionRuntimeController(options = {}) {
  const store = options.store || null;
  const terminals = options.terminals || new Map();
  const sessionQuickIds = options.sessionQuickIds || new Map();
  const quickIdPool = Array.isArray(options.quickIdPool) ? options.quickIdPool.slice() : [];
  const quickIdRank = new Map(quickIdPool.map((token, index) => [token, index]));
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
  const storageRef = options.storageRef || windowRef?.sessionStorage || windowRef?.localStorage || null;
  const quickIdStorageKey = String(options.quickIdStorageKey || "ptydeck.session-quick-ids.v1");
  const setTimeoutRef =
    typeof windowRef?.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : typeof globalThis.setTimeout === "function"
        ? globalThis.setTimeout.bind(globalThis)
        : null;

  function persistQuickIds() {
    try {
      if (!storageRef || typeof storageRef.setItem !== "function") {
        return false;
      }
      const payload = {};
      const entries = Array.from(sessionQuickIds.entries()).sort((left, right) => {
        const leftRank = quickIdRank.get(left[1]);
        const rightRank = quickIdRank.get(right[1]);
        if (Number.isInteger(leftRank) && Number.isInteger(rightRank) && leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        if (left[1] !== right[1]) {
          return String(left[1]).localeCompare(String(right[1]), "en-US");
        }
        return String(left[0]).localeCompare(String(right[0]), "en-US");
      });
      for (const [sessionId, token] of entries) {
        payload[sessionId] = token;
      }
      storageRef.setItem(quickIdStorageKey, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function loadStoredQuickIds() {
    try {
      if (!storageRef || typeof storageRef.getItem !== "function") {
        return;
      }
      const raw = storageRef.getItem(quickIdStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return;
      }
      const usedTokens = new Set(sessionQuickIds.values());
      const orderedEntries = Object.entries(parsed).sort((left, right) => {
        const leftRank = quickIdRank.get(String(left[1] || "").trim());
        const rightRank = quickIdRank.get(String(right[1] || "").trim());
        if (Number.isInteger(leftRank) && Number.isInteger(rightRank) && leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return String(left[0]).localeCompare(String(right[0]), "en-US");
      });
      for (const [sessionIdRaw, tokenRaw] of orderedEntries) {
        const sessionId = String(sessionIdRaw || "").trim();
        const token = String(tokenRaw || "").trim();
        if (!sessionId || !quickIdRank.has(token) || usedTokens.has(token)) {
          continue;
        }
        sessionQuickIds.set(sessionId, token);
        usedTokens.add(token);
      }
    } catch {
      // ignore storage failures
    }
  }

  loadStoredQuickIds();

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
      persistQuickIds();
    }
    return sessionQuickIds.get(sessionId);
  }

  function pruneQuickIds(activeSessionIds) {
    const activeSet = new Set(activeSessionIds);
    let changed = false;
    for (const sessionId of sessionQuickIds.keys()) {
      if (!activeSet.has(sessionId)) {
        sessionQuickIds.delete(sessionId);
        changed = true;
      }
    }
    if (changed) {
      persistQuickIds();
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
    if (options.markActivity !== false && hasMeaningfulStreamActivity(data)) {
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
    return true;
  }

  function disposeSessionRuntime(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return false;
    }
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

  function swapSessionTokens(sessionIdA, sessionIdB) {
    const leftId = String(sessionIdA || "").trim();
    const rightId = String(sessionIdB || "").trim();
    if (!leftId || !rightId || leftId === rightId) {
      return false;
    }
    const leftToken = formatSessionToken(leftId);
    const rightToken = formatSessionToken(rightId);
    sessionQuickIds.set(leftId, rightToken);
    sessionQuickIds.set(rightId, leftToken);
    persistQuickIds();
    return true;
  }

  function formatSessionToken(sessionId) {
    return sessionQuickIds.get(sessionId) || ensureQuickId(sessionId);
  }

  function sortSessionsByQuickId(sessions) {
    return Array.isArray(sessions)
      ? sessions.slice().sort((left, right) => {
          const leftToken = formatSessionToken(left?.id);
          const rightToken = formatSessionToken(right?.id);
          const leftRank = quickIdRank.get(leftToken);
          const rightRank = quickIdRank.get(rightToken);
          if (Number.isInteger(leftRank) && Number.isInteger(rightRank) && leftRank !== rightRank) {
            return leftRank - rightRank;
          }
          if (leftToken !== rightToken) {
            return String(leftToken).localeCompare(String(rightToken), "en-US");
          }
          const leftName = String(left?.name || left?.id || "");
          const rightName = String(right?.name || right?.id || "");
          const nameCompare = leftName.localeCompare(rightName, "en-US");
          if (nameCompare !== 0) {
            return nameCompare;
          }
          return String(left?.id || "").localeCompare(String(right?.id || ""), "en-US");
        })
      : [];
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
    swapSessionTokens,
    formatSessionToken,
    sortSessionsByQuickId
  };
}
