import xtermHeadless from "@xterm/headless";
import { normalizeVisibleReplayText } from "./replay-excerpt.js";

const { Terminal } = xtermHeadless;

export const DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS = Object.freeze({
  cols: 120,
  rows: 40,
  scrollback: 4000,
  snapshotScrollbackLines: 400,
  transcriptEntryLimit: 400,
  transcriptCharLimit: 120_000,
  diffLineLimit: 200,
  convertEol: true
});

function normalizePositiveInteger(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum) {
    return fallback;
  }
  return Math.min(value, maximum);
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePromptBoundaries(promptBoundaries, maxLength = 0) {
  return Object.freeze(
    Array.from(
      new Set(
        (Array.isArray(promptBoundaries) ? promptBoundaries : [])
          .map((entry) => (Number.isInteger(entry) && entry >= 0 && entry <= maxLength ? entry : null))
          .filter((entry) => entry !== null)
      )
    ).sort((left, right) => left - right)
  );
}

function freezeStringArray(values = []) {
  return Object.freeze(values.map((value) => (typeof value === "string" ? value : String(value ?? ""))));
}

function createEmptyTailLines(count) {
  return freezeStringArray(Array.from({ length: count }, () => ""));
}

function readBufferViewportLines(buffer, rows) {
  const visibleRowCount = normalizePositiveInteger(rows, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.rows, 1, 500);
  if (!buffer) {
    return createEmptyTailLines(visibleRowCount);
  }
  const start = Math.max(0, buffer.viewportY);
  const lines = [];
  for (let index = 0; index < visibleRowCount; index += 1) {
    lines.push(buffer.getLine(start + index)?.translateToString(true) || "");
  }
  return freezeStringArray(lines);
}

function readBufferTailLines(buffer, limit) {
  const normalizedLimit = normalizePositiveInteger(limit, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.snapshotScrollbackLines, 1, 10_000);
  if (!buffer) {
    return Object.freeze([]);
  }
  const start = Math.max(0, buffer.length - normalizedLimit);
  const lines = [];
  for (let index = start; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) || "");
  }
  return freezeStringArray(lines);
}

function buildProjectionSnapshot({ terminal, sessionId, revision, limits }) {
  const activeBuffer = terminal.buffer.active;
  const normalBuffer = terminal.buffer.normal;
  const alternateBuffer = terminal.buffer.alternate;
  return Object.freeze({
    entityType: "TerminalProjectionSnapshot",
    sessionId,
    revision,
    cols: terminal.cols,
    rows: terminal.rows,
    activeBufferType: activeBuffer.type,
    cursorX: activeBuffer.cursorX,
    cursorY: activeBuffer.cursorY,
    viewportY: activeBuffer.viewportY,
    baseY: activeBuffer.baseY,
    activeBufferLength: activeBuffer.length,
    normalBufferLength: normalBuffer.length,
    alternateBufferLength: alternateBuffer.length,
    activeVisibleLines: readBufferViewportLines(activeBuffer, terminal.rows),
    activeTailLines: readBufferTailLines(activeBuffer, limits.snapshotScrollbackLines),
    normalTailLines: readBufferTailLines(normalBuffer, limits.snapshotScrollbackLines)
  });
}

function truncateDiffEntries(entries, maxLines) {
  if (entries.length <= maxLines) {
    return Object.freeze(entries);
  }
  return Object.freeze(entries.slice(0, maxLines));
}

function computeChangedLines(beforeLines, afterLines, maxLines) {
  const lines = [];
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < maxLength; index += 1) {
    const before = beforeLines[index] || "";
    const after = afterLines[index] || "";
    if (before === after) {
      continue;
    }
    lines.push(Object.freeze({ index, before, after }));
  }
  return Object.freeze({
    lines: truncateDiffEntries(lines, maxLines),
    totalChangedLines: lines.length,
    truncated: lines.length > maxLines
  });
}

export function normalizeTerminalProjectionResourceLimits(options = {}) {
  return Object.freeze({
    cols: normalizePositiveInteger(options.cols, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.cols, 20, 500),
    rows: normalizePositiveInteger(options.rows, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.rows, 5, 300),
    scrollback: normalizePositiveInteger(options.scrollback, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.scrollback, 10, 50_000),
    snapshotScrollbackLines: normalizePositiveInteger(
      options.snapshotScrollbackLines,
      DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.snapshotScrollbackLines,
      10,
      10_000
    ),
    transcriptEntryLimit: normalizePositiveInteger(
      options.transcriptEntryLimit,
      DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.transcriptEntryLimit,
      10,
      10_000
    ),
    transcriptCharLimit: normalizePositiveInteger(
      options.transcriptCharLimit,
      DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.transcriptCharLimit,
      1_000,
      2_000_000
    ),
    diffLineLimit: normalizePositiveInteger(
      options.diffLineLimit,
      DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.diffLineLimit,
      10,
      5_000
    ),
    convertEol: normalizeBoolean(options.convertEol, DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.convertEol)
  });
}

export function diffTerminalProjectionSnapshots(beforeSnapshot, afterSnapshot, options = {}) {
  const maxLines = normalizePositiveInteger(
    options.maxLines,
    DEFAULT_TERMINAL_PROJECTION_RESOURCE_LIMITS.diffLineLimit,
    1,
    5_000
  );
  const before = beforeSnapshot || Object.freeze({ activeVisibleLines: Object.freeze([]), activeTailLines: Object.freeze([]), normalTailLines: Object.freeze([]), revision: 0 });
  const after = afterSnapshot || Object.freeze({ activeVisibleLines: Object.freeze([]), activeTailLines: Object.freeze([]), normalTailLines: Object.freeze([]), revision: 0 });
  return Object.freeze({
    entityType: "TerminalProjectionDiff",
    fromRevision: Number.isInteger(before.revision) ? before.revision : 0,
    toRevision: Number.isInteger(after.revision) ? after.revision : 0,
    activeBufferTypeChanged: normalizeNonEmptyString(before.activeBufferType) !== normalizeNonEmptyString(after.activeBufferType),
    activeVisibleLines: computeChangedLines(before.activeVisibleLines || [], after.activeVisibleLines || [], maxLines),
    activeTailLines: computeChangedLines(before.activeTailLines || [], after.activeTailLines || [], maxLines),
    normalTailLines: computeChangedLines(before.normalTailLines || [], after.normalTailLines || [], maxLines)
  });
}

export function createTerminalProjectionTracker(options = {}) {
  const limits = normalizeTerminalProjectionResourceLimits(options.resourceLimits || options);
  const sessionId = normalizeNonEmptyString(options.sessionId);
  const terminal = new Terminal({
    cols: limits.cols,
    rows: limits.rows,
    scrollback: limits.scrollback,
    convertEol: limits.convertEol,
    allowProposedApi: true
  });
  let revision = 0;
  let transcriptSequence = 0;
  const transcriptEntries = [];
  let retainedTranscriptChars = 0;

  function trimTranscriptEntries() {
    while (transcriptEntries.length > limits.transcriptEntryLimit) {
      const removed = transcriptEntries.shift();
      retainedTranscriptChars = Math.max(0, retainedTranscriptChars - (removed?.visibleText?.length || 0));
    }
    while (retainedTranscriptChars > limits.transcriptCharLimit && transcriptEntries.length > 0) {
      const removed = transcriptEntries.shift();
      retainedTranscriptChars = Math.max(0, retainedTranscriptChars - (removed?.visibleText?.length || 0));
    }
  }

  function pushTranscriptEntry(entry) {
    const normalizedEntry = Object.freeze({
      sequence: ++transcriptSequence,
      revision,
      type: normalizeNonEmptyString(entry?.type) || "pty_data",
      observedAt: Number.isInteger(entry?.observedAt) && entry.observedAt >= 0 ? entry.observedAt : 0,
      promptBoundaryCount: normalizePositiveInteger(entry?.promptBoundaryCount, 0, 0, 10_000),
      rawChars: normalizePositiveInteger(entry?.rawChars, 0, 0, 10_000_000),
      visibleChars: normalizePositiveInteger(entry?.visibleChars, 0, 0, 10_000_000),
      visibleText: typeof entry?.visibleText === "string" ? entry.visibleText : ""
    });
    transcriptEntries.push(normalizedEntry);
    retainedTranscriptChars += normalizedEntry.visibleText.length;
    trimTranscriptEntries();
    return normalizedEntry;
  }

  function syncGeometry(cols, rows, observedAt = 0) {
    const nextCols = normalizePositiveInteger(cols, terminal.cols, 20, 500);
    const nextRows = normalizePositiveInteger(rows, terminal.rows, 5, 300);
    if (terminal.cols === nextCols && terminal.rows === nextRows) {
      return null;
    }
    terminal.resize(nextCols, nextRows);
    revision += 1;
    return pushTranscriptEntry({
      type: "resize",
      observedAt,
      rawChars: 0,
      visibleChars: 0,
      visibleText: `resize:${nextCols}x${nextRows}`
    });
  }

  async function observeData(data, metadata = {}) {
    const rawText = typeof data === "string" ? data : String(data ?? "");
    const observedAt = Number.isInteger(metadata?.observedAt) && metadata.observedAt >= 0 ? metadata.observedAt : 0;
    syncGeometry(metadata?.cols, metadata?.rows, observedAt);
    const normalizedPromptBoundaries = normalizePromptBoundaries(metadata?.promptBoundaries, rawText.length);
    if (rawText) {
      await new Promise((resolve) => terminal.write(rawText, resolve));
    }
    revision += 1;
    const visibleText = normalizeVisibleReplayText(rawText);
    pushTranscriptEntry({
      type: rawText ? "pty_data" : normalizedPromptBoundaries.length > 0 ? "prompt_boundary" : "empty",
      observedAt,
      promptBoundaryCount: normalizedPromptBoundaries.length,
      rawChars: rawText.length,
      visibleChars: visibleText.length,
      visibleText
    });
    return revision;
  }

  function captureSnapshot() {
    return buildProjectionSnapshot({ terminal, sessionId, revision, limits });
  }

  function createBaseline(label = "") {
    return Object.freeze({
      entityType: "TerminalProjectionBaseline",
      baselineId: `baseline:${sessionId || "session"}:${revision}`,
      sessionId,
      label: normalizeNonEmptyString(label),
      revision,
      snapshot: captureSnapshot()
    });
  }

  function getTranscriptDelta(sinceRevision = 0) {
    const normalizedRevision = Number.isInteger(sinceRevision) && sinceRevision >= 0 ? sinceRevision : 0;
    const entries = transcriptEntries.filter((entry) => entry.revision > normalizedRevision);
    return Object.freeze({
      entityType: "TerminalProjectionTranscriptDelta",
      sessionId,
      fromRevision: normalizedRevision,
      toRevision: revision,
      retainedEntryCount: transcriptEntries.length,
      retainedCharCount: retainedTranscriptChars,
      entries: Object.freeze(entries)
    });
  }

  function diffFromBaseline(baseline, options = {}) {
    const beforeSnapshot = baseline?.snapshot || null;
    const afterSnapshot = captureSnapshot();
    return diffTerminalProjectionSnapshots(beforeSnapshot, afterSnapshot, {
      maxLines: normalizePositiveInteger(options.maxLines, limits.diffLineLimit, 1, 5_000)
    });
  }

  function getStatus() {
    return Object.freeze({
      sessionId,
      revision,
      cols: terminal.cols,
      rows: terminal.rows,
      transcriptEntries: transcriptEntries.length,
      transcriptChars: retainedTranscriptChars,
      resourceLimits: limits,
      activeBufferType: terminal.buffer.active.type
    });
  }

  return Object.freeze({
    sessionId,
    resourceLimits: limits,
    observeData,
    syncGeometry,
    captureSnapshot,
    createBaseline,
    getTranscriptDelta,
    diffFromBaseline,
    getStatus
  });
}
