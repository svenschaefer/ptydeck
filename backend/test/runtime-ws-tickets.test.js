import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/errors.js";
import { createRuntimeWsTicketRegistry, normalizeWsDisconnectReason } from "../src/runtime-ws-tickets.js";

function assertApiError(error, statusCode, code, message) {
  assert.ok(error instanceof ApiError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.error, code);
  assert.equal(error.message, message);
}

test("ws ticket registry issues one-time tickets with normalized trusted-local client metadata", () => {
  let nowMs = 10_000;
  const registry = createRuntimeWsTicketRegistry({
    ttlSeconds: 30,
    now: () => nowMs,
    randomBytes: (size) => Buffer.alloc(size, 1),
    normalizeSessionControlClientLabel: (value) =>
      typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : ""
  });

  const issued = registry.issue(
    {
      subject: "operator",
      tenantId: "default",
      scopes: ["ws:connect"],
      accessMode: "spectator",
      permissionMode: "read_only",
      shareLinkId: "share-1",
      shareTargetType: "session",
      shareTargetId: "session-1",
      shareTokenId: "token-1"
    },
    {
      clientId: "  client-1  ",
      label: " Desk Station "
    }
  );

  assert.equal(issued.tokenType, "WsTicket");
  assert.equal(issued.expiresIn, 30);
  assert.equal(typeof issued.ticket, "string");
  assert.equal(registry.size(), 1);

  const consumed = registry.consume(issued.ticket);
  assert.deepEqual(consumed, {
    subject: "operator",
    tenantId: "default",
    scopes: ["ws:connect"],
    accessMode: "spectator",
    permissionMode: "read_only",
    shareLinkId: "share-1",
    shareTargetType: "session",
    shareTargetId: "session-1",
    shareTokenId: "token-1",
    sessionControlClientId: "client-1",
    sessionControlClientLabel: "DESK STATION"
  });
  assert.equal(registry.size(), 0);

  assert.throws(
    () => registry.consume(issued.ticket),
    (error) => {
      assertApiError(error, 401, "Unauthorized", "Invalid or expired WebSocket ticket.");
      return true;
    }
  );

  nowMs += 1_000;
});

test("ws ticket registry rejects missing and expired tickets", () => {
  let nowMs = 5_000;
  const registry = createRuntimeWsTicketRegistry({
    ttlSeconds: 5,
    now: () => nowMs,
    randomBytes: (size) => Buffer.alloc(size, 2),
    normalizeSessionControlClientLabel: (value) => String(value || "").trim()
  });

  assert.throws(
    () => registry.consume(""),
    (error) => {
      assertApiError(error, 401, "Unauthorized", "Missing WebSocket ticket.");
      return true;
    }
  );

  const issued = registry.issue({ subject: "operator", tenantId: "default", scopes: [] });
  assert.equal(registry.size(), 1);

  nowMs += 5_001;
  assert.throws(
    () => registry.consume(issued.ticket),
    (error) => {
      assertApiError(error, 401, "Unauthorized", "Invalid or expired WebSocket ticket.");
      return true;
    }
  );
  assert.equal(registry.size(), 0);
});

test("ws disconnect reason normalization prefers explicit hints before fallback classification", () => {
  assert.equal(normalizeWsDisconnectReason(1000, "", "heartbeat_timeout"), "heartbeat_timeout");
  assert.equal(normalizeWsDisconnectReason(1000, "", ""), "normal_closure");
  assert.equal(normalizeWsDisconnectReason(1001, "", ""), "going_away");
  assert.equal(normalizeWsDisconnectReason(1006, "", ""), "abnormal_closure");
  assert.equal(normalizeWsDisconnectReason(4001, "", ""), "app_code_4xxx");
  assert.equal(normalizeWsDisconnectReason(3005, "", ""), "library_code_3xxx");
  assert.equal(normalizeWsDisconnectReason(1008, "socket timeout while waiting", ""), "timeout");
  assert.equal(normalizeWsDisconnectReason(1011, "unexpected condition", ""), "other");
});
