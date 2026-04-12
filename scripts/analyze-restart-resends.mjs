#!/usr/bin/env node

import fs from "node:fs";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-restart-resends.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-restart-resends.mjs [--log <path>] [--restart-count <n>] [--startup-lookback-seconds <n>] [--post-ready-seconds <n>] [--history-lookback-hours <n>] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let logFile = "/tmp/ptydeck-backend-debug.log";
let restartCount = 3;
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
  if (value === "--restart-count") {
    restartCount = Number.parseInt(args[index + 1] || "", 10);
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
  || !Number.isFinite(restartCount)
  || restartCount <= 0
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
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
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
    comparableText: String(line?.payload?.comparableText || ""),
    comparableKey: normalizeComparableText(line?.payload?.comparableText || ""),
    deliveryScope: String(line?.payload?.deliveryScope || ""),
    reason: String(line?.payload?.reason || ""),
    correlationId: String(line?.payload?.correlationId || "")
  };
}

function createInboundEvent(line) {
  return {
    timestamp: line.timestamp,
    timestampMs: line.timestampMs,
    sessionId: String(line?.payload?.sessionId || ""),
    threadId: String(line?.payload?.messageThreadId || ""),
    preview: String(line?.payload?.preview || "")
  };
}

function summarizeRestart(readyLine, deliveredEvents, inboundEvents, options) {
  const readyMs = readyLine.timestampMs;
  const windowStartMs = readyMs - options.startupLookbackMs;
  const windowEndMs = readyMs + options.postReadyMs;
  const historyStartMs = readyMs - options.historyLookbackMs;
  const startupDelivered = deliveredEvents.filter((event) => event.timestampMs >= windowStartMs && event.timestampMs <= windowEndMs);

  const sessionFirstInbound = new Map();
  for (const inbound of inboundEvents) {
    if (inbound.timestampMs < windowStartMs || inbound.timestampMs > windowEndMs) {
      continue;
    }
    if (!inbound.sessionId) {
      continue;
    }
    const previous = sessionFirstInbound.get(inbound.sessionId) || 0;
    if (!previous || inbound.timestampMs < previous) {
      sessionFirstInbound.set(inbound.sessionId, inbound.timestampMs);
    }
  }

  const analyzed = startupDelivered.map((event) => {
    const priorMatches = deliveredEvents.filter((candidate) =>
      candidate.timestampMs >= historyStartMs
      && candidate.timestampMs < windowStartMs
      && candidate.sessionId === event.sessionId
      && candidate.threadId === event.threadId
      && candidate.deliveryScope === event.deliveryScope
      && candidate.comparableKey
      && candidate.comparableKey === event.comparableKey
    );
    const previous = priorMatches.length > 0 ? priorMatches[priorMatches.length - 1] : null;
    const firstInboundMs = sessionFirstInbound.get(event.sessionId) || 0;
    return {
      ...event,
      beforeReady: event.timestampMs < readyMs,
      secondsFromReady: Math.round((event.timestampMs - readyMs) / 100) / 10,
      priorMatch: previous ? {
        timestamp: previous.timestamp,
        hoursBeforeReady: Math.round(((readyMs - previous.timestampMs) / 360000) / 10) / 10
      } : null,
      beforeFirstInbound: !firstInboundMs || event.timestampMs < firstInboundMs,
      strategyHits: {
        preReadySuppression: event.timestampMs < readyMs,
        startupQuietSuppression: event.timestampMs <= readyMs + options.postReadyMs,
        priorHistorySuppression: Boolean(previous),
        hybridSuppression: Boolean(previous) && (!firstInboundMs || event.timestampMs < firstInboundMs)
      }
    };
  });

  function countStrategy(strategyName) {
    return analyzed.filter((event) => event.strategyHits[strategyName]).length;
  }

  return {
    readyAt: readyLine.timestamp,
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(windowEndMs).toISOString(),
    deliveredTotal: analyzed.length,
    preReadyDelivered: analyzed.filter((event) => event.beforeReady).length,
    postReadyDelivered: analyzed.filter((event) => !event.beforeReady).length,
    priorHistoryMatches: analyzed.filter((event) => event.priorMatch).length,
    beforeFirstInboundMatches: analyzed.filter((event) => event.beforeFirstInbound).length,
    strategySummary: {
      preReadySuppression: countStrategy("preReadySuppression"),
      startupQuietSuppression: countStrategy("startupQuietSuppression"),
      priorHistorySuppression: countStrategy("priorHistorySuppression"),
      hybridSuppression: countStrategy("hybridSuppression")
    },
    examples: analyzed.slice(0, 12).map((event) => ({
      timestamp: event.timestamp,
      secondsFromReady: event.secondsFromReady,
      sessionId: event.sessionId,
      threadId: event.threadId,
      deliveryScope: event.deliveryScope,
      reason: event.reason,
      comparableText: event.comparableText,
      priorMatch: event.priorMatch,
      beforeReady: event.beforeReady,
      beforeFirstInbound: event.beforeFirstInbound,
      strategyHits: event.strategyHits
    }))
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

const deliveredEvents = parsedLines.filter(isDeliveredTrace).map(createDeliveredEvent);
const inboundEvents = parsedLines.filter(isInboundInput).map(createInboundEvent);

const selectedReady = runtimeReady.slice(-restartCount);
const options = {
  startupLookbackMs: startupLookbackSeconds * 1000,
  postReadyMs: postReadySeconds * 1000,
  historyLookbackMs: historyLookbackHours * 3600 * 1000
};

const report = {
  logFile,
  restartCountAnalyzed: selectedReady.length,
  startupLookbackSeconds,
  postReadySeconds,
  historyLookbackHours,
  restarts: selectedReady.map((readyLine) => summarizeRestart(readyLine, deliveredEvents, inboundEvents, options))
};

if (format === "json") {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Log file: ${logFile}`);
console.log(`Restart windows analyzed: ${report.restartCountAnalyzed}`);
console.log(`Startup lookback: ${startupLookbackSeconds}s | post-ready: ${postReadySeconds}s | history lookback: ${historyLookbackHours}h`);

for (const restart of report.restarts) {
  console.log("");
  console.log(`Restart ready at: ${restart.readyAt}`);
  console.log(`Window: ${restart.windowStart} -> ${restart.windowEnd}`);
  console.log(`Delivered in window: ${restart.deliveredTotal} (pre-ready ${restart.preReadyDelivered}, post-ready ${restart.postReadyDelivered})`);
  console.log(`Prior-history matches: ${restart.priorHistoryMatches}`);
  console.log(`Before first inbound in same session: ${restart.beforeFirstInboundMatches}`);
  console.log("Strategy hits:");
  console.log(`- preReadySuppression: ${restart.strategySummary.preReadySuppression}`);
  console.log(`- startupQuietSuppression: ${restart.strategySummary.startupQuietSuppression}`);
  console.log(`- priorHistorySuppression: ${restart.strategySummary.priorHistorySuppression}`);
  console.log(`- hybridSuppression: ${restart.strategySummary.hybridSuppression}`);
  if (restart.examples.length === 0) {
    console.log("Examples: none");
    continue;
  }
  console.log("Examples:");
  for (const example of restart.examples) {
    console.log(`- ${example.timestamp} | ${example.deliveryScope} | ${example.comparableText}`);
    console.log(`  session=${example.sessionId} thread=${example.threadId} secondsFromReady=${example.secondsFromReady}`);
    console.log(`  priorMatch=${example.priorMatch ? `${example.priorMatch.timestamp} (${example.priorMatch.hoursBeforeReady}h before ready)` : "none"} | beforeReady=${example.beforeReady} | beforeFirstInbound=${example.beforeFirstInbound}`);
    console.log(`  strategies=${Object.entries(example.strategyHits).filter(([, hit]) => hit).map(([name]) => name).join(", ") || "none"}`);
  }
}
