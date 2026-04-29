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

test("trusted local client controller can rename the persisted device identity", () => {
  const storage = createStorage({
    [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.trusted-local-client.v1",
      clientId: "trusted-existing-client",
      label: "Desk Browser",
      createdAt: 77
    })
  });
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage
  });

  const renamed = controller.renameClientIdentity("Office Tablet");

  assert.equal(renamed.label, "Office Tablet");
  assert.deepEqual(controller.getWsTicketPayload(), {
    clientId: "trusted-existing-client",
    label: "Office Tablet"
  });
  assert.match(storage.getItem(TRUSTED_LOCAL_CLIENT_STORAGE_KEY), /Office Tablet/);
});

test("trusted local client controller rejects empty or missing rename targets", () => {
  const storage = createStorage({
    [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.trusted-local-client.v1",
      clientId: "trusted-existing-client",
      label: "Desk Browser",
      createdAt: 77
    })
  });
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage
  });
  const emptyController = createTrustedLocalClientRuntimeController({
    storageRef: createStorage()
  });

  assert.throws(() => controller.renameClientIdentity("   "), /Device name cannot be empty/);
  assert.throws(() => emptyController.renameClientIdentity("Desk Browser"), /identity is not available yet/);
});

test("trusted local client controller recreates malformed stored identity payloads", async () => {
  const storage = createStorage({
    [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.trusted-local-client.v1",
      clientId: "trusted-bad",
      label: "   ",
      createdAt: "oops"
    })
  });
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage,
    navigatorRef: {
      userAgent: "Mozilla/5.0 Firefox/124.0",
      platform: "Win32"
    },
    cryptoRef: {
      randomUUID() {
        return "feedface-1234-1234-1234-abcdefabcdef";
      }
    },
    nowFn: () => 4321
  });

  const identity = await controller.ensureClientIdentity();

  assert.equal(identity.clientId, "trusted-feedface-1234-1234-1234-abcdefabcdef");
  assert.equal(identity.createdAt, 4321);
  assert.deepEqual(controller.getWsTicketPayload(), {
    clientId: identity.clientId,
    label: identity.label
  });
});

test("trusted local client controller rereads browser storage so stale labels from other tabs do not stick", async () => {
  const storage = createStorage({
    [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.trusted-local-client.v1",
      clientId: "trusted-existing-client",
      label: "Desk Browser",
      createdAt: 77
    })
  });
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: storage
  });

  assert.equal((await controller.ensureClientIdentity()).label, "Desk Browser");

  storage.setItem(
    TRUSTED_LOCAL_CLIENT_STORAGE_KEY,
    JSON.stringify({
      format: "ptydeck.trusted-local-client.v1",
      clientId: "trusted-existing-client",
      label: "Notebook Browser",
      createdAt: 77
    })
  );

  assert.equal(controller.getClientIdentity()?.label, "Notebook Browser");
  assert.deepEqual(controller.getWsTicketPayload(), {
    clientId: "trusted-existing-client",
    label: "Notebook Browser"
  });
});

test("trusted local client controller fails clearly when localStorage is unavailable", async () => {
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: null
  });

  await assert.rejects(
    () => controller.ensureClientIdentity(),
    /requires browser localStorage/
  );
});

test("trusted local client controller surfaces clear storage persistence failures", async () => {
  const failingStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota exceeded");
    }
  };
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: failingStorage,
    cryptoRef: {
      randomUUID() {
        return "12345678-1234-1234-1234-1234567890ab";
      }
    }
  });

  await assert.rejects(
    () => controller.ensureClientIdentity(),
    /Failed to persist the trusted local device identity/
  );
});

test("trusted local client controller surfaces clear rename persistence failures", () => {
  const controller = createTrustedLocalClientRuntimeController({
    storageRef: {
      getItem() {
        return JSON.stringify({
          format: "ptydeck.trusted-local-client.v1",
          clientId: "trusted-existing-client",
          label: "Desk Browser",
          createdAt: 77
        });
      },
      setItem() {
        throw new Error("quota exceeded");
      }
    }
  });

  assert.throws(
    () => controller.renameClientIdentity("Office Tablet"),
    /Failed to persist the updated trusted local device name/
  );
});

test("trusted local client controller supports custom storage keys, window fallbacks, and truncated labels", async () => {
  const storage = createStorage();
  const controller = createTrustedLocalClientRuntimeController({
    storageKey: "custom.trusted-local-client",
    windowRef: {
      localStorage: storage,
      navigator: {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0 Safari/537.36",
        userAgentData: { platform: "Windows" }
      },
      crypto: {}
    },
    nowFn: () => 9876
  });

  const identity = await controller.ensureClientIdentity();
  const renamed = controller.renameClientIdentity("X".repeat(90));

  assert.match(identity.clientId, /^trusted-/);
  assert.match(identity.label, /^Edge on Windows \([A-Z0-9]{4}\)$/);
  assert.equal(controller.getStorageKey(), "custom.trusted-local-client");
  assert.equal(controller.getLabelMaxLength(), 64);
  assert.equal(renamed.label.length, 64);
  assert.equal(typeof storage.getItem("custom.trusted-local-client"), "string");
});

test("trusted local client controller fails closed for invalid stored records and unstuck rename verification", () => {
  const invalidController = createTrustedLocalClientRuntimeController({
    localStorageRef: createStorage({
      [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: JSON.stringify([])
    })
  });
  assert.equal(invalidController.getClientIdentity(), null);
  assert.deepEqual(invalidController.getWsTicketPayload(), {});

  const staleJson = JSON.stringify({
    format: "ptydeck.trusted-local-client.v1",
    clientId: "trusted-existing-client",
    label: "Desk Browser",
    createdAt: 77
  });
  const staleController = createTrustedLocalClientRuntimeController({
    storageRef: {
      getItem() {
        return staleJson;
      },
      setItem() {
        // Pretend the write succeeded but keep returning the stale label.
      }
    }
  });

  assert.throws(
    () => staleController.renameClientIdentity("Updated Label"),
    /Failed to persist the updated trusted local device name/
  );
});

test("trusted local client controller derives browser and platform labels across navigator variants", async () => {
  const cases = [
    {
      navigatorRef: {
        userAgent: "Mozilla/5.0 Version/17.4 Safari/605.1.15",
        platform: "MacIntel"
      },
      expectedLabelPrefix: "Safari on macOS"
    },
    {
      navigatorRef: {
        userAgent: "Mozilla/5.0 Firefox/124.0",
        platform: "Android"
      },
      expectedLabelPrefix: "Firefox on Android"
    },
    {
      navigatorRef: {
        userAgent: "",
        platform: "iPhone"
      },
      expectedLabelPrefix: "Browser on iOS"
    },
    {
      navigatorRef: {
        userAgent: "Custom Windows Agent",
        platform: ""
      },
      expectedLabelPrefix: "Browser on Windows"
    },
    {
      navigatorRef: {
        userAgent: "Custom Linux Agent",
        platform: ""
      },
      expectedLabelPrefix: "Browser on Linux"
    },
    {
      navigatorRef: {
        userAgent: "CompletelyUnknownAgent/1.0",
        platform: "Unknown"
      },
      expectedLabelPrefix: "Browser on Device"
    }
  ];

  for (const [index, testCase] of cases.entries()) {
    const controller = createTrustedLocalClientRuntimeController({
      storageRef: createStorage(),
      navigatorRef: testCase.navigatorRef,
      cryptoRef: {
        randomUUID() {
          return `00000000-0000-0000-0000-0000000000${index}`;
        }
      },
      nowFn: () => 1000 + index
    });
    const identity = await controller.ensureClientIdentity();
    assert.match(identity.label, new RegExp(`^${testCase.expectedLabelPrefix} \\([A-Z0-9]{4}\\)$`));
  }
});

test("trusted local client controller tolerates invalid stored json and fails when a created identity cannot be re-read", async () => {
  const invalidJsonController = createTrustedLocalClientRuntimeController({
    storageRef: createStorage({
      [TRUSTED_LOCAL_CLIENT_STORAGE_KEY]: "{"
    })
  });
  assert.equal(invalidJsonController.getClientIdentity(), null);

  let persistedValue = null;
  const unverifiableController = createTrustedLocalClientRuntimeController({
    storageRef: {
      getItem() {
        return persistedValue;
      },
      setItem() {
        persistedValue = JSON.stringify({
          format: "wrong-format",
          clientId: "trusted-bad",
          label: "Bad",
          createdAt: 1
        });
      }
    },
    cryptoRef: {
      randomUUID() {
        return "12345678-1234-1234-1234-1234567890ab";
      }
    }
  });

  await assert.rejects(
    () => unverifiableController.ensureClientIdentity(),
    /Failed to verify the trusted local device identity/
  );
});
