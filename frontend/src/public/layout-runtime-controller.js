export function createLayoutRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const localStorageRef = options.localStorageRef || windowRef?.localStorage || null;
  const settingsStorageKey = String(options.settingsStorageKey || "ptydeck.settings.v1");
  const sessionInputSettingsStorageKey = String(options.sessionInputSettingsStorageKey || "ptydeck.session-input-settings.v1");
  const sessionFilterStorageKey = String(options.sessionFilterStorageKey || "ptydeck.session-filter.v1");
  const defaultTerminalCols = Number(options.defaultTerminalCols) || 80;
  const defaultTerminalRows = Number(options.defaultTerminalRows) || 20;
  const sendTerminatorModeSet = options.sendTerminatorModeSet || new Set(["auto"]);
  const cardHorizontalChromePx = Number(options.cardHorizontalChromePx) || 6;
  const getLayoutSettingsController = options.getLayoutSettingsController || (() => null);
  const getTerminalSettings = options.getTerminalSettings || (() => ({ cols: defaultTerminalCols, rows: defaultTerminalRows, sidebarVisible: true }));
  const setTerminalSettings = options.setTerminalSettings || (() => {});
  const getSessionInputSettings = options.getSessionInputSettings || (() => ({}));
  const setSessionInputSettings = options.setSessionInputSettings || (() => {});
  const getActiveDeck = options.getActiveDeck || (() => null);
  const api = options.api || { updateDeck: async () => null };
  const applyRuntimeEvent = options.applyRuntimeEvent || (() => {});
  const applySettingsToAllTerminals = options.applySettingsToAllTerminals || (() => {});
  const scheduleGlobalResize = options.scheduleGlobalResize || (() => {});
  const render = options.render || (() => {});
  const setCommandFeedback = options.setCommandFeedback || (() => {});
  const setError = options.setError || (() => {});
  const getErrorMessage = options.getErrorMessage || (() => "Failed to save deck settings.");
  const settingsApplyBtn = options.settingsApplyBtn || null;
  const settingsColsEl = options.settingsColsEl || null;
  const settingsRowsEl = options.settingsRowsEl || null;
  const sidebarToggleBtn = options.sidebarToggleBtn || null;
  const sidebarLauncherBtn = options.sidebarLauncherBtn || null;

  function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function readStorageValue(key) {
    try {
      if (!localStorageRef || typeof localStorageRef.getItem !== "function") {
        return null;
      }
      return localStorageRef.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorageValue(key, value) {
    try {
      if (!localStorageRef || typeof localStorageRef.setItem !== "function") {
        return false;
      }
      localStorageRef.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorageValue(key) {
    try {
      if (!localStorageRef || typeof localStorageRef.removeItem !== "function") {
        return false;
      }
      localStorageRef.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function readStoredSettings() {
    const raw = readStorageValue(settingsStorageKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadTerminalSettings() {
    const stored = readStoredSettings();
    return {
      cols: clampInt(stored?.cols, defaultTerminalCols, 20, 400),
      rows: clampInt(stored?.rows, defaultTerminalRows, 5, 120),
      sidebarVisible: stored?.sidebarVisible !== false
    };
  }

  function saveTerminalSettings() {
    writeStorageValue(settingsStorageKey, JSON.stringify(getTerminalSettings()));
  }

  function normalizeSendTerminatorMode(value) {
    return sendTerminatorModeSet.has(value) ? value : "auto";
  }

  function loadSessionInputSettings() {
    const raw = readStorageValue(sessionInputSettingsStorageKey);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      const next = {};
      for (const [sessionId, value] of Object.entries(parsed)) {
        const mode = normalizeSendTerminatorMode(String(value?.sendTerminator || "").toLowerCase());
        next[sessionId] = { sendTerminator: mode };
      }
      return next;
    } catch {
      return {};
    }
  }

  function saveSessionInputSettings() {
    writeStorageValue(sessionInputSettingsStorageKey, JSON.stringify(getSessionInputSettings()));
  }

  function loadStoredSessionFilterText() {
    const raw = readStorageValue(sessionFilterStorageKey);
    return typeof raw === "string" ? raw.trim() : "";
  }

  function saveStoredSessionFilterText(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      removeStorageValue(sessionFilterStorageKey);
      return;
    }
    writeStorageValue(sessionFilterStorageKey, normalized);
  }

  function getSessionSendTerminator(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
      return "auto";
    }
    const mode = getSessionInputSettings()?.[sessionId]?.sendTerminator;
    return normalizeSendTerminatorMode(String(mode || "").toLowerCase());
  }

  function setSessionSendTerminator(sessionId, mode) {
    if (!sessionId || typeof sessionId !== "string") {
      return;
    }
    const nextMode = normalizeSendTerminatorMode(String(mode || "").toLowerCase());
    setSessionInputSettings({
      ...getSessionInputSettings(),
      [sessionId]: { sendTerminator: nextMode }
    });
    saveSessionInputSettings();
  }

  function measureTerminalCellWidthPx() {
    const controller = getLayoutSettingsController();
    if (!controller) {
      return 10;
    }
    return Math.max(7, Math.ceil((controller.computeFixedCardWidthPx(1) - cardHorizontalChromePx) || 10));
  }

  function computeFixedMountHeightPx(rows) {
    const controller = getLayoutSettingsController();
    if (!controller) {
      return Math.max(120, Math.round(rows * 19.2 + 18));
    }
    return controller.computeFixedMountHeightPx(rows);
  }

  function computeFixedCardWidthPx(cols) {
    const controller = getLayoutSettingsController();
    if (!controller) {
      const cellWidthPx = measureTerminalCellWidthPx();
      return Math.max(260, Math.round(cols * cellWidthPx + cardHorizontalChromePx));
    }
    return controller.computeFixedCardWidthPx(cols);
  }

  function syncTerminalGeometryCss() {
    getLayoutSettingsController()?.syncTerminalGeometryCss(getTerminalSettings());
  }

  function syncSettingsUi() {
    getLayoutSettingsController()?.syncSettingsUi(getTerminalSettings());
  }

  function readSettingsFromUi() {
    const terminalSettings = getTerminalSettings();
    const controller = getLayoutSettingsController();
    if (!controller) {
      return {
        cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
        rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120),
        sidebarVisible: terminalSettings.sidebarVisible !== false
      };
    }
    return controller.readSettingsFromUi(terminalSettings);
  }

  async function applyTerminalSizeSettings(nextCols, nextRows) {
    const activeDeck = getActiveDeck();
    if (!activeDeck) {
      throw new Error("No active deck available.");
    }
    const currentSettings =
      activeDeck.settings && typeof activeDeck.settings === "object" && !Array.isArray(activeDeck.settings)
        ? activeDeck.settings
        : {};
    const updatedDeck = await api.updateDeck(activeDeck.id, {
      settings: {
        ...currentSettings,
        terminal: {
          cols: nextCols,
          rows: nextRows
        }
      }
    });
    applyRuntimeEvent(
      {
        type: "deck.updated",
        deck: updatedDeck
      },
      { preferredActiveDeckId: updatedDeck.id }
    );
    applySettingsToAllTerminals({ deckId: activeDeck.id, force: true });
    scheduleGlobalResize({ deckId: activeDeck.id, force: true });
    render();
  }

  async function onApplySettings() {
    const next = readSettingsFromUi();
    try {
      await applyTerminalSizeSettings(next.cols, next.rows);
      setCommandFeedback(`Deck size set to ${next.cols}x${next.rows} for '${getActiveDeck()?.name || "deck"}'.`);
    } catch (error) {
      setError(getErrorMessage(error, "Failed to save deck settings."));
    }
  }

  function setSidebarVisible(visible) {
    const terminalSettings = getTerminalSettings();
    const nextVisible = Boolean(visible);
    if ((terminalSettings.sidebarVisible !== false) === nextVisible) {
      return false;
    }
    setTerminalSettings({
      ...terminalSettings,
      sidebarVisible: nextVisible
    });
    saveTerminalSettings();
    syncSettingsUi();
    scheduleGlobalResize();
    return true;
  }

  function bindUiEvents() {
    if (sidebarToggleBtn && typeof sidebarToggleBtn.addEventListener === "function") {
      sidebarToggleBtn.addEventListener("click", () => setSidebarVisible(false));
    }
    if (sidebarLauncherBtn && typeof sidebarLauncherBtn.addEventListener === "function") {
      sidebarLauncherBtn.addEventListener("click", () => setSidebarVisible(true));
    }
    if (settingsApplyBtn && typeof settingsApplyBtn.addEventListener === "function") {
      settingsApplyBtn.addEventListener("click", onApplySettings);
    }
    const bindEnter = (inputEl) => {
      if (!inputEl || typeof inputEl.addEventListener !== "function") {
        return;
      }
      inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onApplySettings();
        }
      });
    };
    bindEnter(settingsColsEl);
    bindEnter(settingsRowsEl);
  }

  return {
    clampInt,
    loadTerminalSettings,
    saveTerminalSettings,
    normalizeSendTerminatorMode,
    loadSessionInputSettings,
    saveSessionInputSettings,
    loadStoredSessionFilterText,
    saveStoredSessionFilterText,
    getSessionSendTerminator,
    setSessionSendTerminator,
    measureTerminalCellWidthPx,
    computeFixedMountHeightPx,
    computeFixedCardWidthPx,
    syncTerminalGeometryCss,
    syncSettingsUi,
    readSettingsFromUi,
    applyTerminalSizeSettings,
    onApplySettings,
    setSidebarVisible,
    bindUiEvents
  };
}
