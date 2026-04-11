import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeVisibleReplayText } from "./replay-excerpt.js";

const DEFAULT_CAPTURE_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_APP_LABELS = Object.freeze(["codex"]);

function normalizeFilePath(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized ? resolve(normalized) : "";
}

function normalizeMaxBytes(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CAPTURE_MAX_BYTES;
}

function normalizeAppLabels(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_APP_LABELS.slice();
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const candidate = entry.trim().toLowerCase();
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized.length > 0 ? normalized : DEFAULT_APP_LABELS.slice();
}

function summarizeAppIdentity(appIdentity) {
  if (!appIdentity || typeof appIdentity !== "object" || Array.isArray(appIdentity)) {
    return {
      family: "",
      label: "",
      source: "",
      confidence: 0
    };
  }
  return {
    family: typeof appIdentity.family === "string" ? appIdentity.family : "",
    label: typeof appIdentity.label === "string" ? appIdentity.label : "",
    source: typeof appIdentity.source === "string" ? appIdentity.source : "",
    confidence: Number.isFinite(appIdentity.confidence) ? Number(appIdentity.confidence) : 0
  };
}

function summarizeSession(meta) {
  return {
    id: typeof meta?.id === "string" ? meta.id : "",
    name: typeof meta?.name === "string" ? meta.name : "",
    deckId: typeof meta?.deckId === "string" ? meta.deckId : "",
    quickIdToken: typeof meta?.quickIdToken === "string" ? meta.quickIdToken : "",
    kind: typeof meta?.kind === "string" ? meta.kind : "",
    cwd: typeof meta?.cwd === "string" ? meta.cwd : ""
  };
}

function buildPreview(value, limit = 240) {
  const normalized = normalizeVisibleReplayText(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 1))}…` : normalized;
}

function shouldCaptureSession(meta, appLabels) {
  const label = typeof meta?.appIdentity?.label === "string" ? meta.appIdentity.label.trim().toLowerCase() : "";
  return Boolean(label && appLabels.includes(label));
}

export function createSessionStreamAnalysisCapture(options = {}) {
  const filePath = normalizeFilePath(options.filePath);
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const appLabels = normalizeAppLabels(options.appLabels);
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;

  const state = {
    enabled: Boolean(filePath),
    initialized: false,
    queue: Promise.resolve(),
    currentBytes: 0,
    capturedTotal: 0,
    rotatedTotal: 0,
    skippedTotal: 0,
    lastError: "",
    lastCapturedAt: 0
  };

  async function ensureReady() {
    if (state.initialized || !state.enabled) {
      return;
    }
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const details = await stat(filePath);
      state.currentBytes = Number.isInteger(details.size) && details.size >= 0 ? details.size : 0;
    } catch {
      state.currentBytes = 0;
    }
    state.initialized = true;
  }

  async function rotateIfNeeded(nextLineBytes) {
    if (!state.enabled || state.currentBytes + nextLineBytes <= maxBytes) {
      return;
    }
    const previousPath = `${filePath}.1`;
    try {
      await unlink(previousPath);
    } catch {
      // Ignore missing previous rotation file.
    }
    try {
      await rename(filePath, previousPath);
    } catch {
      // Ignore rotation rename failures and fall back to continuing on the current file.
    }
    state.currentBytes = 0;
    state.rotatedTotal += 1;
  }

  function enqueueWrite(line) {
    const lineBytes = Buffer.byteLength(line);
    state.queue = state.queue
      .then(async () => {
        await ensureReady();
        await rotateIfNeeded(lineBytes);
        await appendFile(filePath, line, "utf8");
        state.currentBytes += lineBytes;
        state.capturedTotal += 1;
        state.lastCapturedAt = nowFn();
        state.lastError = "";
      })
      .catch((error) => {
        state.lastError = error instanceof Error ? error.message : String(error);
      });
    return state.queue;
  }

  function captureChunk(event = {}) {
    if (!state.enabled) {
      return false;
    }
    const sessionMeta = event.session && typeof event.session === "object" ? event.session : null;
    if (!shouldCaptureSession(sessionMeta, appLabels)) {
      state.skippedTotal += 1;
      return false;
    }
    const rawData = typeof event.rawData === "string" ? event.rawData : "";
    const cleanedData = typeof event.cleanedData === "string" ? event.cleanedData : "";
    if (!rawData && !cleanedData) {
      state.skippedTotal += 1;
      return false;
    }
    const trace = event.trace && typeof event.trace === "object" ? event.trace : null;
    const entry = {
      timestamp: new Date(nowFn()).toISOString(),
      event: "session.stream.chunk",
      session: summarizeSession(sessionMeta),
      appIdentity: summarizeAppIdentity(sessionMeta?.appIdentity),
      promptBoundaries: Array.isArray(event.promptBoundaries) ? event.promptBoundaries.filter(Number.isInteger) : [],
      terminalSignalKinds: Array.isArray(event.terminalSignalKinds)
        ? event.terminalSignalKinds.filter((value) => typeof value === "string" && value)
        : [],
      raw: {
        chars: rawData.length,
        base64: Buffer.from(rawData, "utf8").toString("base64"),
        visiblePreview: buildPreview(rawData)
      },
      cleaned: {
        chars: cleanedData.length,
        base64: Buffer.from(cleanedData, "utf8").toString("base64"),
        visiblePreview: buildPreview(cleanedData)
      },
      ...(trace?.traceId ? { traceId: trace.traceId } : {}),
      ...(trace?.correlationId ? { correlationId: trace.correlationId } : {})
    };
    void enqueueWrite(`${JSON.stringify(entry)}\n`);
    return true;
  }

  function buildStatusSummary() {
    return {
      enabled: state.enabled,
      filePath,
      maxBytes,
      appLabels: appLabels.slice(),
      currentBytes: state.currentBytes,
      capturedTotal: state.capturedTotal,
      rotatedTotal: state.rotatedTotal,
      skippedTotal: state.skippedTotal,
      lastCapturedAt: state.lastCapturedAt || null,
      lastError: state.lastError
    };
  }

  return Object.freeze({
    captureChunk,
    buildStatusSummary
  });
}
