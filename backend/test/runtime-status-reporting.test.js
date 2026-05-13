import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRuntimeHealthPayload,
  buildRuntimeReadyPayload,
  countActiveRuntimeSessions,
  renderRuntimeMetrics
} from "../src/runtime-status-reporting.js";

test("runtime status reporting derives active-session counts and ready payload phases deterministically", () => {
  const sessions = [
    { id: "s1", activityState: "active" },
    { id: "s2", activityState: "idle" },
    { id: "s3", activityState: "active" }
  ];

  assert.equal(countActiveRuntimeSessions(sessions), 2);

  const booting = buildRuntimeReadyPayload({
    isReady: false,
    startupWarmupGateReleased: false,
    startupWarmupEnabled: true,
    startupWarmupQuietMs: 1000,
    startupWarmupQuietDeadlineAt: 0,
    sessions,
    messagingStatusSummary: { mode: "transport_only" },
    streamAnalysisStatusSummary: { enabled: true },
    now: 100
  });
  assert.equal(booting.phase, "booting");
  assert.equal(booting.warmup.activeSessionCount, 2);
  assert.equal(booting.warmup.quietMsRemaining, 0);

  const warming = buildRuntimeReadyPayload({
    isReady: false,
    startupWarmupGateReleased: true,
    startupWarmupEnabled: true,
    startupWarmupQuietMs: 1000,
    startupWarmupQuietDeadlineAt: 1200,
    sessions: [{ id: "s4", activityState: "idle" }],
    messagingStatusSummary: { mode: "transport_only" },
    streamAnalysisStatusSummary: { enabled: true },
    now: 200
  });
  assert.equal(warming.phase, "starting_sessions");
  assert.equal(warming.warmup.quietMsRemaining, 1000);

  const ready = buildRuntimeHealthPayload({
    messagingStatusSummary: { mode: "transport_only" },
    streamAnalysisStatusSummary: { enabled: true }
  });
  assert.deepEqual(ready, {
    status: "ok",
    messaging: { mode: "transport_only" },
    streamAnalysisCapture: { enabled: true }
  });
});

test("runtime status reporting renders transport and websocket metrics deterministically", () => {
  const metrics = {
    httpRequestsTotal: 8,
    httpErrorsTotal: 1,
    httpDurationMsSum: 64,
    httpDurationMsCount: 3,
    httpRequestDurationMsBuckets: new Map([[10, 1], [25, 2]]),
    sessionsCreatedTotal: 4,
    sessionsStartedTotal: 3,
    sessionsExitedTotal: 1,
    sessionsUnrestoredTotal: 2,
    wsConnectionsOpenedTotal: 5,
    wsConnectionsClosedTotal: 4,
    wsReconnectsTotal: 2,
    wsErrorsTotal: 1,
    wsErrorsByReason: new Map([["timeout", 1]]),
    wsDisconnectsByReason: new Map([["normal_closure", 3]]),
    wsReconnectsByReason: new Map([["timeout", 2]]),
    httpRequestsByStatus: new Map([["200", 7], ["500", 1]]),
    httpRequestsByRoute: new Map([["GET /health", 3]])
  };

  const payload = renderRuntimeMetrics({
    sessions: [{ state: "running" }, { state: "idle" }, { state: "stopped" }],
    unrestoredSessionCount: 1,
    wsConnectionCount: 2,
    metrics,
    httpDurationBucketsMs: [10, 25],
    escapePrometheusLabel: (value) => String(value),
    messagingMetricLines: ["ptydeck_messaging_adapter_enabled{adapter=\"telegram\"} 1"]
  });

  assert.match(payload, /ptydeck_http_requests_total 8/);
  assert.match(payload, /ptydeck_sessions_active 2/);
  assert.match(payload, /ptydeck_sessions_active_by_lifecycle\{state="stopped"\} 1/);
  assert.match(payload, /ptydeck_sessions_active_by_lifecycle\{state="unrestored"\} 1/);
  assert.match(payload, /ptydeck_ws_connections_active 2/);
  assert.match(payload, /ptydeck_http_requests_by_route_total\{method="GET",route="\/health"\} 3/);
  assert.match(payload, /ptydeck_messaging_adapter_enabled\{adapter="telegram"\} 1/);
});
