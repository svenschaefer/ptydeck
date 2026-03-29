import { hasMeaningfulStreamActivity } from "./terminal-stream.js";
import {
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  getMouseTrackingResetSequence,
  normalizeSessionMouseForwardingMode,
  stripMouseTrackingControlSequences
} from "./session-mouse-forwarding.js";

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
  const setTimeoutRef =
    typeof windowRef?.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : typeof globalThis.setTimeout === "function"
        ? globalThis.setTimeout.bind(globalThis)
        : null;

  function normalizeQuickIdToken(value) {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    return normalized || "";
  }

  function syncQuickIdsFromSessions(sessions = []) {
    for (const session of Array.isArray(sessions) ? sessions : []) {
      const sessionId = String(session?.id || "").trim();
      const quickIdToken = normalizeQuickIdToken(session?.quickIdToken);
      if (!sessionId || !quickIdToken) {
        continue;
      }
      sessionQuickIds.set(sessionId, quickIdToken);
    }
  }

  function findNextQuickId() {
    syncQuickIdsFromSessions(store?.getState?.().sessions || []);
    const used = new Set(sessionQuickIds.values());
    for (const candidate of quickIdPool) {
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return "?";
  }

  function ensureQuickId(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return "?";
    }
    const sessionToken = normalizeQuickIdToken(getSessionById(normalizedSessionId)?.quickIdToken);
    if (sessionToken) {
      sessionQuickIds.set(normalizedSessionId, sessionToken);
      return sessionToken;
    }
    if (!sessionQuickIds.has(normalizedSessionId)) {
      sessionQuickIds.set(normalizedSessionId, findNextQuickId());
    }
    return sessionQuickIds.get(normalizedSessionId);
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
    const session = getSessionById(sessionId);
    const nextMouseForwardingMode = normalizeSessionMouseForwardingMode(session?.mouseForwardingMode);
    if (entry.mouseForwardingMode !== nextMouseForwardingMode) {
      if (entry.mouseForwardingMode && nextMouseForwardingMode === SESSION_MOUSE_FORWARDING_MODE_OFF) {
        entry.terminal.write(getMouseTrackingResetSequence());
      }
      entry.mouseForwardingMode = nextMouseForwardingMode;
    }
    const writeData =
      nextMouseForwardingMode === SESSION_MOUSE_FORWARDING_MODE_OFF ? stripMouseTrackingControlSequences(data) : data;
    if (entry.isVisible === false) {
      entry.pendingViewportSync = true;
    }
    const terminal = entry.terminal;
    if (writeData) {
      terminal.write(writeData, () => {
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
    }
    if (options.markActivity !== false && hasMeaningfulStreamActivity(writeData)) {
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
    const entry = terminals.get(nextSession?.id);
    if (!entry) {
      return;
    }
    const nextMouseForwardingMode = normalizeSessionMouseForwardingMode(nextSession?.mouseForwardingMode);
    if (entry.mouseForwardingMode !== nextMouseForwardingMode) {
      if (entry.mouseForwardingMode && nextMouseForwardingMode === SESSION_MOUSE_FORWARDING_MODE_OFF) {
        entry.terminal.write(getMouseTrackingResetSequence());
      }
      entry.mouseForwardingMode = nextMouseForwardingMode;
    }
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
    return true;
  }

  function formatSessionToken(sessionId) {
    return sessionQuickIds.get(sessionId) || ensureQuickId(sessionId);
  }

  function sortSessionsByQuickId(sessions) {
    syncQuickIdsFromSessions(sessions);
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
