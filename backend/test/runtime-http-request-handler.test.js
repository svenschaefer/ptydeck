import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { ApiError } from "../src/errors.js";
import { createRuntimeHttpRequestHandler } from "../src/runtime-http-request-handler.js";

function createMetrics() {
  return {
    httpRequestsTotal: 0,
    httpDurationMsCount: 0,
    httpDurationMsSum: 0,
    httpErrorsTotal: 0,
    httpRequestsByStatus: new Map(),
    httpRequestsByRoute: new Map()
  };
}

function bumpMetricCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.body = "";
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(body = "") {
    this.body = body;
    this.emit("finish");
  }
}

function createRequest({ method = "GET", url = "/", headers = {} } = {}) {
  return {
    method,
    url,
    headers
  };
}

function parseJsonBodyOrUndefined(bodyByPath, req) {
  if (bodyByPath instanceof Map) {
    return bodyByPath.get(req.url) ?? undefined;
  }
  if (typeof bodyByPath === "function") {
    return bodyByPath(req);
  }
  return undefined;
}

function createHandlerHarness(overrides = {}) {
  const metrics = overrides.metrics || createMetrics();
  const observed = {
    authCalls: [],
    dispatchCalls: [],
    validateCalls: [],
    traceCalls: [],
    debugCalls: [],
    auditEvents: [],
    durationCalls: [],
    bodyParses: []
  };

  const handler = createRuntimeHttpRequestHandler({
    config: {
      authEnabled: false,
      authDevMode: false,
      authDevSecret: "dev-secret",
      authIssuer: "ptydeck",
      authAudience: "ptydeck-users",
      authDevTokenTtlSeconds: 60,
      trustedProxy: false,
      enforceTlsIngress: false,
      ...overrides.config
    },
    maxBodyBytes: 4096,
    metrics,
    bumpMetricCounter,
    recordHttpDuration(durationMs) {
      observed.durationCalls.push(durationMs);
      if (typeof overrides.recordHttpDuration === "function") {
        overrides.recordHttpDuration(durationMs);
      }
    },
    logDebug(event, details, trace) {
      observed.debugCalls.push([event, details, trace]);
      if (typeof overrides.logDebug === "function") {
        overrides.logDebug(event, details, trace);
      }
    },
    resolveRequestContext(req) {
      return typeof overrides.resolveRequestContext === "function"
        ? overrides.resolveRequestContext(req)
        : {
            protocol: "https",
            host: "ptydeck.local",
            clientIp: "127.0.0.1",
            trustedProxy: false
          };
    },
    buildRequestTraceContext(req, requestContext, pathname) {
      observed.traceCalls.push([req.method, pathname, requestContext.clientIp]);
      if (typeof overrides.buildRequestTraceContext === "function") {
        return overrides.buildRequestTraceContext(req, requestContext, pathname);
      }
      return {
        traceId: "trace-1",
        correlationId: "corr-1",
        requestId: "req-1"
      };
    },
    parseJsonBody: async (req, maxBodyBytes) => {
      observed.bodyParses.push([req.url, maxBodyBytes]);
      if (typeof overrides.parseJsonBody === "function") {
        return overrides.parseJsonBody(req, maxBodyBytes);
      }
      return parseJsonBodyOrUndefined(overrides.bodyByPath, req);
    },
    validateRequest(input) {
      observed.validateCalls.push(["request", input.pathname, input.method]);
      if (typeof overrides.validateRequest === "function") {
        return overrides.validateRequest(input);
      }
      return undefined;
    },
    validateResponse(input) {
      observed.validateCalls.push(["response", input.expect, input.statusCode]);
      if (typeof overrides.validateResponse === "function") {
        return overrides.validateResponse(input);
      }
      return undefined;
    },
    ensureTlsIngress(requestContext) {
      if (typeof overrides.ensureTlsIngress === "function") {
        return overrides.ensureTlsIngress(requestContext);
      }
      return undefined;
    },
    authenticateRequest: async (req, parsedUrl, requiredScope, routeKind, options = {}) => {
      observed.authCalls.push([parsedUrl.pathname, requiredScope, routeKind]);
      if (typeof overrides.authenticateRequest === "function") {
        return overrides.authenticateRequest(req, parsedUrl, requiredScope, routeKind, options);
      }
      const auth = { subject: "alice", scopes: [requiredScope] };
      if (typeof options.onAuthenticated === "function") {
        options.onAuthenticated(auth);
      }
      return auth;
    },
    writeJson(req, res, statusCode, body, traceContext) {
      if (typeof overrides.writeJson === "function") {
        return overrides.writeJson(req, res, statusCode, body, traceContext);
      }
      res.writeHead(statusCode, {
        "content-type": "application/json",
        ...(traceContext?.traceId ? { "x-ptydeck-trace-id": traceContext.traceId } : {})
      });
      if (body === undefined) {
        res.end();
        return;
      }
      res.end(JSON.stringify(body));
    },
    buildSecurityHeaders: () => ({
      "x-content-type-options": "nosniff"
    }),
    buildTraceHeaders: (traceContext) => ({
      ...(traceContext?.traceId ? { "x-ptydeck-trace-id": traceContext.traceId } : {})
    }),
    auditLogger: {
      async write(event) {
        observed.auditEvents.push(event);
        return true;
      }
    },
    getIsReady: overrides.getIsReady || (() => false),
    startupWarmup: overrides.startupWarmup || {
      getState: () => ({
        gateReleased: true,
        enabled: true,
        quietMs: 25,
        quietDeadlineAt: 12345
      })
    },
    manager: overrides.manager || {
      list: () => [{ id: "session-1", activityState: "active", state: "running" }]
    },
    unrestoredSessions: overrides.unrestoredSessions || new Map(),
    sockets: overrides.sockets || new Set(["socket-1"]),
    httpDurationBucketsMs: [10, 50, 100],
    escapePrometheusLabel: (value) => String(value),
    createDevTokenImpl: overrides.createDevTokenImpl || ((input) => `token:${input.subject}:${input.scopes.join(",")}`),
    wsTicketRegistry: overrides.wsTicketRegistry || {
      issue: (auth, body) => ({
        ticket: `ticket:${auth.subject}`,
        body
      })
    },
    messagingRuntime: overrides.messagingRuntime || {
      buildStatusSummary: () => ({ status: "messaging-ok" }),
      renderMetricLines: () => ["ptydeck_messaging_adapter_enabled{adapter=\"telegram\"} 0"]
    },
    sessionStreamAnalysisCapture: overrides.sessionStreamAnalysisCapture || {
      buildStatusSummary: () => ({ status: "capture-ok" })
    },
    dispatchResourceRequest: async (input) => {
      observed.dispatchCalls.push(["resource", input.match.kind, input.auth?.subject || null]);
      if (typeof overrides.dispatchResourceRequest === "function") {
        return overrides.dispatchResourceRequest(input);
      }
      return false;
    },
    dispatchSessionRequest: async (input) => {
      observed.dispatchCalls.push(["session", input.match.kind, input.auth?.subject || null]);
      if (typeof overrides.dispatchSessionRequest === "function") {
        return overrides.dispatchSessionRequest(input);
      }
      return false;
    },
    dispatchSessionControlRequest: async (input) => {
      observed.dispatchCalls.push(["sessionControl", input.match.kind, input.auth?.subject || null]);
      if (typeof overrides.dispatchSessionControlRequest === "function") {
        return overrides.dispatchSessionControlRequest(input);
      }
      return false;
    },
    renderRuntimeMetricsImpl: overrides.renderRuntimeMetricsImpl
  });

  async function run(requestInput) {
    const req = createRequest(requestInput);
    const res = new MockResponse();
    await handler(req, res);
    return res;
  }

  return {
    handler,
    metrics,
    observed,
    run
  };
}

test("runtime http request handler serves built-in health, ready, and metrics routes deterministically", async () => {
  const harness = createHandlerHarness({
    getIsReady: () => true,
    manager: {
      list: () => [
        { id: "session-1", activityState: "active", state: "running" },
        { id: "session-2", activityState: "idle", state: "exited" }
      ]
    },
    unrestoredSessions: new Map([["session-3", { id: "session-3" }]]),
    sockets: new Set(["socket-1", "socket-2"]),
    renderRuntimeMetricsImpl: () => "ptydeck_http_requests_total 3\n"
  });

  const healthResponse = await harness.run({ method: "GET", url: "/health" });
  const readyResponse = await harness.run({ method: "GET", url: "/ready" });
  const metricsResponse = await harness.run({ method: "GET", url: "/metrics" });

  assert.equal(healthResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(healthResponse.body), {
    status: "ok",
    messaging: { status: "messaging-ok" },
    streamAnalysisCapture: { status: "capture-ok" }
  });

  assert.equal(readyResponse.statusCode, 200);
  assert.equal(JSON.parse(readyResponse.body).status, "ready");
  assert.equal(JSON.parse(readyResponse.body).warmup.activeSessionCount, 1);

  assert.equal(metricsResponse.statusCode, 200);
  assert.equal(metricsResponse.headers["content-type"], "text/plain; version=0.0.4; charset=utf-8");
  assert.equal(metricsResponse.body, "ptydeck_http_requests_total 3\n");

  assert.equal(harness.metrics.httpRequestsTotal, 3);
  assert.equal(harness.metrics.httpErrorsTotal, 0);
  assert.equal(harness.metrics.httpRequestsByRoute.get("GET /health"), 1);
  assert.equal(harness.metrics.httpRequestsByRoute.get("GET /ready"), 1);
  assert.equal(harness.metrics.httpRequestsByRoute.get("GET /metrics"), 1);
  assert.equal(harness.observed.auditEvents.length, 3);
});

test("runtime http request handler serves dev-token and ws-ticket routes with the shared auth contract", async () => {
  const createdTokens = [];
  const harness = createHandlerHarness({
    config: {
      authEnabled: true,
      authDevMode: true,
      authDevSecret: "dev-secret",
      authIssuer: "ptydeck",
      authAudience: "ptydeck-users",
      authDevTokenTtlSeconds: 90
    },
    bodyByPath: new Map([
      ["/api/v1/auth/dev-token", { subject: "bob", tenantId: "tenant-b", scopes: ["sessions:read"] }],
      ["/api/v1/auth/ws-ticket", { sessionId: "session-1" }]
    ]),
    createDevTokenImpl(input) {
      createdTokens.push(input);
      return "dev-token";
    }
  });

  const devTokenResponse = await harness.run({
    method: "POST",
    url: "/api/v1/auth/dev-token"
  });
  const wsTicketResponse = await harness.run({
    method: "POST",
    url: "/api/v1/auth/ws-ticket"
  });

  assert.equal(devTokenResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(devTokenResponse.body), {
    accessToken: "dev-token",
    tokenType: "Bearer",
    expiresIn: 90,
    scope: "sessions:read"
  });
  assert.deepEqual(createdTokens, [
    {
      secret: "dev-secret",
      issuer: "ptydeck",
      audience: "ptydeck-users",
      subject: "bob",
      tenantId: "tenant-b",
      scopes: ["sessions:read"],
      ttlSeconds: 90
    }
  ]);

  assert.equal(wsTicketResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(wsTicketResponse.body), {
    ticket: "ticket:alice",
    body: { sessionId: "session-1" }
  });
  assert.deepEqual(harness.observed.authCalls, [["/api/v1/auth/ws-ticket", "ws:connect", "wsTicket"]]);
  assert.deepEqual(
    harness.observed.validateCalls.filter((entry) => entry[0] === "response").map((entry) => entry.slice(1)),
    [
      ["authToken", 200],
      ["wsTicket", 200]
    ]
  );
});

test("runtime http request handler serves ws-ticket in auth-disabled mode for trusted-local ws bootstrap", async () => {
  const harness = createHandlerHarness({
    config: {
      authEnabled: false,
      authDevMode: false
    },
    bodyByPath: new Map([
      ["/api/v1/auth/ws-ticket", { clientId: "trusted-local-1", label: "Desk Browser" }]
    ]),
    wsTicketRegistry: {
      issue: (auth, body) => ({
        ticket: "ticket:local-operator",
        auth,
        body
      })
    },
    authenticateRequest: async () => null
  });

  const wsTicketResponse = await harness.run({
    method: "POST",
    url: "/api/v1/auth/ws-ticket"
  });

  assert.equal(wsTicketResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(wsTicketResponse.body), {
    ticket: "ticket:local-operator",
    auth: null,
    body: { clientId: "trusted-local-1", label: "Desk Browser" }
  });
  assert.deepEqual(harness.observed.authCalls, [["/api/v1/auth/ws-ticket", "ws:connect", "wsTicket"]]);
});

test("runtime http request handler preserves dispatch order and skips auth for not-found routes", async () => {
  let authCallCount = 0;
  const harness = createHandlerHarness({
    bodyByPath: new Map([
      ["/api/v1/sessions/session-1/control/take", { scope: "session" }],
      ["/api/v1/nope", undefined]
    ]),
    authenticateRequest: async (req, parsedUrl, requiredScope, routeKind, options = {}) => {
      authCallCount += 1;
      const auth = { subject: "operator", scopes: [requiredScope] };
      if (typeof options.onAuthenticated === "function") {
        options.onAuthenticated(auth);
      }
      return auth;
    },
    dispatchResourceRequest: async () => false,
    dispatchSessionRequest: async (input) => {
      input.setAuditContext({
        target: { sessionId: "session-1" },
        metadata: { source: "session-dispatch" }
      });
      return false;
    },
    dispatchSessionControlRequest: async (input) => {
      if (input.match.kind !== "takeSessionControl") {
        return false;
      }
      input.writeJsonResponse(204);
      return true;
    }
  });

  const controlResponse = await harness.run({
    method: "POST",
    url: "/api/v1/sessions/session-1/control/take"
  });
  const notFoundResponse = await harness.run({
    method: "GET",
    url: "/api/v1/nope"
  });

  assert.equal(controlResponse.statusCode, 204);
  assert.deepEqual(harness.observed.dispatchCalls.slice(0, 3), [
    ["resource", "takeSessionControl", "operator"],
    ["session", "takeSessionControl", "operator"],
    ["sessionControl", "takeSessionControl", "operator"]
  ]);
  assert.equal(authCallCount, 1);

  assert.equal(notFoundResponse.statusCode, 404);
  assert.equal(JSON.parse(notFoundResponse.body).error, "NotFound");
  assert.equal(authCallCount, 1);
});

test("runtime http request handler maps auth failures into deterministic error and audit output", async () => {
  const harness = createHandlerHarness({
    config: {
      authEnabled: true
    },
    authenticateRequest: async () => {
      throw new ApiError(401, "Unauthorized", "Missing bearer token.");
    }
  });

  const response = await harness.run({
    method: "GET",
    url: "/api/v1/sessions"
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    error: "Unauthorized",
    message: "Missing bearer token."
  });
  assert.equal(harness.metrics.httpErrorsTotal, 1);
  assert.deepEqual(
    harness.observed.validateCalls.filter((entry) => entry[0] === "response").map((entry) => entry.slice(1)),
    [["error", 401]]
  );
  assert.deepEqual(harness.observed.auditEvents, [
    {
      auditVersion: 1,
      event: "audit.event",
      action: "auth.failure",
      outcome: "denied",
      actor: {
        subject: "anonymous",
        accessMode: "unknown"
      },
      http: {
        method: "GET",
        pathname: "/api/v1/sessions",
        statusCode: 401,
        clientIp: "127.0.0.1",
        protocol: "https",
        trustedProxy: false
      },
      trace: {
        traceId: "trace-1",
        correlationId: "corr-1",
        requestId: "req-1"
      },
      metadata: {
        routeKind: "listSessions"
      },
      error: {
        code: "Unauthorized"
      }
    }
  ]);
});
