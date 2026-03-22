import { createApiClient } from "./api-client.js";
import { interpretComposerInput } from "./command-interpreter.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";
import { resolveRuntimeConfig } from "./runtime-config.js";

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

const stateEl = document.getElementById("connection-state");
const gridEl = document.getElementById("terminal-grid");
const createBtn = document.getElementById("create-session");
const settingsColsEl = document.getElementById("settings-cols");
const settingsRowsEl = document.getElementById("settings-rows");
const settingsApplyBtn = document.getElementById("settings-apply");
const commandInput = document.getElementById("command-input");
const sendBtn = document.getElementById("send-command");
const template = document.getElementById("terminal-card-template");
const emptyStateEl = document.getElementById("empty-state");
const statusMessageEl = document.getElementById("status-message");
const commandFeedbackEl = document.getElementById("command-feedback");
const commandPreviewEl = document.getElementById("command-preview");

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
const SETTINGS_STORAGE_KEY = "ptydeck.settings.v1";
const TERMINAL_FONT_SIZE = 16;
const TERMINAL_LINE_HEIGHT = 1.2;
const TERMINAL_FONT_FAMILY = '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace';
const TERMINAL_CARD_HORIZONTAL_CHROME_PX = 28;
const QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COMMAND_PREVIEW_MAX_CHARS = 4000;
const SYSTEM_SLASH_COMMANDS = [
  "new",
  "close",
  "switch",
  "next",
  "prev",
  "list",
  "rename",
  "restart",
  "custom",
  "help"
];
let terminalSettings = loadTerminalSettings();
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
  commandFeedback: "",
  commandPreview: ""
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

function setCommandPreview(message) {
  uiState.commandPreview = message;
  render();
}

function resetCommandAutocompleteState() {
  commandAutocompleteState = null;
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

function buildSessionAutocompleteCandidates(prefix = "") {
  const normalizedPrefix = String(prefix || "").toLowerCase();
  const state = store.getState();
  const candidates = [];
  for (const session of state.sessions) {
    const token = formatSessionToken(session.id);
    if (!token) {
      continue;
    }
    const normalizedToken = token.toLowerCase();
    if (!normalizedToken.startsWith(normalizedPrefix)) {
      continue;
    }
    if (!candidates.includes(token)) {
      candidates.push(token);
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

  if ((command === "switch" || command === "close") && parts.length <= 2) {
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

  return null;
}

async function autocompleteSlashInput(reverse = false) {
  const parsed = parseSlashInputForAutocomplete(commandInput.value || "");
  if (!parsed) {
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
    const context = resolveSlashAutocompleteContext(commandInput.value || "", customCommands);
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
    resetCommandAutocompleteState();
    return true;
  }

  commandAutocompleteState = {
    matches,
    index: nextIndex,
    replacePrefix
  };
  commandInput.value = `${replacePrefix}${matches[nextIndex]}`;
  scheduleCommandPreview();
  return true;
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
    cols: clampInt(stored?.cols, 80, 20, 400),
    rows: clampInt(stored?.rows, 20, 5, 120)
  };
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
  return Math.max(120, Math.round(rows * lineHeightPx + 18));
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
  syncTerminalGeometryCss();
}

function readSettingsFromUi() {
  return {
    cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
    rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120)
  };
}

function applyMountHeight(entry, rows) {
  if (!entry || !entry.mount) {
    return;
  }
  const mountHeightPx = computeFixedMountHeightPx(rows);
  const cardWidthPx = computeFixedCardWidthPx(terminalSettings.cols);
  const mountWidthPx = Math.max(220, cardWidthPx - TERMINAL_CARD_HORIZONTAL_CHROME_PX);
  entry.mount.style.height = `${mountHeightPx}px`;
  entry.mount.style.width = `${mountWidthPx}px`;
  entry.element.style.width = `${cardWidthPx}px`;
}

function applySettingsToAllTerminals() {
  for (const sessionId of terminals.keys()) {
    applyResizeForSession(sessionId, { force: true });
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

function computeTerminalSize(entry) {
  if (!entry || !entry.mount || entry.mount.clientWidth < 40 || entry.mount.clientHeight < 40) {
    return null;
  }
  return {
    cols: terminalSettings.cols,
    rows: terminalSettings.rows
  };
}

function applyResizeForSession(sessionId, options = {}) {
  const entry = terminals.get(sessionId);
  if (!entry) {
    return;
  }
  const size = computeTerminalSize(entry);
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
  applyMountHeight(entry, rows);
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

function onApplySettings() {
  terminalSettings = readSettingsFromUi();
  saveTerminalSettings();
  syncSettingsUi();
  uiState.error = "";
  applySettingsToAllTerminals();
  scheduleGlobalResize();
}

function scheduleGlobalResize() {
  if (globalResizeTimer) {
    clearTimeout(globalResizeTimer);
  }
  globalResizeTimer = setTimeout(() => {
    globalResizeTimer = null;
    for (const sessionId of terminals.keys()) {
      applyResizeForSession(sessionId);
    }
  }, 120);
}

function scheduleDeferredResizePasses() {
  if (deferredResizeTimer) {
    clearTimeout(deferredResizeTimer);
  }
  const delays = [250, 700, 1400];
  let index = 0;
  function runNext() {
    scheduleGlobalResize();
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

function render() {
  const state = store.getState();
  pruneQuickIds(state.sessions.map((session) => session.id));
  if (state.sessions.length > 0 && startupPerf.firstNonEmptyRenderAtMs === null) {
    startupPerf.firstNonEmptyRenderAtMs = nowMs();
    maybeReportStartupPerf();
  }
  debugLog("ui.render", {
    sessions: state.sessions.length,
    activeSessionId: state.activeSessionId,
    connectionState: state.connectionState,
    loading: uiState.loading,
    hasError: Boolean(uiState.error)
  });
  stateEl.textContent = state.connectionState;
  emptyStateEl.style.display = state.sessions.length === 0 ? "block" : "none";
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
  if (commandPreviewEl) {
    commandPreviewEl.textContent = uiState.commandPreview || "";
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
      const timer = resizeTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
      }
      resizeTimers.delete(sessionId);
      terminalSizes.delete(sessionId);
      shouldRunResizePass = true;
    }
  }

  for (const session of state.sessions) {
    if (terminals.has(session.id)) {
      const entry = terminals.get(session.id);
      entry.element.classList.toggle("active", state.activeSessionId === session.id);
      entry.focusBtn.textContent = session.name || session.id.slice(0, 8);
      entry.quickIdEl.textContent = ensureQuickId(session.id);
      continue;
    }

    const node = template.content.firstElementChild.cloneNode(true);
    const quickIdEl = node.querySelector(".session-quick-id");
    const focusBtn = node.querySelector(".session-focus");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const mount = node.querySelector(".terminal-mount");
    const quickId = ensureQuickId(session.id);

    focusBtn.textContent = session.name || session.id.slice(0, 8);
    quickIdEl.textContent = quickId;
    focusBtn.addEventListener("click", () => store.setActiveSession(session.id));
    renameBtn.addEventListener("click", async () => {
      const nextName = window.prompt("Session name", session.name || session.id.slice(0, 8));
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
      try {
        await api.deleteSession(session.id);
        removeSession(session.id);
        uiState.error = "";
      } catch {
        setError("Failed to delete session.");
      }
    });

    node.classList.toggle("active", state.activeSessionId === session.id);

    const terminal = new window.Terminal({
      convertEol: true,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontFamily: TERMINAL_FONT_FAMILY,
      cursorBlink: true,
      theme: {
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
      }
    });
    debugLog("terminal.created", { sessionId: session.id });

    gridEl.appendChild(node);
    terminal.open(mount);
    terminal.onData((data) => {
      store.setActiveSession(session.id);
      api.sendInput(session.id, data).catch(() => setError("Failed to send terminal input."));
    });

    terminals.set(session.id, { terminal, element: node, focusBtn, quickIdEl, mount });
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

function replaySnapshotOutputs(outputs, attempt = 0) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return;
  }

  let missing = 0;
  for (const entry of outputs) {
    if (!entry || typeof entry.sessionId !== "string" || typeof entry.data !== "string" || entry.data.length === 0) {
      continue;
    }
    const terminalEntry = terminals.get(entry.sessionId);
    if (!terminalEntry) {
      missing += 1;
      continue;
    }
    terminalEntry.terminal.write(entry.data);
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
    nextSessions[index] = { ...nextSessions[index], ...nextSession };
  } else {
    nextSessions.push(nextSession);
  }
  store.setSessions(nextSessions);
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
  const blockContent = contentLines.join("\n");
  if (!blockContent) {
    return { ok: false, error: "Block custom-command content cannot be empty." };
  }

  const afterClosing = lines.slice(closingIndex + 1).join("\n").trim();
  if (afterClosing) {
    return { ok: false, error: "No content is allowed after closing '---' in block definition." };
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
    return "Commands: /new [shell], /close [id], /switch <id>, /next, /prev, /list, /rename <name>, /restart [id], /custom <name> <text>, /custom <name> + block, /help";
  }

  if (command === "list") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    const lines = sessions.map((session) => {
      const marker = session.id === activeSessionId ? "*" : " ";
      const token = formatSessionToken(session.id);
      return `${marker} [${token}] ${formatSessionDisplayName(session)} (${session.id.slice(0, 8)})`;
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
    let targetSessionId = activeSessionId;
    if (args.length > 0) {
      const resolved = resolveSessionToken(args[0], sessions);
      if (!resolved.session) {
        return resolved.error;
      }
      targetSessionId = resolved.session.id;
    }
    if (!targetSessionId) {
      return "No active session to close.";
    }
    await api.deleteSession(targetSessionId);
    removeSession(targetSessionId);
    return `Closed session ${targetSessionId.slice(0, 8)}.`;
  }

  if (command === "switch") {
    if (args.length === 0) {
      return "Usage: /switch <id>";
    }
    const resolved = resolveSessionToken(args[0], sessions);
    if (!resolved.session) {
      return resolved.error;
    }
    store.setActiveSession(resolved.session.id);
    return `Active session: [${formatSessionToken(resolved.session.id)}] ${formatSessionDisplayName(resolved.session)}.`;
  }

  if (command === "next" || command === "prev") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    const currentIndex = Math.max(
      0,
      sessions.findIndex((session) => session.id === activeSessionId)
    );
    const delta = command === "next" ? 1 : -1;
    const nextIndex = (currentIndex + delta + sessions.length) % sessions.length;
    const nextSession = sessions[nextIndex];
    store.setActiveSession(nextSession.id);
    return `Active session: [${formatSessionToken(nextSession.id)}] ${formatSessionDisplayName(nextSession)}.`;
  }

  if (command === "rename") {
    if (args.length === 0) {
      return "Usage: /rename <name>";
    }
    if (!activeSessionId) {
      return "No active session to rename.";
    }
    const name = args.join(" ").trim();
    if (!name) {
      return "Usage: /rename <name>";
    }
    const updated = await api.updateSession(activeSessionId, { name });
    upsertSession(updated);
    return `Renamed active session to ${updated.name}.`;
  }

  if (command === "restart") {
    if (sessions.length === 0) {
      return "No sessions available.";
    }
    let targetSessionId = activeSessionId;
    if (args.length > 0) {
      const resolved = resolveSessionToken(args[0], sessions);
      if (!resolved.session) {
        return resolved.error;
      }
      targetSessionId = resolved.session.id;
    }
    if (!targetSessionId) {
      return "No active session to restart.";
    }
    const restarted = await api.restartSession(targetSessionId);
    upsertSession(restarted);
    store.setActiveSession(restarted.id);
    return `Restarted session [${formatSessionToken(restarted.id)}] ${formatSessionDisplayName(restarted)}.`;
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

  if (args.length > 1) {
    return `Usage: /${commandRaw} [target]`;
  }

  try {
    const custom = await api.getCustomCommand(commandRaw);
    let targetSessionId = activeSessionId;
    if (args.length === 1) {
      const resolved = resolveSessionToken(args[0], sessions);
      if (!resolved.session) {
        return resolved.error;
      }
      targetSessionId = resolved.session.id;
    }
    if (!targetSessionId) {
      return "No active session for custom command execution.";
    }
    const payload = custom.content.endsWith("\n") ? custom.content : `${custom.content}\n`;
    await api.sendInput(targetSessionId, payload);
    return `Executed /${custom.name} on [${formatSessionToken(targetSessionId)}].`;
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
        terminals.get(event.sessionId).terminal.write(event.data);
        return;
      }

      if (event.type === "session.created" && event.session) {
        upsertSession(event.session);
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
  await bootstrapSessions();
  startWs();
}

initializeRuntime().catch(() => {
  setError("Failed to initialize application runtime.");
});

createBtn.addEventListener("click", async () => {
  try {
    debugLog("sessions.create.start");
    const session = await api.createSession();
    upsertSession(session);
    uiState.error = "";
    debugLog("sessions.create.ok", { sessionId: session.id });
  } catch {
    setError("Failed to create session.");
  }
});

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
      resetSlashHistoryNavigationState();
    } catch {
      setCommandFeedback("Failed to execute control command.");
    }
    return;
  }

  const activeSessionId = store.getState().activeSessionId;
  if (!activeSessionId) {
    return;
  }

  try {
    const payload = interpreted.data.endsWith("\n") ? interpreted.data : `${interpreted.data}\n`;
    debugLog("command.send.start", { activeSessionId, length: payload.length });
    await api.sendInput(activeSessionId, payload);
    commandInput.value = "";
    setCommandPreview("");
    uiState.error = "";
    resetSlashHistoryNavigationState();
    debugLog("command.send.ok", { activeSessionId });
  } catch {
    setError("Failed to send command.");
  }
}

function formatPreviewTarget(session) {
  return `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
}

function truncateCommandPreviewPayload(content) {
  const text = String(content || "");
  if (text.length <= COMMAND_PREVIEW_MAX_CHARS) {
    return {
      payload: text,
      truncated: false,
      omittedChars: 0
    };
  }
  const omittedChars = text.length - COMMAND_PREVIEW_MAX_CHARS;
  return {
    payload: text.slice(0, COMMAND_PREVIEW_MAX_CHARS),
    truncated: true,
    omittedChars
  };
}

async function refreshCommandPreview() {
  const rawInput = commandInput.value || "";
  const interpreted = interpretComposerInput(rawInput);
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
    setCommandPreview(`Preview unavailable for /${commandRaw}: usage /${commandRaw} [target]`);
    return;
  }

  const requestId = ++commandPreviewRequestId;
  try {
    const custom = await api.getCustomCommand(commandRaw);
    if (requestId !== commandPreviewRequestId) {
      return;
    }

    const state = store.getState();
    const sessions = state.sessions;
    let targetDescription = "";

    if (interpreted.args.length === 1) {
      const resolved = resolveSessionToken(interpreted.args[0], sessions);
      targetDescription = resolved.session
        ? formatPreviewTarget(resolved.session)
        : `unresolved (${resolved.error})`;
    } else if (state.activeSessionId) {
      const active = sessions.find((session) => session.id === state.activeSessionId);
      targetDescription = active ? formatPreviewTarget(active) : "unresolved (active session not found)";
    } else {
      targetDescription = "unresolved (no active session)";
    }

    const appendNewline = custom.content.endsWith("\n") ? "no" : "yes";
    const truncatedPayload = truncateCommandPreviewPayload(custom.content);
    const preview = [
      `Preview /${custom.name}`,
      `Target: ${targetDescription}`,
      `Append newline on send: ${appendNewline}`,
      truncatedPayload.truncated ? `Payload truncated: omitted ${truncatedPayload.omittedChars} chars.` : "",
      "Payload:",
      truncatedPayload.payload
    ]
      .filter(Boolean)
      .join("\n");
    setCommandPreview(preview);
  } catch (err) {
    if (requestId !== commandPreviewRequestId) {
      return;
    }
    if (err && err.status === 404) {
      setCommandPreview("");
      return;
    }
    setCommandPreview(`Preview unavailable for /${commandRaw}.`);
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
  resetCommandAutocompleteState();
  scheduleCommandPreview();
});
commandInput.addEventListener("keydown", (event) => {
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
    if (parseSlashInputForAutocomplete(commandInput.value || "")) {
      event.preventDefault();
      autocompleteSlashInput(event.shiftKey).catch(() => {});
    }
    return;
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
