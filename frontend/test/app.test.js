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
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
      removeProperty(name) {
        delete this[name];
      }
    };
    this.textContent = "";
    this.value = "";
    this.clientWidth = clientWidth;
    this.clientHeight = clientHeight;
    this.listeners = new Map();
    this.open = false;
    this.hidden = false;
    this.disabled = false;
  }

  set className(value) {
    this.classList = new ClassList(String(value || ""));
  }

  get className() {
    return this.classList.toString();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
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

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  get firstChild() {
    return this.children[0] || null;
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      if (this.id === id) {
        return this;
      }
    }
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
    this.lines = [""];
    this.writes = [];
    this.refreshCalls = [];
    this.scrollToBottomCalls = 0;
    this.scrollToLineCalls = [];
    this.viewportSyncCalls = 0;
    this.clearSelectionCalls = 0;
    this.scrollAreaBaseY = 0;
    this.selected = null;
    this.options = { ...options };
    this.buffer = {
      active: {
        baseY: 0,
        ydisp: 0,
        length: 1,
        getLine: (index) => {
          const text = this.lines[index];
          if (typeof text !== "string") {
            return null;
          }
          return {
            translateToString() {
              return text;
            }
          };
        }
      }
    };
    this._core = {
      viewport: {
        syncScrollArea: () => {
          this.viewportSyncCalls += 1;
          this.scrollAreaBaseY = this.buffer.active.baseY;
        }
      }
    };
    MockTerminal.instances.push(this);
  }

  loadAddon(addon) {
    this.addon = addon;
    if (addon && typeof addon.attachTerminal === "function") {
      addon.attachTerminal(this);
    }
  }

  open(mount) {
    this.mount = mount;
  }

  onData(handler) {
    this.dataHandler = handler;
  }

  write(data, callback) {
    this.writes.push(data);
    const normalized = String(data).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    this.lines[this.lines.length - 1] += parts[0] || "";
    for (let index = 1; index < parts.length; index += 1) {
      this.lines.push(parts[index] || "");
    }
    this.buffer.active.length = this.lines.length;
    const lineBreaks = parts.length - 1;
    if (lineBreaks > 0) {
      this.buffer.active.baseY += lineBreaks;
      let currentNode = this.mount;
      let hasHiddenAncestor = false;
      while (currentNode) {
        if (currentNode.hidden === true) {
          hasHiddenAncestor = true;
          break;
        }
        currentNode = currentNode.parentNode;
      }
      if (!hasHiddenAncestor) {
        this.scrollAreaBaseY = this.buffer.active.baseY;
        this.buffer.active.ydisp = this.buffer.active.baseY;
      }
    }
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

  scrollToBottom() {
    this.scrollToBottomCalls += 1;
    this.buffer.active.ydisp = Math.min(this.buffer.active.baseY, this.scrollAreaBaseY);
  }

  scrollToLine(line) {
    this.scrollToLineCalls.push(line);
    this.buffer.active.ydisp = line;
  }

  clearSelection() {
    this.clearSelectionCalls += 1;
    this.selected = null;
  }

  select(column, row, length) {
    this.selected = { column, row, length };
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
  const stateBadge = new FakeElement({ className: "session-state-badge", tagName: "span" });
  stateBadge.hidden = true;
  const pluginBadges = new FakeElement({ className: "session-plugin-badges", tagName: "p" });
  pluginBadges.classList.add("empty");
  const settings = new FakeElement({ className: "session-settings", tagName: "button" });
  const tagList = new FakeElement({ className: "session-tag-list", tagName: "p" });
  tagList.classList.add("empty");
  const unrestoredHint = new FakeElement({ className: "session-unrestored-hint", tagName: "p" });
  unrestoredHint.hidden = true;
  const sessionStatus = new FakeElement({ className: "session-status-text", tagName: "p" });
  sessionStatus.hidden = true;
  const terminalSurface = new FakeElement({ className: "terminal-surface", tagName: "div" });
  const sessionArtifactsOverlay = new FakeElement({ className: "session-artifacts-overlay", tagName: "div" });
  sessionArtifactsOverlay.hidden = true;
  const sessionArtifacts = new FakeElement({ className: "session-artifacts", tagName: "pre" });
  sessionArtifacts.hidden = true;
  const sessionArtifactsDismiss = new FakeElement({ className: "session-artifacts-dismiss", tagName: "button" });
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
  const startTagsLabel = new FakeElement({ className: "session-startup-label", tagName: "label" });
  const startTags = new FakeElement({ className: "session-tags-input", tagName: "input" });
  startTags.value = "";
  const startSendTerminatorLabel = new FakeElement({ className: "session-startup-label", tagName: "label" });
  const startSendTerminator = new FakeElement({ className: "session-send-terminator", tagName: "select" });
  startSendTerminator.value = "auto";
  const startFeedback = new FakeElement({ className: "session-start-feedback", tagName: "p" });
  const themeControls = new FakeElement({ className: "session-theme-controls", tagName: "div" });
  const themeCategoryLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeCategory = new FakeElement({ className: "session-theme-category", tagName: "select" });
  themeCategory.value = "all";
  const themeSearchLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeSearch = new FakeElement({ className: "session-theme-search", tagName: "input" });
  themeSearch.value = "";
  const themeLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeSelect = new FakeElement({ className: "session-theme-select", tagName: "select" });
  themeSelect.value = "ptydeck-default";
  const themeBgLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeBg = new FakeElement({ className: "session-theme-bg", tagName: "input" });
  themeBg.value = "#0a0d12";
  const themeFgLabel = new FakeElement({ className: "session-theme-label", tagName: "label" });
  const themeFg = new FakeElement({ className: "session-theme-fg", tagName: "input" });
  themeFg.value = "#d8dee9";
  const settingsFooter = new FakeElement({ className: "session-settings-footer", tagName: "div" });
  const settingsStatus = new FakeElement({ className: "session-settings-status", tagName: "p" });
  const settingsCancel = new FakeElement({ className: "session-settings-cancel", tagName: "button" });
  const settingsApply = new FakeElement({ className: "session-settings-apply", tagName: "button" });
  const mount = new FakeElement({ className: "terminal-mount", clientWidth: 920, clientHeight: 380 });
  toolbar.appendChild(quickId);
  toolbar.appendChild(focus);
  toolbar.appendChild(stateBadge);
  toolbar.appendChild(pluginBadges);
  toolbar.appendChild(sessionStatus);
  toolbar.appendChild(tagList);
  toolbar.appendChild(settings);
  settingsPanel.appendChild(settingsDismiss);
  settingsPanel.appendChild(settingsTitle);
  settingsPanel.appendChild(settingsHint);
  startControls.appendChild(startCwdLabel);
  startControls.appendChild(startCwd);
  startControls.appendChild(startCommandLabel);
  startControls.appendChild(startCommand);
  startControls.appendChild(startEnvLabel);
  startControls.appendChild(startEnv);
  startControls.appendChild(startTagsLabel);
  startControls.appendChild(startTags);
  startControls.appendChild(startSendTerminatorLabel);
  startControls.appendChild(startSendTerminator);
  startControls.appendChild(startFeedback);
  settingsPanel.appendChild(startControls);
  themeControls.appendChild(themeCategoryLabel);
  themeControls.appendChild(themeCategory);
  themeControls.appendChild(themeSearchLabel);
  themeControls.appendChild(themeSearch);
  themeControls.appendChild(themeLabel);
  themeControls.appendChild(themeSelect);
  themeControls.appendChild(themeBgLabel);
  themeControls.appendChild(themeBg);
  themeControls.appendChild(themeFgLabel);
  themeControls.appendChild(themeFg);
  settingsFooter.appendChild(settingsStatus);
  settingsFooter.appendChild(settingsCancel);
  settingsFooter.appendChild(settingsApply);
  settingsPanel.appendChild(themeControls);
  settingsPanel.appendChild(rename);
  settingsPanel.appendChild(close);
  settingsPanel.appendChild(settingsFooter);
  sessionArtifactsOverlay.appendChild(sessionArtifactsDismiss);
  sessionArtifactsOverlay.appendChild(sessionArtifacts);
  terminalSurface.appendChild(mount);
  terminalSurface.appendChild(sessionArtifactsOverlay);
  card.appendChild(toolbar);
  card.appendChild(unrestoredHint);
  card.appendChild(settingsPanel);
  card.appendChild(terminalSurface);
  return card;
}

function createDocumentFixture() {
  const byId = new Map();

  const appShell = new FakeElement({ className: "app-shell" });
  const connectionState = new FakeElement({ id: "connection-state" });
  const terminalGrid = new FakeElement({ id: "terminal-grid" });
  const sidebarToggle = new FakeElement({ id: "sidebar-toggle", tagName: "button" });
  const sidebarToggleIcon = new FakeElement({ id: "sidebar-toggle-icon", tagName: "span" });
  const sidebarLauncher = new FakeElement({ id: "sidebar-launcher", tagName: "button" });
  const createSession = new FakeElement({ id: "create-session", tagName: "button" });
  const deckTabs = new FakeElement({ id: "deck-tabs" });
  const deckCreate = new FakeElement({ id: "deck-create", tagName: "button" });
  const deckRename = new FakeElement({ id: "deck-rename", tagName: "button" });
  const deckDelete = new FakeElement({ id: "deck-delete", tagName: "button" });
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
  const terminalSearchInput = new FakeElement({ id: "terminal-search-input", tagName: "input" });
  const terminalSearchPrev = new FakeElement({ id: "terminal-search-prev", tagName: "button" });
  const terminalSearchNext = new FakeElement({ id: "terminal-search-next", tagName: "button" });
  const terminalSearchClear = new FakeElement({ id: "terminal-search-clear", tagName: "button" });
  const terminalSearchStatus = new FakeElement({ id: "terminal-search-status", tagName: "p" });
  const commandInlineHint = new FakeElement({ id: "command-inline-hint" });
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
    sidebarToggle,
    sidebarToggleIcon,
    sidebarLauncher,
    createSession,
    deckTabs,
    deckCreate,
    deckRename,
    deckDelete,
    settingsCols,
    settingsRows,
    settingsApply,
    commandInput,
    sendCommand,
    emptyState,
    statusMessage,
    commandFeedback,
    terminalSearchInput,
    terminalSearchPrev,
    terminalSearchNext,
    terminalSearchClear,
    terminalSearchStatus,
    commandInlineHint,
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
      sidebarToggle,
      sidebarToggleIcon,
      sidebarLauncher,
      createSession,
      deckTabs,
      deckCreate,
      deckRename,
      deckDelete,
      settingsCols,
      settingsRows,
      settingsApply,
      commandInput,
      sendCommand,
      emptyState,
      statusMessage,
      commandFeedback,
      terminalSearchInput,
      terminalSearchPrev,
      terminalSearchNext,
      terminalSearchClear,
      terminalSearchStatus,
      commandInlineHint,
      commandPreview,
      commandSuggestions
    },
    document: {
      getElementById(id) {
        return byId.get(id) || null;
      },
      querySelector(selector) {
        if (selector === ".app-shell") {
          return appShell;
        }
        return null;
      },
      createElement(tagName) {
        if (String(tagName).toLowerCase() === "canvas") {
          return {
            getContext() {
              return null;
            }
          };
        }
        return new FakeElement({ tagName });
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

function findDeckGroup(deckTabs, deckId) {
  return deckTabs.children.find((entry) => entry.getAttribute("data-deck-id") === deckId) || null;
}

function findDeckSessionButton(deckTabs, deckId, sessionId) {
  const group = findDeckGroup(deckTabs, deckId);
  if (!group) {
    return null;
  }
  for (const child of group.children) {
    if (!child.classList || !child.classList.contains("deck-session-list")) {
      continue;
    }
    for (const sessionButton of child.children) {
      if (sessionButton.getAttribute("data-session-id") === sessionId) {
        return sessionButton;
      }
    }
  }
  return null;
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
  let listCustomCommandCalls = 0;
  let getCustomCommandCalls = 0;
  const deckDeleteCalls = [];
  const moveSessionCalls = [];
  const sessionDeckById = new Map([
    ["s-1", "default"],
    ["s-2", "default"]
  ]);
  const customCommands = new Map();
  let deckState = [
    {
      id: "default",
      name: "Default",
      settings: { terminal: { cols: 80, rows: 20 } },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  let listSessionsCalls = 0;
  const browserNotifications = [];
  class MockNotification {
    static permission = "granted";

    constructor(title, options = {}) {
      browserNotifications.push({ title, options });
    }
  }
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
      debugLogs: false,
      activityCompletionNotificationWindowMs: 5
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
    Notification: MockNotification,
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
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const method = options.method || "GET";

    if (path === "/api/v1/decks" && method === "GET") {
      return makeJsonResponse(200, deckState);
    }
    if (path === "/api/v1/decks" && method === "POST") {
      const payload = JSON.parse(options.body || "{}");
      const created = {
        id: String(payload.id || "deck-new"),
        name: String(payload.name || "Deck"),
        settings: payload.settings || {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      deckState = [...deckState, created];
      return makeJsonResponse(201, created);
    }
    const deckPatchMatch = path.match(/^\/api\/v1\/decks\/([^/]+)$/);
    if (deckPatchMatch && method === "PATCH") {
      const deckId = decodeURIComponent(deckPatchMatch[1]);
      const payload = JSON.parse(options.body || "{}");
      const existing = deckState.find((entry) => entry.id === deckId) || {
        id: deckId,
        name: deckId,
        settings: {},
        createdAt: Date.now()
      };
      const nextDeck = {
        ...existing,
        name: typeof payload.name === "string" ? payload.name : existing.name,
        settings: payload.settings && typeof payload.settings === "object" ? payload.settings : existing.settings,
        updatedAt: Date.now()
      };
      deckState = deckState.map((entry) => (entry.id === deckId ? nextDeck : entry));
      return makeJsonResponse(200, nextDeck);
    }
    if (deckPatchMatch && method === "DELETE") {
      const deckId = decodeURIComponent(deckPatchMatch[1]);
      const forceValue = requestUrl.searchParams.get("force");
      const force = forceValue === "true";
      deckDeleteCalls.push({ deckId, force });
      const target = deckState.find((entry) => entry.id === deckId);
      if (!target) {
        return makeJsonResponse(404, { error: "NotFound", message: "deck not found" });
      }
      const hasSessions = Array.from(sessionDeckById.values()).some((value) => value === deckId);
      if (hasSessions && !force) {
        return makeJsonResponse(409, { error: "DeckNotEmpty", message: "deck is not empty" });
      }
      if (hasSessions && force) {
        for (const [sessionId, assignedDeckId] of sessionDeckById.entries()) {
          if (assignedDeckId === deckId) {
            sessionDeckById.set(sessionId, "default");
          }
        }
      }
      deckState = deckState.filter((entry) => entry.id !== deckId);
      return makeJsonResponse(204, null);
    }
    const moveMatch = path.match(/^\/api\/v1\/decks\/([^/]+)\/sessions\/([^/]+):move$/);
    if (moveMatch && method === "POST") {
      const deckId = decodeURIComponent(moveMatch[1]);
      const sessionId = decodeURIComponent(moveMatch[2]);
      moveSessionCalls.push({ deckId, sessionId });
      sessionDeckById.set(sessionId, deckId);
      return makeJsonResponse(200, {
        id: sessionId,
        deckId,
        state: "active",
        shell: "bash",
        cwd: "~",
        name: sessionId === "s-2" ? "two" : "one",
        tags: sessionId === "s-2" ? ["beta", "ops"] : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    if (path === "/api/v1/sessions" && method === "GET") {
      listSessionsCalls += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            makeJsonResponse(200, [{ id: "s-1", state: "active", shell: "bash", cwd: "~", tags: [], createdAt: Date.now(), updatedAt: Date.now() }])
          );
        }, 60);
      });
    }
    if (path === "/api/v1/sessions" && method === "POST") {
      return makeJsonResponse(500, { error: "CreateFailed", message: "boom" });
    }
    const patchMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)$/);
    if (patchMatch && method === "GET") {
      const sessionId = decodeURIComponent(patchMatch[1]);
      return makeJsonResponse(200, {
        id: sessionId,
        deckId: sessionDeckById.get(sessionId) || "default",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: sessionId === "s-2" ? "two" : sessionId === "ops" ? "ops-node" : "one",
        tags: sessionId === "s-2" ? ["beta", "ops"] : sessionId === "ops" ? ["ops"] : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (patchMatch && method === "PATCH") {
      const sessionId = decodeURIComponent(patchMatch[1]);
      const payload = JSON.parse(options.body || "{}");
      updateSessionCalls.push({ sessionId, payload });
      return makeJsonResponse(200, {
        id: sessionId,
        state: "active",
        shell: "bash",
        cwd: "~",
        name: payload.name || "one",
        startCwd: payload.startCwd || "~",
        startCommand: payload.startCommand || "",
        env: payload.env || {},
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        themeProfile: payload.themeProfile || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (path === "/api/v1/sessions/s-1" && method === "DELETE") {
      return makeJsonResponse(500, { error: "DeleteFailed", message: "boom" });
    }
    const inputMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/input$/);
    if (inputMatch && method === "POST") {
      const sessionId = decodeURIComponent(inputMatch[1]);
      const payload = JSON.parse(options.body || "{}");
      inputPayloads.push({ sessionId, ...payload });
      if ((payload.data === "pwd\r" || payload.data === "pwd\r\n" || payload.data === "pwd\n") && sessionId === "s-1") {
        return makeJsonResponse(500, { error: "InputFailed", message: "boom" });
      }
      return makeJsonResponse(204, {});
    }
    const restartMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/restart$/);
    if (restartMatch && method === "POST") {
      const sessionId = decodeURIComponent(restartMatch[1]);
      restartCalls.push(sessionId);
      return makeJsonResponse(200, {
        id: sessionId,
        deckId: sessionDeckById.get(sessionId) || "default",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: sessionId === "s-2" ? "two" : "one",
        tags: sessionId === "s-2" ? ["beta", "ops"] : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (path.startsWith("/api/v1/custom-commands/") && method === "PUT") {
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
    if (path === "/api/v1/custom-commands" && method === "GET") {
      listCustomCommandCalls += 1;
      return makeJsonResponse(200, Array.from(customCommands.values()));
    }
    if (path.startsWith("/api/v1/custom-commands/") && method === "GET") {
      getCustomCommandCalls += 1;
      const commandName = decodeURIComponent(path.slice("/api/v1/custom-commands/".length));
      if (!customCommands.has(commandName)) {
        return makeJsonResponse(404, { error: "CustomCommandNotFound", message: "missing" });
      }
      return makeJsonResponse(200, customCommands.get(commandName));
    }
    if (path.startsWith("/api/v1/custom-commands/") && method === "DELETE") {
      const commandName = decodeURIComponent(path.slice("/api/v1/custom-commands/".length));
      if (!customCommands.has(commandName)) {
        return makeJsonResponse(404, { error: "CustomCommandNotFound", message: "missing" });
      }
      customCommands.delete(commandName);
      customCommandDeletes.push(commandName);
      return makeJsonResponse(204, {});
    }
    const resizeMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/resize$/);
    if (resizeMatch && method === "POST") {
      const sessionId = decodeURIComponent(resizeMatch[1]);
      resizePayloads.push({ sessionId, ...JSON.parse(options.body || "{}") });
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
  await sleep(320);
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
  assert.equal(inputPayloads[0].data, "pwd\r");

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
  assert.match(fixture.elements.commandFeedback.textContent, /\/size <cols> <rows>/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/filter \[id\/tag/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/restart \[selector/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/rename <selector> <name>/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/deck list\|new\|rename\|switch\|delete/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/move <sessionSelector> <deckSelector>/);
  assert.match(fixture.elements.commandFeedback.textContent, /\/settings apply <selector\|active> <json>/);
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
  assert.equal(listCustomCommandCalls, 0);

  fixture.elements.commandInput.value = "/custom show docu";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^\/docu\n---\necho verify\n---$/);
  assert.equal(getCustomCommandCalls, 0);

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
  assert.equal(getCustomCommandCalls, 0);
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 2);
  assert.equal(inputPayloads[1].data, "echo verify\r");
  assert.match(fixture.elements.commandFeedback.textContent, /^Executed \/docu on \[1\]\./);
  assert.equal(fixture.elements.commandPreview.textContent, "");

  fixture.elements.commandInput.value = "/blockcmd";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 3);
  assert.equal(inputPayloads[2].data, "line 1\nline 2\r");
  assert.match(fixture.elements.commandFeedback.textContent, /^Executed \/blockcmd on \[1\]\./);

  fixture.elements.commandInput.value = "/go";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, 4);
  assert.equal(inputPayloads[3].data, "Take care of md\\'s and quotes.\r");
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
  assert.equal(inputPayloads.length, 4);
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown command: /docu");

  fixture.elements.commandInput.value = "/longpreview";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, longPreviewPayload);
  assert.equal(getCustomCommandCalls, 0);

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
  const suggestionArrowUpEvent = {
    type: "keydown",
    key: "ArrowUp",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(suggestionArrowUpEvent);
  await tick();
  assert.equal(suggestionArrowUpEvent.defaultPrevented, true);
  assert.equal(fixture.elements.commandInput.value, "/close");
  assert.match(fixture.elements.commandSuggestions.textContent, /^> \/close/m);
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
  assert.equal(fixture.elements.commandInput.value, "/close");
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

  fixture.elements.commandInput.value = "echo /switch";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandSuggestions.textContent, "");
  assert.equal(fixture.elements.commandPreview.textContent, "");
  const nonSlashTabEvent = {
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(nonSlashTabEvent);
  await tick();
  assert.equal(nonSlashTabEvent.defaultPrevented, false);
  assert.equal(fixture.elements.commandInput.value, "echo /switch");

  fixture.elements.commandInput.value = "echo alpha\n/switch 2";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandSuggestions.textContent, "");
  assert.equal(fixture.elements.commandPreview.textContent, "");
  const multilineNonSlashTabEvent = {
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  fixture.elements.commandInput.dispatchEvent(multilineNonSlashTabEvent);
  await tick();
  assert.equal(multilineNonSlashTabEvent.defaultPrevented, false);
  assert.equal(fixture.elements.commandInput.value, "echo alpha\n/switch 2");

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
  assert.match(fixture.elements.commandInput.value, /^\/custom show (escdelim|go|longpreview)$/);

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

  fixture.elements.commandInput.value = "/rename renamed-active";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Renamed active session to renamed-active\.$/);

  fixture.elements.commandInput.value = "/rename 1 renamed-target";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Renamed session \[1\] to renamed-target\.$/);

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
  assert.match(
    fixture.elements.commandInput.value,
    /^\/(switch 1|rename renamed-active|rename 1 renamed-target)$/
  );
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
  await sleep(520);
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
        { id: "s-1", state: "active", shell: "bash", cwd: "~", name: "one", tags: ["alpha"], createdAt: Date.now(), updatedAt: Date.now() },
        { id: "s-2", state: "active", shell: "bash", cwd: "~", name: "two", tags: ["beta", "ops"], createdAt: Date.now(), updatedAt: Date.now() }
      ],
      customCommands: Array.from(customCommands.values()),
      outputs: []
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 2);
  assert.equal(fixture.elements.emptyState.style.display, "none");
  assert.equal(fixture.elements.deckTabs.children.length, 1);
  assert.ok(findDeckGroup(fixture.elements.deckTabs, "default"));
  assert.ok(findDeckSessionButton(fixture.elements.deckTabs, "default", "s-1"));
  assert.ok(findDeckSessionButton(fixture.elements.deckTabs, "default", "s-2"));
  assert.equal(
    findDeckSessionButton(fixture.elements.deckTabs, "default", "s-1").querySelector(".session-quick-id").textContent,
    "1"
  );
  assert.equal(
    findDeckSessionButton(fixture.elements.deckTabs, "default", "s-2").querySelector(".session-quick-id").textContent,
    "2"
  );

  ws.emit("message", {
    data: JSON.stringify({
      type: "custom-command.created",
      command: {
        name: "remote",
        content: "echo remote",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();

  fixture.elements.commandInput.value = "/custom show remote";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "/remote\n---\necho remote\n---");
  assert.equal(getCustomCommandCalls, 0);

  fixture.elements.commandInput.value = "/remote";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, "echo remote");
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads[inputPayloads.length - 1].data, "echo remote\r");

  ws.emit("message", {
    data: JSON.stringify({
      type: "custom-command.updated",
      command: {
        name: "remote",
        content: "echo remote-updated",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  fixture.elements.commandInput.value = "/remote";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, "echo remote-updated");

  ws.emit("message", {
    data: JSON.stringify({
      type: "custom-command.deleted",
      command: {
        name: "remote",
        content: "",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, "");

  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      sessions: [
        { id: "s-1", state: "active", shell: "bash", cwd: "~", name: "one", tags: ["alpha"], createdAt: Date.now(), updatedAt: Date.now() },
        { id: "s-2", state: "active", shell: "bash", cwd: "~", name: "two", tags: ["beta", "ops"], createdAt: Date.now(), updatedAt: Date.now() }
      ],
      customCommands: [
        { name: "snaponly", content: "echo snapshot", createdAt: Date.now(), updatedAt: Date.now() }
      ],
      outputs: []
    })
  });
  await tick();
  await sleep(160);
  fixture.elements.commandInput.value = "/custom list";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "/snaponly");
  assert.equal(listCustomCommandCalls, 0);

  fixture.elements.commandInput.value = "/blockcmd";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown command: /blockcmd");

  fixture.elements.commandInput.value = "/snaponly";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads[inputPayloads.length - 1].data, "echo snapshot\r");

  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      sessions: [
        { id: "s-1", state: "active", shell: "bash", cwd: "~", name: "one", tags: ["alpha"], createdAt: Date.now(), updatedAt: Date.now() },
        { id: "s-2", state: "active", shell: "bash", cwd: "~", name: "two", tags: ["beta", "ops"], createdAt: Date.now(), updatedAt: Date.now() }
      ],
      customCommands: Array.from(customCommands.values()),
      outputs: []
    })
  });
  await tick();

  const firstCard = fixture.elements.terminalGrid.children[0];
  const secondCard = fixture.elements.terminalGrid.children[1];
  fixture.elements.commandInput.value = "/filter alpha";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Display filter active \(1\/2\): alpha$/);
  assert.equal(firstCard.hidden, false);
  assert.equal(secondCard.hidden, true);
  assert.equal(fixture.elements.emptyState.style.display, "none");

  fixture.elements.commandInput.value = "/filter s-2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^Display filter active \(1\/2\): s-2$/);
  assert.equal(firstCard.hidden, true);
  assert.equal(secondCard.hidden, false);

  fixture.elements.commandInput.value = "/filter";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Display filter cleared.");
  assert.equal(firstCard.hidden, false);
  assert.equal(secondCard.hidden, false);

  fixture.elements.commandInput.value = "/size 80 50";
  fixture.elements.sendCommand.click();
  await sleep(520);
  assert.equal(fixture.elements.commandFeedback.textContent, "Terminal size set to 80x50 (cols x rows) for deck 'Default'.");
  assert.ok(
    resizePayloads.some((entry) => entry.cols === 80 && entry.rows === 50),
    "expected resize request for /size 80 50"
  );

  fixture.elements.commandInput.value = "/size c90";
  fixture.elements.sendCommand.click();
  await sleep(520);
  assert.equal(fixture.elements.commandFeedback.textContent, "Terminal size set to 90x50 (cols x rows) for deck 'Default'.");
  assert.ok(
    resizePayloads.some((entry) => entry.cols === 90 && entry.rows === 50),
    "expected resize request for /size c90"
  );

  fixture.elements.commandInput.value = "/size r30";
  fixture.elements.sendCommand.click();
  await sleep(520);
  assert.equal(fixture.elements.commandFeedback.textContent, "Terminal size set to 90x30 (cols x rows) for deck 'Default'.");
  assert.ok(
    resizePayloads.some((entry) => entry.cols === 90 && entry.rows === 30),
    "expected resize request for /size r30"
  );

  fixture.elements.commandInput.value = "/deck list";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /^\* \[default\] Default \(2 sessions\)$/);

  const restartCountBeforeDedupe = restartCalls.length;
  fixture.elements.commandInput.value = "/restart deck:default,1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Restarted 2 sessions.");
  const restartSlice = restartCalls.slice(restartCountBeforeDedupe);
  assert.equal(restartSlice.length, 2);
  assert.equal(new Set(restartSlice).size, 2);
  assert.ok(restartSlice.includes("s-1"));
  assert.ok(restartSlice.includes("s-2"));

  fixture.elements.commandInput.value = "/deck new Ops";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Created deck [deck-new] Ops.");
  assert.equal(
    fixture.elements.deckTabs.children.filter((entry) => entry.getAttribute("data-deck-id") === "deck-new").length,
    1
  );
  ws.emit("message", {
    data: JSON.stringify({
      type: "deck.created",
      deck: {
        id: "deck-new",
        name: "Ops",
        settings: { terminal: { cols: 101, rows: 33 } },
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  assert.equal(
    fixture.elements.deckTabs.children.filter((entry) => entry.getAttribute("data-deck-id") === "deck-new").length,
    1
  );

  fixture.elements.commandInput.value = "/deck switch deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [deck-new] Ops.");
  assert.equal(fixture.elements.emptyState.textContent, "No sessions in active deck.");

  fixture.elements.commandInput.value = "/switch s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown session identifier: s-1");

  fixture.elements.commandInput.value = "/switch default::s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active session: [1] one.");

  fixture.elements.commandInput.value = "/move s-2 deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Moved session [2] to deck [deck-new] Ops.");
  assert.deepEqual(moveSessionCalls[moveSessionCalls.length - 1], { deckId: "deck-new", sessionId: "s-2" });
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.updated",
      session: {
        id: "s-2",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: "two",
        tags: ["beta", "ops"],
        deckId: "deck-new",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  assert.equal(findDeckSessionButton(fixture.elements.deckTabs, "default", "s-2"), null);
  assert.ok(findDeckSessionButton(fixture.elements.deckTabs, "deck-new", "s-2"));

  fixture.elements.commandInput.value = ">2";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.match(fixture.elements.commandPreview.textContent, /^Target session: \[2\] two deck \[deck-new\] Ops$/);
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active session: [2] two.");

  fixture.elements.commandInput.value = ">deck-new";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(fixture.elements.commandPreview.textContent, "Already active: [deck-new] Ops");
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Deck already active: [deck-new] Ops.");

  fixture.elements.commandInput.value = ">ops";
  fixture.elements.commandInput.dispatchEvent({ type: "input" });
  await sleep(160);
  assert.equal(
    fixture.elements.commandPreview.textContent,
    "Ambiguous quick-switch target: 'ops' matches both a session and a deck. Use 'deck:ops' for the deck target."
  );
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(
    fixture.elements.commandFeedback.textContent,
    "Ambiguous quick-switch target: 'ops' matches both a session and a deck. Use 'deck:ops' for the deck target."
  );

  fixture.elements.commandInput.value = ">deck-new::";
  fixture.elements.commandInput.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {}
  });
  await tick();
  assert.equal(fixture.elements.commandInput.value, ">deck-new::2");

  fixture.elements.commandInput.value = ">default";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [default] Default.");

  fixture.elements.commandInput.value = ">deck-new::2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active session: [2] two.");

  fixture.elements.commandInput.value = ">default";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [default] Default.");

  const deckNewSessionButton = findDeckSessionButton(fixture.elements.deckTabs, "deck-new", "s-2");
  assert.ok(deckNewSessionButton);
  assert.equal(deckNewSessionButton.querySelector(".session-quick-id").textContent, "2");
  ws.emit("message", { data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "ops-noise-1\n" }) });
  ws.emit("message", { data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "ops-noise-2\n" }) });
  ws.emit("message", { data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "ops-noise-3\n" }) });
  await tick();
  deckNewSessionButton.click();
  await tick();
  const visibleAfterDeckSidebarSwitch = fixture.elements.terminalGrid.children.filter((entry) => entry.hidden === false);
  assert.equal(visibleAfterDeckSidebarSwitch.length, 1);
  assert.equal(visibleAfterDeckSidebarSwitch[0].querySelector(".session-focus").textContent, "two");
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "deck-new").querySelector(".deck-tab").classList.contains("active"), true);
  assert.equal(findDeckSessionButton(fixture.elements.deckTabs, "deck-new", "s-2").classList.contains("active"), true);

  const defaultSessionButton = findDeckSessionButton(fixture.elements.deckTabs, "default", "s-1");
  assert.ok(defaultSessionButton);
  defaultSessionButton.click();
  await tick();
  const visibleAfterDefaultSidebarSwitch = fixture.elements.terminalGrid.children.filter((entry) => entry.hidden === false);
  assert.equal(visibleAfterDefaultSidebarSwitch.length, 1);
  assert.equal(visibleAfterDefaultSidebarSwitch[0].querySelector(".session-focus").textContent, "one");
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "default").querySelector(".deck-tab").classList.contains("active"), true);
  assert.equal(findDeckSessionButton(fixture.elements.deckTabs, "default", "s-1").classList.contains("active"), true);

  fixture.elements.commandInput.value = "/filter s-2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown session id/tag: s-2");

  fixture.elements.commandInput.value = "/filter deck-new::s-2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Display filter active (1/1): deck-new::s-2");

  fixture.elements.commandInput.value = "@s-1 echo local-scope";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown session identifier: s-1");

  fixture.elements.commandInput.value = "@default::s-1 echo cross-deck";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads[inputPayloads.length - 1].sessionId, "s-1");
  assert.equal(inputPayloads[inputPayloads.length - 1].data, "echo cross-deck\r");

  fixture.elements.commandInput.value = "/move s-2 default";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Moved session [2] to deck [default] Default.");
  assert.deepEqual(moveSessionCalls[moveSessionCalls.length - 1], { deckId: "default", sessionId: "s-2" });

  fixture.elements.commandInput.value = "/move s-2 deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Moved session [2] to deck [deck-new] Ops.");
  assert.ok(findDeckSessionButton(fixture.elements.deckTabs, "deck-new", "s-2"));

  fixture.elements.commandInput.value = "/deck switch deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [deck-new] Ops.");
  const visibleDeckNewCards = fixture.elements.terminalGrid.children.filter((entry) => entry.hidden === false);
  assert.equal(visibleDeckNewCards.length, 1);
  assert.equal(visibleDeckNewCards[0].classList.contains("active"), true);
  fixture.elements.commandInput.value = "/size 101 33";
  fixture.elements.sendCommand.click();
  await sleep(520);
  assert.equal(fixture.elements.commandFeedback.textContent, "Terminal size set to 101x33 (cols x rows) for deck 'Ops'.");

  fixture.elements.commandInput.value = "/deck switch default";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [default] Default.");
  assert.equal(fixture.elements.settingsCols.value, "90");
  assert.equal(fixture.elements.settingsRows.value, "30");
  await sleep(320);
  assert.equal(MockTerminal.instances[1].cols, 101);
  assert.equal(MockTerminal.instances[1].rows, 33);

  fixture.elements.commandInput.value = "/deck switch deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.settingsCols.value, "101");
  assert.equal(fixture.elements.settingsRows.value, "33");

  fixture.elements.commandInput.value = "/deck switch default";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [default] Default.");

  const hiddenDeckTerminal = MockTerminal.instances[1];
  const hiddenRefreshCountBefore = hiddenDeckTerminal.refreshCalls.length;
  const hiddenScrollCountBefore = hiddenDeckTerminal.scrollToBottomCalls;
  const hiddenViewportSyncCountBefore = hiddenDeckTerminal.viewportSyncCalls;
  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "background-1\nbackground-2\n" })
  });
  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "Working on hidden deck sync...\n" })
  });
  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "Summary: hidden deck output recovered\n" })
  });
  await tick();
  assert.ok(hiddenDeckTerminal.writes.includes("background-1\nbackground-2\n"));
  assert.ok(
    hiddenDeckTerminal.scrollAreaBaseY < hiddenDeckTerminal.buffer.active.baseY,
    "expected hidden terminal scroll area to remain stale until viewport recovery runs"
  );

  fixture.elements.commandInput.value = "/deck switch deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  await sleep(320);
  assert.equal(fixture.elements.commandFeedback.textContent, "Active deck: [deck-new] Ops.");
  assert.ok(
    hiddenDeckTerminal.refreshCalls.length > hiddenRefreshCountBefore,
    "expected hidden deck terminal refresh recovery after deck switch"
  );
  assert.ok(
    hiddenDeckTerminal.scrollToBottomCalls > hiddenScrollCountBefore,
    "expected hidden deck terminal scroll recovery after deck switch"
  );
  assert.ok(
    hiddenDeckTerminal.viewportSyncCalls > hiddenViewportSyncCountBefore,
    "expected hidden deck terminal viewport sync after deck switch"
  );
  assert.equal(
    hiddenDeckTerminal.scrollAreaBaseY,
    hiddenDeckTerminal.buffer.active.baseY,
    "expected hidden deck terminal scroll area to catch up to appended output"
  );
  assert.equal(
    hiddenDeckTerminal.buffer.active.ydisp,
    hiddenDeckTerminal.buffer.active.baseY,
    "expected hidden deck terminal to reach appended bottom content after recovery"
  );
  const recoveredHiddenCard = fixture.elements.terminalGrid.children.find(
    (entry) => entry.hidden === false && entry.querySelector(".session-focus")?.textContent === "two"
  );
  assert.equal(recoveredHiddenCard.querySelector(".session-plugin-badges").textContent, "Working");
  assert.equal(recoveredHiddenCard.querySelector(".session-status-text").textContent, "Working");
  assert.match(recoveredHiddenCard.querySelector(".session-artifacts").textContent, /Summary: hidden deck output recovered/i);
  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "Working(0s • esc to interrupt)\n" })
  });
  await tick();
  assert.equal(recoveredHiddenCard.querySelector(".session-status-text").textContent, "Working (0s • esc to interrupt)");
  await sleep(1200);
  assert.match(
    recoveredHiddenCard.querySelector(".session-status-text").textContent,
    /^Working \(([0-9]+)s • esc to interrupt\)$/
  );

  ws.emit("message", {
    data: JSON.stringify({
      type: "session.activity.completed",
      sessionId: "s-1",
      activityCompletedAt: 2001,
      session: {
        id: "s-1",
        deckId: "default",
        name: "one",
        state: "running",
        activityState: "inactive",
        activityUpdatedAt: 2001,
        activityCompletedAt: 2001,
        cwd: "/tmp",
        shell: "bash",
        tags: [],
        createdAt: 1000,
        updatedAt: 2001
      }
    })
  });
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.activity.completed",
      sessionId: "s-2",
      activityCompletedAt: 2002,
      session: {
        id: "s-2",
        deckId: "deck-new",
        name: "two",
        state: "running",
        activityState: "inactive",
        activityUpdatedAt: 2002,
        activityCompletedAt: 2002,
        cwd: "/tmp",
        shell: "bash",
        tags: [],
        createdAt: 1001,
        updatedAt: 2002
      }
    })
  });
  await sleep(20);
  assert.equal(browserNotifications.length, 1);
  assert.equal(browserNotifications[0].title, "2 sessions completed activity");
  assert.match(browserNotifications[0].options.body, /\[1\] one/);
  assert.match(browserNotifications[0].options.body, /\[2\] two/);

  ws.emit("message", {
    data: JSON.stringify({
      type: "session.activity.completed",
      sessionId: "s-1",
      activityCompletedAt: 2001,
      session: {
        id: "s-1",
        deckId: "default",
        name: "one",
        state: "running",
        activityState: "inactive",
        activityUpdatedAt: 2001,
        activityCompletedAt: 2001,
        cwd: "/tmp",
        shell: "bash",
        tags: [],
        createdAt: 1000,
        updatedAt: 2001
      }
    })
  });
  await sleep(20);
  assert.equal(browserNotifications.length, 1);
  MockNotification.permission = "denied";
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.activity.completed",
      sessionId: "s-1",
      activityCompletedAt: 2003,
      session: {
        id: "s-1",
        deckId: "default",
        name: "one",
        state: "running",
        activityState: "inactive",
        activityUpdatedAt: 2003,
        activityCompletedAt: 2003,
        cwd: "/tmp",
        shell: "bash",
        tags: [],
        createdAt: 1000,
        updatedAt: 2003
      }
    })
  });
  await sleep(20);
  assert.equal(browserNotifications.length, 1);

  fixture.elements.commandInput.value = "/filter";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Display filter cleared.");

  fixture.elements.commandInput.value = "/deck delete deck-new";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(
    fixture.elements.commandFeedback.textContent,
    "Deck 'Ops' is not empty. Retry with '/deck delete deck-new force'."
  );
  assert.deepEqual(deckDeleteCalls[deckDeleteCalls.length - 1], { deckId: "deck-new", force: false });

  fixture.elements.commandInput.value = "/deck delete deck-new force";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Deleted deck [deck-new] Ops.");
  assert.deepEqual(deckDeleteCalls[deckDeleteCalls.length - 1], { deckId: "deck-new", force: true });
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.updated",
      session: {
        id: "s-2",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: "two",
        tags: ["beta", "ops"],
        deckId: "default",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  ws.emit("message", {
    data: JSON.stringify({
      type: "deck.deleted",
      deckId: "deck-new",
      fallbackDeckId: "default"
    })
  });
  await tick();
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "deck-new"), null);

  const firstQuickId = firstCard.querySelector(".session-quick-id");
  const secondQuickId = secondCard.querySelector(".session-quick-id");
  assert.equal(firstQuickId.textContent, "1");
  assert.equal(secondQuickId.textContent, "2");
  const resizeCountBeforeUnrestored = resizePayloads.length;
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.created",
      session: {
        id: "s-u",
        state: "unrestored",
        shell: "bash",
        cwd: "~",
        name: "unrestored",
        tags: ["broken"],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  await sleep(250);
  const unrestoredCard = fixture.elements.terminalGrid.children[2];
  assert.ok(unrestoredCard.classList.contains("unrestored"));
  const unrestoredBadge = unrestoredCard.querySelector(".session-state-badge");
  const unrestoredHint = unrestoredCard.querySelector(".session-unrestored-hint");
  assert.equal(unrestoredBadge.textContent, "UNRESTORED");
  assert.equal(unrestoredBadge.hidden, false);
  assert.equal(unrestoredHint.hidden, false);
  assert.match(unrestoredHint.textContent, /could not be restored/i);
  assert.equal(
    resizePayloads.slice(resizeCountBeforeUnrestored).some((entry) => entry.sessionId === "s-u"),
    false
  );

  const secondSettings = secondCard.querySelector(".session-settings");
  const secondSettingsPanel = secondCard.querySelector(".session-settings-dialog");
  const secondSettingsDismiss = secondCard.querySelector(".session-settings-dismiss");
  const secondToolbar = secondCard.querySelector(".terminal-toolbar");
  assert.equal(secondToolbar.querySelector(".session-rename"), null);
  assert.equal(secondToolbar.querySelector(".session-close"), null);
  assert.ok(secondSettingsPanel.querySelector(".session-rename"));
  assert.ok(secondSettingsPanel.querySelector(".session-close"));
  const secondThemeSelect = secondSettingsPanel.querySelector(".session-theme-select");
  const secondThemeBg = secondSettingsPanel.querySelector(".session-theme-bg");
  const secondThemeFg = secondSettingsPanel.querySelector(".session-theme-fg");
  const secondStartCwd = secondSettingsPanel.querySelector(".session-start-cwd");
  const secondStartCommand = secondSettingsPanel.querySelector(".session-start-command");
  const secondStartEnv = secondSettingsPanel.querySelector(".session-start-env");
  const secondTags = secondSettingsPanel.querySelector(".session-tags-input");
  const secondSendTerminator = secondSettingsPanel.querySelector(".session-send-terminator");
  const secondSettingsApply = secondSettingsPanel.querySelector(".session-settings-apply");
  const secondSettingsCancel = secondSettingsPanel.querySelector(".session-settings-cancel");
  const secondStartFeedback = secondSettingsPanel.querySelector(".session-start-feedback");
  const secondTagList = secondCard.querySelector(".session-tag-list");
  assert.equal(secondTagList.textContent, "#beta #ops");
  assert.equal(secondSettingsPanel.open, false);
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, true);
  secondSettingsDismiss.click();
  await tick();
  assert.equal(secondSettingsPanel.open, false);
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, true);
  const cancelDialogEvent = {
    type: "cancel",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  secondSettingsPanel.dispatchEvent(cancelDialogEvent);
  await tick();
  assert.equal(cancelDialogEvent.defaultPrevented, true);
  assert.equal(secondSettingsPanel.open, false);
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, true);
  const persistedBgBeforeDraft = secondThemeBg.value;
  const persistedFgBeforeDraft = secondThemeFg.value;
  secondThemeSelect.value = "custom";
  secondThemeSelect.dispatchEvent({ type: "change" });
  await tick();
  secondThemeBg.value = "#111111";
  secondThemeBg.dispatchEvent({ type: "input" });
  secondThemeFg.value = "#eeeeee";
  secondThemeFg.dispatchEvent({ type: "input" });
  await tick();
  assert.equal(MockTerminal.instances[1].options.theme.background, "#111111");
  assert.equal(MockTerminal.instances[1].options.theme.foreground, "#eeeeee");
  secondSettingsCancel.click();
  await tick();
  assert.equal(secondThemeBg.value, persistedBgBeforeDraft);
  assert.equal(secondThemeFg.value, persistedFgBeforeDraft);
  assert.equal(MockTerminal.instances[1].options.theme.background, persistedBgBeforeDraft);
  assert.equal(MockTerminal.instances[1].options.theme.foreground, persistedFgBeforeDraft);
  secondThemeBg.value = "#101010";
  secondThemeBg.dispatchEvent({ type: "input" });
  secondThemeFg.value = "#e0e0e0";
  secondThemeFg.dispatchEvent({ type: "input" });
  secondStartCwd.value = "/var/tmp";
  secondStartCwd.dispatchEvent({ type: "input" });
  secondStartCommand.value = "echo start";
  secondStartCommand.dispatchEvent({ type: "input" });
  secondStartEnv.value = "APP_MODE=dev\nFEATURE_X=1";
  secondStartEnv.dispatchEvent({ type: "input" });
  secondTags.value = "ops prod";
  secondTags.dispatchEvent({ type: "input" });
  secondSettingsApply.click();
  await tick();
  assert.equal(updateSessionCalls.length > 0, true);
  const latestSettingsCall = updateSessionCalls[updateSessionCalls.length - 1];
  assert.deepEqual(latestSettingsCall, {
    sessionId: "s-2",
    payload: {
      startCwd: "/var/tmp",
      startCommand: "echo start",
      env: {
        APP_MODE: "dev",
        FEATURE_X: "1"
      },
      tags: ["ops", "prod"],
      themeProfile: {
        background: "#101010",
        foreground: "#e0e0e0",
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
    }
  });
  assert.equal(MockTerminal.instances[1].options.theme.background, "#101010");
  assert.equal(MockTerminal.instances[1].options.theme.foreground, "#e0e0e0");
  assert.equal(secondStartFeedback.textContent, "Settings saved.");
  assert.equal(secondTagList.textContent, "#ops #prod");
  const slashSettingsPayload = {
    startCwd: "/srv/slash",
    startCommand: "echo slash",
    env: { APP_MODE: "slash" },
    tags: ["ops", "slash"],
    themeProfile: {
      ...latestSettingsCall.payload.themeProfile,
      background: "#202020",
      foreground: "#f0f0f0"
    },
    sendTerminator: "lf"
  };
  fixture.elements.commandInput.value = `/settings apply 2 ${JSON.stringify(slashSettingsPayload)}`;
  fixture.elements.sendCommand.click();
  await tick();
  const latestSlashSettingsCall = updateSessionCalls[updateSessionCalls.length - 1];
  assert.deepEqual(latestSlashSettingsCall, {
    sessionId: "s-2",
    payload: {
      startCwd: "/srv/slash",
      startCommand: "echo slash",
      env: { APP_MODE: "slash" },
      tags: ["ops", "slash"],
      themeProfile: {
        ...latestSettingsCall.payload.themeProfile,
        background: "#202020",
        foreground: "#f0f0f0"
      }
    }
  });
  assert.equal(
    fixture.elements.commandFeedback.textContent,
    "Applied settings to 1 session(s): startCwd, startCommand, env, tags, themeProfile, sendTerminator."
  );
  fixture.elements.commandInput.value = "/settings show 2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.match(fixture.elements.commandFeedback.textContent, /sendTerminator=lf/);
  assert.match(fixture.elements.commandFeedback.textContent, /"slash"/);
  fixture.elements.commandInput.value = '/settings apply 2 {"unknown":1}';
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown settings key(s): unknown");
  const directRouteCountBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@s-1 slash-line1\nslash-line2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, directRouteCountBefore + 1);
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "slash-line1\nslash-line2\r" });
  secondStartEnv.value = "1INVALID=value";
  secondStartEnv.dispatchEvent({ type: "input" });
  const callsBeforeInvalidEnv = updateSessionCalls.length;
  secondSettingsApply.click();
  await tick();
  assert.equal(updateSessionCalls.length, callsBeforeInvalidEnv);
  assert.equal(secondStartFeedback.textContent, "Invalid env variable name '1INVALID'.");
  secondStartEnv.value = "APP_MODE=dev\nFEATURE_X=1";
  secondStartEnv.dispatchEvent({ type: "input" });
  secondTags.value = "invalid*tag";
  secondTags.dispatchEvent({ type: "input" });
  const callsBeforeInvalidTags = updateSessionCalls.length;
  secondSettingsApply.click();
  await tick();
  assert.equal(updateSessionCalls.length, callsBeforeInvalidTags);
  assert.match(secondStartFeedback.textContent, /Invalid tag 'invalid\*tag'/);
  secondTags.value = "ops prod";
  secondTags.dispatchEvent({ type: "input" });
  secondSettings.click();
  await tick();
  assert.equal(secondSettingsPanel.open, false);
  const secondFocus = secondCard.querySelector(".session-focus");
  secondFocus.click();
  await tick();
  assert.equal(firstCard.classList.contains("active"), false);
  assert.equal(secondCard.classList.contains("active"), true);

  fixture.elements.commandInput.value = "@s-u echo blocked";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Command send blocked for unrestored session [3] unrestored.");

  fixture.elements.commandInput.value = "/restart s-u";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Restart blocked for unrestored session [3] unrestored.");

  fixture.elements.commandInput.value = "/switch s-u";
  fixture.elements.sendCommand.click();
  await tick();
  fixture.elements.commandInput.value = "echo blocked-active";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Command send blocked for unrestored session [3] unrestored.");

  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-1", data: "\u001b[2J\u001b[H" })
  });
  await tick();
  assert.ok(MockTerminal.instances[0].writes.includes("\u001b[2J\u001b[H"));
  assert.ok(MockTerminal.instances[0].refreshCalls.length > 0);

  ws.emit("message", {
    data: JSON.stringify({
      type: "session.created",
      session: {
        id: "ops",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: "ops-node",
        tags: ["ops"],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 4);

  const routedBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@1 echo routed";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, routedBefore + 1);
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "echo routed\r" });
  assert.equal(secondCard.classList.contains("active"), false);
  assert.equal(unrestoredCard.classList.contains("active"), true);
  assert.equal(fixture.elements.commandFeedback.textContent, "Sent to [1] one.");

  fixture.elements.commandInput.value = '/settings apply s-1 {"sendTerminator":"crlf"}';
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(
    fixture.elements.commandFeedback.textContent,
    "Applied settings to 1 session(s): sendTerminator."
  );
  fixture.elements.commandInput.value = "@s-1 echo alpha";
  fixture.elements.sendCommand.click();
  await tick();
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "echo alpha\r\n" });
  fixture.elements.commandInput.value = "/blockcmd s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads[inputPayloads.length - 1].sessionId, "s-1");
  assert.equal(inputPayloads[inputPayloads.length - 1].data.endsWith("\r\n"), true);
  const overlappedDirectBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@default::ops,default::s-1 echo overlap";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, overlappedDirectBefore + 3);
  const overlappedDirectTargets = inputPayloads.slice(overlappedDirectBefore).map((entry) => entry.sessionId).sort();
  assert.deepEqual(overlappedDirectTargets, ["ops", "s-1", "s-2"]);
  assert.equal(fixture.elements.commandFeedback.textContent, "Sent to 3 sessions.");
  const overlappedCustomBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "/blockcmd default::ops,default::s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, overlappedCustomBefore + 3);
  const overlappedCustomTargets = inputPayloads.slice(overlappedCustomBefore).map((entry) => entry.sessionId).sort();
  assert.deepEqual(overlappedCustomTargets, ["ops", "s-1", "s-2"]);
  assert.equal(fixture.elements.commandFeedback.textContent, "Executed /blockcmd on 3 sessions.");

  fixture.elements.commandInput.value = '/settings apply s-1 {"sendTerminator":"lf"}';
  fixture.elements.sendCommand.click();
  await tick();
  fixture.elements.commandInput.value = "@s-1 line1\nline2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "line1\nline2\n" });
  fixture.elements.commandInput.value = "/blockcmd s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "line 1\nline 2\n" });

  fixture.elements.commandInput.value = '/settings apply s-1 {"sendTerminator":"cr"}';
  fixture.elements.sendCommand.click();
  await tick();
  fixture.elements.commandInput.value = "@s-1 line1\nline2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "line1\nline2\r" });
  fixture.elements.commandInput.value = "/blockcmd s-1";
  fixture.elements.sendCommand.click();
  await tick();
  assert.deepEqual(inputPayloads[inputPayloads.length - 1], { sessionId: "s-1", data: "line 1\nline 2\r" });

  const unresolvedBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@does-not-exist echo routed";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, unresolvedBefore);
  assert.equal(fixture.elements.commandFeedback.textContent, "Unknown session identifier: does-not-exist");
  assert.equal(secondCard.classList.contains("active"), false);
  assert.equal(unrestoredCard.classList.contains("active"), true);

  const ambiguousRoutingBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "@s- echo routed";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, ambiguousRoutingBefore);
  assert.equal(fixture.elements.commandFeedback.textContent, "Ambiguous session identifier: s-");

  const ambiguousBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "/blockcmd s-";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, ambiguousBefore);
  assert.equal(fixture.elements.commandFeedback.textContent, "Ambiguous session identifier: s-");

  ws.emit("message", { data: JSON.stringify({ type: "session.closed", sessionId: "s-2" }) });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 3);
  ws.emit("message", {
    data: JSON.stringify({
      type: "session.created",
      session: {
        id: "s-2",
        state: "active",
        shell: "bash",
        cwd: "~",
        name: "two",
        tags: ["ops", "prod"],
        themeProfile: latestSettingsCall.payload.themeProfile,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 4);
  const reopenedSecondTerminal = MockTerminal.instances[MockTerminal.instances.length - 1];
  assert.equal(reopenedSecondTerminal.options.theme.background, "#101010");
  assert.equal(reopenedSecondTerminal.options.theme.foreground, "#e0e0e0");

  const updateCallsBeforeExit = updateSessionCalls.length;
  const inputPayloadsBeforeExit = inputPayloads.length;
  ws.emit("message", {
    data: JSON.stringify({ type: "session.exit", sessionId: "s-2", exitCode: 17, signal: "SIGTERM" })
  });
  await tick();
  const exitedSecondCard = fixture.elements.terminalGrid.children.find(
    (entry) => entry.querySelector(".session-focus")?.textContent === "two"
  );
  assert.ok(exitedSecondCard.classList.contains("exited"));
  assert.equal(exitedSecondCard.querySelector(".session-state-badge").textContent, "EXITED");
  assert.match(exitedSecondCard.querySelector(".session-unrestored-hint").textContent, /process exited/i);
  assert.match(exitedSecondCard.querySelector(".session-unrestored-hint").textContent, /exit code 17/i);
  assert.match(exitedSecondCard.querySelector(".session-unrestored-hint").textContent, /SIGTERM/i);

  fixture.elements.commandInput.value = "/rename 2 renamed-exited";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Rename blocked for exited session [2] two.");

  fixture.elements.commandInput.value = "/restart 2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Restart blocked for exited session [2] two.");

  fixture.elements.commandInput.value = '/settings apply 2 {"sendTerminator":"lf"}';
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Settings apply blocked for exited session [2] two.");
  assert.equal(updateSessionCalls.length, updateCallsBeforeExit);

  fixture.elements.commandInput.value = "@2 echo blocked-exit";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Command send blocked for exited session [2] two.");
  assert.equal(inputPayloads.length, inputPayloadsBeforeExit);

  reopenedSecondTerminal.dataHandler("echo blocked-terminal");
  await tick();
  assert.match(fixture.elements.statusMessage.textContent, /Session \[2\] two has exited/i);

  fixture.elements.commandInput.value = "/close 2";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.commandFeedback.textContent, "Removed exited session [2] two.");
  assert.equal(
    fixture.elements.terminalGrid.children.some((entry) => entry.querySelector(".session-focus")?.textContent === "two"),
    false
  );

  ws.emit("message", {
    data: JSON.stringify({ type: "session.exit", sessionId: "ops", exitCode: 0, signal: "" })
  });
  await tick();
  assert.equal(
    fixture.elements.terminalGrid.children.some((entry) => entry.querySelector(".session-focus")?.textContent === "ops-node"),
    true
  );
  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      decks: [
        {
          id: "default",
          name: "Default",
          settings: { terminal: { cols: 90, rows: 30 } },
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: "qa",
          name: "QA",
          settings: { terminal: { cols: 100, rows: 40 } },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      sessions: [
        {
          id: "s-1",
          deckId: "default",
          state: "active",
          shell: "bash",
          cwd: "~",
          name: "one",
          tags: ["alpha"],
          themeProfile: latestSettingsCall.payload.themeProfile,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: "s-u",
          deckId: "default",
          state: "unrestored",
          shell: "bash",
          cwd: "~",
          name: "unrestored",
          tags: ["broken"],
          themeProfile: latestSettingsCall.payload.themeProfile,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      customCommands: [{ name: "blockcmd", content: "line 1\nline 2", createdAt: Date.now(), updatedAt: Date.now() }],
      outputs: []
    })
  });
  await tick();
  assert.equal(
    fixture.elements.terminalGrid.children.some((entry) => entry.querySelector(".session-focus")?.textContent === "ops-node"),
    false
  );
  assert.ok(findDeckGroup(fixture.elements.deckTabs, "default"));
  assert.ok(findDeckGroup(fixture.elements.deckTabs, "qa"));
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "deck-new"), null);

  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      decks: [
        {
          id: "default",
          name: "Default",
          settings: { terminal: { cols: 90, rows: 30 } },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      sessions: [],
      customCommands: [{ name: "blockcmd", content: "line 1\nline 2", createdAt: Date.now(), updatedAt: Date.now() }],
      outputs: []
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 0);
  assert.equal(fixture.elements.emptyState.style.display, "block");
  assert.ok(findDeckGroup(fixture.elements.deckTabs, "default"));
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "qa"), null);
  const noActiveBefore = inputPayloads.length;
  fixture.elements.commandInput.value = "/blockcmd";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(inputPayloads.length, noActiveBefore);
  assert.equal(fixture.elements.commandFeedback.textContent, "No active session for custom command execution.");

  ws.emit("close", {});
  await tick();

  assert.equal(fixture.elements.connectionState.textContent, "reconnecting");
  assert.equal(fixture.elements.statusMessage.textContent, "Connection state: reconnecting");
  assert.equal(listSessionsCalls, 1);
  assert.equal(win.__PTYDECK_PERF__.bootstrapRequestCount, 1);
});

test("app search tracks active terminal matches across buffer growth and deck switching", async (t) => {
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
  let listDecksCalls = 0;
  let listSessionsCalls = 0;
  const deckState = [
    {
      id: "default",
      name: "Default",
      settings: { terminal: { cols: 80, rows: 20 } },
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: "ops",
      name: "Ops",
      settings: { terminal: { cols: 90, rows: 25 } },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  const sessions = [
    {
      id: "s-1",
      deckId: "default",
      state: "active",
      shell: "bash",
      cwd: "~",
      name: "one",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: "s-2",
      deckId: "ops",
      state: "active",
      shell: "bash",
      cwd: "~",
      name: "ops-node",
      tags: ["ops"],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];

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
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const method = options.method || "GET";

    if (path === "/api/v1/decks" && method === "GET") {
      listDecksCalls += 1;
      return makeJsonResponse(200, deckState);
    }
    if (path === "/api/v1/sessions" && method === "GET") {
      listSessionsCalls += 1;
      return makeJsonResponse(200, sessions);
    }
    return makeJsonResponse(204, {});
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

  await import("../src/public/app.js?app-search-test");
  await tick();
  await tick();

  const ws = MockWebSocket.instances[0];
  assert.ok(ws, "expected websocket client to initialize");
  ws.emit("open", {});
  ws.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      sessions,
      decks: deckState,
      customCommands: [],
      outputs: []
    })
  });
  await tick();
  await sleep(320);
  assert.equal(listDecksCalls, 0);
  assert.equal(listSessionsCalls, 0);

  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-1", data: "alpha one\nalpha two\n" })
  });
  await tick();

  fixture.elements.terminalSearchInput.value = "alpha";
  fixture.elements.terminalSearchInput.dispatchEvent({ type: "input" });
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "Match 1/2");
  assert.equal(MockTerminal.instances[0].selected?.row, 0);

  fixture.elements.terminalSearchNext.click();
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "Match 2/2");
  assert.equal(MockTerminal.instances[0].selected?.row, 1);

  fixture.elements.terminalSearchNext.click();
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "Wrapped to next match (Match 1/2).");
  assert.equal(MockTerminal.instances[0].selected?.row, 0);

  fixture.elements.terminalSearchInput.value = "ops";
  fixture.elements.terminalSearchInput.dispatchEvent({ type: "input" });
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "No matches in active terminal.");

  ws.emit("message", {
    data: JSON.stringify({ type: "session.data", sessionId: "s-2", data: "ops ready\n" })
  });
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "No matches in active terminal.");
  assert.equal(MockTerminal.instances[1].selected, null);
  let sessionButton = findDeckSessionButton(fixture.elements.deckTabs, "ops", "s-2");
  let indicator = sessionButton?.querySelector(".deck-session-activity-indicator");
  assert.ok(sessionButton);
  assert.ok(indicator);
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.classList.contains("live"), true);
  assert.equal(indicator.classList.contains("unseen"), false);

  await sleep(1550);
  await tick();
  sessionButton = findDeckSessionButton(fixture.elements.deckTabs, "ops", "s-2");
  indicator = sessionButton?.querySelector(".deck-session-activity-indicator");
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.classList.contains("live"), false);
  assert.equal(indicator.classList.contains("unseen"), true);

  fixture.elements.commandInput.value = "/deck switch ops";
  fixture.elements.sendCommand.click();
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "Match 1/1");
  assert.equal(MockTerminal.instances[1].selected?.row, 0);
  sessionButton = findDeckSessionButton(fixture.elements.deckTabs, "ops", "s-2");
  indicator = sessionButton?.querySelector(".deck-session-activity-indicator");
  assert.equal(sessionButton.classList.contains("active"), true);
  assert.equal(indicator.hidden, true);

  fixture.elements.terminalSearchClear.click();
  await tick();
  assert.equal(fixture.elements.terminalSearchStatus.textContent, "");
  assert.equal(MockTerminal.instances[1].selected, null);

  ws.emit("close", {});
  await tick();
  await sleep(700);
  assert.equal(MockWebSocket.instances.length, 2);

  const reconnectWs = MockWebSocket.instances[1];
  reconnectWs.emit("open", {});
  reconnectWs.emit("message", {
    data: JSON.stringify({
      type: "snapshot",
      sessions: [
        {
          id: "s-2",
          deckId: "ops",
          state: "active",
          shell: "bash",
          cwd: "~",
          name: "ops-node",
          tags: ["ops"],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      decks: [deckState[1]],
      customCommands: [],
      outputs: []
    })
  });
  await tick();
  assert.equal(fixture.elements.terminalGrid.children.length, 1);
  assert.ok(findDeckGroup(fixture.elements.deckTabs, "ops"));
  assert.equal(findDeckGroup(fixture.elements.deckTabs, "default"), null);
  assert.equal(listDecksCalls, 0);
  assert.equal(listSessionsCalls, 0);
});
