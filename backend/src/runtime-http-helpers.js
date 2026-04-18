import { ensureScope, resolveBearerToken, verifyDevToken } from "./auth.js";
import { ApiError } from "./errors.js";

export function requiredScopeForRoute(kind) {
  if (kind === "listShares" || kind === "getShareLink") {
    return "sessions:read";
  }
  if (kind === "createShareLink" || kind === "revokeShareLink") {
    return "sessions:write";
  }
  if (kind === "listDecks" || kind === "getDeck") {
    return "sessions:read";
  }
  if (kind === "createDeck" || kind === "updateDeck" || kind === "deleteDeck" || kind === "moveSessionToDeck") {
    return "sessions:write";
  }
  if (kind === "listWorkspacePresets" || kind === "getWorkspacePreset") {
    return "sessions:read";
  }
  if (kind === "createWorkspacePreset" || kind === "updateWorkspacePreset" || kind === "deleteWorkspacePreset") {
    return "sessions:write";
  }
  if (kind === "listConnectionProfiles" || kind === "getConnectionProfile") {
    return "sessions:read";
  }
  if (kind === "createConnectionProfile" || kind === "updateConnectionProfile" || kind === "deleteConnectionProfile") {
    return "sessions:write";
  }
  if (kind === "listSshTrustEntries" || kind === "probeSshHostKeys") {
    return "sessions:read";
  }
  if (kind === "createSshTrustEntry" || kind === "deleteSshTrustEntry") {
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
  if (kind === "getSessionReplayExport" || kind === "getSessionReplayExcerpt" || kind === "downloadSessionFile") {
    return "sessions:read";
  }
  if (kind === "createSession") {
    return "sessions:create";
  }
  if (kind === "wsTicket") {
    return "ws:connect";
  }
  if (kind === "deleteSession") {
    return "sessions:delete";
  }
  if (
    kind === "updateSession" ||
    kind === "uploadSessionFile" ||
    kind === "input" ||
    kind === "resize" ||
    kind === "takeSessionControl" ||
    kind === "takeSessionControlScope" ||
    kind === "releaseSessionControl" ||
    kind === "transferSessionControl" ||
    kind === "renameSessionControlClient" ||
    kind === "forgetSessionControlClient" ||
    kind === "restart" ||
    kind === "interrupt" ||
    kind === "terminate" ||
    kind === "kill"
  ) {
    return "sessions:write";
  }
  return "";
}

export function createRuntimeHttpHelpers({
  config,
  corsAllowedOrigins = [],
  traceHeaderId,
  traceHeaderCorrelationId,
  sessionControlClientIdHeader,
  normalizeTraceSeed,
  ensureShareLinkAuthActive = () => null,
  ensureShareRouteAllowed = () => {}
}) {
  function buildTraceHeaders(traceContext) {
    const normalizedTrace = normalizeTraceSeed(traceContext);
    if (!normalizedTrace) {
      return {};
    }
    return {
      ...(normalizedTrace.traceId ? { [traceHeaderId]: normalizedTrace.traceId } : {}),
      ...(normalizedTrace.correlationId ? { [traceHeaderCorrelationId]: normalizedTrace.correlationId } : {})
    };
  }

  function resolveAllowedRequestOrigin(requestOrigin) {
    const allowAnyOrigin = corsAllowedOrigins.includes("*");
    if (allowAnyOrigin) {
      return "*";
    }
    if (requestOrigin && corsAllowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    return "";
  }

  function buildSecurityHeaders() {
    return {
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    };
  }

  function buildCorsHeaders(req, traceContext = null) {
    const requestOrigin = typeof req?.headers?.origin === "string" ? req.headers.origin : "";
    const allowAnyOrigin = corsAllowedOrigins.includes("*");
    const allowedOrigin = resolveAllowedRequestOrigin(requestOrigin);

    const headers = {
      ...buildSecurityHeaders(),
      "content-type": "application/json",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": `content-type,authorization,${traceHeaderCorrelationId},${sessionControlClientIdHeader}`,
      "access-control-expose-headers": `${traceHeaderId},${traceHeaderCorrelationId}`,
      ...buildTraceHeaders(traceContext)
    };

    if (allowedOrigin) {
      headers["access-control-allow-origin"] = allowedOrigin;
    }
    if (!allowAnyOrigin) {
      headers.vary = "origin";
    }

    return headers;
  }

  function writeJson(req, res, statusCode, body, traceContext = null) {
    res.writeHead(statusCode, buildCorsHeaders(req, traceContext));
    if (body === undefined) {
      res.end();
      return;
    }
    res.end(JSON.stringify(body));
  }

  function authenticateRequest(req, parsedUrl, requiredScope, routeKind = "") {
    if (!config.authEnabled) {
      return null;
    }
    const token = resolveBearerToken(req, parsedUrl);
    const auth = verifyDevToken(token, {
      secret: config.authDevSecret,
      issuer: config.authIssuer,
      audience: config.authAudience
    });
    ensureShareLinkAuthActive(auth);
    ensureScope(auth, requiredScope);
    ensureShareRouteAllowed(auth, routeKind);
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

  return {
    authenticateRequest,
    buildCorsHeaders,
    buildSecurityHeaders,
    buildTraceHeaders,
    ensureTlsIngress,
    resolveAllowedRequestOrigin,
    writeJson
  };
}
