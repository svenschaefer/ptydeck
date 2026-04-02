import test from "node:test";
import assert from "node:assert/strict";

import { getShareTokenFromLocation, parseAccessStateFromToken } from "../src/public/share-access-state.js";

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createJwt(payload) {
  return `header.${encodeBase64Url(JSON.stringify(payload))}.signature`;
}

test("parseAccessStateFromToken returns spectator read-only state for shared session tokens", () => {
  const token = createJwt({
    accessMode: "spectator",
    permissionMode: "read_only",
    shareLinkId: "share-1",
    shareTargetType: "session",
    shareTargetId: "session-7"
  });

  assert.deepEqual(parseAccessStateFromToken(token), {
    accessMode: "spectator",
    readOnly: true,
    shareLinkId: "share-1",
    targetType: "session",
    targetId: "session-7",
    summary: "Spectator · Read-only session session-7"
  });
});

test("parseAccessStateFromToken falls back to operator mode for invalid or non-read-only tokens", () => {
  assert.deepEqual(parseAccessStateFromToken("invalid-token"), {
    accessMode: "operator",
    readOnly: false,
    shareLinkId: "",
    targetType: "",
    targetId: "",
    summary: ""
  });

  const operatorToken = createJwt({
    accessMode: "operator",
    permissionMode: "full_access"
  });
  assert.equal(parseAccessStateFromToken(operatorToken).readOnly, false);
  assert.equal(parseAccessStateFromToken(operatorToken).accessMode, "operator");
});

test("getShareTokenFromLocation returns a trimmed share token from window location", () => {
  assert.equal(
    getShareTokenFromLocation({
      location: {
        search: "?share_token=%20abc123%20&other=value"
      }
    }),
    "abc123"
  );
  assert.equal(getShareTokenFromLocation({ location: { search: "?other=value" } }), "");
});
