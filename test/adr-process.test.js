const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, cp, mkdir, readFile, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

async function createAdrFixtureRoot() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ptydeck-adr-"));
  const adrRoot = path.join(tempRoot, "docs", "adr");
  await mkdir(adrRoot, { recursive: true });
  await cp(path.join(repoRoot, "docs", "adr", "README.md"), path.join(adrRoot, "README.md"));
  await cp(path.join(repoRoot, "docs", "adr", "0000-template.md"), path.join(adrRoot, "0000-template.md"));
  return { tempRoot, adrRoot };
}

test("new-adr script creates the next numbered ADR from the template", async () => {
  const { adrRoot } = await createAdrFixtureRoot();
  const { stdout } = await execFileAsync("bash", [path.join(repoRoot, "scripts", "new-adr.sh"), "Keep local validation authoritative"], {
    cwd: repoRoot,
    env: { ...process.env, PTYDECK_ADR_ROOT: adrRoot }
  });

  assert.match(stdout, /0001-keep-local-validation-authoritative\.md/);
  const createdPath = path.join(adrRoot, "0001-keep-local-validation-authoritative.md");
  const content = await readFile(createdPath, "utf8");
  assert.match(content, /^# ADR-0001: Keep local validation authoritative/m);
  assert.match(content, /^- Status: Proposed$/m);
  assert.match(content, /^- Date: \d{4}-\d{2}-\d{2}$/m);
});

test("ADR process checker passes for valid ADR files and fails for malformed ones", async () => {
  const { adrRoot } = await createAdrFixtureRoot();
  await execFileAsync("bash", [path.join(repoRoot, "scripts", "new-adr.sh"), "Document shell adapter decisions"], {
    cwd: repoRoot,
    env: { ...process.env, PTYDECK_ADR_ROOT: adrRoot }
  });

  await execFileAsync("bash", [path.join(repoRoot, "scripts", "check-adr-process.sh")], {
    cwd: repoRoot,
    env: { ...process.env, PTYDECK_ADR_ROOT: adrRoot }
  });

  await writeFile(path.join(adrRoot, "0002-bad.md"), "# bad\n", "utf8");
  await assert.rejects(
    execFileAsync("bash", [path.join(repoRoot, "scripts", "check-adr-process.sh")], {
      cwd: repoRoot,
      env: { ...process.env, PTYDECK_ADR_ROOT: adrRoot }
    })
  );
});
