#!/usr/bin/env bash
set -euo pipefail

SCA_AUDIT_LEVEL="${SCA_AUDIT_LEVEL:-high}"

case "$SCA_AUDIT_LEVEL" in
  low|moderate|high|critical)
    ;;
  *)
    echo "[security-scan] invalid SCA_AUDIT_LEVEL: ${SCA_AUDIT_LEVEL} (allowed: low|moderate|high|critical)" >&2
    exit 1
    ;;
esac

echo "[security-scan] running npm audit for workspaces (level=${SCA_AUDIT_LEVEL})"
npm audit --workspaces --include-workspace-root=false --audit-level="${SCA_AUDIT_LEVEL}" --omit=optional

echo "[security-scan] dependency vulnerability gate passed"
