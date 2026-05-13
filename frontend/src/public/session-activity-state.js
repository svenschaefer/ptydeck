function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeRawSessionState(value) {
  const state = normalizeText(value).toLowerCase();
  if (
    state === "created" ||
    state === "starting" ||
    state === "running" ||
    state === "busy" ||
    state === "idle" ||
    state === "stopped" ||
    state === "unrestored" ||
    state === "exited" ||
    state === "closed"
  ) {
    return state;
  }
  return "running";
}

export function normalizeActivityTimestamp(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function normalizeSessionActivityState(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "active" || normalized === "inactive") {
    return normalized;
  }
  return "inactive";
}

export function deriveSessionLifecycleState(rawState, session) {
  const normalizedRawState = normalizeRawSessionState(rawState || session?.state);
  if (
    normalizedRawState === "stopped" ||
    normalizedRawState === "unrestored" ||
    normalizedRawState === "exited" ||
    normalizedRawState === "closed"
  ) {
    return normalizedRawState;
  }
  if (normalizedRawState === "created" || normalizedRawState === "starting") {
    return normalizedRawState;
  }
  if (session?.hasLiveActivity === true || normalizeSessionActivityState(session?.activityState) === "active") {
    return "busy";
  }
  if (
    normalizeActivityTimestamp(session?.lastOutputAt) !== null ||
    normalizeActivityTimestamp(session?.activityCompletedAt) !== null
  ) {
    return "idle";
  }
  return "running";
}

export function maybeMatchCommandCorrelation(record, timestamp) {
  if (!record || normalizeActivityTimestamp(record.matchedAt) !== null) {
    return record;
  }
  const submittedAt = normalizeActivityTimestamp(record.submittedAt);
  const nextTimestamp = normalizeActivityTimestamp(timestamp) ?? Date.now();
  if (submittedAt === null || nextTimestamp < submittedAt || nextTimestamp > submittedAt + 30_000) {
    return record;
  }
  return {
    ...record,
    matchedAt: nextTimestamp,
    firstOutputAt: normalizeActivityTimestamp(record.firstOutputAt) ?? nextTimestamp
  };
}

export function reduceSessionActivityBump(runtimeState, action, options = {}) {
  const updateLatest =
    typeof options.updateLatestCommandCorrelation === "function" ? options.updateLatestCommandCorrelation : (session) => session;
  const sessionId = normalizeText(action.sessionId);
  if (!sessionId) {
    return runtimeState;
  }
  const activityTimestamp = normalizeActivityTimestamp(action.timestamp) || Date.now();
  let changed = false;
  const nextSessions = runtimeState.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    const hasUnreadActivity = sessionId === runtimeState.activeSessionId ? false : true;
    let nextSession = session;
    if (!(session.hasLiveActivity === true && session.hasUnreadActivity === hasUnreadActivity)) {
      changed = true;
      nextSession = {
        ...nextSession,
        activityState: "active",
        activityUpdatedAt: activityTimestamp,
        activityCompletedAt: null,
        hasLiveActivity: true,
        hasUnreadActivity,
        lastOutputAt: activityTimestamp,
        lifecycleState: "busy"
      };
    }
    const matchedSession = updateLatest(nextSession, (record) => {
      const nextRecord = maybeMatchCommandCorrelation(record, activityTimestamp);
      return nextRecord === record ? record : nextRecord;
    });
    if (matchedSession !== nextSession) {
      changed = true;
      return matchedSession;
    }
    return nextSession;
  });
  if (!changed) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    sessions: nextSessions
  };
}

export function reduceSessionActivityClear(runtimeState, action, options = {}) {
  const updateLatest =
    typeof options.updateLatestCommandCorrelation === "function" ? options.updateLatestCommandCorrelation : (session) => session;
  const sessionId = normalizeText(action.sessionId);
  if (!sessionId) {
    return runtimeState;
  }
  let changed = false;
  const cutoffTimestamp = normalizeActivityTimestamp(action.timestamp);
  const nextSessions = runtimeState.sessions.map((session) => {
    if (session.id !== sessionId || session.hasLiveActivity !== true) {
      return session;
    }
    const lastOutputAt = normalizeActivityTimestamp(session.lastOutputAt);
    if (cutoffTimestamp !== null && lastOutputAt !== null && lastOutputAt > cutoffTimestamp) {
      return session;
    }
    changed = true;
    const nextTimestamp = cutoffTimestamp !== null ? cutoffTimestamp : normalizeActivityTimestamp(session.lastOutputAt);
    const nextSession = {
      ...session,
      activityState: "inactive",
      activityUpdatedAt: nextTimestamp,
      activityCompletedAt: nextTimestamp,
      hasLiveActivity: false,
      lifecycleState: deriveSessionLifecycleState(session.state, {
        ...session,
        hasLiveActivity: false,
        activityState: "inactive",
        activityCompletedAt: nextTimestamp
      })
    };
    return updateLatest(nextSession, (record) => {
      const matchedAt = normalizeActivityTimestamp(record.matchedAt);
      if (matchedAt === null || normalizeActivityTimestamp(record.completedAt) !== null) {
        return record;
      }
      return {
        ...record,
        completedAt: nextTimestamp ?? Date.now()
      };
    });
  });
  if (!changed) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    sessions: nextSessions
  };
}
