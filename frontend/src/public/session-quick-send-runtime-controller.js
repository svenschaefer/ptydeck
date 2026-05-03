import {
  compareCustomCommandRecords,
  formatCustomCommandScopeLabel,
  isCustomCommandVisibleForSession,
  normalizeCustomCommandRecord,
  renderCustomCommandForSession
} from "./custom-command-model.js";
import {
  cloneQuickSendUsageEntries,
  normalizeQuickSendUsageEntry,
  pruneQuickSendUsageEntries
} from "./session-quick-send-usage.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function clearElementChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function formatUsageCount(count) {
  const normalizedCount = Number.isInteger(count) && count > 0 ? count : 0;
  return `${normalizedCount} send${normalizedCount === 1 ? "" : "s"}`;
}

function formatQuickSendScopeText(command, session, formatSessionToken, formatSessionDisplayName) {
  return formatCustomCommandScopeLabel(command, {
    getSessionById: (sessionId) => (session?.id === sessionId ? session : null),
    formatSessionToken,
    formatSessionDisplayName
  });
}

function buildQuickSendButtonLabel(command, duplicateNames) {
  const normalized = normalizeCustomCommandRecord(command);
  if (!normalized) {
    return "";
  }
  if (!duplicateNames.has(normalized.name)) {
    return `/${normalized.name}`;
  }
  if (normalized.scope === "global") {
    return `/${normalized.name} · global`;
  }
  if (normalized.scope === "session") {
    return `/${normalized.name} · session`;
  }
  return `/${normalized.name} · project`;
}

function buildQuickSendMetaText(session, topCommands, showClipboardAction, formatSessionToken, formatSessionDisplayName) {
  if (!session) {
    return "";
  }
  const parts = [`[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`];
  if (topCommands.length > 0) {
    parts.push(`${topCommands.length} favorite${topCommands.length === 1 ? "" : "s"}`);
  }
  if (showClipboardAction) {
    parts.push("clipboard");
  }
  return parts.join(" · ");
}

export const SESSION_QUICK_SEND_MAX_ENTRIES = 32;
export const SESSION_QUICK_SEND_TOP_LIMIT = 5;

export function createSessionQuickSendRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || windowRef?.document || globalThis.document || null;
  const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : SESSION_QUICK_SEND_MAX_ENTRIES;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const resolveDeckForSession = typeof options.resolveDeckForSession === "function" ? options.resolveDeckForSession : () => null;
  const canReadClipboardText = typeof options.canReadClipboardText === "function" ? options.canReadClipboardText : () => false;
  const readClipboardText = typeof options.readClipboardText === "function" ? options.readClipboardText : async () => "";
  const submitTerminalPaste =
    typeof options.submitTerminalPaste === "function"
      ? options.submitTerminalPaste
      : async () => ({ ok: false, status: "unavailable", feedback: "Clipboard send is unavailable." });
  const apiSendInput = typeof options.apiSendInput === "function" ? options.apiSendInput : async () => undefined;
  const sendInputWithConfiguredTerminator =
    typeof options.sendInputWithConfiguredTerminator === "function" ? options.sendInputWithConfiguredTerminator : async () => undefined;
  const normalizeCustomCommandPayloadForShell =
    typeof options.normalizeCustomCommandPayloadForShell === "function"
      ? options.normalizeCustomCommandPayloadForShell
      : (value) => String(value ?? "");
  const normalizeSendTerminatorMode = typeof options.normalizeSendTerminatorMode === "function" ? options.normalizeSendTerminatorMode : () => "auto";
  const getSessionSendTerminator = typeof options.getSessionSendTerminator === "function" ? options.getSessionSendTerminator : () => "auto";
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const recordCommandSubmission = typeof options.recordCommandSubmission === "function" ? options.recordCommandSubmission : () => null;
  const canWriteToSession = typeof options.canWriteToSession === "function" ? options.canWriteToSession : () => true;
  const isSessionActionBlocked = typeof options.isSessionActionBlocked === "function" ? options.isSessionActionBlocked : () => false;
  const getBlockedSessionActionMessage =
    typeof options.getBlockedSessionActionMessage === "function"
      ? options.getBlockedSessionActionMessage
      : () => "Quick send is unavailable for this session.";
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const getReadOnlyModeMessage =
    typeof options.getReadOnlyModeMessage === "function" ? options.getReadOnlyModeMessage : () => "Read-only spectator mode. Write actions are disabled.";
  const getSessionWriteBlockedMessage =
    typeof options.getSessionWriteBlockedMessage === "function"
      ? options.getSessionWriteBlockedMessage
      : () => "This client cannot send input to the selected session.";
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const clearError = typeof options.clearError === "function" ? options.clearError : () => {};
  const getErrorMessage =
    typeof options.getErrorMessage === "function"
      ? options.getErrorMessage
      : (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "session");

  function buildCustomCommandUsageApiOptions(command) {
    const normalizedCommand = normalizeCustomCommandRecord(command);
    if (!normalizedCommand?.lookupKey) {
      return undefined;
    }
    return {
      customCommandUsage: {
        lookupKey: normalizedCommand.lookupKey
      }
    };
  }

  function resolveBlockedMessage(session) {
    if (!session) {
      return "Quick send is unavailable for this session.";
    }
    if (isReadOnlyMode()) {
      return getReadOnlyModeMessage();
    }
    if (isSessionActionBlocked(session)) {
      return getBlockedSessionActionMessage([session], "Quick send");
    }
    if (!canWriteToSession(session)) {
      return getSessionWriteBlockedMessage(session);
    }
    return "";
  }

  function resolveCurrentSession(sessionOrId) {
    if (sessionOrId && typeof sessionOrId === "object" && !Array.isArray(sessionOrId)) {
      return getSessionById(sessionOrId.id) || sessionOrId;
    }
    return getSessionById(sessionOrId) || null;
  }

  function resolveSessionUsageEntries(session) {
    return cloneQuickSendUsageEntries(pruneQuickSendUsageEntries(session?.quickSendUsage, maxEntries));
  }

  function resolveVisibleCustomCommands(sessionId, commands = listCustomCommands()) {
    const normalizedSessionId = normalizeText(sessionId);
    return (Array.isArray(commands) ? commands : [])
      .map((entry) => normalizeCustomCommandRecord(entry))
      .filter((entry) => entry && isCustomCommandVisibleForSession(entry, normalizedSessionId));
  }

  function resolveCustomCommandByLookupKey(sessionId, lookupKey, commands = listCustomCommands()) {
    const normalizedLookupKey = normalizeText(lookupKey);
    if (!normalizedLookupKey) {
      return null;
    }
    return resolveVisibleCustomCommands(sessionId, commands).find((entry) => entry.lookupKey === normalizedLookupKey) || null;
  }

  function listTopCustomCommands(sessionId, commands = listCustomCommands(), options = {}) {
    const session = resolveCurrentSession(sessionId);
    if (!session?.id) {
      return [];
    }
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : SESSION_QUICK_SEND_TOP_LIMIT;
    const visibleCommands = resolveVisibleCustomCommands(session.id, commands);
    const visibleByLookupKey = new Map(visibleCommands.map((entry) => [entry.lookupKey, entry]));
    const ranked = [];
    for (const entry of resolveSessionUsageEntries(session)) {
      const normalizedEntry = normalizeQuickSendUsageEntry(entry);
      if (!normalizedEntry) {
        continue;
      }
      const command = visibleByLookupKey.get(normalizedEntry.lookupKey);
      if (!command) {
        continue;
      }
      ranked.push({
        command,
        count: normalizedEntry.count,
        lastUsedAt: normalizedEntry.lastUsedAt
      });
    }
    ranked.sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      if (left.lastUsedAt !== right.lastUsedAt) {
        return right.lastUsedAt - left.lastUsedAt;
      }
      return compareCustomCommandRecords(left.command, right.command);
    });
    return ranked.slice(0, limit).map((entry) => ({ ...entry, command: normalizeCustomCommandRecord(entry.command) }));
  }

  async function sendCustomCommand(sessionOrId, lookupKey) {
    const session = resolveCurrentSession(sessionOrId);
    if (!session) {
      const message = "Quick-send command target is unavailable.";
      setError(message);
      return { ok: false, status: "missing-session", feedback: message };
    }
    const blockedMessage = resolveBlockedMessage(session);
    if (blockedMessage) {
      setError(blockedMessage);
      return { ok: false, status: "blocked", feedback: blockedMessage };
    }
    const command = resolveCustomCommandByLookupKey(session.id, lookupKey);
    if (!command) {
      const message = `Quick-send command is no longer available for [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
      setError(message);
      requestRender();
      return { ok: false, status: "missing-command", feedback: message };
    }
    const deck = resolveDeckForSession(session);
    const rendered = renderCustomCommandForSession(command, session, deck, {});
    if (!rendered.ok) {
      const message = rendered.error || `Custom command /${command.name} is invalid.`;
      setError(message);
      return { ok: false, status: "invalid", feedback: message };
    }

    const submittedAt = nowMs();
    try {
      const payload = normalizeCustomCommandPayloadForShell(rendered.text);
      await sendInputWithConfiguredTerminator(apiSendInput, session.id, payload, getSessionSendTerminator(session.id), {
        normalizeMode: normalizeSendTerminatorMode,
        delayedSubmitMs,
        apiRequestOptions: buildCustomCommandUsageApiOptions(command)
      });
      recordCommandSubmission(session.id, {
        source: "custom-command",
        commandName: command.name,
        label: `/${command.name}`,
        text: payload,
        submittedAt
      });
      clearError();
      setCommandFeedback(`Executed /${command.name} on [${formatSessionToken(session.id)}].`);
      requestRender();
      return { ok: true, status: "sent", feedback: `Executed /${command.name} on [${formatSessionToken(session.id)}].` };
    } catch (error) {
      const message = getErrorMessage(error, "Failed to execute quick-send custom command.");
      setError(message);
      return { ok: false, status: "error", feedback: message };
    }
  }

  async function sendClipboard(sessionOrId) {
    const session = resolveCurrentSession(sessionOrId);
    if (!session) {
      const message = "Clipboard send target is unavailable.";
      setError(message);
      return { ok: false, status: "missing-session", feedback: message };
    }
    const blockedMessage = resolveBlockedMessage(session);
    if (blockedMessage) {
      setError(blockedMessage);
      return { ok: false, status: "blocked", feedback: blockedMessage };
    }
    if (!canReadClipboardText()) {
      const message = "Clipboard read is unavailable in this browser.";
      setError(message);
      return { ok: false, status: "clipboard-unavailable", feedback: message };
    }
    let text = "";
    try {
      text = await readClipboardText();
    } catch (error) {
      const message = getErrorMessage(error, "Failed to read the browser clipboard.");
      setError(message);
      return { ok: false, status: "clipboard-error", feedback: message };
    }
    if (!text) {
      clearError();
      setCommandFeedback("Clipboard is empty.");
      return { ok: false, status: "empty", feedback: "Clipboard is empty." };
    }
    const result = await submitTerminalPaste(session.id, text, {
      source: "paste",
      activateTargetBeforeSend: false
    });
    if (result?.ok === true) {
      clearError();
      setCommandFeedback(`Sent clipboard to [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`);
      return { ok: true, status: "sent", feedback: `Sent clipboard to [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.` };
    }
    return result || { ok: false, status: "error", feedback: "Failed to send clipboard to the session." };
  }

  function renderSessionQuickSend(entry, sessionOrId) {
    const panelEl = entry?.quickSendPanelEl;
    const titleEl = entry?.quickSendTitleEl || null;
    const targetEl = entry?.quickSendTargetEl || null;
    const actionsEl = entry?.quickSendActionsEl;
    if (!panelEl || !actionsEl || !documentRef || typeof documentRef.createElement !== "function") {
      return;
    }
    const session = resolveCurrentSession(sessionOrId);
    clearElementChildren(actionsEl);
    if (titleEl) {
      titleEl.textContent = "Send to Session";
    }
    if (targetEl) {
      targetEl.textContent = "";
    }
    if (!session) {
      panelEl.hidden = true;
      return;
    }
    const blockedMessage = resolveBlockedMessage(session);
    if (blockedMessage) {
      panelEl.hidden = true;
      return;
    }

    const topCommands = listTopCustomCommands(session.id);
    const showClipboardAction = canReadClipboardText();
    if (topCommands.length === 0 && !showClipboardAction) {
      panelEl.hidden = true;
      return;
    }

    const duplicateNames = new Set();
    const names = new Map();
    for (const rankedEntry of topCommands) {
      const name = normalizeText(rankedEntry?.command?.name).toLowerCase();
      if (!name) {
        continue;
      }
      names.set(name, (names.get(name) || 0) + 1);
    }
    for (const [name, count] of names.entries()) {
      if (count > 1) {
        duplicateNames.add(name);
      }
    }

    for (const favorite of topCommands) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "session-quick-send-chip session-quick-send-command";
      button.textContent = buildQuickSendButtonLabel(favorite.command, duplicateNames);
      button.title = `${button.textContent} · ${formatQuickSendScopeText(favorite.command, session, formatSessionToken, formatSessionDisplayName)} · ${formatUsageCount(favorite.count)}`;
      button.addEventListener?.("click", () => {
        Promise.resolve(sendCustomCommand(session.id, favorite.command.lookupKey)).catch(() => {});
      });
      actionsEl.appendChild?.(button);
    }

    if (showClipboardAction) {
      const clipboardButton = documentRef.createElement("button");
      clipboardButton.type = "button";
      clipboardButton.className = "session-quick-send-chip session-quick-send-clipboard";
      clipboardButton.textContent = "Clipboard";
      clipboardButton.title = "Read the browser clipboard and send it to this terminal.";
      clipboardButton.addEventListener?.("click", () => {
        Promise.resolve(sendClipboard(session.id)).catch(() => {});
      });
      actionsEl.appendChild?.(clipboardButton);
    }

    panelEl.hidden = actionsEl.childNodes?.length === 0 && actionsEl.children?.length === 0;
    if (!panelEl.hidden) {
      if (targetEl) {
        targetEl.textContent = buildQuickSendMetaText(
          session,
          topCommands,
          showClipboardAction,
          formatSessionToken,
          formatSessionDisplayName
        );
      }
      panelEl.setAttribute?.("aria-label", `Send quick actions to [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`);
    }
  }

  return {
    buildCustomCommandUsageApiOptions,
    listTopCustomCommands,
    sendCustomCommand,
    sendClipboard,
    renderSessionQuickSend,
    dispose() {}
  };
}
