import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function parseUnitInterval(rawValue, key) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${key} must be a number between 0 and 1.`);
  }
  return parsed;
}

function parseEnum(rawValue, key, allowedValues) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${key} must be one of: ${allowedValues.join(", ")}.`);
  }
  return normalized;
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

function readOptionalEnvText(env, key) {
  const rawValue = String(env[key] || "").trim();
  const rawFilePath = String(env[`${key}_FILE`] || "").trim();
  if (rawValue && rawFilePath) {
    throw new Error(`${key} and ${key}_FILE cannot both be set.`);
  }
  if (rawValue) {
    return rawValue;
  }
  if (!rawFilePath) {
    return "";
  }
  try {
    return readFileSync(resolve(rawFilePath), "utf8").trim();
  } catch (error) {
    throw new Error(`${key}_FILE could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function parseJsonArray(rawValue, key) {
  if (!rawValue) {
    return [];
  }
  let parsed = null;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`${key} must contain a valid JSON array.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${key} must contain a JSON array.`);
  }
  return parsed;
}

function parseBoolean(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseCsvList(rawValue) {
  const seen = new Set();
  const normalized = [];
  for (const entry of String(rawValue || "").split(",")) {
    const candidate = entry.trim();
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized;
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

const TELEGRAM_OUTBOUND_HARD_BREAK_ACTIVE = true;

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
  const sessionStreamAnalysisCaptureFile = String(env.SESSION_STREAM_ANALYSIS_CAPTURE_FILE || "").trim();
  const sessionStreamAnalysisCaptureAppLabels = parseCsvList(env.SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS || "codex");
  const sessionStreamAnalysisCaptureMaxBytes = parsePositiveInt(
    env.SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES || 32 * 1024 * 1024,
    "SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES"
  );
  const messagingTelegramBotToken = readOptionalEnvText(env, "MESSAGING_TELEGRAM_BOT_TOKEN");
  const messagingTelegramTargets = parseJsonArray(readOptionalEnvText(env, "MESSAGING_TELEGRAM_TARGETS"), "MESSAGING_TELEGRAM_TARGETS");
  const messagingTelegramApiBaseUrl = String(env.MESSAGING_TELEGRAM_API_BASE_URL || "https://api.telegram.org").trim();
  const messagingTelegramOutboundEnabled = false;
  const messagingTelegramInboundEnabled = Boolean(messagingTelegramBotToken && messagingTelegramTargets.length > 0);
  const messagingDiscordTargets = parseJsonArray(readOptionalEnvText(env, "MESSAGING_DISCORD_TARGETS"), "MESSAGING_DISCORD_TARGETS");
  const messagingDiscordApiBaseUrl = String(env.MESSAGING_DISCORD_API_BASE_URL || "https://discord.com/api/v10").trim();
  const messagingDiscordOutboundEnabled = parseBoolean(
    env.MESSAGING_DISCORD_OUTBOUND_ENABLED ?? (messagingDiscordTargets.length > 0 ? "1" : "0")
  );
  const messagingTelegramPollTimeoutSeconds = parsePositiveInt(
    env.MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS || 3,
    "MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS"
  );
  const messagingTerminalSemanticPrimaryMode = parseEnum(
    env.MESSAGING_TERMINAL_SEMANTIC_PRIMARY_MODE || "legacy",
    "MESSAGING_TERMINAL_SEMANTIC_PRIMARY_MODE",
    ["legacy", "projection"]
  );
  const messagingTerminalSemanticShadowModeEnabled = parseBoolean(
    env.MESSAGING_TERMINAL_SEMANTIC_SHADOW_MODE_ENABLED ?? "1"
  );
  const messagingTerminalSemanticCutoverMinComparisons = parsePositiveInt(
    env.MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS || 20,
    "MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS"
  );
  const messagingTerminalSemanticCutoverMaxMismatchRate = parseUnitInterval(
    env.MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE || 0.1,
    "MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE"
  );
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
  if ((messagingTelegramBotToken && messagingTelegramTargets.length === 0) || (!messagingTelegramBotToken && messagingTelegramTargets.length > 0)) {
    throw new Error("MESSAGING_TELEGRAM_BOT_TOKEN and MESSAGING_TELEGRAM_TARGETS must be configured together.");
  }
  if (messagingTelegramApiBaseUrl) {
    parseOrigin(messagingTelegramApiBaseUrl, "MESSAGING_TELEGRAM_API_BASE_URL");
  }
  if (messagingDiscordApiBaseUrl) {
    parseOrigin(messagingDiscordApiBaseUrl, "MESSAGING_DISCORD_API_BASE_URL");
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
  const sessionFileTransferMaxBytes = parsePositiveInt(
    env.SESSION_FILE_TRANSFER_MAX_BYTES || 256 * 1024,
    "SESSION_FILE_TRANSFER_MAX_BYTES"
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
    sessionFileTransferMaxBytes,
    sessionActivityQuietMs,
    remoteReconnectMaxAttempts,
    remoteReconnectDelayMs,
    remoteReconnectStableMs,
    sessionGuardrailSweepMs,
    debugLogs,
    debugLogFile,
    sessionStreamAnalysisCaptureFile,
    sessionStreamAnalysisCaptureAppLabels,
    sessionStreamAnalysisCaptureMaxBytes,
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
    authWsTicketTtlSeconds,
    messagingTelegramBotToken,
    messagingTelegramTargets,
    messagingTelegramApiBaseUrl,
    messagingTelegramOutboundEnabled,
    messagingTelegramOutboundHardBreakActive: TELEGRAM_OUTBOUND_HARD_BREAK_ACTIVE,
    messagingTelegramInboundEnabled,
    messagingTelegramPollTimeoutSeconds,
    messagingDiscordTargets,
    messagingDiscordApiBaseUrl,
    messagingDiscordOutboundEnabled,
    messagingTerminalSemanticPrimaryMode,
    messagingTerminalSemanticShadowModeEnabled,
    messagingTerminalSemanticCutoverMinComparisons,
    messagingTerminalSemanticCutoverMaxMismatchRate
  };
}
