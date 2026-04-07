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
    "ptydeck.session-filter.v1": "ssh"
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
    "ptydeck.session-filter.v1": "ssh"
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
