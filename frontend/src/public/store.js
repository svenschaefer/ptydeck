const DEFAULT_CONNECTION_STATE = "connecting";
const DEFAULT_DECK_ID = "default";
const SESSION_NOTIFICATION_LIMIT = 20;
const SESSION_ARTIFACT_LIMIT = 20;
const SESSION_BADGE_LIMIT = 8;

function normalizeText(value) {
  return String(value || "").trim();
}

function getSessionDeckId(session, defaultDeckId = DEFAULT_DECK_ID) {
  const deckId = normalizeText(session?.deckId);
  return deckId || defaultDeckId;
}

function normalizeCustomCommandName(name) {
  return normalizeText(name).toLowerCase();
}

function normalizeCustomCommandRecord(command) {
  if (!command || typeof command !== "object") {
    return null;
  }
  const name = normalizeCustomCommandName(command.name);
  if (!name) {
    return null;
  }
  return {
    name,
    content: typeof command.content === "string" ? command.content : "",
    createdAt: Number(command.createdAt || 0),
    updatedAt: Number(command.updatedAt || 0)
  };
}

function sortDecks(decks) {
  return decks
    .slice()
    .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), "en-US"));
}

function resolveActiveSessionId(currentActiveSessionId, sessions, activeDeckId = "", defaultDeckId = DEFAULT_DECK_ID) {
  const preferredDeckId = normalizeText(activeDeckId);
  if (preferredDeckId) {
    const currentActiveSession =
      currentActiveSessionId && sessions.find((session) => session.id === currentActiveSessionId);
    if (currentActiveSession && getSessionDeckId(currentActiveSession, defaultDeckId) === preferredDeckId) {
      return currentActiveSessionId;
    }
    const firstInDeck = sessions.find((session) => getSessionDeckId(session, defaultDeckId) === preferredDeckId);
    if (firstInDeck) {
      return firstInDeck.id;
    }
  }
  if (currentActiveSessionId && sessions.some((session) => session.id === currentActiveSessionId)) {
    return currentActiveSessionId;
  }
  return sessions[0]?.id || null;
}

function resolveActiveDeckId(decks, preferredActiveDeckId, defaultDeckId = DEFAULT_DECK_ID) {
  const preferred = normalizeText(preferredActiveDeckId);
  if (preferred && decks.some((deck) => deck.id === preferred)) {
    return preferred;
  }
  if (decks.some((deck) => deck.id === defaultDeckId)) {
    return defaultDeckId;
  }
  return decks[0]?.id || "";
}

function normalizeSessionFilterText(value) {
  return normalizeText(value);
}

function cloneRecord(record) {
  return record && typeof record === "object" ? { ...record } : record;
}

function cloneSessionRecord(session) {
  if (!session || typeof session !== "object") {
    return session;
  }
  return {
    ...session,
    env: session.env && typeof session.env === "object" ? { ...session.env } : session.env,
    themeProfile: session.themeProfile && typeof session.themeProfile === "object" ? { ...session.themeProfile } : session.themeProfile,
    tags: Array.isArray(session.tags) ? session.tags.slice() : session.tags,
    meta: session.meta && typeof session.meta === "object" ? { ...session.meta } : session.meta,
    pluginBadges: Array.isArray(session.pluginBadges) ? session.pluginBadges.map((badge) => ({ ...badge })) : [],
    artifacts: Array.isArray(session.artifacts)
      ? session.artifacts.map((artifact) => ({
          ...artifact,
          data: artifact?.data && typeof artifact.data === "object" ? { ...artifact.data } : artifact?.data
        }))
      : [],
    notifications: Array.isArray(session.notifications)
      ? session.notifications.map((notification) => ({
          ...notification,
          data: notification?.data && typeof notification.data === "object" ? { ...notification.data } : notification?.data
        }))
      : [],
    activityState: normalizeSessionActivityState(session.activityState),
    activityUpdatedAt: normalizeActivityTimestamp(session.activityUpdatedAt),
    activityCompletedAt: normalizeActivityTimestamp(session.activityCompletedAt)
  };
}

function normalizeActivityTimestamp(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function normalizeSessionActivityState(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "active" || normalized === "inactive") {
    return normalized;
  }
  return "inactive";
}

function normalizeRawSessionState(value) {
  const state = normalizeText(value).toLowerCase();
  if (
    state === "created" ||
    state === "starting" ||
    state === "running" ||
    state === "busy" ||
    state === "idle" ||
    state === "unrestored" ||
    state === "exited" ||
    state === "closed"
  ) {
    return state;
  }
  return "running";
}

function normalizePluginSessionState(value) {
  const state = normalizeText(value).toLowerCase();
  return state || "";
}

function normalizeSessionStatusText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionMeta(record) {
  return record && typeof record === "object" && !Array.isArray(record) ? { ...record } : {};
}

function normalizeSessionTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const dedupe = new Set();
  for (const rawTag of tags) {
    const normalized = normalizeText(rawTag).toLowerCase();
    if (!normalized) {
      continue;
    }
    dedupe.add(normalized);
  }
  return Array.from(dedupe).sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }));
}

function normalizeSessionBadgeTone(value) {
  const tone = normalizeText(value).toLowerCase();
  if (tone === "success" || tone === "warn" || tone === "danger" || tone === "active" || tone === "muted") {
    return tone;
  }
  return "info";
}

function normalizeSessionBadges(badges) {
  if (!Array.isArray(badges)) {
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (const rawBadge of badges) {
    if (!rawBadge || typeof rawBadge !== "object") {
      continue;
    }
    const id = normalizeText(rawBadge.id || rawBadge.text).toLowerCase();
    const text = normalizeText(rawBadge.text);
    if (!id || !text || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      text,
      tone: normalizeSessionBadgeTone(rawBadge.tone),
      pluginId: normalizeText(rawBadge.pluginId)
    });
    if (normalized.length >= SESSION_BADGE_LIMIT) {
      break;
    }
  }
  return normalized;
}

function normalizeArtifactRecord(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return null;
  }
  const id = normalizeText(artifact.id || artifact.title || artifact.kind).toLowerCase();
  const kind = normalizeText(artifact.kind).toLowerCase();
  const title = normalizeText(artifact.title);
  const text = typeof artifact.text === "string" ? artifact.text : "";
  if (!id || !kind) {
    return null;
  }
  return {
    id,
    kind,
    title,
    text,
    pluginId: normalizeText(artifact.pluginId),
    createdAt: Number.isFinite(artifact.createdAt) ? Number(artifact.createdAt) : Date.now(),
    data: artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data) ? { ...artifact.data } : {}
  };
}

function normalizeNotificationLevel(value) {
  const level = normalizeText(value).toLowerCase();
  if (level === "success" || level === "warn" || level === "error" || level === "debug") {
    return level;
  }
  return "info";
}

function normalizeNotificationRecord(notification) {
  if (!notification || typeof notification !== "object" || Array.isArray(notification)) {
    return null;
  }
  const message = normalizeSessionStatusText(notification.message);
  if (!message) {
    return null;
  }
  return {
    id: normalizeText(notification.id).toLowerCase() || `note-${Date.now()}`,
    level: normalizeNotificationLevel(notification.level),
    message,
    pluginId: normalizeText(notification.pluginId),
    createdAt: Number.isFinite(notification.createdAt) ? Number(notification.createdAt) : Date.now(),
    data: notification.data && typeof notification.data === "object" && !Array.isArray(notification.data) ? { ...notification.data } : {}
  };
}

function deriveSessionLifecycleState(rawState, session) {
  const normalizedRawState = normalizeRawSessionState(rawState || session?.state);
  if (normalizedRawState === "unrestored" || normalizedRawState === "exited" || normalizedRawState === "closed") {
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

function withSessionActivityDefaults(session) {
  if (!session || typeof session !== "object") {
    return session;
  }
  const normalizedSession = {
    ...session,
    activityState: normalizeSessionActivityState(session.activityState),
    activityUpdatedAt: normalizeActivityTimestamp(session.activityUpdatedAt),
    activityCompletedAt: normalizeActivityTimestamp(session.activityCompletedAt),
    hasLiveActivity:
      session.hasLiveActivity === true || normalizeSessionActivityState(session.activityState) === "active",
    hasUnreadActivity: session.hasUnreadActivity === true,
    lastOutputAt: normalizeActivityTimestamp(session.lastOutputAt),
    interpretationState: normalizePluginSessionState(session.interpretationState),
    statusText: normalizeSessionStatusText(session.statusText),
    attentionActive: session.attentionActive === true,
    pluginBadges: normalizeSessionBadges(session.pluginBadges),
    artifacts: Array.isArray(session.artifacts)
      ? session.artifacts.map((artifact) => normalizeArtifactRecord(artifact)).filter(Boolean).slice(-SESSION_ARTIFACT_LIMIT)
      : [],
    notifications: Array.isArray(session.notifications)
      ? session.notifications.map((notification) => normalizeNotificationRecord(notification)).filter(Boolean).slice(-SESSION_NOTIFICATION_LIMIT)
      : [],
    meta: normalizeSessionMeta(session.meta),
    tags: normalizeSessionTags(session.tags)
  };
  normalizedSession.lifecycleState = deriveSessionLifecycleState(normalizedSession.state, normalizedSession);
  return normalizedSession;
}

function createStateSnapshot(state) {
  return {
    ...state,
    sessions: state.sessions.map(cloneSessionRecord),
    decks: state.decks.map(cloneRecord),
    customCommands: state.customCommands.map(cloneRecord)
  };
}

function mergeSessionRecord(currentSession, nextSession) {
  const mergedSource = { ...currentSession, ...nextSession };
  if (nextSession && Object.prototype.hasOwnProperty.call(nextSession, "activityState")) {
    mergedSource.hasLiveActivity = normalizeSessionActivityState(nextSession.activityState) === "active";
  }
  const merged = withSessionActivityDefaults(mergedSource);
  const runtimeState = normalizeText(nextSession?.state).toLowerCase();
  if (runtimeState !== "exited") {
    delete merged.exitCode;
    delete merged.exitSignal;
    delete merged.exitedAt;
  }
  return merged;
}

function applySessionMetaPatch(currentMeta, patch) {
  const base = normalizeSessionMeta(currentMeta);
  const normalizedPatch = normalizeSessionMeta(patch);
  const nextMeta = { ...base };
  for (const [key, value] of Object.entries(normalizedPatch)) {
    if (value === null) {
      delete nextMeta[key];
      continue;
    }
    nextMeta[key] = value;
  }
  return nextMeta;
}

function applyInterpretationAction(session, action) {
  if (!session || !action || typeof action !== "object") {
    return session;
  }
  switch (action.type) {
    case "setSessionState": {
      const interpretationState = normalizePluginSessionState(action.value);
      if ((session.interpretationState || "") === interpretationState) {
        return session;
      }
      return { ...session, interpretationState };
    }
    case "setSessionStatus": {
      const statusText = normalizeSessionStatusText(action.value);
      if ((session.statusText || "") === statusText) {
        return session;
      }
      return { ...session, statusText };
    }
    case "markSessionAttention": {
      const attentionActive = action.active === true;
      if (session.attentionActive === attentionActive) {
        return session;
      }
      return { ...session, attentionActive };
    }
    case "setSessionBadges": {
      const pluginBadges = normalizeSessionBadges(action.badges);
      if (JSON.stringify(session.pluginBadges || []) === JSON.stringify(pluginBadges)) {
        return session;
      }
      return { ...session, pluginBadges };
    }
    case "mergeSessionMeta": {
      const nextMeta = applySessionMetaPatch(session.meta, action.patch);
      if (JSON.stringify(session.meta || {}) === JSON.stringify(nextMeta)) {
        return session;
      }
      return { ...session, meta: nextMeta };
    }
    case "setSessionTags": {
      const tags = normalizeSessionTags(action.tags);
      if (JSON.stringify(session.tags || []) === JSON.stringify(tags)) {
        return session;
      }
      return { ...session, tags };
    }
    case "upsertSessionArtifact": {
      const artifact = normalizeArtifactRecord(action.artifact);
      if (!artifact) {
        return session;
      }
      const artifacts = Array.isArray(session.artifacts) ? session.artifacts.slice() : [];
      const index = artifacts.findIndex((entry) => entry.id === artifact.id);
      if (index >= 0) {
        artifacts[index] = artifact;
      } else {
        artifacts.push(artifact);
      }
      return { ...session, artifacts: artifacts.slice(-SESSION_ARTIFACT_LIMIT) };
    }
    case "removeSessionArtifact": {
      const artifactId = normalizeText(action.artifactId).toLowerCase();
      if (!artifactId) {
        return session;
      }
      const artifacts = Array.isArray(session.artifacts) ? session.artifacts.filter((entry) => entry.id !== artifactId) : [];
      if (artifacts.length === (session.artifacts || []).length) {
        return session;
      }
      return { ...session, artifacts };
    }
    case "pushSessionNotification": {
      const notification = normalizeNotificationRecord(action.notification);
      if (!notification) {
        return session;
      }
      const notifications = Array.isArray(session.notifications) ? session.notifications.slice() : [];
      notifications.push(notification);
      return { ...session, notifications: notifications.slice(-SESSION_NOTIFICATION_LIMIT) };
    }
    default:
      return session;
  }
}

export function createInitialRuntimeState(options = {}) {
  return {
    sessions: [],
    activeSessionId: null,
    connectionState: normalizeText(options.connectionState) || DEFAULT_CONNECTION_STATE,
    decks: [],
    activeDeckId: normalizeText(options.activeDeckId),
    customCommands: [],
    sessionFilterText: normalizeSessionFilterText(options.sessionFilterText)
  };
}

export function reduceRuntimeState(state, action, options = {}) {
  const runtimeState = state || createInitialRuntimeState(options);
  const defaultDeckId = normalizeText(options.defaultDeckId) || DEFAULT_DECK_ID;

  switch (action?.type) {
    case "preferences.hydrate": {
      const nextActiveDeckId = normalizeText(action.activeDeckId);
      const nextFilterText = normalizeSessionFilterText(action.sessionFilterText);
      if (runtimeState.activeDeckId === nextActiveDeckId && runtimeState.sessionFilterText === nextFilterText) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        activeDeckId: nextActiveDeckId,
        sessionFilterText: nextFilterText
      };
    }
    case "sessions.replace": {
      const nextSessions = Array.isArray(action.sessions)
        ? action.sessions.map((session) => {
            const currentSession = runtimeState.sessions.find((entry) => entry.id === session?.id);
            return currentSession ? mergeSessionRecord(currentSession, session) : withSessionActivityDefaults(session);
          })
        : [];
      const nextActiveSessionId = resolveActiveSessionId(runtimeState.activeSessionId, nextSessions, runtimeState.activeDeckId, defaultDeckId);
      if (runtimeState.sessions === nextSessions && runtimeState.activeSessionId === nextActiveSessionId) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions,
        activeSessionId: nextActiveSessionId
      };
    }
    case "session.upsert": {
      const nextSession = action.session;
      if (!nextSession || !nextSession.id) {
        return runtimeState;
      }
      const nextSessions = runtimeState.sessions.slice();
      const index = nextSessions.findIndex((entry) => entry.id === nextSession.id);
      if (index >= 0) {
        nextSessions[index] = mergeSessionRecord(nextSessions[index], nextSession);
      } else {
        nextSessions.push(withSessionActivityDefaults(nextSession));
      }
      return {
        ...runtimeState,
        sessions: nextSessions,
        activeSessionId: resolveActiveSessionId(runtimeState.activeSessionId, nextSessions, runtimeState.activeDeckId, defaultDeckId)
      };
    }
    case "session.exit": {
      const sessionId = normalizeText(action.sessionId);
      if (!sessionId) {
        return runtimeState;
      }
      const currentSession = runtimeState.sessions.find((session) => session.id === sessionId);
      if (!currentSession) {
        return runtimeState;
      }
      const exitedSession = {
        ...currentSession,
        state: "exited",
        lifecycleState: "exited",
        exitCode: Number.isInteger(action.exitCode) ? action.exitCode : null,
        exitSignal: typeof action.signal === "string" ? action.signal : "",
        exitedAt: Number.isFinite(action.exitedAt) ? action.exitedAt : Date.now(),
        updatedAt: Number.isFinite(action.updatedAt) ? action.updatedAt : Date.now()
      };
      return reduceRuntimeState(runtimeState, { type: "session.upsert", session: exitedSession }, { defaultDeckId });
    }
    case "session.remove": {
      const sessionId = normalizeText(action.sessionId);
      if (!sessionId) {
        return runtimeState;
      }
      const nextSessions = runtimeState.sessions.filter((entry) => entry.id !== sessionId);
      if (nextSessions.length === runtimeState.sessions.length) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions,
        activeSessionId: resolveActiveSessionId(runtimeState.activeSessionId, nextSessions, runtimeState.activeDeckId, defaultDeckId)
      };
    }
    case "session.close": {
      const sessionId = normalizeText(action.sessionId);
      if (!sessionId) {
        return runtimeState;
      }
      const nextSessions = runtimeState.sessions.filter((entry) => entry.id !== sessionId);
      if (nextSessions.length === runtimeState.sessions.length) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions,
        activeSessionId: resolveActiveSessionId(runtimeState.activeSessionId, nextSessions, runtimeState.activeDeckId, defaultDeckId)
      };
    }
    case "session.active.set": {
      const nextActiveSessionId = normalizeText(action.sessionId) || null;
      if (runtimeState.activeSessionId === nextActiveSessionId) {
        if (!nextActiveSessionId) {
          return runtimeState;
        }
        const currentSession = runtimeState.sessions.find((session) => session.id === nextActiveSessionId);
        if (!currentSession?.hasUnreadActivity) {
          return runtimeState;
        }
        return {
          ...runtimeState,
          sessions: runtimeState.sessions.map((session) =>
            session.id === nextActiveSessionId ? { ...session, hasUnreadActivity: false } : session
          )
        };
      }
      return {
        ...runtimeState,
        sessions: runtimeState.sessions.map((session) =>
          session.id === nextActiveSessionId ? { ...session, hasUnreadActivity: false } : session
        ),
        activeSessionId: nextActiveSessionId
      };
    }
    case "session.activity.bump": {
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
        if (session.hasLiveActivity === true && session.hasUnreadActivity === hasUnreadActivity) {
          return session;
        }
        changed = true;
        return {
          ...session,
          activityState: "active",
          activityUpdatedAt: activityTimestamp,
          activityCompletedAt: null,
          hasLiveActivity: true,
          hasUnreadActivity,
          lastOutputAt: activityTimestamp,
          lifecycleState: "busy"
        };
      });
      if (!changed) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions
      };
    }
    case "session.activity.clear": {
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
        return {
          ...session,
          activityState: "inactive",
          activityUpdatedAt: cutoffTimestamp !== null ? cutoffTimestamp : normalizeActivityTimestamp(session.lastOutputAt),
          activityCompletedAt: cutoffTimestamp !== null ? cutoffTimestamp : normalizeActivityTimestamp(session.lastOutputAt),
          hasLiveActivity: false,
          lifecycleState: deriveSessionLifecycleState(session.state, {
            ...session,
            hasLiveActivity: false,
            activityState: "inactive",
            activityCompletedAt: cutoffTimestamp !== null ? cutoffTimestamp : normalizeActivityTimestamp(session.lastOutputAt)
          })
        };
      });
      if (!changed) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions
      };
    }
    case "session.interpretation.apply": {
      const sessionId = normalizeText(action.sessionId);
      if (!sessionId || !Array.isArray(action.actions) || action.actions.length === 0) {
        return runtimeState;
      }
      let changed = false;
      const nextSessions = runtimeState.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }
        let nextSession = session;
        for (const interpretationAction of action.actions) {
          nextSession = applyInterpretationAction(nextSession, interpretationAction);
        }
        if (nextSession !== session) {
          changed = true;
          return withSessionActivityDefaults(nextSession);
        }
        return session;
      });
      if (!changed) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessions: nextSessions
      };
    }
    case "connection.set": {
      const connectionState = normalizeText(action.connectionState) || DEFAULT_CONNECTION_STATE;
      if (runtimeState.connectionState === connectionState) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        connectionState
      };
    }
    case "decks.replace": {
      const nextDecks = sortDecks(Array.isArray(action.decks) ? action.decks.filter((deck) => normalizeText(deck?.id)) : []);
      const preferredActiveDeckId = normalizeText(action.preferredActiveDeckId) || runtimeState.activeDeckId;
      const nextActiveDeckId = resolveActiveDeckId(nextDecks, preferredActiveDeckId, defaultDeckId);
      return {
        ...runtimeState,
        decks: nextDecks,
        activeDeckId: nextActiveDeckId
      };
    }
    case "deck.upsert": {
      const nextDeck = action.deck;
      const deckId = normalizeText(nextDeck?.id);
      if (!deckId) {
        return runtimeState;
      }
      const nextDecks = runtimeState.decks.filter((deck) => deck.id !== deckId);
      nextDecks.push(nextDeck);
      return reduceRuntimeState(
        runtimeState,
        {
          type: "decks.replace",
          decks: nextDecks,
          preferredActiveDeckId: normalizeText(action.preferredActiveDeckId) || runtimeState.activeDeckId || deckId
        },
        { defaultDeckId }
      );
    }
    case "deck.remove": {
      const deckId = normalizeText(action.deckId);
      if (!deckId) {
        return runtimeState;
      }
      const nextDecks = runtimeState.decks.filter((deck) => deck.id !== deckId);
      if (nextDecks.length === runtimeState.decks.length) {
        return runtimeState;
      }
      const preferredActiveDeckId =
        normalizeText(action.preferredActiveDeckId) ||
        (runtimeState.activeDeckId === deckId ? normalizeText(action.fallbackDeckId) || defaultDeckId : runtimeState.activeDeckId);
      return reduceRuntimeState(
        runtimeState,
        {
          type: "decks.replace",
          decks: nextDecks,
          preferredActiveDeckId
        },
        { defaultDeckId }
      );
    }
    case "deck.active.set": {
      const deckId = normalizeText(action.deckId);
      if (!deckId || !runtimeState.decks.some((deck) => deck.id === deckId)) {
        return runtimeState;
      }
      if (runtimeState.activeDeckId === deckId) {
        return runtimeState;
      }
      const activeInDeck =
        runtimeState.activeSessionId &&
        runtimeState.sessions.some((session) => session.id === runtimeState.activeSessionId && getSessionDeckId(session, defaultDeckId) === deckId);
      const nextActiveSessionId = activeInDeck
        ? runtimeState.activeSessionId
        : runtimeState.sessions.find((session) => getSessionDeckId(session, defaultDeckId) === deckId)?.id || null;
      return {
        ...runtimeState,
        sessions: runtimeState.sessions.map((session) =>
          session.id === nextActiveSessionId ? { ...session, hasUnreadActivity: false } : session
        ),
        activeDeckId: deckId,
        activeSessionId: nextActiveSessionId
      };
    }
    case "commands.replace": {
      const nextCommands = [];
      const seen = new Set();
      for (const command of Array.isArray(action.commands) ? action.commands : []) {
        const normalized = normalizeCustomCommandRecord(command);
        if (!normalized || seen.has(normalized.name)) {
          continue;
        }
        seen.add(normalized.name);
        nextCommands.push(normalized);
      }
      nextCommands.sort((left, right) => left.name.localeCompare(right.name, "en-US", { sensitivity: "base" }));
      return {
        ...runtimeState,
        customCommands: nextCommands
      };
    }
    case "command.upsert": {
      const normalized = normalizeCustomCommandRecord(action.command);
      if (!normalized) {
        return runtimeState;
      }
      const nextCommands = runtimeState.customCommands.filter((entry) => entry.name !== normalized.name);
      nextCommands.push(normalized);
      nextCommands.sort((left, right) => left.name.localeCompare(right.name, "en-US", { sensitivity: "base" }));
      return {
        ...runtimeState,
        customCommands: nextCommands
      };
    }
    case "command.remove": {
      const name = normalizeCustomCommandName(action.name);
      if (!name) {
        return runtimeState;
      }
      const nextCommands = runtimeState.customCommands.filter((entry) => entry.name !== name);
      if (nextCommands.length === runtimeState.customCommands.length) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        customCommands: nextCommands
      };
    }
    case "filter.set": {
      const sessionFilterText = normalizeSessionFilterText(action.value);
      if (runtimeState.sessionFilterText === sessionFilterText) {
        return runtimeState;
      }
      return {
        ...runtimeState,
        sessionFilterText
      };
    }
    default:
      return runtimeState;
  }
}

export function createStore(options = {}) {
  let state = createInitialRuntimeState(options);
  const listeners = new Set();
  const defaultDeckId = normalizeText(options.defaultDeckId) || DEFAULT_DECK_ID;

  function publish() {
    const snapshot = createStateSnapshot(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function dispatch(action) {
    const nextState = reduceRuntimeState(state, action, { defaultDeckId });
    if (nextState === state) {
      return state;
    }
    state = nextState;
    publish();
    return state;
  }

  return {
    getState() {
      return createStateSnapshot(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrateRuntimePreferences(preferences) {
      dispatch({
        type: "preferences.hydrate",
        activeDeckId: preferences?.activeDeckId,
        sessionFilterText: preferences?.sessionFilterText
      });
    },
    setSessions(sessions) {
      dispatch({ type: "sessions.replace", sessions });
    },
    upsertSession(session) {
      dispatch({ type: "session.upsert", session });
    },
    markSessionExited(sessionId, exitDetails = {}) {
      dispatch({
        type: "session.exit",
        sessionId,
        exitCode: exitDetails.exitCode,
        signal: exitDetails.signal,
        exitedAt: exitDetails.exitedAt,
        updatedAt: exitDetails.updatedAt
      });
    },
    removeSession(sessionId) {
      dispatch({ type: "session.remove", sessionId });
    },
    markSessionClosed(sessionId) {
      dispatch({ type: "session.close", sessionId });
    },
    setActiveSession(sessionId) {
      dispatch({ type: "session.active.set", sessionId });
    },
    markSessionActivity(sessionId, options = {}) {
      dispatch({
        type: "session.activity.bump",
        sessionId,
        timestamp: options.timestamp
      });
    },
    clearSessionActivity(sessionId, options = {}) {
      dispatch({
        type: "session.activity.clear",
        sessionId,
        timestamp: options.timestamp
      });
    },
    setConnectionState(connectionState) {
      dispatch({ type: "connection.set", connectionState });
    },
    setDecks(decks, options = {}) {
      dispatch({
        type: "decks.replace",
        decks,
        preferredActiveDeckId: options.preferredActiveDeckId
      });
    },
    upsertDeck(deck, options = {}) {
      dispatch({
        type: "deck.upsert",
        deck,
        preferredActiveDeckId: options.preferredActiveDeckId
      });
    },
    removeDeck(deckId, options = {}) {
      dispatch({
        type: "deck.remove",
        deckId,
        preferredActiveDeckId: options.preferredActiveDeckId,
        fallbackDeckId: options.fallbackDeckId
      });
    },
    setActiveDeck(deckId) {
      const previous = state;
      dispatch({ type: "deck.active.set", deckId });
      return previous !== state;
    },
    listCustomCommands() {
      return state.customCommands.slice();
    },
    getCustomCommand(name) {
      const normalizedName = normalizeCustomCommandName(name);
      if (!normalizedName) {
        return null;
      }
      return state.customCommands.find((command) => command.name === normalizedName) || null;
    },
    replaceCustomCommands(commands) {
      dispatch({ type: "commands.replace", commands });
    },
    upsertCustomCommand(command) {
      const before = state.customCommands;
      dispatch({ type: "command.upsert", command });
      const normalizedName = normalizeCustomCommandName(command?.name);
      if (!normalizedName) {
        return null;
      }
      if (before === state.customCommands) {
        return this.getCustomCommand(normalizedName);
      }
      return this.getCustomCommand(normalizedName);
    },
    removeCustomCommand(name) {
      const beforeLength = state.customCommands.length;
      dispatch({ type: "command.remove", name });
      return state.customCommands.length !== beforeLength;
    },
    setSessionFilterText(value) {
      dispatch({ type: "filter.set", value });
    },
    applySessionInterpretationActions(sessionId, actions) {
      dispatch({ type: "session.interpretation.apply", sessionId, actions });
    }
  };
}
