import { URL } from "node:url";

import { ensureScope, resolveBearerToken } from "./auth.js";
import { toErrorResponse } from "./errors.js";

function writeUpgradeErrorResponse(socket, statusCode, reasonPhrase, body, extraHeaders = {}) {
  const headerLines = [`HTTP/1.1 ${statusCode} ${reasonPhrase}`, "Content-Type: application/json", "Connection: close"];
  for (const [name, value] of Object.entries(extraHeaders)) {
    headerLines.push(`${name}: ${value}`);
  }
  socket.write(`${headerLines.join("\r\n")}\r\n\r\n${JSON.stringify(body)}`);
  socket.destroy();
}

export function createRuntimeWsUpgradeHandler(dependencies = {}) {
  const {
    config = {},
    resolveRequestContext = () => ({ protocol: "http", host: "127.0.0.1", clientIp: "", trustedProxy: false }),
    buildRequestTraceContext = () => ({}),
    resolveAllowedRequestOrigin = () => "",
    wsConnectRateLimiter = { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    accessTokenVerifier = { verifyAccessToken: async () => null },
    wsTicketRegistry = { consume: () => null },
    resolveWsTicketFromProtocols = () => "",
    ensureShareLinkAuthActive = () => {},
    ensureShareRouteAllowed = () => {},
    logDebug = () => {},
    recordWsError = () => {},
    wsServer = { handleUpgrade: () => {} },
    onAccepted = () => {}
  } = dependencies;

  return async function handleRuntimeWsUpgrade(request, socket, head) {
    try {
      const requestContext = resolveRequestContext(request, config.trustedProxy);
      const requestUrl = new URL(request.url || "/", `${requestContext.protocol}://${requestContext.host}`);
      const requestOrigin = typeof request.headers?.origin === "string" ? request.headers.origin : "";
      const upgradeTraceContext = buildRequestTraceContext(request, requestContext, requestUrl.pathname);

      if (requestUrl.pathname !== "/ws") {
        recordWsError("upgrade_path_rejected");
        logDebug("ws.upgrade.rejected", { pathname: requestUrl.pathname }, upgradeTraceContext);
        socket.destroy();
        return false;
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
        }, upgradeTraceContext);
        recordWsError("upgrade_tls_rejected");
        writeUpgradeErrorResponse(socket, 426, "Upgrade Required", payload);
        return false;
      }

      const allowedRequestOrigin = resolveAllowedRequestOrigin(requestOrigin);
      if (!allowedRequestOrigin) {
        const payload = {
          error: "UnauthorizedOrigin",
          message: "WebSocket origin is not allowed."
        };
        logDebug("ws.upgrade.origin_rejected", {
          clientIp: requestContext.clientIp,
          trustedProxy: requestContext.trustedProxy,
          origin: requestOrigin || null
        }, upgradeTraceContext);
        recordWsError("upgrade_origin_rejected");
        writeUpgradeErrorResponse(socket, 403, "Forbidden", payload, { Vary: "Origin" });
        return false;
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
        }, upgradeTraceContext);
        recordWsError("upgrade_rate_limited");
        writeUpgradeErrorResponse(socket, 429, "Too Many Requests", payload, {
          "Retry-After": wsRateLimitResult.retryAfterSeconds
        });
        return false;
      }

      let auth = null;
      if (config.authEnabled) {
        try {
          const token = resolveBearerToken(request, requestUrl);
          auth = token
            ? await accessTokenVerifier.verifyAccessToken(token)
            : wsTicketRegistry.consume(resolveWsTicketFromProtocols(request));
          ensureShareLinkAuthActive(auth);
          ensureScope(auth, "ws:connect");
          ensureShareRouteAllowed(auth, "wsTicket");
        } catch (error) {
          const mapped = toErrorResponse(error);
          logDebug("ws.upgrade.auth_rejected", {
            statusCode: mapped.statusCode,
            error: mapped.body.error,
            message: mapped.body.message
          }, upgradeTraceContext);
          recordWsError("upgrade_auth_rejected");
          writeUpgradeErrorResponse(socket, mapped.statusCode, mapped.body.error, mapped.body);
          return false;
        }
      }

      wsServer.handleUpgrade(request, socket, head, (ws) => {
        onAccepted(ws, {
          auth,
          requestContext,
          requestOrigin,
          requestUrl,
          upgradeTraceContext
        });
      });
      return true;
    } catch (error) {
      const mapped = toErrorResponse(error);
      logDebug("ws.upgrade.error", {
        statusCode: mapped.statusCode,
        error: mapped.body.error,
        message: mapped.body.message
      });
      recordWsError("upgrade_internal_error");
      writeUpgradeErrorResponse(socket, mapped.statusCode, mapped.body.error, mapped.body);
      return false;
    }
  };
}
