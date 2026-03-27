#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/scaffold-ui-module.mjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const templateDir = path.join(repoRoot, "templates", "frontend-ui-module");

function usage() {
  console.error("usage: node ./scripts/scaffold-ui-module.mjs <module-name> [--out-dir <dir>] [--test-dir <dir>]");
  process.exit(1);
}

function toPascalCase(value) {
  return String(value)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
}

const moduleName = args[0];
if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(moduleName)) {
  console.error(`[scaffold-ui-module] invalid module name: ${moduleName}`);
  process.exit(1);
}

let outDir = path.join(repoRoot, "frontend", "src", "public", "ui");
let testDir = path.join(repoRoot, "frontend", "test");
for (let index = 1; index < args.length; index += 1) {
  const token = args[index];
  if (token === "--out-dir") {
    outDir = path.resolve(args[index + 1] || "");
    index += 1;
    continue;
  }
  if (token === "--test-dir") {
    testDir = path.resolve(args[index + 1] || "");
    index += 1;
    continue;
  }
  usage();
}

const moduleFile = `${moduleName}.js`;
const testFile = `${moduleName}.test.js`;
const factoryName = `create${toPascalCase(moduleName)}`;

const controllerTemplate = await readFile(path.join(templateDir, "controller.js.tmpl"), "utf8");
const testTemplate = await readFile(path.join(templateDir, "controller.test.js.tmpl"), "utf8");

const replacements = new Map([
  ["__FACTORY_NAME__", factoryName],
  ["__MODULE_FILE__", moduleFile],
  ["__MODULE_BASENAME__", moduleName]
]);

function applyReplacements(template) {
  let nextValue = template;
  for (const [placeholder, value] of replacements) {
    nextValue = nextValue.split(placeholder).join(value);
  }
  return nextValue;
}

const controllerContent = applyReplacements(controllerTemplate);
const testContent = applyReplacements(testTemplate);

await mkdir(outDir, { recursive: true });
await mkdir(testDir, { recursive: true });
const controllerPath = path.join(outDir, moduleFile);
const testPath = path.join(testDir, testFile);

await writeFile(controllerPath, controllerContent, "utf8");
await writeFile(testPath, testContent, "utf8");

console.error(`[scaffold-ui-module] created ${path.relative(repoRoot, controllerPath)}`);
console.error(`[scaffold-ui-module] created ${path.relative(repoRoot, testPath)}`);
