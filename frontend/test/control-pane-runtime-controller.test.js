import test from "node:test";
import assert from "node:assert/strict";

import { createControlPaneRuntimeController } from "../src/public/control-pane-runtime-controller.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(token, active) {
    if (active) {
      this.values.add(token);
    } else {
      this.values.delete(token);
    }
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor({ width = 1100, height = 720 } = {}) {
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.dataset = {};
    this.clientWidth = width;
    this.clientHeight = height;
    this.classList = new FakeClassList();
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({ type, target: this, preventDefault() {}, ...event });
    }
  }

  click() {
    this.dispatch("click");
  }

  setAttribute() {}

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight
    };
  }
}

function createWindowRef() {
  const listeners = new Map();
  return {
    innerWidth: 1200,
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(handler);
      if (index >= 0) {
        list.splice(index, 1);
      }
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler({ type, ...event });
      }
    }
  };
}

test("control pane runtime controller toggles visibility and renders status", () => {
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement();
  const controlPaneEl = new FakeElement();
  const launcherEl = new FakeElement();
  const toggleEl = new FakeElement();
  const positionEl = new FakeElement();
  const statusEl = new FakeElement();
  const resizeHandleEl = new FakeElement();

  const controller = createControlPaneRuntimeController({
    windowRef,
    workspaceShellEl,
    controlPaneEl,
    controlPaneLauncherBtn: launcherEl,
    controlPaneToggleBtn: toggleEl,
    controlPanePositionSelectEl: positionEl,
    controlPaneStatusEl: statusEl,
    controlPaneResizeHandleEl: resizeHandleEl
  });

  assert.deepEqual(controller.getState(), {
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 240
  });
  assert.equal(controlPaneEl.hidden, false);
  assert.equal(launcherEl.hidden, true);
  assert.equal(statusEl.textContent, "");
  assert.equal(toggleEl.textContent, "Hide");

  toggleEl.click();
  assert.equal(controller.getState().controlPaneVisible, false);
  assert.equal(controlPaneEl.hidden, false);
  assert.equal(launcherEl.hidden, true);
  assert.equal(statusEl.textContent, "");
  assert.equal(toggleEl.textContent, "Show");

  launcherEl.click();
  assert.equal(controller.getState().controlPaneVisible, true);
  assert.equal(launcherEl.hidden, true);

  toggleEl.click();
  assert.equal(controller.getState().controlPaneVisible, false);
  assert.equal(controlPaneEl.hidden, false);
  assert.equal(toggleEl.textContent, "Show");
});

test("control pane runtime controller normalizes unsupported side positions to bottom", () => {
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement({ width: 780, height: 720 });
  const controlPaneEl = new FakeElement();
  const controller = createControlPaneRuntimeController({
    windowRef,
    workspaceShellEl,
    controlPaneEl,
    controlPaneLauncherBtn: new FakeElement(),
    controlPaneToggleBtn: new FakeElement(),
    controlPanePositionSelectEl: new FakeElement(),
    controlPaneStatusEl: new FakeElement(),
    controlPaneResizeHandleEl: new FakeElement()
  });

  controller.setState({
    controlPaneVisible: true,
    controlPanePosition: "right",
    controlPaneSize: 360
  });

  assert.equal(controller.getState().controlPanePosition, "bottom");
  assert.equal(controller.getEffectivePosition(), "bottom");
  assert.equal(controlPaneEl.dataset.position, "bottom");
  assert.equal(controlPaneEl.dataset.effectivePosition, "bottom");
  assert.equal(workspaceShellEl.classList.contains("control-pane-pos-bottom"), true);
  assert.equal(workspaceShellEl.classList.contains("control-pane-pos-left"), false);
  assert.equal(workspaceShellEl.classList.contains("control-pane-pos-right"), false);
});

test("control pane runtime controller resizes and clamps pane size", () => {
  const windowRef = createWindowRef();
  const workspaceShellEl = new FakeElement({ width: 1000, height: 700 });
  const resizeHandleEl = new FakeElement();
  const resizeCalls = [];
  const deferredResizeCalls = [];
  const controller = createControlPaneRuntimeController({
    windowRef,
    workspaceShellEl,
    controlPaneEl: new FakeElement(),
    controlPaneLauncherBtn: new FakeElement(),
    controlPaneToggleBtn: new FakeElement(),
    controlPanePositionSelectEl: new FakeElement(),
    controlPaneStatusEl: new FakeElement(),
    controlPaneResizeHandleEl: resizeHandleEl,
    scheduleGlobalResize: (options) => resizeCalls.push(options),
    scheduleDeferredResizePasses: (options) => deferredResizeCalls.push(options)
  });

  controller.setState({
    controlPaneVisible: true,
    controlPanePosition: "top",
    controlPaneSize: 240
  });

  resizeHandleEl.dispatch("pointerdown", { clientX: 0, clientY: 240 });
  windowRef.dispatch("pointermove", { clientX: 0, clientY: 80 });
  assert.equal(controller.getState().controlPaneSize, 120);

  windowRef.dispatch("pointermove", { clientX: 0, clientY: 640 });
  assert.equal(controller.getState().controlPaneSize, 640);

  windowRef.dispatch("pointerup", {});
  assert.ok(resizeCalls.length >= 2);
  assert.ok(deferredResizeCalls.length >= 1);
});
