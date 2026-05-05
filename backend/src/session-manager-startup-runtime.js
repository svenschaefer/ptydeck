const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS = 15000;
const DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES = 4;

function normalizeInteger(value, fallback, { min = Number.NEGATIVE_INFINITY } = {}) {
  return Number.isInteger(value) && value >= min ? value : fallback;
}

export function createSessionManagerStartupRuntime(dependencies = {}) {
  const nowFn = typeof dependencies.nowFn === "function" ? dependencies.nowFn : Date.now;
  const setTimeoutFn = typeof dependencies.setTimeoutFn === "function" ? dependencies.setTimeoutFn : setTimeout;
  const clearPendingLaunchPostStartInput =
    typeof dependencies.clearPendingLaunchPostStartInput === "function"
      ? dependencies.clearPendingLaunchPostStartInput
      : () => {};
  const clearLaunchPostStartInputTimer =
    typeof dependencies.clearLaunchPostStartInputTimer === "function"
      ? dependencies.clearLaunchPostStartInputTimer
      : () => {};
  const clearStartupTerminalQueryFallback =
    typeof dependencies.clearStartupTerminalQueryFallback === "function"
      ? dependencies.clearStartupTerminalQueryFallback
      : () => {};
  const sendInput = typeof dependencies.sendInput === "function" ? dependencies.sendInput : () => {};
  const getSessionById = typeof dependencies.getSessionById === "function" ? dependencies.getSessionById : () => null;
  const normalizeTraceSeed =
    typeof dependencies.normalizeTraceSeed === "function" ? dependencies.normalizeTraceSeed : (value) => value || null;
  const countCursorPositionQueries =
    typeof dependencies.countCursorPositionQueries === "function" ? dependencies.countCursorPositionQueries : () => 0;
  const buildCursorPositionReport =
    typeof dependencies.buildCursorPositionReport === "function"
      ? dependencies.buildCursorPositionReport
      : () => "";
  const startupPostInputFallbackMs = normalizeInteger(dependencies.startupPostInputFallbackMs, 0, { min: 0 });
  const startupTerminalQueryFallbackWindowMs = normalizeInteger(
    dependencies.startupTerminalQueryFallbackWindowMs,
    DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_WINDOW_MS,
    { min: 1 }
  );
  const startupTerminalQueryFallbackMaxResponses = normalizeInteger(
    dependencies.startupTerminalQueryFallbackMaxResponses,
    DEFAULT_STARTUP_TERMINAL_QUERY_FALLBACK_MAX_RESPONSES,
    { min: 1 }
  );

  function resolveTraceSeed(...candidates) {
    for (const candidate of candidates) {
      const normalized = normalizeTraceSeed(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  function dispatchLaunchPostStartInput(session) {
    if (!session?.ptyProcess || !session.pendingLaunchPostStartInput?.input) {
      return false;
    }
    const pending = session.pendingLaunchPostStartInput;
    const trace = resolveTraceSeed(pending.trace, session.traceSeed);
    clearPendingLaunchPostStartInput(session);
    session.pendingStartupTerminalQueryFallback = {
      expiresAt: nowFn() + startupTerminalQueryFallbackWindowMs,
      remainingResponses: startupTerminalQueryFallbackMaxResponses,
      trace
    };
    sendInput(session.id, pending.input, {
      writeKind: "startup_submit_cr",
      trace
    });
    return true;
  }

  function scheduleLaunchPostStartInputDispatch(session, _reason = "", delayMs = 0) {
    if (!session?.pendingLaunchPostStartInput?.input || !session.ptyProcess) {
      return false;
    }
    clearLaunchPostStartInputTimer(session);
    const currentPtyProcess = session.ptyProcess;
    session.launchPostStartInputTimer = setTimeoutFn(() => {
      session.launchPostStartInputTimer = null;
      if (getSessionById(session.id) !== session || session.ptyProcess !== currentPtyProcess) {
        return;
      }
      dispatchLaunchPostStartInput(session);
    }, Math.max(0, delayMs));
    return true;
  }

  function armLaunchPostStartInput(session, launchSpec, options = {}) {
    if (!session?.ptyProcess || !launchSpec?.postStartInput) {
      return false;
    }
    clearPendingLaunchPostStartInput(session);
    clearStartupTerminalQueryFallback(session);
    session.pendingLaunchPostStartInput = {
      input: launchSpec.postStartInput,
      trace: resolveTraceSeed(options.trace, session.traceSeed),
      observedPtyData: false
    };
    scheduleLaunchPostStartInputDispatch(session, "startup_fallback", startupPostInputFallbackMs);
    return true;
  }

  function observePendingLaunchPostStartInput(session, { rawData = "", promptBoundaries = [] } = {}) {
    if (!session?.pendingLaunchPostStartInput) {
      return false;
    }
    if (typeof rawData === "string" && rawData.length > 0) {
      session.pendingLaunchPostStartInput.observedPtyData = true;
    }
    if (Array.isArray(promptBoundaries) && promptBoundaries.length > 0) {
      return scheduleLaunchPostStartInputDispatch(session, "prompt_boundary");
    }
    return false;
  }

  function observeStartupTerminalQueryFallback(session, { rawData = "", trace = null } = {}) {
    const pending = session?.pendingStartupTerminalQueryFallback;
    if (!session?.ptyProcess || !pending) {
      return false;
    }
    if (!Number.isInteger(pending.expiresAt) || pending.expiresAt <= nowFn()) {
      clearStartupTerminalQueryFallback(session);
      return false;
    }
    if (!Number.isInteger(pending.remainingResponses) || pending.remainingResponses <= 0) {
      clearStartupTerminalQueryFallback(session);
      return false;
    }
    const queryCount = countCursorPositionQueries(rawData);
    if (queryCount <= 0) {
      return false;
    }
    const responseCount = Math.min(queryCount, pending.remainingResponses);
    pending.remainingResponses -= responseCount;
    sendInput(session.id, buildCursorPositionReport().repeat(responseCount), {
      writeKind: "startup_terminal_query_response",
      trace: resolveTraceSeed(trace, pending.trace, session.traceSeed)
    });
    if (pending.remainingResponses <= 0) {
      clearStartupTerminalQueryFallback(session);
    }
    return true;
  }

  return {
    dispatchLaunchPostStartInput,
    scheduleLaunchPostStartInputDispatch,
    armLaunchPostStartInput,
    observePendingLaunchPostStartInput,
    observeStartupTerminalQueryFallback
  };
}
