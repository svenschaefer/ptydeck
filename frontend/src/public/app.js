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
const settingsFixedSizeEl = document.getElementById("settings-fixed-size");
const settingsColsEl = document.getElementById("settings-cols");
const settingsRowsEl = document.getElementById("settings-rows");
const settingsApplyBtn = document.getElementById("settings-apply");
const commandInput = document.getElementById("command-input");
const sendBtn = document.getElementById("send-command");
const template = document.getElementById("terminal-card-template");
const emptyStateEl = document.getElementById("empty-state");
const statusMessageEl = document.getElementById("status-message");
const commandFeedbackEl = document.getElementById("command-feedback");

const terminals = new Map();
const terminalObservers = new Map();
const resizeTimers = new Map();
const terminalSizes = new Map();
const sessionQuickIds = new Map();
let globalResizeTimer = null;
let deferredResizeTimer = null;
const SETTINGS_STORAGE_KEY = "ptydeck.settings.v1";
const TERMINAL_FONT_SIZE = 16;
const TERMINAL_LINE_HEIGHT = 1.2;
const QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
let terminalSettings = loadTerminalSettings();
const uiState = {
  loading: true,
  error: "",
  commandFeedback: ""
};

if (typeof window.Terminal !== "function") {
  setError("Terminal library failed to load.");
  throw new Error("window.Terminal is not available.");
}
if (!window.FitAddon || typeof window.FitAddon.FitAddon !== "function") {
  setError("Terminal fit addon failed to load.");
  throw new Error("window.FitAddon.FitAddon is not available.");
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
    fixedSize: Boolean(stored?.fixedSize ?? true),
    cols: clampInt(stored?.cols, 80, 20, 400),
    rows: clampInt(stored?.rows, 20, 5, 120)
  };
}

function syncSettingsUi() {
  if (settingsFixedSizeEl) {
    settingsFixedSizeEl.checked = terminalSettings.fixedSize;
  }
  if (settingsColsEl) {
    settingsColsEl.value = String(terminalSettings.cols);
  }
  if (settingsRowsEl) {
    settingsRowsEl.value = String(terminalSettings.rows);
  }
}

function readSettingsFromUi() {
  return {
    fixedSize: settingsFixedSizeEl ? settingsFixedSizeEl.checked : terminalSettings.fixedSize,
    cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
    rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120)
  };
}

function applyMountHeight(entry, rows) {
  if (!entry || !entry.mount) {
    return;
  }
  if (!terminalSettings.fixedSize) {
    entry.mount.style.height = "";
    return;
  }
  const targetPx = Math.max(160, Math.round(rows * TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT + 18));
  entry.mount.style.height = `${targetPx}px`;
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

  if (terminalSettings.fixedSize) {
    return {
      cols: terminalSettings.cols,
      rows: terminalSettings.rows
    };
  }

  entry.fitAddon.fit();
  return {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows
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

function render() {
  const state = store.getState();
  pruneQuickIds(state.sessions.map((session) => session.id));
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
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace',
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
    const fitAddon = new window.FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    debugLog("terminal.created", { sessionId: session.id });

    gridEl.appendChild(node);
    terminal.open(mount);
    terminal.onData((data) => {
      store.setActiveSession(session.id);
      api.sendInput(session.id, data).catch(() => setError("Failed to send terminal input."));
    });

    terminals.set(session.id, { terminal, fitAddon, element: node, focusBtn, quickIdEl, mount });

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

async function executeControlCommand(interpreted) {
  const command = interpreted.command.toLowerCase();
  const args = interpreted.args;
  const state = store.getState();
  const sessions = state.sessions;
  const activeSessionId = state.activeSessionId;

  if (command === "help" || command === "") {
    return "Commands: /new [shell], /close [id], /switch <id>, /next, /prev, /list, /rename <name>, /help";
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

  return `Unknown command: /${command}`;
}

async function bootstrapSessions() {
  try {
    debugLog("sessions.bootstrap.start");
    const sessions = await api.listSessions();
    store.setSessions(sessions);
    uiState.loading = false;
    uiState.error = "";
    debugLog("sessions.bootstrap.ok", { count: sessions.length });
  } catch {
    setError("Failed to load sessions.");
  }
}

store.subscribe(render);
syncSettingsUi();
render();
bootstrapSessions();

const ws = createWsClient(config.wsUrl, {
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
}, { debug: debugLogs, log: debugLog });

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
if (settingsFixedSizeEl) {
  settingsFixedSizeEl.addEventListener("change", onApplySettings);
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
      debugLog("command.control.ok", { command: interpreted.command });
      commandInput.value = "";
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
    uiState.error = "";
    debugLog("command.send.ok", { activeSessionId });
  } catch {
    setError("Failed to send command.");
  }
}

sendBtn.addEventListener("click", submitCommand);
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submitCommand();
  }
});

window.addEventListener("beforeunload", () => {
  ws.close();
  if (globalResizeTimer) {
    clearTimeout(globalResizeTimer);
  }
  if (deferredResizeTimer) {
    clearTimeout(deferredResizeTimer);
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
