import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { ApiError, toErrorResponse } from "./errors.js";
import { JsonPersistence } from "./persistence.js";
import { SessionManager } from "./session-manager.js";
import { validateRequest, validateResponse } from "./validation.js";

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      if (!data) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new ApiError(400, "InvalidJson", "Malformed JSON body."));
      }
    });

    req.on("error", (err) => reject(err));
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

  const getSessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (getSessionMatch && method === "GET") {
    return { kind: "getSession", params: { sessionId: getSessionMatch[1] } };
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

  return { kind: "notFound" };
}

export function createRuntime(config) {
  const manager = new SessionManager({ defaultShell: config.shell });
  const persistence = new JsonPersistence(config.dataPath);
  const wsServer = new WebSocketServer({ noServer: true });
  const sockets = new Set();
  let isReady = false;
  let persistTimer = null;

  function writeJson(res, statusCode, body) {
    res.writeHead(statusCode, {
      "content-type": "application/json",
      "access-control-allow-origin": config.corsOrigin,
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type"
    });

    if (body === undefined) {
      res.end();
      return;
    }

    res.end(JSON.stringify(body));
  }

  function persistSoon() {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      await persistence.save(manager.list());
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
      broadcast({ type: eventName, ...event });
      if (eventName !== "session.data") {
        persistSoon();
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      if (req.method === "OPTIONS") {
        writeJson(res, 204);
        return;
      }

      const match = route(parsedUrl.pathname, req.method || "GET");
      const body = await parseJsonBody(req);
      const params = match.params || {};

      validateRequest({
        method: req.method || "GET",
        pathname: parsedUrl.pathname,
        params,
        body
      });

      if (match.kind === "health") {
        writeJson(res, 200, { status: "ok" });
        return;
      }

      if (match.kind === "ready") {
        writeJson(res, 200, { status: isReady ? "ready" : "starting" });
        return;
      }

      if (match.kind === "listSessions") {
        const payload = manager.list();
        validateResponse({ statusCode: 200, body: payload, expect: "sessionList" });
        writeJson(res, 200, payload);
        return;
      }

      if (match.kind === "createSession") {
        const payload = manager.create({ cwd: body?.cwd, shell: body?.shell });
        validateResponse({ statusCode: 201, body: payload, expect: "session" });
        persistSoon();
        writeJson(res, 201, payload);
        return;
      }

      if (match.kind === "getSession") {
        const payload = manager.get(match.params.sessionId).meta;
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        writeJson(res, 200, payload);
        return;
      }

      if (match.kind === "deleteSession") {
        manager.delete(match.params.sessionId);
        persistSoon();
        writeJson(res, 204);
        return;
      }

      if (match.kind === "input") {
        manager.sendInput(match.params.sessionId, body.data);
        persistSoon();
        writeJson(res, 204);
        return;
      }

      if (match.kind === "resize") {
        manager.resize(match.params.sessionId, body.cols, body.rows);
        persistSoon();
        writeJson(res, 204);
        return;
      }

      throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
    } catch (err) {
      const mapped = toErrorResponse(err);
      validateResponse({ statusCode: mapped.statusCode, body: mapped.body, expect: "error" });
      writeJson(res, mapped.statusCode, mapped.body);
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (requestUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      sockets.add(ws);
      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("close", () => {
        sockets.delete(ws);
      });

      ws.send(JSON.stringify({ type: "snapshot", sessions: manager.list() }));
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
    const persisted = await persistence.load();
    for (const session of persisted) {
      try {
        manager.create({
          id: session.id,
          cwd: session.cwd || process.cwd(),
          shell: session.shell || config.shell
        });
      } catch (err) {
        console.error("failed to restore session", session.id, err);
      }
    }

    await new Promise((resolve) => {
      server.listen(config.port, resolve);
    });
    isReady = true;
  }

  async function stop() {
    clearInterval(heartbeat);
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    for (const ws of sockets) {
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();

    for (const session of manager.list()) {
      try {
        manager.delete(session.id);
      } catch {
        // Ignore cleanup errors.
      }
    }

    await persistence.save(manager.list());
    await new Promise((resolve) => server.close(resolve));
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
