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
    focusCalls: 0,
    selectCalls: 0,
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

function createFallbackDialog() {
  const listeners = new Map();
  return {
    open: false,
    classList: {
      added: [],
      removed: [],
      add(value) {
        this.added.push(value);
      },
      remove(value) {
        this.removed.push(value);
      }
    },
    addEventListener(type, handler) {
      listeners.set(String(type), handler);
    },
    emit(type, event = {}) {
      listeners.get(String(type))?.(event);
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

test("action dialog controller supports prompt fallback, null fallback, and confirm fallback false", async () => {
  const promptController = createActionDialogController({
    windowRef: {
      prompt(message, defaultValue) {
        assert.match(message, /Layout Name/);
        assert.equal(defaultValue, "Ops");
        return "Notebook";
      }
    }
  });
  const nullController = createActionDialogController({
    windowRef: {}
  });

  assert.equal(
    await promptController.requestText({ title: "Layout Name", defaultValue: "Ops" }),
    "Notebook"
  );
  assert.equal(await nullController.requestText({ title: "Layout Name" }), null);
  assert.equal(await nullController.confirm({ title: "Delete" }), false);
});

test("action dialog controller resolves prior requests deterministically and handles cancel, close, and enter-key submit", async () => {
  const dialogEl = createFallbackDialog();
  const titleEl = createElement();
  const messageEl = createElement();
  const inputWrapEl = createElement();
  const inputLabelEl = createElement();
  const inputEl = createElement();
  const confirmBtn = createElement();
  const cancelBtn = createElement();
  const closeBtn = createElement();
  let focusTarget = "";
  inputEl.focus = () => {
    focusTarget = "input";
  };
  inputEl.select = () => {
    inputEl.selectCalls += 1;
  };
  confirmBtn.focus = () => {
    focusTarget = "confirm";
  };
  const controller = createActionDialogController({
    windowRef: {
      requestAnimationFrame: undefined
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

  const first = controller.requestText({ title: "First", defaultValue: "one" });
  const second = controller.confirm({ title: "Second" });
  assert.equal(await first, null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(dialogEl.open, true);
  assert.equal(focusTarget, "confirm");

  cancelBtn.emit("click");
  assert.equal(await second, false);
  assert.equal(dialogEl.open, false);
  assert.deepEqual(dialogEl.classList.added, ["open", "open"]);
  assert.deepEqual(dialogEl.classList.removed, ["open", "open"]);

  const textRequest = controller.requestText({ title: "Rename", defaultValue: "Draft" });
  inputEl.value = "Applied";
  inputEl.emit("keydown", {
    key: "Enter",
    shiftKey: false,
    preventDefault() {
      focusTarget = "prevented";
    }
  });
  assert.equal(await textRequest, "Applied");
  assert.equal(focusTarget, "prevented");

  closeBtn.emit("click");
  dialogEl.emit("cancel", {
    preventDefault() {}
  });
});
