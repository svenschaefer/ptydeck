function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSendHistoryText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

export const SEND_HISTORY_STORAGE_KEY = "ptydeck.send-history.v1";
export const SEND_HISTORY_MAX_ENTRIES_PER_SESSION = 80;
export const SEND_HISTORY_MAX_TOTAL_CHARS = 1_500_000;
const SEARCH_RENDER_DEBOUNCE_MS = 60;
const PERSIST_DEBOUNCE_MS = 40;
const PREVIEW_MAX_LENGTH = 180;

function summarizeSendHistoryText(text, maxLength = PREVIEW_MAX_LENGTH) {
  const normalized = normalizeSendHistoryText(text);
  const compact = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" \\n ");
  if (!compact) {
    return "(whitespace only input)";
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function countHistoryLines(text) {
  if (!text) {
    return 0;
  }
  return normalizeSendHistoryText(text).split("\n").length;
}

function formatHistoryTimestamp(timestamp) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function formatHistoryStats(entry) {
  const lineCount = Number.isInteger(entry?.lineCount) ? entry.lineCount : countHistoryLines(entry?.text || "");
  const textLength = Number.isInteger(entry?.textLength) ? entry.textLength : String(entry?.text || "").length;
  return `${lineCount} line${lineCount === 1 ? "" : "s"} · ${textLength.toLocaleString("en-US")} char${textLength === 1 ? "" : "s"}`;
}

function clearElementChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function openDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.showModal === "function") {
    if (!dialogEl.open) {
      dialogEl.showModal();
    }
    return;
  }
  dialogEl.open = true;
}

function closeDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.close === "function") {
    if (dialogEl.open) {
      dialogEl.close();
    }
    return;
  }
  dialogEl.open = false;
}

function cloneHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  return { ...entry };
}

function cloneHistoryState(historyBySession) {
  const next = {};
  for (const [sessionId, entries] of Object.entries(historyBySession || {})) {
    next[sessionId] = Array.isArray(entries) ? entries.map((entry) => cloneHistoryEntry(entry)) : [];
  }
  return next;
}

function normalizeHistoryEntry(entry, { fallbackSessionId = "", fallbackSubmittedAt = Date.now(), fallbackId = "" } = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const sessionId = normalizeText(entry.sessionId || fallbackSessionId);
  const text = normalizeSendHistoryText(entry.text);
  if (!sessionId || !text) {
    return null;
  }
  const submittedAt = Number.isFinite(entry.submittedAt) ? Number(entry.submittedAt) : fallbackSubmittedAt;
  const id = normalizeText(entry.id || fallbackId);
  const preview = normalizeText(entry.preview) || summarizeSendHistoryText(text);
  const textLength = Number.isInteger(entry.textLength) ? entry.textLength : text.length;
  const lineCount = Number.isInteger(entry.lineCount) ? entry.lineCount : countHistoryLines(text);
  return {
    id: id || `${sessionId}-${submittedAt}`,
    sessionId,
    submittedAt,
    text,
    preview,
    textLength,
    lineCount
  };
}

function pruneHistory(historyBySession, {
  maxEntriesPerSession = SEND_HISTORY_MAX_ENTRIES_PER_SESSION,
  maxTotalChars = SEND_HISTORY_MAX_TOTAL_CHARS
} = {}) {
  const next = cloneHistoryState(historyBySession);
  for (const sessionId of Object.keys(next)) {
    const entries = Array.isArray(next[sessionId]) ? next[sessionId] : [];
    next[sessionId] = entries.slice(-maxEntriesPerSession);
    if (next[sessionId].length === 0) {
      delete next[sessionId];
    }
  }

  let totalChars = Object.values(next).reduce(
    (sum, entries) => sum + entries.reduce((entrySum, entry) => entrySum + Number(entry?.textLength || 0), 0),
    0
  );
  if (totalChars <= maxTotalChars) {
    return next;
  }

  const oldestEntries = Object.entries(next)
    .flatMap(([sessionId, entries]) =>
      entries.map((entry, index) => ({ sessionId, index, submittedAt: Number(entry?.submittedAt) || 0, textLength: Number(entry?.textLength) || 0 }))
    )
    .sort((left, right) => left.submittedAt - right.submittedAt || left.index - right.index);

  for (const descriptor of oldestEntries) {
    if (totalChars <= maxTotalChars) {
      break;
    }
    const entries = next[descriptor.sessionId];
    if (!Array.isArray(entries) || entries.length === 0) {
      continue;
    }
    const entry = entries.shift();
    totalChars -= Number(entry?.textLength || 0);
    if (entries.length === 0) {
      delete next[descriptor.sessionId];
    }
  }

  return next;
}

function safeParseHistoryPayload(raw, nextEntryId, nowMs) {
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.sessions : null;
    if (!source || typeof source !== "object") {
      return {};
    }
    const historyBySession = {};
    for (const [sessionId, entries] of Object.entries(source)) {
      const normalizedSessionId = normalizeText(sessionId);
      if (!normalizedSessionId || !Array.isArray(entries)) {
        continue;
      }
      const normalizedEntries = entries
        .map((entry) =>
          normalizeHistoryEntry(entry, {
            fallbackSessionId: normalizedSessionId,
            fallbackSubmittedAt: nowMs(),
            fallbackId: nextEntryId()
          })
        )
        .filter(Boolean);
      if (normalizedEntries.length > 0) {
        historyBySession[normalizedSessionId] = normalizedEntries;
      }
    }
    return historyBySession;
  } catch {
    return {};
  }
}

function serializeHistoryState(historyBySession) {
  return JSON.stringify({ sessions: historyBySession });
}

export function createSendHistoryRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || windowRef?.document || globalThis.document || null;
  const localStorageRef = options.localStorageRef || windowRef?.localStorage || null;
  const storageKey = normalizeText(options.storageKey) || SEND_HISTORY_STORAGE_KEY;
  const maxEntriesPerSession = Number.isInteger(options.maxEntriesPerSession)
    ? options.maxEntriesPerSession
    : SEND_HISTORY_MAX_ENTRIES_PER_SESSION;
  const maxTotalChars = Number.isInteger(options.maxTotalChars) ? options.maxTotalChars : SEND_HISTORY_MAX_TOTAL_CHARS;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const setTimeoutFn =
    typeof windowRef?.setTimeout === "function" ? windowRef.setTimeout.bind(windowRef) : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef?.clearTimeout === "function" ? windowRef.clearTimeout.bind(windowRef) : globalThis.clearTimeout.bind(globalThis);
  const getActiveSession = typeof options.getActiveSession === "function" ? options.getActiveSession : () => null;
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "?");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "session");
  const setCommandValue = typeof options.setCommandValue === "function" ? options.setCommandValue : () => {};
  const focusCommandInput = typeof options.focusCommandInput === "function" ? options.focusCommandInput : () => {};
  const scheduleCommandPreview =
    typeof options.scheduleCommandPreview === "function" ? options.scheduleCommandPreview : () => {};
  const scheduleCommandSuggestions =
    typeof options.scheduleCommandSuggestions === "function" ? options.scheduleCommandSuggestions : () => {};
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const dialogEl = options.dialogEl || null;
  const openBtn = options.openBtn || null;
  const closeBtn = options.closeBtn || null;
  const metaEl = options.metaEl || null;
  const searchInputEl = options.searchInputEl || null;
  const emptyEl = options.emptyEl || null;
  const listEl = options.listEl || null;
  const detailMetaEl = options.detailMetaEl || null;
  const detailTextEl = options.detailTextEl || null;
  const useBtn = options.useBtn || null;

  let entryCounter = 0;
  const nextEntryId = () => {
    entryCounter += 1;
    return `send-${nowMs().toString(36)}-${entryCounter.toString(36)}`;
  };

  let historyBySession = pruneHistory(safeParseHistoryPayload(localStorageRef?.getItem?.(storageKey), nextEntryId, nowMs), {
    maxEntriesPerSession,
    maxTotalChars
  });
  let uiEventsBound = false;
  let searchQuery = "";
  let selectedEntryId = "";
  let searchRenderTimer = null;
  let persistTimer = null;
  let lastRenderedSessionId = "";
  const searchCache = new Map();

  function getActiveSessionContext() {
    const session = getActiveSession() || null;
    const sessionId = normalizeText(session?.id);
    return {
      session,
      sessionId
    };
  }

  function getSessionEntries(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId || !Array.isArray(historyBySession[normalizedSessionId])) {
      return [];
    }
    return historyBySession[normalizedSessionId].slice().sort((left, right) => {
      const leftSubmittedAt = Number(left?.submittedAt) || 0;
      const rightSubmittedAt = Number(right?.submittedAt) || 0;
      return rightSubmittedAt - leftSubmittedAt;
    });
  }

  function getEntrySearchText(entry) {
    if (!entry?.id) {
      return "";
    }
    if (!searchCache.has(entry.id)) {
      searchCache.set(entry.id, normalizeSendHistoryText(entry.text).toLowerCase());
    }
    return searchCache.get(entry.id) || "";
  }

  function getFilteredEntries(sessionId) {
    const entries = getSessionEntries(sessionId);
    const query = normalizeText(searchQuery).toLowerCase();
    if (!query) {
      return entries;
    }
    return entries.filter((entry) => entry.preview.toLowerCase().includes(query) || getEntrySearchText(entry).includes(query));
  }

  function getSelectedEntry(sessionId) {
    const entries = getFilteredEntries(sessionId);
    if (entries.length === 0) {
      return null;
    }
    return entries.find((entry) => entry.id === selectedEntryId) || entries[0] || null;
  }

  function schedulePersist() {
    if (!localStorageRef || typeof localStorageRef.setItem !== "function") {
      return;
    }
    if (persistTimer !== null) {
      return;
    }
    persistTimer = setTimeoutFn(() => {
      persistTimer = null;
      const snapshot = serializeHistoryState(historyBySession);
      try {
        localStorageRef.setItem(storageKey, snapshot);
      } catch {
        historyBySession = pruneHistory(historyBySession, {
          maxEntriesPerSession,
          maxTotalChars: Math.floor(maxTotalChars * 0.75)
        });
        try {
          localStorageRef.setItem(storageKey, serializeHistoryState(historyBySession));
        } catch {
          // Ignore storage persistence failures after aggressive pruning.
        }
      }
    }, PERSIST_DEBOUNCE_MS);
  }

  function flushPersist() {
    if (!localStorageRef || typeof localStorageRef.setItem !== "function") {
      return;
    }
    const snapshot = serializeHistoryState(historyBySession);
    try {
      localStorageRef.setItem(storageKey, snapshot);
    } catch {
      historyBySession = pruneHistory(historyBySession, {
        maxEntriesPerSession,
        maxTotalChars: Math.floor(maxTotalChars * 0.75)
      });
      try {
        localStorageRef.setItem(storageKey, serializeHistoryState(historyBySession));
      } catch {
        // Ignore storage persistence failures after aggressive pruning.
      }
    }
  }

  function scheduleSearchRender() {
    if (searchRenderTimer !== null) {
      clearTimeoutFn(searchRenderTimer);
    }
    searchRenderTimer = setTimeoutFn(() => {
      searchRenderTimer = null;
      selectedEntryId = "";
      render();
    }, SEARCH_RENDER_DEBOUNCE_MS);
  }

  function renderEntryList(entries) {
    clearElementChildren(listEl);
    if (!listEl || !documentRef || typeof documentRef.createElement !== "function") {
      return;
    }
    for (const entry of entries) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "send-history-item";
      if (entry.id === selectedEntryId) {
        button.classList?.add?.("active");
      }
      button.setAttribute?.("aria-pressed", entry.id === selectedEntryId ? "true" : "false");
      button.addEventListener?.("click", () => {
        selectedEntryId = entry.id;
        render();
      });

      const previewEl = documentRef.createElement("p");
      previewEl.className = "send-history-item-preview";
      previewEl.textContent = entry.preview;
      button.appendChild?.(previewEl);

      const statsEl = documentRef.createElement("p");
      statsEl.className = "send-history-item-meta";
      statsEl.textContent = `${formatHistoryTimestamp(entry.submittedAt)} · ${formatHistoryStats(entry)}`;
      button.appendChild?.(statsEl);

      listEl.appendChild?.(button);
    }
  }

  function renderDetail(entry, session) {
    if (detailMetaEl) {
      if (!entry || !session) {
        detailMetaEl.textContent = "Select a send-history entry to inspect the full payload.";
      } else {
        detailMetaEl.textContent = `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} · ${formatHistoryTimestamp(entry.submittedAt)} · ${formatHistoryStats(entry)}`;
      }
    }
    if (detailTextEl) {
      detailTextEl.textContent = entry?.text || "";
    }
    if (useBtn) {
      useBtn.disabled = !entry;
    }
  }

  function render() {
    const { session, sessionId } = getActiveSessionContext();
    if (sessionId !== lastRenderedSessionId) {
      lastRenderedSessionId = sessionId;
      searchQuery = "";
      selectedEntryId = "";
      if (searchInputEl) {
        searchInputEl.value = "";
      }
    }

    if (openBtn) {
      openBtn.disabled = !sessionId;
      if (typeof openBtn.setAttribute === "function") {
        openBtn.setAttribute(
          "title",
          sessionId
            ? `Browse send history for [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`
            : "No active session available for send history"
        );
      }
    }

    const allEntries = getSessionEntries(sessionId);
    const filteredEntries = getFilteredEntries(sessionId);
    const selectedEntry = getSelectedEntry(sessionId);
    if (!selectedEntry) {
      selectedEntryId = "";
    } else {
      selectedEntryId = selectedEntry.id;
    }

    if (metaEl) {
      metaEl.textContent = sessionId
        ? `History for [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} · ${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"}. Summary rows stay compact; select one to inspect the full payload.`
        : "No active session selected. Send history is available per terminal session.";
    }

    if (emptyEl) {
      emptyEl.hidden = filteredEntries.length > 0;
      if (!sessionId) {
        emptyEl.textContent = "Select an active session to browse send history.";
      } else if (allEntries.length === 0) {
        emptyEl.textContent = "No send-history entries recorded for this session yet.";
      } else {
        emptyEl.textContent = "No send-history entries match the current search.";
      }
    }

    renderEntryList(filteredEntries);
    renderDetail(selectedEntry, session);
  }

  function open() {
    render();
    openDialog(dialogEl);
  }

  function close() {
    closeDialog(dialogEl);
  }

  function useSelectedEntry() {
    const { sessionId } = getActiveSessionContext();
    const entry = getSelectedEntry(sessionId);
    if (!entry) {
      return false;
    }
    setCommandValue(entry.text);
    scheduleCommandPreview();
    scheduleCommandSuggestions();
    focusCommandInput();
    close();
    requestRender();
    return true;
  }

  function recordSend(sessionId, text, options = {}) {
    const normalizedSessionId = normalizeText(sessionId);
    const normalizedText = normalizeSendHistoryText(text);
    if (!normalizedSessionId || !normalizedText) {
      return null;
    }
    const entry = normalizeHistoryEntry(
      {
        id: nextEntryId(),
        sessionId: normalizedSessionId,
        submittedAt: Number.isFinite(options.submittedAt) ? Number(options.submittedAt) : nowMs(),
        text: normalizedText,
        preview: summarizeSendHistoryText(normalizedText),
        textLength: normalizedText.length,
        lineCount: countHistoryLines(normalizedText)
      },
      {
        fallbackSessionId: normalizedSessionId,
        fallbackSubmittedAt: nowMs(),
        fallbackId: nextEntryId()
      }
    );
    if (!entry) {
      return null;
    }
    const nextEntries = Array.isArray(historyBySession[normalizedSessionId]) ? historyBySession[normalizedSessionId].slice() : [];
    nextEntries.push(entry);
    historyBySession = pruneHistory(
      {
        ...historyBySession,
        [normalizedSessionId]: nextEntries
      },
      {
        maxEntriesPerSession,
        maxTotalChars
      }
    );
    searchCache.clear();
    schedulePersist();
    if (dialogEl?.open) {
      render();
    }
    return cloneHistoryEntry(entry);
  }

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    openBtn?.addEventListener?.("click", () => {
      open();
    });
    closeBtn?.addEventListener?.("click", () => {
      close();
    });
    dialogEl?.addEventListener?.("cancel", (event) => {
      event?.preventDefault?.();
      close();
    });
    useBtn?.addEventListener?.("click", () => {
      useSelectedEntry();
    });
    searchInputEl?.addEventListener?.("input", (event) => {
      searchQuery = String(event?.target?.value || "");
      scheduleSearchRender();
    });
  }

  bindUiEvents();
  render();

  return {
    open,
    close,
    bindUiEvents,
    render,
    recordSend,
    useSelectedEntry,
    listEntriesForSession(sessionId) {
      return getSessionEntries(sessionId).map((entry) => cloneHistoryEntry(entry));
    },
    getState() {
      return {
        searchQuery,
        selectedEntryId,
        historyBySession: cloneHistoryState(historyBySession)
      };
    },
    dispose() {
      if (searchRenderTimer !== null) {
        clearTimeoutFn(searchRenderTimer);
        searchRenderTimer = null;
      }
      if (persistTimer !== null) {
        clearTimeoutFn(persistTimer);
        persistTimer = null;
        flushPersist();
      }
    }
  };
}

export { formatHistoryTimestamp, formatHistoryStats, summarizeSendHistoryText, normalizeSendHistoryText };
