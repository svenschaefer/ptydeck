#!/usr/bin/env node

import { resolve } from "node:path";

import { loadConfig } from "../backend/src/config.js";
import { logScriptStart } from "./lib/script-log.mjs";
import {
  STARTUP_BACKUP_ID,
  restoreStartupDataBackup
} from "../backend/src/startup-backup.js";

logScriptStart("scripts/restore-h62-rollbacks.mjs");

function readArgValue(argv, name) {
  const index = argv.findIndex((entry) => entry === name);
  if (index === -1) {
    return "";
  }
  return String(argv[index + 1] || "").trim();
}

async function main() {
  const dataPathArg = readArgValue(process.argv.slice(2), "--data-path");
  const config = loadConfig(process.env);
  const dataPath = resolve(dataPathArg || config.dataPath);
  const result = await restoreStartupDataBackup({ dataPath });
  const outcome = result.removed
    ? `removed current runtime data file at ${dataPath} because the pre-H62 source file did not exist`
    : `restored runtime data file at ${dataPath} from ${result.payloadBackupPath}`;

  process.stdout.write(
    [
      `Restored backend rollback backup '${STARTUP_BACKUP_ID}'.`,
      `Manifest: ${result.manifestPath}`,
      `Result: ${outcome}`,
      "Next step: while this feature branch frontend is still available, open /rollback-restore.html in the same browser profile and run the browser-state restore before switching back to main."
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  const message = error instanceof Error && error.message ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
