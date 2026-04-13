#!/usr/bin/env node

import fs from "node:fs";
import { logScriptStart } from "./lib/script-log.mjs";
import {
  applyMessagingMessagePolicy,
  createMessagingThreadPolicyState,
  advanceMessagingThreadPolicyState
} from "../backend/src/messaging-runtime.js";

logScriptStart("scripts/replay-messaging-message-policy.mjs");

function usage() {
  console.error(
    "Usage: node scripts/replay-messaging-message-policy.mjs [--log <path>] [--since-minutes <count>] [--session-id <id>] [--thread-id <id>] [--format json|text] [--strict]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let logFile = "/tmp/ptydeck-backend-debug.log";
let sinceMinutes = 20;
let sessionIdFilter = "";
let threadIdFilter = "";
let format = "text";
let strict = false;

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--log") {
    logFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--since-minutes") {
    sinceMinutes = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--session-id") {
    sessionIdFilter = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--thread-id") {
    threadIdFilter = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--format") {
    format = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--strict") {
    strict = true;
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

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topCounts(map) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function buildTraceReplayEvent(parsedLine) {
  const payload = parsedLine?.payload || {};
  const type = normalizeNonEmptyString(payload.type);
  const profile = normalizeNonEmptyString(payload.profile);
  const deliveryScope = normalizeNonEmptyString(payload.deliveryScope);
  const comparableText = normalizeNonEmptyString(payload.comparableText);
  const noiseClass = normalizeNonEmptyString(payload.noiseClass);
  const aggregationReason = normalizeNonEmptyString(payload.aggregationReason);
  const deliveryBlockKey = normalizeNonEmptyString(payload.deliveryBlockKey);
  const threadKey = type === "session.attention.required" ? "attention" : "status";
  const appIdentityFamily = profile === "coding-agent" ? "coding-agent" : "unknown";
  const appIdentityLabel =
    appIdentityFamily === "coding-agent" || deliveryScope.startsWith("codex_")
      ? "codex"
      : "";
  return {
    sessionId: normalizeNonEmptyString(payload.sessionId),
    type,
    profile,
    occurredAt: parsedLine.timestampMs,
    threadKey,
    aggregationReason,
    deliveryScope,
    deliveryBlockKey,
    comparableText,
    noiseClass,
    summary: comparableText || type || "trace-event",
    text: comparableText || type || "trace-event",
    session: {
      id: normalizeNonEmptyString(payload.sessionId),
      appIdentity: {
        family: appIdentityFamily,
        label: appIdentityLabel,
        source: "trace-replay",
        confidence: 1
      }
    }
  };
}

function buildThreadStateKey(event, parsedLine) {
  const payload = parsedLine?.payload || {};
  const chatId = normalizeNonEmptyString(payload.targetChatId);
  const threadId = Number.isInteger(payload.targetThreadId) ? payload.targetThreadId : 0;
  return `${chatId}:${threadId}:${event.sessionId}:${event.threadKey}`;
}

function buildRecordedDeliveryStatus(payload) {
  if (!Array.isArray(payload?.delivery)) {
    return false;
  }
  return payload.delivery.some((entry) => entry?.delivered === true);
}

function replayTrace(lines) {
  const threadStates = new Map();
  const recordedActionCounts = new Map();
  const replayedActionCounts = new Map();
  const recordedReasonCounts = new Map();
  const replayedReasonCounts = new Map();
  const mismatches = [];
  let replayedEvents = 0;
  let matchedEvents = 0;
  for (const line of lines) {
    if (line.event !== "messaging.event.trace") {
      continue;
    }
    const event = buildTraceReplayEvent(line);
    if (!event.sessionId || !event.type) {
      continue;
    }
    replayedEvents += 1;
    const stateKey = buildThreadStateKey(event, line);
    const threadState = threadStates.get(stateKey) || createMessagingThreadPolicyState();
    const replayed = applyMessagingMessagePolicy(event, threadState);
    const recordedAction = normalizeNonEmptyString(line.payload?.action) || "suppress";
    const recordedReason = normalizeNonEmptyString(line.payload?.reason);
    increment(recordedActionCounts, recordedAction);
    increment(replayedActionCounts, replayed.action);
    increment(recordedReasonCounts, recordedReason || "<empty>");
    increment(replayedReasonCounts, replayed.reason || "<empty>");

    const delivered = buildRecordedDeliveryStatus(line.payload);
    if (replayed.action !== "suppress") {
      advanceMessagingThreadPolicyState(threadState, event, replayed, { delivered: false });
      if (delivered) {
        advanceMessagingThreadPolicyState(threadState, event, replayed, { delivered: true });
      }
    }
    threadStates.set(stateKey, threadState);

    if (replayed.action === recordedAction && replayed.reason === recordedReason) {
      matchedEvents += 1;
      continue;
    }
    mismatches.push({
      timestamp: line.timestamp,
      sessionId: event.sessionId,
      targetThreadId: Number.isInteger(line.payload?.targetThreadId) ? line.payload.targetThreadId : null,
      type: event.type,
      deliveryScope: event.deliveryScope,
      comparableText: event.comparableText,
      recordedAction,
      recordedReason,
      replayedAction: replayed.action,
      replayedReason: replayed.reason,
      delivered
    });
  }
  return {
    replayedEvents,
    matchedEvents,
    mismatchCount: mismatches.length,
    actionCounts: {
      recorded: topCounts(recordedActionCounts),
      replayed: topCounts(replayedActionCounts)
    },
    reasonCounts: {
      recorded: topCounts(recordedReasonCounts),
      replayed: topCounts(replayedReasonCounts)
    },
    mismatches
  };
}

function formatTextReport(report) {
  const lines = [];
  lines.push("Messaging Trace Replay");
  lines.push(`Trace events replayed: ${report.window.traceEvents}`);
  lines.push(`Matched decisions: ${report.analysis.matchedEvents}`);
  lines.push(`Mismatched decisions: ${report.analysis.mismatchCount}`);
  lines.push("");
  lines.push("Recorded actions:");
  for (const entry of report.analysis.actionCounts.recorded) {
    lines.push(`- ${entry.key}: ${entry.count}`);
  }
  lines.push("");
  lines.push("Replayed actions:");
  for (const entry of report.analysis.actionCounts.replayed) {
    lines.push(`- ${entry.key}: ${entry.count}`);
  }
  if (report.analysis.mismatches.length > 0) {
    lines.push("");
    lines.push("Mismatch examples:");
    for (const entry of report.analysis.mismatches.slice(0, 10)) {
      lines.push(
        `- ${entry.timestamp} session=${entry.sessionId} thread=${entry.targetThreadId ?? 0} ${entry.type} recorded=${entry.recordedAction}/${entry.recordedReason} replayed=${entry.replayedAction}/${entry.replayedReason} text=${entry.comparableText || "<empty>"}`
      );
    }
  }
  return lines.join("\n");
}

if (!fs.existsSync(logFile)) {
  const emptyReport = {
    window: {
      logFile,
      sinceMinutes,
      parsedLines: 0,
      traceEvents: 0
    },
    analysis: {
      matchedEvents: 0,
      mismatchCount: 0,
      actionCounts: { recorded: [], replayed: [] },
      reasonCounts: { recorded: [], replayed: [] },
      mismatches: []
    }
  };
  if (format === "json") {
    console.log(JSON.stringify(emptyReport, null, 2));
  } else {
    console.log(formatTextReport(emptyReport));
  }
  process.exit(0);
}

const parsedLines = normalizeLineBreaks(fs.readFileSync(logFile, "utf8"))
  .split("\n")
  .map(parseDebugLine)
  .filter(Boolean)
  .sort((left, right) => left.timestampMs - right.timestampMs);

const latestTimestampMs = parsedLines.reduce((maxValue, line) => Math.max(maxValue, line.timestampMs), 0);
const thresholdMs = sinceMinutes > 0 ? latestTimestampMs - sinceMinutes * 60_000 : 0;
const filteredLines = parsedLines.filter((line) => {
  if (thresholdMs > 0 && line.timestampMs < thresholdMs) {
    return false;
  }
  if (line.event !== "messaging.event.trace") {
    return true;
  }
  if (sessionIdFilter && normalizeNonEmptyString(line.payload?.sessionId) !== sessionIdFilter) {
    return false;
  }
  if (threadIdFilter) {
    const candidateThreadId = Number.isInteger(line.payload?.targetThreadId) ? String(line.payload.targetThreadId) : "";
    if (candidateThreadId !== threadIdFilter) {
      return false;
    }
  }
  return true;
});

const replay = replayTrace(filteredLines);
const report = {
  window: {
    logFile,
    sinceMinutes,
    parsedLines: filteredLines.length,
    traceEvents: replay.replayedEvents
  },
  analysis: replay
};

if (format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatTextReport(report));
}

if (strict && replay.mismatchCount > 0) {
  process.exit(2);
}
