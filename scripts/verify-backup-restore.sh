#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SOURCE_FILE="$TMP_DIR/sessions-source.json"
RESTORED_FILE="$TMP_DIR/sessions-restored.json"
BACKUP_DIR="$TMP_DIR/backups"

cat > "$SOURCE_FILE" <<'JSON'
[
  {
    "id": "session-a",
    "cwd": "/home/wsl",
    "shell": "bash",
    "name": "main",
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000
  }
]
JSON

DATA_PATH="$SOURCE_FILE" BACKUP_DIR="$BACKUP_DIR" ./scripts/backup-sessions.sh >/dev/null

BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/*.json.gz | head -n 1)"
TARGET_DATA_PATH="$RESTORED_FILE" BACKUP_FILE="$BACKUP_FILE" ./scripts/restore-sessions.sh >/dev/null

if ! cmp -s "$SOURCE_FILE" "$RESTORED_FILE"; then
  echo "[backup-verify] restored file mismatch." >&2
  exit 1
fi

echo "[backup-verify] backup/restore roundtrip verified."
