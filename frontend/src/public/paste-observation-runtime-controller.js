import { normalizePayloadWithoutTrailingNewline, normalizeVisibleTerminalText } from "./terminal-stream.js";

export const PASTE_OBSERVATION_QUIET_WINDOW_MS = 480;
export const PASTE_OBSERVATION_MAX_AUTO_CONTINUES = 2;
export const PASTE_OBSERVATION_MAX_VISIBLE_BUFFER = 48_000;

const KNOWN_PLACEHOLDER_PATTERNS = [
  /\[\s*Pasted Content\s+(\d+)\s+chars?\s*\]/gi,
  /Pasted Content\s+(\d+)\s+chars?/gi
];

function normalizeText(value) {
  return String(value || "").trim();
}

function countTextLines(value) {
  if (!value) {
    return 0;
  }
  return String(value).split("\n").length;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function clampVisibleBuffer(value, maxLength) {
  const normalized = String(value || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(normalized.length - maxLength);
}

function findKnownPlaceholderAckChars(value) {
  const text = String(value || "");
  let maxChars = 0;
  for (const pattern of KNOWN_PLACEHOLDER_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const numeric = Number(match[1]);
      if (Number.isFinite(numeric) && numeric > maxChars) {
        maxChars = numeric;
      }
      match = pattern.exec(text);
    }
  }
  return maxChars;
}

function findPayloadPrefixLength(observed, payload, previousLength = 0) {
  const observedText = String(observed || "");
  const payloadText = String(payload || "");
  if (!observedText || !payloadText) {
    return 0;
  }
  if (observedText.includes(payloadText)) {
    return payloadText.length;
  }
  const maxLength = Math.min(payloadText.length, observedText.length);
  for (let length = maxLength; length > previousLength; length -= 1) {
    if (observedText.includes(payloadText.slice(0, length))) {
      return length;
    }
  }
  return previousLength;
}

function isObservationComplete(observation) {
  if (!observation) {
    return false;
  }
  if (observation.echoedChars >= observation.payloadChars && observation.payloadChars > 0) {
    return true;
  }
  return observation.placeholderChars >= observation.payloadChars && observation.payloadChars > 0;
}

function canAutoContinueObservation(observation) {
  if (!observation || observation.autoContinueEnabled !== true) {
    return false;
  }
  if (observation.autoContinueAttempts >= PASTE_OBSERVATION_MAX_AUTO_CONTINUES) {
    return false;
  }
  if (isObservationComplete(observation)) {
    return false;
  }
  if (observation.placeholderChars > 0 && observation.placeholderChars < observation.payloadChars) {
    return true;
  }
  if (observation.echoedChars > 0 && observation.echoedChars < observation.payloadChars) {
    return true;
  }
  return false;
}

function buildObservationSummary(observation, sessionMeta) {
  if (!observation || !sessionMeta) {
    return "";
  }
  const sessionLabel = `[${sessionMeta.token}] ${sessionMeta.name}`;
  if (observation.autoContinuePending === true) {
    return `Paste into ${sessionLabel} looked stalled. Sent Continue Paste automatically.`;
  }
  if (observation.status === "complete") {
    if (observation.placeholderChars >= observation.payloadChars && observation.placeholderChars > 0) {
      return `Paste into ${sessionLabel} acknowledged the full payload as a placeholder block.`;
    }
    return `Paste into ${sessionLabel} looks complete.`;
  }
  if (observation.status === "placeholder") {
    return `Paste into ${sessionLabel} acknowledged a placeholder block.`;
  }
  if (observation.status === "partial") {
    return `Paste into ${sessionLabel} is being echoed back in chunks.`;
  }
  if (observation.status === "stalled") {
    return `Paste into ${sessionLabel} looks stalled.`;
  }
  return `Watching the last terminal paste into ${sessionLabel}.`;
}

function buildObservationDetail(observation) {
  if (!observation) {
    return "";
  }
  const payloadStats = `${formatCount(observation.payloadChars)} chars · ${formatCount(observation.payloadLines)} lines`;
  if (observation.autoContinuePending === true) {
    return `Payload: ${payloadStats}. Auto continue is on. Attempt ${observation.autoContinueAttempts}/${PASTE_OBSERVATION_MAX_AUTO_CONTINUES} sent the session terminator and is waiting for more output.`;
  }
  if (observation.status === "complete") {
    if (observation.placeholderChars >= observation.payloadChars && observation.placeholderChars > 0) {
      return `Payload: ${payloadStats}. Placeholder acknowledgement reported ${formatCount(observation.placeholderChars)} pasted chars.`;
    }
    return `Payload: ${payloadStats}. Observed ${formatCount(observation.echoedChars)} pasted chars in the raw session output.`;
  }
  if (observation.status === "placeholder") {
    return `Payload: ${payloadStats}. Placeholder acknowledgement reported ${formatCount(observation.placeholderChars)} pasted chars so far.`;
  }
  if (observation.status === "partial") {
    return `Payload: ${payloadStats}. Observed ${formatCount(observation.echoedChars)} pasted chars in the raw session output so far.`;
  }
  if (observation.status === "stalled") {
    if (observation.placeholderChars > 0) {
      return `Payload: ${payloadStats}. Placeholder acknowledgement reported ${formatCount(observation.placeholderChars)} pasted chars before the quiet window elapsed.`;
    }
    if (observation.echoedChars > 0) {
      return `Payload: ${payloadStats}. Observed ${formatCount(observation.echoedChars)} pasted chars before the quiet window elapsed.`;
    }
    return `Payload: ${payloadStats}. No matching echo or known placeholder acknowledgement appeared before the quiet window elapsed.`;
  }
  return `Payload: ${payloadStats}. Waiting for raw session output after the paste was sent.`;
}

function openDialogLikeUi(showFn) {
  if (typeof showFn === "function") {
    showFn();
  }
}

export function createPasteObservationRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef?.setTimeout === "function" ? windowRef.setTimeout.bind(windowRef) : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef?.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const panelEl = options.panelEl || null;
  const summaryEl = options.summaryEl || null;
  const detailEl = options.detailEl || null;
  const continueBtn = options.continueBtn || null;
  const getActiveSession = typeof options.getActiveSession === "function" ? options.getActiveSession : () => null;
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => sessionId;
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "session");
  const requestContinuePaste =
    typeof options.requestContinuePaste === "function" ? options.requestContinuePaste : async () => false;
  const showCommandUi = typeof options.showCommandUi === "function" ? options.showCommandUi : () => {};

  const observations = new Map();
  let uiEventsBound = false;

  function getSessionMeta(sessionId) {
    const session = getSessionById(sessionId) || getActiveSession() || null;
    return {
      session,
      token: formatSessionToken(sessionId) || "?",
      name: formatSessionDisplayName(session) || sessionId
    };
  }

  function getObservation(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    return normalizedSessionId ? observations.get(normalizedSessionId) || null : null;
  }

  function clearQuietTimer(observation) {
    if (!observation?.quietTimer) {
      return;
    }
    clearTimeoutFn(observation.quietTimer);
    observation.quietTimer = null;
  }

  function render() {
    const activeSession = getActiveSession() || null;
    const activeSessionId = normalizeText(activeSession?.id);
    const observation = getObservation(activeSessionId);
    if (panelEl) {
      panelEl.hidden = !observation;
    }
    if (!observation) {
      if (summaryEl) {
        summaryEl.textContent = "";
      }
      if (detailEl) {
        detailEl.textContent = "";
      }
      if (continueBtn) {
        continueBtn.hidden = true;
        continueBtn.disabled = true;
      }
      return;
    }
    const sessionMeta = getSessionMeta(activeSessionId);
    if (summaryEl) {
      summaryEl.textContent = buildObservationSummary(observation, sessionMeta);
    }
    if (detailEl) {
      detailEl.textContent = buildObservationDetail(observation);
    }
    if (continueBtn) {
      const allowContinue = observation.status === "stalled" && observation.autoContinuePending !== true && !isObservationComplete(observation);
      continueBtn.hidden = !allowContinue;
      continueBtn.disabled = !allowContinue;
      if (allowContinue) {
        continueBtn.setAttribute("title", `Send the configured session terminator to [${sessionMeta.token}] ${sessionMeta.name}.`);
      } else {
        continueBtn.removeAttribute("title");
      }
    }
  }

  async function dispatchContinuePaste(observation, mode) {
    if (!observation || observation.continueInFlight === true) {
      return false;
    }
    observation.continueInFlight = true;
    if (mode === "auto") {
      observation.autoContinuePending = true;
      observation.autoContinueAttempts += 1;
    } else {
      observation.manualContinueAttempts += 1;
      observation.autoContinuePending = false;
    }
    render();
    try {
      const sent = await requestContinuePaste(observation.sessionId, {
        source: mode,
        auto: mode === "auto",
        attempt: mode === "auto" ? observation.autoContinueAttempts : observation.manualContinueAttempts
      });
      observation.continueInFlight = false;
      if (!sent) {
        observation.autoContinuePending = false;
        observation.status = "stalled";
        render();
        return false;
      }
      observation.status = observation.placeholderChars > 0 ? "placeholder" : observation.echoedChars > 0 ? "partial" : "watching";
      scheduleQuietWindow(observation);
      render();
      return true;
    } catch {
      observation.continueInFlight = false;
      observation.autoContinuePending = false;
      observation.status = "stalled";
      render();
      return false;
    }
  }

  async function handleObservationQuietWindow(observation) {
    if (!observation || observations.get(observation.sessionId) !== observation) {
      return;
    }
    if (isObservationComplete(observation)) {
      observation.status = "complete";
      observation.autoContinuePending = false;
      render();
      return;
    }
    observation.status = "stalled";
    observation.autoContinuePending = false;
    openDialogLikeUi(showCommandUi);
    render();
    if (!canAutoContinueObservation(observation)) {
      return;
    }
    await dispatchContinuePaste(observation, "auto");
  }

  function scheduleQuietWindow(observation) {
    if (!observation) {
      return;
    }
    clearQuietTimer(observation);
    observation.quietTimer = setTimeoutFn(() => {
      observation.quietTimer = null;
      Promise.resolve(handleObservationQuietWindow(observation)).catch(() => {});
    }, PASTE_OBSERVATION_QUIET_WINDOW_MS);
  }

  function recordTerminalPaste(sessionId, payload, options = {}) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return null;
    }
    const payloadText = normalizePayloadWithoutTrailingNewline(payload);
    const payloadVisible = normalizeVisibleTerminalText(payloadText);
    if (!payloadVisible) {
      return null;
    }
    const existing = observations.get(normalizedSessionId);
    if (existing) {
      clearQuietTimer(existing);
    }
    const observation = {
      sessionId: normalizedSessionId,
      payload: payloadText,
      payloadVisible,
      payloadChars: payloadVisible.length,
      payloadLines: countTextLines(payloadVisible),
      observedVisible: "",
      maxVisibleBuffer: Math.min(PASTE_OBSERVATION_MAX_VISIBLE_BUFFER, Math.max(4_096, payloadVisible.length * 2)),
      echoedChars: 0,
      placeholderChars: 0,
      status: "watching",
      autoContinueEnabled: options.autoContinueEnabled === true,
      autoContinueAttempts: 0,
      manualContinueAttempts: 0,
      autoContinuePending: false,
      continueInFlight: false,
      quietTimer: null
    };
    observations.set(normalizedSessionId, observation);
    scheduleQuietWindow(observation);
    render();
    return observation;
  }

  function observeSessionOutput(sessionId, chunk) {
    const observation = getObservation(sessionId);
    if (!observation || typeof chunk !== "string" || !chunk) {
      return false;
    }
    observation.observedVisible = clampVisibleBuffer(
      `${observation.observedVisible}${normalizeVisibleTerminalText(chunk)}`,
      observation.maxVisibleBuffer
    );
    observation.placeholderChars = Math.max(observation.placeholderChars, findKnownPlaceholderAckChars(observation.observedVisible));
    observation.echoedChars = Math.max(
      observation.echoedChars,
      findPayloadPrefixLength(observation.observedVisible, observation.payloadVisible, observation.echoedChars)
    );
    observation.autoContinuePending = false;
    observation.continueInFlight = false;
    if (isObservationComplete(observation)) {
      observation.status = "complete";
      clearQuietTimer(observation);
    } else if (observation.placeholderChars > 0) {
      observation.status = "placeholder";
      scheduleQuietWindow(observation);
    } else if (observation.echoedChars > 0) {
      observation.status = "partial";
      scheduleQuietWindow(observation);
    } else {
      observation.status = "watching";
      scheduleQuietWindow(observation);
    }
    render();
    return true;
  }

  async function continuePasteForActiveSession() {
    const activeSession = getActiveSession() || null;
    const observation = getObservation(activeSession?.id);
    if (!observation || isObservationComplete(observation)) {
      return false;
    }
    return dispatchContinuePaste(observation, "manual");
  }

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    if (continueBtn && typeof continueBtn.addEventListener === "function") {
      continueBtn.addEventListener("click", () => {
        Promise.resolve(continuePasteForActiveSession()).catch(() => {});
      });
    }
  }

  function dispose() {
    for (const observation of observations.values()) {
      clearQuietTimer(observation);
    }
    observations.clear();
  }

  bindUiEvents();
  render();

  return {
    recordTerminalPaste,
    observeSessionOutput,
    continuePasteForActiveSession,
    getObservation,
    render,
    dispose
  };
}
