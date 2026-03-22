function normalizePort(port, fallback) {
  const parsed = Number(port);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isIpV4(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function shouldUseDevPorts(host) {
  return isLoopbackHost(host) || isIpV4(host);
}

function deriveApiHost(browserHost) {
  const prefix = "ptydeck.";
  if (browserHost.startsWith(prefix) && browserHost.length > prefix.length) {
    return `api.${browserHost}`;
  }
  return browserHost;
}

function buildUrl(protocol, host, port, path) {
  const hasPort = Number.isInteger(port) && port > 0;
  const authority = hasPort ? `${host}:${port}` : host;
  return `${protocol}://${authority}${path}`;
}

function parseDebugFlag(win, injected) {
  if (typeof injected.debugLogs === "boolean") {
    return injected.debugLogs;
  }

  const rawSearch = typeof win.location?.search === "string" ? win.location.search : "";
  const params = new URLSearchParams(rawSearch);
  const value = params.get("debug");
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveRuntimeConfig(win = window) {
  const isHttps = win.location?.protocol === "https:";
  const browserHost = win.location?.hostname || "127.0.0.1";
  const protocolHttp = isHttps ? "https" : "http";
  const protocolWs = isHttps ? "wss" : "ws";
  const injected = win.__PTYDECK_CONFIG__ && typeof win.__PTYDECK_CONFIG__ === "object" ? win.__PTYDECK_CONFIG__ : {};
  const debugLogs = parseDebugFlag(win, injected);
  const hasExplicitApiBaseUrl = typeof injected.apiBaseUrl === "string" && injected.apiBaseUrl.trim().length > 0;
  const hasExplicitWsUrl = typeof injected.wsUrl === "string" && injected.wsUrl.trim().length > 0;

  if (hasExplicitApiBaseUrl && hasExplicitWsUrl) {
    return {
      apiBaseUrl: injected.apiBaseUrl,
      wsUrl: injected.wsUrl,
      debugLogs
    };
  }

  const defaultApiHost = deriveApiHost(browserHost);
  const apiHost = typeof injected.apiHost === "string" && injected.apiHost ? injected.apiHost : defaultApiHost;
  const wsHost = typeof injected.wsHost === "string" && injected.wsHost ? injected.wsHost : apiHost;
  const useDevPorts = shouldUseDevPorts(browserHost);
  const apiPort = normalizePort(injected.apiPort, useDevPorts ? 18080 : 0);
  const wsPort = normalizePort(injected.wsPort, useDevPorts ? 18080 : 0);

  return {
    apiBaseUrl: buildUrl(protocolHttp, apiHost, apiPort, "/api/v1"),
    wsUrl: buildUrl(protocolWs, wsHost, wsPort, "/ws"),
    debugLogs
  };
}
