import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ensureStartupDataBackup,
  readStartupDataBackup,
  restoreStartupDataBackup,
  STARTUP_BACKUP_ID
} from "../src/startup-backup.js";

test("startup data backup creates manifest and payload copy when persistence file exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(dataPath, JSON.stringify({ sessions: [{ id: "one" }] }, null, 2), "utf8");

  const result = await ensureStartupDataBackup({
    dataPath,
    nowFn: () => 1000
  });

  assert.equal(result.created, true);
  const manifestRaw = await readFile(`${dataPath}.pre-h62-backup.json`, "utf8");
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.backupId, STARTUP_BACKUP_ID);
  assert.equal(manifest.createdAt, 1000);
  assert.equal(manifest.sourceExisted, true);

  const backupRaw = await readFile(`${dataPath}.pre-h62-backup`, "utf8");
  const sourceRaw = await readFile(dataPath, "utf8");
  assert.equal(backupRaw, sourceRaw);
});

test("startup data backup creates a manifest without payload copy when no persistence file exists yet", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");

  const result = await ensureStartupDataBackup({
    dataPath,
    nowFn: () => 2000
  });

  assert.equal(result.created, true);
  const manifestRaw = await readFile(`${dataPath}.pre-h62-backup.json`, "utf8");
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.backupId, STARTUP_BACKUP_ID);
  assert.equal(manifest.sourceExisted, false);
  assert.equal(manifest.payloadBackupPath, "");
});

test("startup data backup reuses an existing valid manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(`${dataPath}.pre-h62-backup`, "persisted", "utf8");
  await writeFile(
    `${dataPath}.pre-h62-backup.json`,
    JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: STARTUP_BACKUP_ID,
      createdAt: 1,
      sourcePath: dataPath,
      sourceExisted: true,
      payloadBackupPath: `${dataPath}.pre-h62-backup`
    }, null, 2),
    "utf8"
  );

  const result = await ensureStartupDataBackup({ dataPath });

  assert.equal(result.created, false);
  assert.equal(result.manifest.backupId, STARTUP_BACKUP_ID);
});

test("startup data backup blocks startup when an invalid manifest already exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(`${dataPath}.pre-h62-backup.json`, '{"invalid":true}', "utf8");

  await assert.rejects(
    ensureStartupDataBackup({ dataPath }),
    /invalid or incompatible rollback backup manifest/
  );
});

test("startup data backup blocks startup when payload copy is missing for an existing manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(
    `${dataPath}.pre-h62-backup.json`,
    JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: STARTUP_BACKUP_ID,
      createdAt: 1,
      sourcePath: dataPath,
      sourceExisted: true,
      payloadBackupPath: `${dataPath}.pre-h62-backup`
    }, null, 2),
    "utf8"
  );

  await assert.rejects(
    ensureStartupDataBackup({ dataPath }),
    /rollback payload backup is missing/
  );
});

test("startup data backup blocks startup when an existing manifest points at a different source or payload path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(`${dataPath}.pre-h62-backup`, "persisted", "utf8");
  await writeFile(
    `${dataPath}.pre-h62-backup.json`,
    JSON.stringify({
      format: "ptydeck.startup-backup.v1",
      backupId: STARTUP_BACKUP_ID,
      createdAt: 1,
      sourcePath: `${dataPath}.other`,
      sourceExisted: true,
      payloadBackupPath: `${dataPath}.pre-h62-backup.other`
    }, null, 2),
    "utf8"
  );

  await assert.rejects(
    ensureStartupDataBackup({ dataPath }),
    /invalid or incompatible rollback backup manifest/
  );
});

test("startup data backup blocks startup when the newly written manifest cannot be verified", async () => {
  const dataPath = "/tmp/ptydeck-sessions.json";
  const manifestPath = `${dataPath}.pre-h62-backup.json`;
  const payloadBackupPath = `${dataPath}.pre-h62-backup`;
  const files = new Map();

  await assert.rejects(
    ensureStartupDataBackup({
      dataPath,
      nowFn: () => 5000,
      mkdirFn: async () => {},
      readFileFn: async (path, encoding) => {
        if (!files.has(path)) {
          const error = new Error("missing");
          error.code = "ENOENT";
          throw error;
        }
        return files.get(path);
      },
      writeFileFn: async (path, content, encoding) => {
        if (path === manifestPath) {
          files.set(path, "{\"invalid\":true}");
          return;
        }
        files.set(path, content);
      }
    }),
    /failed to verify rollback backup manifest/
  );

  assert.equal(files.has(payloadBackupPath), false);
});

test("startup data backup restore rewrites the persisted runtime file from the verified payload copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(dataPath, JSON.stringify({ sessions: [{ id: "original" }] }, null, 2), "utf8");
  await ensureStartupDataBackup({ dataPath, nowFn: () => 3000 });
  await writeFile(dataPath, JSON.stringify({ sessions: [{ id: "mutated" }] }, null, 2), "utf8");

  const result = await restoreStartupDataBackup({ dataPath });

  assert.equal(result.restored, true);
  assert.equal(result.removed, false);
  const restoredRaw = await readFile(dataPath, "utf8");
  assert.match(restoredRaw, /"original"/);
  assert.doesNotMatch(restoredRaw, /"mutated"/);
});

test("startup data backup restore removes the runtime file when the original source file did not exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-startup-backup-"));
  const dataPath = join(dir, "sessions.json");
  await ensureStartupDataBackup({ dataPath, nowFn: () => 4000 });
  await writeFile(dataPath, JSON.stringify({ sessions: [{ id: "created-later" }] }, null, 2), "utf8");

  const result = await restoreStartupDataBackup({ dataPath });

  assert.equal(result.restored, true);
  assert.equal(result.removed, true);
  await assert.rejects(readFile(dataPath, "utf8"), /ENOENT/);
});

test("startup data backup restore fails when the restored payload cannot be verified", async () => {
  const payload = Buffer.from("{\"sessions\":[{\"id\":\"original\"}]}", "utf8");
  const dataPath = "/tmp/ptydeck-restore-failure.json";
  const manifestPath = `${dataPath}.pre-h62-backup.json`;
  const payloadBackupPath = `${dataPath}.pre-h62-backup`;
  const files = new Map([
    [
      manifestPath,
      JSON.stringify({
        format: "ptydeck.startup-backup.v1",
        backupId: STARTUP_BACKUP_ID,
        createdAt: 1,
        sourcePath: dataPath,
        sourceExisted: true,
        payloadBackupPath
      }, null, 2)
    ],
    [payloadBackupPath, payload]
  ]);

  await assert.rejects(
    restoreStartupDataBackup({
      dataPath,
      mkdirFn: async () => {},
      readFileFn: async (path, encoding) => {
        if (!files.has(path)) {
          const error = new Error("missing");
          error.code = "ENOENT";
          throw error;
        }
        return files.get(path);
      },
      writeFileFn: async (path, content, encoding) => {
        files.set(path, Buffer.isBuffer(content) ? Buffer.from("mutated") : "mutated");
      }
    }),
    /restored data .* did not verify/
  );
});

test("startup data backup helpers reject an empty data path", async () => {
  await assert.rejects(ensureStartupDataBackup({ dataPath: "" }), /requires a non-empty data path/);
  await assert.rejects(readStartupDataBackup({ dataPath: "" }), /requires a non-empty data path/);
  await assert.rejects(restoreStartupDataBackup({ dataPath: "" }), /requires a non-empty data path/);
});
