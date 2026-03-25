import { createApiClient } from "./api-client.js";
import { createActivityCompletionNotifier } from "./activity-completion-notifier.js";
import { createAuthBootstrapRuntimeController } from "./auth-bootstrap-runtime-controller.js";
import { createCommandEngine } from "./command-engine.js";
import { createCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { createCommandExecutor } from "./command-executor.js";
import { areCompletionCandidateListsEqual, normalizeCompletionCandidate } from "./command-completion.js";
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
import { createCommandSuggestionsController } from "./ui/components.js";
import { createDeckActionsController } from "./ui/deck-actions-controller.js";
import { createDeckSidebarController } from "./ui/deck-sidebar-controller.js";
import { createLayoutSettingsController } from "./ui/layout-settings-controller.js";
import { createSessionDisposalController } from "./ui/session-disposal-controller.js";
import { createSessionCardMetaController } from "./ui/session-card-meta-controller.js";
import { createSessionCardFactoryController } from "./ui/session-card-factory-controller.js";
import { createSessionGridController } from "./ui/session-grid-controller.js";
import { createSessionCardInteractionsController } from "./ui/session-card-interactions-controller.js";
import { createSessionCardRenderController } from "./ui/session-card-render-controller.js";
import { createSessionSettingsDialogController } from "./ui/session-settings-dialog-controller.js";
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
let commandPreviewRequestId = 0;
let commandSuggestionsTimer = null;
let commandSuggestionsRequestId = 0;
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
let terminalSettings = loadTerminalSettings();
let sessionInputSettings = loadSessionInputSettings();
const sessionThemeDrafts = new Map();
let wsClient = null;
let wsRuntimeController = null;
let authBootstrapRuntimeController = null;
let deckRuntimeController = null;
let commandAutocompleteRequestId = 0;
const slashCommandHistory = [];
let slashHistoryCursor = -1;
let slashHistoryDraft = "";
let recalledSlashCommand = "";
let sessionViewModel = null;
let runtimeEventController = null;
let commandEngine = null;
let commandExecutor = null;
let commandComposerRuntimeController = null;
let commandSuggestionsController = null;
let deckSidebarController = null;
let deckActionsController = null;
let sessionRuntimeController = null;
let sessionDisposalController = null;
let sessionCardMetaController = null;
let sessionCardFactoryController = null;
let sessionGridController = null;
let sessionCardInteractionsController = null;
let sessionCardRenderController = null;
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

function resetCommandAutocompleteState() {
  commandSuggestionsController?.reset();
}

function setCommandSuggestions(replacePrefix, matches, index = 0) {
  commandSuggestionsController?.set(replacePrefix, matches, index);
}

function clearCommandSuggestions() {
  commandSuggestionsController?.clear();
}

function measureComposerPrefixWidthPx(text) {
  return commandSuggestionsController ? commandSuggestionsController.measurePrefixWidthPx(text) : 0;
}

function applyCommandSuggestionSelection(index) {
  return commandSuggestionsController ? commandSuggestionsController.applySelection(index) : false;
}

function moveCommandSuggestion(delta) {
  return commandSuggestionsController ? commandSuggestionsController.move(delta) : false;
}

function acceptCommandSuggestion() {
  return commandSuggestionsController ? commandSuggestionsController.accept() : false;
}

function isSingleLineSlashModeInput(value) {
  return typeof value === "string" && value.startsWith("/") && !value.includes("\n");
}

function resetSlashHistoryNavigationState() {
  slashHistoryCursor = -1;
  slashHistoryDraft = "";
  recalledSlashCommand = "";
}

function recordSlashHistory(rawCommand) {
  const normalized = String(rawCommand || "").trim();
  if (!isSingleLineSlashModeInput(normalized)) {
    return;
  }
  if (slashCommandHistory[slashCommandHistory.length - 1] === normalized) {
    return;
  }
  slashCommandHistory.push(normalized);
  if (slashCommandHistory.length > 200) {
    slashCommandHistory.splice(0, slashCommandHistory.length - 200);
  }
}

function applySlashHistoryValue(value) {
  commandInput.value = value;
  recalledSlashCommand = value;
  resetCommandAutocompleteState();
  scheduleCommandPreview();
}

function navigateSlashHistory(direction) {
  const current = commandInput.value || "";
  if (!isSingleLineSlashModeInput(current)) {
    return false;
  }
  if (slashCommandHistory.length === 0) {
    return false;
  }

  if (direction === "up") {
    if (slashHistoryCursor < 0) {
      slashHistoryDraft = current;
      slashHistoryCursor = slashCommandHistory.length - 1;
    } else if (slashHistoryCursor > 0) {
      slashHistoryCursor -= 1;
    }
    applySlashHistoryValue(slashCommandHistory[slashHistoryCursor]);
    return true;
  }

  if (direction === "down") {
    if (slashHistoryCursor < 0) {
      return false;
    }
    if (slashHistoryCursor < slashCommandHistory.length - 1) {
      slashHistoryCursor += 1;
      applySlashHistoryValue(slashCommandHistory[slashHistoryCursor]);
      return true;
    }
    commandInput.value = slashHistoryDraft;
    resetSlashHistoryNavigationState();
    resetCommandAutocompleteState();
    scheduleCommandPreview();
    return true;
  }

  return false;
}

function parseSlashInputForAutocomplete(rawInput) {
  const value = typeof rawInput === "string" ? rawInput : "";
  if (!value.startsWith("/")) {
    return null;
  }
  if (value.includes("\n")) {
    return null;
  }
  return {
    value,
    afterSlash: value.slice(1)
  };
}

function parseQuickSwitchInputForAutocomplete(rawInput) {
  const value = typeof rawInput === "string" ? rawInput : "";
  if (!value.startsWith(">")) {
    return null;
  }
  if (value.includes("\n")) {
    return null;
  }
  return {
    value,
    afterMarker: value.slice(1)
  };
}

function parseAutocompleteContext(rawInput, customCommands) {
  return commandEngine ? commandEngine.parseAutocompleteContext(rawInput, customCommands) : null;
}

async function autocompleteComposerInput(reverse = false) {
  const rawInput = commandInput.value || "";
  const parsedSlash = parseSlashInputForAutocomplete(rawInput);
  const parsedQuickSwitch = parseQuickSwitchInputForAutocomplete(rawInput);
  if (!parsedSlash && !parsedQuickSwitch) {
    resetCommandAutocompleteState();
    return false;
  }

  const activeState = commandSuggestionsController ? commandSuggestionsController.getState() : null;
  const canCycleExisting =
    activeState &&
    Array.isArray(activeState.matches) &&
    activeState.matches.length > 0 &&
    Number.isInteger(activeState.index) &&
    activeState.index >= 0 &&
    activeState.index < activeState.matches.length &&
    typeof activeState.replacePrefix === "string" &&
    commandInput.value ===
      `${activeState.replacePrefix}${normalizeCompletionCandidate(activeState.matches[activeState.index], {
        replacePrefix: activeState.replacePrefix
      })?.insertText || ""}`;

  let matches = [];
  let replacePrefix = "/";
  let nextIndex = reverse ? -1 : 0;

  if (canCycleExisting) {
    matches = activeState.matches;
    replacePrefix = activeState.replacePrefix;
    const delta = reverse ? -1 : 1;
    nextIndex = (activeState.index + delta + matches.length) % matches.length;
  } else {
    const context = parseAutocompleteContext(rawInput, listCustomCommandState());
    if (!context) {
      resetCommandAutocompleteState();
      return true;
    }
    replacePrefix = context.replacePrefix;
    matches = context.matches;
    if (matches.length === 0) {
      resetCommandAutocompleteState();
      return true;
    }
    nextIndex = reverse ? matches.length - 1 : 0;
  }

  if (matches.length === 0) {
    clearCommandSuggestions();
    render();
    return true;
  }

  setCommandSuggestions(replacePrefix, matches, nextIndex);
  return applyCommandSuggestionSelection(nextIndex);
}

async function refreshCommandSuggestions() {
  const rawInput = commandInput.value || "";
  const parsedSlash = parseSlashInputForAutocomplete(rawInput);
  const parsedQuickSwitch = parseQuickSwitchInputForAutocomplete(rawInput);
  if (!parsedSlash && !parsedQuickSwitch) {
    clearCommandSuggestions();
    render();
    return;
  }
  const context = parseAutocompleteContext(rawInput, listCustomCommandState());
  if (!context || !Array.isArray(context.matches) || context.matches.length === 0) {
    clearCommandSuggestions();
    render();
    return;
  }
  let index = 0;
  if (
    commandSuggestionsController &&
    commandSuggestionsController.getState() &&
    commandSuggestionsController.getState().replacePrefix === context.replacePrefix &&
    Array.isArray(commandSuggestionsController.getState().matches) &&
    areCompletionCandidateListsEqual(commandSuggestionsController.getState().matches, context.matches)
  ) {
    index = Math.min(Math.max(commandSuggestionsController.getState().index, 0), context.matches.length - 1);
  }
  const selected = normalizeCompletionCandidate(context.matches[index], { replacePrefix: context.replacePrefix });
  const inputValue = commandInput.value || "";
  const prefix = context.replacePrefix || "";
  const tokenPrefix = inputValue.startsWith(prefix) ? inputValue.slice(prefix.length) : "";
  if (selected && tokenPrefix.length <= selected.insertText.length && selected.insertText.startsWith(tokenPrefix)) {
    uiState.commandInlineHint = selected.insertText.slice(tokenPrefix.length);
    uiState.commandInlineHintPrefixPx = measureComposerPrefixWidthPx(inputValue);
  } else {
    uiState.commandInlineHint = "";
    uiState.commandInlineHintPrefixPx = 0;
  }
  setCommandSuggestions(context.replacePrefix, context.matches, index);
}

function scheduleCommandSuggestions() {
  if (commandSuggestionsTimer) {
    clearTimeout(commandSuggestionsTimer);
  }
  commandSuggestionsTimer = setTimeout(() => {
    commandSuggestionsTimer = null;
    refreshCommandSuggestions();
  }, 120);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
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
  try {
    if (!window.localStorage || typeof window.localStorage.setItem !== "function") {
      return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(terminalSettings));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

function loadTerminalSettings() {
  const stored = readStoredSettings();
  return {
    cols: clampInt(stored?.cols, DEFAULT_TERMINAL_COLS, 20, 400),
    rows: clampInt(stored?.rows, DEFAULT_TERMINAL_ROWS, 5, 120),
    sidebarVisible: stored?.sidebarVisible !== false
  };
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
  return SEND_TERMINATOR_MODE_SET.has(value) ? value : "auto";
}

function loadSessionInputSettings() {
  try {
    if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
      return {};
    }
    const raw = window.localStorage.getItem(SESSION_INPUT_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
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

function loadStoredSessionFilterText() {
  try {
    if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
      return "";
    }
    const raw = window.localStorage.getItem(SESSION_FILTER_STORAGE_KEY);
    if (typeof raw !== "string") {
      return "";
    }
    return raw.trim();
  } catch {
    return "";
  }
}

function saveStoredSessionFilterText(value) {
  try {
    if (!window.localStorage || typeof window.localStorage.setItem !== "function") {
      return;
    }
    const normalized = String(value || "").trim();
    if (!normalized && typeof window.localStorage.removeItem === "function") {
      window.localStorage.removeItem(SESSION_FILTER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_FILTER_STORAGE_KEY, normalized);
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

store.hydrateRuntimePreferences({
  activeDeckId: deckRuntimeController.loadStoredActiveDeckId(),
  sessionFilterText: loadStoredSessionFilterText()
});

function saveSessionInputSettings() {
  try {
    if (!window.localStorage || typeof window.localStorage.setItem !== "function") {
      return;
    }
    window.localStorage.setItem(SESSION_INPUT_SETTINGS_STORAGE_KEY, JSON.stringify(sessionInputSettings));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

function getSessionSendTerminator(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    return "auto";
  }
  const mode = sessionInputSettings?.[sessionId]?.sendTerminator;
  return normalizeSendTerminatorMode(String(mode || "").toLowerCase());
}

function setSessionSendTerminator(sessionId, mode) {
  if (!sessionId || typeof sessionId !== "string") {
    return;
  }
  const nextMode = normalizeSendTerminatorMode(String(mode || "").toLowerCase());
  sessionInputSettings = {
    ...sessionInputSettings,
    [sessionId]: { sendTerminator: nextMode }
  };
  saveSessionInputSettings();
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function normalizeThemeProfile(themeProfile) {
  const source = themeProfile && typeof themeProfile === "object" ? themeProfile : {};
  const normalized = {};
  for (const key of THEME_PROFILE_KEYS) {
    const value = source[key];
    normalized[key] = isValidHexColor(value) ? String(value).trim() : DEFAULT_TERMINAL_THEME[key];
  }
  return normalized;
}

function normalizeThemeFilterCategory(value) {
  return THEME_FILTER_CATEGORY_SET.has(value) ? value : "all";
}

function getThemePresetById(presetId) {
  if (!presetId || typeof presetId !== "string") {
    return null;
  }
  return TERMINAL_THEME_PRESET_MAP.get(presetId) || null;
}

function getFilteredThemePresets(category, searchText) {
  const normalizedCategory = normalizeThemeFilterCategory(String(category || "").toLowerCase());
  const normalizedSearch = String(searchText || "").trim().toLowerCase();
  return TERMINAL_THEME_PRESETS.filter((entry) => {
    if (normalizedCategory !== "all" && entry.category !== normalizedCategory) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return entry.name.toLowerCase().includes(normalizedSearch) || entry.id.toLowerCase().includes(normalizedSearch);
  });
}

function setSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }
  if (typeof document.createElement !== "function" || typeof selectEl.appendChild !== "function") {
    selectEl.value = selectedValue;
    return;
  }
  while (selectEl.firstChild) {
    selectEl.removeChild(selectEl.firstChild);
  }
  for (const optionDef of options) {
    const optionEl = document.createElement("option");
    optionEl.value = optionDef.value;
    optionEl.textContent = optionDef.label;
    selectEl.appendChild(optionEl);
  }
  selectEl.value = selectedValue;
}

function syncThemePresetOptions(entry, config) {
  if (!entry?.themeSelect) {
    return;
  }
  const category = normalizeThemeFilterCategory(config?.category);
  const search = String(config?.search || "");
  const filtered = getFilteredThemePresets(category, search);
  const selectedPresetId = TERMINAL_THEME_MODE_SET.has(config?.preset) ? config.preset : "custom";
  const options = filtered.map((preset) => ({
    value: preset.id,
    label: `[${preset.category}] ${preset.name}`
  }));
  if (!options.some((option) => option.value === selectedPresetId) && selectedPresetId !== "custom") {
    const selectedPreset = getThemePresetById(selectedPresetId);
    if (selectedPreset) {
      options.unshift({
        value: selectedPreset.id,
        label: `[${selectedPreset.category}] ${selectedPreset.name}`
      });
    }
  }
  options.push({ value: "custom", label: "Custom Palette" });
  setSelectOptions(entry.themeSelect, options, selectedPresetId);
}

function detectThemePreset(themeProfile) {
  const normalized = normalizeThemeProfile(themeProfile);
  for (const preset of TERMINAL_THEME_PRESETS) {
    let matches = true;
    for (const key of THEME_PROFILE_KEYS) {
      if (normalized[key] !== normalizeThemeProfile(preset.profile)[key]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return preset.id;
    }
  }
  return "custom";
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
  const draft = sessionThemeDrafts.get(sessionId);
  if (draft) {
    return {
      preset: TERMINAL_THEME_MODE_SET.has(draft.preset) ? draft.preset : "custom",
      profile: normalizeThemeProfile(draft.profile),
      category: normalizeThemeFilterCategory(draft.category),
      search: String(draft.search || "")
    };
  }
  const session = getSessionById(sessionId);
  const profile = normalizeThemeProfile(session?.themeProfile);
  const preset = detectThemePreset(profile);
  return { preset, profile, category: "all", search: "" };
}

function buildThemeFromConfig(config) {
  return normalizeThemeProfile(config?.profile);
}

function applyThemeForSession(sessionId) {
  const entry = terminals.get(sessionId);
  if (!entry) {
    return;
  }
  const config = getSessionThemeConfig(sessionId);
  const theme = buildThemeFromConfig(config);
  if (typeof entry.terminal.setOption === "function") {
    entry.terminal.setOption("theme", theme);
    return;
  }
  if (entry.terminal.options && typeof entry.terminal.options === "object") {
    entry.terminal.options.theme = theme;
  }
}

function getThemeInput(entry, key) {
  if (!entry) {
    return null;
  }
  if (entry.themeInputs && entry.themeInputs[key]) {
    return entry.themeInputs[key];
  }
  if (key === "background") {
    return entry.themeBg || null;
  }
  if (key === "foreground") {
    return entry.themeFg || null;
  }
  return null;
}

function readThemeProfileFromControls(entry) {
  const profile = {};
  for (const key of THEME_PROFILE_KEYS) {
    const input = getThemeInput(entry, key);
    const value = input ? String(input.value || "").trim() : "";
    profile[key] = isValidHexColor(value) ? value : DEFAULT_TERMINAL_THEME[key];
  }
  return profile;
}

function setThemeProfileOnControls(entry, profile) {
  for (const key of THEME_PROFILE_KEYS) {
    const input = getThemeInput(entry, key);
    if (!input) {
      continue;
    }
    input.value = profile[key];
  }
}

function syncSessionThemeControls(entry, sessionId) {
  if (!entry || !entry.themeSelect) {
    return;
  }
  const config = getSessionThemeConfig(sessionId);
  if (entry.themeCategory) {
    entry.themeCategory.value = normalizeThemeFilterCategory(config.category);
  }
  if (entry.themeSearch) {
    entry.themeSearch.value = config.search || "";
  }
  syncThemePresetOptions(entry, config);
  setThemeProfileOnControls(entry, config.profile);
  const customSelected = config.preset === "custom";
  for (const key of THEME_PROFILE_KEYS) {
    const input = getThemeInput(entry, key);
    if (!input) {
      continue;
    }
    input.disabled = !customSelected;
  }
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
  if (!entry || !entry.startFeedback) {
    return;
  }
  entry.startFeedback.textContent = message || "";
  entry.startFeedback.classList.toggle("error", Boolean(isError));
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
  if (!entry || !entry.startCwdInput || !entry.startCommandInput || !entry.startEnvInput) {
    return;
  }
  const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
  const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
  entry.startCwdInput.value = startCwd;
  entry.startCommandInput.value = startCommand;
  entry.startEnvInput.value = formatSessionEnv(session.env);
  if (entry.sessionTagsInput) {
    entry.sessionTagsInput.value = formatSessionTags(session.tags);
  }
  if (entry.sessionSendTerminatorSelect) {
    entry.sessionSendTerminatorSelect.value = getSessionSendTerminator(session.id);
  }
}

function normalizeSessionStartupFromSession(session) {
  return sessionViewModel.normalizeSessionStartupFromSession(session);
}

function readSessionStartupFromControls(entry) {
  const startCwd = String(entry?.startCwdInput?.value || "").trim();
  const startCommand = String(entry?.startCommandInput?.value || "");
  const envResult = parseSessionEnv(String(entry?.startEnvInput?.value || ""));
  const sendTerminator = normalizeSendTerminatorMode(
    String(entry?.sessionSendTerminatorSelect?.value || "").toLowerCase()
  );
  const tagResult = parseSessionTags(String(entry?.sessionTagsInput?.value || ""));
  return {
    startCwd,
    startCommand,
    envResult,
    sendTerminator,
    tagResult
  };
}

function areStringMapsEqual(left, right) {
  const leftEntries = Object.entries(left || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const rightEntries = Object.entries(right || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (let index = 0; index < leftEntries.length; index += 1) {
    const [leftKey, leftValue] = leftEntries[index];
    const [rightKey, rightValue] = rightEntries[index];
    if (leftKey !== rightKey || String(leftValue) !== String(rightValue)) {
      return false;
    }
  }
  return true;
}

function areThemeProfilesEqual(left, right) {
  const normalizedLeft = normalizeThemeProfile(left);
  const normalizedRight = normalizeThemeProfile(right);
  return THEME_PROFILE_KEYS.every((key) => normalizedLeft[key] === normalizedRight[key]);
}

function areStringArraysEqual(left, right) {
  const normalizedLeft = Array.isArray(left) ? left.map((value) => String(value)) : [];
  const normalizedRight = Array.isArray(right) ? right.map((value) => String(value)) : [];
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    if (normalizedLeft[index] !== normalizedRight[index]) {
      return false;
    }
  }
  return true;
}

function setSettingsStatus(entry, text, kind = "") {
  sessionCardMetaController?.setSettingsStatus(entry, text, kind);
}

function setSettingsDirty(entry, dirty) {
  sessionCardMetaController?.setSettingsDirty(entry, dirty);
}

function isSessionSettingsDirty(entry, session) {
  if (!entry || !session) {
    return false;
  }
  const currentStartup = normalizeSessionStartupFromSession(session);
  const draftStartup = readSessionStartupFromControls(entry);
  const draftTheme = readThemeProfileFromControls(entry);
  if (!draftStartup.startCwd || !draftStartup.envResult.ok) {
    return true;
  }
  if (!draftStartup.tagResult.ok) {
    return true;
  }
  if (currentStartup.startCwd !== draftStartup.startCwd) {
    return true;
  }
  if (currentStartup.startCommand !== draftStartup.startCommand) {
    return true;
  }
  if (!areStringMapsEqual(currentStartup.env, draftStartup.envResult.env)) {
    return true;
  }
  if (!areStringArraysEqual(currentStartup.tags, draftStartup.tagResult.tags)) {
    return true;
  }
  if (!areThemeProfilesEqual(session.themeProfile, draftTheme)) {
    return true;
  }
  if (getSessionSendTerminator(session.id) !== draftStartup.sendTerminator) {
    return true;
  }
  return false;
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
  if (!layoutSettingsController) {
    return 10;
  }
  return Math.max(7, Math.ceil((layoutSettingsController.computeFixedCardWidthPx(1) - TERMINAL_CARD_HORIZONTAL_CHROME_PX) || 10));
}

function computeFixedMountHeightPx(rows) {
  if (!layoutSettingsController) {
    const lineHeightPx = TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT;
    return Math.max(120, Math.round(rows * lineHeightPx + TERMINAL_MOUNT_VERTICAL_CHROME_PX));
  }
  return layoutSettingsController.computeFixedMountHeightPx(rows);
}

function computeFixedCardWidthPx(cols) {
  if (!layoutSettingsController) {
    const cellWidthPx = measureTerminalCellWidthPx();
    return Math.max(260, Math.round(cols * cellWidthPx + TERMINAL_CARD_HORIZONTAL_CHROME_PX));
  }
  return layoutSettingsController.computeFixedCardWidthPx(cols);
}

function syncTerminalGeometryCss() {
  layoutSettingsController?.syncTerminalGeometryCss(terminalSettings);
}

function syncSettingsUi() {
  layoutSettingsController?.syncSettingsUi(terminalSettings);
}

function readSettingsFromUi() {
  if (!layoutSettingsController) {
    return {
      cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
      rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120),
      sidebarVisible: terminalSettings.sidebarVisible !== false
    };
  }
  return layoutSettingsController.readSettingsFromUi(terminalSettings);
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
  uiState.error = "";
  applySettingsToAllTerminals({ deckId: activeDeck.id, force: true });
  scheduleGlobalResize({ deckId: activeDeck.id, force: true });
  render();
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
  const next = readSettingsFromUi();
  try {
    await applyTerminalSizeSettings(next.cols, next.rows);
    setCommandFeedback(`Deck size set to ${next.cols}x${next.rows} for '${getActiveDeck()?.name || "deck"}'.`);
  } catch (err) {
    setError(getErrorMessage(err, "Failed to save deck settings."));
  }
}

function setSidebarVisible(visible) {
  const nextVisible = Boolean(visible);
  if ((terminalSettings.sidebarVisible !== false) === nextVisible) {
    return;
  }
  terminalSettings = {
    ...terminalSettings,
    sidebarVisible: nextVisible
  };
  saveTerminalSettings();
  syncSettingsUi();
  scheduleGlobalResize();
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

async function initializeRuntime() {
  await bootstrapDevAuthToken();
  wsClient = wsRuntimeController?.start() || null;
  scheduleBootstrapFallback();
}

createBtn.addEventListener("click", async () => {
  try {
    debugLog("sessions.create.start");
    const createdSession = await api.createSession();
    let session = createdSession;
    const activeDeck = getActiveDeck();
    if (activeDeck && resolveSessionDeckId(createdSession) !== activeDeck.id) {
      session = await api.moveSessionToDeck(activeDeck.id, createdSession.id);
    }
    applyRuntimeEvent({
      type: session.deckId === createdSession.deckId ? "session.created" : "session.updated",
      session
    });
    uiState.error = "";
    debugLog("sessions.create.ok", { sessionId: session.id, deckId: session.deckId || null });
  } catch {
    setError("Failed to create session.");
  }
});

if (deckCreateBtn) {
  deckCreateBtn.addEventListener("click", async () => {
    try {
      await createDeckFlow();
      uiState.error = "";
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create deck."));
    }
  });
}

if (deckRenameBtn) {
  deckRenameBtn.addEventListener("click", async () => {
    try {
      await renameDeckFlow();
      uiState.error = "";
    } catch (err) {
      setError(getErrorMessage(err, "Failed to rename deck."));
    }
  });
}

if (deckDeleteBtn) {
  deckDeleteBtn.addEventListener("click", async () => {
    try {
      await deleteDeckFlow();
      uiState.error = "";
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete deck."));
    }
  });
}

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener("click", () => setSidebarVisible(false));
}

if (sidebarLauncherBtn) {
  sidebarLauncherBtn.addEventListener("click", () => setSidebarVisible(true));
}

if (settingsApplyBtn) {
  settingsApplyBtn.addEventListener("click", onApplySettings);
}
if (settingsColsEl) {
  settingsColsEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onApplySettings();
    }
  });
}
if (settingsRowsEl) {
  settingsRowsEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onApplySettings();
    }
  });
}
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

commandSuggestionsController = createCommandSuggestionsController({
  commandInput,
  uiState,
  render,
  onSelectionApplied: scheduleCommandPreview,
  documentRef: document,
  windowRef: window
});

commandComposerRuntimeController = createCommandComposerRuntimeController({
  windowRef: window,
  getCommandValue: () => commandInput.value || "",
  setCommandValue: (value) => {
    commandInput.value = value;
  },
  resetCommandAutocompleteState,
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
  recordSlashHistory,
  getErrorMessage,
  resetSlashHistoryNavigationState,
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

sendBtn.addEventListener("click", submitCommand);
commandInput.addEventListener("input", () => {
  clearCommandSuggestions();
  scheduleCommandPreview();
  scheduleCommandSuggestions();
});
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    if (moveCommandSuggestion(-1)) {
      event.preventDefault();
      return;
    }
  }
  if (event.key === "ArrowDown") {
    if (moveCommandSuggestion(1)) {
      event.preventDefault();
      return;
    }
  }
  if (event.key === "ArrowUp") {
    if (navigateSlashHistory("up")) {
      event.preventDefault();
    }
    return;
  }
  if (event.key === "ArrowDown") {
    if (navigateSlashHistory("down")) {
      event.preventDefault();
    }
    return;
  }
  if (event.key === "Tab") {
    if (parseSlashInputForAutocomplete(commandInput.value || "") || parseQuickSwitchInputForAutocomplete(commandInput.value || "")) {
      event.preventDefault();
      autocompleteComposerInput(event.shiftKey).catch(() => {});
    }
    return;
  }
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    if (acceptCommandSuggestion()) {
      event.preventDefault();
      return;
    }
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (slashHistoryCursor >= 0 && isSingleLineSlashModeInput(commandInput.value || "")) {
      if (commandInput.value === recalledSlashCommand) {
        submitCommand();
      } else {
        setCommandFeedback("Repeat blocked: recalled slash command was modified.");
      }
      return;
    }
    submitCommand();
  }
});

initializeRuntime().catch(() => {
  setError("Failed to initialize application runtime.");
});

window.addEventListener("beforeunload", () => {
  activityCompletionNotifier.dispose();
  if (wsClient) {
    wsClient.close();
  }
  authBootstrapRuntimeController?.dispose();
  sessionTerminalResizeController?.dispose();
  terminalSearchController?.dispose();
  commandComposerRuntimeController?.dispose();
  if (commandSuggestionsTimer) {
    clearTimeout(commandSuggestionsTimer);
  }
  for (const observer of terminalObservers.values()) {
    observer.disconnect();
  }
  for (const entry of terminals.values()) {
    entry.terminal.dispose();
  }
});

window.addEventListener("resize", scheduleGlobalResize);
