import { createCommandComposerAutocompleteController } from "./command-composer-autocomplete-controller.js";
import { createCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { createComposerRepairPreviewState } from "./composer-repair-runtime.js";
import { interpretComposerInput as defaultInterpretComposerInput } from "./command-interpreter.js";

const DEFAULT_MODE = "shared-footer";
const ACTIVE_OVERLAY_MODE = "active-overlay";
const SHARED_FOOTER_MODE = "shared-footer";
const OVERLAY_POSITION_TOP = "top";
const OVERLAY_POSITION_BOTTOM = "bottom";
const OVERLAY_VISIBILITY_NORMAL = "normal";
const OVERLAY_VISIBILITY_MINIMIZED = "minimized";
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

function areStringArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function arePinnedDraftMapsEqual(left, right) {
  const normalizedLeft = clonePinnedDrafts(left);
  const normalizedRight = clonePinnedDrafts(right);
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();
  if (!areStringArraysEqual(leftKeys, rightKeys)) {
    return false;
  }
  for (const key of leftKeys) {
    if (normalizedLeft[key] !== normalizedRight[key]) {
      return false;
    }
  }
  return true;
}

function filterPinnedDraftsBySessionIds(pinnedDrafts, pinnedSessionIds) {
  const normalizedPinnedDrafts = clonePinnedDrafts(pinnedDrafts);
  const allowed = new Set(Array.isArray(pinnedSessionIds) ? pinnedSessionIds : []);
  const filtered = {};
  for (const [sessionId, draft] of Object.entries(normalizedPinnedDrafts)) {
    if (!allowed.has(sessionId)) {
      continue;
    }
    filtered[sessionId] = draft;
  }
  return filtered;
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

function ensureNodeChild(parent, child) {
  if (!parent) {
    return;
  }
  if (!child) {
    clearNodeChildren(parent);
    return;
  }
  if (parent.firstChild === child && parent.children?.length === 1) {
    return;
  }
  clearNodeChildren(parent);
  parent.appendChild?.(child);
}

function appendText(node, text) {
  if (!node) {
    return;
  }
  node.textContent = typeof text === "string" ? text : String(text || "");
}

function normalizeComposerDraftWhitespace(value) {
  const normalized = String(value ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n").map((line) => line.replace(/^[ \t\u00a0]+|[ \t\u00a0]+$/g, ""));
  return lines.join("\n").trim();
}

function createEmptyRepairPreviewState() {
  return {
    active: false,
    canApply: false,
    summary: "",
    detail: "",
    originalText: "",
    repairedText: "",
    diffText: ""
  };
}

function applyRepairPreviewState(target, nextState = {}) {
  target.active = nextState.active === true;
  target.canApply = nextState.canApply === true;
  target.summary = typeof nextState.summary === "string" ? nextState.summary : "";
  target.detail = typeof nextState.detail === "string" ? nextState.detail : "";
  target.originalText = typeof nextState.originalText === "string" ? nextState.originalText : "";
  target.repairedText = typeof nextState.repairedText === "string" ? nextState.repairedText : "";
  target.diffText = typeof nextState.diffText === "string" ? nextState.diffText : "";
}

function renderRepairPreview(refs, repairState) {
  refs?.repairEl && (refs.repairEl.hidden = repairState?.active !== true);
  appendText(refs?.repairSummaryEl, repairState?.summary);
  appendText(refs?.repairDetailEl, repairState?.detail);
  appendText(refs?.repairOriginalEl, repairState?.originalText);
  appendText(refs?.repairOutputEl, repairState?.repairedText);
  appendText(refs?.repairDiffEl, repairState?.diffText);
  if (refs?.repairOutputWrapEl) {
    refs.repairOutputWrapEl.hidden = !(repairState?.repairedText);
  }
  if (refs?.repairDiffWrapEl) {
    refs.repairDiffWrapEl.hidden = !(repairState?.diffText);
  }
  if (refs?.repairApplyBtn) {
    refs.repairApplyBtn.hidden = repairState?.canApply !== true;
    refs.repairApplyBtn.disabled = repairState?.canApply !== true;
  }
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
  const actionsEl = createOverlayNode(documentRef, "session-composer-overlay-actions");
  actionsEl.className = "session-composer-overlay-actions";
  const actionGroupEl = createOverlayNode(documentRef, "session-composer-overlay-action-group");
  actionGroupEl.className = "session-composer-overlay-action-group";
  const footerBtn = createOverlayNode(documentRef, "session-composer-overlay-switch-footer", "button");
  footerBtn.className = "session-composer-overlay-switch-footer";
  footerBtn.type = "button";
  footerBtn.textContent = "Footer";
  const positionBtn = createOverlayNode(documentRef, "session-composer-overlay-position", "button");
  positionBtn.className = "session-composer-overlay-position";
  positionBtn.type = "button";
  const visibilityBtn = createOverlayNode(documentRef, "session-composer-overlay-visibility", "button");
  visibilityBtn.className = "session-composer-overlay-visibility";
  visibilityBtn.type = "button";
  const unpinBtn = createOverlayNode(documentRef, "session-composer-overlay-unpin", "button");
  unpinBtn.className = "session-composer-overlay-unpin";
  unpinBtn.type = "button";
  unpinBtn.textContent = "Unpin Input";
  actionGroupEl.appendChild(footerBtn);
  actionGroupEl.appendChild(positionBtn);
  actionGroupEl.appendChild(visibilityBtn);
  actionGroupEl.appendChild(unpinBtn);
  actionsEl.appendChild(actionGroupEl);
  head.appendChild(actionsEl);

  const bodyEl = createOverlayNode(documentRef, "session-composer-overlay-body");
  bodyEl.className = "session-composer-overlay-body";
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
  const actionsColumn = createOverlayNode(documentRef, "command-actions-column");
  actionsColumn.className = "command-actions-column";
  const normalizeBtn = createOverlayNode(documentRef, "session-composer-overlay-normalize", "button");
  normalizeBtn.className = "session-composer-overlay-normalize";
  normalizeBtn.type = "button";
  normalizeBtn.textContent = "Normalize";
  const repairBtn = createOverlayNode(documentRef, "session-composer-overlay-repair", "button");
  repairBtn.className = "session-composer-overlay-repair";
  repairBtn.type = "button";
  repairBtn.textContent = "Repair";
  const sendBtn = createOverlayNode(documentRef, "session-composer-overlay-send", "button");
  sendBtn.className = "session-composer-overlay-send";
  sendBtn.type = "button";
  sendBtn.textContent = "Send";
  commandEntryRow.appendChild(commandInputWrap);
  actionsColumn.appendChild(sendBtn);
  actionsColumn.appendChild(normalizeBtn);
  actionsColumn.appendChild(repairBtn);
  commandEntryRow.appendChild(actionsColumn);
  commandInputColumn.appendChild(commandEntryRow);

  const repairEl = createOverlayNode(documentRef, "command-repair", "section");
  repairEl.className = "command-repair";
  repairEl.hidden = true;
  const repairSummaryEl = createOverlayNode(documentRef, "command-repair-summary", "p");
  repairSummaryEl.className = "command-repair-summary";
  const repairDetailEl = createOverlayNode(documentRef, "command-repair-detail", "p");
  repairDetailEl.className = "command-repair-detail";
  const repairColumnsEl = createOverlayNode(documentRef, "command-repair-columns");
  repairColumnsEl.className = "command-repair-columns";
  const repairOriginalWrapEl = createOverlayNode(documentRef, "command-repair-column", "section");
  repairOriginalWrapEl.className = "command-repair-column";
  const repairOriginalLabelEl = createOverlayNode(documentRef, "command-repair-label", "p");
  repairOriginalLabelEl.className = "command-repair-label";
  repairOriginalLabelEl.textContent = "Original";
  const repairOriginalEl = createOverlayNode(documentRef, "command-repair-preview", "pre");
  repairOriginalEl.className = "command-repair-preview";
  repairOriginalWrapEl.appendChild(repairOriginalLabelEl);
  repairOriginalWrapEl.appendChild(repairOriginalEl);
  const repairOutputWrapEl = createOverlayNode(documentRef, "command-repair-column", "section");
  repairOutputWrapEl.className = "command-repair-column";
  const repairOutputLabelEl = createOverlayNode(documentRef, "command-repair-label", "p");
  repairOutputLabelEl.className = "command-repair-label";
  repairOutputLabelEl.textContent = "Repaired";
  const repairOutputEl = createOverlayNode(documentRef, "command-repair-preview", "pre");
  repairOutputEl.className = "command-repair-preview";
  repairOutputWrapEl.appendChild(repairOutputLabelEl);
  repairOutputWrapEl.appendChild(repairOutputEl);
  repairColumnsEl.appendChild(repairOriginalWrapEl);
  repairColumnsEl.appendChild(repairOutputWrapEl);
  const repairDiffWrapEl = createOverlayNode(documentRef, "command-repair-diff-wrap", "section");
  repairDiffWrapEl.className = "command-repair-diff-wrap";
  const repairDiffLabelEl = createOverlayNode(documentRef, "command-repair-label", "p");
  repairDiffLabelEl.className = "command-repair-label";
  repairDiffLabelEl.textContent = "Diff";
  const repairDiffEl = createOverlayNode(documentRef, "command-repair-diff", "pre");
  repairDiffEl.className = "command-repair-diff";
  repairDiffWrapEl.appendChild(repairDiffLabelEl);
  repairDiffWrapEl.appendChild(repairDiffEl);
  const repairActionsEl = createOverlayNode(documentRef, "command-repair-actions");
  repairActionsEl.className = "command-repair-actions";
  const repairApplyBtn = createOverlayNode(documentRef, "session-composer-overlay-repair-apply", "button");
  repairApplyBtn.className = "session-composer-overlay-repair-apply";
  repairApplyBtn.type = "button";
  repairApplyBtn.textContent = "Apply Repair";
  const repairCancelBtn = createOverlayNode(documentRef, "session-composer-overlay-repair-cancel", "button");
  repairCancelBtn.className = "session-composer-overlay-repair-cancel";
  repairCancelBtn.type = "button";
  repairCancelBtn.textContent = "Cancel";
  repairActionsEl.appendChild(repairApplyBtn);
  repairActionsEl.appendChild(repairCancelBtn);
  repairEl.appendChild(repairSummaryEl);
  repairEl.appendChild(repairDetailEl);
  repairEl.appendChild(repairColumnsEl);
  repairEl.appendChild(repairDiffWrapEl);
  repairEl.appendChild(repairActionsEl);
  commandInputColumn.appendChild(repairEl);

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
  bodyEl.appendChild(commandRow);
  root.appendChild(bodyEl);

  return {
    root,
    bodyEl,
    textarea,
    inlineHintEl,
    previewEl,
    normalizeBtn,
    repairBtn,
    sendBtn,
    repairEl,
    repairSummaryEl,
    repairDetailEl,
    repairOriginalEl,
    repairOutputWrapEl,
    repairOutputEl,
    repairDiffWrapEl,
    repairDiffEl,
    repairApplyBtn,
    repairCancelBtn,
    guardEl,
    guardSummaryEl,
    guardReasonsEl,
    guardPreviewEl,
    guardSendOnceBtn,
    guardCancelBtn,
    suggestionsEl,
    footerBtn,
    positionBtn,
    visibilityBtn,
    unpinBtn
  };
}

function buildSharedOverlayShell(documentRef) {
  const shell = createOverlayNode(documentRef, "session-composer-overlay-shell session-composer-overlay-shell-shared", "section");
  shell.className = "session-composer-overlay-shell session-composer-overlay-shell-shared";
  const head = createOverlayNode(documentRef, "session-composer-overlay-head");
  head.className = "session-composer-overlay-head";
  const actionsEl = createOverlayNode(documentRef, "session-composer-overlay-actions");
  actionsEl.className = "session-composer-overlay-actions";
  const actionGroupEl = createOverlayNode(documentRef, "session-composer-overlay-action-group");
  actionGroupEl.className = "session-composer-overlay-action-group";
  const footerBtn = createOverlayNode(documentRef, "session-composer-overlay-switch-footer", "button");
  footerBtn.className = "session-composer-overlay-switch-footer";
  footerBtn.type = "button";
  footerBtn.textContent = "Footer";
  const positionBtn = createOverlayNode(documentRef, "session-composer-overlay-position", "button");
  positionBtn.className = "session-composer-overlay-position";
  positionBtn.type = "button";
  const visibilityBtn = createOverlayNode(documentRef, "session-composer-overlay-visibility", "button");
  visibilityBtn.className = "session-composer-overlay-visibility";
  visibilityBtn.type = "button";
  const pinBtn = createOverlayNode(documentRef, "session-composer-overlay-pin", "button");
  pinBtn.className = "session-composer-overlay-pin";
  pinBtn.type = "button";
  pinBtn.textContent = "Pin Input";
  actionGroupEl.appendChild(footerBtn);
  actionGroupEl.appendChild(positionBtn);
  actionGroupEl.appendChild(visibilityBtn);
  actionGroupEl.appendChild(pinBtn);
  actionsEl.appendChild(actionGroupEl);
  head.appendChild(actionsEl);
  const bodyEl = createOverlayNode(documentRef, "session-composer-overlay-body");
  bodyEl.className = "session-composer-overlay-body";
  const slotEl = createOverlayNode(documentRef, "session-composer-overlay-slot");
  slotEl.className = "session-composer-overlay-slot";
  bodyEl.appendChild(slotEl);
  shell.appendChild(head);
  shell.appendChild(bodyEl);
  return { shell, bodyEl, slotEl, footerBtn, positionBtn, visibilityBtn, pinBtn };
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
    isSessionStopped = () => false,
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
    requestRepairCandidate = null,
    getOverlayPosition = () => OVERLAY_POSITION_TOP,
    getOverlayVisibility = () => OVERLAY_VISIBILITY_NORMAL,
    onDraftChange = () => {},
    onSwitchToFooter = () => {},
    onToggleOverlayPosition = () => {},
    onToggleOverlayVisibility = () => {},
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
    commandGuardPreview: "",
    repairPreview: createEmptyRepairPreviewState()
  };
  let suppressDraftSync = false;
  let inputListener = null;
  let changeListener = null;
  let blurListener = null;
  let focusListener = null;
  let composerRuntimeController = null;
  let autocompleteController = null;
  let textareaFocused = false;
  let footerListener = null;
  let positionListener = null;
  let visibilityListener = null;
  let unpinListener = null;

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
    const minimized = getOverlayVisibility() === OVERLAY_VISIBILITY_MINIMIZED;
    refs.textarea.disabled = writeLocked;
    refs.sendBtn.disabled = writeLocked;
    refs.root.classList?.toggle?.("session-composer-overlay-shell-minimized", minimized);
    refs.positionBtn.textContent = getOverlayPosition() === OVERLAY_POSITION_TOP ? "Bottom" : "Top";
    refs.visibilityBtn.textContent = minimized ? "Expand" : "Minimize";
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
    renderRepairPreview(refs, uiState.repairPreview);
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

  function normalizeDraft() {
    if (refs.textarea.disabled) {
      return false;
    }
    const currentValue = String(refs.textarea.value || "");
    const nextValue = normalizeComposerDraftWhitespace(currentValue);
    if (currentValue === nextValue) {
      refs.textarea.focus?.();
      return false;
    }
    clearRepairPreview({ renderAfterClear: false });
    suppressDraftSync = true;
    refs.textarea.value = nextValue;
    suppressDraftSync = false;
    persistDraft();
    composerRuntimeController?.scheduleCommandPreview?.();
    autocompleteController?.scheduleSuggestions?.();
    render();
    refs.textarea.focus?.();
    refs.textarea.setSelectionRange?.(nextValue.length, nextValue.length);
    return true;
  }

  function clearRepairPreview({ renderAfterClear = true } = {}) {
    const hadPreview = uiState.repairPreview.active === true;
    applyRepairPreviewState(uiState.repairPreview, createEmptyRepairPreviewState());
    if (renderAfterClear && hadPreview) {
      render();
    }
  }

  function applyRepairPreview() {
    if (uiState.repairPreview.canApply !== true) {
      refs.textarea.focus?.();
      return false;
    }
    const nextValue = String(uiState.repairPreview.repairedText || "");
    suppressDraftSync = true;
    refs.textarea.value = nextValue;
    suppressDraftSync = false;
    persistDraft();
    clearRepairPreview({ renderAfterClear: false });
    composerRuntimeController?.scheduleCommandPreview?.();
    autocompleteController?.scheduleSuggestions?.();
    render();
    refs.textarea.focus?.();
    refs.textarea.setSelectionRange?.(nextValue.length, nextValue.length);
    return true;
  }

  async function openRepairPreview() {
    if (refs.textarea.disabled) {
      return false;
    }
    const originalDraft = String(refs.textarea.value || "");
    if (!normalizeText(originalDraft)) {
      clearRepairPreview({ renderAfterClear: true });
      setCommandFeedback("Repair needs some input first.");
      refs.textarea.focus?.();
      return false;
    }
    let candidate = null;
    try {
      candidate = await requestRepairCandidate?.({
        draft: originalDraft,
        session: getSession(),
        state: getPinnedState(),
        mode: "pinned-overlay"
      });
    } catch (error) {
      setError(getErrorMessage(error, "Failed to prepare repair preview."));
      return false;
    }
    clearError();
    applyRepairPreviewState(uiState.repairPreview, createComposerRepairPreviewState(originalDraft, candidate));
    render();
    return uiState.repairPreview.active === true;
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
      clearRepairPreview({ renderAfterClear: false });
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
      clearRepairPreview({ renderAfterClear: false });
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
    isSessionStopped,
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

  blurListener = () => {
    textareaFocused = false;
    persistDraft();
  };
  focusListener = () => {
    textareaFocused = true;
  };
  inputListener = () => {
    clearRepairPreview({ renderAfterClear: false });
    persistDraft();
  };
  changeListener = () => {
    clearRepairPreview({ renderAfterClear: false });
    persistDraft();
  };
  refs.textarea.addEventListener?.("input", inputListener);
  refs.textarea.addEventListener?.("change", changeListener);
  refs.textarea.addEventListener?.("blur", blurListener);
  refs.textarea.addEventListener?.("focus", focusListener);
  refs.sendBtn.addEventListener?.("click", () => {
    composerRuntimeController?.submitCommand?.().catch((error) => {
      setError(getErrorMessage(error, "Failed to send command."));
    });
  });
  refs.normalizeBtn.addEventListener?.("click", () => {
    normalizeDraft();
  });
  refs.repairBtn.addEventListener?.("click", () => {
    void openRepairPreview();
  });
  refs.repairApplyBtn.addEventListener?.("click", () => {
    applyRepairPreview();
  });
  refs.repairCancelBtn.addEventListener?.("click", () => {
    clearRepairPreview({ renderAfterClear: true });
    refs.textarea.focus?.();
  });
  refs.guardSendOnceBtn.addEventListener?.("click", () => {
    composerRuntimeController?.confirmPendingSend?.().catch((error) => {
      setError(getErrorMessage(error, "Failed to send guarded command."));
    });
  });
  refs.guardCancelBtn.addEventListener?.("click", () => {
    composerRuntimeController?.cancelPendingSend?.();
  });
  footerListener = () => {
    onSwitchToFooter();
  };
  positionListener = () => {
    onToggleOverlayPosition();
  };
  visibilityListener = () => {
    onToggleOverlayVisibility();
  };
  unpinListener = () => {
    onUnpin();
  };
  refs.footerBtn.addEventListener?.("click", footerListener);
  refs.positionBtn.addEventListener?.("click", positionListener);
  refs.visibilityBtn.addEventListener?.("click", visibilityListener);
  refs.unpinBtn.addEventListener?.("click", unpinListener);
  autocompleteController.bindUiEvents?.();
  render();

  return {
    root: refs.root,
    render,
    setDraft(value, { scheduleRefresh = true } = {}) {
      const nextValue = String(value || "");
      if (uiState.repairPreview.active === true && uiState.repairPreview.originalText !== nextValue) {
        clearRepairPreview({ renderAfterClear: false });
      }
      if (refs.textarea.value !== nextValue) {
        if (textareaFocused) {
          if (scheduleRefresh) {
            composerRuntimeController?.scheduleCommandPreview?.();
            autocompleteController?.scheduleSuggestions?.();
          }
          render();
          return;
        }
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
      refs.textarea.removeEventListener?.("focus", focusListener);
      refs.footerBtn.removeEventListener?.("click", footerListener);
      refs.positionBtn.removeEventListener?.("click", positionListener);
      refs.visibilityBtn.removeEventListener?.("click", visibilityListener);
      refs.unpinBtn.removeEventListener?.("click", unpinListener);
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
    normalizeBtn = null,
    repairBtn = null,
    repairEl = null,
    repairSummaryEl = null,
    repairDetailEl = null,
    repairOriginalEl = null,
    repairOutputWrapEl = null,
    repairOutputEl = null,
    repairDiffWrapEl = null,
    repairDiffEl = null,
    repairApplyBtn = null,
    repairCancelBtn = null,
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
    isSessionStopped = () => false,
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
    requestRepairCandidate = null,
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
  let sharedFocusListener = null;
  let modeChangeListener = null;
  let sharedRepairClickListener = null;
  let sharedRepairApplyListener = null;
  let sharedRepairCancelListener = null;
  let sharedFooterSwitchListener = null;
  let sharedPositionToggleListener = null;
  let sharedVisibilityToggleListener = null;
  let sharedPinListener = null;
  let persistTimer = null;
  let pendingPersistPatch = {};
  let initializePromise = null;
  const pinnedSurfaces = new Map();
  let sharedInputFocused = false;
  let overlayPosition = OVERLAY_POSITION_TOP;
  let overlayVisibility = OVERLAY_VISIBILITY_NORMAL;
  const sharedRepairPreview = createEmptyRepairPreviewState();
  const pendingPlacementState = {
    mode: null,
    pinnedSessionIds: null,
    sharedDraft: null,
    pinnedDrafts: null
  };

  function getPlacementState() {
    return clonePlacementState(placementState);
  }

  function isPinnedSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    return normalizedSessionId ? placementState.pinnedSessionIds.includes(normalizedSessionId) : false;
  }

  function isOverlayBottomDocked() {
    return overlayPosition === OVERLAY_POSITION_BOTTOM;
  }

  function isOverlayMinimized() {
    return overlayVisibility === OVERLAY_VISIBILITY_MINIMIZED;
  }

  function getOverlayPositionToggleLabel() {
    return isOverlayBottomDocked() ? "Top" : "Bottom";
  }

  function getOverlayVisibilityToggleLabel() {
    return isOverlayMinimized() ? "Expand" : "Minimize";
  }

  function setPendingMode(value) {
    pendingPlacementState.mode = normalizeText(value) === ACTIVE_OVERLAY_MODE ? ACTIVE_OVERLAY_MODE : SHARED_FOOTER_MODE;
  }

  function setPendingPinnedSessionIds(value) {
    pendingPlacementState.pinnedSessionIds = Array.isArray(value) ? [...value] : [];
  }

  function setPendingSharedDraft(value) {
    pendingPlacementState.sharedDraft = typeof value === "string" ? value : "";
  }

  function setPendingPinnedDrafts(value) {
    pendingPlacementState.pinnedDrafts = clonePinnedDrafts(value);
  }

  function isOperatorClientBootstrapRace(error) {
    const status = Number.isFinite(error?.status) ? error.status : 0;
    const code = normalizeText(error?.error);
    const message = normalizeText(error?.message);
    return (
      ((status === 409 && (code === "OperatorClientRequired" || /active operator client id/iu.test(message))) ||
        (status === 401 && /missing bearer token/iu.test(message)))
    );
  }

  function setSharedComposerDraftLocally(value, { scheduleRefresh = false } = {}) {
    const nextValue = typeof value === "string" ? value : "";
    if (sharedRepairPreview.active === true && sharedRepairPreview.originalText !== nextValue) {
      applyRepairPreviewState(sharedRepairPreview, createEmptyRepairPreviewState());
    }
    placementState.sharedDraft = nextValue;
    if (commandInput && commandInput.value !== nextValue) {
      if (sharedInputFocused) {
        return;
      }
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

  function renderSharedOverlayChrome(activeSession) {
    if (!sharedOverlay?.shell) {
      return;
    }
    const activeSessionId = normalizeText(activeSession?.id);
    sharedOverlay.shell.classList?.toggle?.("session-composer-overlay-shell-minimized", isOverlayMinimized());
    sharedOverlay.positionBtn.textContent = getOverlayPositionToggleLabel();
    sharedOverlay.visibilityBtn.textContent = getOverlayVisibilityToggleLabel();
    sharedOverlay.pinBtn.dataset.sessionId = activeSessionId;
    sharedOverlay.pinBtn.hidden = !activeSessionId || isPinnedSession(activeSessionId);
  }

  function setOverlayPosition(nextPosition, { feedback = true } = {}) {
    const normalizedNextPosition = normalizeText(nextPosition) === OVERLAY_POSITION_BOTTOM ? OVERLAY_POSITION_BOTTOM : OVERLAY_POSITION_TOP;
    if (overlayPosition === normalizedNextPosition) {
      render();
      return overlayPosition;
    }
    overlayPosition = normalizedNextPosition;
    render();
    if (feedback) {
      setCommandFeedback(
        overlayPosition === OVERLAY_POSITION_BOTTOM
          ? "Overlay composer docked to the bottom of the terminal card."
          : "Overlay composer docked below the terminal header."
      );
    }
    return overlayPosition;
  }

  function toggleOverlayPosition() {
    return setOverlayPosition(isOverlayBottomDocked() ? OVERLAY_POSITION_TOP : OVERLAY_POSITION_BOTTOM);
  }

  function setOverlayVisibility(nextVisibility, { feedback = true } = {}) {
    const normalizedNextVisibility =
      normalizeText(nextVisibility) === OVERLAY_VISIBILITY_MINIMIZED ? OVERLAY_VISIBILITY_MINIMIZED : OVERLAY_VISIBILITY_NORMAL;
    if (overlayVisibility === normalizedNextVisibility) {
      render();
      return overlayVisibility;
    }
    overlayVisibility = normalizedNextVisibility;
    render();
    if (feedback) {
      setCommandFeedback(
        overlayVisibility === OVERLAY_VISIBILITY_MINIMIZED
          ? "Overlay composer minimized."
          : "Overlay composer restored."
      );
    }
    return overlayVisibility;
  }

  function toggleOverlayVisibility() {
    return setOverlayVisibility(isOverlayMinimized() ? OVERLAY_VISIBILITY_NORMAL : OVERLAY_VISIBILITY_MINIMIZED);
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
      isSessionStopped,
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
      requestRepairCandidate,
      getOverlayPosition: () => overlayPosition,
      getOverlayVisibility: () => overlayVisibility,
      onDraftChange: (draft) => {
        setPinnedDraftLocally(normalizedSessionId, draft);
        setPendingPinnedDrafts(placementState.pinnedDrafts);
        queuePersistPatch({ pinnedDrafts: placementState.pinnedDrafts });
      },
      onSwitchToFooter: () => {
        void setMode(SHARED_FOOTER_MODE);
      },
      onToggleOverlayPosition: () => {
        toggleOverlayPosition();
      },
      onToggleOverlayVisibility: () => {
        toggleOverlayVisibility();
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
    host.classList?.toggle?.("session-composer-overlay-host-top", !isOverlayBottomDocked());
    host.classList?.toggle?.("session-composer-overlay-host-bottom", isOverlayBottomDocked());
    const overlayMode = placementState.mode === ACTIVE_OVERLAY_MODE;
    if (!overlayMode) {
      clearNodeChildren(host);
      host.hidden = true;
      return;
    }
    if (isSessionStopped(session)) {
      clearNodeChildren(host);
      host.hidden = true;
      return;
    }

    const sessionId = normalizeText(session?.id);
    const pinned = isPinnedSession(sessionId);
    const active = normalizeText(activeSessionId) === sessionId;

    if (pinned) {
      const surface = createPinnedSurface(sessionId);
      if (surface) {
        ensureNodeChild(host, surface.root);
        surface.setDraft(placementState.pinnedDrafts[sessionId] || "", { scheduleRefresh: false });
        surface.render?.();
        host.hidden = false;
      } else {
        clearNodeChildren(host);
        host.hidden = true;
      }
      return;
    }

    disposePinnedSurface(sessionId);

    if (!active) {
      clearNodeChildren(host);
      host.hidden = true;
      return;
    }

    ensureNodeChild(host, sharedOverlay.shell);
    moveSharedComposerBody(sharedOverlay.slotEl);
    host.hidden = false;
  }

  function render() {
    const state = getState() || {};
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const activeSessionId = normalizeText(state.activeSessionId);
    const activeSession = sessions.find((session) => normalizeText(session?.id) === activeSessionId) || null;
    const overlayMode = placementState.mode === ACTIVE_OVERLAY_MODE;

    if (composerPlacementModeSelectEl) {
      composerPlacementModeSelectEl.value = placementState.mode;
    }
    workspaceShellEl?.classList?.toggle?.("composer-placement-active-overlay", overlayMode);
    controlPaneEl?.classList?.toggle?.("control-pane-overlay-mode", overlayMode);
    controlPaneResizeHandleEl?.classList?.toggle?.("control-pane-resize-handle-hidden", overlayMode);
    renderRepairPreview(
      {
        repairEl,
        repairSummaryEl,
        repairDetailEl,
        repairOriginalEl,
        repairOutputWrapEl,
        repairOutputEl,
        repairDiffWrapEl,
        repairDiffEl,
        repairApplyBtn
      },
      sharedRepairPreview
    );
    renderSharedOverlayChrome(activeSession);

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
        entry.composerOverlayHostEl.style.setProperty("--session-composer-overlay-top-px", `${toolbarHeight > 0 ? toolbarHeight : 52}px`);
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
    if (!activeEntry || !activeSession || isSessionStopped(activeSession) || isPinnedSession(activeSessionId)) {
      moveSharedComposerBody(hiddenParkingEl);
      sharedOverlay.shell.hidden = true;
      return;
    }
    sharedOverlay.shell.hidden = false;
  }

  function applyPlacementState(nextState, { scheduleSharedRefresh = true } = {}) {
    const currentLocalState = clonePlacementState(placementState);
    const mergedState = clonePlacementState(nextState);

    if (pendingPlacementState.mode !== null) {
      if (mergedState.mode === pendingPlacementState.mode) {
        pendingPlacementState.mode = null;
      } else {
        mergedState.mode = currentLocalState.mode;
      }
    }

    if (pendingPlacementState.pinnedSessionIds !== null) {
      if (areStringArraysEqual(mergedState.pinnedSessionIds, pendingPlacementState.pinnedSessionIds)) {
        pendingPlacementState.pinnedSessionIds = null;
      } else {
        mergedState.pinnedSessionIds = [...currentLocalState.pinnedSessionIds];
      }
    }

    if (pendingPlacementState.sharedDraft !== null) {
      if (mergedState.sharedDraft === pendingPlacementState.sharedDraft) {
        pendingPlacementState.sharedDraft = null;
      } else {
        mergedState.sharedDraft = currentLocalState.sharedDraft;
      }
    }

    if (pendingPlacementState.pinnedDrafts !== null) {
      const normalizedPendingPinnedDrafts = filterPinnedDraftsBySessionIds(
        pendingPlacementState.pinnedDrafts,
        mergedState.pinnedSessionIds
      );
      if (arePinnedDraftMapsEqual(mergedState.pinnedDrafts, normalizedPendingPinnedDrafts)) {
        pendingPlacementState.pinnedDrafts = null;
      } else {
        mergedState.pinnedDrafts = filterPinnedDraftsBySessionIds(currentLocalState.pinnedDrafts, mergedState.pinnedSessionIds);
      }
    }

    mergedState.pinnedDrafts = filterPinnedDraftsBySessionIds(mergedState.pinnedDrafts, mergedState.pinnedSessionIds);
    placementState = mergedState;
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
    setPendingMode(nextMode);
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
    setPendingPinnedSessionIds(placementState.pinnedSessionIds);
    setPendingPinnedDrafts(placementState.pinnedDrafts);
    setPendingSharedDraft(placementState.sharedDraft);
    const hadSharedFocus = sharedInputFocused;
    sharedInputFocused = false;
    setSharedComposerDraftLocally(nextSharedDraft, { scheduleRefresh: true });
    sharedInputFocused = hadSharedFocus;
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
    setPendingPinnedSessionIds(placementState.pinnedSessionIds);
    setPendingPinnedDrafts(placementState.pinnedDrafts);
    setPendingSharedDraft(placementState.sharedDraft);
    const hadSharedFocus = sharedInputFocused;
    sharedInputFocused = false;
    setSharedComposerDraftLocally(nextSharedDraft, { scheduleRefresh: true });
    sharedInputFocused = hadSharedFocus;
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
    setPendingSharedDraft(placementState.sharedDraft);
    queuePersistPatch({ sharedDraft: placementState.sharedDraft });
  }

  function clearSharedRepairPreview({ renderAfterClear = true } = {}) {
    const hadPreview = sharedRepairPreview.active === true;
    applyRepairPreviewState(sharedRepairPreview, createEmptyRepairPreviewState());
    if (renderAfterClear && hadPreview) {
      render();
    }
  }

  function normalizeSharedDraft() {
    if (!commandInput || commandInput.disabled) {
      return false;
    }
    const currentValue = String(commandInput.value || "");
    const nextValue = normalizeComposerDraftWhitespace(currentValue);
    if (currentValue === nextValue) {
      commandInput.focus?.();
      return false;
    }
    clearSharedRepairPreview({ renderAfterClear: false });
    placementState.sharedDraft = nextValue;
    setPendingSharedDraft(placementState.sharedDraft);
    commandInput.value = nextValue;
    scheduleSharedCommandRefresh();
    queuePersistPatch({ sharedDraft: placementState.sharedDraft });
    commandInput.focus?.();
    commandInput.setSelectionRange?.(nextValue.length, nextValue.length);
    render();
    return true;
  }

  function applySharedRepairPreview() {
    if (!commandInput || sharedRepairPreview.canApply !== true) {
      commandInput?.focus?.();
      return false;
    }
    const nextValue = String(sharedRepairPreview.repairedText || "");
    placementState.sharedDraft = nextValue;
    setPendingSharedDraft(placementState.sharedDraft);
    commandInput.value = nextValue;
    scheduleSharedCommandRefresh();
    queuePersistPatch({ sharedDraft: placementState.sharedDraft });
    clearSharedRepairPreview({ renderAfterClear: false });
    commandInput.focus?.();
    commandInput.setSelectionRange?.(nextValue.length, nextValue.length);
    render();
    return true;
  }

  async function openSharedRepairPreview() {
    if (!commandInput || commandInput.disabled) {
      return false;
    }
    const originalDraft = String(commandInput.value || "");
    if (!normalizeText(originalDraft)) {
      clearSharedRepairPreview({ renderAfterClear: true });
      setCommandFeedback("Repair needs some input first.");
      commandInput.focus?.();
      return false;
    }
    let candidate = null;
    try {
      candidate = await requestRepairCandidate?.({
        draft: originalDraft,
        session: getSessionById(normalizeText((getState() || {}).activeSessionId)),
        state: getState() || {},
        mode: placementState.mode === ACTIVE_OVERLAY_MODE ? "shared-overlay" : "shared-footer"
      });
    } catch (error) {
      setError(getErrorMessage(error, "Failed to prepare repair preview."));
      return false;
    }
    clearError();
    applyRepairPreviewState(sharedRepairPreview, createComposerRepairPreviewState(originalDraft, candidate));
    render();
    return sharedRepairPreview.active === true;
  }

  function bindUiEvents() {
    if (!sharedInputListener && commandInput) {
      sharedInputListener = () => {
        clearSharedRepairPreview({ renderAfterClear: false });
        setSharedDraftFromInput();
      };
      sharedChangeListener = () => {
        clearSharedRepairPreview({ renderAfterClear: false });
        setSharedDraftFromInput();
      };
      sharedBlurListener = () => {
        sharedInputFocused = false;
        setSharedDraftFromInput();
      };
      sharedFocusListener = () => {
        sharedInputFocused = true;
      };
      commandInput.addEventListener?.("input", sharedInputListener);
      commandInput.addEventListener?.("change", sharedChangeListener);
      commandInput.addEventListener?.("blur", sharedBlurListener);
      commandInput.addEventListener?.("focus", sharedFocusListener);
    }
    normalizeBtn?.addEventListener?.("click", normalizeSharedDraft);
    if (!sharedRepairClickListener && repairBtn) {
      sharedRepairClickListener = () => {
        void openSharedRepairPreview();
      };
      repairBtn.addEventListener?.("click", sharedRepairClickListener);
    }
    if (!sharedRepairApplyListener && repairApplyBtn) {
      sharedRepairApplyListener = () => {
        applySharedRepairPreview();
      };
      repairApplyBtn.addEventListener?.("click", sharedRepairApplyListener);
    }
    if (!sharedRepairCancelListener && repairCancelBtn) {
      sharedRepairCancelListener = () => {
        clearSharedRepairPreview({ renderAfterClear: true });
        commandInput?.focus?.();
      };
      repairCancelBtn.addEventListener?.("click", sharedRepairCancelListener);
    }
    if (!sharedFooterSwitchListener && sharedOverlay.footerBtn) {
      sharedFooterSwitchListener = () => {
        void setMode(SHARED_FOOTER_MODE);
      };
      sharedOverlay.footerBtn.addEventListener?.("click", sharedFooterSwitchListener);
    }
    if (!sharedPositionToggleListener && sharedOverlay.positionBtn) {
      sharedPositionToggleListener = () => {
        toggleOverlayPosition();
      };
      sharedOverlay.positionBtn.addEventListener?.("click", sharedPositionToggleListener);
    }
    if (!sharedVisibilityToggleListener && sharedOverlay.visibilityBtn) {
      sharedVisibilityToggleListener = () => {
        toggleOverlayVisibility();
      };
      sharedOverlay.visibilityBtn.addEventListener?.("click", sharedVisibilityToggleListener);
    }
    if (!sharedPinListener && sharedOverlay.pinBtn) {
      sharedPinListener = () => {
        const targetSessionId = normalizeText(sharedOverlay.pinBtn.dataset.sessionId);
        if (!targetSessionId) {
          return;
        }
        void pinSession(targetSessionId);
      };
      sharedOverlay.pinBtn.addEventListener?.("click", sharedPinListener);
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
        if (isOperatorClientBootstrapRace(error)) {
          return getPlacementState();
        }
        setError(getErrorMessage(error, "Failed to load composer placement."));
        return getPlacementState();
      })
      .finally(() => {
        initializePromise = null;
      });
    return initializePromise;
  }

  function dispose() {
    clearPersistTimer();
    commandInput?.removeEventListener?.("input", sharedInputListener);
    commandInput?.removeEventListener?.("change", sharedChangeListener);
    commandInput?.removeEventListener?.("blur", sharedBlurListener);
    commandInput?.removeEventListener?.("focus", sharedFocusListener);
    normalizeBtn?.removeEventListener?.("click", normalizeSharedDraft);
    repairBtn?.removeEventListener?.("click", sharedRepairClickListener);
    repairApplyBtn?.removeEventListener?.("click", sharedRepairApplyListener);
    repairCancelBtn?.removeEventListener?.("click", sharedRepairCancelListener);
    sharedOverlay.footerBtn?.removeEventListener?.("click", sharedFooterSwitchListener);
    sharedOverlay.positionBtn?.removeEventListener?.("click", sharedPositionToggleListener);
    sharedOverlay.visibilityBtn?.removeEventListener?.("click", sharedVisibilityToggleListener);
    sharedOverlay.pinBtn?.removeEventListener?.("click", sharedPinListener);
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
