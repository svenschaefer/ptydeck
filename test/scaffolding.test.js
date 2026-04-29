const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { mkdtemp, readFile, access, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, relativePath)).href);
}

test("scaffold-ui-module script creates controller and test files with resolved placeholders", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ptydeck-ui-scaffold-"));
  const outDir = path.join(tempRoot, "frontend", "src", "public", "ui");
  const testDir = path.join(tempRoot, "frontend", "test");
  const packageJsonPath = path.join(tempRoot, "package.json");

  await require("node:fs/promises").writeFile(packageJsonPath, JSON.stringify({ type: "module" }), "utf8");

  await execFileAsync("node", [path.join(repoRoot, "scripts", "scaffold-ui-module.mjs"), "example-widget-controller", "--out-dir", outDir, "--test-dir", testDir], {
    cwd: repoRoot,
    env: process.env
  });

  const controllerPath = path.join(outDir, "example-widget-controller.js");
  const testPath = path.join(testDir, "example-widget-controller.test.js");
  const controllerContent = await readFile(controllerPath, "utf8");
  const testContent = await readFile(testPath, "utf8");

  assert.match(controllerContent, /export function createExampleWidgetController/);
  assert.match(testContent, /createExampleWidgetController/);
  assert.doesNotMatch(controllerContent, /__FACTORY_NAME__/);
  assert.doesNotMatch(testContent, /__MODULE_FILE__/);

  await execFileAsync("node", ["--check", controllerPath], { cwd: tempRoot, env: process.env });
  await execFileAsync("node", ["--check", testPath], { cwd: tempRoot, env: process.env });
});

test("template inventory contains backend endpoint and frontend UI module baselines", async () => {
  const requiredPaths = [
    path.join(repoRoot, "templates", "README.md"),
    path.join(repoRoot, "templates", "backend-endpoint", "README.md"),
    path.join(repoRoot, "templates", "backend-endpoint", "openapi-path.fragment.yaml.tmpl"),
    path.join(repoRoot, "templates", "backend-endpoint", "runtime-route.snippet.js.tmpl"),
    path.join(repoRoot, "templates", "backend-endpoint", "runtime-handler.snippet.js.tmpl"),
    path.join(repoRoot, "templates", "backend-endpoint", "validation.request-response.snippet.js.tmpl"),
    path.join(repoRoot, "templates", "backend-endpoint", "runtime.integration.test.js.tmpl"),
    path.join(repoRoot, "templates", "frontend-ui-module", "README.md"),
    path.join(repoRoot, "templates", "frontend-ui-module", "controller.js.tmpl"),
    path.join(repoRoot, "templates", "frontend-ui-module", "controller.test.js.tmpl")
  ];

  for (const requiredPath of requiredPaths) {
    await access(requiredPath);
  }

  const backendReadme = await readFile(path.join(repoRoot, "templates", "backend-endpoint", "README.md"), "utf8");
  const frontendReadme = await readFile(path.join(repoRoot, "templates", "frontend-ui-module", "README.md"), "utf8");
  assert.match(backendReadme, /backend\/src\/runtime\.js/);
  assert.match(frontendReadme, /create.*Controller\(\)/);
});

test("scaffold-ui-module refuses to overwrite existing targets unless --force is supplied", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ptydeck-ui-scaffold-force-"));
  const outDir = path.join(tempRoot, "frontend", "src", "public", "ui");
  const testDir = path.join(tempRoot, "frontend", "test");

  await execFileAsync(
    "node",
    [path.join(repoRoot, "scripts", "scaffold-ui-module.mjs"), "example-widget-controller", "--out-dir", outDir, "--test-dir", testDir],
    { cwd: repoRoot, env: process.env }
  );

  const controllerPath = path.join(outDir, "example-widget-controller.js");
  await writeFile(controllerPath, "// sentinel overwrite guard\n", "utf8");

  await assert.rejects(
    execFileAsync(
      "node",
      [path.join(repoRoot, "scripts", "scaffold-ui-module.mjs"), "example-widget-controller", "--out-dir", outDir, "--test-dir", testDir],
      { cwd: repoRoot, env: process.env }
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /refusing to overwrite existing scaffold target without --force/);
      return true;
    }
  );

  assert.equal(await readFile(controllerPath, "utf8"), "// sentinel overwrite guard\n");

  await execFileAsync(
    "node",
    [
      path.join(repoRoot, "scripts", "scaffold-ui-module.mjs"),
      "example-widget-controller",
      "--out-dir",
      outDir,
      "--test-dir",
      testDir,
      "--force"
    ],
    { cwd: repoRoot, env: process.env }
  );

  const controllerContent = await readFile(controllerPath, "utf8");
  assert.match(controllerContent, /export function createExampleWidgetController/);
  assert.doesNotMatch(controllerContent, /sentinel overwrite guard/);
});

test("scaffoldUiModule fails closed when a template leaves unresolved placeholders behind", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ptydeck-ui-scaffold-template-"));
  const templateDir = path.join(tempRoot, "templates", "frontend-ui-module");
  const outDir = path.join(tempRoot, "frontend", "src", "public", "ui");
  const testDir = path.join(tempRoot, "frontend", "test");

  fs.mkdirSync(templateDir, { recursive: true });
  await writeFile(
    path.join(templateDir, "controller.js.tmpl"),
    "export const broken = '__UNKNOWN_PLACEHOLDER__';\n",
    "utf8"
  );
  await writeFile(
    path.join(templateDir, "controller.test.js.tmpl"),
    "export const ok = '__MODULE_BASENAME__';\n",
    "utf8"
  );

  const { scaffoldUiModule, main } = await loadModule("scripts/scaffold-ui-module.mjs");
  await assert.rejects(
    scaffoldUiModule(
      ["example-widget-controller", "--out-dir", outDir, "--test-dir", testDir],
      { repoRoot: tempRoot, templateDir }
    ),
    /unresolved placeholders/
  );

  let stderr = "";
  const exitCode = await main(["example-widget-controller", "--out-dir", outDir, "--test-dir", testDir], {
    repoRoot: tempRoot,
    templateDir,
    stderr: {
      write(chunk) {
        stderr += String(chunk);
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /\[scaffold-ui-module] unresolved placeholders/);
});

test("scaffold-ui-module reports usage failures for missing or malformed arguments", async () => {
  const { main } = await loadModule("scripts/scaffold-ui-module.mjs");
  let stderr = "";
  let exitCode = await main([], {
    stderr: {
      write(chunk) {
        stderr += String(chunk);
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /usage: node \.\/scripts\/scaffold-ui-module\.mjs/);

  stderr = "";
  exitCode = await main(["bad/name"], {
    stderr: {
      write(chunk) {
        stderr += String(chunk);
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /\[scaffold-ui-module] invalid module name:/);
});
