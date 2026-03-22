export function loadClientConfig(env = process.env) {
  return {
    port: Number(env.FRONTEND_PORT || 5173),
    apiBaseUrl: env.API_BASE_URL || "http://localhost:8080/api/v1",
    wsUrl: env.WS_URL || "ws://localhost:8080/ws"
  };
}
