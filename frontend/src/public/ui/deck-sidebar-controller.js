export function createDeckSidebarController(options = {}) {
  const containerEl = options.containerEl || null;
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "default");
  const ensureQuickId = typeof options.ensureQuickId === "function" ? options.ensureQuickId : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || session?.id || "");
  const getSessionActivityIndicatorState =
    typeof options.getSessionActivityIndicatorState === "function" ? options.getSessionActivityIndicatorState : () => "";
  const onActivateDeck = typeof options.onActivateDeck === "function" ? options.onActivateDeck : () => {};
  const onActivateSession = typeof options.onActivateSession === "function" ? options.onActivateSession : () => {};

  function getSessionCountForDeck(deckId, sessions) {
    return sessions.reduce((count, session) => (resolveSessionDeckId(session) === deckId ? count + 1 : count), 0);
  }

  function clearContainer() {
    if (!containerEl) {
      return;
    }
    while (containerEl.firstChild) {
      containerEl.removeChild(containerEl.firstChild);
    }
  }

  function render(state = {}) {
    if (!containerEl || !documentRef || typeof documentRef.createElement !== "function") {
      return;
    }
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const activeDeckId = String(state.activeDeckId || "");
    const activeSessionId = String(state.activeSessionId || "");

    clearContainer();
    if (decks.length === 0) {
      const hint = documentRef.createElement("span");
      hint.className = "deck-tab deck-tab-empty";
      hint.textContent = "No decks";
      containerEl.appendChild(hint);
      return;
    }

    for (const deck of decks) {
      const group = documentRef.createElement("div");
      group.className = "deck-group";
      group.setAttribute("data-deck-id", deck.id);

      const tab = documentRef.createElement("button");
      tab.type = "button";
      tab.className = "deck-tab";
      if (deck.id === activeDeckId) {
        tab.classList.add("active");
      }
      tab.setAttribute("data-deck-id", deck.id);
      const count = getSessionCountForDeck(deck.id, sessions);
      const nameEl = documentRef.createElement("span");
      nameEl.className = "deck-tab-name";
      nameEl.textContent = deck.name;
      const countEl = documentRef.createElement("span");
      countEl.className = "deck-tab-count";
      countEl.textContent = String(count);
      tab.appendChild(nameEl);
      tab.appendChild(countEl);
      tab.addEventListener("click", () => onActivateDeck(deck.id));
      group.appendChild(tab);

      const deckSessions = sessions.filter((session) => resolveSessionDeckId(session) === deck.id);
      if (deckSessions.length > 0) {
        const sessionList = documentRef.createElement("div");
        sessionList.className = "deck-session-list";
        for (const session of deckSessions) {
          const sessionButton = documentRef.createElement("button");
          sessionButton.type = "button";
          sessionButton.className = "deck-session-btn";
          sessionButton.setAttribute("data-session-id", session.id);
          if (activeSessionId === session.id) {
            sessionButton.classList.add("active");
          }

          const quickIdEl = documentRef.createElement("span");
          quickIdEl.className = "deck-session-quick-id session-quick-id";
          quickIdEl.textContent = ensureQuickId(session.id);

          const sessionNameEl = documentRef.createElement("span");
          sessionNameEl.className = "deck-session-name";
          sessionNameEl.textContent = formatSessionDisplayName(session);

          const activityIndicatorEl = documentRef.createElement("span");
          activityIndicatorEl.className = "deck-session-activity-indicator";
          const activityIndicatorState = getSessionActivityIndicatorState(session);
          activityIndicatorEl.hidden = !activityIndicatorState;
          if (activityIndicatorState) {
            activityIndicatorEl.classList.add(activityIndicatorState);
          }
          activityIndicatorEl.setAttribute("aria-hidden", "true");

          sessionButton.appendChild(quickIdEl);
          sessionButton.appendChild(sessionNameEl);
          sessionButton.appendChild(activityIndicatorEl);
          sessionButton.addEventListener("click", () => onActivateSession(session));
          sessionList.appendChild(sessionButton);
        }
        group.appendChild(sessionList);
      }

      containerEl.appendChild(group);
    }
  }

  return {
    render,
    getSessionCountForDeck
  };
}
