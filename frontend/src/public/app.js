import { createApiClient } from "./api-client.js";
import { createActivityCompletionNotifier } from "./activity-completion-notifier.js";
import { createCommandEngine } from "./command-engine.js";
import { createCommandExecutor } from "./command-executor.js";
import { areCompletionCandidateListsEqual, normalizeCompletionCandidate } from "./command-completion.js";
import { interpretComposerInput } from "./command-interpreter.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";
import { resolveRuntimeConfig } from "./runtime-config.js";
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
  applyTerminalSearchMatch,
  collectTerminalSearchMatches,
  formatTerminalSearchStatus,
  normalizeTerminalSearchQuery
} from "./terminal-search.js";
import {
  createSessionStreamAdapter,
  normalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator
} from "./terminal-stream.js";
import { ITERM2_THEME_LIBRARY } from "./theme-library.js";
import { createCommandSuggestionsController } from "./ui/components.js";
import { createDeckSidebarController } from "./ui/deck-sidebar-controller.js";
import { createLayoutSettingsController } from "./ui/layout-settings-controller.js";
import { createSessionCardMetaController } from "./ui/session-card-meta-controller.js";

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
let globalResizeTimer = null;
let deferredResizeTimer = null;
let bootstrapPromise = null;
let bootstrapFallbackTimer = null;
let runtimeBootstrapSource = "pending";
let commandPreviewTimer = null;
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
let wsAuthToken = "";
let wsAuthTokenExpiresAtMs = 0;
let authRefreshTimer = null;
let devAuthRefreshPromise = null;
let wsClient = null;
let commandAutocompleteRequestId = 0;
const slashCommandHistory = [];
let slashHistoryCursor = -1;
let slashHistoryDraft = "";
let recalledSlashCommand = "";
let sessionViewModel = null;
let commandEngine = null;
let commandExecutor = null;
let commandSuggestionsController = null;
let deckSidebarController = null;
let sessionCardMetaController = null;
let layoutSettingsController = null;
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
  const entry = terminals.get(sessionId);
  if (entry && typeof entry.terminal?.clearSelection === "function") {
    entry.terminal.clearSelection();
  }
  if (terminalSearchState.selectedSessionId === sessionId) {
    terminalSearchState.selectedSessionId = "";
  }
}

function updateTerminalSearchUi() {
  const query = normalizeTerminalSearchQuery(terminalSearchState.query);
  const hasMatches = terminalSearchState.matches.length > 0;
  const missingActiveSession = Boolean(query) && terminalSearchState.missingActiveSession;
  const statusText = formatTerminalSearchStatus({
    query,
    matches: terminalSearchState.matches,
    activeIndex: terminalSearchState.activeIndex,
    wrapped: terminalSearchState.wrapped,
    direction: terminalSearchState.direction,
    missingActiveSession
  });

  if (terminalSearchInputEl && terminalSearchInputEl.value !== terminalSearchState.query) {
    terminalSearchInputEl.value = terminalSearchState.query;
  }
  if (terminalSearchStatusEl) {
    terminalSearchStatusEl.textContent = statusText;
  }
  if (terminalSearchPrevBtn) {
    terminalSearchPrevBtn.disabled = !query || !hasMatches;
  }
  if (terminalSearchNextBtn) {
    terminalSearchNextBtn.disabled = !query || !hasMatches;
  }
  if (terminalSearchClearBtn) {
    terminalSearchClearBtn.disabled = !query;
  }
}

function applyActiveTerminalSearchSelection() {
  const activeSessionId = terminalSearchState.sessionId;
  const entry = terminals.get(activeSessionId);
  if (!entry || terminalSearchState.matches.length === 0 || terminalSearchState.activeIndex < 0) {
    clearTerminalSearchSelection(activeSessionId);
    updateTerminalSearchUi();
    return;
  }

  if (terminalSearchState.selectedSessionId && terminalSearchState.selectedSessionId !== activeSessionId) {
    clearTerminalSearchSelection(terminalSearchState.selectedSessionId);
  }
  applyTerminalSearchMatch(entry.terminal, terminalSearchState.matches[terminalSearchState.activeIndex]);
  terminalSearchState.selectedSessionId = activeSessionId;
  updateTerminalSearchUi();
}

function resetTerminalSearchState() {
  clearTerminalSearchSelection();
  terminalSearchState.sessionId = "";
  terminalSearchState.matches = [];
  terminalSearchState.activeIndex = -1;
  terminalSearchState.revision = -1;
  terminalSearchState.wrapped = false;
  terminalSearchState.direction = "next";
  terminalSearchState.missingActiveSession = false;
}

function syncActiveTerminalSearch({ preserveSelection = true } = {}) {
  const query = normalizeTerminalSearchQuery(terminalSearchState.query);
  terminalSearchState.query = query;

  if (!query) {
    resetTerminalSearchState();
    updateTerminalSearchUi();
    return;
  }

  const activeSessionId = store.getState().activeSessionId || "";
  if (!activeSessionId) {
    resetTerminalSearchState();
    terminalSearchState.query = query;
    terminalSearchState.missingActiveSession = true;
    updateTerminalSearchUi();
    return;
  }

  const entry = terminals.get(activeSessionId);
  if (!entry) {
    resetTerminalSearchState();
    terminalSearchState.query = query;
    terminalSearchState.sessionId = activeSessionId;
    terminalSearchState.missingActiveSession = true;
    updateTerminalSearchUi();
    return;
  }

  const revision = Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0;
  const previousSessionId = terminalSearchState.sessionId;
  const previousMatch =
    preserveSelection &&
    previousSessionId === activeSessionId &&
    terminalSearchState.activeIndex >= 0 &&
    terminalSearchState.matches[terminalSearchState.activeIndex]
      ? terminalSearchState.matches[terminalSearchState.activeIndex]
      : null;
  const matches = collectTerminalSearchMatches(entry.terminal, query);
  let activeIndex = -1;

  if (matches.length > 0) {
    if (previousMatch) {
      activeIndex = matches.findIndex(
        (match) =>
          match.row === previousMatch.row &&
          match.column === previousMatch.column &&
          match.length === previousMatch.length
      );
    }
    if (activeIndex < 0) {
      activeIndex = 0;
    }
  }

  terminalSearchState.query = query;
  terminalSearchState.sessionId = activeSessionId;
  terminalSearchState.matches = matches;
  terminalSearchState.activeIndex = activeIndex;
  terminalSearchState.revision = revision;
  terminalSearchState.wrapped = false;
  terminalSearchState.direction = "next";
  terminalSearchState.missingActiveSession = false;
  applyActiveTerminalSearchSelection();
}

function navigateActiveTerminalSearch(direction) {
  const normalizedDirection = direction === "previous" ? "previous" : "next";
  const query = normalizeTerminalSearchQuery(terminalSearchState.query);
  if (!query) {
    updateTerminalSearchUi();
    return;
  }

  const activeSessionId = store.getState().activeSessionId || "";
  const entry = terminals.get(activeSessionId);
  if (!entry) {
    terminalSearchState.query = query;
    terminalSearchState.missingActiveSession = true;
    updateTerminalSearchUi();
    return;
  }

  const revision = Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0;
  if (
    terminalSearchState.sessionId !== activeSessionId ||
    terminalSearchState.query !== query ||
    terminalSearchState.revision !== revision
  ) {
    syncActiveTerminalSearch({ preserveSelection: true });
  }

  if (terminalSearchState.matches.length === 0) {
    updateTerminalSearchUi();
    return;
  }

  let nextIndex = terminalSearchState.activeIndex;
  if (nextIndex < 0) {
    nextIndex = 0;
  } else if (normalizedDirection === "previous") {
    nextIndex -= 1;
  } else {
    nextIndex += 1;
  }

  let wrapped = false;
  if (nextIndex < 0) {
    nextIndex = terminalSearchState.matches.length - 1;
    wrapped = true;
  }
  if (nextIndex >= terminalSearchState.matches.length) {
    nextIndex = 0;
    wrapped = true;
  }

  terminalSearchState.activeIndex = nextIndex;
  terminalSearchState.wrapped = wrapped;
  terminalSearchState.direction = normalizedDirection;
  terminalSearchState.missingActiveSession = false;
  applyActiveTerminalSearchSelection();
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

function loadStoredActiveDeckId() {
  try {
    if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
      return "";
    }
    return String(window.localStorage.getItem(ACTIVE_DECK_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function saveStoredActiveDeckId(deckId) {
  try {
    if (!window.localStorage) {
      return;
    }
    if (!deckId) {
      if (typeof window.localStorage.removeItem === "function") {
        window.localStorage.removeItem(ACTIVE_DECK_STORAGE_KEY);
      }
      return;
    }
    if (typeof window.localStorage.setItem === "function") {
      window.localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, String(deckId));
    }
  } catch {
    // ignore storage failures
  }
}

function getSessionFilterText() {
  return store.getState().sessionFilterText || "";
}

function setSessionFilterText(value) {
  store.setSessionFilterText(value);
  saveStoredSessionFilterText(store.getState().sessionFilterText);
}

function normalizeDeckTerminalSettings(rawSettings) {
  const terminal = rawSettings && typeof rawSettings === "object" ? rawSettings.terminal : null;
  return {
    cols: clampInt(terminal?.cols, DEFAULT_TERMINAL_COLS, 20, 400),
    rows: clampInt(terminal?.rows, DEFAULT_TERMINAL_ROWS, 5, 120)
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
  return store.getState().decks.find((deck) => deck.id === deckId) || null;
}

function getActiveDeck() {
  const preferred = getDeckById(store.getState().activeDeckId);
  if (preferred) {
    return preferred;
  }
  const decks = store.getState().decks;
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
    return;
  }
  const nextSize = normalizeDeckTerminalSettings(activeDeck.settings);
  const changed = terminalSettings.cols !== nextSize.cols || terminalSettings.rows !== nextSize.rows;
  terminalSettings = {
    ...terminalSettings,
    cols: nextSize.cols,
    rows: nextSize.rows
  };
  saveTerminalSettings();
  syncSettingsUi();
  if (changed) {
    applySettingsToAllTerminals({ deckId: activeDeck.id, force: true });
    scheduleGlobalResize({ deckId: activeDeck.id, force: true });
  }
}

function setDecks(nextDecks, options = {}) {
  const normalizedDecks = Array.isArray(nextDecks)
    ? nextDecks.map(normalizeDeckEntry).filter((deck) => Boolean(deck.id))
    : [];
  const preferredActiveDeckId = String(options.preferredActiveDeckId || store.getState().activeDeckId || "").trim();
  store.setDecks(normalizedDecks, { preferredActiveDeckId });
  saveStoredActiveDeckId(store.getState().activeDeckId);
  syncActiveDeckGeometryFromState();
}

function upsertDeckInState(nextDeck, options = {}) {
  const normalizedDeck = normalizeDeckEntry(nextDeck);
  if (!normalizedDeck.id) {
    return;
  }
  store.upsertDeck(normalizedDeck, {
    preferredActiveDeckId: options.preferredActiveDeckId || store.getState().activeDeckId || normalizedDeck.id
  });
  saveStoredActiveDeckId(store.getState().activeDeckId);
  syncActiveDeckGeometryFromState();
}

function removeDeckFromState(deckId, options = {}) {
  const normalizedDeckId = String(deckId || "").trim();
  if (!normalizedDeckId) {
    return;
  }
  store.removeDeck(normalizedDeckId, {
    preferredActiveDeckId: options.preferredActiveDeckId,
    fallbackDeckId: options.fallbackDeckId || DEFAULT_DECK_ID
  });
  saveStoredActiveDeckId(store.getState().activeDeckId);
  syncActiveDeckGeometryFromState();
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
  activeDeckId: loadStoredActiveDeckId(),
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

function applyMountHeight(entry, cols, rows) {
  if (!entry || !entry.mount) {
    return;
  }
  let mountHeightPx = computeFixedMountHeightPx(rows);
  const cardWidthPx = computeFixedCardWidthPx(cols);
  const mountWidthPx = Math.max(220, cardWidthPx - TERMINAL_CARD_HORIZONTAL_CHROME_PX);
  const runtimeCellHeightPx = getTerminalCellHeightPx(entry?.terminal);
  if (runtimeCellHeightPx > 0) {
    const currentlyVisibleRows = Math.floor(mountHeightPx / runtimeCellHeightPx);
    if (currentlyVisibleRows < rows) {
      mountHeightPx += Math.ceil((rows - currentlyVisibleRows) * runtimeCellHeightPx) + 2;
    }
  }
  entry.mount.style.height = `${mountHeightPx}px`;
  entry.mount.style.width = `${mountWidthPx}px`;
  entry.element.style.width = `${cardWidthPx}px`;
}

function applySettingsToAllTerminals(options = {}) {
  const deckIdFilter = String(options.deckId || "").trim();
  const force = options.force !== false;
  for (const sessionId of terminals.keys()) {
    if (deckIdFilter) {
      const session = getSessionById(sessionId);
      if (session && resolveSessionDeckId(session) !== deckIdFilter) {
        continue;
      }
    }
    applyResizeForSession(sessionId, { force });
  }
}

function findNextQuickId() {
  const used = new Set(sessionQuickIds.values());
  for (const candidate of QUICK_ID_POOL) {
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return "?";
}

function ensureQuickId(sessionId) {
  if (!sessionQuickIds.has(sessionId)) {
    sessionQuickIds.set(sessionId, findNextQuickId());
  }
  return sessionQuickIds.get(sessionId);
}

function pruneQuickIds(activeSessionIds) {
  const activeSet = new Set(activeSessionIds);
  for (const sessionId of sessionQuickIds.keys()) {
    if (!activeSet.has(sessionId)) {
      sessionQuickIds.delete(sessionId);
    }
  }
}

function computeTerminalSize(entry, session) {
  if (!entry || !entry.mount || entry.mount.clientWidth < 40 || entry.mount.clientHeight < 40) {
    return null;
  }
  const geometry = getSessionTerminalGeometry(session);
  return {
    cols: geometry.cols,
    rows: geometry.rows
  };
}

function applyResizeForSession(sessionId, options = {}) {
  const entry = terminals.get(sessionId);
  if (!entry) {
    return;
  }
  const session = getSessionById(sessionId);
  if (isSessionActionBlocked(session)) {
    const pendingTimer = resizeTimers.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      resizeTimers.delete(sessionId);
    }
    return;
  }
  const size = computeTerminalSize(entry, session);
  if (!size) {
    return;
  }

  const { cols, rows } = size;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
    return;
  }
  const previous = terminalSizes.get(sessionId);
  if (!options.force && previous && previous.cols === cols && previous.rows === rows) {
    return;
  }

  terminalSizes.set(sessionId, { cols, rows });
  applyMountHeight(entry, cols, rows);
  entry.terminal.resize(cols, rows);
  debugLog("terminal.resize.local", { sessionId, cols, rows });

  const pendingTimer = resizeTimers.get(sessionId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
  }

  const timer = setTimeout(() => {
    debugLog("terminal.resize.remote.start", { sessionId, cols, rows });
    api.resizeSession(sessionId, cols, rows).catch(() => {
      debugLog("terminal.resize.remote.error", { sessionId, cols, rows });
    });
  }, 180);
  resizeTimers.set(sessionId, timer);
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
  const deckIdFilter = String(options.deckId || "").trim();
  const force = options.force === true;
  if (globalResizeTimer) {
    clearTimeout(globalResizeTimer);
  }
  globalResizeTimer = setTimeout(() => {
    globalResizeTimer = null;
    for (const sessionId of terminals.keys()) {
      if (deckIdFilter) {
        const session = getSessionById(sessionId);
        if (session && resolveSessionDeckId(session) !== deckIdFilter) {
          continue;
        }
      }
      applyResizeForSession(sessionId, force ? { force: true } : undefined);
    }
  }, 120);
}

function openSettingsDialog(dialog) {
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
    return;
  }
  dialog.open = true;
  dialog.classList.add("open");
}

function closeSettingsDialog(dialog) {
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function") {
    if (dialog.open) {
      dialog.close();
    }
    return;
  }
  dialog.open = false;
  dialog.classList.remove("open");
}

function confirmSessionDelete(session) {
  const sessionLabel = String(session?.name || session?.id || "").trim() || "this session";
  const message = `Delete session '${sessionLabel}' permanently?`;
  if (!window || typeof window.confirm !== "function") {
    return true;
  }
  return window.confirm(message);
}

function toggleSettingsDialog(dialog) {
  if (!dialog) {
    return;
  }
  if (dialog.open) {
    closeSettingsDialog(dialog);
    return;
  }
  openSettingsDialog(dialog);
}

function scheduleDeferredResizePasses(options = {}) {
  const deckIdFilter = String(options.deckId || "").trim();
  const force = options.force === true;
  if (deferredResizeTimer) {
    clearTimeout(deferredResizeTimer);
  }
  const delays = [250, 700, 1400];
  let index = 0;
  function runNext() {
    scheduleGlobalResize(deckIdFilter ? { deckId: deckIdFilter, force } : force ? { force: true } : {});
    index += 1;
    if (index < delays.length) {
      deferredResizeTimer = setTimeout(runNext, delays[index]);
    } else {
      deferredResizeTimer = null;
    }
  }
  deferredResizeTimer = setTimeout(runNext, delays[index]);
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
  if (runtimeBootstrapSource !== "pending" || bootstrapPromise || bootstrapFallbackTimer) {
    return;
  }
  bootstrapFallbackTimer = setTimeout(() => {
    bootstrapFallbackTimer = null;
    bootstrapRuntimeFallback().catch(() => {});
  }, WS_BOOTSTRAP_FALLBACK_MS);
}

function getSessionCountForDeck(deckId, sessions) {
  if (deckSidebarController) {
    return deckSidebarController.getSessionCountForDeck(deckId, sessions);
  }
  return sessions.reduce((count, session) => (resolveSessionDeckId(session) === deckId ? count + 1 : count), 0);
}

function renderDeckTabs(sessions) {
  if (!deckSidebarController) {
    return;
  }
  const state = store.getState();
  deckSidebarController.render({
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
  if (store.getState().activeDeckId === normalized) {
    return true;
  }
  const changed = store.setActiveDeck(normalized);
  if (!changed) {
    return true;
  }
  saveStoredActiveDeckId(normalized);
  syncActiveDeckGeometryFromState();
  scheduleGlobalResize({ deckId: normalized, force: true });
  scheduleDeferredResizePasses({ deckId: normalized, force: true });
  return true;
}

async function createDeckFlow() {
  if (!window || typeof window.prompt !== "function") {
    return;
  }
  const input = window.prompt("Deck name", "New Deck");
  if (input === null) {
    return;
  }
  const name = input.trim();
  if (!name) {
    setError("Deck name cannot be empty.");
    return;
  }
  const created = await api.createDeck({
    name,
    settings: {
      terminal: {
        cols: terminalSettings.cols,
        rows: terminalSettings.rows
      }
    }
  });
  applyRuntimeEvent(
    {
      type: "deck.created",
      deck: created
    },
    { preferredActiveDeckId: created.id }
  );
  setCommandFeedback(`Created deck '${created.name}'.`);
}

async function renameDeckFlow() {
  const activeDeck = getActiveDeck();
  if (!activeDeck) {
    setError("No active deck to rename.");
    return;
  }
  if (!window || typeof window.prompt !== "function") {
    return;
  }
  const input = window.prompt("Deck name", activeDeck.name || activeDeck.id);
  if (input === null) {
    return;
  }
  const name = input.trim();
  if (!name) {
    setError("Deck name cannot be empty.");
    return;
  }
  const updated = await api.updateDeck(activeDeck.id, { name });
  applyRuntimeEvent(
    {
      type: "deck.updated",
      deck: updated
    },
    { preferredActiveDeckId: updated.id }
  );
  setCommandFeedback(`Renamed deck to '${updated.name}'.`);
}

async function deleteDeckFlow() {
  const activeDeck = getActiveDeck();
  if (!activeDeck) {
    setError("No active deck to delete.");
    return;
  }
  if (!window || typeof window.confirm !== "function") {
    return;
  }
  const confirmed = window.confirm(`Delete deck '${activeDeck.name}'?`);
  if (!confirmed) {
    return;
  }
  try {
    await api.deleteDeck(activeDeck.id, { force: false });
  } catch (err) {
    if (err && err.status === 409) {
      const forceConfirmed = window.confirm(
        `Deck '${activeDeck.name}' still contains sessions. Force delete and move sessions to default deck?`
      );
      if (!forceConfirmed) {
        return;
      }
      await api.deleteDeck(activeDeck.id, { force: true });
    } else {
      throw err;
    }
  }
  const fallbackId = store.getState().decks.find((deck) => deck.id !== activeDeck.id)?.id || DEFAULT_DECK_ID;
  applyRuntimeEvent(
    {
      type: "deck.deleted",
      deckId: activeDeck.id,
      fallbackDeckId: fallbackId
    },
    { preferredActiveDeckId: fallbackId }
  );
  setCommandFeedback(`Deleted deck '${activeDeck.name}'.`);
}

function render() {
  const state = store.getState();
  const activeDeck = getActiveDeck();
  const activeDeckId = activeDeck ? activeDeck.id : "";
  const deckSessions = activeDeckId
    ? state.sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId)
    : state.sessions.slice();
  renderDeckTabs(state.sessions);
  const hasDecks = state.decks.length > 0;
  if (deckRenameBtn) {
    deckRenameBtn.disabled = !hasDecks;
  }
  if (deckDeleteBtn) {
    deckDeleteBtn.disabled = !activeDeck || activeDeck.id === DEFAULT_DECK_ID;
  }
  const sessionFilterText = getSessionFilterText();
  const filtered = resolveFilterSelectors(sessionFilterText, deckSessions);
  const visibleSessionIds = new Set(
    filtered.sessions.map((session) => session.id)
  );
  const filterActive = Boolean(String(sessionFilterText || "").trim());
  if (filterActive && filtered.sessions.length > 0) {
    const firstVisibleId = filtered.sessions[0].id;
    const activeVisible = state.activeSessionId && visibleSessionIds.has(state.activeSessionId);
    if (!activeVisible) {
      store.setActiveSession(firstVisibleId);
      return;
    }
  }
  if (!filterActive) {
    visibleSessionIds.clear();
    for (const session of deckSessions) {
      visibleSessionIds.add(session.id);
    }
  }
  pruneQuickIds(state.sessions.map((session) => session.id));
  if (state.sessions.length > 0 && startupPerf.firstNonEmptyRenderAtMs === null) {
    startupPerf.firstNonEmptyRenderAtMs = nowMs();
    maybeReportStartupPerf();
  }
  debugLog("ui.render", {
    sessions: state.sessions.length,
    deckSessions: deckSessions.length,
    visibleSessions: visibleSessionIds.size,
    activeSessionId: state.activeSessionId,
    connectionState: state.connectionState,
    loading: uiState.loading,
    hasError: Boolean(uiState.error)
  });
  stateEl.textContent = state.connectionState;
  syncStatusTicker(state.sessions);
  if (state.sessions.length === 0) {
    emptyStateEl.textContent = "No sessions yet. Create one to start.";
    emptyStateEl.style.display = "block";
  } else if (deckSessions.length === 0) {
    emptyStateEl.textContent = "No sessions in active deck.";
    emptyStateEl.style.display = "block";
  } else if (visibleSessionIds.size === 0) {
    emptyStateEl.textContent = "No sessions match current filter.";
    emptyStateEl.style.display = "block";
  } else {
    emptyStateEl.textContent = "No sessions yet. Create one to start.";
    emptyStateEl.style.display = "none";
  }
  if (uiState.loading) {
    statusMessageEl.textContent = "Loading sessions...";
  } else if (uiState.error) {
    statusMessageEl.textContent = uiState.error;
  } else if (state.connectionState !== "connected") {
    statusMessageEl.textContent = `Connection state: ${state.connectionState}`;
  } else {
    statusMessageEl.textContent = "";
  }
  if (commandFeedbackEl) {
    commandFeedbackEl.textContent = uiState.commandFeedback || "";
  }
  if (commandInlineHintEl) {
    commandInlineHintEl.textContent = uiState.commandInlineHint || "";
    commandInlineHintEl.style.setProperty("--hint-prefix-px", `${uiState.commandInlineHintPrefixPx || 0}px`);
  }
  if (commandPreviewEl) {
    commandPreviewEl.textContent = uiState.commandPreview || "";
  }
  if (commandSuggestionsEl) {
    commandSuggestionsEl.textContent = uiState.commandSuggestions || "";
  }
  syncActiveTerminalSearch({ preserveSelection: true });

  const activeIds = new Set(state.sessions.map((s) => s.id));
  let shouldRunResizePass = false;
  for (const sessionId of terminals.keys()) {
    if (!activeIds.has(sessionId)) {
      const entry = terminals.get(sessionId);
      const observer = terminalObservers.get(sessionId);
      if (observer) {
        observer.disconnect();
      }
      entry.terminal.dispose();
      entry.element.remove();
      terminals.delete(sessionId);
      terminalObservers.delete(sessionId);
      closeSettingsDialog(entry.settingsDialog);
      streamPluginEngine.disposeSession(sessionId);
      streamAdapter.disposeSession(sessionId);
      if (terminalSearchState.selectedSessionId === sessionId || terminalSearchState.sessionId === sessionId) {
        clearTerminalSearchSelection(sessionId);
        terminalSearchState.sessionId = "";
        terminalSearchState.matches = [];
        terminalSearchState.activeIndex = -1;
        terminalSearchState.revision = -1;
      }
      const timer = resizeTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
      }
      resizeTimers.delete(sessionId);
      terminalSizes.delete(sessionId);
      sessionThemeDrafts.delete(sessionId);
      sessionCardMetaController?.clearSessionStatusAnchor(sessionId);
      shouldRunResizePass = true;
    }
  }

  for (const session of state.sessions) {
    if (terminals.has(session.id)) {
      const entry = terminals.get(session.id);
      const stateBadgeText = getSessionStateBadgeText(session);
      const stateHintText = getSessionStateHintText(session);
      const nextVisible = visibleSessionIds.has(session.id);
      const wasVisible = entry.isVisible !== false;
      entry.element.classList.toggle("active", state.activeSessionId === session.id);
      entry.element.classList.toggle("unrestored", isSessionUnrestored(session));
      entry.element.classList.toggle("exited", isSessionExited(session));
      entry.element.classList.toggle("attention", session?.attentionActive === true);
      if (wasVisible && !nextVisible) {
        entry.followOnShow = isTerminalAtBottom(entry.terminal);
      }
      setSessionCardVisibility(entry.element, nextVisible);
      entry.isVisible = nextVisible;
      if (nextVisible && (!wasVisible || entry.pendingViewportSync)) {
        syncTerminalViewportAfterShow(session.id, entry);
      }
      entry.focusBtn.textContent = session.name || session.id.slice(0, 8);
      entry.quickIdEl.textContent = ensureQuickId(session.id);
      if (entry.stateBadgeEl) {
        entry.stateBadgeEl.hidden = !stateBadgeText;
        entry.stateBadgeEl.textContent = stateBadgeText;
      }
      if (entry.unrestoredHintEl) {
        entry.unrestoredHintEl.hidden = !stateHintText;
        entry.unrestoredHintEl.textContent = stateHintText;
      }
      renderSessionTagList(entry, session);
      renderSessionPluginBadges(entry, session);
      renderSessionStatus(entry, session);
      renderSessionArtifacts(entry, session);
      if (!entry.settingsDirty) {
        syncSessionStartupControls(entry, session);
        syncSessionThemeControls(entry, session.id);
        setSettingsDirty(entry, false);
      }
      continue;
    }

    const node = template.content.firstElementChild.cloneNode(true);
    const quickIdEl = node.querySelector(".session-quick-id");
    const focusBtn = node.querySelector(".session-focus");
    const stateBadgeEl = node.querySelector(".session-state-badge");
    const pluginBadgesEl = node.querySelector(".session-plugin-badges");
    const unrestoredHintEl = node.querySelector(".session-unrestored-hint");
    const sessionStatusEl = node.querySelector(".session-status-text");
    const sessionArtifactsEl = node.querySelector(".session-artifacts");
    const settingsBtn = node.querySelector(".session-settings");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const settingsDialog = node.querySelector(".session-settings-dialog");
    const settingsDismissBtn = node.querySelector(".session-settings-dismiss");
    const startCwdInput = node.querySelector(".session-start-cwd");
    const startCommandInput = node.querySelector(".session-start-command");
    const startEnvInput = node.querySelector(".session-start-env");
    const sessionSendTerminatorSelect = node.querySelector(".session-send-terminator");
    const sessionTagsInput = node.querySelector(".session-tags-input");
    const startFeedback = node.querySelector(".session-start-feedback");
    const tagListEl = node.querySelector(".session-tag-list");
    const themeCategory = node.querySelector(".session-theme-category");
    const themeSearch = node.querySelector(".session-theme-search");
    const themeSelect = node.querySelector(".session-theme-select");
    const themeBg = node.querySelector(".session-theme-bg");
    const themeFg = node.querySelector(".session-theme-fg");
    const themeInputs = {
      background: themeBg,
      foreground: themeFg
    };
    for (const key of THEME_PROFILE_KEYS) {
      if (themeInputs[key]) {
        continue;
      }
      const classSuffix = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      const input = node.querySelector(`.session-theme-${classSuffix}`);
      if (input) {
        themeInputs[key] = input;
      }
    }
    const settingsApplyBtn = node.querySelector(".session-settings-apply");
    const settingsCancelBtn = node.querySelector(".session-settings-cancel");
    const settingsStatus = node.querySelector(".session-settings-status");
    const mount = node.querySelector(".terminal-mount");
    const quickId = ensureQuickId(session.id);
    const stateBadgeText = getSessionStateBadgeText(session);
    const stateHintText = getSessionStateHintText(session);

    focusBtn.textContent = session.name || session.id.slice(0, 8);
    quickIdEl.textContent = quickId;
    node.classList.toggle("unrestored", isSessionUnrestored(session));
    node.classList.toggle("exited", isSessionExited(session));
    node.classList.toggle("attention", session?.attentionActive === true);
    if (stateBadgeEl) {
      stateBadgeEl.hidden = !stateBadgeText;
      stateBadgeEl.textContent = stateBadgeText;
    }
    if (unrestoredHintEl) {
      unrestoredHintEl.hidden = !stateHintText;
      unrestoredHintEl.textContent = stateHintText;
    }
    renderSessionTagList({ tagListEl }, session);
    renderSessionPluginBadges({ pluginBadgesEl }, session);
    renderSessionStatus({ sessionStatusEl }, session);
    renderSessionArtifacts({ sessionArtifactsEl }, session);
    focusBtn.addEventListener("click", () => store.setActiveSession(session.id));
    settingsBtn.addEventListener("click", () => toggleSettingsDialog(settingsDialog));
    if (settingsDismissBtn) {
      settingsDismissBtn.addEventListener("click", () => closeSettingsDialog(settingsDialog));
    }
    if (settingsDialog && typeof settingsDialog.addEventListener === "function") {
      settingsDialog.addEventListener("cancel", (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        closeSettingsDialog(settingsDialog);
      });
    }
    renameBtn.addEventListener("click", async () => {
      const currentSession = getSessionById(session.id) || session;
      if (isSessionExited(currentSession)) {
        setError(getBlockedSessionActionMessage([currentSession], "Rename"));
        return;
      }
      const nextName = window.prompt("Session name", currentSession.name || session.id.slice(0, 8));
      if (nextName === null) {
        return;
      }
      const trimmed = nextName.trim();
      if (!trimmed) {
        setError("Session name cannot be empty.");
        return;
      }
      try {
        const updated = await api.updateSession(session.id, { name: trimmed });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        uiState.error = "";
      } catch {
        setError("Failed to rename session.");
      }
    });
    closeBtn.addEventListener("click", async () => {
      const currentSession = getSessionById(session.id) || session;
      if (!confirmSessionDelete(session)) {
        return;
      }
      if (isSessionExited(currentSession)) {
        removeSession(currentSession.id);
        closeSettingsDialog(settingsDialog);
        uiState.error = "";
        setCommandFeedback(
          `Removed exited session [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`
        );
        return;
      }
      try {
        await api.deleteSession(session.id);
        applyRuntimeEvent({ type: "session.closed", sessionId: session.id });
        uiState.error = "";
      } catch {
        setError("Failed to delete session.");
      }
    });
    const markDirtyFromControls = () => {
      const nextDirty = isSessionSettingsDirty(
        { startCwdInput, startCommandInput, startEnvInput, sessionSendTerminatorSelect, sessionTagsInput, themeInputs },
        getSessionById(session.id)
      );
      setSettingsDirty(terminals.get(session.id), nextDirty);
    };
    startCwdInput.addEventListener("input", markDirtyFromControls);
    startCommandInput.addEventListener("input", markDirtyFromControls);
    startEnvInput.addEventListener("input", markDirtyFromControls);
    if (sessionTagsInput) {
      sessionTagsInput.addEventListener("input", markDirtyFromControls);
    }
    if (sessionSendTerminatorSelect) {
      sessionSendTerminatorSelect.addEventListener("change", markDirtyFromControls);
    }
    themeSelect.addEventListener("change", () => {
      const nextPreset = TERMINAL_THEME_MODE_SET.has(themeSelect.value) ? themeSelect.value : "custom";
      const currentProfile = readThemeProfileFromControls({ themeInputs, themeBg, themeFg });
      const preset = getThemePresetById(nextPreset);
      const nextProfile = nextPreset === "custom" || !preset ? currentProfile : normalizeThemeProfile(preset.profile);
      sessionThemeDrafts.set(session.id, {
        preset: nextPreset,
        profile: nextProfile,
        category: normalizeThemeFilterCategory(String(themeCategory?.value || "all").toLowerCase()),
        search: String(themeSearch?.value || "")
      });
      syncSessionThemeControls({ themeSelect, themeCategory, themeSearch, themeInputs, themeBg, themeFg }, session.id);
      applyThemeForSession(session.id);
      markDirtyFromControls();
      uiState.error = "";
      render();
    });
    if (themeCategory) {
      themeCategory.addEventListener("change", () => {
        const current = getSessionThemeConfig(session.id);
        const category = normalizeThemeFilterCategory(String(themeCategory.value || "all").toLowerCase());
        sessionThemeDrafts.set(session.id, {
          ...current,
          category,
          search: String(themeSearch?.value || "")
        });
        syncSessionThemeControls({ themeSelect, themeCategory, themeSearch, themeInputs, themeBg, themeFg }, session.id);
        markDirtyFromControls();
      });
    }
    if (themeSearch) {
      themeSearch.addEventListener("input", () => {
        const current = getSessionThemeConfig(session.id);
        sessionThemeDrafts.set(session.id, {
          ...current,
          category: normalizeThemeFilterCategory(String(themeCategory?.value || "all").toLowerCase()),
          search: String(themeSearch.value || "")
        });
        syncSessionThemeControls({ themeSelect, themeCategory, themeSearch, themeInputs, themeBg, themeFg }, session.id);
        markDirtyFromControls();
      });
    }
    for (const key of THEME_PROFILE_KEYS) {
      const input = themeInputs[key];
      if (!input) {
        continue;
      }
      input.addEventListener("input", () => {
        const draft = getSessionThemeConfig(session.id);
        sessionThemeDrafts.set(session.id, {
          ...draft,
          preset: "custom",
          profile: readThemeProfileFromControls({ themeInputs, themeBg, themeFg })
        });
        applyThemeForSession(session.id);
        markDirtyFromControls();
      });
    }
    settingsApplyBtn.addEventListener("click", async () => {
      const currentSession = getSessionById(session.id) || session;
      if (isSessionExited(currentSession)) {
        const blockedMessage = getBlockedSessionActionMessage([currentSession], "Settings apply");
        setError(blockedMessage);
        setStartupSettingsFeedback({ startFeedback }, blockedMessage, true);
        return;
      }
      const startupDraft = readSessionStartupFromControls({
        startCwdInput,
        startCommandInput,
        startEnvInput,
        sessionTagsInput,
        sessionSendTerminatorSelect
      });
      if (!startupDraft.startCwd) {
        setStartupSettingsFeedback({ startFeedback }, "Working Directory cannot be empty.", true);
        return;
      }
      if (!startupDraft.envResult.ok) {
        setStartupSettingsFeedback({ startFeedback }, startupDraft.envResult.error, true);
        return;
      }
      if (!startupDraft.tagResult.ok) {
        setStartupSettingsFeedback({ startFeedback }, startupDraft.tagResult.error, true);
        return;
      }
      const profile = readThemeProfileFromControls({ themeInputs, themeBg, themeFg });
      const invalidKey = THEME_PROFILE_KEYS.find((key) => !isValidHexColor(profile[key]));
      if (invalidKey) {
        setError("Custom theme colors must be valid hex values like #1d2021.");
        return;
      }
      const detectedPreset = detectThemePreset(profile);
      const requestedPreset = TERMINAL_THEME_MODE_SET.has(themeSelect.value) ? themeSelect.value : "custom";
      const nextPreset = requestedPreset === "custom" ? "custom" : detectedPreset === requestedPreset ? requestedPreset : "custom";
      sessionThemeDrafts.set(session.id, {
        preset: nextPreset,
        profile,
        category: normalizeThemeFilterCategory(String(themeCategory?.value || "all").toLowerCase()),
        search: String(themeSearch?.value || "")
      });
      applyThemeForSession(session.id);
      syncSessionThemeControls({ themeSelect, themeCategory, themeSearch, themeInputs, themeBg, themeFg }, session.id);
      uiState.error = "";
      try {
        const updated = await api.updateSession(session.id, {
          startCwd: startupDraft.startCwd,
          startCommand: startupDraft.startCommand,
          env: startupDraft.envResult.env,
          tags: startupDraft.tagResult.tags,
          themeProfile: profile
        });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        sessionThemeDrafts.delete(session.id);
        setSessionSendTerminator(session.id, startupDraft.sendTerminator);
        setStartupSettingsFeedback({ startFeedback }, "Settings saved.");
        setSettingsDirty(terminals.get(session.id), false);
      } catch {
        setError("Failed to save theme settings.");
        setStartupSettingsFeedback({ startFeedback }, "Failed to save settings.", true);
      }
    });
    settingsCancelBtn.addEventListener("click", () => {
      const freshSession = getSessionById(session.id);
      sessionThemeDrafts.delete(session.id);
      if (freshSession) {
        syncSessionStartupControls(
          { startCwdInput, startCommandInput, startEnvInput, sessionTagsInput, sessionSendTerminatorSelect },
          freshSession
        );
        syncSessionThemeControls({ themeSelect, themeCategory, themeSearch, themeInputs, themeBg, themeFg }, session.id);
      }
      applyThemeForSession(session.id);
      setStartupSettingsFeedback({ startFeedback }, "");
      setSettingsDirty(terminals.get(session.id), false);
    });

    node.classList.toggle("active", state.activeSessionId === session.id);
    setSessionCardVisibility(node, visibleSessionIds.has(session.id));
    const initialVisible = visibleSessionIds.has(session.id);

    const initialTheme = buildThemeFromConfig(getSessionThemeConfig(session.id));
    const terminal = new window.Terminal({
      convertEol: true,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontFamily: TERMINAL_FONT_FAMILY,
      cursorBlink: true,
      theme: initialTheme
    });
    debugLog("terminal.created", { sessionId: session.id });
    streamPluginEngine.ensureSession(session);

    gridEl.appendChild(node);
    terminal.open(mount);
    terminal.onData((data) => {
      store.setActiveSession(session.id);
      const latestSession = getSessionById(session.id);
      if (isSessionUnrestored(latestSession)) {
        setError(getUnrestoredSessionMessage(latestSession));
        return;
      }
      if (isSessionExited(latestSession)) {
        setError(getExitedSessionMessage(latestSession));
        return;
      }
      api.sendInput(session.id, data).catch(() => setError("Failed to send terminal input."));
    });

    terminals.set(session.id, {
      terminal,
      element: node,
      focusBtn,
      quickIdEl,
      stateBadgeEl,
      pluginBadgesEl,
      unrestoredHintEl,
      sessionStatusEl,
      sessionArtifactsEl,
      settingsDialog,
      startCwdInput,
      startCommandInput,
      startEnvInput,
      sessionSendTerminatorSelect,
      sessionTagsInput,
      startFeedback,
      tagListEl,
      settingsApplyBtn,
      settingsStatus,
      themeCategory,
      themeSearch,
      themeSelect,
      themeBg,
      themeFg,
      themeInputs,
      mount,
      settingsDirty: false,
      isVisible: initialVisible,
      pendingViewportSync: !initialVisible,
      followOnShow: true,
      searchRevision: 0
    });
    syncSessionStartupControls(terminals.get(session.id), session);
    syncSessionThemeControls(terminals.get(session.id), session.id);
    setSettingsDirty(terminals.get(session.id), false);
    if (startupPerf.firstTerminalMountedAtMs === null) {
      startupPerf.firstTerminalMountedAtMs = nowMs();
      maybeReportStartupPerf();
    }

    const observer = new ResizeObserver(() => {
      applyResizeForSession(session.id);
    });
    observer.observe(mount);
    terminalObservers.set(session.id, observer);

    applyResizeForSession(session.id);
    setTimeout(() => applyResizeForSession(session.id), 120);
    setTimeout(() => applyResizeForSession(session.id), 400);
    setTimeout(() => applyResizeForSession(session.id), 900);
    shouldRunResizePass = true;
  }

  syncActiveTerminalSearch({ preserveSelection: true });

  if (shouldRunResizePass) {
    scheduleGlobalResize();
    scheduleDeferredResizePasses();
  }
}

function appendTerminalChunk(sessionId, data, options = {}) {
  const entry = terminals.get(sessionId);
  if (!entry || typeof data !== "string" || data.length === 0) {
    return false;
  }
  if (entry.isVisible === false) {
    entry.pendingViewportSync = true;
  }
  const terminal = entry.terminal;
  terminal.write(data, () => {
    entry.searchRevision = (Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0) + 1;
    if (entry.isVisible !== false) {
      syncTerminalScrollArea(terminal);
    }
    refreshTerminalViewport(terminal);
    if (entry.isVisible !== false) {
      syncTerminalScrollArea(terminal);
    }
    if (store.getState().activeSessionId === sessionId && terminalSearchState.query) {
      syncActiveTerminalSearch({ preserveSelection: true });
    }
  });
  if (options.markActivity !== false) {
    markSessionActivity(sessionId);
  }
  return true;
}

function replaySnapshotOutputs(outputs, attempt = 0) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return;
  }

  let missing = 0;
  for (const entry of outputs) {
    if (!entry || typeof entry.sessionId !== "string" || typeof entry.data !== "string" || entry.data.length === 0) {
      continue;
    }
    if (!terminals.has(entry.sessionId)) {
      missing += 1;
      continue;
    }
    appendTerminalChunk(entry.sessionId, entry.data, { markActivity: false });
  }

  if (missing > 0 && attempt < 4) {
    setTimeout(() => replaySnapshotOutputs(outputs, attempt + 1), 80);
  }
}

function upsertSession(nextSession) {
  store.upsertSession(nextSession);
}

function markSessionExited(sessionId, exitDetails = {}) {
  const session = getSessionById(sessionId);
  if (!session) {
    return;
  }
  store.markSessionExited(sessionId, {
    exitCode: exitDetails.exitCode,
    signal: exitDetails.signal,
    exitedAt: Date.now(),
    updatedAt: Date.now()
  });
  streamAdapter.disposeSession(sessionId);
  store.clearSessionActivity(sessionId);
  const nextSession = getSessionById(sessionId);
  if (store.getState().activeSessionId === sessionId) {
    setCommandFeedback(getExitedSessionMessage(nextSession));
  }
}

function removeSession(sessionId) {
  store.removeSession(sessionId);
}

function markSessionClosed(sessionId) {
  store.markSessionClosed(sessionId);
}

function applyRuntimeSnapshot(event) {
  if (Array.isArray(event.decks)) {
    setDecks(event.decks, { preferredActiveDeckId: store.getState().activeDeckId });
  }
  replaceCustomCommandState(event.customCommands || []);
  store.setSessions(event.sessions || []);
  replaySnapshotOutputs(event.outputs);
  scheduleCommandPreview();
  scheduleCommandSuggestions();
  uiState.error = "";
  markRuntimeBootstrapReady("ws");
}

function applyRuntimeEvent(event, options = {}) {
  if (!event || typeof event !== "object") {
    return false;
  }

  switch (event.type) {
    case "snapshot":
      applyRuntimeSnapshot(event);
      return true;
    case "session.created":
    case "session.updated":
      if (event.session) {
        upsertSession(event.session);
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    case "session.exit":
      if (event.sessionId) {
        markSessionExited(event.sessionId, event);
        uiState.error = "";
        return true;
      }
      return false;
    case "session.activity.completed":
      if (event.session) {
        upsertSession(event.session);
        activityCompletionNotifier.queueCompletion(event.session, event.activityCompletedAt);
        uiState.error = "";
        return true;
      }
      if (event.sessionId) {
        const session = getSessionById(event.sessionId);
        if (session) {
          activityCompletionNotifier.queueCompletion(session, event.activityCompletedAt);
          uiState.error = "";
          return true;
        }
      }
      return false;
    case "session.closed":
      if (event.sessionId) {
        markSessionClosed(event.sessionId);
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    case "deck.created":
    case "deck.updated":
      if (event.deck) {
        upsertDeckInState(event.deck, {
          preferredActiveDeckId: options.preferredActiveDeckId || store.getState().activeDeckId
        });
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    case "deck.deleted":
      if (event.deckId) {
        removeDeckFromState(event.deckId, {
          preferredActiveDeckId: options.preferredActiveDeckId,
          fallbackDeckId: event.fallbackDeckId || DEFAULT_DECK_ID
        });
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    case "custom-command.created":
    case "custom-command.updated":
      if (event.command) {
        upsertCustomCommandState(event.command);
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    case "custom-command.deleted":
      if (event.command) {
        removeCustomCommandState(event.command.name);
        scheduleCommandPreview();
        scheduleCommandSuggestions();
        uiState.error = "";
        return true;
      }
      return false;
    default:
      return false;
  }
}

function formatSessionDisplayName(session) {
  return sessionViewModel.formatSessionDisplayName(session);
}

function formatSessionToken(sessionId) {
  return sessionQuickIds.get(sessionId) || ensureQuickId(sessionId);
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

sessionCardMetaController = createSessionCardMetaController({
  normalizeSessionTags,
  onTick: () => render(),
  windowRef: window
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
  if (bootstrapPromise) {
    return bootstrapPromise;
  }
  startupPerf.bootstrapRequestCount += 1;
  debugLog("sessions.bootstrap.request", {
    bootstrapRequestCount: startupPerf.bootstrapRequestCount
  });
  bootstrapPromise = (async () => {
    try {
      debugLog("runtime.bootstrap.start");
      const [decksResult, sessionsResult] = await Promise.allSettled([api.listDecks(), api.listSessions()]);

      if (runtimeBootstrapSource === "ws") {
        debugLog("runtime.bootstrap.skipped", { reason: "ws_snapshot_already_applied" });
        return;
      }

      let hasError = false;
      if (decksResult.status === "fulfilled") {
        setDecks(decksResult.value, { preferredActiveDeckId: store.getState().activeDeckId });
      } else {
        hasError = true;
        debugLog("decks.bootstrap.error", {
          message: decksResult.reason instanceof Error ? decksResult.reason.message : String(decksResult.reason)
        });
        setDecks(
          [
            {
              id: DEFAULT_DECK_ID,
              name: "Default",
              settings: {
                terminal: {
                  cols: terminalSettings.cols,
                  rows: terminalSettings.rows
                }
              }
            }
          ],
          { preferredActiveDeckId: DEFAULT_DECK_ID }
        );
      }

      if (sessionsResult.status === "fulfilled") {
        store.setSessions(sessionsResult.value || []);
      } else {
        hasError = true;
        debugLog("sessions.bootstrap.error", {
          message: sessionsResult.reason instanceof Error ? sessionsResult.reason.message : String(sessionsResult.reason)
        });
      }

      uiState.error = hasError ? "Failed to fully load runtime state." : "";
      debugLog("runtime.bootstrap.ok", {
        decksLoaded: decksResult.status === "fulfilled",
        sessionsLoaded: sessionsResult.status === "fulfilled",
        sessionCount: sessionsResult.status === "fulfilled" ? sessionsResult.value.length : 0
      });
      markRuntimeBootstrapReady("rest");
    } catch (err) {
      debugLog("runtime.bootstrap.error", {
        message: err instanceof Error ? err.message : String(err)
      });
      uiState.error = "Failed to load runtime state.";
      markRuntimeBootstrapReady("rest");
    } finally {
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

function clearAuthRefreshTimer() {
  if (authRefreshTimer !== null) {
    clearTimeout(authRefreshTimer);
    authRefreshTimer = null;
  }
}

function scheduleDevAuthRefreshDelay(delayMs) {
  clearAuthRefreshTimer();
  const normalizedDelay = Math.max(DEV_AUTH_REFRESH_MIN_DELAY_MS, Math.floor(Number(delayMs) || 0));
  authRefreshTimer = setTimeout(() => {
    bootstrapDevAuthToken({ reason: "scheduled-refresh" }).catch(() => {});
  }, normalizedDelay);
}

function scheduleDevAuthRefresh(expiresInSeconds) {
  const seconds = Number(expiresInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0 || !wsAuthToken) {
    clearAuthRefreshTimer();
    return;
  }
  const ttlMs = Math.max(1_000, Math.floor(seconds * 1_000));
  const now = Date.now();
  wsAuthTokenExpiresAtMs = now + ttlMs;
  scheduleDevAuthRefreshDelay(ttlMs - DEV_AUTH_REFRESH_SAFETY_MS);
}

async function bootstrapDevAuthToken(options = {}) {
  if (devAuthRefreshPromise) {
    return devAuthRefreshPromise;
  }
  const reason = typeof options.reason === "string" && options.reason ? options.reason : "bootstrap";
  devAuthRefreshPromise = (async () => {
    try {
      const payload = await api.createDevToken();
      if (payload && typeof payload.accessToken === "string" && payload.accessToken.trim()) {
        wsAuthToken = payload.accessToken.trim();
        api.setAuthToken(wsAuthToken);
        scheduleDevAuthRefresh(payload.expiresIn);
        debugLog("auth.dev_token.ok", {
          reason,
          expiresIn: payload.expiresIn || 0,
          scope: payload.scope || "",
          refreshAtMs: wsAuthTokenExpiresAtMs
        });
        return true;
      }
    } catch (err) {
      const status = err && typeof err.status === "number" ? err.status : 0;
      if (status === 404 || status === 405) {
        clearAuthRefreshTimer();
        wsAuthTokenExpiresAtMs = 0;
        debugLog("auth.dev_token.unavailable", { reason });
        return false;
      }
      scheduleDevAuthRefreshDelay(DEV_AUTH_RETRY_DELAY_MS);
      debugLog("auth.dev_token.error", {
        reason,
        status,
        message: err instanceof Error ? err.message : String(err)
      });
      return false;
    } finally {
      devAuthRefreshPromise = null;
    }
    scheduleDevAuthRefreshDelay(DEV_AUTH_RETRY_DELAY_MS);
    return false;
  })();
  return devAuthRefreshPromise;
}

function startWs() {
  wsClient = createWsClient(config.wsUrl, {
    onState(status) {
      debugLog("ws.state", { status });
      store.setConnectionState(status);
      if (status === "connected" && runtimeBootstrapSource !== "pending") {
        uiState.loading = false;
        uiState.error = "";
        render();
      }
    },
    onMessage(event) {
      debugLog("ws.event", { type: event.type, sessionId: event.sessionId || null });
      if (event.type === "session.data" && terminals.has(event.sessionId)) {
        streamAdapter.push(event.sessionId, event.data);
        return;
      }

      applyRuntimeEvent(event);
    }
  }, {
    debug: debugLogs,
    log: debugLog,
    protocolsProvider: async () => {
      if (!wsAuthToken) {
        return ["ptydeck.v1"];
      }
      let payload;
      try {
        payload = await api.createWsTicket();
      } catch (err) {
        const status = err && typeof err.status === "number" ? err.status : 0;
        if (status === 401) {
          const refreshed = await bootstrapDevAuthToken({ reason: "ws-ticket-401" });
          if (!refreshed) {
            throw err;
          }
          payload = await api.createWsTicket();
        } else {
          throw err;
        }
      }
      const ticket = payload && typeof payload.ticket === "string" ? payload.ticket.trim() : "";
      if (!ticket) {
        throw new Error("WebSocket ticket response did not include a ticket.");
      }
      return ["ptydeck.v1", `ptydeck.auth.${ticket}`];
    }
  });
}

store.subscribe(render);
syncSettingsUi();
syncTerminalGeometryCss();
render();

async function initializeRuntime() {
  await bootstrapDevAuthToken();
  startWs();
  scheduleBootstrapFallback();
}

initializeRuntime().catch(() => {
  setError("Failed to initialize application runtime.");
});

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
if (terminalSearchInputEl) {
  terminalSearchInputEl.addEventListener("input", () => {
    terminalSearchState.query = terminalSearchInputEl.value || "";
    syncActiveTerminalSearch({ preserveSelection: false });
  });
  terminalSearchInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      navigateActiveTerminalSearch(event.shiftKey ? "previous" : "next");
    }
    if (event.key === "Escape") {
      event.preventDefault();
      terminalSearchState.query = "";
      if (terminalSearchInputEl) {
        terminalSearchInputEl.value = "";
      }
      syncActiveTerminalSearch({ preserveSelection: false });
    }
  });
}
if (terminalSearchPrevBtn) {
  terminalSearchPrevBtn.addEventListener("click", () => navigateActiveTerminalSearch("previous"));
}
if (terminalSearchNextBtn) {
  terminalSearchNextBtn.addEventListener("click", () => navigateActiveTerminalSearch("next"));
}
if (terminalSearchClearBtn) {
  terminalSearchClearBtn.addEventListener("click", () => {
    terminalSearchState.query = "";
    if (terminalSearchInputEl) {
      terminalSearchInputEl.value = "";
    }
    syncActiveTerminalSearch({ preserveSelection: false });
  });
}
async function submitCommand() {
  resetCommandAutocompleteState();
  const command = commandInput.value;
  if (!command.trim()) {
    return;
  }

  const interpreted = interpretComposerInput(command);
  if (interpreted.kind === "quick-switch") {
    const state = store.getState();
    const resolved = resolveQuickSwitchTarget(interpreted.selector, state.sessions);
    if (resolved.error) {
      setCommandFeedback(resolved.error);
      return;
    }
    const result =
      resolved.kind === "session" ? activateSessionTarget(resolved.target) : activateDeckTarget(resolved.target);
    setCommandFeedback(result.message);
    commandInput.value = "";
    setCommandPreview("");
    clearCommandSuggestions();
    render();
    return;
  }

  if (interpreted.kind === "control") {
    debugLog("command.control.start", {
      command: interpreted.command,
      argsCount: interpreted.args.length
    });
    try {
      const feedback = await executeControlCommand(interpreted);
      setCommandFeedback(feedback);
      recordSlashHistory(command);
      debugLog("command.control.ok", { command: interpreted.command });
      commandInput.value = "";
      setCommandPreview("");
      clearCommandSuggestions();
      resetSlashHistoryNavigationState();
      render();
    } catch (err) {
      setCommandFeedback(getErrorMessage(err, "Failed to execute control command."));
    }
    return;
  }

  const state = store.getState();
  const sessions = state.sessions;
  const directRouting = parseDirectTargetRoutingInput(interpreted.data);

  let targetSessionId = state.activeSessionId;
  let targetSessions = [];
  let targetPayload = interpreted.data;
  let routeFeedback = "";

  if (directRouting.matched) {
    const resolvedTargets = resolveTargetSelectors(directRouting.targetToken, sessions, {
      source: "direct-route",
      scopeMode: "active-deck",
      activeDeckId: getActiveDeck()?.id || ""
    });
    if (resolvedTargets.error) {
      setCommandFeedback(resolvedTargets.error);
      return;
    }
    targetSessions = resolvedTargets.sessions;
    targetSessionId = targetSessions[0]?.id || "";
    targetPayload = directRouting.payload;
    if (targetSessions.length === 1) {
      routeFeedback = `Sent to [${formatSessionToken(targetSessions[0].id)}] ${formatSessionDisplayName(targetSessions[0])}.`;
    } else {
      routeFeedback = `Sent to ${targetSessions.length} sessions.`;
    }
  }

  if (!targetSessionId) {
    return;
  }
  if (!directRouting.matched) {
    const activeSession = sessions.find((session) => session.id === targetSessionId) || null;
    if (isSessionActionBlocked(activeSession)) {
      setCommandFeedback(getBlockedSessionActionMessage([activeSession], "Command send"));
      return;
    }
  }

  try {
    if (directRouting.matched && targetSessions.length > 0) {
      const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
      if (blockedSessions.length > 0) {
        setCommandFeedback(getBlockedSessionActionMessage(blockedSessions, "Command send"));
        return;
      }
      await Promise.all(
        targetSessions.map((session) => {
          const terminatorMode = getSessionSendTerminator(session.id);
          debugLog("command.send.start", {
            activeSessionId: session.id,
            mode: terminatorMode,
            directRoute: directRouting.matched
          });
          return sendInputWithConfiguredTerminator(api.sendInput.bind(api), session.id, targetPayload, terminatorMode, {
            normalizeMode: normalizeSendTerminatorMode,
            delayedSubmitMs: DELAYED_SUBMIT_MS
          });
        })
      );
    } else {
      const terminatorMode = getSessionSendTerminator(targetSessionId);
      debugLog("command.send.start", {
        activeSessionId: targetSessionId,
        mode: terminatorMode,
        directRoute: directRouting.matched
      });
      await sendInputWithConfiguredTerminator(api.sendInput.bind(api), targetSessionId, targetPayload, terminatorMode, {
        normalizeMode: normalizeSendTerminatorMode,
        delayedSubmitMs: DELAYED_SUBMIT_MS
      });
    }
    commandInput.value = "";
    setCommandPreview("");
    clearCommandSuggestions();
    uiState.error = "";
    if (routeFeedback) {
      setCommandFeedback(routeFeedback);
    }
    resetSlashHistoryNavigationState();
    debugLog("command.send.ok", { activeSessionId: targetSessionId, directRoute: directRouting.matched });
    render();
  } catch {
    setError("Failed to send command.");
  }
}

async function refreshCommandPreview() {
  const rawInput = commandInput.value || "";
  const interpreted = interpretComposerInput(rawInput);
  if (interpreted.kind === "quick-switch") {
    const preview = formatQuickSwitchPreview(interpreted.selector, store.getState().sessions);
    setCommandPreview(preview);
    return;
  }
  if (interpreted.kind !== "control") {
    setCommandPreview("");
    return;
  }

  const commandRaw = interpreted.command;
  const command = commandRaw.toLowerCase();
  if (!commandRaw || command === "custom" || command === "help") {
    setCommandPreview("");
    return;
  }

  if (interpreted.args.length > 1) {
    setCommandPreview("");
    return;
  }

  const custom = getCustomCommandState(commandRaw);
  if (custom) {
    setCommandPreview(custom.content || "");
    return;
  }
  setCommandPreview("");
}

function scheduleCommandPreview() {
  if (commandPreviewTimer) {
    clearTimeout(commandPreviewTimer);
  }
  commandPreviewTimer = setTimeout(() => {
    commandPreviewTimer = null;
    refreshCommandPreview();
  }, 120);
}

commandSuggestionsController = createCommandSuggestionsController({
  commandInput,
  uiState,
  render,
  onSelectionApplied: scheduleCommandPreview,
  documentRef: document,
  windowRef: window
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

window.addEventListener("beforeunload", () => {
  activityCompletionNotifier.dispose();
  if (wsClient) {
    wsClient.close();
  }
  if (globalResizeTimer) {
    clearTimeout(globalResizeTimer);
  }
  if (deferredResizeTimer) {
    clearTimeout(deferredResizeTimer);
  }
  if (commandPreviewTimer) {
    clearTimeout(commandPreviewTimer);
  }
  if (commandSuggestionsTimer) {
    clearTimeout(commandSuggestionsTimer);
  }
  for (const timer of resizeTimers.values()) {
    clearTimeout(timer);
  }
  for (const observer of terminalObservers.values()) {
    observer.disconnect();
  }
  for (const entry of terminals.values()) {
    entry.terminal.dispose();
  }
});

window.addEventListener("resize", scheduleGlobalResize);
