import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function createEmptyState(sessions = []) {
  return {
    sessions,
    sessionOutputs: [],
    customCommands: [],
    decks: [],
    connectionProfiles: [],
    layoutProfiles: [],
    workspacePresets: [],
    sshTrustEntries: [],
    shareLinks: [],
    messagingTelegramTopicBindings: []
  };
}

function normalizePersistedState(value) {
  if (Array.isArray(value)) {
    return createEmptyState(value);
  }
  if (value && Array.isArray(value.sessions) && Array.isArray(value.customCommands)) {
      return {
        sessions: value.sessions,
        sessionOutputs: Array.isArray(value.sessionOutputs) ? value.sessionOutputs : [],
        customCommands: value.customCommands,
      decks: Array.isArray(value.decks) ? value.decks : [],
      connectionProfiles: Array.isArray(value.connectionProfiles) ? value.connectionProfiles : [],
      layoutProfiles: Array.isArray(value.layoutProfiles) ? value.layoutProfiles : [],
        workspacePresets: Array.isArray(value.workspacePresets) ? value.workspacePresets : [],
        sshTrustEntries: Array.isArray(value.sshTrustEntries) ? value.sshTrustEntries : [],
        shareLinks: Array.isArray(value.shareLinks) ? value.shareLinks : [],
        messagingTelegramTopicBindings: Array.isArray(value.messagingTelegramTopicBindings) ? value.messagingTelegramTopicBindings : []
      };
  }
  return null;
}

function isEncryptedEnvelopeCandidate(value) {
  return value && value.format === "ptydeck.encrypted.v1";
}

function buildEncryptedEnvelope(payloadJson, encryptionProvider) {
  const active = encryptionProvider.getActiveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", active.key, iv);
  const ciphertext = Buffer.concat([cipher.update(payloadJson, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    format: "ptydeck.encrypted.v1",
    algorithm: "aes-256-gcm",
    keyId: active.id,
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptEnvelope(envelope, encryptionProvider) {
  if (!encryptionProvider) {
    throw new Error("Persistence payload is encrypted, but no encryption provider is configured.");
  }
  const key = encryptionProvider.getKeyById(envelope.keyId);
  if (!key) {
    throw new Error(`Encryption key '${envelope.keyId}' is not available for persistence decryption.`);
  }
  try {
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    throw new Error("Failed to decrypt persistence payload.");
  }
}

export class JsonPersistence {
  constructor(
    filePath,
    {
      mkdirFn = mkdir,
      readFileFn = readFile,
      writeFileFn = writeFile,
      renameFn = rename,
      unlinkFn = unlink,
      encryptionProvider = null
    } = {}
  ) {
    this.filePath = filePath;
    this.mkdirFn = mkdirFn;
    this.readFileFn = readFileFn;
    this.writeFileFn = writeFileFn;
    this.renameFn = renameFn;
    this.unlinkFn = unlinkFn;
    this.encryptionProvider = encryptionProvider;
  }

  async load() {
    const state = await this.loadState();
    return state.sessions;
  }

  async loadState() {
    try {
      const raw = await this.readFileFn(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = normalizePersistedState(parsed);
      if (normalized) {
        return normalized;
      }
      if (isEncryptedEnvelopeCandidate(parsed)) {
        if (
          parsed.algorithm !== "aes-256-gcm" ||
          typeof parsed.keyId !== "string" ||
          typeof parsed.iv !== "string" ||
          typeof parsed.tag !== "string" ||
          typeof parsed.ciphertext !== "string"
        ) {
          throw new Error("Persistence payload contains an invalid encrypted envelope.");
        }
        const plainJson = decryptEnvelope(parsed, this.encryptionProvider);
        const decryptedParsed = JSON.parse(plainJson);
        const normalizedDecrypted = normalizePersistedState(decryptedParsed);
        if (normalizedDecrypted) {
          return normalizedDecrypted;
        }
        throw new Error("Encrypted persistence payload did not decode to a supported state format.");
      }
      return createEmptyState();
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return createEmptyState();
      }
      throw err;
    }
  }

  async save(sessions) {
    await this.saveState({
      sessions,
      customCommands: [],
      decks: [],
      connectionProfiles: [],
      layoutProfiles: [],
      workspacePresets: [],
      sshTrustEntries: [],
      shareLinks: [],
      messagingTelegramTopicBindings: []
    });
  }

  async saveState({
    sessions,
    sessionOutputs,
    customCommands,
    decks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    sshTrustEntries,
    shareLinks,
    messagingTelegramTopicBindings
  }) {
    await this.mkdirFn(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payloadJson = JSON.stringify(
      {
        sessions: Array.isArray(sessions) ? sessions : [],
        sessionOutputs: Array.isArray(sessionOutputs) ? sessionOutputs : [],
        customCommands: Array.isArray(customCommands) ? customCommands : [],
        decks: Array.isArray(decks) ? decks : [],
        connectionProfiles: Array.isArray(connectionProfiles) ? connectionProfiles : [],
        layoutProfiles: Array.isArray(layoutProfiles) ? layoutProfiles : [],
        workspacePresets: Array.isArray(workspacePresets) ? workspacePresets : [],
        sshTrustEntries: Array.isArray(sshTrustEntries) ? sshTrustEntries : [],
        shareLinks: Array.isArray(shareLinks) ? shareLinks : [],
        messagingTelegramTopicBindings: Array.isArray(messagingTelegramTopicBindings) ? messagingTelegramTopicBindings : []
      },
      null,
      2
    );
    const payload = this.encryptionProvider
      ? JSON.stringify(buildEncryptedEnvelope(payloadJson, this.encryptionProvider), null, 2)
      : payloadJson;
    try {
      await this.writeFileFn(tmpPath, payload, "utf8");
      await this.renameFn(tmpPath, this.filePath);
    } catch (err) {
      try {
        await this.unlinkFn(tmpPath);
      } catch {
        // Ignore temp-file cleanup errors.
      }
      throw err;
    }
  }
}
