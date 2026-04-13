import { normalizeVisibleReplayText } from "./replay-excerpt.js";

export const CODEX_SEPARATOR_INFO_SCOPE = "codex_separator_info";
export const CODEX_SEPARATOR_SECTION_SCOPE = "codex_separator_section";
export const CODEX_SEPARATOR_SUMMARY_SCOPE = "codex_separator_summary_sentence";
export const CODEX_SEPARATOR_INFO_MAX_GAP_MS = 4500;
export const CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES = 120;
export const CODEX_SEPARATOR_INFO_CONTINUATION_GAP_MS = 500;
export const CODEX_SEPARATOR_INFO_MIN_TEXT_LENGTH = 24;
export const CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH = 400;
export const CODEX_SEPARATOR_SECTION_MAX_GAP_MS = 4500;
export const CODEX_SEPARATOR_SECTION_MAX_LOOKAHEAD_ENTRIES = 160;
export const CODEX_SEPARATOR_SECTION_MIN_TEXT_LENGTH = 24;
export const CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH = 1200;
export const CODEX_SEPARATOR_SECTION_MAX_LINES = 20;
export const CODEX_SEPARATOR_SUMMARY_MIN_TEXT_LENGTH = 40;
export const CODEX_SEPARATOR_SUMMARY_MAX_TEXT_LENGTH = 400;
export const CODEX_SEPARATOR_SUMMARY_MIN_WORDS = 7;

const CODING_AGENT_BULLET_PREFIX_PATTERN = /^•\s+/u;
const CODING_AGENT_PROMPT_LINE_PATTERN = /^›\s+/u;
const CODING_AGENT_CONTINUATION_LINE_PATTERN = /^  /u;
const CODING_AGENT_TAIL_LINE_PATTERN = /^  (?:└|│|□)\s/u;
const CODING_AGENT_NORMALIZED_TAIL_LINE_PATTERN = /^(?:└|│|□)\s/u;
const CODING_AGENT_DIFF_LINE_PATTERN = /^(?:@@|\+\+\+|---|\+ |- |\d+\s*[+-])/u;
const CODING_AGENT_WORKED_FOR_PATTERN = /^─+\s*Worked for\b/iu;
const CODING_AGENT_INTERRUPT_OVERLAY_PATTERN = /\b(?:esc to interrupt|interrupt to stop|background terminal running|\/ps to view|\/stop to close)\b/iu;
const CODING_AGENT_MAJOR_SEPARATOR_PATTERN = /^─{40,}$/u;
const CODING_AGENT_SECTION_LIST_ITEM_PATTERN = /^(?:-\s+|\d+\.\s+)/u;
const CODING_AGENT_SECTION_SUBSECTION_PATTERN = /^[A-ZÄÖÜ][\p{L}\p{N}\- ]{2,80}:?$/u;

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitNormalizedMeaningfulLines(value) {
  return normalizeLineBreaks(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function isStatusRibbon(value) {
  const compact = normalizeWhitespace(value);
  return /background terminal running/u.test(compact) || /\/ps to view/u.test(compact) || /\/stop to close/u.test(compact);
}

function isTinyOverlayFragment(value) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return true;
  }
  if (CODING_AGENT_BULLET_PREFIX_PATTERN.test(trimmed) || CODING_AGENT_PROMPT_LINE_PATTERN.test(trimmed) || CODING_AGENT_MAJOR_SEPARATOR_PATTERN.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 24) {
    return false;
  }
  if (/\n/u.test(trimmed)) {
    return false;
  }
  if (/^[•◦\d]+$/u.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z]+$/u.test(trimmed) && trimmed.length <= 4) {
    return true;
  }
  if (/^[A-Za-z•◦\d ]+$/u.test(trimmed) && trimmed.length <= 8) {
    const tokens = trimmed.split(/\s+/u).filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 2 && tokens.every((token) => token.length <= 4)) {
      return true;
    }
  }
  if (/^[a-z•◦\d]+$/u.test(trimmed) && !/\s/u.test(trimmed) && trimmed.length <= 12) {
    return true;
  }
  if (/^W(?:o|or|rk|ki|in|ng|g|ait|ork|orking|aiting)+$/iu.test(trimmed)) {
    return true;
  }
  return false;
}

function scrubCodexSectionLine(line) {
  let value = normalizeWhitespace(line);
  if (!value) {
    return "";
  }
  const promptIndex = value.search(/›/u);
  if (promptIndex >= 0) {
    value = normalizeWhitespace(value.slice(0, promptIndex));
  }
  if (!value) {
    return "";
  }
  if (CODING_AGENT_INTERRUPT_OVERLAY_PATTERN.test(value) || CODING_AGENT_WORKED_FOR_PATTERN.test(value)) {
    return "";
  }
  if (isStatusRibbon(value) && !CODING_AGENT_BULLET_PREFIX_PATTERN.test(value) && !CODING_AGENT_SECTION_LIST_ITEM_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function classifyCodexStreamEntryKind(visibleText) {
  const compact = normalizeWhitespace(visibleText);
  if (!compact) {
    return "blank";
  }
  if (isStatusRibbon(compact)) {
    return "status_ribbon";
  }
  if (isTinyOverlayFragment(compact)) {
    return "overlay_fragment";
  }
  return "substantial";
}

function analyzeMajorSeparatorEntry(visibleText) {
  const meaningfulLines = splitNormalizedMeaningfulLines(visibleText);
  if (meaningfulLines.length === 0) {
    return { ok: false, contaminated: false };
  }
  const firstLine = meaningfulLines[0];
  if (CODING_AGENT_MAJOR_SEPARATOR_PATTERN.test(firstLine)) {
    const contaminated = meaningfulLines.slice(1).some((line) => !isTinyOverlayFragment(line));
    return { ok: !contaminated, contaminated: meaningfulLines.length > 1 && !contaminated };
  }
  const contaminatedMatch = /^(─{40,})(.+)$/u.exec(firstLine);
  if (!contaminatedMatch) {
    return { ok: false, contaminated: false };
  }
  const trailingNoise = normalizeWhitespace(contaminatedMatch[2] || "");
  if (!trailingNoise || !isTinyOverlayFragment(trailingNoise)) {
    return { ok: false, contaminated: false };
  }
  const contaminated = meaningfulLines.slice(1).some((line) => !isTinyOverlayFragment(line));
  return { ok: !contaminated, contaminated: true };
}

function isMajorSeparatorVisible(visibleText) {
  return analyzeMajorSeparatorEntry(visibleText).ok;
}

function firstVisibleLine(visibleText) {
  const lines = normalizeLineBreaks(visibleText).split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    return line;
  }
  return "";
}

function classifyCodexBullet(headline) {
  if (/^• Updated Plan$/u.test(headline)) {
    return "updated_plan";
  }
  if (/^• Ran /u.test(headline)) {
    return "ran";
  }
  if (/^• Explored$/u.test(headline)) {
    return "explored";
  }
  if (/^• Waited(?: for background terminal)?/u.test(headline)) {
    return "waited";
  }
  if (/^• Context compacted$/u.test(headline)) {
    return "context_compacted";
  }
  return "info";
}

function hasCodexInlineContamination(text) {
  const compact = normalizeWhitespace(text);
  if (!compact) {
    return true;
  }
  return (
    /•(?:Ran|Explored|Waited|Context compacted|Updated Plan)/u.test(compact) ||
    CODING_AGENT_PROMPT_LINE_PATTERN.test(compact) ||
    /\bgpt-[\w.-]+\b/iu.test(compact) ||
    /\b\d{1,3}%\s+(?:left|used|remaining)\b/iu.test(compact) ||
    /\b(?:background terminal running|\/ps to view|\/stop to close|esc to interrupt)\b/iu.test(compact) ||
    CODING_AGENT_WORKED_FOR_PATTERN.test(compact)
  );
}

function normalizeCodexSummaryText(value) {
  return normalizeWhitespace(normalizeLineBreaks(value).replace(/\s+\|\s+/g, " | "));
}

export function evaluateCodexSeparatorSummaryCandidate(summary, options = {}) {
  const text = normalizeCodexSummaryText(summary);
  const aggregationReason = normalizeWhitespace(options.aggregationReason || "");
  const blockKey = normalizeWhitespace(options.blockKey || "");
  const firstObservedAt = Number.isInteger(options.firstObservedAt) ? options.firstObservedAt : 0;
  const lastObservedAt = Number.isInteger(options.lastObservedAt) ? options.lastObservedAt : 0;
  if (aggregationReason && aggregationReason !== "separator_hint") {
    return { ok: false, reason: "unsupported_aggregation_reason" };
  }
  if (!text) {
    return { ok: false, reason: "empty_summary" };
  }
  if (text.includes(" | ")) {
    return { ok: false, reason: "multi_fragment_summary" };
  }
  if (text.length < CODEX_SEPARATOR_SUMMARY_MIN_TEXT_LENGTH || text.length > CODEX_SEPARATOR_SUMMARY_MAX_TEXT_LENGTH) {
    return { ok: false, reason: "summary_length_out_of_range" };
  }
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (wordCount < CODEX_SEPARATOR_SUMMARY_MIN_WORDS) {
    return { ok: false, reason: "summary_too_short" };
  }
  if (/:$/u.test(text)) {
    return { ok: false, reason: "summary_trailing_colon" };
  }
  if (hasCodexInlineContamination(text) || CODING_AGENT_DIFF_LINE_PATTERN.test(text)) {
    return { ok: false, reason: "summary_inline_contamination" };
  }
  if (!/[.!?]$/u.test(text) && wordCount < CODEX_SEPARATOR_SUMMARY_MIN_WORDS + 2) {
    return { ok: false, reason: "summary_missing_sentence_boundary" };
  }
  const effectiveBlockKey = blockKey || [firstObservedAt, lastObservedAt].filter(Boolean).join(":");
  return {
    ok: true,
    family: CODEX_SEPARATOR_SUMMARY_SCOPE,
    text,
    key: `${effectiveBlockKey || "summary"}:${text}`,
    deliveryBlockKey: effectiveBlockKey
  };
}

function normalizeCodexInfoText(headline, continuationLine = "") {
  const parts = [];
  const cleanedHeadline = String(headline || "").replace(CODING_AGENT_BULLET_PREFIX_PATTERN, "").trim();
  if (cleanedHeadline) {
    parts.push(cleanedHeadline);
  }
  const cleanedContinuation = normalizeWhitespace(String(continuationLine || "").replace(CODING_AGENT_CONTINUATION_LINE_PATTERN, ""));
  if (cleanedContinuation && !CODING_AGENT_TAIL_LINE_PATTERN.test(continuationLine)) {
    parts.push(cleanedContinuation);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function analyzeCodexInfoEntry(visibleText) {
  const normalizedText = normalizeLineBreaks(visibleText);
  const lines = normalizedText.split("\n");
  const meaningfulLines = lines.filter((line) => line.trim());
  if (meaningfulLines.length === 0) {
    return { ok: false, reason: "blank_entry", bulletType: "" };
  }
  const headline = meaningfulLines[0];
  if (!CODING_AGENT_BULLET_PREFIX_PATTERN.test(headline)) {
    return { ok: false, reason: "not_bullet", bulletType: "" };
  }
  const bulletType = classifyCodexBullet(headline);
  if (bulletType !== "info") {
    return { ok: false, reason: `first_bullet_${bulletType}`, bulletType };
  }
  let continuationLine = "";
  let continuationConsumed = false;
  for (let index = 1; index < meaningfulLines.length; index += 1) {
    const line = meaningfulLines[index];
    if (!continuationConsumed && CODING_AGENT_CONTINUATION_LINE_PATTERN.test(line) && !CODING_AGENT_TAIL_LINE_PATTERN.test(line)) {
      continuationLine = line;
      continuationConsumed = true;
      continue;
    }
    if (
      CODING_AGENT_TAIL_LINE_PATTERN.test(line) ||
      CODING_AGENT_BULLET_PREFIX_PATTERN.test(line) ||
      CODING_AGENT_PROMPT_LINE_PATTERN.test(line) ||
      isMajorSeparatorVisible(line) ||
      CODING_AGENT_WORKED_FOR_PATTERN.test(line) ||
      CODING_AGENT_DIFF_LINE_PATTERN.test(line)
    ) {
      return { ok: false, reason: "inline_contamination", bulletType };
    }
    return { ok: false, reason: "multi_line_contamination", bulletType };
  }
  const text = normalizeCodexInfoText(headline, continuationLine);
  if (!text) {
    return { ok: false, reason: "empty_normalized_info", bulletType };
  }
  if (text.length < CODEX_SEPARATOR_INFO_MIN_TEXT_LENGTH || text.length > CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH) {
    return { ok: false, reason: "info_length_out_of_range", bulletType };
  }
  if (hasCodexInlineContamination(text)) {
    return { ok: false, reason: "inline_contamination", bulletType };
  }
  return {
    ok: true,
    bulletType,
    headline,
    continuationLine,
    text,
    continuationConsumed
  };
}

function analyzeCodexContinuationEntry(visibleText) {
  const normalizedText = normalizeLineBreaks(visibleText);
  const meaningfulLines = normalizedText.split("\n").filter((line) => line.trim());
  if (meaningfulLines.length === 0) {
    return { ok: false, reason: "blank_entry" };
  }
  const firstLine = meaningfulLines[0];
  if (!CODING_AGENT_CONTINUATION_LINE_PATTERN.test(firstLine) || CODING_AGENT_TAIL_LINE_PATTERN.test(firstLine)) {
    return { ok: false, reason: "not_continuation" };
  }
  if (meaningfulLines.length > 1) {
    return { ok: false, reason: "inline_contamination" };
  }
  const text = normalizeWhitespace(firstLine.replace(CODING_AGENT_CONTINUATION_LINE_PATTERN, ""));
  if (!text || hasCodexInlineContamination(text)) {
    return { ok: false, reason: "inline_contamination" };
  }
  return { ok: true, text: firstLine };
}

function classifyCodexSectionLine(line) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return "blank";
  }
  if (isTinyOverlayFragment(normalized)) {
    return "overlay_fragment";
  }
  if (isMajorSeparatorVisible(normalized)) {
    return "separator";
  }
  if (CODING_AGENT_PROMPT_LINE_PATTERN.test(normalized)) {
    return "prompt";
  }
  if (
    CODING_AGENT_NORMALIZED_TAIL_LINE_PATTERN.test(normalized) ||
    CODING_AGENT_WORKED_FOR_PATTERN.test(normalized) ||
    CODING_AGENT_INTERRUPT_OVERLAY_PATTERN.test(normalized) ||
    isStatusRibbon(normalized)
  ) {
    return "chrome";
  }
  if (CODING_AGENT_BULLET_PREFIX_PATTERN.test(normalized)) {
    return classifyCodexBullet(normalized) === "info" ? "info_bullet" : "anti_bullet";
  }
  if (CODING_AGENT_SECTION_LIST_ITEM_PATTERN.test(normalized)) {
    return "list_item";
  }
  if (CODING_AGENT_SECTION_SUBSECTION_PATTERN.test(normalized)) {
    return "subsection";
  }
  if (CODING_AGENT_DIFF_LINE_PATTERN.test(normalized)) {
    return "diff_or_output";
  }
  return "text";
}

function buildCodexSectionEntryAnalysis(entry) {
  const acceptedLines = [];
  let discardedNoiseLines = 0;
  for (const rawLine of splitNormalizedMeaningfulLines(entry?.visibleText || "")) {
    const scrubbed = scrubCodexSectionLine(rawLine);
    if (!scrubbed) {
      discardedNoiseLines += 1;
      continue;
    }
    const kind = classifyCodexSectionLine(scrubbed);
    if (kind === "blank" || kind === "overlay_fragment" || kind === "chrome") {
      discardedNoiseLines += 1;
      continue;
    }
    acceptedLines.push({
      line: scrubbed,
      kind
    });
  }
  return {
    lines: acceptedLines,
    discardedNoiseLines
  };
}

function beginCodexSectionCandidate(entry) {
  return {
    anchorSequence: entry.sequence,
    anchorOccurredAt: entry.occurredAt,
    observedEntries: 0,
    phase: "awaiting_headline",
    headlineSequence: 0,
    headlineOccurredAt: 0,
    normalizedLines: [],
    hasSubsection: false,
    hasListItem: false,
    continuationLineCount: 0,
    contentEntryCount: 0,
    discardedNoiseLines: 0,
    lastContentAt: 0
  };
}

function createSectionDecision(type, candidate, extra = {}) {
  return Object.freeze({
    type,
    family: CODEX_SEPARATOR_SECTION_SCOPE,
    anchorSequence: candidate?.anchorSequence || 0,
    anchorOccurredAt: candidate?.anchorOccurredAt || 0,
    infoSequence: candidate?.headlineSequence || 0,
    infoOccurredAt: candidate?.headlineOccurredAt || 0,
    ...extra
  });
}

function normalizeCodexSectionLines(lines = []) {
  const normalizedLines = [];
  let previousKind = "";
  for (const entry of lines) {
    const line = normalizeWhitespace(entry?.line || "");
    if (!line) {
      continue;
    }
    const kind = entry?.kind || classifyCodexSectionLine(line);
    if (kind === "info_bullet") {
      normalizedLines.push(line.replace(CODING_AGENT_BULLET_PREFIX_PATTERN, "").trim());
      previousKind = "info_bullet";
      continue;
    }
    if (kind === "subsection") {
      if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "") {
        normalizedLines.push("");
      }
      normalizedLines.push(line);
      previousKind = "subsection";
      continue;
    }
    if (kind === "list_item") {
      if (
        normalizedLines.length > 0 &&
        normalizedLines[normalizedLines.length - 1] !== "" &&
        (previousKind === "info_bullet" || previousKind === "text" || previousKind === "subsection")
      ) {
        normalizedLines.push("");
      }
      normalizedLines.push(line);
      previousKind = "list_item";
      continue;
    }
    if (kind === "text") {
      if (
        normalizedLines.length > 0 &&
        normalizedLines[normalizedLines.length - 1] !== "" &&
        previousKind !== "subsection" &&
        previousKind !== "list_item"
      ) {
        normalizedLines[normalizedLines.length - 1] = `${normalizedLines[normalizedLines.length - 1]} ${line}`.trim();
      } else {
        if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "" && previousKind === "list_item") {
          normalizedLines.push("");
        }
        normalizedLines.push(line);
      }
      previousKind = "text";
    }
  }
  return normalizedLines.filter((line, index, values) => !(line === "" && values[index - 1] === ""));
}

function classifyCodexSectionWindowState(candidate) {
  const contentEntryCount = Number.isInteger(candidate?.contentEntryCount) ? candidate.contentEntryCount : 0;
  const discardedNoiseLines = Number.isInteger(candidate?.discardedNoiseLines) ? candidate.discardedNoiseLines : 0;
  const continuationLineCount = Number.isInteger(candidate?.continuationLineCount) ? candidate.continuationLineCount : 0;
  if (contentEntryCount <= 1 && discardedNoiseLines >= 4) {
    return "restart_remount";
  }
  if (discardedNoiseLines > Math.max(6, continuationLineCount * 2)) {
    return "overlay_churn";
  }
  return "stable_section";
}

function maybeFinalizeCodexSectionCandidate(candidate, extra = {}) {
  if (!candidate || candidate.phase !== "collecting_section" || !Array.isArray(candidate.normalizedLines) || candidate.normalizedLines.length === 0) {
    return null;
  }
  const windowState = classifyCodexSectionWindowState(candidate);
  const { reason: triggerReason = "", ...restExtra } = extra || {};
  if (windowState !== "stable_section") {
    return createSectionDecision("rejection", candidate, {
      ...restExtra,
      triggerReason,
      reason: `window_${windowState}`
    });
  }
  if (!candidate.hasSubsection && !candidate.hasListItem && candidate.continuationLineCount < 2) {
    return createSectionDecision("rejection", candidate, {
      ...restExtra,
      triggerReason,
      reason: "section_too_shallow"
    });
  }
  const lines = normalizeCodexSectionLines(candidate.normalizedLines).slice(0, CODEX_SEPARATOR_SECTION_MAX_LINES);
  const text = lines.join("\n").trim();
  if (!text) {
    return createSectionDecision("rejection", candidate, {
      ...restExtra,
      triggerReason,
      reason: "empty_normalized_section"
    });
  }
  if (text.length < CODEX_SEPARATOR_SECTION_MIN_TEXT_LENGTH || text.length > CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH) {
    return createSectionDecision("rejection", candidate, {
      ...restExtra,
      triggerReason,
      reason: "section_length_out_of_range"
    });
  }
  if (hasCodexInlineContamination(text)) {
    return createSectionDecision("rejection", candidate, {
      ...restExtra,
      triggerReason,
      reason: "section_inline_contamination"
    });
  }
  return createSectionDecision("candidate", candidate, {
    key: `${candidate.anchorSequence}:${candidate.headlineSequence}:${text}`,
    text,
    windowState,
    ...restExtra,
    reason: triggerReason || "section_completed"
  });
}

function appendCodexSectionLine(candidate, line, kind, occurredAt) {
  if (!candidate || !line) {
    return;
  }
  candidate.phase = "collecting_section";
  candidate.normalizedLines.push({ line, kind });
  candidate.lastContentAt = occurredAt;
  if (kind === "subsection") {
    candidate.hasSubsection = true;
  } else if (kind === "list_item") {
    candidate.hasListItem = true;
  } else if (kind === "text") {
    candidate.continuationLineCount += 1;
  }
}

function maybeStartImplicitCodexSectionCandidate(state, entry, analysis) {
  if (!state || !entry || !analysis || !Array.isArray(analysis.lines) || analysis.lines.length === 0) {
    return null;
  }
  const headlineIndex = analysis.lines.findIndex((sectionLine) => sectionLine.kind === "info_bullet");
  if (headlineIndex < 0) {
    return null;
  }
  const prelude = analysis.lines.slice(0, headlineIndex);
  if (prelude.some((sectionLine) => sectionLine.kind === "anti_bullet" || sectionLine.kind === "separator" || sectionLine.kind === "diff_or_output")) {
    return null;
  }
  const candidate = beginCodexSectionCandidate(entry);
  state.codexSeparatorSectionCandidate = candidate;
  return candidate;
}

export function advanceCodexSeparatorSectionState(state, entry, { flush = false } = {}) {
  const events = [];
  let candidate = state?.codexSeparatorSectionCandidate || null;

  const clearCandidate = (decision) => {
    candidate = null;
    state.codexSeparatorSectionCandidate = null;
    if (decision) {
      events.push(decision);
    }
  };

  const maybeStartAnchor = (currentEntry) => {
    if (
      currentEntry &&
      currentEntry.kind === "substantial" &&
      currentEntry.isMajorSeparator &&
      !currentEntry.hasWorkedForMarker &&
      !currentEntry.hasInterruptOverlay
    ) {
      candidate = beginCodexSectionCandidate(currentEntry);
      state.codexSeparatorSectionCandidate = candidate;
    }
  };

  const processEntry = (currentEntry) => {
    if (!currentEntry) {
      return;
    }
    let analysis = null;
    if (!candidate) {
      maybeStartAnchor(currentEntry);
      if (candidate) {
        return;
      }
      analysis = buildCodexSectionEntryAnalysis(currentEntry);
      candidate = maybeStartImplicitCodexSectionCandidate(state, currentEntry, analysis);
      if (!candidate) {
        return;
      }
    }

    if (currentEntry.sequence !== candidate.anchorSequence) {
      if ((currentEntry.occurredAt - candidate.anchorOccurredAt) > CODEX_SEPARATOR_SECTION_MAX_GAP_MS) {
        clearCandidate(createSectionDecision("rejection", candidate, {
          reason: "gap_timeout",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
        maybeStartAnchor(currentEntry);
        if (candidate) {
          return;
        }
        analysis = buildCodexSectionEntryAnalysis(currentEntry);
        candidate = maybeStartImplicitCodexSectionCandidate(state, currentEntry, analysis);
        if (!candidate) {
          return;
        }
      }
      if (candidate.observedEntries >= CODEX_SEPARATOR_SECTION_MAX_LOOKAHEAD_ENTRIES) {
        clearCandidate(createSectionDecision("rejection", candidate, {
          reason: "lookahead_exhausted",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
        maybeStartAnchor(currentEntry);
        if (candidate) {
          return;
        }
        analysis = analysis || buildCodexSectionEntryAnalysis(currentEntry);
        candidate = maybeStartImplicitCodexSectionCandidate(state, currentEntry, analysis);
        if (!candidate) {
          return;
        }
      }
      if (candidate && currentEntry.sequence !== candidate.anchorSequence) {
        candidate.observedEntries += 1;
      }
    }

    analysis = analysis || buildCodexSectionEntryAnalysis(currentEntry);
    candidate.discardedNoiseLines += analysis.discardedNoiseLines;
    if (analysis.lines.length === 0) {
      if (
        candidate.phase === "awaiting_headline" &&
        (currentEntry.hasPromptMarker || currentEntry.hasWorkedForMarker || currentEntry.hasInterruptOverlay)
      ) {
        clearCandidate(createSectionDecision("rejection", candidate, {
          reason: "marker_before_info",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
        return;
      }
      if (
        candidate.phase === "collecting_section" &&
        (
          currentEntry.hasPromptMarker ||
          currentEntry.hasWorkedForMarker ||
          currentEntry.hasInterruptOverlay ||
          currentEntry.kind === "status_ribbon"
        )
      ) {
        clearCandidate(maybeFinalizeCodexSectionCandidate(candidate, {
          reason: "section_closed_by_marker",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
        return;
      }
      return;
    }
    candidate.contentEntryCount += 1;

    for (const sectionLine of analysis.lines) {
      if (candidate.phase === "awaiting_headline") {
        if (sectionLine.kind === "separator") {
          clearCandidate(createSectionDecision("rejection", candidate, {
            reason: "next_separator_before_info",
            entrySequence: currentEntry.sequence,
            entryOccurredAt: currentEntry.occurredAt
          }));
          maybeStartAnchor(currentEntry);
          return;
        }
        if (sectionLine.kind === "anti_bullet") {
          clearCandidate(createSectionDecision("rejection", candidate, {
            reason: `first_bullet_${classifyCodexBullet(sectionLine.line)}`,
            entrySequence: currentEntry.sequence,
            entryOccurredAt: currentEntry.occurredAt
          }));
          return;
        }
        if (sectionLine.kind !== "info_bullet") {
          continue;
        }
        candidate.headlineSequence = currentEntry.sequence;
        candidate.headlineOccurredAt = currentEntry.occurredAt;
        appendCodexSectionLine(candidate, sectionLine.line, sectionLine.kind, currentEntry.occurredAt);
        continue;
      }

        if (
          sectionLine.kind === "separator" ||
          sectionLine.kind === "anti_bullet" ||
          sectionLine.kind === "info_bullet" ||
          sectionLine.kind === "diff_or_output" ||
        sectionLine.kind === "prompt" ||
        sectionLine.kind === "chrome"
      ) {
        clearCandidate(maybeFinalizeCodexSectionCandidate(candidate, {
          reason:
            sectionLine.kind === "separator"
              ? "section_closed_by_separator"
              : sectionLine.kind === "anti_bullet"
                ? "section_closed_by_anti_bullet"
                : sectionLine.kind === "info_bullet"
                  ? "section_closed_by_next_bullet"
                  : "section_closed_by_marker",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
        if (sectionLine.kind === "separator") {
          maybeStartAnchor(currentEntry);
        }
        return;
      }

      appendCodexSectionLine(candidate, sectionLine.line, sectionLine.kind, currentEntry.occurredAt);
    }
  };

  if (flush && !entry) {
    const finalized = maybeFinalizeCodexSectionCandidate(candidate, { reason: "flush_after_section" });
    if (finalized) {
      clearCandidate(finalized);
    }
    return events;
  }

  processEntry(entry);
  return events;
}

export function createCodexAllowlistState() {
  return {
    codexStreamSequence: 0,
    codexSeparatorCandidate: null,
    codexSeparatorSectionCandidate: null
  };
}

export function createCodexStreamEntry(state, rawText, promptBoundaries = [], occurredAt = Date.now()) {
  const visibleText = normalizeVisibleReplayText(normalizeLineBreaks(rawText));
  const compactText = normalizeWhitespace(visibleText);
  const firstLine = firstVisibleLine(visibleText);
  const separator = analyzeMajorSeparatorEntry(visibleText);
  return {
    sequence: (state.codexStreamSequence = (state.codexStreamSequence || 0) + 1),
    occurredAt,
    visibleText,
    compactText,
    kind: classifyCodexStreamEntryKind(visibleText),
    isMajorSeparator: separator.ok,
    hasSeparatorTailContamination: separator.contaminated,
    firstLine,
    hasPromptMarker: (Array.isArray(promptBoundaries) && promptBoundaries.length > 0) || CODING_AGENT_PROMPT_LINE_PATTERN.test(firstLine),
    hasWorkedForMarker: CODING_AGENT_WORKED_FOR_PATTERN.test(compactText),
    hasInterruptOverlay: CODING_AGENT_INTERRUPT_OVERLAY_PATTERN.test(compactText)
  };
}

function beginCodexSeparatorCandidate(entry) {
  return {
    anchorSequence: entry.sequence,
    anchorOccurredAt: entry.occurredAt,
    observedEntries: 0,
    phase: "awaiting_info",
    infoSequence: 0,
    infoOccurredAt: 0,
    text: ""
  };
}

function createDecision(type, candidate, extra = {}) {
  return Object.freeze({
    type,
    family: CODEX_SEPARATOR_INFO_SCOPE,
    anchorSequence: candidate?.anchorSequence || 0,
    anchorOccurredAt: candidate?.anchorOccurredAt || 0,
    infoSequence: candidate?.infoSequence || 0,
    infoOccurredAt: candidate?.infoOccurredAt || 0,
    ...extra
  });
}

function maybeFinalizeCodexSeparatorCandidate(candidate, entry, { flush = false } = {}) {
  if (!candidate || candidate.phase !== "awaiting_continuation" || !candidate.text) {
    return null;
  }
  if (flush) {
    return createDecision("candidate", candidate, {
      key: `${candidate.anchorSequence}:${candidate.infoSequence}:${candidate.text}`,
      text: candidate.text,
      reason: "flush_after_info"
    });
  }
  if (!entry) {
    return null;
  }
  if (entry.hasPromptMarker || entry.hasWorkedForMarker || entry.hasInterruptOverlay) {
    return createDecision("rejection", candidate, {
      reason: "continuation_blocked_by_marker",
      entrySequence: entry.sequence,
      entryOccurredAt: entry.occurredAt
    });
  }
  if (entry.kind === "blank" || entry.kind === "overlay_fragment" || entry.kind === "status_ribbon") {
    return null;
  }
  if (entry.occurredAt - candidate.infoOccurredAt > CODEX_SEPARATOR_INFO_CONTINUATION_GAP_MS) {
    return createDecision("candidate", candidate, {
      key: `${candidate.anchorSequence}:${candidate.infoSequence}:${candidate.text}`,
      text: candidate.text,
      reason: "continuation_gap_elapsed"
    });
  }
  const continuation = analyzeCodexContinuationEntry(entry.visibleText);
  if (continuation.ok) {
    const mergedText = normalizeCodexInfoText(`• ${candidate.text}`, continuation.text);
    if (!mergedText || hasCodexInlineContamination(mergedText)) {
      return createDecision("rejection", candidate, {
        reason: "continuation_inline_contamination",
        entrySequence: entry.sequence,
        entryOccurredAt: entry.occurredAt
      });
    }
    return createDecision("candidate", {
      ...candidate,
      text: mergedText
    }, {
      key: `${candidate.anchorSequence}:${candidate.infoSequence}:${mergedText}`,
      text: mergedText,
      reason: "continuation_merged",
      entrySequence: entry.sequence,
      entryOccurredAt: entry.occurredAt
    });
  }
  if (continuation.reason === "inline_contamination") {
    return createDecision("rejection", candidate, {
      reason: "continuation_inline_contamination",
      entrySequence: entry.sequence,
      entryOccurredAt: entry.occurredAt
    });
  }
  return createDecision("candidate", candidate, {
    key: `${candidate.anchorSequence}:${candidate.infoSequence}:${candidate.text}`,
    text: candidate.text,
    reason: "candidate_closed_by_next_substantial_entry",
    entrySequence: entry.sequence,
    entryOccurredAt: entry.occurredAt
  });
}

function recordDecision(events, decision) {
  if (!decision) {
    return null;
  }
  events.push(decision);
  return decision;
}

export function advanceCodexSeparatorInfoState(state, entry, { flush = false } = {}) {
  const events = [];
  let candidate = state?.codexSeparatorCandidate || null;

  const clearCandidate = (decision) => {
    candidate = null;
    state.codexSeparatorCandidate = null;
    recordDecision(events, decision);
  };

  const processEntry = (currentEntry) => {
    if (!currentEntry) {
      return;
    }
    if (!candidate) {
      if (currentEntry.kind === "substantial" && currentEntry.isMajorSeparator && !currentEntry.hasPromptMarker) {
        candidate = beginCodexSeparatorCandidate(currentEntry);
        state.codexSeparatorCandidate = candidate;
      }
      return;
    }

    if (currentEntry.sequence !== candidate.anchorSequence) {
      if ((currentEntry.occurredAt - candidate.anchorOccurredAt) > CODEX_SEPARATOR_INFO_MAX_GAP_MS) {
        clearCandidate(createDecision("rejection", candidate, {
          reason: "gap_timeout",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
      } else if (candidate.observedEntries >= CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES) {
        clearCandidate(createDecision("rejection", candidate, {
          reason: "lookahead_exhausted",
          entrySequence: currentEntry.sequence,
          entryOccurredAt: currentEntry.occurredAt
        }));
      }
    }

    if (!candidate) {
      if (currentEntry.kind === "substantial" && currentEntry.isMajorSeparator && !currentEntry.hasPromptMarker) {
        candidate = beginCodexSeparatorCandidate(currentEntry);
        state.codexSeparatorCandidate = candidate;
      }
      return;
    }

    if (currentEntry.sequence !== candidate.anchorSequence) {
      candidate.observedEntries += 1;
    }

    if (candidate.phase === "awaiting_continuation") {
      const finalized = maybeFinalizeCodexSeparatorCandidate(candidate, currentEntry, { flush });
      if (finalized?.type === "rejection") {
        clearCandidate(finalized);
        return;
      }
      if (finalized?.type === "candidate") {
        clearCandidate(finalized);
        return;
      }
      return;
    }

    if (currentEntry.hasPromptMarker || currentEntry.hasWorkedForMarker || currentEntry.hasInterruptOverlay) {
      clearCandidate(createDecision("rejection", candidate, {
        reason: "marker_before_info",
        entrySequence: currentEntry.sequence,
        entryOccurredAt: currentEntry.occurredAt
      }));
      return;
    }
    if (currentEntry.kind === "blank" || currentEntry.kind === "overlay_fragment" || currentEntry.kind === "status_ribbon") {
      return;
    }
    if (currentEntry.isMajorSeparator) {
      clearCandidate(createDecision("rejection", candidate, {
        reason: "next_separator_before_info",
        entrySequence: currentEntry.sequence,
        entryOccurredAt: currentEntry.occurredAt
      }));
      candidate = beginCodexSeparatorCandidate(currentEntry);
      state.codexSeparatorCandidate = candidate;
      return;
    }
    const infoEntry = analyzeCodexInfoEntry(currentEntry.visibleText);
    if (!infoEntry.ok) {
      clearCandidate(createDecision("rejection", candidate, {
        reason: infoEntry.reason,
        entrySequence: currentEntry.sequence,
        entryOccurredAt: currentEntry.occurredAt
      }));
      return;
    }
    candidate.phase = "awaiting_continuation";
    candidate.infoSequence = currentEntry.sequence;
    candidate.infoOccurredAt = currentEntry.occurredAt;
    candidate.text = infoEntry.text;
    state.codexSeparatorCandidate = candidate;
    if (infoEntry.continuationConsumed || flush) {
      const finalizedText = infoEntry.text;
      const finalizedKey = `${candidate.anchorSequence}:${candidate.infoSequence}:${finalizedText}`;
      clearCandidate(createDecision("candidate", candidate, {
        key: finalizedKey,
        text: finalizedText,
        reason: infoEntry.continuationConsumed ? "inline_continuation_consumed" : "flush_after_info"
      }));
    }
  };

  if (flush && !entry) {
    const finalized = maybeFinalizeCodexSeparatorCandidate(candidate, null, { flush: true });
    if (finalized?.type === "candidate") {
      clearCandidate(finalized);
    }
    return events;
  }

  processEntry(entry);
  return events;
}
