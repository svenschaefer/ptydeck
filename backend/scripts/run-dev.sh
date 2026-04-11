#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"
DEFAULT_ENV_FILE="${REPO_ROOT}/local-config/ptydeck/backend.env.local"
ENV_FILE="${PTYDECK_BACKEND_ENV_FILE:-${DEFAULT_ENV_FILE}}"

cd "${BACKEND_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -n "${PTYDECK_BACKEND_DEV_COMMAND:-}" ]]; then
  exec bash -lc "${PTYDECK_BACKEND_DEV_COMMAND}"
fi

exec node src/server.js
