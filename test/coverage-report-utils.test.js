const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, relativePath)).href);
}

class CaptureStream extends Writable {
  constructor() {
    super();
    this.buffer = "";
  }

  _write(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    callback();
  }
}

test("collectWorkspaceCoverageTestFiles keeps backend integration/request-seam tests in coverage selection", async () => {
  const { collectWorkspaceCoverageTestFiles } = await loadModule("scripts/lib/coverage-report.mjs");
  const files = await collectWorkspaceCoverageTestFiles(path.join(repoRoot, "backend"), {
    excludedTestNames: new Set(["nonfunctional.load.test.js"])
  });

  assert.ok(files.includes("test/runtime.integration.test.js"));
  assert.ok(files.includes("test/runtime.request-seams.test.js"));
  assert.ok(files.includes("test/ws.integration.test.js"));
  assert.ok(files.includes("test/contract-conformance.test.js"));
  assert.ok(!files.includes("test/nonfunctional.load.test.js"));
});

test("normalizeCoverageReport collapses duplicate file rows into one deterministic entry", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-"));
  fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "src", "sample.js"), "a\nb\nc\nd\ne\n", "utf8");
  fs.writeFileSync(path.join(tempRoot, "src", "other.js"), "a\nb\nc\n", "utf8");

  const { normalizeCoverageReport } = await loadModule("scripts/lib/coverage-report.mjs");
  const input = [
    "prelude line",
    "# start of coverage report",
    "# file | line % | branch % | funcs % | uncovered lines",
    "# src/other.js | 66.67 | 50.00 | 100.00 | 3",
    "# src/sample.js | 80.00 | 70.00 | 90.00 | 1",
    "# src/sample.js | 40.00 | 60.00 | 50.00 | 2, 5",
    "# all files | 62.50 | 60.00 | 80.00 |",
    "# end of coverage report",
    "epilogue line"
  ].join("\n");

  const normalized = normalizeCoverageReport(input, { rootDir: tempRoot });
  const sampleMatches = normalized.text.match(/# src\/sample\.js \|/g) ?? [];
  assert.equal(sampleMatches.length, 1);
  assert.deepEqual(normalized.duplicateFiles, ["src/sample.js"]);
  assert.match(normalized.text, /# src\/sample\.js \| 40\.00 \| 60\.00 \| 50\.00 \| 1, 2, 5/);
  assert.match(normalized.text, /# all files \| 50\.00 \|/);
});

test("normalizeCoverageReport filters incidental non-owned files and reports them explicitly", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-filter-"));
  fs.mkdirSync(path.join(tempRoot, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "test"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "frontend", "src", "public"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "scripts", "lib", "helper.mjs"), "a\nb\nc\nd\n", "utf8");
  fs.writeFileSync(path.join(tempRoot, "test", "sample.test.js"), "a\nb\nc\n", "utf8");
  fs.writeFileSync(path.join(tempRoot, "frontend", "src", "public", "foreign.mjs"), "a\nb\n", "utf8");

  const { normalizeCoverageReport } = await loadModule("scripts/lib/coverage-report.mjs");
  const input = [
    "# start of coverage report",
    "# file | line % | branch % | funcs % | uncovered lines",
    "# scripts/lib/helper.mjs | 75.00 | 50.00 | 100.00 | 4",
    "# test/sample.test.js | 100.00 | 100.00 | 100.00 |",
    "# frontend/src/public/foreign.mjs | 50.00 | 0.00 | 0.00 | 2",
    "# all files | 80.00 | 60.00 | 80.00 |",
    "# end of coverage report"
  ].join("\n");

  const normalized = normalizeCoverageReport(input, {
    rootDir: tempRoot,
    includeSourcePrefixes: ["scripts/", "test/"]
  });

  assert.deepEqual(normalized.omittedFiles, ["frontend/src/public/foreign.mjs"]);
  assert.doesNotMatch(normalized.text, /^# frontend\/src\/public\/foreign\.mjs \|/m);
  assert.match(normalized.text, /^# scripts\/lib\/helper\.mjs \| 75\.00 \| 50\.00 \| 100\.00 \| 4$/m);
  assert.match(normalized.text, /^# test\/sample\.test\.js \| 100\.00 \| 100\.00 \| 100\.00 \| ?$/m);
  assert.match(normalized.text, /^# all files \| 85\.71 \| 71\.43 \| 100\.00 \|$/m);
});

test("normalizeCoverageReport leaves non-coverage output untouched when report markers are missing", async () => {
  const { normalizeCoverageReport } = await loadModule("scripts/lib/coverage-report.mjs");
  const input = "plain output without coverage markers\n";
  const normalized = normalizeCoverageReport(input, { rootDir: repoRoot });

  assert.equal(normalized.text, input);
  assert.deepEqual(normalized.duplicateFiles, []);
  assert.deepEqual(normalized.omittedFiles, []);
  assert.equal(normalized.normalizedFileCount, 0);
});

test("normalizeCoverageReport honors exclude prefixes and falls back to weighted file percentages without line counts", async () => {
  const { normalizeCoverageReport } = await loadModule("scripts/lib/coverage-report.mjs");
  const input = [
    "# start of coverage report",
    "# file | line % | branch % | funcs % | uncovered lines",
    "# scripts/lib/helper.mjs | 75.00 | 50.00 | 100.00 | 4",
    "# test/sample.test.js | 100.00 | 100.00 | 100.00 |",
    "# all files | 80.00 | 60.00 | 80.00 |",
    "# end of coverage report"
  ].join("\n");

  const normalized = normalizeCoverageReport(input, {
    includeSourcePrefixes: ["scripts/", "test/"],
    excludeSourcePrefixes: ["test/"]
  });

  assert.deepEqual(normalized.omittedFiles, ["test/sample.test.js"]);
  assert.match(normalized.text, /^# scripts\/lib\/helper\.mjs \| 75\.00 \| 50\.00 \| 100\.00 \| 4$/m);
  assert.match(normalized.text, /^# all files \| 75\.00 \| 50\.00 \| 100\.00 \|$/m);
});

test("runWorkspaceCoverage returns an error when no test files are selected", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-empty-"));
  fs.mkdirSync(path.join(tempRoot, "test"), { recursive: true });

  const { runWorkspaceCoverage } = await loadModule("scripts/lib/coverage-report.mjs");
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const exitCode = await runWorkspaceCoverage({
    rootDir: tempRoot,
    stdout,
    stderr
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.buffer, "");
  assert.match(stderr.buffer, /\[coverage\] no test files selected\./);
});

test("runWorkspaceCoverage lists selected test files without running coverage when listOnly is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-list-"));
  fs.mkdirSync(path.join(tempRoot, "test"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "test", "alpha.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempRoot, "test", "beta.test.js"), "", "utf8");

  const { runWorkspaceCoverage } = await loadModule("scripts/lib/coverage-report.mjs");
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const exitCode = await runWorkspaceCoverage({
    rootDir: tempRoot,
    excludedTestNames: new Set(["beta.test.js"]),
    listOnly: true,
    stdout,
    stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.buffer.trim(), "test/alpha.test.js");
  assert.equal(stderr.buffer, "");
});

test("runWorkspaceCoverage returns an error when no covered source files match the configured prefixes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-miss-"));
  fs.mkdirSync(path.join(tempRoot, "test"), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "test", "sample.test.js"),
    [
      "const test = require('node:test');",
      "test('passes', () => {});"
    ].join("\n"),
    "utf8"
  );

  const { runWorkspaceCoverage } = await loadModule("scripts/lib/coverage-report.mjs");
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const exitCode = await runWorkspaceCoverage({
    rootDir: tempRoot,
    includeSourcePrefixes: ["scripts/"],
    stdout,
    stderr
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.buffer, "");
  assert.match(stderr.buffer, /\[coverage\] no source files matched configured roots\./);
});

test("runWorkspaceCoverage limits the root lane to owned files and reports omitted imports", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ptydeck-coverage-run-"));
  fs.mkdirSync(path.join(tempRoot, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "test"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "frontend", "src", "public"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "scripts", "lib", "helper.mjs"), "export function double(value) {\n  return value * 2;\n}\n", "utf8");
  fs.writeFileSync(
    path.join(tempRoot, "frontend", "src", "public", "foreign.mjs"),
    "export function offset(value) {\n  return value + 1;\n}\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempRoot, "test", "sample.test.js"),
    [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "",
      "test('owned root coverage lane ignores incidental frontend imports', async () => {",
      "  const { double } = await import('../scripts/lib/helper.mjs');",
      "  const { offset } = await import('../frontend/src/public/foreign.mjs');",
      "  assert.equal(double(2), 4);",
      "  assert.equal(offset(2), 3);",
      "});"
    ].join("\n"),
    "utf8"
  );

  const { runWorkspaceCoverage } = await loadModule("scripts/lib/coverage-report.mjs");
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const exitCode = await runWorkspaceCoverage({
    rootDir: tempRoot,
    includeSourcePrefixes: ["scripts/", "test/"],
    stdout,
    stderr
  });

  assert.equal(
    exitCode,
    0,
    `Expected runWorkspaceCoverage to succeed.\nSTDOUT:\n${stdout.buffer}\nSTDERR:\n${stderr.buffer}`
  );
  assert.equal(stderr.buffer, "");
  assert.match(stdout.buffer, /^# test\/sample\.test\.js \|/m);
  assert.match(stdout.buffer, /^# scripts\/lib\/helper\.mjs \|/m);
  assert.doesNotMatch(stdout.buffer, /^# frontend\/src\/public\/foreign\.mjs \|/m);
  assert.match(
    stdout.buffer,
    /\[coverage\] omitted files outside configured roots: frontend\/src\/public\/foreign\.mjs\./
  );
});
