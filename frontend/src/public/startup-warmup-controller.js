function normalizeWarmupPayload(payload = {}) {
  const status = typeof payload?.status === "string" && payload.status.trim() ? payload.status.trim() : "starting";
  const rawPhase = typeof payload?.phase === "string" && payload.phase.trim() ? payload.phase.trim() : "";
  const phase =
    rawPhase === "ready" || rawPhase === "booting" || rawPhase === "starting_sessions"
      ? rawPhase
      : status === "ready"
        ? "ready"
        : "booting";
  const warmup = payload?.warmup && typeof payload.warmup === "object" ? payload.warmup : {};
  return {
    status,
    phase,
    warmup: {
      enabled: warmup.enabled === true,
      gateReleased: warmup.gateReleased === true,
      quietPeriodMs: Number.isFinite(warmup.quietPeriodMs) ? Number(warmup.quietPeriodMs) : 0,
      activeSessionCount: Number.isFinite(warmup.activeSessionCount) ? Number(warmup.activeSessionCount) : 0,
      quietMsRemaining: Number.isFinite(warmup.quietMsRemaining) ? Number(warmup.quietMsRemaining) : 0
    }
  };
}

function buildWarmupState(payload) {
  if (payload.phase === "starting_sessions") {
    const activeSessionCount = payload.warmup.activeSessionCount;
    if (activeSessionCount > 0) {
      return {
        active: true,
        phase: payload.phase,
        message: "Server is starting sessions.",
        detail:
          activeSessionCount === 1
            ? "1 restored session is still active during startup."
            : `${activeSessionCount} restored sessions are still active during startup.`,
        canSkip: true
      };
    }

    const quietSeconds = payload.warmup.quietPeriodMs > 0 ? Math.max(1, Math.ceil(payload.warmup.quietPeriodMs / 1000)) : 1;
    return {
      active: true,
      phase: payload.phase,
      message: "Server is starting sessions.",
      detail: `Waiting for ${quietSeconds}s of quiet after startup activity. You can skip this wait.`,
      canSkip: true
    };
  }

  return {
    active: true,
    phase: "booting",
    message: "Starting server...",
    detail: "Waiting for the backend startup gate to open. You can skip this wait.",
    canSkip: true
  };
}

export function createStartupWarmupController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const api = options.api || {};
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const setConnectionState = typeof options.setConnectionState === "function" ? options.setConnectionState : () => {};
  const setStartupGateState =
    typeof options.setStartupGateState === "function" ? options.setStartupGateState : () => {};
  const clearStartupGateState =
    typeof options.clearStartupGateState === "function" ? options.clearStartupGateState : () => {};
  const pollIntervalMs =
    Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs > 0 ? options.pollIntervalMs : 250;

  let waitPromise = null;
  let waitTimer = null;
  let waitResolve = null;
  let skipRequested = false;

  function clearWaitTimer() {
    if (waitTimer) {
      clearTimeoutFn(waitTimer);
      waitTimer = null;
    }
  }

  function wakeWaitLoop() {
    clearWaitTimer();
    if (typeof waitResolve === "function") {
      const resolve = waitResolve;
      waitResolve = null;
      resolve();
    }
  }

  function waitForNextPoll() {
    if (skipRequested) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waitResolve = resolve;
      waitTimer = setTimeoutFn(() => {
        waitTimer = null;
        waitResolve = null;
        resolve();
      }, pollIntervalMs);
    });
  }

  function skipWait() {
    skipRequested = true;
    debugLog("startup.warmup.skip");
    wakeWaitLoop();
  }

  async function waitForServerWarmup() {
    if (typeof api.getReadyStatus !== "function") {
      return "ready";
    }
    if (waitPromise) {
      return waitPromise;
    }

    skipRequested = false;
    waitPromise = (async () => {
      try {
        while (true) {
          if (skipRequested) {
            clearStartupGateState();
            setConnectionState("connecting");
            return "skipped";
          }

          try {
            const payload = normalizeWarmupPayload(await api.getReadyStatus());
            if (payload.status === "ready") {
              clearStartupGateState();
              setConnectionState("connecting");
              debugLog("startup.warmup.ready", { phase: payload.phase });
              return "ready";
            }
            const nextState = buildWarmupState(payload);
            setConnectionState(payload.phase === "starting_sessions" ? "starting sessions" : "starting");
            setStartupGateState(nextState);
            debugLog("startup.warmup.wait", {
              phase: payload.phase,
              activeSessionCount: payload.warmup.activeSessionCount,
              quietMsRemaining: payload.warmup.quietMsRemaining
            });
          } catch (error) {
            setConnectionState("starting");
            setStartupGateState({
              active: true,
              phase: "booting",
              message: "Starting server...",
              detail: "Waiting for the backend to accept connections. You can skip this wait.",
              canSkip: true
            });
            debugLog("startup.warmup.poll_error", {
              message: error instanceof Error ? error.message : String(error || "")
            });
          }

          await waitForNextPoll();
        }
      } finally {
        clearWaitTimer();
        waitResolve = null;
        waitPromise = null;
      }
    })();

    return waitPromise;
  }

  function dispose() {
    skipRequested = true;
    wakeWaitLoop();
    clearStartupGateState();
  }

  return {
    waitForServerWarmup,
    skipWait,
    dispose
  };
}
