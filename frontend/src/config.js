export function loadClientConfig(env = process.env) {
  const debugRaw = String(env.FRONTEND_DEBUG_LOGS || "").trim().toLowerCase();
  const debugLogs = debugRaw === "1" || debugRaw === "true" || debugRaw === "yes" || debugRaw === "on";
  return {
    port: Number(env.FRONTEND_PORT || 18081),
    apiBaseUrl: env.API_BASE_URL || "http://localhost:18080/api/v1",
    wsUrl: env.WS_URL || "ws://localhost:18080/ws",
    debugLogs
  };
}
