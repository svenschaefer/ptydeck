#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${SBOM_OUTPUT_DIR:-artifacts/security/sbom}"
mkdir -p "$OUT_DIR"

if npm sbom --help >/dev/null 2>&1; then
  echo "[sbom] generating root SBOM (SPDX via npm sbom)"
  npm sbom --json >"$OUT_DIR/root.spdx.json"

  echo "[sbom] generating backend SBOM (SPDX via npm sbom)"
  npm --prefix backend sbom --json >"$OUT_DIR/backend.spdx.json"

  echo "[sbom] generating frontend SBOM (SPDX via npm sbom)"
  npm --prefix frontend sbom --json >"$OUT_DIR/frontend.spdx.json"

  echo "[sbom] generated SBOM files in $OUT_DIR"
  exit 0
fi

echo "[sbom] npm sbom unavailable, falling back to CycloneDX generator."

echo "[sbom] generating root SBOM (CycloneDX)"
npx --yes @cyclonedx/cyclonedx-npm@2.1.0 --package-lock-only --output-format JSON --output-file "$OUT_DIR/root.cdx.json" package.json

echo "[sbom] generating backend SBOM (CycloneDX)"
npx --yes @cyclonedx/cyclonedx-npm@2.1.0 --package-lock-only --workspace backend --output-format JSON --output-file "$OUT_DIR/backend.cdx.json" package.json

echo "[sbom] generating frontend SBOM (CycloneDX)"
npx --yes @cyclonedx/cyclonedx-npm@2.1.0 --package-lock-only --workspace frontend --output-format JSON --output-file "$OUT_DIR/frontend.cdx.json" package.json

echo "[sbom] generated SBOM files in $OUT_DIR"
