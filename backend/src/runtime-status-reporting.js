export function countActiveRuntimeSessions(sessions = []) {
  let activeSessionCount = 0;
  for (const session of sessions) {
    if (session?.activityState === "active") {
      activeSessionCount += 1;
    }
  }
  return activeSessionCount;
}

function countProvisionedRuntimeSessions(sessions = []) {
  let count = 0;
  for (const session of sessions) {
    const state = typeof session?.state === "string" ? session.state.trim().toLowerCase() : "";
    if (state !== "stopped") {
      count += 1;
    }
  }
  return count;
}

export function buildRuntimeHealthPayload({
  messagingStatusSummary,
  streamAnalysisStatusSummary
}) {
  return {
    status: "ok",
    messaging: messagingStatusSummary,
    streamAnalysisCapture: streamAnalysisStatusSummary
  };
}

export function buildRuntimeReadyPayload({
  isReady,
  startupWarmupGateReleased,
  startupWarmupEnabled,
  startupWarmupQuietMs,
  startupWarmupQuietDeadlineAt,
  sessions = [],
  messagingStatusSummary,
  streamAnalysisStatusSummary,
  now = Date.now()
}) {
  return {
    status: isReady ? "ready" : "starting",
    phase: isReady ? "ready" : startupWarmupGateReleased && startupWarmupEnabled ? "starting_sessions" : "booting",
    warmup: {
      enabled: startupWarmupEnabled,
      gateReleased: startupWarmupGateReleased,
      quietPeriodMs: startupWarmupQuietMs,
      activeSessionCount: countActiveRuntimeSessions(sessions),
      quietMsRemaining:
        startupWarmupEnabled && startupWarmupQuietDeadlineAt > 0
          ? Math.max(0, startupWarmupQuietDeadlineAt - now)
          : 0
    },
    messaging: messagingStatusSummary,
    streamAnalysisCapture: streamAnalysisStatusSummary
  };
}

export function renderRuntimeMetrics({
  sessions = [],
  unrestoredSessionCount = 0,
  wsConnectionCount = 0,
  metrics,
  httpDurationBucketsMs = [],
  escapePrometheusLabel,
  messagingMetricLines = []
}) {
  const sessionsByLifecycle = new Map();
  for (const session of sessions) {
    const state = typeof session?.state === "string" && session.state ? session.state : "unknown";
    sessionsByLifecycle.set(state, (sessionsByLifecycle.get(state) || 0) + 1);
  }
  if (unrestoredSessionCount > 0) {
    sessionsByLifecycle.set("unrestored", (sessionsByLifecycle.get("unrestored") || 0) + unrestoredSessionCount);
  }

  const lines = [];
  lines.push("# HELP ptydeck_http_requests_total Total number of HTTP requests.");
  lines.push("# TYPE ptydeck_http_requests_total counter");
  lines.push(`ptydeck_http_requests_total ${metrics.httpRequestsTotal}`);
  lines.push("# HELP ptydeck_http_errors_total Total number of HTTP requests with status >= 400.");
  lines.push("# TYPE ptydeck_http_errors_total counter");
  lines.push(`ptydeck_http_errors_total ${metrics.httpErrorsTotal}`);
  lines.push("# HELP ptydeck_http_request_duration_ms_sum Sum of HTTP request duration in milliseconds.");
  lines.push("# TYPE ptydeck_http_request_duration_ms_sum counter");
  lines.push(`ptydeck_http_request_duration_ms_sum ${metrics.httpDurationMsSum}`);
  lines.push("# HELP ptydeck_http_request_duration_ms_count Total number of observed HTTP request durations.");
  lines.push("# TYPE ptydeck_http_request_duration_ms_count counter");
  lines.push(`ptydeck_http_request_duration_ms_count ${metrics.httpDurationMsCount}`);
  lines.push("# HELP ptydeck_http_request_duration_ms_bucket HTTP request duration histogram buckets in milliseconds.");
  lines.push("# TYPE ptydeck_http_request_duration_ms_bucket histogram");
  for (const bucketLimitMs of httpDurationBucketsMs) {
    lines.push(
      `ptydeck_http_request_duration_ms_bucket{le="${escapePrometheusLabel(bucketLimitMs)}"} ${metrics.httpRequestDurationMsBuckets.get(bucketLimitMs) || 0}`
    );
  }
  lines.push(`ptydeck_http_request_duration_ms_bucket{le="+Inf"} ${metrics.httpDurationMsCount}`);
  lines.push("# HELP ptydeck_sessions_active Number of active PTY sessions.");
  lines.push("# TYPE ptydeck_sessions_active gauge");
  lines.push(`ptydeck_sessions_active ${countProvisionedRuntimeSessions(sessions)}`);
  lines.push("# HELP ptydeck_sessions_active_by_lifecycle Number of sessions grouped by lifecycle state.");
  lines.push("# TYPE ptydeck_sessions_active_by_lifecycle gauge");
  for (const [state, count] of sessionsByLifecycle.entries()) {
    lines.push(`ptydeck_sessions_active_by_lifecycle{state="${escapePrometheusLabel(state)}"} ${count}`);
  }
  lines.push("# HELP ptydeck_sessions_created_total Total number of created sessions.");
  lines.push("# TYPE ptydeck_sessions_created_total counter");
  lines.push(`ptydeck_sessions_created_total ${metrics.sessionsCreatedTotal}`);
  lines.push("# HELP ptydeck_sessions_started_total Total number of started sessions.");
  lines.push("# TYPE ptydeck_sessions_started_total counter");
  lines.push(`ptydeck_sessions_started_total ${metrics.sessionsStartedTotal}`);
  lines.push("# HELP ptydeck_sessions_exited_total Total number of exited sessions.");
  lines.push("# TYPE ptydeck_sessions_exited_total counter");
  lines.push(`ptydeck_sessions_exited_total ${metrics.sessionsExitedTotal}`);
  lines.push("# HELP ptydeck_sessions_unrestored_total Total number of sessions marked unrestored during startup.");
  lines.push("# TYPE ptydeck_sessions_unrestored_total counter");
  lines.push(`ptydeck_sessions_unrestored_total ${metrics.sessionsUnrestoredTotal}`);
  lines.push("# HELP ptydeck_ws_connections_active Number of active WebSocket connections.");
  lines.push("# TYPE ptydeck_ws_connections_active gauge");
  lines.push(`ptydeck_ws_connections_active ${wsConnectionCount}`);
  lines.push("# HELP ptydeck_ws_connections_opened_total Total number of accepted WebSocket connections.");
  lines.push("# TYPE ptydeck_ws_connections_opened_total counter");
  lines.push(`ptydeck_ws_connections_opened_total ${metrics.wsConnectionsOpenedTotal}`);
  lines.push("# HELP ptydeck_ws_connections_closed_total Total number of closed WebSocket connections.");
  lines.push("# TYPE ptydeck_ws_connections_closed_total counter");
  lines.push(`ptydeck_ws_connections_closed_total ${metrics.wsConnectionsClosedTotal}`);
  lines.push("# HELP ptydeck_ws_reconnects_total Total number of websocket reconnects observed per client IP.");
  lines.push("# TYPE ptydeck_ws_reconnects_total counter");
  lines.push(`ptydeck_ws_reconnects_total ${metrics.wsReconnectsTotal}`);
  lines.push("# HELP ptydeck_ws_errors_total Total number of websocket upgrade/socket errors.");
  lines.push("# TYPE ptydeck_ws_errors_total counter");
  lines.push(`ptydeck_ws_errors_total ${metrics.wsErrorsTotal}`);
  lines.push("# HELP ptydeck_ws_errors_by_reason_total Websocket errors grouped by reason.");
  lines.push("# TYPE ptydeck_ws_errors_by_reason_total counter");
  for (const [reason, count] of metrics.wsErrorsByReason.entries()) {
    lines.push(`ptydeck_ws_errors_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
  }
  lines.push("# HELP ptydeck_ws_disconnects_by_reason_total Websocket disconnects grouped by normalized reason.");
  lines.push("# TYPE ptydeck_ws_disconnects_by_reason_total counter");
  for (const [reason, count] of metrics.wsDisconnectsByReason.entries()) {
    lines.push(`ptydeck_ws_disconnects_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
  }
  lines.push("# HELP ptydeck_ws_reconnects_by_reason_total Websocket reconnects grouped by previous disconnect reason.");
  lines.push("# TYPE ptydeck_ws_reconnects_by_reason_total counter");
  for (const [reason, count] of metrics.wsReconnectsByReason.entries()) {
    lines.push(`ptydeck_ws_reconnects_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
  }
  lines.push("# HELP ptydeck_http_requests_by_status_total HTTP requests grouped by status code.");
  lines.push("# TYPE ptydeck_http_requests_by_status_total counter");
  for (const [statusCode, count] of metrics.httpRequestsByStatus.entries()) {
    lines.push(`ptydeck_http_requests_by_status_total{status="${escapePrometheusLabel(statusCode)}"} ${count}`);
  }
  lines.push("# HELP ptydeck_http_requests_by_route_total HTTP requests grouped by normalized route.");
  lines.push("# TYPE ptydeck_http_requests_by_route_total counter");
  for (const [routeKey, count] of metrics.httpRequestsByRoute.entries()) {
    const [method, route] = routeKey.split(" ", 2);
    lines.push(
      `ptydeck_http_requests_by_route_total{method="${escapePrometheusLabel(method)}",route="${escapePrometheusLabel(route)}"} ${count}`
    );
  }
  lines.push("# HELP ptydeck_messaging_events_total Messaging events grouped by profile, event type, and policy decision.");
  lines.push("# TYPE ptydeck_messaging_events_total counter");
  lines.push("# HELP ptydeck_messaging_deliveries_total Messaging adapter deliveries grouped by adapter and outcome.");
  lines.push("# TYPE ptydeck_messaging_deliveries_total counter");
  lines.push("# HELP ptydeck_messaging_actions_total Messaging adapter actions grouped by adapter and action.");
  lines.push("# TYPE ptydeck_messaging_actions_total counter");
  lines.push("# HELP ptydeck_messaging_adapter_enabled Whether a messaging adapter is enabled.");
  lines.push("# TYPE ptydeck_messaging_adapter_enabled gauge");
  lines.push("# HELP ptydeck_messaging_adapter_configured_targets Number of configured messaging targets for an adapter.");
  lines.push("# TYPE ptydeck_messaging_adapter_configured_targets gauge");
  lines.push("# HELP ptydeck_messaging_inbound_enabled Whether bounded inbound messaging is enabled for an adapter.");
  lines.push("# TYPE ptydeck_messaging_inbound_enabled gauge");
  lines.push("# HELP ptydeck_messaging_inbound_polling Whether an adapter inbound poll loop is currently active.");
  lines.push("# TYPE ptydeck_messaging_inbound_polling gauge");
  lines.push("# HELP ptydeck_messaging_inbound_total Bounded inbound messaging interactions grouped by adapter and outcome.");
  lines.push("# TYPE ptydeck_messaging_inbound_total counter");
  lines.push(...messagingMetricLines);
  return `${lines.join("\n")}\n`;
}
