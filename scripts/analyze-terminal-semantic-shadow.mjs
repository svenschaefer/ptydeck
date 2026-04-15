#!/usr/bin/env node

import fs from "node:fs";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-terminal-semantic-shadow.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-terminal-semantic-shadow.mjs [--log <path>] [--status-file <path>] [--since-minutes <count>] [--session-id <id>] [--decision <matched|mismatched|primary_only|shadow_only>] [--comparison-class <class>] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let logFile = "/tmp/ptydeck-backend-debug.log";
let statusFile = "";
let sinceMinutes = 30;
let sessionIdFilter = "";
let decisionFilter = "";
let comparisonClassFilter = "";
let format = "text";

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--log") {
    logFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--status-file") {
    statusFile = args[index + 1] || "";
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
  if (value === "--decision") {
    decisionFilter = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--comparison-class") {
    comparisonClassFilter = args[index + 1] || "";
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
  !["json", "text"].includes(format) ||
  !Number.isFinite(sinceMinutes) ||
  sinceMinutes < 0 ||
  (!logFile && !statusFile)
) {
  usage();
}

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
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

function increment(map, key, amount = 1) {
  const normalizedKey = normalizeNonEmptyString(key) || "uncategorized";
  map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount);
}

function topCounts(map, limit = 20) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function extractEntityKindFromSummary(summary, decision) {
  const normalizedSummary = normalizeNonEmptyString(summary);
  const normalizedDecision = normalizeNonEmptyString(decision);
  if (!normalizedSummary || !normalizedDecision) {
    return "";
  }
  const suffix = ` ${normalizedDecision}`;
  if (normalizedSummary.endsWith(suffix)) {
    return normalizedSummary.slice(0, normalizedSummary.length - suffix.length).trim();
  }
  return "";
}

function normalizeComparisonRecord(record = {}) {
  const decision = normalizeNonEmptyString(record.decision || record.comparisonResult);
  if (!decision) {
    return null;
  }
  const comparisonClass = normalizeNonEmptyString(record.comparisonClass);
  const entityKind =
    normalizeNonEmptyString(record.entityKind) || extractEntityKindFromSummary(record.summary, decision) || "entity";
  const text = normalizeNonEmptyString(record.text || record.comparableText || record.primaryComparableText);
  const primaryComparableText = normalizeNonEmptyString(record.primaryComparableText || record.comparableText || record.text);
  const shadowComparableText = normalizeNonEmptyString(record.shadowComparableText);
  return Object.freeze({
    timestamp: normalizeNonEmptyString(record.timestamp || record.recordedAt),
    timestampMs: parseTimestamp(record.timestamp || record.recordedAt),
    source: normalizeNonEmptyString(record.source) || "unknown",
    sessionId: normalizeNonEmptyString(record.sessionId),
    decision,
    comparisonClass,
    entityKind,
    phase: normalizeNonEmptyString(record.phase || record.reason),
    primaryMode: normalizeNonEmptyString(record.primaryMode),
    shadowMode: normalizeNonEmptyString(record.shadowMode),
    traceId: normalizeNonEmptyString(record.traceId),
    correlationId: normalizeNonEmptyString(record.correlationId),
    text,
    primaryComparableText,
    shadowComparableText
  });
}

function loadDebugComparisons(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  return normalizeLineBreaks(fs.readFileSync(filePath, "utf8"))
    .split("\n")
    .map(parseDebugLine)
    .filter(Boolean)
    .filter((line) => line.event === "messaging.semantic.shadow")
    .map((line) =>
      normalizeComparisonRecord({
        ...line.payload,
        source: "debug",
        timestamp: line.timestamp
      })
    )
    .filter(Boolean);
}

function loadStatusComparisons(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
  const traceEntries = Array.isArray(parsed?.trace?.recent)
    ? parsed.trace.recent
    : Array.isArray(parsed?.recent)
      ? parsed.recent
      : [];
  return traceEntries
    .filter((entry) => normalizeNonEmptyString(entry?.type) === "terminal.semantic.compare")
    .map((entry) =>
      normalizeComparisonRecord({
        ...entry,
        source: "status"
      })
    )
    .filter(Boolean);
}

function buildComparisonKey(record) {
  return [
    record.sessionId,
    record.traceId,
    record.correlationId,
    record.decision,
    record.comparisonClass,
    record.entityKind,
    record.phase,
    record.primaryComparableText,
    record.shadowComparableText
  ].join("|");
}

function filterByWindow(record) {
  if (sinceMinutes === 0) {
    return true;
  }
  if (!record.timestampMs) {
    return true;
  }
  return record.timestampMs >= Date.now() - (sinceMinutes * 60 * 1000);
}

function filterRecord(record) {
  if (!filterByWindow(record)) {
    return false;
  }
  if (sessionIdFilter && record.sessionId !== sessionIdFilter) {
    return false;
  }
  if (decisionFilter && record.decision !== decisionFilter) {
    return false;
  }
  if (comparisonClassFilter && record.comparisonClass !== comparisonClassFilter) {
    return false;
  }
  return true;
}

function buildReport(comparisons, debugCount, statusCount) {
  const decisionCounts = new Map();
  const classCounts = new Map();
  const entityKindCounts = new Map();
  const phaseCounts = new Map();
  const sessionCounts = new Map();
  const clusteredExamples = new Map();
  for (const comparison of comparisons) {
    increment(decisionCounts, comparison.decision);
    if (comparison.comparisonClass) {
      increment(classCounts, comparison.comparisonClass);
      if (!clusteredExamples.has(comparison.comparisonClass)) {
        clusteredExamples.set(comparison.comparisonClass, []);
      }
      const examples = clusteredExamples.get(comparison.comparisonClass);
      if (examples.length < 5) {
        examples.push({
          timestamp: comparison.timestamp,
          sessionId: comparison.sessionId,
          decision: comparison.decision,
          entityKind: comparison.entityKind,
          phase: comparison.phase,
          text: comparison.text
        });
      }
    }
    increment(entityKindCounts, comparison.entityKind);
    increment(phaseCounts, comparison.phase || "unknown");
    increment(sessionCounts, comparison.sessionId || "unknown");
  }
  return {
    window: {
      logFile: logFile && fs.existsSync(logFile) ? logFile : "",
      statusFile: statusFile && fs.existsSync(statusFile) ? statusFile : "",
      sinceMinutes,
      parsedDebugComparisons: debugCount,
      parsedStatusComparisons: statusCount,
      includedComparisons: comparisons.length,
      start: comparisons.length > 0 ? comparisons[0].timestamp : "",
      end: comparisons.length > 0 ? comparisons[comparisons.length - 1].timestamp : ""
    },
    analysis: {
      decisionCounts: topCounts(decisionCounts),
      classCounts: topCounts(classCounts),
      entityKindCounts: topCounts(entityKindCounts),
      phaseCounts: topCounts(phaseCounts),
      sessionCounts: topCounts(sessionCounts),
      clusteredExamples: Object.fromEntries(
        Array.from(clusteredExamples.entries()).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
      ),
      recentComparisons: comparisons.slice(-10).map((comparison) => ({
        timestamp: comparison.timestamp,
        source: comparison.source,
        sessionId: comparison.sessionId,
        decision: comparison.decision,
        comparisonClass: comparison.comparisonClass,
        entityKind: comparison.entityKind,
        phase: comparison.phase,
        text: comparison.text
      }))
    }
  };
}

function renderText(report) {
  const lines = [];
  lines.push("Terminal Semantic Shadow");
  lines.push(`- sinceMinutes: ${report.window.sinceMinutes}`);
  lines.push(`- parsedDebugComparisons: ${report.window.parsedDebugComparisons}`);
  lines.push(`- parsedStatusComparisons: ${report.window.parsedStatusComparisons}`);
  lines.push(`- includedComparisons: ${report.window.includedComparisons}`);
  if (report.window.start) {
    lines.push(`- start: ${report.window.start}`);
  }
  if (report.window.end) {
    lines.push(`- end: ${report.window.end}`);
  }
  const sections = [
    ["Decision counts", report.analysis.decisionCounts],
    ["Class counts", report.analysis.classCounts],
    ["Entity counts", report.analysis.entityKindCounts],
    ["Phase counts", report.analysis.phaseCounts],
    ["Session counts", report.analysis.sessionCounts]
  ];
  for (const [title, entries] of sections) {
    lines.push("");
    lines.push(title);
    if (!entries.length) {
      lines.push("- none");
      continue;
    }
    for (const entry of entries) {
      lines.push(`- ${entry.key}: ${entry.count}`);
    }
  }
  const comparisonClasses = Object.keys(report.analysis.clusteredExamples).sort((left, right) => left.localeCompare(right));
  lines.push("");
  lines.push("Clustered examples");
  if (!comparisonClasses.length) {
    lines.push("- none");
  } else {
    for (const comparisonClass of comparisonClasses) {
      lines.push(`- ${comparisonClass}`);
      for (const example of report.analysis.clusteredExamples[comparisonClass]) {
        const suffix = example.text ? ` :: ${example.text}` : "";
        lines.push(
          `  - ${example.timestamp || "unknown"} ${example.sessionId || "unknown"} ${example.decision} ${example.entityKind || "entity"} ${example.phase || "unknown"}${suffix}`
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

const debugComparisons = loadDebugComparisons(logFile);
const statusComparisons = loadStatusComparisons(statusFile);
const combined = [];
const seenKeys = new Set();
for (const comparison of [...debugComparisons, ...statusComparisons]) {
  if (!filterRecord(comparison)) {
    continue;
  }
  const key = buildComparisonKey(comparison);
  if (seenKeys.has(key)) {
    continue;
  }
  seenKeys.add(key);
  combined.push(comparison);
}
combined.sort((left, right) => left.timestampMs - right.timestampMs || left.timestamp.localeCompare(right.timestamp));

const report = buildReport(combined, debugComparisons.length, statusComparisons.length);
if (format === "json") {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(renderText(report));
}
