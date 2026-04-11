import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { normalizeVisibleReplayText, parseReplaySliceSelector } from "./replay-excerpt.js";
import { createTelegramAdapter, createTelegramTransport } from "./telegram-adapter.js";

export const MESSAGING_TRIGGER_PROFILES = Object.freeze(["generic-shell", "coding-agent", "build-test"]);
const MESSAGING_TRIGGER_PROFILE_SET = new Set(MESSAGING_TRIGGER_PROFILES);
const MAX_EVENT_SUMMARY_LENGTH = 280;
const MAX_RECENT_LINES = 4;
const MAX_MESSAGING_TRACE_ENTRIES = 200;
const MAX_MESSAGING_STATUS_TRACES = 25;
const MAX_PENDING_SUMMARY_FRAGMENTS = 5;
const CONTROL_EVENT_SIGNATURE_NONE = "none";
const DEFAULT_INBOUND_REPLAY_SELECTOR = "l:40";
const MAX_INBOUND_REPLAY_LINES = 80;
const MAX_INBOUND_REPLAY_CHARS = 3000;
const MAX_INBOUND_REPLAY_SHELL_BLOCKS = 3;
const MAX_INBOUND_RESPONSE_TEXT_LENGTH = 3800;
const PROMPT_STATUS_SUPPRESSION_WINDOW_MS = 1500;
const IDLE_STATUS_SUPPRESSION_WINDOW_MS = 2000;
const CODING_AGENT_IDLE_STATUS_SUPPRESSION_WINDOW_MS = 30_000;
const ATTENTION_DUPLICATE_SUPPRESSION_WINDOW_MS = 10_000;
const REPEATED_IDLE_SUPPRESSION_WINDOW_MS = 60_000;
const STARTUP_CHATTER_SUPPRESSION_WINDOW_MS = 15_000;
const TELEGRAM_TOPIC_NAME_MAX_LENGTH = 128;

const NOISE_SEPARATOR_ONLY_PATTERN = /^\s*(?:[-_=|·•*]+|[─━]{8,})\s*$/u;
const CODING_AGENT_SECTION_MARKER_PATTERN = /^\s*✦(?:\s|$)/u;
const WINDOWS_OR_POSIX_PATH_PATTERN = /(?:[A-Za-z]:\\|\/)[^\s|·•]+/g;
const MODEL_TOKEN_PATTERN = /\b(?:gpt-[\w.-]+|claude(?:-[\w.-]+)?|gemini(?:-[\w.-]+)?)\b/gi;
const BUDGET_TOKEN_PATTERN = /\b\d{1,3}%\s+(?:left|used|remaining)\b/gi;
const EFFORT_TOKEN_PATTERN = /\b(?:xhigh|high|medium|low)\b/gi;
const LOW_INFORMATION_FRAGMENT_PATTERN =
  /^(?:<(?:path|model|budget|effort|agent)>|\b(?:left|remaining|context|cwd|dir|session|thread)\b|\||·|•)+$/i;
const PARTIAL_TERMINAL_CONTROL_PATTERN =
  /(?:\u001b\[[0-9;]*[A-Za-z]|\[[0-9;]{2,}[A-Za-z]|(?:^|[\s|·•])\d{1,3}(?:;\d{1,3}){1,6}[A-Za-z](?=$|[\s|·•]))/g;
const STRONG_STATUS_SIGNAL_PATTERN =
  /\b(?:plan|validated?|generated?|wrote|updated?|restored|reclaimed|pushed|committed|tests?|lint|coverage|build|status|done|completed|ready|started|saved|connected|copied|uploaded|downloaded|created|deleted|renamed|applied|failed|failure|error|warning|blocked|conflict)\b/i;
const STRONG_ATTENTION_SIGNAL_PATTERN =
  /\b(?:fatal|error|failed|failure|exception|panic|traceback|unable to access|permission denied|timed out|timeout|refused|blocked|conflict)\b/i;
const ZERO_ISSUE_COUNT_PATTERN = /^\s*0\s+(?:error(?:\(s\))?|errors|warning(?:\(s\))?|warnings)\b/i;
const SHORT_OS_ERROR_FRAGMENT_PATTERN = /\(\s*os error \d+\s*\)$/i;
const CODING_AGENT_TAIL_MARKERS = Object.freeze([
  /\s+(?:[•*]\s*)?Ran\b/i,
  /\s+(?:[•*]\s*)?Edited\b/i,
  /\s+h\s+\d{1,3}….*$/u,
  /\s+(?:Run\s+)?\/review on my current changes\b.*$/i,
  /\/review on my current changes\b.*$/i,
  /\s+[│|]\s*[A-Za-z_][\w.-]*(?:\|[A-Za-z_][\w.-]*){1,}\|?/u,
  /\s+(?:documentation|ocumentation|umentation|entation|tation)\s+in\s+@filename\b/i,
  /\s+(?:gpt-[\w.-]+|claude(?:-[\w.-]+)?|gemini(?:-[\w.-]+)?)\b/i,
  /\s+\d{1,3}%\s+(?:left|used|remaining)\b/i,
  /\s+[|·•]\s*[A-Za-z]:\\[^\s|·•]*(?=\s+[|·•]|$)/u,
  /\s+[|·•]\s*\\(?:[\w .-]+\\){1,}[\w .-]*(?=\s+[|·•]|$)/u,
  /\s+\?\?\s+[^\s].*$/u
]);
const LOW_VALUE_FILTER_RULES = Object.freeze([
  Object.freeze({
    id: "workflow_plan_update",
    codingAgentOnly: true,
    pattern: /^(?:[•*]\s*)?(?:updated plan|plan updated)\b/i
  }),
  Object.freeze({
    id: "workflow_instruction",
    codingAgentOnly: true,
    pattern:
      /(?:do a final validation|commit and push|take care that all md'?s are up-to-date|what are the open tasks|update todo\.md|roadmap\.md|changelog\.md|codex_context\.md)/i
  }),
  Object.freeze({
    id: "markdown_file_list",
    codingAgentOnly: true,
    pattern: /(?:\b[\w.-]+\.md\b(?:\s+|$)){2,}/i
  }),
  Object.freeze({
    id: "git_commit_subject",
    codingAgentOnly: true,
    pattern: /^(?:[-└├│]\s*)?[0-9a-f]{7,12}\s+\S+/iu
  }),
  Object.freeze({
    id: "workflow_version_bullet",
    codingAgentOnly: true,
    pattern: /^(?:-\s+)?v\d+\.\d+\.\d+(?:-[\w-]+)?:\s+/i
  }),
  Object.freeze({
    id: "workflow_planning_status",
    codingAgentOnly: true,
    pattern: /(?:next active block|next active wave|queued next wave|nächste aktive block|nächste aktive welle)\b/i
  }),
  Object.freeze({
    id: "review_instruction",
    codingAgentOnly: true,
    pattern: /(?:^|\s)(?:run\s+)?\/review on my current changes\b/i
  }),
  Object.freeze({
    id: "run_update",
    codingAgentOnly: true,
    pattern: /^(?:[•*]\s*)?ran\b/i
  }),
  Object.freeze({
    id: "edit_update",
    codingAgentOnly: true,
    pattern: /^(?:[•*]\s*)?edited\b/i
  }),
  Object.freeze({
    id: "diff_update",
    codingAgentOnly: true,
    pattern: /^(?:[•*]\s*)?(?:diff|patch|run)\s+update\b/i
  }),
  Object.freeze({
    id: "internal_thought",
    codingAgentOnly: true,
    pattern: /^(?:[•*]\s*)?(?:thinking|reasoning|internal reasoning)\b/i
  }),
  Object.freeze({
    id: "heredoc_echo",
    codingAgentOnly: true,
    pattern: /<<['"]?(?:EOF|PATCH|JSON|JS|TS|PY|SH|BASH|SQL)['"]?$/i
  })
]);

const PROFILE_PATTERNS = Object.freeze({
  "generic-shell": Object.freeze({
    attention: [
      /\b(?:error|failed|failure|fatal|traceback|exception|panic|timed out|timeout|refused|permission denied)\b/i,
      /\bsegmentation fault\b/i
    ],
    summary: [
      /\b(?:ready|listening|started|saved|completed|done|connected|copied|uploaded|downloaded)\b/i,
      /\b(?:created|updated|deleted|renamed|applied)\b/i
    ]
  }),
  "coding-agent": Object.freeze({
    attention: [
      /\b(?:error|failed|failure|traceback|exception|panic|blocked|conflict|validation failed|lint failed|tests failed)\b/i
    ],
    summary: [
      /^(?:[•*]\s*)?(?:updated plan|plan updated)\b/i,
      /^(?:[•*]\s*)?(?:applied?|generated|wrote|updated|restored|reclaimed|validated|pushed|committed|completed)\b/i,
      /^(?:[•*]\s*)?(?:tests? passed|lint passed)\b/i,
      /^(?:[•*]\s*)?(?:coverage(?:\s*(?::|=)\s*\d|\s+(?:passed|report|summary|result(?:s)?|gate|verified|checked))|\d+(?:\.\d+)?%\s+coverage)\b/i
    ]
  }),
  "build-test": Object.freeze({
    attention: [
      /\b(?:FAIL|FAILED|ERROR|panic|traceback|exception|not ok|BUILD FAILED)\b/i,
      /\b(?:warning:|warnings?:\s*[1-9])\b/i
    ],
    summary: [
      /\b(?:PASS|passed|compiled successfully|build succeeded|finished|ran all test suites|coverage)\b/i,
      /\b(?:tests?:|summary:|results:)\b/i
    ]
  })
});

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizePositiveInteger(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function truncateSummary(value, maxLength = MAX_EVENT_SUMMARY_LENGTH) {
  const normalized = normalizeVisibleReplayText(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateResponseText(value, maxLength = MAX_INBOUND_RESPONSE_TEXT_LENGTH) {
  const normalized = typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateTraceText(value, maxLength = 240) {
  const normalized = truncateSummary(value, maxLength);
  return normalized || "";
}

function buildSessionLabel(session) {
  const quickIdToken = normalizeNonEmptyString(session?.quickIdToken);
  const name = normalizeNonEmptyString(session?.name) || normalizeNonEmptyString(session?.shell) || normalizeNonEmptyString(session?.id);
  return quickIdToken ? `[${quickIdToken}] ${name}` : name;
}

function getSessionAppIdentity(session) {
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

function isCodingAgentContext(session, profile) {
  const appIdentity = getSessionAppIdentity(session);
  return appIdentity.family === "coding-agent" || appIdentity.label === "codex" || profile === "coding-agent";
}

function createPendingSummaryBlock() {
  return {
    fragments: [],
    signatures: [],
    firstObservedAt: 0,
    lastObservedAt: 0,
    separatorHints: 0,
    ignoredNoiseCount: 0
  };
}

function createComparableText(value) {
  const normalized = truncateSummary(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(WINDOWS_OR_POSIX_PATH_PATTERN, "<path>")
    .replace(MODEL_TOKEN_PATTERN, "<model>")
    .replace(BUDGET_TOKEN_PATTERN, "<budget>")
    .replace(EFFORT_TOKEN_PATTERN, "<effort>")
    .replace(/\bcodex\b/gi, "<agent>")
    .replace(/\bclaude\b/gi, "<agent>")
    .replace(/\bgemini\b/gi, "<agent>")
    .replace(/[|·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createAttentionComparableText(value) {
  const normalized = truncateSummary(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(MODEL_TOKEN_PATTERN, "<model>")
    .replace(BUDGET_TOKEN_PATTERN, "<budget>")
    .replace(EFFORT_TOKEN_PATTERN, "<effort>")
    .replace(/\bcodex\b/gi, "<agent>")
    .replace(/\bclaude\b/gi, "<agent>")
    .replace(/\bgemini\b/gi, "<agent>")
    .replace(/[|·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLowValueFragments(value) {
  return String(value || "")
    .replace(/<(?:path|model|budget|effort|agent)>/g, " ")
    .replace(/\b(?:left|remaining|context|cwd|dir|session|thread)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTerminalNoiseFragments(value) {
  return String(value || "")
    .replace(PARTIAL_TERMINAL_CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimCodingAgentLowValueTail(value, session, profile) {
  if (!isCodingAgentContext(session, profile)) {
    return value;
  }
  let trimmed = String(value || "").trim();
  for (const pattern of CODING_AGENT_TAIL_MARKERS) {
    const match = pattern.exec(trimmed);
    if (!match || match.index <= 0) {
      continue;
    }
    const prefix = trimmed.slice(0, match.index).trim();
    if (!prefix) {
      continue;
    }
    if (STRONG_STATUS_SIGNAL_PATTERN.test(prefix) || STRONG_ATTENTION_SIGNAL_PATTERN.test(prefix) || prefix.length >= 48) {
      trimmed = prefix;
      break;
    }
  }
  return trimmed;
}

function sanitizeMessageCandidate(value, session, profile) {
  const normalized = truncateSummary(value);
  if (!normalized) {
    return "";
  }
  return truncateSummary(trimCodingAgentLowValueTail(stripTerminalNoiseFragments(normalized), session, profile));
}

function isLikelyAttentionSnippetTail(summary, recentLines = [], session, profile) {
  if (!isCodingAgentContext(session, profile)) {
    return false;
  }
  const normalizedSummary = sanitizeMessageCandidate(summary, session, profile);
  if (!normalizedSummary) {
    return false;
  }
  const strongPrefixPattern = /^(?:[•*]\s*)?(?:fatal|error|failed|failure|exception|panic|traceback|unable to access|permission denied)\b/i;
  if (strongPrefixPattern.test(normalizedSummary)) {
    return false;
  }
  const previousLine = sanitizeMessageCandidate(recentLines[recentLines.length - 1] || "", session, profile);
  if (!previousLine || !STRONG_ATTENTION_SIGNAL_PATTERN.test(previousLine)) {
    return false;
  }
  const wordCount = normalizedSummary.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 10) {
    return true;
  }
  if (!/[\\/:(]/.test(normalizedSummary) && !/^\s*[A-Z0-9_.-]/.test(normalizedSummary)) {
    return true;
  }
  return false;
}

function isLowValueAttentionFragment(summary, session, profile) {
  const normalizedSummary = sanitizeMessageCandidate(summary, session, profile);
  if (!normalizedSummary) {
    return false;
  }
  const wordCount = normalizedSummary.split(/\s+/).filter(Boolean).length;
  if (SHORT_OS_ERROR_FRAGMENT_PATTERN.test(normalizedSummary) && wordCount <= 4 && normalizedSummary.length <= 40) {
    return true;
  }
  return false;
}

function matchLowValueFilterPattern(value, session, profile) {
  const normalized = truncateSummary(value);
  if (!normalized) {
    return "";
  }
  const codingAgentContext = isCodingAgentContext(session, profile);
  for (const rule of LOW_VALUE_FILTER_RULES) {
    if (rule.codingAgentOnly && !codingAgentContext) {
      continue;
    }
    if (rule.pattern.test(normalized)) {
      return rule.id;
    }
  }
  return "";
}

function classifyNoiseSignature(value, session = null, profile = "") {
  const comparableText = createComparableText(value);
  if (!comparableText) {
    return {
      comparableText: "",
      lowInformation: true,
      noiseClass: "empty"
    };
  }
  const matchedFilter = matchLowValueFilterPattern(value, session, profile);
  if (matchedFilter) {
    return {
      comparableText,
      lowInformation: true,
      noiseClass: `low_value_${matchedFilter}`
    };
  }
  if (NOISE_SEPARATOR_ONLY_PATTERN.test(value)) {
    return {
      comparableText,
      lowInformation: true,
      noiseClass: "separator_only"
    };
  }
  const stripped = stripLowValueFragments(comparableText);
  const strippedTokenCount = stripped ? stripped.split(/\s+/).filter(Boolean).length : 0;
  const placeholderCount = (comparableText.match(/<(?:path|model|budget|effort|agent)>/g) || []).length;
  if (
    isCodingAgentContext(session, profile) &&
    placeholderCount >= 2 &&
    strippedTokenCount <= 4 &&
    !STRONG_STATUS_SIGNAL_PATTERN.test(stripped)
  ) {
    return {
      comparableText,
      lowInformation: true,
      noiseClass: "status_tail"
    };
  }
  if (!stripped || LOW_INFORMATION_FRAGMENT_PATTERN.test(stripped) || (strippedTokenCount <= 1 && /</.test(comparableText))) {
    return {
      comparableText,
      lowInformation: true,
      noiseClass: "status_tail"
    };
  }
  return {
    comparableText,
    lowInformation: false,
    noiseClass: ""
  };
}

function isSubsetComparableText(currentComparableText, previousComparableText) {
  if (!currentComparableText || !previousComparableText) {
    return false;
  }
  if (currentComparableText === previousComparableText) {
    return true;
  }
  return currentComparableText.length >= 12 && previousComparableText.includes(currentComparableText);
}

function sanitizeSummaryFragment(summary, session, profile) {
  const normalizedSummary = sanitizeMessageCandidate(summary, session, profile);
  if (!normalizedSummary) {
    return "";
  }
  const appIdentity = getSessionAppIdentity(session);
  if (appIdentity.family !== "coding-agent" && profile !== "coding-agent") {
    return normalizedSummary;
  }
  const pipeSegments = normalizedSummary
    .split(/\s+\|\s+/)
    .map((entry) => truncateSummary(entry))
    .filter(Boolean);
  const meaningfulPipeSegments = pipeSegments.filter((entry) => !classifyNoiseSignature(entry, session, profile).lowInformation);
  if (meaningfulPipeSegments.length > 0) {
    return meaningfulPipeSegments.slice(-2).join(" | ");
  }
  const bulletSegments = normalizedSummary
    .split(/\s+[·•]\s+/u)
    .map((entry) => truncateSummary(entry))
    .filter(Boolean);
  const meaningfulBulletSegments = bulletSegments.filter((entry) => !classifyNoiseSignature(entry, session, profile).lowInformation);
  if (meaningfulBulletSegments.length > 0) {
    return meaningfulBulletSegments.slice(-2).join(" | ");
  }
  return normalizedSummary.replace(CODING_AGENT_SECTION_MARKER_PATTERN, "").trim();
}

function isSeparatorHint(line, session, profile) {
  const visibleLine = truncateSummary(line);
  if (!visibleLine) {
    return false;
  }
  if (NOISE_SEPARATOR_ONLY_PATTERN.test(visibleLine)) {
    return true;
  }
  const appIdentity = getSessionAppIdentity(session);
  if ((appIdentity.label === "gemini" || profile === "coding-agent") && CODING_AGENT_SECTION_MARKER_PATTERN.test(visibleLine)) {
    return true;
  }
  return false;
}

function normalizeMessagingProfile(value) {
  const normalized = normalizeNonEmptyString(value).toLowerCase();
  return MESSAGING_TRIGGER_PROFILE_SET.has(normalized) ? normalized : "";
}

function normalizeMessagingTargetEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const quickIdToken = normalizeNonEmptyString(entry.quickIdToken || entry.quickId);
  const sessionName = normalizeNonEmptyString(entry.sessionName || entry.name);
  const chatId = normalizeNonEmptyString(entry.chatId) || String(entry.chatId ?? "").trim();
  const messageThreadId = normalizePositiveInteger(entry.messageThreadId);
  const profile = normalizeMessagingProfile(entry.profile);
  const topicMode = normalizeNonEmptyString(entry.topicMode).toLowerCase() === "deck-session" ? "deck-session" : "";
  if (!chatId || (!sessionId && !quickIdToken && !sessionName)) {
    return null;
  }
  return Object.freeze({
    sessionId,
    quickIdToken,
    sessionName,
    chatId,
    ...(Number.isInteger(messageThreadId) ? { messageThreadId } : {}),
    ...(profile ? { profile } : {}),
    ...(topicMode ? { topicMode } : {})
  });
}

export function normalizeMessagingTargets(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTargetEntry(entry)).filter(Boolean);
}

function normalizeMessagingTopicBindingEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const chatId = normalizeNonEmptyString(entry.chatId) || String(entry.chatId ?? "").trim();
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const messageThreadId = normalizePositiveInteger(entry.messageThreadId);
  if (!chatId || !sessionId || !Number.isInteger(messageThreadId)) {
    return null;
  }
  const topicName = truncateSummary(normalizeNonEmptyString(entry.topicName), TELEGRAM_TOPIC_NAME_MAX_LENGTH);
  const updatedAt = Number.isInteger(entry.updatedAt) && entry.updatedAt > 0 ? entry.updatedAt : 0;
  return Object.freeze({
    chatId,
    sessionId,
    messageThreadId,
    ...(topicName ? { topicName } : {}),
    ...(updatedAt ? { updatedAt } : {})
  });
}

export function normalizeMessagingTopicBindings(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTopicBindingEntry(entry)).filter(Boolean);
}

export function resolveMessagingTriggerProfile(session, target = null) {
  const targetProfile = normalizeMessagingProfile(target?.profile);
  if (targetProfile) {
    return targetProfile;
  }
  const fingerprint = [session?.name, session?.shell, session?.startCommand, session?.note]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
  if (/(?:codex|claude|agent|openai|apply_patch|plan updated)/.test(fingerprint)) {
    return "coding-agent";
  }
  if (/(?:npm test|pnpm test|yarn test|pytest|jest|vitest|cargo test|go test|gradle|mvn|build|compile|coverage)/.test(fingerprint)) {
    return "build-test";
  }
  return "generic-shell";
}

function buildControlEventSignature(session) {
  const controlState = session?.controlState;
  if (!controlState || typeof controlState !== "object") {
    return CONTROL_EVENT_SIGNATURE_NONE;
  }
  const controller = normalizeNonEmptyString(controlState.currentController);
  const attachedCount = Array.isArray(controlState.attachedClients) ? controlState.attachedClients.length : 0;
  const readOnly = controlState.readOnly === true ? "ro" : "rw";
  return `${controller || "none"}:${attachedCount}:${readOnly}`;
}

function buildControlEventSummary(session) {
  const controlState = session?.controlState;
  if (!controlState || typeof controlState !== "object") {
    return "Control state changed.";
  }
  const controller = normalizeNonEmptyString(controlState.currentController);
  const attachedCount = Array.isArray(controlState.attachedClients) ? controlState.attachedClients.length : 0;
  if (controller) {
    return `Controller changed to ${controller} (${attachedCount} attached client${attachedCount === 1 ? "" : "s"}).`;
  }
  return `Control became unclaimed (${attachedCount} attached client${attachedCount === 1 ? "" : "s"}).`;
}

function createSessionStreamState() {
  return {
    pendingLine: "",
    recentLines: [],
    pendingSummaryBlock: createPendingSummaryBlock(),
    lastControlSignature: CONTROL_EVENT_SIGNATURE_NONE,
    lastLifecycleType: "",
    lastSuppressedStatusLikeAt: 0,
    lastNonMeaningfulActivityAt: 0
  };
}

function pushRecentLine(state, line) {
  state.recentLines.push(line);
  if (state.recentLines.length > MAX_RECENT_LINES) {
    state.recentLines.splice(0, state.recentLines.length - MAX_RECENT_LINES);
  }
}

function createEvent({
  session,
  profile,
  type,
  summary,
  detail = "",
  severity = "info",
  threadKey = "status",
  trace = null,
  nowFn,
  aggregationReason = "",
  noiseClass = "",
  comparableText = ""
}) {
  const textSummary = truncateSummary(summary);
  const label = buildSessionLabel(session);
  const text = textSummary ? `${label}: ${textSummary}` : label;
  const normalizedComparableText = comparableText || createComparableText(textSummary || text);
  return Object.freeze({
    id: `msg-${randomUUID()}`,
    occurredAt: nowFn(),
    sessionId: session.id,
    session,
    profile,
    type,
    severity,
    threadKey,
    summary: textSummary,
    detail: truncateSummary(detail),
    text,
    trace,
    aggregationReason: normalizeNonEmptyString(aggregationReason),
    noiseClass: normalizeNonEmptyString(noiseClass),
    comparableText: normalizedComparableText
  });
}

function classifyTerminalLine(session, profile, line, recentLines = []) {
  const visibleLine = sanitizeMessageCandidate(line, session, profile);
  if (!visibleLine) {
    return null;
  }
  const activeProfile = PROFILE_PATTERNS[profile] || PROFILE_PATTERNS["generic-shell"];
  const previousLine = sanitizeMessageCandidate(recentLines[recentLines.length - 1] || "", session, profile);
  const combinedTail = [previousLine, visibleLine].filter(Boolean).join(" | ");
  if (/^traceback/i.test(previousLine)) {
    return {
      type: "session.attention.required",
      severity: "attention",
      summary: `Traceback: ${visibleLine}`,
      threadKey: "attention"
    };
  }
  for (const pattern of activeProfile.attention) {
    if (pattern.test(visibleLine)) {
      return {
        type: "session.attention.required",
        severity: "attention",
        summary: visibleLine,
        threadKey: "attention"
      };
    }
  }
  for (const pattern of activeProfile.summary) {
    if (pattern.test(visibleLine)) {
      return {
        type: "session.output.summary",
        severity: "info",
        summary: visibleLine,
        threadKey: "status"
      };
    }
  }
  return null;
}

export function applyMessagingMessagePolicy(event, threadState = {}) {
  const type = normalizeNonEmptyString(event?.type);
  const text = normalizeNonEmptyString(event?.text);
  if (!type || !text) {
    return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "empty" });
  }
  const messageKey = normalizeNonEmptyString(event?.threadKey) || "status";
  const comparableText = normalizeNonEmptyString(event?.comparableText);
  const lastComparableText = normalizeNonEmptyString(threadState.lastComparableText);
  const lastEventType = normalizeNonEmptyString(threadState.lastEventType);
  const lastDeliveredAt = Number.isInteger(threadState.lastDeliveredAt) ? threadState.lastDeliveredAt : 0;
  const occurredAt = Number.isInteger(event?.occurredAt) ? event.occurredAt : 0;
  const withinStartupChatterWindow =
    lastDeliveredAt > 0 && occurredAt > 0 && occurredAt - lastDeliveredAt < STARTUP_CHATTER_SUPPRESSION_WINDOW_MS;
  const idleStatusSuppressionWindowMs = isCodingAgentContext(event?.session, event?.profile)
    ? CODING_AGENT_IDLE_STATUS_SUPPRESSION_WINDOW_MS
    : IDLE_STATUS_SUPPRESSION_WINDOW_MS;
  if (normalizeNonEmptyString(event?.noiseClass) && event.noiseClass !== "none") {
    return Object.freeze({ action: "suppress", messageKey, reason: `noise_${event.noiseClass}` });
  }
  if (
    type === "session.activity.idle" &&
    threadState.lastEventType === "session.activity.idle" &&
    comparableText &&
    lastComparableText === comparableText &&
    Number.isInteger(threadState.lastDeliveredAt) &&
    Number.isInteger(event?.occurredAt) &&
    event.occurredAt - threadState.lastDeliveredAt < REPEATED_IDLE_SUPPRESSION_WINDOW_MS
  ) {
    return Object.freeze({ action: "suppress", messageKey, reason: "idle_repeat" });
  }
  if (type === "session.lifecycle.created") {
    if (lastEventType === "session.lifecycle.started" && withinStartupChatterWindow) {
      return Object.freeze({ action: "suppress", messageKey, reason: "lifecycle_created_after_started" });
    }
    return Object.freeze({ action: "new", messageKey, reason: "lifecycle_created" });
  }
  if (type === "session.lifecycle.started") {
    return Object.freeze({ action: "suppress", messageKey, reason: "lifecycle_started_noise" });
  }
  if (type === "session.lifecycle.exited") {
    return Object.freeze({
      action: event?.severity === "attention" ? "alert" : "new",
      messageKey: event?.severity === "attention" ? "attention" : messageKey,
      reason: "lifecycle_exited"
    });
  }
  if (type === "session.lifecycle.closed") {
    return Object.freeze({ action: "suppress", messageKey, reason: "lifecycle_closed" });
  }
  if (type === "session.attention.required") {
    const lastDeliveredAt = Number.isInteger(threadState.lastDeliveredAt) ? threadState.lastDeliveredAt : 0;
    const withinAttentionWindow =
      lastDeliveredAt > 0 &&
      Number.isInteger(event?.occurredAt) &&
      event.occurredAt - lastDeliveredAt < ATTENTION_DUPLICATE_SUPPRESSION_WINDOW_MS;
    if (
      comparableText &&
      lastComparableText &&
      comparableText !== lastComparableText &&
      isSubsetComparableText(lastComparableText, comparableText) &&
      withinAttentionWindow &&
      threadState.messageCreated === true
    ) {
      return Object.freeze({ action: "update", messageKey: "attention", reason: "attention_followup_update" });
    }
    if (
      comparableText &&
      lastComparableText &&
      (isSubsetComparableText(comparableText, lastComparableText) || isSubsetComparableText(lastComparableText, comparableText)) &&
      withinAttentionWindow
    ) {
      return Object.freeze({ action: "suppress", messageKey: "attention", reason: "attention_duplicate_churn" });
    }
    return Object.freeze({ action: "alert", messageKey: "attention", reason: "attention_required" });
  }
  if (threadState.lastText === text) {
    return Object.freeze({ action: "suppress", messageKey, reason: "duplicate" });
  }
  if (comparableText && lastComparableText && isSubsetComparableText(comparableText, lastComparableText)) {
    return Object.freeze({ action: "suppress", messageKey, reason: "duplicate_signature" });
  }
  if (type === "session.prompt.ready") {
    if ((lastEventType === "session.lifecycle.created" || lastEventType === "session.lifecycle.started") && withinStartupChatterWindow) {
      return Object.freeze({ action: "suppress", messageKey, reason: "prompt_after_lifecycle" });
    }
    if (
      lastEventType === "session.output.summary" &&
      lastDeliveredAt > 0 &&
      occurredAt > 0 &&
      occurredAt - lastDeliveredAt < PROMPT_STATUS_SUPPRESSION_WINDOW_MS
    ) {
      return Object.freeze({ action: "suppress", messageKey, reason: "prompt_after_status_update" });
    }
    if (
      threadState.messageCreated === true &&
      threadState.lastAction === "update" &&
      lastDeliveredAt > 0 &&
      occurredAt > 0 &&
      occurredAt - lastDeliveredAt < 10_000
    ) {
      return Object.freeze({ action: "suppress", messageKey, reason: "prompt_redundant" });
    }
    const lastPromptAt = Number.isInteger(threadState.lastPromptAt) ? threadState.lastPromptAt : 0;
    if (lastPromptAt > 0 && occurredAt > 0 && occurredAt - lastPromptAt < 800) {
      return Object.freeze({ action: "suppress", messageKey, reason: "prompt_debounce" });
    }
    return Object.freeze({ action: threadState.messageCreated === true ? "update" : "new", messageKey, reason: "prompt_ready" });
  }
  if (
    type === "session.output.summary" ||
    type === "session.activity.idle" ||
    type === "session.control.changed" ||
    type === "session.share.changed"
  ) {
    if (
      type === "session.control.changed" &&
      /^control became unclaimed\b/i.test(normalizeNonEmptyString(event?.summary)) &&
      (lastEventType === "session.lifecycle.created" || lastEventType === "session.lifecycle.started") &&
      withinStartupChatterWindow
    ) {
      return Object.freeze({ action: "suppress", messageKey, reason: "startup_control_chatter" });
    }
    if (
      type === "session.activity.idle" &&
      lastEventType === "session.output.summary" &&
      lastDeliveredAt > 0 &&
      occurredAt > 0 &&
      occurredAt - lastDeliveredAt < idleStatusSuppressionWindowMs
    ) {
      return Object.freeze({ action: "suppress", messageKey, reason: "idle_after_status_update" });
    }
    if (
      type === "session.activity.idle" &&
      threadState.lastObservedEventType === "session.output.summary" &&
      Number.isInteger(threadState.lastObservedEventAt) &&
      Number.isInteger(event?.occurredAt) &&
      event.occurredAt - threadState.lastObservedEventAt < idleStatusSuppressionWindowMs
    ) {
      return Object.freeze({ action: "suppress", messageKey, reason: "idle_after_status_attempt" });
    }
    return Object.freeze({ action: threadState.messageCreated === true ? "update" : "new", messageKey, reason: "status_update" });
  }
  return Object.freeze({ action: "suppress", messageKey, reason: "unsupported" });
}

function buildThreadStateKey(target, sessionId, threadKey) {
  const stateKey = normalizeNonEmptyString(target?.stateKey);
  if (stateKey) {
    return `${stateKey}:${threadKey}`;
  }
  return `${target.chatId}:${Number.isInteger(target.messageThreadId) ? target.messageThreadId : 0}:${sessionId}:${threadKey}`;
}

function buildConversationKey(chatId, messageThreadId) {
  return `${normalizeNonEmptyString(chatId)}:${Number.isInteger(messageThreadId) ? messageThreadId : 0}`;
}

function buildTelegramTopicBindingKey(chatId, sessionId) {
  return `${normalizeNonEmptyString(chatId)}:${normalizeNonEmptyString(sessionId)}`;
}

function telegramTopicBindingsEqual(left, right) {
  if (!left || !right) {
    return false;
  }
  return (
    normalizeNonEmptyString(left.chatId) === normalizeNonEmptyString(right.chatId) &&
    normalizeNonEmptyString(left.sessionId) === normalizeNonEmptyString(right.sessionId) &&
    normalizePositiveInteger(left.messageThreadId) === normalizePositiveInteger(right.messageThreadId) &&
    normalizeNonEmptyString(left.topicName) === normalizeNonEmptyString(right.topicName)
  );
}

function buildTelegramTopicName(deckName, session) {
  const normalizedDeckName = normalizeNonEmptyString(deckName) || normalizeNonEmptyString(session?.deckId) || "Default";
  const normalizedSessionName =
    normalizeNonEmptyString(session?.name) ||
    normalizeNonEmptyString(session?.shell) ||
    normalizeNonEmptyString(session?.quickIdToken) ||
    normalizeNonEmptyString(session?.id) ||
    "terminal";
  return truncateSummary(`${normalizedDeckName} + ${normalizedSessionName}`, TELEGRAM_TOPIC_NAME_MAX_LENGTH);
}

function buildInboundTrace(request, sessionId) {
  return {
    source: `messaging:${normalizeNonEmptyString(request?.adapter) || "adapter"}`,
    sessionId: normalizeNonEmptyString(sessionId)
  };
}

function buildInboundStatusText(session, profile) {
  const lines = [
    `Status for ${buildSessionLabel(session)}`,
    `State: ${normalizeNonEmptyString(session?.state) || "unknown"}`
  ];
  if (profile) {
    lines.push(`Trigger profile: ${profile}`);
  }
  const kind = normalizeNonEmptyString(session?.kind);
  if (kind) {
    lines.push(`Kind: ${kind}`);
  }
  const controller = normalizeNonEmptyString(session?.controlState?.currentController?.clientId || session?.controlState?.currentController?.label || session?.controlState?.currentController);
  lines.push(`Controller: ${controller || "none"}`);
  const attachedCount = Array.isArray(session?.controlState?.attachedClients) ? session.controlState.attachedClients.length : 0;
  lines.push(`Attached clients: ${attachedCount}`);
  return truncateResponseText(lines.join("\n"));
}

export function normalizeMessagingInboundReplaySelector(selector) {
  const normalized = normalizeNonEmptyString(selector).toLowerCase() || DEFAULT_INBOUND_REPLAY_SELECTOR;
  const parsed = parseReplaySliceSelector(normalized);
  if (!parsed) {
    throw new ApiError(400, "ValidationError", "Replay selector must match 'l:N', 'c:N', or 'sp:N'.");
  }
  let maxCount = MAX_INBOUND_REPLAY_LINES;
  if (parsed.selectorKind === "chars") {
    maxCount = MAX_INBOUND_REPLAY_CHARS;
  } else if (parsed.selectorKind === "shell_blocks") {
    maxCount = MAX_INBOUND_REPLAY_SHELL_BLOCKS;
  }
  const boundedCount = Math.min(parsed.requestedCount, maxCount);
  return `${parsed.selectorToken}:${boundedCount}`;
}

function buildReplayResponseText(session, excerpt) {
  const header = `${buildSessionLabel(session)} replay ${excerpt.selector}`;
  const meta = `${excerpt.resolvedCount}/${excerpt.availableCount} ${excerpt.selectorKind.replace("_", " ")}${excerpt.selectorSatisfied ? "" : " (partial)"}`;
  const body = normalizeVisibleReplayText(excerpt.data || "").trim();
  const text = body ? `${header}\n${meta}\n\n${body}` : `${header}\n${meta}\n\n(no retained replay text)`;
  return truncateResponseText(text);
}

async function defaultNoop() {
  return null;
}

export function createMessagingRuntime(options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const targetMappings = normalizeMessagingTargets(options.telegramTargets);
  const sessionStates = new Map();
  const threadStates = new Map();
  const eventMetrics = new Map();
  const recentSessionByConversationKey = new Map();
  const traceEntries = [];
  let traceCapturedTotal = 0;
  const logDebug = typeof options.logDebug === "function" ? options.logDebug : () => {};
  const resolveDeckNameForSession =
    typeof options.resolveDeckNameForSession === "function"
      ? options.resolveDeckNameForSession
      : (session) => normalizeNonEmptyString(session?.deckId) || "Default";
  const onTelegramTopicBindingUpsert =
    typeof options.onTelegramTopicBindingUpsert === "function" ? options.onTelegramTopicBindingUpsert : defaultNoop;
  const resolveSessionForMessagingTarget =
    typeof options.resolveSessionForMessagingTarget === "function" ? options.resolveSessionForMessagingTarget : () => null;
  const requestMessagingStop = typeof options.requestMessagingStop === "function" ? options.requestMessagingStop : defaultNoop;
  const requestMessagingRetry = typeof options.requestMessagingRetry === "function" ? options.requestMessagingRetry : defaultNoop;
  const requestMessagingReplayExcerpt =
    typeof options.requestMessagingReplayExcerpt === "function" ? options.requestMessagingReplayExcerpt : defaultNoop;
  const adapters = [];
  const telegramTopicBindings = new Map();
  const sessionWorkQueues = new Map();
  const telegramConfigured = Boolean(options.telegramBotToken && targetMappings.length > 0);
  const telegramOutboundEnabled = telegramConfigured && options.telegramOutboundEnabled === true;
  const telegramInboundEnabled = telegramConfigured && options.telegramInboundEnabled === true;
  const telegramTransportFactory =
    typeof options.createTelegramTransport === "function" ? options.createTelegramTransport : createTelegramTransport;
  const telegramTransport = telegramConfigured
    ? telegramTransportFactory({
        botToken: options.telegramBotToken,
        apiBaseUrl: options.telegramApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;
  const telegramAdapter = createTelegramAdapter({
    configured: telegramConfigured,
    deliveryEnabled: telegramOutboundEnabled,
    inboundEnabled: telegramInboundEnabled,
    configuredTargets: targetMappings.length,
    pollTimeoutSeconds: options.telegramPollTimeoutSeconds,
    transport: telegramTransport,
    topicBindings: normalizeMessagingTopicBindings(options.telegramTopicBindings),
    nowFn
  });
  adapters.push(telegramAdapter);

  const conversationTargetIndex = new Map();
  const ambiguousConversationKeys = new Set();

  function rebuildConversationTargetIndex(dynamicBindings = []) {
    conversationTargetIndex.clear();
    ambiguousConversationKeys.clear();
    for (const target of targetMappings) {
      if (target.topicMode === "deck-session" && !Number.isInteger(target.messageThreadId)) {
        continue;
      }
      const key = buildConversationKey(target.chatId, target.messageThreadId);
      if (conversationTargetIndex.has(key)) {
        ambiguousConversationKeys.add(key);
        continue;
      }
      conversationTargetIndex.set(key, target);
    }
    for (const binding of dynamicBindings) {
      const key = buildConversationKey(binding.chatId, binding.messageThreadId);
      if (conversationTargetIndex.has(key)) {
        ambiguousConversationKeys.add(key);
        continue;
      }
      conversationTargetIndex.set(key, {
        chatId: binding.chatId,
        sessionId: binding.sessionId,
        messageThreadId: binding.messageThreadId
      });
    }
  }

  function replaceTelegramTopicBindings(entries = []) {
    telegramTopicBindings.clear();
    const normalizedBindings = normalizeMessagingTopicBindings(entries);
    for (const binding of normalizedBindings) {
      telegramTopicBindings.set(buildTelegramTopicBindingKey(binding.chatId, binding.sessionId), binding);
    }
    rebuildConversationTargetIndex(normalizedBindings);
  }

  async function upsertTelegramTopicBinding(binding) {
    const normalizedBinding = normalizeMessagingTopicBindingEntry(binding);
    if (!normalizedBinding) {
      return;
    }
    const bindingKey = buildTelegramTopicBindingKey(normalizedBinding.chatId, normalizedBinding.sessionId);
    const existingBinding = telegramTopicBindings.get(bindingKey) || null;
    if (telegramTopicBindingsEqual(existingBinding, normalizedBinding)) {
      return;
    }
    telegramTopicBindings.set(bindingKey, normalizedBinding);
    rebuildConversationTargetIndex(Array.from(telegramTopicBindings.values()));
    await onTelegramTopicBindingUpsert(normalizedBinding);
  }

  replaceTelegramTopicBindings(options.telegramTopicBindings);

  function bumpEventMetric(profile, type, action) {
    const key = `${profile}:${type}:${action}`;
    eventMetrics.set(key, (eventMetrics.get(key) || 0) + 1);
  }

  function getThreadState(target, sessionId, threadKey) {
    const key = buildThreadStateKey(target, sessionId, threadKey);
    let state = threadStates.get(key);
    if (state) {
      return state;
    }
    state = {
      messageCreated: false,
      lastText: "",
      lastComparableText: "",
      lastPromptAt: 0,
      lastAction: "",
      lastEventType: "",
      lastDeliveredAt: 0
    };
    threadStates.set(key, state);
    return state;
  }

  function resolveTarget(session) {
    if (!session || !targetMappings.length) {
      return null;
    }
    let bestMatch = null;
    let bestScore = -1;
    for (const target of targetMappings) {
      if (target.sessionId && target.sessionId !== session.id) {
        continue;
      }
      if (target.quickIdToken && target.quickIdToken !== session.quickIdToken) {
        continue;
      }
      if (target.sessionName && target.sessionName !== session.name) {
        continue;
      }
      const score = (target.sessionId ? 100 : 0) + (target.quickIdToken ? 10 : 0) + (target.sessionName ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = target;
      }
    }
    if (!bestMatch) {
      return null;
    }
    if (bestMatch.topicMode !== "deck-session") {
      return bestMatch;
    }
    const binding = telegramTopicBindings.get(buildTelegramTopicBindingKey(bestMatch.chatId, session.id)) || null;
    const topicName = buildTelegramTopicName(resolveDeckNameForSession(session), session);
    return Object.freeze({
      ...bestMatch,
      sessionId: session.id,
      topicMode: "deck-session",
      topicName,
      stateKey: `${bestMatch.chatId}:${session.id}`,
      topicStateKey: `${bestMatch.chatId}:${session.id}`,
      ...(binding && Number.isInteger(binding.messageThreadId) ? { messageThreadId: binding.messageThreadId } : {})
    });
  }

  function resolveInboundTarget(target) {
    const key = buildConversationKey(target?.chatId, target?.messageThreadId);
    if (!key || key === ":0") {
      return { error: "unmapped" };
    }
    if (ambiguousConversationKeys.has(key)) {
      return { error: "ambiguous" };
    }
    const mapping = conversationTargetIndex.get(key);
    if (!mapping) {
      return { error: "unmapped" };
    }
    return { target: mapping };
  }

  function rememberSessionForTarget(target, session) {
    if (!target || !session || !normalizeNonEmptyString(session.id)) {
      return;
    }
    recentSessionByConversationKey.set(buildConversationKey(target.chatId, target.messageThreadId), { ...session });
  }

  function getCachedSessionForTarget(target) {
    return recentSessionByConversationKey.get(buildConversationKey(target?.chatId, target?.messageThreadId)) || null;
  }

  function getOrCreateSessionState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (state) {
      return state;
    }
    state = createSessionStreamState();
    sessionStates.set(sessionId, state);
    return state;
  }

  async function ensureSessionTargetInternal(session, trace, resolvedTarget = null) {
    const target = resolvedTarget || resolveTarget(session);
    if (!target) {
      return null;
    }
    rememberSessionForTarget(target, session);
    let finalTarget = target;
    for (const adapter of adapters) {
      if (typeof adapter.ensureTarget !== "function") {
        continue;
      }
      const result = await adapter.ensureTarget(target);
      if (result?.target?.chatId) {
        finalTarget = result.target;
      }
      if (result?.topicBinding) {
        await upsertTelegramTopicBinding(result.topicBinding);
      }
      logDebug(
        "messaging.target.ensure",
        {
          adapter: adapter.getStatus?.().adapter || "adapter",
          sessionId: normalizeNonEmptyString(session?.id),
          ok: result?.ok === true,
          reason: normalizeNonEmptyString(result?.reason),
          error: normalizeNonEmptyString(result?.error),
          chatId: normalizeNonEmptyString(finalTarget?.chatId),
          messageThreadId: Number.isInteger(finalTarget?.messageThreadId) ? finalTarget.messageThreadId : null
        },
        trace || null
      );
    }
    rememberSessionForTarget(finalTarget, session);
    return finalTarget;
  }

  function appendTraceEntry(entry) {
    traceCapturedTotal += 1;
    traceEntries.push(
      Object.freeze({
        recordedAt: Number.isInteger(entry?.recordedAt) ? entry.recordedAt : nowFn(),
        sessionId: normalizeNonEmptyString(entry?.sessionId),
        sessionLabel: truncateTraceText(entry?.sessionLabel),
        profile: normalizeNonEmptyString(entry?.profile),
        type: normalizeNonEmptyString(entry?.type),
        severity: normalizeNonEmptyString(entry?.severity) || "info",
        threadKey: normalizeNonEmptyString(entry?.threadKey) || "status",
        messageKey: normalizeNonEmptyString(entry?.messageKey) || "status",
        decision: normalizeNonEmptyString(entry?.decision) || "suppress",
        reason: normalizeNonEmptyString(entry?.reason),
        correlationKey: normalizeNonEmptyString(entry?.correlationKey),
        summary: truncateTraceText(entry?.summary),
        text: truncateTraceText(entry?.text),
        comparableText: truncateTraceText(entry?.comparableText),
        noiseClass: normalizeNonEmptyString(entry?.noiseClass),
        aggregationReason: normalizeNonEmptyString(entry?.aggregationReason),
        traceId: normalizeNonEmptyString(entry?.traceId),
        correlationId: normalizeNonEmptyString(entry?.correlationId),
        traceSource: normalizeNonEmptyString(entry?.traceSource),
        target: entry?.target
          ? {
              chatId: normalizeNonEmptyString(entry.target.chatId),
              messageThreadId: Number.isInteger(entry.target.messageThreadId) ? entry.target.messageThreadId : null
            }
          : null,
        appIdentity: entry?.appIdentity
          ? {
              family: normalizeNonEmptyString(entry.appIdentity.family) || "unknown",
              label: normalizeNonEmptyString(entry.appIdentity.label),
              source: normalizeNonEmptyString(entry.appIdentity.source) || "unknown",
              confidence: Number.isFinite(entry.appIdentity.confidence) ? entry.appIdentity.confidence : 0
            }
          : null,
        delivery: Array.isArray(entry?.delivery)
          ? entry.delivery.map((outcome) => ({
              adapter: normalizeNonEmptyString(outcome?.adapter),
              delivered: outcome?.delivered === true,
              action: normalizeNonEmptyString(outcome?.action),
              error: truncateTraceText(outcome?.error),
              rateLimited: outcome?.rateLimited === true,
              retryAfterSeconds: Number.isInteger(outcome?.retryAfterSeconds) ? outcome.retryAfterSeconds : null,
              recommendedBackoffMs: Number.isInteger(outcome?.recommendedBackoffMs) ? outcome.recommendedBackoffMs : null
            }))
          : []
      })
    );
    if (traceEntries.length > MAX_MESSAGING_TRACE_ENTRIES) {
      traceEntries.splice(0, traceEntries.length - MAX_MESSAGING_TRACE_ENTRIES);
    }
  }

  async function runSessionWork(sessionId, work) {
    const normalizedSessionId = normalizeNonEmptyString(sessionId);
    if (!normalizedSessionId) {
      return work();
    }
    const previous = sessionWorkQueues.get(normalizedSessionId) || Promise.resolve();
    let current = null;
    current = previous
      .catch(() => {})
      .then(work)
      .finally(() => {
        if (sessionWorkQueues.get(normalizedSessionId) === current) {
          sessionWorkQueues.delete(normalizedSessionId);
        }
      });
    sessionWorkQueues.set(normalizedSessionId, current);
    return current;
  }

  function buildEventCorrelationKey(event, target, decision) {
    return [
      normalizeNonEmptyString(event?.sessionId),
      normalizeNonEmptyString(decision?.messageKey || event?.threadKey || "status"),
      normalizeNonEmptyString(event?.type),
      normalizeNonEmptyString(event?.comparableText || event?.summary || event?.text)
    ]
      .filter(Boolean)
      .join(":");
  }

  function recordSuppressedFragmentTrace({
    session,
    profile,
    classified,
    trace,
    reason,
    summary,
    comparableText,
    noiseClass = "",
    aggregationReason = ""
  }) {
    appendTraceEntry({
      recordedAt: nowFn(),
      sessionId: session?.id,
      sessionLabel: buildSessionLabel(session),
      profile,
      type: classified?.type || "session.output.summary",
      severity: classified?.severity || "info",
      threadKey: classified?.threadKey || "status",
      messageKey: classified?.threadKey || "status",
      decision: "suppress",
      reason,
      correlationKey: [session?.id || "", classified?.threadKey || "status", comparableText].filter(Boolean).join(":"),
      summary,
      comparableText,
      noiseClass,
      aggregationReason,
      traceId: trace?.traceId,
      correlationId: trace?.correlationId,
      traceSource: trace?.source,
      appIdentity: getSessionAppIdentity(session)
    });
  }

  function recordDispatchTrace(event, decision, target, delivery = []) {
    const appIdentity = getSessionAppIdentity(event?.session);
    appendTraceEntry({
      recordedAt: nowFn(),
      sessionId: event?.sessionId,
      sessionLabel: buildSessionLabel(event?.session || {}),
      profile: event?.profile,
      type: event?.type,
      severity: event?.severity,
      threadKey: event?.threadKey,
      messageKey: decision?.messageKey || event?.threadKey,
      decision: decision?.action,
      reason: decision?.reason,
      correlationKey: buildEventCorrelationKey(event, target, decision),
      summary: event?.summary,
      text: event?.text,
      comparableText: event?.comparableText,
      noiseClass: event?.noiseClass,
      aggregationReason: event?.aggregationReason,
      traceId: event?.trace?.traceId,
      correlationId: event?.trace?.correlationId,
      traceSource: event?.trace?.source,
      target,
      appIdentity,
      delivery
    });
    logDebug(
      "messaging.event.trace",
      {
        sessionId: event?.sessionId || null,
        type: event?.type || "",
        action: decision?.action || "suppress",
        reason: decision?.reason || "",
        profile: event?.profile || "",
        comparableText: event?.comparableText || "",
        aggregationReason: event?.aggregationReason || "",
        noiseClass: event?.noiseClass || "",
        targetChatId: target?.chatId || null,
        targetThreadId: Number.isInteger(target?.messageThreadId) ? target.messageThreadId : null,
        delivery
      },
      event?.trace || null
    );
  }

  async function flushPendingSummaryBlock(session, profile, state, trace, aggregationReason) {
    const block = state?.pendingSummaryBlock;
    if (!block || !Array.isArray(block.fragments) || block.fragments.length === 0) {
      return null;
    }
    const summary = truncateSummary(block.fragments.join(" | "));
    state.pendingSummaryBlock = createPendingSummaryBlock();
    state.recentLines = [];
    if (!summary) {
      return null;
    }
    const noise = classifyNoiseSignature(summary, session, profile);
    return dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.output.summary",
        summary,
        severity: "info",
        threadKey: "status",
        trace,
        nowFn,
        aggregationReason,
        noiseClass: noise.lowInformation ? noise.noiseClass : "",
        comparableText: noise.comparableText
      })
    );
  }

  function queueSummaryFragment(session, profile, state, classified, trace) {
    const summary = sanitizeSummaryFragment(classified?.summary, session, profile);
    const fragments = summary
      .split(/\s+\|\s+/)
      .map((entry) => truncateSummary(entry))
      .filter(Boolean);
    let queued = false;
    for (const fragment of fragments) {
      const noise = classifyNoiseSignature(fragment, session, profile);
      if (noise.lowInformation) {
        state.pendingSummaryBlock.ignoredNoiseCount += 1;
        if (noise.noiseClass === "separator_only") {
          state.pendingSummaryBlock.separatorHints += 1;
        }
        recordSuppressedFragmentTrace({
          session,
          profile,
          classified,
          trace,
          reason: `noise_${noise.noiseClass}`,
          summary: fragment,
          comparableText: noise.comparableText,
          noiseClass: noise.noiseClass,
          aggregationReason: "summary_fragment_filter"
        });
        continue;
      }
      if (state.pendingSummaryBlock.signatures.includes(noise.comparableText)) {
        recordSuppressedFragmentTrace({
          session,
          profile,
          classified,
          trace,
          reason: "duplicate_fragment",
          summary: fragment,
          comparableText: noise.comparableText,
          aggregationReason: "summary_fragment_filter"
        });
        continue;
      }
      state.pendingSummaryBlock.fragments.push(fragment);
      state.pendingSummaryBlock.signatures.push(noise.comparableText);
      queued = true;
    }
    if (state.pendingSummaryBlock.fragments.length > MAX_PENDING_SUMMARY_FRAGMENTS) {
      state.pendingSummaryBlock.fragments.splice(0, state.pendingSummaryBlock.fragments.length - MAX_PENDING_SUMMARY_FRAGMENTS);
      state.pendingSummaryBlock.signatures.splice(0, state.pendingSummaryBlock.signatures.length - MAX_PENDING_SUMMARY_FRAGMENTS);
    }
    const now = nowFn();
    state.pendingSummaryBlock.firstObservedAt = state.pendingSummaryBlock.firstObservedAt || now;
    state.pendingSummaryBlock.lastObservedAt = now;
    return queued;
  }

  async function dispatchEvent(event) {
    const target = resolveTarget(event.session);
    if (!target) {
      recordDispatchTrace(
        event,
        {
          action: "suppress",
          messageKey: event?.threadKey || "status",
          reason: "unmapped_target"
        },
        null
      );
      return null;
    }
    rememberSessionForTarget(target, event.session);
    const threadState = getThreadState(target, event.sessionId, event.threadKey);
    const decision = applyMessagingMessagePolicy(event, threadState);
    bumpEventMetric(event.profile, event.type, decision.action);
    if (decision.action === "suppress") {
      recordDispatchTrace(event, decision, target, []);
      return decision;
    }
    threadState.lastObservedEventType = event.type;
    threadState.lastObservedEventAt = event.occurredAt;
    let delivered = false;
    const deliveryResults = [];
    let finalTarget = target;
    for (const adapter of adapters) {
      const result = await adapter.handleEvent({
        ...event,
        target,
        decision
      });
      if (result?.target?.chatId) {
        finalTarget = result.target;
      }
      if (result?.topicBinding?.chatId && result?.topicBinding?.sessionId && Number.isInteger(result?.topicBinding?.messageThreadId)) {
        await upsertTelegramTopicBinding(result.topicBinding);
      }
      deliveryResults.push({
        adapter: adapter.getStatus?.().adapter || "adapter",
        delivered: result?.delivered === true,
        action: result?.action || decision.action,
        error: result?.error || "",
        rateLimited: result?.rateLimited === true,
        retryAfterSeconds: result?.retryAfterSeconds,
        recommendedBackoffMs: result?.recommendedBackoffMs
      });
      delivered = delivered || result?.delivered === true;
    }
    if (delivered) {
      threadState.messageCreated =
        decision.action === "new" || decision.action === "update" || decision.action === "alert"
          ? true
          : threadState.messageCreated;
      threadState.lastText = event.text;
      threadState.lastComparableText = event.comparableText || "";
      threadState.lastAction = decision.action;
      threadState.lastEventType = event.type;
      threadState.lastDeliveredAt = event.occurredAt;
      if (event.type === "session.prompt.ready") {
        threadState.lastPromptAt = event.occurredAt;
      }
    }
    rememberSessionForTarget(finalTarget, event.session);
    recordDispatchTrace(event, decision, finalTarget, deliveryResults);
    return decision;
  }

  function observeControlChange(session, profile, trace) {
    const state = getOrCreateSessionState(session.id);
    const nextSignature = buildControlEventSignature(session);
    if (state.lastControlSignature === nextSignature) {
      return Promise.resolve(null);
    }
    state.lastControlSignature = nextSignature;
    return dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.control.changed",
        summary: buildControlEventSummary(session),
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  async function observeSessionLifecycleInternal(type, session, trace, extra = {}) {
    const target = resolveTarget(session);
    if (!target) {
      return null;
    }
    await ensureSessionTargetInternal(session, trace, target);
    const profile = resolveMessagingTriggerProfile(session, target);
    const state = getOrCreateSessionState(session.id);
    if (type === "session.created") {
      state.lastControlSignature = buildControlEventSignature(session);
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.created",
          summary: "Session created.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.started") {
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.started",
          summary: "Session started.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.updated") {
      await observeControlChange(session, profile, trace);
      return null;
    }
    if (type === "session.exit") {
      state.lastLifecycleType = type;
      await flushPendingSummaryBlock(session, profile, state, trace, "lifecycle_exit");
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.exited",
          summary:
            Number.isInteger(extra.exitCode) && extra.exitCode !== 0
              ? `Session exited with code ${extra.exitCode}.`
              : extra.signal
                ? `Session exited with signal ${extra.signal}.`
                : "Session completed.",
          severity: Number.isInteger(extra.exitCode) && extra.exitCode !== 0 ? "attention" : "info",
          threadKey: Number.isInteger(extra.exitCode) && extra.exitCode !== 0 ? "attention" : "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.closed") {
      state.lastLifecycleType = type;
      await flushPendingSummaryBlock(session, profile, state, trace, "lifecycle_closed");
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.closed",
          summary: `Session closed${extra.reason ? ` (${extra.reason})` : ""}.`,
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    return null;
  }

  async function observeSessionDataInternal({ session, data, promptBoundaries = [], trace }) {
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const state = getOrCreateSessionState(session.id);
    const chunk = typeof data === "string" ? data : String(data ?? "");
    const normalizedPromptBoundaries = Array.from(
      new Set(
        (Array.isArray(promptBoundaries) ? promptBoundaries : [])
          .map((entry) => (Number.isInteger(entry) && entry >= 0 && entry <= chunk.length ? entry : null))
          .filter((entry) => entry !== null)
      )
    ).sort((left, right) => left - right);
    async function dispatchPromptReady() {
      await flushPendingSummaryBlock(session, profile, state, trace, "prompt_boundary");
      await dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.prompt.ready",
          summary: "Prompt ready.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    async function consumeCompletedLine(line) {
      const visibleLine = sanitizeMessageCandidate(line, session, profile);
      const lowValueNoise = classifyNoiseSignature(visibleLine, session, profile);
      if (visibleLine && lowValueNoise.lowInformation && lowValueNoise.noiseClass.startsWith("low_value_")) {
        state.lastSuppressedStatusLikeAt = nowFn();
        recordSuppressedFragmentTrace({
          session,
          profile,
          classified: {
            type: "session.output.summary",
            severity: "info",
            threadKey: "status"
          },
          trace,
          reason: `noise_${lowValueNoise.noiseClass}`,
          summary: visibleLine,
          comparableText: lowValueNoise.comparableText,
          noiseClass: lowValueNoise.noiseClass,
          aggregationReason: "line_filter"
        });
        pushRecentLine(state, visibleLine);
        return;
      }
      if (visibleLine && ZERO_ISSUE_COUNT_PATTERN.test(visibleLine)) {
        state.lastSuppressedStatusLikeAt = nowFn();
        recordSuppressedFragmentTrace({
          session,
          profile,
          classified: {
            type: "session.output.summary",
            severity: "info",
            threadKey: "status"
          },
          trace,
          reason: "noise_zero_issue_count",
          summary: visibleLine,
          comparableText: createComparableText(visibleLine),
          aggregationReason: "line_filter"
        });
        pushRecentLine(state, visibleLine);
        return;
      }
      if (isSeparatorHint(visibleLine, session, profile)) {
        if (isCodingAgentContext(session, profile)) {
          state.lastNonMeaningfulActivityAt = nowFn();
        }
        await flushPendingSummaryBlock(session, profile, state, trace, "separator_hint");
        pushRecentLine(state, visibleLine);
        return;
      }
      const classified = classifyTerminalLine(session, profile, visibleLine, state.recentLines);
      if (classified?.type === "session.attention.required") {
        const attentionComparableText = createAttentionComparableText(classified.summary);
        const attentionNoise = classifyNoiseSignature(classified.summary, session, profile);
        if (attentionNoise.lowInformation) {
          recordSuppressedFragmentTrace({
            session,
            profile,
            classified,
            trace,
            reason: `noise_${attentionNoise.noiseClass}`,
            summary: classified.summary,
            comparableText: attentionComparableText,
            noiseClass: attentionNoise.noiseClass,
            aggregationReason: "attention_filter"
          });
          pushRecentLine(state, visibleLine);
          return;
        }
        if (isLowValueAttentionFragment(classified.summary, session, profile)) {
          recordSuppressedFragmentTrace({
            session,
            profile,
            classified,
            trace,
            reason: "attention_low_value_fragment",
            summary: classified.summary,
            comparableText: attentionComparableText,
            aggregationReason: "attention_filter"
          });
          pushRecentLine(state, visibleLine);
          return;
        }
        if (isLikelyAttentionSnippetTail(classified.summary, state.recentLines, session, profile)) {
          recordSuppressedFragmentTrace({
            session,
            profile,
            classified,
            trace,
            reason: "attention_snippet_tail",
            summary: classified.summary,
            comparableText: attentionComparableText,
            aggregationReason: "attention_filter"
          });
          pushRecentLine(state, visibleLine);
          return;
        }
        await dispatchEvent(
          createEvent({
            session,
            profile,
            type: classified.type,
            summary: classified.summary,
            severity: classified.severity,
            threadKey: classified.threadKey,
            trace,
            nowFn,
            comparableText: attentionComparableText
          })
        );
      } else if (classified?.type === "session.output.summary") {
        queueSummaryFragment(session, profile, state, classified, trace);
      } else if (visibleLine && isCodingAgentContext(session, profile)) {
        state.lastNonMeaningfulActivityAt = nowFn();
      }
      pushRecentLine(state, visibleLine);
    }
    async function processChunkSegment(segment) {
      if (!segment) {
        return;
      }
      for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index];
        const nextChar = segment[index + 1];
        if (char === "\r" && nextChar === "\n") {
          await consumeCompletedLine(state.pendingLine);
          state.pendingLine = "";
          index += 1;
          continue;
        }
        if (char === "\r") {
          state.pendingLine = "";
          continue;
        }
        if (char === "\n") {
          await consumeCompletedLine(state.pendingLine);
          state.pendingLine = "";
          continue;
        }
        state.pendingLine += char;
      }
    }
    if (!chunk) {
      for (const _boundary of normalizedPromptBoundaries) {
        await dispatchPromptReady();
      }
      return;
    }
    let chunkCursor = 0;
    for (const boundary of normalizedPromptBoundaries) {
      const nextBoundary = Math.max(chunkCursor, boundary);
      await processChunkSegment(chunk.slice(chunkCursor, nextBoundary));
      if (state.pendingLine) {
        await consumeCompletedLine(state.pendingLine);
        state.pendingLine = "";
      }
      await dispatchPromptReady();
      chunkCursor = nextBoundary;
    }
    await processChunkSegment(chunk.slice(chunkCursor));
  }

  async function observeSessionIdleInternal({ session, trace }) {
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const state = getOrCreateSessionState(session.id);
    await flushPendingSummaryBlock(session, profile, state, trace, "quiet_window");
    if (
      isCodingAgentContext(session, profile) &&
      state.pendingSummaryBlock.fragments.length === 0 &&
      Number.isInteger(state.lastSuppressedStatusLikeAt) &&
      state.lastSuppressedStatusLikeAt > 0
    ) {
      const idleOccurredAt = nowFn();
      if (idleOccurredAt - state.lastSuppressedStatusLikeAt < CODING_AGENT_IDLE_STATUS_SUPPRESSION_WINDOW_MS) {
        await dispatchEvent(
          createEvent({
            session,
            profile,
            type: "session.activity.idle",
            summary: "Session idle.",
            threadKey: "status",
            trace,
            nowFn: () => idleOccurredAt,
            noiseClass: "idle_after_low_value_chatter"
          })
        );
        return;
      }
    }
    if (
      isCodingAgentContext(session, profile) &&
      state.pendingSummaryBlock.fragments.length === 0 &&
      Number.isInteger(state.lastNonMeaningfulActivityAt) &&
      state.lastNonMeaningfulActivityAt > 0
    ) {
      const idleOccurredAt = nowFn();
      if (idleOccurredAt - state.lastNonMeaningfulActivityAt < CODING_AGENT_IDLE_STATUS_SUPPRESSION_WINDOW_MS) {
        await dispatchEvent(
          createEvent({
            session,
            profile,
            type: "session.activity.idle",
            summary: "Session idle.",
            threadKey: "status",
            trace,
            nowFn: () => idleOccurredAt,
            noiseClass: "idle_after_unclassified_chatter"
          })
        );
        return;
      }
    }
    await dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.activity.idle",
        summary: "Session idle.",
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  async function observeShareChangeInternal({ action, shareLink, session, trace }) {
    if (!session) {
      return;
    }
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const targetType = normalizeNonEmptyString(shareLink?.targetType) || "session";
    const summary =
      action === "revoked"
        ? `Share access revoked for ${targetType}.`
        : `Share access created for ${targetType}.`;
    await dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.share.changed",
        summary,
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  async function executeInboundAction(request = {}) {
    const inboundResolution = resolveInboundTarget(request.target);
    if (inboundResolution.error === "unmapped") {
      const result = {
        ok: false,
        callbackText: "Unmapped chat.",
        text: "This Telegram chat is not mapped to a ptydeck session."
      };
      logDebug("messaging.inbound.reject", { adapter: request.adapter || "telegram", reason: "unmapped" }, null);
      return result;
    }
    if (inboundResolution.error === "ambiguous") {
      const result = {
        ok: false,
        callbackText: "Ambiguous mapping.",
        text: "This Telegram chat matches multiple ptydeck messaging targets. Narrow the mapping before using inbound actions."
      };
      logDebug("messaging.inbound.reject", { adapter: request.adapter || "telegram", reason: "ambiguous" }, null);
      return result;
    }

    const target = inboundResolution.target;
    let session = null;
    let resolvedLiveSession = true;
    try {
      session = await resolveSessionForMessagingTarget(target);
    } catch (error) {
      resolvedLiveSession = false;
      session = getCachedSessionForTarget(target);
      if (!session) {
        const result = {
          ok: false,
          callbackText: "Session unavailable.",
          text: error instanceof Error ? error.message : "Mapped ptydeck session is unavailable."
        };
        logDebug("messaging.inbound.reject", { adapter: request.adapter || "telegram", reason: "resolve_failed" }, null);
        return result;
      }
    }
    if (!session || !normalizeNonEmptyString(session.id)) {
      const result = {
        ok: false,
        callbackText: "Session unavailable.",
        text: "Mapped ptydeck session is unavailable."
      };
      logDebug("messaging.inbound.reject", { adapter: request.adapter || "telegram", reason: "session_missing" }, null);
      return result;
    }

    const action = normalizeNonEmptyString(request.command?.action || request.action).toLowerCase();
    const trace = buildInboundTrace(request, session.id);
    const profile = resolveMessagingTriggerProfile(session, target);

    try {
      if (action === "status") {
        const result = {
          ok: true,
          callbackText: "Status ready.",
          text: buildInboundStatusText(session, profile)
        };
        logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: true }, trace);
        return result;
      }

      if (action === "stop") {
        if (session.state !== "running" && session.state !== "starting") {
          const result = {
            ok: true,
            callbackText: "Already stopped.",
            text: truncateResponseText(`${buildSessionLabel(session)} is already stopped.`)
          };
          logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: true, idempotent: true }, trace);
          return result;
        }
        await requestMessagingStop(session.id, { trace });
        const result = {
          ok: true,
          callbackText: "Stop requested.",
          text: truncateResponseText(`Stop requested for ${buildSessionLabel(session)}.`)
        };
        logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: true }, trace);
        return result;
      }

      if (action === "retry") {
        if (resolvedLiveSession && (session.state === "running" || session.state === "starting")) {
          const result = {
            ok: false,
            callbackText: "Retry unavailable.",
            text: truncateResponseText(`Retry is unavailable while ${buildSessionLabel(session)} is ${session.state}.`)
          };
          logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: false, reason: "running" }, trace);
          return result;
        }
        const restartedSession = await requestMessagingRetry(session.id, {
          trace,
          sessionSnapshot: session,
          target
        });
        const effectiveSession = restartedSession && restartedSession.id ? restartedSession : session;
        const result = {
          ok: true,
          callbackText: "Retry started.",
          text: truncateResponseText(`Retry started for ${buildSessionLabel(effectiveSession)}.`)
        };
        logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: true }, trace);
        return result;
      }

      if (action === "replay") {
        const selector = normalizeMessagingInboundReplaySelector(request.command?.selector || request.selector);
        const excerpt = await requestMessagingReplayExcerpt(session.id, selector, { trace });
        const result = {
          ok: true,
          callbackText: `Replay ${selector}.`,
          text: buildReplayResponseText(session, excerpt)
        };
        logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: true, selector }, trace);
        return result;
      }

      const result = {
        ok: false,
        callbackText: "Unsupported action.",
        text: "Unsupported messaging action. Use status, stop, retry, or replay."
      };
      logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: false, reason: "unsupported" }, trace);
      return result;
    } catch (error) {
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Messaging action failed.";
      const result = {
        ok: false,
        callbackText: statusCode >= 500 ? "Action failed." : "Action rejected.",
        text: truncateResponseText(message)
      };
      logDebug("messaging.inbound.action", { adapter: request.adapter || "telegram", action, sessionId: session.id, ok: false, statusCode }, trace);
      return result;
    }
  }

  async function start() {
    for (const adapter of adapters) {
      if (typeof adapter.startInbound === "function") {
        await adapter.startInbound({
          onCommand: (request) => executeInboundAction({
            ...request,
            adapter: "telegram"
          })
        });
      }
    }
  }

  async function stop() {
    for (const adapter of adapters) {
      if (typeof adapter.stop === "function") {
        await adapter.stop();
      }
    }
  }

  function buildStatusSummary() {
    return {
      enabled: telegramConfigured,
      deliveryEnabled: telegramOutboundEnabled,
      adapters: adapters.map((adapter) => adapter.getStatus()),
      trace: {
        capacity: MAX_MESSAGING_TRACE_ENTRIES,
        capturedTotal: traceCapturedTotal,
        recent: traceEntries.slice(-MAX_MESSAGING_STATUS_TRACES)
      }
    };
  }

  function renderMetricLines() {
    const lines = [];
    for (const [key, count] of eventMetrics.entries()) {
      const [profile, eventType, action] = key.split(":");
      lines.push(
        `ptydeck_messaging_events_total{profile="${profile}",event_type="${eventType}",decision="${action}"} ${count}`
      );
    }
    for (const adapter of adapters) {
      lines.push(...adapter.renderMetricLines());
    }
    return lines;
  }

  function observeSessionLifecycle(type, session, trace, extra = {}) {
    return runSessionWork(session?.id, () => observeSessionLifecycleInternal(type, session, trace, extra));
  }

  function observeSessionData({ session, data, promptBoundaries = [], trace }) {
    return runSessionWork(session?.id, () => observeSessionDataInternal({ session, data, promptBoundaries, trace }));
  }

  function observeSessionIdle({ session, trace }) {
    return runSessionWork(session?.id, () => observeSessionIdleInternal({ session, trace }));
  }

  function observeShareChange({ action, shareLink, session, trace }) {
    return runSessionWork(session?.id, () => observeShareChangeInternal({ action, shareLink, session, trace }));
  }

  function ensureSessionTarget(session, trace) {
    return runSessionWork(session?.id, () => ensureSessionTargetInternal(session, trace));
  }

  return {
    start,
    stop,
    replaceTelegramTopicBindings,
    ensureSessionTarget,
    observeSessionLifecycle,
    observeSessionData,
    observeSessionIdle,
    observeShareChange,
    buildStatusSummary,
    renderMetricLines
  };
}
