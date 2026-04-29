import test from "node:test";
import assert from "node:assert/strict";
import { createDataEncryptionProvider, StaticKeyProvider } from "../src/key-provider.js";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

test("createDataEncryptionProvider returns null when encryption is not configured", () => {
  const provider = createDataEncryptionProvider("", "");
  assert.equal(provider, null);
});

test("createDataEncryptionProvider parses keys and resolves active key", () => {
  const provider = createDataEncryptionProvider(`a:${KEY_A},b:${KEY_B}`, "b");
  const active = provider.getActiveKey();
  assert.equal(active.id, "b");
  assert.equal(active.key.length, 32);
  assert.equal(provider.getKeyById("a")?.length, 32);
});

test("createDataEncryptionProvider validates configuration", () => {
  assert.throws(
    () => createDataEncryptionProvider(`a:${KEY_A}`, ""),
    /DATA_ENCRYPTION_KEYS and DATA_ENCRYPTION_ACTIVE_KEY_ID must be set together/
  );
  assert.throws(
    () => createDataEncryptionProvider("a:not-base64", "a"),
    /contains invalid base64 key/
  );
  assert.throws(
    () => createDataEncryptionProvider(`a:${Buffer.alloc(8, 1).toString("base64")}`, "a"),
    /must be 32 bytes/
  );
  assert.throws(
    () => createDataEncryptionProvider(`a:${KEY_A}`, "missing"),
    /not found in DATA_ENCRYPTION_KEYS/
  );
  assert.throws(
    () => createDataEncryptionProvider("invalid-entry", "a"),
    /must use 'keyId:base64Key' format/
  );
  assert.throws(
    () => createDataEncryptionProvider(` :${KEY_A}`, "a"),
    /empty key id/
  );
  assert.throws(
    () => createDataEncryptionProvider(" , ", "a"),
    /must contain at least one key entry/
  );
});

test("StaticKeyProvider fails closed when the configured active key is unavailable", () => {
  const provider = new StaticKeyProvider([{ id: "a", key: Buffer.alloc(32, 1) }], "missing");
  assert.throws(() => provider.getActiveKey(), /Active encryption key 'missing' is not available/);
  assert.equal(provider.getKeyById("missing"), null);
});
