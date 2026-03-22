import test from "node:test";
import assert from "node:assert/strict";

class ClassList {
  constructor(initial = "") {
    this.set = new Set();
    if (initial) {
      for (const token of initial.split(/\s+/)) {
        if (token) {
          this.set.add(token);
        }
      }
    }
  }

  add(token) {
    this.set.add(token);
  }

  remove(token) {
    this.set.delete(token);
  }

  contains(token) {
    return this.set.has(token);
  }

  toggle(token, force) {
    const shouldAdd = typeof force === "boolean" ? force : !this.set.has(token);
    if (shouldAdd) {
      this.set.add(token);
    } else {
      this.set.delete(token);
    }
    return shouldAdd;
  }

  toString() {
    return Array.from(this.set).join(" ");
  }
}

class FakeElement {
  constructor({ id = "", className = "", tagName = "div", clientWidth = 900, clientHeight = 360 } = {}) {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new ClassList(className);
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.textContent = "";
    this.value = "";
    this.clientWidth = clientWidth;
    this.clientHeight = clientHeight;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const handler of list) {
      handler(event);
    }
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) {
      return null;
    }
    const className = selector.slice(1);
    if (this.classList.contains(className)) {
      return this;
    }
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) {
        return match;
      }
    }
    return null;
  }
}

class MockTerminal {
  constructor() {
    this.cols = 120;
    this.rows = 24;
  }

  loadAddon(addon) {
    this.addon = addon;
    if (addon && typeof addon.attachTerminal === "function") {
      addon.attachTerminal(this);
    }
  }

  open() {}

  onData(handler) {
    this.dataHandler = handler;
  }

  write() {}

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }

  dispose() {}
}

class MockFitAddon {
  attachTerminal(terminal) {
    this.terminal = terminal;
  }

  fit() {
    if (!this.terminal) {
      return;
    }
    this.terminal.cols = 120;
    this.terminal.rows = 24;
  }
}

class MockResizeObserver {
  constructor(handler) {
    this.handler = handler;
  }

  observe() {}

  disconnect() {}
}

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    MockWebSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  emit(type, payload = {}) {
    const list = this.listeners.get(type) || [];
    for (const handler of list) {
      handler(payload);
    }
  }

  close() {
    this.emit("close", {});
  }
}

function createTerminalCardTemplateNode() {
  const card = new FakeElement({ className: "terminal-card", tagName: "article" });
  const toolbar = new FakeElement({ className: "terminal-toolbar" });
  const quickId = new FakeElement({ className: "session-quick-id", tagName: "span" });
  const focus = new FakeElement({ className: "session-focus", tagName: "button" });
  const rename = new FakeElement({ className: "session-rename", tagName: "button" });
  const close = new FakeElement({ className: "session-close", tagName: "button" });
  const mount = new FakeElement({ className: "terminal-mount", clientWidth: 920, clientHeight: 380 });
  toolbar.appendChild(quickId);
  toolbar.appendChild(focus);
  toolbar.appendChild(rename);
  toolbar.appendChild(close);
  card.appendChild(toolbar);
  card.appendChild(mount);
  return card;
}

function createDocumentFixture() {
  const byId = new Map();

  const connectionState = new FakeElement({ id: "connection-state" });
  const terminalGrid = new FakeElement({ id: "terminal-grid" });
  const createSession = new FakeElement({ id: "create-session", tagName: "button" });
  const settingsFixedSize = new FakeElement({ id: "settings-fixed-size", tagName: "input" });
  settingsFixedSize.checked = true;
  const settingsCols = new FakeElement({ id: "settings-cols", tagName: "input" });
  settingsCols.value = "80";
  const settingsRows = new FakeElement({ id: "settings-rows", tagName: "input" });
  settingsRows.value = "20";
  const settingsApply = new FakeElement({ id: "settings-apply", tagName: "button" });
  const commandInput = new FakeElement({ id: "command-input", tagName: "textarea" });
  const sendCommand = new FakeElement({ id: "send-command", tagName: "button" });
  const emptyState = new FakeElement({ id: "empty-state" });
  const statusMessage = new FakeElement({ id: "status-message" });
  const commandFeedback = new FakeElement({ id: "command-feedback" });
  const template = {
    id: "terminal-card-template",
    content: {
      firstElementChild: {
        cloneNode() {
          return createTerminalCardTemplateNode();
        }
      }
    }
  };

  for (const element of [
    connectionState,
    terminalGrid,
    createSession,
    settingsFixedSize,
    settingsCols,
    settingsRows,
    settingsApply,
    commandInput,
    sendCommand,
    emptyState,
    statusMessage,
    commandFeedback
  ]) {
    byId.set(element.id, element);
  }
  byId.set("terminal-card-template", template);

  return {
    elements: {
      connectionState,
      terminalGrid,
      createSession,
      settingsFixedSize,
      settingsCols,
      settingsRows,
      settingsApply,
      commandInput,
      sendCommand,
      emptyState,
      statusMessage,
      commandFeedback
    },
    document: {
      getElementById(id) {
        return byId.get(id) || null;
      }
    }
  };
}

function makeJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function parsePath(url) {
  return new URL(url).pathname;
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("app handles critical error paths, DOM lifecycle, and connection state rendering", async (t) => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const previousResizeObserver = global.ResizeObserver;
  const previousWebSocket = global.WebSocket;
  const previousFetch = global.fetch;

  const fixture = createDocumentFixture();
  MockWebSocket.instances = [];

  const listeners = new Map();
  const localStorageData = new Map();
  const resizePayloads = [];
  const inputPayloads = [];
  const win = {
    document: fixture.document,
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      search: ""
    },
    __PTYDECK_CONFIG__: {
      apiBaseUrl: "http://127.0.0.1:18080/api/v1",
      wsUrl: "ws://127.0.0.1:18080/ws",
      debugLogs: false
    },
    localStorage: {
      getItem(key) {
        return localStorageData.has(key) ? localStorageData.get(key) : null;
      },
      setItem(key, value) {
        localStorageData.set(key, String(value));
      }
    },
    Terminal: MockTerminal,
    FitAddon: {
      FitAddon: MockFitAddon
    },
    prompt() {
      return null;
    },
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      const list = listeners.get(event.type) || [];
      for (const handler of list) {
        handler(event);
      }
    }
  };

  global.window = win;
  global.document = fixture.document;
  global.ResizeObserver = MockResizeObserver;
  global.WebSocket = MockWebSocket;
  global.fetch = async (url, options = {}) => {
    const path = parsePath(url);

    if (path === "/api/v1/sessions" && (!options.method || options.method === "GET")) {
      return makeJsonResponse(200, [{ id: "s-1", shell: "bash", cwd: "~", createdAt: Date.now(), updatedAt: Date.now() }]);
    }
    if (path === "/api/v1/sessions" && options.method === "POST") {
      return makeJsonResponse(500, { error: "CreateFailed", message: "boom" });
    }
    if (path === "/api/v1/sessions/s-1" && options.method === "DELETE") {
      return makeJsonResponse(500, { error: "DeleteFailed", message: "boom" });
    }
    if (path === "/api/v1/sessions/s-1/input" && options.method === "POST") {
      inputPayloads.push(JSON.parse(options.body || "{}"));
      return makeJsonResponse(500, { error: "InputFailed", message: "boom" });
    }
    if (path.endsWith("/resize")) {
      resizePayloads.push(JSON.parse(options.body || "{}"));
      return makeJsonResponse(204, {});
    }
    return makeJsonResponse(200, {});
  };

  t.after(() => {
    try {
      win.dispatchEvent({ type: "beforeunload" });
    } catch {}
    global.document = previousDocument;
    global.window = previousWindow;
    global.ResizeObserver = previousResizeObserver;
    global.WebSocket = previousWebSocket;
    global.fetch = previousFetch;
  });

  await import("../src/public/app.js?app-test");
  await tick();

  fixture.elements.createSession.click();
  await tick();
  assert.equal(fixture.elements.statusMessage.textContent, "Failed to create session.");

  const card = fixture.elements.terminalGrid.children[0];
  assert.ok(card, "expected terminal card to exist");
  const closeBtn = card.querySelector(".session-close");
  closeBtn.click();
  await tick();
  assert.equal(fixture.elements.statusMessage.textContent, "Failed to delete session.");

  fixture.elements.commandInput.value = "pwd";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.statusMessage.textContent, "Failed to send command.");
  assert.equal(inputPayloads.length, 1);

  fixture.elements.commandInput.value = "/list";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /\[1\]/);
  assert.equal(fixture.elements.statusMessage.textContent, "Failed to send command.");
  assert.equal(inputPayloads.length, 1);

  fixture.elements.commandInput.value = "/help";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Commands:/);

  fixture.elements.commandInput.value = "/switch 1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /Active session:/);

  fixture.elements.settingsCols.value = "90";
  fixture.elements.settingsRows.value = "30";
  fixture.elements.settingsApply.click();
  await sleep(260);
  assert.ok(
    resizePayloads.some((entry) => entry.cols === 90 && entry.rows === 30),
    "expected resize request with updated settings"
  );

  assert.equal(MockWebSocket.instances.length, 1);
  const ws = MockWebSocket.instances[0];
  ws.emit("open", {});

  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      sessions: [
        { id: "s-1", shell: "bash", cwd: "~", name: "one", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "s-2", shell: "bash", cwd: "~", name: "two", createdAt: Date.now(), updatedAt: Date.now() }
      ],
      outputs: []
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 2);
  assert.equal(fixture.elements.emptyState.style.display, "none");

  const firstCard = fixture.elements.terminalGrid.children[0];
  const secondCard = fixture.elements.terminalGrid.children[1];
  const firstQuickId = firstCard.querySelector(".session-quick-id");
  const secondQuickId = secondCard.querySelector(".session-quick-id");
  assert.equal(firstQuickId.textContent, "1");
  assert.equal(secondQuickId.textContent, "2");
  const secondFocus = secondCard.querySelector(".session-focus");
  secondFocus.click();
  await tick();
  assert.equal(firstCard.classList.contains("active"), false);
  assert.equal(secondCard.classList.contains("active"), true);

  ws.emit("message", { data: JSON.stringify({ type: "session.closed", sessionId: "s-2" }) });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 1);

  ws.emit("message", { data: JSON.stringify({ type: "snapshot", sessions: [], outputs: [] }) });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 0);
  assert.equal(fixture.elements.emptyState.style.display, "block");

  ws.emit("close", {});
  await tick();

  assert.equal(fixture.elements.connectionState.textContent, "reconnecting");
  assert.equal(fixture.elements.statusMessage.textContent, "Connection state: reconnecting");
});
