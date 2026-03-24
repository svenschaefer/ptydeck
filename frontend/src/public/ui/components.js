import {
  formatCompletionSuggestionLine,
  normalizeCompletionCandidate,
  normalizeCompletionCandidates
} from "../command-completion.js";

export function createCommandSuggestionsController(options = {}) {
  const commandInput = options.commandInput || null;
  const uiState = options.uiState || null;
  const render = typeof options.render === "function" ? options.render : () => {};
  const onSelectionApplied = typeof options.onSelectionApplied === "function" ? options.onSelectionApplied : () => {};
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);

  let autocompleteState = null;
  let composerMeasureCanvas = null;

  function reset() {
    autocompleteState = null;
  }

  function set(replacePrefix, matches, index = 0) {
    const normalizedMatches = normalizeCompletionCandidates(matches, { replacePrefix });
    if (!Array.isArray(normalizedMatches) || normalizedMatches.length === 0) {
      autocompleteState = null;
      if (uiState) {
        uiState.commandSuggestions = "";
        uiState.commandSuggestionSelectedIndex = -1;
      }
      render();
      return;
    }
    const nextIndex = Math.min(Math.max(index, 0), normalizedMatches.length - 1);
    autocompleteState = {
      matches: normalizedMatches,
      index: nextIndex,
      replacePrefix
    };
    const lines = normalizedMatches.map((entry, entryIndex) =>
      formatCompletionSuggestionLine(entry, replacePrefix, entryIndex === nextIndex)
    );
    if (uiState) {
      uiState.commandSuggestions = lines.join("\n");
      uiState.commandSuggestionSelectedIndex = nextIndex;
    }
    render();
  }

  function clear() {
    autocompleteState = null;
    if (uiState) {
      uiState.commandSuggestions = "";
      uiState.commandSuggestionSelectedIndex = -1;
      uiState.commandInlineHint = "";
      uiState.commandInlineHintPrefixPx = 0;
    }
  }

  function measurePrefixWidthPx(text) {
    if (!commandInput || !windowRef || typeof windowRef.getComputedStyle !== "function") {
      return 0;
    }
    if (!composerMeasureCanvas && documentRef && typeof documentRef.createElement === "function") {
      composerMeasureCanvas = documentRef.createElement("canvas");
    }
    if (!composerMeasureCanvas) {
      return 0;
    }
    const context = composerMeasureCanvas.getContext("2d");
    if (!context) {
      return 0;
    }
    const styles = windowRef.getComputedStyle(commandInput);
    const fontStyle = styles.fontStyle || "normal";
    const fontWeight = styles.fontWeight || "400";
    const fontSize = styles.fontSize || "14px";
    const fontFamily = styles.fontFamily || "monospace";
    context.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    return Math.max(0, Math.round(context.measureText(String(text || "")).width));
  }

  function applySelection(index) {
    if (!autocompleteState || !Array.isArray(autocompleteState.matches) || autocompleteState.matches.length === 0) {
      return false;
    }
    const nextIndex = Math.min(Math.max(index, 0), autocompleteState.matches.length - 1);
    autocompleteState.index = nextIndex;
    const selected = normalizeCompletionCandidate(autocompleteState.matches[nextIndex], {
      replacePrefix: autocompleteState.replacePrefix
    });
    if (!selected) {
      return false;
    }
    if (commandInput) {
      commandInput.value = `${autocompleteState.replacePrefix}${selected.insertText}`;
    }
    const lines = autocompleteState.matches.map((entry, entryIndex) =>
      formatCompletionSuggestionLine(entry, autocompleteState.replacePrefix, entryIndex === nextIndex)
    );
    if (uiState) {
      uiState.commandSuggestions = lines.join("\n");
      uiState.commandSuggestionSelectedIndex = nextIndex;
    }
    render();
    onSelectionApplied();
    return true;
  }

  function move(delta) {
    if (!autocompleteState || !Array.isArray(autocompleteState.matches) || autocompleteState.matches.length === 0) {
      return false;
    }
    const length = autocompleteState.matches.length;
    const current = Number.isInteger(autocompleteState.index) ? autocompleteState.index : 0;
    const nextIndex = (current + delta + length) % length;
    return applySelection(nextIndex);
  }

  function accept() {
    if (!autocompleteState || !Array.isArray(autocompleteState.matches) || autocompleteState.matches.length === 0) {
      return false;
    }
    return applySelection(autocompleteState.index);
  }

  function getState() {
    return autocompleteState;
  }

  return {
    reset,
    set,
    clear,
    move,
    accept,
    applySelection,
    getState,
    measurePrefixWidthPx
  };
}
