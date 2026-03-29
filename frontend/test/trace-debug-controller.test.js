import test from "node:test";
import assert from "node:assert/strict";

import { createTraceDebugController } from "../src/public/trace-debug-controller.js";

test("trace debug controller records, persists, and filters bounded entries", () => {
  const storage = new Map();
  const windowRef = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    }
  };

  const controller = createTraceDebugController({
    windowRef,
    now: (() => {
      let value = 10;
      return () => ++value;
    })(),
    maxEntries: 2
  });

  controller.record("api.response", {
    trace: { correlationId: "corr-1", traceId: "trc-1" }
  });
  controller.record("ws.event", {
    trace: { correlationId: "corr-2", traceId: "trc-2" }
  });
  controller.record("ws.event", {
    trace: { correlationId: "corr-1", traceId: "trc-3" }
  });

  const entries = controller.listEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].payload.trace.traceId, "trc-2");
  assert.equal(entries[1].payload.trace.traceId, "trc-3");
  assert.equal(controller.findByCorrelationId("corr-1").length, 1);

  controller.dispose();
  assert.equal(typeof windowRef.__PTYDECK_TRACE_DEBUG__?.listEntries, "function");
  assert.match(storage.get("ptydeck.trace-debug.v1") || "", /trc-3/);
});
