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
    this.open = false;
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

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
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
  static instances = [];

  constructor(options = {}) {
    this.cols = 120;
    this.rows = 24;
    this.writes = [];
    this.refreshCalls = [];
    this.options = { ...options };
    MockTerminal.instances.push(this);
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

  write(data, callback) {
    this.writes.push(data);
    if (typeof callback === "function") {
      callback();
    }
  }

  refresh(start, end) {
    this.refreshCalls.push({ start, end });
  }

  setOption(name, value) {
    this.options[name] = value;
  }

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
  const settings = new FakeElement({ className: "session-settings", tagName: "button" });
  const rename = new FakeElement({ className: "session-rename", tagName: "button" });
  const close = new FakeElement({ className: "session-close", tagName: "button" });
  const settingsPanel = new FakeElement({ className: "session-settings-dialog", tagName: "dialog" });
  const settingsDismiss = new FakeElement({ className: "session-settings-dismiss", tagName: "button" });
  const settingsTitle = new FakeElement({ className: "session-settings-title", tagName: "p" });
  const settingsHint = new FakeElement({ className: "session-settings-hint", tagName: "p" });
  const startControls = new FakeElement({ className: "session-startup-controls", tagName: "div" });
  const startCwdLabel = new FakeElement({ className: "session-startup-label", tagName: "label" });
  const startCwd = new FakeElement({ className: "session-start-cwd", tagName: "input" });
  startCwd.value = "";
  const startCommandLabel = new FakeElement({ className: "session-startup-label", tagName: "label" });
  const startCommand = new FakeElement({ className: "session-start-command", tagName: "textarea" });
  startCommand.value = "";
  const startEnvLabel = new FakeElement({ className: "session-startup-label", tagName: "label" });
  const startEnv = new FakeElement({ className: "session-start-env", tagName: "textarea" });
  startEnv.value = "";
  const startSave = new FakeElement({ className: "session-start-save", tagName: "button" });
  const startFeedback = new FakeElement({ className: "session-start-feedback", tagName: "p" });
  const themeControls = new FakeElement({ className: "session-theme-controls", tagName: "div" });
  const themeLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeSelect = new FakeElement({ className: "session-theme-select", tagName: "select" });
  themeSelect.value = "default";
  const themeBgLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeBg = new FakeElement({ className: "session-theme-bg", tagName: "input" });
  themeBg.value = "#0a0d12";
  const themeFgLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeFg = new FakeElement({ className: "session-theme-fg", tagName: "input" });
  themeFg.value = "#d8dee9";
  const themeApply = new FakeElement({ className: "session-theme-apply", tagName: "button" });
  const settingsActions = new FakeElement({ className: "session-settings-actions", tagName: "div" });
  const mount = new FakeElement({ className: "terminal-mount", clientWidth: 920, clientHeight: 380 });
  toolbar.appendChild(quickId);
  toolbar.appendChild(focus);
  toolbar.appendChild(settings);
  settingsActions.appendChild(rename);
  settingsActions.appendChild(close);
  settingsPanel.appendChild(settingsDismiss);
  settingsPanel.appendChild(settingsTitle);
  settingsPanel.appendChild(settingsHint);
  startControls.appendChild(startCwdLabel);
  startControls.appendChild(startCwd);
  startControls.appendChild(startCommandLabel);
  startControls.appendChild(startCommand);
  startControls.appendChild(startEnvLabel);
  startControls.appendChild(startEnv);
  startControls.appendChild(startSave);
  startControls.appendChild(startFeedback);
  settingsPanel.appendChild(startControls);
  themeControls.appendChild(themeLabel);
  themeControls.appendChild(themeSelect);
  themeControls.appendChild(themeBgLabel);
  themeControls.appendChild(themeBg);
  themeControls.appendChild(themeFgLabel);
  themeControls.appendChild(themeFg);
  themeControls.appendChild(themeApply);
  settingsPanel.appendChild(themeControls);
  settingsPanel.appendChild(settingsActions);
  card.appendChild(toolbar);
  card.appendChild(settingsPanel);
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
  const commandPreview = new FakeElement({ id: "command-preview", tagName: "p" });
  const commandSuggestions = new FakeElement({ id: "command-suggestions", tagName: "pre" });
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
    commandFeedback,
    commandPreview,
    commandSuggestions
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
      commandFeedback,
      commandPreview,
      commandSuggestions
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
  MockTerminal.instances = [];

  const listeners = new Map();
  const localStorageData = new Map();
  const resizePayloads = [];
  const inputPayloads = [];
  const restartCalls = [];
  const updateSessionCalls = [];
  const customCommandUpserts = [];
  const customCommandDeletes = [];
  const customCommands = new Map();
  let listSessionsCalls = 0;
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
      listSessionsCalls += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            makeJsonResponse(200, [{ id: "s-1", shell: "bash", cwd: "~", createdAt: Date.now(), updatedAt: Date.now() }])
          );
        }, 60);
      });
    }
    if (path === "/api/v1/sessions" && options.method === "POST") {
      return makeJsonResponse(500, { error: "CreateFailed", message: "boom" });
    }
    const patchMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)$/);
    if (patchMatch && options.method === "PATCH") {
      const sessionId = decodeURIComponent(patchMatch[1]);
      const payload = JSON.parse(options.body || "{}");
      updateSessionCalls.push({ sessionId, payload });
      return makeJsonResponse(200, {
        id: sessionId,
        shell: "bash",
        cwd: "~",
        name: payload.name || "one",
        startCwd: payload.startCwd || "~",
        startCommand: payload.startCommand || "",
        env: payload.env || {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (path === "/api/v1/sessions/s-1" && options.method === "DELETE") {
      return makeJsonResponse(500, { error: "DeleteFailed", message: "boom" });
    }
    const inputMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/input$/);
    if (inputMatch && options.method === "POST") {
      const sessionId = decodeURIComponent(inputMatch[1]);
      const payload = JSON.parse(options.body || "{}");
      inputPayloads.push({ sessionId, ...payload });
      if (payload.data === "pwd\n" && sessionId === "s-1") {
        return makeJsonResponse(500, { error: "InputFailed", message: "boom" });
      }
      return makeJsonResponse(204, {});
    }
    if (path === "/api/v1/sessions/s-1/restart" && options.method === "POST") {
      restartCalls.push("s-1");
      return makeJsonResponse(200, {
        id: "s-1",
        shell: "bash",
        cwd: "~",
        name: "one",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (path.startsWith("/api/v1/custom-commands/") && options.method === "PUT") {
      const commandName = decodeURIComponent(path.slice("/api/v1/custom-commands/".length));
      const body = JSON.parse(options.body || "{}");
      customCommandUpserts.push({ commandName, content: body.content });
      const next = {
        name: commandName,
        content: body.content,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      customCommands.set(commandName, next);
      return makeJsonResponse(200, next);
    }
    if (path === "/api/v1/custom-commands" && (!options.method || options.method === "GET")) {
      return makeJsonResponse(200, Array.from(customCommands.values()));
    }
    if (path.startsWith("/api/v1/custom-commands/") && (!options.method || options.method === "GET")) {
      const commandName = decodeURIComponent(path.slice("/api/v1/custom-commands/".length));
      if (!customCommands.has(commandName)) {
        return makeJsonResponse(404, { error: "CustomCommandNotFound", message: "missing" });
      }
      return makeJsonResponse(200, customCommands.get(commandName));
    }
    if (path.startsWith("/api/v1/custom-commands/") && options.method === "DELETE") {
      const commandName = decodeURIComponent(path.slice("/api/v1/custom-commands/".length));
      if (!customCommands.has(commandName)) {
        return makeJsonResponse(404, { error: "CustomCommandNotFound", message: "missing" });
      }
      customCommands.delete(commandName);
      customCommandDeletes.push(commandName);
      return makeJsonResponse(204, {});
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
  assert.equal(fixture.elements.statusMessage.textContent, "Loading sessions...");
  await sleep(90);
  assert.equal(listSessionsCalls, 1);

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
  assert.match(fixture.elements.statusMessage.textContent, /^(Failed to send command\.|Connection state: connecting)$/);
  assert.equal(inputPayloads.length, 1);
  assert.equal(inputPayloads[0].sessionId, "s-1");
  assert.equal(inputPayloads[0].data, "pwd\r\n");

  fixture.elements.commandInput.value = "/noop";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown command: /noop");
  assert.equal(inputPayloads.length, 1);

  fixture.elements.commandInput.value = "/list";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /\[1\]/);
  assert.match(fixture.elements.statusMessage.textContent, /^(Failed to send command\.|Connection state: connecting)?$/);
  assert.equal(inputPayloads.length, 1);

  fixture.elements.commandInput.value = "/help";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Commands:/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/restart \[id\]/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/custom <name> <text>/);

  fixture.elements.commandInput.value = "/custom docu echo verify";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 1);
  assert.deepEqual(customCommandUpserts[0], { commandName: "docu", content: "echo verify" });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /docu (inline).");

  fixture.elements.commandInput.value = "/custom blockcmd\n---\nline 1\nline 2\n---";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 2);
  assert.deepEqual(customCommandUpserts[1], { commandName: "blockcmd", content: "line 1\nline 2" });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /blockcmd (block).");

  fixture.elements.commandInput.value = "/custom closeit echo close";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 3);
  assert.deepEqual(customCommandUpserts[2], { commandName: "closeit", content: "echo close" });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /closeit (inline).");

  const longPreviewPayload = "x".repeat(5000);
  fixture.elements.commandInput.value = `/custom longpreview ${longPreviewPayload}`;
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 4);
  assert.deepEqual(customCommandUpserts[3], { commandName: "longpreview", content: longPreviewPayload });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /longpreview (inline).");

  fixture.elements.commandInput.value = "/custom escdelim\n---\nline 1\n\\---\nline 3\n---";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 5);
  assert.deepEqual(customCommandUpserts[4], { commandName: "escdelim", content: "line 1\n---\nline 3" });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /escdelim (block).");

  fixture.elements.commandInput.value = "/custom broken\n---\nline 1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 5);
  assert.match(
    fixture.elements.commandFeedback.textContent,
    /^Custom command definition error: Block definition must end with a closing '---' line\.$/
  );

  fixture.elements.commandInput.value = "/custom delimedge\n---\nline 1\n---\nline 2\n---";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 5);
  assert.match(
    fixture.elements.commandFeedback.textContent,
    /^Custom command definition error: Block payload contains content after closing '---'\. For a literal delimiter line inside payload, use '\\---'\.$/
  );

  fixture.elements.commandInput.value = "/custom list";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /\/docu/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/blockcmd/);

  fixture.elements.commandInput.value = "/custom show docu";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^\/docu\n---\necho verify\n---$/);

  fixture.elements.commandInput.value = "/custom go\n---\nTake care of md's and quotes.\n---";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandUpserts.length, 6);
  assert.deepEqual(customCommandUpserts[5], {
    commandName: "go",
    content: "Take care of md's and quotes."
  });
  assert.equal(fixture.elements.commandFeedback.textContent, "Saved custom command /go (block).");

  fixture.elements.commandInput.value = "/docu";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, "echo verify");
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 2);
  assert.equal(inputPayloads[1].data, "echo verify\r\n");
  assert.match(fixture.elements.commandFeedback.textContent, /^Executed \/docu on \[1\]\./);
  assert.equal(fixture.elements.commandPreview.textContent, "");

  fixture.elements.commandInput.value = "/go";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 3);
  assert.equal(inputPayloads[2].data, "Take care of md\\'s and quotes.\r\n");
  assert.match(fixture.elements.commandFeedback.textContent, /^Executed \/go on \[1\]\./);

  fixture.elements.commandInput.value = "/custom remove docu";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(customCommandDeletes.length, 1);
  assert.equal(customCommandDeletes[0], "docu");
  assert.equal(fixture.elements.commandFeedback.textContent, "Removed custom command /docu.");

  fixture.elements.commandInput.value = "/docu";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 3);
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown command: /docu");

  fixture.elements.commandInput.value = "/longpreview";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, longPreviewPayload);

  fixture.elements.commandInput.value = "/cl";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.match(fixture.elements.commandSuggestions.textContent, /^> \/close/m);
  const inputCountBeforeSuggestionEnter = inputPayloads.length;
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "ArrowDown",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/closeit");
  assert.match(fixture.elements.commandSuggestions.textContent, /^> \/closeit/m);
  const suggestionEnterEvent = {
    type: "keydown",
    key: "Enter",
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(suggestionEnterEvent);
  await tick();
  assert.equal(suggestionEnterEvent.defaultPrevented, true);
  assert.equal(fixture.elements.commandInput.value, "/closeit");
  assert.equal(inputPayloads.length, inputCountBeforeSuggestionEnter);

  fixture.elements.commandInput.value = "/c";
  const tabForward = {
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(tabForward);
  await tick();
  assert.equal(tabForward.defaultPrevented, true);
  assert.equal(fixture.elements.commandInput.value, "/close");

  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/custom");

  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/closeit");

  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: true,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/custom");

  fixture.elements.commandInput.value = "/zzzz";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/zzzz");

  fixture.elements.commandInput.value = "/switch ";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/switch 1");

  fixture.elements.commandInput.value = "/custom show ";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/custom show blockcmd");

  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: true,
    preventDefault() {}
  });
  await tick();
  assert.match(fixture.elements.commandInput.value, /^\/custom show (escdelim|go)$/);

  fixture.elements.commandInput.value = "/closeit ";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/closeit 1");

  fixture.elements.commandInput.value = "/switch 1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /Active session:/);

  fixture.elements.commandInput.value = "/restart 1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(restartCalls.length, 1);
  assert.match(fixture.elements.commandFeedback.textContent, /^Restarted session \[1\]/);

  const arrowUpEvent = {
    type: "keydown",
    key: "ArrowUp",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.value = "/";
  fixture.elements.commandInput.dispatchEvent(arrowUpEvent);
  await tick();
  assert.equal(arrowUpEvent.defaultPrevented, true);
  assert.equal(fixture.elements.commandInput.value, "/restart 1");

  const repeatEvent = {
    type: "keydown",
    key: "Enter",
    ctrlKey: true,
    metaKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(repeatEvent);
  await tick();
  assert.equal(repeatEvent.defaultPrevented, true);
  assert.equal(restartCalls.length, 2);

  fixture.elements.commandInput.value = "/";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "ArrowUp",
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/restart 1");

  fixture.elements.commandInput.value = "/restart 1 --modified";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Enter",
    ctrlKey: true,
    metaKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(restartCalls.length, 2);
  assert.equal(fixture.elements.commandFeedback.textContent, "Repeat blocked: recalled slash command was modified.");

  const nonSlashArrowUp = {
    type: "keydown",
    key: "ArrowUp",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.value = "echo still-multiline-normal";
  fixture.elements.commandInput.dispatchEvent(nonSlashArrowUp);
  await tick();
  assert.equal(nonSlashArrowUp.defaultPrevented, false);
  assert.equal(fixture.elements.commandInput.value, "echo still-multiline-normal");

  fixture.elements.commandInput.value = "/";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "ArrowUp",
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/switch 1");
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "ArrowDown",
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/restart 1");
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "ArrowDown",
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, "/");

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
  const secondSettings = secondCard.querySelector(".session-settings");
  const secondSettingsPanel = secondCard.querySelector(".session-settings-dialog");
  const secondToolbar = secondCard.querySelector(".terminal-toolbar");
  assert.equal(secondToolbar.querySelector(".session-rename"), null);
  assert.equal(secondToolbar.querySelector(".session-close"), null);
  assert.ok(secondSettingsPanel.querySelector(".session-rename"));
  assert.ok(secondSettingsPanel.querySelector(".session-close"));
  const secondThemeSelect = secondSettingsPanel.querySelector(".session-theme-select");
  const secondThemeBg = secondSettingsPanel.querySelector(".session-theme-bg");
  const secondThemeFg = secondSettingsPanel.querySelector(".session-theme-fg");
  const secondThemeApply = secondSettingsPanel.querySelector(".session-theme-apply");
  const secondStartCwd = secondSettingsPanel.querySelector(".session-start-cwd");
  const secondStartCommand = secondSettingsPanel.querySelector(".session-start-command");
  const secondStartEnv = secondSettingsPanel.querySelector(".session-start-env");
  const secondStartSave = secondSettingsPanel.querySelector(".session-start-save");
  const secondStartFeedback = secondSettingsPanel.querySelector(".session-start-feedback");
  assert.equal(secondSettingsPanel.open, false);
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, true);
  secondThemeSelect.value = "custom";
  secondThemeSelect.dispatchEvent({ type: "change" });
  await tick();
  secondThemeBg.value = "#101010";
  secondThemeFg.value = "#e0e0e0";
  secondThemeApply.click();
  await tick();
  assert.equal(MockTerminal.instances[1].options.theme.background, "#101010");
  assert.equal(MockTerminal.instances[1].options.theme.foreground, "#e0e0e0");
  secondStartCwd.value = "/var/tmp";
  secondStartCommand.value = "echo start";
  secondStartEnv.value = "APP_MODE=dev\nFEATURE_X=1";
  secondStartSave.click();
  await tick();
  assert.equal(updateSessionCalls.length > 0, true);
  assert.deepEqual(updateSessionCalls[updateSessionCalls.length - 1], {
    sessionId: "s-2",
    payload: {
      startCwd: "/var/tmp",
      startCommand: "echo start",
      env: {
        APP_MODE: "dev",
        FEATURE_X: "1"
      }
    }
  });
  assert.equal(secondStartFeedback.textContent, "Startup settings saved.");
  secondStartEnv.value = "1INVALID=value";
  secondStartSave.click();
  await tick();
  assert.equal(updateSessionCalls.length, 1);
  assert.equal(secondStartFeedback.textContent, "Invalid env variable name '1INVALID'.");
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, false);
  const secondFocus = secondCard.querySelector(".session-focus");
  secondFocus.click();
  await tick();
  assert.equal(firstCard.classList.contains("active"), false);
  assert.equal(secondCard.classList.contains("active"), true);

  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-1", data: "\u001b[2J\u001b[H" })
  });
  await tick();
  assert.ok(MockTerminal.instances[0].writes.includes("\u001b[2J\u001b[H"));
  assert.ok(MockTerminal.instances[0].refreshCalls.length > 0);

  const routedBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@1 echo routed";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, routedBefore + 1);
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "echo routed\r\n" });
  assert.equal(secondCard.classList.contains("active"), true);
  assert.equal(fixture.elements.commandFeedback.textContent, "Sent to [1] one.");

  const unresolvedBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@does-not-exist echo routed";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, unresolvedBefore);
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown session identifier: does-not-exist");
  assert.equal(secondCard.classList.contains("active"), true);

  const persistedThemes = JSON.parse(localStorageData.get("ptydeck.session-theme.v1") || "{}");
  assert.deepEqual(persistedThemes["s-2"], {
    preset: "custom",
    custom: {
      background: "#101010",
      foreground: "#e0e0e0"
    }
  });

  ws.emit("message", { data: JSON.stringify({ type: "session.closed", sessionId: "s-2" }) });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 1);
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.created",
      session: { id: "s-2", shell: "bash", cwd: "~", name: "two", createdAt: Date.now(), updatedAt: Date.now() }
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 2);
  const reopenedSecondTerminal = MockTerminal.instances[2];
  assert.equal(reopenedSecondTerminal.options.theme.background, "#101010");
  assert.equal(reopenedSecondTerminal.options.theme.foreground, "#e0e0e0");

  ws.emit("message", { data: JSON.stringify({ type: "snapshot", sessions: [], outputs: [] }) });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 0);
  assert.equal(fixture.elements.emptyState.style.display, "block");

  ws.emit("close", {});
  await tick();

  assert.equal(fixture.elements.connectionState.textContent, "reconnecting");
  assert.equal(fixture.elements.statusMessage.textContent, "Connection state: reconnecting");
  assert.equal(listSessionsCalls, 1);
  assert.equal(win.__PTYDECK_PERF__.bootstrapRequestCount, 1);
});
