function parsePort(rawPort, key) {
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

function parsePositiveInt(rawValue, key) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return parsed;
}

function parseOrigin(value, key) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return value;
  } catch {
    throw new Error(`${key} contains invalid origin: ${value}`);
  }
}

export function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
  const rawCorsOrigins = String(env.CORS_ORIGIN || "").trim();
  const parsedCorsOrigins = rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsAllowedOriginsRaw =
    parsedCorsOrigins.length > 0 ? parsedCorsOrigins : nodeEnv === "production" ? [] : ["*"];
  if (nodeEnv === "production" && corsAllowedOriginsRaw.length === 0) {
    throw new Error("CORS_ORIGIN must be set in production.");
  }
  const corsAllowedOrigins = corsAllowedOriginsRaw.map((origin) =>
    origin === "*" ? origin : parseOrigin(origin, "CORS_ORIGIN")
  );
  const debugLogsRaw = String(env.BACKEND_DEBUG_LOGS || "").trim().toLowerCase();
  const debugLogs =
    debugLogsRaw === "1" || debugLogsRaw === "true" || debugLogsRaw === "yes" || debugLogsRaw === "on";
  const shell = String(env.SHELL || "bash").trim();
  const dataPath = String(env.DATA_PATH || "./data/sessions.json").trim();
  const debugLogFile = String(env.BACKEND_DEBUG_LOG_FILE || "").trim();
  if (!shell) {
    throw new Error("SHELL must not be empty.");
  }
  if (!dataPath) {
    throw new Error("DATA_PATH must not be empty.");
  }
  const port = parsePort(env.PORT || 18080, "PORT");
  const maxBodyBytes = parsePositiveInt(env.MAX_BODY_BYTES || 1024 * 1024, "MAX_BODY_BYTES");
  return {
    nodeEnv,
    port,
    shell,
    dataPath,
    corsOrigin: corsAllowedOrigins[0] || "",
    corsAllowedOrigins,
    maxBodyBytes,
    debugLogs,
    debugLogFile
  };
}
