const DEFAULT_STORAGE_KEY = "ptydeck.trace-debug.v1";
const DEFAULT_MAX_ENTRIES = 400;
const MAX_TEXT_LENGTH = 400;

function normalizeText(value) {
  return String(value || "");
}

function truncateText(value) {
  const text = normalizeText(value);
  return text.length <= MAX_TEXT_LENGTH ? text : `${text.slice(0, MAX_TEXT_LENGTH)}…`;
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

function safeParseStoredEntries(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

export function createTraceDebugController(options = {}) {
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const storage = windowRef?.localStorage || null;
  const storageKey = String(options.storageKey || DEFAULT_STORAGE_KEY);
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const maxEntries = Number.isInteger(options.maxEntries) ? Math.max(1, options.maxEntries) : DEFAULT_MAX_ENTRIES;
  let entries = safeParseStoredEntries(storage?.getItem?.(storageKey)).slice(-maxEntries);
  let persistTimer = null;

  function flushPersist() {
    persistTimer = null;
    if (!storage?.setItem) {
      return;
    }
    try {
      storage.setItem(storageKey, JSON.stringify({ entries }));
    } catch {
      // Ignore debug-tool persistence failures.
    }
  }

  function schedulePersist() {
    if (!storage?.setItem || persistTimer !== null) {
      return;
    }
    persistTimer = setTimeout(flushPersist, 25);
  }

  function record(type, payload = {}) {
    const normalizedType = normalizeText(type).trim();
    if (!normalizedType) {
      return;
    }
    entries.push({
      recordedAt: now(),
      type: normalizedType,
      payload: normalizePayload(payload)
    });
    entries = entries.slice(-maxEntries);
    schedulePersist();
  }

  function listEntries() {
    return entries.slice();
  }

  function findByCorrelationId(correlationId) {
    const normalizedCorrelationId = normalizeText(correlationId).trim();
    if (!normalizedCorrelationId) {
      return [];
    }
    return entries.filter((entry) => entry?.payload?.trace?.correlationId === normalizedCorrelationId);
  }

  function clear() {
    entries = [];
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
    listEntries,
    findByCorrelationId,
    clear,
    dispose
  };

  if (windowRef) {
    windowRef.__PTYDECK_TRACE_DEBUG__ = api;
  }

  return api;
}
