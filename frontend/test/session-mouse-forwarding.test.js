import test from "node:test";
import assert from "node:assert/strict";

import {
  getMouseTrackingResetSequence,
  normalizeSessionMouseForwardingMode,
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION,
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  stripMouseTrackingControlSequences
} from "../src/public/session-mouse-forwarding.js";

test("frontend mouse forwarding mode normalization falls back to off", () => {
  assert.equal(normalizeSessionMouseForwardingMode(" application "), SESSION_MOUSE_FORWARDING_MODE_APPLICATION);
  assert.equal(normalizeSessionMouseForwardingMode("nope"), SESSION_MOUSE_FORWARDING_MODE_OFF);
  assert.equal(normalizeSessionMouseForwardingMode(null), SESSION_MOUSE_FORWARDING_MODE_OFF);
});

test("stripMouseTrackingControlSequences removes tracked modes and retains unrelated private modes", () => {
  assert.equal(stripMouseTrackingControlSequences("\u001b[?1000hhello\u001b[?1006l"), "hello");
  assert.equal(stripMouseTrackingControlSequences("\u001b[?25;1000h"), "\u001b[?25h");
  assert.equal(stripMouseTrackingControlSequences(""), "");
  assert.equal(stripMouseTrackingControlSequences(null), "");
});

test("getMouseTrackingResetSequence disables all supported tracked modes", () => {
  const sequence = getMouseTrackingResetSequence();
  assert.match(sequence, /\u001b\[\?1000l/);
  assert.match(sequence, /\u001b\[\?1006l/);
  assert.match(sequence, /\u001b\[\?1016l/);
});
