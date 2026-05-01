const DEFAULT_BACKUP_ID = "pre-h62-multi-device-control-foundation";
const DEFAULT_BACKUP_STORAGE_KEY = "ptydeck.backup.pre-h62.v1";
const DEFAULT_SOURCE_KEYS = [
  "ptydeck.settings.v1",
  "ptydeck.active-deck.v1",
  "ptydeck.session-input-settings.v1",
  "ptydeck.session-filter.v1",
  "ptydeck.command-discovery-usage.v1",
  "ptydeck.session-quick-send-usage.v1",
  "ptydeck.send-history.v1"
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stableSerialize(value) {
  return JSON.stringify(value);
}

function safeParseBackup(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if (normalizeText(parsed.format) !== "ptydeck.startup-backup.v1") {
      return null;
    }
    if (!normalizeText(parsed.backupId)) {
      return null;
    }
    if (!Number.isInteger(parsed.createdAt)) {
      return null;
    }
    if (!parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createStartupBackupRuntimeController(options = {}) {
  const localStorageRef = options.localStorageRef || options.windowRef?.localStorage || null;
  const backupId = normalizeText(options.backupId) || DEFAULT_BACKUP_ID;
  const storageKey = normalizeText(options.storageKey) || DEFAULT_BACKUP_STORAGE_KEY;
  const sourceKeys = Array.isArray(options.sourceKeys) && options.sourceKeys.length > 0 ? options.sourceKeys : DEFAULT_SOURCE_KEYS;
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;

  function requireStorage() {
    if (
      !localStorageRef ||
      typeof localStorageRef.getItem !== "function" ||
      typeof localStorageRef.setItem !== "function"
    ) {
      throw new Error(
        "Startup blocked: this H62 feature build requires browser localStorage so it can create and verify the rollback backup."
      );
    }
    return localStorageRef;
  }

  function readExistingBackup() {
    const storage = requireStorage();
    const raw = storage.getItem(storageKey);
    if (raw === null) {
      return null;
    }
    const parsed = safeParseBackup(raw);
    if (!parsed || parsed.backupId !== backupId) {
      throw new Error(
        "Startup blocked: an invalid or incompatible browser rollback backup already exists for this H62 feature build."
      );
    }
    return parsed;
  }

  function buildSnapshot() {
    const storage = requireStorage();
    const entries = {};
    for (const key of sourceKeys) {
      const normalizedKey = normalizeText(key);
      if (!normalizedKey) {
        continue;
      }
      const rawValue = storage.getItem(normalizedKey);
      if (rawValue !== null) {
        entries[normalizedKey] = String(rawValue);
      }
    }
    return {
      format: "ptydeck.startup-backup.v1",
      backupId,
      createdAt: Number(nowFn()),
      sourceKeys: sourceKeys.map((key) => normalizeText(key)).filter(Boolean),
      entries
    };
  }

  async function ensureStartupBackup() {
    const storage = requireStorage();
    const existing = readExistingBackup();
    if (existing) {
      return { created: false, backup: existing, storageKey };
    }
    const snapshot = buildSnapshot();
    storage.setItem(storageKey, JSON.stringify(snapshot));
    const verified = readExistingBackup();
    const expected = safeParseBackup(JSON.stringify(snapshot));
    if (!verified || !expected || stableSerialize(verified) !== stableSerialize(expected)) {
      throw new Error(
        "Startup blocked: failed to verify the browser rollback backup for this H62 feature build."
      );
    }
    return { created: true, backup: verified, storageKey };
  }

  function getStartupBackup() {
    return readExistingBackup();
  }

  function restoreStartupBackup() {
    const storage = requireStorage();
    if (typeof storage.removeItem !== "function") {
      throw new Error(
        "Browser rollback restore requires localStorage.removeItem so missing keys can be restored deterministically."
      );
    }
    const backup = readExistingBackup();
    if (!backup) {
      throw new Error(
        "Rollback restore blocked: no browser rollback backup exists for this H62 feature build."
      );
    }
    const recordedSourceKeys =
      Array.isArray(backup.sourceKeys) && backup.sourceKeys.length > 0 ? backup.sourceKeys : sourceKeys;
    const normalizedKeys = Array.from(
      new Set(recordedSourceKeys.map((key) => normalizeText(key)).filter(Boolean))
    );
    const restoredKeys = [];
    const removedKeys = [];
    for (const key of normalizedKeys) {
      if (Object.prototype.hasOwnProperty.call(backup.entries, key)) {
        storage.setItem(key, String(backup.entries[key]));
        restoredKeys.push(key);
        continue;
      }
      storage.removeItem(key);
      removedKeys.push(key);
    }
    for (const key of restoredKeys) {
      if (storage.getItem(key) !== String(backup.entries[key])) {
        throw new Error(
          `Rollback restore failed: browser key '${key}' did not verify after restore.`
        );
      }
    }
    for (const key of removedKeys) {
      if (storage.getItem(key) !== null) {
        throw new Error(
          `Rollback restore failed: browser key '${key}' should have been removed but is still present.`
        );
      }
    }
    return {
      restored: true,
      storageKey,
      backup,
      restoredKeys,
      removedKeys
    };
  }

  return {
    ensureStartupBackup,
    getStartupBackup,
    restoreStartupBackup,
    getBackupId: () => backupId,
    getStorageKey: () => storageKey,
    getSourceKeys: () => sourceKeys.slice()
  };
}

export const STARTUP_BACKUP_STORAGE_KEY = DEFAULT_BACKUP_STORAGE_KEY;
export const STARTUP_BACKUP_ID = DEFAULT_BACKUP_ID;
export const STARTUP_BACKUP_SOURCE_KEYS = DEFAULT_SOURCE_KEYS.slice();
