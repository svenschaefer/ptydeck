import { randomUUID } from "node:crypto";

const TRACE_TOKEN_MAX_LENGTH = 128;

export function normalizeTraceToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > TRACE_TOKEN_MAX_LENGTH) {
    return "";
  }
  return normalized;
}

export function normalizeTraceSeed(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }
  const traceId = normalizeTraceToken(trace.traceId);
  const correlationId = normalizeTraceToken(trace.correlationId);
  const requestId = normalizeTraceToken(trace.requestId);
  const connectionId = normalizeTraceToken(trace.connectionId);
  const sessionId = normalizeTraceToken(trace.sessionId);
  const deckId = normalizeTraceToken(trace.deckId);
  const source = normalizeTraceToken(trace.source);
  const normalized = {
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(connectionId ? { connectionId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(deckId ? { deckId } : {}),
    ...(source ? { source } : {})
  };
  return Object.keys(normalized).length ? normalized : null;
}

export function countCursorPositionQueries(rawData) {
  if (typeof rawData !== "string" || rawData.length === 0) {
    return 0;
  }
  return (rawData.match(/\u001b\[6n/g) || []).length;
}

export function buildCursorPositionReport(row = 1, col = 1) {
  const normalizedRow = Number.isInteger(row) && row > 0 ? row : 1;
  const normalizedCol = Number.isInteger(col) && col > 0 ? col : 1;
  return `\u001b[${normalizedRow};${normalizedCol}R`;
}

export function createSessionManagerTraceRuntime({ createTraceId = randomUUID } = {}) {
  const createTraceIdFn = typeof createTraceId === "function" ? createTraceId : randomUUID;

  function createTraceEnvelope(seed, overrides = {}) {
    const normalizedSeed = normalizeTraceSeed(seed);
    const normalizedOverrides = normalizeTraceSeed(overrides);
    const traceId = normalizeTraceToken(createTraceIdFn());
    const correlationId =
      normalizedOverrides?.correlationId ||
      normalizedSeed?.correlationId ||
      traceId ||
      normalizeTraceToken(randomUUID());
    const parentTraceId = normalizedOverrides?.traceId || normalizedSeed?.traceId || "";
    return {
      traceId: traceId || normalizeTraceToken(randomUUID()),
      correlationId,
      ...(parentTraceId ? { parentTraceId } : {}),
      ...(normalizedOverrides?.requestId || normalizedSeed?.requestId
        ? { requestId: normalizedOverrides?.requestId || normalizedSeed?.requestId }
        : {}),
      ...(normalizedOverrides?.connectionId || normalizedSeed?.connectionId
        ? { connectionId: normalizedOverrides?.connectionId || normalizedSeed?.connectionId }
        : {}),
      ...(normalizedOverrides?.sessionId || normalizedSeed?.sessionId
        ? { sessionId: normalizedOverrides?.sessionId || normalizedSeed?.sessionId }
        : {}),
      ...(normalizedOverrides?.deckId || normalizedSeed?.deckId
        ? { deckId: normalizedOverrides?.deckId || normalizedSeed?.deckId }
        : {}),
      ...(normalizedOverrides?.source || normalizedSeed?.source
        ? { source: normalizedOverrides?.source || normalizedSeed?.source }
        : {})
    };
  }

  return Object.freeze({
    normalizeTraceSeed,
    createTraceEnvelope,
    countCursorPositionQueries,
    buildCursorPositionReport
  });
}
