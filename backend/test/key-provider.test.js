import test from "node:test";
import assert from "node:assert/strict";
import { createDataEncryptionProvider } from "../src/key-provider.js";

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
    /must be 32 bytes/
  );
  assert.throws(
    () => createDataEncryptionProvider(`a:${KEY_A}`, "missing"),
    /not found in DATA_ENCRYPTION_KEYS/
  );
});
