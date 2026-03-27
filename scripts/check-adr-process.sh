#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/check-adr-process.sh"

ADR_ROOT="${PTYDECK_ADR_ROOT:-${SCRIPT_DIR}/../docs/adr}"
README_PATH="${ADR_ROOT}/README.md"
TEMPLATE_PATH="${ADR_ROOT}/0000-template.md"
missing=0

if [[ ! -f "${README_PATH}" ]]; then
  echo "[adr-check] missing ${README_PATH}" >&2
  missing=1
fi
if [[ ! -f "${TEMPLATE_PATH}" ]]; then
  echo "[adr-check] missing ${TEMPLATE_PATH}" >&2
  missing=1
fi

if [[ -f "${TEMPLATE_PATH}" ]]; then
  if ! grep -Eq '^# ADR-0000: Title$' "${TEMPLATE_PATH}"; then
    echo "[adr-check] template missing canonical ADR heading" >&2
    missing=1
  fi
  if ! grep -Eq '^- Status: Proposed$' "${TEMPLATE_PATH}"; then
    echo "[adr-check] template missing canonical proposed status" >&2
    missing=1
  fi
  if ! grep -Eq '^- Date: YYYY-MM-DD$' "${TEMPLATE_PATH}"; then
    echo "[adr-check] template missing canonical date placeholder" >&2
    missing=1
  fi
fi

while IFS= read -r file; do
  basename_file="$(basename "${file}")"
  number="${basename_file%%-*}"

  if ! grep -Eq "^# ADR-${number}: .+" "${file}"; then
    echo "[adr-check] ${basename_file} missing matching ADR heading" >&2
    missing=1
  fi
  if ! grep -Eq '^- Status: (Proposed|Accepted|Rejected|Superseded|Deprecated)$' "${file}"; then
    echo "[adr-check] ${basename_file} missing valid status" >&2
    missing=1
  fi
  if ! grep -Eq '^- Date: [0-9]{4}-[0-9]{2}-[0-9]{2}$' "${file}"; then
    echo "[adr-check] ${basename_file} missing ISO date" >&2
    missing=1
  fi
  for section in "## Context" "## Decision" "## Consequences"; do
    if ! grep -Fq "${section}" "${file}"; then
      echo "[adr-check] ${basename_file} missing section: ${section}" >&2
      missing=1
    fi
  done
done < <(find "${ADR_ROOT}" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' ! -name '0000-template.md' | sort)

if (( missing > 0 )); then
  exit 1
fi

echo "[adr-check] ADR process files are present and structurally valid."
