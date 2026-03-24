import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";

function loadLocalEnvFiles() {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const envFiles = [resolve(moduleDir, "../.env"), resolve(moduleDir, "../.env.local")];
  for (const filePath of envFiles) {
    let raw = "";
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const separator = line.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const key = line.slice(0, separator).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  }
}

loadLocalEnvFiles();

const config = loadConfig();
const runtime = createRuntime(config);

function shutdown() {
  runtime
    .stop()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("shutdown failed", err);
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runtime
  .start()
  .then(() => {
    if (config.debugLogs) {
      console.log("backend debug logs enabled (BACKEND_DEBUG_LOGS=1)");
    }
    console.log(`backend listening on :${runtime.getAddress()?.port ?? config.port}`);
  })
  .catch((err) => {
    console.error("startup failed", err);
    process.exit(1);
  });
