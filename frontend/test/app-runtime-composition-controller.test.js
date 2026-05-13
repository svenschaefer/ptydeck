import test from "node:test";
import assert from "node:assert/strict";

import {
  collectAppRuntimeDomRefs,
  createAppRuntimeCompositionController
} from "../src/public/app-runtime-composition-controller.js";

class ClassList {
  constructor(initial = "") {
    this.tokens = new Set(String(initial || "").split(/\s+/).filter(Boolean));
  }

  add(token) {
    this.tokens.add(token);
  }

  remove(token) {
    this.tokens.delete(token);
  }

  contains(token) {
    return this.tokens.has(token);
  }

  toggle(token, force) {
    const shouldAdd = typeof force === "boolean" ? force : !this.tokens.has(token);
    if (shouldAdd) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    return shouldAdd;
  }

  toString() {
    return Array.from(this.tokens).join(" ");
  }
}

class FakeElement {
  constructor({ id = "", className = "", tagName = "div" } = {}) {
    this.id = id;
    this.tagName = String(tagName || "div").toUpperCase();
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
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.dataset = {};
    this.listeners = new Map();
    this.clientWidth = 900;
    this.clientHeight = 360;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
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

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    const payload = event || {};
    payload.target ||= this;
    const list = this.listeners.get(payload.type) || [];
    for (const handler of list) {
      handler(payload);
    }
    return true;
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

  focus() {}

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      return this.find((node) => node.id === id);
    }
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.find((node) => node.classList?.contains(className));
    }
    return null;
  }

  find(predicate) {
    if (predicate(this)) {
      return this;
    }
    for (const child of this.children) {
      const match = child.find?.(predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }
}

class MockTerminal {
  constructor(options = {}) {
    this.options = { ...options };
    this.buffer = {
      active: {
        baseY: 0,
        ydisp: 0,
        length: 1,
        getLine() {
          return {
            translateToString() {
              return "";
            }
          };
        }
      }
    };
    this._core = {
      viewport: {
        syncScrollArea() {}
      }
    };
  }
}

class MockFitAddon {
  fit() {}
}

function inferTagName(id) {
  if (id.includes("dialog")) {
    return "dialog";
  }
  if (id.includes("textarea") || id.includes("command-input") || id.includes("env")) {
    return "textarea";
  }
  if (id.includes("select") || id.includes("position")) {
    return "select";
  }
  if (id.includes("input") || id.includes("search") || id.includes("name")) {
    return "input";
  }
  if (
    id.includes("button") ||
    id.includes("toggle") ||
    id.includes("apply") ||
    id.includes("save") ||
    id.includes("delete") ||
    id.includes("new") ||
    id.includes("close") ||
    id.includes("open") ||
    id.includes("prev") ||
    id.includes("next")
  ) {
    return "button";
  }
  return "div";
}

function createMinimalDocumentFixture() {
  const byId = new Map();
  const appShellEl = new FakeElement({ className: "app-shell" });

  const document = {
    createElement(tagName) {
      return new FakeElement({ tagName });
    },
    getElementById(id) {
      if (id === "terminal-card-template") {
        return {
          id,
          content: {
            firstElementChild: {
              cloneNode() {
                return new FakeElement({ className: "terminal-card" });
              }
            }
          }
        };
      }
      if (!byId.has(id)) {
        const element = new FakeElement({ id, tagName: inferTagName(id) });
        if (id === "control-pane-position") {
          element.value = "right";
        }
        if (id === "settings-cols") {
          element.value = "80";
        }
        if (id === "settings-rows") {
          element.value = "20";
        }
        byId.set(id, element);
      }
      return byId.get(id);
    },
    querySelector(selector) {
      return selector === ".app-shell" ? appShellEl : null;
    },
    addEventListener() {},
    removeEventListener() {},
    activeElement: null
  };

  return {
    byId,
    appShellEl,
    document
  };
}

function createWindowFixture(documentRef) {
  return {
    document: documentRef,
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      host: "127.0.0.1:18081",
      pathname: "/",
      search: "",
      hash: "",
      replace() {}
    },
    history: {
      state: null,
      replaceState() {}
    },
    navigator: {
      clipboard: {
        async writeText() {
          return undefined;
        },
        async readText() {
          return "";
        }
      }
    },
    localStorage: null,
    crypto: null,
    URL,
    Blob,
    Terminal: MockTerminal,
    FitAddon: {
      FitAddon: MockFitAddon
    },
    Event: class Event {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = init.bubbles === true;
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    performance: {
      now() {
        return 0;
      }
    }
  };
}

function createJsonResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return Object.prototype.hasOwnProperty.call(headers, name) ? headers[name] : "";
      }
    },
    async json() {
      return payload;
    }
  };
}

function createLocalStorageFixture() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
    dump() {
      return new Map(values);
    }
  };
}

function createControllerHarness(options = {}) {
  const fixture = createMinimalDocumentFixture();
  const hooks = {};
  let ensuredIdentityCount = 0;
  const windowRef = options.windowRef || createWindowFixture(fixture.document);
  const controller = createAppRuntimeCompositionController({
    windowRef,
    documentRef: fixture.document,
    createStartupBackupRuntimeController:
      options.createStartupBackupRuntimeController ||
      (() => ({
        async ensureStartupBackup() {}
      })),
    createTrustedLocalClientRuntimeController:
      options.createTrustedLocalClientRuntimeController ||
      (() => ({
        async ensureClientIdentity() {
          ensuredIdentityCount += 1;
          return {
            clientId: "client-local",
            label: "Laptop"
          };
        },
        renameClientIdentity(label) {
          return {
            label
          };
        }
      })),
    testHooks: hooks
  });
  return {
    controller,
    fixture,
    windowRef,
    hooks,
    getEnsuredIdentityCount: () => ensuredIdentityCount
  };
}

test("collectAppRuntimeDomRefs resolves query and id based runtime refs deterministically", () => {
  const appShellEl = { id: "app-shell" };
  const controlPaneEl = { id: "control-pane" };
  const commandInput = { id: "command-input" };
  const workspaceManagerOpenBtn = { id: "workspace-manager-open" };

  const refs = collectAppRuntimeDomRefs({
    querySelector(selector) {
      return selector === ".app-shell" ? appShellEl : null;
    },
    getElementById(id) {
      return {
        "control-pane": controlPaneEl,
        "command-input": commandInput,
        "workspace-manager-open": workspaceManagerOpenBtn
      }[id] || null;
    }
  });

  assert.equal(refs.appShellEl, appShellEl);
  assert.equal(refs.controlPaneEl, controlPaneEl);
  assert.equal(refs.commandInput, commandInput);
  assert.equal(refs.workspaceManagerOpenBtn, workspaceManagerOpenBtn);
  assert.equal(refs.terminalSearchStatusEl, null);
});

test("collectAppRuntimeDomRefs tolerates missing document APIs by returning null refs", () => {
  const refs = collectAppRuntimeDomRefs({});

  assert.equal(refs.appShellEl, null);
  assert.equal(refs.stateEl, null);
  assert.equal(refs.commandInput, null);
  assert.equal(refs.terminalSearchStatusEl, null);
});

test("app-runtime composition controller initialize surfaces startup-backup failures before trusted-local identity bootstrap", async () => {
  const harness = createControllerHarness({
    createStartupBackupRuntimeController: () => ({
      async ensureStartupBackup() {
        throw new Error("Startup backup unavailable.");
      }
    })
  });

  await assert.rejects(harness.controller.initialize(), /Startup backup unavailable\./);
  assert.equal(harness.hooks.getInitializationErrorMessage(), "Startup backup unavailable.");
  assert.equal(harness.getEnsuredIdentityCount(), 0);
});

test("app-runtime composition controller redirects to the canonical origin before trusted-local bootstrap", async () => {
  const fixture = createMinimalDocumentFixture();
  const replaceCalls = [];
  const windowRef = createWindowFixture(fixture.document);
  windowRef.location.protocol = "http:";
  windowRef.location.hostname = "172.26.86.97";
  windowRef.location.host = "172.26.86.97:18081";
  windowRef.location.pathname = "/";
  windowRef.location.search = "?debug=1";
  windowRef.location.hash = "#deck";
  windowRef.location.replace = (url) => replaceCalls.push(url);
  windowRef.__PTYDECK_CONFIG__ = {
    canonicalOrigin: "https://ptydeck.local.secos.rocks"
  };
  const harness = createControllerHarness({ windowRef });

  const result = await harness.controller.initialize();

  assert.deepEqual(result, { redirected: true });
  assert.equal(harness.getEnsuredIdentityCount(), 0);
  assert.deepEqual(replaceCalls, [
    "https://ptydeck.local.secos.rocks/?debug=1&ptydeck_origin_handoff=http%3A%2F%2F172.26.86.97%3A18081#deck"
  ]);
});

test("app-runtime composition controller preserves a specific initialization error message over the generic fallback", () => {
  const harness = createControllerHarness();

  harness.controller.setInitializationError("Specific runtime failure.");
  harness.controller.setInitializationError("");

  assert.equal(harness.hooks.getInitializationErrorMessage(), "Specific runtime failure.");
});

test("app-runtime composition controller falls back to the generic initialization error when no specific message exists", () => {
  const harness = createControllerHarness();

  harness.controller.setInitializationError("");

  assert.equal(harness.hooks.getInitializationErrorMessage(), "Failed to initialize application runtime.");
});

test("app-runtime composition controller exposes reclaim-and-retry state with the reconnect-specific label", () => {
  const harness = createControllerHarness();
  const feedbackMessages = [];
  const feedbackActions = [];
  let controlPaneShowCalls = 0;
  const retryAction = {
    kind: "send",
    sessionId: "s-1",
    payload: "pwd"
  };
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-remote",
        active: false,
        label: "Desktop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          label: "Laptop"
        },
        {
          clientId: "client-remote",
          active: false,
          accessMode: "operator",
          label: "Desktop"
        }
      ]
    }
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setCollaborators({
    appRuntimeStateController: {
      clearCommandFeedbackAction() {},
      setCommandFeedbackAction(payload) {
        feedbackActions.push(payload);
      }
    },
    appCommandUiFacadeController: {
      setCommandFeedback(message) {
        feedbackMessages.push(message);
      }
    },
    controlPaneRuntimeController: {
      show() {
        controlPaneShowCalls += 1;
      }
    }
  });

  const result = harness.hooks.showBlockedWriteReclaimUi(session, { retryAction });

  assert.equal(result, true);
  assert.equal(feedbackMessages[0], "Control is reserved for reconnecting device Desktop. Take control to reclaim it or wait for reconnect.");
  assert.deepEqual(feedbackActions, [
    {
      visible: true,
      label: "Reclaim Control and Retry",
      title: "Control is reserved for reconnecting device Desktop. Take control to reclaim it or wait for reconnect.",
      sessionId: "s-1"
    }
  ]);
  assert.equal(controlPaneShowCalls, 1);
  assert.deepEqual(harness.hooks.getCommandFeedbackActionMeta(), {
    scope: "session",
    sessionId: "s-1",
    retryAction
  });
});

test("app-runtime composition controller auto-reclaims control after a canonical-origin handoff when the stale controller is reconnecting", async () => {
  const harness = createControllerHarness();
  const takeCalls = [];
  const feedbackMessages = [];
  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setTrustedLocalClientLabel("Laptop");
  harness.hooks.setRuntimeClientIdentityCreatedOnThisOrigin(true);
  harness.hooks.setOriginHandoffSourceOrigin("http://172.26.86.97:18081");
  harness.hooks.setSessionsForTest([
    {
      id: "s-1",
      controlState: {
        owner: {
          subject: "dev-user",
          tenantId: "",
          accessMode: "operator",
          permissionMode: ""
        },
        currentController: {
          clientId: "client-legacy-ip",
          active: false,
          label: "Chrome on Windows (ABCD)"
        },
        attachedClients: [
          {
            clientId: "client-local",
            active: true,
            accessMode: "operator",
            permissionMode: "",
            subject: "dev-user",
            tenantId: "",
            label: "Laptop"
          },
          {
            clientId: "client-legacy-ip",
            active: false,
            accessMode: "operator",
            permissionMode: "",
            subject: "dev-user",
            tenantId: "",
            label: "Chrome on Windows (ABCD)"
          }
        ]
      }
    }
  ]);
  harness.hooks.setCollaborators({
    trustedLocalHandoffRuntimeController: {
      async takeControlScope(scope, payload) {
        takeCalls.push([scope, payload]);
        return { updatedSessions: [] };
      }
    },
    appCommandUiFacadeController: {
      setCommandFeedback(message) {
        feedbackMessages.push(message);
      }
    }
  });

  const repaired = await harness.hooks.maybeAutoRepairOriginHandoffControl();

  assert.equal(repaired, true);
  assert.deepEqual(takeCalls, [["session", { sessionId: "s-1" }]]);
  assert.equal(harness.hooks.getOriginHandoffSourceOrigin(), "");
  assert.equal(
    feedbackMessages[0],
    "Detected origin handoff from http://172.26.86.97:18081. This device reclaimed control for the affected sessions automatically."
  );
});

test("app-runtime composition controller retries a blocked action immediately when control is already local again", async () => {
  const harness = createControllerHarness();
  const retryCalls = [];
  const handoffCalls = [];
  const clearedActions = [];
  let clearErrorCalls = 0;
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-local",
        active: true,
        label: "Laptop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          label: "Laptop"
        }
      ]
    }
  };
  const retryAction = {
    kind: "send",
    sessionId: "s-1",
    payload: "uname -a"
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setCommandFeedbackActionSessionId("s-1");
  harness.hooks.setCommandFeedbackActionMeta({
    scope: "session",
    sessionId: "s-1",
    retryAction
  });
  harness.hooks.setCollaborators({
    appSessionRuntimeFacadeController: {
      getSessionById(sessionId) {
        return sessionId === "s-1" ? session : null;
      },
      formatSessionToken() {
        return "1";
      },
      formatSessionDisplayName() {
        return "Ops";
      }
    },
    appRuntimeStateController: {
      clearCommandFeedbackAction(payload) {
        clearedActions.push(payload);
      },
      clearError() {
        clearErrorCalls += 1;
      }
    },
    appCommandUiFacadeController: {
      setCommandFeedback() {
        throw new Error("Retry path should not emit standalone feedback when it can replay the blocked action.");
      }
    },
    trustedLocalHandoffRuntimeController: {
      async takeControlScope(scope, payload) {
        handoffCalls.push([scope, payload]);
      }
    },
    commandComposerRuntimeController: {
      async retryBlockedAction(action) {
        retryCalls.push(action);
      }
    }
  });

  const result = await harness.hooks.handleCommandFeedbackAction();

  assert.equal(result, true);
  assert.deepEqual(handoffCalls, []);
  assert.deepEqual(retryCalls, [retryAction]);
  assert.deepEqual(clearedActions, [{ render: false }]);
  assert.equal(clearErrorCalls, 1);
  assert.equal(harness.hooks.getCommandFeedbackActionMeta(), null);
});

test("app-runtime composition controller replays trusted-local layouts through the session-control runtime client id authority", async () => {
  const windowRef = createWindowFixture({ querySelector() { return null; }, getElementById() { return null; } });
  const localStorageRef = createLocalStorageFixture();
  windowRef.localStorage = localStorageRef;
  const harness = createControllerHarness({ windowRef });

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setSessionsForTest([
    {
      id: "s-1",
      deckId: "ops",
      name: "one",
      controlState: {
        currentController: {
          clientId: "client-legacy-ip",
          active: true,
          label: "Legacy"
        },
        attachedClients: [
          {
            clientId: "client-local",
            active: true,
            accessMode: "operator",
            permissionMode: "",
            label: "Laptop"
          }
        ]
      }
    }
  ]);
  harness.hooks.setCollaborators({
    appCommandUiFacadeController: {
      render() {},
      setCommandFeedback() {},
      setError() {},
      scheduleCommandPreview() {},
      scheduleCommandSuggestions() {},
      getErrorMessage(error, fallback) {
        return error?.message || fallback;
      }
    }
  });
  harness.hooks.getApi().takeSessionControl = async (sessionId) => ({
    id: sessionId,
    deckId: "ops",
    name: "one",
    controlState: {
      currentController: {
        clientId: "client-local",
        active: true,
        label: "Laptop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          permissionMode: "",
          label: "Laptop"
        }
      ]
    }
  });

  const result = await harness.hooks.getTrustedLocalHandoffRuntimeController().takeControlScope("session", { sessionId: "s-1" });

  assert.deepEqual(result.layoutResult, { applied: false, captured: true });
  assert.ok(localStorageRef.dump().has("ptydeck.trusted-local-layouts.v1"));
});

test("app-runtime composition controller uses the read-only access summary for blocked write messaging", () => {
  const harness = createControllerHarness();

  harness.hooks.setAccessState({
    readOnly: true,
    summary: "Spectator · Read-only deck ops"
  });

  assert.equal(
    harness.hooks.getSessionWriteBlockMessage({ id: "s-1" }),
    "Spectator · Read-only deck ops. Write actions are disabled."
  );
});

test("app-runtime composition controller clears reclaim UI state when no session can be targeted", () => {
  const harness = createControllerHarness();
  const clearedActions = [];

  harness.hooks.setCollaborators({
    appRuntimeStateController: {
      clearCommandFeedbackAction(payload) {
        clearedActions.push(payload);
      }
    }
  });
  harness.hooks.setCommandFeedbackActionMeta({
    scope: "session",
    sessionId: "s-1",
    retryAction: { kind: "send", sessionId: "s-1", payload: "pwd" }
  });

  const result = harness.hooks.showBlockedWriteReclaimUi(null);

  assert.equal(result, false);
  assert.deepEqual(clearedActions, [{ render: false }]);
  assert.equal(harness.hooks.getCommandFeedbackActionMeta(), null);
});

test("app-runtime composition controller throws deterministically when this device cannot take control", async () => {
  const harness = createControllerHarness();
  const clearedActions = [];
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-remote",
        active: true,
        label: "Desktop"
      },
      attachedClients: [
        {
          clientId: "client-remote",
          active: true,
          accessMode: "operator",
          label: "Desktop"
        },
        {
          clientId: "client-observer",
          active: true,
          accessMode: "spectator",
          permissionMode: "read_only",
          label: "Viewer"
        }
      ]
    }
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setCommandFeedbackActionSessionId("s-1");
  harness.hooks.setCommandFeedbackActionMeta({
    scope: "session",
    sessionId: "s-1",
    retryAction: { kind: "paste", sessionId: "s-1", payload: "echo hi" }
  });
  harness.hooks.setCollaborators({
    appSessionRuntimeFacadeController: {
      getSessionById(sessionId) {
        return sessionId === "s-1" ? session : null;
      }
    },
    appRuntimeStateController: {
      clearCommandFeedbackAction(payload) {
        clearedActions.push(payload);
      }
    }
  });

  await assert.rejects(
    harness.hooks.handleCommandFeedbackAction(),
    /Waiting for .* to attach to session control/
  );
  assert.deepEqual(clearedActions, [{ render: false }]);
  assert.equal(harness.hooks.getCommandFeedbackActionMeta(), null);
});

test("app-runtime composition controller takes control and replays resize retries when reclaim is still needed", async () => {
  const harness = createControllerHarness();
  const handoffCalls = [];
  const resizeCalls = [];
  let clearErrorCalls = 0;
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-remote",
        active: false,
        label: "Desktop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          label: "Laptop"
        },
        {
          clientId: "client-remote",
          active: false,
          accessMode: "operator",
          label: "Desktop"
        }
      ]
    }
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setCommandFeedbackActionSessionId("s-1");
  harness.hooks.setCommandFeedbackActionMeta({
    scope: "session",
    sessionId: "s-1",
    retryAction: { kind: "resize", sessionId: "s-1" }
  });
  harness.hooks.setCollaborators({
    appSessionRuntimeFacadeController: {
      getSessionById(sessionId) {
        return sessionId === "s-1" ? session : null;
      },
      formatSessionToken() {
        return "1";
      },
      formatSessionDisplayName() {
        return "Ops";
      }
    },
    appRuntimeStateController: {
      clearCommandFeedbackAction() {},
      clearError() {
        clearErrorCalls += 1;
      }
    },
    trustedLocalHandoffRuntimeController: {
      async takeControlScope(scope, payload) {
        handoffCalls.push([scope, payload]);
      }
    },
    sessionTerminalResizeController: {
      applyResizeForSession(sessionId, options) {
        resizeCalls.push([sessionId, options]);
      }
    }
  });

  const result = await harness.hooks.handleCommandFeedbackAction();

  assert.equal(result, true);
  assert.deepEqual(handoffCalls, [["session", { sessionId: "s-1" }]]);
  assert.deepEqual(resizeCalls, [["s-1", { force: true }]]);
  assert.equal(clearErrorCalls, 1);
});

test("app-runtime composition controller exposes reclaim badge and summary for reconnect-reserved sessions", () => {
  const harness = createControllerHarness();
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-remote",
        active: false,
        label: "Desktop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          label: "Laptop"
        },
        {
          clientId: "client-remote",
          active: false,
          accessMode: "operator",
          label: "Desktop"
        }
      ]
    }
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.setTrustedLocalClientLabel("Laptop");

  assert.deepEqual(harness.hooks.getSessionControlBadgeState(session), {
    label: "RECLAIM",
    tone: "owner",
    title: "Another device is reconnecting. This browser client can reclaim control."
  });
  assert.equal(
    harness.hooks.getSessionControlSummary(session),
    "Control is reserved for reconnecting device Desktop. Laptop can reclaim it."
  );
});

test("app-runtime composition controller renders transfer and forget actions for trusted-local device rows", () => {
  const harness = createControllerHarness();
  const container = new FakeElement({ className: "session-control-clients" });
  const session = {
    id: "s-1",
    controlState: {
      currentController: {
        clientId: "client-local",
        active: true,
        label: "Laptop"
      },
      attachedClients: [
        {
          clientId: "client-local",
          active: true,
          accessMode: "operator",
          label: "Laptop"
        },
        {
          clientId: "client-remote",
          active: true,
          accessMode: "operator",
          label: "Desktop"
        },
        {
          clientId: "client-stale",
          active: false,
          activeConnectionCount: 0,
          accessMode: "operator",
          label: "Tablet"
        }
      ]
    }
  };

  harness.hooks.setConnectionState("connected");
  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.renderSessionControlClients(container, session);

  assert.equal(container.children.length, 3);

  const remoteRow = container.children[1];
  const staleRow = container.children[2];

  assert.equal(remoteRow.find((node) => node.textContent === "Transfer")?.textContent, "Transfer");
  assert.equal(staleRow.find((node) => node.textContent === "Forget")?.textContent, "Forget");
});

test("app-runtime composition controller fails closed on unauthorized api recovery when auth refresh does not recover", async () => {
  const harness = createControllerHarness();
  const originalFetch = globalThis.fetch;
  let bootstrapCalls = 0;
  let fetchCalls = 0;
  harness.hooks.setCollaborators({
    appRuntimeStateController: {
      async bootstrapDevAuthToken() {
        bootstrapCalls += 1;
        return false;
      }
    }
  });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createJsonResponse(401, {
      message: "Unauthorized.",
      error: "Unauthorized"
    });
  };

  try {
    await assert.rejects(harness.hooks.getApi().listSessions(), /Unauthorized\./);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(bootstrapCalls, 1);
  assert.equal(fetchCalls, 1);
});

test("app-runtime composition controller retries unauthorized api requests and records debug traces when debug is enabled", async () => {
  const fixture = createMinimalDocumentFixture();
  const windowRef = createWindowFixture(fixture.document);
  windowRef.location.search = "?debug=1";
  const originalFetch = globalThis.fetch;
  const originalConsoleDebug = console.debug;
  const debugCalls = [];
  let fetchCalls = 0;
  let bootstrapCalls = 0;
  const harness = createControllerHarness({ windowRef });
  harness.hooks.setCollaborators({
    appRuntimeStateController: {
      async bootstrapDevAuthToken() {
        bootstrapCalls += 1;
        return true;
      }
    }
  });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return createJsonResponse(
        401,
        {
          message: "Unauthorized.",
          error: "Unauthorized"
        },
        {
          "x-ptydeck-trace-id": "trace-401",
          "x-ptydeck-correlation-id": "corr-401"
        }
      );
    }
    return createJsonResponse(
      200,
      [],
      {
        "x-ptydeck-trace-id": "trace-200",
        "x-ptydeck-correlation-id": "corr-200"
      }
    );
  };
  console.debug = (...args) => debugCalls.push(args);

  try {
    const sessions = await harness.hooks.getApi().listSessions();
    assert.deepEqual(sessions, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.debug = originalConsoleDebug;
  }

  const traceEntries = windowRef.__PTYDECK_TRACE_DEBUG__.listEntries();
  assert.equal(bootstrapCalls, 1);
  assert.equal(fetchCalls, 2);
  assert.deepEqual(
    traceEntries.map((entry) => entry.type),
    ["api.response", "api.response"]
  );
  assert.deepEqual(
    traceEntries.map((entry) => entry.payload.status),
    [401, 200]
  );
  const debugMessages = debugCalls.map(([message]) => String(message));
  assert.ok(debugMessages.some((message) => message.includes("api.request.start")));
  assert.ok(debugMessages.some((message) => message.includes("api.request.error")));
  assert.ok(debugMessages.some((message) => message.includes("api.request.retry_after_unauthorized")));
  assert.ok(debugMessages.some((message) => message.includes("api.request.ok")));
});

test("app-runtime composition controller stream adapter records debug traces and clears activity after quiet idle", async () => {
  const fixture = createMinimalDocumentFixture();
  const windowRef = createWindowFixture(fixture.document);
  windowRef.location.search = "?debug=1";
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, delay) => {
    const token = { fn, delay, cleared: false };
    timers.push(token);
    return token;
  };
  globalThis.clearTimeout = (token) => {
    if (token && typeof token === "object") {
      token.cleared = true;
    }
  };

  try {
    const harness = createControllerHarness({ windowRef });
    const appendedChunks = [];
    harness.hooks.setCollaborators({
      appSessionRuntimeFacadeController: {
        appendTerminalChunk(sessionId, chunk) {
          appendedChunks.push([sessionId, chunk]);
        }
      }
    });
    harness.hooks.setSessionsForTest([
      {
        id: "s-1",
        name: "Session 1",
        shell: "/bin/bash",
        cwd: "/tmp",
        activityState: "active",
        hasLiveActivity: true
      }
    ]);

    const streamAdapter = harness.hooks.getStreamAdapter();
    assert.equal(streamAdapter.push("s-1", "hello"), true);
    assert.deepEqual(appendedChunks, [["s-1", "hello"]]);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 1400);
    assert.equal(
      harness.hooks.getStoreState().sessions.find((session) => session.id === "s-1")?.activityState,
      "active"
    );

    await timers[0].fn();

    assert.deepEqual(
      windowRef.__PTYDECK_STREAM_DEBUG__.getSessionTrace("s-1").map((entry) => entry.type),
      ["stream.data", "stream.idle"]
    );
    assert.equal(
      harness.hooks.getStoreState().sessions.find((session) => session.id === "s-1")?.activityState,
      "inactive"
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
