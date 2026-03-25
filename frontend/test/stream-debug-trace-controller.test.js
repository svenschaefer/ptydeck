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

