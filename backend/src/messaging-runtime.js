import { randomUUID } from "node:crypto";
import {
  CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH,
  CODEX_SEPARATOR_INFO_SCOPE,
  CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH,
  CODEX_SEPARATOR_SECTION_SCOPE,
  CODEX_SEPARATOR_SUMMARY_MAX_TEXT_LENGTH,
  CODEX_SEPARATOR_SUMMARY_SCOPE,
  advanceCodexSeparatorSectionState,
  createCodexAllowlistState,
  createCodexStreamEntry,
  advanceCodexSeparatorInfoState,
  evaluateCodexSeparatorSummaryCandidate
} from "./codex-outbound-evaluator.js";
import { ApiError } from "./errors.js";
import { normalizeVisibleReplayText, parseReplaySliceSelector } from "./replay-excerpt.js";
import { buildTelegramCommandCatalog } from "./telegram-command-surface.js";
import { createTelegramAdapter, createTelegramTransport } from "./telegram-adapter.js";
import {
  DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS,
  createTerminalProjectionTracker
} from "./terminal-projection.js";
import {
  parseCustomCommandInvocation,
  resolveCustomCommandForSession,
  renderCustomCommandForSession
} from "../../frontend/src/public/custom-command-model.js";
import { normalizeCustomCommandPayloadForShell } from "../../frontend/src/public/terminal-stream.js";
import {
  createAppSemanticAdapterDescriptor,
  createDeliveryAdapterDescriptor,
  createMessageIntent,
  createOutputEpisode,
  createTerminalProjection,
  createTurn
} from "./terminal-messaging-core.js";

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
const CODEX_SUMMARY_RESTART_RECOVERY_QUIET_MS = STARTUP_CHATTER_SUPPRESSION_WINDOW_MS;
const CODEX_SUMMARY_RESTART_RESEND_LEDGER_TTL_MS = 24 * 60 * 60 * 1000;
const CODEX_SUMMARY_RESTART_RESEND_LEDGER_MAX_ENTRIES = 1000;
const CODEX_TELEGRAM_REPLY_SCOPE = "codex_input_reply";
const CODEX_TELEGRAM_REPLY_WINDOW_MS = 45_000;
const CODEX_TELEGRAM_REPLY_INPUT_CARRYOVER_WINDOW_MS = 2_000;
const CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH = 24;
const CODEX_TELEGRAM_REPLY_MIN_WORDS = 5;
const CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH = 1200;
const CODEX_TELEGRAM_REPLY_MAX_LINES = 8;
const CODEX_ALLOWLIST_DELIVERY_SCOPES = Object.freeze([
  CODEX_TELEGRAM_REPLY_SCOPE,
  CODEX_SEPARATOR_INFO_SCOPE,
  CODEX_SEPARATOR_SECTION_SCOPE,
  CODEX_SEPARATOR_SUMMARY_SCOPE
]);

const NOISE_SEPARATOR_ONLY_PATTERN = /^\s*(?:[-_=|·•*]+|[─━]{8,})\s*$/u;
const CODING_AGENT_SECTION_MARKER_PATTERN = /^\s*✦(?:\s|$)/u;
const WINDOWS_OR_POSIX_PATH_PATTERN = /(?:[A-Za-z]:\\|\/)[^\s|·•]+/g;
const MODEL_TOKEN_PATTERN = /\b(?:gpt-[\w.-]+|claude(?:-[\w.-]+)?|gemini(?:-[\w.-]+)?)\b/gi;
const BUDGET_TOKEN_PATTERN = /\b\d{1,3}%\s+(?:left|used|remaining)\b/gi;
const EFFORT_TOKEN_PATTERN = /\b(?:xhigh|high|medium|low)\b/gi;
const CODEX_REPLY_PROMPT_ECHO_TAIL_PATTERN =
  /(?:@filename|\b(?:find and fix a bug|explain this codebase|review on my current changes)\b|\b(?:gpt-[\w.-]+|claude(?:-[\w.-]+)?|gemini(?:-[\w.-]+)?)\b|\b(?:xhigh|high|medium|low)\b|\b\d{1,3}%\s+(?:left|used|remaining)\b)/i;
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
const CODING_AGENT_ANTI_BULLET_PATTERN = /^(?:[•*]\s*)?(?:Ran|Explored|Waited(?: for background terminal)?|Context compacted|Updated Plan)\b/i;
const TELEGRAM_REPLY_TASK_REFERENCE_PATTERN = /^(?:[-*]\s*)?(?:\d+\.\s+)?MSG-\d+\b(?:\s+Owner\s+[A-Z][A-Z0-9_-]*)?$/u;
const TELEGRAM_REPLY_MD_HEADING_PATTERN = /^(?:In|On)\s+[\w./-]+\.md:$/iu;
const TELEGRAM_REPLY_STRUCTURAL_META_PATTERN =
  /^(?:Open Tasks(?: in [\w.-]+)?|Open Execution Items(?: in [\w.-]+)?|Ownership|My active ownership role|Active ownership role|Planning state|Planungsstand|Repo(?: state|-Zustand)|Validation|Kontext|Context|In (?:TODO|ROADMAP|CHANGELOG|CODEX_CONTEXT|DEPLOYMENT|DONE|TODO-OUTLOOK)\.md:?)\b/iu;

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

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeReplyPromotionInputText(value) {
  return normalizeWhitespace(normalizeLineBreaks(value));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function truncateMiddleNormalizedText(normalized, maxLength) {
  if (!normalized) {
    return "";
  }
  if (!Number.isInteger(maxLength) || maxLength <= 0 || normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 5) {
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
  const available = maxLength - 1;
  const headLength = Math.max(1, Math.ceil(available * 0.6));
  const tailLength = Math.max(1, available - headLength);
  const head = normalized.slice(0, headLength).trimEnd();
  const tail = normalized.slice(Math.max(headLength, normalized.length - tailLength)).trimStart();
  return tail ? `${head}…${tail}` : `${head}…`;
}

function truncateStructuredMessageText(value, maxLength = MAX_EVENT_SUMMARY_LENGTH) {
  const normalized = normalizeLineBreaks(value)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return truncateMiddleNormalizedText(normalized, maxLength);
}

function truncateDisplayText(value, maxLength = MAX_EVENT_SUMMARY_LENGTH) {
  const normalized = normalizeVisibleReplayText(value).replace(/\s+/g, " ").trim();
  return truncateMiddleNormalizedText(normalized, maxLength);
}

function truncateResponseText(value, maxLength = MAX_INBOUND_RESPONSE_TEXT_LENGTH) {
  const normalized = typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
  return truncateMiddleNormalizedText(normalized, maxLength);
}

function truncateTraceText(value, maxLength = 240) {
  const normalized = truncateSummary(value, maxLength);
  return normalized || "";
}

function buildInboundLogDetails(request = {}, extra = {}) {
  return {
    adapter: request.adapter || "telegram",
    source: normalizeNonEmptyString(request.source) || "unknown",
    action: normalizeNonEmptyString(request.command?.action || request.action),
    selector: normalizeNonEmptyString(request.command?.selector || request.selector),
    chatId: normalizeNonEmptyString(request.target?.chatId) || null,
    messageThreadId: Number.isInteger(request.target?.messageThreadId) ? request.target.messageThreadId : null,
    chatType: normalizeNonEmptyString(request.chatType) || null,
    chatTitle: normalizeNonEmptyString(request.chatTitle) || null,
    chatUsername: normalizeNonEmptyString(request.chatUsername) || null,
    chatIsForum: typeof request.chatIsForum === "boolean" ? request.chatIsForum : null,
    fromUserId: Number.isInteger(request.fromUserId) ? request.fromUserId : null,
    fromUsername: normalizeNonEmptyString(request.fromUsername) || null,
    preview: truncateTraceText(request.preview, 200),
    ...extra
  };
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

function isCodexAppIdentity(session) {
  return getSessionAppIdentity(session).label === "codex";
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

function createPendingCodexTelegramReply() {
  return {
    active: false,
    triggeredAt: 0,
    traceId: "",
    correlationId: "",
    source: "",
    replyPreferred: false,
    inputText: "",
    preInputPendingLine: "",
    preInputRecentLines: [],
    started: false,
    firstLineAt: 0,
    lastLineAt: 0,
    lines: []
  };
}

function isReplyPreferredTelegramTrace(trace = null) {
  return normalizeNonEmptyString(trace?.source) === "messaging:telegram" && trace?.replyEligible === true;
}

function isReplyPromotionEligibleTrace(trace = null) {
  return trace?.replyPromotionEligible === true || isReplyPreferredTelegramTrace(trace);
}

function isCodexTelegramReplyActive(replyState, observedAt = 0) {
  if (!replyState?.active || !Number.isInteger(replyState?.triggeredAt) || replyState.triggeredAt <= 0) {
    return false;
  }
  if (!Number.isInteger(observedAt) || observedAt <= 0) {
    return true;
  }
  return observedAt - replyState.triggeredAt <= CODEX_TELEGRAM_REPLY_WINDOW_MS;
}

function stripCodexReplyInlineTail(value) {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) {
    return "";
  }
  const promptMarkerIndex = normalized.indexOf("›");
  if (promptMarkerIndex > 0) {
    const prefix = normalizeWhitespace(normalized.slice(0, promptMarkerIndex));
    const prefixWordCount = prefix.split(/\s+/u).filter(Boolean).length;
    if (prefix && (prefix.length >= CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH || prefixWordCount >= CODEX_TELEGRAM_REPLY_MIN_WORDS)) {
      return prefix;
    }
  }
  return normalized;
}

function stripCodexReplyLinePrefix(value) {
  return stripCodexReplyInlineTail(String(value || "").replace(/^[•*]\s+/u, ""));
}

function normalizeCodexReplySnapshotLine(value) {
  return stripCodexReplyInlineTail(normalizeWhitespace(value));
}

function sanitizeCodexTelegramReplyStartLine(line, replyState) {
  let normalized = normalizeWhitespace(String(line || ""));
  if (!normalized) {
    return "";
  }
  const inputText = normalizeReplyPromotionInputText(replyState?.inputText);
  if (inputText) {
    const promptEchoPattern = new RegExp(`^[›>]+\\s*${escapeRegExp(inputText)}(?:\\s+.*)?$`, "u");
    if (promptEchoPattern.test(normalized)) {
      return "";
    }
  }
  normalized = stripCodexReplyLinePrefix(normalized);
  const preInputPendingLine = stripCodexReplyInlineTail(normalizeWhitespace(replyState?.preInputPendingLine));
  let removedCarryoverPrefix = false;
  if (preInputPendingLine && normalized.startsWith(preInputPendingLine)) {
    normalized = normalizeWhitespace(normalized.slice(preInputPendingLine.length));
    removedCarryoverPrefix = true;
  }
  if (!normalized) {
    return "";
  }
  if (inputText) {
    if (normalized === inputText) {
      return "";
    }
    if (normalized.startsWith(inputText)) {
      const remainder = normalizeWhitespace(normalized.slice(inputText.length));
      if (!remainder) {
        return "";
      }
      if (removedCarryoverPrefix || CODEX_REPLY_PROMPT_ECHO_TAIL_PATTERN.test(remainder)) {
        normalized = remainder;
        if (!normalized || CODEX_REPLY_PROMPT_ECHO_TAIL_PATTERN.test(normalized)) {
          return "";
        }
      }
    }
  }
  return normalized;
}

function buildCodexReplyComparableText(value) {
  const normalized = normalizeCodexReplySnapshotLine(value);
  if (!normalized) {
    return "";
  }
  return createComparableText(normalized);
}

function isLikelyStaleCodexReplyStart(line, replyState) {
  const startComparableText = buildCodexReplyComparableText(line);
  if (!startComparableText) {
    return false;
  }
  const snapshots = [
    buildCodexReplyComparableText(replyState?.preInputPendingLine),
    ...(Array.isArray(replyState?.preInputRecentLines)
      ? replyState.preInputRecentLines.map((entry) => buildCodexReplyComparableText(entry))
      : [])
  ].filter(Boolean);
  for (const snapshotText of snapshots) {
    if (snapshotText === startComparableText) {
      return true;
    }
    if (snapshotText.length <= 64 && startComparableText.startsWith(snapshotText)) {
      return true;
    }
    if (startComparableText.length <= 64 && snapshotText.startsWith(startComparableText)) {
      return true;
    }
  }
  return false;
}

function isCodexTelegramReplyMetaLine(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return true;
  }
  return (
    TELEGRAM_REPLY_TASK_REFERENCE_PATTERN.test(normalized) ||
    TELEGRAM_REPLY_MD_HEADING_PATTERN.test(normalized) ||
    TELEGRAM_REPLY_STRUCTURAL_META_PATTERN.test(normalized)
  );
}

const CODING_AGENT_COMMENTARY_LEAD_PATTERN =
  /^(?:[•*]\s*)?(?:(?:ich|i(?:'m| am|’m)?|i(?:'ll| will)|we(?:'re| are|’re)?|we(?:'ll| will))\s+(?:prüfe|pruefe|ziehe|lese|analysiere|vergleiche|setze|gehe|check(?:ing)?|inspect(?:ing)?|review(?:ing)?|read(?:ing)?|trace(?:ing)?|compare(?:ing)?|analy(?:s|z)e(?:ing)?|implement(?:ing)?|narrow(?:ing)?|pull(?:ing)?|look(?:ing)?|verify(?:ing)?|sync(?:ing)?|push(?:ing)?))\b/iu;
const CODING_AGENT_COMMENTARY_CONTEXT_PATTERN =
  /(?:stream(?:-to-message)?-pipeline|reply-assembly|delivery-policy|section-assembly|seams\b|evaluator\b|runtime(?:-klassifikation)?|klassifikation|repo(?:[-/ ](?:prozess)?zustand|\s+state)?|repo-\s*und\s+dokumentationsstand|dokumentationsstand|document(?:ation)?(?:\s+state|\s+stand)?|markdown state|backlog separation|validator(?:en|s)?|worktree\b|drift(?:ed)?\b|logs?\b|capture\b|planungsstand\b|current code(?:base|path)?|todo(?:-outlook)?\.md|roadmap\.md|changelog\.md|codex_context\.md|deployment\.md|main\b)/iu;

function isCommentaryLikeCodexOutboundText(value, session, profile) {
  if (!isCodingAgentContext(session, profile)) {
    return false;
  }
  const lines = normalizeLineBreaks(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  const headline = lines[0].replace(/^[•*]\s+/u, "");
  const combined = lines.join(" ");
  if (!CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(headline) && !CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(combined)) {
    return false;
  }
  return CODING_AGENT_COMMENTARY_CONTEXT_PATTERN.test(combined);
}

function shouldIgnoreCodexTelegramReplyStart(line, session, profile) {
  const normalized = stripCodexReplyLinePrefix(line);
  if (!normalized) {
    return true;
  }
  if (/^[›>]/u.test(normalized)) {
    return true;
  }
  if (CODING_AGENT_ANTI_BULLET_PATTERN.test(normalized)) {
    return true;
  }
  if (isSeparatorHint(normalized, session, profile)) {
    return true;
  }
  if (isCodexTelegramReplyMetaLine(normalized)) {
    return true;
  }
  if (isCommentaryLikeCodexOutboundText(normalized, session, profile)) {
    return true;
  }
  const noise = classifyNoiseSignature(normalized, session, profile);
  if (noise.lowInformation) {
    return true;
  }
  const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
  return normalized.length < CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH && wordCount < CODEX_TELEGRAM_REPLY_MIN_WORDS;
}

function isCodexTelegramReplyBoundaryLine(line, session, profile) {
  const normalized = stripCodexReplyLinePrefix(line);
  if (!normalized) {
    return true;
  }
  if (/^[›>]/u.test(normalized)) {
    return true;
  }
  if (CODING_AGENT_ANTI_BULLET_PATTERN.test(normalized)) {
    return true;
  }
  if (isSeparatorHint(normalized, session, profile)) {
    return true;
  }
  if (isCodexTelegramReplyMetaLine(normalized)) {
    return true;
  }
  if (isCommentaryLikeCodexOutboundText(normalized, session, profile)) {
    return true;
  }
  return classifyNoiseSignature(normalized, session, profile).lowInformation;
}

function normalizeCodexTelegramReplyText(lines = []) {
  const cleanedLines = lines
    .map((line) => stripCodexReplyLinePrefix(line))
    .filter(Boolean)
    .slice(0, CODEX_TELEGRAM_REPLY_MAX_LINES);
  if (cleanedLines.length === 0) {
    return "";
  }
  const hasStructuredLines = cleanedLines.some((line) => /^(?:[-*]\s+|\d+\.\s+)/u.test(line) || /:$/u.test(line));
  const text = hasStructuredLines ? cleanedLines.join("\n") : cleanedLines.join(" ");
  return normalizeLineBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

function sanitizeCodexTelegramReplyLineCandidate(value, session, profile) {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) {
    return "";
  }
  const trimmed = trimCodingAgentLowValueTail(stripTerminalNoiseFragments(normalized), session, profile);
  if (!trimmed) {
    return "";
  }
  return truncateMiddleNormalizedText(trimmed, CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH * 2);
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

export function createMessagingThreadPolicyState() {
  return {
    messageCreated: false,
    lastText: "",
    lastComparableText: "",
    lastDeliveryBlockKey: "",
    lastPromptAt: 0,
    lastAction: "",
    lastEventType: "",
    lastDeliveredAt: 0,
    lastObservedEventType: "",
    lastObservedEventAt: 0
  };
}

export function advanceMessagingThreadPolicyState(threadState, event, decision, { delivered = false } = {}) {
  const state = threadState && typeof threadState === "object"
    ? threadState
    : createMessagingThreadPolicyState();
  const normalizedAction = normalizeNonEmptyString(decision?.action);
  const normalizedType = normalizeNonEmptyString(event?.type);
  const occurredAt = Number.isInteger(event?.occurredAt) ? event.occurredAt : 0;
  if (normalizedAction && normalizedAction !== "suppress") {
    state.lastObservedEventType = normalizedType;
    if (occurredAt > 0) {
      state.lastObservedEventAt = occurredAt;
    }
  }
  if (!delivered) {
    return state;
  }
  if (normalizedAction === "new" || normalizedAction === "update" || normalizedAction === "alert") {
    state.messageCreated = true;
  }
  state.lastText = String(event?.text || "");
  state.lastComparableText = String(event?.comparableText || "");
  state.lastDeliveryBlockKey = String(event?.deliveryBlockKey || "");
  state.lastAction = normalizedAction;
  state.lastEventType = normalizedType;
  if (occurredAt > 0) {
    state.lastDeliveredAt = occurredAt;
    if (normalizedType === "session.prompt.ready") {
      state.lastPromptAt = occurredAt;
    }
  }
  return state;
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
  const hasSelector = Boolean(sessionId || quickIdToken || sessionName);
  const allowDynamicDeckSessionTarget = topicMode === "deck-session" && !hasSelector;
  if (!chatId || (!hasSelector && !allowDynamicDeckSessionTarget)) {
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

function buildCodexRestartResendTargetStateKey(target, sessionId) {
  const explicitStateKey = normalizeNonEmptyString(target?.stateKey || target?.topicStateKey);
  if (explicitStateKey) {
    return explicitStateKey;
  }
  return [
    normalizeNonEmptyString(target?.chatId),
    Number.isInteger(target?.messageThreadId) ? target.messageThreadId : 0,
    normalizeNonEmptyString(sessionId)
  ].join(":");
}

function buildCodexRestartResendLedgerKey({ deliveryScope, sessionId, target, comparableText }) {
  const normalizedScope = normalizeNonEmptyString(deliveryScope);
  const normalizedComparableText = normalizeNonEmptyString(comparableText);
  const targetStateKey = buildCodexRestartResendTargetStateKey(target, sessionId);
  if (!normalizedScope || !normalizedComparableText || !targetStateKey) {
    return "";
  }
  return `${normalizedScope}:${targetStateKey}:${normalizedComparableText}`;
}

function normalizeCodexRestartResendLedgerEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const deliveryScope = normalizeNonEmptyString(entry.deliveryScope);
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const chatId = normalizeNonEmptyString(entry.chatId) || String(entry.chatId ?? "").trim();
  const messageThreadId = normalizePositiveInteger(entry.messageThreadId);
  const targetStateKey = normalizeNonEmptyString(entry.targetStateKey);
  const comparableText = normalizeNonEmptyString(entry.comparableText);
  const deliveredAt = Number.isInteger(entry.deliveredAt) && entry.deliveredAt > 0 ? entry.deliveredAt : 0;
  const key =
    normalizeNonEmptyString(entry.key) ||
    buildCodexRestartResendLedgerKey({
      deliveryScope,
      sessionId,
      target: {
        chatId,
        ...(Number.isInteger(messageThreadId) ? { messageThreadId } : {}),
        ...(targetStateKey ? { stateKey: targetStateKey } : {})
      },
      comparableText
    });
  if (!key || !deliveryScope || !sessionId || !chatId || !comparableText || !deliveredAt) {
    return null;
  }
  return Object.freeze({
    key,
    deliveryScope,
    sessionId,
    chatId,
    ...(Number.isInteger(messageThreadId) ? { messageThreadId } : {}),
    targetStateKey: targetStateKey || buildCodexRestartResendTargetStateKey({ chatId, messageThreadId }, sessionId),
    comparableText,
    deliveredAt
  });
}

function normalizeCodexRestartResendLedgerEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeCodexRestartResendLedgerEntry(entry)).filter(Boolean);
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
    terminalProjection: null,
    pendingSummaryBlock: createPendingSummaryBlock(),
    pendingCodexTelegramReply: createPendingCodexTelegramReply(),
    lastObservedInputText: "",
    lastObservedInputAt: 0,
    pendingCodexSeparatorInfoDecision: null,
    lastControlSignature: CONTROL_EVENT_SIGNATURE_NONE,
    lastLifecycleType: "",
    lastSuppressedStatusLikeAt: 0,
    lastNonMeaningfulActivityAt: 0,
    ...createCodexAllowlistState(),
    lastCodexSeparatorCandidateKey: "",
    lastCodexSeparatorSectionCandidateKey: "",
    lastCodexSeparatorSummaryCandidateKey: "",
    lastCodexTelegramReplyCandidateKey: ""
  };
}

function createCodexSummaryRestartRecoveryState(now) {
  return {
    active: true,
    activatedAt: now,
    firstInputAt: 0,
    lastInputAt: 0
  };
}

function buildCodexSeparatorDeliveryBlockKey(decision) {
  const explicitBlockKey = normalizeNonEmptyString(decision?.deliveryBlockKey);
  if (explicitBlockKey) {
    return explicitBlockKey;
  }
  if (!Number.isInteger(decision?.anchorSequence) || !Number.isInteger(decision?.infoSequence)) {
    return "";
  }
  return `${decision.anchorSequence}:${decision.infoSequence}`;
}

function getCodexAllowlistDecisionBlockKey(decision) {
  return buildCodexSeparatorDeliveryBlockKey(decision) || normalizeNonEmptyString(decision?.key);
}

function clearPendingCodexSeparatorInfoDecision(state) {
  if (!state || !state.pendingCodexSeparatorInfoDecision) {
    return null;
  }
  const pending = state.pendingCodexSeparatorInfoDecision;
  state.pendingCodexSeparatorInfoDecision = null;
  return pending;
}

function shouldDispatchPendingCodexInfoAfterSectionRejection(reason) {
  return (
    reason === "section_too_shallow" ||
    reason === "gap_timeout" ||
    reason === "lookahead_exhausted" ||
    reason === "flush_after_section"
  );
}

function hasActiveSectionOwnershipForInfoDecision(state, decision) {
  if (!state || !decision || normalizeNonEmptyString(decision?.family) !== CODEX_SEPARATOR_INFO_SCOPE) {
    return false;
  }
  const candidate = state.codexSeparatorSectionCandidate;
  if (!candidate || candidate.phase !== "collecting_section") {
    return false;
  }
  return (
    Number.isInteger(candidate.anchorSequence) &&
    Number.isInteger(candidate.headlineSequence) &&
    candidate.anchorSequence === decision.anchorSequence &&
    candidate.headlineSequence === decision.infoSequence
  );
}

function shouldDeferLineClassificationToCodexSectionAssembly(session, profile, state, visibleLine) {
  if (!isCodexAppIdentity(session) || !isCodingAgentContext(session, profile)) {
    return false;
  }
  const candidate = state?.codexSeparatorSectionCandidate;
  if (!candidate || candidate.phase !== "collecting_section") {
    return false;
  }
  const normalized = normalizeWhitespace(visibleLine);
  if (!normalized) {
    return false;
  }
  if (isSeparatorHint(normalized, session, profile)) {
    return false;
  }
  if (CODING_AGENT_ANTI_BULLET_PATTERN.test(normalized)) {
    return false;
  }
  if (/^›\s+/u.test(normalized)) {
    return false;
  }
  return true;
}

function buildCodexTelegramReplyDeliveryBlockKey(replyState) {
  const correlationId = normalizeNonEmptyString(replyState?.correlationId);
  if (correlationId) {
    return correlationId;
  }
  const traceId = normalizeNonEmptyString(replyState?.traceId);
  if (traceId) {
    return traceId;
  }
  return Number.isInteger(replyState?.triggeredAt) && replyState.triggeredAt > 0 ? `reply:${replyState.triggeredAt}` : "";
}

function isCodexAllowlistScope(deliveryScope) {
  return (
    deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE ||
    deliveryScope === CODEX_SEPARATOR_INFO_SCOPE ||
    deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE ||
    deliveryScope === CODEX_SEPARATOR_SUMMARY_SCOPE
  );
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
  comparableText = "",
  deliveryScope = "",
  deliveryBlockKey = "",
  summaryMaxLength = MAX_EVENT_SUMMARY_LENGTH,
  preserveStructuredSummary = false,
  messageIntent = null
}) {
  const normalizedDeliveryScope = normalizeNonEmptyString(deliveryScope);
  const textSummary =
    preserveStructuredSummary || normalizedDeliveryScope === CODEX_SEPARATOR_SECTION_SCOPE
      ? truncateStructuredMessageText(summary, summaryMaxLength)
      : truncateSummary(summary, summaryMaxLength);
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
    deliveryScope: normalizedDeliveryScope,
    deliveryBlockKey: normalizeNonEmptyString(deliveryBlockKey),
    noiseClass: normalizeNonEmptyString(noiseClass),
    comparableText: normalizedComparableText,
    messageIntent
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
  const deliveryScope = normalizeNonEmptyString(event?.deliveryScope || event?.aggregationReason);
  const deliveryBlockKey = normalizeNonEmptyString(event?.deliveryBlockKey);
  const comparableText = normalizeNonEmptyString(event?.comparableText);
  const lastComparableText = normalizeNonEmptyString(threadState.lastComparableText);
  const lastDeliveryBlockKey = normalizeNonEmptyString(threadState.lastDeliveryBlockKey);
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
  if (isCodexAllowlistScope(deliveryScope)) {
    if (
      threadState.messageCreated === true &&
      deliveryBlockKey &&
      lastDeliveryBlockKey &&
      deliveryBlockKey === lastDeliveryBlockKey
    ) {
      return Object.freeze({ action: "update", messageKey, reason: `${deliveryScope}_block_update` });
    }
    return Object.freeze({ action: "new", messageKey, reason: `${deliveryScope}_new_block` });
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
  const adapter = normalizeNonEmptyString(request?.adapter) || "adapter";
  const updateId =
    Number.isInteger(request?.updateId) && request.updateId >= 0 ? String(request.updateId) : normalizeNonEmptyString(request?.updateId);
  const requestId = `msg-${randomUUID()}`;
  const correlationId = updateId ? `msg-${adapter}-${updateId}` : requestId;
  return {
    traceId: requestId,
    requestId,
    correlationId,
    source: `messaging:${adapter}`,
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

function normalizeInboundCustomInvocationText(rawText, customCommandName) {
  const normalizedName = normalizeNonEmptyString(customCommandName);
  const normalizedText = normalizeNonEmptyString(rawText);
  if (!normalizedName) {
    return normalizedText;
  }
  const match = normalizedText.match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?([\s\S]*)$/);
  if (!match) {
    return `/${normalizedName}`;
  }
  return `/${normalizedName}${match[2] || ""}`;
}

async function defaultNoop() {
  return null;
}

export function normalizeMessagingInboundInputPayload(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalizedLines = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  if (!normalizedLines.trim()) {
    return "";
  }
  return `${normalizedLines}\r`;
}

export function createMessagingRuntime(options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const targetMappings = normalizeMessagingTargets(options.telegramTargets);
  const sessionStates = new Map();
  const codexSummaryRestartRecoveryStates = new Map();
  const threadStates = new Map();
  const eventMetrics = new Map();
  const recentSessionByConversationKey = new Map();
  const codexRestartResendLedger = new Map();
  const traceEntries = [];
  let traceCapturedTotal = 0;
  let runtimeReadyAt = 0;
  let codexSummaryRestartRecoveryQuietUntil = 0;
  const logDebug = typeof options.logDebug === "function" ? options.logDebug : () => {};
  const codexSummaryRestartRecoveryQuietMs =
    Number.isInteger(options.codexSummaryRestartRecoveryQuietMs) && options.codexSummaryRestartRecoveryQuietMs > 0
      ? options.codexSummaryRestartRecoveryQuietMs
      : CODEX_SUMMARY_RESTART_RECOVERY_QUIET_MS;
  const resolveDeckNameForSession =
    typeof options.resolveDeckNameForSession === "function"
      ? options.resolveDeckNameForSession
      : (session) => normalizeNonEmptyString(session?.deckId) || "Default";
  const resolveDeckForSession =
    typeof options.resolveDeckForSession === "function"
      ? options.resolveDeckForSession
      : (session) => ({
          id: normalizeNonEmptyString(session?.deckId),
          name: resolveDeckNameForSession(session)
        });
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const onTelegramTopicBindingUpsert =
    typeof options.onTelegramTopicBindingUpsert === "function" ? options.onTelegramTopicBindingUpsert : defaultNoop;
  const onCodexRestartResendLedgerUpsert =
    typeof options.onCodexRestartResendLedgerUpsert === "function"
      ? options.onCodexRestartResendLedgerUpsert
      : defaultNoop;
  const resolveSessionForMessagingTarget =
    typeof options.resolveSessionForMessagingTarget === "function" ? options.resolveSessionForMessagingTarget : () => null;
  const requestMessagingStop = typeof options.requestMessagingStop === "function" ? options.requestMessagingStop : defaultNoop;
  const requestMessagingRetry = typeof options.requestMessagingRetry === "function" ? options.requestMessagingRetry : defaultNoop;
  const requestMessagingSendInput =
    typeof options.requestMessagingSendInput === "function" ? options.requestMessagingSendInput : defaultNoop;
  const requestMessagingReplayExcerpt =
    typeof options.requestMessagingReplayExcerpt === "function" ? options.requestMessagingReplayExcerpt : defaultNoop;
  const adapters = [];
  const telegramTopicBindings = new Map();
  const sessionWorkQueues = new Map();
  const telegramConfigured = Boolean(options.telegramBotToken && targetMappings.length > 0);
  const telegramOutboundHardBreakActive = options.telegramOutboundHardBreakActive === true;
  const telegramAllowlistDeliveryScopes = telegramConfigured ? CODEX_ALLOWLIST_DELIVERY_SCOPES.slice() : [];
  const telegramAllowlistDeliveryActive = telegramAllowlistDeliveryScopes.length > 0;
  const telegramOutboundEnabled =
    telegramConfigured && !telegramOutboundHardBreakActive && options.telegramOutboundEnabled === true;
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
    deliveryHardBreakActive: telegramOutboundHardBreakActive,
    allowlistDeliveryScopes: telegramAllowlistDeliveryScopes,
    inboundEnabled: telegramInboundEnabled,
    configuredTargets: targetMappings.length,
    pollTimeoutSeconds: options.telegramPollTimeoutSeconds,
    transport: telegramTransport,
    topicBindings: normalizeMessagingTopicBindings(options.telegramTopicBindings),
    commandCatalog: buildTelegramCommandCatalog({
      customCommands: listCustomCommands()
    }),
    nowFn,
    logDebug
  });
  adapters.push(telegramAdapter);
  const deliveryAdapterDescriptors = telegramConfigured
    ? Object.freeze([
        createDeliveryAdapterDescriptor({
          adapterId: "telegram",
          channel: "telegram",
          capabilities: ["send_message", "edit_message", "thread_topics"],
          metadata: {
            allowlistDeliveryActive: telegramAllowlistDeliveryActive,
            configuredTargets: targetMappings.length
          }
        })
      ])
    : Object.freeze([]);

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
    for (const adapter of adapters) {
      if (typeof adapter.replaceTopicBindings === "function") {
        adapter.replaceTopicBindings(normalizedBindings);
      }
    }
  }

  function buildAppSemanticAdapterDescriptorForSession(session, profile, strategy = "") {
    const appIdentity = session?.appIdentity || null;
    const appFamily =
      normalizeNonEmptyString(appIdentity?.family) ||
      (isCodingAgentContext(session, profile) ? "coding-agent" : "terminal-app");
    const appLabel =
      normalizeNonEmptyString(appIdentity?.label) ||
      normalizeNonEmptyString(session?.name) ||
      normalizeNonEmptyString(profile);
    return createAppSemanticAdapterDescriptor({
      adapterId: `${appFamily}-semantic-adapter`,
      appFamily,
      appLabels: appLabel ? [appLabel] : [],
      strategy,
      metadata: {
        profile,
        identitySource: normalizeNonEmptyString(appIdentity?.source),
        identityConfidence: Number.isFinite(appIdentity?.confidence) ? Number(appIdentity.confidence) : 0
      }
    });
  }

  function buildLegacyCodexMessageIntent({
    session,
    profile,
    state,
    trace,
    decision,
    deliveryScope,
    deliveredText,
    candidateKey,
    deliveryBlockKey,
    maxLength
  }) {
    const traceId = normalizeNonEmptyString(trace?.traceId);
    const projection = buildMessageIntentProjection(state, session, profile, {
      deliveryScope,
      candidateKey,
      deliveryBlockKey,
      firstObservedAt: Number.isInteger(decision?.firstObservedAt) ? decision.firstObservedAt : 0,
      lastObservedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : 0,
      traceId,
      projectionSource: "legacy-candidate-bridge"
    });
    const semanticAdapter = buildAppSemanticAdapterDescriptorForSession(session, profile, "legacy-codex-allowlist");
    const structuredText = deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE || /\n/u.test(deliveredText);
    if (deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE) {
      const replyState = state?.pendingCodexTelegramReply || null;
      const turn = createTurn({
        turnId: deliveryBlockKey || candidateKey || normalizeNonEmptyString(replyState?.correlationId) || traceId,
        sessionId: session.id,
        triggerKind: "submitted-input",
        inputSource: normalizeNonEmptyString(replyState?.source) || "legacy-reply-window",
        correlationId: normalizeNonEmptyString(replyState?.correlationId),
        traceId: normalizeNonEmptyString(replyState?.traceId) || traceId,
        openedAt:
          (Number.isInteger(replyState?.triggeredAt) && replyState.triggeredAt > 0
            ? replyState.triggeredAt
            : Number.isInteger(decision?.firstObservedAt) && decision.firstObservedAt > 0
              ? decision.firstObservedAt
              : nowFn()),
        closedAt:
          (Number.isInteger(decision?.lastObservedAt) && decision.lastObservedAt > 0 ? decision.lastObservedAt : nowFn()),
        status: "completed",
        metadata: {
          replyWindowMs: CODEX_TELEGRAM_REPLY_WINDOW_MS,
          legacyDeliveryScope: deliveryScope
        }
      });
      return createMessageIntent({
        intentId: deliveryBlockKey || candidateKey || normalizeNonEmptyString(replyState?.correlationId) || traceId,
        sessionId: session.id,
        intentKind: "reply",
        eventType: "session.output.summary",
        severity: "info",
        threadKey: "status",
        text: deliveredText,
        format: structuredText ? "structured_text" : "plain_text",
        comparableText: createComparableText(deliveredText),
        projection,
        turn,
        semanticAdapter,
        deliveryAdapters: deliveryAdapterDescriptors,
        routing: {
          threadKey: "status",
          priority: "primary"
        },
        metadata: {
          aggregationReason: deliveryScope,
          legacyDeliveryScope: deliveryScope,
          summaryMaxLength: maxLength,
          preserveStructuredSummary: structuredText
        }
      });
    }
    const outputEpisode = createOutputEpisode({
      episodeId: deliveryBlockKey || candidateKey || traceId,
      sessionId: session.id,
      episodeKind: "autonomous-output",
      sourceProjectionId: projection.projectionId,
      startedAt:
        (Number.isInteger(decision?.firstObservedAt) && decision.firstObservedAt > 0 ? decision.firstObservedAt : nowFn()),
      completedAt:
        (Number.isInteger(decision?.lastObservedAt) && decision.lastObservedAt > 0 ? decision.lastObservedAt : nowFn()),
      status: "completed",
      metadata: {
        legacyDeliveryScope: deliveryScope,
        candidateKey
      }
    });
    return createMessageIntent({
      intentId: deliveryBlockKey || candidateKey || traceId,
      sessionId: session.id,
      intentKind: "autonomous-update",
      eventType: "session.output.summary",
      severity: "info",
      threadKey: "status",
      text: deliveredText,
      format: structuredText ? "structured_text" : "plain_text",
      comparableText: createComparableText(deliveredText),
      projection,
      outputEpisode,
      semanticAdapter,
      deliveryAdapters: deliveryAdapterDescriptors,
      routing: {
        threadKey: "status",
        priority: "secondary"
      },
      metadata: {
        aggregationReason: deliveryScope,
        legacyDeliveryScope: deliveryScope,
        summaryMaxLength: maxLength,
        preserveStructuredSummary: structuredText
      }
    });
  }

  function createEventFromMessageIntent({ session, profile, trace, intent }) {
    const summaryMaxLength =
      Number.isInteger(intent?.metadata?.summaryMaxLength) && intent.metadata.summaryMaxLength > 0
        ? intent.metadata.summaryMaxLength
        : MAX_EVENT_SUMMARY_LENGTH;
    const preserveStructuredSummary =
      intent?.format === "structured_text" || intent?.metadata?.preserveStructuredSummary === true;
    return createEvent({
      session,
      profile,
      type: normalizeNonEmptyString(intent?.eventType) || "session.output.summary",
      summary: intent?.text || "",
      severity: normalizeNonEmptyString(intent?.severity) || "info",
      threadKey: normalizeNonEmptyString(intent?.threadKey) || "status",
      trace,
      nowFn,
      aggregationReason: normalizeNonEmptyString(intent?.metadata?.aggregationReason) || normalizeNonEmptyString(intent?.intentKind),
      deliveryScope: normalizeNonEmptyString(intent?.metadata?.legacyDeliveryScope),
      comparableText: normalizeNonEmptyString(intent?.comparableText) || createComparableText(intent?.text || ""),
      deliveryBlockKey:
        normalizeNonEmptyString(intent?.turn?.turnId) ||
        normalizeNonEmptyString(intent?.outputEpisode?.episodeId) ||
        normalizeNonEmptyString(intent?.projection?.projectionId),
      summaryMaxLength,
      preserveStructuredSummary,
      messageIntent: intent
    });
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
  replaceCodexRestartResendLedger(options.codexRestartResendLedger);

  function pruneCodexRestartResendLedger() {
    const cutoff = nowFn() - CODEX_SUMMARY_RESTART_RESEND_LEDGER_TTL_MS;
    const orderedEntries = Array.from(codexRestartResendLedger.values()).sort((left, right) => left.deliveredAt - right.deliveredAt);
    for (const entry of orderedEntries) {
      if (entry.deliveredAt >= cutoff) {
        break;
      }
      codexRestartResendLedger.delete(entry.key);
    }
    const remainingEntries = Array.from(codexRestartResendLedger.values()).sort((left, right) => left.deliveredAt - right.deliveredAt);
    if (remainingEntries.length <= CODEX_SUMMARY_RESTART_RESEND_LEDGER_MAX_ENTRIES) {
      return;
    }
    const removeCount = remainingEntries.length - CODEX_SUMMARY_RESTART_RESEND_LEDGER_MAX_ENTRIES;
    for (let index = 0; index < removeCount; index += 1) {
      codexRestartResendLedger.delete(remainingEntries[index].key);
    }
  }

  function replaceCodexRestartResendLedger(entries = []) {
    codexRestartResendLedger.clear();
    for (const entry of normalizeCodexRestartResendLedgerEntries(entries)) {
      codexRestartResendLedger.set(entry.key, entry);
    }
    pruneCodexRestartResendLedger();
  }

  async function syncTelegramCommandCatalog(trace = null) {
    if (!telegramConfigured || typeof telegramAdapter.syncCommands !== "function") {
      return {
        synced: false,
        reason: "disabled"
      };
    }
    const result = await telegramAdapter.syncCommands(
      buildTelegramCommandCatalog({
        customCommands: listCustomCommands()
      })
    );
    if (!result?.synced && result?.error) {
      logDebug(
        "messaging.telegram.command_sync",
        {
          ok: false,
          error: result.error,
          publishedCommandCount: result.publishedCommandCount || 0,
          skippedCommandCount: result.skippedCommandCount || 0
        },
        trace
      );
    } else {
      logDebug(
        "messaging.telegram.command_sync",
        {
          ok: result?.synced === true,
          publishedCommandCount: result?.publishedCommandCount || 0,
          skippedCommandCount: result?.skippedCommandCount || 0,
          reason: normalizeNonEmptyString(result?.reason)
        },
        trace
      );
    }
    return result;
  }

  async function upsertCodexRestartResendLedgerEntry(entry) {
    const normalizedEntry = normalizeCodexRestartResendLedgerEntry(entry);
    if (!normalizedEntry) {
      return;
    }
    const existingEntry = codexRestartResendLedger.get(normalizedEntry.key) || null;
    if (
      existingEntry &&
      existingEntry.deliveredAt === normalizedEntry.deliveredAt &&
      existingEntry.comparableText === normalizedEntry.comparableText
    ) {
      return;
    }
    codexRestartResendLedger.set(normalizedEntry.key, normalizedEntry);
    pruneCodexRestartResendLedger();
    await onCodexRestartResendLedgerUpsert(normalizedEntry);
  }

  function getOrCreateCodexSummaryRestartRecoveryState(sessionId) {
    const normalizedSessionId = normalizeNonEmptyString(sessionId);
    let state = codexSummaryRestartRecoveryStates.get(normalizedSessionId);
    if (state) {
      return state;
    }
    state = createCodexSummaryRestartRecoveryState(nowFn());
    codexSummaryRestartRecoveryStates.set(normalizedSessionId, state);
    return state;
  }

  function markSessionCodexSummaryRestartRecovery(sessionId) {
    const normalizedSessionId = normalizeNonEmptyString(sessionId);
    if (!normalizedSessionId) {
      return;
    }
    codexSummaryRestartRecoveryStates.set(normalizedSessionId, createCodexSummaryRestartRecoveryState(nowFn()));
  }

  function observeSessionInput(sessionId, trace = null) {
    const normalizedSessionId = normalizeNonEmptyString(sessionId);
    if (!normalizedSessionId) {
      return;
    }
    const streamState = getOrCreateSessionState(normalizedSessionId);
    const observedAt = nowFn();
    const normalizedInputText = normalizeReplyPromotionInputText(trace?.replyInputText);
    if (normalizedInputText) {
      streamState.lastObservedInputText = normalizedInputText;
      streamState.lastObservedInputAt = observedAt;
    }
    if (isReplyPromotionEligibleTrace(trace)) {
      const carriedInputText =
        normalizedInputText ||
        (observedAt - streamState.lastObservedInputAt <= CODEX_TELEGRAM_REPLY_INPUT_CARRYOVER_WINDOW_MS
          ? streamState.lastObservedInputText
          : "");
      streamState.pendingCodexTelegramReply = {
        active: true,
        triggeredAt: observedAt,
        traceId: normalizeNonEmptyString(trace?.traceId),
        correlationId: normalizeNonEmptyString(trace?.correlationId),
        source: normalizeNonEmptyString(trace?.source),
        replyPreferred: isReplyPreferredTelegramTrace(trace),
        inputText: carriedInputText,
        preInputPendingLine: normalizeWhitespace(streamState.pendingLine),
        preInputRecentLines: streamState.recentLines.slice(-MAX_RECENT_LINES),
        started: false,
        firstLineAt: 0,
        lastLineAt: 0,
        lines: []
      };
      logDebug(
        "messaging.telegram_reply_window",
        {
          sessionId: normalizedSessionId,
          active: true,
          traceId: normalizeNonEmptyString(trace?.traceId),
          correlationId: normalizeNonEmptyString(trace?.correlationId),
          traceSource: normalizeNonEmptyString(trace?.source),
          replyPreferred: isReplyPreferredTelegramTrace(trace)
        },
        trace
      );
    }
    const state = codexSummaryRestartRecoveryStates.get(normalizedSessionId);
    if (!state) {
      return;
    }
    state.lastInputAt = observedAt;
    if (!Number.isInteger(state.firstInputAt) || state.firstInputAt <= 0) {
      state.firstInputAt = observedAt;
      logDebug("messaging.summary_restart_recovery.input_observed", { sessionId: normalizedSessionId }, trace);
    }
  }

  function prepareForRuntimeStart() {
    runtimeReadyAt = 0;
    codexSummaryRestartRecoveryQuietUntil = 0;
    codexSummaryRestartRecoveryStates.clear();
  }

  function markRuntimeReady() {
    runtimeReadyAt = nowFn();
    codexSummaryRestartRecoveryQuietUntil = runtimeReadyAt + codexSummaryRestartRecoveryQuietMs;
  }

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
    state = createMessagingThreadPolicyState();
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

  function getSessionGeometry(session) {
    return Object.freeze({
      cols: Number.isInteger(session?.cols) && session.cols > 0 ? session.cols : 80,
      rows: Number.isInteger(session?.rows) && session.rows > 0 ? session.rows : 24
    });
  }

  function ensureTerminalProjection(state, session) {
    if (state?.terminalProjection) {
      return state.terminalProjection;
    }
    const geometry = getSessionGeometry(session);
    state.terminalProjection = createTerminalProjectionTracker({
      sessionId: normalizeNonEmptyString(session?.id),
      resourceLimits: {
        ...DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS,
        cols: geometry.cols,
        rows: geometry.rows
      }
    });
    return state.terminalProjection;
  }

  function captureTerminalProjectionSnapshot(sessionId) {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    return state?.terminalProjection?.captureSnapshot() || null;
  }

  function createTerminalProjectionBaselineForSession(sessionId, label = "") {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    return state?.terminalProjection?.createBaseline(label) || null;
  }

  function getTerminalProjectionTranscriptDelta(sessionId, sinceRevision = 0) {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    return state?.terminalProjection?.getTranscriptDelta(sinceRevision) || null;
  }

  function diffTerminalProjectionBaselineForSession(sessionId, baseline, options = {}) {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    return state?.terminalProjection?.diffFromBaseline(baseline, options) || null;
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
        deliveryScope: normalizeNonEmptyString(entry?.deliveryScope),
        deliveryBlockKey: normalizeNonEmptyString(entry?.deliveryBlockKey),
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
      normalizeNonEmptyString(event?.deliveryBlockKey),
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
      deliveryScope: event?.deliveryScope,
      deliveryBlockKey: event?.deliveryBlockKey,
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
        deliveryScope: event?.deliveryScope || "",
        deliveryBlockKey: event?.deliveryBlockKey || "",
        noiseClass: event?.noiseClass || "",
        targetChatId: target?.chatId || null,
        targetThreadId: Number.isInteger(target?.messageThreadId) ? target.messageThreadId : null,
        delivery
      },
      event?.trace || null
    );
  }

  function buildCodexSummaryRestartResendLedgerEntry(event, target) {
    const key = buildCodexRestartResendLedgerKey({
      deliveryScope: event?.deliveryScope,
      sessionId: event?.sessionId,
      target,
      comparableText: event?.comparableText
    });
    if (!key) {
      return null;
    }
    return {
      key,
      deliveryScope: normalizeNonEmptyString(event?.deliveryScope),
      sessionId: normalizeNonEmptyString(event?.sessionId),
      chatId: normalizeNonEmptyString(target?.chatId),
      ...(Number.isInteger(target?.messageThreadId) ? { messageThreadId: target.messageThreadId } : {}),
      targetStateKey: buildCodexRestartResendTargetStateKey(target, event?.sessionId),
      comparableText: normalizeNonEmptyString(event?.comparableText),
      deliveredAt: Number.isInteger(event?.occurredAt) ? event.occurredAt : nowFn()
    };
  }

  function buildCodexSummaryRestartRecoveryDecision(event, target) {
    if (normalizeNonEmptyString(event?.deliveryScope) !== CODEX_SEPARATOR_SUMMARY_SCOPE) {
      return null;
    }
    const recoveryState = codexSummaryRestartRecoveryStates.get(normalizeNonEmptyString(event?.sessionId)) || null;
    if (!recoveryState?.active) {
      return null;
    }
    const occurredAt = Number.isInteger(event?.occurredAt) ? event.occurredAt : nowFn();
    if (!runtimeReadyAt || occurredAt < runtimeReadyAt) {
      return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "summary_restart_recovery_pre_ready" });
    }
    if (codexSummaryRestartRecoveryQuietUntil > occurredAt) {
      return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "summary_restart_recovery_quiet_window" });
    }
    if (
      !Number.isInteger(recoveryState.lastInputAt) ||
      recoveryState.lastInputAt <= 0 ||
      recoveryState.lastInputAt < codexSummaryRestartRecoveryQuietUntil
    ) {
      return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "summary_restart_recovery_waiting_for_input" });
    }
    const ledgerEntry = buildCodexSummaryRestartResendLedgerEntry(event, target);
    if (ledgerEntry && codexRestartResendLedger.has(ledgerEntry.key)) {
      return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "summary_restart_recovery_prior_history" });
    }
    recoveryState.active = false;
    return null;
  }

  function clearPendingCodexTelegramReply(state) {
    if (!state || typeof state !== "object") {
      return;
    }
    state.pendingCodexTelegramReply = createPendingCodexTelegramReply();
  }

  function buildCodexTelegramReplyDecision(state) {
    const replyState = state?.pendingCodexTelegramReply;
    if (!replyState?.active || !replyState.started || !Array.isArray(replyState.lines) || replyState.lines.length === 0) {
      return null;
    }
    const text = normalizeCodexTelegramReplyText(replyState.lines);
    if (!text) {
      return null;
    }
    const wordCount = text.split(/\s+/u).filter(Boolean).length;
    if (text.length < CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH || wordCount < CODEX_TELEGRAM_REPLY_MIN_WORDS) {
      return null;
    }
    const deliveryBlockKey = buildCodexTelegramReplyDeliveryBlockKey(replyState);
    return {
      family: CODEX_TELEGRAM_REPLY_SCOPE,
      text,
      key: `${deliveryBlockKey || "telegram_reply"}:${text}`,
      deliveryBlockKey
    };
  }

  async function maybeDispatchPendingCodexTelegramReply(session, profile, state, trace) {
    const decision = buildCodexTelegramReplyDecision(state);
    clearPendingCodexTelegramReply(state);
    if (!decision) {
      return null;
    }
    return dispatchCodexAllowlistCandidate(session, profile, state, trace, decision);
  }

  async function observeCodexTelegramReplyLine(session, profile, state, trace, visibleLine) {
    const replyState = state?.pendingCodexTelegramReply;
    if (!replyState?.active) {
      return false;
    }
    const observedAt = nowFn();
    if (!isCodexTelegramReplyActive(replyState, observedAt)) {
      clearPendingCodexTelegramReply(state);
      return false;
    }
    if (!isCodingAgentContext(session, profile)) {
      clearPendingCodexTelegramReply(state);
      return false;
    }
    if (!visibleLine) {
      if (replyState.started) {
        await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      }
      return false;
    }
    if (!replyState.started) {
      const sanitizedStartLine = sanitizeCodexTelegramReplyStartLine(visibleLine, replyState);
      if (isLikelyStaleCodexReplyStart(sanitizedStartLine, replyState)) {
        return false;
      }
      if (shouldIgnoreCodexTelegramReplyStart(sanitizedStartLine, session, profile)) {
        return false;
      }
      replyState.started = true;
      replyState.firstLineAt = observedAt;
      replyState.lastLineAt = observedAt;
      replyState.lines = [sanitizedStartLine];
      return true;
    }
    if (isCodexTelegramReplyBoundaryLine(visibleLine, session, profile)) {
      await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      return false;
    }
    replyState.lines.push(visibleLine);
    replyState.lastLineAt = observedAt;
    if (
      replyState.lines.length >= CODEX_TELEGRAM_REPLY_MAX_LINES ||
      normalizeCodexTelegramReplyText(replyState.lines).length >= CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH
    ) {
      await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
    }
    return true;
  }

  function buildMessageIntentProjection(state, session, profile, metadata = {}) {
    const snapshot = state?.terminalProjection?.captureSnapshot() || null;
    return createTerminalProjection({
      sessionId: session.id,
      projectionId:
        (snapshot ? `projection:${session.id}:${snapshot.revision}` : "") || `projection:${session.id}:${nowFn()}`,
      transport: "pty",
      representation: snapshot ? "screen-buffer" : "legacy-stream-candidate",
      sourceRevision: snapshot ? String(snapshot.revision) : "",
      appFamily: normalizeNonEmptyString(session?.appIdentity?.family),
      appLabel: normalizeNonEmptyString(session?.appIdentity?.label),
      profile,
      metadata: {
        activeBufferType: snapshot?.activeBufferType || "",
        cols: Number.isInteger(snapshot?.cols) ? snapshot.cols : 0,
        rows: Number.isInteger(snapshot?.rows) ? snapshot.rows : 0,
        ...metadata
      }
    });
  }

  async function dispatchCodexAllowlistCandidate(session, profile, state, trace, decision) {
    const deliveryScope = normalizeNonEmptyString(decision?.family);
    const maxLength =
      deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE
        ? CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH
        :
      deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE
        ? CODEX_SEPARATOR_SECTION_MAX_TEXT_LENGTH
        : deliveryScope === CODEX_SEPARATOR_SUMMARY_SCOPE
          ? CODEX_SEPARATOR_SUMMARY_MAX_TEXT_LENGTH
          : CODEX_SEPARATOR_INFO_MAX_TEXT_LENGTH;
    const normalizedText = truncateDisplayText(decision?.text, maxLength);
    const deliveredText =
      deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE
        ? truncateStructuredMessageText(decision?.text, maxLength)
        : normalizedText;
    const candidateKey = normalizeNonEmptyString(decision?.key);
    const deliveryBlockKey = buildCodexSeparatorDeliveryBlockKey(decision);
    const lastCandidateKey =
      deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE
        ? state.lastCodexSeparatorSectionCandidateKey
        : deliveryScope === CODEX_SEPARATOR_SUMMARY_SCOPE
          ? state.lastCodexSeparatorSummaryCandidateKey
          : deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE
            ? state.lastCodexTelegramReplyCandidateKey
          : state.lastCodexSeparatorCandidateKey;
    if (!deliveredText || candidateKey === lastCandidateKey) {
      return null;
    }
    const target = resolveTarget(session);
    const messageIntent = buildLegacyCodexMessageIntent({
      session,
      profile,
      state,
      trace,
      decision,
      deliveryScope,
      deliveredText,
      candidateKey,
      deliveryBlockKey,
      maxLength
    });
    const event = createEventFromMessageIntent({
      session,
      profile,
      trace,
      intent: messageIntent
    });
    if (isCommentaryLikeCodexOutboundText(deliveredText, session, profile)) {
      const commentaryDecision = Object.freeze({
        action: "suppress",
        messageKey: event.threadKey,
        reason: "commentary_progress_chatter"
      });
      bumpEventMetric(event.profile, event.type, commentaryDecision.action);
      recordDispatchTrace(event, commentaryDecision, target, []);
      return Object.freeze({
        ...commentaryDecision,
        delivered: false,
        delivery: []
      });
    }
    if (
      deliveryScope !== CODEX_TELEGRAM_REPLY_SCOPE &&
      isCodexTelegramReplyActive(state?.pendingCodexTelegramReply, event.occurredAt)
    ) {
      if (deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE) {
        state.lastCodexSeparatorSectionCandidateKey = candidateKey;
      } else if (deliveryScope === CODEX_SEPARATOR_SUMMARY_SCOPE) {
        state.lastCodexSeparatorSummaryCandidateKey = candidateKey;
      } else {
        state.lastCodexSeparatorCandidateKey = candidateKey;
      }
      const replyPriorityDecision = Object.freeze({
        action: "suppress",
        messageKey: event.threadKey,
        reason: "telegram_reply_window_priority"
      });
      bumpEventMetric(event.profile, event.type, replyPriorityDecision.action);
      recordDispatchTrace(event, replyPriorityDecision, target, []);
      return Object.freeze({
        ...replyPriorityDecision,
        delivered: false,
        delivery: []
      });
    }
    const restartRecoveryDecision = buildCodexSummaryRestartRecoveryDecision(event, target);
    if (restartRecoveryDecision) {
      bumpEventMetric(event.profile, event.type, restartRecoveryDecision.action);
      recordDispatchTrace(event, restartRecoveryDecision, target, []);
      return Object.freeze({
        ...restartRecoveryDecision,
        delivered: false,
        delivery: []
      });
    }
    const dispatchResult = await dispatchEvent(event);
    if (dispatchResult?.delivered === true) {
      if (deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE) {
        state.lastCodexSeparatorSectionCandidateKey = candidateKey;
      } else if (deliveryScope === CODEX_SEPARATOR_SUMMARY_SCOPE) {
        state.lastCodexSeparatorSummaryCandidateKey = candidateKey;
      } else if (deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE) {
        state.lastCodexTelegramReplyCandidateKey = candidateKey;
      } else {
        state.lastCodexSeparatorCandidateKey = candidateKey;
      }
    }
    return dispatchResult;
  }

  function buildCodexSummaryAllowlistDecision(session, profile, block, summary, aggregationReason) {
    if (aggregationReason !== "separator_hint" || !isCodexAppIdentity(session) || !isCodingAgentContext(session, profile)) {
      return null;
    }
    const evaluated = evaluateCodexSeparatorSummaryCandidate(summary, {
      aggregationReason,
      blockKey: Array.isArray(block?.signatures) ? block.signatures.filter(Boolean).join("|") : "",
      firstObservedAt: block?.firstObservedAt,
      lastObservedAt: block?.lastObservedAt
    });
    return evaluated?.ok ? evaluated : null;
  }

  async function advanceCodexAllowlistCandidate(session, profile, state, trace, entry, { flush = false } = {}) {
    if (!isCodexAppIdentity(session) || !isCodingAgentContext(session, profile)) {
      state.codexSeparatorCandidate = null;
      state.codexSeparatorSectionCandidate = null;
      clearPendingCodexSeparatorInfoDecision(state);
      return null;
    }
    const decisions = [
      ...advanceCodexSeparatorSectionState(state, entry, { flush }),
      ...advanceCodexSeparatorInfoState(state, entry, { flush })
    ];
    const sectionResolutions = new Map();
    for (const decision of decisions) {
      if (!decision) {
        continue;
      }
      const family = normalizeNonEmptyString(decision.family);
      const blockKey = getCodexAllowlistDecisionBlockKey(decision);

      if (family === CODEX_SEPARATOR_SECTION_SCOPE && decision.type === "rejection") {
        if (blockKey) {
          sectionResolutions.set(blockKey, normalizeNonEmptyString(decision.reason));
        }
        const pending = state.pendingCodexSeparatorInfoDecision;
        if (pending && getCodexAllowlistDecisionBlockKey(pending) === blockKey) {
          clearPendingCodexSeparatorInfoDecision(state);
          if (shouldDispatchPendingCodexInfoAfterSectionRejection(decision.reason)) {
            await dispatchCodexAllowlistCandidate(session, profile, state, trace, pending);
          }
        }
        continue;
      }

      if (family === CODEX_SEPARATOR_SECTION_SCOPE && decision.type === "candidate") {
        if (blockKey) {
          sectionResolutions.set(blockKey, "section_candidate");
        }
        const pending = state.pendingCodexSeparatorInfoDecision;
        if (pending && getCodexAllowlistDecisionBlockKey(pending) === blockKey) {
          clearPendingCodexSeparatorInfoDecision(state);
        }
      }

      if (family === CODEX_SEPARATOR_INFO_SCOPE && decision.type === "candidate") {
        const sectionResolution = blockKey ? sectionResolutions.get(blockKey) : "";
        if (sectionResolution === "section_candidate") {
          continue;
        }
        if (sectionResolution) {
          if (shouldDispatchPendingCodexInfoAfterSectionRejection(sectionResolution)) {
            await dispatchCodexAllowlistCandidate(session, profile, state, trace, decision);
          }
          continue;
        }
        if (hasActiveSectionOwnershipForInfoDecision(state, decision)) {
          state.pendingCodexSeparatorInfoDecision = decision;
          continue;
        }
      }

      if (decision?.type !== "candidate" || !decision.text || !decision.key) {
        continue;
      }
      await dispatchCodexAllowlistCandidate(session, profile, state, trace, decision);
    }
    return null;
  }

  async function flushPendingSummaryBlock(session, profile, state, trace, aggregationReason) {
    const block = state?.pendingSummaryBlock;
    if (!block || !Array.isArray(block.fragments) || block.fragments.length === 0) {
      return null;
    }
    const summary = truncateSummary(block.fragments.join(" | "));
    const codexAllowlistDecision = buildCodexSummaryAllowlistDecision(session, profile, block, summary, aggregationReason);
    state.pendingSummaryBlock = createPendingSummaryBlock();
    state.recentLines = [];
    if (!summary) {
      return null;
    }
    if (codexAllowlistDecision) {
      return dispatchCodexAllowlistCandidate(session, profile, state, trace, codexAllowlistDecision);
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
      return Object.freeze({
        ...decision,
        delivered: false,
        delivery: []
      });
    }
    advanceMessagingThreadPolicyState(threadState, event, decision, { delivered: false });
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
      advanceMessagingThreadPolicyState(threadState, event, decision, { delivered: true });
      if (normalizeNonEmptyString(event?.deliveryScope) === CODEX_SEPARATOR_SUMMARY_SCOPE) {
        const ledgerEntry = buildCodexSummaryRestartResendLedgerEntry(event, finalTarget);
        if (ledgerEntry) {
          await upsertCodexRestartResendLedgerEntry(ledgerEntry);
        }
      }
    }
    rememberSessionForTarget(finalTarget, event.session);
    recordDispatchTrace(event, decision, finalTarget, deliveryResults);
    return Object.freeze({
      ...decision,
      delivered,
      delivery: deliveryResults
    });
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
      if (!runtimeReadyAt && isCodingAgentContext(session, profile)) {
        markSessionCodexSummaryRestartRecovery(session.id);
      }
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
      codexSummaryRestartRecoveryStates.delete(normalizeNonEmptyString(session?.id));
      state.lastLifecycleType = type;
      await advanceCodexAllowlistCandidate(session, profile, state, trace, null, { flush: true });
      await flushPendingSummaryBlock(session, profile, state, trace, "lifecycle_exit");
      state.terminalProjection = null;
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
      codexSummaryRestartRecoveryStates.delete(normalizeNonEmptyString(session?.id));
      state.lastLifecycleType = type;
      await advanceCodexAllowlistCandidate(session, profile, state, trace, null, { flush: true });
      await flushPendingSummaryBlock(session, profile, state, trace, "lifecycle_closed");
      state.terminalProjection = null;
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
    const terminalProjection = ensureTerminalProjection(state, session);
    const chunk = typeof data === "string" ? data : String(data ?? "");
    const normalizedPromptBoundaries = Array.from(
      new Set(
        (Array.isArray(promptBoundaries) ? promptBoundaries : [])
          .map((entry) => (Number.isInteger(entry) && entry >= 0 && entry <= chunk.length ? entry : null))
          .filter((entry) => entry !== null)
      )
    ).sort((left, right) => left - right);
    if (chunk || normalizedPromptBoundaries.length > 0) {
      const geometry = getSessionGeometry(session);
      await terminalProjection.observeData(chunk, {
        observedAt: nowFn(),
        promptBoundaries: normalizedPromptBoundaries,
        cols: geometry.cols,
        rows: geometry.rows
      });
    }
    async function dispatchPromptReady() {
      await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
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
      const replyVisibleLine = sanitizeCodexTelegramReplyLineCandidate(line, session, profile);
      if (await observeCodexTelegramReplyLine(session, profile, state, trace, replyVisibleLine)) {
        pushRecentLine(state, replyVisibleLine);
        return;
      }
      const visibleLine = sanitizeMessageCandidate(line, session, profile);
      if (!visibleLine) {
        return;
      }
      if (shouldDeferLineClassificationToCodexSectionAssembly(session, profile, state, visibleLine)) {
        pushRecentLine(state, visibleLine);
        return;
      }
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
      if (normalizedPromptBoundaries.length > 0 && isCodexAppIdentity(session)) {
        await advanceCodexAllowlistCandidate(
          session,
          profile,
          state,
          trace,
          createCodexStreamEntry(state, "", normalizedPromptBoundaries, nowFn())
        );
      }
      for (const _boundary of normalizedPromptBoundaries) {
        await dispatchPromptReady();
      }
      return;
    }
    if (isCodexAppIdentity(session)) {
      await advanceCodexAllowlistCandidate(
        session,
        profile,
        state,
        trace,
        createCodexStreamEntry(state, chunk, normalizedPromptBoundaries, nowFn())
      );
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
    await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
    await advanceCodexAllowlistCandidate(session, profile, state, trace, null, { flush: true });
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
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "unmapped" }), null);
      return result;
    }
    if (inboundResolution.error === "ambiguous") {
      const result = {
        ok: false,
        callbackText: "Ambiguous mapping.",
        text: "This Telegram chat matches multiple ptydeck messaging targets. Narrow the mapping before using inbound actions."
      };
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "ambiguous" }), null);
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
        logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "resolve_failed" }), null);
        return result;
      }
    }
    if (!session || !normalizeNonEmptyString(session.id)) {
      const result = {
        ok: false,
        callbackText: "Session unavailable.",
        text: "Mapped ptydeck session is unavailable."
      };
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "session_missing" }), null);
      return result;
    }

    const action = normalizeNonEmptyString(request.command?.action || request.action).toLowerCase();
    const trace = buildInboundTrace(request, session.id);
    if (action === "input" && !/^\s*\//u.test(normalizeNonEmptyString(request.text))) {
      trace.replyEligible = true;
    }
    const profile = resolveMessagingTriggerProfile(session, target);

    try {
      if (action === "input") {
        const payload = normalizeMessagingInboundInputPayload(request.text);
        if (!payload) {
          const result = {
            ok: false,
            callbackText: "Input rejected.",
            text: "Telegram text input was empty after normalization."
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "empty_input" }),
            trace
          );
          return result;
        }
        await requestMessagingSendInput(session.id, payload, {
          trace,
          sessionSnapshot: session,
          target,
          preview: request.preview || request.text || ""
        });
        const result = {
          ok: true,
          callbackText: "Input sent.",
          text: truncateResponseText(`Input sent to ${buildSessionLabel(session)}.`)
        };
        logDebug(
          "messaging.inbound.action",
          buildInboundLogDetails(request, { sessionId: session.id, ok: true, inputLength: payload.length }),
          trace
        );
        return result;
      }

      if (action === "status") {
        const result = {
          ok: true,
          callbackText: "Status ready.",
          text: buildInboundStatusText(session, profile)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
        return result;
      }

      if (action === "stop") {
        if (session.state !== "running" && session.state !== "starting") {
          const result = {
            ok: true,
            callbackText: "Already stopped.",
            text: truncateResponseText(`${buildSessionLabel(session)} is already stopped.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, idempotent: true }), trace);
          return result;
        }
        await requestMessagingStop(session.id, { trace });
        const result = {
          ok: true,
          callbackText: "Stop requested.",
          text: truncateResponseText(`Stop requested for ${buildSessionLabel(session)}.`)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
        return result;
      }

      if (action === "retry") {
        if (resolvedLiveSession && (session.state === "running" || session.state === "starting")) {
          const result = {
            ok: false,
            callbackText: "Retry unavailable.",
            text: truncateResponseText(`Retry is unavailable while ${buildSessionLabel(session)} is ${session.state}.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "running" }), trace);
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
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
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
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, selector }), trace);
        return result;
      }

      if (action === "custom") {
        const customCommandName = normalizeNonEmptyString(request.command?.customCommandName);
        const customCommand = resolveCustomCommandForSession(listCustomCommands(), customCommandName, session.id);
        if (!customCommand) {
          const result = {
            ok: false,
            callbackText: "Custom command unavailable.",
            text: truncateResponseText(`Custom command /${customCommandName || "unknown"} is unavailable for ${buildSessionLabel(session)}.`)
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_missing" }),
            trace
          );
          return result;
        }
        const invocation = parseCustomCommandInvocation(
          normalizeInboundCustomInvocationText(
            normalizeNonEmptyString(request.text) || `/${request.command?.telegramCommand || customCommand.name}`,
            customCommand.name
          ),
          customCommand
        );
        if (!invocation?.ok) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(invocation?.error || `Custom command /${customCommand.name} is invalid.`)
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_invalid" }),
            trace
          );
          return result;
        }
        if (normalizeNonEmptyString(invocation.targetSelector)) {
          const result = {
            ok: false,
            callbackText: "Target redirect rejected.",
            text: truncateResponseText(
              `Telegram custom commands cannot redirect to another target. Use the mapped topic for /${customCommand.name}.`
            )
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_target_redirect" }),
            trace
          );
          return result;
        }
        const rendered = renderCustomCommandForSession(
          customCommand,
          session,
          resolveDeckForSession(session),
          invocation.parameterAssignments || {}
        );
        if (!rendered?.ok) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(rendered?.error || `Custom command /${customCommand.name} is invalid.`)
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_render_failed" }),
            trace
          );
          return result;
        }
        const payload = normalizeMessagingInboundInputPayload(normalizeCustomCommandPayloadForShell(rendered.text));
        if (!payload) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(`Custom command /${customCommand.name} resolved to empty terminal input.`)
          };
          logDebug(
            "messaging.inbound.action",
            buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_empty" }),
            trace
          );
          return result;
        }
        await requestMessagingSendInput(session.id, payload, {
          trace,
          sessionSnapshot: session,
          target,
          preview: request.preview || request.text || ""
        });
        const result = {
          ok: true,
          callbackText: "Custom command sent.",
          text: truncateResponseText(`Custom command /${customCommand.name} sent to ${buildSessionLabel(session)}.`)
        };
        logDebug(
          "messaging.inbound.action",
          buildInboundLogDetails(request, { sessionId: session.id, ok: true, customCommandName: customCommand.name }),
          trace
        );
        return result;
      }

      const result = {
        ok: false,
        callbackText: "Unsupported action.",
        text: "Unsupported messaging action. Use status, stop, retry, replay, or a published custom command."
      };
      logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "unsupported" }), trace);
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
      logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, statusCode }), trace);
      return result;
    }
  }

  async function start() {
    await syncTelegramCommandCatalog();
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
    const recoveringSessionCount = Array.from(codexSummaryRestartRecoveryStates.values()).filter((entry) => entry?.active).length;
    const activeReplySessionCount = Array.from(sessionStates.values()).filter((entry) => isCodexTelegramReplyActive(entry?.pendingCodexTelegramReply, nowFn())).length;
    const activeProjectionSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.terminalProjection).length;
    return {
      enabled: telegramConfigured,
      deliveryEnabled: telegramOutboundEnabled,
      deliveryHardBreakActive: telegramOutboundHardBreakActive,
      allowlistDeliveryActive: telegramAllowlistDeliveryActive,
      allowlistDeliveryScopes: telegramAllowlistDeliveryScopes.slice(),
      codexTelegramReplyCorrelation: {
        windowMs: CODEX_TELEGRAM_REPLY_WINDOW_MS,
        activeSessionCount: activeReplySessionCount
      },
      terminalMessagingCore: {
        active: true,
        bridgeMode: "legacy-candidate-to-message-intent",
        deliveryAdapters: deliveryAdapterDescriptors.map((descriptor) => descriptor.adapterId),
        activeProjectionSessionCount,
        projectionResourceLimits: DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS,
        boundaryContracts: [
          "TerminalProjection",
          "Turn",
          "OutputEpisode",
          "MessageIntent",
          "DeliveryAdapter",
          "AppSemanticAdapter"
        ]
      },
      codexSummaryRestartRecovery: {
        quietPeriodMs: codexSummaryRestartRecoveryQuietMs,
        quietMsRemaining:
          runtimeReadyAt > 0 && codexSummaryRestartRecoveryQuietUntil > 0
            ? Math.max(0, codexSummaryRestartRecoveryQuietUntil - nowFn())
            : 0,
        runtimeReadyAt,
        activeSessionCount: recoveringSessionCount,
        ledgerSize: codexRestartResendLedger.size
      },
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
    syncTelegramCommandCatalog,
    prepareForRuntimeStart,
    markRuntimeReady,
    replaceCodexRestartResendLedger,
    observeSessionInput,
    replaceTelegramTopicBindings,
    ensureSessionTarget,
    observeSessionLifecycle,
    observeSessionData,
    observeSessionIdle,
    observeShareChange,
    captureTerminalProjectionSnapshot,
    createTerminalProjectionBaseline: createTerminalProjectionBaselineForSession,
    getTerminalProjectionTranscriptDelta,
    diffTerminalProjectionBaseline: diffTerminalProjectionBaselineForSession,
    buildStatusSummary,
    renderMetricLines
  };
}
