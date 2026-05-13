import test from "node:test";
import assert from "node:assert/strict";

import { createOperatorComposerPlacementRuntimeController } from "../src/public/operator-composer-placement-runtime-controller.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(token) {
    this.values.add(token);
  }

  remove(token) {
    this.values.delete(token);
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this.values.has(token)) {
        this.values.delete(token);
        return false;
      }
      this.values.add(token);
      return true;
    }
    if (force) {
      this.values.add(token);
      return true;
    }
    this.values.delete(token);
    return false;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeStyle {
  setProperty(name, value) {
    this[name] = value;
  }

  removeProperty(name) {
    delete this[name];
  }
}

class FakeElement {
  constructor(tagName = "div", { offsetHeight = 0 } = {}) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.offsetHeight = offsetHeight;
    this.clientHeight = offsetHeight;
    this.appendChildCalls = 0;
    this.removeChildCalls = 0;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  appendChild(child) {
    if (!child) {
      return child;
    }
    this.appendChildCalls += 1;
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
      this.removeChildCalls += 1;
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...children) {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
    for (const child of children) {
      this.appendChild(child);
    }
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) {
      list.splice(index, 1);
    }
    this.listeners.set(type, list);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({ type, target: this, preventDefault() {}, ...event });
    }
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    delete this[name];
  }

  focus() {}
}

function createWindowRef() {
  return {
    setTimeout(callback) {
      return globalThis.setTimeout(callback, 0);
    },
    clearTimeout(handle) {
      globalThis.clearTimeout(handle);
    }
  };
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createApiState(payload = {}) {
  return {
    clientId: "client-1",
    mode: payload.mode || "shared-footer",
    pinnedSessionIds: payload.pinnedSessionIds || [],
    sharedDraft: payload.sharedDraft || "",
    pinnedDrafts: payload.pinnedDrafts || {}
  };
}

test("operator composer placement controller moves the shared composer into the active overlay host", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-1", name: "Alpha" };
  const overlayHostEl = new FakeElement("div");
  const composerPinBtn = new FakeElement("button");
  const toolbarEl = new FakeElement("div", { offsetHeight: 42 });
  const terminals = new Map([
    [
      session.id,
      {
        composerOverlayHostEl: overlayHostEl,
        composerPinBtn,
        toolbarEl
      }
    ]
  ]);
  controlPaneEl.appendChild(controlPaneBodyEl);

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState(payload);
      }
    },
    workspaceShellEl,
    controlPaneEl,
    controlPaneBodyEl,
    controlPaneResizeHandleEl,
    composerPlacementModeSelectEl,
    commandInput,
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "A",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  assert.equal(controlPaneBodyEl.parentNode, controlPaneEl);

  await controller.setMode("active-overlay");

  assert.deepEqual(patchCalls, [{ mode: "active-overlay" }]);
  assert.equal(composerPlacementModeSelectEl.value, "active-overlay");
  assert.equal(workspaceShellEl.classList.contains("composer-placement-active-overlay"), true);
  assert.equal(overlayHostEl.hidden, false);
  assert.equal(composerPinBtn.hidden, false);
  assert.notEqual(controlPaneBodyEl.parentNode, controlPaneEl);
  assert.equal(overlayHostEl.children.length, 1);

  await controller.setMode("shared-footer");

  assert.equal(controlPaneBodyEl.parentNode, controlPaneEl);
  assert.equal(overlayHostEl.hidden, true);
  assert.equal(workspaceShellEl.classList.contains("composer-placement-active-overlay"), false);
  controller.dispose();
});

test("operator composer placement controller initializes from the server-side placement state", async () => {
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-init", name: "Init" };
  const overlayHostEl = new FakeElement("div");
  const composerPinBtn = new FakeElement("button");
  const toolbarEl = new FakeElement("div", { offsetHeight: 40 });
  const terminals = new Map([
    [
      session.id,
      {
        composerOverlayHostEl: overlayHostEl,
        composerPinBtn,
        toolbarEl
      }
    ]
  ]);
  controlPaneEl.appendChild(controlPaneBodyEl);

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async getOperatorComposerPlacement() {
        return createApiState({
          mode: "active-overlay",
          sharedDraft: "pwd"
        });
      }
    },
    workspaceShellEl,
    controlPaneEl,
    controlPaneBodyEl,
    controlPaneResizeHandleEl,
    composerPlacementModeSelectEl,
    commandInput,
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "I",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  await controller.initialize();

  assert.equal(composerPlacementModeSelectEl.value, "active-overlay");
  assert.equal(commandInput.value, "pwd");
  assert.equal(workspaceShellEl.classList.contains("composer-placement-active-overlay"), true);
  assert.equal(overlayHostEl.hidden, false);
  assert.equal(overlayHostEl.children.length, 1);
  assert.notEqual(controlPaneBodyEl.parentNode, controlPaneEl);
  controller.dispose();
});

test("operator composer placement controller keeps the shared overlay mounted across stable rerenders", async () => {
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-stable", name: "Stable" };
  const overlayHostEl = new FakeElement("div");
  const composerPinBtn = new FakeElement("button");
  const toolbarEl = new FakeElement("div", { offsetHeight: 40 });
  const terminals = new Map([
    [
      session.id,
      {
        composerOverlayHostEl: overlayHostEl,
        composerPinBtn,
        toolbarEl
      }
    ]
  ]);
  controlPaneEl.appendChild(controlPaneBodyEl);

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    workspaceShellEl,
    controlPaneEl,
    controlPaneBodyEl,
    controlPaneResizeHandleEl,
    composerPlacementModeSelectEl,
    commandInput,
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "S",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  controller.applyPlacementState({
    clientId: "client-1",
    mode: "active-overlay",
    pinnedSessionIds: [],
    sharedDraft: "echo stable",
    pinnedDrafts: {}
  });

  const appendCallsAfterFirstMount = overlayHostEl.appendChildCalls;
  const removeCallsAfterFirstMount = overlayHostEl.removeChildCalls;
  const mountedChild = overlayHostEl.firstChild;

  controller.render();

  assert.equal(overlayHostEl.firstChild, mountedChild);
  assert.equal(overlayHostEl.appendChildCalls, appendCallsAfterFirstMount);
  assert.equal(overlayHostEl.removeChildCalls, removeCallsAfterFirstMount);
  assert.equal(controlPaneBodyEl.parentNode?.parentNode, mountedChild);
  controller.dispose();
});

test("operator composer placement controller isolates pinned drafts from the shared overlay draft", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-2", name: "Beta" };
  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState({
          mode: "active-overlay",
          pinnedSessionIds: payload.pinnedSessionIds || [],
          sharedDraft: payload.sharedDraft || "",
          pinnedDrafts: payload.pinnedDrafts || {}
        });
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput,
    terminals: new Map(),
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "B",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  controller.applyPlacementState({
    clientId: "client-1",
    mode: "active-overlay",
    pinnedSessionIds: [],
    sharedDraft: "pwd",
    pinnedDrafts: {}
  });

  await controller.pinSession(session.id);

  assert.deepEqual(controller.getState().pinnedSessionIds, [session.id]);
  assert.deepEqual(controller.getState().pinnedDrafts, { [session.id]: "pwd" });
  assert.equal(controller.getState().sharedDraft, "");
  assert.deepEqual(patchCalls[0], {
    pinnedSessionIds: [session.id],
    sharedDraft: "",
    pinnedDrafts: { [session.id]: "pwd" }
  });

  await controller.unpinSession(session.id);

  assert.deepEqual(controller.getState().pinnedSessionIds, []);
  assert.deepEqual(controller.getState().pinnedDrafts, {});
  assert.equal(controller.getState().sharedDraft, "pwd");
  assert.deepEqual(patchCalls[1], {
    pinnedSessionIds: [],
    sharedDraft: "pwd",
    pinnedDrafts: {}
  });
  controller.dispose();
});
