import { ApiError } from "./errors.js";

function createSessionNotFoundError(sessionId) {
  return new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
}

export function createRuntimeSessionAuthority(dependencies = {}) {
  const {
    manager = {
      list: () => [],
      get: (sessionId) => {
        throw createSessionNotFoundError(sessionId);
      }
    },
    unrestoredSessions = new Map(),
    isSpectatorAuth = () => false,
    toApiSession = (session, explicitState) => ({
      ...(session && typeof session === "object" ? session : {}),
      ...(explicitState ? { state: explicitState } : {})
    }),
    withDeckId = (session) => session,
    shareTargetTypeSession = "session",
    shareTargetTypeDeck = "deck"
  } = dependencies;

  function sanitizeApiSessionForAuth(session, auth = null) {
    if (!session || !isSpectatorAuth(auth)) {
      return session;
    }
    return {
      ...session,
      quickSendUsage: []
    };
  }

  function getActiveSessionMetaOrNull(sessionId) {
    try {
      return manager.get(sessionId).meta;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    return null;
  }

  function getSpectatorTargetSession(auth) {
    if (!isSpectatorAuth(auth) || auth.shareTargetType !== shareTargetTypeSession) {
      return null;
    }
    const activeSession = getActiveSessionMetaOrNull(auth.shareTargetId);
    if (activeSession) {
      return sanitizeApiSessionForAuth(toApiSession(activeSession), auth);
    }
    const unrestored = unrestoredSessions.get(auth.shareTargetId);
    return unrestored ? sanitizeApiSessionForAuth(toApiSession(unrestored, "unrestored"), auth) : null;
  }

  function isSessionVisibleToAuth(session, auth) {
    if (!isSpectatorAuth(auth)) {
      return true;
    }
    const apiSession = session?.deckId ? session : toApiSession(session, session?.state);
    if (auth.shareTargetType === shareTargetTypeSession) {
      return apiSession.id === auth.shareTargetId;
    }
    return apiSession.deckId === auth.shareTargetId;
  }

  function isDeckVisibleToAuth(deck, auth) {
    if (!isSpectatorAuth(auth)) {
      return true;
    }
    const deckId = typeof deck === "string" ? deck : deck?.id;
    if (auth.shareTargetType === shareTargetTypeDeck) {
      return deckId === auth.shareTargetId;
    }
    const targetSession = getSpectatorTargetSession(auth);
    return Boolean(targetSession) && targetSession.deckId === deckId;
  }

  function listSessionIdsForAuth(auth = null) {
    const ids = [];
    const seen = new Set();
    for (const session of manager.list()) {
      const apiSession = withDeckId(session);
      if (isSessionVisibleToAuth(apiSession, auth)) {
        ids.push(apiSession.id);
      }
      seen.add(apiSession.id);
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (seen.has(sessionId)) {
        continue;
      }
      const apiSession = withDeckId(session);
      if (isSessionVisibleToAuth(apiSession, auth)) {
        ids.push(apiSession.id);
      }
    }
    return ids;
  }

  function listApiSessions(auth = null, { deckId } = {}) {
    const payload = [];
    const seen = new Set();
    for (const session of manager.list()) {
      const apiSession = sanitizeApiSessionForAuth(toApiSession(session), auth);
      if ((!deckId || apiSession.deckId === deckId) && isSessionVisibleToAuth(apiSession, auth)) {
        payload.push(apiSession);
      }
      seen.add(session.id);
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (seen.has(sessionId)) {
        continue;
      }
      const apiSession = sanitizeApiSessionForAuth(toApiSession(session, "unrestored"), auth);
      if ((!deckId || apiSession.deckId === deckId) && isSessionVisibleToAuth(apiSession, auth)) {
        payload.push(apiSession);
      }
    }
    return payload;
  }

  function getApiSessionOrThrow(sessionId, auth = null) {
    const active = getActiveSessionMetaOrNull(sessionId);
    if (active) {
      const apiSession = sanitizeApiSessionForAuth(toApiSession(active), auth);
      if (!isSessionVisibleToAuth(apiSession, auth)) {
        throw createSessionNotFoundError(sessionId);
      }
      return apiSession;
    }
    const unrestored = unrestoredSessions.get(sessionId);
    if (unrestored) {
      const apiSession = sanitizeApiSessionForAuth(toApiSession(unrestored, "unrestored"), auth);
      if (isSessionVisibleToAuth(apiSession, auth)) {
        return apiSession;
      }
    }
    throw createSessionNotFoundError(sessionId);
  }

  function filterOutputsForAuth(outputs, auth) {
    if (!Array.isArray(outputs) || !isSpectatorAuth(auth)) {
      return Array.isArray(outputs) ? outputs.slice() : [];
    }
    return outputs.filter((entry) => {
      if (!entry || typeof entry.sessionId !== "string") {
        return false;
      }
      if (auth.shareTargetType === shareTargetTypeSession) {
        return entry.sessionId === auth.shareTargetId;
      }
      try {
        const session = getApiSessionOrThrow(entry.sessionId);
        return isSessionVisibleToAuth(session, auth);
      } catch {
        return false;
      }
    });
  }

  function filterPayloadForAuth(payload, auth) {
    if (!isSpectatorAuth(auth)) {
      return payload;
    }
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (payload.type === "snapshot") {
      return {
        ...payload,
        sessions: Array.isArray(payload.sessions)
          ? payload.sessions
              .filter((session) => isSessionVisibleToAuth(session, auth))
              .map((session) => sanitizeApiSessionForAuth(session, auth))
          : [],
        outputs: filterOutputsForAuth(payload.outputs, auth),
        customCommands: [],
        decks: Array.isArray(payload.decks) ? payload.decks.filter((deck) => isDeckVisibleToAuth(deck, auth)) : []
      };
    }
    if (
      payload.type === "session.created" ||
      payload.type === "session.started" ||
      payload.type === "session.updated" ||
      payload.type === "session.activity.completed"
    ) {
      return isSessionVisibleToAuth(payload.session, auth)
        ? {
            ...payload,
            session: sanitizeApiSessionForAuth(payload.session, auth)
          }
        : null;
    }
    if (payload.type === "session.data" || payload.type === "session.exit" || payload.type === "session.closed") {
      return payload.sessionId === auth.shareTargetId ||
        (auth.shareTargetType === shareTargetTypeDeck &&
          (() => {
            try {
              const session = getApiSessionOrThrow(payload.sessionId);
              return isSessionVisibleToAuth(session, auth);
            } catch {
              return false;
            }
          })())
        ? payload
        : null;
    }
    if (payload.type === "deck.created" || payload.type === "deck.updated") {
      return isDeckVisibleToAuth(payload.deck, auth) ? payload : null;
    }
    if (payload.type === "deck.deleted") {
      return isDeckVisibleToAuth(payload.deckId, auth) ? payload : null;
    }
    if (payload.type?.startsWith?.("custom-command.")) {
      return null;
    }
    return payload;
  }

  return {
    filterOutputsForAuth,
    filterPayloadForAuth,
    getApiSessionOrThrow,
    getSpectatorTargetSession,
    isDeckVisibleToAuth,
    isSessionVisibleToAuth,
    listApiSessions,
    listSessionIdsForAuth,
    sanitizeApiSessionForAuth
  };
}
