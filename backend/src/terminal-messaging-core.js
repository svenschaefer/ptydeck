import { randomUUID } from "node:crypto";

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeStringArray(values = []) {
  if (!Array.isArray(values)) {
    return Object.freeze([]);
  }
  const normalized = values.map((value) => normalizeNonEmptyString(value)).filter(Boolean);
  return Object.freeze(normalized);
}

function normalizeStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({});
  }
  const normalized = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = normalizeNonEmptyString(key);
    if (!normalizedKey) {
      continue;
    }
    if (entryValue === null || entryValue === undefined) {
      continue;
    }
    if (typeof entryValue === "string") {
      const normalizedValue = normalizeNonEmptyString(entryValue);
      if (normalizedValue) {
        normalized[normalizedKey] = normalizedValue;
      }
      continue;
    }
    if (typeof entryValue === "number" || typeof entryValue === "boolean") {
      normalized[normalizedKey] = entryValue;
    }
  }
  return Object.freeze(normalized);
}

function createFallbackComparableText(text) {
  return normalizeNonEmptyString(text).replace(/\s+/gu, " ").toLowerCase();
}

export function createTerminalProjection({
  projectionId = "",
  sessionId = "",
  transport = "pty",
  representation = "screen-buffer",
  sourceRevision = "",
  appFamily = "",
  appLabel = "",
  profile = "",
  metadata = {}
} = {}) {
  const normalizedSessionId = normalizeNonEmptyString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("TerminalProjection requires a sessionId.");
  }
  return Object.freeze({
    entityType: "TerminalProjection",
    projectionId: normalizeNonEmptyString(projectionId) || `projection:${randomUUID()}`,
    sessionId: normalizedSessionId,
    transport: normalizeNonEmptyString(transport) || "pty",
    representation: normalizeNonEmptyString(representation) || "screen-buffer",
    sourceRevision: normalizeNonEmptyString(sourceRevision),
    appFamily: normalizeNonEmptyString(appFamily),
    appLabel: normalizeNonEmptyString(appLabel),
    profile: normalizeNonEmptyString(profile),
    metadata: normalizeStringRecord(metadata)
  });
}

export function createTurn({
  turnId = "",
  sessionId = "",
  triggerKind = "submitted-input",
  inputSource = "",
  correlationId = "",
  traceId = "",
  baselineProjectionId = "",
  openedAt = 0,
  closedAt = 0,
  status = "open",
  metadata = {}
} = {}) {
  const normalizedSessionId = normalizeNonEmptyString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("Turn requires a sessionId.");
  }
  return Object.freeze({
    entityType: "Turn",
    turnId: normalizeNonEmptyString(turnId) || `turn:${randomUUID()}`,
    sessionId: normalizedSessionId,
    triggerKind: normalizeNonEmptyString(triggerKind) || "submitted-input",
    inputSource: normalizeNonEmptyString(inputSource),
    correlationId: normalizeNonEmptyString(correlationId),
    traceId: normalizeNonEmptyString(traceId),
    baselineProjectionId: normalizeNonEmptyString(baselineProjectionId),
    openedAt: normalizeNonNegativeInteger(openedAt),
    closedAt: normalizeNonNegativeInteger(closedAt),
    status: normalizeNonEmptyString(status) || "open",
    metadata: normalizeStringRecord(metadata)
  });
}

export function createOutputEpisode({
  episodeId = "",
  sessionId = "",
  episodeKind = "autonomous-output",
  sourceProjectionId = "",
  startedAt = 0,
  completedAt = 0,
  status = "open",
  metadata = {}
} = {}) {
  const normalizedSessionId = normalizeNonEmptyString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("OutputEpisode requires a sessionId.");
  }
  return Object.freeze({
    entityType: "OutputEpisode",
    episodeId: normalizeNonEmptyString(episodeId) || `episode:${randomUUID()}`,
    sessionId: normalizedSessionId,
    episodeKind: normalizeNonEmptyString(episodeKind) || "autonomous-output",
    sourceProjectionId: normalizeNonEmptyString(sourceProjectionId),
    startedAt: normalizeNonNegativeInteger(startedAt),
    completedAt: normalizeNonNegativeInteger(completedAt),
    status: normalizeNonEmptyString(status) || "open",
    metadata: normalizeStringRecord(metadata)
  });
}

export function createDeliveryAdapterDescriptor({
  adapterId = "",
  channel = "",
  capabilities = [],
  metadata = {}
} = {}) {
  const normalizedAdapterId = normalizeNonEmptyString(adapterId);
  const normalizedChannel = normalizeNonEmptyString(channel);
  if (!normalizedAdapterId || !normalizedChannel) {
    throw new Error("DeliveryAdapter requires adapterId and channel.");
  }
  return Object.freeze({
    entityType: "DeliveryAdapter",
    adapterId: normalizedAdapterId,
    channel: normalizedChannel,
    capabilities: normalizeStringArray(capabilities),
    metadata: normalizeStringRecord(metadata)
  });
}

export function createAppSemanticAdapterDescriptor({
  adapterId = "",
  appFamily = "",
  appLabels = [],
  strategy = "",
  metadata = {}
} = {}) {
  const normalizedAdapterId = normalizeNonEmptyString(adapterId);
  if (!normalizedAdapterId) {
    throw new Error("AppSemanticAdapter requires an adapterId.");
  }
  return Object.freeze({
    entityType: "AppSemanticAdapter",
    adapterId: normalizedAdapterId,
    appFamily: normalizeNonEmptyString(appFamily),
    appLabels: normalizeStringArray(appLabels),
    strategy: normalizeNonEmptyString(strategy),
    metadata: normalizeStringRecord(metadata)
  });
}

export function createMessageIntent({
  intentId = "",
  sessionId = "",
  intentKind = "status-update",
  eventType = "session.output.summary",
  severity = "info",
  threadKey = "status",
  text = "",
  format = "plain_text",
  comparableText = "",
  projection = null,
  turn = null,
  outputEpisode = null,
  semanticAdapter = null,
  deliveryAdapters = [],
  routing = {},
  metadata = {}
} = {}) {
  const normalizedSessionId = normalizeNonEmptyString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("MessageIntent requires a sessionId.");
  }
  if (!projection || projection.entityType !== "TerminalProjection") {
    throw new Error("MessageIntent requires a TerminalProjection.");
  }
  const hasTurn = Boolean(turn);
  const hasOutputEpisode = Boolean(outputEpisode);
  if (hasTurn === hasOutputEpisode) {
    throw new Error("MessageIntent requires exactly one of Turn or OutputEpisode.");
  }
  if (hasTurn && turn.entityType !== "Turn") {
    throw new Error("MessageIntent turn must be a Turn.");
  }
  if (hasOutputEpisode && outputEpisode.entityType !== "OutputEpisode") {
    throw new Error("MessageIntent outputEpisode must be an OutputEpisode.");
  }
  if (semanticAdapter && semanticAdapter.entityType !== "AppSemanticAdapter") {
    throw new Error("MessageIntent semanticAdapter must be an AppSemanticAdapter.");
  }
  const normalizedText = normalizeNonEmptyString(text);
  if (!normalizedText) {
    throw new Error("MessageIntent requires text.");
  }
  const normalizedDeliveryAdapters = Array.isArray(deliveryAdapters)
    ? Object.freeze(
        deliveryAdapters.filter(Boolean).map((adapter) => {
          if (adapter?.entityType !== "DeliveryAdapter") {
            throw new Error("MessageIntent deliveryAdapters entries must be DeliveryAdapter descriptors.");
          }
          return adapter;
        })
      )
    : Object.freeze([]);
  return Object.freeze({
    entityType: "MessageIntent",
    intentId: normalizeNonEmptyString(intentId) || `intent:${randomUUID()}`,
    sessionId: normalizedSessionId,
    intentKind: normalizeNonEmptyString(intentKind) || "status-update",
    eventType: normalizeNonEmptyString(eventType) || "session.output.summary",
    severity: normalizeNonEmptyString(severity) || "info",
    threadKey: normalizeNonEmptyString(threadKey) || "status",
    text: normalizedText,
    format: normalizeNonEmptyString(format) || "plain_text",
    comparableText: normalizeNonEmptyString(comparableText) || createFallbackComparableText(normalizedText),
    projection,
    turn,
    outputEpisode,
    semanticAdapter,
    deliveryAdapters: normalizedDeliveryAdapters,
    routing: normalizeStringRecord(routing),
    metadata: normalizeStringRecord(metadata)
  });
}
