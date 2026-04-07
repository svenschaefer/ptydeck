import test from "node:test";
import assert from "node:assert/strict";

import {
  createTrustedLocalClientRuntimeController,
  TRUSTED_LOCAL_CLIENT_STORAGE_KEY
} from "../src/public/trusted-local-client-runtime-controller.js";

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    }
  };
}

test("trusted local client controller creates and persists a stable client identity", async () => {
  const storage = createStorage();
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage,
    navigatorRef: {
      userAgent: "Mozilla/5.0 Chrome/123.0 Safari/537.36",
      platform: "Linux x86_64"
    },
    cryptoRef: {
      randomUUID() {
        return "12345678-1234-1234-1234-1234567890ab";
      }
    },
    nowFn: () => 1234
  });

  const identity = await controller.ensureClientIdentity();

  assert.equal(identity.clientId, "trusted-12345678-1234-1234-1234-1234567890ab");
  assert.match(identity.label, /^Chrome on Linux \([A-Z0-9]{4}\)$/);
  assert.equal(identity.createdAt, 1234);
  assert.deepEqual(controller.getWsTicketPayload(), {
    clientId: identity.clientId,
    label: identity.label
  });
  assert.equal(typeof storage.getItem(TRUSTED_LOCAL_CLIENT_STORAGE_KEY), "string");
});

test("trusted local client controller reuses an existing stored identity", async () => {
  const storedIdentity = {
    format: "ptydeck.trusted-local-client.v1",
    clientId: "trusted-existing-client",
    label: "Desk Browser",
    createdAt: 77
  };
  const storage = createStorage({
    [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify(storedIdentity)
  });
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage,
    nowFn: () => 9999
  });

  const identity = await controller.ensureClientIdentity();

  assert.deepEqual(identity, storedIdentity);
  assert.deepEqual(controller.getClientIdentity(), storedIdentity);
  assert.deepEqual(controller.getWsTicketPayload(), {
    clientId: "trusted-existing-client",
    label: "Desk Browser"
  });
});
