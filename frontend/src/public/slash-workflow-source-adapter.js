function normalizeText(value) {
  return String(value || "").trim();
}

function createSourceError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "SlashWorkflowSourceAdapterError";
  error.code = code;
  Object.assign(error, details);
  return error;
}

function readTerminalBufferLine(buffer, row) {
  if (!buffer || typeof buffer.getLine !== "function" || !Number.isInteger(row) || row < 0) {
    return "";
  }
  const line = buffer.getLine(row);
  if (!line || typeof line.translateToString !== "function") {
    return "";
  }
  return String(line.translateToString(true) || "");
}

function inferTerminalBufferLength(terminal) {
  const buffer = terminal?.buffer?.active;
  if (!buffer) {
    return 0;
  }
  if (Number.isInteger(buffer.length) && buffer.length >= 0) {
    return buffer.length;
  }
  const rows = Number.isInteger(terminal?.rows) && terminal.rows > 0 ? terminal.rows : 0;
  const baseY = Number.isInteger(buffer.baseY) && buffer.baseY >= 0 ? buffer.baseY : 0;
  return Math.max(baseY + rows, 0);
}

function findLastRelevantLineText(terminal, startRow, endRow) {
  const buffer = terminal?.buffer?.active;
  const bufferLength = inferTerminalBufferLength(terminal);
  if (!buffer || bufferLength <= 0) {
    return "";
  }
  const maxRow = Math.min(Number.isInteger(endRow) ? endRow : bufferLength - 1, bufferLength - 1);
  const minRow = Math.max(Number.isInteger(startRow) ? startRow : 0, 0);
  if (maxRow < minRow) {
    return "";
  }
  for (let row = maxRow; row >= minRow; row -= 1) {
    const text = readTerminalBufferLine(buffer, row);
    if (text.trim()) {
      return text;
    }
  }
  return readTerminalBufferLine(buffer, maxRow);
}

function readTerminalLineSource(terminal) {
  return findLastRelevantLineText(terminal, 0, inferTerminalBufferLength(terminal) - 1);
}

function readTerminalVisibleLineSource(terminal) {
  const buffer = terminal?.buffer?.active;
  const bufferLength = inferTerminalBufferLength(terminal);
  if (!buffer || bufferLength <= 0) {
    return "";
  }
  const rows = Number.isInteger(terminal?.rows) && terminal.rows > 0 ? terminal.rows : 0;
  const visibleStart = Number.isInteger(buffer.ydisp) && buffer.ydisp >= 0 ? buffer.ydisp : 0;
  const visibleEnd = rows > 0 ? visibleStart + rows - 1 : visibleStart;
  return findLastRelevantLineText(terminal, visibleStart, visibleEnd);
}

function readSummarySource(session) {
  const artifacts = Array.isArray(session?.artifacts) ? session.artifacts : [];
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const artifact = artifacts[index];
    if (!artifact || typeof artifact !== "object") {
      continue;
    }
    const id = normalizeText(artifact.id).toLowerCase();
    const kind = normalizeText(artifact.kind).toLowerCase();
    if (id !== "summary" && kind !== "summary") {
      continue;
    }
    return typeof artifact.text === "string" ? artifact.text : "";
  }
  return "";
}

function readSessionStateSource(session) {
  const lifecycleState = normalizeText(session?.lifecycleState).toLowerCase();
  const state = normalizeText(session?.state).toLowerCase();
  return lifecycleState || state;
}

function readSourceValue(source, session, terminalEntry) {
  const normalizedSource = normalizeText(source).toLowerCase();
  if (normalizedSource === "status") {
    return normalizeText(session?.statusText);
  }
  if (normalizedSource === "summary") {
    return readSummarySource(session);
  }
  if (normalizedSource === "exit-code") {
    return Number.isInteger(session?.exitCode) ? String(session.exitCode) : "";
  }
  if (normalizedSource === "session-state") {
    return readSessionStateSource(session);
  }
  if (normalizedSource === "line") {
    return readTerminalLineSource(terminalEntry?.terminal);
  }
  if (normalizedSource === "visible-line") {
    return readTerminalVisibleLineSource(terminalEntry?.terminal);
  }
  throw createSourceError("workflow.source_unavailable", `Workflow source '${normalizedSource}' is not available.`, {
    source: normalizedSource
  });
}

function isTerminalBoundSource(source) {
  const normalizedSource = normalizeText(source).toLowerCase();
  return normalizedSource === "line" || normalizedSource === "visible-line";
}

export function createSlashWorkflowSourceAdapter(options = {}) {
  const store = options.store || null;
  const getTerminalEntry =
    typeof options.getTerminalEntry === "function" ? options.getTerminalEntry : () => null;

  function getStoreState() {
    return store?.getState?.() || { sessions: [] };
  }

  function getSessionById(snapshot, sessionId) {
    const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
    return sessions.find((session) => session.id === sessionId) || null;
  }

  function assertSourceAvailable(sessionId, source) {
    if (!sessionId) {
      throw createSourceError(
        "workflow.target_required",
        "Workflow waits require an active session target when started from the composer."
      );
    }
    const snapshot = getStoreState();
    const session = getSessionById(snapshot, sessionId);
    if (!session) {
      throw createSourceError("workflow.source_unavailable", `Workflow source '${source}' has no live session target.`, {
        source,
        sessionId
      });
    }
    if (!isTerminalBoundSource(source)) {
      return;
    }
    if (!getTerminalEntry(sessionId)?.terminal) {
      throw createSourceError(
        "workflow.source_unavailable",
        `Workflow source '${source}' requires a mounted terminal buffer for [${sessionId}].`,
        {
          source,
          sessionId
        }
      );
    }
  }

  function resolveSubscription(sessionId, source) {
    const normalizedSource = normalizeText(source).toLowerCase();
    assertSourceAvailable(sessionId, normalizedSource);
    return (listener) => {
      if (typeof listener !== "function") {
        return () => {};
      }
      let previousValue = Symbol("unset");
      const emitValue = (snapshot, { initial = false } = {}) => {
        const session = getSessionById(snapshot, sessionId);
        if (!session) {
          return;
        }
        const nextValue = readSourceValue(normalizedSource, session, getTerminalEntry(sessionId));
        if (!initial && nextValue === previousValue) {
          return;
        }
        previousValue = nextValue;
        listener(nextValue);
      };
      emitValue(getStoreState(), { initial: true });
      const unsubscribe =
        typeof store?.subscribe === "function"
          ? store.subscribe((snapshot) => {
              emitValue(snapshot, { initial: false });
            })
          : () => {};
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    };
  }

  return Object.freeze({
    resolveSubscription
  });
}

export {
  readTerminalLineSource,
  readTerminalVisibleLineSource,
  readSummarySource,
  readSessionStateSource,
  readSourceValue
};
