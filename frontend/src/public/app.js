import { createApiClient } from "./api-client.js";
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
const commandInput = document.getElementById("command-input");
const sendBtn = document.getElementById("send-command");
const template = document.getElementById("terminal-card-template");
const emptyStateEl = document.getElementById("empty-state");
const statusMessageEl = document.getElementById("status-message");

const terminals = new Map();
const resizeTimers = new Map();
const terminalSizes = new Map();
let globalResizeTimer = null;
let deferredResizeTimer = null;
const uiState = {
  loading: true,
  error: ""
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

function computeTerminalSize(entry) {
  if (!entry || !entry.mount || entry.mount.clientWidth < 40 || entry.mount.clientHeight < 40) {
    return null;
  }

  entry.fitAddon.fit();
  return {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows
  };
}

function applyResizeForSession(sessionId) {
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
  if (previous && previous.cols === cols && previous.rows === rows) {
    return;
  }

  terminalSizes.set(sessionId, { cols, rows });
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

  const activeIds = new Set(state.sessions.map((s) => s.id));
  let shouldRunResizePass = false;
  for (const sessionId of terminals.keys()) {
    if (!activeIds.has(sessionId)) {
      const entry = terminals.get(sessionId);
      entry.terminal.dispose();
      entry.element.remove();
      terminals.delete(sessionId);
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
      continue;
    }

    const node = template.content.firstElementChild.cloneNode(true);
    const focusBtn = node.querySelector(".session-focus");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const mount = node.querySelector(".terminal-mount");

    focusBtn.textContent = session.name || session.id.slice(0, 8);
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
      fontSize: 16,
      lineHeight: 1.2,
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

    terminals.set(session.id, { terminal, fitAddon, element: node, focusBtn, mount });
    applyResizeForSession(session.id);
    shouldRunResizePass = true;
  }

  if (shouldRunResizePass) {
    scheduleGlobalResize();
    scheduleDeferredResizePasses();
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

async function submitCommand() {
  const command = commandInput.value;
  const activeSessionId = store.getState().activeSessionId;
  if (!command.trim() || !activeSessionId) {
    return;
  }
  try {
    const payload = command.endsWith("\n") ? command : `${command}\n`;
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
  for (const entry of terminals.values()) {
    entry.terminal.dispose();
  }
});

window.addEventListener("resize", scheduleGlobalResize);
