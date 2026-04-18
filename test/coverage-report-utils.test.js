const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, relativePath)).href);
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
