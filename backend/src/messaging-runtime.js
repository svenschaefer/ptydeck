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
import { createDiscordAdapter, createDiscordTransport } from "./discord-adapter.js";
import { createAppSemanticAdapterRegistry } from "./app-semantic-adapters.js";
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
const DEFAULT_TERMINAL_ORCHESTRATION_BOUNDARY_SETTLE_MS = 350;
const CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH = 24;
const CODEX_TELEGRAM_REPLY_MIN_WORDS = 5;
const CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH = 1200;
const CODEX_TELEGRAM_REPLY_MAX_LINES = 8;
const TURN_PRIMARY_REPLY_DELIVERY_SIGNAL = "turn-primary-reply";
const OUTPUT_EPISODE_INFO_DELIVERY_SIGNAL = "output-episode-info";
const OUTPUT_EPISODE_SECTION_DELIVERY_SIGNAL = "output-episode-section";
const OUTPUT_EPISODE_SUMMARY_DELIVERY_SIGNAL = "output-episode-summary";
const TERMINAL_SEMANTIC_PRIMARY_MODES = Object.freeze(["legacy", "projection"]);
const DEFAULT_TERMINAL_SEMANTIC_PRIMARY_MODE = "legacy";
const DEFAULT_TERMINAL_SEMANTIC_SHADOW_MODE_ENABLED = true;
const DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS = 20;
const DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE = 0.1;
const CODEX_ALLOWLIST_DELIVERY_SCOPES = Object.freeze([
  CODEX_TELEGRAM_REPLY_SCOPE,
  CODEX_SEPARATOR_INFO_SCOPE,
  CODEX_SEPARATOR_SECTION_SCOPE,
  CODEX_SEPARATOR_SUMMARY_SCOPE
]);
const ALLOWLIST_DELIVERY_SIGNALS = Object.freeze([
  TURN_PRIMARY_REPLY_DELIVERY_SIGNAL,
  OUTPUT_EPISODE_INFO_DELIVERY_SIGNAL,
  OUTPUT_EPISODE_SECTION_DELIVERY_SIGNAL,
  OUTPUT_EPISODE_SUMMARY_DELIVERY_SIGNAL
]);
const TERMINAL_SEMANTIC_COMPARISON_CLASSES = Object.freeze([
  "restart_remount_noise",
  "overlay_working_noise",
  "overlapping_turn_ownership",
  "premature_quiet_boundary",
  "semantic_adapter_divergence"
]);
const TERMINAL_SEMANTIC_RISKY_COMPARISON_CLASSES = new Set([
  "restart_remount_noise",
  "overlay_working_noise",
  "overlapping_turn_ownership",
  "premature_quiet_boundary"
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
const CODING_AGENT_WORKING_OVERLAY_PATTERN =
  /\b(?:working\s*\(\d+s|\d{1,3}%\s+(?:left|used|remaining)|esc to interrupt|interrupt to stop|background terminal running|\/ps to view|\/stop to close)\b/iu;
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

function normalizeUnitInterval(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return fallback;
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

function createPendingTerminalTurnAdmission({
  sessionId = "",
  observedAt = 0,
  trace = null,
  inputText = "",
  replyPreferred = false
} = {}) {
  return {
    sessionId: normalizeNonEmptyString(sessionId),
    observedAt: Number.isInteger(observedAt) && observedAt > 0 ? observedAt : 0,
    traceId: normalizeNonEmptyString(trace?.traceId),
    correlationId: normalizeNonEmptyString(trace?.correlationId),
    source: normalizeNonEmptyString(trace?.source),
    inputText: normalizeReplyPromotionInputText(inputText),
    replyPreferred: replyPreferred === true
  };
}

function createComparisonClassCounterState() {
  return Object.freeze({
    all: new Map(),
    byDecision: Object.freeze({
      mismatched: new Map(),
      primary_only: new Map(),
      shadow_only: new Map()
    })
  });
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

function stripSemanticInlinePromptTail(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  const promptMarkerIndex = normalized.indexOf("›");
  if (promptMarkerIndex <= 0) {
    return normalized;
  }
  const prefix = normalizeWhitespace(normalized.slice(0, promptMarkerIndex));
  const tail = normalizeWhitespace(normalized.slice(promptMarkerIndex + 1));
  if (!prefix) {
    return "";
  }
  if (tail && (CODEX_REPLY_PROMPT_ECHO_TAIL_PATTERN.test(tail) || CODING_AGENT_WORKING_OVERLAY_PATTERN.test(tail))) {
    return prefix;
  }
  return normalized;
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
const CODING_AGENT_COMMENTARY_INLINE_PATTERN =
  /\b(?:ich|i(?:'m| am|’m)?|i(?:'ll| will)|we(?:'re| are|’re)?|we(?:'ll| will))\s+(?:prüfe|pruefe|ziehe|lese|analysiere|vergleiche|setze|gehe|check(?:ing)?|inspect(?:ing)?|review(?:ing)?|read(?:ing)?|trace(?:ing)?|compare(?:ing)?|analy(?:s|z)e(?:ing)?|implement(?:ing)?|narrow(?:ing)?|pull(?:ing)?|look(?:ing)?|verify(?:ing)?|sync(?:ing)?|push(?:ing)?)\b/iu;
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
  if (
    !CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(headline) &&
    !CODING_AGENT_COMMENTARY_LEAD_PATTERN.test(combined) &&
    !CODING_AGENT_COMMENTARY_INLINE_PATTERN.test(combined)
  ) {
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

function normalizeMessagingTargetEntry(entry, options = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const defaultAdapterId = normalizeNonEmptyString(options.adapterId).toLowerCase();
  const adapterId = normalizeNonEmptyString(entry.adapterId || entry.adapter || defaultAdapterId).toLowerCase() || "telegram";
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const quickIdToken = normalizeNonEmptyString(entry.quickIdToken || entry.quickId);
  const sessionName = normalizeNonEmptyString(entry.sessionName || entry.name);
  const channelId =
    normalizeNonEmptyString(
      adapterId === "discord" ? entry.channelId || entry.chatId : entry.chatId || entry.channelId
    ) || String((adapterId === "discord" ? entry.channelId ?? entry.chatId : entry.chatId ?? entry.channelId) ?? "").trim();
  const threadId = normalizePositiveInteger(adapterId === "discord" ? entry.threadId ?? entry.messageThreadId : entry.messageThreadId ?? entry.threadId);
  const webhookUrl = normalizeNonEmptyString(entry.webhookUrl);
  const profile = normalizeMessagingProfile(entry.profile);
  const topicMode = normalizeNonEmptyString(entry.topicMode).toLowerCase() === "deck-session" ? "deck-session" : "";
  const hasSelector = Boolean(sessionId || quickIdToken || sessionName);
  const allowDynamicDeckSessionTarget = adapterId === "telegram" && topicMode === "deck-session" && !hasSelector;
  if (!channelId || (!hasSelector && !allowDynamicDeckSessionTarget)) {
    return null;
  }
  if (adapterId === "discord" && !webhookUrl) {
    return null;
  }
  const normalized = {
    sessionId,
    quickIdToken,
    sessionName,
    ...(options.includeAdapterId === true ? { adapterId } : {}),
    chatId: channelId,
    channelId,
    ...(Number.isInteger(threadId) ? { messageThreadId: threadId, threadId } : {}),
    ...(adapterId === "discord" ? { webhookUrl } : {}),
    ...(profile ? { profile } : {}),
    ...(topicMode ? { topicMode } : {})
  };
  return Object.freeze(normalized);
}

export function normalizeMessagingTargets(entries = [], options = {}) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTargetEntry(entry, options)).filter(Boolean);
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

function buildCodexRestartResendLedgerKeys({ deliveryScope, deliverySignal, sessionId, target, comparableText }) {
  const normalizedScope = normalizeNonEmptyString(deliveryScope);
  const normalizedSignal = resolveAllowlistDeliverySignal(normalizedScope, deliverySignal);
  const normalizedComparableText = normalizeNonEmptyString(comparableText);
  const targetStateKey = buildCodexRestartResendTargetStateKey(target, sessionId);
  if (!normalizedComparableText || !targetStateKey) {
    return [];
  }
  const keys = [];
  if (normalizedSignal) {
    keys.push(`${normalizedSignal}:${targetStateKey}:${normalizedComparableText}`);
  }
  if (normalizedScope && normalizedScope !== normalizedSignal) {
    keys.push(`${normalizedScope}:${targetStateKey}:${normalizedComparableText}`);
  }
  return keys;
}

function buildCodexRestartResendLedgerKey({ deliveryScope, deliverySignal, sessionId, target, comparableText }) {
  return (
    buildCodexRestartResendLedgerKeys({
      deliveryScope,
      deliverySignal,
      sessionId,
      target,
      comparableText
    })[0] || ""
  );
}

function normalizeCodexRestartResendLedgerEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const deliveryScope = normalizeNonEmptyString(entry.deliveryScope);
  const deliverySignal = resolveAllowlistDeliverySignal(deliveryScope, entry.deliverySignal);
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
      deliverySignal,
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
    deliverySignal,
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

function normalizeTerminalSemanticPrimaryMode(value) {
  const normalized = normalizeNonEmptyString(value).toLowerCase();
  return TERMINAL_SEMANTIC_PRIMARY_MODES.includes(normalized)
    ? normalized
    : DEFAULT_TERMINAL_SEMANTIC_PRIMARY_MODE;
}

function createTerminalSemanticShadowState({
  primaryMode = DEFAULT_TERMINAL_SEMANTIC_PRIMARY_MODE,
  shadowModeEnabled = DEFAULT_TERMINAL_SEMANTIC_SHADOW_MODE_ENABLED,
  cutoverMinComparisons = DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS,
  cutoverMaxMismatchRate = DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE
} = {}) {
  return {
    primaryMode: normalizeTerminalSemanticPrimaryMode(primaryMode),
    shadowModeEnabled: shadowModeEnabled === true,
    cutoverMinComparisons:
      Number.isInteger(cutoverMinComparisons) && cutoverMinComparisons > 0
        ? cutoverMinComparisons
        : DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS,
    cutoverMaxMismatchRate: normalizeUnitInterval(
      cutoverMaxMismatchRate,
      DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE
    ),
    comparisonTotal: 0,
    matchedTotal: 0,
    mismatchedTotal: 0,
    primaryOnlyTotal: 0,
    shadowOnlyTotal: 0,
    comparisonClassCounters: createComparisonClassCounterState(),
    lastComparedAt: 0
  };
}

function incrementCounterMap(map, key) {
  if (!map || !key) {
    return;
  }
  map.set(key, (map.get(key) || 0) + 1);
}

function buildSortedCounterEntries(map) {
  if (!(map instanceof Map)) {
    return [];
  }
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => Object.freeze({ key, count }));
}

function createSessionStreamState() {
  return {
    pendingLine: "",
    recentLines: [],
    terminalProjection: null,
    activeTerminalTurn: null,
    lastCompletedTerminalTurn: null,
    pendingTerminalTurnAdmission: null,
    activeOutputEpisode: null,
    lastCompletedOutputEpisode: null,
    pendingBoundarySettlement: null,
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

function createTerminalTurnRuntimeState({
  sessionId,
  observedAt,
  trace = null,
  inputText = "",
  replyPreferred = false,
  baseline = null,
  activationReason = "immediate",
  preInputPendingLine = "",
  preInputRecentLines = []
}) {
  const correlationId = normalizeNonEmptyString(trace?.correlationId);
  const traceId = normalizeNonEmptyString(trace?.traceId);
  const source = normalizeNonEmptyString(trace?.source);
  const turnId = correlationId || traceId || `turn:${sessionId}:${observedAt || Date.now()}`;
  const transcriptStartRevision = Number.isInteger(baseline?.revision) ? baseline.revision : 0;
  return {
    entityType: "TurnRuntimeState",
    turn: createTurn({
      turnId,
      sessionId,
      triggerKind: "submitted-input",
      inputSource: source,
      correlationId,
      traceId,
      baselineProjectionId: normalizeNonEmptyString(baseline?.baselineId),
      openedAt: Number.isInteger(observedAt) && observedAt > 0 ? observedAt : 0,
      status: "open",
      metadata: {
        inputText,
        replyPreferred,
        transcriptStartRevision,
        preInputPendingLine: normalizeWhitespace(preInputPendingLine),
        preInputRecentLines: Array.isArray(preInputRecentLines)
          ? preInputRecentLines.map((line) => normalizeWhitespace(line)).filter(Boolean).slice(-MAX_RECENT_LINES)
          : []
      }
    }),
    baseline,
    transcriptStartRevision,
    inputText,
    replyPreferred,
    activationReason: normalizeNonEmptyString(activationReason) || "immediate",
    preInputPendingLine: normalizeWhitespace(preInputPendingLine),
    preInputRecentLines: Array.isArray(preInputRecentLines)
      ? preInputRecentLines.map((line) => normalizeWhitespace(line)).filter(Boolean).slice(-MAX_RECENT_LINES)
      : [],
    activityCompletedAt: 0,
    quietWindowSettledAt: 0,
    quietBoundaryCancellationCount: 0,
    lastObservedProjectionRevision: transcriptStartRevision,
    primaryReplyCandidateKey: "",
    primaryReplyComparableText: "",
    primaryReplyText: "",
    primaryReplyScope: "",
    primaryReplyOccurredAt: 0
  };
}

function createOutputEpisodeRuntimeState({
  sessionId,
  observedAt,
  baseline = null,
  activationReason = "autonomous"
}) {
  const episodeId =
    normalizeNonEmptyString(baseline?.baselineId) ||
    `episode:${sessionId}:${Number.isInteger(observedAt) && observedAt > 0 ? observedAt : Date.now()}`;
  const transcriptStartRevision = Number.isInteger(baseline?.revision) ? baseline.revision : 0;
  return {
    entityType: "OutputEpisodeRuntimeState",
    outputEpisode: createOutputEpisode({
      episodeId,
      sessionId,
      episodeKind: "autonomous-output",
      sourceProjectionId: normalizeNonEmptyString(baseline?.baselineId),
      startedAt: Number.isInteger(observedAt) && observedAt > 0 ? observedAt : 0,
      status: "open",
      metadata: {
        transcriptStartRevision
      }
    }),
    baseline,
    transcriptStartRevision,
    activationReason: normalizeNonEmptyString(activationReason) || "autonomous",
    activityCompletedAt: 0,
    quietWindowSettledAt: 0,
    quietBoundaryCancellationCount: 0,
    lastObservedProjectionRevision: transcriptStartRevision,
    primaryIntentKey: "",
    primaryIntentComparableText: "",
    primaryIntentText: "",
    primaryIntentScope: "",
    primaryIntentOccurredAt: 0
  };
}

function rebuildTurnRuntimeDescriptor(runtimeState, overrides = {}) {
  if (!runtimeState?.turn) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    turn: createTurn({
      ...runtimeState.turn,
      ...overrides
    })
  };
}

function rebuildOutputEpisodeRuntimeDescriptor(runtimeState, overrides = {}) {
  if (!runtimeState?.outputEpisode) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    outputEpisode: createOutputEpisode({
      ...runtimeState.outputEpisode,
      ...overrides
    })
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

function getAllowlistDeliverySignalForScope(deliveryScope) {
  switch (normalizeNonEmptyString(deliveryScope)) {
    case CODEX_TELEGRAM_REPLY_SCOPE:
      return TURN_PRIMARY_REPLY_DELIVERY_SIGNAL;
    case CODEX_SEPARATOR_INFO_SCOPE:
      return OUTPUT_EPISODE_INFO_DELIVERY_SIGNAL;
    case CODEX_SEPARATOR_SECTION_SCOPE:
      return OUTPUT_EPISODE_SECTION_DELIVERY_SIGNAL;
    case CODEX_SEPARATOR_SUMMARY_SCOPE:
      return OUTPUT_EPISODE_SUMMARY_DELIVERY_SIGNAL;
    default:
      return "";
  }
}

function resolveAllowlistDeliverySignal(deliveryScope = "", deliverySignal = "") {
  return normalizeNonEmptyString(deliverySignal) || getAllowlistDeliverySignalForScope(deliveryScope);
}

function resolveAllowlistReasonPrefix(deliveryScope = "", deliverySignal = "") {
  return resolveAllowlistDeliverySignal(deliveryScope, deliverySignal) || normalizeNonEmptyString(deliveryScope) || "allowlist_delivery";
}

function isAllowlistDeliverySignal(deliverySignal) {
  const normalizedDeliverySignal = normalizeNonEmptyString(deliverySignal);
  return Boolean(normalizedDeliverySignal && ALLOWLIST_DELIVERY_SIGNALS.includes(normalizedDeliverySignal));
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
  deliverySignal = "",
  deliveryBlockKey = "",
  summaryMaxLength = MAX_EVENT_SUMMARY_LENGTH,
  preserveStructuredSummary = false,
  messageIntent = null
}) {
  const normalizedDeliveryScope = normalizeNonEmptyString(deliveryScope);
  const normalizedDeliverySignal = resolveAllowlistDeliverySignal(normalizedDeliveryScope, deliverySignal);
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
    deliverySignal: normalizedDeliverySignal,
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
  const deliverySignal = resolveAllowlistDeliverySignal(
    deliveryScope,
    event?.deliverySignal || event?.messageIntent?.metadata?.deliverySignal || event?.messageIntent?.intentKind
  );
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
  if (isCodexAllowlistScope(deliveryScope) || isAllowlistDeliverySignal(deliverySignal)) {
    const reasonPrefix = resolveAllowlistReasonPrefix(deliveryScope, deliverySignal);
    if (
      threadState.messageCreated === true &&
      deliveryBlockKey &&
      lastDeliveryBlockKey &&
      deliveryBlockKey === lastDeliveryBlockKey
    ) {
      return Object.freeze({ action: "update", messageKey, reason: `${reasonPrefix}_block_update` });
    }
    return Object.freeze({ action: "new", messageKey, reason: `${reasonPrefix}_new_block` });
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
  const setTimeoutFn =
    typeof options.setTimeoutFn === "function" ? options.setTimeoutFn : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof options.clearTimeoutFn === "function" ? options.clearTimeoutFn : globalThis.clearTimeout.bind(globalThis);
  const telegramTargetMappings = normalizeMessagingTargets(options.telegramTargets, {
    adapterId: "telegram",
    includeAdapterId: true
  });
  const discordTargetMappings = normalizeMessagingTargets(options.discordTargets, {
    adapterId: "discord",
    includeAdapterId: true
  });
  const targetMappingsByAdapter = new Map([
    ["telegram", telegramTargetMappings],
    ["discord", discordTargetMappings]
  ]);
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
  const telegramConfigured = Boolean(options.telegramBotToken && telegramTargetMappings.length > 0);
  const telegramOutboundHardBreakActive = options.telegramOutboundHardBreakActive === true;
  const telegramAllowlistDeliveryScopes = telegramConfigured ? CODEX_ALLOWLIST_DELIVERY_SCOPES.slice() : [];
  const telegramAllowlistDeliverySignals = telegramConfigured ? ALLOWLIST_DELIVERY_SIGNALS.slice() : [];
  const telegramAllowlistDeliveryActive =
    telegramAllowlistDeliveryScopes.length > 0 || telegramAllowlistDeliverySignals.length > 0;
  const telegramOutboundEnabled =
    telegramConfigured && !telegramOutboundHardBreakActive && options.telegramOutboundEnabled === true;
  const telegramInboundEnabled = telegramConfigured && options.telegramInboundEnabled === true;
  const discordConfigured = discordTargetMappings.length > 0;
  const discordOutboundEnabled =
    discordConfigured && (options.discordOutboundEnabled === undefined ? true : options.discordOutboundEnabled === true);
  const terminalSemanticPrimaryMode = normalizeTerminalSemanticPrimaryMode(options.terminalSemanticPrimaryMode);
  const terminalSemanticShadowModeEnabled =
    options.terminalSemanticShadowModeEnabled === undefined
      ? DEFAULT_TERMINAL_SEMANTIC_SHADOW_MODE_ENABLED
      : options.terminalSemanticShadowModeEnabled === true;
  const terminalSemanticCutoverMinComparisons =
    Number.isInteger(options.terminalSemanticCutoverMinComparisons) && options.terminalSemanticCutoverMinComparisons > 0
      ? options.terminalSemanticCutoverMinComparisons
      : DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS;
  const terminalSemanticCutoverMaxMismatchRate = normalizeUnitInterval(
    options.terminalSemanticCutoverMaxMismatchRate,
    DEFAULT_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE
  );
  const terminalOrchestrationBoundarySettleMs =
    Number.isInteger(options.terminalOrchestrationBoundarySettleMs) && options.terminalOrchestrationBoundarySettleMs >= 0
      ? options.terminalOrchestrationBoundarySettleMs
      : 0;
  const terminalSemanticShadowState = createTerminalSemanticShadowState({
    primaryMode: terminalSemanticPrimaryMode,
    shadowModeEnabled: terminalSemanticShadowModeEnabled,
    cutoverMinComparisons: terminalSemanticCutoverMinComparisons,
    cutoverMaxMismatchRate: terminalSemanticCutoverMaxMismatchRate
  });
  const telegramTransportFactory =
    typeof options.createTelegramTransport === "function" ? options.createTelegramTransport : createTelegramTransport;
  const telegramTransport = telegramConfigured
    ? telegramTransportFactory({
        botToken: options.telegramBotToken,
        apiBaseUrl: options.telegramApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;
  const discordTransportFactory =
    typeof options.createDiscordTransport === "function" ? options.createDiscordTransport : createDiscordTransport;
  const discordTransport = discordConfigured
    ? discordTransportFactory({
        apiBaseUrl: options.discordApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;
  const telegramAdapter = createTelegramAdapter({
    configured: telegramConfigured,
    deliveryEnabled: telegramOutboundEnabled,
    deliveryHardBreakActive: telegramOutboundHardBreakActive,
    allowlistDeliveryScopes: telegramAllowlistDeliveryScopes,
    allowlistDeliverySignals: telegramAllowlistDeliverySignals,
    inboundEnabled: telegramInboundEnabled,
    configuredTargets: telegramTargetMappings.length,
    pollTimeoutSeconds: options.telegramPollTimeoutSeconds,
    transport: telegramTransport,
    topicBindings: normalizeMessagingTopicBindings(options.telegramTopicBindings),
    commandCatalog: buildTelegramCommandCatalog({
      customCommands: listCustomCommands()
    }),
    nowFn,
    logDebug,
    formatSessionLabel: buildSessionLabel,
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });
  const discordAdapter = createDiscordAdapter({
    configured: discordConfigured,
    deliveryEnabled: discordOutboundEnabled,
    allowlistDeliverySignals: ALLOWLIST_DELIVERY_SIGNALS,
    configuredTargets: discordTargetMappings.length,
    transport: discordTransport,
    nowFn,
    logDebug,
    formatSessionLabel: buildSessionLabel,
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });
  adapters.push(telegramAdapter);
  adapters.push(discordAdapter);
  const deliveryAdapterDescriptorEntries = [];
  if (telegramConfigured) {
    deliveryAdapterDescriptorEntries.push(
      createDeliveryAdapterDescriptor({
        adapterId: "telegram",
        channel: "telegram",
        capabilities: ["send_message", "edit_message", "thread_topics"],
        metadata: {
          allowlistDeliveryActive: telegramAllowlistDeliveryActive,
          configuredTargets: telegramTargetMappings.length
        }
      })
    );
  }
  if (discordConfigured) {
    deliveryAdapterDescriptorEntries.push(
      createDeliveryAdapterDescriptor({
        adapterId: "discord",
        channel: "discord",
        capabilities: ["send_message", "edit_message", "thread_channels"],
        metadata: {
          configuredTargets: discordTargetMappings.length
        }
      })
    );
  }
  const deliveryAdapterDescriptors = Object.freeze(deliveryAdapterDescriptorEntries);
  const appSemanticAdapterRegistry = createAppSemanticAdapterRegistry({
    getSessionAppIdentity,
    isCodingAgentContext,
    normalizeNonEmptyString,
    normalizeLineBreaks,
    normalizeWhitespace,
    normalizeReplyPromotionInputText,
    trimCodingAgentLowValueTail,
    stripTerminalNoiseFragments,
    stripSemanticInlinePromptTail,
    classifyNoiseSignature,
    isSeparatorHint,
    isCommentaryLikeCodexOutboundText,
    isCodexTelegramReplyMetaLine,
    createComparableText,
    escapeRegExp,
    noiseSeparatorOnlyPattern: NOISE_SEPARATOR_ONLY_PATTERN,
    codingAgentAntiBulletPattern: CODING_AGENT_ANTI_BULLET_PATTERN,
    codingAgentWorkingOverlayPattern: CODING_AGENT_WORKING_OVERLAY_PATTERN,
    replyPromptEchoTailPattern: CODEX_REPLY_PROMPT_ECHO_TAIL_PATTERN,
    codexTelegramReplyScope: CODEX_TELEGRAM_REPLY_SCOPE,
    codexTelegramReplyMinTextLength: CODEX_TELEGRAM_REPLY_MIN_TEXT_LENGTH,
    codexTelegramReplyMinWords: CODEX_TELEGRAM_REPLY_MIN_WORDS,
    codexTelegramReplyMaxTextLength: CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH
  });

  const conversationTargetIndex = new Map();
  const ambiguousConversationKeys = new Set();

  function rebuildConversationTargetIndex(dynamicBindings = []) {
    conversationTargetIndex.clear();
    ambiguousConversationKeys.clear();
    for (const target of telegramTargetMappings) {
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

  function resolveAppSemanticAdapter(session, profile) {
    return appSemanticAdapterRegistry.resolveForSession(session, profile);
  }

  function buildAppSemanticAdapterDescriptorForSession(session, profile, strategy = "") {
    const semanticAdapter = resolveAppSemanticAdapter(session, profile);
    return semanticAdapter ? semanticAdapter.createDescriptor(session, profile, strategy) : null;
  }

  function buildLegacyCodexMessageIntent({
    session,
    profile,
    state,
    trace,
    decision,
    deliveryScope,
    messageText,
    candidateKey,
    deliveryBlockKey,
    maxLength
  }) {
    const traceId = normalizeNonEmptyString(trace?.traceId);
    const deliverySignal = getAllowlistDeliverySignalForScope(deliveryScope);
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
    const structuredText = deliveryScope === CODEX_SEPARATOR_SECTION_SCOPE || /\n/u.test(messageText);
    if (deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE) {
      const turn = resolveLegacyMessageIntentTurn(state, session, decision, trace);
      return createMessageIntent({
        intentId:
          deliveryBlockKey ||
          candidateKey ||
          normalizeNonEmptyString(turn?.correlationId) ||
          normalizeNonEmptyString(turn?.traceId) ||
          traceId,
        sessionId: session.id,
        intentKind: deliverySignal || "reply",
        eventType: "session.output.summary",
        severity: "info",
        threadKey: "status",
        text: messageText,
        format: structuredText ? "structured_text" : "plain_text",
        comparableText: createComparableText(messageText),
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
          deliverySignal,
          summaryMaxLength: maxLength,
          preserveStructuredSummary: structuredText
        }
      });
    }
    const outputEpisode = resolveLegacyMessageIntentOutputEpisode(state, session, decision, trace);
    return createMessageIntent({
      intentId: deliveryBlockKey || candidateKey || traceId,
      sessionId: session.id,
      intentKind: deliverySignal || "autonomous-update",
      eventType: "session.output.summary",
      severity: "info",
      threadKey: "status",
      text: messageText,
      format: structuredText ? "structured_text" : "plain_text",
      comparableText: createComparableText(messageText),
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
        deliverySignal,
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
      deliverySignal:
        resolveAllowlistDeliverySignal(
          normalizeNonEmptyString(intent?.metadata?.legacyDeliveryScope),
          normalizeNonEmptyString(intent?.metadata?.deliverySignal) || normalizeNonEmptyString(intent?.intentKind)
        ),
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
      const admission = createPendingTerminalTurnAdmission({
        sessionId: normalizedSessionId,
        observedAt,
        trace,
        inputText: carriedInputText,
        replyPreferred: isReplyPreferredTelegramTrace(trace)
      });
      const activeTurnOwnership = Boolean(streamState?.activeTerminalTurn?.turn);
      const activeEpisodeOwnership = Boolean(streamState?.activeOutputEpisode?.outputEpisode);
      if (activeTurnOwnership) {
        clearPendingCodexTelegramReply(streamState);
        setPendingTerminalTurnAdmission(streamState, admission);
        logDebug(
          "terminal.orchestration.turn_admission_deferred",
          {
            sessionId: normalizedSessionId,
            traceId: admission.traceId,
            correlationId: admission.correlationId,
            reason: "active_turn_ownership",
            activeTurnId: normalizeNonEmptyString(streamState?.activeTerminalTurn?.turn?.turnId),
            activeEpisodeId: normalizeNonEmptyString(streamState?.activeOutputEpisode?.outputEpisode?.episodeId),
            inputObservedAt: admission.observedAt
          },
          trace || null
        );
        return;
      }
      if (activeEpisodeOwnership || streamState?.pendingBoundarySettlement) {
        applyTurnOwnershipBarrier(streamState, { id: normalizedSessionId }, trace);
        activateTurnAdmission(streamState, { id: normalizedSessionId }, admission, trace, "ownership_barrier");
        return;
      }
      activateTurnAdmission(streamState, { id: normalizedSessionId }, admission, trace, "immediate");
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

  function resolveTargetForAdapter(session, adapterId = "telegram") {
    const targetMappings = targetMappingsByAdapter.get(normalizeNonEmptyString(adapterId).toLowerCase()) || [];
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
    if (adapterId !== "telegram" || bestMatch.topicMode !== "deck-session") {
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

  function resolveTarget(session) {
    return resolveTargetForAdapter(session, "telegram") || resolveTargetForAdapter(session, "discord");
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
    if (normalizeNonEmptyString(target.adapterId || "telegram") !== "telegram") {
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

  function hasActiveTerminalOwnership(state) {
    return Boolean(state?.activeTerminalTurn?.turn || state?.activeOutputEpisode?.outputEpisode);
  }

  function clearPendingBoundarySettlement(state) {
    const settlement = state?.pendingBoundarySettlement;
    if (settlement?.timer) {
      clearTimeoutFn(settlement.timer);
    }
    if (state && typeof state === "object") {
      state.pendingBoundarySettlement = null;
    }
  }

  function reopenQuietingTerminalOwnership(state) {
    if (state?.activeTerminalTurn?.turn && normalizeNonEmptyString(state.activeTerminalTurn.turn.status) === "quieting") {
      state.activeTerminalTurn.activityCompletedAt = 0;
      state.activeTerminalTurn.quietWindowSettledAt = 0;
      state.activeTerminalTurn.quietBoundaryCancellationCount =
        (state.activeTerminalTurn.quietBoundaryCancellationCount || 0) + 1;
      state.activeTerminalTurn = rebuildTurnRuntimeDescriptor(state.activeTerminalTurn, {
        status: "open"
      });
    }
    if (
      state?.activeOutputEpisode?.outputEpisode &&
      normalizeNonEmptyString(state.activeOutputEpisode.outputEpisode.status) === "quieting"
    ) {
      state.activeOutputEpisode.activityCompletedAt = 0;
      state.activeOutputEpisode.quietWindowSettledAt = 0;
      state.activeOutputEpisode.quietBoundaryCancellationCount =
        (state.activeOutputEpisode.quietBoundaryCancellationCount || 0) + 1;
      state.activeOutputEpisode = rebuildOutputEpisodeRuntimeDescriptor(state.activeOutputEpisode, {
        status: "open"
      });
    }
  }

  function applyTurnOwnershipBarrier(state, session, trace = null) {
    if (!state) {
      return;
    }
    clearPendingBoundarySettlement(state);
    const completedAt = nowFn();
    const activeTurnId = normalizeNonEmptyString(state?.activeTerminalTurn?.turn?.turnId);
    const activeEpisodeId = normalizeNonEmptyString(state?.activeOutputEpisode?.outputEpisode?.episodeId);
    clearPendingCodexTelegramReply(state);
    state.pendingSummaryBlock = createPendingSummaryBlock();
    closeActiveTurn(state, completedAt, "ownership_barrier");
    closeActiveOutputEpisode(state, completedAt, "ownership_barrier");
    logDebug(
      "terminal.orchestration.turn_ownership_barrier",
      {
        sessionId: normalizeNonEmptyString(session?.id),
        activeTurnId,
        activeEpisodeId,
        completedAt
      },
      trace || null
    );
  }

  function setPendingTerminalTurnAdmission(state, admission) {
    if (!state || !admission) {
      return null;
    }
    state.pendingTerminalTurnAdmission = {
      ...admission
    };
    return state.pendingTerminalTurnAdmission;
  }

  function getProjectionRestartRecoveryReason(session, profile, sessionId, occurredAt, { requireFreshInput = false } = {}) {
    if (!isCodingAgentContext(session, profile)) {
      return "";
    }
    const recoveryState = codexSummaryRestartRecoveryStates.get(normalizeNonEmptyString(sessionId)) || null;
    if (!recoveryState?.active) {
      return "";
    }
    const effectiveOccurredAt = Number.isInteger(occurredAt) && occurredAt > 0 ? occurredAt : nowFn();
    if (!runtimeReadyAt || effectiveOccurredAt < runtimeReadyAt) {
      return "restart_pre_ready";
    }
    if (codexSummaryRestartRecoveryQuietUntil > effectiveOccurredAt) {
      return "restart_quiet_window";
    }
    if (
      requireFreshInput &&
      (
        !Number.isInteger(recoveryState.lastInputAt) ||
        recoveryState.lastInputAt <= 0 ||
        recoveryState.lastInputAt < codexSummaryRestartRecoveryQuietUntil
      )
    ) {
      return "restart_waiting_for_input";
    }
    return "";
  }

  function classifyTerminalSemanticComparisonClass({
    session,
    profile,
    state,
    entityKind,
    comparisonResult,
    primaryCandidate,
    shadowCandidate
  }) {
    if (!comparisonResult || comparisonResult === "matched") {
      return "";
    }
    const recoveryReason = getProjectionRestartRecoveryReason(session, profile, session?.id, nowFn(), {
      requireFreshInput: entityKind === "output_episode"
    });
    if (recoveryReason) {
      return "restart_remount_noise";
    }
    const candidateTexts = [primaryCandidate?.text, shadowCandidate?.text]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean);
    const combinedText = candidateTexts.join(" ");
    if (combinedText && CODING_AGENT_WORKING_OVERLAY_PATTERN.test(combinedText)) {
      return "overlay_working_noise";
    }
    if (state?.pendingTerminalTurnAdmission) {
      return "overlapping_turn_ownership";
    }
    const relevantRuntimeState =
      entityKind === "output_episode"
        ? state?.activeOutputEpisode || state?.lastCompletedOutputEpisode
        : state?.activeTerminalTurn || state?.lastCompletedTerminalTurn;
    if ((relevantRuntimeState?.quietBoundaryCancellationCount || 0) > 0) {
      return "premature_quiet_boundary";
    }
    return "semantic_adapter_divergence";
  }

  function isRiskyProjectionComparisonClass(comparisonClass) {
    return TERMINAL_SEMANTIC_RISKY_COMPARISON_CLASSES.has(normalizeNonEmptyString(comparisonClass));
  }

  function isNoisySemanticCandidate(candidate, session, profile) {
    const text = normalizeWhitespace(candidate?.text);
    if (!text) {
      return true;
    }
    if (
      CODING_AGENT_WORKING_OVERLAY_PATTERN.test(text) ||
      isCommentaryLikeCodexOutboundText(text, session, profile)
    ) {
      return true;
    }
    return classifyNoiseSignature(text, session, profile).lowInformation;
  }

  function isMeaningfulSemanticSuperset(candidate, projectionCandidate, session, profile) {
    const candidateText = normalizeWhitespace(candidate?.text);
    const projectionText = normalizeWhitespace(projectionCandidate?.text);
    if (!candidateText || !projectionText || candidateText === projectionText) {
      return false;
    }
    if (!candidateText.includes(projectionText)) {
      return false;
    }
    if (candidateText.length - projectionText.length < 24) {
      return false;
    }
    return !isNoisySemanticCandidate(candidate, session, profile);
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

  function captureProjectionBaseline(state, label = "") {
    return state?.terminalProjection?.createBaseline(label) || null;
  }

  function activateTurnAdmission(state, session, admission, trace = null, activationReason = "immediate") {
    const normalizedSessionId = normalizeNonEmptyString(session?.id || admission?.sessionId);
    if (!state || !normalizedSessionId || !admission) {
      return false;
    }
    ensureTerminalProjection(state, session || { id: normalizedSessionId });
    const observedAt = nowFn();
    const baseline = captureProjectionBaseline(state, `turn:${normalizedSessionId}:${observedAt}`);
    state.activeTerminalTurn = createTerminalTurnRuntimeState({
      sessionId: normalizedSessionId,
      observedAt,
      trace: {
        traceId: admission.traceId,
        correlationId: admission.correlationId,
        source: admission.source
      },
      inputText: admission.inputText,
      replyPreferred: admission.replyPreferred,
      baseline,
      activationReason,
      preInputPendingLine: normalizeWhitespace(state.pendingLine),
      preInputRecentLines: state.recentLines.slice(-MAX_RECENT_LINES)
    });
    state.pendingCodexTelegramReply = {
      active: true,
      triggeredAt: observedAt,
      traceId: admission.traceId,
      correlationId: admission.correlationId,
      source: admission.source,
      replyPreferred: admission.replyPreferred,
      inputText: admission.inputText,
      preInputPendingLine: state.activeTerminalTurn.preInputPendingLine,
      preInputRecentLines: state.activeTerminalTurn.preInputRecentLines.slice(-MAX_RECENT_LINES),
      started: false,
      firstLineAt: 0,
      lastLineAt: 0,
      lines: []
    };
    state.pendingTerminalTurnAdmission = null;
    logDebug(
      "messaging.telegram_reply_window",
      {
        sessionId: normalizedSessionId,
        active: true,
        traceId: admission.traceId,
        correlationId: admission.correlationId,
        traceSource: admission.source,
        replyPreferred: admission.replyPreferred,
        admissionReason: activationReason
      },
      trace || null
    );
    logDebug(
      "terminal.orchestration.turn_opened",
      {
        sessionId: normalizedSessionId,
        turnId: state.activeTerminalTurn.turn.turnId,
        baselineRevision: Number.isInteger(state.activeTerminalTurn.baseline?.revision)
          ? state.activeTerminalTurn.baseline.revision
          : 0,
        inputText: admission.inputText,
        replyPreferred: admission.replyPreferred,
        admissionReason: activationReason,
        inputObservedAt: admission.observedAt
      },
      trace || null
    );
    return true;
  }

  function getTerminalProjectionRevision(state) {
    const revision = state?.terminalProjection?.captureSnapshot()?.revision;
    return Number.isInteger(revision) ? revision : 0;
  }

  function buildTurnRuntimeSnapshot(state, runtimeState) {
    if (!runtimeState?.turn) {
      return null;
    }
    const transcriptDelta = state?.terminalProjection?.getTranscriptDelta(runtimeState.transcriptStartRevision) || null;
    const diff =
      runtimeState.baseline && state?.terminalProjection
        ? state.terminalProjection.diffFromBaseline(runtimeState.baseline)
        : null;
    return Object.freeze({
      entityType: "TurnRuntimeState",
      turn: runtimeState.turn,
      baseline: runtimeState.baseline || null,
      transcriptDelta,
      diff,
      inputText: runtimeState.inputText || "",
      replyPreferred: runtimeState.replyPreferred === true,
      activationReason: normalizeNonEmptyString(runtimeState.activationReason) || "immediate",
      preInputPendingLine: runtimeState.preInputPendingLine || "",
      preInputRecentLines: Array.isArray(runtimeState.preInputRecentLines) ? runtimeState.preInputRecentLines.slice() : [],
      activityCompletedAt: runtimeState.activityCompletedAt || 0,
      quietWindowSettledAt: runtimeState.quietWindowSettledAt || 0,
      quietBoundaryCancellationCount: runtimeState.quietBoundaryCancellationCount || 0,
      lastObservedProjectionRevision: runtimeState.lastObservedProjectionRevision || 0,
      primaryReplyCandidateKey: runtimeState.primaryReplyCandidateKey || "",
      primaryReplyComparableText: runtimeState.primaryReplyComparableText || "",
      primaryReplyText: runtimeState.primaryReplyText || "",
      primaryReplyScope: runtimeState.primaryReplyScope || "",
      primaryReplyOccurredAt: runtimeState.primaryReplyOccurredAt || 0
    });
  }

  function buildOutputEpisodeRuntimeSnapshot(state, runtimeState) {
    if (!runtimeState?.outputEpisode) {
      return null;
    }
    const transcriptDelta = state?.terminalProjection?.getTranscriptDelta(runtimeState.transcriptStartRevision) || null;
    const diff =
      runtimeState.baseline && state?.terminalProjection
        ? state.terminalProjection.diffFromBaseline(runtimeState.baseline)
        : null;
    return Object.freeze({
      entityType: "OutputEpisodeRuntimeState",
      outputEpisode: runtimeState.outputEpisode,
      baseline: runtimeState.baseline || null,
      transcriptDelta,
      diff,
      activationReason: normalizeNonEmptyString(runtimeState.activationReason) || "autonomous",
      activityCompletedAt: runtimeState.activityCompletedAt || 0,
      quietWindowSettledAt: runtimeState.quietWindowSettledAt || 0,
      quietBoundaryCancellationCount: runtimeState.quietBoundaryCancellationCount || 0,
      lastObservedProjectionRevision: runtimeState.lastObservedProjectionRevision || 0,
      primaryIntentKey: runtimeState.primaryIntentKey || "",
      primaryIntentComparableText: runtimeState.primaryIntentComparableText || "",
      primaryIntentText: runtimeState.primaryIntentText || "",
      primaryIntentScope: runtimeState.primaryIntentScope || "",
      primaryIntentOccurredAt: runtimeState.primaryIntentOccurredAt || 0
    });
  }

  function captureTerminalOrchestrationState(sessionId) {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    if (!state) {
      return null;
    }
    return Object.freeze({
      entityType: "TerminalOrchestrationState",
      sessionId: normalizeNonEmptyString(sessionId),
      activeTurn: buildTurnRuntimeSnapshot(state, state.activeTerminalTurn),
      lastCompletedTurn: buildTurnRuntimeSnapshot(state, state.lastCompletedTerminalTurn),
      activeOutputEpisode: buildOutputEpisodeRuntimeSnapshot(state, state.activeOutputEpisode),
      lastCompletedOutputEpisode: buildOutputEpisodeRuntimeSnapshot(state, state.lastCompletedOutputEpisode)
    });
  }

  function closeActiveOutputEpisode(state, completedAt, status = "completed") {
    if (!state?.activeOutputEpisode?.outputEpisode) {
      return;
    }
    const settledAt = Number.isInteger(completedAt) && completedAt > 0 ? completedAt : nowFn();
    state.lastCompletedOutputEpisode = rebuildOutputEpisodeRuntimeDescriptor(
      {
        ...state.activeOutputEpisode,
        activityCompletedAt: state.activeOutputEpisode.activityCompletedAt || settledAt,
        quietWindowSettledAt: settledAt
      },
      {
        completedAt: settledAt,
        status
      }
    );
    state.activeOutputEpisode = null;
  }

  function closeActiveTurn(state, completedAt, status = "completed") {
    if (!state?.activeTerminalTurn?.turn) {
      return;
    }
    const settledAt = Number.isInteger(completedAt) && completedAt > 0 ? completedAt : nowFn();
    state.lastCompletedTerminalTurn = rebuildTurnRuntimeDescriptor(
      {
        ...state.activeTerminalTurn,
        activityCompletedAt: state.activeTerminalTurn.activityCompletedAt || settledAt,
        quietWindowSettledAt: settledAt
      },
      {
        closedAt: settledAt,
        status
      }
    );
    state.activeTerminalTurn = null;
  }

  function recordProjectionRevisionObservation(state) {
    const revision = getTerminalProjectionRevision(state);
    if (state?.activeTerminalTurn?.turn) {
      state.activeTerminalTurn.lastObservedProjectionRevision = revision;
    }
    if (state?.activeOutputEpisode?.outputEpisode) {
      state.activeOutputEpisode.lastObservedProjectionRevision = revision;
    }
  }

  function ensureActiveTurnBaseline(state) {
    if (!state?.activeTerminalTurn?.turn || state.activeTerminalTurn.baseline) {
      return;
    }
    const baseline = captureProjectionBaseline(
      state,
      `turn:${normalizeNonEmptyString(state.activeTerminalTurn.turn.turnId)}`
    );
    const transcriptStartRevision = Number.isInteger(baseline?.revision) ? baseline.revision : 0;
    state.activeTerminalTurn = rebuildTurnRuntimeDescriptor(
      {
        ...state.activeTerminalTurn,
        baseline,
        transcriptStartRevision,
        lastObservedProjectionRevision: transcriptStartRevision
      },
      {
        baselineProjectionId: normalizeNonEmptyString(baseline?.baselineId),
        metadata: {
          ...state.activeTerminalTurn.turn.metadata,
          transcriptStartRevision
        }
      }
    );
  }

  function ensureAutonomousOutputEpisode(state, session, profile, trace, hasVisibleChunk) {
    if (!hasVisibleChunk || state?.activeTerminalTurn?.turn || state?.activeOutputEpisode?.outputEpisode) {
      return;
    }
    const quarantineReason = getProjectionRestartRecoveryReason(session, profile, session?.id, nowFn(), {
      requireFreshInput: true
    });
    if (quarantineReason) {
      logDebug(
        "terminal.orchestration.output_episode_quarantined",
        {
          sessionId: normalizeNonEmptyString(session?.id),
          reason: quarantineReason
        },
        trace
      );
      return;
    }
    const observedAt = nowFn();
    const baseline = captureProjectionBaseline(state, `episode:${normalizeNonEmptyString(session?.id)}`);
    state.activeOutputEpisode = createOutputEpisodeRuntimeState({
      sessionId: normalizeNonEmptyString(session?.id),
      observedAt,
      baseline,
      activationReason: "autonomous"
    });
    state.activeOutputEpisode.lastObservedProjectionRevision = Number.isInteger(baseline?.revision) ? baseline.revision : 0;
    logDebug(
      "terminal.orchestration.output_episode_opened",
      {
        sessionId: normalizeNonEmptyString(session?.id),
        episodeId: state.activeOutputEpisode.outputEpisode.episodeId,
        baselineRevision: Number.isInteger(baseline?.revision) ? baseline.revision : 0
      },
      trace
    );
  }

  function observeTurnCompletionBoundary(state, session, trace) {
    const settledAt =
      (Number.isInteger(session?.activityCompletedAt) && session.activityCompletedAt > 0 ? session.activityCompletedAt : 0) || nowFn();
    if (state?.activeTerminalTurn?.turn) {
      state.activeTerminalTurn.activityCompletedAt = settledAt;
      state.activeTerminalTurn = rebuildTurnRuntimeDescriptor(state.activeTerminalTurn, {
        status: "quieting"
      });
    }
    if (state?.activeOutputEpisode?.outputEpisode) {
      state.activeOutputEpisode.activityCompletedAt = settledAt;
      state.activeOutputEpisode = rebuildOutputEpisodeRuntimeDescriptor(state.activeOutputEpisode, {
        status: "quieting"
      });
    }
    logDebug(
      "terminal.orchestration.quiet_boundary",
      {
        sessionId: normalizeNonEmptyString(session?.id),
        activeTurnId: normalizeNonEmptyString(state?.activeTerminalTurn?.turn?.turnId),
        activeEpisodeId: normalizeNonEmptyString(state?.activeOutputEpisode?.outputEpisode?.episodeId),
        settledAt
      },
      trace
    );
  }

  function scheduleBoundarySettlement(session, profile, state, trace) {
    if (!state?.pendingBoundarySettlement || terminalOrchestrationBoundarySettleMs <= 0) {
      return;
    }
    const settlementId = state.pendingBoundarySettlement.settlementId;
    state.pendingBoundarySettlement.timer = setTimeoutFn(() => {
      void runSessionWork(session?.id, async () => {
        const activeState = getOrCreateSessionState(normalizeNonEmptyString(session?.id));
        if (activeState?.pendingBoundarySettlement?.settlementId !== settlementId) {
          return;
        }
        clearPendingBoundarySettlement(activeState);
        await finalizeSettledBoundary(session, profile, activeState, trace);
      });
    }, terminalOrchestrationBoundarySettleMs);
  }

  async function finalizeSettledBoundary(session, profile, state, trace) {
    const projectionSemanticTurnActive =
      shouldUseProjectionSemanticExtraction(session, profile) && Boolean(state?.activeTerminalTurn?.turn);
    if (projectionSemanticTurnActive) {
      await maybeDispatchConfiguredTurnSemanticIntent(session, profile, state, trace);
    } else {
      await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      await advanceCodexAllowlistCandidate(session, profile, state, trace, null, { flush: true });
    }
    await maybeFinalizeOutputEpisodeSemanticShadow(session, profile, state, trace);
    await flushPendingSummaryBlock(session, profile, state, trace, "quiet_window");
    const completedAt =
      (Number.isInteger(session?.activityCompletedAt) && session.activityCompletedAt > 0 ? session.activityCompletedAt : 0) || nowFn();
    closeActiveTurn(state, completedAt, "completed");
    closeActiveOutputEpisode(state, completedAt, "completed");
    if (state?.pendingTerminalTurnAdmission) {
      const pendingAdmission = state.pendingTerminalTurnAdmission;
      const activated = activateTurnAdmission(state, session, pendingAdmission, trace, "deferred_quiescent");
      if (activated) {
        return;
      }
    }
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

  function observeSessionActivityStartedInternal({ sessionId, trace }) {
    const state = sessionStates.get(normalizeNonEmptyString(sessionId));
    if (!state?.pendingBoundarySettlement) {
      return;
    }
    clearPendingBoundarySettlement(state);
    reopenQuietingTerminalOwnership(state);
    logDebug(
      "terminal.orchestration.quiet_boundary_cancelled",
      {
        sessionId: normalizeNonEmptyString(sessionId),
        activeTurnId: normalizeNonEmptyString(state?.activeTerminalTurn?.turn?.turnId),
        activeEpisodeId: normalizeNonEmptyString(state?.activeOutputEpisode?.outputEpisode?.episodeId)
      },
      trace || null
    );
  }

  async function ensureSessionTargetInternal(session, trace, resolvedTarget = null) {
    let finalTarget = null;
    for (const adapter of adapters) {
      const adapterId = normalizeNonEmptyString(adapter.getStatus?.().adapter);
      const target = resolvedTarget && (!adapterId || adapterId === normalizeNonEmptyString(resolvedTarget?.adapterId || "telegram"))
        ? resolvedTarget
        : resolveTargetForAdapter(session, adapterId);
      if (!target) {
        continue;
      }
      if (typeof adapter.ensureTarget !== "function") {
        if (!finalTarget) {
          finalTarget = target;
        }
        continue;
      }
      rememberSessionForTarget(target, session);
      let adapterFinalTarget = target;
      const result = await adapter.ensureTarget(target);
      if (result?.target?.chatId) {
        adapterFinalTarget = result.target;
      }
      if (result?.topicBinding) {
        await upsertTelegramTopicBinding(result.topicBinding);
      }
      if (!finalTarget) {
        finalTarget = adapterFinalTarget;
      }
      logDebug(
        "messaging.target.ensure",
        {
          adapter: adapterId || "adapter",
          sessionId: normalizeNonEmptyString(session?.id),
          ok: result?.ok === true,
          reason: normalizeNonEmptyString(result?.reason),
          error: normalizeNonEmptyString(result?.error),
          chatId: normalizeNonEmptyString(adapterFinalTarget?.chatId),
          messageThreadId: Number.isInteger(adapterFinalTarget?.messageThreadId) ? adapterFinalTarget.messageThreadId : null
        },
        trace || null
      );
      rememberSessionForTarget(adapterFinalTarget, session);
    }
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
        deliverySignal: resolveAllowlistDeliverySignal(entry?.deliveryScope, entry?.deliverySignal),
        deliveryBlockKey: normalizeNonEmptyString(entry?.deliveryBlockKey),
        comparisonResult: normalizeNonEmptyString(entry?.comparisonResult),
        comparisonClass: normalizeNonEmptyString(entry?.comparisonClass),
        primaryMode: normalizeNonEmptyString(entry?.primaryMode),
        shadowMode: normalizeNonEmptyString(entry?.shadowMode),
        primaryDeliveryScope: normalizeNonEmptyString(entry?.primaryDeliveryScope),
        primaryDeliverySignal: resolveAllowlistDeliverySignal(entry?.primaryDeliveryScope, entry?.primaryDeliverySignal),
        shadowDeliveryScope: normalizeNonEmptyString(entry?.shadowDeliveryScope),
        shadowDeliverySignal: resolveAllowlistDeliverySignal(entry?.shadowDeliveryScope, entry?.shadowDeliverySignal),
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
      deliverySignal: event?.deliverySignal,
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
        deliverySignal: resolveAllowlistDeliverySignal(event?.deliveryScope, event?.deliverySignal),
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
      deliverySignal: event?.deliverySignal,
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
      deliverySignal: resolveAllowlistDeliverySignal(event?.deliveryScope, event?.deliverySignal),
      sessionId: normalizeNonEmptyString(event?.sessionId),
      chatId: normalizeNonEmptyString(target?.chatId),
      ...(Number.isInteger(target?.messageThreadId) ? { messageThreadId: target.messageThreadId } : {}),
      targetStateKey: buildCodexRestartResendTargetStateKey(target, event?.sessionId),
      comparableText: normalizeNonEmptyString(event?.comparableText),
      deliveredAt: Number.isInteger(event?.occurredAt) ? event.occurredAt : nowFn()
    };
  }

  function buildCodexSummaryRestartRecoveryDecision(event, target) {
    const deliveryScope = normalizeNonEmptyString(event?.deliveryScope);
    const deliverySignal = resolveAllowlistDeliverySignal(deliveryScope, event?.deliverySignal);
    if (deliverySignal !== OUTPUT_EPISODE_SUMMARY_DELIVERY_SIGNAL && deliveryScope !== CODEX_SEPARATOR_SUMMARY_SCOPE) {
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
    const ledgerKeys = ledgerEntry
      ? buildCodexRestartResendLedgerKeys({
          deliveryScope: ledgerEntry.deliveryScope,
          deliverySignal: ledgerEntry.deliverySignal,
          sessionId: ledgerEntry.sessionId,
          target,
          comparableText: ledgerEntry.comparableText
        })
      : [];
    if (ledgerKeys.some((entryKey) => codexRestartResendLedger.has(entryKey))) {
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

  async function observeCodexTelegramReplyLine(session, profile, state, trace, visibleLine, { dispatchEnabled = true } = {}) {
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
      if (replyState.started && dispatchEnabled) {
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
      if (dispatchEnabled) {
        await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      }
      return false;
    }
    if (
      !dispatchEnabled &&
      (
        replyState.lines.length >= CODEX_TELEGRAM_REPLY_MAX_LINES ||
        normalizeCodexTelegramReplyText(replyState.lines).length >= CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH
      )
    ) {
      replyState.lastLineAt = observedAt;
      return true;
    }
    replyState.lines.push(visibleLine);
    replyState.lastLineAt = observedAt;
    if (
      replyState.lines.length >= CODEX_TELEGRAM_REPLY_MAX_LINES ||
      normalizeCodexTelegramReplyText(replyState.lines).length >= CODEX_TELEGRAM_REPLY_MAX_TEXT_LENGTH
    ) {
      if (dispatchEnabled) {
        await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      }
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

  function resolveLegacyMessageIntentTurn(state, session, decision, trace) {
    const activeTurn = state?.activeTerminalTurn;
    const lastCompletedTurn = state?.lastCompletedTerminalTurn;
    if (activeTurn?.turn) {
      return activeTurn.turn;
    }
    if (
      lastCompletedTurn?.turn &&
      Number.isInteger(lastCompletedTurn.turn.closedAt) &&
      Number.isInteger(decision?.lastObservedAt) &&
      lastCompletedTurn.turn.closedAt >= decision.lastObservedAt
    ) {
      return lastCompletedTurn.turn;
    }
    if (lastCompletedTurn?.turn) {
      return lastCompletedTurn.turn;
    }
    return createTurn({
      turnId:
        normalizeNonEmptyString(decision?.deliveryBlockKey) ||
        normalizeNonEmptyString(decision?.key) ||
        normalizeNonEmptyString(trace?.correlationId) ||
        normalizeNonEmptyString(trace?.traceId),
      sessionId: normalizeNonEmptyString(session?.id),
      triggerKind: "submitted-input",
      inputSource: normalizeNonEmptyString(trace?.source),
      correlationId: normalizeNonEmptyString(trace?.correlationId),
      traceId: normalizeNonEmptyString(trace?.traceId),
      openedAt: Number.isInteger(decision?.firstObservedAt) ? decision.firstObservedAt : nowFn(),
      closedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : nowFn(),
      status: "completed"
    });
  }

  function resolveLegacyMessageIntentOutputEpisode(state, session, decision, trace) {
    const activeEpisode = state?.activeOutputEpisode;
    const lastCompletedEpisode = state?.lastCompletedOutputEpisode;
    const runtimeEpisode = activeEpisode?.outputEpisode || lastCompletedEpisode?.outputEpisode || null;
    return createOutputEpisode({
      episodeId:
        normalizeNonEmptyString(decision?.deliveryBlockKey) ||
        normalizeNonEmptyString(decision?.key) ||
        normalizeNonEmptyString(trace?.traceId),
      sessionId: normalizeNonEmptyString(session?.id),
      episodeKind: "autonomous-output",
      sourceProjectionId: normalizeNonEmptyString(runtimeEpisode?.sourceProjectionId),
      completedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : nowFn(),
      startedAt:
        Number.isInteger(runtimeEpisode?.startedAt) && runtimeEpisode.startedAt > 0
          ? runtimeEpisode.startedAt
          : Number.isInteger(decision?.firstObservedAt)
            ? decision.firstObservedAt
            : nowFn(),
      status:
        normalizeNonEmptyString(runtimeEpisode?.status) ||
        (activeEpisode?.outputEpisode ? "open" : "completed"),
      metadata: {
        runtimeEpisodeId: normalizeNonEmptyString(runtimeEpisode?.episodeId),
        transcriptStartRevision:
          Number.isInteger(activeEpisode?.transcriptStartRevision) && activeEpisode.transcriptStartRevision >= 0
            ? activeEpisode.transcriptStartRevision
            : Number.isInteger(lastCompletedEpisode?.transcriptStartRevision) && lastCompletedEpisode.transcriptStartRevision >= 0
              ? lastCompletedEpisode.transcriptStartRevision
              : 0
      }
    });
  }

  function recordTurnPrimaryReplyCandidate(state, messageIntent) {
    const turnState = state?.activeTerminalTurn || state?.lastCompletedTerminalTurn;
    if (!turnState?.turn || !messageIntent?.turn) {
      return;
    }
    if (turnState.primaryReplyCandidateKey) {
      return;
    }
    const turnId = normalizeNonEmptyString(turnState.turn.turnId);
    if (turnId && turnId !== normalizeNonEmptyString(messageIntent.turn.turnId)) {
      return;
    }
    turnState.primaryReplyCandidateKey =
      normalizeNonEmptyString(messageIntent.intentId) ||
      normalizeNonEmptyString(messageIntent.comparableText);
    turnState.primaryReplyComparableText = normalizeNonEmptyString(messageIntent.comparableText);
    turnState.primaryReplyText = normalizeNonEmptyString(messageIntent.text);
    turnState.primaryReplyScope = normalizeNonEmptyString(messageIntent.metadata?.legacyDeliveryScope);
    turnState.primaryReplyOccurredAt = nowFn();
  }

  function recordOutputEpisodePrimaryIntentCandidate(state, messageIntent) {
    const episodeState = state?.activeOutputEpisode || state?.lastCompletedOutputEpisode;
    if (!episodeState?.outputEpisode || !messageIntent?.outputEpisode) {
      return;
    }
    if (episodeState.primaryIntentOccurredAt) {
      return;
    }
    const episodeId = normalizeNonEmptyString(episodeState.outputEpisode.episodeId);
    const intentEpisodeId = normalizeNonEmptyString(messageIntent.outputEpisode.episodeId);
    const runtimeEpisodeId = normalizeNonEmptyString(messageIntent.outputEpisode.metadata?.runtimeEpisodeId);
    if (episodeId && episodeId !== intentEpisodeId && episodeId !== runtimeEpisodeId) {
      return;
    }
    episodeState.primaryIntentKey =
      normalizeNonEmptyString(messageIntent.intentId) ||
      normalizeNonEmptyString(messageIntent.comparableText);
    episodeState.primaryIntentComparableText = normalizeNonEmptyString(messageIntent.comparableText);
    episodeState.primaryIntentText = normalizeNonEmptyString(messageIntent.text);
    episodeState.primaryIntentScope = normalizeNonEmptyString(messageIntent.metadata?.legacyDeliveryScope);
    episodeState.primaryIntentOccurredAt = nowFn();
  }

  function normalizeTerminalSemanticComparisonCandidate(candidate, source = "") {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const deliveryScope = normalizeNonEmptyString(
      candidate.deliveryScope || candidate.family || candidate.primaryIntentScope || candidate.primaryReplyScope
    );
    const text = normalizeNonEmptyString(candidate.text || candidate.primaryIntentText || candidate.primaryReplyText);
    const comparableText = normalizeNonEmptyString(
      candidate.comparableText ||
        candidate.primaryIntentComparableText ||
        candidate.primaryReplyComparableText ||
        createComparableText(text)
    );
    const deliveryBlockKey = normalizeNonEmptyString(
      candidate.deliveryBlockKey ||
        candidate.key ||
        candidate.primaryIntentKey ||
        candidate.primaryReplyCandidateKey
    );
    if (!deliveryScope || !text || !comparableText) {
      return null;
    }
    return Object.freeze({
      source: normalizeNonEmptyString(source),
      deliveryScope,
      text,
      comparableText,
      deliveryBlockKey
    });
  }

  function buildProjectionTurnSemanticCandidate(session, profile, state) {
    const semanticAdapter = resolveAppSemanticAdapter(session, profile);
    if (!semanticAdapter || !shouldUseProjectionSemanticExtraction(session, profile) || !state?.activeTerminalTurn?.turn) {
      return null;
    }
    if (state?.pendingTerminalTurnAdmission) {
      return null;
    }
    if (
      getProjectionRestartRecoveryReason(session, profile, session?.id, nowFn(), {
        requireFreshInput: false
      })
    ) {
      return null;
    }
    const runtimeSnapshot = buildTurnRuntimeSnapshot(state, state.activeTerminalTurn);
    const semanticDecision = semanticAdapter.buildTurnSemanticDecision(runtimeSnapshot, session, profile);
    if (!semanticDecision?.text) {
      return null;
    }
    return Object.freeze({
      runtimeSnapshot,
      semanticDecision
    });
  }

  function buildProjectionOutputEpisodeSemanticCandidate(session, profile, state) {
    const semanticAdapter = resolveAppSemanticAdapter(session, profile);
    if (!semanticAdapter || !shouldUseProjectionSemanticExtraction(session, profile) || !state?.activeOutputEpisode?.outputEpisode) {
      return null;
    }
    if (
      getProjectionRestartRecoveryReason(session, profile, session?.id, nowFn(), {
        requireFreshInput: true
      })
    ) {
      return null;
    }
    const runtimeSnapshot = buildOutputEpisodeRuntimeSnapshot(state, state.activeOutputEpisode);
    const semanticDecision = semanticAdapter.buildOutputEpisodeSemanticDecision(runtimeSnapshot, session, profile);
    if (!semanticDecision?.text) {
      return null;
    }
    return Object.freeze({
      runtimeSnapshot,
      semanticDecision
    });
  }

  function buildProjectionTurnSemanticDispatchCandidate(session, profile, state, trace) {
    const projectionCandidate = buildProjectionTurnSemanticCandidate(session, profile, state);
    if (!projectionCandidate) {
      return null;
    }
    const messageIntent = buildProjectionSemanticMessageIntent({
      session,
      profile,
      state,
      runtimeSnapshot: projectionCandidate.runtimeSnapshot,
      semanticDecision: projectionCandidate.semanticDecision,
      strategy: "coding-agent-turn-projection",
      trace
    });
    if (!messageIntent) {
      return null;
    }
    return Object.freeze({
      messageIntent,
      normalizedCandidate: normalizeTerminalSemanticComparisonCandidate(
        {
          deliveryScope: projectionCandidate.semanticDecision.deliveryScope,
          text: projectionCandidate.semanticDecision.text,
          comparableText: projectionCandidate.semanticDecision.comparableText,
          deliveryBlockKey: projectionCandidate.semanticDecision.deliveryBlockKey
        },
        "projection"
      )
    });
  }

  function buildProjectionOutputEpisodeSemanticDispatchCandidate(session, profile, state, trace) {
    const projectionCandidate = buildProjectionOutputEpisodeSemanticCandidate(session, profile, state);
    if (!projectionCandidate) {
      return null;
    }
    const messageIntent = buildProjectionSemanticMessageIntent({
      session,
      profile,
      state,
      runtimeSnapshot: projectionCandidate.runtimeSnapshot,
      semanticDecision: projectionCandidate.semanticDecision,
      strategy: "coding-agent-output-episode-projection",
      trace
    });
    if (!messageIntent) {
      return null;
    }
    return Object.freeze({
      messageIntent,
      normalizedCandidate: normalizeTerminalSemanticComparisonCandidate(
        {
          deliveryScope: projectionCandidate.semanticDecision.deliveryScope,
          text: projectionCandidate.semanticDecision.text,
          comparableText: projectionCandidate.semanticDecision.comparableText,
          deliveryBlockKey: projectionCandidate.semanticDecision.deliveryBlockKey
        },
        "projection"
      )
    });
  }

  function buildLegacyTurnSemanticCandidate(state) {
    return normalizeTerminalSemanticComparisonCandidate(buildCodexTelegramReplyDecision(state), "legacy");
  }

  function buildRecordedOutputEpisodePrimaryCandidate(state) {
    const episodeState = state?.activeOutputEpisode || state?.lastCompletedOutputEpisode;
    return normalizeTerminalSemanticComparisonCandidate(episodeState, "legacy");
  }

  function calculateTerminalSemanticComparisonResult(primaryCandidate, shadowCandidate) {
    if (primaryCandidate && shadowCandidate) {
      if (
        primaryCandidate.deliveryScope === shadowCandidate.deliveryScope &&
        primaryCandidate.comparableText === shadowCandidate.comparableText
      ) {
        return "matched";
      }
      return "mismatched";
    }
    if (primaryCandidate) {
      return "primary_only";
    }
    if (shadowCandidate) {
      return "shadow_only";
    }
    return "";
  }

  function createTerminalSemanticComparisonRecord({
    session,
    profile,
    state,
    entityKind,
    primaryCandidate,
    shadowCandidate
  }) {
    const comparisonResult = calculateTerminalSemanticComparisonResult(primaryCandidate, shadowCandidate);
    if (!comparisonResult) {
      return null;
    }
    const comparisonClass = classifyTerminalSemanticComparisonClass({
      session,
      profile,
      state,
      entityKind,
      comparisonResult,
      primaryCandidate,
      shadowCandidate
    });
    return Object.freeze({
      comparisonResult,
      comparisonClass,
      primaryCandidate,
      shadowCandidate
    });
  }

  function recordTerminalSemanticComparison({
    session,
    profile,
    state,
    trace,
    entityKind,
    phase,
    primaryCandidate,
    shadowCandidate
  }) {
    const comparison = createTerminalSemanticComparisonRecord({
      session,
      profile,
      state,
      entityKind,
      primaryCandidate,
      shadowCandidate
    });
    if (!comparison) {
      return null;
    }
    const { comparisonResult, comparisonClass } = comparison;
    terminalSemanticShadowState.comparisonTotal += 1;
    terminalSemanticShadowState.lastComparedAt = nowFn();
    if (comparisonResult === "matched") {
      terminalSemanticShadowState.matchedTotal += 1;
    } else if (comparisonResult === "mismatched") {
      terminalSemanticShadowState.mismatchedTotal += 1;
    } else if (comparisonResult === "primary_only") {
      terminalSemanticShadowState.primaryOnlyTotal += 1;
    } else if (comparisonResult === "shadow_only") {
      terminalSemanticShadowState.shadowOnlyTotal += 1;
    }
    if (comparisonClass) {
      incrementCounterMap(terminalSemanticShadowState.comparisonClassCounters.all, comparisonClass);
      incrementCounterMap(
        terminalSemanticShadowState.comparisonClassCounters.byDecision[comparisonResult],
        comparisonClass
      );
    }
    appendTraceEntry({
      recordedAt: nowFn(),
      sessionId: session?.id,
      sessionLabel: buildSessionLabel(session),
      profile,
      type: "terminal.semantic.compare",
      severity: comparisonResult === "matched" ? "info" : "warning",
      threadKey: "status",
      messageKey: "semantic_shadow",
      decision: comparisonResult,
      reason: normalizeNonEmptyString(phase) || "comparison",
      summary: `${entityKind || "entity"} ${comparisonResult}`,
      text: primaryCandidate?.text || shadowCandidate?.text || "",
      comparableText: primaryCandidate?.comparableText || shadowCandidate?.comparableText || "",
      comparisonResult,
      comparisonClass,
      primaryMode: terminalSemanticShadowState.primaryMode,
      shadowMode:
        terminalSemanticShadowState.shadowModeEnabled
          ? terminalSemanticShadowState.primaryMode === "projection"
            ? "legacy"
            : "projection"
          : "disabled",
      primaryDeliveryScope: primaryCandidate?.deliveryScope || "",
      primaryDeliverySignal: resolveAllowlistDeliverySignal(primaryCandidate?.deliveryScope, primaryCandidate?.deliverySignal),
      shadowDeliveryScope: shadowCandidate?.deliveryScope || "",
      shadowDeliverySignal: resolveAllowlistDeliverySignal(shadowCandidate?.deliveryScope, shadowCandidate?.deliverySignal),
      traceId: trace?.traceId,
      correlationId: trace?.correlationId,
      traceSource: trace?.source,
      appIdentity: getSessionAppIdentity(session)
    });
    logDebug(
      "messaging.semantic.shadow",
      {
        sessionId: session?.id || null,
        entityKind: normalizeNonEmptyString(entityKind),
        phase: normalizeNonEmptyString(phase),
        primaryMode: terminalSemanticShadowState.primaryMode,
        shadowModeEnabled: terminalSemanticShadowState.shadowModeEnabled,
        comparisonResult,
        comparisonClass,
        primaryDeliveryScope: primaryCandidate?.deliveryScope || "",
        primaryDeliverySignal: resolveAllowlistDeliverySignal(primaryCandidate?.deliveryScope, primaryCandidate?.deliverySignal),
        primaryComparableText: primaryCandidate?.comparableText || "",
        shadowDeliveryScope: shadowCandidate?.deliveryScope || "",
        shadowDeliverySignal: resolveAllowlistDeliverySignal(shadowCandidate?.deliveryScope, shadowCandidate?.deliverySignal),
        shadowComparableText: shadowCandidate?.comparableText || ""
      },
      trace || null
    );
    return comparison;
  }

  async function dispatchMessageIntent(session, profile, trace, messageIntent) {
    if (!messageIntent) {
      return null;
    }
    const fallbackEvent = createEventFromMessageIntent({
      session,
      profile,
      trace,
      intent: messageIntent
    });
    const requestedAdapterIds =
      Array.isArray(messageIntent.deliveryAdapters) && messageIntent.deliveryAdapters.length > 0
        ? new Set(
            messageIntent.deliveryAdapters
              .map((descriptor) => normalizeNonEmptyString(descriptor?.adapterId))
              .filter(Boolean)
          )
        : null;
    let delivered = false;
    let attemptedDelivery = false;
    let finalTarget = null;
    let tracedEvent = fallbackEvent;
    let finalDecision = null;
    const deliveryResults = [];
    for (const adapter of adapters) {
      const adapterId = normalizeNonEmptyString(adapter.getStatus?.().adapter);
      if (requestedAdapterIds && adapterId && !requestedAdapterIds.has(adapterId)) {
        continue;
      }
      const target = resolveTargetForAdapter(session, adapterId);
      if (!target) {
        continue;
      }
      attemptedDelivery = true;
      rememberSessionForTarget(target, session);
      const result =
        typeof adapter.handleMessageIntent === "function"
          ? await adapter.handleMessageIntent({
              target,
              session,
              profile,
              trace,
              intent: messageIntent
            })
          : await adapter.handleEvent({
              ...fallbackEvent,
              target,
              decision: {
                action: "new",
                messageKey: fallbackEvent?.threadKey || "status",
                reason: "message_intent_event_fallback"
            }
          });
      const resultTarget = result?.target?.chatId ? result.target : target;
      if (!finalTarget && resultTarget?.chatId) {
        finalTarget = resultTarget;
      }
      if (result?.event) {
        tracedEvent = result.event;
      }
      if (result?.decision && !finalDecision) {
        finalDecision = result.decision;
      }
      if (result?.topicBinding?.chatId && result?.topicBinding?.sessionId && Number.isInteger(result?.topicBinding?.messageThreadId)) {
        await upsertTelegramTopicBinding(result.topicBinding);
      }
      deliveryResults.push({
        adapter: adapterId || "adapter",
        delivered: result?.delivered === true,
        action: result?.action || result?.decision?.action || "",
        error: result?.error || "",
        rateLimited: result?.rateLimited === true,
        retryAfterSeconds: result?.retryAfterSeconds,
        recommendedBackoffMs: result?.recommendedBackoffMs
      });
      delivered = delivered || result?.delivered === true;
      rememberSessionForTarget(resultTarget, session);
    }
    if (!attemptedDelivery) {
      bumpEventMetric(fallbackEvent.profile, fallbackEvent.type, "suppress");
      recordDispatchTrace(
        fallbackEvent,
        {
          action: "suppress",
          messageKey: fallbackEvent?.threadKey || "status",
          reason: "unmapped_target"
        },
        null,
        deliveryResults
      );
      return null;
    }
    const tracedDecision =
      finalDecision ||
      Object.freeze({
        action: "suppress",
        messageKey: tracedEvent?.threadKey || "status",
        reason: "no_delivery_adapter"
      });
    bumpEventMetric(tracedEvent.profile, tracedEvent.type, tracedDecision.action);
    if (delivered) {
      if (normalizeNonEmptyString(tracedEvent?.deliveryScope) === CODEX_SEPARATOR_SUMMARY_SCOPE) {
        const ledgerEntry =
          normalizeNonEmptyString(finalTarget?.adapterId || "telegram") === "telegram"
            ? buildCodexSummaryRestartResendLedgerEntry(tracedEvent, finalTarget)
            : null;
        if (ledgerEntry) {
          await upsertCodexRestartResendLedgerEntry(ledgerEntry);
        }
      }
    }
    rememberSessionForTarget(finalTarget, session);
    recordDispatchTrace(tracedEvent, tracedDecision, finalTarget, deliveryResults);
    return Object.freeze({
      ...tracedDecision,
      delivered,
      delivery: deliveryResults
    });
  }

  async function dispatchProjectionSemanticIntent(session, profile, state, trace, messageIntent, recordPrimaryCandidate) {
    if (!messageIntent) {
      return null;
    }
    if (typeof recordPrimaryCandidate === "function") {
      recordPrimaryCandidate(state, messageIntent);
    }
    return dispatchMessageIntent(session, profile, trace, messageIntent);
  }

  function shouldAllowProjectionAuthority({
    session,
    profile,
    state,
    entityKind,
    comparison,
    primaryMode,
    projectionCandidate,
    legacyCandidate
  }) {
    if (!projectionCandidate) {
      return false;
    }
    if (!comparison) {
      return !isNoisySemanticCandidate(projectionCandidate, session, profile);
    }
    if (isNoisySemanticCandidate(projectionCandidate, session, profile)) {
      return false;
    }
    if (comparison.comparisonClass === "restart_remount_noise") {
      return false;
    }
    if (comparison.comparisonClass === "overlapping_turn_ownership" && state?.pendingTerminalTurnAdmission) {
      return false;
    }
    if (comparison.comparisonClass === "premature_quiet_boundary") {
      if (legacyCandidate && isMeaningfulSemanticSuperset(legacyCandidate, projectionCandidate, session, profile)) {
        return false;
      }
      return primaryMode !== "legacy" || !legacyCandidate;
    }
    if (comparison.comparisonClass === "overlay_working_noise") {
      return true;
    }
    if (comparison.comparisonResult === "matched") {
      return true;
    }
    if (primaryMode === "legacy" && legacyCandidate) {
      return false;
    }
    if (legacyCandidate && isMeaningfulSemanticSuperset(legacyCandidate, projectionCandidate, session, profile)) {
      return false;
    }
    if (isRiskyProjectionComparisonClass(comparison.comparisonClass)) {
      return false;
    }
    return true;
  }

  async function maybeDispatchConfiguredTurnSemanticIntent(session, profile, state, trace) {
    if (!shouldUseProjectionSemanticExtraction(session, profile) || !state?.activeTerminalTurn?.turn) {
      return null;
    }
    const projectionDispatchCandidate = buildProjectionTurnSemanticDispatchCandidate(session, profile, state, trace);
    const legacyDecision = buildCodexTelegramReplyDecision(state);
    const legacyCandidate = normalizeTerminalSemanticComparisonCandidate(legacyDecision, "legacy");
    const projectionCandidate = projectionDispatchCandidate?.normalizedCandidate || null;
    const comparison =
      terminalSemanticShadowState.shadowModeEnabled
        ? recordTerminalSemanticComparison({
            session,
            profile,
            state,
            trace,
            entityKind: "turn",
            phase: "turn_completion",
            primaryCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? projectionCandidate : legacyCandidate,
            shadowCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? legacyCandidate : projectionCandidate
          })
        : createTerminalSemanticComparisonRecord({
            session,
            profile,
            state,
            entityKind: "turn",
            primaryCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? projectionCandidate : legacyCandidate,
            shadowCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? legacyCandidate : projectionCandidate
          });
    const turnState = state?.activeTerminalTurn;
    const primaryAlreadyRecorded = Number.isInteger(turnState?.primaryReplyOccurredAt) && turnState.primaryReplyOccurredAt > 0;
    let dispatchResult = null;
    if (!primaryAlreadyRecorded) {
      if (terminalSemanticShadowState.primaryMode === "projection") {
        if (
          projectionDispatchCandidate?.messageIntent &&
          shouldAllowProjectionAuthority({
            session,
            profile,
            state,
            entityKind: "turn",
            comparison,
            primaryMode: terminalSemanticShadowState.primaryMode,
            projectionCandidate,
            legacyCandidate
          })
        ) {
          dispatchResult = await dispatchProjectionSemanticIntent(
            session,
            profile,
            state,
            trace,
            projectionDispatchCandidate.messageIntent,
            recordTurnPrimaryReplyCandidate
          );
        } else if (legacyDecision) {
          dispatchResult = await dispatchCodexAllowlistCandidate(session, profile, state, trace, legacyDecision);
        }
      } else if (legacyDecision) {
        dispatchResult = await dispatchCodexAllowlistCandidate(session, profile, state, trace, legacyDecision);
      } else if (
        projectionDispatchCandidate?.messageIntent &&
        shouldAllowProjectionAuthority({
          session,
          profile,
          state,
          entityKind: "turn",
          comparison,
          primaryMode: terminalSemanticShadowState.primaryMode,
          projectionCandidate,
          legacyCandidate
        })
      ) {
        dispatchResult = await dispatchProjectionSemanticIntent(
          session,
          profile,
          state,
          trace,
          projectionDispatchCandidate.messageIntent,
          recordTurnPrimaryReplyCandidate
        );
      }
    }
    clearPendingCodexTelegramReply(state);
    return dispatchResult;
  }

  async function maybeFinalizeOutputEpisodeSemanticShadow(session, profile, state, trace) {
    if (!shouldUseProjectionSemanticExtraction(session, profile) || !state?.activeOutputEpisode?.outputEpisode) {
      return null;
    }
    const projectionDispatchCandidate = buildProjectionOutputEpisodeSemanticDispatchCandidate(session, profile, state, trace);
    const projectionCandidate = projectionDispatchCandidate?.normalizedCandidate || null;
    const legacyCandidate = buildRecordedOutputEpisodePrimaryCandidate(state);
    const comparison =
      terminalSemanticShadowState.shadowModeEnabled
        ? recordTerminalSemanticComparison({
            session,
            profile,
            state,
            trace,
            entityKind: "output_episode",
            phase: "quiet_window",
            primaryCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? projectionCandidate : legacyCandidate,
            shadowCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? legacyCandidate : projectionCandidate
          })
        : createTerminalSemanticComparisonRecord({
            session,
            profile,
            state,
            entityKind: "output_episode",
            primaryCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? projectionCandidate : legacyCandidate,
            shadowCandidate:
              terminalSemanticShadowState.primaryMode === "projection" ? legacyCandidate : projectionCandidate
          });
    const episodeState = state?.activeOutputEpisode;
    const primaryAlreadyRecorded = Number.isInteger(episodeState?.primaryIntentOccurredAt) && episodeState.primaryIntentOccurredAt > 0;
    if (primaryAlreadyRecorded || !projectionDispatchCandidate?.messageIntent) {
      return null;
    }
    if (
      (terminalSemanticShadowState.primaryMode === "projection" || !legacyCandidate) &&
      shouldAllowProjectionAuthority({
        session,
        profile,
        state,
        entityKind: "output_episode",
        comparison,
        primaryMode: terminalSemanticShadowState.primaryMode,
        projectionCandidate,
        legacyCandidate
      })
    ) {
      return dispatchProjectionSemanticIntent(
        session,
        profile,
        state,
        trace,
        projectionDispatchCandidate.messageIntent,
        recordOutputEpisodePrimaryIntentCandidate
      );
    }
    return null;
  }

  function shouldUseProjectionSemanticExtraction(session, profile) {
    return telegramOutboundHardBreakActive === true && telegramAllowlistDeliveryActive && Boolean(resolveAppSemanticAdapter(session, profile));
  }

  function buildProjectionSemanticMessageIntent({
    session,
    profile,
    state,
    runtimeSnapshot,
    semanticDecision,
    strategy,
    trace
  }) {
    if (!semanticDecision?.text) {
      return null;
    }
    const deliverySignal = getAllowlistDeliverySignalForScope(semanticDecision.deliveryScope);
    const projection = buildMessageIntentProjection(state, session, profile, {
      deliveryScope: normalizeNonEmptyString(semanticDecision.deliveryScope),
      deliveryBlockKey: normalizeNonEmptyString(semanticDecision.deliveryBlockKey),
      firstObservedAt: Number.isInteger(runtimeSnapshot?.baseline?.revision) ? runtimeSnapshot.baseline.revision : 0,
      lastObservedAt: Number.isInteger(runtimeSnapshot?.diff?.toRevision) ? runtimeSnapshot.diff.toRevision : 0,
      traceId: normalizeNonEmptyString(trace?.traceId),
      projectionSource: normalizeNonEmptyString(semanticDecision.metadata?.semanticExtractionSource)
    });
    const semanticAdapter = buildAppSemanticAdapterDescriptorForSession(session, profile, strategy);
    if (runtimeSnapshot?.turn) {
      return createMessageIntent({
        intentId:
          normalizeNonEmptyString(runtimeSnapshot.turn.turnId) ||
          normalizeNonEmptyString(trace?.correlationId) ||
          normalizeNonEmptyString(trace?.traceId),
        sessionId: session.id,
        intentKind: deliverySignal || "reply",
        eventType: "session.output.summary",
        severity: "info",
        threadKey: "status",
        text: semanticDecision.text,
        format: semanticDecision.format,
        comparableText: semanticDecision.comparableText,
        projection,
        turn: runtimeSnapshot.turn,
        semanticAdapter,
        deliveryAdapters: deliveryAdapterDescriptors,
        routing: {
          threadKey: "status",
          priority: "primary"
        },
        metadata: semanticDecision.metadata
          ? {
              ...semanticDecision.metadata,
              deliverySignal
            }
          : { deliverySignal }
      });
    }
    return createMessageIntent({
      intentId:
        normalizeNonEmptyString(runtimeSnapshot?.outputEpisode?.episodeId) ||
        normalizeNonEmptyString(trace?.traceId),
      sessionId: session.id,
      intentKind: deliverySignal || "autonomous-update",
      eventType: "session.output.summary",
      severity: "info",
      threadKey: "status",
      text: semanticDecision.text,
      format: semanticDecision.format,
      comparableText: semanticDecision.comparableText,
      projection,
      outputEpisode: runtimeSnapshot.outputEpisode,
      semanticAdapter,
      deliveryAdapters: deliveryAdapterDescriptors,
      routing: {
        threadKey: "status",
        priority: "secondary"
      },
      metadata: semanticDecision.metadata
        ? {
            ...semanticDecision.metadata,
            deliverySignal
          }
        : { deliverySignal }
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
    const messageText = normalizeLineBreaks(String(decision?.text || ""));
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
    if (!messageText || candidateKey === lastCandidateKey) {
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
      messageText,
      candidateKey,
      deliveryBlockKey,
      maxLength
    });
    if (deliveryScope === CODEX_TELEGRAM_REPLY_SCOPE) {
      recordTurnPrimaryReplyCandidate(state, messageIntent);
    } else {
      recordOutputEpisodePrimaryIntentCandidate(state, messageIntent);
    }
    const event = createEventFromMessageIntent({
      session,
      profile,
      trace,
      intent: messageIntent
    });
    if (isCommentaryLikeCodexOutboundText(messageText, session, profile)) {
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
    const dispatchResult = await dispatchMessageIntent(session, profile, trace, messageIntent);
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
    const primaryTarget = resolveTarget(event.session);
    if (!primaryTarget) {
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
    rememberSessionForTarget(primaryTarget, event.session);
    const threadState = getThreadState(primaryTarget, event.sessionId, event.threadKey);
    const decision = applyMessagingMessagePolicy(event, threadState);
    bumpEventMetric(event.profile, event.type, decision.action);
    if (decision.action === "suppress") {
      recordDispatchTrace(event, decision, primaryTarget, []);
      return Object.freeze({
        ...decision,
        delivered: false,
        delivery: []
      });
    }
    advanceMessagingThreadPolicyState(threadState, event, decision, { delivered: false });
    let delivered = false;
    let attemptedDelivery = false;
    const deliveryResults = [];
    let finalTarget = primaryTarget;
    for (const adapter of adapters) {
      const adapterId = normalizeNonEmptyString(adapter.getStatus?.().adapter);
      const target = resolveTargetForAdapter(event.session, adapterId);
      if (!target) {
        continue;
      }
      attemptedDelivery = true;
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
    if (!attemptedDelivery) {
      recordDispatchTrace(
        event,
        {
          action: "suppress",
          messageKey: event?.threadKey || "status",
          reason: "unmapped_target"
        },
        null,
        deliveryResults
      );
      return null;
    }
    if (delivered) {
      advanceMessagingThreadPolicyState(threadState, event, decision, { delivered: true });
      if (normalizeNonEmptyString(event?.deliveryScope) === CODEX_SEPARATOR_SUMMARY_SCOPE) {
        const ledgerEntry =
          normalizeNonEmptyString(finalTarget?.adapterId || "telegram") === "telegram"
            ? buildCodexSummaryRestartResendLedgerEntry(event, finalTarget)
            : null;
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
      closeActiveTurn(state, nowFn(), "terminated");
      closeActiveOutputEpisode(state, nowFn(), "terminated");
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
      closeActiveTurn(state, nowFn(), "closed");
      closeActiveOutputEpisode(state, nowFn(), "closed");
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
    const projectionSemanticTurnActive =
      shouldUseProjectionSemanticExtraction(session, profile) && Boolean(state?.activeTerminalTurn?.turn);
    const collectLegacyTurnReplyLines =
      projectionSemanticTurnActive &&
      (terminalSemanticShadowState.primaryMode === "legacy" || terminalSemanticShadowState.shadowModeEnabled);
    const legacyTurnReplyDispatchEnabled = !projectionSemanticTurnActive;
    const chunk = typeof data === "string" ? data : String(data ?? "");
    const normalizedPromptBoundaries = Array.from(
      new Set(
        (Array.isArray(promptBoundaries) ? promptBoundaries : [])
          .map((entry) => (Number.isInteger(entry) && entry >= 0 && entry <= chunk.length ? entry : null))
          .filter((entry) => entry !== null)
      )
    ).sort((left, right) => left - right);
    const hasVisibleChunk = Boolean(normalizeVisibleReplayText(chunk).trim());
    if (state?.pendingBoundarySettlement && (chunk || normalizedPromptBoundaries.length > 0)) {
      clearPendingBoundarySettlement(state);
      reopenQuietingTerminalOwnership(state);
      logDebug(
        "terminal.orchestration.quiet_boundary_cancelled",
        {
          sessionId: normalizeNonEmptyString(session?.id),
          activeTurnId: normalizeNonEmptyString(state?.activeTerminalTurn?.turn?.turnId),
          activeEpisodeId: normalizeNonEmptyString(state?.activeOutputEpisode?.outputEpisode?.episodeId)
        },
        trace
      );
    }
    if (state?.activeTerminalTurn?.turn) {
      ensureActiveTurnBaseline(state);
    } else {
      ensureAutonomousOutputEpisode(state, session, profile, trace, hasVisibleChunk);
    }
    if (chunk || normalizedPromptBoundaries.length > 0) {
      const geometry = getSessionGeometry(session);
      await terminalProjection.observeData(chunk, {
        observedAt: nowFn(),
        promptBoundaries: normalizedPromptBoundaries,
        cols: geometry.cols,
        rows: geometry.rows
      });
      recordProjectionRevisionObservation(state);
    }
    async function dispatchPromptReady() {
      if (projectionSemanticTurnActive) {
        await maybeDispatchConfiguredTurnSemanticIntent(session, profile, state, trace);
      } else {
        await maybeDispatchPendingCodexTelegramReply(session, profile, state, trace);
      }
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
      if (
        (
          !projectionSemanticTurnActive ||
          collectLegacyTurnReplyLines
        ) &&
        (await observeCodexTelegramReplyLine(session, profile, state, trace, replyVisibleLine, {
          dispatchEnabled: legacyTurnReplyDispatchEnabled
        }))
      ) {
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
      if (normalizedPromptBoundaries.length > 0 && isCodexAppIdentity(session) && !projectionSemanticTurnActive) {
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
    if (isCodexAppIdentity(session) && !projectionSemanticTurnActive) {
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
    observeTurnCompletionBoundary(state, session, trace);
    if (hasActiveTerminalOwnership(state)) {
      clearPendingBoundarySettlement(state);
      state.pendingBoundarySettlement = {
        settlementId: `settlement:${session.id}:${nowFn()}`,
        settledAt:
          (Number.isInteger(session?.activityCompletedAt) && session.activityCompletedAt > 0
            ? session.activityCompletedAt
            : 0) || nowFn(),
        timer: null
      };
      logDebug(
        "terminal.orchestration.quiet_boundary_pending",
        {
          sessionId: normalizeNonEmptyString(session?.id),
          activeTurnId: normalizeNonEmptyString(state?.activeTerminalTurn?.turn?.turnId),
          activeEpisodeId: normalizeNonEmptyString(state?.activeOutputEpisode?.outputEpisode?.episodeId),
          pendingTurnAdmission: Boolean(state?.pendingTerminalTurnAdmission),
          settleDelayMs: terminalOrchestrationBoundarySettleMs
        },
        trace
      );
      if (terminalOrchestrationBoundarySettleMs <= 0) {
        clearPendingBoundarySettlement(state);
        await finalizeSettledBoundary(session, profile, state, trace);
        return;
      }
      scheduleBoundarySettlement(session, profile, state, trace);
      return;
    }
    await finalizeSettledBoundary(session, profile, state, trace);
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
    for (const state of sessionStates.values()) {
      clearPendingBoundarySettlement(state);
    }
    for (const adapter of adapters) {
      if (typeof adapter.stop === "function") {
        await adapter.stop();
      }
    }
  }

  function buildStatusSummary() {
    const adapterStatuses = adapters.map((adapter) => adapter.getStatus());
    const anyAdapterEnabled = adapterStatuses.some((status) => status?.enabled === true);
    const anyAdapterDeliveryEnabled = adapterStatuses.some((status) => status?.deliveryEnabled === true);
    const recoveringSessionCount = Array.from(codexSummaryRestartRecoveryStates.values()).filter((entry) => entry?.active).length;
    const activeReplySessionCount = Array.from(sessionStates.values()).filter((entry) => isCodexTelegramReplyActive(entry?.pendingCodexTelegramReply, nowFn())).length;
    const activeProjectionSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.terminalProjection).length;
    const activeTurnSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.activeTerminalTurn?.turn).length;
    const completedTurnSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.lastCompletedTerminalTurn?.turn).length;
    const activeOutputEpisodeSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.activeOutputEpisode?.outputEpisode).length;
    const completedOutputEpisodeSessionCount = Array.from(sessionStates.values()).filter((entry) => entry?.lastCompletedOutputEpisode?.outputEpisode).length;
    const comparisonDifferenceCount =
      terminalSemanticShadowState.mismatchedTotal +
      terminalSemanticShadowState.primaryOnlyTotal +
      terminalSemanticShadowState.shadowOnlyTotal;
    const comparisonMismatchRate =
      terminalSemanticShadowState.comparisonTotal > 0
        ? comparisonDifferenceCount / terminalSemanticShadowState.comparisonTotal
        : 0;
    const shadowTargetMode =
      terminalSemanticShadowState.shadowModeEnabled
        ? terminalSemanticShadowState.primaryMode === "projection"
          ? "legacy"
          : "projection"
        : "disabled";
    const cutoverReady =
      terminalSemanticShadowState.shadowModeEnabled &&
      terminalSemanticShadowState.comparisonTotal >= terminalSemanticShadowState.cutoverMinComparisons &&
      comparisonMismatchRate <= terminalSemanticShadowState.cutoverMaxMismatchRate;
    return {
      enabled: anyAdapterEnabled,
      deliveryEnabled: anyAdapterDeliveryEnabled,
      deliveryHardBreakActive: telegramOutboundHardBreakActive,
      allowlistDeliveryActive: telegramAllowlistDeliveryActive,
      allowlistDeliveryScopes: telegramAllowlistDeliveryScopes.slice(),
      allowlistDeliverySignals: telegramAllowlistDeliverySignals.slice(),
      codexTelegramReplyCorrelation: {
        windowMs: CODEX_TELEGRAM_REPLY_WINDOW_MS,
        activeSessionCount: activeReplySessionCount
      },
      terminalMessagingCore: {
        active: true,
        bridgeMode: "projection-turn-episode-bridge",
        deliveryAdapters: deliveryAdapterDescriptors.map((descriptor) => descriptor.adapterId),
        semanticAdapterIds: appSemanticAdapterRegistry.listAdapterIds(),
        activeProjectionSessionCount,
        activeTurnSessionCount,
        completedTurnSessionCount,
        activeOutputEpisodeSessionCount,
        completedOutputEpisodeSessionCount,
        projectionResourceLimits: DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS,
        semanticExtraction: {
          primaryMode: terminalSemanticShadowState.primaryMode,
          shadowModeEnabled: terminalSemanticShadowState.shadowModeEnabled,
          shadowTargetMode,
          cutoverMinComparisons: terminalSemanticShadowState.cutoverMinComparisons,
          cutoverMaxMismatchRate: terminalSemanticShadowState.cutoverMaxMismatchRate,
          comparisons: {
            total: terminalSemanticShadowState.comparisonTotal,
            matched: terminalSemanticShadowState.matchedTotal,
            mismatched: terminalSemanticShadowState.mismatchedTotal,
            primaryOnly: terminalSemanticShadowState.primaryOnlyTotal,
            shadowOnly: terminalSemanticShadowState.shadowOnlyTotal,
            byClass: buildSortedCounterEntries(terminalSemanticShadowState.comparisonClassCounters.all),
            mismatchedByClass: buildSortedCounterEntries(
              terminalSemanticShadowState.comparisonClassCounters.byDecision.mismatched
            ),
            primaryOnlyByClass: buildSortedCounterEntries(
              terminalSemanticShadowState.comparisonClassCounters.byDecision.primary_only
            ),
            shadowOnlyByClass: buildSortedCounterEntries(
              terminalSemanticShadowState.comparisonClassCounters.byDecision.shadow_only
            ),
            mismatchRate: comparisonMismatchRate,
            cutoverReady,
            lastComparedAt: terminalSemanticShadowState.lastComparedAt
          }
        },
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
      adapters: adapterStatuses,
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

  function observeSessionActivityStarted({ sessionId, trace }) {
    return runSessionWork(sessionId, () => observeSessionActivityStartedInternal({ sessionId, trace }));
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
    observeSessionActivityStarted,
    observeSessionData,
    observeSessionIdle,
    observeShareChange,
    captureTerminalProjectionSnapshot,
    captureTerminalOrchestrationState,
    createTerminalProjectionBaseline: createTerminalProjectionBaselineForSession,
    getTerminalProjectionTranscriptDelta,
    diffTerminalProjectionBaseline: diffTerminalProjectionBaselineForSession,
    buildStatusSummary,
    renderMetricLines
  };
}
