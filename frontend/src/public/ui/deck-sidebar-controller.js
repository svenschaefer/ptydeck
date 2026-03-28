export function createDeckSidebarController(options = {}) {
  const containerEl = options.containerEl || null;
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "default");
  const ensureQuickId = typeof options.ensureQuickId === "function" ? options.ensureQuickId : (sessionId) => String(sessionId || "");
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const resolveDeckSessions =
    typeof options.resolveDeckSessions === "function" ? options.resolveDeckSessions : (_deckId, sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || session?.id || "");
  const getSessionActivityIndicatorState =
    typeof options.getSessionActivityIndicatorState === "function" ? options.getSessionActivityIndicatorState : () => "";
  const onActivateDeck = typeof options.onActivateDeck === "function" ? options.onActivateDeck : () => {};
  const onActivateSession = typeof options.onActivateSession === "function" ? options.onActivateSession : () => {};
  const onRenameDeck = typeof options.onRenameDeck === "function" ? options.onRenameDeck : () => Promise.resolve();
  const onDeleteDeck = typeof options.onDeleteDeck === "function" ? options.onDeleteDeck : () => Promise.resolve();
  const onSwapDeckSessions =
    typeof options.onSwapDeckSessions === "function" ? options.onSwapDeckSessions : () => Promise.resolve();
  const canDeleteDeck = typeof options.canDeleteDeck === "function" ? options.canDeleteDeck : () => true;
  let openSettingsDeckId = "";
  let lastRenderState = null;

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
    lastRenderState = state;
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const sessions = sortSessionsByQuickId(Array.isArray(state.sessions) ? state.sessions : []);
    const activeDeckId = String(state.activeDeckId || "");
    const activeSessionId = String(state.activeSessionId || "");
    const hasOpenSettingsDeck = decks.some((deck) => deck.id === openSettingsDeckId);
    if (!hasOpenSettingsDeck || openSettingsDeckId !== activeDeckId) {
      openSettingsDeckId = "";
    }

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

      const tabShell = documentRef.createElement("div");
      tabShell.className = "deck-tab-shell";

      const tab = documentRef.createElement("button");
      tab.type = "button";
      tab.className = "deck-tab";
      if (deck.id === activeDeckId) {
        tab.classList.add("active");
        tab.classList.add("with-settings");
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
      tabShell.appendChild(tab);

      if (deck.id === activeDeckId) {
        const settingsBtn = documentRef.createElement("button");
        settingsBtn.type = "button";
        settingsBtn.className = "deck-tab-settings";
        settingsBtn.setAttribute("aria-label", `Open settings for deck ${deck.name}`);
        settingsBtn.setAttribute("title", `Open settings for deck ${deck.name}`);
        settingsBtn.textContent = "⚙";
        settingsBtn.addEventListener("click", () => {
          openSettingsDeckId = openSettingsDeckId === deck.id ? "" : deck.id;
          render(lastRenderState || state);
        });
        tabShell.appendChild(settingsBtn);
      }

      group.appendChild(tabShell);

      const allDeckSessions = sessions.filter((session) => resolveSessionDeckId(session) === deck.id);
      const deckSessions = resolveDeckSessions(deck.id, allDeckSessions, {
        deck,
        sessions
      });

      if (deck.id === activeDeckId && openSettingsDeckId === deck.id) {
        const settingsPanel = documentRef.createElement("div");
        settingsPanel.className = "deck-settings-panel";

        const settingsTitle = documentRef.createElement("p");
        settingsTitle.className = "deck-settings-title";
        settingsTitle.textContent = "Deck Settings";
        settingsPanel.appendChild(settingsTitle);

        const settingsActions = documentRef.createElement("div");
        settingsActions.className = "deck-settings-actions";

        const renameBtn = documentRef.createElement("button");
        renameBtn.type = "button";
        renameBtn.textContent = "Rename Deck";
        renameBtn.addEventListener("click", () => {
          openSettingsDeckId = "";
          render(lastRenderState || state);
          void onRenameDeck(deck);
        });
        settingsActions.appendChild(renameBtn);

        const deleteBtn = documentRef.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "Delete Deck";
        deleteBtn.disabled = canDeleteDeck(deck) !== true;
        deleteBtn.addEventListener("click", () => {
          openSettingsDeckId = "";
          render(lastRenderState || state);
          void onDeleteDeck(deck);
        });
        settingsActions.appendChild(deleteBtn);

        settingsPanel.appendChild(settingsActions);

        const settingsOrderTitle = documentRef.createElement("p");
        settingsOrderTitle.className = "deck-settings-title";
        settingsOrderTitle.textContent = "Session Order";
        settingsPanel.appendChild(settingsOrderTitle);

        if (deckSessions.length === 0) {
          const emptyOrder = documentRef.createElement("p");
          emptyOrder.className = "deck-settings-empty";
          emptyOrder.textContent = "No sessions in this deck.";
          settingsPanel.appendChild(emptyOrder);
        } else {
          const orderList = documentRef.createElement("div");
          orderList.className = "deck-settings-order-list";
          for (let index = 0; index < deckSessions.length; index += 1) {
            const session = deckSessions[index];
            const previousSession = index > 0 ? deckSessions[index - 1] : null;
            const nextSession = index < deckSessions.length - 1 ? deckSessions[index + 1] : null;

            const row = documentRef.createElement("div");
            row.className = "deck-settings-order-row";
            row.setAttribute("data-session-id", session.id);

            const label = documentRef.createElement("span");
            label.className = "deck-settings-order-label";
            label.textContent = `[${ensureQuickId(session.id)}] ${formatSessionDisplayName(session)}`;
            row.appendChild(label);

            const rowActions = documentRef.createElement("div");
            rowActions.className = "deck-settings-order-actions";

            const upBtn = documentRef.createElement("button");
            upBtn.type = "button";
            upBtn.textContent = "↑";
            upBtn.setAttribute("aria-label", `Move ${formatSessionDisplayName(session)} up`);
            upBtn.disabled = !previousSession;
            upBtn.addEventListener("click", () => {
              if (!previousSession) {
                return;
              }
              void onSwapDeckSessions(session, previousSession);
            });
            rowActions.appendChild(upBtn);

            const downBtn = documentRef.createElement("button");
            downBtn.type = "button";
            downBtn.textContent = "↓";
            downBtn.setAttribute("aria-label", `Move ${formatSessionDisplayName(session)} down`);
            downBtn.disabled = !nextSession;
            downBtn.addEventListener("click", () => {
              if (!nextSession) {
                return;
              }
              void onSwapDeckSessions(session, nextSession);
            });
            rowActions.appendChild(downBtn);

            row.appendChild(rowActions);
            orderList.appendChild(row);
          }
          settingsPanel.appendChild(orderList);
        }

        group.appendChild(settingsPanel);
      }
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
