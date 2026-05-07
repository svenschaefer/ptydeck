import { attachNodePtyAsyncWritePatch as attachNodePtyAsyncWritePatchBase } from "./node-pty-write-retry.js";

const SESSION_KIND_SSH = "ssh";
const SESSION_ACTIVITY_STATE_ACTIVE = "active";

export function createSessionManagerPtyRuntime(dependencies = {}) {
  const {
    nowFn = Date.now,
    foregroundProcessRefreshDelayMs = 90,
    nodePtyAsyncWriteOptions = {},
    attachNodePtyAsyncWritePatchImpl = attachNodePtyAsyncWritePatchBase,
    emit = () => {},
    createTraceEnvelope = () => ({}),
    updateSessionTraceSeed = () => {},
    observeStartupTerminalQueryFallback = () => {},
    observeSessionTerminalSignals = () => ({ signals: [], metaChanged: false }),
    observeSessionOutputHeuristics = () => ({ metaChanged: false }),
    captureSessionStreamChunk = null,
    emitSessionUpdated = () => {},
    appendReplayOutput = () => {},
    observePendingLaunchPostStartInput = () => {},
    markRemoteSessionConnected = () => {},
    emitSessionActivityStarted = () => {},
    scheduleSessionActivityCompletion = () => {},
    scheduleSessionForegroundProcessIdentityRefresh = () => {},
    handleAsyncPtyWriteEvent = () => {},
    handlePtyExit = () => {}
  } = dependencies;

  function attachPtyProcess(session, { ptyProcess, shellAdapter }) {
    session.ptyProcess = ptyProcess;
    session.shellAdapter = shellAdapter;
    session.cwdTrackingBuffer = "";
    session.replayShellBlockTrackingSupported = shellAdapter?.capability?.shellBlockTrackingSupported === true;
    scheduleSessionForegroundProcessIdentityRefresh(session, {
      delayMs: foregroundProcessRefreshDelayMs
    });
    attachNodePtyAsyncWritePatchImpl(ptyProcess, {
      ...nodePtyAsyncWriteOptions,
      onAsyncWriteEvent: (event) => {
        handleAsyncPtyWriteEvent(session, event);
      }
    });
    ptyProcess.onData((data) => {
      let timestamp = null;
      let trace = null;
      const getTimestamp = () => {
        if (!Number.isInteger(timestamp)) {
          timestamp = nowFn();
        }
        return timestamp;
      };
      const getTrace = () => {
        if (!trace) {
          trace = createTraceEnvelope(session.traceSeed, {
            sessionId: session.id,
            source: "pty"
          });
          updateSessionTraceSeed(session, trace, { source: "pty" });
        }
        return trace;
      };
      const rawData = typeof data === "string" ? data : String(data ?? "");
      observeStartupTerminalQueryFallback(session, {
        rawData
      });
      const signalResult = observeSessionTerminalSignals(session, data, {
        updatedAt: getTimestamp()
      });
      const streamResult = session.shellAdapter.consumeOutput(session, data);
      const cleaned = typeof streamResult?.cleaned === "string" ? streamResult.cleaned : "";
      const promptBoundaries = Array.isArray(streamResult?.promptBoundaries) ? streamResult.promptBoundaries : [];
      const outputHintResult = cleaned
        ? observeSessionOutputHeuristics(session, cleaned, {
            updatedAt: getTimestamp()
          })
        : {
            candidateMatched: false,
            appIdentityChanged: false,
            metaChanged: false
          };
      if (typeof captureSessionStreamChunk === "function") {
        captureSessionStreamChunk({
          session: session.meta,
          rawData,
          cleanedData: cleaned,
          promptBoundaries,
          terminalSignalKinds: Array.isArray(signalResult?.signals)
            ? signalResult.signals
                .map((entry) => (typeof entry?.kind === "string" ? entry.kind : ""))
                .filter(Boolean)
            : [],
          trace: getTrace()
        });
      }
      if (!cleaned && promptBoundaries.length > 0) {
        if (signalResult.metaChanged) {
          emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: getTimestamp()
          });
        }
        appendReplayOutput(session, "", promptBoundaries);
        emit("session.data", {
          sessionId: session.id,
          data: "",
          promptBoundaries,
          trace: getTrace()
        });
        scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
        return;
      }
      observePendingLaunchPostStartInput(session, {
        rawData,
        promptBoundaries
      });
      if (cleaned) {
        const activityTimestamp = getTimestamp();
        if (session.meta.kind === SESSION_KIND_SSH && session.meta.remoteRuntime?.connectivityState !== "connected") {
          markRemoteSessionConnected(session, activityTimestamp);
        }
        session.lastActivityAt = activityTimestamp;
        if (session.meta.activityState !== SESSION_ACTIVITY_STATE_ACTIVE) {
          emitSessionActivityStarted(session, activityTimestamp);
        } else {
          session.meta.updatedAt = activityTimestamp;
        }
        if (signalResult.metaChanged || outputHintResult.metaChanged) {
          emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: activityTimestamp
          });
        }
        appendReplayOutput(session, cleaned, promptBoundaries);
        scheduleSessionActivityCompletion(session);
        emit("session.data", {
          sessionId: session.id,
          data: cleaned,
          promptBoundaries,
          trace: getTrace()
        });
        scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
      } else if (signalResult.signals.length > 0) {
        if (signalResult.metaChanged) {
          emitSessionUpdated(session, {
            trace: getTrace(),
            updatedAt: getTimestamp()
          });
        }
        scheduleSessionForegroundProcessIdentityRefresh(session, {
          delayMs: foregroundProcessRefreshDelayMs,
          trace: getTrace()
        });
      }
    });

    ptyProcess.onExit((exit) => {
      handlePtyExit(session, exit);
    });
  }

  return {
    attachPtyProcess
  };
}
