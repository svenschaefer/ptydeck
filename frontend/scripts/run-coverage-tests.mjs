import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkspaceCoverage } from "../../scripts/lib/coverage-report.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const listOnly = process.argv.includes("--list-tests");
const nodeTestArgs = process.argv.filter((arg) => arg.startsWith("--test-"));
const exitCode = await runWorkspaceCoverage({ rootDir, listOnly, nodeTestArgs });
process.exitCode = exitCode;
