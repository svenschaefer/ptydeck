#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/check-coverage.sh"

BACKEND_MIN_LINES="${BACKEND_MIN_LINES:-90}"
FRONTEND_MIN_LINES="${FRONTEND_MIN_LINES:-85}"

run_and_check() {
  local label="$1"
  local threshold="$2"
  local command="$3"
  local output_file
  output_file="$(mktemp)"

  set +e
  bash -lc "${command}" | tee "${output_file}"
  local cmd_status=${PIPESTATUS[0]}
  set -e

  if [[ ${cmd_status} -ne 0 ]]; then
    echo "[coverage-check] ${label}: coverage command failed." >&2
    rm -f "${output_file}"
    exit "${cmd_status}"
  fi

  local summary_line
  summary_line="$(grep -E '^# all files \|' "${output_file}" | tail -n1 || true)"
  if [[ -z "${summary_line}" ]]; then
    echo "[coverage-check] ${label}: could not find aggregate coverage line." >&2
    rm -f "${output_file}"
    exit 1
  fi

  local actual_lines
  actual_lines="$(echo "${summary_line}" | awk -F'|' '{gsub(/ /, "", $2); print $2}')"
  if [[ -z "${actual_lines}" ]]; then
    echo "[coverage-check] ${label}: failed to parse line coverage." >&2
    rm -f "${output_file}"
    exit 1
  fi

  if ! awk -v actual="${actual_lines}" -v minimum="${threshold}" 'BEGIN { exit !(actual + 0 >= minimum + 0) }'; then
    echo "[coverage-check] ${label}: line coverage ${actual_lines}% is below threshold ${threshold}%." >&2
    rm -f "${output_file}"
    exit 1
  fi

  echo "[coverage-check] ${label}: line coverage ${actual_lines}% (threshold ${threshold}%)."
  rm -f "${output_file}"
}

run_and_check "backend" "${BACKEND_MIN_LINES}" "npm --prefix backend run test:coverage"
run_and_check "frontend" "${FRONTEND_MIN_LINES}" "npm --prefix frontend run test:coverage"

echo "[coverage-check] all coverage thresholds passed."
