import {
  CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH,
  CODEX_SEPARATOR_INFO_SCOPE,
  CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH,
  CODEX_SEPARATOR_SECTION_SCOPE
} from "./codex-outbound-evaluator.js";
import { createAppSemanticAdapterDescriptor } from "./terminal-messaging-core.js";

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getFallbackSessionAppIdentity(session) {
  if (!session || typeof session !== "object") {
    return {
      family: "unknown",
      label: "",
      source: "unknown",
      confidence: 0
    };
  }
  const appIdentity = session.appIdentity && typeof session.appIdentity === "object" ? session.appIdentity : {};
  return {
    family: normalizeNonEmptyString(appIdentity.family).toLowerCase() || "unknown",
    label: normalizeNonEmptyString(appIdentity.label).toLowerCase(),
    source: normalizeNonEmptyString(appIdentity.source).toLowerCase() || "unknown",
    confidence: Number.isFinite(appIdentity.confidence) ? appIdentity.confidence : 0
  };
}

function isFallbackCodingAgentContext(session, profile = "") {
  const appIdentity = getFallbackSessionAppIdentity(session);
  return appIdentity.family === "coding-agent" || appIdentity.label === "codex" || profile === "coding-agent";
}

function appendProjectionSemanticSourceLines(target, rawText, source, normalizeLineBreaks) {
  const normalized = normalizeLineBreaks(rawText);
  if (!normalized) {
    return;
  }
  for (const line of normalized.split("\n")) {
    target.push({ source, raw: line });
  }
}

function collectProjectionSemanticSourceLines(runtimeSnapshot, normalizeLineBreaks) {
  const transcriptEntries = Array.isArray(runtimeSnapshot?.transcriptDelta?.entries) ? runtimeSnapshot.transcriptDelta.entries : [];
  const transcriptLines = [];
  for (const entry of transcriptEntries) {
    if (!entry?.visibleText || entry.type === "resize" || entry.type === "empty") {
      continue;
    }
    appendProjectionSemanticSourceLines(transcriptLines, entry.visibleText, "transcript", normalizeLineBreaks);
  }
  const diffLines = [];
  const diffGroups = [
    ...(Array.isArray(runtimeSnapshot?.diff?.activeTailLines?.lines) ? runtimeSnapshot.diff.activeTailLines.lines : []),
    ...(Array.isArray(runtimeSnapshot?.diff?.activeVisibleLines?.lines) ? runtimeSnapshot.diff.activeVisibleLines.lines : [])
  ];
  for (const entry of diffGroups) {
    if (!entry?.after || entry.after === entry.before) {
      continue;
    }
    appendProjectionSemanticSourceLines(diffLines, entry.after, "diff", normalizeLineBreaks);
  }
  return Object.freeze({
    transcriptLines: Object.freeze(transcriptLines),
    diffLines: Object.freeze(diffLines)
  });
}

function buildProjectionSemanticMessageText(lines = [], normalizeWhitespace, normalizeLineBreaks) {
  const normalizedLines = lines
    .map((line) => normalizeWhitespace(typeof line === "string" ? line : line?.text))
    .filter(Boolean);
  if (normalizedLines.length === 0) {
    return "";
  }
  const structured =
    normalizedLines.length > 1 || normalizedLines.some((line) => /^(?:[-*]\s+|\d+\.\s+)|:$/u.test(line));
  const text = structured ? normalizedLines.join("\n") : normalizedLines.join(" ");
  return normalizeLineBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildProjectionSemanticBaselineComparableSet(runtimeSnapshot, session, profile, helpers) {
  const snapshot = runtimeSnapshot?.baseline?.snapshot || null;
  const lines = [
    ...(Array.isArray(snapshot?.activeVisibleLines) ? snapshot.activeVisibleLines : []),
    ...(Array.isArray(snapshot?.activeTailLines) ? snapshot.activeTailLines : [])
  ];
  const comparableTexts = new Set();
  for (const line of lines) {
    const normalized = helpers
      .normalizeWhitespace(
        helpers.trimCodingAgentLowValueTail(
          helpers.stripTerminalNoiseFragments(helpers.stripSemanticInlinePromptTail(line)),
          session,
          profile
        )
      )
      .replace(/^[•*]\s+/u, "");
    const comparableText = helpers.createComparableText(normalized);
    if (comparableText) {
      comparableTexts.add(comparableText);
    }
  }
  return comparableTexts;
}

function normalizeProjectionSemanticSourceLine(rawLine, session, profile, options, helpers) {
  const original = helpers.normalizeWhitespace(String(rawLine || ""));
  if (!original) {
    return null;
  }
  const startsBullet = /^[•*]\s+/u.test(original);
  const startsList = /^(?:[-*]\s+|\d+\.\s+)/u.test(original);
  const inputText = normalizeNonEmptyString(options?.inputText);
  const promptEchoPattern = inputText ? new RegExp(`^[›>]+\\s*${helpers.escapeRegExp(inputText)}(?:\\s+.*)?$`, "u") : null;
  if (promptEchoPattern?.test(original)) {
    return null;
  }
  let normalized = helpers.stripSemanticInlinePromptTail(original);
  normalized = helpers.normalizeWhitespace(
    helpers.trimCodingAgentLowValueTail(helpers.stripTerminalNoiseFragments(normalized), session, profile)
  );
  if (!normalized) {
    return null;
  }
  normalized = normalized.replace(/^[•*]\s+/u, "");
  if (!normalized) {
    return null;
  }
  if (inputText) {
    if (normalized === inputText) {
      return null;
    }
    if (normalized.startsWith(inputText)) {
      const remainder = helpers.normalizeWhitespace(normalized.slice(inputText.length));
      if (!remainder || helpers.replyPromptEchoTailPattern.test(remainder)) {
        return null;
      }
      normalized = remainder;
    }
  }
  if (!normalized || /^[›>]/u.test(normalized)) {
    return null;
  }
  if (
    helpers.noiseSeparatorOnlyPattern.test(normalized) ||
    helpers.codingAgentAntiBulletPattern.test(normalized) ||
    helpers.isSeparatorHint(normalized, session, profile) ||
    helpers.isCodexTelegramReplyMetaLine(normalized) ||
    helpers.isCommentaryLikeCodexOutboundText(normalized, session, profile) ||
    helpers.codingAgentWorkingOverlayPattern.test(normalized)
  ) {
    return null;
  }
  const noise = helpers.classifyNoiseSignature(normalized, session, profile);
  if (noise.lowInformation) {
    return null;
  }
  if (options?.baselineComparableTexts instanceof Set && noise.comparableText && options.baselineComparableTexts.has(noise.comparableText)) {
    return null;
  }
  return Object.freeze({
    text: normalized,
    comparableText: noise.comparableText,
    structured: startsBullet || startsList || /:$/u.test(normalized)
  });
}

function extractProjectionSemanticLines(runtimeSnapshot, session, profile, options, helpers) {
  const baselineComparableTexts = buildProjectionSemanticBaselineComparableSet(runtimeSnapshot, session, profile, helpers);
  const collected = collectProjectionSemanticSourceLines(runtimeSnapshot, helpers.normalizeLineBreaks);
  function normalizeSourceLines(sourceLines = []) {
    const lines = [];
    const seenComparableTexts = new Set();
    for (const sourceLine of sourceLines) {
      const rawNormalized = helpers.normalizeWhitespace(sourceLine?.raw);
      const strippedRaw = helpers.stripSemanticInlinePromptTail(rawNormalized).replace(/^[•*]\s+/u, "");
      if (
        lines.length > 0 &&
        rawNormalized &&
        (
          helpers.noiseSeparatorOnlyPattern.test(rawNormalized) ||
          helpers.isCodexTelegramReplyMetaLine(strippedRaw) ||
          helpers.isCommentaryLikeCodexOutboundText(strippedRaw, session, profile)
        )
      ) {
        break;
      }
      const normalized = normalizeProjectionSemanticSourceLine(
        sourceLine.raw,
        session,
        profile,
        {
          inputText: options?.inputText || "",
          baselineComparableTexts
        },
        helpers
      );
      if (!normalized?.text || !normalized.comparableText || seenComparableTexts.has(normalized.comparableText)) {
        continue;
      }
      seenComparableTexts.add(normalized.comparableText);
      lines.push(normalized);
    }
    return Object.freeze(lines);
  }
  const transcriptLines = normalizeSourceLines(collected.transcriptLines);
  if (transcriptLines.length > 0) {
    return transcriptLines;
  }
  return normalizeSourceLines(collected.diffLines);
}

function createCodexSemanticAdapter(helpers = {}) {
  const getSessionAppIdentity =
    typeof helpers.getSessionAppIdentity === "function" ? helpers.getSessionAppIdentity : getFallbackSessionAppIdentity;
  const isCodingAgentContext =
    typeof helpers.isCodingAgentContext === "function" ? helpers.isCodingAgentContext : isFallbackCodingAgentContext;
  const adapterId = "codex-semantic-adapter";

  function matches(session, profile = "") {
    const appIdentity = getSessionAppIdentity(session);
    const label = normalizeNonEmptyString(appIdentity.label).toLowerCase();
    const family = normalizeNonEmptyString(appIdentity.family).toLowerCase();
    const startCommand = normalizeNonEmptyString(session?.startCommand).toLowerCase();
    const sessionName = normalizeNonEmptyString(session?.name).toLowerCase();
    if (label === "codex") {
      return true;
    }
    if (family === "coding-agent" && /\bcodex\b/u.test(`${startCommand} ${sessionName}`)) {
      return true;
    }
    return isCodingAgentContext(session, profile) && /\bcodex\b/u.test(`${startCommand} ${sessionName}`);
  }

  function createDescriptor(session, profile, strategy = "") {
    const appIdentity = getSessionAppIdentity(session);
    const appFamily = normalizeNonEmptyString(appIdentity.family) || "coding-agent";
    const appLabel = normalizeNonEmptyString(appIdentity.label) || "codex";
    return createAppSemanticAdapterDescriptor({
      adapterId,
      appFamily,
      appLabels: appLabel ? [appLabel] : ["codex"],
      strategy,
      metadata: {
        profile,
        identitySource: normalizeNonEmptyString(appIdentity.source),
        identityConfidence: Number.isFinite(appIdentity.confidence) ? Number(appIdentity.confidence) : 0
      }
    });
  }

  function buildTurnSemanticDecision(runtimeSnapshot, session, profile) {
    const lines = extractProjectionSemanticLines(
      runtimeSnapshot,
      session,
      profile,
      {
        inputText: helpers.normalizeReplyPromotionInputText(runtimeSnapshot?.inputText)
      },
      helpers
    );
    const text = buildProjectionSemanticMessageText(lines, helpers.normalizeWhitespace, helpers.normalizeLineBreaks);
    if (!text) {
      return null;
    }
    return Object.freeze({
      deliveryScope: helpers.codexTelegramReplyScope,
      text,
      format: /\n/u.test(text) ? "structured_text" : "plain_text",
      comparableText: helpers.createComparableText(text),
      deliveryBlockKey:
        normalizeNonEmptyString(runtimeSnapshot?.turn?.turnId) ||
        normalizeNonEmptyString(runtimeSnapshot?.turn?.correlationId) ||
        normalizeNonEmptyString(runtimeSnapshot?.turn?.traceId),
      metadata: {
        aggregationReason: helpers.codexTelegramReplyScope,
        legacyDeliveryScope: helpers.codexTelegramReplyScope,
        summaryMaxLength: helpers.codexTelegramReplyMaxTextLength,
        preserveStructuredSummary: /\n/u.test(text),
        semanticExtractionSource: "turn-transcript-diff"
      }
    });
  }

  function buildOutputEpisodeSemanticDecision(runtimeSnapshot, session, profile) {
    const lines = extractProjectionSemanticLines(runtimeSnapshot, session, profile, {}, helpers);
    const text = buildProjectionSemanticMessageText(lines, helpers.normalizeWhitespace, helpers.normalizeLineBreaks);
    if (!text) {
      return null;
    }
    const lineCount = lines.length;
    const structured =
      lineCount > 1 || lines.some((line) => line.structured === true) || /\n/u.test(text);
    if (!structured) {
      const wordCount = text.split(/\s+/u).filter(Boolean).length;
      if (text.length < helpers.codexTelegramReplyMinTextLength && wordCount < helpers.codexTelegramReplyMinWords) {
        return null;
      }
    }
    const deliveryScope = structured ? CODEX_SEPARATOR_SECTION_SCOPE : CODEX_SEPARATOR_INFO_SCOPE;
    return Object.freeze({
      deliveryScope,
      text,
      format: structured ? "structured_text" : "plain_text",
      comparableText: helpers.createComparableText(text),
      deliveryBlockKey: normalizeNonEmptyString(runtimeSnapshot?.outputEpisode?.episodeId),
      metadata: {
        aggregationReason: deliveryScope,
        legacyDeliveryScope: deliveryScope,
        summaryMaxLength: structured ? CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH : CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH,
        preserveStructuredSummary: structured,
        semanticExtractionSource: "output-episode-transcript-diff"
      }
    });
  }

  return Object.freeze({
    adapterId,
    matches,
    createDescriptor,
    buildTurnSemanticDecision,
    buildOutputEpisodeSemanticDecision
  });
}

export function createAppSemanticAdapterRegistry(helpers = {}) {
  const adapters = Object.freeze([createCodexSemanticAdapter(helpers)]);
  return Object.freeze({
    adapters,
    resolveForSession(session, profile = "") {
      for (const adapter of adapters) {
        if (adapter.matches(session, profile)) {
          return adapter;
        }
      }
      return null;
    },
    listAdapterIds() {
      return Object.freeze(adapters.map((adapter) => adapter.adapterId));
    }
  });
}
