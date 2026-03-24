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

  controller.set("/", ["help", "hello"], 0);
  assert.equal(uiState.commandSuggestionSelectedIndex, 0);
  assert.match(uiState.commandSuggestions, /> \/help/);

  assert.equal(controller.move(1), true);
  assert.equal(commandInput.value, "/hello");
  assert.equal(uiState.commandSuggestionSelectedIndex, 1);
  assert.equal(applied, 1);
  assert.ok(renderCount >= 2);
});
