import { ApiError } from "./errors.js";

export function createRuntimeSessionEventAuthority(dependencies = {}) {
  const {
    manager = { on: () => {} },
    messagingRuntime = {
      observeSessionActivityStarted: async () => {},
      observeSessionIdle: async () => {},
      observeSessionData: async () => {},
      observeSessionLifecycle: async () => {},
      ensureSessionTarget: async () => {}
    },
    startupWarmup = { reconcile: () => {} },
    metrics = {
      sessionsCreatedTotal: 0,
      sessionsStartedTotal: 0,
      sessionsExitedTotal: 0
    },
    logDebug = () => {},
    logError = (...args) => console.error(...args),
    getApiSessionOrThrow = () => null,
    toApiSession = (session) => session,
    broadcast = () => {},
    persistSoon = () => {},
    persistNow = async () => {},
    normalizeTraceSeed = (trace) => trace
  } = dependencies;

  async function handleSessionActivityStarted(event) {
    logDebug("session.event", { type: "session.activity.started", sessionId: event.sessionId || null }, event.trace);
    await messagingRuntime.observeSessionActivityStarted({
      sessionId: event.sessionId,
      trace: event.trace
    });
    startupWarmup.reconcile();
    persistSoon();
  }

  async function handleSessionActivityCompleted(event) {
    logDebug("session.event", { type: "session.activity.completed", sessionId: event.sessionId || null }, event.trace);
    startupWarmup.reconcile();
    try {
      await persistNow("session.activity.completed");
      const apiSession = getApiSessionOrThrow(event.sessionId);
      await messagingRuntime.observeSessionIdle({
        session: apiSession,
        trace: event.trace
      });
      broadcast({
        type: "session.activity.completed",
        sessionId: event.sessionId,
        activityCompletedAt: event.activityCompletedAt,
        session: apiSession,
        trace: normalizeTraceSeed(event.trace)
      }, event.trace);
    } catch (error) {
      logError("failed to persist session activity completion", error);
    }
  }

  function handleSessionInputWrite(event) {
    logDebug(
      "session.input.write",
      {
        sessionId: event.sessionId || null,
        phase: event.phase || "",
        writeKind: event.writeKind || "",
        bytes: Number.isInteger(event.bytes) ? event.bytes : 0,
        ...(event.error ? { error: event.error } : {}),
        ...(typeof event.code === "string" && event.code ? { code: event.code } : {}),
        ...(typeof event.failureStage === "string" && event.failureStage ? { failureStage: event.failureStage } : {}),
        ...(Number.isInteger(event.retryCount) ? { retryCount: event.retryCount } : {}),
        ...(Number.isInteger(event.queueDroppedCount) ? { queueDroppedCount: event.queueDroppedCount } : {}),
        ...(event.droppedByQueueFailure === true ? { droppedByQueueFailure: true } : {}),
        ...(event.retryable === true ? { retryable: true } : {})
      },
      event.trace
    );
  }

  async function dispatchManagerSessionEvent(eventName, event) {
    const eventSessionSnapshot =
      event && event.session && typeof event.session === "object" ? structuredClone(event.session) : null;
    const apiEventSession = eventSessionSnapshot ? toApiSession(eventSessionSnapshot, eventSessionSnapshot.state) : null;
    if (eventName !== "session.data") {
      logDebug(
        "session.event",
        {
          type: eventName,
          sessionId: eventSessionSnapshot?.id || event.sessionId || null,
          deckId: eventSessionSnapshot?.deckId || null
        },
        event.trace
      );
    }
    if (eventName === "session.data") {
      const apiSession = getApiSessionOrThrow(event.sessionId);
      await messagingRuntime.observeSessionData({
        session: apiSession,
        data: event.data,
        promptBoundaries: Array.isArray(event.promptBoundaries) ? event.promptBoundaries : [],
        trace: event.trace
      });
    } else if (eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") {
      let messagingSession = apiEventSession;
      const messagingSessionId =
        typeof event.sessionId === "string" && event.sessionId.trim()
          ? event.sessionId
          : typeof eventSessionSnapshot?.id === "string" && eventSessionSnapshot.id.trim()
            ? eventSessionSnapshot.id
            : "";
      if (messagingSessionId) {
        try {
          messagingSession = getApiSessionOrThrow(messagingSessionId);
        } catch {
          messagingSession = apiEventSession;
        }
      }
      if (messagingSession) {
        await messagingRuntime.observeSessionLifecycle(eventName, messagingSession, event.trace);
        try {
          await messagingRuntime.ensureSessionTarget(messagingSession, event.trace);
        } catch (error) {
          logDebug(
            "messaging.target.ensure_failed",
            {
              sessionId: messagingSession.id,
              error: error instanceof Error ? error.message : String(error || "Unknown messaging target setup failure.")
            },
            event.trace
          );
        }
      }
    } else if ((eventName === "session.exit" || eventName === "session.closed") && apiEventSession) {
      await messagingRuntime.observeSessionLifecycle(
        eventName,
        apiEventSession,
        event.trace,
        event
      );
    }
    if ((eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") && apiEventSession) {
      broadcast({
        type: eventName,
        ...event,
        session: apiEventSession
      }, event.trace);
    } else if (eventName === "session.data") {
      if (typeof event.data === "string" && event.data.length > 0) {
        broadcast({ type: eventName, sessionId: event.sessionId, data: event.data, trace: event.trace }, event.trace);
      }
    } else {
      broadcast({ type: eventName, ...event }, event.trace);
    }
    if (eventName === "session.created") {
      metrics.sessionsCreatedTotal += 1;
    } else if (eventName === "session.started") {
      metrics.sessionsStartedTotal += 1;
    } else if (eventName === "session.exit") {
      metrics.sessionsExitedTotal += 1;
    }
    if (eventName !== "session.data") {
      if (eventName === "session.created" || eventName === "session.started" || eventName === "session.exit" || eventName === "session.closed") {
        startupWarmup.reconcile();
      }
      persistSoon();
    }
  }

  async function handleManagerSessionEvent(eventName, event) {
    try {
      await dispatchManagerSessionEvent(eventName, event);
    } catch (error) {
      if (error instanceof ApiError && error.error === "SessionNotFound" && eventName === "session.data") {
        return false;
      }
      logError(`failed to process ${eventName} event`, error);
      return false;
    }
    return true;
  }

  function registerManagerEventHandlers() {
    manager.on("session.activity.started", (event) => {
      void handleSessionActivityStarted(event);
    });
    manager.on("session.input.write", (event) => {
      handleSessionInputWrite(event);
    });
    manager.on("session.activity.completed", (event) => {
      void handleSessionActivityCompleted(event);
    });

    const wsEventNames = ["session.created", "session.started", "session.updated", "session.data", "session.exit", "session.closed"];
    for (const eventName of wsEventNames) {
      manager.on(eventName, (event) => {
        void handleManagerSessionEvent(eventName, event);
      });
    }
  }

  return {
    dispatchManagerSessionEvent,
    handleManagerSessionEvent,
    handleSessionActivityCompleted,
    handleSessionActivityStarted,
    handleSessionInputWrite,
    registerManagerEventHandlers
  };
}
