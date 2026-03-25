#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/ci-smoke.sh"

BACKEND_PORT="${BACKEND_PORT:-18080}"
FRONTEND_PORT="${FRONTEND_PORT:-18081}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}/api/v1}"
WS_URL="${WS_URL:-ws://127.0.0.1:${BACKEND_PORT}/ws}"

backend_pid=""
frontend_pid=""

cleanup() {
  if [[ -n "${frontend_pid}" ]] && kill -0 "${frontend_pid}" 2>/dev/null; then
    kill "${frontend_pid}" 2>/dev/null || true
    wait "${frontend_pid}" 2>/dev/null || true
  fi
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local timeout_seconds="${2:-20}"
  local started_at
  started_at="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    if (( "$(date +%s)" - started_at >= timeout_seconds )); then
      echo "Timed out waiting for ${url}" >&2
      return 1
    fi
    sleep 0.2
  done
}

node backend/src/server.js >/tmp/ptydeck-ci-backend.log 2>&1 &
backend_pid="$!"

API_BASE_URL="${API_BASE_URL}" WS_URL="${WS_URL}" node frontend/src/dev-server.js >/tmp/ptydeck-ci-frontend.log 2>&1 &
frontend_pid="$!"

wait_for_url "http://127.0.0.1:${BACKEND_PORT}/health"
wait_for_url "http://127.0.0.1:${BACKEND_PORT}/ready"
wait_for_url "http://127.0.0.1:${FRONTEND_PORT}/"

curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" | grep -q '"status":"ok"'
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/ready" | grep -q '"status":"ready"'
curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/" | grep -qi "<!doctype html>"

echo "CI smoke checks passed."
