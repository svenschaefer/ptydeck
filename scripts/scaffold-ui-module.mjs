#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logScriptStart } from "./lib/script-log.mjs";

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isDirectRun) {
  logScriptStart("scripts/scaffold-ui-module.mjs");
}
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE_DIR = path.join(DEFAULT_REPO_ROOT, "templates", "frontend-ui-module");
const MODULE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const UNRESOLVED_PLACEHOLDER_PATTERN = /__[A-Z0-9_]+__/g;
const USAGE_TEXT =
  "usage: node ./scripts/scaffold-ui-module.mjs <module-name> [--out-dir <dir>] [--test-dir <dir>] [--force]";

function createUsageError(message = USAGE_TEXT) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

export function toPascalCase(value) {
  return String(value)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function parseScaffoldArgs(args, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw createUsageError();
  }

  const moduleName = args[0];
  if (!MODULE_NAME_PATTERN.test(moduleName)) {
    throw createUsageError(`[scaffold-ui-module] invalid module name: ${moduleName}`);
  }

  let outDir = path.join(repoRoot, "frontend", "src", "public", "ui");
  let testDir = path.join(repoRoot, "frontend", "test");
  let force = false;

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--out-dir" || token === "--test-dir") {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw createUsageError();
      }
      if (token === "--out-dir") {
        outDir = path.resolve(nextValue);
      } else {
        testDir = path.resolve(nextValue);
      }
      index += 1;
      continue;
    }
    throw createUsageError();
  }

  return {
    moduleName,
    outDir,
    testDir,
    force
  };
}

export function applyTemplateReplacements(template, replacements) {
  let nextValue = String(template);
  for (const [placeholder, value] of replacements) {
    nextValue = nextValue.split(placeholder).join(value);
  }
  return nextValue;
}

export function renderTemplate(template, replacements, templatePath = "template") {
  const rendered = applyTemplateReplacements(template, replacements);
  const unresolvedPlaceholders = rendered.match(UNRESOLVED_PLACEHOLDER_PATTERN) ?? [];
  if (unresolvedPlaceholders.length) {
    throw new Error(
      `unresolved placeholders in ${templatePath}: ${Array.from(new Set(unresolvedPlaceholders)).join(", ")}`
    );
  }
  return rendered;
}

function assertTargetsWritable(paths, { force = false, repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (force) {
    return;
  }
  const existingPath = paths.find((filePath) => existsSync(filePath));
  if (existingPath) {
    throw new Error(
      `refusing to overwrite existing scaffold target without --force: ${path.relative(repoRoot, existingPath)}`
    );
  }
}

function createReplacementMap(moduleName) {
  const moduleFile = `${moduleName}.js`;
  return new Map([
    ["__FACTORY_NAME__", `create${toPascalCase(moduleName)}`],
    ["__MODULE_FILE__", moduleFile],
    ["__MODULE_BASENAME__", moduleName]
  ]);
}

export async function scaffoldUiModule(args, { repoRoot = DEFAULT_REPO_ROOT, templateDir = DEFAULT_TEMPLATE_DIR } = {}) {
  const config = Array.isArray(args) ? parseScaffoldArgs(args, { repoRoot }) : args;
  const moduleFile = `${config.moduleName}.js`;
  const testFile = `${config.moduleName}.test.js`;
  const controllerPath = path.join(config.outDir, moduleFile);
  const testPath = path.join(config.testDir, testFile);
  const replacements = createReplacementMap(config.moduleName);

  const controllerTemplatePath = path.join(templateDir, "controller.js.tmpl");
  const testTemplatePath = path.join(templateDir, "controller.test.js.tmpl");
  const controllerTemplate = await readFile(controllerTemplatePath, "utf8");
  const testTemplate = await readFile(testTemplatePath, "utf8");

  const controllerContent = renderTemplate(controllerTemplate, replacements, controllerTemplatePath);
  const testContent = renderTemplate(testTemplate, replacements, testTemplatePath);

  await mkdir(config.outDir, { recursive: true });
  await mkdir(config.testDir, { recursive: true });
  assertTargetsWritable([controllerPath, testPath], { force: config.force, repoRoot });

  await writeFile(controllerPath, controllerContent, "utf8");
  await writeFile(testPath, testContent, "utf8");

  return {
    config,
    controllerPath,
    testPath
  };
}

export async function main(
  args = process.argv.slice(2),
  { repoRoot = DEFAULT_REPO_ROOT, templateDir = DEFAULT_TEMPLATE_DIR, stderr = process.stderr } = {}
) {
  try {
    const result = await scaffoldUiModule(args, { repoRoot, templateDir });
    stderr.write(`[scaffold-ui-module] created ${path.relative(repoRoot, result.controllerPath)}\n`);
    stderr.write(`[scaffold-ui-module] created ${path.relative(repoRoot, result.testPath)}\n`);
    return 0;
  } catch (error) {
    if (error?.code === "USAGE") {
      stderr.write(`${error.message}\n`);
      return 1;
    }
    stderr.write(`[scaffold-ui-module] ${error?.message || String(error)}\n`);
    return 1;
  }
}

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2));
}
