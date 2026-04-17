import { randomUUID } from "node:crypto";

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
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
  deliveryAdapters = [],
  routing = {},
  metadata = {}
} = {}) {
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
    sessionId: normalizeNonEmptyString(sessionId),
    intentKind: normalizeNonEmptyString(intentKind) || "status-update",
    eventType: normalizeNonEmptyString(eventType) || "session.output.summary",
    severity: normalizeNonEmptyString(severity) || "info",
    threadKey: normalizeNonEmptyString(threadKey) || "status",
    text: normalizedText,
    format: normalizeNonEmptyString(format) || "plain_text",
    comparableText: normalizeNonEmptyString(comparableText) || createFallbackComparableText(normalizedText),
    deliveryAdapters: normalizedDeliveryAdapters,
    routing: normalizeStringRecord(routing),
    metadata: normalizeStringRecord(metadata)
  });
}
