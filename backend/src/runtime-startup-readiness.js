function createFallbackStartupWarmup() {
  return {
    abort() {},
    getState() {
      return {
        enabled: false,
        quietMs: 0
      };
    },
    prepareForStart() {},
    reconcile() {},
    releaseGate() {}
  };
}

export function createRuntimeStartupReadiness(dependencies = {}) {
  let messagingRuntime =
    dependencies.messagingRuntime && typeof dependencies.messagingRuntime === "object" ? dependencies.messagingRuntime : {};
  const logDebug = typeof dependencies.logDebug === "function" ? dependencies.logDebug : () => {};
  const listSessions = typeof dependencies.listSessions === "function" ? dependencies.listSessions : () => [];
  const port = Number.isInteger(dependencies.port) ? dependencies.port : 0;

  let startupWarmup =
    dependencies.startupWarmup && typeof dependencies.startupWarmup === "object"
      ? dependencies.startupWarmup
      : createFallbackStartupWarmup();
  let isReady = false;
  let isStopping = false;
  let isStopped = false;
  let startupWarmupResolve = null;
  let startupWarmupReadyPromise = Promise.resolve();

  function resolvePendingWarmup() {
    if (typeof startupWarmupResolve === "function") {
      startupWarmupResolve();
    }
    startupWarmupResolve = null;
  }

  function attachStartupWarmup(nextStartupWarmup) {
    if (nextStartupWarmup && typeof nextStartupWarmup === "object") {
      startupWarmup = nextStartupWarmup;
    }
  }

  function attachMessagingRuntime(nextMessagingRuntime) {
    if (nextMessagingRuntime && typeof nextMessagingRuntime === "object") {
      messagingRuntime = nextMessagingRuntime;
    }
  }

  function markReadyFromWarmup() {
    if (isReady) {
      return;
    }
    if (typeof messagingRuntime.markRuntimeReady === "function") {
      messagingRuntime.markRuntimeReady();
    }
    isReady = true;
    resolvePendingWarmup();
    const startupWarmupState =
      typeof startupWarmup.getState === "function" ? startupWarmup.getState() : createFallbackStartupWarmup().getState();
    logDebug("runtime.ready", {
      port,
      sessionCount: listSessions().length,
      startupWarmupEnabled: startupWarmupState.enabled,
      startupWarmupQuietMs: startupWarmupState.quietMs
    });
  }

  function prepareForStart() {
    isStopped = false;
    isStopping = false;
    isReady = false;
    startupWarmup.prepareForStart();
    startupWarmupReadyPromise = new Promise((resolve) => {
      startupWarmupResolve = resolve;
    });
  }

  async function releaseGateAndAwaitReadiness() {
    startupWarmup.releaseGate();
    startupWarmup.reconcile();
    await startupWarmupReadyPromise;
  }

  function beginStop() {
    isStopping = true;
    isReady = false;
    startupWarmup.abort();
    resolvePendingWarmup();
  }

  function markStopped() {
    isStopped = true;
    isStopping = false;
  }

  return {
    attachMessagingRuntime,
    attachStartupWarmup,
    beginStop,
    getIsReady: () => isReady,
    getIsStopped: () => isStopped,
    getIsStopping: () => isStopping,
    markReadyFromWarmup,
    markStopped,
    prepareForStart,
    releaseGateAndAwaitReadiness
  };
}
