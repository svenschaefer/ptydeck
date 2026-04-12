#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { CODEX_SEPARATOR_INFO_MAX_GAP_MS, CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES, CODEX_SEPARATOR_INFO_SCOPE, advanceCodexSeparatorInfoState, createCodexAllowlistState, createCodexStreamEntry } from "../backend/src/codex-outbound-evaluator.js";

logScriptStart("scripts/experiment-codex-first-use-case.mjs");

function usage() {
  console.error(
    "Usage: node scripts/experiment-codex-first-use-case.mjs --capture-file <jsonl> [--session-name <name>] [--deck-id <deck>] [--app-label codex] [--tail-entries <count>] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let captureFile = "";
let sessionName = "";
let deckId = "";
let appLabel = "codex";
let tailEntries = 1200;
let format = "text";

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--capture-file") {
    captureFile = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--session-name") {
    sessionName = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--deck-id") {
    deckId = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--app-label") {
    appLabel = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (value === "--tail-entries") {
    tailEntries = Number.parseInt(args[index + 1] || "", 10);
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
  !captureFile
  || !["json", "text"].includes(format)
  || !Number.isFinite(tailEntries)
  || tailEntries <= 0
) {
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

function formatTimestamp(timestampMs, fallback = "") {
  if (Number.isFinite(timestampMs) && timestampMs > 0) {
    return new Date(timestampMs).toISOString();
  }
  return fallback;
}

function loadEntries(filePath, filters = {}) {
  const lines = normalizeLineBreaks(fs.readFileSync(filePath, "utf8")).split("\n");
  const entries = [];
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
    const entrySessionName = typeof parsed?.session?.name === "string" ? parsed.session.name : "";
    const entryDeckId = typeof parsed?.session?.deckId === "string" ? parsed.session.deckId : "";
    const entryAppLabel = typeof parsed?.appIdentity?.label === "string" ? parsed.appIdentity.label : "";
    if (filters.sessionName && filters.sessionName !== entrySessionName) {
      continue;
    }
    if (filters.deckId && filters.deckId !== entryDeckId) {
      continue;
    }
    if (filters.appLabel && filters.appLabel !== entryAppLabel) {
      continue;
    }
    const decoded = decodeBase64Text(parsed?.cleaned?.base64 || parsed?.raw?.base64 || "");
    entries.push({
      timestamp: typeof parsed?.timestamp === "string" ? parsed.timestamp : "",
      timestampMs: Number.parseInt(String(Date.parse(parsed?.timestamp || "")), 10) || 0,
      sessionId: typeof parsed?.session?.id === "string" ? parsed.session.id : "",
      sessionName: entrySessionName,
      deckId: entryDeckId,
      appLabel: entryAppLabel,
      cleanedText: decoded,
      promptBoundaries: Array.isArray(parsed?.promptBoundaries) ? parsed.promptBoundaries.filter(Number.isInteger) : []
    });
  }
  return entries;
}

function normalizeDecision(decision, entryIndex) {
  return {
    index: entryIndex,
    type: decision?.type || "",
    family: decision?.family || CODEX_SEPARATOR_INFO_SCOPE,
    reason: typeof decision?.reason === "string" ? decision.reason : "",
    key: typeof decision?.key === "string" ? decision.key : "",
    text: typeof decision?.text === "string" ? decision.text : "",
    anchorSequence: Number.isInteger(decision?.anchorSequence) ? decision.anchorSequence : 0,
    anchorOccurredAt: Number.isFinite(decision?.anchorOccurredAt) ? decision.anchorOccurredAt : 0,
    anchorTimestamp: formatTimestamp(decision?.anchorOccurredAt),
    infoSequence: Number.isInteger(decision?.infoSequence) ? decision.infoSequence : 0,
    infoOccurredAt: Number.isFinite(decision?.infoOccurredAt) ? decision.infoOccurredAt : 0,
    infoTimestamp: formatTimestamp(decision?.infoOccurredAt),
    entrySequence: Number.isInteger(decision?.entrySequence) ? decision.entrySequence : 0,
    entryOccurredAt: Number.isFinite(decision?.entryOccurredAt) ? decision.entryOccurredAt : 0,
    entryTimestamp: formatTimestamp(decision?.entryOccurredAt),
    gapMs:
      Number.isFinite(decision?.anchorOccurredAt) && Number.isFinite(decision?.infoOccurredAt)
        ? Math.max(0, decision.infoOccurredAt - decision.anchorOccurredAt)
        : null
  };
}

function extractFirstUseCaseCandidates(entries) {
  const scoped = entries.slice(-tailEntries);
  const state = createCodexAllowlistState();
  const decisions = [];
  let decisionIndex = 0;

  const recordDecisions = (events) => {
    for (const decision of events || []) {
      decisions.push(normalizeDecision(decision, decisionIndex));
      decisionIndex += 1;
    }
  };

  for (const entry of scoped) {
    const streamEntry = createCodexStreamEntry(
      state,
      entry.cleanedText,
      entry.promptBoundaries,
      entry.timestampMs || Date.now()
    );
    recordDecisions(advanceCodexSeparatorInfoState(state, streamEntry));
  }
  recordDecisions(advanceCodexSeparatorInfoState(state, null, { flush: true }));

  const candidates = decisions
    .filter((decision) => decision.type === "candidate")
    .map((decision) => ({
      anchorSequence: decision.anchorSequence,
      anchorTimestamp: decision.anchorTimestamp,
      candidateSequence: decision.infoSequence,
      candidateTimestamp: decision.infoTimestamp,
      gapMs: decision.gapMs,
      reason: decision.reason,
      key: decision.key,
      text: decision.text
    }));
  const rejections = decisions
    .filter((decision) => decision.type === "rejection")
    .map((decision) => ({
      anchorSequence: decision.anchorSequence,
      anchorTimestamp: decision.anchorTimestamp,
      entrySequence: decision.entrySequence,
      entryTimestamp: decision.entryTimestamp,
      reason: decision.reason
    }));

  return {
    scopedEntries: scoped.length,
    separatorAnchors: decisions.length,
    decisions,
    candidates,
    rejections
  };
}

const entries = loadEntries(captureFile, {
  sessionName,
  deckId,
  appLabel
});
const analysis = extractFirstUseCaseCandidates(entries);

if (format === "json") {
  console.log(JSON.stringify({
    source: path.basename(captureFile),
    sessionName,
    deckId,
    appLabel,
    tailEntries,
    maxGapMs: CODEX_SEPARATOR_INFO_MAX_GAP_MS,
    maxLookahead: CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES,
    totalFilteredEntries: entries.length,
    analysis
  }, null, 2));
  process.exit(0);
}

console.log(`# ${path.basename(captureFile)}`);
console.log(`sessionName: ${sessionName || "(all)"}`);
console.log(`deckId: ${deckId || "(all)"}`);
console.log(`appLabel: ${appLabel || "(all)"}`);
console.log(`tailEntries: ${tailEntries}`);
console.log(`maxGapMs: ${CODEX_SEPARATOR_INFO_MAX_GAP_MS}`);
console.log(`maxLookahead: ${CODEX_SEPARATOR_INFO_MAX_LOOKAHEAD_ENTRIES}`);
console.log(`totalFilteredEntries: ${entries.length}`);
console.log(`scopedEntries: ${analysis.scopedEntries}`);
console.log(`separatorAnchors: ${analysis.separatorAnchors}`);
console.log("");
console.log("candidates:");
if (analysis.candidates.length === 0) {
  console.log("- none");
} else {
  for (const candidate of analysis.candidates) {
    console.log(`- ${candidate.anchorTimestamp} -> ${candidate.candidateTimestamp} (${candidate.gapMs}ms) [${candidate.reason}]`);
    console.log(`  ${candidate.text}`);
  }
}
console.log("");
console.log("rejections:");
if (analysis.rejections.length === 0) {
  console.log("- none");
} else {
  for (const rejection of analysis.rejections.slice(0, 20)) {
    console.log(`- ${rejection.anchorTimestamp}: ${rejection.reason}`);
  }
}
