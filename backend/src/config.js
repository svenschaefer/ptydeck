import { createDataEncryptionProvider } from "./key-provider.js";
import { parseTrustedProxy } from "./proxy.js";

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

function parseNonNegativeInt(rawValue, key) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
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

function parseBoolean(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseAuthMode(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "off" || normalized === "dev" || normalized === "prod") {
    return normalized;
  }
  throw new Error("AUTH_MODE must be one of: off, dev, prod.");
}

export function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
  const enforceTlsIngress = parseBoolean(env.ENFORCE_TLS_INGRESS ?? (nodeEnv === "production" ? "1" : "0"));
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
  if (nodeEnv === "production" && corsAllowedOriginsRaw.includes("*")) {
    throw new Error("CORS_ORIGIN wildcard is not allowed in production.");
  }
  const corsAllowedOrigins = corsAllowedOriginsRaw.map((origin) =>
    origin === "*" ? origin : parseOrigin(origin, "CORS_ORIGIN")
  );
  const debugLogs = parseBoolean(env.BACKEND_DEBUG_LOGS);
  const dataEncryptionProvider = createDataEncryptionProvider(
    env.DATA_ENCRYPTION_KEYS,
    env.DATA_ENCRYPTION_ACTIVE_KEY_ID
  );
  const trustedProxy = parseTrustedProxy(env.TRUST_PROXY);
  if (enforceTlsIngress && corsAllowedOrigins.includes("*")) {
    throw new Error("ENFORCE_TLS_INGRESS requires explicit CORS_ORIGIN values without wildcard.");
  }
  if (enforceTlsIngress) {
    for (const origin of corsAllowedOrigins) {
      if (origin === "*") {
        continue;
      }
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.protocol !== "https:") {
        throw new Error(`ENFORCE_TLS_INGRESS requires HTTPS CORS_ORIGIN values: ${origin}`);
      }
    }
    if (trustedProxy.mode === "off") {
      throw new Error("ENFORCE_TLS_INGRESS requires TRUST_PROXY to be configured.");
    }
  }
  const authModeRaw = parseAuthMode(env.AUTH_MODE);
  const legacyAuthEnabled = parseBoolean(env.AUTH_ENABLED);
  const legacyAuthDevMode = parseBoolean(env.AUTH_DEV_MODE);
  const authMode = authModeRaw || (legacyAuthEnabled || legacyAuthDevMode ? "dev" : "off");
  const authEnabled = authMode !== "off";
  const authDevMode = authMode === "dev";
  if (authMode === "prod") {
    throw new Error("AUTH_MODE=prod is not yet supported; use AUTH_MODE=off or AUTH_MODE=dev.");
  }
  const shell = String(env.SHELL || "bash").trim();
  const dataPath = String(env.DATA_PATH || "./data/sessions.json").trim();
  const debugLogFile = String(env.BACKEND_DEBUG_LOG_FILE || "").trim();
  const authDevSecret = String(env.AUTH_DEV_SECRET || "ptydeck-dev-secret").trim();
  const authIssuer = String(env.AUTH_ISSUER || "ptydeck-dev").trim();
  const authAudience = String(env.AUTH_AUDIENCE || "ptydeck-local").trim();
  if (!shell) {
    throw new Error("SHELL must not be empty.");
  }
  if (!dataPath) {
    throw new Error("DATA_PATH must not be empty.");
  }
  if (authEnabled && !authDevSecret) {
    throw new Error("AUTH_DEV_SECRET must not be empty when auth is enabled.");
  }
  if (authEnabled && !authIssuer) {
    throw new Error("AUTH_ISSUER must not be empty when auth is enabled.");
  }
  if (authEnabled && !authAudience) {
    throw new Error("AUTH_AUDIENCE must not be empty when auth is enabled.");
  }
  const port = parsePort(env.PORT || 18080, "PORT");
  const maxBodyBytes = parsePositiveInt(env.MAX_BODY_BYTES || 1024 * 1024, "MAX_BODY_BYTES");
  const rateLimitWindowMs = parsePositiveInt(env.RATE_LIMIT_WINDOW_MS || 60000, "RATE_LIMIT_WINDOW_MS");
  const rateLimitRestCreateMax = parseNonNegativeInt(
    env.RATE_LIMIT_REST_CREATE_MAX || 60,
    "RATE_LIMIT_REST_CREATE_MAX"
  );
  const rateLimitWsConnectMax = parseNonNegativeInt(
    env.RATE_LIMIT_WS_CONNECT_MAX || 60,
    "RATE_LIMIT_WS_CONNECT_MAX"
  );
  const sessionMaxConcurrent = parseNonNegativeInt(env.SESSION_MAX_CONCURRENT || 0, "SESSION_MAX_CONCURRENT");
  const sessionIdleTimeoutMs = parseNonNegativeInt(env.SESSION_IDLE_TIMEOUT_MS || 0, "SESSION_IDLE_TIMEOUT_MS");
  const sessionMaxLifetimeMs = parseNonNegativeInt(env.SESSION_MAX_LIFETIME_MS || 0, "SESSION_MAX_LIFETIME_MS");
  const sessionReplayMemoryMaxChars = parseNonNegativeInt(
    env.SESSION_REPLAY_MEMORY_MAX_CHARS || 16 * 1024,
    "SESSION_REPLAY_MEMORY_MAX_CHARS"
  );
  const sessionReplayPersistMaxChars = parseNonNegativeInt(
    env.SESSION_REPLAY_PERSIST_MAX_CHARS || 0,
    "SESSION_REPLAY_PERSIST_MAX_CHARS"
  );
  if (sessionReplayPersistMaxChars > sessionReplayMemoryMaxChars) {
    throw new Error("SESSION_REPLAY_PERSIST_MAX_CHARS must be less than or equal to SESSION_REPLAY_MEMORY_MAX_CHARS.");
  }
  const sessionActivityQuietMs = parsePositiveInt(
    env.SESSION_ACTIVITY_QUIET_MS || 1400,
    "SESSION_ACTIVITY_QUIET_MS"
  );
  const remoteReconnectMaxAttempts = parseNonNegativeInt(
    env.REMOTE_RECONNECT_MAX_ATTEMPTS || 3,
    "REMOTE_RECONNECT_MAX_ATTEMPTS"
  );
  const remoteReconnectDelayMs = parsePositiveInt(
    env.REMOTE_RECONNECT_DELAY_MS || 1500,
    "REMOTE_RECONNECT_DELAY_MS"
  );
  const remoteReconnectStableMs = parsePositiveInt(
    env.REMOTE_RECONNECT_STABLE_MS || 500,
    "REMOTE_RECONNECT_STABLE_MS"
  );
  const sessionGuardrailSweepMs = parsePositiveInt(env.SESSION_GUARDRAIL_SWEEP_MS || 1000, "SESSION_GUARDRAIL_SWEEP_MS");
  const authDevTokenTtlSeconds = parsePositiveInt(
    env.AUTH_DEV_TOKEN_TTL_SECONDS || 900,
    "AUTH_DEV_TOKEN_TTL_SECONDS"
  );
  const authWsTicketTtlSeconds = parsePositiveInt(
    env.AUTH_WS_TICKET_TTL_SECONDS || 30,
    "AUTH_WS_TICKET_TTL_SECONDS"
  );
  return {
    nodeEnv,
    port,
    shell,
    dataPath,
    corsOrigin: corsAllowedOrigins[0] || "",
    corsAllowedOrigins,
    maxBodyBytes,
    rateLimitWindowMs,
    rateLimitRestCreateMax,
    rateLimitWsConnectMax,
    sessionMaxConcurrent,
    sessionIdleTimeoutMs,
    sessionMaxLifetimeMs,
    sessionReplayMemoryMaxChars,
    sessionReplayPersistMaxChars,
    sessionActivityQuietMs,
    remoteReconnectMaxAttempts,
    remoteReconnectDelayMs,
    remoteReconnectStableMs,
    sessionGuardrailSweepMs,
    debugLogs,
    debugLogFile,
    enforceTlsIngress,
    dataEncryptionProvider,
    trustedProxy,
    authMode,
    authEnabled,
    authDevMode,
    authDevSecret,
    authIssuer,
    authAudience,
    authDevTokenTtlSeconds,
    authWsTicketTtlSeconds
  };
}
