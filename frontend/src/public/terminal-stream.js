export function withSingleTrailingNewline(value, mode = "auto") {
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  const suffix =
    mode === "lf" ? "\n" : mode === "crlf" ? "\r\n" : mode === "cr2" ? "\r\r" : "\r";
  return `${normalizedLines}${suffix}`;
}

export function normalizePayloadWithoutTrailingNewline(value, mode = "auto") {
  void mode;
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  return normalizedLines;
}

export async function sendInputWithConfiguredTerminator(sendInput, sessionId, value, mode, options = {}) {
  const normalizeMode =
    typeof options.normalizeMode === "function" ? options.normalizeMode : (inputMode) => String(inputMode || "");
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const normalizedMode = normalizeMode(String(mode || "").toLowerCase());
  if (normalizedMode === "cr_delay") {
    const body = normalizePayloadWithoutTrailingNewline(value, "lf");
    if (body) {
      await sendInput(sessionId, body);
    }
    await new Promise((resolve) => setTimeout(resolve, delayedSubmitMs));
    await sendInput(sessionId, "\r");
    return;
  }
  const payload = withSingleTrailingNewline(value, normalizedMode);
  await sendInput(sessionId, payload);
}

export function countUnescapedSingleQuotes(line) {
  let count = 0;
  let escaped = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'") {
      count += 1;
    }
  }
  return count;
}

export function escapeUnescapedSingleQuotes(line) {
  let escaped = false;
  let result = "";
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      result += "\\'";
      continue;
    }
    result += char;
  }
  return result;
}

export function normalizeCustomCommandPayloadForShell(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const normalized = lines.map((line) => {
    if (countUnescapedSingleQuotes(line) % 2 !== 0) {
      return escapeUnescapedSingleQuotes(line);
    }
    return line;
  });
  return normalized.join("\n");
}

const ANSI_ESCAPE_PATTERN = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;

function stripAnsiCodes(value) {
  return String(value || "").replace(ANSI_ESCAPE_PATTERN, "");
}

export function hasMeaningfulStreamActivity(chunk) {
  const normalized = stripAnsiCodes(String(chunk || ""))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "");
  return normalized.length > 0;
}

function getSessionStreamState(sessionStates, sessionId) {
  let state = sessionStates.get(sessionId);
  if (state) {
    return state;
  }
  state = {
    pendingLine: "",
    idleTimer: null
  };
  sessionStates.set(sessionId, state);
  return state;
}

function clearSessionIdleTimer(state) {
  if (!state?.idleTimer) {
    return;
  }
  clearTimeout(state.idleTimer);
  state.idleTimer = null;
}

export function createSessionStreamAdapter(options = {}) {
  const sessionStates = new Map();
  const onData = typeof options.onData === "function" ? options.onData : () => {};
  const onLine = typeof options.onLine === "function" ? options.onLine : () => {};
  const onIdle = typeof options.onIdle === "function" ? options.onIdle : () => {};
  const idleMs = Number.isFinite(options.idleMs) ? Math.max(0, Number(options.idleMs)) : null;
  const stripAnsiForLines = options.stripAnsiForLines === true;

  function emitLine(sessionId, pendingLine) {
    const line = stripAnsiForLines ? stripAnsiCodes(pendingLine) : pendingLine;
    onLine(sessionId, line);
  }

  function scheduleIdle(sessionId, state) {
    clearSessionIdleTimer(state);
    if (idleMs === null) {
      return;
    }
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null;
      onIdle(sessionId);
    }, idleMs);
  }

  function push(sessionId, chunk) {
    if (typeof sessionId !== "string" || !sessionId || typeof chunk !== "string" || chunk.length === 0) {
      return false;
    }
    const state = getSessionStreamState(sessionStates, sessionId);
    onData(sessionId, chunk);
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      const nextChar = chunk[index + 1];
      if (char === "\r" && nextChar === "\n") {
        emitLine(sessionId, state.pendingLine);
        state.pendingLine = "";
        index += 1;
        continue;
      }
      if (char === "\r") {
        state.pendingLine = "";
        continue;
      }
      if (char === "\n") {
        emitLine(sessionId, state.pendingLine);
        state.pendingLine = "";
        continue;
      }
      state.pendingLine += char;
    }
    scheduleIdle(sessionId, state);
    return true;
  }

  function resetSession(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) {
      return;
    }
    const state = sessionStates.get(sessionId);
    if (!state) {
      return;
    }
    clearSessionIdleTimer(state);
    state.pendingLine = "";
  }

  function disposeSession(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) {
      return;
    }
    const state = sessionStates.get(sessionId);
    if (!state) {
      return;
    }
    clearSessionIdleTimer(state);
    sessionStates.delete(sessionId);
  }

  function dispose() {
    for (const state of sessionStates.values()) {
      clearSessionIdleTimer(state);
    }
    sessionStates.clear();
  }

  function getPendingLine(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state) {
      return "";
    }
    return stripAnsiForLines ? stripAnsiCodes(state.pendingLine) : state.pendingLine;
  }

  return {
    push,
    resetSession,
    disposeSession,
    dispose,
    getPendingLine
  };
}
