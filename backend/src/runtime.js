import http from "node:http";
import { appendFile } from "node:fs/promises";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { createDevToken, ensureScope, resolveBearerToken, verifyDevToken } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { JsonPersistence } from "./persistence.js";
import { SessionManager } from "./session-manager.js";
import { validateRequest, validateResponse } from "./validation.js";

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
  if (pathname === "/api/v1/sessions" && method === "GET") {
    return { kind: "listSessions" };
  }
  if (pathname === "/api/v1/sessions" && method === "POST") {
    return { kind: "createSession" };
  }
  if (pathname === "/api/v1/auth/dev-token" && method === "POST") {
    return { kind: "devToken" };
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

export function createRuntime(config) {
  const maxBodyBytes =
    Number.isFinite(config.maxBodyBytes) && config.maxBodyBytes > 0 ? config.maxBodyBytes : 1024 * 1024;
  const debugLogs = config.debugLogs === true;
  const manager = new SessionManager({ defaultShell: config.shell });
  const persistence = new JsonPersistence(config.dataPath);
  const wsServer = new WebSocketServer({ noServer: true });
  const sockets = new Set();
  let isReady = false;
  let isStopping = false;
  let isStopped = false;
  let stopPromise = null;
  let persistTimer = null;
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

  function writeJson(req, res, statusCode, body) {
    res.writeHead(statusCode, buildCorsHeaders(req));

    if (body === undefined) {
      res.end();
      return;
    }

    res.end(JSON.stringify(body));
  }

  function requiredScopeForRoute(kind) {
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

  function persistSoon() {
    if (isStopping) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      logDebug("persist.save.start", { sessionCount: manager.list().length });
      await persistence.save(manager.list());
      logDebug("persist.save.ok", { sessionCount: manager.list().length });
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
    res.on("finish", () => {
      logDebug("http.request.done", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });

    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      pathnameForLog = parsedUrl.pathname;
      logDebug("http.request.start", { method: methodForLog, pathname: pathnameForLog });

      if (req.method === "OPTIONS") {
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

      if (match.kind === "health") {
        writeJson(req, res, 200, { status: "ok" });
        return;
      }

      if (match.kind === "ready") {
        writeJson(req, res, 200, { status: isReady ? "ready" : "starting" });
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

      if (match.kind === "listSessions") {
        const payload = manager.list();
        validateResponse({ statusCode: 200, body: payload, expect: "sessionList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createSession") {
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
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (requestUrl.pathname !== "/ws") {
      logDebug("ws.upgrade.rejected", { pathname: requestUrl.pathname });
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
      ws.isAlive = true;
      logDebug("ws.upgrade.accepted", { socketCount: sockets.size });

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("close", () => {
        sockets.delete(ws);
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

    const persisted = await persistence.load();
    logDebug("runtime.restore.start", { persistedSessionCount: persisted.length });
    for (const session of persisted) {
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
    logDebug("runtime.restore.done", { restoredSessionCount: manager.list().length });

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
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    for (const ws of sockets) {
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();

    const persistedSnapshot = manager.list().map((session) => ({ ...session }));
    logDebug("runtime.stop.start", { sessionCount: persistedSnapshot.length, socketCount: sockets.size });

    for (const session of manager.list()) {
      try {
        manager.delete(session.id);
      } catch {
        // Ignore cleanup errors.
      }
    }

    await persistence.save(persistedSnapshot);
    logDebug("runtime.stop.persisted", { persistedSessionCount: persistedSnapshot.length });

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
