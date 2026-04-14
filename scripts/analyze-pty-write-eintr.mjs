#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-pty-write-eintr.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-pty-write-eintr.mjs --log <backend-debug-log> [--node-pty-source <path>] [--node-pty-package <path>] [--format json|text]"
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    logPath: "",
    nodePtySourcePath: path.join(process.cwd(), "backend", "node_modules", "node-pty", "src", "unixTerminal.ts"),
    nodePtyPackagePath: path.join(process.cwd(), "backend", "node_modules", "node-pty", "package.json"),
    format: "text"
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--log") {
      options.logPath = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--node-pty-source") {
      options.nodePtySourcePath = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--node-pty-package") {
      options.nodePtyPackagePath = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--format") {
      options.format = args[index + 1] || "";
      index += 1;
      continue;
    }
    usage();
  }
  if (!options.logPath || !["json", "text"].includes(options.format)) {
    usage();
  }
  return options;
}

function createLineReader(filePath) {
  return readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
}

function parseDebugLogLine(line) {
  const match = line.match(/^\[ptydeck-backend\]\[(?<timestamp>[^\]]+)\] (?<event>[^ ]+) (?<json>\{.*\})$/u);
  if (!match?.groups) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(match.groups.json);
  } catch {
    return null;
  }
  return {
    timestamp: match.groups.timestamp,
    event: match.groups.event,
    payload
  };
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function inspectNodePtySource(sourceText) {
  const text = String(sourceText || "");
  return {
    retriesEagain: /err\.code\s*===\s*['"]EAGAIN['"]/u.test(text),
    retriesEintr: /err\.code\s*===\s*['"]EINTR['"]/u.test(text),
    clearsQueueOnUnexpectedError: /_writeQueue\.length\s*=\s*0/u.test(text),
    logsUnhandledWriteError: /Unhandled pty write error/u.test(text),
    usesAsyncFsWriteQueue: /fs\.write\(/u.test(text) && /_processWriteQueue/u.test(text)
  };
}

async function analyzeLog(logPath) {
  const summary = {
    totalStructuredWriteEvents: 0,
    sessionInputWrite: {
      attemptCount: 0,
      okCount: 0,
      failedCount: 0,
      byWriteKind: {}
    },
    messagingInputWriteFailedCount: 0,
    rawUnhandledPtyWriteErrorLines: 0,
    rawEintrMentions: 0,
    firstStructuredWriteAt: "",
    lastStructuredWriteAt: "",
    failedSamples: []
  };

  const reader = createLineReader(logPath);
  for await (const line of reader) {
    if (line.includes("Unhandled pty write error")) {
      summary.rawUnhandledPtyWriteErrorLines += 1;
    }
    if (line.includes("EINTR")) {
      summary.rawEintrMentions += 1;
    }
    const parsed = parseDebugLogLine(line);
    if (!parsed) {
      continue;
    }
    const { timestamp, event, payload } = parsed;
    if (event === "session.input.write") {
      summary.totalStructuredWriteEvents += 1;
      if (!summary.firstStructuredWriteAt) {
        summary.firstStructuredWriteAt = timestamp;
      }
      summary.lastStructuredWriteAt = timestamp;
      const phase = typeof payload?.phase === "string" ? payload.phase : "";
      const writeKind = typeof payload?.writeKind === "string" && payload.writeKind ? payload.writeKind : "unknown";
      summary.sessionInputWrite.byWriteKind[writeKind] = summary.sessionInputWrite.byWriteKind[writeKind] || {
        attempt: 0,
        ok: 0,
        failed: 0
      };
      if (phase === "attempt") {
        summary.sessionInputWrite.attemptCount += 1;
        summary.sessionInputWrite.byWriteKind[writeKind].attempt += 1;
      } else if (phase === "ok") {
        summary.sessionInputWrite.okCount += 1;
        summary.sessionInputWrite.byWriteKind[writeKind].ok += 1;
      } else if (phase === "failed") {
        summary.sessionInputWrite.failedCount += 1;
        summary.sessionInputWrite.byWriteKind[writeKind].failed += 1;
        if (summary.failedSamples.length < 5) {
          summary.failedSamples.push({
            timestamp,
            writeKind,
            error: typeof payload?.error === "string" ? payload.error : "",
            traceId: typeof payload?.traceId === "string" ? payload.traceId : "",
            correlationId: typeof payload?.correlationId === "string" ? payload.correlationId : ""
          });
        }
      }
      continue;
    }
    if (event === "messaging.input.write_failed") {
      summary.messagingInputWriteFailedCount += 1;
    }
  }
  return summary;
}

function buildAssessment(logSummary, nodePtySummary, nodePtyVersion) {
  const structuredFailuresObserved =
    logSummary.sessionInputWrite.failedCount > 0 || logSummary.messagingInputWriteFailedCount > 0;
  const asyncGapExists =
    !structuredFailuresObserved &&
    nodePtySummary.usesAsyncFsWriteQueue &&
    nodePtySummary.retriesEagain &&
    !nodePtySummary.retriesEintr &&
    nodePtySummary.clearsQueueOnUnexpectedError &&
    nodePtySummary.logsUnhandledWriteError;
  const queueDropRisk =
    nodePtySummary.usesAsyncFsWriteQueue &&
    !nodePtySummary.retriesEintr &&
    nodePtySummary.clearsQueueOnUnexpectedError;
  return {
    nodePtyVersion: typeof nodePtyVersion === "string" ? nodePtyVersion : "",
    structuredFailuresObserved,
    asyncGapExists,
    retryableEintrCurrentlyHandled: nodePtySummary.retriesEintr,
    silentQueueDropRiskOnEintr: queueDropRisk,
    currentBestCorrectiveStrategy:
      queueDropRisk
        ? "Treat EINTR like a retryable asynchronous PTY write interruption, keep the queued write intact, and surface a structured failure only after bounded retry exhaustion."
        : "No corrective strategy inferred from the currently inspected node-pty write path.",
    currentRuntimeContractMatch: !queueDropRisk,
    notes: [
      structuredFailuresObserved
        ? "Structured runtime write failures were observed directly in the debug log."
        : "Structured runtime write failures were not observed in the debug log; all traced session.input.write events completed with phase=ok.",
      asyncGapExists
        ? "The currently inspected node-pty implementation retries EAGAIN but not EINTR, and clears the remaining write queue on unexpected async write errors."
        : "The currently inspected node-pty implementation does not match the expected EAGAIN-only retry plus queue-drop pattern."
    ]
  };
}

function formatText(report) {
  const lines = [];
  lines.push("PTY EINTR Write Analysis");
  lines.push("");
  lines.push(`node-pty version: ${report.nodePty.version || "unknown"}`);
  lines.push(`node-pty source: ${report.nodePty.sourcePath}`);
  lines.push(`structured session.input.write failures: ${report.logSummary.sessionInputWrite.failedCount}`);
  lines.push(`structured messaging.input.write_failed events: ${report.logSummary.messagingInputWriteFailedCount}`);
  lines.push(`raw 'Unhandled pty write error' lines in debug log: ${report.logSummary.rawUnhandledPtyWriteErrorLines}`);
  lines.push(`raw 'EINTR' mentions in debug log: ${report.logSummary.rawEintrMentions}`);
  lines.push(`retries EAGAIN: ${report.nodePty.behavior.retriesEagain}`);
  lines.push(`retries EINTR: ${report.nodePty.behavior.retriesEintr}`);
  lines.push(`clears queue on unexpected async write error: ${report.nodePty.behavior.clearsQueueOnUnexpectedError}`);
  lines.push(`logs unhandled async write error: ${report.nodePty.behavior.logsUnhandledWriteError}`);
  lines.push(`silent queue drop risk on EINTR: ${report.assessment.silentQueueDropRiskOnEintr}`);
  lines.push(`assessment: ${report.assessment.currentBestCorrectiveStrategy}`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv);
  const logSummary = await analyzeLog(options.logPath);
  const nodePtySourceText = fs.existsSync(options.nodePtySourcePath)
    ? fs.readFileSync(options.nodePtySourcePath, "utf8")
    : "";
  const nodePtyBehavior = inspectNodePtySource(nodePtySourceText);
  const nodePtyPackage = readJsonFile(options.nodePtyPackagePath);
  const report = {
    logPath: options.logPath,
    nodePty: {
      sourcePath: options.nodePtySourcePath,
      packagePath: options.nodePtyPackagePath,
      version: typeof nodePtyPackage?.version === "string" ? nodePtyPackage.version : "",
      behavior: nodePtyBehavior
    },
    logSummary,
    assessment: buildAssessment(logSummary, nodePtyBehavior, typeof nodePtyPackage?.version === "string" ? nodePtyPackage.version : "")
  };
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatText(report));
}

await main();
