const DEFAULT_STORAGE_KEY = "ptydeck.trusted-local-layouts.v1";
const STORAGE_FORMAT = "ptydeck.trusted-local-layouts.v1";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeParseRecord(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || normalizeText(parsed.format) !== STORAGE_FORMAT || !isObject(parsed.clients)) {
      return null;
    }
    const clients = {};
    for (const [rawClientId, rawEntry] of Object.entries(parsed.clients)) {
      const clientId = normalizeText(rawClientId);
      if (!clientId || !isObject(rawEntry) || !Number.isInteger(rawEntry.updatedAt) || !isObject(rawEntry.layout)) {
        continue;
      }
      clients[clientId] = {
        updatedAt: rawEntry.updatedAt,
        layout: cloneValue(rawEntry.layout)
      };
    }
    return {
      format: STORAGE_FORMAT,
      clients
    };
  } catch {
    return null;
  }
}

export function createTrustedLocalLayoutRuntimeController(options = {}) {
  const storageRef = options.storageRef || options.localStorageRef || options.windowRef?.localStorage || null;
  const storageKey = normalizeText(options.storageKey) || DEFAULT_STORAGE_KEY;
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
  const captureCurrentLayout =
    typeof options.captureCurrentLayout === "function" ? options.captureCurrentLayout : () => ({});
  const applyLayoutSnapshot =
    typeof options.applyLayoutSnapshot === "function" ? options.applyLayoutSnapshot : async () => "";

  function requireStorage() {
    if (!storageRef || typeof storageRef.getItem !== "function" || typeof storageRef.setItem !== "function") {
      throw new Error("Trusted-local device layout recall requires browser localStorage.");
    }
    return storageRef;
  }

  function readRecord() {
    const storage = requireStorage();
    return safeParseRecord(storage.getItem(storageKey)) || { format: STORAGE_FORMAT, clients: {} };
  }

  function writeRecord(record) {
    const storage = requireStorage();
    storage.setItem(storageKey, JSON.stringify(record));
    const verified = safeParseRecord(storage.getItem(storageKey));
    if (!verified) {
      throw new Error("Failed to verify trusted-local device layout storage after writing it to localStorage.");
    }
    return verified;
  }

  function getLayoutForClient(clientId) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      return null;
    }
    const record = readRecord();
    const entry = record.clients[normalizedClientId];
    return entry ? { updatedAt: entry.updatedAt, layout: cloneValue(entry.layout) } : null;
  }

  function saveCurrentLayoutForClient(clientId) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      throw new Error("Trusted-local device layout capture requires a stable client id.");
    }
    const record = readRecord();
    record.clients[normalizedClientId] = {
      updatedAt: Number(nowFn()),
      layout: cloneValue(captureCurrentLayout())
    };
    writeRecord(record);
    return getLayoutForClient(normalizedClientId);
  }

  function ensureLayoutBaseline(clientId) {
    const existing = getLayoutForClient(clientId);
    if (existing) {
      return {
        captured: false,
        layout: existing.layout
      };
    }
    const created = saveCurrentLayoutForClient(clientId);
    return {
      captured: true,
      layout: created?.layout || null
    };
  }

  async function applyLayoutForClient(clientId, options = {}) {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      throw new Error("Trusted-local device layout recall requires a stable client id.");
    }
    const baseline = ensureLayoutBaseline(normalizedClientId);
    if (baseline.captured === true) {
      return {
        applied: false,
        captured: true
      };
    }
    await applyLayoutSnapshot(baseline.layout, options);
    return {
      applied: true,
      captured: false
    };
  }

  return {
    getLayoutForClient,
    saveCurrentLayoutForClient,
    ensureLayoutBaseline,
    applyLayoutForClient,
    getStorageKey: () => storageKey
  };
}

export const TRUSTED_LOCAL_LAYOUT_STORAGE_KEY = DEFAULT_STORAGE_KEY;
