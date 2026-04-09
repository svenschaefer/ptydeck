const ANSI_ESCAPE_PATTERN =
  /(?:\u001b\][\s\S]*?(?:\u0007|\u001b\\)|\u001b[P^_X][\s\S]*?\u001b\\|[\u0090\u0098\u009e\u009f][\s\S]*?\u009c|\u009d[\s\S]*?(?:\u0007|\u009c)|\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~]|\u001b[()#%][ -~]|\u001b[78=>]|\u001b[@-Z\\-_])/g;
const REPLAY_SLICE_SELECTOR_PATTERN = /^(sp|l|c):([1-9]\d*)$/i;

function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizePositiveInteger(value, fallback = 0) {
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function stripAnsiCodes(value) {
  return normalizeText(value).replace(ANSI_ESCAPE_PATTERN, "");
}

export function normalizeVisibleReplayText(value) {
  return stripAnsiCodes(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");
}

function countLogicalLines(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }
  const parts = normalized.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts.length;
}

function normalizeShellBlocks(shellBlocks, textLength) {
  const maxLength = normalizePositiveInteger(textLength, 0);
  return (Array.isArray(shellBlocks) ? shellBlocks : [])
    .map((entry) => {
      const start = normalizePositiveInteger(entry?.start, -1);
      const end = normalizePositiveInteger(entry?.end, -1);
      if (start < 0 || end <= start || end > maxLength) {
        return null;
      }
      return Object.freeze({ start, end });
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

export function parseReplaySliceSelector(value) {
  const normalized = normalizeText(value);
  const match = REPLAY_SLICE_SELECTOR_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }
  const selectorToken = String(match[1] || "").toLowerCase();
  const requestedCount = Number.parseInt(match[2], 10);
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
    return null;
  }
  const selectorKind =
    selectorToken === "sp" ? "shell_blocks" : selectorToken === "l" ? "lines" : selectorToken === "c" ? "chars" : "";
  if (!selectorKind) {
    return null;
  }
  return Object.freeze({
    selector: `${selectorToken}:${requestedCount}`,
    selectorToken,
    selectorKind,
    requestedCount
  });
}

function buildLinesExcerpt(visibleText, selector) {
  const allLines = normalizeText(visibleText).split("\n");
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }
  const excerptLines = allLines.slice(-selector.requestedCount);
  const data = excerptLines.join("\n");
  return {
    selectorSatisfied: allLines.length >= selector.requestedCount,
    availableCount: allLines.length,
    resolvedCount: excerptLines.length,
    data
  };
}

function buildCharsExcerpt(visibleText, selector) {
  const normalized = normalizeText(visibleText);
  const data = normalized.slice(-selector.requestedCount);
  return {
    selectorSatisfied: normalized.length >= selector.requestedCount,
    availableCount: normalized.length,
    resolvedCount: data.length,
    data
  };
}

function buildShellBlocksExcerpt(rawText, shellBlocks, selector) {
  const normalizedShellBlocks = normalizeShellBlocks(shellBlocks, normalizeText(rawText).length);
  const excerptBlocks = normalizedShellBlocks.slice(-selector.requestedCount);
  if (excerptBlocks.length === 0) {
    return {
      selectorSatisfied: false,
      availableCount: normalizedShellBlocks.length,
      resolvedCount: 0,
      data: ""
    };
  }
  const first = excerptBlocks[0];
  const last = excerptBlocks[excerptBlocks.length - 1];
  return {
    selectorSatisfied: normalizedShellBlocks.length >= selector.requestedCount,
    availableCount: normalizedShellBlocks.length,
    resolvedCount: excerptBlocks.length,
    data: normalizeText(rawText).slice(first.start, last.end)
  };
}

export function buildReplayExcerpt(options = {}) {
  const selector = parseReplaySliceSelector(options.selector);
  if (!selector) {
    return null;
  }
  const rawText = normalizeText(options.text);
  const visibleText = normalizeVisibleReplayText(rawText);
  const shellBlocksSupported = options.shellBlocksSupported === true;

  let excerpt = null;
  if (selector.selectorKind === "lines") {
    excerpt = buildLinesExcerpt(visibleText, selector);
  } else if (selector.selectorKind === "chars") {
    excerpt = buildCharsExcerpt(visibleText, selector);
  } else if (selector.selectorKind === "shell_blocks") {
    if (!shellBlocksSupported) {
      return Object.freeze({
        ...selector,
        shellBlocksSupported: false,
        unavailableReason: "shell_blocks_unavailable"
      });
    }
    excerpt = buildShellBlocksExcerpt(rawText, options.shellBlocks, selector);
  }

  if (!excerpt) {
    return null;
  }

  const data = normalizeVisibleReplayText(excerpt.data);
  return Object.freeze({
    selector: selector.selector,
    selectorKind: selector.selectorKind,
    requestedCount: selector.requestedCount,
    selectorSatisfied: excerpt.selectorSatisfied === true,
    availableCount: normalizePositiveInteger(excerpt.availableCount, 0),
    resolvedCount: normalizePositiveInteger(excerpt.resolvedCount, 0),
    data,
    chars: data.length,
    lines: countLogicalLines(data),
    shellBlocksSupported
  });
}
