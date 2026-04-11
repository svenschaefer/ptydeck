#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/experiment-codex-window-states.mjs");

function usage() {
  console.error(
    "Usage: node scripts/experiment-codex-window-states.mjs --capture-file <jsonl> [--session-name <name>] [--deck-id <deck>] [--window-sizes 60,120,300,600,1200] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let captureFile = "";
let sessionName = "";
let deckId = "";
let format = "text";
let windowSizes = [60, 120, 300, 600, 1200];

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
  if (value === "--window-sizes") {
    windowSizes = String(args[index + 1] || "")
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((part) => Number.isFinite(part) && part > 0);
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

if (!captureFile || !["json", "text"].includes(format) || windowSizes.length === 0) {
  usage();
}

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function decodeVisibleText(rawText) {
  return normalizeVisibleReplayText(normalizeLineBreaks(rawText));
}

function isMajorSeparator(line) {
  return /^─{40,}$/u.test(line) || /^─ Worked for .* ─+$/u.test(line) || /^› /u.test(line);
}

function classifyBullet(headline) {
  if (/^• Updated Plan$/u.test(headline)) {
    return "updated_plan";
  }
  if (/^• Ran /u.test(headline)) {
    return "ran";
  }
  if (/^• Explored$/u.test(headline)) {
    return "explored";
  }
  if (/^• Waited(?: for background terminal)?/u.test(headline)) {
    return "waited";
  }
  if (/^• Context compacted$/u.test(headline)) {
    return "context_compacted";
  }
  return "info";
}

function isStatusRibbon(line) {
  return /background terminal running/u.test(line) || /\/ps to view/u.test(line) || /\/stop to close/u.test(line);
}

function isTinyOverlayFragment(line) {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed) {
    return true;
  }
  if (/^•\s+\S/u.test(trimmed) || /^›\s+\S/u.test(trimmed) || /^─{40,}$/u.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 24) {
    return false;
  }
  if (/\n/u.test(trimmed)) {
    return false;
  }
  if (/^[•◦\d]+$/u.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z]+$/u.test(trimmed) && trimmed.length <= 4) {
    return true;
  }
  if (/^[A-Za-z•◦\d ]+$/u.test(trimmed) && trimmed.length <= 8) {
    const tokens = trimmed.split(/\s+/u).filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 2 && tokens.every((token) => token.length <= 4)) {
      return true;
    }
  }
  if (/^[A-Za-z•◦\d]+$/u.test(trimmed) && !/\s/u.test(trimmed) && trimmed.length <= 12) {
    return true;
  }
  if (/^W(?:o|or|rk|ki|in|ng|g|ait|ork|orking|aiting)+$/iu.test(trimmed)) {
    return true;
  }
  return false;
}

function classifyEntry(visibleText) {
  const compact = normalizeWhitespace(visibleText);
  if (!compact) {
    return "blank";
  }
  if (isStatusRibbon(compact)) {
    return "status_ribbon";
  }
  if (isTinyOverlayFragment(compact)) {
    return "overlay_fragment";
  }
  return "substantial";
}

function keepEntry(visibleText) {
  const kind = classifyEntry(visibleText);
  if (kind !== "substantial") {
    return false;
  }
  return visibleText.length >= 80 || /(^|\n)(• |› |─{40,}|─ Worked for )/u.test(visibleText);
}

function cleanVisibleLines(visibleText) {
  const lines = normalizeLineBreaks(visibleText).split("\n");
  const kept = [];
  for (const line of lines) {
    if (isStatusRibbon(line) || isTinyOverlayFragment(line)) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function normalizeInfoText(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }
  const parts = [];
  const headline = String(lines[0] || "").replace(/^•\s+/u, "").trim();
  if (headline) {
    parts.push(headline);
  }
  for (const line of lines.slice(1)) {
    const text = String(line || "");
    if (/^  └ /u.test(text) || /^  │ /u.test(text) || /^\s*□ /u.test(text)) {
      continue;
    }
    if (isStatusRibbon(text) || isTinyOverlayFragment(text)) {
      continue;
    }
    if (!/^  /u.test(text)) {
      continue;
    }
    const normalized = normalizeWhitespace(text);
    if (!normalized) {
      continue;
    }
    parts.push(normalized);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractBlocksFromVisibleText(visibleText) {
  const lines = normalizeLineBreaks(visibleText).split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const blocks = [];
  let current = null;
  let sectionIndex = -1;
  let bulletIndexWithinSection = 0;

  function closeCurrent() {
    if (!current) {
      return;
    }
    const type = classifyBullet(current.lines[0] || "");
    const text = normalizeInfoText(current.lines);
    blocks.push({
      sectionIndex: current.sectionIndex,
      bulletIndexWithinSection: current.bulletIndexWithinSection,
      type,
      text,
      directAfterSeparator: current.sectionIndex >= 0 && current.bulletIndexWithinSection === 1
    });
    current = null;
  }

  for (const line of lines) {
    if (isMajorSeparator(line)) {
      closeCurrent();
      sectionIndex += 1;
      bulletIndexWithinSection = 0;
      continue;
    }
    if (/^• /u.test(line)) {
      closeCurrent();
      bulletIndexWithinSection += 1;
      current = {
        sectionIndex,
        bulletIndexWithinSection,
        lines: [line]
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  closeCurrent();
  return blocks;
}

function analyzeCombinedVisibleText(visibleText) {
  const cleanedVisibleText = cleanVisibleLines(visibleText);
  const blocks = extractBlocksFromVisibleText(cleanedVisibleText);
  const countsByType = Object.create(null);
  for (const block of blocks) {
    countsByType[block.type] = (countsByType[block.type] || 0) + 1;
  }
  const antiPatternFollowers = new Set(["ran", "explored", "waited", "context_compacted", "updated_plan"]);
  const strictCandidateCount = blocks.filter((block, index) => {
    if (block.type !== "info" || !block.directAfterSeparator || !block.text) {
      return false;
    }
    if (block.text.length < 24 || block.text.length > 600) {
      return false;
    }
    const nextBlock = blocks[index + 1] || null;
    return !nextBlock || nextBlock.sectionIndex !== block.sectionIndex || antiPatternFollowers.has(nextBlock.type);
  }).length;
  return {
    cleanedVisibleChars: cleanedVisibleText.length,
    blockCount: blocks.length,
    countsByType,
    strictCandidateCount
  };
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
    if (filters.sessionName && filters.sessionName !== entrySessionName) {
      continue;
    }
    if (filters.deckId && filters.deckId !== entryDeckId) {
      continue;
    }
    const decoded = decodeBase64Text(parsed?.cleaned?.base64 || parsed?.raw?.base64 || "");
    const visibleText = decodeVisibleText(decoded);
    entries.push({
      timestamp: typeof parsed?.timestamp === "string" ? parsed.timestamp : "",
      timestampMs: Number.parseInt(String(Date.parse(parsed?.timestamp || "")), 10) || 0,
      visibleText,
      kind: classifyEntry(visibleText),
      kept: keepEntry(visibleText),
      promptBoundaryCount: Array.isArray(parsed?.promptBoundaries) ? parsed.promptBoundaries.length : 0,
      terminalSignalCount: Array.isArray(parsed?.terminalSignalKinds) ? parsed.terminalSignalKinds.length : 0
    });
  }
  return entries;
}

function classifyWindow(summary) {
  const total = summary.totalEntries || 1;
  const blankRatio = summary.counts.blank / total;
  const overlayRatio = summary.counts.overlay_fragment / total;
  const keepRatio = summary.keepRatio;
  const substantialCount = summary.counts.substantial || 0;
  const entryRate = summary.entryRatePerSec;
  const hasBlockStructure = summary.blockCount >= 2 || summary.strictCandidateCount >= 1;
  const reasons = [];

  if (
    keepRatio >= 0.12
    && substantialCount >= 6
    && hasBlockStructure
    && blankRatio <= 0.45
    && overlayRatio <= 0.3
  ) {
    reasons.push("enough substantial kept entries", "section structure visible");
    return { state: "stable_section", reasons };
  }

  if (
    entryRate >= 20
    && blankRatio >= 0.55
    && overlayRatio >= 0.25
    && substantialCount <= 5
    && summary.strictCandidateCount === 0
  ) {
    reasons.push("high chunk rate", "blank-dominant redraw burst", "overlay fragments dominate", "no stable section");
    return { state: "restart_remount", reasons };
  }

  if (
    keepRatio < 0.08
    && overlayRatio >= 0.2
    && summary.strictCandidateCount === 0
  ) {
    reasons.push("keep ratio too low", "overlay churn still dominant");
    return { state: "overlay_churn", reasons };
  }

  reasons.push("window contains mixed signals");
  return { state: "mixed_transition", reasons };
}

function buildWindowSummary(entries, size) {
  const scoped = entries.slice(-size);
  const counts = {
    blank: 0,
    overlay_fragment: 0,
    status_ribbon: 0,
    substantial: 0
  };
  const overlayExamples = new Map();
  let keptEntries = 0;
  let promptBoundaryCount = 0;
  let terminalSignalCount = 0;

  for (const entry of scoped) {
    counts[entry.kind] = (counts[entry.kind] || 0) + 1;
    if (entry.kept) {
      keptEntries += 1;
    }
    promptBoundaryCount += entry.promptBoundaryCount;
    terminalSignalCount += entry.terminalSignalCount;
    if (entry.kind === "overlay_fragment") {
      const key = normalizeWhitespace(entry.visibleText);
      if (key) {
        overlayExamples.set(key, (overlayExamples.get(key) || 0) + 1);
      }
    }
  }

  const combinedVisibleText = scoped.filter((entry) => entry.kept).map((entry) => entry.visibleText).join("");
  const combinedAnalysis = analyzeCombinedVisibleText(combinedVisibleText);
  const durationMs = scoped.length > 1 ? Math.max(0, scoped[scoped.length - 1].timestampMs - scoped[0].timestampMs) : 0;
  const durationSec = durationMs / 1000;
  const entryRatePerSec = scoped.length > 0 ? scoped.length / Math.max(durationSec, 0.001) : 0;
  const keepRatio = scoped.length > 0 ? keptEntries / scoped.length : 0;
  const classified = classifyWindow({
    totalEntries: scoped.length,
    counts,
    keepRatio,
    entryRatePerSec,
    strictCandidateCount: combinedAnalysis.strictCandidateCount,
    blockCount: combinedAnalysis.blockCount
  });

  return {
    size,
    totalEntries: scoped.length,
    durationSec,
    entryRatePerSec,
    keepRatio,
    keptEntries,
    promptBoundaryCount,
    terminalSignalCount,
    counts,
    blockCount: combinedAnalysis.blockCount,
    countsByType: combinedAnalysis.countsByType,
    strictCandidateCount: combinedAnalysis.strictCandidateCount,
    state: classified.state,
    reasons: classified.reasons,
    overlayExamples: Array.from(overlayExamples.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count }))
  };
}

const entries = loadEntries(captureFile, {
  sessionName,
  deckId
});
const summaries = windowSizes.map((size) => buildWindowSummary(entries, size));

if (format === "json") {
  console.log(JSON.stringify({
    source: path.basename(captureFile),
    sessionName,
    deckId,
    totalFilteredEntries: entries.length,
    summaries
  }, null, 2));
  process.exit(0);
}

console.log(`# ${path.basename(captureFile)}`);
console.log(`sessionName: ${sessionName || "(all)"}`);
console.log(`deckId: ${deckId || "(all)"}`);
console.log(`totalFilteredEntries: ${entries.length}`);
for (const summary of summaries) {
  console.log("");
  console.log(`## tail ${summary.size}`);
  console.log(`state: ${summary.state}`);
  console.log(`reasons: ${summary.reasons.join("; ")}`);
  console.log(`durationSec: ${summary.durationSec.toFixed(3)}`);
  console.log(`entryRatePerSec: ${summary.entryRatePerSec.toFixed(2)}`);
  console.log(`keepRatio: ${summary.keepRatio.toFixed(4)}`);
  console.log(`keptEntries: ${summary.keptEntries}`);
  console.log(`counts: ${JSON.stringify(summary.counts)}`);
  console.log(`blockCount: ${summary.blockCount}`);
  console.log(`countsByType: ${JSON.stringify(summary.countsByType)}`);
  console.log(`strictCandidateCount: ${summary.strictCandidateCount}`);
  console.log(`promptBoundaryCount: ${summary.promptBoundaryCount}`);
  console.log(`terminalSignalCount: ${summary.terminalSignalCount}`);
  console.log("overlayExamples:");
  if (summary.overlayExamples.length === 0) {
    console.log("- none");
  } else {
    for (const example of summary.overlayExamples) {
      console.log(`- ${example.count}x ${JSON.stringify(example.text)}`);
    }
  }
}
