import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeMetrics } from "../src/runtime-metrics.js";

function bumpMetricCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

test("runtime metrics helper records websocket error counters deterministically", () => {
  const { metrics, recordWsError } = createRuntimeMetrics({
    httpDurationBucketsMs: [5, 10, 25],
    bumpMetricCounter
  });

  recordWsError("upgrade_auth_rejected");
  recordWsError("upgrade_auth_rejected");
  recordWsError("upgrade_origin_rejected");

  assert.equal(metrics.wsErrorsTotal, 3);
  assert.equal(metrics.wsErrorsByReason.get("upgrade_auth_rejected"), 2);
  assert.equal(metrics.wsErrorsByReason.get("upgrade_origin_rejected"), 1);
});

test("runtime metrics helper records cumulative HTTP duration buckets deterministically", () => {
  const { metrics, recordHttpDuration } = createRuntimeMetrics({
    httpDurationBucketsMs: [5, 10, 25, 50],
    bumpMetricCounter
  });

  recordHttpDuration(8);
  recordHttpDuration(25);
  recordHttpDuration(80);

  assert.equal(metrics.httpRequestDurationMsBuckets.get(5), undefined);
  assert.equal(metrics.httpRequestDurationMsBuckets.get(10), 1);
  assert.equal(metrics.httpRequestDurationMsBuckets.get(25), 2);
  assert.equal(metrics.httpRequestDurationMsBuckets.get(50), 2);
});
