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

const terminals = new Map();
const terminalObservers = new Map();
const resizeTimers = new Map();

function render() {
  const state = store.getState();
  stateEl.textContent = state.connectionState;
  emptyStateEl.style.display = state.sessions.length === 0 ? "block" : "none";

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
      await api.deleteSession(session.id);
      const sessions = await api.listSessions();
      store.setSessions(sessions);
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
      api.sendInput(session.id, data);
    });

    const observer = new ResizeObserver(() => {
      const cols = Math.max(20, Math.floor(mount.clientWidth / 9));
      const rows = Math.max(6, Math.floor(mount.clientHeight / 18));
      const pendingTimer = resizeTimers.get(session.id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }

      const timer = setTimeout(() => {
        api.resizeSession(session.id, cols, rows);
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

const ws = createWsClient(config.wsUrl, {
  onState(status) {
    store.setConnectionState(status);
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
      api.listSessions().then((sessions) => store.setSessions(sessions));
    }
  }
});

createBtn.addEventListener("click", async () => {
  await api.createSession();
  const sessions = await api.listSessions();
  store.setSessions(sessions);
});

async function submitCommand() {
  const command = commandInput.value.trim();
  const activeSessionId = store.getState().activeSessionId;
  if (!command || !activeSessionId) {
    return;
  }
  await api.sendInput(activeSessionId, `${command}\n`);
  commandInput.value = "";
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

api.listSessions().then((sessions) => {
  store.setSessions(sessions);
});
