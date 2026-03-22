#!/usr/bin/env bash
set -euo pipefail

PURGE_DRY_RUN="${PURGE_DRY_RUN:-1}"
SESSION_BACKUP_DIR="${SESSION_BACKUP_DIR:-./backups/sessions}"
SESSION_BACKUP_RETENTION_DAYS="${SESSION_BACKUP_RETENTION_DAYS:-14}"
BACKEND_LOG_DIR="${BACKEND_LOG_DIR:-./backend/logs}"
BACKEND_LOG_RETENTION_DAYS="${BACKEND_LOG_RETENTION_DAYS:-30}"
SECURITY_ARTIFACT_DIR="${SECURITY_ARTIFACT_DIR:-./artifacts/security}"
SECURITY_ARTIFACT_RETENTION_DAYS="${SECURITY_ARTIFACT_RETENTION_DAYS:-30}"

validate_days() {
  local value="$1"
  local name="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "[retention] ${name} must be a non-negative integer." >&2
    exit 1
  fi
}

validate_days "$SESSION_BACKUP_RETENTION_DAYS" "SESSION_BACKUP_RETENTION_DAYS"
validate_days "$BACKEND_LOG_RETENTION_DAYS" "BACKEND_LOG_RETENTION_DAYS"
validate_days "$SECURITY_ARTIFACT_RETENTION_DAYS" "SECURITY_ARTIFACT_RETENTION_DAYS"

purge_path() {
  local path="$1"
  local days="$2"
  local label="$3"

  if [[ ! -d "$path" ]]; then
    echo "[retention] ${label}: skip (missing path: $path)"
    return
  fi

  mapfile -t candidates < <(find "$path" -type f -mtime "+$days")
  if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "[retention] ${label}: nothing to purge (retention=${days}d)"
    return
  fi

  echo "[retention] ${label}: ${#candidates[@]} file(s) exceed retention=${days}d"

  if [[ "$PURGE_DRY_RUN" == "1" ]]; then
    for file in "${candidates[@]}"; do
      echo "[retention] dry-run keep-delete: $file"
    done
    return
  fi

  for file in "${candidates[@]}"; do
    rm -f "$file"
    echo "[retention] deleted: $file"
  done
}

purge_path "$SESSION_BACKUP_DIR" "$SESSION_BACKUP_RETENTION_DAYS" "session-backups"
purge_path "$BACKEND_LOG_DIR" "$BACKEND_LOG_RETENTION_DAYS" "backend-logs"
purge_path "$SECURITY_ARTIFACT_DIR" "$SECURITY_ARTIFACT_RETENTION_DAYS" "security-artifacts"

echo "[retention] completed (PURGE_DRY_RUN=$PURGE_DRY_RUN)"
