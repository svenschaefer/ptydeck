const WORKFLOW_AST_VERSION = 1;
const SUPPORTED_WAIT_SOURCES = Object.freeze(["line", "visible-line", "status", "summary", "exit-code", "session-state"]);
const UNSUPPORTED_WORKFLOW_DIRECTIVES = new Set(["if", "unless", "capture", "else", "stop"]);
const DURATION_SEGMENT_RE = /(\d+)(ms|h|m|s)/gy;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

export class SlashWorkflowParseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SlashWorkflowParseError";
    this.code = code;
    Object.assign(this, details);
  }
}

function throwParseError(code, message, details = {}) {
  throw new SlashWorkflowParseError(code, message, details);
}

function parseDurationToken(token, line) {
  const value = String(token || "").trim();
  if (!value) {
    throwParseError("workflow.invalid_duration", `Invalid workflow duration at line ${line}.`, { line, token: value });
  }
  let totalMs = 0;
  let cursor = 0;
  while (cursor < value.length) {
    DURATION_SEGMENT_RE.lastIndex = cursor;
    const match = DURATION_SEGMENT_RE.exec(value);
    if (!match || match.index !== cursor) {
      throwParseError("workflow.invalid_duration", `Invalid workflow duration at line ${line}.`, { line, token: value });
    }
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) {
      throwParseError("workflow.invalid_duration", `Invalid workflow duration at line ${line}.`, { line, token: value });
    }
    if (unit === "ms") {
      totalMs += amount;
    } else if (unit === "s") {
      totalMs += amount * 1000;
    } else if (unit === "m") {
      totalMs += amount * 60 * 1000;
    } else if (unit === "h") {
      totalMs += amount * 60 * 60 * 1000;
    }
    cursor = DURATION_SEGMENT_RE.lastIndex;
  }
  if (cursor !== value.length || totalMs <= 0) {
    throwParseError("workflow.invalid_duration", `Invalid workflow duration at line ${line}.`, { line, token: value });
  }
  return deepFreeze({
    text: value,
    ms: totalMs
  });
}

function consumeRegexLiteral(input, line) {
  const value = String(input || "").trimStart();
  if (!value.startsWith("/")) {
    throwParseError("workflow.invalid_regex", `Invalid workflow regex at line ${line}.`, { line, token: value });
  }
  let escaped = false;
  let closeIndex = -1;
  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "/") {
      closeIndex = index;
      break;
    }
  }
  if (closeIndex < 0) {
    throwParseError("workflow.invalid_regex", `Invalid workflow regex at line ${line}.`, { line, token: value });
  }
  let flagsEnd = closeIndex + 1;
  while (flagsEnd < value.length && /[a-z]/i.test(value[flagsEnd])) {
    flagsEnd += 1;
  }
  const trailing = value.slice(flagsEnd);
  if (trailing && !/^\s/.test(trailing)) {
    throwParseError("workflow.invalid_regex", `Invalid workflow regex at line ${line}.`, { line, token: value });
  }
  const literal = value.slice(0, flagsEnd);
  const source = value.slice(1, closeIndex);
  const flags = value.slice(closeIndex + 1, flagsEnd);
  try {
    // Validate syntax eagerly so parsing errors stay deterministic.
    new RegExp(source, flags);
  } catch {
    throwParseError("workflow.invalid_regex", `Invalid workflow regex at line ${line}.`, { line, token: literal });
  }
  return deepFreeze({
    literal,
    source,
    flags,
    remaining: value.slice(flagsEnd).trim()
  });
}

function parseWaitStep(raw, line) {
  const body = raw.slice(1).trim();
  const rest = body.slice("wait".length).trim();
  if (!rest) {
    throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
  }
  if (rest.startsWith("delay ")) {
    const token = rest.slice("delay ".length).trim();
    if (!token || /\s/.test(token)) {
      throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
    }
    return deepFreeze({
      type: "wait",
      mode: "delay",
      line,
      raw,
      duration: parseDurationToken(token, line)
    });
  }
  if (rest.startsWith("idle ")) {
    const token = rest.slice("idle ".length).trim();
    if (!token || /\s/.test(token)) {
      throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
    }
    return deepFreeze({
      type: "wait",
      mode: "idle",
      line,
      raw,
      duration: parseDurationToken(token, line)
    });
  }
  if (rest.startsWith("until ")) {
    const untilBody = rest.slice("until ".length).trim();
    const sourceMatch = untilBody.match(/^([^\s]+)\s+(.*)$/);
    if (!sourceMatch) {
      throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
    }
    const source = sourceMatch[1];
    if (!SUPPORTED_WAIT_SOURCES.includes(source)) {
      throwParseError("workflow.unknown_source", `Unknown workflow source '${source}' at line ${line}.`, { line, raw, source });
    }
    const regexPart = sourceMatch[2];
    const pattern = consumeRegexLiteral(regexPart, line);
    const remainder = pattern.remaining;
    if (!remainder) {
      throwParseError("workflow.missing_timeout", `Missing workflow timeout at line ${line}.`, { line, raw });
    }
    if (!remainder.startsWith("timeout ")) {
      if (!/\btimeout\b/.test(remainder)) {
        throwParseError("workflow.missing_timeout", `Missing workflow timeout at line ${line}.`, { line, raw });
      }
      throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
    }
    const timeoutToken = remainder.slice("timeout ".length).trim();
    if (!timeoutToken || /\s/.test(timeoutToken)) {
      throwParseError("workflow.missing_timeout", `Missing workflow timeout at line ${line}.`, { line, raw });
    }
    return deepFreeze({
      type: "wait",
      mode: "until",
      line,
      raw,
      source,
      pattern: deepFreeze({
        literal: pattern.literal,
        source: pattern.source,
        flags: pattern.flags
      }),
      timeout: parseDurationToken(timeoutToken, line)
    });
  }
  throwParseError("workflow.invalid_wait", `Invalid workflow wait step at line ${line}.`, { line, raw });
}

function parseActionStep(raw, line) {
  const body = raw.slice(1).trim();
  const parts = body ? body.split(/\s+/) : [];
  const command = String(parts[0] || "").toLowerCase();
  if (!command) {
    throwParseError("workflow.empty_step", `Empty workflow step at line ${line}.`, { line, raw });
  }
  if (UNSUPPORTED_WORKFLOW_DIRECTIVES.has(command)) {
    throwParseError("workflow.unknown_directive", `Unknown workflow directive '/${command}' at line ${line}.`, {
      line,
      raw,
      directive: command
    });
  }
  return deepFreeze({
    type: "action",
    line,
    raw,
    command,
    args: parts.slice(1),
    payload: null
  });
}

function parseWorkflowLine(raw, line) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith("/")) {
    throwParseError("workflow.invalid_step", `Workflow steps must start with '/' at line ${line}.`, { line, raw });
  }
  const command = String(trimmed.slice(1).trim().split(/\s+/, 1)[0] || "").toLowerCase();
  if (command === "wait") {
    return parseWaitStep(trimmed, line);
  }
  return parseActionStep(trimmed, line);
}

export function parseSlashWorkflow(input) {
  const raw = String(input || "");
  const lines = raw.split(/\r?\n/);
  const steps = [];
  let blockTarget = null;
  let blockStartLine = 0;
  let blockLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const trimmed = line.trim();

    if (blockTarget) {
      if (trimmed === "---") {
        blockTarget.payload = blockLines.join("\n");
        deepFreeze(blockTarget);
        blockTarget = null;
        blockStartLine = 0;
        blockLines = [];
      } else {
        blockLines.push(line);
      }
      continue;
    }

    if (!trimmed) {
      continue;
    }

    if (trimmed === "---") {
      const lastStep = steps[steps.length - 1] || null;
      if (!lastStep || lastStep.type !== "action" || lastStep.payload !== null) {
        throwParseError("workflow.malformed_block", `Malformed workflow block boundary at line ${lineNumber}.`, {
          line: lineNumber,
          raw: line
        });
      }
      blockTarget = { ...lastStep };
      steps[steps.length - 1] = blockTarget;
      blockStartLine = lineNumber;
      blockLines = [];
      continue;
    }

    steps.push(parseWorkflowLine(line, lineNumber));
  }

  if (blockTarget) {
    throwParseError("workflow.malformed_block", `Unclosed workflow block starting at line ${blockStartLine}.`, {
      line: blockStartLine,
      raw: "---"
    });
  }
  if (steps.length === 0) {
    throwParseError("workflow.empty", "Workflow input is empty.", { line: 0, raw });
  }

  return deepFreeze({
    kind: "workflow",
    version: WORKFLOW_AST_VERSION,
    raw,
    steps
  });
}

export const SLASH_WORKFLOW_AST_VERSION = WORKFLOW_AST_VERSION;
export const SLASH_WORKFLOW_WAIT_SOURCES = SUPPORTED_WAIT_SOURCES;
