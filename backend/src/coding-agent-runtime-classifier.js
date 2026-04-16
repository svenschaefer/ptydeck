function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value) {
  return normalizeNonEmptyString(String(value || "").replace(/\s+/gu, " "));
}

function normalizeLineBreaks(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

const STRUCTURED_LIST_LINE_PATTERN = /^(?:[-*•]\s+|\d+\.\s+)/u;
const CODING_AGENT_COMMENTARY_LEAD_PATTERN =
  /^(?:[•*]\s*)?(?:(?:ich|i(?:'m| am|’m)?|i(?:'ll| will)|we(?:'re| are|’re)?|we(?:'ll| will))\s+(?:prüfe|pruefe|ziehe|lese|analysiere|vergleiche|setze|gehe|check(?:ing)?|inspect(?:ing)?|review(?:ing)?|read(?:ing)?|trace(?:ing)?|compare(?:ing)?|analy(?:s|z)e(?:ing)?|implement(?:ing)?|narrow(?:ing)?|pull(?:ing)?|look(?:ing)?|verify(?:ing)?|sync(?:ing)?|push(?:ing)?))\b/iu;
const CODING_AGENT_COMMENTARY_INLINE_PATTERN =
  /\b(?:ich|i(?:'m| am|’m)?|i(?:'ll| will)|we(?:'re| are|’re)?|we(?:'ll| will))\s+(?:prüfe|pruefe|ziehe|lese|analysiere|vergleiche|setze|gehe|check(?:ing)?|inspect(?:ing)?|review(?:ing)?|read(?:ing)?|trace(?:ing)?|compare(?:ing)?|analy(?:s|z)e(?:ing)?|implement(?:ing)?|narrow(?:ing)?|pull(?:ing)?|look(?:ing)?|verify(?:ing)?|sync(?:ing)?|push(?:ing)?)\b/iu;
const CODING_AGENT_COMMENTARY_CONTEXT_PATTERN =
  /(?:stream(?:-to-message)?-pipeline|reply-assembly|delivery-policy|section-assembly|seams\b|evaluator\b|runtime(?:-klassifikation)?|klassifikation|repo(?:[-/ ](?:prozess)?zustand|\s+state)?|repo-\s*und\s+dokumentationsstand|dokumentationsstand|document(?:ation)?(?:\s+state|\s+stand)?|markdown state|backlog separation|validator(?:en|s)?|worktree\b|drift(?:ed)?\b|planungsstand\b|capture(?:-read)?\b|chunks?\b|\besm\b|shell-quoting\b|todo(?:-outlook)?\.md|roadmap\.md|changelog\.md|codex_context\.md|deployment\.md)/iu;
const CODING_AGENT_ATTENTION_PATTERNS = Object.freeze([
  /^(?:└\s*)?(?:fatal|error|failed|failure|traceback|exception|panic)\b[:\s-]?/i,
  /\b(?:validation failed|lint failed|tests failed|unable to access|permission denied|timed out|timeout|refused)\b/i
]);
const SHORT_CODING_AGENT_ATTENTION_PATTERN = /\b(?:error|failed|failure|exception|panic|traceback|os error \d+)\b/i;
const STRONG_ATTENTION_SIGNAL_PATTERN =
  /\b(?:fatal|error|failed|failure|exception|panic|traceback|unable to access|permission denied|timed out|timeout|refused|blocked|conflict)\b/i;
const STRONG_ATTENTION_PREFIX_PATTERN =
  /^(?:[•*]\s*)?(?:fatal|error|failed|failure|exception|panic|traceback|unable to access|permission denied)\b/i;

export function isStructuredListLine(value) {
  return STRUCTURED_LIST_LINE_PATTERN.test(normalizeWhitespace(value));
}

export function isCommentaryLikeCodingAgentText(value) {
  const lines = normalizeLineBreaks(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  const headline = lines[0];
  const combined = lines.join(" ");
  const hasCommentaryLead =
    CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(headline) ||
    CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(combined) ||
    CODING_AGENT_COMMENTARY_INLINE_PATTERN.test(combined);
  if (!hasCommentaryLead) {
    return false;
  }
  return CODING_AGENT_COMMENTARY_CONTEXT_PATTERN.test(combined);
}

export function isCodingAgentAttentionText(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || isStructuredListLine(normalized)) {
    return false;
  }
  if (CODING_AGENT_ATTENTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
  return wordCount <= 8 && SHORT_CODING_AGENT_ATTENTION_PATTERN.test(normalized);
}

export function isLikelyCodingAgentAttentionSnippetTail(value, previousValue = "") {
  const normalizedSummary = normalizeWhitespace(value);
  if (!normalizedSummary || isStructuredListLine(normalizedSummary)) {
    return false;
  }
  if (STRONG_ATTENTION_PREFIX_PATTERN.test(normalizedSummary)) {
    return false;
  }
  const previousLine = normalizeWhitespace(previousValue);
  if (!previousLine || !STRONG_ATTENTION_SIGNAL_PATTERN.test(previousLine)) {
    return false;
  }
  const wordCount = normalizedSummary.split(/\s+/u).filter(Boolean).length;
  if (wordCount <= 10) {
    return true;
  }
  if (!/[\\/:(]/.test(normalizedSummary) && !/^\s*[A-Z0-9_.-]/.test(normalizedSummary)) {
    return true;
  }
  return false;
}
