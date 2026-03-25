ptydeck_log_script_start() {
  local script_path="$1"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '[script-start] %s %s\n' "$script_path" "$timestamp" >&2
}
