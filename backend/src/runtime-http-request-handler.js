import { createHttpAuditEvent } from "./audit-log.js";
import { createDevToken } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { requiredScopeForRoute } from "./runtime-http-helpers.js";
import { matchRuntimeRoute, normalizeRuntimeMetricsPath } from "./runtime-route-table.js";
import {
  buildRuntimeHealthPayload,
  buildRuntimeReadyPayload,
  renderRuntimeMetrics
} from "./runtime-status-reporting.js";

export function createRuntimeHttpRequestHandler(dependencies = {}) {
  const {
    config = {
      authEnabled: false,
      authDevMode: false,
      authDevSecret: "",
      authIssuer: "",
      authAudience: "",
      authDevTokenTtlSeconds: 0
    },
    maxBodyBytes = 1024 * 1024,
    metrics = {
      httpRequestsTotal: 0,
      httpDurationMsCount: 0,
      httpDurationMsSum: 0,
      httpErrorsTotal: 0,
      httpRequestsByStatus: new Map(),
      httpRequestsByRoute: new Map()
    },
    recordHttpDuration = () => {},
    bumpMetricCounter = () => {},
    logDebug = () => {},
    resolveRequestContext = () => ({
      protocol: "http",
      host: "127.0.0.1",
      clientIp: "127.0.0.1",
      trustedProxy: false
    }),
    buildRequestTraceContext = () => null,
    normalizeRuntimeMetricsPathImpl = normalizeRuntimeMetricsPath,
    matchRuntimeRouteImpl = matchRuntimeRoute,
    parseJsonBody = async () => undefined,
    validateRequest = () => {},
    validateResponse = () => {},
    ensureTlsIngress = () => {},
    authenticateRequest = async () => null,
    writeJson = (req, res, statusCode, body) => {
      res.writeHead(statusCode, { "content-type": "application/json" });
      if (body === undefined) {
        res.end();
        return;
      }
      res.end(JSON.stringify(body));
    },
    buildSecurityHeaders = () => ({}),
    buildTraceHeaders = () => ({}),
    requiredScopeForRouteImpl = requiredScopeForRoute,
    createDevTokenImpl = createDevToken,
    toErrorResponseImpl = toErrorResponse,
    createHttpAuditEventImpl = createHttpAuditEvent,
    auditLogger = {
      write: async () => {}
    },
    getIsReady = () => false,
    startupWarmup = {
      getState: () => ({
        gateReleased: false,
        enabled: false,
        quietMs: 0,
        quietDeadlineAt: 0
      })
    },
    manager = {
      list: () => []
    },
    unrestoredSessions = new Map(),
    sockets = new Set(),
    httpDurationBucketsMs = [],
    escapePrometheusLabel = (value) => String(value),
    wsTicketRegistry = {
      issue: () => null
    },
    messagingRuntime = {
      buildStatusSummary: () => ({}),
      renderMetricLines: () => []
    },
    sessionStreamAnalysisCapture = {
      buildStatusSummary: () => ({})
    },
    dispatchResourceRequest = async () => false,
    dispatchSessionRequest = async () => false,
    dispatchSessionControlRequest = async () => false,
    buildRuntimeHealthPayloadImpl = buildRuntimeHealthPayload,
    buildRuntimeReadyPayloadImpl = buildRuntimeReadyPayload,
    renderRuntimeMetricsImpl = renderRuntimeMetrics
  } = dependencies;

  return async function handleRuntimeHttpRequest(req, res) {
    const startedAt = Date.now();
    const methodForLog = req.method || "GET";
    let pathnameForLog = req.url || "/";
    let normalizedMetricsPathForLog = pathnameForLog;
    let requestTraceContext = null;
    let requestContextForAudit = null;
    let routeKindForAudit = "";
    let routeParamsForAudit = {};
    let authForAudit = null;
    let targetForAudit = {};
    let metadataForAudit = {};
    let errorCodeForAudit = "";
    let writeJsonResponse = (statusCode, body) => writeJson(req, res, statusCode, body, requestTraceContext);

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = String(res.statusCode);
      const routeKey = `${methodForLog} ${normalizedMetricsPathForLog}`;
      metrics.httpRequestsTotal += 1;
      metrics.httpDurationMsCount += 1;
      metrics.httpDurationMsSum += durationMs;
      recordHttpDuration(durationMs);
      if (res.statusCode >= 400) {
        metrics.httpErrorsTotal += 1;
      }
      bumpMetricCounter(metrics.httpRequestsByStatus, statusCode);
      bumpMetricCounter(metrics.httpRequestsByRoute, routeKey);
      logDebug("http.request.done", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: res.statusCode,
        durationMs
      }, requestTraceContext);
      void auditLogger.write(createHttpAuditEventImpl({
        auth: authForAudit,
        authEnabled: config.authEnabled,
        errorCode: errorCodeForAudit,
        metadata: metadataForAudit,
        method: methodForLog,
        params: routeParamsForAudit,
        pathname: pathnameForLog,
        requestContext: requestContextForAudit,
        routeKind: routeKindForAudit,
        statusCode: res.statusCode,
        target: targetForAudit,
        traceContext: requestTraceContext
      }));
    });

    try {
      const requestContext = resolveRequestContext(req, config.trustedProxy);
      requestContextForAudit = requestContext;
      const parsedUrl = new URL(req.url || "/", `${requestContext.protocol}://${requestContext.host}`);
      pathnameForLog = parsedUrl.pathname;
      normalizedMetricsPathForLog = normalizeRuntimeMetricsPathImpl(parsedUrl.pathname);
      requestTraceContext = buildRequestTraceContext(req, requestContext, parsedUrl.pathname);
      logDebug("http.request.start", {
        method: methodForLog,
        pathname: pathnameForLog,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      }, requestTraceContext);

      if (req.method === "OPTIONS") {
        ensureTlsIngress(requestContext);
        writeJsonResponse(204);
        return;
      }

      const match = matchRuntimeRouteImpl(parsedUrl.pathname, req.method || "GET");
      const body = await parseJsonBody(req, maxBodyBytes);
      const params = match.params || {};
      routeKindForAudit = match.kind;
      routeParamsForAudit = params;

      validateRequest({
        method: req.method || "GET",
        pathname: parsedUrl.pathname,
        params,
        query: Object.fromEntries(parsedUrl.searchParams.entries()),
        body
      });
      ensureTlsIngress(requestContext);

      if (match.kind === "health") {
        writeJsonResponse(200, buildRuntimeHealthPayloadImpl({
          messagingStatusSummary: messagingRuntime.buildStatusSummary(),
          streamAnalysisStatusSummary: sessionStreamAnalysisCapture.buildStatusSummary()
        }));
        return;
      }

      if (match.kind === "ready") {
        const startupWarmupState = startupWarmup.getState();
        writeJsonResponse(200, buildRuntimeReadyPayloadImpl({
          isReady: getIsReady(),
          startupWarmupGateReleased: startupWarmupState.gateReleased,
          startupWarmupEnabled: startupWarmupState.enabled,
          startupWarmupQuietMs: startupWarmupState.quietMs,
          startupWarmupQuietDeadlineAt: startupWarmupState.quietDeadlineAt,
          sessions: manager.list(),
          messagingStatusSummary: messagingRuntime.buildStatusSummary(),
          streamAnalysisStatusSummary: sessionStreamAnalysisCapture.buildStatusSummary()
        }));
        return;
      }

      if (match.kind === "metrics") {
        const payload = renderRuntimeMetricsImpl({
          sessions: manager.list(),
          unrestoredSessionCount: unrestoredSessions.size,
          wsConnectionCount: sockets.size,
          metrics,
          httpDurationBucketsMs,
          escapePrometheusLabel,
          messagingMetricLines: messagingRuntime.renderMetricLines()
        });
        res.writeHead(200, {
          ...buildSecurityHeaders(),
          ...buildTraceHeaders(requestTraceContext),
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
          accessToken: createDevTokenImpl({
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
        writeJsonResponse(200, payload);
        return;
      }

      if (match.kind === "wsTicket") {
        const auth = await authenticateRequest(req, parsedUrl, requiredScopeForRouteImpl(match.kind), match.kind, {
          onAuthenticated: (authenticated) => {
            authForAudit = authenticated;
          }
        });
        const payload = wsTicketRegistry.issue(auth, body);
        validateResponse({ statusCode: 200, body: payload, expect: "wsTicket" });
        writeJsonResponse(200, payload);
        return;
      }

      let auth = null;
      if (match.kind !== "notFound") {
        auth = await authenticateRequest(req, parsedUrl, requiredScopeForRouteImpl(match.kind), match.kind, {
          onAuthenticated: (authenticated) => {
            authForAudit = authenticated;
          }
        });
      }

      if (await dispatchResourceRequest({
        match,
        parsedUrl,
        body,
        auth,
        req,
        requestContext,
        requestTraceContext,
        writeJsonResponse
      })) {
        return;
      }

      if (await dispatchSessionRequest({
        match,
        parsedUrl,
        body,
        auth,
        req,
        requestContext,
        requestTraceContext,
        setAuditContext: ({ target, metadata } = {}) => {
          if (target) {
            targetForAudit = target;
          }
          if (metadata) {
            metadataForAudit = {
              ...metadataForAudit,
              ...metadata
            };
          }
        },
        writeJsonResponse
      })) {
        return;
      }

      if (await dispatchSessionControlRequest({
        match,
        body,
        auth,
        req,
        requestTraceContext,
        writeJsonResponse
      })) {
        return;
      }

      throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
    } catch (error) {
      const mapped = toErrorResponseImpl(error);
      errorCodeForAudit = typeof mapped.body?.error === "string" ? mapped.body.error : "";
      validateResponse({ statusCode: mapped.statusCode, body: mapped.body, expect: "error" });
      writeJsonResponse(mapped.statusCode, mapped.body);
      logDebug("http.request.error", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: mapped.statusCode,
        error: mapped.body.error,
        message: mapped.body.message
      }, requestTraceContext);
    }
  };
}
