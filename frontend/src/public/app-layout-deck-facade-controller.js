function computeFallbackCardWidthPx(cols, measureCellWidthPx) {
  return Math.max(260, Math.round(cols * measureCellWidthPx));
}

function computeFallbackMountHeightPx(rows, terminalFontSize, terminalLineHeight) {
  return Math.max(120, Math.round(rows * terminalFontSize * terminalLineHeight));
}

export function createAppLayoutDeckFacadeController(options = {}) {
  const store = options.store || null;
  const getLayoutRuntimeController =
    typeof options.getLayoutRuntimeController === "function" ? options.getLayoutRuntimeController : () => null;
  const getDeckRuntimeController =
    typeof options.getDeckRuntimeController === "function" ? options.getDeckRuntimeController : () => null;
  const getSessionTerminalResizeController =
    typeof options.getSessionTerminalResizeController === "function"
      ? options.getSessionTerminalResizeController
      : () => null;
  const getSessionSettingsDialogController =
    typeof options.getSessionSettingsDialogController === "function"
      ? options.getSessionSettingsDialogController
      : () => null;
  const getDeckActionsController =
    typeof options.getDeckActionsController === "function" ? options.getDeckActionsController : () => null;
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => null;
  const defaultTerminalCols = Number.isInteger(options.defaultTerminalCols) ? options.defaultTerminalCols : 80;
  const defaultTerminalRows = Number.isInteger(options.defaultTerminalRows) ? options.defaultTerminalRows : 20;
  const terminalFontSize = Number.isFinite(options.terminalFontSize) ? options.terminalFontSize : 16;
  const terminalLineHeight = Number.isFinite(options.terminalLineHeight) ? options.terminalLineHeight : 1.2;
  const clearUiError = typeof options.clearUiError === "function" ? options.clearUiError : () => {};

  function clampInt(value, fallback, min, max) {
    return getLayoutRuntimeController()?.clampInt?.(value, fallback, min, max) ?? fallback;
  }

  function saveTerminalSettings() {
    getLayoutRuntimeController()?.saveTerminalSettings?.();
  }

  function getSessionFilterText() {
    return store?.getState?.().sessionFilterText || "";
  }

  function setSessionFilterText(value) {
    store?.setSessionFilterText?.(value);
    saveStoredSessionFilterText(store?.getState?.().sessionFilterText || "");
  }

  function getDeckById(deckId) {
    return getDeckRuntimeController()?.getDeckById?.(deckId) || null;
  }

  function resolveDeckName(deckId) {
    return getDeckById(deckId)?.name || String(deckId || "").trim();
  }

  function getActiveDeck() {
    return getDeckRuntimeController()?.getActiveDeck?.() || null;
  }

  function getDeckTerminalGeometry(deckId) {
    return (
      getDeckRuntimeController()?.getDeckTerminalGeometry?.(deckId) || {
        cols: defaultTerminalCols,
        rows: defaultTerminalRows
      }
    );
  }

  function getSessionTerminalGeometry(sessionOrId) {
    return (
      getDeckRuntimeController()?.getSessionTerminalGeometry?.(sessionOrId) || {
        cols: defaultTerminalCols,
        rows: defaultTerminalRows
      }
    );
  }

  function setDecks(nextDecks, options = {}) {
    getDeckRuntimeController()?.setDecks?.(nextDecks, options);
  }

  function upsertDeckInState(nextDeck, options = {}) {
    getDeckRuntimeController()?.upsertDeckInState?.(nextDeck, options);
  }

  function removeDeckFromState(deckId, options = {}) {
    getDeckRuntimeController()?.removeDeckFromState?.(deckId, options);
  }

  function normalizeSendTerminatorMode(value) {
    return getLayoutRuntimeController()?.normalizeSendTerminatorMode?.(value) || "auto";
  }

  function loadStoredSessionFilterText() {
    return getLayoutRuntimeController()?.loadStoredSessionFilterText?.() || "";
  }

  function saveStoredSessionFilterText(value) {
    getLayoutRuntimeController()?.saveStoredSessionFilterText?.(value);
  }

  function getSessionSendTerminator(sessionId) {
    return getLayoutRuntimeController()?.getSessionSendTerminator?.(sessionId) || "auto";
  }

  function setSessionSendTerminator(sessionId, mode) {
    getLayoutRuntimeController()?.setSessionSendTerminator?.(sessionId, mode);
  }

  function measureTerminalCellWidthPx() {
    return getLayoutRuntimeController()?.measureTerminalCellWidthPx?.() || 10;
  }

  function computeFixedMountHeightPx(rows) {
    return (
      getLayoutRuntimeController()?.computeFixedMountHeightPx?.(rows) ||
      computeFallbackMountHeightPx(rows, terminalFontSize, terminalLineHeight)
    );
  }

  function computeFixedCardWidthPx(cols) {
    return (
      getLayoutRuntimeController()?.computeFixedCardWidthPx?.(cols) ||
      computeFallbackCardWidthPx(cols, measureTerminalCellWidthPx())
    );
  }

  function syncTerminalGeometryCss() {
    getLayoutRuntimeController()?.syncTerminalGeometryCss?.();
  }

  function syncSettingsUi() {
    getLayoutRuntimeController()?.syncSettingsUi?.();
  }

  function readSettingsFromUi() {
    return (
      getLayoutRuntimeController()?.readSettingsFromUi?.() || {
        cols: getTerminalSettings()?.cols || defaultTerminalCols,
        rows: getTerminalSettings()?.rows || defaultTerminalRows,
        sidebarVisible: getTerminalSettings()?.sidebarVisible !== false
      }
    );
  }

  async function applyTerminalSizeSettings(nextCols, nextRows) {
    clearUiError();
    return getLayoutRuntimeController()?.applyTerminalSizeSettings?.(nextCols, nextRows);
  }

  function applySettingsToAllTerminals(options = {}) {
    getSessionTerminalResizeController()?.applySettingsToAllTerminals?.(options);
  }

  function applyResizeForSession(sessionId, options = {}) {
    getSessionTerminalResizeController()?.applyResizeForSession?.(sessionId, options);
  }

  async function onApplySettings() {
    return getLayoutRuntimeController()?.onApplySettings?.();
  }

  function setSidebarVisible(visible) {
    return getLayoutRuntimeController()?.setSidebarVisible?.(visible);
  }

  function scheduleGlobalResize(options = {}) {
    getSessionTerminalResizeController()?.scheduleGlobalResize?.(options);
  }

  function openSettingsDialog(dialog) {
    getSessionSettingsDialogController()?.open?.(dialog);
  }

  function closeSettingsDialog(dialog) {
    getSessionSettingsDialogController()?.close?.(dialog);
  }

  function confirmSessionDelete(session) {
    return getSessionSettingsDialogController()?.confirmSessionDelete?.(session) !== false;
  }

  function toggleSettingsDialog(dialog) {
    getSessionSettingsDialogController()?.toggle?.(dialog);
  }

  function scheduleDeferredResizePasses(options = {}) {
    getSessionTerminalResizeController()?.scheduleDeferredResizePasses?.(options);
  }

  function getSessionCountForDeck(deckId, sessions) {
    return getDeckRuntimeController()?.getSessionCountForDeck?.(deckId, sessions) || 0;
  }

  function renderDeckTabs(sessions) {
    getDeckRuntimeController()?.renderDeckTabs?.(sessions);
  }

  function setActiveDeck(deckId) {
    return getDeckRuntimeController()?.setActiveDeck?.(deckId) === true;
  }

  async function createDeckFlow() {
    await getDeckActionsController()?.createDeckFlow?.();
  }

  async function renameDeckFlow() {
    await getDeckActionsController()?.renameDeckFlow?.();
  }

  async function deleteDeckFlow() {
    await getDeckActionsController()?.deleteDeckFlow?.();
  }

  return {
    clampInt,
    saveTerminalSettings,
    getSessionFilterText,
    setSessionFilterText,
    getDeckById,
    resolveDeckName,
    getActiveDeck,
    getDeckTerminalGeometry,
    getSessionTerminalGeometry,
    setDecks,
    upsertDeckInState,
    removeDeckFromState,
    normalizeSendTerminatorMode,
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
    applySettingsToAllTerminals,
    applyResizeForSession,
    onApplySettings,
    setSidebarVisible,
    scheduleGlobalResize,
    openSettingsDialog,
    closeSettingsDialog,
    confirmSessionDelete,
    toggleSettingsDialog,
    scheduleDeferredResizePasses,
    getSessionCountForDeck,
    renderDeckTabs,
    setActiveDeck,
    createDeckFlow,
    renameDeckFlow,
    deleteDeckFlow
  };
}
