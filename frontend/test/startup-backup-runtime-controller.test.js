import test from "node:test";
import assert from "node:assert/strict";

import {
  createStartupBackupRuntimeController,
  STARTUP_BACKUP_ID,
  STARTUP_BACKUP_SOURCE_KEYS,
  STARTUP_BACKUP_STORAGE_KEY
} from "../src/public/startup-backup-runtime-controller.js";

function createLocalStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    dump() {
      return new Map(data);
    }
  };
}

test("startup backup controller creates a verified rollback snapshot on first run", async () => {
  const localStorageRef = createLocalStorage({
    "ptydeck.settings.v1": '{"sidebarVisible":true}',
    "ptydeck.active-deck.v1": "ops",
    "ptydeck.session-filter.v1": "ssh",
    "ptydeck.session-quick-send-usage.v1": '{"sessions":{"s1":[{"lookupKey":"project::deploy","count":2,"lastUsedAt":123}]}}'
  });
  const controller = createStartupBackupRuntimeController({
    localStorageRef,
    nowFn: () => 12345
  });

  const result = await controller.ensureStartupBackup();

  assert.equal(result.created, true);
  assert.equal(result.storageKey, STARTUP_BACKUP_STORAGE_KEY);
  const rawBackup = localStorageRef.getItem(STARTUP_BACKUP_STORAGE_KEY);
  const parsed = JSON.parse(rawBackup);
  assert.equal(parsed.backupId, STARTUP_BACKUP_ID);
  assert.equal(parsed.createdAt, 12345);
  assert.deepEqual(parsed.sourceKeys, STARTUP_BACKUP_SOURCE_KEYS);
  assert.deepEqual(parsed.entries, {
    "ptydeck.settings.v1": '{"sidebarVisible":true}',
    "ptydeck.active-deck.v1": "ops",
    "ptydeck.session-filter.v1": "ssh",
    "ptydeck.session-quick-send-usage.v1": '{"sessions":{"s1":[{"lookupKey":"project::deploy","count":2,"lastUsedAt":123}]}}'
  });
});

test("startup backup controller reuses an existing valid backup", async () => {
  const existingBackup = {
    format: "ptydeck.startup-backup.v1",
    backupId: STARTUP_BACKUP_ID,
    createdAt: 111,
    sourceKeys: STARTUP_BACKUP_SOURCE_KEYS,
    entries: {
      "ptydeck.settings.v1": '{"sidebarVisible":false}'
    }
  };
  const localStorageRef = createLocalStorage({
    [STARTUP_BACKUP_STORAGE_KEY]: JSON.stringify(existingBackup)
  });
  const controller = createStartupBackupRuntimeController({ localStorageRef });

  const result = await controller.ensureStartupBackup();

  assert.equal(result.created, false);
  assert.deepEqual(result.backup, existingBackup);
});

test("startup backup controller fails startup when storage is unavailable", async () => {
  const controller = createStartupBackupRuntimeController({ localStorageRef: null });

  await assert.rejects(
    controller.ensureStartupBackup(),
    /requires browser localStorage/
  );
});

test("startup backup controller fails startup when an incompatible backup already exists", async () => {
  const localStorageRef = createLocalStorage({
    [STARTUP_BACKUP_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: "wrong-backup",
      createdAt: 1,
      entries: {}
    })
  });
  const controller = createStartupBackupRuntimeController({ localStorageRef });

  await assert.rejects(
    controller.ensureStartupBackup(),
    /invalid or incompatible browser rollback backup/
  );
});

test("startup backup controller fails startup when the written backup cannot be verified exactly", async () => {
  let writes = 0;
  const localStorageRef = {
    getItem(key) {
      if (key !== STARTUP_BACKUP_STORAGE_KEY) {
        return null;
      }
      if (writes === 0) {
        return null;
      }
      return JSON.stringify({
        format: "ptydeck.startup-backup.v1",
        backupId: STARTUP_BACKUP_ID,
        createdAt: 999,
        sourceKeys: STARTUP_BACKUP_SOURCE_KEYS,
        entries: {}
      });
    },
    setItem(key, _value) {
      if (key === STARTUP_BACKUP_STORAGE_KEY) {
        writes += 1;
      }
    },
    removeItem() {}
  };
  const controller = createStartupBackupRuntimeController({
    localStorageRef,
    nowFn: () => 12345
  });

  await assert.rejects(
    controller.ensureStartupBackup(),
    /failed to verify the browser rollback backup/i
  );
});

test("startup backup controller restores browser-local state from the verified rollback snapshot", async () => {
  const localStorageRef = createLocalStorage({
    "ptydeck.settings.v1": '{"sidebarVisible":false}',
    "ptydeck.active-deck.v1": "ops",
    [STARTUP_BACKUP_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: STARTUP_BACKUP_ID,
      createdAt: 222,
      sourceKeys: STARTUP_BACKUP_SOURCE_KEYS,
      entries: {
        "ptydeck.settings.v1": '{"sidebarVisible":true}',
        "ptydeck.session-filter.v1": "ssh"
      }
    })
  });
  const controller = createStartupBackupRuntimeController({ localStorageRef });

  const result = controller.restoreStartupBackup();

  assert.equal(result.restored, true);
  assert.equal(localStorageRef.getItem("ptydeck.settings.v1"), '{"sidebarVisible":true}');
  assert.equal(localStorageRef.getItem("ptydeck.session-filter.v1"), "ssh");
  assert.equal(localStorageRef.getItem("ptydeck.active-deck.v1"), null);
});

test("startup backup controller blocks restore when no verified rollback snapshot exists", async () => {
  const controller = createStartupBackupRuntimeController({
    localStorageRef: createLocalStorage()
  });

  assert.throws(
    () => controller.restoreStartupBackup(),
    /no browser rollback backup exists/
  );
});

test("startup backup controller ignores blank source keys and exposes the verified snapshot accessors", () => {
  const localStorageRef = createLocalStorage({
    [STARTUP_BACKUP_STORAGE_KEY]: JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: STARTUP_BACKUP_ID,
      createdAt: 111,
      sourceKeys: ["ptydeck.settings.v1", " ", ""],
      entries: {
        "ptydeck.settings.v1": '{"sidebarVisible":true}'
      }
    })
  });
  const controller = createStartupBackupRuntimeController({
    localStorageRef,
    sourceKeys: ["ptydeck.settings.v1", " ", ""]
  });

  assert.equal(controller.getBackupId(), STARTUP_BACKUP_ID);
  assert.equal(controller.getStorageKey(), STARTUP_BACKUP_STORAGE_KEY);
  assert.deepEqual(controller.getSourceKeys(), ["ptydeck.settings.v1", " ", ""]);
  assert.equal(controller.getStartupBackup().entries["ptydeck.settings.v1"], '{"sidebarVisible":true}');
});

test("startup backup controller requires removeItem during rollback restore", () => {
  const controller = createStartupBackupRuntimeController({
    localStorageRef: {
      getItem(key) {
        if (key === STARTUP_BACKUP_STORAGE_KEY) {
          return JSON.stringify({
            format: "ptydeck.startup-backup.v1",
            backupId: STARTUP_BACKUP_ID,
            createdAt: 222,
            sourceKeys: STARTUP_BACKUP_SOURCE_KEYS,
            entries: {}
          });
        }
        return null;
      },
      setItem() {}
    }
  });

  assert.throws(
    () => controller.restoreStartupBackup(),
    /requires localStorage.removeItem/i
  );
});

test("startup backup controller fails restore when a removed key stays present", () => {
  const localStorageRef = {
    getItem(key) {
      if (key === STARTUP_BACKUP_STORAGE_KEY) {
        return JSON.stringify({
          format: "ptydeck.startup-backup.v1",
          backupId: STARTUP_BACKUP_ID,
          createdAt: 222,
          sourceKeys: ["ptydeck.active-deck.v1"],
          entries: {}
        });
      }
      if (key === "ptydeck.active-deck.v1") {
        return "still-here";
      }
      return null;
    },
    setItem() {},
    removeItem() {}
  };
  const controller = createStartupBackupRuntimeController({ localStorageRef });

  assert.throws(
    () => controller.restoreStartupBackup(),
    /should have been removed but is still present/i
  );
});

test("startup backup controller fails restore when a restored key cannot be verified", () => {
  const localStorageRef = {
    getItem(key) {
      if (key === STARTUP_BACKUP_STORAGE_KEY) {
        return JSON.stringify({
          format: "ptydeck.startup-backup.v1",
          backupId: STARTUP_BACKUP_ID,
          createdAt: 222,
          sourceKeys: ["ptydeck.settings.v1"],
          entries: {
            "ptydeck.settings.v1": '{"sidebarVisible":true}'
          }
        });
      }
      return null;
    },
    setItem() {},
    removeItem() {}
  };
  const controller = createStartupBackupRuntimeController({ localStorageRef });

  assert.throws(
    () => controller.restoreStartupBackup(),
    /did not verify after restore/i
  );
});
