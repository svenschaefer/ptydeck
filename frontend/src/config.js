function parsePort(rawPort, key) {
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

function parseUrl(rawValue, key, protocols) {
  if (!rawValue) {
    return "";
  }
  try {
    const parsed = new URL(rawValue);
    if (!protocols.includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
    return rawValue;
  } catch {
    throw new Error(`${key} must be a valid URL with protocol ${protocols.join(" or ")}.`);
  }
}

export function loadClientConfig(env = process.env) {
  const debugRaw = String(env.FRONTEND_DEBUG_LOGS || "").trim().toLowerCase();
  const debugLogs = debugRaw === "1" || debugRaw === "true" || debugRaw === "yes" || debugRaw === "on";
  const port = parsePort(env.FRONTEND_PORT || 18081, "FRONTEND_PORT");
  const apiBaseUrl = parseUrl(String(env.API_BASE_URL || "").trim(), "API_BASE_URL", ["http:", "https:"]);
  const wsUrl = parseUrl(String(env.WS_URL || "").trim(), "WS_URL", ["ws:", "wss:"]);
  return {
    port,
    apiBaseUrl,
    wsUrl,
    debugLogs
  };
}
