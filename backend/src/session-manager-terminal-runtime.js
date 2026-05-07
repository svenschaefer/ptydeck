import { clearNodePtyAsyncWriteMeta, queueNodePtyAsyncWriteMeta } from "./node-pty-write-retry.js";
import { recordQuickSendUsageEntry } from "./session-quick-send-usage.js";

const SESSION_STATE_RUNNING = "running";
const SESSION_ACTIVITY_STATE_ACTIVE = "active";
const SESSION_ACTIVITY_STATE_INACTIVE = "inactive";

export function createSessionManagerTerminalRuntime(dependencies = {}) {
  const {
    sessions = new Map(),
    getSessionOrThrow = () => null,
    createTraceEnvelope = () => ({}),
    normalizeTraceSeed = (value) => value,
    emit = () => {},
    nowFn = Date.now,
    setTimeoutFn = setTimeout,
    sessionActivityQuietMs = 1400,
    foregroundProcessRefreshDelayMs = 90,
    clearSessionActivityTimer = () => {},
    clearExpectedExitReason = () => {},
    scheduleLaunchPostStartInputDispatch = () => {},
    buildReconnectUnavailableError = () => new Error("Session transport is unavailable."),
    scheduleSessionForegroundProcessIdentityRefresh = () => {}
  } = dependencies;

  function updateSessionTraceSeed(session, trace, overrides = {}) {
    if (!session) {
      return null;
    }
    const nextTraceSeed = {
      ...(normalizeTraceSeed(session.traceSeed) || {}),
      ...(normalizeTraceSeed(trace) || {}),
      ...(normalizeTraceSeed(overrides) || {})
    };
    session.traceSeed = normalizeTraceSeed(nextTraceSeed);
    return session.traceSeed;
  }

  function emitSessionUpdated(session, { trace = null, updatedAt = nowFn() } = {}) {
    if (!session?.meta) {
      return null;
    }
    const updateTrace = createTraceEnvelope(session.traceSeed, {
      sessionId: session.id,
      source: trace?.source || session.traceSeed?.source || "runtime"
    });
    updateSessionTraceSeed(session, updateTrace, {
      sessionId: session.id,
      source: updateTrace.source || "runtime"
    });
    session.meta.updatedAt = updatedAt;
    emit("session.updated", {
      session: session.meta,
      trace: updateTrace
    });
    return updateTrace;
  }

  function emitSessionActivityStarted(session, timestamp) {
    if (!session?.meta) {
      return;
    }
    session.meta.activityState = SESSION_ACTIVITY_STATE_ACTIVE;
    session.meta.activityUpdatedAt = timestamp;
    session.meta.activityCompletedAt = null;
    session.meta.updatedAt = timestamp;
    const trace = createTraceEnvelope(session.traceSeed, {
      sessionId: session.id,
      source: "pty"
    });
    updateSessionTraceSeed(session, trace, { source: "pty" });
    emit("session.activity.started", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      session: session.meta,
      trace
    });
  }

  function emitSessionActivityCompleted(session, timestamp) {
    if (session) {
      session.activityTimer = null;
    }
    if (!session?.meta || session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
      return;
    }
    session.meta.activityState = SESSION_ACTIVITY_STATE_INACTIVE;
    session.meta.activityUpdatedAt = timestamp;
    session.meta.activityCompletedAt = timestamp;
    session.meta.updatedAt = timestamp;
    const trace = createTraceEnvelope(session.traceSeed, {
      sessionId: session.id,
      source: "pty"
    });
    updateSessionTraceSeed(session, trace, { source: "pty" });
    emit("session.activity.completed", {
      sessionId: session.id,
      activityState: session.meta.activityState,
      activityUpdatedAt: session.meta.activityUpdatedAt,
      activityCompletedAt: session.meta.activityCompletedAt,
      session: session.meta,
      trace
    });
    if (session.pendingLaunchPostStartInput?.observedPtyData === true) {
      scheduleLaunchPostStartInputDispatch(session, "activity_completed");
    }
  }

  function scheduleSessionActivityCompletion(session) {
    if (!session) {
      return;
    }
    clearSessionActivityTimer(session);
    session.activityTimer = setTimeoutFn(() => {
      if (!sessions.has(session.id)) {
        return;
      }
      emitSessionActivityCompleted(session, nowFn());
    }, sessionActivityQuietMs);
  }

  function handleAsyncPtyWriteEvent(session, event = {}) {
    if (!session) {
      return;
    }
    const trace = createTraceEnvelope(event.trace || session.traceSeed, {
      sessionId: session.id,
      source: event.trace?.source || session.traceSeed?.source || "pty"
    });
    emit("session.input.write", {
      sessionId: session.id,
      phase: typeof event.phase === "string" && event.phase ? event.phase : "failed",
      writeKind: typeof event.writeKind === "string" && event.writeKind ? event.writeKind : "direct",
      bytes: Number.isInteger(event.bytes) ? event.bytes : 0,
      ...(event.error ? { error: event.error } : {}),
      ...(typeof event.code === "string" && event.code ? { code: event.code } : {}),
      ...(typeof event.failureStage === "string" && event.failureStage ? { failureStage: event.failureStage } : {}),
      ...(Number.isInteger(event.retryCount) ? { retryCount: event.retryCount } : {}),
      ...(Number.isInteger(event.queueDroppedCount) ? { queueDroppedCount: event.queueDroppedCount } : {}),
      ...(event.droppedByQueueFailure === true ? { droppedByQueueFailure: true } : {}),
      ...(event.retryable === true ? { retryable: true } : {}),
      trace
    });
  }

  function transitionToRunning(session) {
    if (!session || session.meta.state === SESSION_STATE_RUNNING) {
      return session?.meta || null;
    }
    const timestamp = nowFn();
    session.meta.state = SESSION_STATE_RUNNING;
    session.meta.startedAt = Number.isInteger(session.meta.startedAt) ? session.meta.startedAt : timestamp;
    const trace = createTraceEnvelope(session.traceSeed, {
      sessionId: session.id,
      source: session.traceSeed?.source || "rest"
    });
    updateSessionTraceSeed(session, trace, { source: session.traceSeed?.source || "rest" });
    emit("session.started", {
      sessionId: session.id,
      startedAt: session.meta.startedAt,
      updatedAt: session.meta.updatedAt,
      session: session.meta,
      trace
    });
    emit("session.updated", {
      session: session.meta,
      trace: createTraceEnvelope(session.traceSeed, {
        sessionId: session.id,
        source: session.traceSeed?.source || "rest"
      })
    });
    return session.meta;
  }

  function sendInput(sessionId, data, options = {}) {
    const session = getSessionOrThrow(sessionId);
    if (!session.ptyProcess) {
      throw buildReconnectUnavailableError(session);
    }
    updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    const eventTrace = createTraceEnvelope(session.traceSeed, {
      sessionId,
      source: options.trace?.source || session.traceSeed?.source || "rest"
    });
    const writeKind = typeof options.writeKind === "string" && options.writeKind.trim() ? options.writeKind.trim() : "direct";
    const bytes = Buffer.byteLength(String(data || ""), "utf8");
    emit("session.input.write", {
      sessionId,
      phase: "attempt",
      writeKind,
      bytes,
      trace: eventTrace
    });
    queueNodePtyAsyncWriteMeta(session.ptyProcess, {
      sessionId,
      writeKind,
      bytes,
      trace: eventTrace
    });
    try {
      session.ptyProcess.write(data);
    } catch (error) {
      clearNodePtyAsyncWriteMeta(session.ptyProcess);
      emit("session.input.write", {
        sessionId,
        phase: "failed",
        writeKind,
        bytes,
        error: error instanceof Error ? error.message : String(error || "write failed"),
        trace: eventTrace
      });
      throw error;
    }
    emit("session.input.write", {
      sessionId,
      phase: "ok",
      writeKind,
      bytes,
      trace: eventTrace
    });
    const timestamp = nowFn();
    if (options.customCommandUsage) {
      session.meta.quickSendUsage = recordQuickSendUsageEntry(session.meta.quickSendUsage, options.customCommandUsage, {
        usedAt: timestamp
      });
    }
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
    scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs: foregroundProcessRefreshDelayMs,
      trace: options.trace || null
    });
  }

  function resize(sessionId, cols, rows, options = {}) {
    const session = getSessionOrThrow(sessionId);
    if (!session.ptyProcess) {
      throw buildReconnectUnavailableError(session);
    }
    updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    session.ptyProcess.resize(cols, rows);
    const timestamp = nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  function signal(sessionId, signalName, options = {}) {
    const session = getSessionOrThrow(sessionId);
    if (!session.ptyProcess) {
      throw buildReconnectUnavailableError(session);
    }
    updateSessionTraceSeed(session, options.trace, {
      sessionId,
      source: options.trace?.source || "rest"
    });
    clearExpectedExitReason(session);
    session.expectedExitReason = signalName || "signal";
    session.expectedExitReasonTimer = setTimeoutFn(() => {
      session.expectedExitReasonTimer = null;
      session.expectedExitReason = "";
    }, 250);
    session.ptyProcess.kill(signalName);
    const timestamp = nowFn();
    session.lastActivityAt = timestamp;
    session.meta.updatedAt = timestamp;
  }

  return {
    emitSessionActivityCompleted,
    emitSessionActivityStarted,
    emitSessionUpdated,
    handleAsyncPtyWriteEvent,
    resize,
    scheduleSessionActivityCompletion,
    sendInput,
    signal,
    transitionToRunning,
    updateSessionTraceSeed
  };
}
