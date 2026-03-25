#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/check-script-logging.sh"

missing=0

check_shell_script() {
  local file="$1"
  local rel="scripts/$(basename "$file")"
  if ! head -n 12 "$file" | grep -Fq "ptydeck_log_script_start \"${rel}\""; then
    echo "[script-log-check] missing startup log call in ${rel}" >&2
    missing=1
  fi
}

check_node_script() {
  local file="$1"
  local rel="scripts/$(basename "$file")"
  if ! head -n 12 "$file" | grep -Fq "logScriptStart(\"${rel}\")"; then
    echo "[script-log-check] missing startup log call in ${rel}" >&2
    missing=1
  fi
}

while IFS= read -r -d '' file; do
  case "$file" in
    *.sh)
      check_shell_script "$file"
      ;;
    *.mjs)
      check_node_script "$file"
      ;;
  esac
done < <(find "$SCRIPT_DIR" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.mjs' \) -print0 | sort -z)

if (( missing > 0 )); then
  exit 1
fi

echo "[script-log-check] all top-level scripts declare a startup log line."
