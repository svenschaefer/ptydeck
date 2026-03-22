import http from "node:http";
import { appendFile } from "node:fs/promises";
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

export function createRuntime(config) {
  const maxBodyBytes =
    Number.isFinite(config.maxBodyBytes) && config.maxBodyBytes > 0 ? config.maxBodyBytes : 1024 * 1024;
  const debugLogs = config.debugLogs === true;
  const manager = new SessionManager({
    defaultShell: config.shell,
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
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type"
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
    if (!customCommands.has(normalizedName)) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    customCommands.delete(normalizedName);
  }

  function snapshotRuntimeState() {
    return {
      sessions: manager.list(),
      customCommands: listCustomCommands()
    };
  }

  function persistSoon() {
    if (isStopping) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      const state = snapshotRuntimeState();
      logDebug("persist.save.start", {
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length
      });
      await persistence.saveState(state);
      logDebug("persist.save.ok", {
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length
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

  const wsEventNames = ["session.created", "session.data", "session.exit", "session.closed"];
  for (const eventName of wsEventNames) {
    manager.on(eventName, (event) => {
      if (eventName !== "session.data") {
        logDebug("session.event", { type: eventName, sessionId: event.session?.id || event.sessionId || null });
      }
      broadcast({ type: eventName, ...event });
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
        const payload = upsertCustomCommand(match.params.commandName, body.content);
        validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
        persistSoon();
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteCustomCommand") {
        deleteCustomCommand(match.params.commandName);
        persistSoon();
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listSessions") {
        const payload = manager.list();
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
        const payload = manager.create({ cwd: body?.cwd, shell: body?.shell });
        validateResponse({ statusCode: 201, body: payload, expect: "session" });
        persistSoon();
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getSession") {
        const payload = manager.get(match.params.sessionId).meta;
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteSession") {
        manager.delete(match.params.sessionId);
        persistSoon();
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "updateSession") {
        const payload = manager.rename(match.params.sessionId, body.name);
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        persistSoon();
        writeJson(req, res, 200, payload);
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
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        persistSoon();
        writeJson(req, res, 200, payload);
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
      ws.send(JSON.stringify({ type: "snapshot", sessions: snapshot.sessions, outputs: snapshot.outputs }));
      logDebug("ws.snapshot.sent", { sessionCount: snapshot.sessions.length, outputCount: snapshot.outputs.length });
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
    logDebug("runtime.restore.start", {
      persistedSessionCount: persistedState.sessions.length,
      persistedCustomCommandCount: persistedState.customCommands.length
    });
    for (const session of persistedState.sessions) {
      try {
        manager.create({
          id: session.id,
          cwd: session.cwd,
          shell: session.shell || config.shell,
          name: session.name,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        });
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
      restoredCustomCommandCount: customCommands.size
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
      persistedCustomCommandCount: persistedSnapshot.customCommands.length
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
