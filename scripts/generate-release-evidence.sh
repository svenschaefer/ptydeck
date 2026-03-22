#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${RELEASE_EVIDENCE_DIR:-artifacts/release-evidence}"
QUALITY_DIR="${QUALITY_EVIDENCE_DIR:-artifacts/quality}"
SECURITY_DIR="${SECURITY_EVIDENCE_DIR:-artifacts/security}"
SBOM_DIR="${SBOM_EVIDENCE_DIR:-artifacts/security/sbom}"
BUNDLE_PREFIX="${RELEASE_EVIDENCE_PREFIX:-release-evidence}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

STAGING_DIR="$OUT_DIR/staging-$TIMESTAMP"
INPUT_DIR="$STAGING_DIR/inputs"
mkdir -p "$INPUT_DIR"
export STAGING_DIR
export TIMESTAMP
export GIT_COMMIT="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
export GIT_REF="${GITHUB_REF:-$(git symbolic-ref --short -q HEAD 2>/dev/null || echo detached)}"

copy_if_exists() {
  local source="$1"
  local target="$2"

  if [[ -f "$source" ]]; then
    mkdir -p "$(dirname "$INPUT_DIR/$target")"
    cp "$source" "$INPUT_DIR/$target"
  fi
}

copy_dir_if_exists() {
  local source_dir="$1"
  local target_dir="$2"

  if [[ -d "$source_dir" ]]; then
    mkdir -p "$INPUT_DIR/$target_dir"
    cp -R "$source_dir"/. "$INPUT_DIR/$target_dir"/
  fi
}

copy_if_exists "$QUALITY_DIR/backend-test.log" "quality/backend-test.log"
copy_if_exists "$QUALITY_DIR/frontend-test.log" "quality/frontend-test.log"
copy_if_exists "$QUALITY_DIR/coverage-check.log" "quality/coverage-check.log"
copy_if_exists "$SECURITY_DIR/sca.log" "security/sca.log"
copy_if_exists "$SECURITY_DIR/sbom.log" "security/sbom.log"
copy_if_exists "$SECURITY_DIR/backup-verify.log" "security/backup-verify.log"
copy_if_exists "$SECURITY_DIR/retention-purge.log" "security/retention-purge.log"
copy_dir_if_exists "$SBOM_DIR" "security/sbom"

CHECKSUM_FILE="$STAGING_DIR/checksums.sha256"
if find "$INPUT_DIR" -type f | read -r _; then
  (
    cd "$STAGING_DIR"
    find inputs -type f -print0 | sort -z | xargs -0 sha256sum >"checksums.sha256"
  )
else
  : >"$CHECKSUM_FILE"
fi

MANIFEST_FILE="$STAGING_DIR/manifest.json"
node <<'NODE' >"$MANIFEST_FILE"
const fs = require('node:fs');
const path = require('node:path');

const stagingDir = process.env.STAGING_DIR;
const inputDir = path.join(stagingDir, 'inputs');
const checksumPath = path.join(stagingDir, 'checksums.sha256');

const runTimestamp = process.env.TIMESTAMP;
const commitSha = process.env.GITHUB_SHA || process.env.GIT_COMMIT || null;
const gitRef = process.env.GITHUB_REF || process.env.GIT_REF || null;
const runId = process.env.GITHUB_RUN_ID || null;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || null;
const workflow = process.env.GITHUB_WORKFLOW || null;

const checksumLines = fs
  .readFileSync(checksumPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const firstSpace = line.indexOf(' ');
    const hash = line.slice(0, firstSpace);
    const file = line.slice(firstSpace).trim().replace(/^\*?/, '');
    return { file, sha256: hash };
  });

const files = [];
if (fs.existsSync(inputDir)) {
  const stack = [inputDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      const relativePath = path.relative(stagingDir, absolutePath).replace(/\\/g, '/');
      files.push(relativePath);
    }
  }
}

files.sort();

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runTimestamp,
  provenance: {
    commitSha,
    gitRef,
    workflow,
    runId,
    runAttempt
  },
  fileCount: files.length,
  files,
  checksums: checksumLines
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
NODE

BUNDLE_FILE="$OUT_DIR/${BUNDLE_PREFIX}-${TIMESTAMP}.tar.gz"
mkdir -p "$OUT_DIR"
tar -czf "$BUNDLE_FILE" -C "$STAGING_DIR" manifest.json checksums.sha256 inputs

echo "[release-evidence] manifest: $MANIFEST_FILE"
echo "[release-evidence] bundle: $BUNDLE_FILE"
