import {
  createTerminalAppIdentityRuntimeState,
  deriveTerminalAppIdentityCandidateFromForegroundProcess,
  deriveTerminalAppIdentityCandidateFromOutputHeuristics,
  deriveTerminalAppIdentityCandidateFromSessionHints,
  deriveTerminalAppIdentityCandidatesFromTerminalSignals,
  deriveTerminalAppIdentityFromSessionHints,
  normalizeTerminalAppIdentityRuntimeState,
  normalizeTerminalAppIdentity,
  reconcileTerminalAppIdentityRuntimeState,
  terminalAppIdentityEquals
} from "./terminal-app-identity.js";
import { consumeTerminalSignals, createEmptyTerminalSignalState } from "./terminal-output-signals.js";

const DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS = 90;
const SESSION_KIND_LOCAL = "local";

export function createSessionManagerAppIdentityRuntime({
  nowFn = Date.now,
  setTimeoutFn = setTimeout,
  foregroundProcessRefreshDelayMs = DEFAULT_FOREGROUND_PROCESS_REFRESH_DELAY_MS,
  inspectTerminalForegroundProcess = null,
  clearForegroundProcessRefreshTimer = () => {},
  emitSessionUpdated = () => {},
  getSessionById = () => null
} = {}) {
  const resolveSession = (sessionOrId) => {
    if (typeof sessionOrId === "string") {
      return getSessionById(sessionOrId) || null;
    }
    return sessionOrId || null;
  };

  const emitUpdated = (session, { emitUpdatedEvent = false, trace = null, updatedAt = nowFn() } = {}) => {
    if (!emitUpdatedEvent) {
      return;
    }
    emitSessionUpdated(session, {
      trace,
      updatedAt
    });
  };

  function createInitialIdentityRuntime(sessionHints, { updatedAt = nowFn() } = {}) {
    const initialAppIdentity = deriveTerminalAppIdentityFromSessionHints(sessionHints, {
      updatedAt
    });
    return {
      appIdentity: initialAppIdentity,
      appIdentityState: createTerminalAppIdentityRuntimeState(sessionHints, {
        currentIdentity: initialAppIdentity,
        updatedAt
      }),
      terminalSignalState: createEmptyTerminalSignalState()
    };
  }

  function applySessionAppIdentity(session, nextIdentity, { emitUpdatedEvent = false, trace = null, updatedAt = nowFn() } = {}) {
    const currentIdentity = normalizeTerminalAppIdentity(session?.meta?.appIdentity, {
      fallbackUpdatedAt: updatedAt
    });
    const normalizedNextIdentity = normalizeTerminalAppIdentity(nextIdentity, {
      fallbackUpdatedAt: updatedAt
    });
    const runtimeState = normalizeTerminalAppIdentityRuntimeState(session?.appIdentityState, {
      session: session?.meta,
      currentIdentity,
      updatedAt
    });
    const nextRuntimeState = {
      ...runtimeState,
      current: normalizedNextIdentity,
      candidates: {
        ...runtimeState.candidates
      },
      recentCandidates: [...runtimeState.recentCandidates]
    };
    if (
      normalizedNextIdentity.source !== "unknown" &&
      Object.prototype.hasOwnProperty.call(nextRuntimeState.candidates, normalizedNextIdentity.source)
    ) {
      const previousCandidate = normalizeTerminalAppIdentity(nextRuntimeState.candidates[normalizedNextIdentity.source], {
        fallbackUpdatedAt: updatedAt
      });
      nextRuntimeState.candidates[normalizedNextIdentity.source] = normalizedNextIdentity;
      if (!terminalAppIdentityEquals(previousCandidate, normalizedNextIdentity)) {
        nextRuntimeState.recentCandidates.push({
          source: normalizedNextIdentity.source,
          candidateSource: normalizedNextIdentity.source,
          family: normalizedNextIdentity.family,
          label: normalizedNextIdentity.label,
          confidence: normalizedNextIdentity.confidence,
          observedAt: updatedAt
        });
        nextRuntimeState.recentCandidates = nextRuntimeState.recentCandidates.slice(-12);
      }
      if (normalizedNextIdentity.source === "foreground-process") {
        nextRuntimeState.lastForegroundProbeAt = updatedAt;
      }
      if (normalizedNextIdentity.source === "output-heuristic") {
        nextRuntimeState.lastOutputHintAt = updatedAt;
      }
    }
    session.appIdentityState = nextRuntimeState;
    if (terminalAppIdentityEquals(currentIdentity, normalizedNextIdentity, { includeUpdatedAt: false })) {
      session.meta.appIdentity = currentIdentity;
      return session.meta.appIdentity;
    }
    session.meta.appIdentity = normalizedNextIdentity;
    session.meta.updatedAt = updatedAt;
    emitUpdated(session, {
      emitUpdatedEvent,
      trace,
      updatedAt
    });
    return session.meta.appIdentity;
  }

  function reconcileSessionAppIdentity(
    session,
    candidateUpdates,
    { emitUpdatedEvent = false, trace = null, updatedAt = nowFn(), metaChanged = false } = {}
  ) {
    const currentIdentity = normalizeTerminalAppIdentity(session?.meta?.appIdentity, {
      fallbackUpdatedAt: updatedAt
    });
    const currentState = normalizeTerminalAppIdentityRuntimeState(session?.appIdentityState, {
      session: session?.meta,
      currentIdentity,
      updatedAt
    });
    const reconciled = reconcileTerminalAppIdentityRuntimeState(currentState, candidateUpdates, {
      session: session?.meta,
      currentIdentity,
      updatedAt
    });
    session.appIdentityState = reconciled.state;
    const identityChanged = !terminalAppIdentityEquals(currentIdentity, reconciled.current, { includeUpdatedAt: false });
    session.meta.appIdentity = identityChanged ? reconciled.current : currentIdentity;
    const nextMetaChanged = metaChanged || identityChanged;
    if (nextMetaChanged) {
      session.meta.updatedAt = updatedAt;
    }
    emitUpdated(session, {
      emitUpdatedEvent: emitUpdatedEvent && nextMetaChanged,
      trace,
      updatedAt
    });
    return {
      identity: session.meta.appIdentity,
      identityChanged,
      metaChanged: nextMetaChanged,
      state: session.appIdentityState
    };
  }

  function refreshSessionAppIdentity(sessionOrId, options = {}) {
    const session = resolveSession(sessionOrId);
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : nowFn();
    const nextCandidate = deriveTerminalAppIdentityCandidateFromSessionHints(session?.meta, {
      updatedAt
    });
    const reconciled = reconcileSessionAppIdentity(
      session,
      {
        "explicit-hint": nextCandidate
      },
      {
        emitUpdatedEvent: options.emitUpdatedEvent === true,
        trace: options.trace || null,
        updatedAt
      }
    );
    return reconciled.identity;
  }

  function refreshSessionForegroundProcessIdentity(sessionOrId, options = {}) {
    const session = resolveSession(sessionOrId);
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : nowFn();
    if (!session || session.meta.kind !== SESSION_KIND_LOCAL || !session.ptyProcess || !Number.isInteger(session.ptyProcess.pid)) {
      return normalizeTerminalAppIdentity(session?.meta?.appIdentity, {
        fallbackUpdatedAt: updatedAt
      });
    }
    const inspection = inspectTerminalForegroundProcess(session.ptyProcess.pid, {
      sessionId: session.id,
      ptyPath: session.ptyProcess._pty || "",
      updatedAt
    });
    const nextCandidate = deriveTerminalAppIdentityCandidateFromForegroundProcess(inspection, {
      updatedAt
    });
    const reconciled = reconcileSessionAppIdentity(
      session,
      {
        "foreground-process": nextCandidate
      },
      {
        emitUpdatedEvent: options.emitUpdatedEvent === true,
        trace: options.trace || null,
        updatedAt
      }
    );
    return reconciled.identity;
  }

  function observeSessionTerminalSignals(session, chunk, options = {}) {
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : nowFn();
    if (!session) {
      return {
        state: createEmptyTerminalSignalState(),
        signals: [],
        appIdentityChanged: false,
        cwdChanged: false
      };
    }
    const currentState = session.terminalSignalState || createEmptyTerminalSignalState();
    const result = consumeTerminalSignals(currentState, chunk, { updatedAt });
    session.terminalSignalState = result.state;
    if (!Array.isArray(result.signals) || result.signals.length === 0) {
      return {
        ...result,
        appIdentityChanged: false,
        cwdChanged: false,
        metaChanged: false
      };
    }
    const nextCwd = typeof result.state.currentDirectory === "string" ? result.state.currentDirectory.trim() : "";
    const cwdChanged = Boolean(nextCwd && nextCwd !== session.meta.cwd);
    if (cwdChanged) {
      session.meta.cwd = nextCwd;
      session.meta.updatedAt = updatedAt;
    }
    const reconciled = reconcileSessionAppIdentity(
      session,
      deriveTerminalAppIdentityCandidatesFromTerminalSignals(result.state, session.meta, {
        updatedAt
      }),
      {
        emitUpdatedEvent: options.emitUpdatedEvent === true,
        trace: options.trace || null,
        updatedAt,
        metaChanged: cwdChanged
      }
    );
    return {
      ...result,
      appIdentityChanged: reconciled.identityChanged,
      cwdChanged,
      metaChanged: reconciled.metaChanged
    };
  }

  function observeSessionOutputHeuristics(session, output, options = {}) {
    const updatedAt = Number.isInteger(options.updatedAt) ? options.updatedAt : nowFn();
    if (!session) {
      return {
        candidateMatched: false,
        appIdentityChanged: false,
        metaChanged: false
      };
    }
    const nextCandidate = deriveTerminalAppIdentityCandidateFromOutputHeuristics(output, {
      updatedAt
    });
    if (nextCandidate.source !== "output-heuristic") {
      return {
        candidateMatched: false,
        appIdentityChanged: false,
        metaChanged: false
      };
    }
    const reconciled = reconcileSessionAppIdentity(
      session,
      {
        "output-heuristic": nextCandidate
      },
      {
        emitUpdatedEvent: options.emitUpdatedEvent === true,
        trace: options.trace || null,
        updatedAt
      }
    );
    return {
      candidateMatched: true,
      appIdentityChanged: reconciled.identityChanged,
      metaChanged: reconciled.metaChanged
    };
  }

  function scheduleSessionForegroundProcessIdentityRefresh(
    session,
    { delayMs = foregroundProcessRefreshDelayMs, trace = null } = {}
  ) {
    if (
      !session ||
      session.meta.kind !== SESSION_KIND_LOCAL ||
      !session.ptyProcess ||
      !Number.isInteger(session.ptyProcess.pid) ||
      session.ptyProcess.pid <= 0
    ) {
      return false;
    }
    clearForegroundProcessRefreshTimer(session);
    const currentPtyProcess = session.ptyProcess;
    session.foregroundProcessRefreshTimer = setTimeoutFn(() => {
      session.foregroundProcessRefreshTimer = null;
      if (resolveSession(session.id) !== session || session.ptyProcess !== currentPtyProcess) {
        return;
      }
      refreshSessionForegroundProcessIdentity(session, {
        emitUpdatedEvent: true,
        trace
      });
    }, Math.max(0, delayMs));
    return true;
  }

  return {
    createInitialIdentityRuntime,
    applySessionAppIdentity,
    reconcileSessionAppIdentity,
    refreshSessionAppIdentity,
    refreshSessionForegroundProcessIdentity,
    observeSessionTerminalSignals,
    observeSessionOutputHeuristics,
    scheduleSessionForegroundProcessIdentityRefresh
  };
}
