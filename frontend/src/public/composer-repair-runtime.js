function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return numeric;
}

function normalizeOperations(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

function splitLines(value) {
  return String(value ?? "").split("\n");
}

function buildLcsTable(leftLines, rightLines) {
  const rows = leftLines.length + 1;
  const columns = rightLines.length + 1;
  const table = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      if (leftLines[leftIndex] === rightLines[rightIndex]) {
        table[leftIndex][rightIndex] = table[leftIndex + 1][rightIndex + 1] + 1;
        continue;
      }
      table[leftIndex][rightIndex] = Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }
  return table;
}

export function buildComposerRepairDiff(originalText, repairedText) {
  const original = String(originalText ?? "");
  const repaired = String(repairedText ?? "");
  if (original === repaired) {
    return "";
  }

  const originalLines = splitLines(original);
  const repairedLines = splitLines(repaired);
  const table = buildLcsTable(originalLines, repairedLines);
  const entries = [];
  let originalIndex = 0;
  let repairedIndex = 0;

  while (originalIndex < originalLines.length && repairedIndex < repairedLines.length) {
    if (originalLines[originalIndex] === repairedLines[repairedIndex]) {
      entries.push(` ${originalLines[originalIndex]}`);
      originalIndex += 1;
      repairedIndex += 1;
      continue;
    }
    if (table[originalIndex + 1][repairedIndex] >= table[originalIndex][repairedIndex + 1]) {
      entries.push(`-${originalLines[originalIndex]}`);
      originalIndex += 1;
      continue;
    }
    entries.push(`+${repairedLines[repairedIndex]}`);
    repairedIndex += 1;
  }

  while (originalIndex < originalLines.length) {
    entries.push(`-${originalLines[originalIndex]}`);
    originalIndex += 1;
  }
  while (repairedIndex < repairedLines.length) {
    entries.push(`+${repairedLines[repairedIndex]}`);
    repairedIndex += 1;
  }

  return entries.join("\n");
}

function buildPreviewDetail(candidate) {
  const detailParts = [];
  const languageFamily = normalizeText(candidate?.languageFamily);
  if (languageFamily) {
    detailParts.push(`Family: ${languageFamily}`);
  }
  const confidence = clampConfidence(candidate?.confidence);
  if (confidence !== null) {
    detailParts.push(`Confidence: ${(confidence * 100).toFixed(0)}%`);
  }
  const operations = normalizeOperations(candidate?.operations);
  if (operations.length > 0) {
    detailParts.push(`Ops: ${operations.join("; ")}`);
  }
  return detailParts.join(" | ");
}

export function createComposerRepairPreviewState(originalText, candidate) {
  const original = typeof originalText === "string" ? originalText : "";
  const trimmedOriginal = normalizeText(original);
  if (!trimmedOriginal) {
    return {
      active: false,
      canApply: false,
      summary: "",
      detail: "",
      originalText: "",
      repairedText: "",
      diffText: ""
    };
  }

  if (!candidate || typeof candidate !== "object") {
    return {
      active: true,
      canApply: false,
      summary: "No repair suggestion available.",
      detail: "The Repair preview shell is ready, but no syntax-aware repair candidate matched this input yet.",
      originalText: original,
      repairedText: "",
      diffText: ""
    };
  }

  const repairedText = typeof candidate.repairedText === "string" ? candidate.repairedText : "";
  const detail = normalizeText(candidate?.detail) || buildPreviewDetail(candidate);
  const changed = repairedText !== "" && repairedText !== original;

  if (!changed) {
    return {
      active: true,
      canApply: false,
      summary: normalizeText(candidate?.summary) || "No repair changes suggested.",
      detail: detail || "The current repair stage did not produce a different candidate.",
      originalText: original,
      repairedText: repairedText || original,
      diffText: ""
    };
  }

  return {
    active: true,
    canApply: true,
    summary: normalizeText(candidate?.summary) || "Review repair suggestion.",
    detail,
    originalText: original,
    repairedText,
    diffText: buildComposerRepairDiff(original, repairedText)
  };
}

function detectShellFamily(draft) {
  const text = String(draft ?? "");
  if (
    /\b(powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i.test(text) ||
    /(^|\s)-(ExecutionPolicy|File|Command|NoProfile|NoLogo|EncodedCommand)\b/i.test(text) ||
    /(^|\s)(Get|Set|New|Invoke|Start|Stop|Test)-[A-Za-z]/.test(text) ||
    /`[\r\n]/.test(text)
  ) {
    return "powershell";
  }
  if (/\bcmd(?:\.exe)?\b/i.test(text) || /\^[ \t]*\n/.test(text) || /%[A-Za-z0-9_]+%/.test(text)) {
    return "cmd";
  }
  if (
    /(^|\s)(bash|sh|zsh|fish|docker|kubectl|git|ssh|scp|rsync|npm|node|python3?)\b/.test(text) ||
    /\\[ \t]*\n/.test(text) ||
    /(^|\s)--[A-Za-z0-9-]+/.test(text)
  ) {
    return "shell";
  }
  return null;
}

function getFamilyEscapeMode(languageFamily) {
  if (languageFamily === "powershell") {
    return "backtick";
  }
  if (languageFamily === "cmd") {
    return "caret";
  }
  return "backslash";
}

function detectOpenQuote(text, languageFamily) {
  const source = String(text ?? "");
  const escapeMode = getFamilyEscapeMode(languageFamily);
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === "\"") {
      if (escapeMode === "backslash" && char === "\\") {
        escaped = true;
        continue;
      }
      if (escapeMode === "backtick" && char === "`") {
        escaped = true;
        continue;
      }
      if (escapeMode === "caret" && char === "^") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        quote = null;
      }
      continue;
    }
    if (escapeMode === "backslash" && char === "\\") {
      escaped = true;
      continue;
    }
    if (escapeMode === "backtick" && char === "`") {
      escaped = true;
      continue;
    }
    if (escapeMode === "caret" && char === "^") {
      escaped = true;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
    }
  }

  return quote;
}

function formatOperationLabel(operation) {
  switch (operation) {
    case "joined-quoted":
      return "removed hard-wrap line break inside quoted argument";
    case "joined-continuation":
      return "collapsed explicit line-continuation marker";
    case "joined-path":
      return "joined wrapped path token";
    case "joined-url":
      return "joined wrapped URL token";
    case "joined-token":
      return "joined wrapped token";
    case "joined-value":
      return "joined wrapped argument value";
    default:
      return "";
  }
}

function operationConfidenceWeight(operation) {
  switch (operation) {
    case "joined-quoted":
      return 0.34;
    case "joined-continuation":
      return 0.28;
    case "joined-path":
    case "joined-url":
      return 0.24;
    case "joined-value":
      return 0.22;
    case "joined-token":
      return 0.18;
    default:
      return 0;
  }
}

function tryJoinLine(previousText, nextLine, languageFamily) {
  const trimmedNext = String(nextLine ?? "").replace(/^\s+/, "");
  const previous = String(previousText ?? "");

  if (!trimmedNext) {
    return null;
  }

  const openQuote = detectOpenQuote(previous, languageFamily);
  if (openQuote) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: "joined-quoted"
    };
  }

  if (/[`\\^][ \t]*$/.test(previous)) {
    return {
      text: `${previous.replace(/[ \t]*[`\\^][ \t]*$/, "")} ${trimmedNext}`.replace(/[ \t]{2,}/g, " ").trimEnd(),
      operation: "joined-continuation"
    };
  }

  if (/https?:\/\/[^\s]*[./:_=-]$/i.test(previous) && /^[A-Za-z0-9/_%.:-]/.test(trimmedNext)) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: "joined-url"
    };
  }

  if (/[\\/:=._-]$/.test(previous) && /^[A-Za-z0-9_./:\\%-]/.test(trimmedNext)) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: previous.includes("://") ? "joined-url" : "joined-path"
    };
  }

  if (/[A-Za-z0-9]-(?:[ \t]*)$/.test(previous) && /^[A-Za-z0-9]/.test(trimmedNext)) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: "joined-token"
    };
  }

  if (/=[^\s]*$/.test(previous) && /^[A-Za-z0-9_./:\\%-]/.test(trimmedNext)) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: "joined-value"
    };
  }

  return null;
}

function collectRemainingSuspiciousWraps(text, languageFamily) {
  const lines = splitLines(text);
  let suspiciousCount = 0;
  let prefix = "";
  for (const line of lines) {
    const current = prefix ? `${prefix}\n${line}` : line;
    const openQuote = detectOpenQuote(current, languageFamily);
    if (openQuote) {
      suspiciousCount += 1;
    }
    if (/[\\/:=._-]$/.test(line.trimEnd())) {
      suspiciousCount += 1;
    }
    prefix = current;
  }
  return suspiciousCount;
}

export function requestComposerRepairCandidate({ draft } = {}) {
  const originalDraft = String(draft ?? "");
  const jsonCandidate = requestJsonRepairCandidate(originalDraft);
  if (jsonCandidate) {
    return jsonCandidate;
  }
  const xmlCandidate = requestXmlRepairCandidate(originalDraft);
  if (xmlCandidate) {
    return xmlCandidate;
  }
  const shellCandidate = requestShellRepairCandidate(originalDraft);
  if (shellCandidate) {
    return shellCandidate;
  }
  return null;
}

function requestShellRepairCandidate(originalDraft) {
  const languageFamily = detectShellFamily(originalDraft);
  if (!languageFamily) {
    return null;
  }
  const normalized = originalDraft.replace(/\r\n?/g, "\n");
  const lines = splitLines(normalized);
  if (lines.length < 2) {
    return null;
  }

  const operations = [];
  let output = lines[0].trimEnd();

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!normalizeText(line)) {
      output = `${output}\n${line}`;
      continue;
    }
    const joinResult = tryJoinLine(output, line, languageFamily);
    if (!joinResult) {
      output = `${output}\n${line}`;
      continue;
    }
    output = joinResult.text;
    operations.push(joinResult.operation);
  }

  if (output === normalized || operations.length === 0) {
    return null;
  }

  if (detectOpenQuote(output, languageFamily)) {
    return null;
  }

  const suspiciousWraps = collectRemainingSuspiciousWraps(output, languageFamily);
  if (suspiciousWraps > 0) {
    return null;
  }

  const confidence = operations.reduce((sum, operation) => sum + operationConfidenceWeight(operation), 0.54);
  const normalizedConfidence = clampConfidence(confidence);
  if (normalizedConfidence === null || normalizedConfidence < 0.78) {
    return null;
  }

  return {
    repairedText: output,
    languageFamily,
    confidence: normalizedConfidence,
    operations: Array.from(new Set(operations.map((operation) => formatOperationLabel(operation)).filter(Boolean)))
  };
}

function isLikelyJsonText(draft) {
  const trimmed = normalizeText(draft);
  if (!trimmed) {
    return false;
  }
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return false;
  }
  return /["[{,:}\]]/.test(trimmed);
}

function isInsideJsonString(text) {
  const source = String(text ?? "");
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
    }
  }
  return inString;
}

function requestJsonRepairCandidate(originalDraft) {
  if (!isLikelyJsonText(originalDraft)) {
    return null;
  }
  const normalized = originalDraft.replace(/\r\n?/g, "\n");
  const lines = splitLines(normalized);
  if (lines.length < 2) {
    return null;
  }
  try {
    JSON.parse(normalized);
    return null;
  } catch {
    // continue with repair candidate generation
  }

  const operations = [];
  let output = lines[0].trimEnd();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (isInsideJsonString(output)) {
      output = `${output}${String(line ?? "").replace(/^\s+/, "")}`;
      operations.push("joined wrapped JSON string");
      continue;
    }
    output = `${output}\n${line}`;
  }

  if (output === normalized || operations.length === 0) {
    return null;
  }

  try {
    JSON.parse(output);
  } catch {
    return null;
  }

  const confidence = clampConfidence(0.62 + operations.length * 0.22);
  if (confidence === null || confidence < 0.8) {
    return null;
  }

  return {
    repairedText: output,
    languageFamily: "json",
    confidence,
    operations: Array.from(new Set(operations))
  };
}

function isLikelyXmlText(draft) {
  const trimmed = normalizeText(draft);
  if (!trimmed || !trimmed.startsWith("<")) {
    return false;
  }
  return /<([A-Za-z_][\w:.-]*)(\s|>|\/>)/.test(trimmed) && /<\/?[A-Za-z_]/.test(trimmed);
}

function createXmlParser() {
  if (typeof globalThis.DOMParser !== "function") {
    return null;
  }
  try {
    return new globalThis.DOMParser();
  } catch {
    return null;
  }
}

function hasXmlParserError(documentRef) {
  if (!documentRef || typeof documentRef !== "object") {
    return true;
  }
  const rootName = normalizeText(documentRef?.documentElement?.nodeName).toLowerCase();
  if (rootName === "parsererror") {
    return true;
  }
  if (typeof documentRef.getElementsByTagName === "function") {
    try {
      return Array.from(documentRef.getElementsByTagName("parsererror") || []).length > 0;
    } catch {
      return true;
    }
  }
  return false;
}

function validateXmlText(text) {
  const parser = createXmlParser();
  if (!parser || typeof parser.parseFromString !== "function") {
    return false;
  }
  try {
    const documentRef = parser.parseFromString(String(text ?? ""), "application/xml");
    return !hasXmlParserError(documentRef);
  } catch {
    return false;
  }
}

function analyzeXmlJoinContext(text) {
  const source = String(text ?? "");
  let insideTag = false;
  let attributeQuote = null;
  let lastClosedTagIndex = -1;
  let lastOpenedTagIndex = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (attributeQuote) {
      if (char === attributeQuote) {
        attributeQuote = null;
      }
      continue;
    }
    if (insideTag) {
      if (char === "\"" || char === "'") {
        attributeQuote = char;
        continue;
      }
      if (char === ">") {
        insideTag = false;
        lastClosedTagIndex = index;
      }
      continue;
    }
    if (char === "<") {
      insideTag = true;
      lastOpenedTagIndex = index;
    }
  }

  const trailingSegment = lastClosedTagIndex >= 0 ? source.slice(lastClosedTagIndex + 1) : source;
  return {
    insideTag,
    attributeQuote,
    insideAttributeValue: Boolean(attributeQuote),
    insideTextNode:
      !insideTag &&
      !attributeQuote &&
      trailingSegment.trim() !== "" &&
      trailingSegment.lastIndexOf("<") === -1 &&
      lastOpenedTagIndex <= lastClosedTagIndex
  };
}

function tryJoinXmlLine(previousText, nextLine) {
  const previous = String(previousText ?? "");
  const trimmedNext = String(nextLine ?? "").replace(/^\s+/, "");
  if (!trimmedNext) {
    return null;
  }

  const context = analyzeXmlJoinContext(previous);
  if (context.insideAttributeValue) {
    return {
      text: `${previous}${trimmedNext}`,
      operation: "joined wrapped XML attribute value"
    };
  }
  if (context.insideTextNode && !trimmedNext.startsWith("<")) {
    const separator = /[-/]$/.test(previous.trimEnd()) ? "" : " ";
    return {
      text: `${previous.replace(/[ \t]+$/, "")}${separator}${trimmedNext}`,
      operation: "joined wrapped XML text"
    };
  }
  return null;
}

function requestXmlRepairCandidate(originalDraft) {
  if (!isLikelyXmlText(originalDraft)) {
    return null;
  }
  const normalized = originalDraft.replace(/\r\n?/g, "\n");
  const lines = splitLines(normalized);
  if (lines.length < 2) {
    return null;
  }

  const parser = createXmlParser();
  if (!parser || typeof parser.parseFromString !== "function") {
    return null;
  }

  const operations = [];
  let output = lines[0].trimEnd();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const joinResult = tryJoinXmlLine(output, line);
    if (!joinResult) {
      output = `${output}\n${line}`;
      continue;
    }
    output = joinResult.text;
    operations.push(joinResult.operation);
  }

  if (output === normalized || operations.length === 0) {
    return null;
  }

  if (!validateXmlText(output)) {
    return null;
  }

  const confidence = clampConfidence(0.58 + operations.length * 0.18);
  if (confidence === null || confidence < 0.76) {
    return null;
  }

  return {
    repairedText: output,
    languageFamily: "xml",
    confidence,
    operations: Array.from(new Set(operations))
  };
}
