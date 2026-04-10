const OSC_TERMINATOR_PATTERN = /\u0007|\u001b\\/;
const INCOMPLETE_CSI_PATTERN = /^\u001b\[[0-9;?]*$/;
const MAX_PENDING_BUFFER_LENGTH = 256;
const DEFAULT_TIMESTAMP = 0;

const FINALTERM_MARKER_MAP = Object.freeze({
  A: Object.freeze({ marker: "prompt-start", phase: "prompt" }),
  B: Object.freeze({ marker: "command-start", phase: "command" }),
  C: Object.freeze({ marker: "command-output-start", phase: "output" }),
  D: Object.freeze({ marker: "command-finished", phase: "prompt" })
});

const VSCODE_MARKER_MAP = Object.freeze({
  A: Object.freeze({ marker: "prompt-start", phase: "prompt" }),
  B: Object.freeze({ marker: "command-start", phase: "command" }),
  C: Object.freeze({ marker: "command-output-start", phase: "output" }),
  D: Object.freeze({ marker: "command-finished", phase: "prompt" }),
  E: Object.freeze({ marker: "command-line", phase: "command" })
});

function normalizeTimestamp(value) {
  return Number.isInteger(value) ? value : DEFAULT_TIMESTAMP;
}

export function createEmptyTerminalSignalState() {
  return {
    pendingBuffer: "",
    shellPhase: "unknown",
    lastShellMarkerProtocol: "",
    lastShellMarker: "",
    lastShellMarkerAt: null,
    currentDirectory: "",
    currentDirectoryProtocol: "",
    currentDirectoryUpdatedAt: null,
    alternateScreenActive: false,
    alternateScreenCode: null,
    alternateScreenUpdatedAt: null
  };
}

export function normalizeTerminalSignalState(input) {
  const fallback = createEmptyTerminalSignalState();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback;
  }
  return {
    pendingBuffer:
      typeof input.pendingBuffer === "string" && input.pendingBuffer.length <= MAX_PENDING_BUFFER_LENGTH
        ? input.pendingBuffer
        : "",
    shellPhase:
      input.shellPhase === "prompt" || input.shellPhase === "command" || input.shellPhase === "output"
        ? input.shellPhase
        : "unknown",
    lastShellMarkerProtocol: typeof input.lastShellMarkerProtocol === "string" ? input.lastShellMarkerProtocol : "",
    lastShellMarker: typeof input.lastShellMarker === "string" ? input.lastShellMarker : "",
    lastShellMarkerAt: Number.isInteger(input.lastShellMarkerAt) ? input.lastShellMarkerAt : null,
    currentDirectory: typeof input.currentDirectory === "string" ? input.currentDirectory : "",
    currentDirectoryProtocol: typeof input.currentDirectoryProtocol === "string" ? input.currentDirectoryProtocol : "",
    currentDirectoryUpdatedAt: Number.isInteger(input.currentDirectoryUpdatedAt) ? input.currentDirectoryUpdatedAt : null,
    alternateScreenActive: input.alternateScreenActive === true,
    alternateScreenCode: Number.isInteger(input.alternateScreenCode) ? input.alternateScreenCode : null,
    alternateScreenUpdatedAt: Number.isInteger(input.alternateScreenUpdatedAt) ? input.alternateScreenUpdatedAt : null
  };
}

function normalizeCurrentDirectory(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/^file:\/\//i, "").trim();
}

function extractPendingBuffer(combined) {
  const lastEscapeIndex = combined.lastIndexOf("\u001b");
  if (lastEscapeIndex < 0) {
    return { parseable: combined, pendingBuffer: "" };
  }
  const trailing = combined.slice(lastEscapeIndex);
  if (!trailing || trailing.length > MAX_PENDING_BUFFER_LENGTH) {
    return { parseable: combined, pendingBuffer: "" };
  }
  if (trailing.startsWith("\u001b]") && !OSC_TERMINATOR_PATTERN.test(trailing)) {
    return {
      parseable: combined.slice(0, lastEscapeIndex),
      pendingBuffer: trailing
    };
  }
  if (INCOMPLETE_CSI_PATTERN.test(trailing)) {
    return {
      parseable: combined.slice(0, lastEscapeIndex),
      pendingBuffer: trailing
    };
  }
  return { parseable: combined, pendingBuffer: "" };
}

function pushSignal(signalEntries, index, signal) {
  signalEntries.push({ index, signal });
}

function collectOsc133Signals(value, signalEntries) {
  const pattern = /\u001b]133;([A-D])(?:;([^\u0007\u001b]*))?(?:\u0007|\u001b\\)/g;
  let match = pattern.exec(value);
  while (match) {
    const mapped = FINALTERM_MARKER_MAP[match[1]];
    if (mapped) {
      pushSignal(signalEntries, match.index, {
        kind: "shell-marker",
        protocol: "osc-133",
        marker: mapped.marker,
        phase: mapped.phase,
        ...(typeof match[2] === "string" && match[2].trim() ? { value: match[2].trim() } : {})
      });
    }
    match = pattern.exec(value);
  }
}

function collectOsc633Signals(value, signalEntries) {
  const pattern = /\u001b]633;([A-Z])(?:;([^\u0007\u001b]*))?(?:\u0007|\u001b\\)/g;
  let match = pattern.exec(value);
  while (match) {
    const code = match[1];
    const payload = typeof match[2] === "string" ? match[2].trim() : "";
    const mapped = VSCODE_MARKER_MAP[code];
    if (mapped) {
      pushSignal(signalEntries, match.index, {
        kind: "shell-marker",
        protocol: "osc-633",
        marker: mapped.marker,
        phase: mapped.phase,
        ...(payload ? { value: payload } : {})
      });
    } else if (code === "P") {
      const cwdMatch = payload.match(/^(?:cwd|currentdir)=(.*)$/i);
      if (cwdMatch && cwdMatch[1]) {
        pushSignal(signalEntries, match.index, {
          kind: "metadata",
          protocol: "osc-633",
          key: "current-directory",
          value: normalizeCurrentDirectory(cwdMatch[1])
        });
      }
    }
    match = pattern.exec(value);
  }
}

function collectIterm2Signals(value, signalEntries) {
  const pattern = /\u001b]1337;CurrentDir=([^\u0007\u001b]*)(?:\u0007|\u001b\\)/g;
  let match = pattern.exec(value);
  while (match) {
    pushSignal(signalEntries, match.index, {
      kind: "metadata",
      protocol: "osc-1337",
      key: "current-directory",
      value: normalizeCurrentDirectory(match[1])
    });
    match = pattern.exec(value);
  }
}

function collectAlternateScreenSignals(value, signalEntries) {
  const pattern = /\u001b\[\?(1047|1049)([hl])/g;
  let match = pattern.exec(value);
  while (match) {
    pushSignal(signalEntries, match.index, {
      kind: "terminal-mode",
      protocol: "csi",
      mode: "alternate-screen",
      code: Number.parseInt(match[1], 10),
      active: match[2] === "h"
    });
    match = pattern.exec(value);
  }
}

function applySignalToState(currentState, signal, updatedAt) {
  const nextState = {
    ...currentState
  };
  if (signal.kind === "shell-marker") {
    nextState.lastShellMarkerProtocol = signal.protocol;
    nextState.lastShellMarker = signal.marker;
    nextState.lastShellMarkerAt = updatedAt;
    nextState.shellPhase = signal.phase || nextState.shellPhase || "unknown";
    return nextState;
  }
  if (signal.kind === "metadata" && signal.key === "current-directory") {
    const normalizedCurrentDirectory = normalizeCurrentDirectory(signal.value);
    if (normalizedCurrentDirectory) {
      nextState.currentDirectory = normalizedCurrentDirectory;
      nextState.currentDirectoryProtocol = signal.protocol;
      nextState.currentDirectoryUpdatedAt = updatedAt;
    }
    return nextState;
  }
  if (signal.kind === "terminal-mode" && signal.mode === "alternate-screen") {
    nextState.alternateScreenActive = signal.active === true;
    nextState.alternateScreenCode = Number.isInteger(signal.code) ? signal.code : nextState.alternateScreenCode;
    nextState.alternateScreenUpdatedAt = updatedAt;
    return nextState;
  }
  return nextState;
}

export function consumeTerminalSignals(state, chunk, { updatedAt = Date.now() } = {}) {
  const normalizedState = normalizeTerminalSignalState(state);
  const combined = `${normalizedState.pendingBuffer || ""}${typeof chunk === "string" ? chunk : ""}`;
  const { parseable, pendingBuffer } = extractPendingBuffer(combined);
  const signalEntries = [];
  collectOsc133Signals(parseable, signalEntries);
  collectOsc633Signals(parseable, signalEntries);
  collectIterm2Signals(parseable, signalEntries);
  collectAlternateScreenSignals(parseable, signalEntries);
  signalEntries.sort((left, right) => left.index - right.index);
  let nextState = {
    ...normalizedState,
    pendingBuffer
  };
  const timestamp = normalizeTimestamp(updatedAt) || Date.now();
  for (const entry of signalEntries) {
    nextState = applySignalToState(nextState, entry.signal, timestamp);
  }
  return {
    state: nextState,
    signals: signalEntries.map((entry) => entry.signal)
  };
}
