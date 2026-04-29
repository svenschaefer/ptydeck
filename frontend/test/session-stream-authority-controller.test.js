import test from "node:test";
import assert from "node:assert/strict";

import { createSessionStreamAuthorityController } from "../src/public/session-stream-authority-controller.js";

test("session stream authority forwards raw chunks, records trace entries, and clears activity on idle", async () => {
  const traces = [];
  const appendedChunks = [];
  const clearedSessions = [];
  const controller = createSessionStreamAuthorityController({
    idleMs: 0,
    recordTrace(sessionId, type, payload) {
      traces.push([sessionId, type, payload]);
    },
    appendTerminalChunk(sessionId, chunk) {
      appendedChunks.push([sessionId, chunk]);
    },
    clearSessionActivity(sessionId) {
      clearedSessions.push(sessionId);
    }
  });

  assert.equal(controller.push("s1", "alpha"), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(appendedChunks, [["s1", "alpha"]]);
  assert.deepEqual(clearedSessions, ["s1"]);
  assert.deepEqual(traces, [
    ["s1", "stream.data", { chunk: "alpha" }],
    ["s1", "stream.idle", {}]
  ]);
});

test("session stream authority exposes adapter lifecycle controls without leaving stray idle timers behind", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, delay) => {
    const token = { fn, delay, cleared: false };
    timers.push(token);
    return token;
  };
  globalThis.clearTimeout = (token) => {
    if (token && typeof token === "object") {
      token.cleared = true;
    }
  };

  try {
    const controller = createSessionStreamAuthorityController({ idleMs: 5 });

    assert.equal(controller.push("s1", "alpha"), true);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].cleared, false);

    controller.resetSession("s1");
    assert.equal(timers[0].cleared, true);

    assert.equal(controller.push("s1", "bravo"), true);
    assert.equal(timers.length, 2);
    controller.disposeSession("s1");
    assert.equal(timers[1].cleared, true);

    assert.equal(controller.push("s2", "charlie"), true);
    assert.equal(timers.length, 3);
    controller.dispose();
    assert.equal(timers[2].cleared, true);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
