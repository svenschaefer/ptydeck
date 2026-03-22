function decodeKeyBase64(base64Value, keyId) {
  let keyBuffer;
  try {
    keyBuffer = Buffer.from(base64Value, "base64");
  } catch {
    throw new Error(`DATA_ENCRYPTION_KEYS contains invalid base64 key for id '${keyId}'.`);
  }
  if (keyBuffer.length !== 32) {
    throw new Error(`DATA_ENCRYPTION_KEYS key '${keyId}' must be 32 bytes (base64-encoded).`);
  }
  return keyBuffer;
}

export class StaticKeyProvider {
  constructor(keys, activeKeyId) {
    this.keys = new Map(keys.map((entry) => [entry.id, entry.key]));
    this.activeKeyId = activeKeyId;
  }

  getActiveKey() {
    const key = this.keys.get(this.activeKeyId);
    if (!key) {
      throw new Error(`Active encryption key '${this.activeKeyId}' is not available.`);
    }
    return { id: this.activeKeyId, key };
  }

  getKeyById(keyId) {
    return this.keys.get(keyId) || null;
  }
}

export function createDataEncryptionProvider(rawKeys, rawActiveKeyId) {
  const keysRaw = String(rawKeys || "").trim();
  const activeKeyId = String(rawActiveKeyId || "").trim();
  if (!keysRaw && !activeKeyId) {
    return null;
  }
  if (!keysRaw || !activeKeyId) {
    throw new Error("DATA_ENCRYPTION_KEYS and DATA_ENCRYPTION_ACTIVE_KEY_ID must be set together.");
  }

  const entries = keysRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error("DATA_ENCRYPTION_KEYS entries must use 'keyId:base64Key' format.");
      }
      const id = entry.slice(0, separatorIndex).trim();
      const base64Key = entry.slice(separatorIndex + 1).trim();
      if (!id) {
        throw new Error("DATA_ENCRYPTION_KEYS contains empty key id.");
      }
      return { id, key: decodeKeyBase64(base64Key, id) };
    });

  if (entries.length === 0) {
    throw new Error("DATA_ENCRYPTION_KEYS must contain at least one key entry.");
  }

  if (!entries.some((entry) => entry.id === activeKeyId)) {
    throw new Error(`DATA_ENCRYPTION_ACTIVE_KEY_ID '${activeKeyId}' not found in DATA_ENCRYPTION_KEYS.`);
  }

  return new StaticKeyProvider(entries, activeKeyId);
}
