import { createApiClient } from "./api-client.js";
import { interpretComposerInput } from "./command-interpreter.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";
import { resolveRuntimeConfig } from "./runtime-config.js";
import { ITERM2_THEME_LIBRARY } from "./theme-library.js";

const config = resolveRuntimeConfig(window);
const debugLogs = config.debugLogs === true;
const debugLog = (event, details = {}) => {
  if (!debugLogs) {
    return;
  }
  const timestamp = new Date().toISOString();
  console.debug(`[ptydeck][${timestamp}] ${event}`, details);
};
const api = createApiClient(config.apiBaseUrl, { debug: debugLogs, log: debugLog });
const store = createStore();

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

const terminals = new Map();
const terminalObservers = new Map();
const resizeTimers = new Map();
const terminalSizes = new Map();
const sessionQuickIds = new Map();
let globalResizeTimer = null;
let deferredResizeTimer = null;
let bootstrapPromise = null;
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
const SESSION_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_ENV_MAX_ENTRIES = 64;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_TAG_MAX_ENTRIES = 32;
const SESSION_TAG_MAX_LENGTH = 32;
const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 20;
const DEFAULT_DECK_ID = "default";
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
let deckState = {
  decks: [],
  activeDeckId: loadStoredActiveDeckId()
};
let sessionInputSettings = loadSessionInputSettings();
const sessionThemeDrafts = new Map();
let wsAuthToken = "";
let wsClient = null;
let commandAutocompleteState = null;
let commandAutocompleteRequestId = 0;
const slashCommandHistory = [];
let slashHistoryCursor = -1;
let slashHistoryDraft = "";
let recalledSlashCommand = "";
const uiState = {
  loading: true,
  error: "",
  sessionFilterText: "",
  commandFeedback: "",
  commandInlineHint: "",
  commandInlineHintPrefixPx: 0,
  commandPreview: "",
  commandSuggestions: "",
  commandSuggestionSelectedIndex: -1
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

uiState.sessionFilterText = loadStoredSessionFilterText();

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

function withSingleTrailingNewline(value, mode = "auto") {
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  const lineSeparator = mode === "lf" ? "\n" : "\r";
  const suffix =
    mode === "lf" ? "\n" : mode === "crlf" ? "\r\n" : mode === "cr2" ? "\r\r" : "\r";
  const body = normalizedLines.replace(/\n/g, lineSeparator);
  return `${body}${suffix}`;
}

function normalizePayloadWithoutTrailingNewline(value, mode = "auto") {
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  const lineSeparator = mode === "lf" ? "\n" : "\r";
  return normalizedLines.replace(/\n/g, lineSeparator);
}

async function sendInputWithConfiguredTerminator(sessionId, value, mode) {
  const normalizedMode = normalizeSendTerminatorMode(String(mode || "").toLowerCase());
  if (normalizedMode === "cr_delay") {
    const body = normalizePayloadWithoutTrailingNewline(value, "cr");
    if (body) {
      await api.sendInput(sessionId, body);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAYED_SUBMIT_MS));
    await api.sendInput(sessionId, "\r");
    return;
  }
  const payload = withSingleTrailingNewline(value, normalizedMode);
  await api.sendInput(sessionId, payload);
}

function countUnescapedSingleQuotes(line) {
  let count = 0;
  let escaped = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'") {
      count += 1;
    }
  }
  return count;
}

function escapeUnescapedSingleQuotes(line) {
  let escaped = false;
  let result = "";
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      result += "\\'";
      continue;
    }
    result += char;
  }
  return result;
}

function normalizeCustomCommandPayloadForShell(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const normalized = lines.map((line) => {
    if (countUnescapedSingleQuotes(line) % 2 !== 0) {
      return escapeUnescapedSingleQuotes(line);
    }
    return line;
  });
  return normalized.join("\n");
}

function setCommandPreview(message) {
  uiState.commandPreview = message;
  render();
}

function resetCommandAutocompleteState() {
  commandAutocompleteState = null;
}

function setCommandSuggestions(replacePrefix, matches, index = 0) {
  if (!Array.isArray(matches) || matches.length === 0) {
    commandAutocompleteState = null;
    uiState.commandSuggestions = "";
    uiState.commandSuggestionSelectedIndex = -1;
    render();
    return;
  }
  const nextIndex = Math.min(Math.max(index, 0), matches.length - 1);
  commandAutocompleteState = {
    matches,
    index: nextIndex,
    replacePrefix
  };
  const lines = matches.map((entry, entryIndex) => {
    const full = `${replacePrefix}${entry}`;
    return `${entryIndex === nextIndex ? ">" : " "} ${full}`;
  });
  uiState.commandSuggestions = lines.join("\n");
  uiState.commandSuggestionSelectedIndex = nextIndex;
  render();
}

function clearCommandSuggestions() {
  commandAutocompleteState = null;
  uiState.commandSuggestions = "";
  uiState.commandSuggestionSelectedIndex = -1;
  uiState.commandInlineHint = "";
  uiState.commandInlineHintPrefixPx = 0;
}

let composerMeasureCanvas = null;

function measureComposerPrefixWidthPx(text) {
  if (!commandInput || typeof window.getComputedStyle !== "function") {
    return 0;
  }
  if (!composerMeasureCanvas && typeof document.createElement === "function") {
    composerMeasureCanvas = document.createElement("canvas");
  }
  if (!composerMeasureCanvas) {
    return 0;
  }
  const context = composerMeasureCanvas.getContext("2d");
  if (!context) {
    return 0;
  }
  const styles = window.getComputedStyle(commandInput);
  const fontStyle = styles.fontStyle || "normal";
  const fontWeight = styles.fontWeight || "400";
  const fontSize = styles.fontSize || "14px";
  const fontFamily = styles.fontFamily || "monospace";
  context.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  return Math.max(0, Math.round(context.measureText(String(text || "")).width));
}

function applyCommandSuggestionSelection(index) {
  if (
    !commandAutocompleteState ||
    !Array.isArray(commandAutocompleteState.matches) ||
    commandAutocompleteState.matches.length === 0
  ) {
    return false;
  }
  const nextIndex = Math.min(Math.max(index, 0), commandAutocompleteState.matches.length - 1);
  commandAutocompleteState.index = nextIndex;
  commandInput.value = `${commandAutocompleteState.replacePrefix}${commandAutocompleteState.matches[nextIndex]}`;
  const lines = commandAutocompleteState.matches.map((entry, entryIndex) => {
    const full = `${commandAutocompleteState.replacePrefix}${entry}`;
    return `${entryIndex === nextIndex ? ">" : " "} ${full}`;
  });
  uiState.commandSuggestions = lines.join("\n");
  uiState.commandSuggestionSelectedIndex = nextIndex;
  render();
  scheduleCommandPreview();
  return true;
}

function moveCommandSuggestion(delta) {
  if (
    !commandAutocompleteState ||
    !Array.isArray(commandAutocompleteState.matches) ||
    commandAutocompleteState.matches.length === 0
  ) {
    return false;
  }
  const length = commandAutocompleteState.matches.length;
  const current = Number.isInteger(commandAutocompleteState.index) ? commandAutocompleteState.index : 0;
  const nextIndex = (current + delta + length) % length;
  return applyCommandSuggestionSelection(nextIndex);
}

function acceptCommandSuggestion() {
  if (
    !commandAutocompleteState ||
    !Array.isArray(commandAutocompleteState.matches) ||
    commandAutocompleteState.matches.length === 0
  ) {
    return false;
  }
  return applyCommandSuggestionSelection(commandAutocompleteState.index);
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

function buildCommandAutocompleteCandidates(customCommands) {
  const ordered = [];
  const seen = new Set();

  for (const name of SYSTEM_SLASH_COMMANDS) {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  for (const entry of Array.isArray(customCommands) ? customCommands : []) {
    const normalized = String(entry?.name || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function buildCustomCommandNameList(customCommands) {
  const ordered = [];
  const seen = new Set();
  for (const entry of Array.isArray(customCommands) ? customCommands : []) {
    const normalized = String(entry?.name || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function pushUniqueCandidate(candidates, seen, value, prefix = "") {
  const token = String(value || "").trim();
  if (!token) {
    return;
  }
  const normalizedToken = token.toLowerCase();
  const normalizedPrefix = String(prefix || "").toLowerCase();
  if (normalizedPrefix && !normalizedToken.startsWith(normalizedPrefix)) {
    return;
  }
  if (seen.has(normalizedToken)) {
    return;
  }
  seen.add(normalizedToken);
  candidates.push(token);
}

function buildSessionAutocompleteCandidates(prefix = "", options = {}) {
  const sessions = Array.isArray(options.sessions) ? options.sessions : store.getState().sessions;
  const includeNamesWithWhitespace = options.includeNamesWithWhitespace === true;
  const candidates = [];
  const seen = new Set();
  for (const session of sessions) {
    pushUniqueCandidate(candidates, seen, formatSessionToken(session.id), prefix);
    const sessionName = String(session?.name || "").trim();
    if (sessionName && (includeNamesWithWhitespace || !/\s/.test(sessionName))) {
      pushUniqueCandidate(candidates, seen, sessionName, prefix);
    }
    pushUniqueCandidate(candidates, seen, session?.id, prefix);
  }
  return candidates;
}

function buildDeckAutocompleteCandidates(prefix = "", options = {}) {
  const candidates = [];
  const seen = new Set();
  const includeExplicitPrefix = options.includeExplicitPrefix === true;
  for (const deck of deckState.decks) {
    const id = String(deck?.id || "").trim();
    const name = String(deck?.name || "").trim();
    if (!id) {
      continue;
    }
    pushUniqueCandidate(candidates, seen, id, prefix);
    pushUniqueCandidate(candidates, seen, name, prefix);
    if (includeExplicitPrefix) {
      pushUniqueCandidate(candidates, seen, `deck:${id}`, prefix);
      pushUniqueCandidate(candidates, seen, `deck:${name}`, prefix);
    }
  }
  return candidates;
}

function resolveSlashAutocompleteContext(rawInput, customCommands) {
  const parsed = parseSlashInputForAutocomplete(rawInput);
  if (!parsed) {
    return null;
  }

  const afterSlash = parsed.afterSlash;
  const trailingSpace = /\s$/.test(afterSlash);
  const trimmed = afterSlash.trim();
  const customCandidates = buildCommandAutocompleteCandidates(customCommands);
  const customNames = buildCustomCommandNameList(customCommands);
  const customSet = new Set(customNames);

  if (!trimmed) {
    return {
      replacePrefix: "/",
      matches: customCandidates
    };
  }

  const hasWhitespace = /\s/.test(afterSlash);
  const parts = trimmed.split(/\s+/);
  const commandRaw = parts[0] || "";
  const command = commandRaw.toLowerCase();

  if (!hasWhitespace) {
    const matches = customCandidates.filter((name) => name.startsWith(command));
    return {
      replacePrefix: "/",
      matches
    };
  }

  if ((command === "switch" || command === "close" || command === "restart" || command === "rename" || command === "filter") && parts.length <= 2) {
    const targetPrefix = parts.length === 2 ? parts[1] : "";
    return {
      replacePrefix: `/${commandRaw} `,
      matches: buildSessionAutocompleteCandidates(targetPrefix)
    };
  }

  if (command === "custom" && (parts[1] === "show" || parts[1] === "remove") && parts.length <= 3) {
    const subcommand = parts[1];
    const namePrefix = parts.length === 3 ? parts[2].toLowerCase() : "";
    return {
      replacePrefix: `/custom ${subcommand} `,
      matches: customNames.filter((name) => name.startsWith(namePrefix))
    };
  }

  if (customSet.has(command) && (trailingSpace || parts.length === 2) && parts.length <= 2) {
    const targetPrefix = parts.length === 2 ? parts[1] : "";
    return {
      replacePrefix: `/${commandRaw} `,
      matches: buildSessionAutocompleteCandidates(targetPrefix)
    };
  }

  if (command === "deck" && parts.length <= 2) {
    const subcommands = ["list", "new", "rename", "switch", "delete"];
    const subPrefix = parts.length === 2 ? String(parts[1] || "").toLowerCase() : "";
    return {
      replacePrefix: "/deck ",
      matches: subcommands.filter((entry) => entry.startsWith(subPrefix))
    };
  }

  if (command === "deck" && (parts[1] === "switch" || parts[1] === "delete") && parts.length <= 3) {
    const deckPrefix = parts.length === 3 ? parts[2] : "";
    return {
      replacePrefix: `/deck ${parts[1]} `,
      matches: buildDeckAutocompleteCandidates(deckPrefix)
    };
  }

  if (command === "move") {
    if (parts.length <= 2) {
      const sessionPrefix = parts.length === 2 ? parts[1] : "";
      return {
        replacePrefix: "/move ",
        matches: buildSessionAutocompleteCandidates(sessionPrefix)
      };
    }
    if (parts.length === 3) {
      const deckPrefix = parts[2];
      return {
        replacePrefix: `/move ${parts[1]} `,
        matches: buildDeckAutocompleteCandidates(deckPrefix)
      };
    }
  }

  return null;
}

function resolveQuickSwitchAutocompleteContext(rawInput) {
  const parsed = parseQuickSwitchInputForAutocomplete(rawInput);
  if (!parsed) {
    return null;
  }

  const rawSelector = parsed.afterMarker;
  const selector = rawSelector.trim();
  if (!selector) {
    return {
      replacePrefix: ">",
      matches: [
        ...buildSessionAutocompleteCandidates("", { includeNamesWithWhitespace: true }),
        ...buildDeckAutocompleteCandidates("")
      ]
    };
  }

  const crossDeckIndex = selector.indexOf("::");
  if (crossDeckIndex >= 0) {
    const deckPrefix = selector.slice(0, crossDeckIndex).trim();
    const nestedPrefix = selector.slice(crossDeckIndex + 2).trim();
    if (!deckPrefix) {
      return {
        replacePrefix: ">",
        matches: buildDeckAutocompleteCandidates("")
      };
    }
    const resolvedDeck = resolveDeckToken(deckPrefix, deckState.decks);
    if (!resolvedDeck.deck) {
      return {
        replacePrefix: ">",
        matches: buildDeckAutocompleteCandidates(deckPrefix)
      };
    }
    const deckSessions = store
      .getState()
      .sessions.filter((session) => resolveSessionDeckId(session) === resolvedDeck.deck.id);
    return {
      replacePrefix: `>${selector.slice(0, crossDeckIndex + 2)}`,
      matches: buildSessionAutocompleteCandidates(nestedPrefix, {
        sessions: deckSessions,
        includeNamesWithWhitespace: true
      })
    };
  }

  if (selector.toLowerCase().startsWith("deck:")) {
    const deckPrefix = selector.slice("deck:".length);
    return {
      replacePrefix: ">deck:",
      matches: buildDeckAutocompleteCandidates(deckPrefix)
    };
  }

  const matches = [
    ...buildSessionAutocompleteCandidates(selector, { includeNamesWithWhitespace: true }),
    ...buildDeckAutocompleteCandidates(selector, { includeExplicitPrefix: true })
  ];
  return {
    replacePrefix: ">",
    matches
  };
}

function parseAutocompleteContext(rawInput, customCommands) {
  return resolveSlashAutocompleteContext(rawInput, customCommands) || resolveQuickSwitchAutocompleteContext(rawInput);
}

async function autocompleteComposerInput(reverse = false) {
  const rawInput = commandInput.value || "";
  const parsedSlash = parseSlashInputForAutocomplete(rawInput);
  const parsedQuickSwitch = parseQuickSwitchInputForAutocomplete(rawInput);
  if (!parsedSlash && !parsedQuickSwitch) {
    resetCommandAutocompleteState();
    return false;
  }

  const activeState = commandAutocompleteState;
  const canCycleExisting =
    activeState &&
    Array.isArray(activeState.matches) &&
    activeState.matches.length > 0 &&
    Number.isInteger(activeState.index) &&
    activeState.index >= 0 &&
    activeState.index < activeState.matches.length &&
    typeof activeState.replacePrefix === "string" &&
    commandInput.value === `${activeState.replacePrefix}${activeState.matches[activeState.index]}`;

  let matches = [];
  let replacePrefix = "/";
  let nextIndex = reverse ? -1 : 0;

  if (canCycleExisting) {
    matches = activeState.matches;
    replacePrefix = activeState.replacePrefix;
    const delta = reverse ? -1 : 1;
    nextIndex = (activeState.index + delta + matches.length) % matches.length;
  } else {
    const requestId = ++commandAutocompleteRequestId;
    let customCommands = [];
    try {
      customCommands = await api.listCustomCommands();
    } catch {
      customCommands = [];
    }
    if (requestId !== commandAutocompleteRequestId) {
      return true;
    }
    const context = parseAutocompleteContext(rawInput, customCommands);
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
  const requestId = ++commandSuggestionsRequestId;
  let customCommands = [];
  try {
    customCommands = await api.listCustomCommands();
  } catch {
    customCommands = [];
  }
  if (requestId !== commandSuggestionsRequestId) {
    return;
  }
  const context = parseAutocompleteContext(rawInput, customCommands);
  if (!context || !Array.isArray(context.matches) || context.matches.length === 0) {
    clearCommandSuggestions();
    render();
    return;
  }
  let index = 0;
  if (
    commandAutocompleteState &&
    commandAutocompleteState.replacePrefix === context.replacePrefix &&
    Array.isArray(commandAutocompleteState.matches) &&
    commandAutocompleteState.matches.length === context.matches.length &&
    commandAutocompleteState.matches.every((entry, entryIndex) => entry === context.matches[entryIndex])
  ) {
    index = Math.min(Math.max(commandAutocompleteState.index, 0), context.matches.length - 1);
  }
  const selected = context.matches[index] || "";
  const inputValue = commandInput.value || "";
  const prefix = context.replacePrefix || "";
  const tokenPrefix = inputValue.startsWith(prefix) ? inputValue.slice(prefix.length) : "";
  if (selected && tokenPrefix.length <= selected.length && selected.startsWith(tokenPrefix)) {
    uiState.commandInlineHint = selected.slice(tokenPrefix.length);
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
  return deckState.decks.find((deck) => deck.id === deckId) || null;
}

function getActiveDeck() {
  const preferred = getDeckById(deckState.activeDeckId);
  if (preferred) {
    return preferred;
  }
  if (deckState.decks.length > 0) {
    return deckState.decks[0];
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
  const sortedDecks = normalizedDecks.slice().sort((left, right) => left.name.localeCompare(right.name, "en-US"));
  const preferredActiveDeckId = String(options.preferredActiveDeckId || deckState.activeDeckId || "").trim();
  const nextActiveDeck =
    sortedDecks.find((deck) => deck.id === preferredActiveDeckId) ||
    sortedDecks.find((deck) => deck.id === DEFAULT_DECK_ID) ||
    sortedDecks[0] ||
    null;
  deckState = {
    decks: sortedDecks,
    activeDeckId: nextActiveDeck ? nextActiveDeck.id : ""
  };
  saveStoredActiveDeckId(deckState.activeDeckId);
  syncActiveDeckGeometryFromState();
  render();
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
  const deckId = String(session?.deckId || "").trim();
  return deckId || DEFAULT_DECK_ID;
}

function getSessionRuntimeState(session) {
  const state = String(session?.state || "").trim().toLowerCase();
  if (state === "unrestored" || state === "exited") {
    return state;
  }
  return "active";
}

function isSessionUnrestored(session) {
  return getSessionRuntimeState(session) === "unrestored";
}

function isSessionExited(session) {
  return getSessionRuntimeState(session) === "exited";
}

function isSessionActionBlocked(session) {
  return isSessionUnrestored(session) || isSessionExited(session);
}

function getSessionStateBadgeText(session) {
  if (isSessionUnrestored(session)) {
    return "UNRESTORED";
  }
  if (isSessionExited(session)) {
    return "EXITED";
  }
  return "";
}

function getExitedSessionStatusSuffix(session) {
  const details = [];
  if (Number.isInteger(session?.exitCode)) {
    details.push(`exit code ${session.exitCode}`);
  }
  const signal = String(session?.exitSignal || "").trim();
  if (signal) {
    details.push(`signal ${signal}`);
  }
  return details.length > 0 ? ` (${details.join(", ")})` : "";
}

function getSessionStateHintText(session) {
  if (isSessionUnrestored(session)) {
    return "Session could not be restored after backend restart. Update settings or delete this session.";
  }
  if (isSessionExited(session)) {
    return `Session process exited${getExitedSessionStatusSuffix(session)}. Rename, restart, input, resize, and settings changes are disabled. Delete this session to remove the card.`;
  }
  return "";
}

function getUnrestoredSessionMessage(session) {
  const label = `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
  return `Session ${label} is unrestored after backend restart. Input, resize, and restart are disabled.`;
}

function getExitedSessionMessage(session) {
  const label = `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
  return `Session ${label} has exited${getExitedSessionStatusSuffix(session)}. Rename, restart, input, resize, and settings changes are disabled. Delete this session to remove the card.`;
}

function getBlockedSessionActionMessage(sessions, actionLabel) {
  const labels = sessions.map((session) => `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`);
  if (labels.length === 1) {
    return `${actionLabel} blocked for ${getSessionRuntimeState(sessions[0])} session ${labels[0]}.`;
  }
  const annotatedLabels = sessions.map(
    (session) => `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} [${getSessionRuntimeState(session)}]`
  );
  return `${actionLabel} blocked for non-interactive sessions: ${annotatedLabels.join(", ")}.`;
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
  if (!env || typeof env !== "object") {
    return "";
  }
  return Object.entries(env)
    .filter(([key, value]) => typeof key === "string" && typeof value === "string")
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function normalizeSessionTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const dedupe = new Set();
  for (const rawTag of tags) {
    if (typeof rawTag !== "string") {
      continue;
    }
    const normalized = rawTag.trim().toLowerCase();
    if (!normalized || normalized.length > SESSION_TAG_MAX_LENGTH || !SESSION_TAG_PATTERN.test(normalized)) {
      continue;
    }
    dedupe.add(normalized);
    if (dedupe.size >= SESSION_TAG_MAX_ENTRIES) {
      break;
    }
  }
  return Array.from(dedupe).sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }));
}

function formatSessionTags(tags) {
  return normalizeSessionTags(tags).join(", ");
}

function parseSessionTags(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) {
    return { ok: true, tags: [] };
  }
  const parts = raw
    .split(/[\s,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length > SESSION_TAG_MAX_ENTRIES) {
    return {
      ok: false,
      error: `Tag list exceeds maximum entries (${SESSION_TAG_MAX_ENTRIES}).`
    };
  }
  const dedupe = new Set();
  for (const rawTag of parts) {
    const normalized = rawTag.toLowerCase();
    if (
      !normalized ||
      normalized.length > SESSION_TAG_MAX_LENGTH ||
      !SESSION_TAG_PATTERN.test(normalized)
    ) {
      return {
        ok: false,
        error: `Invalid tag '${rawTag}'. Tags must match ${SESSION_TAG_PATTERN} and be <= ${SESSION_TAG_MAX_LENGTH} chars.`
      };
    }
    dedupe.add(normalized);
  }
  return {
    ok: true,
    tags: Array.from(dedupe).sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }))
  };
}

function parseSessionEnv(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > SESSION_ENV_MAX_ENTRIES) {
    return {
      ok: false,
      error: `Environment variable list exceeds maximum entries (${SESSION_ENV_MAX_ENTRIES}).`
    };
  }
  const env = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return { ok: false, error: `Invalid env line '${line}'. Expected KEY=VALUE.` };
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (!SESSION_ENV_KEY_PATTERN.test(key)) {
      return { ok: false, error: `Invalid env variable name '${key}'.` };
    }
    env[key] = value;
  }
  return { ok: true, env };
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

function isTerminalAtBottom(terminal) {
  if (!terminal || !terminal.buffer || !terminal.buffer.active) {
    return true;
  }
  const active = terminal.buffer.active;
  return Number(active.baseY) === Number(active.ydisp);
}

function syncTerminalViewportAfterShow(sessionId, entry) {
  if (!entry || !entry.terminal) {
    return;
  }
  const shouldFollow = entry.followOnShow !== false;
  const runPass = () => {
    applyResizeForSession(sessionId, { force: true });
    if (typeof entry.terminal.refresh === "function") {
      const lastRow = Math.max(0, entry.terminal.rows - 1);
      entry.terminal.refresh(0, lastRow);
    }
    if (shouldFollow && typeof entry.terminal.scrollToBottom === "function") {
      entry.terminal.scrollToBottom();
    }
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
  const startCwd = typeof session?.startCwd === "string" && session.startCwd.trim() ? session.startCwd.trim() : String(session?.cwd || "");
  const startCommand = typeof session?.startCommand === "string" ? session.startCommand : "";
  const env = session?.env && typeof session.env === "object" ? session.env : {};
  const tags = normalizeSessionTags(session?.tags);
  return { startCwd, startCommand, env, tags };
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
  if (!entry?.settingsStatus) {
    return;
  }
  entry.settingsStatus.textContent = String(text || "");
  entry.settingsStatus.classList.toggle("dirty", kind === "dirty");
  entry.settingsStatus.classList.toggle("saved", kind === "saved");
}

function setSettingsDirty(entry, dirty) {
  if (!entry) {
    return;
  }
  entry.settingsDirty = Boolean(dirty);
  if (entry.settingsApplyBtn) {
    entry.settingsApplyBtn.disabled = !entry.settingsDirty;
  }
  if (entry.settingsDirty) {
    setSettingsStatus(entry, "Unsaved changes", "dirty");
  } else {
    setSettingsStatus(entry, "Saved", "saved");
  }
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
  if (!entry?.tagListEl) {
    return;
  }
  const tags = normalizeSessionTags(session?.tags);
  entry.tagListEl.textContent = tags.map((tag) => `#${tag}`).join(" ");
  entry.tagListEl.classList.toggle("empty", tags.length === 0);
}

function measureTerminalCellWidthPx() {
  if (!document || typeof document.createElement !== "function") {
    return 10;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return 10;
  }
  context.font = `${TERMINAL_FONT_SIZE}px ${TERMINAL_FONT_FAMILY}`;
  const metrics = context.measureText("W");
  return Math.max(7, Math.ceil(metrics.width));
}

function computeFixedMountHeightPx(rows) {
  const lineHeightPx = TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT;
  return Math.max(120, Math.round(rows * lineHeightPx + TERMINAL_MOUNT_VERTICAL_CHROME_PX));
}

function computeFixedCardWidthPx(cols) {
  const cellWidthPx = measureTerminalCellWidthPx();
  return Math.max(260, Math.round(cols * cellWidthPx + TERMINAL_CARD_HORIZONTAL_CHROME_PX));
}

function syncTerminalGeometryCss() {
  if (!document || !document.documentElement) {
    return;
  }
  const root = document.documentElement;
  const cardWidthPx = computeFixedCardWidthPx(terminalSettings.cols);
  const mountHeightPx = computeFixedMountHeightPx(terminalSettings.rows);
  root.style.setProperty("--ptydeck-terminal-card-width", `${cardWidthPx}px`);
  root.style.setProperty("--ptydeck-terminal-mount-height", `${mountHeightPx}px`);
  if (gridEl) {
    gridEl.classList.add("fixed-size");
  }
}

function syncSettingsUi() {
  if (settingsColsEl) {
    settingsColsEl.value = String(terminalSettings.cols);
  }
  if (settingsRowsEl) {
    settingsRowsEl.value = String(terminalSettings.rows);
  }
  const sidebarVisible = terminalSettings.sidebarVisible !== false;
  if (appShellEl && appShellEl.classList) {
    appShellEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
  }
  if (sidebarToggleBtn) {
    sidebarToggleBtn.setAttribute("aria-label", "Collapse sidebar");
    sidebarToggleBtn.setAttribute("title", "Collapse sidebar");
    sidebarToggleBtn.setAttribute("aria-expanded", sidebarVisible ? "true" : "false");
    sidebarToggleBtn.hidden = !sidebarVisible;
  }
  if (sidebarToggleIcon) {
    sidebarToggleIcon.textContent = "⮜";
  }
  if (sidebarLauncherBtn) {
    sidebarLauncherBtn.setAttribute("aria-label", "Expand sidebar");
    sidebarLauncherBtn.setAttribute("title", "Expand sidebar");
    sidebarLauncherBtn.setAttribute("aria-expanded", sidebarVisible ? "true" : "false");
    sidebarLauncherBtn.hidden = sidebarVisible;
  }
  syncTerminalGeometryCss();
}

function readSettingsFromUi() {
  return {
    cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
    rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120),
    sidebarVisible: terminalSettings.sidebarVisible !== false
  };
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
  deckState = {
    ...deckState,
    decks: deckState.decks.map((deck) => (deck.id === updatedDeck.id ? normalizeDeckEntry(updatedDeck) : deck))
  };
  terminalSettings = {
    ...terminalSettings,
    cols: nextCols,
    rows: nextRows
  };
  saveTerminalSettings();
  syncSettingsUi();
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
  const runtimeCellHeightPx = Number(entry?.terminal?._core?._renderService?.dimensions?.css?.cell?.height) || 0;
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

function getSessionCountForDeck(deckId, sessions) {
  return sessions.reduce((count, session) => (resolveSessionDeckId(session) === deckId ? count + 1 : count), 0);
}

function renderDeckTabs(sessions) {
  if (!deckTabsEl || typeof document.createElement !== "function") {
    return;
  }
  while (deckTabsEl.firstChild) {
    deckTabsEl.removeChild(deckTabsEl.firstChild);
  }
  if (!Array.isArray(deckState.decks) || deckState.decks.length === 0) {
    const hint = document.createElement("span");
    hint.className = "deck-tab deck-tab-empty";
    hint.textContent = "No decks";
    deckTabsEl.appendChild(hint);
    return;
  }
  for (const deck of deckState.decks) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "deck-tab";
    if (deck.id === deckState.activeDeckId) {
      tab.classList.add("active");
    }
    tab.setAttribute("data-deck-id", deck.id);
    const count = getSessionCountForDeck(deck.id, sessions);
    const nameEl = document.createElement("span");
    nameEl.className = "deck-tab-name";
    nameEl.textContent = deck.name;
    const countEl = document.createElement("span");
    countEl.className = "deck-tab-count";
    countEl.textContent = String(count);
    tab.appendChild(nameEl);
    tab.appendChild(countEl);
    tab.addEventListener("click", () => setActiveDeck(deck.id));
    deckTabsEl.appendChild(tab);
  }
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
  if (deckState.activeDeckId === normalized) {
    return true;
  }
  deckState = {
    ...deckState,
    activeDeckId: normalized
  };
  saveStoredActiveDeckId(normalized);
  const state = store.getState();
  const activeInDeck =
    state.activeSessionId &&
    state.sessions.some((session) => session.id === state.activeSessionId && resolveSessionDeckId(session) === normalized);
  if (!activeInDeck) {
    const firstInDeck = state.sessions.find((session) => resolveSessionDeckId(session) === normalized) || null;
    store.setActiveSession(firstInDeck ? firstInDeck.id : null);
  }
  render();
  syncActiveDeckGeometryFromState();
  scheduleGlobalResize({ deckId: normalized, force: true });
  scheduleDeferredResizePasses({ deckId: normalized, force: true });
  return true;
}

async function reloadDecks(options = {}) {
  const decks = await api.listDecks();
  setDecks(decks, options);
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
  await reloadDecks({ preferredActiveDeckId: created.id });
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
  await reloadDecks({ preferredActiveDeckId: updated.id });
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
  const fallbackId = deckState.decks.find((deck) => deck.id !== activeDeck.id)?.id || DEFAULT_DECK_ID;
  await reloadDecks({ preferredActiveDeckId: fallbackId });
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
  const hasDecks = deckState.decks.length > 0;
  if (deckRenameBtn) {
    deckRenameBtn.disabled = !hasDecks;
  }
  if (deckDeleteBtn) {
    deckDeleteBtn.disabled = !activeDeck || activeDeck.id === DEFAULT_DECK_ID;
  }
  const filtered = resolveFilterSelectors(uiState.sessionFilterText, deckSessions);
  const visibleSessionIds = new Set(
    filtered.sessions.map((session) => session.id)
  );
  const filterActive = Boolean(String(uiState.sessionFilterText || "").trim());
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
      const timer = resizeTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
      }
      resizeTimers.delete(sessionId);
      terminalSizes.delete(sessionId);
      sessionThemeDrafts.delete(sessionId);
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
    const unrestoredHintEl = node.querySelector(".session-unrestored-hint");
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
    if (stateBadgeEl) {
      stateBadgeEl.hidden = !stateBadgeText;
      stateBadgeEl.textContent = stateBadgeText;
    }
    if (unrestoredHintEl) {
      unrestoredHintEl.hidden = !stateHintText;
      unrestoredHintEl.textContent = stateHintText;
    }
    renderSessionTagList({ tagListEl }, session);
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
        upsertSession(updated);
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
        removeSession(session.id);
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
        upsertSession(updated);
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
      unrestoredHintEl,
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
      followOnShow: true
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

  if (shouldRunResizePass) {
    scheduleGlobalResize();
    scheduleDeferredResizePasses();
  }
}

function appendTerminalData(sessionId, data) {
  const entry = terminals.get(sessionId);
  if (!entry || typeof data !== "string" || data.length === 0) {
    return false;
  }
  if (entry.isVisible === false) {
    entry.pendingViewportSync = true;
  }
  const terminal = entry.terminal;
  terminal.write(data, () => {
    if (typeof terminal.refresh === "function") {
      const lastRow = Math.max(0, terminal.rows - 1);
      terminal.refresh(0, lastRow);
    }
  });
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
    appendTerminalData(entry.sessionId, entry.data);
  }

  if (missing > 0 && attempt < 4) {
    setTimeout(() => replaySnapshotOutputs(outputs, attempt + 1), 80);
  }
}

function upsertSession(nextSession) {
  const currentSessions = store.getState().sessions;
  const nextSessions = currentSessions.slice();
  const index = nextSessions.findIndex((entry) => entry.id === nextSession.id);
  if (index >= 0) {
    const merged = { ...nextSessions[index], ...nextSession };
    if (getSessionRuntimeState(nextSession) === "active") {
      delete merged.exitCode;
      delete merged.exitSignal;
      delete merged.exitedAt;
    }
    nextSessions[index] = merged;
  } else {
    nextSessions.push(nextSession);
  }
  store.setSessions(nextSessions);
}

function markSessionExited(sessionId, exitDetails = {}) {
  const session = getSessionById(sessionId);
  if (!session) {
    return;
  }
  const nextSession = {
    ...session,
    state: "exited",
    exitCode: Number.isInteger(exitDetails.exitCode) ? exitDetails.exitCode : null,
    exitSignal: typeof exitDetails.signal === "string" ? exitDetails.signal : "",
    exitedAt: Date.now(),
    updatedAt: Date.now()
  };
  upsertSession(nextSession);
  if (store.getState().activeSessionId === sessionId) {
    setCommandFeedback(getExitedSessionMessage(nextSession));
  }
}

function removeSession(sessionId) {
  const currentSessions = store.getState().sessions;
  const nextSessions = currentSessions.filter((entry) => entry.id !== sessionId);
  store.setSessions(nextSessions);
}

function formatSessionDisplayName(session) {
  return session.name || session.id.slice(0, 8);
}

function formatSessionToken(sessionId) {
  return sessionQuickIds.get(sessionId) || ensureQuickId(sessionId);
}

function resolveSessionToken(token, sessions) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return { session: null, error: "Missing session identifier." };
  }

  const exactId = sessions.find((session) => session.id === normalized);
  if (exactId) {
    return { session: exactId, error: "" };
  }

  const normalizedUpper = normalized.toUpperCase();
  const quickIdMatches = sessions.filter((session) => formatSessionToken(session.id).toUpperCase() === normalizedUpper);
  if (quickIdMatches.length === 1) {
    return { session: quickIdMatches[0], error: "" };
  }
  if (quickIdMatches.length > 1) {
    return { session: null, error: `Ambiguous session identifier: ${normalized}` };
  }

  const lower = normalized.toLowerCase();
  const exactNameMatches = sessions.filter((session) => typeof session.name === "string" && session.name.toLowerCase() === lower);
  if (exactNameMatches.length === 1) {
    return { session: exactNameMatches[0], error: "" };
  }
  if (exactNameMatches.length > 1) {
    return { session: null, error: `Ambiguous session identifier: ${normalized}` };
  }

  const prefixMatches = sessions.filter((session) => session.id.startsWith(normalized));
  if (prefixMatches.length === 1) {
    return { session: prefixMatches[0], error: "" };
  }
  if (prefixMatches.length > 1) {
    return { session: null, error: `Ambiguous session identifier: ${normalized}` };
  }

  return { session: null, error: `Unknown session identifier: ${normalized}` };
}

function resolveDeckToken(token, decks) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return { deck: null, error: "Missing deck identifier." };
  }

  const exactId = decks.find((deck) => deck.id === normalized) || null;
  if (exactId) {
    return { deck: exactId, error: "" };
  }

  const lower = normalized.toLowerCase();
  const exactNameMatches = decks.filter((deck) => String(deck?.name || "").toLowerCase() === lower);
  if (exactNameMatches.length === 1) {
    return { deck: exactNameMatches[0], error: "" };
  }
  if (exactNameMatches.length > 1) {
    return { deck: null, error: `Ambiguous deck identifier: ${normalized}` };
  }

  const prefixMatches = decks.filter((deck) => String(deck?.id || "").startsWith(normalized));
  if (prefixMatches.length === 1) {
    return { deck: prefixMatches[0], error: "" };
  }
  if (prefixMatches.length > 1) {
    return { deck: null, error: `Ambiguous deck identifier: ${normalized}` };
  }

  return { deck: null, error: `Unknown deck identifier: ${normalized}` };
}

function resolveSingleSessionSwitchTarget(selector, sessions) {
  const resolved = resolveSelectorMatches(selector, sessions, { source: "quick-switch" });
  if (resolved.error) {
    return { session: null, error: resolved.error, kind: "unknown" };
  }
  if (resolved.sessions.length === 1) {
    return { session: resolved.sessions[0], error: "", kind: "ok" };
  }
  if (resolved.sessions.length > 1) {
    return {
      session: null,
      error: "Quick-switch selector must resolve to exactly one session.",
      kind: "ambiguous"
    };
  }
  return { session: null, error: "Unknown session identifier.", kind: "unknown" };
}

function resolveQuickSwitchTarget(selectorText, sessions) {
  const selector = String(selectorText || "").trim();
  if (!selector) {
    return { kind: "", target: null, error: "Usage: >selector" };
  }

  if (selector.includes("::")) {
    const sessionResolved = resolveSingleSessionSwitchTarget(selector, sessions);
    if (sessionResolved.error) {
      return { kind: "", target: null, error: sessionResolved.error };
    }
    return { kind: "session", target: sessionResolved.session, error: "" };
  }

  if (selector.toLowerCase().startsWith("deck:")) {
    const deckResolved = resolveDeckToken(selector.slice("deck:".length), deckState.decks);
    if (!deckResolved.deck) {
      return { kind: "", target: null, error: deckResolved.error };
    }
    return { kind: "deck", target: deckResolved.deck, error: "" };
  }

  const sessionResolved = resolveSingleSessionSwitchTarget(selector, sessions);
  const deckResolved = resolveDeckToken(selector, deckState.decks);
  const hasSession = Boolean(sessionResolved.session);
  const hasDeck = Boolean(deckResolved.deck);

  if (hasSession && hasDeck) {
    return {
      kind: "",
      target: null,
      error: `Ambiguous quick-switch target: '${selector}' matches both a session and a deck. Use 'deck:${selector}' for the deck target.`
    };
  }
  if (hasSession) {
    return { kind: "session", target: sessionResolved.session, error: "" };
  }
  if (sessionResolved.kind === "ambiguous") {
    return { kind: "", target: null, error: sessionResolved.error };
  }
  if (hasDeck) {
    return { kind: "deck", target: deckResolved.deck, error: "" };
  }
  if (deckResolved.error && !deckResolved.error.startsWith("Unknown deck identifier")) {
    return { kind: "", target: null, error: deckResolved.error };
  }
  return { kind: "", target: null, error: sessionResolved.error || deckResolved.error || "Unknown navigation target." };
}

function activateSessionTarget(session) {
  if (!session || !session.id) {
    return { ok: false, message: "Unknown session target." };
  }
  const beforeState = store.getState();
  const previousActiveSessionId = beforeState.activeSessionId;
  const previousActiveDeckId = deckState.activeDeckId;
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
  if (deckState.activeDeckId === deck.id) {
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
  const resolved = resolveQuickSwitchTarget(selectorText, sessions);
  if (resolved.error) {
    return resolved.error;
  }
  if (resolved.kind === "session" && resolved.target) {
    const targetDeck = getDeckById(resolveSessionDeckId(resolved.target));
    const activation = store.getState().activeSessionId === resolved.target.id ? "Already active" : "Target session";
    const deckLabel = targetDeck ? ` deck [${targetDeck.id}] ${targetDeck.name}` : "";
    return `${activation}: [${formatSessionToken(resolved.target.id)}] ${formatSessionDisplayName(resolved.target)}${deckLabel}`;
  }
  if (resolved.kind === "deck" && resolved.target) {
    const activation = deckState.activeDeckId === resolved.target.id ? "Already active" : "Target deck";
    return `${activation}: [${resolved.target.id}] ${resolved.target.name}`;
  }
  return "";
}

function normalizeSessionTagToken(token) {
  return String(token || "")
    .trim()
    .toLowerCase();
}

function resolveCrossDeckSelector(selectorToken, sessions) {
  const normalizedSelector = String(selectorToken || "").trim();
  const splitIndex = normalizedSelector.indexOf("::");
  if (splitIndex <= 0) {
    return {
      ok: false,
      explicit: false,
      sessions,
      token: normalizedSelector,
      error: ""
    };
  }
  const deckToken = normalizedSelector.slice(0, splitIndex).trim();
  const nestedToken = normalizedSelector.slice(splitIndex + 2).trim();
  if (!deckToken || !nestedToken) {
    return {
      ok: true,
      explicit: true,
      sessions: [],
      token: "",
      error: "Cross-deck selector must be '<deckSelector>::<sessionSelector>'."
    };
  }
  const resolvedDeck = resolveDeckToken(deckToken, deckState.decks);
  if (!resolvedDeck.deck) {
    return {
      ok: true,
      explicit: true,
      sessions: [],
      token: "",
      error: resolvedDeck.error
    };
  }
  return {
    ok: true,
    explicit: true,
    sessions: sessions.filter((session) => resolveSessionDeckId(session) === resolvedDeck.deck.id),
    token: nestedToken,
    deckId: resolvedDeck.deck.id,
    error: ""
  };
}

function resolveSelectorMatches(selector, sessions, options = {}) {
  const normalized = String(selector || "").trim();
  if (!normalized) {
    return { sessions: [], error: "Missing session identifier." };
  }

  const allSessions = Array.isArray(sessions) ? sessions : [];
  let candidateSessions = allSessions;
  const scopeMode = options.scopeMode === "active-deck" ? "active-deck" : "all";
  const activeDeckId = String(options.activeDeckId || "").trim();
  if (scopeMode === "active-deck" && activeDeckId) {
    candidateSessions = allSessions.filter((session) => resolveSessionDeckId(session) === activeDeckId);
  }

  const crossDeck = resolveCrossDeckSelector(normalized, allSessions);
  if (crossDeck.error) {
    return { sessions: [], error: crossDeck.error };
  }
  if (crossDeck.explicit) {
    candidateSessions = crossDeck.sessions;
  }
  const token = crossDeck.explicit ? crossDeck.token : normalized;
  const normalizedToken = token.toLowerCase();

  if (token === "*") {
    return { sessions: candidateSessions.slice(), error: "" };
  }

  if (normalizedToken.startsWith("deck:")) {
    const deckToken = token.slice("deck:".length).trim();
    if (!deckToken) {
      return { sessions: [], error: "Deck selector must be 'deck:<deckSelector>'." };
    }
    const resolvedDeck = resolveDeckToken(deckToken, deckState.decks);
    if (!resolvedDeck.deck) {
      return { sessions: [], error: resolvedDeck.error };
    }
    const deckMatches = allSessions.filter((session) => resolveSessionDeckId(session) === resolvedDeck.deck.id);
    if (deckMatches.length === 0) {
      return { sessions: [], error: `No sessions found for deck '${resolvedDeck.deck.id}'.` };
    }
    return { sessions: deckMatches, error: "" };
  }

  const dedupe = new Map();
  const resolved = resolveSessionToken(token, candidateSessions);
  if (resolved.session) {
    dedupe.set(resolved.session.id, resolved.session);
  }

  const tagToken = normalizeSessionTagToken(token);
  const tagMatches = candidateSessions.filter((session) =>
    Array.isArray(session.tags) && session.tags.some((entry) => normalizeSessionTagToken(entry) === tagToken)
  );
  for (const session of tagMatches) {
    dedupe.set(session.id, session);
  }

  if (dedupe.size === 0) {
    return { sessions: [], error: resolved.error || `Unknown session/tag identifier: ${normalized}` };
  }
  return { sessions: Array.from(dedupe.values()), error: "" };
}

function parseSelectorList(text, { source = "slash" } = {}) {
  const raw = String(text || "").trim();
  if (!raw) {
    return [];
  }
  if (source === "direct-route") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveTargetSelectors(selectorText, sessions, options = {}) {
  const selectorList = parseSelectorList(selectorText, { source: options.source || "slash" });
  if (selectorList.length === 0) {
    return { sessions: [], error: "Missing session identifier." };
  }
  const dedupe = new Map();
  for (const selector of selectorList) {
    const matched = resolveSelectorMatches(selector, sessions, options);
    if (matched.error) {
      return { sessions: [], error: matched.error };
    }
    for (const session of matched.sessions) {
      dedupe.set(session.id, session);
    }
  }
  return { sessions: Array.from(dedupe.values()), error: "" };
}

function resolveFilterSelectors(selectorText, sessions, options = {}) {
  const selectorList = parseSelectorList(selectorText, { source: "slash" });
  if (selectorList.length === 0) {
    return { sessions: [], error: "" };
  }
  const scopeMode = options.scopeMode === "active-deck" ? "active-deck" : "all";
  const activeDeckId = String(options.activeDeckId || "").trim();
  const allSessions = Array.isArray(sessions) ? sessions : [];
  let candidateSessions = allSessions;
  if (scopeMode === "active-deck" && activeDeckId) {
    candidateSessions = allSessions.filter((session) => resolveSessionDeckId(session) === activeDeckId);
  }
  const dedupe = new Map();
  for (const selector of selectorList) {
    const crossDeck = resolveCrossDeckSelector(selector, allSessions);
    if (crossDeck.error) {
      return { sessions: [], error: crossDeck.error };
    }
    const selectorSessions = crossDeck.explicit ? crossDeck.sessions : candidateSessions;
    const token = crossDeck.explicit ? crossDeck.token : String(selector || "").trim();
    if (!token) {
      continue;
    }
    if (token === "*") {
      for (const session of selectorSessions) {
        dedupe.set(session.id, session);
      }
      continue;
    }
    const normalizedToken = token.toLowerCase();
    if (normalizedToken.startsWith("deck:")) {
      const deckToken = token.slice("deck:".length).trim();
      if (!deckToken) {
        return { sessions: [], error: "Deck selector must be 'deck:<deckSelector>'." };
      }
      const resolvedDeck = resolveDeckToken(deckToken, deckState.decks);
      if (!resolvedDeck.deck) {
        return { sessions: [], error: resolvedDeck.error };
      }
      const deckMatches = allSessions.filter((session) => resolveSessionDeckId(session) === resolvedDeck.deck.id);
      if (deckMatches.length === 0) {
        return { sessions: [], error: `No sessions found for deck '${resolvedDeck.deck.id}'.` };
      }
      for (const session of deckMatches) {
        dedupe.set(session.id, session);
      }
      continue;
    }
    const exactIdMatch = selectorSessions.find((session) => session.id === token) || null;
    let idMatches = [];
    if (exactIdMatch) {
      idMatches = [exactIdMatch];
    } else {
      const prefixMatches = selectorSessions.filter((session) => session.id.startsWith(token));
      if (prefixMatches.length > 1) {
        return { sessions: [], error: `Ambiguous session id prefix: ${token}` };
      }
      idMatches = prefixMatches;
    }
    const tagToken = normalizeSessionTagToken(token);
    const tagMatches = selectorSessions.filter((session) =>
      Array.isArray(session.tags) && session.tags.some((entry) => normalizeSessionTagToken(entry) === tagToken)
    );
    if (idMatches.length === 0 && tagMatches.length === 0) {
      return { sessions: [], error: `Unknown session id/tag: ${token}` };
    }
    for (const session of idMatches) {
      dedupe.set(session.id, session);
    }
    for (const session of tagMatches) {
      dedupe.set(session.id, session);
    }
  }
  return { sessions: Array.from(dedupe.values()), error: "" };
}

function resolveSettingsTargets(selectorText, sessions, activeSessionId) {
  const normalized = String(selectorText || "").trim().toLowerCase();
  if (!normalized || normalized === "active") {
    if (!activeSessionId) {
      return { sessions: [], error: "No active session for settings command." };
    }
    const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
    if (!activeSession) {
      return { sessions: [], error: "No active session for settings command." };
    }
    return { sessions: [activeSession], error: "" };
  }
  return resolveTargetSelectors(selectorText, sessions, { source: "slash" });
}

function parseSettingsPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { ok: false, error: "Missing JSON payload for /settings apply." };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON payload for /settings apply." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Settings payload must be a JSON object." };
  }
  return { ok: true, payload: parsed };
}

function parseSizeCommandArgs(args, currentCols, currentRows) {
  const COLS_MIN = 20;
  const COLS_MAX = 400;
  const ROWS_MIN = 5;
  const ROWS_MAX = 120;
  const rawArgs = Array.isArray(args) ? args.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  if (rawArgs.length === 0) {
    return { ok: false, error: "Usage: /size <cols> <rows> | /size c<cols> | /size r<rows>" };
  }

  let cols = currentCols;
  let rows = currentRows;
  let updatedCols = false;
  let updatedRows = false;

  const parseBoundedInt = (raw, min, max, label) => {
    if (!/^\d+$/.test(raw)) {
      return { ok: false, error: `${label} must be an integer.` };
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value < min || value > max) {
      return { ok: false, error: `${label} must be between ${min} and ${max}.` };
    }
    return { ok: true, value };
  };

  if (rawArgs.length === 2 && /^\d+$/.test(rawArgs[0]) && /^\d+$/.test(rawArgs[1])) {
    const nextCols = parseBoundedInt(rawArgs[0], COLS_MIN, COLS_MAX, "Columns");
    if (!nextCols.ok) {
      return nextCols;
    }
    const nextRows = parseBoundedInt(rawArgs[1], ROWS_MIN, ROWS_MAX, "Rows");
    if (!nextRows.ok) {
      return nextRows;
    }
    return { ok: true, cols: nextCols.value, rows: nextRows.value };
  }

  for (const tokenRaw of rawArgs) {
    const token = tokenRaw.toLowerCase();
    const colsMatch = /^c(\d+)$/.exec(token);
    if (colsMatch) {
      const parsed = parseBoundedInt(colsMatch[1], COLS_MIN, COLS_MAX, "Columns");
      if (!parsed.ok) {
        return parsed;
      }
      cols = parsed.value;
      updatedCols = true;
      continue;
    }
    const rowsMatch = /^r(\d+)$/.exec(token);
    if (rowsMatch) {
      const parsed = parseBoundedInt(rowsMatch[1], ROWS_MIN, ROWS_MAX, "Rows");
      if (!parsed.ok) {
        return parsed;
      }
      rows = parsed.value;
      updatedRows = true;
      continue;
    }
    return { ok: false, error: "Usage: /size <cols> <rows> | /size c<cols> | /size r<rows>" };
  }

  if (!updatedCols && !updatedRows) {
    return { ok: false, error: "Usage: /size <cols> <rows> | /size c<cols> | /size r<rows>" };
  }
  return { ok: true, cols, rows };
}

function formatSessionSettingsReport(session) {
  const token = formatSessionToken(session.id);
  const name = formatSessionDisplayName(session);
  const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
  const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
  const env = session?.env && typeof session.env === "object" ? session.env : {};
  const tags = normalizeSessionTags(session.tags);
  const themeProfile = normalizeThemeProfile(session.themeProfile);
  const sendTerminator = getSessionSendTerminator(session.id);
  return [
    `[${token}] ${name}`,
    `startCwd=${JSON.stringify(startCwd)}`,
    `startCommand=${JSON.stringify(startCommand)}`,
    `env=${JSON.stringify(env)}`,
    `tags=${JSON.stringify(tags)}`,
    `sendTerminator=${sendTerminator}`,
    `themeProfile=${JSON.stringify(themeProfile)}`
  ].join("\n");
}

function parseDirectTargetRoutingInput(rawInput) {
  const input = String(rawInput || "");
  const match = /^@([^\s]+)\s+([\s\S]+)$/.exec(input);
  if (!match) {
    return {
      matched: false,
      targetToken: "",
      payload: ""
    };
  }
  return {
    matched: true,
    targetToken: match[1],
    payload: match[2]
  };
}

function parseCustomDefinition(rawInput) {
  const raw = String(rawInput || "").replaceAll("\r\n", "\n");
  const trimmedStart = raw.trimStart();
  const prefix = "/custom";
  if (!trimmedStart.startsWith(prefix)) {
    return { ok: false, error: "Invalid /custom command input." };
  }

  const afterPrefix = trimmedStart.slice(prefix.length);
  const newlineIndex = afterPrefix.indexOf("\n");

  if (newlineIndex === -1) {
    const trimmed = afterPrefix.trim();
    if (!trimmed) {
      return { ok: false, error: "Usage: /custom <name> <text> or /custom <name> with block delimiters." };
    }
    const firstWhitespace = trimmed.search(/\s/);
    if (firstWhitespace < 0) {
      return { ok: false, error: "Usage: /custom <name> <text> or /custom <name> with block delimiters." };
    }
    const name = trimmed.slice(0, firstWhitespace);
    const content = trimmed.slice(firstWhitespace).trimStart();
    if (!content) {
      return { ok: false, error: "Inline custom-command content cannot be empty." };
    }
    return { ok: true, name, content, mode: "inline" };
  }

  const header = afterPrefix.slice(0, newlineIndex).trim();
  if (!header) {
    return { ok: false, error: "Missing custom-command name in block definition." };
  }
  if (/\s/.test(header)) {
    return { ok: false, error: "Block definition header must be '/custom <name>' only." };
  }

  const trailing = afterPrefix.slice(newlineIndex + 1);
  const lines = trailing.split("\n");
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { ok: false, error: "Block definition must start with '---' on its own line." };
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      closingIndex = index;
      break;
    }
  }
  if (closingIndex < 0) {
    return { ok: false, error: "Block definition must end with a closing '---' line." };
  }

  const contentLines = lines.slice(1, closingIndex);
  const normalizedContentLines = contentLines.map((line) => (line.trim() === "\\---" ? "---" : line));
  const blockContent = normalizedContentLines.join("\n");
  if (!blockContent) {
    return { ok: false, error: "Block custom-command content cannot be empty." };
  }

  const trailingLines = lines.slice(closingIndex + 1);
  const afterClosing = trailingLines.join("\n").trim();
  if (afterClosing) {
    return {
      ok: false,
      error: "Block payload contains content after closing '---'. For a literal delimiter line inside payload, use '\\---'."
    };
  }

  return { ok: true, name: header, content: blockContent, mode: "block" };
}

async function executeControlCommand(interpreted) {
  const commandRaw = interpreted.command;
  const command = commandRaw.toLowerCase();
  const args = interpreted.args;
  const state = store.getState();
  const sessions = state.sessions;
  const activeSessionId = state.activeSessionId;

  if (command === "help" || command === "") {
    return "Commands: /new [shell], /deck list|new|rename|switch|delete, /move <sessionSelector> <deckSelector>, /size <cols> <rows> | /size c<cols> | /size r<rows>, /filter [id/tag[,id/tag...]], /close [selector[,selector...]], /switch <id>, /next, /prev, /list, /rename <name> | /rename <selector> <name>, /restart [selector[,selector...]], /settings show [selector], /settings apply <selector|active> <json>, /custom <name> <text>, /custom <name> + block, >selector, >deckSelector::sessionSelector, /help";
  }

  if (command === "deck") {
    const subcommand = String(args[0] || "").toLowerCase();
    const rest = args.slice(1);
    const decks = deckState.decks.slice();
    const activeDeck = getActiveDeck();

    if (!subcommand || subcommand === "list") {
      if (decks.length === 0) {
        return "No decks available.";
      }
      const lines = decks.map((deck) => {
        const marker = activeDeck && deck.id === activeDeck.id ? "*" : " ";
        const count = getSessionCountForDeck(deck.id, sessions);
        return `${marker} [${deck.id}] ${deck.name} (${count} sessions)`;
      });
      return lines.join("\n");
    }

    if (subcommand === "new") {
      const name = rest.join(" ").trim();
      if (!name) {
        return "Usage: /deck new <name>";
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
      await reloadDecks({ preferredActiveDeckId: created.id });
      return `Created deck [${created.id}] ${created.name}.`;
    }

    if (subcommand === "rename") {
      if (!activeDeck) {
        return "No active deck to rename.";
      }
      if (rest.length === 0) {
        return "Usage: /deck rename <name> | /deck rename <deckSelector> <name>";
      }

      let targetDeck = activeDeck;
      let name = "";
      if (rest.length === 1) {
        name = rest[0].trim();
      } else {
        const resolvedDeck = resolveDeckToken(rest[0], decks);
        if (!resolvedDeck.deck) {
          return resolvedDeck.error;
        }
        targetDeck = resolvedDeck.deck;
        name = rest.slice(1).join(" ").trim();
      }

      if (!name) {
        return "Usage: /deck rename <name> | /deck rename <deckSelector> <name>";
      }
      const updated = await api.updateDeck(targetDeck.id, { name });
      await reloadDecks({ preferredActiveDeckId: updated.id });
      return `Renamed deck [${updated.id}] to ${updated.name}.`;
    }

    if (subcommand === "switch") {
      if (rest.length !== 1) {
        return "Usage: /deck switch <deckSelector>";
      }
      const resolved = resolveDeckToken(rest[0], decks);
      if (!resolved.deck) {
        return resolved.error;
      }
      const changed = setActiveDeck(resolved.deck.id);
      if (!changed) {
        return `Failed to switch deck: ${resolved.deck.id}`;
      }
      return `Active deck: [${resolved.deck.id}] ${resolved.deck.name}.`;
    }

    if (subcommand === "delete") {
      if (!activeDeck) {
        return "No active deck to delete.";
      }
      if (rest.length > 2) {
        return "Usage: /deck delete [deckSelector] [force]";
      }
      let force = false;
      let selector = "";
      if (rest.length === 1) {
        if (String(rest[0]).toLowerCase() === "force") {
          force = true;
        } else {
          selector = rest[0];
        }
      } else if (rest.length === 2) {
        selector = rest[0];
        if (String(rest[1]).toLowerCase() !== "force") {
          return "Usage: /deck delete [deckSelector] [force]";
        }
        force = true;
      }

      let targetDeck = activeDeck;
      if (selector) {
        const resolved = resolveDeckToken(selector, decks);
        if (!resolved.deck) {
          return resolved.error;
        }
        targetDeck = resolved.deck;
      }

      if (targetDeck.id === DEFAULT_DECK_ID) {
        return "Default deck cannot be deleted.";
      }

      try {
        await api.deleteDeck(targetDeck.id, { force });
      } catch (err) {
        if (err && err.status === 409 && !force) {
          return `Deck '${targetDeck.name}' is not empty. Retry with '/deck delete ${targetDeck.id} force'.`;
        }
        throw err;
      }

      const fallbackId = decks.find((deck) => deck.id !== targetDeck.id)?.id || DEFAULT_DECK_ID;
      await reloadDecks({ preferredActiveDeckId: fallbackId });
      return `Deleted deck [${targetDeck.id}] ${targetDeck.name}.`;
    }

    return "Usage: /deck list | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]";
  }

  if (command === "move") {
    if (args.length !== 2) {
      return "Usage: /move <sessionSelector> <deckSelector>";
    }
    const sessionSelector = args[0];
    const deckSelector = args[1];
    const resolvedTargets = resolveTargetSelectors(sessionSelector, sessions, { source: "slash" });
    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }
    if (resolvedTargets.sessions.length === 0) {
      return "No sessions resolved for /move.";
    }
    const resolvedDeck = resolveDeckToken(deckSelector, deckState.decks);
    if (!resolvedDeck.deck) {
      return resolvedDeck.error;
    }

    const moved = await Promise.all(
      resolvedTargets.sessions.map((session) => api.moveSessionToDeck(resolvedDeck.deck.id, session.id))
    );
    for (const session of moved) {
      upsertSession(session);
    }
    if (moved.length === 1) {
      return `Moved session [${formatSessionToken(moved[0].id)}] to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
    }
    return `Moved ${moved.length} sessions to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
  }

  if (command === "size") {
    const parsed = parseSizeCommandArgs(args, terminalSettings.cols, terminalSettings.rows);
    if (!parsed.ok) {
      return parsed.error;
    }
    await applyTerminalSizeSettings(parsed.cols, parsed.rows);
    const activeDeck = getActiveDeck();
    return `Terminal size set to ${parsed.cols}x${parsed.rows} (cols x rows) for deck '${activeDeck?.name || "unknown"}'.`;
  }

  if (command === "filter") {
    const selectorText = args.join(" ").trim();
    if (!selectorText) {
      uiState.sessionFilterText = "";
      saveStoredSessionFilterText("");
      render();
      return "Display filter cleared.";
    }
    const activeDeck = getActiveDeck();
    let activeDeckId = activeDeck ? activeDeck.id : "";
    const resolved = resolveFilterSelectors(selectorText, sessions, {
      scopeMode: "active-deck",
      activeDeckId
    });
    if (resolved.error) {
      return resolved.error;
    }
    uiState.sessionFilterText = selectorText;
    saveStoredSessionFilterText(selectorText);
    if (selectorText.includes("::") && resolved.sessions.length > 0) {
      const targetDeckId = resolveSessionDeckId(resolved.sessions[0]);
      if (targetDeckId && targetDeckId !== activeDeckId) {
        setActiveDeck(targetDeckId);
        activeDeckId = targetDeckId;
      }
    }
    if (resolved.sessions.length > 0 && !resolved.sessions.some((session) => session.id === activeSessionId)) {
      store.setActiveSession(resolved.sessions[0].id);
    }
    render();
    const scopedCount = activeDeckId
      ? store.getState().sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId).length
      : store.getState().sessions.length;
    return `Display filter active (${resolved.sessions.length}/${scopedCount}): ${selectorText}`;
  }

  if (command === "list") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    const lines = sessions.map((session) => {
      const marker = session.id === activeSessionId ? "*" : " ";
      const token = formatSessionToken(session.id);
      const state = getSessionRuntimeState(session);
      const stateSuffix = state === "active" ? "" : ` [${state}]`;
      return `${marker} [${token}] ${formatSessionDisplayName(session)} (${session.id.slice(0, 8)})${stateSuffix}`;
    });
    return lines.join("\n");
  }

  if (command === "new") {
    const payload = {};
    if (args.length > 0) {
      payload.shell = args[0];
    }
    const session = await api.createSession(payload);
    upsertSession(session);
    store.setActiveSession(session.id);
    return `Created session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
  }

  if (command === "close") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    let targetSessions = [];
    if (args.length === 0) {
      if (!activeSessionId) {
        return "No active session to close.";
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return "No active session to close.";
      }
      targetSessions = [activeSession];
    } else {
      const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = resolvedTargets.sessions;
    }
    if (targetSessions.length === 0) {
      return "No active session to close.";
    }
    const exitedTargets = targetSessions.filter((session) => isSessionExited(session));
    const liveTargets = targetSessions.filter((session) => !isSessionExited(session));
    await Promise.all(liveTargets.map((session) => api.deleteSession(session.id)));
    for (const session of targetSessions) {
      removeSession(session.id);
    }
    if (exitedTargets.length > 0 && liveTargets.length === 0) {
      return exitedTargets.length === 1
        ? `Removed exited session [${formatSessionToken(exitedTargets[0].id)}] ${formatSessionDisplayName(exitedTargets[0])}.`
        : `Removed ${exitedTargets.length} exited sessions.`;
    }
    if (targetSessions.length === 1) {
      return `Closed session ${targetSessions[0].id.slice(0, 8)}.`;
    }
    return `Closed ${targetSessions.length} sessions.`;
  }

  if (command === "switch") {
    if (args.length === 0) {
      return "Usage: /switch <id>";
    }
    const activeDeckId = getActiveDeck()?.id || "";
    const resolvedTargets = resolveTargetSelectors(args[0], sessions, {
      source: "slash",
      scopeMode: "active-deck",
      activeDeckId
    });
    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }
    if (resolvedTargets.sessions.length !== 1) {
      return "Switch selector must resolve to exactly one session.";
    }
    const target = resolvedTargets.sessions[0];
    const targetDeckId = resolveSessionDeckId(target);
    if (targetDeckId && targetDeckId !== activeDeckId) {
      setActiveDeck(targetDeckId);
    }
    store.setActiveSession(target.id);
    return `Active session: [${formatSessionToken(target.id)}] ${formatSessionDisplayName(target)}.`;
  }

  if (command === "next" || command === "prev") {
    const activeDeckId = getActiveDeck()?.id || "";
    const scopedSessions = activeDeckId
      ? sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId)
      : sessions.slice();
    if (scopedSessions.length === 0) {
      return "No sessions available.";
    }
    const currentIndex = Math.max(
      0,
      scopedSessions.findIndex((session) => session.id === activeSessionId)
    );
    const delta = command === "next" ? 1 : -1;
    const nextIndex = (currentIndex + delta + scopedSessions.length) % scopedSessions.length;
    const nextSession = scopedSessions[nextIndex];
    store.setActiveSession(nextSession.id);
    return `Active session: [${formatSessionToken(nextSession.id)}] ${formatSessionDisplayName(nextSession)}.`;
  }

  if (command === "rename") {
    if (args.length === 0) {
      return "Usage: /rename <name> | /rename <selector> <name>";
    }

    if (args.length === 1) {
      if (!activeSessionId) {
        return "No active session to rename.";
      }
      const name = args[0].trim();
      if (!name) {
        return "Usage: /rename <name> | /rename <selector> <name>";
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (isSessionExited(activeSession)) {
        return getBlockedSessionActionMessage([activeSession], "Rename");
      }
      const updated = await api.updateSession(activeSessionId, { name });
      upsertSession(updated);
      return `Renamed active session to ${updated.name}.`;
    }

    const selectorText = args[0];
    const name = args.slice(1).join(" ").trim();
    if (!name) {
      return "Usage: /rename <name> | /rename <selector> <name>";
    }
    const resolvedTargets = resolveTargetSelectors(selectorText, sessions, { source: "slash" });
    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }
    if (resolvedTargets.sessions.length !== 1) {
      return "Rename selector must resolve to exactly one session.";
    }
    if (isSessionExited(resolvedTargets.sessions[0])) {
      return getBlockedSessionActionMessage(resolvedTargets.sessions, "Rename");
    }
    const updated = await api.updateSession(resolvedTargets.sessions[0].id, { name });
    upsertSession(updated);
    return `Renamed session [${formatSessionToken(updated.id)}] to ${updated.name}.`;
  }

  if (command === "restart") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    let targetSessions = [];
    if (args.length === 0) {
      if (!activeSessionId) {
        return "No active session to restart.";
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return "No active session to restart.";
      }
      targetSessions = [activeSession];
    } else {
      const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = resolvedTargets.sessions;
    }
    if (targetSessions.length === 0) {
      return "No active session to restart.";
    }
    const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
    if (blockedSessions.length > 0) {
      return getBlockedSessionActionMessage(blockedSessions, "Restart");
    }
    const restartedSessions = await Promise.all(targetSessions.map((session) => api.restartSession(session.id)));
    for (const restarted of restartedSessions) {
      upsertSession(restarted);
    }
    if (restartedSessions.length > 0) {
      store.setActiveSession(restartedSessions[0].id);
    }
    if (restartedSessions.length === 1) {
      const restarted = restartedSessions[0];
      return `Restarted session [${formatSessionToken(restarted.id)}] ${formatSessionDisplayName(restarted)}.`;
    }
    return `Restarted ${restartedSessions.length} sessions.`;
  }

  if (command === "custom") {
    if (args[0] === "list") {
      const commands = await api.listCustomCommands();
      if (!Array.isArray(commands) || commands.length === 0) {
        return "No custom commands defined.";
      }
      return commands.map((entry) => `/${entry.name}`).join("\n");
    }

    if (args[0] === "show") {
      const name = typeof args[1] === "string" ? args[1].trim() : "";
      if (!name) {
        return "Usage: /custom show <name>";
      }
      try {
        const custom = await api.getCustomCommand(name);
        return `/${custom.name}\n---\n${custom.content}\n---`;
      } catch (err) {
        if (err && err.status === 404) {
          return `Custom command not found: /${name}`;
        }
        throw err;
      }
    }

    if (args[0] === "remove") {
      const name = typeof args[1] === "string" ? args[1].trim() : "";
      if (!name) {
        return "Usage: /custom remove <name>";
      }
      try {
        await api.deleteCustomCommand(name);
        return `Removed custom command /${name}.`;
      } catch (err) {
        if (err && err.status === 404) {
          return `Custom command not found: /${name}`;
        }
        throw err;
      }
    }

    const parsed = parseCustomDefinition(interpreted.raw);
    if (!parsed.ok) {
      return `Custom command definition error: ${parsed.error}`;
    }
    const saved = await api.upsertCustomCommand(parsed.name, parsed.content);
    return `Saved custom command /${saved.name} (${parsed.mode}).`;
  }

  if (command === "settings") {
    const showMatch = /^\/settings\s+show(?:\s+([^\s]+))?\s*$/i.exec(interpreted.raw || "");
    if (showMatch) {
      const selectorText = showMatch[1] || "active";
      const resolvedTargets = resolveSettingsTargets(selectorText, sessions, activeSessionId);
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      return resolvedTargets.sessions.map((session) => formatSessionSettingsReport(session)).join("\n\n");
    }

    const applyMatch = /^\/settings\s+apply\s+([^\s]+)\s+([\s\S]+)$/i.exec(interpreted.raw || "");
    if (!applyMatch) {
      return "Usage: /settings show [selector] | /settings apply <selector|active> <json>";
    }
    const selectorText = applyMatch[1];
    const parsedPayload = parseSettingsPayload(applyMatch[2]);
    if (!parsedPayload.ok) {
      return parsedPayload.error;
    }

    const resolvedTargets = resolveSettingsTargets(selectorText, sessions, activeSessionId);
    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }
    const targets = resolvedTargets.sessions;
    if (targets.length === 0) {
      return "No target sessions resolved for /settings apply.";
    }
    const blockedTargets = targets.filter((session) => isSessionExited(session));
    if (blockedTargets.length > 0) {
      return getBlockedSessionActionMessage(blockedTargets, "Settings apply");
    }

    const payload = parsedPayload.payload;
    const allowedKeys = new Set(["startCwd", "startCommand", "env", "tags", "themeProfile", "sendTerminator"]);
    const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      return `Unknown settings key(s): ${unknownKeys.join(", ")}`;
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(payload, "startCwd")) {
      patch.startCwd = payload.startCwd;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "startCommand")) {
      patch.startCommand = payload.startCommand;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "env")) {
      patch.env = payload.env;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
      patch.tags = payload.tags;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "themeProfile")) {
      patch.themeProfile = payload.themeProfile;
    }

    let sendTerminatorMode = null;
    if (Object.prototype.hasOwnProperty.call(payload, "sendTerminator")) {
      const requested = String(payload.sendTerminator || "").trim().toLowerCase();
      sendTerminatorMode = normalizeSendTerminatorMode(requested);
      if (requested && requested !== sendTerminatorMode) {
        return "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay.";
      }
    }

    const hasPatch = Object.keys(patch).length > 0;
    const hasTerminator = typeof sendTerminatorMode === "string";
    if (!hasPatch && !hasTerminator) {
      return "No applicable settings keys in payload.";
    }

    if (hasPatch) {
      const updatedSessions = await Promise.all(targets.map((session) => api.updateSession(session.id, patch)));
      for (const updated of updatedSessions) {
        upsertSession(updated);
      }
    }
    if (hasTerminator) {
      for (const session of targets) {
        setSessionSendTerminator(session.id, sendTerminatorMode);
      }
    }
    const appliedKeys = [
      ...Object.keys(patch),
      ...(hasTerminator ? ["sendTerminator"] : [])
    ];
    return `Applied settings to ${targets.length} session(s): ${appliedKeys.join(", ")}.`;
  }

  try {
    const custom = await api.getCustomCommand(commandRaw);
    let targetSessions = [];
    if (args.length === 0) {
      if (!activeSessionId) {
        return "No active session for custom command execution.";
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return "No active session for custom command execution.";
      }
      targetSessions = [activeSession];
    } else {
      const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = resolvedTargets.sessions;
    }
    if (targetSessions.length === 0) {
      return "No active session for custom command execution.";
    }
    const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
    if (blockedSessions.length > 0) {
      return getBlockedSessionActionMessage(blockedSessions, "Custom command execution");
    }
    await Promise.all(
      targetSessions.map((session) => {
        const normalizedPayload = normalizeCustomCommandPayloadForShell(custom.content);
        return sendInputWithConfiguredTerminator(session.id, normalizedPayload, getSessionSendTerminator(session.id));
      })
    );
    if (targetSessions.length === 1) {
      return `Executed /${custom.name} on [${formatSessionToken(targetSessions[0].id)}].`;
    }
    return `Executed /${custom.name} on ${targetSessions.length} sessions.`;
  } catch (err) {
    if (err && err.status === 404) {
      return `Unknown command: /${commandRaw}`;
    }
    throw err;
  }

  return `Unknown command: /${commandRaw}`;
}

async function bootstrapSessions() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }
  startupPerf.bootstrapRequestCount += 1;
  debugLog("sessions.bootstrap.request", {
    bootstrapRequestCount: startupPerf.bootstrapRequestCount
  });
  bootstrapPromise = (async () => {
  try {
    debugLog("sessions.bootstrap.start");
    const sessions = await api.listSessions();
    store.setSessions(sessions);
    uiState.loading = false;
    uiState.error = "";
    if (startupPerf.bootstrapReadyAtMs === null) {
      startupPerf.bootstrapReadyAtMs = nowMs();
    }
    maybeReportStartupPerf();
    debugLog("sessions.bootstrap.ok", { count: sessions.length });
  } catch {
    setError("Failed to load sessions.");
  }
  })();
  return bootstrapPromise;
}

async function bootstrapDecks() {
  try {
    debugLog("decks.bootstrap.start");
    const decks = await api.listDecks();
    setDecks(decks, { preferredActiveDeckId: deckState.activeDeckId });
    debugLog("decks.bootstrap.ok", { count: Array.isArray(decks) ? decks.length : 0, activeDeckId: deckState.activeDeckId });
  } catch (err) {
    debugLog("decks.bootstrap.error", { message: err instanceof Error ? err.message : String(err) });
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
    setError("Failed to load decks.");
  }
}

async function bootstrapDevAuthToken() {
  try {
    const payload = await api.createDevToken();
    if (payload && typeof payload.accessToken === "string" && payload.accessToken.trim()) {
      wsAuthToken = payload.accessToken.trim();
      api.setAuthToken(wsAuthToken);
      debugLog("auth.dev_token.ok", { expiresIn: payload.expiresIn || 0, scope: payload.scope || "" });
      return true;
    }
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 0;
    if (status === 404 || status === 405) {
      debugLog("auth.dev_token.unavailable", {});
      return false;
    }
    debugLog("auth.dev_token.error", {
      status,
      message: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
  return false;
}

function startWs() {
  wsClient = createWsClient(config.wsUrl, {
    onState(status) {
      debugLog("ws.state", { status });
      store.setConnectionState(status);
      if (status === "connected") {
        uiState.loading = false;
        uiState.error = "";
      }
    },
    onMessage(event) {
      debugLog("ws.event", { type: event.type, sessionId: event.sessionId || null });
      if (event.type === "snapshot") {
        store.setSessions(event.sessions || []);
        replaySnapshotOutputs(event.outputs);
        uiState.loading = false;
        uiState.error = "";
        return;
      }

      if (event.type === "session.data" && terminals.has(event.sessionId)) {
        appendTerminalData(event.sessionId, event.data);
        return;
      }

      if (event.type === "session.created" && event.session) {
        upsertSession(event.session);
        uiState.error = "";
        return;
      }

      if (event.type === "session.exit" && event.sessionId) {
        markSessionExited(event.sessionId, event);
        uiState.error = "";
        return;
      }

      if (event.type === "session.closed" && event.sessionId) {
        removeSession(event.sessionId);
        uiState.error = "";
      }
    }
  }, { debug: debugLogs, log: debugLog, tokenProvider: () => wsAuthToken });
}

store.subscribe(render);
syncSettingsUi();
syncTerminalGeometryCss();
render();

async function initializeRuntime() {
  await bootstrapDevAuthToken();
  await bootstrapDecks();
  await bootstrapSessions();
  startWs();
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
    upsertSession(session);
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
          return sendInputWithConfiguredTerminator(session.id, targetPayload, terminatorMode);
        })
      );
    } else {
      const terminatorMode = getSessionSendTerminator(targetSessionId);
      debugLog("command.send.start", {
        activeSessionId: targetSessionId,
        mode: terminatorMode,
        directRoute: directRouting.matched
      });
      await sendInputWithConfiguredTerminator(targetSessionId, targetPayload, terminatorMode);
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

  const requestId = ++commandPreviewRequestId;
  try {
    const custom = await api.getCustomCommand(commandRaw);
    if (requestId !== commandPreviewRequestId) {
      return;
    }

    setCommandPreview(custom.content || "");
  } catch (err) {
    if (requestId !== commandPreviewRequestId) {
      return;
    }
    if (err && err.status === 404) {
      setCommandPreview("");
      return;
    }
    setCommandPreview("");
  }
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
