const DEFAULT_STORAGE_KEY = "ptydeck.stream-debug.v1";
const DEFAULT_MAX_SESSIONS = 24;
const DEFAULT_MAX_ENTRIES_PER_SESSION = 300;
const MAX_TEXT_LENGTH = 2000;

function normalizeText(value) {
  return String(value || "");
}

function truncateText(value) {
  const text = normalizeText(value);
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_TEXT_LENGTH)}…`;
}

function normalizePayload(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return truncateText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePayload(entry));
  }
  if (typeof value === "object") {
    const normalized = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizePayload(entry);
    }
    return normalized;
  }
  return truncateText(value);
}

function safeParseStoredTrace(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  } catch {
    return [];
  }
}

export function createStreamDebugTraceController(options = {}) {
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const storage = windowRef?.localStorage || null;
  const storageKey = String(options.storageKey || DEFAULT_STORAGE_KEY);
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const maxSessions = Number.isInteger(options.maxSessions) ? Math.max(1, options.maxSessions) : DEFAULT_MAX_SESSIONS;
  const maxEntriesPerSession = Number.isInteger(options.maxEntriesPerSession)
    ? Math.max(1, options.maxEntriesPerSession)
    : DEFAULT_MAX_ENTRIES_PER_SESSION;
  const sessions = new Map();
  let persistTimer = null;

  for (const record of safeParseStoredTrace(storage?.getItem?.(storageKey))) {
    const sessionId = normalizeText(record?.sessionId).trim();
    const entries = Array.isArray(record?.entries) ? record.entries : [];
    if (!sessionId || entries.length === 0) {
      continue;
    }
    sessions.set(sessionId, entries.slice(-maxEntriesPerSession));
  }

  function flushPersist() {
    persistTimer = null;
    if (!storage?.setItem) {
      return;
    }
    const payload = {
      sessions: Array.from(sessions.entries()).map(([sessionId, entries]) => ({
        sessionId,
        entries
      }))
    };
    try {
      storage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage persistence failures in debug tooling.
    }
  }

  function schedulePersist() {
    if (!storage?.setItem || persistTimer !== null) {
      return;
    }
    persistTimer = setTimeout(flushPersist, 25);
  }

  function enforceSessionLimit() {
    while (sessions.size > maxSessions) {
      const oldestSessionId = sessions.keys().next().value;
      if (!oldestSessionId) {
        break;
      }
      sessions.delete(oldestSessionId);
    }
  }

  function record(sessionId, type, payload = {}) {
    const normalizedSessionId = normalizeText(sessionId).trim();
    const normalizedType = normalizeText(type).trim();
    if (!normalizedSessionId || !normalizedType) {
      return;
    }
    const nextEntries = sessions.get(normalizedSessionId)?.slice() || [];
    nextEntries.push({
      recordedAt: now(),
      type: normalizedType,
      payload: normalizePayload(payload)
    });
    sessions.delete(normalizedSessionId);
    sessions.set(normalizedSessionId, nextEntries.slice(-maxEntriesPerSession));
    enforceSessionLimit();
    schedulePersist();
  }

  function getSessionTrace(sessionId) {
    const normalizedSessionId = normalizeText(sessionId).trim();
    return normalizedSessionId ? (sessions.get(normalizedSessionId)?.slice() || []) : [];
  }

  function listSessionIds() {
    return Array.from(sessions.keys());
  }

  function clearSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId).trim();
    if (!normalizedSessionId) {
      return;
    }
    sessions.delete(normalizedSessionId);
    schedulePersist();
  }

  function clear() {
    sessions.clear();
    schedulePersist();
  }

  function dispose() {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      flushPersist();
    }
  }

  const api = {
    record,
    getSessionTrace,
    listSessionIds,
    clearSession,
    clear,
    dispose
  };

  if (windowRef) {
    windowRef.__PTYDECK_STREAM_DEBUG__ = api;
  }

  return api;
}
