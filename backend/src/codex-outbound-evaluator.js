import { normalizeVisibleReplayText } from "./replay-excerpt.js";

export const CODEX_SEPARATOR_INFO_SCOPE = "codex_separator_info";
export const CODEX_SEPARATOR_INFO_MAX_GAP_MS = 2500;
export const CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES = 120;
export const CODEX_SEPARATOR_INFO_CONTINUATION_GAP_MS = 500;
export const CODEX_SEPARATOR_INFO_MIN_TEXT_LENGTH = 24;
export const CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH = 400;

const CODING_AGENT_BULLET_PREFIX_PATTERN = /^•\s+/u;
const CODING_AGENT_PROMPT_LINE_PATTERN = /^›\s+/u;
const CODING_AGENT_CONTINUATION_LINE_PATTERN = /^  /u;
const CODING_AGENT_TAIL_LINE_PATTERN = /^  (?:└|│|□)\s/u;
const CODING_AGENT_DIFF_LINE_PATTERN = /^(?:@@|\+\+\+|---|\+ |- |\d+\s*[+-])/u;
const CODING_AGENT_WORKED_FOR_PATTERN = /^─+\s*Worked for\b/iu;
const CODING_AGENT_INTERRUPT_OVERLAY_PATTERN = /\b(?:esc to interrupt|interrupt to stop|background terminal running|\/ps to view|\/stop to close)\b/iu;

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  if (CODING_AGENT_BULLET_PREFIX_PATTERN.test(trimmed) || CODING_AGENT_PROMPT_LINE_PATTERN.test(trimmed) || /^─{40,}$/u.test(trimmed)) {
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
  if (/^[A-Za-z•◦\d]+$/u.test(trimmed) && !/\s/u.test(trimmed) && trimmed.length <= 12) {
    return true;
  }
  if (/^W(?:o|or|rk|ki|in|ng|g|ait|ork|orking|aiting)+$/iu.test(trimmed)) {
    return true;
  }
  return false;
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

function isMajorSeparatorVisible(visibleText) {
  return /^─{40,}$/u.test(normalizeWhitespace(visibleText));
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

export function createCodexAllowlistState() {
  return {
    codexStreamSequence: 0,
    codexSeparatorCandidate: null
  };
}

export function createCodexStreamEntry(state, rawText, promptBoundaries = [], occurredAt = Date.now()) {
  const visibleText = normalizeVisibleReplayText(normalizeLineBreaks(rawText));
  const compactText = normalizeWhitespace(visibleText);
  const firstLine = firstVisibleLine(visibleText);
  return {
    sequence: (state.codexStreamSequence = (state.codexStreamSequence || 0) + 1),
    occurredAt,
    visibleText,
    compactText,
    kind: classifyCodexStreamEntryKind(visibleText),
    isMajorSeparator: isMajorSeparatorVisible(visibleText),
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
