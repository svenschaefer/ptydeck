#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV_LOCAL_FILE="${FRONTEND_DIR}/.env.local"
DEFAULT_ENV_FILE="${FRONTEND_DIR}/.env"
ENV_FILE="${PTYDECK_FRONTEND_ENV_FILE:-}"

cd "${FRONTEND_DIR}"

if [[ -z "${ENV_FILE}" ]]; then
  if [[ -f "${DEFAULT_ENV_LOCAL_FILE}" ]]; then
    ENV_FILE="${DEFAULT_ENV_LOCAL_FILE}"
  elif [[ -f "${DEFAULT_ENV_FILE}" ]]; then
    ENV_FILE="${DEFAULT_ENV_FILE}"
  fi
fi

if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -n "${PTYDECK_FRONTEND_DEV_COMMAND:-}" ]]; then
  exec bash -lc "${PTYDECK_FRONTEND_DEV_COMMAND}"
fi

exec node src/dev-server.js
