#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { logScriptStart } from "./lib/script-log.mjs";
import { normalizeVisibleReplayText } from "../backend/src/replay-excerpt.js";

logScriptStart("scripts/experiment-codex-first-use-case.mjs");

function usage() {
  console.error(
    "Usage: node scripts/experiment-codex-first-use-case.mjs --capture-file <jsonl> [--session-name <name>] [--deck-id <deck>] [--app-label codex] [--tail-entries <count>] [--max-gap-ms 2500] [--max-lookahead 120] [--format json|text]"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let captureFile = "";
let sessionName = "";
let deckId = "";
let appLabel = "codex";
let tailEntries = 1200;
let maxGapMs = 2500;
let maxLookahead = 120;
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
  if (value === "--max-gap-ms") {
    maxGapMs = Number.parseInt(args[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (value === "--max-lookahead") {
    maxLookahead = Number.parseInt(args[index + 1] || "", 10);
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
  || !Number.isFinite(maxGapMs)
  || maxGapMs <= 0
  || !Number.isFinite(maxLookahead)
  || maxLookahead <= 0
) {
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

function classifyEntryKind(visibleText) {
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

function isMajorSeparatorVisible(visibleText) {
  return /^─{40,}$/u.test(normalizeWhitespace(visibleText));
}

function startsBullet(visibleText) {
  const lines = normalizeLineBreaks(visibleText).split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (/^• /u.test(line)) {
      return line;
    }
    return "";
  }
  return "";
}

function startsContinuation(visibleText) {
  const lines = normalizeLineBreaks(visibleText).split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    return /^  /u.test(line);
  }
  return false;
}

function hasInlineContamination(text) {
  const compact = normalizeWhitespace(text);
  if (!compact) {
    return true;
  }
  return (
    /•(?:Ran|Explored|Waited|Context compacted|Updated Plan)/u.test(compact)
    || /› /u.test(compact)
    || /gpt-5\.4/u.test(compact)
    || /weekly \d+%/u.test(compact)
    || /background terminal running/u.test(compact)
    || /esc to interrupt/u.test(compact)
    || /\/ps to view/u.test(compact)
    || /\/stop to close/u.test(compact)
  );
}

function normalizeInfoPieces(headline, continuationLines) {
  const parts = [];
  const cleanedHeadline = String(headline || "").replace(/^•\s+/u, "").trim();
  if (cleanedHeadline) {
    parts.push(cleanedHeadline);
  }
  for (const line of continuationLines) {
    const normalized = normalizeWhitespace(String(line || "").replace(/^  /u, ""));
    if (!normalized) {
      continue;
    }
    if (/^(?:└|│|□)\s/u.test(normalized)) {
      continue;
    }
    parts.push(normalized);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
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
    const visibleText = normalizeVisibleReplayText(normalizeLineBreaks(decoded));
    entries.push({
      timestamp: typeof parsed?.timestamp === "string" ? parsed.timestamp : "",
      timestampMs: Number.parseInt(String(Date.parse(parsed?.timestamp || "")), 10) || 0,
      sessionId: typeof parsed?.session?.id === "string" ? parsed.session.id : "",
      sessionName: entrySessionName,
      deckId: entryDeckId,
      appLabel: entryAppLabel,
      visibleText,
      kind: classifyEntryKind(visibleText)
    });
  }
  return entries;
}

function extractFirstUseCaseCandidates(entries) {
  const scoped = entries.slice(-tailEntries);
  const candidates = [];
  const rejections = [];
  const antiPatternTypes = new Set(["ran", "explored", "waited", "context_compacted", "updated_plan"]);

  for (let index = 0; index < scoped.length; index += 1) {
    const anchor = scoped[index];
    if (anchor.kind !== "substantial" || !isMajorSeparatorVisible(anchor.visibleText)) {
      continue;
    }

    const anchorWindowEndMs = anchor.timestampMs + maxGapMs;
    let chosen = null;
    let rejectionReason = "no_following_info_block";

    for (let lookahead = index + 1; lookahead < scoped.length && lookahead <= index + maxLookahead; lookahead += 1) {
      const entry = scoped[lookahead];
      if ((entry.timestampMs - anchor.timestampMs) > maxGapMs) {
        rejectionReason = "gap_timeout";
        break;
      }
      if (entry.kind === "blank" || entry.kind === "overlay_fragment" || entry.kind === "status_ribbon") {
        continue;
      }
      if (isMajorSeparatorVisible(entry.visibleText)) {
        rejectionReason = "next_separator_before_info";
        break;
      }
      const bulletHeadline = startsBullet(entry.visibleText);
      if (!bulletHeadline) {
        rejectionReason = "non_bullet_substantial_before_info";
        break;
      }
      const bulletType = classifyBullet(bulletHeadline);
      if (antiPatternTypes.has(bulletType)) {
        rejectionReason = `first_bullet_${bulletType}`;
        break;
      }
      if (bulletType !== "info") {
        rejectionReason = `first_bullet_${bulletType}`;
        break;
      }

      const continuationLines = [];
      for (let follow = lookahead + 1; follow < scoped.length && follow <= lookahead + 4; follow += 1) {
        const next = scoped[follow];
        if ((next.timestampMs - entry.timestampMs) > 500) {
          break;
        }
        if (next.kind === "blank" || next.kind === "overlay_fragment" || next.kind === "status_ribbon") {
          continue;
        }
        if (startsContinuation(next.visibleText)) {
          continuationLines.push(...normalizeLineBreaks(next.visibleText).split("\n").filter((line) => line.trim()));
          continue;
        }
        break;
      }

      const text = normalizeInfoPieces(
        bulletHeadline,
        continuationLines
      );
      if (!text) {
        rejectionReason = "empty_normalized_info";
        break;
      }
      if (text.length < 24 || text.length > 400) {
        rejectionReason = "info_length_out_of_range";
        break;
      }
      if (hasInlineContamination(text)) {
        rejectionReason = "inline_contamination";
        break;
      }
      chosen = {
        anchorIndex: index,
        anchorTimestamp: anchor.timestamp,
        candidateIndex: lookahead,
        candidateTimestamp: entry.timestamp,
        gapMs: Math.max(0, entry.timestampMs - anchor.timestampMs),
        text
      };
      break;
    }

    if (chosen) {
      candidates.push(chosen);
    } else {
      rejections.push({
        anchorIndex: index,
        anchorTimestamp: anchor.timestamp,
        reason: rejectionReason
      });
    }
  }

  return {
    scopedEntries: scoped.length,
    separatorAnchors: candidates.length + rejections.length,
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
    maxGapMs,
    maxLookahead,
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
console.log(`maxGapMs: ${maxGapMs}`);
console.log(`maxLookahead: ${maxLookahead}`);
console.log(`totalFilteredEntries: ${entries.length}`);
console.log(`scopedEntries: ${analysis.scopedEntries}`);
console.log(`separatorAnchors: ${analysis.separatorAnchors}`);
console.log("");
console.log("candidates:");
if (analysis.candidates.length === 0) {
  console.log("- none");
} else {
  for (const candidate of analysis.candidates) {
    console.log(`- ${candidate.anchorTimestamp} -> ${candidate.candidateTimestamp} (${candidate.gapMs}ms)`);
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
