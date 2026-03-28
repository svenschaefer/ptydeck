import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalCtrlCRuntimeController } from "../src/public/terminal-ctrl-c-runtime-controller.js";

class FakeElement {
  constructor() {
    this.textContent = "";
    this.open = false;
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
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
}

test("terminal-ctrl-c runtime controller resolves copy and updates the prompt message", async () => {
  const dialogEl = new FakeElement();
  const messageEl = new FakeElement();
  const copyBtn = new FakeElement();
  const cancelBtn = new FakeElement();
  const controller = createTerminalCtrlCRuntimeController({
    dialogEl,
    messageEl,
    copyBtn,
    cancelBtn
  });

  const pending = controller.requestIntent({
    session: { id: "s1", name: "playbooks" },
    selection: "echo hi"
  });
  copyBtn.click();

  assert.equal(await pending, "copy");
  assert.equal(dialogEl.open, false);
  assert.match(messageEl.textContent, /playbooks/);
});

test("terminal-ctrl-c runtime controller resolves cancel and dismisses on dialog cancel", async () => {
  const dialogEl = new FakeElement();
  const messageEl = new FakeElement();
  const copyBtn = new FakeElement();
  const cancelBtn = new FakeElement();
  const controller = createTerminalCtrlCRuntimeController({
    dialogEl,
    messageEl,
    copyBtn,
    cancelBtn
  });

  const cancelPending = controller.requestIntent({
    session: { id: "s1" }
  });
  cancelBtn.click();
  assert.equal(await cancelPending, "cancel");

  const dismissPending = controller.requestIntent({
    session: { id: "s1" }
  });
  const cancelEvent = {
    type: "cancel",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  dialogEl.dispatchEvent(cancelEvent);

  assert.equal(await dismissPending, null);
  assert.equal(cancelEvent.defaultPrevented, true);
});
