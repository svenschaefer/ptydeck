import http from "node:http";
import { URL } from "node:url";
import { loadConfig } from "./config.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { SessionManager } from "./session-manager.js";
import { validateRequest, validateResponse } from "./validation.js";

const config = loadConfig();
const manager = new SessionManager({ defaultShell: config.shell });

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
      const payload = { status: "ok" };
      writeJson(res, 200, payload);
      return;
    }

    if (match.kind === "ready") {
      const payload = { status: "ready" };
      writeJson(res, 200, payload);
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
      writeJson(res, 204);
      return;
    }

    if (match.kind === "input") {
      manager.sendInput(match.params.sessionId, body.data);
      writeJson(res, 204);
      return;
    }

    if (match.kind === "resize") {
      manager.resize(match.params.sessionId, body.cols, body.rows);
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

server.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
