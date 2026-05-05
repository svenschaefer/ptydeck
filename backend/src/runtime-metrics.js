export function createRuntimeMetrics(dependencies = {}) {
  const { httpDurationBucketsMs = [], bumpMetricCounter = () => {} } = dependencies;

  const metrics = {
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
    httpDurationMsSum: 0,
    httpDurationMsCount: 0,
    sessionsCreatedTotal: 0,
    sessionsStartedTotal: 0,
    sessionsExitedTotal: 0,
    sessionsUnrestoredTotal: 0,
    wsConnectionsOpenedTotal: 0,
    wsConnectionsClosedTotal: 0,
    wsReconnectsTotal: 0,
    wsErrorsTotal: 0,
    httpRequestsByStatus: new Map(),
    httpRequestsByRoute: new Map(),
    httpRequestDurationMsBuckets: new Map(),
    wsErrorsByReason: new Map(),
    wsDisconnectsByReason: new Map(),
    wsReconnectsByReason: new Map()
  };

  function recordWsError(reason) {
    metrics.wsErrorsTotal += 1;
    bumpMetricCounter(metrics.wsErrorsByReason, reason);
  }

  function recordHttpDuration(durationMs) {
    for (const bucketLimitMs of httpDurationBucketsMs) {
      if (durationMs <= bucketLimitMs) {
        bumpMetricCounter(metrics.httpRequestDurationMsBuckets, bucketLimitMs);
      }
    }
  }

  return {
    metrics,
    recordHttpDuration,
    recordWsError
  };
}
