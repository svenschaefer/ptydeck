import test from "node:test";
import assert from "node:assert/strict";

import { createCommandComposerAutocompleteController } from "../src/public/command-composer-autocomplete-controller.js";
import { createCommandEngine, createCustomCommandRegistry } from "../src/public/command-engine.js";

class FakeInput {
  constructor() {
    this.value = "";
    this.listeners = new Map();
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focusCalls = 0;
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

  focus() {
    this.focusCalls += 1;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  setRangeText(text, start, end, selectionMode = "end") {
    const replacement = String(text ?? "");
    this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`;
    const nextCursor = start + replacement.length;
    if (selectionMode === "select") {
      this.selectionStart = start;
      this.selectionEnd = nextCursor;
      return;
    }
    this.selectionStart = nextCursor;
    this.selectionEnd = nextCursor;
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

function createMouseEvent(type, button) {
  return {
    type,
    button,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
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

test("command-composer autocomplete controller records accepted discovery usage", async () => {
  const commandInput = new FakeInput();
  const recordedKeys = [];
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    recordDiscoveryUsage: (key) => recordedKeys.push(key),
    parseAutocompleteContext: () => ({
      replacePrefix: "/",
      matches: [{ key: "command:close", insertText: "close", label: "close", kind: "command" }]
    })
  });

  commandInput.value = "/cl";
  await controller.refreshSuggestions();
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);

  assert.equal(enterEvent.defaultPrevented, false);

  controller.bindUiEvents();
  commandInput.dispatchEvent(enterEvent);
  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(recordedKeys, ["command:close"]);
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

test("command-composer autocomplete controller cancels stale refresh timers before tab cycling", async () => {
  const windowRef = createFakeWindow();
  const commandInput = new FakeInput();
  const uiState = {
    commandSuggestions: "",
    commandSuggestionSelectedIndex: -1,
    commandInlineHint: "",
    commandInlineHintPrefixPx: 0
  };
  const controller = createCommandComposerAutocompleteController({
    windowRef,
    documentRef: createFakeDocument(),
    commandInput,
    uiState,
    parseAutocompleteContext: () => ({
      replacePrefix: "/",
      matches: [
        { insertText: "close", label: "close", kind: "command" },
        { insertText: "connection", label: "connection", kind: "command" },
        { insertText: "custom", label: "custom", kind: "command" },
        { insertText: "closeit", label: "closeit", kind: "custom-command" }
      ]
    })
  });

  controller.bindUiEvents();
  commandInput.value = "/c";
  commandInput.dispatchEvent({ type: "input" });

  assert.equal(windowRef.timers.length, 1);

  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(windowRef.timers.length, 0);
  assert.equal(commandInput.value, "/close");

  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/connection");

  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/custom");

  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/closeit");

  assert.equal(await controller.autocompleteInput(true), true);
  assert.equal(commandInput.value, "/custom");
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

test("command-composer autocomplete controller copies the selected input text on plain Enter", async () => {
  const commandInput = new FakeInput();
  commandInput.value = "echo selected text";
  commandInput.setSelectionRange(5, 13);
  const clipboardWrites = [];
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    }
  });

  controller.bindUiEvents();
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["selected"]);
});

test("command-composer autocomplete controller pastes system clipboard text on middle click", async () => {
  const commandInput = new FakeInput();
  commandInput.value = "/help";
  commandInput.setSelectionRange(5, 5);
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    readClipboardText: async () => " --verbose"
  });

  controller.bindUiEvents();
  const middleDown = createMouseEvent("mousedown", 1);
  commandInput.dispatchEvent(middleDown);
  await Promise.resolve();

  assert.equal(middleDown.defaultPrevented, true);
  assert.equal(commandInput.value, "/help --verbose");
  assert.equal(commandInput.focusCalls, 1);
});

test("command-composer autocomplete controller completes help topics and subcommands progressively", async () => {
  const commandInput = new FakeInput();
  const registry = createCustomCommandRegistry();
  const engine = createCommandEngine({
    systemSlashCommands: ["deck", "help", "switch", "run"],
    listCustomCommands: () => registry.list(),
    getSessions: () => [],
    getDecks: () => [],
    getThemes: () => []
  });
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    parseAutocompleteContext: (rawInput) => engine.parseAutocompleteContext(rawInput)
  });

  commandInput.value = "/h";
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/help");

  commandInput.value = "/help d";
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/help deck");

  commandInput.value = "/help deck s";
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(commandInput.value, "/help deck switch");
});

test("command-composer autocomplete controller restores the slash-history draft when navigating back down", () => {
  const commandInput = new FakeInput();
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput
  });

  controller.bindUiEvents();
  controller.recordSlashHistory("/switch 1");
  controller.recordSlashHistory("/restart 2");

  commandInput.value = "/cus";
  commandInput.dispatchEvent(createKeyEvent("ArrowUp"));
  commandInput.dispatchEvent(createKeyEvent("ArrowUp"));
  assert.equal(commandInput.value, "/switch 1");

  commandInput.dispatchEvent(createKeyEvent("ArrowDown"));
  assert.equal(commandInput.value, "/restart 2");

  commandInput.dispatchEvent(createKeyEvent("ArrowDown"));
  assert.equal(commandInput.value, "/cus");
});

test("command-composer autocomplete controller tolerates clipboard-copy failures for plain Enter", async () => {
  const commandInput = new FakeInput();
  commandInput.value = "echo selected text";
  commandInput.setSelectionRange(5, 13);
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    writeClipboardText: async () => false
  });

  controller.bindUiEvents();
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(commandInput.value, "echo selected text");
});

test("command-composer autocomplete controller normalizes reversed selections before copying", async () => {
  const commandInput = new FakeInput();
  commandInput.value = "/help topic";
  commandInput.setSelectionRange(11, 6);
  const clipboardWrites = [];
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    }
  });

  controller.bindUiEvents();
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);
  await Promise.resolve();

  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["topic"]);
});

test("command-composer autocomplete controller pastes through the fallback insertion path when setRangeText is unavailable", async () => {
  const commandInput = new FakeInput();
  commandInput.value = "/help";
  commandInput.setSelectionRange(5, 5);
  commandInput.setRangeText = undefined;
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    readClipboardText: async () => " deck"
  });

  controller.bindUiEvents();
  const middleDown = createMouseEvent("mousedown", 1);
  commandInput.dispatchEvent(middleDown);
  await Promise.resolve();

  assert.equal(middleDown.defaultPrevented, true);
  assert.equal(commandInput.value, "/help deck");
  assert.equal(commandInput.selectionStart, 10);
  assert.equal(commandInput.selectionEnd, 10);
});

test("command-composer autocomplete controller fails closed for missing context and idempotent binding paths", async () => {
  const commandInput = new FakeInput();
  const uiState = {
    commandSuggestions: "",
    commandSuggestionSelectedIndex: -1,
    commandInlineHint: "stale",
    commandInlineHintPrefixPx: 42
  };
  let renderCount = 0;
  let parseContext = null;
  const suggestionState = {
    matches: [],
    index: 9,
    replacePrefix: "/"
  };
  const suggestionController = {
    resetCalls: 0,
    clearCalls: 0,
    setCalls: [],
    reset() {
      this.resetCalls += 1;
    },
    clear() {
      this.clearCalls += 1;
    },
    set(replacePrefix, matches, index) {
      this.setCalls.push([replacePrefix, matches.map((candidate) => candidate.insertText), index]);
      suggestionState.replacePrefix = replacePrefix;
      suggestionState.matches = matches;
      suggestionState.index = index;
    },
    getState() {
      return suggestionState;
    },
    measurePrefixWidthPx() {
      return 24;
    },
    applySelection() {
      return false;
    },
    move() {
      return false;
    },
    accept() {
      return false;
    }
  };
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    uiState,
    render: () => {
      renderCount += 1;
    },
    parseAutocompleteContext: () => parseContext,
    commandSuggestionsController: suggestionController
  });

  controller.bindUiEvents();
  controller.bindUiEvents();
  assert.equal(commandInput.listeners.get("input").length, 1);
  assert.equal(commandInput.listeners.get("keydown").length, 1);
  assert.equal(commandInput.listeners.get("mousedown").length, 1);
  assert.equal(commandInput.listeners.get("auxclick").length, 1);

  commandInput.value = "plain text";
  assert.equal(await controller.autocompleteInput(false), false);
  assert.equal(suggestionController.resetCalls, 1);

  commandInput.value = "/unknown";
  parseContext = null;
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(suggestionController.resetCalls, 2);

  parseContext = { replacePrefix: "/", matches: [] };
  assert.equal(await controller.autocompleteInput(false), true);
  assert.equal(suggestionController.resetCalls, 3);

  parseContext = {
    replacePrefix: "/",
    matches: [{ insertText: "close", label: "close", kind: "command" }]
  };
  assert.equal(await controller.autocompleteInput(false), false);
  assert.deepEqual(suggestionController.setCalls.at(-1), ["/", ["close"], 0]);

  commandInput.value = "plain text";
  await controller.refreshSuggestions();
  assert.ok(suggestionController.clearCalls >= 1);
  assert.ok(renderCount >= 1);

  commandInput.value = "/zz";
  await controller.refreshSuggestions();
  assert.equal(uiState.commandInlineHint, "");
  assert.equal(uiState.commandInlineHintPrefixPx, 0);

  commandInput.listeners.get("keydown")[0](null);
  commandInput.value = "plain text";
  const plainTabEvent = createKeyEvent("Tab");
  commandInput.dispatchEvent(plainTabEvent);
  assert.equal(plainTabEvent.defaultPrevented, false);

  controller.dispose();
  assert.equal(commandInput.listeners.get("input").length, 0);
  assert.equal(commandInput.listeners.get("keydown").length, 0);
  assert.equal(commandInput.listeners.get("mousedown").length, 0);
  assert.equal(commandInput.listeners.get("auxclick").length, 0);
});

test("command-composer autocomplete controller uses default clipboard fallbacks and property-based insertion", async () => {
  const commandInput = new FakeInput();
  const clipboardWrites = [];
  const windowRef = createFakeWindow();
  windowRef.navigator = {
    clipboard: {
      async writeText(text) {
        clipboardWrites.push(text);
      },
      async readText() {
        return 123;
      }
    }
  };
  const controller = createCommandComposerAutocompleteController({
    windowRef,
    documentRef: createFakeDocument(),
    commandInput
  });

  controller.bindUiEvents();

  commandInput.value = "echo selected text";
  commandInput.selectionStart = 5;
  commandInput.selectionEnd = 13;
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);
  await Promise.resolve();
  assert.equal(enterEvent.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["selected"]);

  commandInput.value = "/help ";
  commandInput.selectionStart = 6;
  commandInput.selectionEnd = 6;
  commandInput.setRangeText = undefined;
  commandInput.setSelectionRange = undefined;
  const middleDown = createMouseEvent("mousedown", 1);
  commandInput.dispatchEvent(middleDown);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(middleDown.defaultPrevented, true);
  assert.equal(commandInput.value, "/help 123");
  assert.equal(commandInput.selectionStart, 9);
  assert.equal(commandInput.selectionEnd, 9);

  windowRef.navigator.clipboard = null;
  commandInput.value = "echo selected text";
  commandInput.selectionStart = 5;
  commandInput.selectionEnd = 13;
  const enterWithoutClipboard = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterWithoutClipboard);
  await Promise.resolve();
  assert.equal(enterWithoutClipboard.defaultPrevented, true);
  assert.deepEqual(clipboardWrites, ["selected"]);

  commandInput.value = "/help";
  commandInput.selectionStart = 5;
  commandInput.selectionEnd = 5;
  const middleWithoutClipboard = createMouseEvent("mousedown", 1);
  commandInput.dispatchEvent(middleWithoutClipboard);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(middleWithoutClipboard.defaultPrevented, true);
  assert.equal(commandInput.value, "/help");
});

test("command-composer autocomplete controller covers parser, history, and no-op event branches directly", async () => {
  const commandInput = new FakeInput();
  const suggestionController = {
    moveCalls: [],
    acceptCalls: 0,
    move(delta) {
      this.moveCalls.push(delta);
      return true;
    },
    accept() {
      this.acceptCalls += 1;
      return false;
    },
    getState() {
      return null;
    }
  };
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandInput,
    readClipboardText: async () => {
      throw new Error("clipboard unavailable");
    },
    commandSuggestionsController: suggestionController
  });

  controller.bindUiEvents();
  assert.equal(controller.isSingleLineSlashModeInput("/help"), true);
  assert.equal(controller.isSingleLineSlashModeInput("/help\ndeck"), false);
  assert.equal(controller.parseSlashInputForAutocomplete("/help\ndeck"), null);
  assert.equal(controller.parseQuickSwitchInputForAutocomplete(">1\n2"), null);
  assert.deepEqual(controller.parseQuickSwitchInputForAutocomplete(">ops"), {
    value: ">ops",
    afterMarker: "ops"
  });

  controller.recordSlashHistory("plain text");
  controller.recordSlashHistory("/alpha");
  controller.recordSlashHistory("/alpha");
  controller.recordSlashHistory("/beta");
  assert.deepEqual(controller.getState().slashCommandHistory, ["/alpha", "/beta"]);

  commandInput.value = "plain text";
  assert.equal(controller.navigateSlashHistory("up"), false);
  commandInput.value = "/beta";
  controller.resetSlashHistoryNavigationState();
  assert.equal(controller.navigateSlashHistory("down"), false);
  assert.equal(controller.navigateSlashHistory("sideways"), false);

  const arrowUpEvent = createKeyEvent("ArrowUp");
  commandInput.dispatchEvent(arrowUpEvent);
  assert.equal(arrowUpEvent.defaultPrevented, true);
  const arrowDownEvent = createKeyEvent("ArrowDown");
  commandInput.dispatchEvent(arrowDownEvent);
  assert.equal(arrowDownEvent.defaultPrevented, true);
  assert.deepEqual(suggestionController.moveCalls, [-1, 1]);

  commandInput.value = "plain text";
  const enterEvent = createKeyEvent("Enter");
  commandInput.dispatchEvent(enterEvent);
  await Promise.resolve();
  assert.equal(enterEvent.defaultPrevented, false);
  assert.equal(suggestionController.acceptCalls, 1);

  const nonMiddleAuxClick = createMouseEvent("auxclick", 0);
  commandInput.dispatchEvent(nonMiddleAuxClick);
  assert.equal(nonMiddleAuxClick.defaultPrevented, false);

  commandInput.value = "/help";
  commandInput.selectionStart = 5;
  commandInput.selectionEnd = 5;
  const failingMiddleDown = createMouseEvent("mousedown", 1);
  commandInput.dispatchEvent(failingMiddleDown);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(failingMiddleDown.defaultPrevented, true);
  assert.equal(commandInput.value, "/help");
});

test("command-composer autocomplete controller truncates slash history and snapshots suggestion state", () => {
  const controller = createCommandComposerAutocompleteController({
    windowRef: createFakeWindow(),
    documentRef: createFakeDocument(),
    commandSuggestionsController: {
      getState() {
        return {
          replacePrefix: "/",
          matches: [{ insertText: "help", label: "help", kind: "command" }],
          index: 0
        };
      }
    }
  });

  controller.bindUiEvents();
  for (let index = 0; index < 205; index += 1) {
    controller.recordSlashHistory(`/cmd-${index}`);
  }

  const state = controller.getState();
  assert.equal(state.slashCommandHistory.length, 200);
  assert.equal(state.slashCommandHistory[0], "/cmd-5");
  assert.equal(state.slashCommandHistory.at(-1), "/cmd-204");
  assert.equal(state.slashHistoryCursor, -1);
  assert.equal(state.slashHistoryDraft, "");
  assert.equal(state.recalledSlashCommand, "");
  assert.deepEqual(state.suggestionState, {
    replacePrefix: "/",
    matches: [{ insertText: "help", label: "help", kind: "command" }],
    index: 0
  });
});
