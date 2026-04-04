import test from "node:test";
import assert from "node:assert/strict";

import { createActionDialogController } from "../src/public/ui/action-dialog-controller.js";

function createElement() {
  const listeners = new Map();
  return {
    textContent: "",
    value: "",
    placeholder: "",
    hidden: false,
    open: false,
    classList: {
      add() {},
      remove() {}
    },
    addEventListener(type, handler) {
      listeners.set(String(type), handler);
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    focus() {},
    select() {},
    emit(type, event = {}) {
      const handler = listeners.get(String(type));
      if (handler) {
        return handler(event);
      }
      return undefined;
    }
  };
}

test("action dialog controller resolves text requests through dialog UI", async () => {
  const dialogEl = createElement();
  const titleEl = createElement();
  const messageEl = createElement();
  const inputWrapEl = createElement();
  const inputLabelEl = createElement();
  const inputEl = createElement();
  const confirmBtn = createElement();
  const cancelBtn = createElement();
  const closeBtn = createElement();
  const controller = createActionDialogController({
    windowRef: {
      requestAnimationFrame(callback) {
        callback();
      }
    },
    dialogEl,
    titleEl,
    messageEl,
    inputWrapEl,
    inputLabelEl,
    inputEl,
    confirmBtn,
    cancelBtn,
    closeBtn
  });

  const pending = controller.requestText({
    title: "Rename Layout",
    message: "Enter a new layout name.",
    inputLabel: "Layout Name",
    defaultValue: "Focus Layout",
    confirmLabel: "Rename"
  });
  assert.equal(dialogEl.open, true);
  assert.equal(inputWrapEl.hidden, false);
  assert.equal(inputEl.value, "Focus Layout");
  inputEl.value = "Focus Layout Updated";
  confirmBtn.emit("click");

  const result = await pending;
  assert.equal(result, "Focus Layout Updated");
  assert.equal(dialogEl.open, false);
});

test("action dialog controller resolves confirm requests and supports cancel fallback", async () => {
  const controller = createActionDialogController({
    windowRef: {
      confirm(message) {
        assert.match(message, /Delete deck/);
        return true;
      }
    }
  });

  const confirmed = await controller.confirm({
    title: "Delete Deck",
    message: "Delete deck 'Ops'?"
  });

  assert.equal(confirmed, true);
});
