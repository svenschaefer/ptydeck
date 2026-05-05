import { ApiError } from "./errors.js";

function createSessionNotFoundError(sessionId) {
  return new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
}

export function createRuntimeSessionState(dependencies = {}) {
  const {
    manager = {
      get: (sessionId) => {
        throw createSessionNotFoundError(sessionId);
      }
    },
    unrestoredSessions = new Map(),
    decks = new Map(),
    defaultDeckId = "default",
    buildDefaultDeck = () => ({ id: defaultDeckId }),
    getDeckOrThrow = () => null,
    sessionDeckAssignments = new Map(),
    sessionQuickIdAssignments = new Map(),
    sessionQuickIdPool = [],
    sessionQuickIdFallback = "?",
    cleanupLayoutProfiles = () => {},
    cleanupWorkspacePresets = () => {},
    getApiSessionOrThrow = () => null
  } = dependencies;

  const sessionQuickIdRank = new Set((Array.isArray(sessionQuickIdPool) ? sessionQuickIdPool : []).map((token) => String(token || "").trim()));

  function ensureSessionExistsOrThrow(sessionId) {
    try {
      manager.get(sessionId);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    if (unrestoredSessions.has(sessionId)) {
      return;
    }
    throw createSessionNotFoundError(sessionId);
  }

  function ensureDefaultDeck() {
    if (decks.has(defaultDeckId)) {
      return decks.get(defaultDeckId);
    }
    const defaultDeck = buildDefaultDeck();
    decks.set(defaultDeck.id, defaultDeck);
    return defaultDeck;
  }

  function setSessionDeckAssignment(sessionId, deckId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    const normalizedDeckId =
      typeof deckId === "string" && deckId.trim() && decks.has(deckId.trim())
        ? deckId.trim()
        : defaultDeckId;
    if (!normalizedSessionId) {
      return normalizedDeckId;
    }
    sessionDeckAssignments.set(normalizedSessionId, normalizedDeckId);
    try {
      const activeSession = manager.get(normalizedSessionId).meta;
      if (activeSession && activeSession.deckId !== normalizedDeckId) {
        activeSession.deckId = normalizedDeckId;
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestoredSession = unrestoredSessions.get(normalizedSessionId);
    if (unrestoredSession && unrestoredSession.deckId !== normalizedDeckId) {
      unrestoredSession.deckId = normalizedDeckId;
    }
    return normalizedDeckId;
  }

  function resolveSessionDeckId(sessionId) {
    const assigned = sessionDeckAssignments.get(sessionId);
    if (assigned && decks.has(assigned)) {
      return assigned;
    }
    ensureDefaultDeck();
    setSessionDeckAssignment(sessionId, defaultDeckId);
    return defaultDeckId;
  }

  function moveSessionToDeck(sessionId, deckId) {
    getDeckOrThrow(deckId);
    ensureSessionExistsOrThrow(sessionId);
    const sourceDeckId = resolveSessionDeckId(sessionId);
    if (sourceDeckId === deckId) {
      return false;
    }
    setSessionDeckAssignment(sessionId, deckId);
    cleanupLayoutProfiles();
    cleanupWorkspacePresets();
    return true;
  }

  function normalizeQuickIdToken(value) {
    if (typeof value !== "string") {
      return "";
    }
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return "";
    }
    if (normalized === sessionQuickIdFallback) {
      return sessionQuickIdFallback;
    }
    return sessionQuickIdRank.has(normalized) ? normalized : "";
  }

  function getSessionRecordRef(sessionId) {
    try {
      return manager.get(sessionId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestored = unrestoredSessions.get(sessionId);
    if (unrestored) {
      return { meta: unrestored };
    }
    return null;
  }

  function findNextQuickIdToken(excludedSessionIds = []) {
    const excluded = new Set((Array.isArray(excludedSessionIds) ? excludedSessionIds : []).map((entry) => String(entry || "").trim()));
    const used = new Set();
    for (const [sessionId, token] of sessionQuickIdAssignments.entries()) {
      if (!excluded.has(sessionId)) {
        used.add(token);
      }
    }
    for (const candidate of sessionQuickIdPool) {
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return sessionQuickIdFallback;
  }

  function assignSessionQuickIdToken(sessionId, preferredToken = "") {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return sessionQuickIdFallback;
    }
    const existing = normalizeQuickIdToken(sessionQuickIdAssignments.get(normalizedSessionId));
    if (existing) {
      return existing;
    }
    const preferred = normalizeQuickIdToken(preferredToken);
    let nextToken = preferred;
    if (
      !nextToken ||
      (nextToken !== sessionQuickIdFallback &&
        Array.from(sessionQuickIdAssignments.entries()).some(
          ([otherSessionId, otherToken]) => otherSessionId !== normalizedSessionId && otherToken === nextToken
        ))
    ) {
      nextToken = findNextQuickIdToken([normalizedSessionId]);
    }
    sessionQuickIdAssignments.set(normalizedSessionId, nextToken);
    const record = getSessionRecordRef(normalizedSessionId);
    if (record?.meta) {
      record.meta.quickIdToken = nextToken;
    }
    return nextToken;
  }

  function getSessionQuickIdToken(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return sessionQuickIdFallback;
    }
    return assignSessionQuickIdToken(normalizedSessionId);
  }

  function setSessionQuickIdToken(sessionId, token) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      throw createSessionNotFoundError(sessionId);
    }
    const nextToken = normalizeQuickIdToken(token) || findNextQuickIdToken([normalizedSessionId]);
    sessionQuickIdAssignments.set(normalizedSessionId, nextToken);
    const record = getSessionRecordRef(normalizedSessionId);
    if (record?.meta) {
      record.meta.quickIdToken = nextToken;
      record.meta.updatedAt = Date.now();
    }
    return nextToken;
  }

  function deleteSessionQuickIdToken(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return false;
    }
    return sessionQuickIdAssignments.delete(normalizedSessionId);
  }

  function swapSessionQuickIds(sessionIdA, sessionIdB) {
    const leftSessionId = typeof sessionIdA === "string" ? sessionIdA.trim() : "";
    const rightSessionId = typeof sessionIdB === "string" ? sessionIdB.trim() : "";
    if (!leftSessionId || !rightSessionId || leftSessionId === rightSessionId) {
      throw new ApiError(400, "ValidationError", "Swap requires two different session ids.");
    }
    ensureSessionExistsOrThrow(leftSessionId);
    ensureSessionExistsOrThrow(rightSessionId);
    const leftToken = getSessionQuickIdToken(leftSessionId);
    const rightToken = getSessionQuickIdToken(rightSessionId);
    setSessionQuickIdToken(leftSessionId, rightToken);
    setSessionQuickIdToken(rightSessionId, leftToken);
    return {
      leftSession: getApiSessionOrThrow(leftSessionId),
      rightSession: getApiSessionOrThrow(rightSessionId)
    };
  }

  function withDeckId(session) {
    const sessionModel = session && typeof session === "object" ? session : {};
    const sessionId = typeof sessionModel.id === "string" ? sessionModel.id : "";
    const explicitDeckId =
      typeof sessionModel.deckId === "string" && sessionModel.deckId.trim() && decks.has(sessionModel.deckId.trim())
        ? sessionModel.deckId.trim()
        : "";
    const assignedDeckId =
      sessionId && typeof sessionDeckAssignments.get(sessionId) === "string" && decks.has(sessionDeckAssignments.get(sessionId))
        ? sessionDeckAssignments.get(sessionId)
        : "";
    const effectiveDeckId = assignedDeckId || explicitDeckId || resolveSessionDeckId(sessionId);
    if (sessionId) {
      setSessionDeckAssignment(sessionId, effectiveDeckId);
    }
    return {
      ...sessionModel,
      deckId: effectiveDeckId,
      quickIdToken: getSessionQuickIdToken(sessionId)
    };
  }

  function resolveSessionControlModel(sessionId) {
    try {
      return withDeckId(manager.get(sessionId).meta);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestored = unrestoredSessions.get(sessionId);
    return unrestored ? withDeckId(unrestored) : null;
  }

  return {
    assignSessionQuickIdToken,
    deleteSessionQuickIdToken,
    ensureDefaultDeck,
    ensureSessionExistsOrThrow,
    getSessionQuickIdToken,
    moveSessionToDeck,
    resolveSessionControlModel,
    resolveSessionDeckId,
    setSessionDeckAssignment,
    setSessionQuickIdToken,
    swapSessionQuickIds,
    withDeckId
  };
}
