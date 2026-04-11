#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/experiment-codex-candidates.mjs");

function usage() {
  console.error(
    "Usage: node scripts/experiment-codex-candidates.mjs [--capture-file <jsonl>] [--session-name <name>] [--deck-id <deck>] [--tail-entries <count>] [--format json|text] [text-file ...]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
}

let captureFile = "";
let sessionName = "";
let deckId = "";
let tailEntries = 0;
let format = "text";
let stableMinKeptEntries = 6;
let stableMinKeepRatio = 0.08;
const files = [];

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
  if (value === "--stable-min-kept-entries") {
    stableMinKeptEntries = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--stable-min-keep-ratio") {
    stableMinKeepRatio = Number.parseFloat(args[index + 1] || "");
    index += 1;
    continue;
  }
  files.push(value);
}

if (!captureFile && files.length === 0) {
  usage();
}
if (!["json", "text"].includes(format)) {
  usage();
}
if (!Number.isFinite(tailEntries) || tailEntries < 0) {
  usage();
}
if (!Number.isFinite(stableMinKeptEntries) || stableMinKeptEntries < 0) {
  usage();
}
if (!Number.isFinite(stableMinKeepRatio) || stableMinKeepRatio < 0 || stableMinKeepRatio > 1) {
  usage();
}

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeVisibleText(rawText) {
  return normalizeVisibleReplayText(normalizeLineBreaks(rawText));
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
      startLine: current.startLine,
      endLine: current.endLine,
      sectionIndex: current.sectionIndex,
      bulletIndexWithinSection: current.bulletIndexWithinSection,
      type,
      headline: String(current.lines[0] || ""),
      text,
      rawLines: current.lines.slice(),
      directAfterSeparator: current.sectionIndex >= 0 && current.bulletIndexWithinSection === 1
    });
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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
        startLine: index + 1,
        endLine: index + 1,
        sectionIndex,
        bulletIndexWithinSection,
        lines: [line]
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
      current.endLine = index + 1;
    }
  }

  closeCurrent();
  return blocks;
}

function summarizeCandidates(blocks) {
  const antiPatternFollowers = new Set([
    "ran",
    "explored",
    "waited",
    "context_compacted",
    "updated_plan"
  ]);
  const loose = blocks
    .filter((block) => block.type === "info" && block.directAfterSeparator && block.text)
    .map((block) => ({
      startLine: block.startLine,
      endLine: block.endLine,
      text: block.text,
      mode: "loose"
    }));
  const strict = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type !== "info" || !block.directAfterSeparator || !block.text) {
      continue;
    }
    const nextBlock = blocks[index + 1] || null;
    if (nextBlock && nextBlock.sectionIndex === block.sectionIndex && !antiPatternFollowers.has(nextBlock.type)) {
      continue;
    }
    if (block.text.length < 24 || block.text.length > 600) {
      continue;
    }
    strict.push({
      startLine: block.startLine,
      endLine: block.endLine,
      text: block.text,
      mode: "strict"
    });
  }
  return {
    loose,
    strict
  };
}

function analyzeVisibleSource(name, visibleText, metadata = {}) {
  const cleanedVisibleText = cleanVisibleLines(visibleText);
  const blocks = extractBlocksFromVisibleText(cleanedVisibleText);
  const countsByType = Object.create(null);
  for (const block of blocks) {
    countsByType[block.type] = (countsByType[block.type] || 0) + 1;
  }
  return {
    source: name,
    metadata,
    visibleChars: visibleText.length,
    cleanedVisibleChars: cleanedVisibleText.length,
    blockCount: blocks.length,
    countsByType,
    candidates: summarizeCandidates(blocks),
    blocks
  };
}

function isStableCaptureWindow(metadata = {}) {
  const scopedEntries = Number(metadata.scopedEntries || 0);
  const keptEntries = Number(metadata.keptEntries || 0);
  const keepRatio = scopedEntries > 0 ? keptEntries / scopedEntries : 0;
  return keptEntries >= stableMinKeptEntries && keepRatio >= stableMinKeepRatio;
}

function augmentCandidatesForCapture(analysis) {
  if (!analysis || analysis.metadata.kind !== "capture_jsonl") {
    return analysis;
  }
  const stableWindow = isStableCaptureWindow(analysis.metadata);
  return {
    ...analysis,
    metadata: {
      ...analysis.metadata,
      keepRatio: analysis.metadata.scopedEntries > 0
        ? analysis.metadata.keptEntries / analysis.metadata.scopedEntries
        : 0,
      stableWindow
    },
    candidates: {
      ...analysis.candidates,
      stableStrict: stableWindow ? analysis.candidates.strict.slice() : []
    }
  };
}

function loadCaptureAnalysis(filePath, filters = {}) {
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
      timestamp: parsed?.timestamp || "",
      sessionName: entrySessionName,
      deckId: entryDeckId,
      appLabel: typeof parsed?.appIdentity?.label === "string" ? parsed.appIdentity.label : "",
      visibleText,
      kind: classifyEntry(visibleText),
      kept: keepEntry(visibleText)
    });
  }

  const scopedEntries = tailEntries > 0 ? entries.slice(-tailEntries) : entries;
  const keptEntries = scopedEntries.filter((entry) => entry.kept);
  const combinedVisibleText = keptEntries.map((entry) => entry.visibleText).join("");
  return augmentCandidatesForCapture(analyzeVisibleSource(path.basename(filePath), combinedVisibleText, {
    kind: "capture_jsonl",
    path: filePath,
    sessionName: filters.sessionName || "",
    deckId: filters.deckId || "",
    tailEntries,
    scopedEntries: scopedEntries.length,
    keptEntries: keptEntries.length,
    droppedEntries: scopedEntries.length - keptEntries.length,
    droppedKinds: Object.fromEntries(
      scopedEntries
        .filter((entry) => !entry.kept)
        .reduce((counts, entry) => {
          counts.set(entry.kind, (counts.get(entry.kind) || 0) + 1);
          return counts;
        }, new Map())
        .entries()
    )
  }));
}

const analyses = [];

for (const file of files) {
  const rawText = fs.readFileSync(file, "utf8");
  analyses.push(
    analyzeVisibleSource(path.basename(file), rawText, {
      kind: "text_file",
      path: file
    })
  );
}

if (captureFile) {
  analyses.push(
    loadCaptureAnalysis(captureFile, {
      sessionName,
      deckId
    })
  );
}

if (format === "json") {
  console.log(JSON.stringify({ analyses }, null, 2));
  process.exit(0);
}

for (const analysis of analyses) {
  console.log(`# ${analysis.source}`);
  console.log(`visibleChars: ${analysis.visibleChars}`);
  console.log(`cleanedVisibleChars: ${analysis.cleanedVisibleChars}`);
  console.log(`blockCount: ${analysis.blockCount}`);
  console.log(`countsByType: ${JSON.stringify(analysis.countsByType)}`);
  if (analysis.metadata.kind === "capture_jsonl") {
    console.log(`capture scopedEntries: ${analysis.metadata.scopedEntries}`);
    console.log(`capture keptEntries: ${analysis.metadata.keptEntries}`);
    console.log(`capture droppedEntries: ${analysis.metadata.droppedEntries}`);
    console.log(`capture droppedKinds: ${JSON.stringify(analysis.metadata.droppedKinds)}`);
    console.log(`capture keepRatio: ${analysis.metadata.keepRatio}`);
    console.log(`capture stableWindow: ${analysis.metadata.stableWindow}`);
  }
  console.log("loose candidates:");
  for (const candidate of analysis.candidates.loose) {
    console.log(`- L${candidate.startLine}-${candidate.endLine}: ${candidate.text}`);
  }
  if (analysis.candidates.loose.length === 0) {
    console.log("- none");
  }
  console.log("strict candidates:");
  for (const candidate of analysis.candidates.strict) {
    console.log(`- L${candidate.startLine}-${candidate.endLine}: ${candidate.text}`);
  }
  if (analysis.candidates.strict.length === 0) {
    console.log("- none");
  }
  if (analysis.metadata.kind === "capture_jsonl") {
    console.log("stable strict candidates:");
    for (const candidate of analysis.candidates.stableStrict) {
      console.log(`- L${candidate.startLine}-${candidate.endLine}: ${candidate.text}`);
    }
    if (analysis.candidates.stableStrict.length === 0) {
      console.log("- none");
    }
  }
  console.log("");
}
