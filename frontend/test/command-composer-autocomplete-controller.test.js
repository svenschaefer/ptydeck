import test from "node:test";
import assert from "node:assert/strict";

import { createCommandComposerAutocompleteController } from "../src/public/command-composer-autocomplete-controller.js";

class FakeInput {
  constructor() {
    this.value = "";
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    const nextHandlers = handlers.filter((entry) => entry !== handler);
    this.listeners.set(type, nextHandlers);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }
}

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const timer = { fn, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
    getComputedStyle() {
      return {
        fontStyle: "normal",
        fontWeight: "400",
        fontSize: "14px",
        fontFamily: "monospace"
      };
    }
  };
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      if (tagName !== "canvas") {
        return {};
      }
      return {
        getContext() {
          return {
            measureText(text) {
              return {
                width: String(text || "").length * 8
              };
            }
          };
        }
      };
    }
  };
}

function createKeyEvent(key, options = {}) {
  return {
    type: "keydown",
    key,
    ctrlKey: options.ctrlKey === true,
    metaKey: options.metaKey === true,
    shiftKey: options.shiftKey === true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

test("command-composer autocomplete controller cycles autocomplete candidates", async () => {
  const commandInput = new FakeInput();
  const uiState = {
    commandSuggestions: "",
    commandSuggestionSelectedIndex: -1,
    commandInlineHint: "",
    commandInlineHintPrefixPx: 0
  };
  let previewSchedules = 0;
  let renderCount = 0;
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    uiState,
    render: () => {
      renderCount += 1;
    },
    scheduleCommandPreview: () => {
      previewSchedules += 1;
    },
    parseAutocompleteContext: () => ({
      replacePrefix: "/",
      matches: [
        { insertText: "close", label: "close", kind: "command" },
        { insertText: "custom", label: "custom", kind: "command" }
      ]
    })
  });

  commandInput.value = "/c";
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/close");
  assert.equal(uiState.commandSuggestionSelectedIndex, 0);

  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/custom");
  assert.equal(uiState.commandSuggestionSelectedIndex, 1);

  assert.equal(await controller.autocompleteInput(true), true);
  assert.equal(commandInput.value, "/close");
  assert.equal(uiState.commandSuggestionSelectedIndex, 0);
  assert.equal(previewSchedules, 3);
  assert.ok(renderCount >= 6);
});

test("command-composer autocomplete controller schedules inline hint refresh on input", async () => {
  const windowRef = createFakeWindow();
  const commandInput = new FakeInput();
  const uiState = {
    commandSuggestions: "",
    commandSuggestionSelectedIndex: -1,
    commandInlineHint: "",
    commandInlineHintPrefixPx: 0
  };
  let previewSchedules = 0;
  const controller = createCommandComposerAutocompleteController({
    windowRef,
    documentRef: createFakeDocument(),
    commandInput,
    uiState,
    scheduleCommandPreview: () => {
      previewSchedules += 1;
    },
    parseAutocompleteContext: (rawInput) =>
      rawInput === "/cl"
        ? {
            replacePrefix: "/",
            matches: [{ insertText: "close", label: "close", kind: "command" }]
          }
        : null
  });

  controller.bindUiEvents();
  commandInput.value = "/cl";
  commandInput.dispatchEvent({ type: "input" });

  assert.equal(previewSchedules, 1);
  assert.equal(windowRef.timers.length, 1);
  assert.equal(windowRef.timers[0].delay, 120);

  await windowRef.timers[0].fn();

  assert.equal(uiState.commandInlineHint, "ose");
  assert.equal(uiState.commandInlineHintPrefixPx, 24);
  assert.match(uiState.commandSuggestions, /^> \/close/m);
});

test("command-composer autocomplete controller replays slash history and guards modified repeats", async () => {
  const commandInput = new FakeInput();
  const feedback = [];
  let submitCalls = 0;
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    setCommandFeedback: (message) => feedback.push(message),
    submitCommand: async () => {
      submitCalls += 1;
    }
  });

  controller.bindUiEvents();
  controller.recordSlashHistory("/switch 1");
  controller.recordSlashHistory("/restart 2");

  commandInput.value = "/";
  const arrowUp = createKeyEvent("ArrowUp");
  commandInput.dispatchEvent(arrowUp);
  assert.equal(arrowUp.defaultPrevented, true);
  assert.equal(commandInput.value, "/restart 2");

  commandInput.value = "/restart 2 --modified";
  const blockedRepeat = createKeyEvent("Enter", { ctrlKey: true });
  commandInput.dispatchEvent(blockedRepeat);
  await Promise.resolve();
  assert.equal(blockedRepeat.defaultPrevented, true);
  assert.equal(submitCalls, 0);
  assert.deepEqual(feedback, ["Repeat blocked: recalled slash command was modified."]);

  commandInput.value = "/restart 2";
  const allowedRepeat = createKeyEvent("Enter", { ctrlKey: true });
  commandInput.dispatchEvent(allowedRepeat);
  await Promise.resolve();
  assert.equal(allowedRepeat.defaultPrevented, true);
  assert.equal(submitCalls, 1);
});
