import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeAccessPolicy } from "../src/runtime-access-policy.js";

function createShareLink(overrides = {}) {
  return {
    id: "share-1",
    permissionMode: "read_only",
    revokedAt: "",
    expiresAt: 200,
    tokenId: "token-1",
    targetType: "session",
    targetId: "session-1",
    ...overrides
  };
}

function createSpectatorAuth(overrides = {}) {
  return {
    accessMode: "spectator",
    permissionMode: "read_only",
    shareLinkId: "share-1",
    shareTokenId: "token-1",
    shareTargetType: "session",
    shareTargetId: "session-1",
    ...overrides
  };
}

test("runtime access policy recognizes spectator auth and trims share ids during lookup", () => {
  const shareLinks = new Map([["share-1", createShareLink()]]);
  const policy = createRuntimeAccessPolicy({ shareLinks, now: () => 100 });

  assert.equal(policy.isSpectatorAuth(createSpectatorAuth()), true);
  assert.equal(policy.isSpectatorAuth({ accessMode: "operator" }), false);
  assert.equal(policy.getShareLinkOrThrow(" share-1 ").id, "share-1");
  assert.throws(
    () => policy.getShareLinkOrThrow("missing"),
    /Share link 'missing' was not found\./
  );
});

test("runtime access policy enforces active share-link state deterministically", () => {
  const shareLinks = new Map([["share-1", createShareLink()]]);
  const policy = createRuntimeAccessPolicy({ shareLinks, now: () => 100 });

  assert.equal(policy.ensureShareLinkAuthActive({ accessMode: "operator" }), null);
  assert.equal(policy.ensureShareLinkAuthActive(createSpectatorAuth()).id, "share-1");

  const cases = [
    {
      shareLink: createShareLink({ permissionMode: "read_write" }),
      message: /permission mode is not supported/
    },
    {
      shareLink: createShareLink({ revokedAt: "2026-05-05T12:00:00Z" }),
      message: /has been revoked/
    },
    {
      shareLink: createShareLink({ expiresAt: 100 }),
      message: /has expired/
    },
    {
      shareLink: createShareLink({ tokenId: "token-2" }),
      message: /token is no longer active/
    },
    {
      shareLink: createShareLink({ targetId: "session-2" }),
      message: /target does not match token claims/
    }
  ];

  for (const entry of cases) {
    const failingPolicy = createRuntimeAccessPolicy({
      shareLinks: new Map([["share-1", entry.shareLink]]),
      now: () => 100
    });
    assert.throws(() => failingPolicy.ensureShareLinkAuthActive(createSpectatorAuth()), entry.message);
  }
});

test("runtime access policy enforces spectator route allowlist and extracts ws tickets from protocols", () => {
  const policy = createRuntimeAccessPolicy({
    shareLinks: new Map([["share-1", createShareLink()]]),
    now: () => 100
  });

  assert.doesNotThrow(() => policy.ensureShareRouteAllowed(createSpectatorAuth(), "listSessions"));
  assert.doesNotThrow(() => policy.ensureShareRouteAllowed(createSpectatorAuth(), "wsTicket"));
  assert.throws(
    () => policy.ensureShareRouteAllowed(createSpectatorAuth(), "createSession"),
    /Read-only spectator access does not allow this action/
  );
  assert.doesNotThrow(() => policy.ensureShareRouteAllowed({ accessMode: "operator" }, "createSession"));

  assert.equal(
    policy.resolveWsTicketFromProtocols({
      headers: {
        "sec-websocket-protocol": "json, ptydeck.auth.ticket-123 , other"
      }
    }),
    "ticket-123"
  );
  assert.equal(policy.resolveWsTicketFromProtocols({ headers: { "sec-websocket-protocol": "json,other" } }), "");
  assert.equal(policy.resolveWsTicketFromProtocols({ headers: {} }), "");
});
