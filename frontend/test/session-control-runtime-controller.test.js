import test from "node:test";
import assert from "node:assert/strict";

import { createSessionControlRuntimeController } from "../src/public/session-control-runtime-controller.js";

class ClassList {
  constructor() {
    this.tokens = new Set();
  }

  add(token) {
    this.tokens.add(token);
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.className = "";
    this.classList = new ClassList();
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.childNodes = this.children;
    this.firstChild = null;
  }

  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.childNodes = this.children;
    this.firstChild = null;
    for (const child of children) {
      this.appendChild(child);
    }
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    this.firstChild = this.children[0] || null;
    return child;
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
}

function createDocumentRef() {
  return {
    activeElement: null,
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createReconnectReservedSession(overrides = {}) {
  return {
    id: "s-1",
    name: "Runtime",
    controlState: {
      owner: {
        subject: "user-1",
        tenantId: "tenant-1",
        accessMode: "operator",
        permissionMode: "write"
      },
      currentController: {
        clientId: "client-remote",
        label: "Desktop",
        active: false,
        subject: "user-1",
        tenantId: "tenant-1"
      },
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: true,
          activeConnectionCount: 1,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        },
        {
          clientId: "client-remote",
          label: "Desktop",
          active: false,
          activeConnectionCount: 0,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        }
      ],
      lastInput: {
        clientId: "client-remote",
        label: "Desktop"
      }
    },
    ...overrides
  };
}

test("session-control runtime controller redirects to canonical origin and consumes handoff markers deterministically", () => {
  const replaceCalls = [];
  const historyCalls = [];
  const windowRef = {
    location: {
      origin: "http://172.26.86.97:18081",
      pathname: "/ui",
      search: "?debug=1&ptydeck_origin_handoff=http%3A%2F%2Fold.example",
      hash: "#deck",
      replace(url) {
        replaceCalls.push(url);
      }
    },
    history: {
      state: { ok: true },
      replaceState(state, _title, url) {
        historyCalls.push([state, url]);
      }
    }
  };
  const controller = createSessionControlRuntimeController({
    windowRef,
    config: { canonicalOrigin: "https://ptydeck.local.secos.rocks" }
  });

  assert.equal(controller.maybeRedirectToCanonicalOrigin(), true);
  assert.deepEqual(replaceCalls, [
    "https://ptydeck.local.secos.rocks/ui?debug=1&ptydeck_origin_handoff=http%3A%2F%2F172.26.86.97%3A18081#deck"
  ]);
  assert.equal(controller.consumeOriginHandoffSourceFromWindow(), "http://old.example");
  assert.deepEqual(historyCalls, [[{ ok: true }, "/ui?debug=1#deck"]]);
});

test("session-control runtime controller auto-repairs origin handoff once and clears the handoff source on success", async () => {
  const takeCalls = [];
  const feedbackMessages = [];
  const debugEvents = [];
  const session = createReconnectReservedSession();
  const controller = createSessionControlRuntimeController({
    getSessions: () => [session],
    takeSessionControlScope: async (scope, options) => {
      takeCalls.push([scope, options]);
      return { ok: true };
    },
    setCommandFeedback: (message) => feedbackMessages.push(message),
    debugLog: (event, payload) => debugEvents.push([event, payload])
  });

  controller.setRuntimeClientId("client-local");
  controller.setTrustedLocalClientLabel("Laptop");
  controller.setRuntimeClientIdentityCreatedOnThisOrigin(true);
  controller.setOriginHandoffSourceOrigin("http://172.26.86.97:18081");

  assert.equal(await controller.maybeAutoRepairOriginHandoffControl(), true);
  assert.deepEqual(takeCalls, [["session", { sessionId: "s-1" }]]);
  assert.equal(
    feedbackMessages[0],
    "Detected origin handoff from http://172.26.86.97:18081. This device reclaimed control for the affected sessions automatically."
  );
  assert.equal(controller.getOriginHandoffSourceOrigin(), "");
  assert.equal(await controller.maybeAutoRepairOriginHandoffControl(), false);
  assert.equal(debugEvents[0][0], "trusted_local.origin_handoff_auto_repair.start");
  assert.equal(debugEvents[1][0], "trusted_local.origin_handoff_auto_repair.ok");
});

test("session-control runtime controller drives reclaim-and-retry actions through takeover and blocked-action retry", async () => {
  const feedbackActionStates = [];
  const feedbackMessages = [];
  const takeCalls = [];
  const retryCalls = [];
  const resizeCalls = [];
  const session = createReconnectReservedSession();
  const uiState = {
    readOnlyMode: false,
    accessSummary: "",
    commandFeedbackActionSessionId: session.id
  };
  const controller = createSessionControlRuntimeController({
    uiState,
    getSessionById: () => session,
    takeSessionControlScope: async (scope, options) => {
      takeCalls.push([scope, options]);
      return { ok: true };
    },
    setCommandFeedback: (message) => feedbackMessages.push(message),
    setCommandFeedbackAction: (nextState) => feedbackActionStates.push(nextState),
    clearCommandFeedbackAction: (nextState) => feedbackActionStates.push({ clear: true, ...nextState }),
    retryBlockedAction: async (retryAction) => {
      retryCalls.push(retryAction);
    },
    applyResizeForSession: (sessionId, options) => resizeCalls.push([sessionId, options]),
    formatSessionToken: () => "7",
    formatSessionDisplayName: () => "Runtime",
    showControlPane: () => feedbackMessages.push("show-control-pane")
  });

  controller.setRuntimeClientId("client-local");
  controller.setTrustedLocalClientLabel("Laptop");
  assert.equal(
    controller.showBlockedWriteReclaimUi(session, { retryAction: { kind: "send", payload: "status" } }),
    true
  );
  assert.equal(feedbackActionStates[0].label, "Reclaim Control and Retry");
  assert.equal(feedbackMessages[0], "Control is reserved for reconnecting device Desktop. Take control to reclaim it or wait for reconnect.");
  assert.equal(feedbackMessages[1], "show-control-pane");

  assert.equal(await controller.handleCommandFeedbackAction(session.id), true);
  assert.deepEqual(takeCalls, [["session", { sessionId: "s-1" }]]);
  assert.deepEqual(retryCalls, [{ kind: "send", payload: "status" }]);
  assert.deepEqual(resizeCalls, []);
  assert.equal(controller.getCommandFeedbackActionMeta(), null);
  assert.equal(feedbackActionStates.at(-1).clear, true);
});

test("session-control runtime controller renames local devices, forgets stale devices, and renders session-control UI state", async () => {
  const requestRenderCalls = [];
  const renamedLabels = [];
  const clearCalls = [];
  const renameCalls = [];
  const forgetCalls = [];
  const session = createReconnectReservedSession();
  const documentRef = createDocumentRef();
  const controller = createSessionControlRuntimeController({
    documentRef,
    requestRender: () => requestRenderCalls.push("render"),
    clearCommandFeedbackAction: (payload) => clearCalls.push(payload),
    getSessionById: () => session,
    api: {
      renameSessionControlClient: async (sessionId, label) => {
        renameCalls.push([sessionId, label]);
        return { ok: true, sessionId, label };
      },
      forgetSessionControlClient: async (sessionId, clientId) => {
        forgetCalls.push([sessionId, clientId]);
        return { ok: true, sessionId, clientId };
      },
      setSessionControlClientId() {}
    },
    renameTrustedLocalClientIdentity: (label) => {
      renamedLabels.push(label);
      return { label };
    }
  });

  controller.setRuntimeClientId("client-local");
  controller.setTrustedLocalClientLabel("Laptop");
  await controller.renameTrustedLocalDevice(session.id, "Desk");
  await controller.forgetTrustedLocalDevice(session.id, "client-remote");

  assert.deepEqual(renameCalls, [["s-1", "Desk"]]);
  assert.deepEqual(forgetCalls, [["s-1", "client-remote"]]);
  assert.deepEqual(renamedLabels, ["Desk"]);
  assert.equal(controller.getTrustedLocalClientLabel(), "Desk");
  assert.equal(requestRenderCalls.length, 2);
  assert.equal(clearCalls.length, 2);

  const entry = {
    controlBadgeEl: new FakeElement("span"),
    sessionControlSummaryEl: new FakeElement("p"),
    sessionControlTakeBtn: new FakeElement("button"),
    sessionControlReleaseBtn: new FakeElement("button"),
    settingsApplyBtn: new FakeElement("button"),
    sessionControlDeviceNameInput: new FakeElement("input"),
    sessionControlDeviceSaveBtn: new FakeElement("button"),
    sessionControlClientsEl: new FakeElement("div")
  };
  controller.renderSessionControl(entry, session);

  assert.equal(entry.controlBadgeEl.textContent, "RECLAIM");
  assert.equal(entry.sessionControlTakeBtn.textContent, "Reclaim Control");
  assert.equal(entry.sessionControlTakeBtn.disabled, false);
  assert.equal(entry.sessionControlReleaseBtn.disabled, false);
  assert.equal(entry.settingsApplyBtn.disabled, true);
  assert.equal(entry.sessionControlDeviceNameInput.value, "Desk");
  assert.equal(entry.sessionControlDeviceSaveBtn.disabled, false);
  assert.equal(entry.sessionControlClientsEl.children.length, 2);
  assert.equal(entry.sessionControlClientsEl.children[1].children[1].children[0].dataset.sessionControlAction, "forget");
  assert.equal(entry.sessionControlClientsEl.children[1].children[1].children[0].textContent, "Forget");
});
