import { createCommandComposerAutocompleteController } from "./command-composer-autocomplete-controller.js";
import { createCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { interpretComposerInput as defaultInterpretComposerInput } from "./command-interpreter.js";

const DEFAULT_MODE = "shared-footer";
const ACTIVE_OVERLAY_MODE = "active-overlay";
const SHARED_FOOTER_MODE = "shared-footer";
const DRAFT_PERSIST_DELAY_MS = 180;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clonePinnedDrafts(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const normalized = {};
  for (const [sessionId, draft] of Object.entries(value)) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId || typeof draft !== "string") {
      continue;
    }
    normalized[normalizedSessionId] = draft;
  }
  return normalized;
}

function clonePlacementState(value) {
  const pinnedSessionIds = Array.isArray(value?.pinnedSessionIds)
    ? Array.from(new Set(value.pinnedSessionIds.map((entry) => normalizeText(entry)).filter(Boolean)))
    : [];
  const pinnedDrafts = clonePinnedDrafts(value?.pinnedDrafts);
  for (const sessionId of Object.keys(pinnedDrafts)) {
    if (!pinnedSessionIds.includes(sessionId)) {
      delete pinnedDrafts[sessionId];
    }
  }
  return {
    clientId: normalizeText(value?.clientId),
    mode: normalizeText(value?.mode) === ACTIVE_OVERLAY_MODE ? ACTIVE_OVERLAY_MODE : SHARED_FOOTER_MODE,
    pinnedSessionIds,
    sharedDraft: typeof value?.sharedDraft === "string" ? value.sharedDraft : "",
    pinnedDrafts
  };
}

function clearNodeChildren(node) {
  if (!node) {
    return;
  }
  if (typeof node.replaceChildren === "function") {
    node.replaceChildren();
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function removeNode(node) {
  if (!node?.parentNode || typeof node.parentNode.removeChild !== "function") {
    return;
  }
  node.parentNode.removeChild(node);
}

function appendText(node, text) {
  if (!node) {
    return;
  }
  node.textContent = typeof text === "string" ? text : String(text || "");
}

function createOverlayNode(documentRef, className, tagName = "div") {
  return documentRef?.createElement?.(tagName) || {
    className,
    hidden: false,
    textContent: "",
    value: "",
    dataset: {},
    style: {
      setProperty() {},
      removeProperty() {}
    },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {}
  };
}

function buildPinnedOverlaySurface(documentRef) {
  const root = createOverlayNode(documentRef, "session-composer-overlay-shell session-composer-overlay-shell-pinned", "section");
  root.className = "session-composer-overlay-shell session-composer-overlay-shell-pinned";

  const head = createOverlayNode(documentRef, "session-composer-overlay-head");
  head.className = "session-composer-overlay-head";
  const titleEl = createOverlayNode(documentRef, "session-composer-overlay-title", "p");
  titleEl.className = "session-composer-overlay-title";
  titleEl.textContent = "Pinned Input";
  const actionsEl = createOverlayNode(documentRef, "session-composer-overlay-actions");
  actionsEl.className = "session-composer-overlay-actions";
  const unpinBtn = createOverlayNode(documentRef, "session-composer-overlay-unpin", "button");
  unpinBtn.className = "session-composer-overlay-unpin";
  unpinBtn.type = "button";
  unpinBtn.textContent = "Unpin";
  actionsEl.appendChild(unpinBtn);
  head.appendChild(titleEl);
  head.appendChild(actionsEl);

  const targetEl = createOverlayNode(documentRef, "session-composer-overlay-target", "p");
  targetEl.className = "session-composer-overlay-target";

  const commandRow = createOverlayNode(documentRef, "command-row session-composer-overlay-command-row", "section");
  commandRow.className = "command-row session-composer-overlay-command-row";
  const commandInputColumn = createOverlayNode(documentRef, "command-input-column");
  commandInputColumn.className = "command-input-column";
  const commandEntryRow = createOverlayNode(documentRef, "command-entry-row");
  commandEntryRow.className = "command-entry-row";
  const commandInputWrap = createOverlayNode(documentRef, "command-input-wrap");
  commandInputWrap.className = "command-input-wrap";
  const textarea = createOverlayNode(documentRef, "session-composer-overlay-input", "textarea");
  textarea.className = "session-composer-overlay-input";
  textarea.rows = 4;
  textarea.placeholder = "Run command(s) in this session (Ctrl/Cmd+Enter to send)";
  const inlineHintEl = createOverlayNode(documentRef, "command-inline-hint");
  inlineHintEl.className = "command-inline-hint";
  const previewEl = createOverlayNode(documentRef, "command-preview", "p");
  previewEl.className = "command-preview";
  commandInputWrap.appendChild(textarea);
  commandInputWrap.appendChild(inlineHintEl);
  commandInputWrap.appendChild(previewEl);
  const sendBtn = createOverlayNode(documentRef, "session-composer-overlay-send", "button");
  sendBtn.className = "session-composer-overlay-send";
  sendBtn.type = "button";
  sendBtn.textContent = "Send";
  commandEntryRow.appendChild(commandInputWrap);
  commandEntryRow.appendChild(sendBtn);
  commandInputColumn.appendChild(commandEntryRow);

  const guardEl = createOverlayNode(documentRef, "command-guard", "section");
  guardEl.className = "command-guard";
  guardEl.hidden = true;
  const guardSummaryEl = createOverlayNode(documentRef, "command-guard-summary", "p");
  guardSummaryEl.className = "command-guard-summary";
  const guardHintEl = createOverlayNode(documentRef, "command-guard-hint", "p");
  guardHintEl.className = "command-guard-hint";
  guardHintEl.innerHTML =
    "Input is waiting for confirmation. Nothing has been sent yet. Review the preview below, then click <strong>Send anyway</strong> to continue.";
  const guardReasonsEl = createOverlayNode(documentRef, "command-guard-reasons", "pre");
  guardReasonsEl.className = "command-guard-reasons";
  const guardPreviewEl = createOverlayNode(documentRef, "command-guard-preview", "pre");
  guardPreviewEl.className = "command-guard-preview";
  const guardActionsEl = createOverlayNode(documentRef, "command-guard-actions");
  guardActionsEl.className = "command-guard-actions";
  const guardSendOnceBtn = createOverlayNode(documentRef, "session-composer-overlay-guard-send", "button");
  guardSendOnceBtn.className = "session-composer-overlay-guard-send";
  guardSendOnceBtn.type = "button";
  guardSendOnceBtn.textContent = "Send anyway";
  const guardCancelBtn = createOverlayNode(documentRef, "session-composer-overlay-guard-cancel", "button");
  guardCancelBtn.className = "session-composer-overlay-guard-cancel";
  guardCancelBtn.type = "button";
  guardCancelBtn.textContent = "Cancel";
  guardActionsEl.appendChild(guardSendOnceBtn);
  guardActionsEl.appendChild(guardCancelBtn);
  guardEl.appendChild(guardSummaryEl);
  guardEl.appendChild(guardHintEl);
  guardEl.appendChild(guardReasonsEl);
  guardEl.appendChild(guardPreviewEl);
  guardEl.appendChild(guardActionsEl);
  commandInputColumn.appendChild(guardEl);

  const suggestionsEl = createOverlayNode(documentRef, "command-suggestions", "pre");
  suggestionsEl.className = "command-suggestions";
  suggestionsEl.hidden = true;
  commandInputColumn.appendChild(suggestionsEl);

  commandRow.appendChild(commandInputColumn);
  root.appendChild(head);
  root.appendChild(targetEl);
  root.appendChild(commandRow);

  return {
    root,
    titleEl,
    targetEl,
    textarea,
    inlineHintEl,
    previewEl,
    sendBtn,
    guardEl,
    guardSummaryEl,
    guardReasonsEl,
    guardPreviewEl,
    guardSendOnceBtn,
    guardCancelBtn,
    suggestionsEl,
    unpinBtn
  };
}

function buildSharedOverlayShell(documentRef) {
  const shell = createOverlayNode(documentRef, "session-composer-overlay-shell session-composer-overlay-shell-shared", "section");
  shell.className = "session-composer-overlay-shell session-composer-overlay-shell-shared";
  const head = createOverlayNode(documentRef, "session-composer-overlay-head");
  head.className = "session-composer-overlay-head";
  const titleEl = createOverlayNode(documentRef, "session-composer-overlay-title", "p");
  titleEl.className = "session-composer-overlay-title";
  titleEl.textContent = "Send to Active Session";
  head.appendChild(titleEl);
  const targetEl = createOverlayNode(documentRef, "session-composer-overlay-target", "p");
  targetEl.className = "session-composer-overlay-target";
  const slotEl = createOverlayNode(documentRef, "session-composer-overlay-slot");
  slotEl.className = "session-composer-overlay-slot";
  shell.appendChild(head);
  shell.appendChild(targetEl);
  shell.appendChild(slotEl);
  return { shell, titleEl, targetEl, slotEl };
}

function createPinnedSurfaceController(options = {}) {
  const {
    windowRef = globalThis,
    documentRef = globalThis.document,
    sessionId = "",
    getSession = () => null,
    getState = () => ({ sessions: [], decks: [], activeSessionId: "" }),
    getActiveDeck = () => null,
    parseAutocompleteContext = () => null,
    interpretComposerInput = defaultInterpretComposerInput,
    listCustomCommands = () => [],
    recordDiscoveryUsage = () => {},
    resolveQuickSwitchTarget = () => ({ error: "Unknown target." }),
    activateSessionTarget = () => ({ message: "" }),
    activateDeckTarget = () => ({ message: "" }),
    resolveTargetSelectors = () => ({ sessions: [], error: "" }),
    setActiveSession = () => {},
    executeControlCommand = () => Promise.resolve(""),
    executeControlCommandDetailed = async () => ({ ok: true, feedback: "" }),
    formatSessionToken = (value) => String(value || ""),
    formatSessionDisplayName = (session) => String(session?.name || session?.id || ""),
    getLastActiveSessionSwitchAt = () => 0,
    getBlockedSessionActionMessage = () => "",
    isSessionActionBlocked = () => false,
    canWriteToSession = () => true,
    getSessionWriteBlockedMessage = () => "This client cannot send input to the selected session.",
    showBlockedWriteReclaimUi = () => false,
    getSessionSendTerminator = () => "auto",
    apiSendInput = () => Promise.resolve(),
    sendInputWithConfiguredTerminator = () => Promise.resolve(),
    recordCommandSubmission = () => null,
    recordSendHistory = () => null,
    normalizeSendTerminatorMode = (value) => value,
    delayedSubmitMs = 0,
    setCommandFeedback = () => {},
    setError = () => {},
    clearError = () => {},
    getErrorMessage = (_error, fallback) => fallback,
    isReadOnlyMode = () => false,
    getReadOnlyModeMessage = () => "Read-only spectator mode. Write actions are disabled.",
    getCustomCommandState = () => null,
    formatQuickSwitchPreview = () => "",
    runWorkflowDetailed = null,
    onDraftChange = () => {},
    onUnpin = () => {},
    readClipboardText = async () => "",
    writeClipboardText = async () => false
  } = options;

  const refs = buildPinnedOverlaySurface(documentRef);
  const uiState = {
    commandInlineHint: "",
    commandInlineHintPrefixPx: 0,
    commandPreview: "",
    commandSuggestions: "",
    commandGuardActive: false,
    commandGuardSummary: "",
    commandGuardReasons: "",
    commandGuardPreview: ""
  };
  let suppressDraftSync = false;
  let inputListener = null;
  let changeListener = null;
  let blurListener = null;
  let composerRuntimeController = null;
  let autocompleteController = null;

  function getPinnedState() {
    const state = getState() || {};
    return {
      ...state,
      activeSessionId: sessionId
    };
  }

  function render() {
    const session = getSession();
    const writeLocked = isReadOnlyMode() || !canWriteToSession(session);
    const writeLockMessage = isReadOnlyMode()
      ? getReadOnlyModeMessage()
      : getSessionWriteBlockedMessage(session);
    refs.targetEl.textContent = session ? `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}` : "";
    refs.textarea.disabled = writeLocked;
    refs.sendBtn.disabled = writeLocked;
    if (writeLocked) {
      refs.textarea.setAttribute?.("title", writeLockMessage);
      refs.sendBtn.setAttribute?.("title", writeLockMessage);
    } else {
      refs.textarea.removeAttribute?.("title");
      refs.sendBtn.removeAttribute?.("title");
    }
    appendText(refs.inlineHintEl, uiState.commandInlineHint);
    refs.inlineHintEl.style?.setProperty?.("--hint-prefix-px", `${uiState.commandInlineHintPrefixPx || 0}px`);
    appendText(refs.previewEl, uiState.commandPreview);
    appendText(refs.suggestionsEl, uiState.commandSuggestions);
    refs.suggestionsEl.hidden = !uiState.commandSuggestions;
    refs.guardEl.hidden = uiState.commandGuardActive !== true;
    appendText(refs.guardSummaryEl, uiState.commandGuardSummary);
    appendText(refs.guardReasonsEl, uiState.commandGuardReasons);
    appendText(refs.guardPreviewEl, uiState.commandGuardPreview);
  }

  function persistDraft() {
    if (suppressDraftSync) {
      return;
    }
    onDraftChange(String(refs.textarea.value || ""));
  }

  autocompleteController = createCommandComposerAutocompleteController({
    windowRef,
    documentRef,
    commandInput: refs.textarea,
    uiState,
    readClipboardText,
    writeClipboardText,
    render,
    scheduleCommandPreview: () => composerRuntimeController?.scheduleCommandPreview?.(),
    parseAutocompleteContext,
    listCustomCommands,
    setCommandFeedback,
    submitCommand: () => composerRuntimeController?.submitCommand?.(),
    recordDiscoveryUsage,
    onInputChange: () => {
      composerRuntimeController?.clearPendingSend?.({ renderAfterClear: true });
      persistDraft();
    }
  });

  composerRuntimeController = createCommandComposerRuntimeController({
    windowRef,
    getCommandValue: () => String(refs.textarea.value || ""),
    setCommandValue: (value) => {
      const nextValue = String(value || "");
      if (refs.textarea.value === nextValue) {
        return;
      }
      suppressDraftSync = true;
      refs.textarea.value = nextValue;
      suppressDraftSync = false;
      persistDraft();
    },
    resetCommandAutocompleteState: () => autocompleteController?.resetAutocompleteState?.(),
    interpretComposerInput,
    getState: getPinnedState,
    getActiveDeck,
    resolveQuickSwitchTarget,
    activateSessionTarget,
    activateDeckTarget,
    resolveTargetSelectors,
    setActiveSession,
    executeControlCommand,
    executeControlCommandDetailed,
    runWorkflowDetailed,
    setCommandFeedback,
    setCommandPreview: (message) => {
      uiState.commandPreview = typeof message === "string" ? message : String(message || "");
      render();
    },
    setCommandGuardState: (nextState = {}) => {
      uiState.commandGuardActive = nextState.active === true;
      uiState.commandGuardSummary = typeof nextState.summary === "string" ? nextState.summary : "";
      uiState.commandGuardReasons = typeof nextState.reasons === "string" ? nextState.reasons : "";
      uiState.commandGuardPreview = typeof nextState.preview === "string" ? nextState.preview : "";
      render();
    },
    clearCommandGuardState: ({ render: renderAfterClear = true } = {}) => {
      const hadState =
        uiState.commandGuardActive === true ||
        Boolean(uiState.commandGuardSummary) ||
        Boolean(uiState.commandGuardReasons) ||
        Boolean(uiState.commandGuardPreview);
      uiState.commandGuardActive = false;
      uiState.commandGuardSummary = "";
      uiState.commandGuardReasons = "";
      uiState.commandGuardPreview = "";
      if (renderAfterClear && hadState) {
        render();
      }
    },
    showCommandGuardUi: () => {},
    focusCommandGuardPrimaryAction: () => refs.guardSendOnceBtn.focus?.(),
    clearCommandSuggestions: () => autocompleteController?.clearSuggestions?.(),
    render,
    recordSlashHistory: (rawCommand) => autocompleteController?.recordSlashHistory?.(rawCommand),
    resetSlashHistoryNavigationState: () => autocompleteController?.resetSlashHistoryNavigationState?.(),
    getErrorMessage,
    formatQuickSwitchPreview,
    formatSessionToken,
    formatSessionDisplayName,
    getLastActiveSessionSwitchAt,
    getBlockedSessionActionMessage,
    isSessionActionBlocked,
    canWriteToSession,
    getSessionWriteBlockedMessage,
    showBlockedWriteReclaimUi,
    getSessionSendTerminator,
    apiSendInput,
    sendInputWithConfiguredTerminator,
    recordCommandSubmission,
    recordSendHistory,
    normalizeSendTerminatorMode,
    delayedSubmitMs,
    setError,
    clearError,
    isReadOnlyMode,
    getReadOnlyModeMessage,
    getCustomCommandState,
    resolveBroadcastTargets: () => ({ active: false, sessions: [], error: "", routeFeedback: "" })
  });

  inputListener = () => persistDraft();
  changeListener = () => persistDraft();
  blurListener = () => persistDraft();
  refs.textarea.addEventListener?.("input", inputListener);
  refs.textarea.addEventListener?.("change", changeListener);
  refs.textarea.addEventListener?.("blur", blurListener);
  refs.sendBtn.addEventListener?.("click", () => {
    composerRuntimeController?.submitCommand?.().catch((error) => {
      setError(getErrorMessage(error, "Failed to send command."));
    });
  });
  refs.guardSendOnceBtn.addEventListener?.("click", () => {
    composerRuntimeController?.confirmPendingSend?.().catch((error) => {
      setError(getErrorMessage(error, "Failed to send guarded command."));
    });
  });
  refs.guardCancelBtn.addEventListener?.("click", () => {
    composerRuntimeController?.cancelPendingSend?.();
  });
  refs.unpinBtn.addEventListener?.("click", () => {
    onUnpin();
  });
  autocompleteController.bindUiEvents?.();
  render();

  return {
    root: refs.root,
    render,
    setDraft(value, { scheduleRefresh = true } = {}) {
      const nextValue = String(value || "");
      if (refs.textarea.value !== nextValue) {
        suppressDraftSync = true;
        refs.textarea.value = nextValue;
        suppressDraftSync = false;
      }
      if (scheduleRefresh) {
        composerRuntimeController?.scheduleCommandPreview?.();
        autocompleteController?.scheduleSuggestions?.();
      }
      render();
    },
    focus() {
      refs.textarea.focus?.();
    },
    dispose() {
      refs.textarea.removeEventListener?.("input", inputListener);
      refs.textarea.removeEventListener?.("change", changeListener);
      refs.textarea.removeEventListener?.("blur", blurListener);
      autocompleteController?.dispose?.();
      composerRuntimeController?.dispose?.();
      removeNode(refs.root);
    }
  };
}

export function createOperatorComposerPlacementRuntimeController(options = {}) {
  const {
    windowRef = globalThis,
    documentRef = globalThis.document,
    api = null,
    workspaceShellEl = null,
    controlPaneEl = null,
    controlPaneBodyEl = null,
    controlPaneResizeHandleEl = null,
    composerPlacementModeSelectEl = null,
    commandInput = null,
    terminals = new Map(),
    getState = () => ({ sessions: [], decks: [], activeSessionId: "" }),
    getSessionById = () => null,
    getActiveDeck = () => null,
    parseAutocompleteContext = () => null,
    interpretComposerInput = defaultInterpretComposerInput,
    listCustomCommands = () => [],
    recordDiscoveryUsage = () => {},
    resolveQuickSwitchTarget = () => ({ error: "Unknown target." }),
    activateSessionTarget = () => ({ message: "" }),
    activateDeckTarget = () => ({ message: "" }),
    resolveTargetSelectors = () => ({ sessions: [], error: "" }),
    setActiveSession = () => {},
    executeControlCommand = () => Promise.resolve(""),
    executeControlCommandDetailed = async () => ({ ok: true, feedback: "" }),
    formatSessionToken = (value) => String(value || ""),
    formatSessionDisplayName = (session) => String(session?.name || session?.id || ""),
    getLastActiveSessionSwitchAt = () => 0,
    getBlockedSessionActionMessage = () => "",
    isSessionActionBlocked = () => false,
    canWriteToSession = () => true,
    getSessionWriteBlockedMessage = () => "This client cannot send input to the selected session.",
    showBlockedWriteReclaimUi = () => false,
    getSessionSendTerminator = () => "auto",
    sendInputWithConfiguredTerminator = () => Promise.resolve(),
    normalizeSendTerminatorMode = (value) => value,
    delayedSubmitMs = 0,
    setCommandFeedback = () => {},
    setError = () => {},
    clearError = () => {},
    getErrorMessage = (_error, fallback) => fallback,
    isReadOnlyMode = () => false,
    getReadOnlyModeMessage = () => "Read-only spectator mode. Write actions are disabled.",
    getCustomCommandState = () => null,
    recordCommandSubmission = () => null,
    recordSendHistory = () => null,
    scheduleSharedCommandRefresh = () => {},
    formatQuickSwitchPreview = () => "",
    runWorkflowDetailed = null,
    readClipboardText = async () => "",
    writeClipboardText = async () => false
  } = options;

  const sharedOverlay = buildSharedOverlayShell(documentRef);
  const hiddenParkingEl = createOverlayNode(documentRef, "session-composer-overlay-parking");
  hiddenParkingEl.className = "session-composer-overlay-parking";
  hiddenParkingEl.hidden = true;
  workspaceShellEl?.appendChild?.(hiddenParkingEl);

  let placementState = clonePlacementState(null);
  let sharedInputListener = null;
  let sharedChangeListener = null;
  let sharedBlurListener = null;
  let modeChangeListener = null;
  let persistTimer = null;
  let pendingPersistPatch = {};
  let initializePromise = null;
  const pinnedSurfaces = new Map();

  function getPlacementState() {
    return clonePlacementState(placementState);
  }

  function isPinnedSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    return normalizedSessionId ? placementState.pinnedSessionIds.includes(normalizedSessionId) : false;
  }

  function setSharedComposerDraftLocally(value, { scheduleRefresh = false } = {}) {
    const nextValue = typeof value === "string" ? value : "";
    placementState.sharedDraft = nextValue;
    if (commandInput && commandInput.value !== nextValue) {
      commandInput.value = nextValue;
      if (scheduleRefresh) {
        scheduleSharedCommandRefresh();
      }
    }
  }

  function setPinnedDraftLocally(sessionId, value) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return;
    }
    const nextValue = typeof value === "string" ? value : "";
    placementState.pinnedDrafts = {
      ...placementState.pinnedDrafts,
      [normalizedSessionId]: nextValue
    };
    const surface = pinnedSurfaces.get(normalizedSessionId);
    surface?.setDraft?.(nextValue, { scheduleRefresh: false });
  }

  function clearPersistTimer() {
    if (persistTimer === null) {
      return;
    }
    windowRef.clearTimeout?.(persistTimer);
    persistTimer = null;
  }

  async function flushPersistPatch() {
    clearPersistTimer();
    const patch = pendingPersistPatch;
    pendingPersistPatch = {};
    if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
      return null;
    }
    const nextState = await api?.updateOperatorComposerPlacement?.(patch);
    if (nextState) {
      applyPlacementState(nextState, { scheduleSharedRefresh: false });
    }
    return nextState;
  }

  function queuePersistPatch(partial = {}, { immediate = false } = {}) {
    pendingPersistPatch = {
      ...pendingPersistPatch,
      ...partial
    };
    if (immediate) {
      return flushPersistPatch().catch((error) => {
        setError(getErrorMessage(error, "Failed to update composer placement."));
        render();
        return null;
      });
    }
    clearPersistTimer();
    persistTimer = windowRef.setTimeout?.(() => {
      flushPersistPatch().catch((error) => {
        setError(getErrorMessage(error, "Failed to update composer placement."));
        render();
      });
    }, DRAFT_PERSIST_DELAY_MS);
    return Promise.resolve(null);
  }

  function createPinnedSurface(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return null;
    }
    const existing = pinnedSurfaces.get(normalizedSessionId);
    if (existing) {
      return existing;
    }
    const surface = createPinnedSurfaceController({
      windowRef,
      documentRef,
      sessionId: normalizedSessionId,
      getSession: () => getSessionById(normalizedSessionId),
      getState,
      getActiveDeck,
      parseAutocompleteContext,
      interpretComposerInput,
      listCustomCommands,
      recordDiscoveryUsage,
      resolveQuickSwitchTarget,
      activateSessionTarget,
      activateDeckTarget,
      resolveTargetSelectors,
      setActiveSession,
      executeControlCommand,
      executeControlCommandDetailed,
      formatSessionToken,
      formatSessionDisplayName,
      getLastActiveSessionSwitchAt,
      getBlockedSessionActionMessage,
      isSessionActionBlocked,
      canWriteToSession,
      getSessionWriteBlockedMessage,
      showBlockedWriteReclaimUi,
      getSessionSendTerminator,
      apiSendInput: api?.sendInput?.bind(api),
      sendInputWithConfiguredTerminator,
      recordCommandSubmission,
      recordSendHistory,
      normalizeSendTerminatorMode,
      delayedSubmitMs,
      setCommandFeedback,
      setError,
      clearError,
      getErrorMessage,
      isReadOnlyMode,
      getReadOnlyModeMessage,
      getCustomCommandState,
      formatQuickSwitchPreview,
      runWorkflowDetailed,
      onDraftChange: (draft) => {
        setPinnedDraftLocally(normalizedSessionId, draft);
        queuePersistPatch({ pinnedDrafts: placementState.pinnedDrafts });
      },
      onUnpin: () => {
        void unpinSession(normalizedSessionId);
      },
      readClipboardText,
      writeClipboardText
    });
    pinnedSurfaces.set(normalizedSessionId, surface);
    surface.setDraft(placementState.pinnedDrafts[normalizedSessionId] || "", { scheduleRefresh: true });
    return surface;
  }

  function disposePinnedSurface(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    const surface = pinnedSurfaces.get(normalizedSessionId);
    if (!surface) {
      return;
    }
    surface.dispose?.();
    pinnedSurfaces.delete(normalizedSessionId);
  }

  function updatePinButton(entry, session) {
    const button = entry?.composerPinBtn;
    if (!button) {
      return;
    }
    const overlayMode = placementState.mode === ACTIVE_OVERLAY_MODE;
    button.hidden = overlayMode !== true;
    if (!overlayMode) {
      return;
    }
    const pinned = isPinnedSession(session?.id);
    const label = pinned ? "Unpin Input" : "Pin Input";
    button.textContent = label;
    button.setAttribute?.("aria-label", label);
    button.dataset.sessionId = String(session?.id || "");
    if (button.dataset.boundComposerPlacement !== "true") {
      button.dataset.boundComposerPlacement = "true";
      button.addEventListener?.("click", () => {
        const targetSessionId = normalizeText(button.dataset.sessionId);
        if (!targetSessionId) {
          return;
        }
        void togglePinnedSession(targetSessionId);
      });
    }
  }

  function moveSharedComposerBody(targetParent) {
    if (!controlPaneBodyEl || !targetParent || typeof targetParent.appendChild !== "function") {
      return;
    }
    if (controlPaneBodyEl.parentNode !== targetParent) {
      targetParent.appendChild(controlPaneBodyEl);
    }
  }

  function renderEntryOverlay(entry, session, activeSessionId) {
    const host = entry?.composerOverlayHostEl;
    if (!host) {
      return;
    }
    clearNodeChildren(host);
    const overlayMode = placementState.mode === ACTIVE_OVERLAY_MODE;
    if (!overlayMode) {
      host.hidden = true;
      return;
    }

    const sessionId = normalizeText(session?.id);
    const pinned = isPinnedSession(sessionId);
    const active = normalizeText(activeSessionId) === sessionId;

    if (pinned) {
      const surface = createPinnedSurface(sessionId);
      if (surface) {
        host.appendChild(surface.root);
        surface.setDraft(placementState.pinnedDrafts[sessionId] || "", { scheduleRefresh: false });
        surface.render?.();
        host.hidden = false;
      } else {
        host.hidden = true;
      }
      return;
    }

    disposePinnedSurface(sessionId);

    if (!active) {
      host.hidden = true;
      return;
    }

    sharedOverlay.targetEl.textContent = session ? `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}` : "";
    host.appendChild(sharedOverlay.shell);
    moveSharedComposerBody(sharedOverlay.slotEl);
    host.hidden = false;
  }

  function render() {
    const state = getState() || {};
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const activeSessionId = normalizeText(state.activeSessionId);
    const overlayMode = placementState.mode === ACTIVE_OVERLAY_MODE;

    if (composerPlacementModeSelectEl) {
      composerPlacementModeSelectEl.value = placementState.mode;
    }
    workspaceShellEl?.classList?.toggle?.("composer-placement-active-overlay", overlayMode);
    controlPaneEl?.classList?.toggle?.("control-pane-overlay-mode", overlayMode);
    controlPaneResizeHandleEl?.classList?.toggle?.("control-pane-resize-handle-hidden", overlayMode);

    if (!overlayMode) {
      moveSharedComposerBody(controlPaneEl);
      sharedOverlay.shell.hidden = true;
      for (const sessionId of Array.from(pinnedSurfaces.keys())) {
        disposePinnedSurface(sessionId);
      }
    }

    for (const session of sessions) {
      const entry = terminals.get(session.id);
      if (!entry) {
        continue;
      }
      updatePinButton(entry, session);
      renderEntryOverlay(entry, session, activeSessionId);
      const toolbarHeight = Number(entry.toolbarEl?.offsetHeight) || Number(entry.toolbarEl?.clientHeight) || 0;
      if (entry.composerOverlayHostEl?.style?.setProperty) {
        entry.composerOverlayHostEl.style.setProperty("--session-composer-overlay-top-px", `${Math.max(toolbarHeight + 8, 52)}px`);
      }
    }

    for (const sessionId of Array.from(pinnedSurfaces.keys())) {
      if (!sessions.some((session) => session.id === sessionId) || !overlayMode || !isPinnedSession(sessionId) || !terminals.has(sessionId)) {
        disposePinnedSurface(sessionId);
      }
    }

    if (!overlayMode) {
      sharedOverlay.shell.hidden = true;
      return;
    }

    const activeEntry = activeSessionId ? terminals.get(activeSessionId) : null;
    if (!activeEntry || isPinnedSession(activeSessionId)) {
      moveSharedComposerBody(hiddenParkingEl);
      sharedOverlay.shell.hidden = true;
      return;
    }
    sharedOverlay.shell.hidden = false;
  }

  function applyPlacementState(nextState, { scheduleSharedRefresh = true } = {}) {
    placementState = clonePlacementState(nextState);
    setSharedComposerDraftLocally(placementState.sharedDraft, { scheduleRefresh: scheduleSharedRefresh });
    render();
  }

  async function setMode(mode) {
    const nextMode = normalizeText(mode) === ACTIVE_OVERLAY_MODE ? ACTIVE_OVERLAY_MODE : SHARED_FOOTER_MODE;
    if (placementState.mode === nextMode) {
      render();
      return placementState.mode;
    }
    placementState = {
      ...placementState,
      mode: nextMode
    };
    render();
    clearError();
    setCommandFeedback(
      nextMode === ACTIVE_OVERLAY_MODE
        ? "Composer moved into the active terminal overlay."
        : "Composer moved back to the shared footer."
    );
    await queuePersistPatch({ mode: nextMode }, { immediate: true });
    return placementState.mode;
  }

  async function pinSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId || isPinnedSession(normalizedSessionId)) {
      return false;
    }
    const currentState = getState() || {};
    const nextPinnedSessionIds = placementState.pinnedSessionIds.concat(normalizedSessionId);
    const nextPinnedDrafts = { ...placementState.pinnedDrafts };
    let nextSharedDraft = placementState.sharedDraft;
    if (normalizeText(currentState.activeSessionId) === normalizedSessionId && nextSharedDraft && !nextPinnedDrafts[normalizedSessionId]) {
      nextPinnedDrafts[normalizedSessionId] = nextSharedDraft;
      nextSharedDraft = "";
    } else if (!nextPinnedDrafts[normalizedSessionId]) {
      nextPinnedDrafts[normalizedSessionId] = "";
    }
    placementState = {
      ...placementState,
      pinnedSessionIds: nextPinnedSessionIds,
      pinnedDrafts: nextPinnedDrafts,
      sharedDraft: nextSharedDraft
    };
    setSharedComposerDraftLocally(nextSharedDraft, { scheduleRefresh: true });
    render();
    setCommandFeedback(`Pinned overlay input for [${formatSessionToken(normalizedSessionId)}].`);
    await queuePersistPatch(
      {
        pinnedSessionIds: placementState.pinnedSessionIds,
        sharedDraft: placementState.sharedDraft,
        pinnedDrafts: placementState.pinnedDrafts
      },
      { immediate: true }
    );
    return true;
  }

  async function unpinSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId || !isPinnedSession(normalizedSessionId)) {
      return false;
    }
    const currentState = getState() || {};
    const nextPinnedSessionIds = placementState.pinnedSessionIds.filter((entry) => entry !== normalizedSessionId);
    const nextPinnedDrafts = { ...placementState.pinnedDrafts };
    const releasedDraft = nextPinnedDrafts[normalizedSessionId] || "";
    delete nextPinnedDrafts[normalizedSessionId];
    let nextSharedDraft = placementState.sharedDraft;
    if (!nextSharedDraft && normalizeText(currentState.activeSessionId) === normalizedSessionId && releasedDraft) {
      nextSharedDraft = releasedDraft;
    }
    placementState = {
      ...placementState,
      pinnedSessionIds: nextPinnedSessionIds,
      pinnedDrafts: nextPinnedDrafts,
      sharedDraft: nextSharedDraft
    };
    setSharedComposerDraftLocally(nextSharedDraft, { scheduleRefresh: true });
    disposePinnedSurface(normalizedSessionId);
    render();
    setCommandFeedback(`Unpinned overlay input for [${formatSessionToken(normalizedSessionId)}].`);
    await queuePersistPatch(
      {
        pinnedSessionIds: placementState.pinnedSessionIds,
        sharedDraft: placementState.sharedDraft,
        pinnedDrafts: placementState.pinnedDrafts
      },
      { immediate: true }
    );
    return true;
  }

  async function togglePinnedSession(sessionId) {
    if (isPinnedSession(sessionId)) {
      return unpinSession(sessionId);
    }
    return pinSession(sessionId);
  }

  function applyRuntimeEvent(event) {
    if (!event || typeof event !== "object") {
      return false;
    }
    if (event.type === "snapshot") {
      applyPlacementState(event.composerPlacement || null);
      return true;
    }
    if (event.type === "composer-placement.updated") {
      applyPlacementState(event.composerPlacement || null);
      return true;
    }
    return false;
  }

  function setSharedDraftFromInput() {
    const nextValue = String(commandInput?.value || "");
    if (placementState.sharedDraft === nextValue) {
      return;
    }
    placementState.sharedDraft = nextValue;
    queuePersistPatch({ sharedDraft: placementState.sharedDraft });
  }

  function bindUiEvents() {
    if (!sharedInputListener && commandInput) {
      sharedInputListener = () => setSharedDraftFromInput();
      sharedChangeListener = () => setSharedDraftFromInput();
      sharedBlurListener = () => setSharedDraftFromInput();
      commandInput.addEventListener?.("input", sharedInputListener);
      commandInput.addEventListener?.("change", sharedChangeListener);
      commandInput.addEventListener?.("blur", sharedBlurListener);
    }
    if (!modeChangeListener && composerPlacementModeSelectEl && typeof composerPlacementModeSelectEl.addEventListener === "function") {
      modeChangeListener = () => {
        void setMode(composerPlacementModeSelectEl.value || SHARED_FOOTER_MODE);
      };
      composerPlacementModeSelectEl.addEventListener("change", modeChangeListener);
    }
  }

  async function initialize() {
    if (typeof api?.getOperatorComposerPlacement !== "function") {
      return getPlacementState();
    }
    if (initializePromise) {
      return initializePromise;
    }
    initializePromise = api
      .getOperatorComposerPlacement()
      .then((nextState) => {
        applyPlacementState(nextState, { scheduleSharedRefresh: true });
        clearError();
        return getPlacementState();
      })
      .catch((error) => {
        setError(getErrorMessage(error, "Failed to load composer placement."));
        return getPlacementState();
      });
    return initializePromise;
  }

  function dispose() {
    clearPersistTimer();
    commandInput?.removeEventListener?.("input", sharedInputListener);
    commandInput?.removeEventListener?.("change", sharedChangeListener);
    commandInput?.removeEventListener?.("blur", sharedBlurListener);
    composerPlacementModeSelectEl?.removeEventListener?.("change", modeChangeListener);
    for (const sessionId of Array.from(pinnedSurfaces.keys())) {
      disposePinnedSurface(sessionId);
    }
    moveSharedComposerBody(controlPaneEl);
    removeNode(sharedOverlay.shell);
    removeNode(hiddenParkingEl);
  }

  bindUiEvents();
  setSharedComposerDraftLocally(placementState.sharedDraft, { scheduleRefresh: false });
  render();

  return {
    bindUiEvents,
    dispose,
    initialize,
    render,
    getState: getPlacementState,
    setMode,
    pinSession,
    unpinSession,
    togglePinnedSession,
    applyPlacementState,
    applyRuntimeEvent
  };
}
