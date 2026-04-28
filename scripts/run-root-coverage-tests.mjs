import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkspaceCoverage } from "./lib/coverage-report.mjs";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/run-root-coverage-tests.mjs");

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const listOnly = process.argv.includes("--list-tests");

const exitCode = await runWorkspaceCoverage({
  rootDir,
  includeSourcePrefixes: ["scripts/", "test/"],
  listOnly
});

process.exitCode = exitCode;
