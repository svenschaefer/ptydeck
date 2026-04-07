import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_BACKUP_ID = "pre-h62-multi-device-control-foundation";
const MANIFEST_FORMAT = "ptydeck.startup-backup.v1";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildManifestPath(dataPath) {
  return `${dataPath}.pre-h62-backup.json`;
}

function buildPayloadBackupPath(dataPath) {
  return `${dataPath}.pre-h62-backup`;
}

function parseManifest(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if (normalizeText(parsed.format) !== MANIFEST_FORMAT) {
      return null;
    }
    if (!normalizeText(parsed.backupId)) {
      return null;
    }
    if (!Number.isInteger(parsed.createdAt)) {
      return null;
    }
    if (parsed.sourceExisted !== true && parsed.sourceExisted !== false) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function ensureStartupDataBackup(options = {}) {
  const dataPath = normalizeText(options.dataPath);
  if (!dataPath) {
    throw new Error("Startup backup requires a non-empty data path.");
  }

  const backupId = normalizeText(options.backupId) || DEFAULT_BACKUP_ID;
  const mkdirFn = typeof options.mkdirFn === "function" ? options.mkdirFn : mkdir;
  const readFileFn = typeof options.readFileFn === "function" ? options.readFileFn : readFile;
  const writeFileFn = typeof options.writeFileFn === "function" ? options.writeFileFn : writeFile;
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;

  const manifestPath = buildManifestPath(dataPath);
  const payloadBackupPath = buildPayloadBackupPath(dataPath);

  let manifestRaw = null;
  try {
    manifestRaw = await readFileFn(manifestPath, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (manifestRaw !== null) {
    const manifest = parseManifest(manifestRaw);
    if (!manifest || manifest.backupId !== backupId) {
      throw new Error(
        `Startup blocked: an invalid or incompatible rollback backup manifest already exists at ${manifestPath}.`
      );
    }
    if (manifest.sourceExisted === true) {
      try {
        await readFileFn(payloadBackupPath);
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
          throw new Error(
            `Startup blocked: rollback payload backup is missing at ${payloadBackupPath}.`
          );
        }
        throw error;
      }
    }
    return { created: false, manifestPath, payloadBackupPath, manifest };
  }

  await mkdirFn(dirname(dataPath), { recursive: true });

  let sourceBuffer = null;
  let sourceExisted = true;
  try {
    sourceBuffer = await readFileFn(dataPath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      sourceExisted = false;
    } else {
      throw error;
    }
  }

  if (sourceExisted) {
    await writeFileFn(payloadBackupPath, sourceBuffer);
  }

  const manifest = {
    format: MANIFEST_FORMAT,
    backupId,
    createdAt: Number(nowFn()),
    sourcePath: dataPath,
    sourceExisted,
    payloadBackupPath: sourceExisted ? payloadBackupPath : ""
  };

  await writeFileFn(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const verifiedManifestRaw = await readFileFn(manifestPath, "utf8");
  const verifiedManifest = parseManifest(verifiedManifestRaw);
  if (!verifiedManifest || verifiedManifest.backupId !== backupId) {
    throw new Error(`Startup blocked: failed to verify rollback backup manifest at ${manifestPath}.`);
  }
  if (sourceExisted) {
    await readFileFn(payloadBackupPath);
  }

  return { created: true, manifestPath, payloadBackupPath, manifest: verifiedManifest };
}

export const STARTUP_BACKUP_ID = DEFAULT_BACKUP_ID;
export const STARTUP_BACKUP_MANIFEST_FORMAT = MANIFEST_FORMAT;
