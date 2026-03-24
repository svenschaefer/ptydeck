import http from "node:http";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { createDevToken, ensureScope, resolveBearerToken, verifyDevToken } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { JsonPersistence } from "./persistence.js";
import { resolveRequestContext } from "./proxy.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";
import { SessionManager } from "./session-manager.js";
import { validateRequest, validateResponse } from "./validation.js";

const CUSTOM_COMMAND_RESERVED_NAMES = new Set([
  "new",
  "close",
  "switch",
  "next",
  "prev",
  "list",
  "rename",
  "restart",
  "help",
  "custom"
]);
const CUSTOM_COMMAND_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DEFAULT_CUSTOM_COMMAND_MAX_COUNT = 256;
const DEFAULT_CUSTOM_COMMAND_MAX_NAME_LENGTH = 32;
const DEFAULT_CUSTOM_COMMAND_MAX_CONTENT_LENGTH = 8192;
const CUSTOM_COMMAND_NAME_LOCALE = "en-US";
const SESSION_START_CWD_MAX_LENGTH = 1024;
const SESSION_START_COMMAND_MAX_LENGTH = 4096;
const SESSION_ENV_MAX_ENTRIES = 64;
const SESSION_ENV_KEY_MAX_LENGTH = 128;
const SESSION_ENV_VALUE_MAX_LENGTH = 4096;
const SESSION_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_TAG_MAX_COUNT = 32;
const SESSION_TAG_MAX_LENGTH = 32;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_THEME_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_NAME = "Default";
const DECK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DECK_NAME_MAX_LENGTH = 64;
const DEFAULT_SESSION_THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};

function decodePathParam(value, name) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "ValidationError", `Invalid path parameter encoding for '${name}'.`);
  }
}

function parseJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let completed = false;

    function resolveOnce(value) {
      if (completed) {
        return;
      }
      completed = true;
      resolve(value);
    }

    function rejectOnce(error) {
      if (completed) {
        return;
      }
      completed = true;
      reject(error);
    }

    req.on("data", (chunk) => {
      if (completed) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        rejectOnce(new ApiError(413, "PayloadTooLarge", "Request body exceeds configured maximum size."));
        return;
      }
      data += chunk;
    });

    req.on("end", () => {
      if (completed) {
        return;
      }
      if (!data) {
        resolveOnce(undefined);
        return;
      }

      try {
        resolveOnce(JSON.parse(data));
      } catch {
        rejectOnce(new ApiError(400, "InvalidJson", "Malformed JSON body."));
      }
    });

    req.on("error", (err) => rejectOnce(err));
  });
}

function route(pathname, method) {
  if (pathname === "/health" && method === "GET") {
    return { kind: "health" };
  }
  if (pathname === "/ready" && method === "GET") {
    return { kind: "ready" };
  }
  if (pathname === "/metrics" && method === "GET") {
    return { kind: "metrics" };
  }
  if (pathname === "/api/v1/sessions" && method === "GET") {
    return { kind: "listSessions" };
  }
  if (pathname === "/api/v1/sessions" && method === "POST") {
    return { kind: "createSession" };
  }
  if (pathname === "/api/v1/auth/dev-token" && method === "POST") {
    return { kind: "devToken" };
  }
  if (pathname === "/api/v1/custom-commands" && method === "GET") {
    return { kind: "listCustomCommands" };
  }
  if (pathname === "/api/v1/decks" && method === "GET") {
    return { kind: "listDecks" };
  }
  if (pathname === "/api/v1/decks" && method === "POST") {
    return { kind: "createDeck" };
  }

  const customCommandMatch = pathname.match(/^\/api\/v1\/custom-commands\/([^/]+)$/);
  if (customCommandMatch && method === "GET") {
    return { kind: "getCustomCommand", params: { commandName: decodePathParam(customCommandMatch[1], "commandName") } };
  }
  if (customCommandMatch && method === "PUT") {
    return {
      kind: "upsertCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }
  if (customCommandMatch && method === "DELETE") {
    return {
      kind: "deleteCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }

  const deckMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)$/);
  if (deckMatch && method === "GET") {
    return { kind: "getDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "PATCH") {
    return { kind: "updateDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "DELETE") {
    return { kind: "deleteDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }

  const moveSessionMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)\/sessions\/([^/]+):move$/);
  if (moveSessionMatch && method === "POST") {
    return {
      kind: "moveSessionToDeck",
      params: {
        deckId: decodePathParam(moveSessionMatch[1], "deckId"),
        sessionId: decodePathParam(moveSessionMatch[2], "sessionId")
      }
    };
  }

  const getSessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (getSessionMatch && method === "GET") {
    return { kind: "getSession", params: { sessionId: getSessionMatch[1] } };
  }
  if (getSessionMatch && method === "PATCH") {
    return { kind: "updateSession", params: { sessionId: getSessionMatch[1] } };
  }
  if (getSessionMatch && method === "DELETE") {
    return { kind: "deleteSession", params: { sessionId: getSessionMatch[1] } };
  }

  const inputMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/input$/);
  if (inputMatch && method === "POST") {
    return { kind: "input", params: { sessionId: inputMatch[1] } };
  }

  const resizeMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/resize$/);
  if (resizeMatch && method === "POST") {
    return { kind: "resize", params: { sessionId: resizeMatch[1] } };
  }

  const restartMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/restart$/);
  if (restartMatch && method === "POST") {
    return { kind: "restart", params: { sessionId: restartMatch[1] } };
  }

  return { kind: "notFound" };
}

function normalizeMetricsPath(pathname) {
  if (/^\/api\/v1\/decks\/[^/]+\/sessions\/[^/]+:move$/.test(pathname)) {
    return "/api/v1/decks/{deckId}/sessions/{sessionId}:move";
  }
  if (/^\/api\/v1\/decks\/[^/]+$/.test(pathname)) {
    return "/api/v1/decks/{deckId}";
  }
  if (/^\/api\/v1\/custom-commands\/[^/]+$/.test(pathname)) {
    return "/api/v1/custom-commands/{commandName}";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/input$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/input";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/resize$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/resize";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/restart$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/restart";
  }
  if (/^\/api\/v1\/sessions\/[^/]+$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}";
  }
  return pathname;
}

function escapePrometheusLabel(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n");
}

function normalizeCustomCommandName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function compareCustomCommandEntries(a, b) {
  const nameCompare = a.name.localeCompare(b.name, CUSTOM_COMMAND_NAME_LOCALE, { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt;
  }
  return a.content.localeCompare(b.content, CUSTOM_COMMAND_NAME_LOCALE);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSessionStartupConfig(input = {}, { strict = true } = {}) {
  const fallbackCwd =
    typeof input.fallbackCwd === "string" && input.fallbackCwd.trim() ? input.fallbackCwd.trim() : homedir();
  const startCwdRaw = typeof input.startCwd === "string" ? input.startCwd.trim() : "";
  const startCwd = startCwdRaw || fallbackCwd;
  if (!startCwd) {
    throw new ApiError(400, "ValidationError", "Field 'startCwd' must be a non-empty string.");
  }
  if (startCwd.length > SESSION_START_CWD_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'startCwd' exceeds maximum length (${SESSION_START_CWD_MAX_LENGTH}).`
      );
    }
    return {
      startCwd: fallbackCwd,
      startCommand: "",
      env: {}
    };
  }

  const startCommand = typeof input.startCommand === "string" ? input.startCommand : "";
  if (startCommand.length > SESSION_START_COMMAND_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'startCommand' exceeds maximum length (${SESSION_START_COMMAND_MAX_LENGTH}).`
      );
    }
    return {
      startCwd,
      startCommand: "",
      env: {}
    };
  }

  const envInput = input.env === undefined ? {} : input.env;
  if (!isPlainObject(envInput)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'env' must be an object with string key/value pairs.");
    }
    return {
      startCwd,
      startCommand,
      env: {}
    };
  }
  const envEntries = Object.entries(envInput);
  if (envEntries.length > SESSION_ENV_MAX_ENTRIES) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field 'env' exceeds maximum entries (${SESSION_ENV_MAX_ENTRIES}).`);
    }
  }

  const env = {};
  for (const [rawKey, rawValue] of envEntries) {
    if (Object.keys(env).length >= SESSION_ENV_MAX_ENTRIES) {
      break;
    }
    if (typeof rawKey !== "string" || !SESSION_ENV_KEY_PATTERN.test(rawKey) || rawKey.length > SESSION_ENV_KEY_MAX_LENGTH) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'env' contains an invalid variable name.");
      }
      continue;
    }
    if (typeof rawValue !== "string" || rawValue.length > SESSION_ENV_VALUE_MAX_LENGTH) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'env' contains an invalid variable value.");
      }
      continue;
    }
    env[rawKey] = rawValue;
  }

  return {
    startCwd,
    startCommand,
    env
  };
}

function normalizeSessionThemeProfile(input = {}, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return { ...DEFAULT_SESSION_THEME_PROFILE };
  }
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'themeProfile' must be an object.");
    }
    return { ...DEFAULT_SESSION_THEME_PROFILE };
  }

  const normalized = {};
  const allowedKeys = new Set(Object.keys(DEFAULT_SESSION_THEME_PROFILE));
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field 'themeProfile.${key}' is not supported.`);
      }
      continue;
    }
    if (typeof value !== "string" || !SESSION_THEME_COLOR_PATTERN.test(value)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field 'themeProfile.${key}' must be a hex color like '#1d2021'.`);
      }
      continue;
    }
  }

  for (const [key, defaultValue] of Object.entries(DEFAULT_SESSION_THEME_PROFILE)) {
    normalized[key] = typeof input[key] === "string" ? input[key] : defaultValue;
  }

  return normalized;
}

function normalizeSessionTags(input, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'tags' must be an array of strings.");
    }
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of input) {
    if (typeof entry !== "string") {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'tags' must contain only strings.");
      }
      continue;
    }
    const candidate = entry.trim().toLowerCase();
    if (!candidate || candidate.length > SESSION_TAG_MAX_LENGTH || !SESSION_TAG_PATTERN.test(candidate)) {
      if (strict) {
        throw new ApiError(
          400,
          "ValidationError",
          `Each tag must match ${SESSION_TAG_PATTERN} and be at most ${SESSION_TAG_MAX_LENGTH} chars.`
        );
      }
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
    if (normalized.length >= SESSION_TAG_MAX_COUNT) {
      if (strict && input.length > SESSION_TAG_MAX_COUNT) {
        throw new ApiError(400, "ValidationError", `Field 'tags' exceeds maximum entries (${SESSION_TAG_MAX_COUNT}).`);
      }
      break;
    }
  }

  normalized.sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
  return normalized;
}

function buildDefaultDeck(now = Date.now()) {
  return {
    id: DEFAULT_DECK_ID,
    name: DEFAULT_DECK_NAME,
    createdAt: now,
    updatedAt: now,
    settings: {}
  };
}

function normalizeDeckEntity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    return null;
  }
  const now = Date.now();
  const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : id,
    createdAt,
    updatedAt,
    settings: input.settings && typeof input.settings === "object" && !Array.isArray(input.settings) ? input.settings : {}
  };
}

function compareDeckEntries(a, b) {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
}

function normalizeDeckName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
  }
  if (trimmed.length > DECK_NAME_MAX_LENGTH) {
    throw new ApiError(400, "ValidationError", `Field 'name' exceeds maximum length (${DECK_NAME_MAX_LENGTH}).`);
  }
  return trimmed;
}

function normalizeDeckSettings(settings, { strict = true } = {}) {
  if (settings === undefined) {
    return {};
  }
  if (!isPlainObject(settings)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'settings' must be an object.");
    }
    return {};
  }
  return JSON.parse(JSON.stringify(settings));
}

function normalizeDeckIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !DECK_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyDeckId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "deck";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "deck";
}

function parseBooleanQueryParam(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new ApiError(400, "ValidationError", `Query parameter '${fieldName}' must be 'true' or 'false'.`);
}

export function createRuntime(config) {
  const maxBodyBytes =
    Number.isFinite(config.maxBodyBytes) && config.maxBodyBytes > 0 ? config.maxBodyBytes : 1024 * 1024;
  const debugLogs = config.debugLogs === true;
  const manager = new SessionManager({
    defaultShell: config.shell,
    createPty: typeof config.createPty === "function" ? config.createPty : undefined,
    sessionMaxConcurrent: config.sessionMaxConcurrent,
    sessionIdleTimeoutMs: config.sessionIdleTimeoutMs,
    sessionMaxLifetimeMs: config.sessionMaxLifetimeMs
  });
  const persistence = new JsonPersistence(config.dataPath, {
    encryptionProvider: config.dataEncryptionProvider || null
  });
  const createSessionRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const wsConnectRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const wsServer = new WebSocketServer({ noServer: true });
  const sockets = new Set();
  const customCommands = new Map();
  const unrestoredSessions = new Map();
  const decks = new Map();
  const sessionDeckAssignments = new Map();
  const metrics = {
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
    httpDurationMsSum: 0,
    httpDurationMsCount: 0,
    wsConnectionsOpenedTotal: 0,
    wsConnectionsClosedTotal: 0,
    httpRequestsByStatus: new Map(),
    httpRequestsByRoute: new Map()
  };
  const customCommandMaxCount =
    Number.isInteger(config.customCommandMaxCount) && config.customCommandMaxCount > 0
      ? config.customCommandMaxCount
      : DEFAULT_CUSTOM_COMMAND_MAX_COUNT;
  const customCommandMaxNameLength =
    Number.isInteger(config.customCommandMaxNameLength) && config.customCommandMaxNameLength > 0
      ? config.customCommandMaxNameLength
      : DEFAULT_CUSTOM_COMMAND_MAX_NAME_LENGTH;
  const customCommandMaxContentLength =
    Number.isInteger(config.customCommandMaxContentLength) && config.customCommandMaxContentLength > 0
      ? config.customCommandMaxContentLength
      : DEFAULT_CUSTOM_COMMAND_MAX_CONTENT_LENGTH;
  let isReady = false;
  let isStopping = false;
  let isStopped = false;
  let stopPromise = null;
  let persistTimer = null;
  let persistQueue = Promise.resolve();
  const guardrailSweepMs =
    Number.isInteger(config.sessionGuardrailSweepMs) && config.sessionGuardrailSweepMs > 0
      ? config.sessionGuardrailSweepMs
      : 1000;
  const guardrailTimer = setInterval(() => {
    manager.enforceGuardrails();
  }, guardrailSweepMs);
  const corsAllowedOrigins = Array.isArray(config.corsAllowedOrigins)
    ? config.corsAllowedOrigins.filter((origin) => typeof origin === "string" && origin)
    : [config.corsOrigin || "*"].filter(Boolean);

  function logDebug(event, details = {}) {
    if (!debugLogs) {
      return;
    }
    const timestamp = new Date().toISOString();
    const line = `[ptydeck-backend][${timestamp}] ${event} ${JSON.stringify(details)}`;
    console.log(line);
    if (config.debugLogFile) {
      appendFile(config.debugLogFile, `${line}\n`).catch(() => {
        // Ignore debug log write failures.
      });
    }
  }

  function buildCorsHeaders(req) {
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowAnyOrigin = corsAllowedOrigins.includes("*");
    const allowedOrigin = allowAnyOrigin
      ? "*"
      : requestOrigin && corsAllowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : "";

    const headers = {
      ...buildSecurityHeaders(),
      "content-type": "application/json",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    };

    if (allowedOrigin) {
      headers["access-control-allow-origin"] = allowedOrigin;
    }
    if (!allowAnyOrigin) {
      headers.vary = "origin";
    }

    return headers;
  }

  function buildSecurityHeaders() {
    return {
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    };
  }

  function writeJson(req, res, statusCode, body) {
    res.writeHead(statusCode, buildCorsHeaders(req));

    if (body === undefined) {
      res.end();
      return;
    }

    res.end(JSON.stringify(body));
  }

  function renderMetrics() {
    const lines = [];
    lines.push("# HELP ptydeck_http_requests_total Total number of HTTP requests.");
    lines.push("# TYPE ptydeck_http_requests_total counter");
    lines.push(`ptydeck_http_requests_total ${metrics.httpRequestsTotal}`);
    lines.push("# HELP ptydeck_http_errors_total Total number of HTTP requests with status >= 400.");
    lines.push("# TYPE ptydeck_http_errors_total counter");
    lines.push(`ptydeck_http_errors_total ${metrics.httpErrorsTotal}`);
    lines.push("# HELP ptydeck_http_request_duration_ms_sum Sum of HTTP request duration in milliseconds.");
    lines.push("# TYPE ptydeck_http_request_duration_ms_sum counter");
    lines.push(`ptydeck_http_request_duration_ms_sum ${metrics.httpDurationMsSum}`);
    lines.push("# HELP ptydeck_http_request_duration_ms_count Total number of observed HTTP request durations.");
    lines.push("# TYPE ptydeck_http_request_duration_ms_count counter");
    lines.push(`ptydeck_http_request_duration_ms_count ${metrics.httpDurationMsCount}`);
    lines.push("# HELP ptydeck_sessions_active Number of active PTY sessions.");
    lines.push("# TYPE ptydeck_sessions_active gauge");
    lines.push(`ptydeck_sessions_active ${manager.list().length}`);
    lines.push("# HELP ptydeck_ws_connections_active Number of active WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_active gauge");
    lines.push(`ptydeck_ws_connections_active ${sockets.size}`);
    lines.push("# HELP ptydeck_ws_connections_opened_total Total number of accepted WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_opened_total counter");
    lines.push(`ptydeck_ws_connections_opened_total ${metrics.wsConnectionsOpenedTotal}`);
    lines.push("# HELP ptydeck_ws_connections_closed_total Total number of closed WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_closed_total counter");
    lines.push(`ptydeck_ws_connections_closed_total ${metrics.wsConnectionsClosedTotal}`);
    lines.push("# HELP ptydeck_http_requests_by_status_total HTTP requests grouped by status code.");
    lines.push("# TYPE ptydeck_http_requests_by_status_total counter");
    for (const [statusCode, count] of metrics.httpRequestsByStatus.entries()) {
      lines.push(`ptydeck_http_requests_by_status_total{status="${escapePrometheusLabel(statusCode)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_http_requests_by_route_total HTTP requests grouped by normalized route.");
    lines.push("# TYPE ptydeck_http_requests_by_route_total counter");
    for (const [routeKey, count] of metrics.httpRequestsByRoute.entries()) {
      const [method, route] = routeKey.split(" ", 2);
      lines.push(
        `ptydeck_http_requests_by_route_total{method="${escapePrometheusLabel(method)}",route="${escapePrometheusLabel(route)}"} ${count}`
      );
    }
    return `${lines.join("\n")}\n`;
  }

  function requiredScopeForRoute(kind) {
    if (kind === "listDecks" || kind === "getDeck") {
      return "sessions:read";
    }
    if (kind === "createDeck" || kind === "updateDeck" || kind === "deleteDeck" || kind === "moveSessionToDeck") {
      return "sessions:write";
    }
    if (kind === "listCustomCommands" || kind === "getCustomCommand") {
      return "sessions:read";
    }
    if (kind === "upsertCustomCommand" || kind === "deleteCustomCommand") {
      return "sessions:write";
    }
    if (kind === "listSessions" || kind === "getSession") {
      return "sessions:read";
    }
    if (kind === "createSession") {
      return "sessions:create";
    }
    if (kind === "deleteSession") {
      return "sessions:delete";
    }
    if (kind === "updateSession" || kind === "input" || kind === "resize" || kind === "restart") {
      return "sessions:write";
    }
    return "";
  }

  function authenticateRequest(req, parsedUrl, requiredScope) {
    if (!config.authEnabled) {
      return null;
    }
    const token = resolveBearerToken(req, parsedUrl);
    const auth = verifyDevToken(token, {
      secret: config.authDevSecret,
      issuer: config.authIssuer,
      audience: config.authAudience
    });
    ensureScope(auth, requiredScope);
    return auth;
  }

  function ensureTlsIngress(requestContext) {
    if (!config.enforceTlsIngress) {
      return;
    }
    if (requestContext.protocol !== "https") {
      throw new ApiError(426, "TlsRequired", "TLS is required for this endpoint.");
    }
  }

  function listCustomCommands() {
    return Array.from(customCommands.values()).sort(compareCustomCommandEntries);
  }

  function getCustomCommandOrThrow(name) {
    const normalizedName = normalizeCustomCommandName(name);
    const entry = customCommands.get(normalizedName);
    if (!entry) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    return { ...entry };
  }

  function upsertCustomCommand(name, content) {
    const normalizedName = normalizeCustomCommandName(name);
    if (normalizedName.length > customCommandMaxNameLength) {
      throw new ApiError(
        400,
        "CustomCommandNameTooLong",
        `Custom command name exceeds maximum length (${customCommandMaxNameLength}).`
      );
    }
    if (!CUSTOM_COMMAND_NAME_PATTERN.test(normalizedName)) {
      throw new ApiError(
        400,
        "CustomCommandNameInvalid",
        "Custom command name must match pattern [A-Za-z0-9][A-Za-z0-9_-]*."
      );
    }
    if (CUSTOM_COMMAND_RESERVED_NAMES.has(normalizedName)) {
      throw new ApiError(409, "CustomCommandNameReserved", "Custom command name collides with a system command.");
    }
    if (content.length > customCommandMaxContentLength) {
      throw new ApiError(
        400,
        "CustomCommandContentTooLarge",
        `Custom command content exceeds maximum length (${customCommandMaxContentLength}).`
      );
    }
    if (!customCommands.has(normalizedName) && customCommands.size >= customCommandMaxCount) {
      throw new ApiError(
        409,
        "CustomCommandLimitExceeded",
        `Custom command limit reached (${customCommandMaxCount}).`
      );
    }

    const current = customCommands.get(normalizedName);
    const now = Date.now();
    const next = {
      name: normalizedName,
      content,
      createdAt: current ? current.createdAt : now,
      updatedAt: now
    };
    customCommands.set(normalizedName, next);
    return { ...next };
  }

  function deleteCustomCommand(name) {
    const normalizedName = normalizeCustomCommandName(name);
    const existing = customCommands.get(normalizedName);
    if (!existing) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    customCommands.delete(normalizedName);
    return { ...existing };
  }

  function hasCustomCommand(name) {
    return customCommands.has(normalizeCustomCommandName(name));
  }

  function toApiDeck(deck) {
    return {
      id: deck.id,
      name: deck.name,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      settings: deck.settings
    };
  }

  function listDecks() {
    ensureDefaultDeck();
    return Array.from(decks.values()).sort(compareDeckEntries).map(toApiDeck);
  }

  function getDeckOrThrow(deckId) {
    const deck = decks.get(deckId);
    if (!deck) {
      throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
    }
    return deck;
  }

  function createDeck(body) {
    const name = normalizeDeckName(body?.name);
    const requestedId = normalizeDeckIdInput(body?.id);
    let deckId = requestedId;
    if (!deckId) {
      const slug = slugifyDeckId(name);
      deckId = slug;
      let suffix = 2;
      while (decks.has(deckId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "deck";
        deckId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (decks.has(deckId)) {
      throw new ApiError(409, "DeckAlreadyExists", `Deck '${deckId}' already exists.`);
    }
    const now = Date.now();
    const deck = {
      id: deckId,
      name,
      createdAt: now,
      updatedAt: now,
      settings: normalizeDeckSettings(body?.settings, { strict: true })
    };
    decks.set(deck.id, deck);
    return toApiDeck(deck);
  }

  function updateDeck(deckId, body) {
    const existing = getDeckOrThrow(deckId);
    const hasName = body?.name !== undefined;
    const hasSettings = body?.settings !== undefined;
    if (!hasName && !hasSettings) {
      throw new ApiError(400, "ValidationError", "At least one updatable deck field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeDeckName(body.name) : existing.name,
      settings: hasSettings ? normalizeDeckSettings(body.settings, { strict: true }) : existing.settings,
      updatedAt: Date.now()
    };
    decks.set(deckId, next);
    return toApiDeck(next);
  }

  function countSessionsInDeck(deckId) {
    let count = 0;
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        count += 1;
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        count += 1;
      }
    }
    return count;
  }

  function reassignDeckSessions(deckId, targetDeckId) {
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        sessionDeckAssignments.set(session.id, targetDeckId);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        sessionDeckAssignments.set(sessionId, targetDeckId);
      }
    }
  }

  function listSessionIdsInDeck(deckId) {
    const sessionIds = [];
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        sessionIds.push(session.id);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }

  function deleteDeck(deckId, { force = false } = {}) {
    if (deckId === DEFAULT_DECK_ID) {
      throw new ApiError(409, "DeckDeleteForbidden", "Default deck cannot be deleted.");
    }
    getDeckOrThrow(deckId);
    const affectedSessionIds = listSessionIdsInDeck(deckId);
    if (affectedSessionIds.length > 0 && !force) {
      throw new ApiError(409, "DeckNotEmpty", "Deck is not empty. Use force=true to delete and reassign sessions.");
    }
    if (affectedSessionIds.length > 0 && force) {
      ensureDefaultDeck();
      reassignDeckSessions(deckId, DEFAULT_DECK_ID);
    }
    decks.delete(deckId);
    return {
      deckId,
      fallbackDeckId: DEFAULT_DECK_ID,
      reassignedSessionIds: force ? affectedSessionIds : []
    };
  }

  function ensureSessionExistsOrThrow(sessionId) {
    try {
      manager.get(sessionId);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    if (unrestoredSessions.has(sessionId)) {
      return;
    }
    throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
  }

  function moveSessionToDeck(sessionId, deckId) {
    getDeckOrThrow(deckId);
    ensureSessionExistsOrThrow(sessionId);
    const sourceDeckId = resolveSessionDeckId(sessionId);
    if (sourceDeckId === deckId) {
      return false;
    }
    sessionDeckAssignments.set(sessionId, deckId);
    return true;
  }

  function ensureDefaultDeck() {
    if (decks.has(DEFAULT_DECK_ID)) {
      return decks.get(DEFAULT_DECK_ID);
    }
    const defaultDeck = buildDefaultDeck();
    decks.set(defaultDeck.id, defaultDeck);
    return defaultDeck;
  }

  function resolveSessionDeckId(sessionId) {
    const assigned = sessionDeckAssignments.get(sessionId);
    if (assigned && decks.has(assigned)) {
      return assigned;
    }
    ensureDefaultDeck();
    sessionDeckAssignments.set(sessionId, DEFAULT_DECK_ID);
    return DEFAULT_DECK_ID;
  }

  function withDeckId(session) {
    return {
      ...session,
      deckId: resolveSessionDeckId(session.id)
    };
  }

  function snapshotRuntimeState() {
    const sessionMap = new Map();
    for (const session of manager.list()) {
      sessionMap.set(session.id, withDeckId(session));
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, withDeckId(session));
      }
    }
    ensureDefaultDeck();
    return {
      sessions: Array.from(sessionMap.values()),
      customCommands: listCustomCommands(),
      decks: Array.from(decks.values())
    };
  }

  function toApiSession(session, explicitState) {
    const sessionState = typeof explicitState === "string" && explicitState.trim() ? explicitState.trim() : String(session?.state || "").trim();
    return {
      ...session,
      deckId: resolveSessionDeckId(session.id),
      state: sessionState || "running"
    };
  }

  function listApiSessions({ deckId } = {}) {
    const payload = [];
    const seen = new Set();
    for (const session of manager.list()) {
      const apiSession = toApiSession(session);
      if (!deckId || apiSession.deckId === deckId) {
        payload.push(apiSession);
      }
      seen.add(session.id);
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (seen.has(sessionId)) {
        continue;
      }
      const apiSession = toApiSession(session, "unrestored");
      if (!deckId || apiSession.deckId === deckId) {
        payload.push(apiSession);
      }
    }
    return payload;
  }

  function getApiSessionOrThrow(sessionId) {
    try {
      const active = manager.get(sessionId).meta;
      return toApiSession(active);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestored = unrestoredSessions.get(sessionId);
    if (unrestored) {
      return toApiSession(unrestored, "unrestored");
    }
    throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
  }

  function tryCreateRestoredSession({
    session,
    shell,
    cwd,
    startCwd,
    startCommand,
    env,
    tags,
    themeProfile
  }) {
    return manager.create({
      id: session.id,
      cwd,
      shell,
      name: session.name,
      startCwd,
      startCommand,
      env,
      tags,
      themeProfile,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
  }

  function saveStateQueued(state, reason = "unknown") {
    const executeSave = async () => {
      logDebug("persist.save.start", {
        reason,
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length,
        deckCount: state.decks.length
      });
      await persistence.saveState(state);
      logDebug("persist.save.ok", {
        reason,
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length,
        deckCount: state.decks.length
      });
    };

    persistQueue = persistQueue.then(executeSave, executeSave);
    return persistQueue;
  }

  async function persistNow(reason = "manual") {
    if (isStopping) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await saveStateQueued(snapshotRuntimeState(), reason);
  }

  function persistSoon() {
    if (isStopping) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      saveStateQueued(snapshotRuntimeState(), "debounced").catch((err) => {
        console.error("failed to persist runtime state", err);
      });
    }, 100);
  }

  function broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  function broadcastSessionUpdated(sessionId) {
    broadcast({
      type: "session.updated",
      session: getApiSessionOrThrow(sessionId)
    });
  }

  function broadcastDeckUpsert(type, deck) {
    broadcast({
      type,
      deck: toApiDeck(deck)
    });
  }

  function broadcastDeckDeleted(deckId, fallbackDeckId = DEFAULT_DECK_ID) {
    broadcast({
      type: "deck.deleted",
      deckId,
      fallbackDeckId
    });
  }

  const wsEventNames = ["session.created", "session.started", "session.updated", "session.data", "session.exit", "session.closed"];
  for (const eventName of wsEventNames) {
    manager.on(eventName, (event) => {
      if (eventName !== "session.data") {
        logDebug("session.event", { type: eventName, sessionId: event.session?.id || event.sessionId || null });
      }
      if ((eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") && event && event.session) {
        broadcast({
          type: eventName,
          ...event,
          session: toApiSession(event.session)
        });
      } else {
        broadcast({ type: eventName, ...event });
      }
      if (eventName !== "session.data") {
        persistSoon();
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const methodForLog = req.method || "GET";
    let pathnameForLog = req.url || "/";
    let normalizedMetricsPathForLog = pathnameForLog;
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = String(res.statusCode);
      const routeKey = `${methodForLog} ${normalizedMetricsPathForLog}`;
      metrics.httpRequestsTotal += 1;
      metrics.httpDurationMsCount += 1;
      metrics.httpDurationMsSum += durationMs;
      if (res.statusCode >= 400) {
        metrics.httpErrorsTotal += 1;
      }
      metrics.httpRequestsByStatus.set(statusCode, (metrics.httpRequestsByStatus.get(statusCode) || 0) + 1);
      metrics.httpRequestsByRoute.set(routeKey, (metrics.httpRequestsByRoute.get(routeKey) || 0) + 1);
      logDebug("http.request.done", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: res.statusCode,
        durationMs
      });
    });

    try {
      const requestContext = resolveRequestContext(req, config.trustedProxy);
      const parsedUrl = new URL(req.url || "/", `${requestContext.protocol}://${requestContext.host}`);
      pathnameForLog = parsedUrl.pathname;
      normalizedMetricsPathForLog = normalizeMetricsPath(parsedUrl.pathname);
      logDebug("http.request.start", {
        method: methodForLog,
        pathname: pathnameForLog,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      });

      if (req.method === "OPTIONS") {
        ensureTlsIngress(requestContext);
        writeJson(req, res, 204);
        return;
      }

      const match = route(parsedUrl.pathname, req.method || "GET");
      const body = await parseJsonBody(req, maxBodyBytes);
      const params = match.params || {};

      validateRequest({
        method: req.method || "GET",
        pathname: parsedUrl.pathname,
        params,
        body
      });
      ensureTlsIngress(requestContext);

      if (match.kind === "health") {
        writeJson(req, res, 200, { status: "ok" });
        return;
      }

      if (match.kind === "ready") {
        writeJson(req, res, 200, { status: isReady ? "ready" : "starting" });
        return;
      }

      if (match.kind === "metrics") {
        const payload = renderMetrics();
        res.writeHead(200, {
          ...buildSecurityHeaders(),
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(payload);
        return;
      }

      if (match.kind === "devToken") {
        if (!config.authEnabled || !config.authDevMode) {
          throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
        }
        const scopeDefaults = ["sessions:read", "sessions:create", "sessions:write", "sessions:delete", "ws:connect"];
        const requestedScopes =
          Array.isArray(body?.scopes) && body.scopes.every((entry) => typeof entry === "string")
            ? body.scopes
            : scopeDefaults;
        const payload = {
          accessToken: createDevToken({
            secret: config.authDevSecret,
            issuer: config.authIssuer,
            audience: config.authAudience,
            subject: typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim() : "dev-user",
            tenantId: typeof body?.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : "dev",
            scopes: requestedScopes,
            ttlSeconds: config.authDevTokenTtlSeconds
          }),
          tokenType: "Bearer",
          expiresIn: config.authDevTokenTtlSeconds,
          scope: requestedScopes.join(" ")
        };
        validateResponse({ statusCode: 200, body: payload, expect: "authToken" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind !== "notFound") {
        authenticateRequest(req, parsedUrl, requiredScopeForRoute(match.kind));
      }

      if (match.kind === "listCustomCommands") {
        const payload = listCustomCommands();
        validateResponse({ statusCode: 200, body: payload, expect: "customCommandList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "getCustomCommand") {
        const payload = getCustomCommandOrThrow(match.params.commandName);
        validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "upsertCustomCommand") {
        const existed = hasCustomCommand(match.params.commandName);
        const payload = upsertCustomCommand(match.params.commandName, body.content);
        validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
        broadcast({
          type: existed ? "custom-command.updated" : "custom-command.created",
          command: payload
        });
        await persistNow("custom-command.upsert");
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteCustomCommand") {
        const deletedCommand = deleteCustomCommand(match.params.commandName);
        broadcast({
          type: "custom-command.deleted",
          command: deletedCommand
        });
        await persistNow("custom-command.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listDecks") {
        const payload = listDecks();
        validateResponse({ statusCode: 200, body: payload, expect: "deckList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createDeck") {
        const payload = createDeck(body);
        validateResponse({ statusCode: 201, body: payload, expect: "deck" });
        await persistNow("deck.create");
        broadcastDeckUpsert("deck.created", payload);
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getDeck") {
        const payload = toApiDeck(getDeckOrThrow(match.params.deckId));
        validateResponse({ statusCode: 200, body: payload, expect: "deck" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "updateDeck") {
        const payload = updateDeck(match.params.deckId, body);
        validateResponse({ statusCode: 200, body: payload, expect: "deck" });
        await persistNow("deck.update");
        broadcastDeckUpsert("deck.updated", payload);
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteDeck") {
        const force = parseBooleanQueryParam(parsedUrl.searchParams.get("force"), "force");
        const result = deleteDeck(match.params.deckId, { force });
        await persistNow("deck.delete");
        for (const sessionId of result.reassignedSessionIds) {
          broadcastSessionUpdated(sessionId);
        }
        broadcastDeckDeleted(result.deckId, result.fallbackDeckId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "moveSessionToDeck") {
        moveSessionToDeck(match.params.sessionId, match.params.deckId);
        await persistNow("deck.move-session");
        broadcastSessionUpdated(match.params.sessionId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listSessions") {
        const requestedDeckId = parsedUrl.searchParams.get("deckId");
        const deckIdFilter = typeof requestedDeckId === "string" && requestedDeckId.trim() ? requestedDeckId.trim() : "";
        const payload = listApiSessions({ deckId: deckIdFilter || undefined });
        validateResponse({ statusCode: 200, body: payload, expect: "sessionList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createSession") {
        const rateLimitResult = createSessionRateLimiter.check(requestContext.clientIp, config.rateLimitRestCreateMax);
        if (!rateLimitResult.allowed) {
          throw new ApiError(
            429,
            "RateLimitExceeded",
            `Session creation rate limit exceeded. Retry in ${rateLimitResult.retryAfterSeconds} seconds.`
          );
        }
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: body?.startCwd !== undefined ? body.startCwd : body?.cwd,
            startCommand: body?.startCommand,
            env: body?.env,
            fallbackCwd: body?.cwd
          },
          { strict: true }
        );
        const themeProfile = normalizeSessionThemeProfile(body?.themeProfile, { strict: true });
        const tags = normalizeSessionTags(body?.tags, { strict: true });
        const payload = manager.create({
          cwd: startupConfig.startCwd,
          shell: body?.shell,
          name: body?.name,
          startCwd: startupConfig.startCwd,
          startCommand: startupConfig.startCommand,
          env: startupConfig.env,
          tags,
          themeProfile
        });
        sessionDeckAssignments.set(payload.id, DEFAULT_DECK_ID);
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 201, body: apiPayload, expect: "session" });
        await persistNow("session.create");
        writeJson(req, res, 201, apiPayload);
        return;
      }

      if (match.kind === "getSession") {
        const payload = getApiSessionOrThrow(match.params.sessionId);
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteSession") {
        manager.delete(match.params.sessionId);
        sessionDeckAssignments.delete(match.params.sessionId);
        unrestoredSessions.delete(match.params.sessionId);
        await persistNow("session.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "updateSession") {
        const patch = {};
        if (body?.name !== undefined) {
          patch.name = body.name;
        }
        const hasStartupUpdates =
          body?.startCwd !== undefined || body?.startCommand !== undefined || body?.env !== undefined;
        if (hasStartupUpdates) {
          const current = manager.get(match.params.sessionId).meta;
          const startupConfig = normalizeSessionStartupConfig(
            {
              startCwd: body?.startCwd !== undefined ? body.startCwd : current.startCwd || current.cwd,
              startCommand: body?.startCommand !== undefined ? body.startCommand : current.startCommand || "",
              env: body?.env !== undefined ? body.env : current.env || {},
              fallbackCwd: current.startCwd || current.cwd
            },
            { strict: true }
          );
          patch.startCwd = startupConfig.startCwd;
          patch.startCommand = startupConfig.startCommand;
          patch.env = startupConfig.env;
        }
        if (body?.themeProfile !== undefined) {
          patch.themeProfile = normalizeSessionThemeProfile(body.themeProfile, { strict: true });
        }
        if (body?.tags !== undefined) {
          patch.tags = normalizeSessionTags(body.tags, { strict: true });
        }
        if (!Object.keys(patch).length) {
          throw new ApiError(400, "ValidationError", "No updatable session fields provided.");
        }
        const payload = manager.updateSession(match.params.sessionId, patch);
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
        await persistNow("session.update");
        broadcast({
          type: "session.updated",
          session: apiPayload
        });
        writeJson(req, res, 200, apiPayload);
        return;
      }

      if (match.kind === "input") {
        manager.sendInput(match.params.sessionId, body.data);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "resize") {
        manager.resize(match.params.sessionId, body.cols, body.rows);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "restart") {
        const payload = manager.restart(match.params.sessionId);
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
        await persistNow("session.restart");
        writeJson(req, res, 200, apiPayload);
        return;
      }

      throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
    } catch (err) {
      const mapped = toErrorResponse(err);
      validateResponse({ statusCode: mapped.statusCode, body: mapped.body, expect: "error" });
      writeJson(req, res, mapped.statusCode, mapped.body);
      logDebug("http.request.error", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: mapped.statusCode,
        error: mapped.body.error,
        message: mapped.body.message
      });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const requestContext = resolveRequestContext(request, config.trustedProxy);
    const requestUrl = new URL(request.url || "/", `${requestContext.protocol}://${requestContext.host}`);
    if (requestUrl.pathname !== "/ws") {
      logDebug("ws.upgrade.rejected", { pathname: requestUrl.pathname });
      socket.destroy();
      return;
    }
    if (config.enforceTlsIngress && requestContext.protocol !== "https") {
      const payload = {
        error: "TlsRequired",
        message: "TLS is required for this endpoint."
      };
      logDebug("ws.upgrade.tls_rejected", {
        clientIp: requestContext.clientIp,
        trustedProxy: requestContext.trustedProxy,
        protocol: requestContext.protocol
      });
      socket.write(
        `HTTP/1.1 426 Upgrade Required\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify(payload)}`
      );
      socket.destroy();
      return;
    }

    const wsRateLimitResult = wsConnectRateLimiter.check(requestContext.clientIp, config.rateLimitWsConnectMax);
    if (!wsRateLimitResult.allowed) {
      const payload = {
        error: "RateLimitExceeded",
        message: `WebSocket connection rate limit exceeded. Retry in ${wsRateLimitResult.retryAfterSeconds} seconds.`
      };
      logDebug("ws.upgrade.rate_limited", {
        clientIp: requestContext.clientIp,
        trustedProxy: requestContext.trustedProxy
      });
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nConnection: close\r\nRetry-After: ${wsRateLimitResult.retryAfterSeconds}\r\n\r\n${JSON.stringify(payload)}`
      );
      socket.destroy();
      return;
    }

    if (config.authEnabled) {
      try {
        const token = resolveBearerToken(request, requestUrl);
        const auth = verifyDevToken(token, {
          secret: config.authDevSecret,
          issuer: config.authIssuer,
          audience: config.authAudience
        });
        ensureScope(auth, "ws:connect");
      } catch (err) {
        const mapped = toErrorResponse(err);
        logDebug("ws.upgrade.auth_rejected", {
          statusCode: mapped.statusCode,
          error: mapped.body.error,
          message: mapped.body.message
        });
        socket.write(
          `HTTP/1.1 ${mapped.statusCode} ${mapped.body.error}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify(mapped.body)}`
        );
        socket.destroy();
        return;
      }
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      sockets.add(ws);
      metrics.wsConnectionsOpenedTotal += 1;
      ws.isAlive = true;
      logDebug("ws.upgrade.accepted", {
        socketCount: sockets.size,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      });

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("close", () => {
        sockets.delete(ws);
        metrics.wsConnectionsClosedTotal += 1;
        logDebug("ws.client.closed", { socketCount: sockets.size });
      });

      const snapshot = manager.getSnapshot();
      const snapshotSessions = listApiSessions();
      const customCommandSnapshot = listCustomCommands();
      ws.send(
        JSON.stringify({
          type: "snapshot",
          sessions: snapshotSessions,
          outputs: snapshot.outputs,
          customCommands: customCommandSnapshot,
          decks: listDecks()
        })
      );
      logDebug("ws.snapshot.sent", {
        sessionCount: snapshotSessions.length,
        outputCount: snapshot.outputs.length,
        customCommandCount: customCommandSnapshot.length
      });
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (!ws.isAlive) {
        ws.terminate();
        sockets.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  async function start() {
    isStopped = false;
    isStopping = false;
    isReady = false;

    const persistedState = await persistence.loadState();
    decks.clear();
    sessionDeckAssignments.clear();
    for (const persistedDeck of persistedState.decks) {
      const normalizedDeck = normalizeDeckEntity(persistedDeck);
      if (!normalizedDeck) {
        continue;
      }
      decks.set(normalizedDeck.id, normalizedDeck);
    }
    ensureDefaultDeck();
    logDebug("runtime.restore.start", {
      persistedSessionCount: persistedState.sessions.length,
      persistedCustomCommandCount: persistedState.customCommands.length,
      persistedDeckCount: persistedState.decks.length
    });
    for (const session of persistedState.sessions) {
      try {
        const persistedDeckId =
          typeof session.deckId === "string" && session.deckId && decks.has(session.deckId)
            ? session.deckId
            : DEFAULT_DECK_ID;
        sessionDeckAssignments.set(session.id, persistedDeckId);
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: session.startCwd !== undefined ? session.startCwd : session.cwd,
            startCommand: session.startCommand,
            env: session.env,
            fallbackCwd: session.cwd
          },
          { strict: false }
        );
        const themeProfile = normalizeSessionThemeProfile(session.themeProfile, { strict: false });
        const tags = normalizeSessionTags(session.tags, { strict: false });
        const requestedShell = typeof session.shell === "string" && session.shell.trim() ? session.shell : config.shell;
        const restoredCreatedAt = Number.isInteger(session.createdAt) ? session.createdAt : Date.now();
        const restoredUpdatedAt = Number.isInteger(session.updatedAt) ? session.updatedAt : restoredCreatedAt;
        const normalizedUnrestoredSession = {
          id: typeof session.id === "string" && session.id ? session.id : "",
          cwd:
            typeof session.cwd === "string" && session.cwd.trim()
              ? session.cwd
              : startupConfig.startCwd,
          shell: requestedShell,
          ...(typeof session.name === "string" ? { name: session.name } : {}),
          startCwd: startupConfig.startCwd,
          startCommand: startupConfig.startCommand,
          env: startupConfig.env,
          tags,
          themeProfile,
          deckId: persistedDeckId,
          createdAt: restoredCreatedAt,
          updatedAt: restoredUpdatedAt
        };
        const requestedCwd = startupConfig.startCwd;
        const fallbackCwd = homedir();
        const fallbackShell = config.shell;
        const restoreAttempts = [
          { shell: requestedShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "saved-shell+saved-cwd" },
          { shell: fallbackShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "fallback-shell+saved-cwd" },
          { shell: requestedShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "saved-shell+home-cwd" },
          { shell: fallbackShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "fallback-shell+home-cwd" }
        ];

        let restored = false;
        for (const attempt of restoreAttempts) {
          try {
            tryCreateRestoredSession({
              session,
              shell: attempt.shell,
              cwd: attempt.cwd,
              startCwd: attempt.startCwd,
              startCommand: startupConfig.startCommand,
              env: startupConfig.env,
              tags,
              themeProfile
            });
            restored = true;
            if (attempt.reason !== "saved-shell+saved-cwd") {
              logDebug("runtime.restore.session_fallback_applied", {
                sessionId: session.id,
                reason: attempt.reason,
                requestedShell,
                requestedStartCwd: requestedCwd,
                appliedShell: attempt.shell,
                appliedStartCwd: attempt.startCwd
              });
            }
            break;
          } catch (err) {
            logDebug("runtime.restore.session_attempt_failed", {
              sessionId: session.id,
              reason: attempt.reason,
              shell: attempt.shell,
              startCwd: attempt.startCwd,
              error: err?.message || String(err)
            });
          }
        }

        if (!restored) {
          unrestoredSessions.set(normalizedUnrestoredSession.id, normalizedUnrestoredSession);
          logDebug("runtime.restore.session_marked_unrestored", {
            sessionId: normalizedUnrestoredSession.id
          });
          throw new Error("all restore attempts failed");
        }
        unrestoredSessions.delete(normalizedUnrestoredSession.id);
      } catch (err) {
        console.error("failed to restore session", session.id, err);
      }
    }
    const restoreCandidates = [];
    for (const customCommand of persistedState.customCommands) {
      if (!customCommand || typeof customCommand.name !== "string" || typeof customCommand.content !== "string") {
        continue;
      }
      const normalizedName = normalizeCustomCommandName(customCommand.name);
      const now = Date.now();
      const candidate = {
        name: normalizedName,
        content: customCommand.content,
        createdAt: Number.isInteger(customCommand.createdAt) && customCommand.createdAt > 0 ? customCommand.createdAt : now,
        updatedAt: Number.isInteger(customCommand.updatedAt) && customCommand.updatedAt > 0 ? customCommand.updatedAt : now
      };
      if (
        candidate.name.length > customCommandMaxNameLength ||
        !CUSTOM_COMMAND_NAME_PATTERN.test(candidate.name) ||
        CUSTOM_COMMAND_RESERVED_NAMES.has(candidate.name) ||
        candidate.content.length > customCommandMaxContentLength
      ) {
        continue;
      }
      restoreCandidates.push(candidate);
    }
    restoreCandidates.sort(compareCustomCommandEntries);
    for (const candidate of restoreCandidates) {
      if (customCommands.has(candidate.name)) {
        customCommands.set(candidate.name, candidate);
        continue;
      }
      if (customCommands.size >= customCommandMaxCount) {
        continue;
      }
      customCommands.set(candidate.name, candidate);
    }
    logDebug("runtime.restore.done", {
      restoredSessionCount: manager.list().length,
      unrestoredSessionCount: unrestoredSessions.size,
      restoredCustomCommandCount: customCommands.size,
      restoredDeckCount: decks.size
    });

    await new Promise((resolve) => {
      server.listen(config.port, resolve);
    });
    if (typeof config.onBeforeReady === "function") {
      await config.onBeforeReady();
    }
    isReady = true;
    logDebug("runtime.ready", { port: config.port, sessionCount: manager.list().length });
  }

  async function stopInternal() {
    isStopping = true;
    isReady = false;
    clearInterval(heartbeat);
    clearInterval(guardrailTimer);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    for (const ws of sockets) {
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();

    const persistedSnapshot = snapshotRuntimeState();
    logDebug("runtime.stop.start", {
      sessionCount: persistedSnapshot.sessions.length,
      customCommandCount: persistedSnapshot.customCommands.length,
      deckCount: persistedSnapshot.decks.length,
      socketCount: sockets.size
    });

    for (const session of manager.list()) {
      try {
        manager.delete(session.id);
      } catch {
        // Ignore cleanup errors.
      }
    }

    await persistence.saveState(persistedSnapshot);
    logDebug("runtime.stop.persisted", {
      persistedSessionCount: persistedSnapshot.sessions.length,
      persistedCustomCommandCount: persistedSnapshot.customCommands.length,
      persistedDeckCount: persistedSnapshot.decks.length
    });

    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }

    isStopped = true;
    isStopping = false;
    logDebug("runtime.stop.done", {});
  }

  async function stop() {
    if (isStopped) {
      return;
    }
    if (stopPromise) {
      return stopPromise;
    }
    stopPromise = stopInternal().finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  }

  function getAddress() {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      return null;
    }
    return addr;
  }

  return {
    manager,
    server,
    start,
    stop,
    getAddress
  };
}
