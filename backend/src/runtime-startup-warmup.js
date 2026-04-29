export function createRuntimeStartupWarmup({
  quietMs,
  countActiveSessions,
  onReady,
  onDebug = () => {},
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
}) {
  const quietWindowMs = Number.isInteger(quietMs) && quietMs >= 0 ? quietMs : 0;
  const getActiveSessionCount =
    typeof countActiveSessions === "function" ? countActiveSessions : () => 0;
  const handleReady = typeof onReady === "function" ? onReady : () => {};

  let enabled = false;
  let gateReleased = false;
  let ready = false;
  let stopping = false;
  let quietTimer = null;
  let quietDeadlineAt = 0;

  function clearQuietTimer() {
    if (!quietTimer) {
      return;
    }
    clearTimeoutImpl(quietTimer);
    quietTimer = null;
    quietDeadlineAt = 0;
  }

  function markReady() {
    if (ready) {
      return;
    }
    clearQuietTimer();
    ready = true;
    handleReady();
  }

  function prepareForStart() {
    ready = false;
    stopping = false;
    enabled = false;
    gateReleased = false;
    clearQuietTimer();
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled === true;
    if (!enabled) {
      clearQuietTimer();
    }
  }

  function releaseGate() {
    gateReleased = true;
  }

  function reconcile() {
    if (ready || stopping) {
      clearQuietTimer();
      return;
    }
    if (!enabled) {
      markReady();
      return;
    }
    if (!gateReleased) {
      clearQuietTimer();
      return;
    }

    const activeSessionCount = Number(getActiveSessionCount()) || 0;
    if (activeSessionCount > 0) {
      clearQuietTimer();
      onDebug("runtime.startup_warmup.active", { activeSessionCount });
      return;
    }
    if (quietTimer) {
      return;
    }

    quietDeadlineAt = now() + quietWindowMs;
    onDebug("runtime.startup_warmup.quiet_wait", { quietMs: quietWindowMs });
    quietTimer = setTimeoutImpl(() => {
      quietTimer = null;
      quietDeadlineAt = 0;
      if (stopping || ready || !gateReleased) {
        return;
      }
      if ((Number(getActiveSessionCount()) || 0) > 0) {
        reconcile();
        return;
      }
      markReady();
    }, quietWindowMs);
  }

  function abort() {
    stopping = true;
    enabled = false;
    gateReleased = false;
    clearQuietTimer();
  }

  function getState() {
    return {
      enabled,
      gateReleased,
      quietMs: quietWindowMs,
      quietDeadlineAt,
      ready
    };
  }

  return {
    abort,
    getState,
    prepareForStart,
    reconcile,
    releaseGate,
    setEnabled
  };
}
