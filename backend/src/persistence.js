import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
      if (Array.isArray(parsed)) {
        return { sessions: parsed, customCommands: [], decks: [] };
      }
      if (parsed && Array.isArray(parsed.sessions) && Array.isArray(parsed.customCommands)) {
        return {
          sessions: parsed.sessions,
          customCommands: parsed.customCommands,
          decks: Array.isArray(parsed.decks) ? parsed.decks : []
        };
      }
      if (
        parsed &&
        parsed.format === "ptydeck.encrypted.v1" &&
        typeof parsed.keyId === "string" &&
        typeof parsed.iv === "string" &&
        typeof parsed.tag === "string" &&
        typeof parsed.ciphertext === "string"
      ) {
        const plainJson = decryptEnvelope(parsed, this.encryptionProvider);
        const decryptedParsed = JSON.parse(plainJson);
        if (Array.isArray(decryptedParsed)) {
          return { sessions: decryptedParsed, customCommands: [], decks: [] };
        }
        if (
          decryptedParsed &&
          Array.isArray(decryptedParsed.sessions) &&
          Array.isArray(decryptedParsed.customCommands)
        ) {
          return {
            sessions: decryptedParsed.sessions,
            customCommands: decryptedParsed.customCommands,
            decks: Array.isArray(decryptedParsed.decks) ? decryptedParsed.decks : []
          };
        }
        return { sessions: [], customCommands: [], decks: [] };
      }
      return { sessions: [], customCommands: [], decks: [] };
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return { sessions: [], customCommands: [], decks: [] };
      }
      throw err;
    }
  }

  async save(sessions) {
    await this.saveState({ sessions, customCommands: [], decks: [] });
  }

  async saveState({ sessions, customCommands, decks }) {
    await this.mkdirFn(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payloadJson = JSON.stringify(
      {
        sessions: Array.isArray(sessions) ? sessions : [],
        customCommands: Array.isArray(customCommands) ? customCommands : [],
        decks: Array.isArray(decks) ? decks : []
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
