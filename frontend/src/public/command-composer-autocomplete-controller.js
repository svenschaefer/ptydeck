import { areCompletionCandidateListsEqual, normalizeCompletionCandidate } from "./command-completion.js";
import { createCommandSuggestionsController } from "./ui/components.js";

export function createCommandComposerAutocompleteController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const navigatorRef = options.navigatorRef || windowRef.navigator || globalThis.navigator || null;
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const commandInput = options.commandInput || null;
  const uiState = options.uiState || null;
  const render = typeof options.render === "function" ? options.render : () => {};
  const scheduleCommandPreview =
    typeof options.scheduleCommandPreview === "function" ? options.scheduleCommandPreview : () => {};
  const parseAutocompleteContext =
    typeof options.parseAutocompleteContext === "function" ? options.parseAutocompleteContext : () => null;
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const submitCommand = typeof options.submitCommand === "function" ? options.submitCommand : () => Promise.resolve();
  const writeClipboardText =
    typeof options.writeClipboardText === "function"
      ? options.writeClipboardText
      : async (text) => {
          if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.writeText !== "function") {
            return false;
          }
          await navigatorRef.clipboard.writeText(String(text ?? ""));
          return true;
        };
  const readClipboardText =
    typeof options.readClipboardText === "function"
      ? options.readClipboardText
      : async () => {
          if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.readText !== "function") {
            return "";
          }
          const text = await navigatorRef.clipboard.readText();
          return typeof text === "string" ? text : String(text ?? "");
        };
  const commandSuggestionsController =
    options.commandSuggestionsController ||
    createCommandSuggestionsController({
      commandInput,
      uiState,
      render,
      onSelectionApplied: scheduleCommandPreview,
      documentRef,
      windowRef
    });

  let commandSuggestionsTimer = null;
  const slashCommandHistory = [];
  let slashHistoryCursor = -1;
  let slashHistoryDraft = "";
  let recalledSlashCommand = "";
  let inputListener = null;
  let keydownListener = null;
  let middleMouseDownListener = null;
  let middleAuxClickListener = null;

  function clearSuggestionsTimer() {
    if (commandSuggestionsTimer) {
      clearTimeoutFn(commandSuggestionsTimer);
      commandSuggestionsTimer = null;
    }
  }

  function resetAutocompleteState() {
    commandSuggestionsController?.reset?.();
  }

  function clearSuggestions() {
    commandSuggestionsController?.clear?.();
  }

  function measureComposerPrefixWidthPx(text) {
    return commandSuggestionsController?.measurePrefixWidthPx?.(text) || 0;
  }

  function applySuggestionSelection(index) {
    return commandSuggestionsController?.applySelection?.(index) === true;
  }

  function moveSuggestion(delta) {
    return commandSuggestionsController?.move?.(delta) === true;
  }

  function acceptSuggestion() {
    return commandSuggestionsController?.accept?.() === true;
  }

  function isSingleLineSlashModeInput(value) {
    return typeof value === "string" && value.startsWith("/") && !value.includes("\n");
  }

  function resetSlashHistoryNavigationState() {
    slashHistoryCursor = -1;
    slashHistoryDraft = "";
    recalledSlashCommand = "";
  }

  function recordSlashHistory(rawCommand) {
    const normalized = String(rawCommand || "").trim();
    if (!isSingleLineSlashModeInput(normalized)) {
      return;
    }
    if (slashCommandHistory[slashCommandHistory.length - 1] === normalized) {
      return;
    }
    slashCommandHistory.push(normalized);
    if (slashCommandHistory.length > 200) {
      slashCommandHistory.splice(0, slashCommandHistory.length - 200);
    }
  }

  function applySlashHistoryValue(value) {
    if (!commandInput) {
      return;
    }
    commandInput.value = value;
    recalledSlashCommand = value;
    resetAutocompleteState();
    scheduleCommandPreview();
  }

  function navigateSlashHistory(direction) {
    const current = commandInput?.value || "";
    if (!isSingleLineSlashModeInput(current)) {
      return false;
    }
    if (slashCommandHistory.length === 0) {
      return false;
    }

    if (direction === "up") {
      if (slashHistoryCursor < 0) {
        slashHistoryDraft = current;
        slashHistoryCursor = slashCommandHistory.length - 1;
      } else if (slashHistoryCursor > 0) {
        slashHistoryCursor -= 1;
      }
      applySlashHistoryValue(slashCommandHistory[slashHistoryCursor]);
      return true;
    }

    if (direction === "down") {
      if (slashHistoryCursor < 0) {
        return false;
      }
      if (slashHistoryCursor < slashCommandHistory.length - 1) {
        slashHistoryCursor += 1;
        applySlashHistoryValue(slashCommandHistory[slashHistoryCursor]);
        return true;
      }
      if (commandInput) {
        commandInput.value = slashHistoryDraft;
      }
      resetSlashHistoryNavigationState();
      resetAutocompleteState();
      scheduleCommandPreview();
      return true;
    }

    return false;
  }

  function parseSlashInputForAutocomplete(rawInput) {
    const value = typeof rawInput === "string" ? rawInput : "";
    if (!value.startsWith("/")) {
      return null;
    }
    if (value.includes("\n")) {
      return null;
    }
    return {
      value,
      afterSlash: value.slice(1)
    };
  }

  function parseQuickSwitchInputForAutocomplete(rawInput) {
    const value = typeof rawInput === "string" ? rawInput : "";
    if (!value.startsWith(">")) {
      return null;
    }
    if (value.includes("\n")) {
      return null;
    }
    return {
      value,
      afterMarker: value.slice(1)
    };
  }

  function getComposerSelectionRange() {
    if (!commandInput) {
      return null;
    }
    const currentValue = String(commandInput.value || "");
    const start = Number.isInteger(commandInput.selectionStart) ? commandInput.selectionStart : 0;
    const end = Number.isInteger(commandInput.selectionEnd) ? commandInput.selectionEnd : start;
    return {
      start,
      end,
      currentValue
    };
  }

  function getSelectedComposerText() {
    const range = getComposerSelectionRange();
    if (!range || range.start === range.end) {
      return "";
    }
    return range.currentValue.slice(range.start, range.end);
  }

  async function copySelectedComposerText() {
    const selectedText = getSelectedComposerText();
    if (!selectedText) {
      return false;
    }
    try {
      return (await writeClipboardText(selectedText)) === true;
    } catch {
      return false;
    }
  }

  function insertComposerText(text) {
    if (!commandInput) {
      return false;
    }
    const range = getComposerSelectionRange();
    if (!range) {
      return false;
    }
    const insertion = String(text ?? "");
    const nextCursor = range.start + insertion.length;
    if (typeof commandInput.setRangeText === "function") {
      commandInput.setRangeText(insertion, range.start, range.end, "end");
    } else {
      commandInput.value =
        `${range.currentValue.slice(0, range.start)}${insertion}${range.currentValue.slice(range.end)}`;
      if (typeof commandInput.setSelectionRange === "function") {
        commandInput.setSelectionRange(nextCursor, nextCursor);
      } else {
        commandInput.selectionStart = nextCursor;
        commandInput.selectionEnd = nextCursor;
      }
    }
    handleInput();
    commandInput.focus?.();
    return true;
  }

  async function pasteClipboardIntoComposer() {
    try {
      const text = await readClipboardText();
      if (!text) {
        return false;
      }
      return insertComposerText(text);
    } catch {
      return false;
    }
  }

  function isMiddleMouseEvent(event) {
    return Boolean(event && typeof event === "object" && event.button === 1);
  }

  async function autocompleteInput(reverse = false) {
    const rawInput = commandInput?.value || "";
    const parsedSlash = parseSlashInputForAutocomplete(rawInput);
    const parsedQuickSwitch = parseQuickSwitchInputForAutocomplete(rawInput);
    if (!parsedSlash && !parsedQuickSwitch) {
      resetAutocompleteState();
      return false;
    }

    const activeState = commandSuggestionsController?.getState?.() || null;
    const activeMatch =
      activeState &&
      Array.isArray(activeState.matches) &&
      Number.isInteger(activeState.index) &&
      activeState.index >= 0 &&
      activeState.index < activeState.matches.length
        ? normalizeCompletionCandidate(activeState.matches[activeState.index], {
            replacePrefix: activeState.replacePrefix
          })
        : null;
    const canCycleExisting =
      activeState &&
      Array.isArray(activeState.matches) &&
      activeState.matches.length > 0 &&
      Number.isInteger(activeState.index) &&
      activeState.index >= 0 &&
      activeState.index < activeState.matches.length &&
      typeof activeState.replacePrefix === "string" &&
      commandInput &&
      commandInput.value === `${activeState.replacePrefix}${activeMatch?.insertText || ""}`;

    let matches = [];
    let replacePrefix = "/";
    let nextIndex = reverse ? -1 : 0;

    if (canCycleExisting) {
      matches = activeState.matches;
      replacePrefix = activeState.replacePrefix;
      const delta = reverse ? -1 : 1;
      nextIndex = (activeState.index + delta + matches.length) % matches.length;
    } else {
      const context = parseAutocompleteContext(rawInput, listCustomCommands());
      if (!context) {
        resetAutocompleteState();
        return true;
      }
      replacePrefix = context.replacePrefix;
      matches = context.matches;
      if (matches.length === 0) {
        resetAutocompleteState();
        return true;
      }
      nextIndex = reverse ? matches.length - 1 : 0;
    }

    if (matches.length === 0) {
      clearSuggestions();
      render();
      return true;
    }

    commandSuggestionsController?.set?.(replacePrefix, matches, nextIndex);
    return applySuggestionSelection(nextIndex);
  }

  async function refreshSuggestions() {
    const rawInput = commandInput?.value || "";
    const parsedSlash = parseSlashInputForAutocomplete(rawInput);
    const parsedQuickSwitch = parseQuickSwitchInputForAutocomplete(rawInput);
    if (!parsedSlash && !parsedQuickSwitch) {
      clearSuggestions();
      render();
      return;
    }

    const context = parseAutocompleteContext(rawInput, listCustomCommands());
    if (!context || !Array.isArray(context.matches) || context.matches.length === 0) {
      clearSuggestions();
      render();
      return;
    }

    const currentState = commandSuggestionsController?.getState?.() || null;
    let index = 0;
    if (
      currentState &&
      currentState.replacePrefix === context.replacePrefix &&
      Array.isArray(currentState.matches) &&
      areCompletionCandidateListsEqual(currentState.matches, context.matches)
    ) {
      index = Math.min(Math.max(currentState.index, 0), context.matches.length - 1);
    }

    const selected = normalizeCompletionCandidate(context.matches[index], { replacePrefix: context.replacePrefix });
    const inputValue = commandInput?.value || "";
    const prefix = context.replacePrefix || "";
    const tokenPrefix = inputValue.startsWith(prefix) ? inputValue.slice(prefix.length) : "";
    if (selected && tokenPrefix.length <= selected.insertText.length && selected.insertText.startsWith(tokenPrefix)) {
      if (uiState) {
        uiState.commandInlineHint = selected.insertText.slice(tokenPrefix.length);
        uiState.commandInlineHintPrefixPx = measureComposerPrefixWidthPx(inputValue);
      }
    } else if (uiState) {
      uiState.commandInlineHint = "";
      uiState.commandInlineHintPrefixPx = 0;
    }

    commandSuggestionsController?.set?.(context.replacePrefix, context.matches, index);
  }

  function scheduleSuggestions() {
    clearSuggestionsTimer();
    commandSuggestionsTimer = setTimeoutFn(() => {
      commandSuggestionsTimer = null;
      refreshSuggestions();
    }, 120);
  }

  function handleInput() {
    clearSuggestions();
    scheduleCommandPreview();
    scheduleSuggestions();
  }

  function handleKeydown(event) {
    if (!event || typeof event !== "object") {
      return;
    }

    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (getSelectedComposerText()) {
        event.preventDefault?.();
        Promise.resolve(copySelectedComposerText()).catch(() => {});
        return;
      }
    }

    if (event.key === "ArrowUp") {
      if (moveSuggestion(-1)) {
        event.preventDefault?.();
        return;
      }
    }

    if (event.key === "ArrowDown") {
      if (moveSuggestion(1)) {
        event.preventDefault?.();
        return;
      }
    }

    if (event.key === "ArrowUp") {
      if (navigateSlashHistory("up")) {
        event.preventDefault?.();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (navigateSlashHistory("down")) {
        event.preventDefault?.();
      }
      return;
    }

    if (event.key === "Tab") {
      const rawValue = commandInput?.value || "";
      if (parseSlashInputForAutocomplete(rawValue) || parseQuickSwitchInputForAutocomplete(rawValue)) {
        event.preventDefault?.();
        Promise.resolve(autocompleteInput(event.shiftKey)).catch(() => {});
      }
      return;
    }

    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      if (acceptSuggestion()) {
        event.preventDefault?.();
        return;
      }
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault?.();
      const currentValue = commandInput?.value || "";
      if (slashHistoryCursor >= 0 && isSingleLineSlashModeInput(currentValue)) {
        if (currentValue === recalledSlashCommand) {
          Promise.resolve(submitCommand()).catch(() => {});
        } else {
          setCommandFeedback("Repeat blocked: recalled slash command was modified.");
        }
        return;
      }
      Promise.resolve(submitCommand()).catch(() => {});
    }
  }

  function handleMiddleMouseDown(event) {
    if (!isMiddleMouseEvent(event)) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    Promise.resolve(pasteClipboardIntoComposer()).catch(() => {});
  }

  function handleMiddleAuxClick(event) {
    if (!isMiddleMouseEvent(event)) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function bindUiEvents() {
    if (!commandInput || typeof commandInput.addEventListener !== "function") {
      return;
    }
    if (!inputListener) {
      inputListener = () => handleInput();
      commandInput.addEventListener("input", inputListener);
    }
    if (!keydownListener) {
      keydownListener = (event) => handleKeydown(event);
      commandInput.addEventListener("keydown", keydownListener);
    }
    if (!middleMouseDownListener) {
      middleMouseDownListener = (event) => handleMiddleMouseDown(event);
      commandInput.addEventListener("mousedown", middleMouseDownListener);
    }
    if (!middleAuxClickListener) {
      middleAuxClickListener = (event) => handleMiddleAuxClick(event);
      commandInput.addEventListener("auxclick", middleAuxClickListener);
    }
  }

  function dispose() {
    clearSuggestionsTimer();
    if (commandInput && typeof commandInput.removeEventListener === "function") {
      if (inputListener) {
        commandInput.removeEventListener("input", inputListener);
      }
      if (keydownListener) {
        commandInput.removeEventListener("keydown", keydownListener);
      }
      if (middleMouseDownListener) {
        commandInput.removeEventListener("mousedown", middleMouseDownListener);
      }
      if (middleAuxClickListener) {
        commandInput.removeEventListener("auxclick", middleAuxClickListener);
      }
    }
    inputListener = null;
    keydownListener = null;
    middleMouseDownListener = null;
    middleAuxClickListener = null;
  }

  function getState() {
    return {
      slashCommandHistory: [...slashCommandHistory],
      slashHistoryCursor,
      slashHistoryDraft,
      recalledSlashCommand,
      suggestionState: commandSuggestionsController?.getState?.() || null
    };
  }

  return {
    bindUiEvents,
    clearSuggestions,
    resetAutocompleteState,
    recordSlashHistory,
    resetSlashHistoryNavigationState,
    navigateSlashHistory,
    parseSlashInputForAutocomplete,
    parseQuickSwitchInputForAutocomplete,
    autocompleteInput,
    refreshSuggestions,
    scheduleSuggestions,
    isSingleLineSlashModeInput,
    dispose,
    getState
  };
}
