export function createAppRuntimeStateController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const uiState = options.uiState || {};
  const startupPerf = options.startupPerf || null;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const hasBootstrapInFlight =
    typeof options.hasBootstrapInFlight === "function" ? options.hasBootstrapInFlight : () => false;
  const runBootstrapFallback =
    typeof options.runBootstrapFallback === "function" ? options.runBootstrapFallback : () => Promise.resolve();
  const runBootstrapDevAuthToken =
    typeof options.runBootstrapDevAuthToken === "function"
      ? options.runBootstrapDevAuthToken
      : () => Promise.resolve(false);
  const wsBootstrapFallbackMs = Number(options.wsBootstrapFallbackMs) || 250;

  let bootstrapFallbackTimer = null;
  let runtimeBootstrapSource = "pending";

  function setUiError(message, { render = false, log = false } = {}) {
    const normalized = typeof message === "string" ? message : String(message || "");
    if (log) {
      debugLog("ui.error", { message: normalized });
    }
    uiState.error = normalized;
    if (render) {
      requestRender();
    }
    return normalized;
  }

  function clearError() {
    uiState.error = "";
  }

  function setError(message) {
    setUiError(message, { render: true, log: true });
  }

  function setCommandFeedback(message) {
    uiState.commandFeedback = typeof message === "string" ? message : String(message || "");
    requestRender();
  }

  function setCommandPreview(message) {
    uiState.commandPreview = typeof message === "string" ? message : String(message || "");
    requestRender();
  }

  function setStartupGateState(nextState = {}) {
    uiState.startupGateActive = nextState.active === true;
    uiState.startupGatePhase = typeof nextState.phase === "string" ? nextState.phase : "";
    uiState.startupGateMessage = typeof nextState.message === "string" ? nextState.message : "";
    uiState.startupGateDetail = typeof nextState.detail === "string" ? nextState.detail : "";
    uiState.startupGateCanSkip = nextState.canSkip === true;
    requestRender();
  }

  function clearStartupGateState({ render = true } = {}) {
    const hadState =
      uiState.startupGateActive === true ||
      Boolean(uiState.startupGateMessage) ||
      Boolean(uiState.startupGateDetail) ||
      uiState.startupGateCanSkip === true;
    uiState.startupGateActive = false;
    uiState.startupGatePhase = "";
    uiState.startupGateMessage = "";
    uiState.startupGateDetail = "";
    uiState.startupGateCanSkip = false;
    if (render && hadState) {
      requestRender();
    }
  }

  function getErrorMessage(err, fallback) {
    if (err && typeof err.message === "string" && err.message.trim()) {
      return err.message.trim();
    }
    return fallback;
  }

  function maybeReportStartupPerf() {
    if (!startupPerf || startupPerf.startupReported) {
      return;
    }
    if (
      startupPerf.bootstrapReadyAtMs === null ||
      startupPerf.firstNonEmptyRenderAtMs === null ||
      startupPerf.firstTerminalMountedAtMs === null
    ) {
      return;
    }
    startupPerf.startupReported = true;
    debugLog("perf.startup.ready", {
      bootstrapRequestCount: startupPerf.bootstrapRequestCount,
      toBootstrapReadyMs: Math.round(startupPerf.bootstrapReadyAtMs - startupPerf.appStartAtMs),
      toFirstNonEmptyRenderMs: Math.round(startupPerf.firstNonEmptyRenderAtMs - startupPerf.appStartAtMs),
      toFirstTerminalMountedMs: Math.round(startupPerf.firstTerminalMountedAtMs - startupPerf.appStartAtMs)
    });
  }

  function clearBootstrapFallbackTimer() {
    if (bootstrapFallbackTimer === null) {
      return;
    }
    clearTimeoutFn(bootstrapFallbackTimer);
    bootstrapFallbackTimer = null;
  }

  function getRuntimeBootstrapSource() {
    return runtimeBootstrapSource;
  }

  function markRuntimeBootstrapReady(source) {
    runtimeBootstrapSource = source;
    clearBootstrapFallbackTimer();
    clearStartupGateState({ render: false });
    uiState.loading = false;
    if (startupPerf && startupPerf.bootstrapReadyAtMs === null) {
      startupPerf.bootstrapReadyAtMs = nowMs();
    }
    maybeReportStartupPerf();
    requestRender();
  }

  function markRuntimeConnected() {
    clearStartupGateState({ render: false });
    uiState.loading = false;
    uiState.error = "";
    requestRender();
  }

  async function bootstrapRuntimeFallback() {
    if (runtimeBootstrapSource !== "pending") {
      return;
    }
    if (!hasBootstrapInFlight() && startupPerf) {
      startupPerf.bootstrapRequestCount += 1;
      debugLog("sessions.bootstrap.request", {
        bootstrapRequestCount: startupPerf.bootstrapRequestCount
      });
    }
    return runBootstrapFallback();
  }

  function scheduleBootstrapFallback() {
    if (runtimeBootstrapSource !== "pending" || hasBootstrapInFlight() || bootstrapFallbackTimer !== null) {
      return;
    }
    bootstrapFallbackTimer = setTimeoutFn(() => {
      bootstrapFallbackTimer = null;
      if (runtimeBootstrapSource !== "pending") {
        return;
      }
      Promise.resolve(bootstrapRuntimeFallback()).catch(() => {});
    }, wsBootstrapFallbackMs);
  }

  async function bootstrapDevAuthToken(options = {}) {
    return runBootstrapDevAuthToken(options);
  }

  function dispose() {
    clearBootstrapFallbackTimer();
  }

  return {
    setUiError,
    clearError,
    setError,
    setCommandFeedback,
    setCommandPreview,
    setStartupGateState,
    clearStartupGateState,
    getErrorMessage,
    maybeReportStartupPerf,
    clearBootstrapFallbackTimer,
    getRuntimeBootstrapSource,
    markRuntimeBootstrapReady,
    markRuntimeConnected,
    bootstrapRuntimeFallback,
    scheduleBootstrapFallback,
    bootstrapDevAuthToken,
    dispose
  };
}
