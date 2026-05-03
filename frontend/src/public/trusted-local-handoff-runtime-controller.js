function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function setHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.hidden = hidden === true;
}

function closeDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.close === "function" && dialogEl.open === true) {
    dialogEl.close();
    return;
  }
  dialogEl.hidden = true;
}

function openDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.showModal === "function") {
    dialogEl.showModal();
    return;
  }
  dialogEl.hidden = false;
}

function isSessionNotFoundError(error) {
  const errorCode = normalizeText(error?.error);
  const message = normalizeText(error?.message);
  return (
    (Number(error?.status) === 404 && errorCode === "SessionNotFound") ||
    /^Session '.+' was not found\.$/i.test(message)
  );
}

function createMissingSessionTakeoverError() {
  return new Error("Trusted-local session takeover target is no longer available.");
}

export function createTrustedLocalHandoffRuntimeController(options = {}) {
  const promptEl = options.promptEl || null;
  const promptMessageEl = options.promptMessageEl || null;
  const promptYesBtn = options.promptYesBtn || null;
  const promptNoBtn = options.promptNoBtn || null;
  const openBtn = options.openBtn || null;
  const dialogEl = options.dialogEl || null;
  const dialogMetaEl = options.dialogMetaEl || null;
  const dialogCloseBtn = options.dialogCloseBtn || null;
  const dialogTakeAllBtn = options.dialogTakeAllBtn || null;
  const dialogTakeDeckBtn = options.dialogTakeDeckBtn || null;
  const dialogTakeSessionBtn = options.dialogTakeSessionBtn || null;
  const getState = typeof options.getState === "function" ? options.getState : () => ({ sessions: [], activeSessionId: "", activeDeckId: "" });
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const getActiveDeck = typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => null;
  const resolveDeckName = typeof options.resolveDeckName === "function" ? options.resolveDeckName : (deckId) => normalizeText(deckId);
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => normalizeText(sessionId);
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => normalizeText(session?.name);
  const canTakeSessionControl = typeof options.canTakeSessionControl === "function" ? options.canTakeSessionControl : () => false;
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const takeSessionControl = typeof options.takeSessionControl === "function" ? options.takeSessionControl : async () => null;
  const takeSessionControlScope =
    typeof options.takeSessionControlScope === "function" ? options.takeSessionControlScope : async () => ({ updatedSessions: [] });
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const applyDeviceLocalLayout = typeof options.applyDeviceLocalLayout === "function" ? options.applyDeviceLocalLayout : async () => ({ applied: false, captured: false });
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_err, fallback) => fallback;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};

  let startupPromptDismissed = false;

  function listSessions() {
    const state = getState();
    return Array.isArray(state.sessions) ? state.sessions : [];
  }

  function listTakeableSessions() {
    return listSessions().filter((session) => canTakeSessionControl(session));
  }

  function listTakeableSessionsForDeck(deckId) {
    const normalizedDeckId = normalizeText(deckId);
    if (!normalizedDeckId) {
      return [];
    }
    return listTakeableSessions().filter((session) => normalizeText(session?.deckId) === normalizedDeckId);
  }

  function getActiveSession() {
    const state = getState();
    return getSessionById(state.activeSessionId) || null;
  }

  function shouldShowStartupPrompt() {
    if (startupPromptDismissed || isReadOnlyMode()) {
      return false;
    }
    return listTakeableSessions().length > 0;
  }

  function getStartupPromptMessage() {
    const takeableSessions = listTakeableSessions();
    if (takeableSessions.length <= 1) {
      return "Use this device as the active controller and apply its local layout?";
    }
    return `Use this device as the active controller for ${takeableSessions.length} sessions and apply its local layouts?`;
  }

  function dismissStartupPrompt({ render = true } = {}) {
    startupPromptDismissed = true;
    if (render) {
      requestRender();
    }
  }

  async function applyUpdatedSessions(updatedSessions = []) {
    for (const session of updatedSessions) {
      if (!session || typeof session !== "object" || !normalizeText(session.id)) {
        continue;
      }
      applyRuntimeEvent({ type: "session.updated", session });
    }
  }

  function formatTakeFeedback(scope, options = {}, layoutResult = {}) {
    const normalizedScope = normalizeText(scope).toLowerCase();
    const targetDeckId = normalizeText(options.deckId);
    const targetSessionId = normalizeText(options.sessionId);
    const layoutSuffix = layoutResult.applied
      ? " Applied this device's local layout."
      : layoutResult.captured
        ? " Captured this device's current layout for future takeovers."
        : "";
    if (normalizedScope === "all") {
      return `This device now controls all available operator sessions.${layoutSuffix}`;
    }
    if (normalizedScope === "deck") {
      return `This device now controls deck [${targetDeckId}] ${resolveDeckName(targetDeckId)}.${layoutSuffix}`;
    }
    if (normalizedScope === "session") {
      const session = getSessionById(targetSessionId);
      return `This device now controls [${formatSessionToken(targetSessionId)}] ${formatSessionDisplayName(session) || targetSessionId}.${layoutSuffix}`;
    }
    return `This device now controls the requested scope.${layoutSuffix}`;
  }

  async function takeControlScope(scope, options = {}) {
    const normalizedScope = normalizeText(scope).toLowerCase();
    const normalizedDeckId = normalizeText(options.deckId);
    const normalizedSessionId = normalizeText(options.sessionId);
    try {
      if (normalizedScope !== "all" && normalizedScope !== "deck" && normalizedScope !== "session") {
        throw new Error("Trusted-local control handoff requires a known claim scope.");
      }
      if (normalizedScope === "deck" && !normalizedDeckId) {
        throw new Error("Trusted-local deck takeover requires an active deck.");
      }
      if (normalizedScope === "session" && !normalizedSessionId) {
        throw new Error("Trusted-local session takeover requires an active session.");
      }
      let updatedSessions = [];
      if (normalizedScope === "session") {
        const targetSession = getSessionById(normalizedSessionId);
        if (!targetSession || !canTakeSessionControl(targetSession)) {
          throw createMissingSessionTakeoverError();
        }
        const updatedSession = await takeSessionControl(normalizedSessionId);
        updatedSessions = updatedSession ? [updatedSession] : [];
      } else {
        const payload = await takeSessionControlScope({
          scope: normalizedScope,
          ...(normalizedDeckId ? { deckId: normalizedDeckId } : {}),
          ...(normalizedSessionId ? { sessionId: normalizedSessionId } : {})
        });
        updatedSessions = Array.isArray(payload?.updatedSessions) ? payload.updatedSessions : [];
      }
      await applyUpdatedSessions(updatedSessions);
      const layoutResult = await applyDeviceLocalLayout(normalizedScope, {
        deckId: normalizedDeckId || normalizeText(getActiveDeck()?.id),
        sessionId: normalizedSessionId
      });
      dismissStartupPrompt({ render: false });
      closeDialog(dialogEl);
      setCommandFeedback(formatTakeFeedback(normalizedScope, { deckId: normalizedDeckId, sessionId: normalizedSessionId }, layoutResult || {}));
      requestRender();
      return {
        updatedSessions,
        layoutResult: layoutResult || { applied: false, captured: false }
      };
    } catch (error) {
      const surfacedError = normalizedScope === "session" && isSessionNotFoundError(error) ? createMissingSessionTakeoverError() : error;
      setError(getErrorMessage(surfacedError, "Failed to take control on this device."));
      requestRender();
      throw surfacedError;
    }
  }

  function render() {
    const takeableSessions = listTakeableSessions();
    const activeDeck = getActiveDeck();
    const activeDeckId = normalizeText(activeDeck?.id);
    const activeSession = getActiveSession();
    if (openBtn) {
      openBtn.disabled = isReadOnlyMode() || listSessions().length === 0;
    }
    if (promptEl) {
      setHidden(promptEl, !shouldShowStartupPrompt());
    }
    if (promptMessageEl) {
      promptMessageEl.textContent = getStartupPromptMessage();
    }
    if (dialogMetaEl) {
      const parts = [];
      if (activeDeckId) {
        parts.push(`Deck: [${activeDeckId}] ${resolveDeckName(activeDeckId)}`);
      }
      if (activeSession?.id) {
        parts.push(`Session: [${formatSessionToken(activeSession.id)}] ${formatSessionDisplayName(activeSession) || activeSession.id}`);
      }
      dialogMetaEl.textContent = parts.join(" · ");
    }
    if (dialogTakeAllBtn) {
      dialogTakeAllBtn.disabled = isReadOnlyMode() || takeableSessions.length === 0;
    }
    if (dialogTakeDeckBtn) {
      dialogTakeDeckBtn.disabled = isReadOnlyMode() || listTakeableSessionsForDeck(activeDeckId).length === 0;
    }
    if (dialogTakeSessionBtn) {
      dialogTakeSessionBtn.disabled = isReadOnlyMode() || !activeSession || !canTakeSessionControl(activeSession);
    }
  }

  function bindUiEvents() {
    openBtn?.addEventListener?.("click", () => {
      openDialog(dialogEl);
      render();
    });
    dialogCloseBtn?.addEventListener?.("click", () => {
      closeDialog(dialogEl);
    });
    promptNoBtn?.addEventListener?.("click", () => {
      dismissStartupPrompt();
    });
    promptYesBtn?.addEventListener?.("click", () => {
      takeControlScope("all").catch(() => {});
    });
    dialogTakeAllBtn?.addEventListener?.("click", () => {
      takeControlScope("all").catch(() => {});
    });
    dialogTakeDeckBtn?.addEventListener?.("click", () => {
      const activeDeckId = normalizeText(getActiveDeck()?.id);
      if (!activeDeckId) {
        return;
      }
      takeControlScope("deck", { deckId: activeDeckId }).catch(() => {});
    });
    dialogTakeSessionBtn?.addEventListener?.("click", () => {
      const sessionId = normalizeText(getState().activeSessionId);
      if (!sessionId) {
        return;
      }
      takeControlScope("session", { sessionId }).catch(() => {});
    });
  }

  return {
    bindUiEvents,
    render,
    dismissStartupPrompt,
    takeControlScope
  };
}
