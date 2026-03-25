#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/script-log.sh
source "${SCRIPT_DIR}/lib/script-log.sh"
ptydeck_log_script_start "scripts/check-cert-expiry.sh"

THRESHOLD_DAYS="${TLS_EXPIRY_THRESHOLD_DAYS:-30}"
HOSTS_RAW="${TLS_EXPIRY_CHECK_HOSTS:-}"

if ! [[ "$THRESHOLD_DAYS" =~ ^[0-9]+$ ]]; then
  echo "[tls-expiry-check] TLS_EXPIRY_THRESHOLD_DAYS must be a non-negative integer." >&2
  exit 1
fi

if [[ -z "${HOSTS_RAW// }" ]]; then
  echo "[tls-expiry-check] no hosts configured (TLS_EXPIRY_CHECK_HOSTS). Skipping."
  exit 0
fi

now_epoch="$(date -u +%s)"
failed=0

read -r -a HOSTS <<<"${HOSTS_RAW//,/ }"

for host_entry in "${HOSTS[@]}"; do
  host_entry="${host_entry//[$'\t\r\n']/}"
  if [[ -z "$host_entry" ]]; then
    continue
  fi

  host="$host_entry"
  port="443"
  if [[ "$host_entry" == *:* ]]; then
    host="${host_entry%%:*}"
    port="${host_entry##*:}"
  fi

  cert_end="$(echo | openssl s_client -servername "$host" -connect "$host:$port" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2-)"

  if [[ -z "$cert_end" ]]; then
    echo "[tls-expiry-check] FAIL ${host}:${port} unable to read certificate." >&2
    failed=1
    continue
  fi

  expiry_epoch="$(date -u -d "$cert_end" +%s 2>/dev/null || true)"
  if [[ -z "$expiry_epoch" ]]; then
    echo "[tls-expiry-check] FAIL ${host}:${port} unable to parse expiry date: ${cert_end}" >&2
    failed=1
    continue
  fi

  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
  if (( days_left < THRESHOLD_DAYS )); then
    echo "[tls-expiry-check] FAIL ${host}:${port} expires in ${days_left} days (${cert_end})." >&2
    failed=1
    continue
  fi

  echo "[tls-expiry-check] OK   ${host}:${port} expires in ${days_left} days (${cert_end})."
done

if (( failed > 0 )); then
  exit 1
fi
