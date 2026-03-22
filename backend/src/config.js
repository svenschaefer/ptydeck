export function loadConfig(env = process.env) {
  const maxBodyBytes = Number(env.MAX_BODY_BYTES || 1024 * 1024);
  const debugLogsRaw = String(env.BACKEND_DEBUG_LOGS || "").trim().toLowerCase();
  const debugLogs =
    debugLogsRaw === "1" || debugLogsRaw === "true" || debugLogsRaw === "yes" || debugLogsRaw === "on";
  return {
    port: Number(env.PORT || 8080),
    shell: env.SHELL || "bash",
    dataPath: env.DATA_PATH || "./data/sessions.json",
    corsOrigin: env.CORS_ORIGIN || "*",
    maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 1024 * 1024,
    debugLogs,
    debugLogFile: env.BACKEND_DEBUG_LOG_FILE || ""
  };
}
