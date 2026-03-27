#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/new-adr.sh"

ADR_ROOT="${PTYDECK_ADR_ROOT:-${SCRIPT_DIR}/../docs/adr}"
TEMPLATE_PATH="${ADR_ROOT}/0000-template.md"

if [[ $# -lt 1 ]]; then
  echo "usage: ./scripts/new-adr.sh \"Decision title\"" >&2
  exit 1
fi

if [[ ! -f "${TEMPLATE_PATH}" ]]; then
  echo "[adr] missing template: ${TEMPLATE_PATH}" >&2
  exit 1
fi

mkdir -p "${ADR_ROOT}"
TITLE="$*"
DATE_VALUE="$(date -u +%Y-%m-%d)"
SLUG="$(printf '%s' "${TITLE}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "${SLUG}" ]]; then
  echo "[adr] could not derive slug from title: ${TITLE}" >&2
  exit 1
fi

LAST_NUMBER="$({ find "${ADR_ROOT}" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' -printf '%f\n' || true; } | sed -E 's/^([0-9]{4})-.*/\1/' | sort | tail -n 1)"
if [[ -z "${LAST_NUMBER}" ]]; then
  NEXT_NUMBER=1
else
  NEXT_NUMBER=$((10#${LAST_NUMBER} + 1))
fi
ADR_NUMBER="$(printf '%04d' "${NEXT_NUMBER}")"
TARGET_PATH="${ADR_ROOT}/${ADR_NUMBER}-${SLUG}.md"

if [[ -e "${TARGET_PATH}" ]]; then
  echo "[adr] target already exists: ${TARGET_PATH}" >&2
  exit 1
fi

ESCAPED_TITLE="$(printf '%s' "${TITLE}" | sed -e 's/[&|]/\\&/g')"
sed \
  -e "s|ADR-0000|ADR-${ADR_NUMBER}|g" \
  -e "s|Title|${ESCAPED_TITLE}|g" \
  -e "s|YYYY-MM-DD|${DATE_VALUE}|g" \
  "${TEMPLATE_PATH}" > "${TARGET_PATH}"

echo "[adr] created ${TARGET_PATH}"
