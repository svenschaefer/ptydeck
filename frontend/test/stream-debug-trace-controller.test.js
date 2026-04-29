import test from "node:test";
import assert from "node:assert/strict";

import { createStreamDebugTraceController } from "../src/public/stream-debug-trace-controller.js";

test("stream debug trace controller records, persists, and reloads bounded per-session traces", () => {
  const storage = new Map();
  let nowValue = 1000;
  const windowRef = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      }
    }
  };

  const controller = createStreamDebugTraceController({
    windowRef,
    now: () => nowValue,
    maxSessions: 2,
    maxEntriesPerSession: 2
  });

  controller.record("s1", "stream.data", { chunk: "abc" });
  nowValue += 1;
  controller.record("s1", "activity.detection", { retainedCandidate: { statusText: "Working" } });
  nowValue += 1;
  controller.record("s1", "stream.line", { line: "tail" });
  nowValue += 1;
  controller.record("s2", "stream.data", { chunk: "def" });
  nowValue += 1;
  controller.record("s3", "stream.data", { chunk: "ghi" });
  controller.dispose();

  assert.deepEqual(controller.listSessionIds(), ["s2", "s3"]);
  assert.deepEqual(controller.getSessionTrace("s1"), []);
  assert.equal(controller.getSessionTrace("s2").length, 1);
  assert.equal(controller.getSessionTrace("s3")[0].payload.chunk, "ghi");

  const reloaded = createStreamDebugTraceController({
    windowRef,
    now: () => nowValue
  });

  assert.deepEqual(reloaded.listSessionIds(), ["s2", "s3"]);
  assert.equal(reloaded.getSessionTrace("s3")[0].payload.chunk, "ghi");
});

test("stream debug trace controller tolerates malformed storage, normalizes payloads, and ignores persistence failures", () => {
  const storage = new Map([
    [
      "ptydeck.stream-debug.v1",
      JSON.stringify({
        sessions: [
          { sessionId: " ", entries: [{ recordedAt: 1, type: "skip" }] },
          { sessionId: "empty", entries: [] },
          { sessionId: "kept", entries: [{ recordedAt: 2, type: "stream.data", payload: { chunk: "ok" } }] }
        ]
      })
    ]
  ]);
  const windowRef = {
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem() {
        throw new Error("quota exceeded");
      }
    }
  };

  const controller = createStreamDebugTraceController({
    windowRef,
    now: () => 5000,
    maxEntriesPerSession: 1
  });

  assert.equal(windowRef.__PTYDECK_STREAM_DEBUG__, controller);
  assert.deepEqual(controller.listSessionIds(), ["kept"]);

  controller.record(" ", "stream.data", { ignored: true });
  controller.record("kept", "", { ignored: true });
  controller.record("fresh", "stream.data", {
    text: "x".repeat(2505),
    count: 3,
    ok: true,
    nested: ["y".repeat(2505), { fallback: Symbol("trace") }]
  });

  const freshEntry = controller.getSessionTrace("fresh")[0];
  assert.equal(freshEntry.recordedAt, 5000);
  assert.equal(freshEntry.payload.text.length, 2001);
  assert.equal(freshEntry.payload.text.endsWith("…"), true);
  assert.equal(freshEntry.payload.nested[0].length, 2001);
  assert.equal(freshEntry.payload.nested[1].fallback, "Symbol(trace)");

  controller.clearSession(" ");
  controller.clearSession("kept");
  assert.deepEqual(controller.listSessionIds(), ["fresh"]);

  controller.clear();
  controller.dispose();
  assert.deepEqual(controller.listSessionIds(), []);
});

test("stream debug trace controller works without localStorage-backed persistence", () => {
  const windowRef = {};
  const controller = createStreamDebugTraceController({
    windowRef,
    now: () => 77
  });

  assert.equal(windowRef.__PTYDECK_STREAM_DEBUG__, controller);
  controller.record("session-a", "stream.data", "hello");
  controller.record("session-a", "activity", 12);
  controller.record("session-a", "flag", false);

  assert.equal(controller.getSessionTrace("session-a").length, 3);
  controller.clearSession("session-a");
  assert.deepEqual(controller.getSessionTrace("session-a"), []);

  controller.record("session-b", "stream.data", { nested: ["ok"] });
  controller.clear();
  controller.dispose();
  assert.deepEqual(controller.listSessionIds(), []);
});
