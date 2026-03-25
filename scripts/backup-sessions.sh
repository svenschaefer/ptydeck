#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/backup-sessions.sh"

DATA_PATH="${DATA_PATH:-./backend/data/sessions.json}"
BACKUP_DIR="${BACKUP_DIR:-./backups/sessions}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$DATA_PATH" ]]; then
  echo "[backup] source file not found: $DATA_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
OUTPUT_FILE="$BACKUP_DIR/sessions-${TIMESTAMP}.json.gz"

gzip -c "$DATA_PATH" > "$OUTPUT_FILE"

echo "[backup] created: $OUTPUT_FILE"
