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
      search: ""
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

function createControllerHarness(options = {}) {
  const fixture = createMinimalDocumentFixture();
  const hooks = {};
  let ensuredIdentityCount = 0;
  const controller = createAppRuntimeCompositionController({
    windowRef: createWindowFixture(fixture.document),
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

test("app-runtime composition controller preserves a specific initialization error message over the generic fallback", () => {
  const harness = createControllerHarness();

  harness.controller.setInitializationError("Specific runtime failure.");
  harness.controller.setInitializationError("");

  assert.equal(harness.hooks.getInitializationErrorMessage(), "Specific runtime failure.");
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

  harness.hooks.setRuntimeClientId("client-local");
  harness.hooks.renderSessionControlClients(container, session);

  assert.equal(container.children.length, 3);

  const remoteRow = container.children[1];
  const staleRow = container.children[2];

  assert.equal(remoteRow.find((node) => node.textContent === "Transfer")?.textContent, "Transfer");
  assert.equal(staleRow.find((node) => node.textContent === "Forget")?.textContent, "Forget");
});
