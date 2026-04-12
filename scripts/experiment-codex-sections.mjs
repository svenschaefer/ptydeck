#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/experiment-codex-sections.mjs");

function usage() {
  console.error(
    "Usage: node scripts/experiment-codex-sections.mjs --capture-file <jsonl> [--session-name <name>] [--deck-id <deck>] [--app-label codex] [--tail-entries <count>] [--format json|text]"
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

if (!captureFile || !Number.isFinite(tailEntries) || tailEntries <= 0 || !["json", "text"].includes(format)) {
  usage();
}

const MAJOR_SEPARATOR_PATTERN = /^─{40,}$/u;
const BULLET_PATTERN = /^•\s+/u;
const ANTI_PATTERN_BULLET_PATTERN = /^•\s+(?:Ran\b|Explored\b|Waited\b|Context compacted\b|Updated Plan\b)/u;
const PROMPT_PATTERN = /›/u;
const STATUS_RIBBON_PATTERN = /(?:\bgpt-[\w.-]+\b|\b\d{1,3}%\s+(?:left|used|remaining)\b|\/ps to view|\/stop to close|background terminal running|weekly\s+\d{1,3}%)/iu;
const OVERLAY_PATTERN = /(?:esc to interrupt|interrupt to stop|background terminal running)/iu;
const WORKED_FOR_PATTERN = /^─+\s*Worked for\b/iu;
const LIST_ITEM_PATTERN = /^-\s+/u;
const SUBSECTION_PATTERN = /^[A-ZÄÖÜ][\p{L}\p{N}\- ]{2,80}$/u;

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
    const cleanedText = decodeBase64Text(parsed?.cleaned?.base64 || parsed?.raw?.base64 || "");
    const visibleText = normalizeVisibleReplayText(cleanedText);
    entries.push({
      timestamp: typeof parsed?.timestamp === "string" ? parsed.timestamp : "",
      timestampMs: Number.parseInt(String(Date.parse(parsed?.timestamp || "")), 10) || 0,
      sessionName: entrySessionName,
      deckId: entryDeckId,
      appLabel: entryAppLabel,
      visibleText,
      visiblePreview: typeof parsed?.cleaned?.visiblePreview === "string"
        ? parsed.cleaned.visiblePreview
        : typeof parsed?.raw?.visiblePreview === "string"
          ? parsed.raw.visiblePreview
          : ""
    });
  }
  return entries;
}

function splitVisibleLines(visibleText) {
  return normalizeLineBreaks(visibleText)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function scrubLine(line) {
  let value = normalizeWhitespace(line);
  if (!value) {
    return "";
  }
  const promptMatch = value.search(PROMPT_PATTERN);
  if (promptMatch >= 0) {
    value = normalizeWhitespace(value.slice(0, promptMatch));
  }
  if (!value) {
    return "";
  }
  if (OVERLAY_PATTERN.test(value) || WORKED_FOR_PATTERN.test(value)) {
    return "";
  }
  if (STATUS_RIBBON_PATTERN.test(value) && !BULLET_PATTERN.test(value) && !LIST_ITEM_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function classifyLine(line) {
  if (!line) {
    return "blank";
  }
  if (MAJOR_SEPARATOR_PATTERN.test(line)) {
    return "separator";
  }
  if (ANTI_PATTERN_BULLET_PATTERN.test(line)) {
    return "anti_bullet";
  }
  if (BULLET_PATTERN.test(line)) {
    return "info_bullet";
  }
  if (LIST_ITEM_PATTERN.test(line)) {
    return "list_item";
  }
  if (SUBSECTION_PATTERN.test(line)) {
    return "subsection";
  }
  return "text";
}

function isSectionBoundary(kind) {
  return kind === "separator" || kind === "anti_bullet";
}

function analyzeSections(entries) {
  const scoped = entries.slice(-tailEntries);
  const candidates = [];
  const rejections = [];
  for (let index = 0; index < scoped.length; index += 1) {
    const entry = scoped[index];
    const lines = splitVisibleLines(entry.visibleText).map(scrubLine).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }
    const firstKind = classifyLine(lines[0]);
    if (firstKind !== "separator") {
      continue;
    }
    const sectionLines = [];
    let opened = false;
    let rejected = "";
    let consumedEntries = 0;
    for (let lookahead = index + 1; lookahead < scoped.length && lookahead < index + 80; lookahead += 1) {
      const next = scoped[lookahead];
      const nextLines = splitVisibleLines(next.visibleText).map(scrubLine).filter(Boolean);
      if (nextLines.length === 0) {
        continue;
      }
      consumedEntries += 1;
      for (const line of nextLines) {
        const kind = classifyLine(line);
        if (!opened) {
          if (kind === "info_bullet") {
            opened = true;
            sectionLines.push(line);
            continue;
          }
          if (kind === "separator") {
            rejected = "empty_between_separators";
            break;
          }
          if (kind === "anti_bullet") {
            rejected = "first_bullet_anti_pattern";
            break;
          }
          continue;
        }
        if (isSectionBoundary(kind)) {
          break;
        }
        if (kind === "subsection" || kind === "list_item" || kind === "text") {
          sectionLines.push(line);
          continue;
        }
      }
      const lastKind = nextLines.length ? classifyLine(scrubLine(nextLines[nextLines.length - 1])) : "blank";
      if (rejected) {
        break;
      }
      if (opened && isSectionBoundary(lastKind)) {
        break;
      }
      if (opened && consumedEntries >= 12) {
        break;
      }
    }
    if (!opened) {
      rejections.push({ anchorTimestamp: entry.timestamp, reason: rejected || "no_info_bullet" });
      continue;
    }
    const bulletLine = sectionLines[0] || "";
    const text = normalizeWhitespace(bulletLine.replace(BULLET_PATTERN, ""));
    if (!text) {
      rejections.push({ anchorTimestamp: entry.timestamp, reason: rejected || "empty_text" });
      continue;
    }
    const normalizedLines = [];
    normalizedLines.push(text);
    let currentSubsection = "";
    for (const line of sectionLines.slice(1)) {
      const kind = classifyLine(line);
      if (kind === "subsection") {
        currentSubsection = line;
        normalizedLines.push("");
        normalizedLines.push(line);
        continue;
      }
      if (kind === "list_item") {
        if (!currentSubsection && normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "") {
          normalizedLines.push("");
        }
        normalizedLines.push(line);
        continue;
      }
      if (kind === "text") {
        if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "") {
          normalizedLines[normalizedLines.length - 1] = `${normalizedLines[normalizedLines.length - 1]} ${line}`.trim();
        } else {
          normalizedLines.push(line);
        }
      }
    }
    const compactText = normalizedLines.filter((line, lineIndex, arr) => !(line === "" && arr[lineIndex - 1] === "")).join("\n").trim();
    if (!compactText || STATUS_RIBBON_PATTERN.test(compactText) || PROMPT_PATTERN.test(compactText)) {
      rejections.push({ anchorTimestamp: entry.timestamp, reason: rejected || "normalized_contamination" });
      continue;
    }
    candidates.push({
      anchorTimestamp: entry.timestamp,
      text: compactText,
      rawSectionLines: sectionLines.slice()
    });
  }
  return { scopedEntries: scoped.length, candidates, rejections };
}

const entries = loadEntries(captureFile, { sessionName, deckId, appLabel });
const analysis = analyzeSections(entries);

if (format === "json") {
  console.log(JSON.stringify({
    source: path.basename(captureFile),
    sessionName,
    deckId,
    appLabel,
    tailEntries,
    analysis
  }, null, 2));
  process.exit(0);
}

console.log(`# ${path.basename(captureFile)}`);
console.log(`sessionName: ${sessionName || "(all)"}`);
console.log(`deckId: ${deckId || "(all)"}`);
console.log(`appLabel: ${appLabel || "(all)"}`);
console.log(`tailEntries: ${tailEntries}`);
console.log(`scopedEntries: ${analysis.scopedEntries}`);
console.log("");
console.log("candidates:");
if (analysis.candidates.length === 0) {
  console.log("- none");
} else {
  for (const candidate of analysis.candidates) {
    console.log(`- ${candidate.anchorTimestamp}`);
    console.log(candidate.text.split("\n").map((line) => `  ${line}`).join("\n"));
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
