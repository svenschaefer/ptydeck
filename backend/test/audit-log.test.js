import test from "node:test";
import assert from "node:assert/strict";
import {
  actionForHttpAuditRoute,
  createAuditLogger,
  createHttpAuditEvent,
  normalizeAuditActor,
  outcomeForStatusCode
} from "../src/audit-log.js";

test("outcomeForStatusCode classifies success, denied, and failure statuses", () => {
  assert.equal(outcomeForStatusCode(204), "success");
  assert.equal(outcomeForStatusCode(401), "denied");
  assert.equal(outcomeForStatusCode(403), "denied");
  assert.equal(outcomeForStatusCode(429), "denied");
  assert.equal(outcomeForStatusCode(500), "failure");
});

test("actionForHttpAuditRoute maps session actions and auth failures", () => {
  assert.equal(actionForHttpAuditRoute({ routeKind: "createSession", statusCode: 201 }), "session.create");
  assert.equal(actionForHttpAuditRoute({ routeKind: "deleteSession", statusCode: 204 }), "session.delete");
  assert.equal(actionForHttpAuditRoute({ routeKind: "input", statusCode: 403 }), "session.input");
  assert.equal(actionForHttpAuditRoute({ routeKind: "resize", statusCode: 204 }), "session.resize");
  assert.equal(actionForHttpAuditRoute({ routeKind: "listSessions", statusCode: 401 }), "auth.failure");
  assert.equal(actionForHttpAuditRoute({ routeKind: "health", statusCode: 200 }), "");
});

test("normalizeAuditActor keeps identity and omits token/tenant-style details", () => {
  const actor = normalizeAuditActor({
    subject: " alice ",
    tenantId: "ignored",
    accessMode: "operator",
    scopes: ["sessions:write", "sessions:read", "sessions:write"]
  }, { authEnabled: true });

  assert.deepEqual(actor, {
    subject: "alice",
    accessMode: "operator",
    scopes: ["sessions:read", "sessions:write"]
  });
  assert.equal(Object.hasOwn(actor, "tenantId"), false);
});

test("createHttpAuditEvent builds redaction-safe session input audit event", () => {
  const event = createHttpAuditEvent({
    auth: {
      subject: "audit-user",
      accessMode: "operator",
      scopes: ["sessions:write"]
    },
    authEnabled: true,
    metadata: { inputBytes: 18 },
    method: "post",
    params: { sessionId: "session-a" },
    pathname: "/api/v1/sessions/session-a/input",
    requestContext: {
      clientIp: "127.0.0.1",
      protocol: "http",
      trustedProxy: false
    },
    routeKind: "input",
    statusCode: 204,
    traceContext: {
      traceId: "trace-a",
      correlationId: "corr-a",
      requestId: "req-a"
    }
  });

  assert.equal(event.action, "session.input");
  assert.equal(event.outcome, "success");
  assert.deepEqual(event.target, { sessionId: "session-a" });
  assert.deepEqual(event.metadata, { inputBytes: 18 });
  assert.equal(JSON.stringify(event).includes("tenantId"), false);
});

test("createHttpAuditEvent captures auth failures without authenticated actor", () => {
  const event = createHttpAuditEvent({
    authEnabled: true,
    errorCode: "Unauthorized",
    method: "GET",
    pathname: "/api/v1/sessions",
    routeKind: "listSessions",
    statusCode: 401
  });

  assert.equal(event.action, "auth.failure");
  assert.equal(event.outcome, "denied");
  assert.deepEqual(event.actor, {
    subject: "anonymous",
    accessMode: "unknown"
  });
  assert.deepEqual(event.error, { code: "Unauthorized" });
  assert.deepEqual(event.metadata, { routeKind: "listSessions" });
});

test("createAuditLogger writes JSON lines only when enabled", async () => {
  const lines = [];
  const disabledLogger = createAuditLogger({
    enabled: false,
    stdout: (line) => lines.push(line)
  });
  assert.equal(await disabledLogger.write({ event: "audit.event", action: "session.create" }), false);
  assert.deepEqual(lines, []);

  const enabledLogger = createAuditLogger({
    enabled: true,
    now: () => "2026-04-23T10:00:00.000Z",
    stdout: (line) => lines.push(line)
  });
  assert.equal(await enabledLogger.write({ event: "audit.event", action: "session.create" }), true);

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    ts: "2026-04-23T10:00:00.000Z",
    service: "ptydeck-backend",
    event: "audit.event",
    action: "session.create"
  });
});
