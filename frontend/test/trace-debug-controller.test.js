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

test("trace debug controller tolerates malformed storage, blank types, and persistence failures", () => {
  const storage = new Map([
    [
      "ptydeck.trace-debug.v1",
      JSON.stringify({
        entries: [{ recordedAt: 1, type: "existing", payload: { trace: { correlationId: "seed" } } }]
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

  const controller = createTraceDebugController({
    windowRef,
    now: () => 88,
    maxEntries: 2
  });

  assert.equal(windowRef.__PTYDECK_TRACE_DEBUG__, controller);
  assert.equal(controller.listEntries().length, 1);
  controller.record(" ", { ignored: true });
  controller.record("trace.event", {
    text: "x".repeat(500),
    flags: [true, 7, null],
    nested: { fallback: Symbol("trace") },
    trace: { correlationId: "corr-1" }
  });
  controller.record("trace.event", {
    trace: { correlationId: "corr-2" }
  });

  const entries = controller.listEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, "trace.event");
  assert.equal(entries[0].payload.text.length, 401);
  assert.equal(entries[0].payload.flags[2], null);
  assert.equal(entries[0].payload.nested.fallback, "Symbol(trace)");
  assert.deepEqual(controller.findByCorrelationId(" "), []);

  controller.clear();
  controller.dispose();
  assert.deepEqual(controller.listEntries(), []);
});

test("trace debug controller works without localStorage-backed persistence", () => {
  const windowRef = {};
  const controller = createTraceDebugController({
    windowRef,
    now: () => 42
  });

  assert.equal(windowRef.__PTYDECK_TRACE_DEBUG__, controller);
  controller.record("trace.event", { trace: { correlationId: "corr-1" } });
  assert.equal(controller.findByCorrelationId("corr-1").length, 1);
  controller.dispose();
});
