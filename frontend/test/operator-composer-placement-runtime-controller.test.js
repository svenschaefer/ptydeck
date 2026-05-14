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

function hasClassName(node, className) {
  const value = typeof node?.className === "string" ? node.className : "";
  return value.split(/\s+/).includes(className);
}

function findNodeByClass(root, className) {
  if (!root) {
    return null;
  }
  if (hasClassName(root, className)) {
    return root;
  }
  for (const child of root.children || []) {
    const match = findNodeByClass(child, className);
    if (match) {
      return match;
    }
  }
  return null;
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

async function waitForTurn() {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
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

test("operator composer placement controller suppresses pre-attach operator-client bootstrap races and can retry later", async () => {
  const errors = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-race", name: "Race" };
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

  let phase = 0;
  const api = {
    async getOperatorComposerPlacement() {
      if (phase === 0) {
        phase = 1;
        const error = new Error("This action requires the active operator client id. Reconnect the session UI and retry.");
        error.status = 409;
        error.error = "OperatorClientRequired";
        throw error;
      }
      return createApiState({
        mode: "active-overlay",
        sharedDraft: "whoami"
      });
    }
  };

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api,
    workspaceShellEl,
    controlPaneEl,
    controlPaneBodyEl,
    controlPaneResizeHandleEl,
    composerPlacementModeSelectEl,
    commandInput,
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "R",
    formatSessionDisplayName: (entry) => entry?.name || "",
    setError: (message) => errors.push(message)
  });

  await controller.initialize();

  assert.deepEqual(errors, []);
  assert.equal(commandInput.value, "");
  assert.equal(composerPlacementModeSelectEl.value, "shared-footer");

  await controller.initialize();

  assert.equal(composerPlacementModeSelectEl.value, "active-overlay");
  assert.equal(commandInput.value, "whoami");
  assert.equal(workspaceShellEl.classList.contains("composer-placement-active-overlay"), true);
  controller.dispose();
});

test("operator composer placement controller suppresses pre-auth bearer-token bootstrap races and can retry later", async () => {
  const errors = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  let phase = 0;

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async getOperatorComposerPlacement() {
        if (phase === 0) {
          phase = 1;
          const error = new Error("Missing bearer token.");
          error.status = 401;
          error.error = "Unauthorized";
          throw error;
        }
        return createApiState({
          mode: "active-overlay",
          pinnedSessionIds: ["s-2"],
          pinnedDrafts: { "s-2": "pwd" }
        });
      }
    },
    workspaceShellEl,
    controlPaneEl,
    controlPaneBodyEl,
    controlPaneResizeHandleEl,
    composerPlacementModeSelectEl,
    commandInput,
    terminals: new Map(),
    getState: () => ({ sessions: [], activeSessionId: "" }),
    setError: (message) => errors.push(message)
  });

  const firstState = await controller.initialize();
  assert.equal(firstState.mode, "shared-footer");
  assert.deepEqual(errors, []);

  const secondState = await controller.initialize();
  assert.equal(secondState.mode, "active-overlay");
  assert.deepEqual(secondState.pinnedSessionIds, ["s-2"]);
  assert.deepEqual(errors, []);
  controller.dispose();
});

test("operator composer placement controller keeps stopped sessions visually empty in overlay mode", async () => {
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement("section");
  const controlPaneEl = new FakeElement("section");
  const controlPaneBodyEl = new FakeElement("div");
  const controlPaneResizeHandleEl = new FakeElement("div");
  const composerPlacementModeSelectEl = new FakeElement("select");
  const commandInput = new FakeElement("textarea");
  const session = { id: "s-stopped", name: "Stopped", state: "stopped" };
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
    isSessionStopped: (entry) => entry?.state === "stopped",
    formatSessionToken: () => "T",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  await controller.setMode("active-overlay");

  assert.equal(overlayHostEl.hidden, true);
  assert.equal(overlayHostEl.children.length, 0);

  await controller.pinSession(session.id);

  assert.equal(overlayHostEl.hidden, true);
  assert.equal(overlayHostEl.children.length, 0);
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

test("operator composer placement controller ignores stale shared-draft echoes while local footer input is newer", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState({
          sharedDraft: "server-old"
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
    getState: () => ({ sessions: [], activeSessionId: "" }),
    getSessionById: () => null
  });

  controller.applyPlacementState(
    createApiState({
      sharedDraft: "server-old"
    })
  );

  commandInput.value = "client-new";
  commandInput.dispatch("input");

  await waitForTurn();
  await waitForTurn();

  assert.deepEqual(patchCalls, [{ sharedDraft: "client-new" }]);
  assert.equal(commandInput.value, "client-new");
  assert.equal(controller.getState().sharedDraft, "client-new");

  controller.applyPlacementState(
    createApiState({
      sharedDraft: "client-new"
    })
  );

  assert.equal(commandInput.value, "client-new");
  assert.equal(controller.getState().sharedDraft, "client-new");
  controller.dispose();
});

test("operator composer placement controller does not rewrite the focused shared footer input from server state", () => {
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput,
    terminals: new Map(),
    getState: () => ({ sessions: [], activeSessionId: "" }),
    getSessionById: () => null
  });

  controller.applyPlacementState(
    createApiState({
      sharedDraft: "before-focus"
    })
  );

  commandInput.dispatch("focus");
  controller.applyPlacementState(
    createApiState({
      sharedDraft: "server-overwrite"
    })
  );

  assert.equal(commandInput.value, "before-focus");
  assert.equal(controller.getState().sharedDraft, "server-overwrite");
  controller.dispose();
});

test("operator composer placement controller normalizes shared footer drafts and persists them", async () => {
  const patchCalls = [];
  let sharedRefreshCount = 0;
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");
  const normalizeBtn = new FakeElement("button");

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState(payload);
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput,
    normalizeBtn,
    scheduleSharedCommandRefresh: () => {
      sharedRefreshCount += 1;
    }
  });

  commandInput.value = "  echo ok  \r\n  ls -la  \n";
  normalizeBtn.dispatch("click");

  await waitForTurn();
  await waitForTurn();

  assert.equal(commandInput.value, "echo ok\nls -la");
  assert.equal(controller.getState().sharedDraft, "echo ok\nls -la");
  assert.deepEqual(patchCalls, [{ sharedDraft: "echo ok\nls -la" }]);
  assert.equal(sharedRefreshCount, 1);
  controller.dispose();
});

test("operator composer placement controller opens a shared repair preview and only applies it on explicit approval", async () => {
  const patchCalls = [];
  let sharedRefreshCount = 0;
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");
  const normalizeBtn = new FakeElement("button");
  const repairBtn = new FakeElement("button");
  const repairEl = new FakeElement("section");
  repairEl.hidden = true;
  const repairSummaryEl = new FakeElement("p");
  const repairDetailEl = new FakeElement("p");
  const repairOriginalEl = new FakeElement("pre");
  const repairOutputWrapEl = new FakeElement("section");
  repairOutputWrapEl.hidden = true;
  const repairOutputEl = new FakeElement("pre");
  const repairDiffWrapEl = new FakeElement("section");
  repairDiffWrapEl.hidden = true;
  const repairDiffEl = new FakeElement("pre");
  const repairApplyBtn = new FakeElement("button");
  repairApplyBtn.hidden = true;
  const repairCancelBtn = new FakeElement("button");

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState(payload);
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput,
    normalizeBtn,
    repairBtn,
    repairEl,
    repairSummaryEl,
    repairDetailEl,
    repairOriginalEl,
    repairOutputWrapEl,
    repairOutputEl,
    repairDiffWrapEl,
    repairDiffEl,
    repairApplyBtn,
    repairCancelBtn,
    requestRepairCandidate: async () => ({
      repairedText: "Ubuntu-24.04",
      languageFamily: "powershell",
      confidence: 0.92,
      operations: ["joined wrapped token"]
    }),
    scheduleSharedCommandRefresh: () => {
      sharedRefreshCount += 1;
    }
  });

  commandInput.value = "Ubuntu-\n24.04";
  repairBtn.dispatch("click");

  await waitForTurn();

  assert.equal(commandInput.value, "Ubuntu-\n24.04");
  assert.equal(repairEl.hidden, false);
  assert.equal(repairSummaryEl.textContent, "Review repair suggestion.");
  assert.equal(repairOriginalEl.textContent, "Ubuntu-\n24.04");
  assert.equal(repairOutputEl.textContent, "Ubuntu-24.04");
  assert.equal(repairDiffEl.textContent, "-Ubuntu-\n-24.04\n+Ubuntu-24.04");
  assert.equal(repairOutputWrapEl.hidden, false);
  assert.equal(repairDiffWrapEl.hidden, false);
  assert.equal(repairApplyBtn.hidden, false);
  assert.deepEqual(patchCalls, []);

  repairApplyBtn.dispatch("click");
  await waitForTurn();
  await waitForTurn();

  assert.equal(commandInput.value, "Ubuntu-24.04");
  assert.equal(repairEl.hidden, true);
  assert.deepEqual(controller.getState().sharedDraft, "Ubuntu-24.04");
  assert.deepEqual(patchCalls, [{ sharedDraft: "Ubuntu-24.04" }]);
  assert.equal(sharedRefreshCount, 1);
  controller.dispose();
});

test("operator composer placement controller cancels a shared repair preview without mutating the draft", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const commandInput = new FakeElement("textarea");
  const repairBtn = new FakeElement("button");
  const repairEl = new FakeElement("section");
  repairEl.hidden = true;
  const repairSummaryEl = new FakeElement("p");
  const repairDetailEl = new FakeElement("p");
  const repairOriginalEl = new FakeElement("pre");
  const repairOutputWrapEl = new FakeElement("section");
  repairOutputWrapEl.hidden = true;
  const repairOutputEl = new FakeElement("pre");
  const repairDiffWrapEl = new FakeElement("section");
  repairDiffWrapEl.hidden = true;
  const repairDiffEl = new FakeElement("pre");
  const repairApplyBtn = new FakeElement("button");
  repairApplyBtn.hidden = true;
  const repairCancelBtn = new FakeElement("button");

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState(payload);
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput,
    repairBtn,
    repairEl,
    repairSummaryEl,
    repairDetailEl,
    repairOriginalEl,
    repairOutputWrapEl,
    repairOutputEl,
    repairDiffWrapEl,
    repairDiffEl,
    repairApplyBtn,
    repairCancelBtn,
    requestRepairCandidate: async () => ({
      repairedText: "<message>Hello world</message>",
      languageFamily: "xml",
      confidence: 0.76,
      operations: ["joined wrapped XML text"]
    })
  });

  commandInput.value = "<message>Hello\nworld</message>";
  repairBtn.dispatch("click");
  await waitForTurn();

  assert.equal(repairEl.hidden, false);
  repairCancelBtn.dispatch("click");

  assert.equal(commandInput.value, "<message>Hello\nworld</message>");
  assert.equal(repairEl.hidden, true);
  assert.deepEqual(controller.getState().sharedDraft, "");
  assert.deepEqual(patchCalls, []);
  controller.dispose();
});

test("operator composer placement controller ignores stale pinned-draft echoes while local pinned input is newer", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const session = { id: "s-pin", name: "Pinned" };
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

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState({
          mode: "active-overlay",
          pinnedSessionIds: [session.id],
          pinnedDrafts: { [session.id]: "server-old" }
        });
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput: new FakeElement("textarea"),
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "P",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  controller.applyPlacementState(
    createApiState({
      mode: "active-overlay",
      pinnedSessionIds: [session.id],
      pinnedDrafts: { [session.id]: "server-old" }
    })
  );

  const pinnedRoot = overlayHostEl.firstChild;
  const pinnedTextarea = pinnedRoot?.children?.[2]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0] || null;
  assert.ok(pinnedTextarea);

  pinnedTextarea.dispatch("focus");
  pinnedTextarea.value = "client-new";
  pinnedTextarea.dispatch("input");

  await waitForTurn();
  await waitForTurn();

  assert.deepEqual(patchCalls, [{ pinnedDrafts: { [session.id]: "client-new" } }]);
  assert.equal(pinnedTextarea.value, "client-new");
  assert.deepEqual(controller.getState().pinnedDrafts, { [session.id]: "client-new" });

  controller.applyPlacementState(
    createApiState({
      mode: "active-overlay",
      pinnedSessionIds: [session.id],
      pinnedDrafts: { [session.id]: "client-new" }
    })
  );

  assert.equal(pinnedTextarea.value, "client-new");
  assert.deepEqual(controller.getState().pinnedDrafts, { [session.id]: "client-new" });
  controller.dispose();
});

test("operator composer placement controller normalizes pinned drafts and persists them", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const session = { id: "s-pin-normalize", name: "Pinned Normalize" };
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

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState({
          mode: "active-overlay",
          pinnedSessionIds: [session.id],
          pinnedDrafts: payload.pinnedDrafts || {}
        });
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput: new FakeElement("textarea"),
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    formatSessionToken: () => "P",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  controller.applyPlacementState(
    createApiState({
      mode: "active-overlay",
      pinnedSessionIds: [session.id],
      pinnedDrafts: { [session.id]: "  echo ok  \r\n  pwd  \n" }
    })
  );

  const pinnedRoot = overlayHostEl.firstChild;
  const pinnedTextarea = pinnedRoot?.children?.[2]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0] || null;
  const normalizeBtn = pinnedRoot?.children?.[2]?.children?.[0]?.children?.[0]?.children?.[1]?.children?.[0] || null;
  assert.ok(pinnedTextarea);
  assert.ok(normalizeBtn);

  normalizeBtn.dispatch("click");

  await waitForTurn();
  await waitForTurn();

  assert.equal(pinnedTextarea.value, "echo ok\npwd");
  assert.deepEqual(controller.getState().pinnedDrafts, { [session.id]: "echo ok\npwd" });
  assert.deepEqual(patchCalls, [{ pinnedDrafts: { [session.id]: "echo ok\npwd" } }]);
  controller.dispose();
});

test("operator composer placement controller opens pinned repair previews without mutating the draft until apply", async () => {
  const patchCalls = [];
  const documentRef = createDocumentRef();
  const windowRef = createWindowRef();
  const session = { id: "s-pin-repair", name: "Pinned Repair" };
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

  const controller = createOperatorComposerPlacementRuntimeController({
    windowRef,
    documentRef,
    api: {
      async updateOperatorComposerPlacement(payload) {
        patchCalls.push(payload);
        return createApiState({
          mode: "active-overlay",
          pinnedSessionIds: [session.id],
          pinnedDrafts: payload.pinnedDrafts || {}
        });
      }
    },
    workspaceShellEl: new FakeElement("section"),
    controlPaneEl: new FakeElement("section"),
    controlPaneBodyEl: new FakeElement("div"),
    controlPaneResizeHandleEl: new FakeElement("div"),
    composerPlacementModeSelectEl: new FakeElement("select"),
    commandInput: new FakeElement("textarea"),
    terminals,
    getState: () => ({ sessions: [session], activeSessionId: session.id }),
    getSessionById: () => session,
    requestRepairCandidate: async () => ({
      repairedText: "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\demo.ps1\"",
      languageFamily: "powershell",
      confidence: 0.91,
      operations: ["joined wrapped path token", "removed hard-wrap line break inside quoted argument"]
    }),
    formatSessionToken: () => "P",
    formatSessionDisplayName: (entry) => entry?.name || ""
  });

  controller.applyPlacementState(
    createApiState({
      mode: "active-overlay",
      pinnedSessionIds: [session.id],
      pinnedDrafts: { [session.id]: "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-\n24.04\\demo.ps1\"" }
    })
  );

  const pinnedRoot = overlayHostEl.firstChild;
  const pinnedTextarea = findNodeByClass(pinnedRoot, "session-composer-overlay-input");
  const repairBtn = findNodeByClass(pinnedRoot, "session-composer-overlay-repair");
  const repairEl = findNodeByClass(pinnedRoot, "command-repair");
  const repairSummaryEl = findNodeByClass(pinnedRoot, "command-repair-summary");
  const repairOriginalEl = findNodeByClass(pinnedRoot, "command-repair-preview");
  const repairOutputEl = (function findSecondPreview(root) {
    const matches = [];
    (function visit(node) {
      if (!node) {
        return;
      }
      if (hasClassName(node, "command-repair-preview")) {
        matches.push(node);
      }
      for (const child of node.children || []) {
        visit(child);
      }
    })(root);
    return matches[1] || null;
  })(pinnedRoot);
  const repairApplyBtn = findNodeByClass(pinnedRoot, "session-composer-overlay-repair-apply");

  assert.ok(pinnedTextarea);
  assert.ok(repairBtn);
  assert.ok(repairEl);
  assert.ok(repairApplyBtn);

  repairBtn.dispatch("click");
  await waitForTurn();

  assert.equal(pinnedTextarea.value, "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-\n24.04\\demo.ps1\"");
  assert.equal(repairEl.hidden, false);
  assert.equal(repairSummaryEl?.textContent, "Review repair suggestion.");
  assert.equal(repairOriginalEl?.textContent, "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-\n24.04\\demo.ps1\"");
  assert.equal(repairOutputEl?.textContent, "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\demo.ps1\"");
  assert.deepEqual(patchCalls, []);

  repairApplyBtn.dispatch("click");
  await waitForTurn();
  await waitForTurn();

  assert.equal(pinnedTextarea.value, "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\demo.ps1\"");
  assert.equal(repairEl.hidden, true);
  assert.deepEqual(controller.getState().pinnedDrafts, {
    [session.id]: "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\demo.ps1\""
  });
  assert.deepEqual(patchCalls, [
    {
      pinnedDrafts: {
        [session.id]: "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\demo.ps1\""
      }
    }
  ]);
  controller.dispose();
});
