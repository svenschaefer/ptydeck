#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/analyze-codex-stream-blocks.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-codex-stream-blocks.mjs [--capture-file <jsonl>] [--session-name <name>] [--deck-id <deck>] [--format json|text] <text-file> [text-file...]"
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
let format = "text";
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
  if (value === "--format") {
    format = args[index + 1] || "";
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

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function decodeCaptureText(filePath, filters = {}) {
  const lines = normalizeLineBreaks(fs.readFileSync(filePath, "utf8")).split("\n");
  const parts = [];
  let matchedEntries = 0;
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
    const cleanedBase64 = typeof parsed?.cleaned?.base64 === "string" ? parsed.cleaned.base64 : "";
    if (!cleanedBase64) {
      continue;
    }
    try {
      parts.push(Buffer.from(cleanedBase64, "base64").toString("utf8"));
      matchedEntries += 1;
    } catch {
      continue;
    }
  }
  return {
    text: parts.join(""),
    matchedEntries
  };
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

function isMajorSeparator(line) {
  return /^─{40,}$/u.test(line) || /^─ Worked for .* ─+$/u.test(line) || /^› /u.test(line);
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
    if (!/^  /u.test(text)) {
      continue;
    }
    const normalized = text.trim();
    if (!normalized) {
      continue;
    }
    parts.push(normalized);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractBlocksFromVisibleText(visibleText) {
  const normalized = normalizeLineBreaks(visibleText);
  const lines = normalized.split("\n");
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
    const blockType = classifyBullet(current.lines[0] || "");
    const text = normalizeInfoText(current.lines);
    const entry = {
      startLine: current.startLine,
      endLine: current.endLine,
      sectionIndex: current.sectionIndex,
      bulletIndexWithinSection: current.bulletIndexWithinSection,
      type: blockType,
      text,
      headline: String(current.lines[0] || ""),
      rawLines: current.lines.slice(),
      defaultCandidate: current.sectionIndex >= 0 && current.bulletIndexWithinSection === 1 && blockType === "info"
    };
    blocks.push(entry);
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

function analyzeTextSource(name, text, metadata = {}) {
  const visibleText = normalizeVisibleReplayText(text);
  const blocks = extractBlocksFromVisibleText(visibleText);
  const countsByType = Object.create(null);
  for (const block of blocks) {
    countsByType[block.type] = (countsByType[block.type] || 0) + 1;
  }
  return {
    source: name,
    metadata,
    visibleChars: visibleText.length,
    blockCount: blocks.length,
    countsByType,
    defaultCandidates: blocks.filter((block) => block.defaultCandidate).map((block) => ({
      startLine: block.startLine,
      endLine: block.endLine,
      sectionIndex: block.sectionIndex,
      text: block.text
    })),
    blocks
  };
}

const analyses = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  analyses.push(analyzeTextSource(path.basename(file), text, { kind: "text_file", path: file }));
}
if (captureFile) {
  const capture = decodeCaptureText(captureFile, {
    sessionName: sessionName || "",
    deckId: deckId || ""
  });
  analyses.push(
    analyzeTextSource(path.basename(captureFile), capture.text, {
      kind: "capture_jsonl",
      path: captureFile,
      matchedEntries: capture.matchedEntries,
      sessionName: sessionName || "",
      deckId: deckId || ""
    })
  );
}

if (format === "json") {
  console.log(JSON.stringify({ analyses }, null, 2));
  process.exit(0);
}

for (const analysis of analyses) {
  console.log(`# ${analysis.source}`);
  if (analysis.metadata.kind) {
    console.log(`kind: ${analysis.metadata.kind}`);
  }
  if (analysis.metadata.path) {
    console.log(`path: ${analysis.metadata.path}`);
  }
  if (Number.isInteger(analysis.metadata.matchedEntries)) {
    console.log(`matchedEntries: ${analysis.metadata.matchedEntries}`);
  }
  console.log(`visibleChars: ${analysis.visibleChars}`);
  console.log(`blockCount: ${analysis.blockCount}`);
  console.log("countsByType:");
  for (const [name, count] of Object.entries(analysis.countsByType).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("defaultCandidates:");
  for (const candidate of analysis.defaultCandidates.slice(0, 20)) {
    console.log(`  section ${candidate.sectionIndex} L${candidate.startLine}-${candidate.endLine}: ${candidate.text}`);
  }
  console.log("");
}
