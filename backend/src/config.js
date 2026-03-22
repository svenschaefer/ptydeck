export function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
  const rawCorsOrigins = String(env.CORS_ORIGIN || "").trim();
  const parsedCorsOrigins = rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsAllowedOrigins = parsedCorsOrigins.length > 0 ? parsedCorsOrigins : nodeEnv === "production" ? [] : ["*"];
  const maxBodyBytes = Number(env.MAX_BODY_BYTES || 1024 * 1024);
  const debugLogsRaw = String(env.BACKEND_DEBUG_LOGS || "").trim().toLowerCase();
  const debugLogs =
    debugLogsRaw === "1" || debugLogsRaw === "true" || debugLogsRaw === "yes" || debugLogsRaw === "on";
  return {
    nodeEnv,
    port: Number(env.PORT || 8080),
    shell: env.SHELL || "bash",
    dataPath: env.DATA_PATH || "./data/sessions.json",
    corsOrigin: corsAllowedOrigins[0] || "",
    corsAllowedOrigins,
    maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 1024 * 1024,
    debugLogs,
    debugLogFile: env.BACKEND_DEBUG_LOG_FILE || ""
  };
}
