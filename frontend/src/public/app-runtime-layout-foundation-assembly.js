import { createAppLayoutDeckFacadeController as defaultCreateAppLayoutDeckFacadeController } from "./app-layout-deck-facade-controller.js";
import { createAppSessionRuntimeFacadeController as defaultCreateAppSessionRuntimeFacadeController } from "./app-session-runtime-facade-controller.js";
import { createDeckRuntimeController as defaultCreateDeckRuntimeController } from "./deck-runtime-controller.js";
import { createLayoutRuntimeController as defaultCreateLayoutRuntimeController } from "./layout-runtime-controller.js";

function createNoopStore() {
  return {
    getState() {
      return {
        activeDeckId: "",
        sessions: []
      };
    }
  };
}

function resolveStateRef(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {
    terminalSettings: null,
    sessionInputSettings: {}
  };
}

export function createAppRuntimeLayoutFoundationAssembly(options = {}) {
  const createAppSessionRuntimeFacadeController =
    typeof options.createAppSessionRuntimeFacadeController === "function"
      ? options.createAppSessionRuntimeFacadeController
      : defaultCreateAppSessionRuntimeFacadeController;
  const createLayoutRuntimeController =
    typeof options.createLayoutRuntimeController === "function"
      ? options.createLayoutRuntimeController
      : defaultCreateLayoutRuntimeController;
  const createDeckRuntimeController =
    typeof options.createDeckRuntimeController === "function"
      ? options.createDeckRuntimeController
      : defaultCreateDeckRuntimeController;
  const createAppLayoutDeckFacadeController =
    typeof options.createAppLayoutDeckFacadeController === "function"
      ? options.createAppLayoutDeckFacadeController
      : defaultCreateAppLayoutDeckFacadeController;

  const windowRef = options.windowRef || globalThis.window;
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createNoopStore();
  const defaultDeckId = String(options.defaultDeckId || "default");
  const defaultTerminalCols = Number.isFinite(options.defaultTerminalCols) ? options.defaultTerminalCols : 80;
  const defaultTerminalRows = Number.isFinite(options.defaultTerminalRows) ? options.defaultTerminalRows : 20;
  const stateRef = resolveStateRef(options.stateRef);

  let layoutRuntimeController = null;
  let deckRuntimeController = null;
  let appLayoutDeckFacadeController = null;

  const appSessionRuntimeFacadeController = createAppSessionRuntimeFacadeController({
    store,
    defaultDeckId,
    getSessionViewModel: () => options.getSessionViewModel?.() || null,
    getSessionRuntimeController: () => options.getSessionRuntimeController?.() || null,
    getAppLayoutDeckFacadeController: () => appLayoutDeckFacadeController,
    refreshTerminalViewport: options.refreshTerminalViewport,
    syncTerminalScrollArea: options.syncTerminalScrollArea,
    windowRef
  });

  layoutRuntimeController = createLayoutRuntimeController({
    windowRef,
    settingsStorageKey: options.settingsStorageKey || "",
    sessionInputSettingsStorageKey: options.sessionInputSettingsStorageKey || "",
    sessionFilterStorageKey: options.sessionFilterStorageKey || "",
    defaultTerminalCols,
    defaultTerminalRows,
    sendTerminatorModeSet: options.sendTerminatorModeSet,
    cardHorizontalChromePx: options.cardHorizontalChromePx,
    getLayoutSettingsController: () => options.getLayoutSettingsController?.() || null,
    getTerminalSettings: () => stateRef.terminalSettings,
    setTerminalSettings: (nextSettings) => {
      stateRef.terminalSettings = nextSettings;
    },
    getSessionInputSettings: () => stateRef.sessionInputSettings,
    setSessionInputSettings: (nextSettings) => {
      stateRef.sessionInputSettings = nextSettings;
    },
    getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
    api: options.api,
    applyRuntimeEvent: (event, runtimeOptions) =>
      appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
    applySettingsToAllTerminals: (runtimeOptions) =>
      appLayoutDeckFacadeController?.applySettingsToAllTerminals?.(runtimeOptions),
    scheduleGlobalResize: (runtimeOptions) =>
      appLayoutDeckFacadeController?.scheduleGlobalResize?.(runtimeOptions),
    render: () => options.getAppCommandUiFacadeController?.()?.render?.(),
    setCommandFeedback: (message) => options.getAppCommandUiFacadeController?.()?.setCommandFeedback?.(message),
    setError: (message) => options.getAppCommandUiFacadeController?.()?.setError?.(message),
    getErrorMessage: (error, fallback) =>
      options.getAppCommandUiFacadeController?.()?.getErrorMessage?.(error, fallback) || fallback,
    settingsApplyBtn: options.settingsApplyBtn || null,
    settingsColsEl: options.settingsColsEl || null,
    settingsRowsEl: options.settingsRowsEl || null,
    sidebarToggleBtn: options.sidebarToggleBtn || null,
    sidebarLauncherBtn: options.sidebarLauncherBtn || null,
    terminalSearchToggleBtn: options.terminalSearchToggleBtn || null,
    settingsPanelToggleBtn: options.settingsPanelToggleBtn || null,
    layoutProfileToggleBtn: options.layoutProfileToggleBtn || null
  });
  stateRef.terminalSettings = layoutRuntimeController.loadTerminalSettings();
  stateRef.sessionInputSettings = layoutRuntimeController.loadSessionInputSettings();

  deckRuntimeController = createDeckRuntimeController({
    store,
    windowRef,
    activeDeckStorageKey: options.activeDeckStorageKey || "",
    defaultDeckId,
    defaultTerminalCols,
    defaultTerminalRows,
    clampInt: (value, fallback, min, max) =>
      appLayoutDeckFacadeController?.clampInt?.(value, fallback, min, max) ?? fallback,
    getTerminalSettings: () => stateRef.terminalSettings,
    setTerminalSettings: (nextSettings) => {
      stateRef.terminalSettings = nextSettings;
    },
    persistTerminalSettings: () => appLayoutDeckFacadeController?.saveTerminalSettings?.(),
    syncSettingsUi: () => appLayoutDeckFacadeController?.syncSettingsUi?.(),
    applySettingsToAllTerminals: (runtimeOptions) =>
      appLayoutDeckFacadeController?.applySettingsToAllTerminals?.(runtimeOptions),
    scheduleGlobalResize: (runtimeOptions) =>
      appLayoutDeckFacadeController?.scheduleGlobalResize?.(runtimeOptions),
    scheduleDeferredResizePasses: (runtimeOptions) =>
      appLayoutDeckFacadeController?.scheduleDeferredResizePasses?.(runtimeOptions),
    getDeckSidebarController: () => options.getDeckSidebarController?.() || null,
    resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId)
  });

  appLayoutDeckFacadeController = createAppLayoutDeckFacadeController({
    store,
    getLayoutRuntimeController: () => layoutRuntimeController,
    getDeckRuntimeController: () => deckRuntimeController,
    getSessionTerminalResizeController: () => options.getSessionTerminalResizeController?.() || null,
    getSessionSettingsDialogController: () => options.getSessionSettingsDialogController?.() || null,
    getDeckActionsController: () => options.getDeckActionsController?.() || null,
    getTerminalSettings: () => stateRef.terminalSettings,
    defaultTerminalCols,
    defaultTerminalRows,
    terminalFontSize: options.terminalFontSize,
    terminalLineHeight: options.terminalLineHeight,
    clearUiError: () => options.getAppRuntimeStateController?.()?.clearError?.()
  });

  return {
    appSessionRuntimeFacadeController,
    layoutRuntimeController,
    deckRuntimeController,
    appLayoutDeckFacadeController,
    stateRef
  };
}
