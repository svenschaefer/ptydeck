#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/restore-sessions.sh"

TARGET_DATA_PATH="${TARGET_DATA_PATH:-./backend/data/sessions.json}"
BACKUP_DIR="${BACKUP_DIR:-./backups/sessions}"
BACKUP_FILE="${BACKUP_FILE:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/*.json.gz 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "[restore] backup file not found." >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET_DATA_PATH")"
gunzip -c "$BACKUP_FILE" > "$TARGET_DATA_PATH"

echo "[restore] restored $BACKUP_FILE -> $TARGET_DATA_PATH"
