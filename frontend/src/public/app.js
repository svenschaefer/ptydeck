import { createApiClient } from "./api-client.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";
import { resolveRuntimeConfig } from "./runtime-config.js";

const config = resolveRuntimeConfig(window);
const api = createApiClient(config.apiBaseUrl);
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
const terminalObservers = new Map();
const resizeTimers = new Map();
const uiState = {
  loading: true,
  error: ""
};

function setError(message) {
  uiState.error = message;
  render();
}

function render() {
  const state = store.getState();
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
        await api.updateSession(session.id, { name: trimmed });
        const sessions = await api.listSessions();
        store.setSessions(sessions);
        uiState.error = "";
      } catch {
        setError("Failed to rename session.");
      }
    });
    closeBtn.addEventListener("click", async () => {
      try {
        await api.deleteSession(session.id);
        const sessions = await api.listSessions();
        store.setSessions(sessions);
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

    terminal.open(mount);
    terminal.onData((data) => {
      store.setActiveSession(session.id);
      api.sendInput(session.id, data).catch(() => setError("Failed to send terminal input."));
    });

    const observer = new ResizeObserver(() => {
      const cols = Math.max(20, Math.floor(mount.clientWidth / 9));
      const rows = Math.max(6, Math.floor(mount.clientHeight / 18));
      const pendingTimer = resizeTimers.get(session.id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }

      const timer = setTimeout(() => {
        api.resizeSession(session.id, cols, rows).catch(() => setError("Failed to resize terminal."));
      }, 120);
      resizeTimers.set(session.id, timer);
    });
    observer.observe(mount);

    terminals.set(session.id, { terminal, element: node, focusBtn });
    terminalObservers.set(session.id, observer);
    gridEl.appendChild(node);
  }
}

store.subscribe(render);
render();

const ws = createWsClient(config.wsUrl, {
  onState(status) {
    store.setConnectionState(status);
    if (status === "connected") {
      uiState.loading = false;
      uiState.error = "";
    }
  },
  onMessage(event) {
    if (event.type === "snapshot") {
      store.setSessions(event.sessions || []);
      return;
    }

    if (event.type === "session.data" && terminals.has(event.sessionId)) {
      terminals.get(event.sessionId).terminal.write(event.data);
      return;
    }

    if (event.type === "session.created" || event.type === "session.closed") {
      api
        .listSessions()
        .then((sessions) => {
          store.setSessions(sessions);
          uiState.error = "";
        })
        .catch(() => setError("Failed to refresh sessions from server."));
    }
  }
});

createBtn.addEventListener("click", async () => {
  try {
    await api.createSession();
    const sessions = await api.listSessions();
    store.setSessions(sessions);
    uiState.error = "";
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
    await api.sendInput(activeSessionId, payload);
    commandInput.value = "";
    uiState.error = "";
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
  for (const observer of terminalObservers.values()) {
    observer.disconnect();
  }
  for (const timer of resizeTimers.values()) {
    clearTimeout(timer);
  }
  for (const entry of terminals.values()) {
    entry.terminal.dispose();
  }
});

api
  .listSessions()
  .then((sessions) => {
    store.setSessions(sessions);
    uiState.loading = false;
    uiState.error = "";
    render();
  })
  .catch(() => {
    uiState.loading = false;
    setError("Failed to load sessions.");
  });
