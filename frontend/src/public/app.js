import { loadClientConfig } from "../config.js";
import { createApiClient } from "./api-client.js";
import { createStore } from "./store.js";
import { createWsClient } from "./ws-client.js";

const config = loadClientConfig();
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
      continue;
    }

    const node = template.content.firstElementChild.cloneNode(true);
    const focusBtn = node.querySelector(".session-focus");
    const closeBtn = node.querySelector(".session-close");
    const mount = node.querySelector(".terminal-mount");

    focusBtn.textContent = session.id.slice(0, 8);
    focusBtn.addEventListener("click", () => store.setActiveSession(session.id));
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
      fontSize: 13,
      cursorBlink: true
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

    terminals.set(session.id, { terminal, element: node });
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
  const command = commandInput.value.trim();
  const activeSessionId = store.getState().activeSessionId;
  if (!command || !activeSessionId) {
    return;
  }
  try {
    await api.sendInput(activeSessionId, `${command}\n`);
    commandInput.value = "";
    uiState.error = "";
  } catch {
    setError("Failed to send command.");
  }
}

sendBtn.addEventListener("click", submitCommand);
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
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
