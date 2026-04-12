#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
logScriptStart("scripts/analyze-codex-message-boundaries.mjs");

function usage() {
  console.error("Usage: node scripts/analyze-codex-message-boundaries.mjs <dump-file> [<dump-file> ...] [--format json|text]");
  process.exit(1);
}

const args = process.argv.slice(2);
const files = [];
let format = "text";
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--format") {
    format = args[index + 1] || "";
    index += 1;
    continue;
  }
  files.push(value);
}
if (!files.length || !["json", "text"].includes(format)) {
  usage();
}

const MAJOR_SEPARATOR_PATTERN = /^─{40,}$/u;
const WORKED_FOR_PATTERN = /^─+\s*Worked for\b/iu;
const PROMPT_PATTERN = /^›\s+/u;
const BULLET_PATTERN = /^•\s+/u;
const INDENT_PATTERN = /^  /u;
const TAIL_PATTERN = /^  (?:└|│|□)\s/u;
const LIST_ITEM_PATTERN = /^-\s+/u;
const SUBSECTION_PATTERN = /^[A-ZÄÖÜ][\p{L}\p{N}\- ]{2,80}$/u;
const ANTI_BULLET_PATTERN = /^•\s+(?:Ran|Explored|Waited|Context compacted|Updated Plan)\b/u;

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function classifyLine(line) {
  if (MAJOR_SEPARATOR_PATTERN.test(line)) {
    return "separator";
  }
  if (WORKED_FOR_PATTERN.test(line)) {
    return "worked_banner";
  }
  if (PROMPT_PATTERN.test(line)) {
    return "prompt";
  }
  if (BULLET_PATTERN.test(line)) {
    return ANTI_BULLET_PATTERN.test(line) ? "anti_bullet" : "bullet";
  }
  if (TAIL_PATTERN.test(line)) {
    return "tail";
  }
  if (INDENT_PATTERN.test(line)) {
    const trimmed = normalizeWhitespace(line);
    if (LIST_ITEM_PATTERN.test(trimmed)) {
      return "list_item";
    }
    if (SUBSECTION_PATTERN.test(trimmed)) {
      return "subsection";
    }
    return "continuation";
  }
  if (!normalizeWhitespace(line)) {
    return "blank";
  }
  return "text";
}

function collectSeparatorAnchoredBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (classifyLine(lines[index]) !== "separator") {
      continue;
    }
    let cursor = index + 1;
    while (cursor < lines.length && classifyLine(lines[cursor]) === "blank") {
      cursor += 1;
    }
    if (cursor >= lines.length) {
      continue;
    }
    if (classifyLine(lines[cursor]) !== "bullet") {
      continue;
    }
    const block = {
      separatorLine: index + 1,
      headlineLine: cursor + 1,
      lines: [{ lineNumber: cursor + 1, raw: lines[cursor], kind: "bullet" }],
      closingReason: "eof",
      closingLine: lines.length,
      infoFit: true,
      sectionFit: false,
      antiBulletClosed: false,
      continuationCount: 0,
      listItemCount: 0,
      subsectionCount: 0,
      tailCount: 0,
      plainTextCount: 0
    };
    cursor += 1;
    while (cursor < lines.length) {
      const kind = classifyLine(lines[cursor]);
      if (kind === "blank") {
        cursor += 1;
        continue;
      }
      if (kind === "separator") {
        block.closingReason = "next_separator";
        block.closingLine = cursor + 1;
        break;
      }
      if (kind === "worked_banner") {
        block.closingReason = "worked_banner";
        block.closingLine = cursor + 1;
        break;
      }
      if (kind === "prompt") {
        block.closingReason = "prompt";
        block.closingLine = cursor + 1;
        break;
      }
      if (kind === "anti_bullet") {
        block.closingReason = "next_anti_bullet";
        block.closingLine = cursor + 1;
        block.antiBulletClosed = true;
        break;
      }
      if (kind === "bullet") {
        block.closingReason = "next_info_bullet";
        block.closingLine = cursor + 1;
        break;
      }
      block.lines.push({ lineNumber: cursor + 1, raw: lines[cursor], kind });
      if (kind === "continuation") {
        block.continuationCount += 1;
      } else if (kind === "list_item") {
        block.listItemCount += 1;
      } else if (kind === "subsection") {
        block.subsectionCount += 1;
      } else if (kind === "tail") {
        block.tailCount += 1;
      } else if (kind === "text") {
        block.plainTextCount += 1;
      }
      cursor += 1;
    }
    block.infoFit = block.listItemCount === 0 && block.subsectionCount === 0 && block.tailCount === 0 && block.plainTextCount === 0 && block.continuationCount <= 1;
    block.sectionFit = block.tailCount === 0 && (block.listItemCount > 0 || block.subsectionCount > 0 || block.continuationCount >= 2 || block.plainTextCount > 0);
    block.normalizedText = block.lines
      .map((entry) => normalizeWhitespace(entry.kind === "bullet" ? entry.raw.replace(BULLET_PATTERN, "") : entry.raw.replace(/^  /u, "")))
      .filter(Boolean)
      .join("\n");
    blocks.push(block);
  }
  return blocks;
}

function analyzeFile(filePath) {
  const lines = normalizeLineBreaks(fs.readFileSync(filePath, "utf8")).split("\n");
  const blocks = collectSeparatorAnchoredBlocks(lines);
  const summary = {
    totalBlocks: blocks.length,
    infoFitBlocks: blocks.filter((block) => block.infoFit).length,
    sectionFitBlocks: blocks.filter((block) => block.sectionFit).length,
    nextSeparatorClosed: blocks.filter((block) => block.closingReason === "next_separator").length,
    nextInfoBulletClosed: blocks.filter((block) => block.closingReason === "next_info_bullet").length,
    nextAntiBulletClosed: blocks.filter((block) => block.closingReason === "next_anti_bullet").length,
    promptClosed: blocks.filter((block) => block.closingReason === "prompt").length,
    workedBannerClosed: blocks.filter((block) => block.closingReason === "worked_banner").length,
    eofClosed: blocks.filter((block) => block.closingReason === "eof").length,
    multiLineBlocks: blocks.filter((block) => block.lines.length > 1).length,
    deepBlocks: blocks.filter((block) => block.lines.length >= 3).length
  };
  return {
    file: path.basename(filePath),
    summary,
    blocks: blocks.map((block) => ({
      separatorLine: block.separatorLine,
      headlineLine: block.headlineLine,
      closingReason: block.closingReason,
      closingLine: block.closingLine,
      lineCount: block.lines.length,
      continuationCount: block.continuationCount,
      subsectionCount: block.subsectionCount,
      listItemCount: block.listItemCount,
      plainTextCount: block.plainTextCount,
      infoFit: block.infoFit,
      sectionFit: block.sectionFit,
      normalizedText: block.normalizedText
    }))
  };
}

const reports = files.map(analyzeFile);
if (format === "json") {
  console.log(JSON.stringify(reports, null, 2));
  process.exit(0);
}
for (const report of reports) {
  console.log(`# ${report.file}`);
  for (const [key, value] of Object.entries(report.summary)) {
    console.log(`${key}: ${value}`);
  }
  console.log("");
  console.log("blocks:");
  for (const block of report.blocks.slice(0, 20)) {
    console.log(`- separator@${block.separatorLine} headline@${block.headlineLine} close=${block.closingReason}@${block.closingLine} lines=${block.lineCount} infoFit=${block.infoFit} sectionFit=${block.sectionFit}`);
    console.log(`  ${block.normalizedText.replace(/\n/g, " | ")}`);
  }
  console.log("");
}
