import { createApiClient } from "./api-client.js";
import { createActivityCompletionNotifier } from "./activity-completion-notifier.js";
import { createAppLifecycleController } from "./app-lifecycle-controller.js";
import { createAuthBootstrapRuntimeController } from "./auth-bootstrap-runtime-controller.js";
import { createCommandComposerAutocompleteController } from "./command-composer-autocomplete-controller.js";
import { createCommandEngine } from "./command-engine.js";
import { createCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { createCommandExecutor } from "./command-executor.js";
import { interpretComposerInput } from "./command-interpreter.js";
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
    const refreshed = await bootstrapDevAuthToken();
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
let bootstrapFallbackTimer = null;
let runtimeBootstrapSource = "pending";
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
let deckRuntimeController = null;
let sessionViewModel = null;
let runtimeEventController = null;
let commandEngine = null;
let commandExecutor = null;
let commandComposerRuntimeController = null;
let commandComposerAutocompleteController = null;
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
    return getDeckById(deckId)?.name || String(deckId || "").trim();
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
  getActiveDeck,
  api,
  applyRuntimeEvent,
  applySettingsToAllTerminals,
  scheduleGlobalResize,
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
  clampInt,
  getTerminalSettings: () => terminalSettings,
  setTerminalSettings: (nextSettings) => {
    terminalSettings = nextSettings;
  },
  persistTerminalSettings: saveTerminalSettings,
  syncSettingsUi,
  applySettingsToAllTerminals,
  scheduleGlobalResize,
  scheduleDeferredResizePasses,
  getDeckSidebarController: () => deckSidebarController,
  resolveSessionDeckId,
  getSessionById
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
  setError("Terminal library failed to load.");
  throw new Error("window.Terminal is not available.");
}

function setError(message) {
  debugLog("ui.error", { message });
  uiState.error = message;
  render();
}

function setCommandFeedback(message) {
  uiState.commandFeedback = message;
  render();
}

function getErrorMessage(err, fallback) {
  if (err && typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

function setCommandPreview(message) {
  uiState.commandPreview = message;
  render();
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

function clampInt(value, fallback, min, max) {
  return layoutRuntimeController?.clampInt(value, fallback, min, max) ?? fallback;
}

function readStoredSettings() {
  try {
    if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
      return null;
    }
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveTerminalSettings() {
  layoutRuntimeController?.saveTerminalSettings();
}

function loadTerminalSettings() {
  return (
    layoutRuntimeController?.loadTerminalSettings() || {
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      sidebarVisible: true
    }
  );
}

function getSessionFilterText() {
  return store.getState().sessionFilterText || "";
}

function setSessionFilterText(value) {
  store.setSessionFilterText(value);
  saveStoredSessionFilterText(store.getState().sessionFilterText);
}

function getDeckById(deckId) {
  return deckRuntimeController?.getDeckById(deckId) || null;
}

function getActiveDeck() {
  return deckRuntimeController?.getActiveDeck() || null;
}

function getDeckTerminalGeometry(deckId) {
  return deckRuntimeController?.getDeckTerminalGeometry(deckId) || {
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS
  };
}

function getSessionTerminalGeometry(sessionOrId) {
  return deckRuntimeController?.getSessionTerminalGeometry(sessionOrId) || {
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS
  };
}

function setDecks(nextDecks, options = {}) {
  deckRuntimeController?.setDecks(nextDecks, options);
}

function upsertDeckInState(nextDeck, options = {}) {
  deckRuntimeController?.upsertDeckInState(nextDeck, options);
}

function removeDeckFromState(deckId, options = {}) {
  deckRuntimeController?.removeDeckFromState(deckId, options);
}

function normalizeSendTerminatorMode(value) {
  return layoutRuntimeController?.normalizeSendTerminatorMode(value) || "auto";
}

function loadSessionInputSettings() {
  return layoutRuntimeController?.loadSessionInputSettings() || {};
}

function loadStoredSessionFilterText() {
  return layoutRuntimeController?.loadStoredSessionFilterText() || "";
}

function saveStoredSessionFilterText(value) {
  layoutRuntimeController?.saveStoredSessionFilterText(value);
}

store.hydrateRuntimePreferences({
  activeDeckId: deckRuntimeController.loadStoredActiveDeckId(),
  sessionFilterText: loadStoredSessionFilterText()
});

function saveSessionInputSettings() {
  layoutRuntimeController?.saveSessionInputSettings();
}

function getSessionSendTerminator(sessionId) {
  return layoutRuntimeController?.getSessionSendTerminator(sessionId) || "auto";
}

function setSessionSendTerminator(sessionId, mode) {
  layoutRuntimeController?.setSessionSendTerminator(sessionId, mode);
}

function isValidHexColor(value) {
  return sessionSettingsStateController?.isValidHexColor(value) === true;
}

function normalizeThemeProfile(themeProfile) {
  return sessionSettingsStateController?.normalizeThemeProfile(themeProfile) || themeProfile || {};
}

function normalizeThemeFilterCategory(value) {
  return sessionSettingsStateController?.normalizeThemeFilterCategory(value) || "all";
}

function getThemePresetById(presetId) {
  return sessionSettingsStateController?.getThemePresetById(presetId) || null;
}

function detectThemePreset(themeProfile) {
  return sessionSettingsStateController?.detectThemePreset(themeProfile) || "custom";
}

function getSessionById(sessionId) {
  return store.getState().sessions.find((session) => session.id === sessionId) || null;
}

function resolveSessionDeckId(session) {
  return sessionViewModel.resolveSessionDeckId(session);
}

function getSessionRuntimeState(session) {
  return sessionViewModel.getSessionRuntimeState(session);
}

function isSessionUnrestored(session) {
  return sessionViewModel.isSessionUnrestored(session);
}

function isSessionExited(session) {
  return sessionViewModel.isSessionExited(session);
}

function isSessionActionBlocked(session) {
  return sessionViewModel.isSessionActionBlocked(session);
}

function getSessionStateBadgeText(session) {
  return sessionViewModel.getSessionStateBadgeText(session);
}

function getExitedSessionStatusSuffix(session) {
  return sessionViewModel.getExitedSessionStatusSuffix(session);
}

function getSessionStateHintText(session) {
  return sessionViewModel.getSessionStateHintText(session);
}

function getSessionActivityIndicatorState(session) {
  return sessionViewModel.getSessionActivityIndicatorState(session);
}

function getUnrestoredSessionMessage(session) {
  return sessionViewModel.getUnrestoredSessionMessage(session);
}

function getExitedSessionMessage(session) {
  return sessionViewModel.getExitedSessionMessage(session);
}

function getBlockedSessionActionMessage(sessions, actionLabel) {
  return sessionViewModel.getBlockedSessionActionMessage(sessions, actionLabel);
}

function getSessionThemeConfig(sessionId) {
  return sessionSettingsStateController?.getSessionThemeConfig(sessionId) || {
    preset: "custom",
    profile: normalizeThemeProfile(null),
    category: "all",
    search: ""
  };
}

function buildThemeFromConfig(config) {
  return sessionSettingsStateController?.buildThemeFromConfig(config) || normalizeThemeProfile(config?.profile);
}

function applyThemeForSession(sessionId) {
  sessionSettingsStateController?.applyThemeForSession(sessionId);
}

function readThemeProfileFromControls(entry) {
  return sessionSettingsStateController?.readThemeProfileFromControls(entry) || normalizeThemeProfile(null);
}

function syncSessionThemeControls(entry, sessionId) {
  sessionSettingsStateController?.syncSessionThemeControls(entry, sessionId);
}

function formatSessionEnv(env) {
  return sessionViewModel.formatSessionEnv(env);
}

function normalizeSessionTags(tags) {
  return sessionViewModel.normalizeSessionTags(tags);
}

function formatSessionTags(tags) {
  return sessionViewModel.formatSessionTags(tags);
}

function parseSessionTags(rawText) {
  return sessionViewModel.parseSessionTags(rawText);
}

function parseSessionEnv(rawText) {
  return sessionViewModel.parseSessionEnv(rawText);
}

function setStartupSettingsFeedback(entry, message, isError = false) {
  sessionSettingsStateController?.setStartupSettingsFeedback(entry, message, isError);
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
    applyResizeForSession(sessionId, { force: true });
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

function syncSessionStartupControls(entry, session) {
  sessionSettingsStateController?.syncSessionStartupControls(entry, session);
}

function normalizeSessionStartupFromSession(session) {
  return sessionViewModel.normalizeSessionStartupFromSession(session);
}

function readSessionStartupFromControls(entry) {
  return (
    sessionSettingsStateController?.readSessionStartupFromControls(entry) || {
      startCwd: "",
      startCommand: "",
      envResult: { ok: true, env: {} },
      sendTerminator: "auto",
      tagResult: { ok: true, tags: [] }
    }
  );
}

function setSettingsStatus(entry, text, kind = "") {
  sessionCardMetaController?.setSettingsStatus(entry, text, kind);
}

function setSettingsDirty(entry, dirty) {
  sessionCardMetaController?.setSettingsDirty(entry, dirty);
}

function isSessionSettingsDirty(entry, session) {
  return sessionSettingsStateController?.isSessionSettingsDirty(entry, session) === true;
}

function renderSessionTagList(entry, session) {
  sessionCardMetaController?.renderSessionTagList(entry, session);
}

function renderSessionPluginBadges(entry, session) {
  sessionCardMetaController?.renderSessionPluginBadges(entry, session);
}

function syncStatusTicker(sessions) {
  sessionCardMetaController?.syncStatusTicker(sessions);
}

function renderSessionStatus(entry, session) {
  sessionCardMetaController?.renderSessionStatus(entry, session);
}

function renderSessionArtifacts(entry, session) {
  sessionCardMetaController?.renderSessionArtifacts(entry, session);
}

function measureTerminalCellWidthPx() {
  return layoutRuntimeController?.measureTerminalCellWidthPx() || 10;
}

function computeFixedMountHeightPx(rows) {
  return layoutRuntimeController?.computeFixedMountHeightPx(rows) || Math.max(120, Math.round(rows * TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT));
}

function computeFixedCardWidthPx(cols) {
  return layoutRuntimeController?.computeFixedCardWidthPx(cols) || Math.max(260, Math.round(cols * measureTerminalCellWidthPx()));
}

function syncTerminalGeometryCss() {
  layoutRuntimeController?.syncTerminalGeometryCss();
}

function syncSettingsUi() {
  layoutRuntimeController?.syncSettingsUi();
}

function readSettingsFromUi() {
  return layoutRuntimeController?.readSettingsFromUi() || {
    cols: terminalSettings?.cols || DEFAULT_TERMINAL_COLS,
    rows: terminalSettings?.rows || DEFAULT_TERMINAL_ROWS,
    sidebarVisible: terminalSettings?.sidebarVisible !== false
  };
}

async function applyTerminalSizeSettings(nextCols, nextRows) {
  uiState.error = "";
  return layoutRuntimeController?.applyTerminalSizeSettings(nextCols, nextRows);
}

function applySettingsToAllTerminals(options = {}) {
  sessionTerminalResizeController?.applySettingsToAllTerminals(options);
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

function applyResizeForSession(sessionId, options = {}) {
  sessionTerminalResizeController?.applyResizeForSession(sessionId, options);
}

async function onApplySettings() {
  return layoutRuntimeController?.onApplySettings();
}

function setSidebarVisible(visible) {
  return layoutRuntimeController?.setSidebarVisible(visible);
}

function scheduleGlobalResize(options = {}) {
  sessionTerminalResizeController?.scheduleGlobalResize(options);
}

function openSettingsDialog(dialog) {
  sessionSettingsDialogController?.open(dialog);
}

function closeSettingsDialog(dialog) {
  sessionSettingsDialogController?.close(dialog);
}

function confirmSessionDelete(session) {
  return sessionSettingsDialogController?.confirmSessionDelete(session) !== false;
}

function toggleSettingsDialog(dialog) {
  sessionSettingsDialogController?.toggle(dialog);
}

function scheduleDeferredResizePasses(options = {}) {
  sessionTerminalResizeController?.scheduleDeferredResizePasses(options);
}

function maybeReportStartupPerf() {
  if (startupPerf.startupReported) {
    return;
  }
  if (
    startupPerf.bootstrapReadyAtMs === null ||
    startupPerf.firstNonEmptyRenderAtMs === null ||
    startupPerf.firstTerminalMountedAtMs === null
  ) {
    return;
  }
  startupPerf.startupReported = true;
  debugLog("perf.startup.ready", {
    bootstrapRequestCount: startupPerf.bootstrapRequestCount,
    toBootstrapReadyMs: Math.round(startupPerf.bootstrapReadyAtMs - startupPerf.appStartAtMs),
    toFirstNonEmptyRenderMs: Math.round(startupPerf.firstNonEmptyRenderAtMs - startupPerf.appStartAtMs),
    toFirstTerminalMountedMs: Math.round(startupPerf.firstTerminalMountedAtMs - startupPerf.appStartAtMs)
  });
}

function clearBootstrapFallbackTimer() {
  if (!bootstrapFallbackTimer) {
    return;
  }
  clearTimeout(bootstrapFallbackTimer);
  bootstrapFallbackTimer = null;
}

function markRuntimeBootstrapReady(source) {
  runtimeBootstrapSource = source;
  clearBootstrapFallbackTimer();
  uiState.loading = false;
  if (startupPerf.bootstrapReadyAtMs === null) {
    startupPerf.bootstrapReadyAtMs = nowMs();
  }
  maybeReportStartupPerf();
  render();
}

function scheduleBootstrapFallback() {
  if (
    runtimeBootstrapSource !== "pending" ||
    authBootstrapRuntimeController?.hasBootstrapInFlight?.() ||
    bootstrapFallbackTimer
  ) {
    return;
  }
  bootstrapFallbackTimer = setTimeout(() => {
    bootstrapFallbackTimer = null;
    if (runtimeBootstrapSource !== "pending") {
      return;
    }
    bootstrapRuntimeFallback().catch(() => {});
  }, WS_BOOTSTRAP_FALLBACK_MS);
}

function getSessionCountForDeck(deckId, sessions) {
  return deckRuntimeController?.getSessionCountForDeck(deckId, sessions) || 0;
}

function renderDeckTabs(sessions) {
  deckRuntimeController?.renderDeckTabs(sessions);
}

function setActiveDeck(deckId) {
  return deckRuntimeController?.setActiveDeck(deckId) === true;
}

async function createDeckFlow() {
  if (!deckActionsController) {
    return;
  }
  await deckActionsController.createDeckFlow();
}

async function renameDeckFlow() {
  if (!deckActionsController) {
    return;
  }
  await deckActionsController.renameDeckFlow();
}

async function deleteDeckFlow() {
  if (!deckActionsController) {
    return;
  }
  await deckActionsController.deleteDeckFlow();
}

function render() {
  const state = store.getState();
  sessionGridController?.renderWorkspace({
    state,
    uiState,
    startupPerf,
    nowMs,
    maybeReportStartupPerf,
    resolveFilterSelectors
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
  getExitedSessionMessage,
  getRuntimeEventController: () => runtimeEventController,
  getSessionViewModel: () => sessionViewModel,
  windowRef: window
});

runtimeEventController = createRuntimeEventController({
  defaultDeckId: DEFAULT_DECK_ID,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  setDecks,
  replaceCustomCommandState,
  setSessions: (sessions) => store.setSessions(sessions),
  replaySnapshotOutputs,
  scheduleCommandPreview,
  scheduleCommandSuggestions,
  clearError: () => {
    uiState.error = "";
  },
  markRuntimeBootstrapReady,
  upsertSession,
  markSessionExited,
  markSessionClosed,
  upsertDeckInState,
  removeDeckFromState,
  upsertCustomCommandState,
  removeCustomCommandState,
  activityCompletionNotifier,
  getSessionById,
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  isSessionUnrestored,
  getUnrestoredSessionMessage,
  isSessionExited,
  getExitedSessionMessage,
  setError,
  sendInput: (sessionId, data) => api.sendInput(sessionId, data)
});

sessionCardMetaController = createSessionCardMetaController({
  normalizeSessionTags,
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
  getSessionStateBadgeText,
  getSessionStateHintText,
  isSessionUnrestored,
  isSessionExited,
  renderSessionTagList,
  renderSessionPluginBadges,
  renderSessionStatus,
  renderSessionArtifacts,
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
  getSessionSendTerminator,
  normalizeSendTerminatorMode,
  formatSessionEnv,
  formatSessionTags,
  parseSessionEnv,
  parseSessionTags,
  normalizeSessionStartupFromSession,
  terminals,
  documentRef: document
});

sessionCardInteractionsController = createSessionCardInteractionsController({
  windowRef: window,
  themeModeSet: TERMINAL_THEME_MODE_SET,
  themeProfileKeys: THEME_PROFILE_KEYS,
  getThemePresetById,
  normalizeThemeProfile,
  normalizeThemeFilterCategory,
  readThemeProfileFromControls,
  readSessionStartupFromControls,
  isValidHexColor,
  detectThemePreset,
  isSessionSettingsDirty,
  isSessionExited,
  getBlockedSessionActionMessage
});

sessionCardRenderController = createSessionCardRenderController({
  isSessionUnrestored,
  isSessionExited,
  getSessionStateBadgeText,
  getSessionStateHintText,
  isTerminalAtBottom,
  setSessionCardVisibility,
  syncTerminalViewportAfterShow,
  ensureQuickId,
  renderSessionTagList,
  renderSessionPluginBadges,
  renderSessionStatus,
  renderSessionArtifacts,
  syncSessionStartupControls,
  syncSessionThemeControls,
  setSettingsDirty
});

sessionTerminalResizeController = createSessionTerminalResizeController({
  windowRef: window,
  terminals,
  resizeTimers,
  terminalSizes,
  getSessionById,
  resolveSessionDeckId,
  getSessionTerminalGeometry,
  isSessionActionBlocked,
  computeFixedMountHeightPx,
  computeFixedCardWidthPx,
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
  getActiveDeck,
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
  getSessionActivityIndicatorState,
  onActivateDeck: (deckId) => setActiveDeck(deckId),
  onActivateSession: (session) => activateSessionTarget(session)
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
  getActiveDeck,
  resolveSessionDeckId,
  getSessionFilterText,
  pruneQuickIds,
  renderDeckTabs,
  workspaceRenderController,
  syncStatusTicker,
  syncActiveTerminalSearch,
  sessionDisposalController,
  closeSettingsDialog,
  streamPluginEngine,
  streamAdapter,
  terminalSearchState,
  clearTerminalSearchSelection,
  sessionCardRenderController,
  sessionCardFactoryController,
  sessionCardInteractionsController,
  sessionTerminalRuntimeController,
  resolveInitialTheme: (sessionId) => buildThemeFromConfig(getSessionThemeConfig(sessionId)),
  handleSessionTerminalInput,
  syncSessionStartupControls,
  syncSessionThemeControls,
  setSettingsDirty,
  applyResizeForSession,
  scheduleGlobalResize,
  scheduleDeferredResizePasses,
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  getSessionById,
  toggleSettingsDialog,
  confirmSessionDelete,
  removeSession,
  setCommandFeedback,
  formatSessionToken,
  formatSessionDisplayName,
  setError,
  clearError: () => {
    uiState.error = "";
  },
  applyRuntimeEvent,
  applyThemeForSession,
  getSessionThemeConfig,
  setSessionSendTerminator,
  setStartupSettingsFeedback,
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

commandExecutor = createCommandExecutor({
  store,
  api,
  defaultDeckId: DEFAULT_DECK_ID,
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  resolveTargetSelectors,
  resolveFilterSelectors,
  resolveDeckToken,
  parseSizeCommandArgs,
  applyTerminalSizeSettings,
  setSessionFilterText,
  getActiveDeck,
  getSessionCountForDeck,
  applyRuntimeEvent,
  setActiveDeck,
  resolveSessionDeckId,
  formatSessionToken,
  formatSessionDisplayName,
  getSessionRuntimeState,
  isSessionExited,
  isSessionActionBlocked,
  getBlockedSessionActionMessage,
  listCustomCommandState,
  getCustomCommandState,
  removeCustomCommandState,
  parseCustomDefinition,
  upsertCustomCommandState,
  resolveSettingsTargets,
  parseSettingsPayload,
  normalizeSendTerminatorMode,
  setSessionSendTerminator,
  getSessionSendTerminator,
  sendInputWithConfiguredTerminator,
  normalizeCustomCommandPayloadForShell,
  normalizeSessionTags,
  normalizeThemeProfile,
  getTerminalSettings: () => terminalSettings
});

function resolveSessionToken(token, sessions) {
  return commandEngine.resolveSessionToken(token, sessions);
}

function resolveDeckToken(token, decks) {
  return commandEngine.resolveDeckToken(token, decks);
}

function resolveQuickSwitchTarget(selectorText, sessions) {
  return commandEngine.resolveQuickSwitchTarget(selectorText, sessions);
}

function activateSessionTarget(session) {
  if (!session || !session.id) {
    return { ok: false, message: "Unknown session target." };
  }
  const beforeState = store.getState();
  const previousActiveSessionId = beforeState.activeSessionId;
  const previousActiveDeckId = beforeState.activeDeckId;
  const targetDeckId = resolveSessionDeckId(session);
  if (targetDeckId) {
    setActiveDeck(targetDeckId);
  }
  const state = store.getState();
  if (state.activeSessionId === session.id && previousActiveSessionId === session.id && previousActiveDeckId === targetDeckId) {
    return {
      ok: true,
      message: `Session already active: [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`,
      noop: true
    };
  }
  store.setActiveSession(session.id);
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
  if (store.getState().activeDeckId === deck.id) {
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

function formatQuickSwitchPreview(selectorText, sessions) {
  return commandEngine.formatQuickSwitchPreview(selectorText, sessions);
}

function resolveTargetSelectors(selectorText, sessions, options = {}) {
  return commandEngine.resolveTargetSelectors(selectorText, sessions, options);
}

function resolveFilterSelectors(selectorText, sessions, options = {}) {
  return commandEngine.resolveFilterSelectors(selectorText, sessions, options);
}

function resolveSettingsTargets(selectorText, sessions, activeSessionId) {
  return commandEngine.resolveSettingsTargets(selectorText, sessions, activeSessionId);
}

function parseSettingsPayload(raw) {
  return commandEngine.parseSettingsPayload(raw);
}

function parseSizeCommandArgs(args, currentCols, currentRows) {
  return commandEngine.parseSizeCommandArgs(args, currentCols, currentRows);
}

function parseDirectTargetRoutingInput(rawInput) {
  return commandEngine.parseDirectTargetRoutingInput(rawInput);
}

function parseCustomDefinition(rawInput) {
  return commandEngine.parseCustomDefinition(rawInput);
}

async function executeControlCommand(interpreted) {
  return commandExecutor.execute(interpreted);
}

async function bootstrapRuntimeFallback() {
  if (!authBootstrapRuntimeController || runtimeBootstrapSource !== "pending") {
    return;
  }
  if (!authBootstrapRuntimeController.hasBootstrapInFlight()) {
    startupPerf.bootstrapRequestCount += 1;
    debugLog("sessions.bootstrap.request", {
      bootstrapRequestCount: startupPerf.bootstrapRequestCount
    });
  }
  return authBootstrapRuntimeController.bootstrapRuntimeFallback();
}

async function bootstrapDevAuthToken(options = {}) {
  if (!authBootstrapRuntimeController) {
    return false;
  }
  return authBootstrapRuntimeController.bootstrapDevAuthToken(options);
}

authBootstrapRuntimeController = createAuthBootstrapRuntimeController({
  windowRef: window,
  api,
  defaultDeckId: DEFAULT_DECK_ID,
  getTerminalSettings: () => terminalSettings,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  getRuntimeBootstrapSource: () => runtimeBootstrapSource,
  setDecks,
  setSessions: (sessions) => store.setSessions(sessions || []),
  setUiError: (message) => {
    uiState.error = message;
  },
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
  getRuntimeBootstrapSource: () => runtimeBootstrapSource,
  onRuntimeConnected: () => {
    uiState.loading = false;
    uiState.error = "";
    render();
  },
  hasTerminal: (sessionId) => terminals.has(sessionId),
  pushSessionData: (sessionId, data) => streamAdapter.push(sessionId, data),
  applyRuntimeEvent,
  getWsAuthToken: () => authBootstrapRuntimeController?.getWsAuthToken?.() || "",
  createWsTicket: () => api.createWsTicket(),
  bootstrapDevAuthToken
});

store.subscribe(render);
syncSettingsUi();
syncTerminalGeometryCss();
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
  resolveQuickSwitchTarget,
  activateSessionTarget,
  activateDeckTarget,
  setCommandFeedback,
  setCommandPreview,
  clearCommandSuggestions,
  render,
  debugLog,
  executeControlCommand,
  recordSlashHistory: (rawCommand) => commandComposerAutocompleteController?.recordSlashHistory(rawCommand),
  getErrorMessage,
  resetSlashHistoryNavigationState: () => commandComposerAutocompleteController?.resetSlashHistoryNavigationState(),
  parseDirectTargetRoutingInput,
  resolveTargetSelectors,
  getActiveDeck,
  formatSessionToken,
  formatSessionDisplayName,
  getBlockedSessionActionMessage,
  isSessionActionBlocked,
  getSessionSendTerminator,
  apiSendInput: api.sendInput.bind(api),
  sendInputWithConfiguredTerminator,
  normalizeSendTerminatorMode,
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  setError,
  clearError: () => {
    uiState.error = "";
  },
  getCustomCommandState,
  formatQuickSwitchPreview
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
  getActiveDeck,
  resolveSessionDeckId,
  applyRuntimeEvent,
  setError,
  clearUiError: () => {
    uiState.error = "";
  },
  getErrorMessage,
  debugLog,
  createDeckFlow,
  renameDeckFlow,
  deleteDeckFlow,
  submitCommand,
  bootstrapDevAuthToken,
  startWsRuntime: () => wsRuntimeController?.start() || null,
  setWsClient: (client) => {
    wsClient = client;
  },
  scheduleBootstrapFallback,
  scheduleGlobalResize,
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
