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

test("parseAccessStateFromToken supports Buffer fallback and deck share labels when atob is unavailable", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "atob");
  const token = createJwt({
    accessMode: "spectator",
    permissionMode: "read_only",
    shareLinkId: "share-2",
    shareTargetType: "deck",
    shareTargetId: "deck-9"
  });

  try {
    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      writable: true,
      value: undefined
    });

    assert.deepEqual(parseAccessStateFromToken(token), {
      accessMode: "spectator",
      readOnly: true,
      shareLinkId: "share-2",
      targetType: "deck",
      targetId: "deck-9",
      summary: "Spectator · Read-only deck deck-9"
    });
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "atob", originalDescriptor);
    } else {
      delete globalThis.atob;
    }
  }
});

test("parseAccessStateFromToken fails closed when payload decoding or parsing is unavailable", () => {
  const originalAtob = Object.getOwnPropertyDescriptor(globalThis, "atob");
  const originalBuffer = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  const invalidJsonToken = `header.${encodeBase64Url("{not-json")}.signature`;
  const sharedToken = createJwt({
    accessMode: "spectator",
    permissionMode: "read_only",
    shareLinkId: "share-3",
    shareTargetType: "session",
    shareTargetId: "session-9"
  });

  assert.equal(parseAccessStateFromToken(invalidJsonToken).accessMode, "operator");

  try {
    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      writable: true,
      value: undefined
    });
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      writable: true,
      value: undefined
    });

    assert.deepEqual(parseAccessStateFromToken(sharedToken), {
      accessMode: "operator",
      readOnly: false,
      shareLinkId: "",
      targetType: "",
      targetId: "",
      summary: ""
    });
  } finally {
    if (originalAtob) {
      Object.defineProperty(globalThis, "atob", originalAtob);
    } else {
      delete globalThis.atob;
    }
    if (originalBuffer) {
      Object.defineProperty(globalThis, "Buffer", originalBuffer);
    } else {
      delete globalThis.Buffer;
    }
  }
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
