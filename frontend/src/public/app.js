import { createApiClient } from "./api-client.js";
import { createActivityCompletionNotifier } from "./activity-completion-notifier.js";
import { createAppLayoutDeckFacadeController } from "./app-layout-deck-facade-controller.js";
import { createAppLifecycleController } from "./app-lifecycle-controller.js";
import { createAppRuntimeStateController } from "./app-runtime-state-controller.js";
import { createAuthBootstrapRuntimeController } from "./auth-bootstrap-runtime-controller.js";
import { createCommandComposerAutocompleteController } from "./command-composer-autocomplete-controller.js";
import { createCommandEngine } from "./command-engine.js";
import { createCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { createCommandExecutor } from "./command-executor.js";
import { interpretComposerInput } from "./command-interpreter.js";
import { createCommandTargetRuntimeController } from "./command-target-runtime-controller.js";
import { createDeckRuntimeController } from "./deck-runtime-controller.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";
import { createWsRuntimeController } from "./ws-runtime-controller.js";
import { resolveRuntimeConfig } from "./runtime-config.js";
import { createRuntimeEventController } from "./runtime-event-controller.js";
import { createSessionRuntimeController } from "./session-runtime-controller.js";
import { createSessionViewModel } from "./session-view-model.js";
import { createStreamActionDispatcher } from "./stream-action-dispatcher.js";
import { createBuiltInStreamPlugins } from "./stream-builtins.js";
import { createArtifactStreamPlugins } from "./stream-artifact-plugins.js";
import { createStreamPluginEngine } from "./stream-plugin-engine.js";
import {
  getTerminalCellHeightPx,
  isTerminalAtBottom,
  refreshTerminalViewport,
  syncTerminalScrollArea
} from "./terminal-compat.js";
import {
  createSessionStreamAdapter,
  normalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator
} from "./terminal-stream.js";
import { ITERM2_THEME_LIBRARY } from "./theme-library.js";
import { createDeckActionsController } from "./ui/deck-actions-controller.js";
import { createDeckSidebarController } from "./ui/deck-sidebar-controller.js";
import { createLayoutRuntimeController } from "./layout-runtime-controller.js";
import { createLayoutSettingsController } from "./ui/layout-settings-controller.js";
import { createSessionDisposalController } from "./ui/session-disposal-controller.js";
import { createSessionCardMetaController } from "./ui/session-card-meta-controller.js";
import { createSessionCardFactoryController } from "./ui/session-card-factory-controller.js";
import { createSessionGridController } from "./ui/session-grid-controller.js";
import { createSessionCardInteractionsController } from "./ui/session-card-interactions-controller.js";
import { createSessionCardRenderController } from "./ui/session-card-render-controller.js";
import { createSessionSettingsDialogController } from "./ui/session-settings-dialog-controller.js";
import { createSessionSettingsStateController } from "./ui/session-settings-state-controller.js";
import { createSessionUiFacadeController } from "./ui/session-ui-facade-controller.js";
import { createSessionTerminalResizeController } from "./ui/session-terminal-resize-controller.js";
import { createSessionTerminalRuntimeController } from "./ui/session-terminal-runtime-controller.js";
import { createTerminalSearchController } from "./ui/terminal-search-controller.js";
import { createWorkspaceRenderController } from "./ui/workspace-render-controller.js";

const config = resolveRuntimeConfig(window);
const debugLogs = config.debugLogs === true;
const debugLog = (event, details = {}) => {
  if (!debugLogs) {
    return;
  }
  const timestamp = new Date().toISOString();
  console.debug(`[ptydeck][${timestamp}] ${event}`, details);
};
const api = createApiClient(config.apiBaseUrl, {
  debug: debugLogs,
  log: debugLog,
  async onUnauthorized() {
    const refreshed = await appRuntimeStateController?.bootstrapDevAuthToken();
    if (!refreshed) {
      debugLog("auth.recovery.failed", {});
    }
    return refreshed;
  }
});
const store = createStore();
const streamActionDispatcher = createStreamActionDispatcher({
  store,
  onError(details) {
    debugLog("stream-plugin.action-error", {
      sessionId: details?.sessionId || null,
      hook: details?.meta?.hook || null,
      actionType: details?.action?.type || null,
      message: details?.error instanceof Error ? details.error.message : String(details?.error || "")
    });
  }
});

const appShellEl = typeof document.querySelector === "function" ? document.querySelector(".app-shell") : null;
const stateEl = document.getElementById("connection-state");
const gridEl = document.getElementById("terminal-grid");
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebarToggleIcon = document.getElementById("sidebar-toggle-icon");
const sidebarLauncherBtn = document.getElementById("sidebar-launcher");
const createBtn = document.getElementById("create-session");
const deckTabsEl = document.getElementById("deck-tabs");
const deckCreateBtn = document.getElementById("deck-create");
const deckRenameBtn = document.getElementById("deck-rename");
const deckDeleteBtn = document.getElementById("deck-delete");
const settingsColsEl = document.getElementById("settings-cols");
const settingsRowsEl = document.getElementById("settings-rows");
const settingsApplyBtn = document.getElementById("settings-apply");
const commandInput = document.getElementById("command-input");
const sendBtn = document.getElementById("send-command");
const template = document.getElementById("terminal-card-template");
const emptyStateEl = document.getElementById("empty-state");
const statusMessageEl = document.getElementById("status-message");
const commandFeedbackEl = document.getElementById("command-feedback");
const commandInlineHintEl = document.getElementById("command-inline-hint");
const commandPreviewEl = document.getElementById("command-preview");
const commandSuggestionsEl = document.getElementById("command-suggestions");
const terminalSearchInputEl = document.getElementById("terminal-search-input");
const terminalSearchPrevBtn = document.getElementById("terminal-search-prev");
const terminalSearchNextBtn = document.getElementById("terminal-search-next");
const terminalSearchClearBtn = document.getElementById("terminal-search-clear");
const terminalSearchStatusEl = document.getElementById("terminal-search-status");

const terminals = new Map();
const terminalObservers = new Map();
const resizeTimers = new Map();
const terminalSizes = new Map();
const sessionQuickIds = new Map();
const SETTINGS_STORAGE_KEY = "ptydeck.settings.v1";
const ACTIVE_DECK_STORAGE_KEY = "ptydeck.active-deck.v1";
const SESSION_INPUT_SETTINGS_STORAGE_KEY = "ptydeck.session-input-settings.v1";
const SESSION_FILTER_STORAGE_KEY = "ptydeck.session-filter.v1";
const TERMINAL_FONT_SIZE = 16;
const TERMINAL_LINE_HEIGHT = 1.2;
const TERMINAL_FONT_FAMILY = '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace';
const TERMINAL_CARD_HORIZONTAL_CHROME_PX = 6;
const TERMINAL_MOUNT_VERTICAL_CHROME_PX = 18;
const QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SEND_TERMINATOR_MODE_SET = new Set(["auto", "crlf", "lf", "cr", "cr2", "cr_delay"]);
const DELAYED_SUBMIT_MS = 90;
const WS_BOOTSTRAP_FALLBACK_MS = 250;
const SESSION_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_ENV_MAX_ENTRIES = 64;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_TAG_MAX_ENTRIES = 32;
const SESSION_TAG_MAX_LENGTH = 32;
const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 20;
const DEFAULT_DECK_ID = "default";
const SESSION_ACTIVITY_QUIET_MS = 1400;
const DEV_AUTH_REFRESH_SAFETY_MS = 60_000;
const DEV_AUTH_RETRY_DELAY_MS = 30_000;
const DEV_AUTH_REFRESH_MIN_DELAY_MS = 15_000;
const ACTIVITY_COMPLETION_NOTIFICATION_WINDOW_MS = (() => {
  const injectedValue = window?.__PTYDECK_CONFIG__?.activityCompletionNotificationWindowMs;
  const parsed = Number(injectedValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5000;
})();
const streamPluginEngine = createStreamPluginEngine({
  getSession(sessionId) {
    return getSessionById(sessionId);
  },
  onActions(sessionId, actions, meta) {
    const appliedActions = streamActionDispatcher.dispatch(sessionId, actions, meta);
    debugLog("stream-plugin.actions", {
      sessionId,
      hook: meta?.hook || null,
      actionTypes: appliedActions.map((action) => action.type)
    });
  },
  onPluginError(details) {
    debugLog("stream-plugin.error", {
      pluginId: details?.pluginId || null,
      hook: details?.hook || null,
      sessionId: details?.sessionId || null,
      message: details?.error instanceof Error ? details.error.message : String(details?.error || "")
    });
  }
});
const streamAdapter = createSessionStreamAdapter({
  idleMs: SESSION_ACTIVITY_QUIET_MS,
  onData(sessionId, chunk) {
    streamPluginEngine.handleData(sessionId, chunk);
    appendTerminalChunk(sessionId, chunk);
  },
  onLine(sessionId, line) {
    streamPluginEngine.handleLine(sessionId, line);
  },
  onIdle(sessionId) {
    streamPluginEngine.handleIdle(sessionId);
    store.clearSessionActivity(sessionId);
  }
});
streamPluginEngine.replacePlugins([...createBuiltInStreamPlugins(), ...createArtifactStreamPlugins()]);
const DEFAULT_TERMINAL_THEME = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};
const THEME_PROFILE_KEYS = [
  "background",
  "foreground",
  "cursor",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
];
const THEME_FILTER_CATEGORY_SET = new Set(["all", "dark", "light"]);
const DEFAULT_THEME_PRESET = {
  id: "ptydeck-default",
  name: "Ptydeck Default",
  category: "dark",
  profile: DEFAULT_TERMINAL_THEME
};
const TERMINAL_THEME_PRESETS = [
  DEFAULT_THEME_PRESET,
  ...ITERM2_THEME_LIBRARY.map((entry) => ({
    id: String(entry?.id || "").trim(),
    name: String(entry?.name || "").trim(),
    category: entry?.category === "light" ? "light" : "dark",
    profile: entry?.profile
  })).filter((entry) => entry.id && entry.name)
];
const TERMINAL_THEME_PRESET_MAP = new Map(TERMINAL_THEME_PRESETS.map((entry) => [entry.id, entry]));
const TERMINAL_THEME_MODE_SET = new Set(["custom", ...TERMINAL_THEME_PRESETS.map((entry) => entry.id)]);
const SYSTEM_SLASH_COMMANDS = [
  "new",
  "deck",
  "move",
  "size",
  "filter",
  "close",
  "switch",
  "next",
  "prev",
  "list",
  "rename",
  "restart",
  "settings",
  "custom",
  "help"
];
let layoutRuntimeController = null;
let terminalSettings = null;
let sessionInputSettings = {};
const sessionThemeDrafts = new Map();
let wsClient = null;
let wsRuntimeController = null;
let authBootstrapRuntimeController = null;
let appLifecycleController = null;
let appLayoutDeckFacadeController = null;
let appRuntimeStateController = null;
let deckRuntimeController = null;
let sessionViewModel = null;
let runtimeEventController = null;
let commandEngine = null;
let commandExecutor = null;
let commandComposerRuntimeController = null;
let commandComposerAutocompleteController = null;
let commandTargetRuntimeController = null;
let deckSidebarController = null;
let deckActionsController = null;
let sessionRuntimeController = null;
let sessionDisposalController = null;
let sessionCardMetaController = null;
let sessionCardFactoryController = null;
let sessionGridController = null;
let sessionCardInteractionsController = null;
let sessionCardRenderController = null;
let sessionSettingsStateController = null;
let sessionUiFacadeController = null;
let sessionTerminalResizeController = null;
let sessionTerminalRuntimeController = null;
let terminalSearchController = null;
let layoutSettingsController = null;
let sessionSettingsDialogController = null;
let workspaceRenderController = null;
const activityCompletionNotifier = createActivityCompletionNotifier({
  windowRef: window,
  aggregationWindowMs: ACTIVITY_COMPLETION_NOTIFICATION_WINDOW_MS,
  formatSessionToken,
  formatSessionDisplayName,
  resolveDeckName(deckId) {
    return appLayoutDeckFacadeController?.resolveDeckName(deckId) || String(deckId || "").trim();
  },
  onError(error) {
    debugLog("activity-notification.error", {
      message: error instanceof Error ? error.message : String(error || "")
    });
  }
});
const uiState = {
  loading: true,
  error: "",
  commandFeedback: "",
  commandInlineHint: "",
  commandInlineHintPrefixPx: 0,
  commandPreview: "",
  commandSuggestions: "",
  commandSuggestionSelectedIndex: -1
};
const terminalSearchState = {
  query: "",
  sessionId: "",
  selectedSessionId: "",
  matches: [],
  activeIndex: -1,
  revision: -1,
  wrapped: false,
  direction: "next",
  missingActiveSession: false
};
const nowMs =
  typeof window !== "undefined" &&
  window.performance &&
  typeof window.performance.now === "function"
    ? () => window.performance.now()
    : () => Date.now();
const startupPerf = {
  appStartAtMs: nowMs(),
  bootstrapRequestCount: 0,
  bootstrapReadyAtMs: null,
  firstNonEmptyRenderAtMs: null,
  firstTerminalMountedAtMs: null,
  startupReported: false
};
if (typeof window !== "undefined") {
  window.__PTYDECK_PERF__ = startupPerf;
}

appRuntimeStateController = createAppRuntimeStateController({
  windowRef: window,
  uiState,
  startupPerf,
  nowMs,
  wsBootstrapFallbackMs: WS_BOOTSTRAP_FALLBACK_MS,
  debugLog,
  requestRender: () => render(),
  hasBootstrapInFlight: () => authBootstrapRuntimeController?.hasBootstrapInFlight?.() === true,
  runBootstrapFallback: () => authBootstrapRuntimeController?.bootstrapRuntimeFallback?.(),
  runBootstrapDevAuthToken: (options) => authBootstrapRuntimeController?.bootstrapDevAuthToken?.(options) || false
});

layoutRuntimeController = createLayoutRuntimeController({
  windowRef: window,
  settingsStorageKey: SETTINGS_STORAGE_KEY,
  sessionInputSettingsStorageKey: SESSION_INPUT_SETTINGS_STORAGE_KEY,
  sessionFilterStorageKey: SESSION_FILTER_STORAGE_KEY,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  sendTerminatorModeSet: SEND_TERMINATOR_MODE_SET,
  cardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  getLayoutSettingsController: () => layoutSettingsController,
  getTerminalSettings: () => terminalSettings,
  setTerminalSettings: (nextSettings) => {
    terminalSettings = nextSettings;
  },
  getSessionInputSettings: () => sessionInputSettings,
  setSessionInputSettings: (nextSettings) => {
    sessionInputSettings = nextSettings;
  },
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  api,
  applyRuntimeEvent,
  applySettingsToAllTerminals: (options) => appLayoutDeckFacadeController?.applySettingsToAllTerminals(options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  render,
  setCommandFeedback,
  setError,
  getErrorMessage,
  settingsApplyBtn,
  settingsColsEl,
  settingsRowsEl,
  sidebarToggleBtn,
  sidebarLauncherBtn
});
terminalSettings = layoutRuntimeController.loadTerminalSettings();
sessionInputSettings = layoutRuntimeController.loadSessionInputSettings();

deckRuntimeController = createDeckRuntimeController({
  store,
  windowRef: window,
  activeDeckStorageKey: ACTIVE_DECK_STORAGE_KEY,
  defaultDeckId: DEFAULT_DECK_ID,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  clampInt: (value, fallback, min, max) => appLayoutDeckFacadeController?.clampInt(value, fallback, min, max) ?? fallback,
  getTerminalSettings: () => terminalSettings,
  setTerminalSettings: (nextSettings) => {
    terminalSettings = nextSettings;
  },
  persistTerminalSettings: () => appLayoutDeckFacadeController?.saveTerminalSettings(),
  syncSettingsUi: () => appLayoutDeckFacadeController?.syncSettingsUi(),
  applySettingsToAllTerminals: (options) => appLayoutDeckFacadeController?.applySettingsToAllTerminals(options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options),
  getDeckSidebarController: () => deckSidebarController,
  resolveSessionDeckId,
  getSessionById
});

appLayoutDeckFacadeController = createAppLayoutDeckFacadeController({
  store,
  getLayoutRuntimeController: () => layoutRuntimeController,
  getDeckRuntimeController: () => deckRuntimeController,
  getSessionTerminalResizeController: () => sessionTerminalResizeController,
  getSessionSettingsDialogController: () => sessionSettingsDialogController,
  getDeckActionsController: () => deckActionsController,
  getTerminalSettings: () => terminalSettings,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  clearUiError: () => appRuntimeStateController?.clearError()
});

function normalizeCustomCommandName(name) {
  return String(name || "").trim().toLowerCase();
}

function listCustomCommandState() {
  return store.listCustomCommands();
}

function getCustomCommandState(name) {
  return store.getCustomCommand(name);
}

function upsertCustomCommandState(command) {
  return store.upsertCustomCommand(command);
}

function removeCustomCommandState(name) {
  return store.removeCustomCommand(name);
}

function replaceCustomCommandState(commands) {
  store.replaceCustomCommands(commands);
}

if (typeof window.Terminal !== "function") {
  appRuntimeStateController.setError("Terminal library failed to load.");
  throw new Error("window.Terminal is not available.");
}

function setError(message) {
  appRuntimeStateController?.setError(message);
}

function setCommandFeedback(message) {
  appRuntimeStateController?.setCommandFeedback(message);
}

function getErrorMessage(err, fallback) {
  return appRuntimeStateController?.getErrorMessage(err, fallback) || fallback;
}

function setCommandPreview(message) {
  appRuntimeStateController?.setCommandPreview(message);
}

function clearTerminalSearchSelection(sessionId = terminalSearchState.selectedSessionId) {
  terminalSearchController?.clearSelection(sessionId);
}

function syncActiveTerminalSearch({ preserveSelection = true } = {}) {
  terminalSearchController?.syncActiveTerminalSearch({ preserveSelection });
}

function navigateActiveTerminalSearch(direction) {
  terminalSearchController?.navigateActiveTerminalSearch(direction);
}

function clearCommandSuggestions() {
  commandComposerAutocompleteController?.clearSuggestions();
}

function scheduleCommandSuggestions() {
  commandComposerAutocompleteController?.scheduleSuggestions();
}

store.hydrateRuntimePreferences({
  activeDeckId: deckRuntimeController.loadStoredActiveDeckId(),
  sessionFilterText: appLayoutDeckFacadeController.loadStoredSessionFilterText()
});

function getSessionById(sessionId) {
  return store.getState().sessions.find((session) => session.id === sessionId) || null;
}

function resolveSessionDeckId(session) {
  return sessionViewModel.resolveSessionDeckId(session);
}

function setSessionCardVisibility(node, visible) {
  if (!node) {
    return;
  }
  node.hidden = !visible;
  node.style.display = visible ? "" : "none";
}

function markSessionActivity(sessionId) {
  const timestamp = Date.now();
  store.markSessionActivity(sessionId, { timestamp });
}

function syncTerminalViewportAfterShow(sessionId, entry) {
  if (!entry || !entry.terminal) {
    return;
  }
  const shouldFollow = entry.followOnShow !== false;
  const runPass = () => {
    appLayoutDeckFacadeController?.applyResizeForSession(sessionId, { force: true });
    syncTerminalScrollArea(entry.terminal);
    refreshTerminalViewport(entry.terminal);
    if (shouldFollow && typeof entry.terminal.scrollToBottom === "function") {
      entry.terminal.scrollToBottom();
    }
    syncTerminalScrollArea(entry.terminal);
  };
  runPass();
  setTimeout(runPass, 80);
  setTimeout(runPass, 220);
  entry.pendingViewportSync = false;
}

function findNextQuickId() {
  return sessionRuntimeController?.findNextQuickId() || "?";
}

function ensureQuickId(sessionId) {
  return sessionRuntimeController?.ensureQuickId(sessionId) || "?";
}

function pruneQuickIds(activeSessionIds) {
  sessionRuntimeController?.pruneQuickIds(activeSessionIds);
}

function maybeReportStartupPerf() {
  appRuntimeStateController?.maybeReportStartupPerf();
}

function markRuntimeBootstrapReady(source) {
  appRuntimeStateController?.markRuntimeBootstrapReady(source);
}

function scheduleBootstrapFallback() {
  appRuntimeStateController?.scheduleBootstrapFallback();
}

function render() {
  const state = store.getState();
  sessionGridController?.renderWorkspace({
    state,
    uiState,
    startupPerf,
    nowMs,
    maybeReportStartupPerf,
    resolveFilterSelectors: commandTargetRuntimeController?.resolveFilterSelectors
  });
}

function appendTerminalChunk(sessionId, data, options = {}) {
  return sessionRuntimeController?.appendTerminalChunk(sessionId, data, options) === true;
}

function replaySnapshotOutputs(outputs, attempt = 0) {
  sessionRuntimeController?.replaySnapshotOutputs(outputs, attempt);
}

function upsertSession(nextSession) {
  sessionRuntimeController?.upsertSession(nextSession);
}

function markSessionExited(sessionId, exitDetails = {}) {
  sessionRuntimeController?.markSessionExited(sessionId, exitDetails);
}

function removeSession(sessionId) {
  sessionRuntimeController?.removeSession(sessionId);
}

function markSessionClosed(sessionId) {
  sessionRuntimeController?.markSessionClosed(sessionId);
}

function handleSessionTerminalInput(sessionId, data) {
  sessionRuntimeController?.handleSessionTerminalInput(sessionId, data);
}

function applyRuntimeEvent(event, options = {}) {
  return sessionRuntimeController?.applyRuntimeEvent(event, options) === true;
}

function formatSessionDisplayName(session) {
  return sessionRuntimeController?.formatSessionDisplayName(session) || String(session?.name || session?.id || "");
}

function formatSessionToken(sessionId) {
  return sessionRuntimeController?.formatSessionToken(sessionId) || "?";
}

sessionViewModel = createSessionViewModel({
  defaultDeckId: DEFAULT_DECK_ID,
  sessionTagPattern: SESSION_TAG_PATTERN,
  sessionTagMaxEntries: SESSION_TAG_MAX_ENTRIES,
  sessionTagMaxLength: SESSION_TAG_MAX_LENGTH,
  sessionEnvKeyPattern: SESSION_ENV_KEY_PATTERN,
  sessionEnvMaxEntries: SESSION_ENV_MAX_ENTRIES,
  formatSessionToken
});

sessionUiFacadeController = createSessionUiFacadeController({
  getSessionViewModel: () => sessionViewModel,
  getSessionSettingsStateController: () => sessionSettingsStateController,
  getSessionCardMetaController: () => sessionCardMetaController,
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME
});

sessionRuntimeController = createSessionRuntimeController({
  store,
  terminals,
  sessionQuickIds,
  quickIdPool: QUICK_ID_POOL,
  terminalSearchState,
  refreshTerminalViewport,
  syncTerminalScrollArea,
  markSessionActivity,
  syncActiveTerminalSearch,
  getActiveSessionId: () => store.getState().activeSessionId,
  getSessionById,
  streamAdapter,
  setCommandFeedback,
  getExitedSessionMessage: sessionUiFacadeController.getExitedSessionMessage,
  getRuntimeEventController: () => runtimeEventController,
  getSessionViewModel: () => sessionViewModel,
  windowRef: window
});

runtimeEventController = createRuntimeEventController({
  defaultDeckId: DEFAULT_DECK_ID,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  setDecks: (nextDecks, options) => appLayoutDeckFacadeController?.setDecks(nextDecks, options),
  replaceCustomCommandState,
  setSessions: (sessions) => store.setSessions(sessions),
  replaySnapshotOutputs,
  scheduleCommandPreview,
  scheduleCommandSuggestions,
  clearError: () => appRuntimeStateController?.clearError(),
  markRuntimeBootstrapReady,
  upsertSession,
  markSessionExited,
  markSessionClosed,
  upsertDeckInState: (nextDeck, options) => appLayoutDeckFacadeController?.upsertDeckInState(nextDeck, options),
  removeDeckFromState: (deckId, options) => appLayoutDeckFacadeController?.removeDeckFromState(deckId, options),
  upsertCustomCommandState,
  removeCustomCommandState,
  activityCompletionNotifier,
  getSessionById,
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  getUnrestoredSessionMessage: sessionUiFacadeController.getUnrestoredSessionMessage,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  getExitedSessionMessage: sessionUiFacadeController.getExitedSessionMessage,
  setError,
  sendInput: (sessionId, data) => api.sendInput(sessionId, data)
});

sessionCardMetaController = createSessionCardMetaController({
  normalizeSessionTags: sessionUiFacadeController.normalizeSessionTags,
  onTick: () => render(),
  windowRef: window
});

sessionDisposalController = createSessionDisposalController({
  onClearSessionStatusAnchor(sessionId) {
    sessionCardMetaController?.clearSessionStatusAnchor(sessionId);
  }
});

sessionCardFactoryController = createSessionCardFactoryController({
  ensureQuickId,
  getSessionStateBadgeText: sessionUiFacadeController.getSessionStateBadgeText,
  getSessionStateHintText: sessionUiFacadeController.getSessionStateHintText,
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  renderSessionTagList: sessionUiFacadeController.renderSessionTagList,
  renderSessionPluginBadges: sessionUiFacadeController.renderSessionPluginBadges,
  renderSessionStatus: sessionUiFacadeController.renderSessionStatus,
  renderSessionArtifacts: sessionUiFacadeController.renderSessionArtifacts,
  setSessionCardVisibility
});

sessionSettingsStateController = createSessionSettingsStateController({
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME,
  themeFilterCategorySet: THEME_FILTER_CATEGORY_SET,
  terminalThemePresetMap: TERMINAL_THEME_PRESET_MAP,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  terminalThemeModeSet: TERMINAL_THEME_MODE_SET,
  sessionThemeDrafts,
  getSessionById,
  getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator(sessionId) || "auto",
  normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode(value) || "auto",
  formatSessionEnv: sessionUiFacadeController.formatSessionEnv,
  formatSessionTags: sessionUiFacadeController.formatSessionTags,
  parseSessionEnv: sessionUiFacadeController.parseSessionEnv,
  parseSessionTags: sessionUiFacadeController.parseSessionTags,
  normalizeSessionStartupFromSession: sessionUiFacadeController.normalizeSessionStartupFromSession,
  terminals,
  documentRef: document
});

sessionCardInteractionsController = createSessionCardInteractionsController({
  windowRef: window,
  themeModeSet: TERMINAL_THEME_MODE_SET,
  themeProfileKeys: THEME_PROFILE_KEYS,
  getThemePresetById: sessionUiFacadeController.getThemePresetById,
  normalizeThemeProfile: sessionUiFacadeController.normalizeThemeProfile,
  normalizeThemeFilterCategory: sessionUiFacadeController.normalizeThemeFilterCategory,
  readThemeProfileFromControls: sessionUiFacadeController.readThemeProfileFromControls,
  readSessionStartupFromControls: sessionUiFacadeController.readSessionStartupFromControls,
  isValidHexColor: sessionUiFacadeController.isValidHexColor,
  detectThemePreset: sessionUiFacadeController.detectThemePreset,
  isSessionSettingsDirty: sessionUiFacadeController.isSessionSettingsDirty,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  getBlockedSessionActionMessage: sessionUiFacadeController.getBlockedSessionActionMessage
});

sessionCardRenderController = createSessionCardRenderController({
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  getSessionStateBadgeText: sessionUiFacadeController.getSessionStateBadgeText,
  getSessionStateHintText: sessionUiFacadeController.getSessionStateHintText,
  isTerminalAtBottom,
  setSessionCardVisibility,
  syncTerminalViewportAfterShow,
  ensureQuickId,
  renderSessionTagList: sessionUiFacadeController.renderSessionTagList,
  renderSessionPluginBadges: sessionUiFacadeController.renderSessionPluginBadges,
  renderSessionStatus: sessionUiFacadeController.renderSessionStatus,
  renderSessionArtifacts: sessionUiFacadeController.renderSessionArtifacts,
  syncSessionStartupControls: sessionUiFacadeController.syncSessionStartupControls,
  syncSessionThemeControls: sessionUiFacadeController.syncSessionThemeControls,
  setSettingsDirty: sessionUiFacadeController.setSettingsDirty
});

sessionTerminalResizeController = createSessionTerminalResizeController({
  windowRef: window,
  terminals,
  resizeTimers,
  terminalSizes,
  getSessionById,
  resolveSessionDeckId,
  getSessionTerminalGeometry: (sessionOrId) => appLayoutDeckFacadeController?.getSessionTerminalGeometry(sessionOrId),
  isSessionActionBlocked: sessionUiFacadeController.isSessionActionBlocked,
  computeFixedMountHeightPx: (rows) => appLayoutDeckFacadeController?.computeFixedMountHeightPx(rows),
  computeFixedCardWidthPx: (cols) => appLayoutDeckFacadeController?.computeFixedCardWidthPx(cols),
  getTerminalCellHeightPx,
  terminalCardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  debugLog,
  api
});

sessionTerminalRuntimeController = createSessionTerminalRuntimeController({
  windowRef: window,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  debugLog
});

layoutSettingsController = createLayoutSettingsController({
  documentRef: document,
  gridEl,
  appShellEl,
  sidebarToggleBtn,
  sidebarToggleIcon,
  sidebarLauncherBtn,
  settingsColsEl,
  settingsRowsEl,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  cardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  mountVerticalChromePx: TERMINAL_MOUNT_VERTICAL_CHROME_PX
});

sessionSettingsDialogController = createSessionSettingsDialogController({
  windowRef: window
});

workspaceRenderController = createWorkspaceRenderController({
  stateEl,
  emptyStateEl,
  statusMessageEl,
  commandFeedbackEl,
  commandInlineHintEl,
  commandPreviewEl,
  commandSuggestionsEl
});

terminalSearchController = createTerminalSearchController({
  terminalSearchState,
  terminals,
  inputEl: terminalSearchInputEl,
  prevBtn: terminalSearchPrevBtn,
  nextBtn: terminalSearchNextBtn,
  clearBtn: terminalSearchClearBtn,
  statusEl: terminalSearchStatusEl,
  getActiveSessionId: () => store.getState().activeSessionId
});

deckActionsController = createDeckActionsController({
  windowRef: window,
  api,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  getDecks: () => store.getState().decks,
  getTerminalSettings: () => terminalSettings,
  applyRuntimeEvent,
  setCommandFeedback,
  setError,
  defaultDeckId: DEFAULT_DECK_ID
});

deckSidebarController = createDeckSidebarController({
  containerEl: deckTabsEl,
  documentRef: document,
  resolveSessionDeckId,
  ensureQuickId,
  formatSessionDisplayName,
  getSessionActivityIndicatorState: sessionUiFacadeController.getSessionActivityIndicatorState,
  onActivateDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck(deckId),
  onActivateSession: (session) => commandTargetRuntimeController?.activateSessionTarget(session)
});

sessionGridController = createSessionGridController({
  defaultDeckId: DEFAULT_DECK_ID,
  deckRenameBtn,
  deckDeleteBtn,
  terminals,
  terminalObservers,
  resizeTimers,
  terminalSizes,
  sessionThemeDrafts,
  template,
  gridEl,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  resolveSessionDeckId,
  getSessionFilterText: () => appLayoutDeckFacadeController?.getSessionFilterText() || "",
  pruneQuickIds,
  renderDeckTabs: (sessions) => appLayoutDeckFacadeController?.renderDeckTabs(sessions),
  workspaceRenderController,
  syncStatusTicker: sessionUiFacadeController.syncStatusTicker,
  syncActiveTerminalSearch,
  sessionDisposalController,
  closeSettingsDialog: (dialog) => appLayoutDeckFacadeController?.closeSettingsDialog(dialog),
  streamPluginEngine,
  streamAdapter,
  terminalSearchState,
  clearTerminalSearchSelection,
  sessionCardRenderController,
  sessionCardFactoryController,
  sessionCardInteractionsController,
  sessionTerminalRuntimeController,
  resolveInitialTheme: (sessionId) =>
    sessionUiFacadeController.buildThemeFromConfig(sessionUiFacadeController.getSessionThemeConfig(sessionId)),
  handleSessionTerminalInput,
  syncSessionStartupControls: sessionUiFacadeController.syncSessionStartupControls,
  syncSessionThemeControls: sessionUiFacadeController.syncSessionThemeControls,
  setSettingsDirty: sessionUiFacadeController.setSettingsDirty,
  applyResizeForSession: (sessionId, options) => appLayoutDeckFacadeController?.applyResizeForSession(sessionId, options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options),
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  getSessionById,
  toggleSettingsDialog: (dialog) => appLayoutDeckFacadeController?.toggleSettingsDialog(dialog),
  confirmSessionDelete: (session) => appLayoutDeckFacadeController?.confirmSessionDelete(session),
  removeSession,
  setCommandFeedback,
  formatSessionToken,
  formatSessionDisplayName,
  setError,
  clearError: () => appRuntimeStateController?.clearError(),
  applyRuntimeEvent,
  applyThemeForSession: sessionUiFacadeController.applyThemeForSession,
  getSessionThemeConfig: sessionUiFacadeController.getSessionThemeConfig,
  setSessionSendTerminator: (sessionId, mode) => appLayoutDeckFacadeController?.setSessionSendTerminator(sessionId, mode),
  setStartupSettingsFeedback: sessionUiFacadeController.setStartupSettingsFeedback,
  requestRender: () => render(),
  api,
  themeProfileKeys: THEME_PROFILE_KEYS,
  debugLog
});

commandEngine = createCommandEngine({
  systemSlashCommands: SYSTEM_SLASH_COMMANDS,
  listCustomCommands: listCustomCommandState,
  getSessions: () => store.getState().sessions,
  getDecks: () => store.getState().decks,
  getThemes: () => TERMINAL_THEME_PRESETS,
  getActiveDeckId: () => store.getState().activeDeckId,
  getActiveSessionId: () => store.getState().activeSessionId,
  getSessionToken: formatSessionToken,
  getSessionDisplayName: formatSessionDisplayName,
  getSessionDeckId: resolveSessionDeckId
});

commandTargetRuntimeController = createCommandTargetRuntimeController({
  commandEngine,
  store,
  setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck(deckId),
  resolveSessionDeckId,
  formatSessionToken,
  formatSessionDisplayName
});

commandExecutor = createCommandExecutor({
  store,
  api,
  defaultDeckId: DEFAULT_DECK_ID,
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  resolveTargetSelectors: commandTargetRuntimeController.resolveTargetSelectors,
  resolveFilterSelectors: commandTargetRuntimeController.resolveFilterSelectors,
  resolveDeckToken: commandTargetRuntimeController.resolveDeckToken,
  parseSizeCommandArgs: commandTargetRuntimeController.parseSizeCommandArgs,
  applyTerminalSizeSettings: (nextCols, nextRows) => appLayoutDeckFacadeController?.applyTerminalSizeSettings(nextCols, nextRows),
  setSessionFilterText: (value) => appLayoutDeckFacadeController?.setSessionFilterText(value),
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  getSessionCountForDeck: (deckId, sessions) => appLayoutDeckFacadeController?.getSessionCountForDeck(deckId, sessions) || 0,
  applyRuntimeEvent,
  setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck(deckId),
  resolveSessionDeckId,
  formatSessionToken,
  formatSessionDisplayName,
  getSessionRuntimeState: sessionUiFacadeController.getSessionRuntimeState,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  isSessionActionBlocked: sessionUiFacadeController.isSessionActionBlocked,
  getBlockedSessionActionMessage: sessionUiFacadeController.getBlockedSessionActionMessage,
  listCustomCommandState,
  getCustomCommandState,
  removeCustomCommandState,
  parseCustomDefinition: commandTargetRuntimeController.parseCustomDefinition,
  upsertCustomCommandState,
  resolveSettingsTargets: commandTargetRuntimeController.resolveSettingsTargets,
  parseSettingsPayload: commandTargetRuntimeController.parseSettingsPayload,
  normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode(value) || "auto",
  setSessionSendTerminator: (sessionId, mode) => appLayoutDeckFacadeController?.setSessionSendTerminator(sessionId, mode),
  getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator(sessionId) || "auto",
  sendInputWithConfiguredTerminator,
  normalizeCustomCommandPayloadForShell,
  normalizeSessionTags: sessionUiFacadeController.normalizeSessionTags,
  normalizeThemeProfile: sessionUiFacadeController.normalizeThemeProfile,
  getTerminalSettings: () => terminalSettings
});

async function executeControlCommand(interpreted) {
  return commandExecutor.execute(interpreted);
}

authBootstrapRuntimeController = createAuthBootstrapRuntimeController({
  windowRef: window,
  api,
  defaultDeckId: DEFAULT_DECK_ID,
  getTerminalSettings: () => terminalSettings,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  getRuntimeBootstrapSource: () => appRuntimeStateController?.getRuntimeBootstrapSource() || "pending",
  setDecks: (nextDecks, options) => appLayoutDeckFacadeController?.setDecks(nextDecks, options),
  setSessions: (sessions) => store.setSessions(sessions || []),
  setUiError: (message) => appRuntimeStateController?.setUiError(message),
  markRuntimeBootstrapReady,
  debugLog,
  devAuthRefreshMinDelayMs: DEV_AUTH_REFRESH_MIN_DELAY_MS,
  devAuthRefreshSafetyMs: DEV_AUTH_REFRESH_SAFETY_MS,
  devAuthRetryDelayMs: DEV_AUTH_RETRY_DELAY_MS
});

wsRuntimeController = createWsRuntimeController({
  createWsClient,
  wsUrl: config.wsUrl,
  debug: debugLogs,
  log: debugLog,
  setConnectionState: (status) => store.setConnectionState(status),
  getRuntimeBootstrapSource: () => appRuntimeStateController?.getRuntimeBootstrapSource() || "pending",
  onRuntimeConnected: () => appRuntimeStateController?.markRuntimeConnected(),
  hasTerminal: (sessionId) => terminals.has(sessionId),
  pushSessionData: (sessionId, data) => streamAdapter.push(sessionId, data),
  applyRuntimeEvent,
  getWsAuthToken: () => authBootstrapRuntimeController?.getWsAuthToken?.() || "",
  createWsTicket: () => api.createWsTicket(),
  bootstrapDevAuthToken: (options) => appRuntimeStateController?.bootstrapDevAuthToken(options)
});

store.subscribe(render);
appLayoutDeckFacadeController?.syncSettingsUi();
appLayoutDeckFacadeController?.syncTerminalGeometryCss();
render();

layoutRuntimeController?.bindUiEvents();
terminalSearchController?.bindUiEvents();
terminalSearchController?.updateUi();
async function submitCommand() {
  await commandComposerRuntimeController?.submitCommand();
}

async function refreshCommandPreview() {
  await commandComposerRuntimeController?.refreshCommandPreview();
}

function scheduleCommandPreview() {
  commandComposerRuntimeController?.scheduleCommandPreview();
}

commandComposerAutocompleteController = createCommandComposerAutocompleteController({
  windowRef: window,
  documentRef: document,
  commandInput,
  uiState,
  render,
  scheduleCommandPreview,
  parseAutocompleteContext: (rawInput, customCommands) =>
    (commandEngine ? commandEngine.parseAutocompleteContext(rawInput, customCommands) : null),
  listCustomCommands: listCustomCommandState,
  setCommandFeedback,
  submitCommand
});

commandComposerRuntimeController = createCommandComposerRuntimeController({
  windowRef: window,
  getCommandValue: () => commandInput.value || "",
  setCommandValue: (value) => {
    commandInput.value = value;
  },
  resetCommandAutocompleteState: () => commandComposerAutocompleteController?.resetAutocompleteState(),
  interpretComposerInput,
  getState: () => store.getState(),
  resolveQuickSwitchTarget: commandTargetRuntimeController.resolveQuickSwitchTarget,
  activateSessionTarget: commandTargetRuntimeController.activateSessionTarget,
  activateDeckTarget: commandTargetRuntimeController.activateDeckTarget,
  setCommandFeedback,
  setCommandPreview,
  clearCommandSuggestions,
  render,
  debugLog,
  executeControlCommand,
  recordSlashHistory: (rawCommand) => commandComposerAutocompleteController?.recordSlashHistory(rawCommand),
  getErrorMessage,
  resetSlashHistoryNavigationState: () => commandComposerAutocompleteController?.resetSlashHistoryNavigationState(),
  parseDirectTargetRoutingInput: commandTargetRuntimeController.parseDirectTargetRoutingInput,
  resolveTargetSelectors: commandTargetRuntimeController.resolveTargetSelectors,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  formatSessionToken,
  formatSessionDisplayName,
  getBlockedSessionActionMessage: sessionUiFacadeController.getBlockedSessionActionMessage,
  isSessionActionBlocked: sessionUiFacadeController.isSessionActionBlocked,
  getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator(sessionId) || "auto",
  apiSendInput: api.sendInput.bind(api),
  sendInputWithConfiguredTerminator,
  normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode(value) || "auto",
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  setError,
  clearError: () => appRuntimeStateController?.clearError(),
  getCustomCommandState,
  formatQuickSwitchPreview: commandTargetRuntimeController.formatQuickSwitchPreview
});

commandComposerAutocompleteController?.bindUiEvents();

appLifecycleController = createAppLifecycleController({
  windowRef: window,
  createBtn,
  deckCreateBtn,
  deckRenameBtn,
  deckDeleteBtn,
  sendBtn,
  api,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  resolveSessionDeckId,
  applyRuntimeEvent,
  setError,
  clearUiError: () => appRuntimeStateController?.clearError(),
  getErrorMessage,
  debugLog,
  createDeckFlow: () => appLayoutDeckFacadeController?.createDeckFlow(),
  renameDeckFlow: () => appLayoutDeckFacadeController?.renameDeckFlow(),
  deleteDeckFlow: () => appLayoutDeckFacadeController?.deleteDeckFlow(),
  submitCommand,
  bootstrapDevAuthToken: (options) => appRuntimeStateController?.bootstrapDevAuthToken(options),
  startWsRuntime: () => wsRuntimeController?.start() || null,
  setWsClient: (client) => {
    wsClient = client;
  },
  scheduleBootstrapFallback: () => appRuntimeStateController?.scheduleBootstrapFallback(),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  disposeAppRuntimeState: () => appRuntimeStateController?.dispose(),
  disposeActivityCompletionNotifier: () => activityCompletionNotifier.dispose(),
  closeWsClient: () => {
    if (wsClient) {
      wsClient.close();
    }
  },
  disposeAuthBootstrapRuntime: () => authBootstrapRuntimeController?.dispose(),
  disposeSessionTerminalResize: () => sessionTerminalResizeController?.dispose(),
  disposeTerminalSearch: () => terminalSearchController?.dispose(),
  disposeCommandComposerRuntime: () => commandComposerRuntimeController?.dispose(),
  disposeCommandComposerAutocomplete: () => commandComposerAutocompleteController?.dispose(),
  disconnectTerminalObservers: () => {
    for (const observer of terminalObservers.values()) {
      observer.disconnect();
    }
  },
  disposeTerminals: () => {
    for (const entry of terminals.values()) {
      entry.terminal.dispose();
    }
  }
});
appLifecycleController.bindUiEvents();
appLifecycleController.bindWindowEvents();

appLifecycleController.initializeRuntime().catch(() => {
  setError("Failed to initialize application runtime.");
});
