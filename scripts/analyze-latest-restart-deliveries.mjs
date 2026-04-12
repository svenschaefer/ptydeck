#!/usr/bin/env node

import fs from "node:fs";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-latest-restart-deliveries.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-latest-restart-deliveries.mjs [--log <path>] [--startup-lookback-seconds <n>] [--post-ready-seconds <n>] [--history-lookback-hours <n>] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let logFile = "/tmp/ptydeck-backend-debug.log";
let startupLookbackSeconds = 180;
let postReadySeconds = 120;
let historyLookbackHours = 24;
let format = "text";

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--log") {
    logFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--startup-lookback-seconds") {
    startupLookbackSeconds = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--post-ready-seconds") {
    postReadySeconds = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--history-lookback-hours") {
    historyLookbackHours = Number.parseInt(args[index + 1] || "", 10);
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

if (
  !logFile
  || !Number.isFinite(startupLookbackSeconds)
  || startupLookbackSeconds < 0
  || !Number.isFinite(postReadySeconds)
  || postReadySeconds < 0
  || !Number.isFinite(historyLookbackHours)
  || historyLookbackHours < 0
  || !["json", "text"].includes(format)
) {
  usage();
}

function parseTimestamp(value) {
  const timestampMs = Date.parse(String(value || ""));
  return Number.isFinite(timestampMs) ? timestampMs : 0;
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

function normalizeComparableText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isDeliveredTrace(line) {
  if (line.event !== "messaging.event.trace") {
    return false;
  }
  const delivery = Array.isArray(line?.payload?.delivery) ? line.payload.delivery : [];
  return delivery.some((item) => item && item.delivered === true);
}

function isInboundInput(line) {
  if (line.event !== "messaging.inbound.action") {
    return false;
  }
  return String(line?.payload?.reason || "") === "input_text" && line?.payload?.ok === true;
}

function createDeliveredEvent(line) {
  return {
    timestamp: line.timestamp,
    timestampMs: line.timestampMs,
    sessionId: String(line?.payload?.sessionId || ""),
    threadId: String(line?.payload?.targetThreadId || ""),
    deliveryScope: String(line?.payload?.deliveryScope || ""),
    reason: String(line?.payload?.reason || ""),
    comparableText: String(line?.payload?.comparableText || ""),
    comparableKey: normalizeComparableText(line?.payload?.comparableText || "")
  };
}

function createInboundEvent(line) {
  return {
    timestampMs: line.timestampMs,
    sessionId: String(line?.payload?.sessionId || "")
  };
}

if (!fs.existsSync(logFile)) {
  console.error(`Log file not found: ${logFile}`);
  process.exit(1);
}

const parsedLines = fs.readFileSync(logFile, "utf8")
  .split(/\r?\n/)
  .map(parseDebugLine)
  .filter(Boolean)
  .sort((left, right) => left.timestampMs - right.timestampMs);

const runtimeReady = parsedLines.filter((line) => line.event === "runtime.ready");
if (runtimeReady.length === 0) {
  console.error("No runtime.ready entries found.");
  process.exit(1);
}

const readyLine = runtimeReady[runtimeReady.length - 1];
const readyMs = readyLine.timestampMs;
const windowStartMs = readyMs - (startupLookbackSeconds * 1000);
const windowEndMs = readyMs + (postReadySeconds * 1000);
const historyStartMs = readyMs - (historyLookbackHours * 3600 * 1000);

const deliveredEvents = parsedLines.filter(isDeliveredTrace).map(createDeliveredEvent);
const inboundEvents = parsedLines.filter(isInboundInput).map(createInboundEvent);

const windowEvents = deliveredEvents.filter((event) => event.timestampMs >= windowStartMs && event.timestampMs <= windowEndMs);

const firstInboundBySession = new Map();
for (const inbound of inboundEvents) {
  if (inbound.timestampMs < windowStartMs || inbound.timestampMs > windowEndMs || !inbound.sessionId) {
    continue;
  }
  const previous = firstInboundBySession.get(inbound.sessionId) || 0;
  if (!previous || inbound.timestampMs < previous) {
    firstInboundBySession.set(inbound.sessionId, inbound.timestampMs);
  }
}

const sameWindowCounts = new Map();
for (const event of windowEvents) {
  const burstKey = `${event.sessionId}::${event.threadId}::${event.deliveryScope}::${event.comparableKey}`;
  sameWindowCounts.set(burstKey, (sameWindowCounts.get(burstKey) || 0) + 1);
}

const evaluatedEvents = windowEvents.map((event, index) => {
  const priorMatches = deliveredEvents.filter((candidate) =>
    candidate.timestampMs >= historyStartMs
    && candidate.timestampMs < windowStartMs
    && candidate.sessionId === event.sessionId
    && candidate.threadId === event.threadId
    && candidate.deliveryScope === event.deliveryScope
    && candidate.comparableKey
    && candidate.comparableKey === event.comparableKey
  );
  const latestPriorMatch = priorMatches.length > 0 ? priorMatches[priorMatches.length - 1] : null;
  const firstInboundMs = firstInboundBySession.get(event.sessionId) || 0;
  const burstKey = `${event.sessionId}::${event.threadId}::${event.deliveryScope}::${event.comparableKey}`;
  const sameWindowCount = sameWindowCounts.get(burstKey) || 0;
  const problemReasons = [];
  if (latestPriorMatch) {
    problemReasons.push("restart-history-resend");
  }
  if (event.timestampMs < readyMs) {
    problemReasons.push("pre-ready-delivery");
  }
  if (!firstInboundMs || event.timestampMs < firstInboundMs) {
    problemReasons.push("before-first-fresh-input");
  }
  if (sameWindowCount > 1) {
    problemReasons.push("duplicate-burst");
  }

  return {
    index: index + 1,
    timestamp: event.timestamp,
    secondsFromReady: Math.round((event.timestampMs - readyMs) / 100) / 10,
    sessionId: event.sessionId,
    threadId: event.threadId,
    deliveryScope: event.deliveryScope,
    reason: event.reason,
    comparableText: event.comparableText,
    sensible: problemReasons.length === 0,
    problemReasons,
    priorMatch: latestPriorMatch
      ? {
          timestamp: latestPriorMatch.timestamp,
          comparableText: latestPriorMatch.comparableText
        }
      : null,
    sameWindowCount
  };
});

const groupedByText = Array.from(
  evaluatedEvents.reduce((map, event) => {
    const key = `${event.threadId}::${event.deliveryScope}::${event.comparableText}`;
    const current = map.get(key) || {
      threadId: event.threadId,
      deliveryScope: event.deliveryScope,
      comparableText: event.comparableText,
      count: 0,
      indexes: [],
      sensibleCount: 0,
      problemReasons: new Set()
    };
    current.count += 1;
    current.indexes.push(event.index);
    if (event.sensible) {
      current.sensibleCount += 1;
    }
    for (const reason of event.problemReasons) {
      current.problemReasons.add(reason);
    }
    map.set(key, current);
    return map;
  }, new Map()).values()
).map((entry) => ({
  threadId: entry.threadId,
  deliveryScope: entry.deliveryScope,
  comparableText: entry.comparableText,
  count: entry.count,
  indexes: entry.indexes,
  sensibleCount: entry.sensibleCount,
  problemReasons: Array.from(entry.problemReasons).sort()
})).sort((left, right) => right.count - left.count || left.comparableText.localeCompare(right.comparableText));

const report = {
  logFile,
  readyAt: readyLine.timestamp,
  windowStart: new Date(windowStartMs).toISOString(),
  windowEnd: new Date(windowEndMs).toISOString(),
  deliveredTotal: evaluatedEvents.length,
  sensibleTotal: evaluatedEvents.filter((event) => event.sensible).length,
  notSensibleTotal: evaluatedEvents.filter((event) => !event.sensible).length,
  events: evaluatedEvents,
  groupedByText
};

if (format === "json") {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Latest runtime.ready: ${report.readyAt}`);
console.log(`Window: ${report.windowStart} -> ${report.windowEnd}`);
console.log(`Delivered events: ${report.deliveredTotal}`);
console.log(`Sensible: ${report.sensibleTotal}`);
console.log(`Not sensible: ${report.notSensibleTotal}`);
console.log("");
for (const event of report.events) {
  const assessment = event.sensible ? "sensible" : `not sensible (${event.problemReasons.join(", ")})`;
  console.log(
    `#${event.index} ${event.timestamp} thread ${event.threadId} ${event.deliveryScope || "generic"} ${assessment}`
  );
  console.log(`  text: ${event.comparableText}`);
  if (event.priorMatch) {
    console.log(`  prior: ${event.priorMatch.timestamp}`);
  }
}
