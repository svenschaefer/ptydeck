import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testDir = join(rootDir, "test");
const excluded = new Set([
  "contract-conformance.test.js",
  "nonfunctional.load.test.js",
  "runtime.integration.test.js",
  "ws.integration.test.js"
]);

const entries = await readdir(testDir, { withFileTypes: true });
const testFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js") && !excluded.has(entry.name))
  .map((entry) => join("test", entry.name))
  .sort((a, b) => a.localeCompare(b, "en-US"));

if (!testFiles.length) {
  console.error("[backend coverage] no test files selected.");
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", "--experimental-test-coverage", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
