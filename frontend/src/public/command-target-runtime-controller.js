export function createCommandTargetRuntimeController(options = {}) {
  const commandEngine = options.commandEngine || {};
  const store = options.store || null;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "");
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");
  let lastActiveSessionId = String(store?.getState?.().activeSessionId || "");
  let lastActiveSessionSwitchAt = 0;

  if (typeof store?.subscribe === "function") {
    store.subscribe((snapshot) => {
      const nextActiveSessionId = String(snapshot?.activeSessionId || "");
      if (nextActiveSessionId !== lastActiveSessionId) {
        if (lastActiveSessionId && nextActiveSessionId) {
          lastActiveSessionSwitchAt = nowMs();
        }
        lastActiveSessionId = nextActiveSessionId;
      }
    });
  }

  function resolveSessionToken(token, sessions) {
    return typeof commandEngine.resolveSessionToken === "function"
      ? commandEngine.resolveSessionToken(token, sessions)
      : { session: null, error: "Unknown session target." };
  }

  function resolveDeckToken(token, decks) {
    return typeof commandEngine.resolveDeckToken === "function"
      ? commandEngine.resolveDeckToken(token, decks)
      : { deck: null, error: "Unknown deck target." };
  }

  function resolveQuickSwitchTarget(selectorText, sessions) {
    return typeof commandEngine.resolveQuickSwitchTarget === "function"
      ? commandEngine.resolveQuickSwitchTarget(selectorText, sessions)
      : { error: "Unknown target." };
  }

  function formatQuickSwitchPreview(selectorText, sessions) {
    return typeof commandEngine.formatQuickSwitchPreview === "function"
      ? commandEngine.formatQuickSwitchPreview(selectorText, sessions)
      : "";
  }

  function resolveTargetSelectors(selectorText, sessions, extraOptions = {}) {
    return typeof commandEngine.resolveTargetSelectors === "function"
      ? commandEngine.resolveTargetSelectors(selectorText, sessions, extraOptions)
      : { sessions: [], error: "" };
  }

  function resolveFilterSelectors(selectorText, sessions, extraOptions = {}) {
    return typeof commandEngine.resolveFilterSelectors === "function"
      ? commandEngine.resolveFilterSelectors(selectorText, sessions, extraOptions)
      : { sessions: [], error: "" };
  }

  function resolveSettingsTargets(selectorText, sessions, activeSessionId) {
    return typeof commandEngine.resolveSettingsTargets === "function"
      ? commandEngine.resolveSettingsTargets(selectorText, sessions, activeSessionId)
      : { sessions: [], error: "" };
  }

  function parseSettingsPayload(raw) {
    return typeof commandEngine.parseSettingsPayload === "function"
      ? commandEngine.parseSettingsPayload(raw)
      : { ok: false, error: "Settings payload parser is unavailable." };
  }

  function parseSizeCommandArgs(args, currentCols, currentRows) {
    return typeof commandEngine.parseSizeCommandArgs === "function"
      ? commandEngine.parseSizeCommandArgs(args, currentCols, currentRows)
      : { ok: false, error: "Size parser is unavailable." };
  }

  function parseDirectTargetRoutingInput(rawInput) {
    return typeof commandEngine.parseDirectTargetRoutingInput === "function"
      ? commandEngine.parseDirectTargetRoutingInput(rawInput)
      : { matched: false, targetToken: "", payload: "" };
  }

  function parseCustomDefinition(rawInput) {
    return typeof commandEngine.parseCustomDefinition === "function"
      ? commandEngine.parseCustomDefinition(rawInput)
      : { ok: false, error: "Custom command parser is unavailable." };
  }

  function activateSessionTarget(session) {
    if (!session || !session.id) {
      return { ok: false, message: "Unknown session target." };
    }
    const beforeState = store?.getState?.() || {};
    const previousActiveSessionId = beforeState.activeSessionId || "";
    const previousActiveDeckId = beforeState.activeDeckId || "";
    const targetDeckId = resolveSessionDeckId(session);
    if (targetDeckId) {
      setActiveDeck(targetDeckId);
    }
    const state = store?.getState?.() || {};
    if (state.activeSessionId === session.id && previousActiveSessionId === session.id && previousActiveDeckId === targetDeckId) {
      return {
        ok: true,
        message: `Session already active: [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`,
        noop: true
      };
    }
    store?.setActiveSession?.(session.id);
    return {
      ok: true,
      message: `Active session: [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`,
      noop: false
    };
  }

  function activateDeckTarget(deck) {
    if (!deck || !deck.id) {
      return { ok: false, message: "Unknown deck target." };
    }
    if (store?.getState?.().activeDeckId === deck.id) {
      return {
        ok: true,
        message: `Deck already active: [${deck.id}] ${deck.name}.`,
        noop: true
      };
    }
    const changed = setActiveDeck(deck.id);
    if (!changed) {
      return { ok: false, message: `Failed to switch deck: ${deck.id}` };
    }
    return {
      ok: true,
      message: `Active deck: [${deck.id}] ${deck.name}.`,
      noop: false
    };
  }

  function getLastActiveSessionSwitchAt() {
    return lastActiveSessionSwitchAt;
  }

  function getActiveSessionTarget() {
    const state = store?.getState?.() || {};
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    return sessions.find((session) => session.id === state.activeSessionId) || null;
  }

  function formatActiveTargetSummary() {
    const activeSession = getActiveSessionTarget();
    if (!activeSession) {
      return "Target: no active session.";
    }
    return `Target: [${formatSessionToken(activeSession.id)}] ${formatSessionDisplayName(activeSession)}`;
  }

  return {
    resolveSessionToken,
    resolveDeckToken,
    resolveQuickSwitchTarget,
    formatQuickSwitchPreview,
    resolveTargetSelectors,
    resolveFilterSelectors,
    resolveSettingsTargets,
    parseSettingsPayload,
    parseSizeCommandArgs,
    parseDirectTargetRoutingInput,
    parseCustomDefinition,
    activateSessionTarget,
    activateDeckTarget,
    getLastActiveSessionSwitchAt,
    getActiveSessionTarget,
    formatActiveTargetSummary
  };
}
