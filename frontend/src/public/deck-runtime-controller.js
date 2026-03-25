export function createDeckRuntimeController(options = {}) {
  const store = options.store || null;
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const activeDeckStorageKey = String(options.activeDeckStorageKey || "ptydeck.active-deck.v1");
  const defaultDeckId = String(options.defaultDeckId || "default");
  const defaultTerminalCols = Number.isInteger(options.defaultTerminalCols) ? options.defaultTerminalCols : 80;
  const defaultTerminalRows = Number.isInteger(options.defaultTerminalRows) ? options.defaultTerminalRows : 20;
  const clampInt =
    typeof options.clampInt === "function"
      ? options.clampInt
      : (value, fallback, min, max) => {
          const parsed = Number.parseInt(String(value ?? ""), 10);
          if (!Number.isFinite(parsed)) {
            return fallback;
          }
          return Math.min(Math.max(parsed, min), max);
        };
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => ({ cols: defaultTerminalCols, rows: defaultTerminalRows });
  const setTerminalSettings = typeof options.setTerminalSettings === "function" ? options.setTerminalSettings : () => {};
  const persistTerminalSettings =
    typeof options.persistTerminalSettings === "function" ? options.persistTerminalSettings : () => {};
  const syncSettingsUi = typeof options.syncSettingsUi === "function" ? options.syncSettingsUi : () => {};
  const applySettingsToAllTerminals =
    typeof options.applySettingsToAllTerminals === "function" ? options.applySettingsToAllTerminals : () => {};
  const scheduleGlobalResize =
    typeof options.scheduleGlobalResize === "function" ? options.scheduleGlobalResize : () => {};
  const scheduleDeferredResizePasses =
    typeof options.scheduleDeferredResizePasses === "function" ? options.scheduleDeferredResizePasses : () => {};
  const getDeckSidebarController =
    typeof options.getDeckSidebarController === "function" ? options.getDeckSidebarController : () => null;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || defaultDeckId);
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;

  function loadStoredActiveDeckId() {
    try {
      if (!windowRef?.localStorage || typeof windowRef.localStorage.getItem !== "function") {
        return "";
      }
      return String(windowRef.localStorage.getItem(activeDeckStorageKey) || "").trim();
    } catch {
      return "";
    }
  }

  function saveStoredActiveDeckId(deckId) {
    try {
      if (!windowRef?.localStorage) {
        return;
      }
      if (!deckId) {
        if (typeof windowRef.localStorage.removeItem === "function") {
          windowRef.localStorage.removeItem(activeDeckStorageKey);
        }
        return;
      }
      if (typeof windowRef.localStorage.setItem === "function") {
        windowRef.localStorage.setItem(activeDeckStorageKey, String(deckId));
      }
    } catch {
      // ignore storage failures
    }
  }

  function normalizeDeckTerminalSettings(rawSettings) {
    const terminal = rawSettings && typeof rawSettings === "object" ? rawSettings.terminal : null;
    return {
      cols: clampInt(terminal?.cols, defaultTerminalCols, 20, 400),
      rows: clampInt(terminal?.rows, defaultTerminalRows, 5, 120)
    };
  }

  function normalizeDeckEntry(deck) {
    const id = String(deck?.id || "").trim();
    const fallbackName = id || "Deck";
    const name = String(deck?.name || fallbackName).trim() || fallbackName;
    return {
      id,
      name,
      settings: deck && typeof deck.settings === "object" && !Array.isArray(deck.settings) ? deck.settings : {},
      createdAt: Number(deck?.createdAt || 0),
      updatedAt: Number(deck?.updatedAt || 0)
    };
  }

  function getDeckById(deckId) {
    return store?.getState().decks.find((deck) => deck.id === deckId) || null;
  }

  function getActiveDeck() {
    const preferred = getDeckById(store?.getState().activeDeckId);
    if (preferred) {
      return preferred;
    }
    const decks = store?.getState().decks || [];
    if (decks.length > 0) {
      return decks[0];
    }
    return null;
  }

  function getDeckTerminalGeometry(deckId) {
    const deck = getDeckById(deckId);
    return normalizeDeckTerminalSettings(deck?.settings);
  }

  function getSessionTerminalGeometry(sessionOrId) {
    const session =
      typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId && typeof sessionOrId === "object" ? sessionOrId : null;
    const deckId = resolveSessionDeckId(session);
    return getDeckTerminalGeometry(deckId);
  }

  function syncActiveDeckGeometryFromState() {
    const activeDeck = getActiveDeck();
    if (!activeDeck) {
      return false;
    }
    const nextSize = normalizeDeckTerminalSettings(activeDeck.settings);
    const current = getTerminalSettings() || {};
    const changed = current.cols !== nextSize.cols || current.rows !== nextSize.rows;
    setTerminalSettings({
      ...current,
      cols: nextSize.cols,
      rows: nextSize.rows
    });
    persistTerminalSettings();
    syncSettingsUi();
    if (changed) {
      applySettingsToAllTerminals({ deckId: activeDeck.id, force: true });
      scheduleGlobalResize({ deckId: activeDeck.id, force: true });
    }
    return changed;
  }

  function setDecks(nextDecks, options = {}) {
    const normalizedDecks = Array.isArray(nextDecks)
      ? nextDecks.map(normalizeDeckEntry).filter((deck) => Boolean(deck.id))
      : [];
    const preferredActiveDeckId = String(options.preferredActiveDeckId || store?.getState().activeDeckId || "").trim();
    store?.setDecks(normalizedDecks, { preferredActiveDeckId });
    saveStoredActiveDeckId(store?.getState().activeDeckId);
    syncActiveDeckGeometryFromState();
  }

  function upsertDeckInState(nextDeck, options = {}) {
    const normalizedDeck = normalizeDeckEntry(nextDeck);
    if (!normalizedDeck.id) {
      return;
    }
    store?.upsertDeck(normalizedDeck, {
      preferredActiveDeckId: options.preferredActiveDeckId || store?.getState().activeDeckId || normalizedDeck.id
    });
    saveStoredActiveDeckId(store?.getState().activeDeckId);
    syncActiveDeckGeometryFromState();
  }

  function removeDeckFromState(deckId, options = {}) {
    const normalizedDeckId = String(deckId || "").trim();
    if (!normalizedDeckId) {
      return;
    }
    store?.removeDeck(normalizedDeckId, {
      preferredActiveDeckId: options.preferredActiveDeckId,
      fallbackDeckId: options.fallbackDeckId || defaultDeckId
    });
    saveStoredActiveDeckId(store?.getState().activeDeckId);
    syncActiveDeckGeometryFromState();
  }

  function getSessionCountForDeck(deckId, sessions) {
    const sidebarController = getDeckSidebarController();
    if (sidebarController && typeof sidebarController.getSessionCountForDeck === "function") {
      return sidebarController.getSessionCountForDeck(deckId, sessions);
    }
    return sessions.reduce((count, session) => (resolveSessionDeckId(session) === deckId ? count + 1 : count), 0);
  }

  function renderDeckTabs(sessions) {
    const sidebarController = getDeckSidebarController();
    if (!sidebarController || typeof sidebarController.render !== "function") {
      return;
    }
    const state = store?.getState() || {};
    sidebarController.render({
      decks: state.decks,
      sessions,
      activeDeckId: state.activeDeckId,
      activeSessionId: state.activeSessionId
    });
  }

  function setActiveDeck(deckId) {
    const normalized = String(deckId || "").trim();
    if (!normalized) {
      return false;
    }
    const target = getDeckById(normalized);
    if (!target) {
      return false;
    }
    if (store?.getState().activeDeckId === normalized) {
      return true;
    }
    const changed = store?.setActiveDeck(normalized);
    if (!changed) {
      return true;
    }
    saveStoredActiveDeckId(normalized);
    syncActiveDeckGeometryFromState();
    scheduleGlobalResize({ deckId: normalized, force: true });
    scheduleDeferredResizePasses({ deckId: normalized, force: true });
    return true;
  }

  return {
    loadStoredActiveDeckId,
    saveStoredActiveDeckId,
    getDeckById,
    getActiveDeck,
    getDeckTerminalGeometry,
    getSessionTerminalGeometry,
    setDecks,
    upsertDeckInState,
    removeDeckFromState,
    getSessionCountForDeck,
    renderDeckTabs,
    setActiveDeck,
    syncActiveDeckGeometryFromState
  };
}
