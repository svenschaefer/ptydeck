#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-terminal-dump-visuals.mjs");

function usage() {
  console.error("Usage: node scripts/analyze-terminal-dump-visuals.mjs <file> [file...] [--format json|text]");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
}

let format = "text";
const files = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--format") {
    format = args[index + 1] || "";
    index += 1;
    continue;
  }
  files.push(value);
}

if (files.length === 0 || !["json", "text"].includes(format)) {
  usage();
}

const bulletRolePatterns = [
  { name: "updated_plan", pattern: /^• Updated Plan$/u },
  { name: "explored", pattern: /^• Explored$/u },
  { name: "ran", pattern: /^• Ran /u },
  { name: "waited", pattern: /^• Waited for background terminal/u },
  { name: "context_compacted", pattern: /^• Context compacted$/u },
  { name: "commentary", pattern: /^• /u },
];

function classifyLine(line) {
  if (/^› /u.test(line)) {
    return "prompt";
  }
  if (/^─ Worked for .* ─+$/u.test(line)) {
    return "worked_banner";
  }
  if (/^─{10,}$/u.test(line)) {
    return "separator";
  }
  if (/^• /u.test(line)) {
    return "bullet";
  }
  if (/^  └ /u.test(line)) {
    return "tail";
  }
  if (/^  │ /u.test(line)) {
    return "pipe";
  }
  if (/□/u.test(line)) {
    return "checklist";
  }
  if (/^  [^ ].* · .*/u.test(line)) {
    return "footer";
  }
  if (/^\s*$/u.test(line)) {
    return "blank";
  }
  if (/^  /u.test(line)) {
    return "indented";
  }
  return "body";
}

function detectBulletRole(line) {
  for (const entry of bulletRolePatterns) {
    if (entry.pattern.test(line)) {
      return entry.name;
    }
  }
  return null;
}

function analyzeFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/u);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const counts = Object.create(null);
  const bulletRoles = Object.create(null);
  const separatorBlocks = [];
  const footers = [];
  const prompts = [];
  const longLines = [];
  let hasEsc = false;
  let currentBlock = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("\u001b")) {
      hasEsc = true;
    }
    const lineType = classifyLine(line);
    counts[lineType] = (counts[lineType] || 0) + 1;

    if (lineType === "bullet") {
      const role = detectBulletRole(line);
      if (role) {
        bulletRoles[role] = (bulletRoles[role] || 0) + 1;
      }
    }

    if (lineType === "footer") {
      footers.push({ lineNumber: index + 1, text: line });
    }
    if (lineType === "prompt") {
      prompts.push({ lineNumber: index + 1, text: line });
    }
    if (line.length > 110) {
      longLines.push({ lineNumber: index + 1, length: line.length, text: line });
    }

    if (lineType === "separator" || lineType === "worked_banner") {
      if (currentBlock.length > 0) {
        separatorBlocks.push(currentBlock);
        currentBlock = [];
      }
      separatorBlocks.push([{ lineNumber: index + 1, type: lineType, text: line }]);
      continue;
    }
    currentBlock.push({ lineNumber: index + 1, type: lineType, text: line });
  }

  if (currentBlock.length > 0) {
    separatorBlocks.push(currentBlock);
  }

  return {
    file: filePath,
    basename: path.basename(filePath),
    totalLines: lines.length,
    hasEsc,
    counts,
    bulletRoles,
    separatorBlockCount: separatorBlocks.length,
    promptCount: prompts.length,
    footerCount: footers.length,
    firstPrompt: prompts[0] || null,
    lastFooter: footers[footers.length - 1] || null,
    longestVisibleLines: longLines.slice().sort((left, right) => right.length - left.length).slice(0, 10),
  };
}

const analyses = files.map(analyzeFile);

if (format === "json") {
  console.log(JSON.stringify({ files: analyses }, null, 2));
  process.exit(0);
}

for (const analysis of analyses) {
  console.log(`# ${analysis.basename}`);
  console.log(`totalLines: ${analysis.totalLines}`);
  console.log(`hasEsc: ${analysis.hasEsc}`);
  console.log(`separatorBlockCount: ${analysis.separatorBlockCount}`);
  console.log(`promptCount: ${analysis.promptCount}`);
  console.log(`footerCount: ${analysis.footerCount}`);
  console.log("counts:");
  for (const [name, count] of Object.entries(analysis.counts).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("bulletRoles:");
  for (const [name, count] of Object.entries(analysis.bulletRoles).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${name}: ${count}`);
  }
  if (analysis.firstPrompt) {
    console.log(`firstPrompt: L${analysis.firstPrompt.lineNumber} ${analysis.firstPrompt.text}`);
  }
  if (analysis.lastFooter) {
    console.log(`lastFooter: L${analysis.lastFooter.lineNumber} ${analysis.lastFooter.text}`);
  }
  console.log("longestVisibleLines:");
  for (const entry of analysis.longestVisibleLines) {
    console.log(`  L${entry.lineNumber} (${entry.length}): ${entry.text}`);
  }
  console.log("");
}
