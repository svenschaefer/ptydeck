const DEFAULT_EVENT_SUMMARY_MAX_LENGTH = 280;

export function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeWhitespace(value) {
  return normalizeNonEmptyString(String(value || "").replace(/\s+/g, " "));
}

export function normalizeLineBreaks(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function truncateMiddleNormalizedText(normalized, maxLength) {
  if (!normalized) {
    return "";
  }
  if (!Number.isInteger(maxLength) || maxLength <= 0 || normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 1) {
    return "…";
  }
  const available = maxLength - 1;
  const headLength = Math.max(1, Math.ceil(available / 2));
  const tailLength = Math.max(1, Math.floor(available / 2));
  const head = normalized.slice(0, headLength).trimEnd();
  const tail = normalized.slice(normalized.length - tailLength).trimStart();
  return `${head}…${tail}`;
}

export function truncateStructuredMessageText(value, maxLength = DEFAULT_EVENT_SUMMARY_MAX_LENGTH) {
  const normalized = normalizeLineBreaks(value)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return truncateMiddleNormalizedText(normalized, maxLength);
}

export function truncateDisplayText(value, maxLength = DEFAULT_EVENT_SUMMARY_MAX_LENGTH) {
  return truncateMiddleNormalizedText(normalizeWhitespace(value), maxLength);
}

export function buildFallbackSessionLabel(session) {
  const quickIdToken = normalizeNonEmptyString(session?.quickIdToken);
  const name =
    normalizeNonEmptyString(session?.name) ||
    normalizeNonEmptyString(session?.shell) ||
    normalizeNonEmptyString(session?.id);
  return quickIdToken ? `[${quickIdToken}] ${name}` : name;
}

export function createDefaultMessageIntentDecision(event, state) {
  const messageKey = normalizeNonEmptyString(event?.threadKey) || "status";
  const hasMessage = state?.messageCreated === true || Number.isInteger(state?.messageId) || Boolean(normalizeNonEmptyString(state?.messageId));
  return Object.freeze({
    action: hasMessage ? "update" : "new",
    messageKey,
    reason: "message_intent_default"
  });
}

export function buildDeliveryEventFromMessageIntent(
  intent,
  {
    session,
    profile = "",
    trace = null,
    nowFn = () => Date.now(),
    formatSessionLabel = buildFallbackSessionLabel,
    maxEventSummaryLength = DEFAULT_EVENT_SUMMARY_MAX_LENGTH
  } = {}
) {
  const summaryMaxLength =
    Number.isInteger(intent?.metadata?.summaryMaxLength) && intent.metadata.summaryMaxLength > 0
      ? intent.metadata.summaryMaxLength
      : maxEventSummaryLength;
  const preserveStructuredSummary =
    intent?.format === "structured_text" || intent?.metadata?.preserveStructuredSummary === true;
  const summary = preserveStructuredSummary
    ? truncateStructuredMessageText(intent?.text || "", summaryMaxLength)
    : truncateDisplayText(intent?.text || "", summaryMaxLength);
  const label =
    typeof formatSessionLabel === "function" ? formatSessionLabel(session) : buildFallbackSessionLabel(session);
  const text = summary ? `${label}: ${summary}` : label;
  return Object.freeze({
    id: normalizeNonEmptyString(intent?.intentId) || "",
    occurredAt: nowFn(),
    sessionId: normalizeNonEmptyString(intent?.sessionId) || normalizeNonEmptyString(session?.id),
    session,
    profile: normalizeNonEmptyString(profile),
    type: normalizeNonEmptyString(intent?.eventType) || "session.output.summary",
    severity: normalizeNonEmptyString(intent?.severity) || "info",
    threadKey: normalizeNonEmptyString(intent?.threadKey) || "status",
    summary,
    detail: "",
    text,
    trace,
    aggregationReason:
      normalizeNonEmptyString(intent?.metadata?.aggregationReason) || normalizeNonEmptyString(intent?.intentKind),
    deliveryScope: normalizeNonEmptyString(intent?.metadata?.legacyDeliveryScope),
    deliveryBlockKey:
      normalizeNonEmptyString(intent?.turn?.turnId) ||
      normalizeNonEmptyString(intent?.outputEpisode?.episodeId) ||
      normalizeNonEmptyString(intent?.projection?.projectionId),
    noiseClass: "",
    comparableText: normalizeNonEmptyString(intent?.comparableText),
    messageIntent: intent
  });
}
