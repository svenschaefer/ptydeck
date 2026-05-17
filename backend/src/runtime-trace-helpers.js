import crypto from "node:crypto";

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

export function createTraceId(prefix = "trc", randomUUIDFn = crypto.randomUUID) {
  return `${prefix}-${randomUUIDFn()}`;
}

export function createTraceEnvelope(seed, overrides = {}, createTraceIdFn = createTraceId) {
  const normalizedSeed = normalizeTraceSeed(seed);
  const normalizedOverrides = normalizeTraceSeed(overrides);
  const traceId = createTraceIdFn("trc");
  const correlationId = normalizedOverrides?.correlationId || normalizedSeed?.correlationId || traceId;
  const parentTraceId = normalizedOverrides?.traceId || normalizedSeed?.traceId || "";
  return {
    traceId,
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

export function inferTraceContextFromPayload(payload) {
  const normalizedPayloadTrace = normalizeTraceSeed(payload?.trace);
  const sessionId = normalizedPayloadTrace?.sessionId || normalizeTraceToken(payload?.session?.id) || normalizeTraceToken(payload?.sessionId);
  const deckId =
    normalizedPayloadTrace?.deckId ||
    normalizeTraceToken(payload?.session?.deckId) ||
    normalizeTraceToken(payload?.deck?.id) ||
    normalizeTraceToken(payload?.deckId);
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(deckId ? { deckId } : {})
  };
}

export function withTracePayload(payload, traceSeed = null, createTraceEnvelopeFn = createTraceEnvelope) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (normalizeTraceSeed(payload.trace)) {
    return payload;
  }
  return {
    ...payload,
    trace: createTraceEnvelopeFn(traceSeed, inferTraceContextFromPayload(payload))
  };
}
