import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeWsUpgradeHandler } from "../src/runtime-ws-upgrade.js";

function createSocket() {
  return {
    destroyed: false,
    writes: [],
    write(chunk) {
      this.writes.push(String(chunk));
    },
    destroy() {
      this.destroyed = true;
    }
  };
}

function createBaseDependencies(overrides = {}) {
  const observed = {
    debug: [],
    errors: [],
    accepted: [],
    wsUpgradeCalls: []
  };
  const dependencies = {
    config: {
      trustedProxy: false,
      enforceTlsIngress: false,
      rateLimitWsConnectMax: 5,
      authEnabled: false
    },
    resolveRequestContext: () => ({
      protocol: "https",
      host: "ptydeck.local",
      clientIp: "127.0.0.1",
      trustedProxy: false
    }),
    buildRequestTraceContext: (_request, requestContext, pathname) => ({
      traceId: "trace-1",
      pathname,
      clientIp: requestContext.clientIp
    }),
    resolveAllowedRequestOrigin: (origin) => origin || "https://ptydeck.local",
    wsConnectRateLimiter: {
      check: () => ({ allowed: true, retryAfterSeconds: 0 })
    },
    accessTokenVerifier: {
      verifyAccessToken: async (token) => ({
        subject: token,
        tenantId: "default",
        scopes: ["ws:connect"]
      })
    },
    wsTicketRegistry: {
      consume: (ticket) => ({
        subject: `ticket:${ticket}`,
        tenantId: "default",
        scopes: ["ws:connect"]
      })
    },
    resolveWsTicketFromProtocols: () => "ticket-1",
    ensureShareLinkAuthActive: () => {},
    ensureShareRouteAllowed: () => {},
    logDebug: (event, details, trace) => {
      observed.debug.push({ event, details, trace });
    },
    recordWsError: (reason) => {
      observed.errors.push(reason);
    },
    wsServer: {
      handleUpgrade: (request, socket, head, callback) => {
        observed.wsUpgradeCalls.push({ request, socket, head });
        callback({ id: "ws-1" });
      }
    },
    onAccepted: (ws, details) => {
      observed.accepted.push({ ws, details });
    },
    ...overrides
  };
  return { dependencies, observed };
}

test("runtime ws upgrade handler rejects non-/ws upgrade paths without sending an HTTP body", async () => {
  const { dependencies, observed } = createBaseDependencies();
  const socket = createSocket();
  const handler = createRuntimeWsUpgradeHandler(dependencies);

  const accepted = await handler({ url: "/api/v1/sessions", headers: {} }, socket, Buffer.alloc(0));

  assert.equal(accepted, false);
  assert.equal(socket.destroyed, true);
  assert.deepEqual(socket.writes, []);
  assert.deepEqual(observed.errors, ["upgrade_path_rejected"]);
  assert.equal(observed.debug[0]?.event, "ws.upgrade.rejected");
});

test("runtime ws upgrade handler rejects TLS, origin, rate-limit, and auth failures with deterministic HTTP responses", async () => {
  {
    const { dependencies, observed } = createBaseDependencies({
      config: {
        trustedProxy: false,
        enforceTlsIngress: true,
        rateLimitWsConnectMax: 5,
        authEnabled: false
      },
      resolveRequestContext: () => ({
        protocol: "http",
        host: "ptydeck.local",
        clientIp: "127.0.0.1",
        trustedProxy: false
      })
    });
    const socket = createSocket();
    const handler = createRuntimeWsUpgradeHandler(dependencies);
    await handler({ url: "/ws", headers: {} }, socket, Buffer.alloc(0));
    assert.equal(socket.destroyed, true);
    assert.match(socket.writes[0], /HTTP\/1\.1 426 Upgrade Required/);
    assert.match(socket.writes[0], /"error":"TlsRequired"/);
    assert.deepEqual(observed.errors, ["upgrade_tls_rejected"]);
  }

  {
    const { dependencies, observed } = createBaseDependencies({
      resolveAllowedRequestOrigin: () => ""
    });
    const socket = createSocket();
    const handler = createRuntimeWsUpgradeHandler(dependencies);
    await handler({ url: "/ws", headers: { origin: "https://evil.example" } }, socket, Buffer.alloc(0));
    assert.equal(socket.destroyed, true);
    assert.match(socket.writes[0], /HTTP\/1\.1 403 Forbidden/);
    assert.match(socket.writes[0], /Vary: Origin/);
    assert.match(socket.writes[0], /"error":"UnauthorizedOrigin"/);
    assert.deepEqual(observed.errors, ["upgrade_origin_rejected"]);
  }

  {
    const { dependencies, observed } = createBaseDependencies({
      wsConnectRateLimiter: {
        check: () => ({ allowed: false, retryAfterSeconds: 17 })
      }
    });
    const socket = createSocket();
    const handler = createRuntimeWsUpgradeHandler(dependencies);
    await handler({ url: "/ws", headers: { origin: "https://ptydeck.local" } }, socket, Buffer.alloc(0));
    assert.equal(socket.destroyed, true);
    assert.match(socket.writes[0], /HTTP\/1\.1 429 Too Many Requests/);
    assert.match(socket.writes[0], /Retry-After: 17/);
    assert.match(socket.writes[0], /"error":"RateLimitExceeded"/);
    assert.deepEqual(observed.errors, ["upgrade_rate_limited"]);
  }

  {
    const { dependencies, observed } = createBaseDependencies({
      config: {
        trustedProxy: false,
        enforceTlsIngress: false,
        rateLimitWsConnectMax: 5,
        authEnabled: true
      },
      accessTokenVerifier: {
        verifyAccessToken: async () => ({
          subject: "operator",
          tenantId: "default",
          scopes: ["sessions:read"]
        })
      }
    });
    const socket = createSocket();
    const handler = createRuntimeWsUpgradeHandler(dependencies);
    await handler(
      {
        url: "/ws",
        headers: {
          origin: "https://ptydeck.local",
          authorization: "Bearer operator-token"
        }
      },
      socket,
      Buffer.alloc(0)
    );
    assert.equal(socket.destroyed, true);
    assert.match(socket.writes[0], /HTTP\/1\.1 403 Forbidden/);
    assert.match(socket.writes[0], /"error":"Forbidden"/);
    assert.deepEqual(observed.errors, ["upgrade_auth_rejected"]);
  }
});

test("runtime ws upgrade handler authenticates upgrade requests and delegates accepted sockets", async () => {
  const { dependencies, observed } = createBaseDependencies({
    config: {
      trustedProxy: false,
      enforceTlsIngress: false,
      rateLimitWsConnectMax: 5,
      authEnabled: true
    }
  });
  const socket = createSocket();
  const handler = createRuntimeWsUpgradeHandler(dependencies);

  const accepted = await handler(
    {
      url: "/ws",
      headers: {
        origin: "https://ptydeck.local",
        authorization: "Bearer operator-token"
      }
    },
    socket,
    Buffer.from("head")
  );

  assert.equal(accepted, true);
  assert.equal(socket.destroyed, false);
  assert.equal(observed.wsUpgradeCalls.length, 1);
  assert.equal(observed.accepted.length, 1);
  assert.equal(observed.accepted[0].ws.id, "ws-1");
  assert.equal(observed.accepted[0].details.auth.subject, "operator-token");
  assert.equal(observed.accepted[0].details.requestContext.clientIp, "127.0.0.1");
  assert.equal(observed.accepted[0].details.upgradeTraceContext.traceId, "trace-1");
});

test("runtime ws upgrade handler consumes trusted-local ws tickets even when auth is disabled", async () => {
  const consumedTickets = [];
  const { dependencies, observed } = createBaseDependencies({
    config: {
      trustedProxy: false,
      enforceTlsIngress: false,
      rateLimitWsConnectMax: 5,
      authEnabled: false
    },
    wsTicketRegistry: {
      consume: (ticket) => {
        consumedTickets.push(ticket);
        return {
          subject: "local-operator",
          tenantId: "default",
          scopes: [],
          sessionControlClientId: "trusted-local-1",
          sessionControlClientLabel: "Desk Browser"
        };
      }
    },
    resolveWsTicketFromProtocols: () => "ticket-local-1"
  });
  const socket = createSocket();
  const handler = createRuntimeWsUpgradeHandler(dependencies);

  const accepted = await handler(
    {
      url: "/ws",
      headers: {
        origin: "https://ptydeck.local",
        "sec-websocket-protocol": "ptydeck.v1, ptydeck.auth.ticket-local-1"
      }
    },
    socket,
    Buffer.alloc(0)
  );

  assert.equal(accepted, true);
  assert.deepEqual(consumedTickets, ["ticket-local-1"]);
  assert.equal(observed.accepted.length, 1);
  assert.equal(observed.accepted[0].details.auth.sessionControlClientId, "trusted-local-1");
  assert.equal(observed.accepted[0].details.auth.sessionControlClientLabel, "Desk Browser");
});

test("runtime ws upgrade handler maps auth/bootstrap failures into upgrade_auth_rejected responses", async () => {
  const { dependencies, observed } = createBaseDependencies({
    ensureShareRouteAllowed() {
      throw new ApiError(500, "InternalError", "ws exploded");
    },
    config: {
      trustedProxy: false,
      enforceTlsIngress: false,
      rateLimitWsConnectMax: 5,
      authEnabled: true
    }
  });
  const socket = createSocket();
  const handler = createRuntimeWsUpgradeHandler(dependencies);

  const accepted = await handler(
    {
      url: "/ws",
      headers: {
        origin: "https://ptydeck.local",
        authorization: "Bearer operator-token"
      }
    },
    socket,
    Buffer.alloc(0)
  );

  assert.equal(accepted, false);
  assert.equal(socket.destroyed, true);
  assert.match(socket.writes[0], /HTTP\/1\.1 500 InternalError/);
  assert.deepEqual(observed.errors, ["upgrade_auth_rejected"]);
});

test("runtime ws upgrade handler reports unexpected outer failures as upgrade_internal_error", async () => {
  const { dependencies, observed } = createBaseDependencies({
    resolveRequestContext() {
      throw new ApiError(500, "InternalError", "trace bootstrap exploded");
    }
  });
  const socket = createSocket();
  const handler = createRuntimeWsUpgradeHandler(dependencies);

  const accepted = await handler(
    {
      url: "/ws",
      headers: {
        origin: "https://ptydeck.local"
      }
    },
    socket,
    Buffer.alloc(0)
  );

  assert.equal(accepted, false);
  assert.equal(socket.destroyed, true);
  assert.match(socket.writes[0], /HTTP\/1\.1 500 InternalError/);
  assert.deepEqual(observed.errors, ["upgrade_internal_error"]);
  assert.equal(observed.debug[0]?.event, "ws.upgrade.error");
});
