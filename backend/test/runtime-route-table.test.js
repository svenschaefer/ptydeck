import test from "node:test";
import assert from "node:assert/strict";

import { matchRuntimeRoute, normalizeRuntimeMetricsPath } from "../src/runtime-route-table.js";

function assertRoute(pathname, method, expected) {
  assert.deepEqual(matchRuntimeRoute(pathname, method), expected);
}

test("runtime route table matches resource routes and decodes ids deterministically", () => {
  assertRoute("/api/v1/shares", "GET", { kind: "listShares" });
  assertRoute("/api/v1/shares", "POST", { kind: "createShareLink" });
  assertRoute("/api/v1/shares/share-123", "GET", {
    kind: "getShareLink",
    params: { shareId: "share-123" }
  });
  assertRoute("/api/v1/shares/share-123/revoke", "POST", {
    kind: "revokeShareLink",
    params: { shareId: "share-123" }
  });
  assertRoute("/api/v1/custom-commands/Build%20Now", "PUT", {
    kind: "upsertCustomCommand",
    params: { commandName: "Build Now" }
  });
  assertRoute("/api/v1/decks/dev-deck/sessions/session-1:move", "POST", {
    kind: "moveSessionToDeck",
    params: { deckId: "dev-deck", sessionId: "session-1" }
  });
  assertRoute("/api/v1/layout-profiles/layout-a", "PATCH", {
    kind: "updateLayoutProfile",
    params: { profileId: "layout-a" }
  });
  assertRoute("/api/v1/connection-profiles/profile-a", "DELETE", {
    kind: "deleteConnectionProfile",
    params: { profileId: "profile-a" }
  });
  assertRoute("/api/v1/workspace-presets/preset-a", "GET", {
    kind: "getWorkspacePreset",
    params: { presetId: "preset-a" }
  });
  assertRoute("/api/v1/ssh-trust-entries/trust-abc", "DELETE", {
    kind: "deleteSshTrustEntry",
    params: { entryId: "trust-abc" }
  });
  assertRoute("/api/v1/ssh-host-key-probe", "POST", { kind: "probeSshHostKeys" });
  assertRoute("/api/v1/not-real", "GET", { kind: "notFound" });
});

test("runtime route table fails closed on malformed encoded resource ids", () => {
  const badPathCases = [
    "/api/v1/shares/%E0%A4%A",
    "/api/v1/custom-commands/%E0%A4%A",
    "/api/v1/decks/%E0%A4%A",
    "/api/v1/layout-profiles/%E0%A4%A",
    "/api/v1/connection-profiles/%E0%A4%A",
    "/api/v1/workspace-presets/%E0%A4%A",
    "/api/v1/ssh-trust-entries/%E0%A4%A"
  ];

  for (const pathname of badPathCases) {
    assert.throws(
      () => matchRuntimeRoute(pathname, pathname.includes("ssh-trust-entries") ? "DELETE" : "GET"),
      /Invalid path parameter encoding/
    );
  }
});

test("runtime route table normalizes metrics paths for promoted resource routes", () => {
  assert.equal(normalizeRuntimeMetricsPath("/api/v1/shares/share-123"), "/api/v1/shares/{shareId}");
  assert.equal(normalizeRuntimeMetricsPath("/api/v1/shares/share-123/revoke"), "/api/v1/shares/{shareId}/revoke");
  assert.equal(normalizeRuntimeMetricsPath("/api/v1/custom-commands/build-now"), "/api/v1/custom-commands/{commandName}");
  assert.equal(normalizeRuntimeMetricsPath("/api/v1/decks/dev-deck"), "/api/v1/decks/{deckId}");
  assert.equal(
    normalizeRuntimeMetricsPath("/api/v1/decks/dev-deck/sessions/session-1:move"),
    "/api/v1/decks/{deckId}/sessions/{sessionId}:move"
  );
  assert.equal(normalizeRuntimeMetricsPath("/api/v1/layout-profiles/layout-a"), "/api/v1/layout-profiles/{profileId}");
  assert.equal(
    normalizeRuntimeMetricsPath("/api/v1/connection-profiles/profile-a"),
    "/api/v1/connection-profiles/{profileId}"
  );
  assert.equal(
    normalizeRuntimeMetricsPath("/api/v1/workspace-presets/preset-a"),
    "/api/v1/workspace-presets/{presetId}"
  );
  assert.equal(
    normalizeRuntimeMetricsPath("/api/v1/ssh-trust-entries/trust-abc"),
    "/api/v1/ssh-trust-entries/{entryId}"
  );
});
