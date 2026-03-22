function normalizePort(port, fallback) {
  const parsed = Number(port);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRuntimeConfig(win = window) {
  const isHttps = win.location?.protocol === "https:";
  const browserHost = win.location?.hostname || "127.0.0.1";
  const protocolHttp = isHttps ? "https" : "http";
  const protocolWs = isHttps ? "wss" : "ws";
  const injected = win.__PTYDECK_CONFIG__ && typeof win.__PTYDECK_CONFIG__ === "object" ? win.__PTYDECK_CONFIG__ : {};

  if (typeof injected.apiBaseUrl === "string" && typeof injected.wsUrl === "string") {
    return {
      apiBaseUrl: injected.apiBaseUrl,
      wsUrl: injected.wsUrl
    };
  }

  const apiHost = typeof injected.apiHost === "string" && injected.apiHost ? injected.apiHost : browserHost;
  const apiPort = normalizePort(injected.apiPort, 8080);
  const wsHost = typeof injected.wsHost === "string" && injected.wsHost ? injected.wsHost : browserHost;
  const wsPort = normalizePort(injected.wsPort, 8080);

  return {
    apiBaseUrl: `${protocolHttp}://${apiHost}:${apiPort}/api/v1`,
    wsUrl: `${protocolWs}://${wsHost}:${wsPort}/ws`
  };
}
