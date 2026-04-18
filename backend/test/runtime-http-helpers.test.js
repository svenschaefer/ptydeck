import test from "node:test";
import assert from "node:assert/strict";
import { URL } from "node:url";

import { createDevToken } from "../src/auth.js";
import { createRuntimeHttpHelpers, requiredScopeForRoute } from "../src/runtime-http-helpers.js";

function createMockResponse() {
  return {
    statusCode: 0,
    headers: null,
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    }
  };
}

test("runtime http helpers build cors/security/trace headers deterministically", () => {
  const helpers = createRuntimeHttpHelpers({
    config: {
      authEnabled: false,
      enforceTlsIngress: false
    },
    corsAllowedOrigins: ["https://ptydeck.local.secos.rocks"],
    traceHeaderId: "x-ptydeck-trace-id",
    traceHeaderCorrelationId: "x-ptydeck-correlation-id",
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    normalizeTraceSeed: (trace) => trace
  });

  const headers = helpers.buildCorsHeaders(
    {
      headers: {
        origin: "https://ptydeck.local.secos.rocks"
      }
    },
    { traceId: "trc-1", correlationId: "corr-1" }
  );

  assert.equal(headers["access-control-allow-origin"], "https://ptydeck.local.secos.rocks");
  assert.equal(headers.vary, "origin");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-ptydeck-trace-id"], "trc-1");
  assert.equal(headers["x-ptydeck-correlation-id"], "corr-1");

  const wildcardHelpers = createRuntimeHttpHelpers({
    config: {
      authEnabled: false,
      enforceTlsIngress: false
    },
    corsAllowedOrigins: ["*"],
    traceHeaderId: "x-ptydeck-trace-id",
    traceHeaderCorrelationId: "x-ptydeck-correlation-id",
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    normalizeTraceSeed: (trace) => trace
  });
  const wildcardHeaders = wildcardHelpers.buildCorsHeaders({ headers: {} });
  assert.equal(wildcardHeaders["access-control-allow-origin"], "*");
  assert.equal("vary" in wildcardHeaders, false);

  const response = createMockResponse();
  helpers.writeJson({ headers: {} }, response, 200, { ok: true }, { traceId: "trc-2", correlationId: "corr-2" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, JSON.stringify({ ok: true }));
  assert.equal(response.headers["x-ptydeck-trace-id"], "trc-2");
});

test("runtime http helpers authenticate requests through the shared auth seam", () => {
  const observed = [];
  const secret = "dev-secret";
  const helpers = createRuntimeHttpHelpers({
    config: {
      authEnabled: true,
      authDevSecret: secret,
      authIssuer: "ptydeck",
      authAudience: "ptydeck-users",
      enforceTlsIngress: false
    },
    corsAllowedOrigins: ["*"],
    traceHeaderId: "x-ptydeck-trace-id",
    traceHeaderCorrelationId: "x-ptydeck-correlation-id",
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    normalizeTraceSeed: (trace) => trace,
    ensureShareLinkAuthActive(auth) {
      observed.push(["share", auth.subject]);
    },
    ensureShareRouteAllowed(auth, routeKind) {
      observed.push(["route", routeKind, auth.subject]);
    }
  });

  const token = createDevToken({
    secret,
    issuer: "ptydeck",
    audience: "ptydeck-users",
    subject: "alice",
    tenantId: "tenant-a",
    scopes: ["sessions:read"],
    ttlSeconds: 60
  });

  const auth = helpers.authenticateRequest(
    {
      headers: {
        authorization: `Bearer ${token}`
      }
    },
    new URL("https://ptydeck.local.secos.rocks/api/v1/sessions"),
    "sessions:read",
    "listSessions"
  );

  assert.equal(auth.subject, "alice");
  assert.deepEqual(observed, [
    ["share", "alice"],
    ["route", "listSessions", "alice"]
  ]);
});

test("runtime http helpers enforce TLS ingress and keep route scopes deterministic", () => {
  const helpers = createRuntimeHttpHelpers({
    config: {
      authEnabled: false,
      enforceTlsIngress: true
    },
    corsAllowedOrigins: ["*"],
    traceHeaderId: "x-ptydeck-trace-id",
    traceHeaderCorrelationId: "x-ptydeck-correlation-id",
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    normalizeTraceSeed: (trace) => trace
  });

  assert.throws(
    () => helpers.ensureTlsIngress({ protocol: "http" }),
    /TLS is required for this endpoint/
  );
  assert.doesNotThrow(() => helpers.ensureTlsIngress({ protocol: "https" }));

  assert.equal(requiredScopeForRoute("wsTicket"), "ws:connect");
  assert.equal(requiredScopeForRoute("createSession"), "sessions:create");
  assert.equal(requiredScopeForRoute("downloadSessionFile"), "sessions:read");
  assert.equal(requiredScopeForRoute("renameSessionControlClient"), "sessions:write");
});
