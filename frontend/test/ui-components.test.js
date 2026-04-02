import test from "node:test";
import assert from "node:assert/strict";

import { createCommandSuggestionsController } from "../src/public/ui/components.js";

test("command suggestions controller updates UI state and applies selection", () => {
  const uiState = {
    commandSuggestions: "",
    commandSuggestionSelectedIndex: -1,
    commandInlineHint: "",
    commandInlineHintPrefixPx: 0
  };
  const commandInput = { value: "" };
  let renderCount = 0;
  let applied = 0;
  const controller = createCommandSuggestionsController({
    commandInput,
    uiState,
    render: () => {
      renderCount += 1;
    },
    onSelectionApplied: () => {
      applied += 1;
    }
  });

  controller.set(
    "/",
    [
      { insertText: "help", label: "/help", kind: "command", description: "show command help" },
      { insertText: "hello", label: "/hello", kind: "custom-command", description: "saved custom command" }
    ],
    0
  );
  assert.equal(uiState.commandSuggestionSelectedIndex, 0);
  assert.match(uiState.commandSuggestions, /> \/help/);
  assert.match(uiState.commandSuggestions, /\[command\]/);

  assert.equal(controller.move(1), true);
  assert.equal(commandInput.value, "/hello");
  assert.equal(uiState.commandSuggestionSelectedIndex, 1);
  assert.equal(applied, 1);
  assert.ok(renderCount >= 2);
});

test("command suggestions controller clears state for empty matches and ignores empty accept", () => {
  const uiState = {
    commandSuggestions: "stale",
    commandSuggestionSelectedIndex: 5,
    commandInlineHint: "hint",
    commandInlineHintPrefixPx: 99
  };
  let renderCount = 0;
  const controller = createCommandSuggestionsController({
    uiState,
    render: () => {
      renderCount += 1;
    }
  });

  controller.set("/", [], 0);
  assert.equal(uiState.commandSuggestions, "");
  assert.equal(uiState.commandSuggestionSelectedIndex, -1);
  assert.equal(controller.accept(), false);

  controller.clear();
  assert.equal(uiState.commandInlineHint, "");
  assert.equal(uiState.commandInlineHintPrefixPx, 0);
  assert.ok(renderCount >= 1);
});

test("command suggestions controller measures prefix width from the composer font", () => {
  const commandInput = {};
  const controller = createCommandSuggestionsController({
    commandInput,
    documentRef: {
      createElement(tagName) {
        assert.equal(tagName, "canvas");
        return {
          getContext() {
            return {
              font: "",
              measureText(text) {
                return { width: text.length * 9.2 };
              }
            };
          }
        };
      }
    },
    windowRef: {
      getComputedStyle() {
        return {
          fontStyle: "italic",
          fontWeight: "700",
          fontSize: "15px",
          fontFamily: "monospace"
        };
      }
    }
  });

  assert.equal(controller.measurePrefixWidthPx("/help"), 46);
});
