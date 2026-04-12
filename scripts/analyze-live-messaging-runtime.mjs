#!/usr/bin/env node

import fs from "node:fs";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/analyze-live-messaging-runtime.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-live-messaging-runtime.mjs [--log <path>] [--capture-file <path>] [--since-minutes <count>] [--deck-id <deck>] [--session-name <name>] [--thread-id <id>] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let logFile = "/tmp/ptydeck-backend-debug.log";
let captureFile = "/tmp/ptydeck-session-stream-analysis.jsonl";
let sinceMinutes = 20;
let deckId = "";
let sessionName = "";
let threadId = "";
let format = "text";

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--log") {
    logFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--capture-file") {
    captureFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--since-minutes") {
    sinceMinutes = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--deck-id") {
    deckId = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--session-name") {
    sessionName = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--thread-id") {
    threadId = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--format") {
    format = args[index + 1] || "";
    index += 1;
    continue;
  }
  usage();
}

if (!logFile || !["json", "text"].includes(format) || !Number.isFinite(sinceMinutes) || sinceMinutes < 0) {
  usage();
}

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function decodeBase64Text(encoded) {
  if (typeof encoded !== "string" || !encoded) {
    return "";
  }
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function truncateText(value, maxLength = 160) {
  const normalized = normalizeVisibleReplayText(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function parseDebugLine(line) {
  const match = /^\[ptydeck-backend\]\[([^\]]+)\] ([^ ]+) (\{.*\})$/.exec(line);
  if (!match) {
    return null;
  }
  let payload = null;
  try {
    payload = JSON.parse(match[3]);
  } catch {
    return null;
  }
  return {
    timestamp: match[1],
    timestampMs: parseTimestamp(match[1]),
    event: match[2],
    payload
  };
}

function loadCaptureIndex(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      bySessionId: new Map(),
      sessionMetaById: new Map()
    };
  }
  const bySessionId = new Map();
  const sessionMetaById = new Map();
  const lines = normalizeLineBreaks(fs.readFileSync(filePath, "utf8")).split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const id = typeof parsed?.session?.id === "string" ? parsed.session.id : "";
    if (!id) {
      continue;
    }
    const timestamp = typeof parsed?.timestamp === "string" ? parsed.timestamp : "";
    const timestampMs = parseTimestamp(timestamp);
    const visiblePreview = truncateText(
      parsed?.cleaned?.visiblePreview
      || decodeBase64Text(parsed?.cleaned?.base64 || parsed?.raw?.base64 || "")
    );
    const entry = {
      timestamp,
      timestampMs,
      preview: visiblePreview,
      promptBoundaries: Array.isArray(parsed?.promptBoundaries) ? parsed.promptBoundaries.length : 0
    };
    if (!bySessionId.has(id)) {
      bySessionId.set(id, []);
    }
    bySessionId.get(id).push(entry);
    if (!sessionMetaById.has(id)) {
      sessionMetaById.set(id, {
        sessionId: id,
        sessionName: typeof parsed?.session?.name === "string" ? parsed.session.name : "",
        deckId: typeof parsed?.session?.deckId === "string" ? parsed.session.deckId : "",
        appLabel: typeof parsed?.appIdentity?.label === "string" ? parsed.appIdentity.label : ""
      });
    }
  }
  for (const entries of bySessionId.values()) {
    entries.sort((left, right) => left.timestampMs - right.timestampMs);
  }
  return { bySessionId, sessionMetaById };
}

function parseTopicName(topicName) {
  const normalized = String(topicName || "").trim();
  if (!normalized) {
    return { deckId: "", sessionName: "" };
  }
  const separatorIndex = normalized.indexOf(" + ");
  if (separatorIndex < 0) {
    return { deckId: "", sessionName: normalized };
  }
  return {
    deckId: normalized.slice(0, separatorIndex).trim(),
    sessionName: normalized.slice(separatorIndex + 3).trim()
  };
}

function buildDebugMetaIndex(parsedLines) {
  const sessionMetaById = new Map();
  for (const line of parsedLines) {
    if (line.event !== "messaging.target.update") {
      continue;
    }
    const sessionId = String(line?.payload?.sessionId || "");
    if (!sessionId) {
      continue;
    }
    const topicName = String(line?.payload?.topicName || "");
    const parsedTopic = parseTopicName(topicName);
    const previous = sessionMetaById.get(sessionId) || {};
    sessionMetaById.set(sessionId, {
      sessionId,
      sessionName: parsedTopic.sessionName || previous.sessionName || "",
      deckId: parsedTopic.deckId || previous.deckId || "",
      appLabel: previous.appLabel || ""
    });
  }
  return { sessionMetaById };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topCounts(map, limit = 10) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function findSessionMeta(sessionId, captureIndex, debugMetaIndex, fallback = {}) {
  return captureIndex.sessionMetaById.get(sessionId) || debugMetaIndex.sessionMetaById.get(sessionId) || {
    sessionId,
    sessionName: fallback.sessionName || "",
    deckId: fallback.deckId || "",
    appLabel: fallback.appLabel || ""
  };
}

function correlateInputToCapture(inputEvent, captureIndex) {
  const sessionEntries = captureIndex.bySessionId.get(inputEvent.sessionId) || [];
  if (sessionEntries.length === 0 || !inputEvent.timestampMs) {
    return {
      followupEntries: 0,
      followupPreview: ""
    };
  }
  const windowEnd = inputEvent.timestampMs + 15000;
  const followups = sessionEntries.filter((entry) => entry.timestampMs >= inputEvent.timestampMs && entry.timestampMs <= windowEnd && entry.preview);
  return {
    followupEntries: followups.length,
    followupPreview: followups.length > 0 ? followups[0].preview : ""
  };
}

function createSessionStat(meta) {
  return {
    sessionId: meta.sessionId || "",
    sessionName: meta.sessionName || "",
    deckId: meta.deckId || "",
    appLabel: meta.appLabel || "",
    inboundInputsHandled: 0,
    inboundCommandsHandled: 0,
    deliveredAllowlist: 0,
    deliveredScopes: new Map(),
    blockedSeparatorHints: 0,
    blockedAttention: 0,
    blockedStatusUpdates: 0,
    lastDeliveredAt: "",
    lastDeliveredPreview: "",
    lastBlockedSeparatorPreview: "",
    lastInboundPreview: ""
  };
}

function getSessionStat(statsBySession, sessionId, captureIndex, debugMetaIndex, fallback = {}) {
  const meta = findSessionMeta(sessionId, captureIndex, debugMetaIndex, fallback);
  if (!statsBySession.has(sessionId)) {
    statsBySession.set(sessionId, createSessionStat(meta));
  }
  return statsBySession.get(sessionId);
}

function normalizeDuplicateKey(trace) {
  return [
    trace.payload.sessionId || "",
    trace.payload.targetThreadId || "",
    trace.payload.deliveryScope || "",
    trace.payload.reason || "",
    String(trace.payload.comparableText || "").trim().toLowerCase()
  ].join("|");
}

function analyzeLogs(parsedLines, captureIndex, debugMetaIndex) {
  const inboundPhaseCounts = new Map();
  const inboundReasonCounts = new Map();
  const deliveredScopeCounts = new Map();
  const blockedReasonCounts = new Map();
  const duplicateDelivered = new Map();
  const statusUpdateBySession = new Map();
  const statsBySession = new Map();
  const recentHandledInputs = [];
  const deliveredEvents = [];
  const blockedSeparatorHintExamples = [];
  const blockedAttentionExamples = [];
  const summaryOnlyMisses = [];

  for (const line of parsedLines) {
    if (line.event === "messaging.inbound.update") {
      const phase = String(line.payload.phase || "");
      const reason = String(line.payload.reason || "");
      increment(inboundPhaseCounts, phase || "unknown");
      increment(inboundReasonCounts, reason || "unknown");
      continue;
    }

    if (line.event === "messaging.inbound.action") {
      const sessionId = String(line.payload.sessionId || "");
      const stat = getSessionStat(statsBySession, sessionId, captureIndex, debugMetaIndex);
      const action = String(line.payload.action || "");
      if (line.payload.ok === true && action === "input") {
        stat.inboundInputsHandled += 1;
        stat.lastInboundPreview = String(line.payload.preview || "");
        const correlation = correlateInputToCapture({ sessionId, timestampMs: line.timestampMs }, captureIndex);
        recentHandledInputs.push({
          timestamp: line.timestamp,
          sessionId,
          sessionName: stat.sessionName,
          deckId: stat.deckId,
          chatId: String(line.payload.chatId || ""),
          threadId: String(line.payload.messageThreadId || ""),
          preview: truncateText(String(line.payload.preview || "")),
          followupEntries: correlation.followupEntries,
          followupPreview: truncateText(correlation.followupPreview)
        });
      }
      if (line.payload.ok === true && action && action !== "input") {
        stat.inboundCommandsHandled += 1;
      }
      continue;
    }

    if (line.event !== "messaging.event.trace") {
      continue;
    }

    const payload = line.payload || {};
    const sessionId = String(payload.sessionId || "");
    const stat = getSessionStat(statsBySession, sessionId, captureIndex, debugMetaIndex);
    const deliveries = Array.isArray(payload.delivery) ? payload.delivery : [];
    const delivered = deliveries.some((entry) => entry?.delivered === true);
    const scope = String(payload.deliveryScope || "");
    const reason = String(payload.reason || "");
    const type = String(payload.type || "");
    const comparableText = truncateText(String(payload.comparableText || ""), 220);
    const aggregationReason = String(payload.aggregationReason || "");

    if (delivered) {
      stat.deliveredAllowlist += 1;
      stat.lastDeliveredAt = line.timestamp;
      stat.lastDeliveredPreview = comparableText;
      increment(stat.deliveredScopes, scope || "unspecified");
      increment(deliveredScopeCounts, scope || "unspecified");
      deliveredEvents.push({
        timestamp: line.timestamp,
        sessionId,
        sessionName: stat.sessionName,
        deckId: stat.deckId,
        scope,
        reason,
        threadId: String(payload.targetThreadId || ""),
        action: String(payload.action || ""),
        comparableText
      });
      const duplicateKey = normalizeDuplicateKey(line);
      if (!duplicateDelivered.has(duplicateKey)) {
        duplicateDelivered.set(duplicateKey, []);
      }
      duplicateDelivered.get(duplicateKey).push({
        timestamp: line.timestamp,
        scope,
        reason,
        threadId: String(payload.targetThreadId || ""),
        sessionId,
        sessionName: stat.sessionName,
        comparableText
      });
      continue;
    }

    increment(blockedReasonCounts, reason || "unknown");

    if (reason === "attention_required") {
      stat.blockedAttention += 1;
      blockedAttentionExamples.push({
        timestamp: line.timestamp,
        sessionId,
        sessionName: stat.sessionName,
        threadId: String(payload.targetThreadId || ""),
        comparableText
      });
    }

    if (reason === "status_update") {
      stat.blockedStatusUpdates += 1;
      if (aggregationReason === "separator_hint" && !scope) {
        stat.blockedSeparatorHints += 1;
        stat.lastBlockedSeparatorPreview = comparableText;
        increment(statusUpdateBySession, `${stat.deckId || "?"}/${stat.sessionName || sessionId}`);
        const example = {
          timestamp: line.timestamp,
          sessionId,
          sessionName: stat.sessionName,
          deckId: stat.deckId,
          appLabel: stat.appLabel,
          threadId: String(payload.targetThreadId || ""),
          comparableText
        };
        blockedSeparatorHintExamples.push(example);
        if (type === "session.output.summary") {
          summaryOnlyMisses.push(example);
        }
      }
    }
  }

  const duplicateGroups = Array.from(duplicateDelivered.values())
    .filter((entries) => entries.length > 1)
    .map((entries) => ({
      count: entries.length,
      sessionId: entries[0].sessionId,
      sessionName: entries[0].sessionName,
      threadId: entries[0].threadId,
      scope: entries[0].scope,
      reason: entries[0].reason,
      comparableText: entries[0].comparableText,
      firstTimestamp: entries[0].timestamp,
      lastTimestamp: entries[entries.length - 1].timestamp
    }))
    .sort((left, right) => right.count - left.count || left.firstTimestamp.localeCompare(right.firstTimestamp));

  const sessionSummaries = Array.from(statsBySession.values())
    .filter((entry) => {
      if (deckId && entry.deckId !== deckId) {
        return false;
      }
      if (sessionName && entry.sessionName !== sessionName) {
        return false;
      }
      return (
        entry.inboundInputsHandled > 0
        || entry.deliveredAllowlist > 0
        || entry.blockedSeparatorHints > 0
        || entry.blockedAttention > 0
        || entry.blockedStatusUpdates > 0
      );
    })
    .map((entry) => ({
      sessionId: entry.sessionId,
      sessionName: entry.sessionName,
      deckId: entry.deckId,
      appLabel: entry.appLabel,
      inboundInputsHandled: entry.inboundInputsHandled,
      inboundCommandsHandled: entry.inboundCommandsHandled,
      deliveredAllowlist: entry.deliveredAllowlist,
      deliveredScopes: topCounts(entry.deliveredScopes, 5),
      blockedSeparatorHints: entry.blockedSeparatorHints,
      blockedAttention: entry.blockedAttention,
      blockedStatusUpdates: entry.blockedStatusUpdates,
      lastDeliveredAt: entry.lastDeliveredAt,
      lastDeliveredPreview: entry.lastDeliveredPreview,
      lastBlockedSeparatorPreview: entry.lastBlockedSeparatorPreview,
      lastInboundPreview: truncateText(entry.lastInboundPreview)
    }))
    .sort((left, right) => {
      const score = (entry) => entry.deliveredAllowlist + entry.blockedSeparatorHints + entry.inboundInputsHandled + entry.blockedAttention;
      return score(right) - score(left) || left.sessionName.localeCompare(right.sessionName);
    });

  return {
    inboundPhaseCounts: topCounts(inboundPhaseCounts, 10),
    inboundReasonCounts: topCounts(inboundReasonCounts, 10),
    deliveredScopeCounts: topCounts(deliveredScopeCounts, 10),
    blockedReasonCounts: topCounts(blockedReasonCounts, 15),
    statusUpdateBySession: topCounts(statusUpdateBySession, 15),
    recentHandledInputs: recentHandledInputs.slice(-10),
    deliveredEvents: deliveredEvents.slice(-15),
    blockedSeparatorHintExamples: blockedSeparatorHintExamples.slice(-15),
    blockedAttentionExamples: blockedAttentionExamples.slice(-10),
    summaryOnlyMisses: summaryOnlyMisses.slice(-10),
    duplicateGroups,
    sessionSummaries
  };
}

function formatCounts(title, items) {
  const lines = [`${title}`];
  if (!items || items.length === 0) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const item of items) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  return lines.join("\n");
}

function formatEntries(title, items, formatter) {
  const lines = [title];
  if (!items || items.length === 0) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const item of items) {
    lines.push(`- ${formatter(item)}`);
  }
  return lines.join("\n");
}

function formatTextReport(report) {
  const lines = [];
  lines.push("Window");
  lines.push(`- logFile: ${report.window.logFile}`);
  lines.push(`- captureFile: ${report.window.captureFile}`);
  lines.push(`- sinceMinutes: ${report.window.sinceMinutes}`);
  lines.push(`- parsedLines: ${report.window.parsedLines}`);
  lines.push(`- start: ${report.window.start || "n/a"}`);
  lines.push(`- end: ${report.window.end || "n/a"}`);
  lines.push("");
  lines.push(formatCounts("Inbound Phases", report.analysis.inboundPhaseCounts));
  lines.push("");
  lines.push(formatCounts("Inbound Reasons", report.analysis.inboundReasonCounts));
  lines.push("");
  lines.push(formatCounts("Delivered Allowlist Scopes", report.analysis.deliveredScopeCounts));
  lines.push("");
  lines.push(formatCounts("Blocked Reasons", report.analysis.blockedReasonCounts));
  lines.push("");
  lines.push(formatCounts("Blocked separator_hint status updates by session", report.analysis.statusUpdateBySession));
  lines.push("");
  lines.push(formatEntries("Recent handled Telegram inputs", report.analysis.recentHandledInputs, (item) => `${item.timestamp} ${item.deckId}/${item.sessionName} thread=${item.threadId} followupEntries=${item.followupEntries} preview=${item.preview}${item.followupPreview ? ` | firstFollowup=${item.followupPreview}` : ""}`));
  lines.push("");
  lines.push(formatEntries("Recent delivered allowlist events", report.analysis.deliveredEvents, (item) => `${item.timestamp} ${item.deckId}/${item.sessionName} thread=${item.threadId} scope=${item.scope} reason=${item.reason} action=${item.action} text=${item.comparableText}`));
  lines.push("");
  lines.push(formatEntries("Recent blocked separator_hint summary misses", report.analysis.summaryOnlyMisses, (item) => `${item.timestamp} ${item.deckId}/${item.sessionName} thread=${item.threadId} app=${item.appLabel || ""} text=${item.comparableText}`));
  lines.push("");
  lines.push(formatEntries("Recent blocked attention_required events", report.analysis.blockedAttentionExamples, (item) => `${item.timestamp} ${item.sessionName} thread=${item.threadId} text=${item.comparableText}`));
  lines.push("");
  lines.push(formatEntries("Duplicate delivered groups", report.analysis.duplicateGroups, (item) => `${item.count}x ${item.sessionName} thread=${item.threadId} scope=${item.scope} reason=${item.reason} first=${item.firstTimestamp} last=${item.lastTimestamp} text=${item.comparableText}`));
  lines.push("");
  lines.push(formatEntries("Per-session summary", report.analysis.sessionSummaries, (item) => `${item.deckId}/${item.sessionName} app=${item.appLabel || ""} inboundInputs=${item.inboundInputsHandled} delivered=${item.deliveredAllowlist} blockedSeparatorHints=${item.blockedSeparatorHints} blockedAttention=${item.blockedAttention} blockedStatusUpdates=${item.blockedStatusUpdates}${item.lastDeliveredAt ? ` lastDelivered=${item.lastDeliveredAt}` : ""}${item.lastDeliveredPreview ? ` | lastDeliveredText=${item.lastDeliveredPreview}` : ""}${item.lastBlockedSeparatorPreview ? ` | lastMiss=${item.lastBlockedSeparatorPreview}` : ""}`));
  return `${lines.join("\n")}\n`;
}

if (!fs.existsSync(logFile)) {
  console.error(`Log file not found: ${logFile}`);
  process.exit(1);
}

const captureIndex = loadCaptureIndex(captureFile);
const rawLines = normalizeLineBreaks(fs.readFileSync(logFile, "utf8")).split("\n");
const parsedAll = rawLines
  .map(parseDebugLine)
  .filter(Boolean);
const debugMetaIndex = buildDebugMetaIndex(parsedAll);
const parsed = parsedAll
  .filter((line) => {
    if (sinceMinutes === 0) {
      return true;
    }
    return line.timestampMs >= Date.now() - (sinceMinutes * 60 * 1000);
  })
  .filter((line) => {
    if (!threadId) {
      return true;
    }
    const payloadThreadId = String(line?.payload?.messageThreadId || line?.payload?.targetThreadId || "");
    return payloadThreadId === threadId;
  })
  .filter((line) => {
    if (!sessionName && !deckId) {
      return true;
    }
    const payloadSessionId = String(line?.payload?.sessionId || "");
    const meta = findSessionMeta(payloadSessionId, captureIndex, debugMetaIndex);
    if (deckId && meta.deckId !== deckId) {
      return false;
    }
    if (sessionName && meta.sessionName !== sessionName) {
      return false;
    }
    return true;
  });

const report = {
  window: {
    logFile,
    captureFile: captureFile && fs.existsSync(captureFile) ? captureFile : "",
    sinceMinutes,
    parsedLines: parsed.length,
    start: parsed.length > 0 ? parsed[0].timestamp : "",
    end: parsed.length > 0 ? parsed[parsed.length - 1].timestamp : ""
  },
  analysis: analyzeLogs(parsed, captureIndex, debugMetaIndex)
};

if (format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  process.stdout.write(formatTextReport(report));
}
