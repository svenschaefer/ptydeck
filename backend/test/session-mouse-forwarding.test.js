import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION,
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  normalizeSessionMouseForwardingMode
} from "../src/session-mouse-forwarding.js";

test("normalizeSessionMouseForwardingMode defaults empty values to off", () => {
  assert.equal(normalizeSessionMouseForwardingMode(), SESSION_MOUSE_FORWARDING_MODE_OFF);
  assert.equal(normalizeSessionMouseForwardingMode(null), SESSION_MOUSE_FORWARDING_MODE_OFF);
  assert.equal(normalizeSessionMouseForwardingMode(""), SESSION_MOUSE_FORWARDING_MODE_OFF);
});

test("normalizeSessionMouseForwardingMode normalizes valid strings", () => {
  assert.equal(normalizeSessionMouseForwardingMode(" application "), SESSION_MOUSE_FORWARDING_MODE_APPLICATION);
  assert.equal(normalizeSessionMouseForwardingMode("OFF"), SESSION_MOUSE_FORWARDING_MODE_OFF);
});

test("normalizeSessionMouseForwardingMode rejects invalid strict values", () => {
  assert.throws(() => normalizeSessionMouseForwardingMode(42), /Field 'mouseForwardingMode' must be a string/);
  assert.throws(
    () => normalizeSessionMouseForwardingMode("invalid"),
    /Field 'mouseForwardingMode' must be one of: off, application/
  );
});

test("normalizeSessionMouseForwardingMode falls back to off in non-strict mode", () => {
  assert.equal(normalizeSessionMouseForwardingMode("invalid", { strict: false }), SESSION_MOUSE_FORWARDING_MODE_OFF);
  assert.equal(normalizeSessionMouseForwardingMode(42, { strict: false }), SESSION_MOUSE_FORWARDING_MODE_OFF);
});
