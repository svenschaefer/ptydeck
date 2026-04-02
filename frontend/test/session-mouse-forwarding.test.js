import test from "node:test";
import assert from "node:assert/strict";

import {
  filterMouseTrackingOutputChunk,
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

test("filterMouseTrackingOutputChunk buffers incomplete CSI fragments until the final byte arrives", () => {
  assert.deepEqual(filterMouseTrackingOutputChunk("\u001b[40;2"), {
    output: "",
    pending: "\u001b[40;2"
  });
  assert.deepEqual(filterMouseTrackingOutputChunk("H", "\u001b[40;2"), {
    output: "\u001b[40;2H",
    pending: ""
  });
});

test("filterMouseTrackingOutputChunk strips split mouse tracking sequences without leaking adjacent cursor moves", () => {
  assert.deepEqual(filterMouseTrackingOutputChunk("\u001b[?100"), {
    output: "",
    pending: "\u001b[?100"
  });
  assert.deepEqual(filterMouseTrackingOutputChunk("0h\u001b[40;2H", "\u001b[?100"), {
    output: "\u001b[40;2H",
    pending: ""
  });
});

test("getMouseTrackingResetSequence disables all supported tracked modes", () => {
  const sequence = getMouseTrackingResetSequence();
  assert.match(sequence, /\u001b\[\?1000l/);
  assert.match(sequence, /\u001b\[\?1006l/);
  assert.match(sequence, /\u001b\[\?1016l/);
});
