function normalizeText(value) {
  return String(value || "").trim();
}

function clonePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeBadge(badge, pluginId) {
  if (!badge || typeof badge !== "object" || Array.isArray(badge)) {
    return null;
  }
  const id = normalizeText(badge.id || badge.text).toLowerCase();
  const text = normalizeText(badge.text);
  if (!id || !text) {
    return null;
  }
  return {
    id,
    text,
    tone: normalizeText(badge.tone).toLowerCase() || "info",
    pluginId
  };
}

function normalizeArtifact(artifact, pluginId) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return null;
  }
  const id = normalizeText(artifact.id || artifact.title || artifact.kind).toLowerCase();
  const kind = normalizeText(artifact.kind).toLowerCase();
  if (!id || !kind) {
    return null;
  }
  return {
    id,
    kind,
    title: normalizeText(artifact.title),
    text: typeof artifact.text === "string" ? artifact.text : "",
    createdAt: Number.isFinite(artifact.createdAt) ? Number(artifact.createdAt) : Date.now(),
    pluginId,
    data: clonePlainObject(artifact.data)
  };
}

function normalizeNotification(notification, pluginId) {
  if (!notification || typeof notification !== "object" || Array.isArray(notification)) {
    return null;
  }
  const message = normalizeText(notification.message);
  if (!message) {
    return null;
  }
  return {
    id: normalizeText(notification.id).toLowerCase() || `note-${Date.now()}`,
    level: normalizeText(notification.level).toLowerCase() || "info",
    message,
    createdAt: Number.isFinite(notification.createdAt) ? Number(notification.createdAt) : Date.now(),
    pluginId,
    data: clonePlainObject(notification.data)
  };
}

export function normalizeStreamInterpretationAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("Interpretation action must be an object.");
  }
  const type = normalizeText(action.type);
  const pluginId = normalizeText(action.pluginId);
  switch (type) {
    case "setSessionState":
      return { type, value: normalizeText(action.value).toLowerCase(), pluginId };
    case "setSessionStatus":
      return { type, value: typeof action.value === "string" ? action.value.trim() : "", pluginId };
    case "markSessionAttention":
      return { type, active: action.active === true, pluginId };
    case "setSessionBadges":
      return {
        type,
        badges: Array.isArray(action.badges)
          ? action.badges.map((badge) => normalizeBadge(badge, pluginId)).filter(Boolean)
          : [],
        pluginId
      };
    case "mergeSessionMeta":
      return { type, patch: clonePlainObject(action.patch), pluginId };
    case "setSessionTags":
      return {
        type,
        tags: Array.isArray(action.tags)
          ? action.tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean)
          : [],
        pluginId
      };
    case "upsertSessionArtifact": {
      const artifact = normalizeArtifact(action.artifact, pluginId);
      if (!artifact) {
        throw new Error("upsertSessionArtifact requires a valid artifact.");
      }
      return { type, artifact, pluginId };
    }
    case "removeSessionArtifact":
      return { type, artifactId: normalizeText(action.artifactId).toLowerCase(), pluginId };
    case "pushSessionNotification": {
      const notification = normalizeNotification(action.notification, pluginId);
      if (!notification) {
        throw new Error("pushSessionNotification requires a valid notification.");
      }
      return { type, notification, pluginId };
    }
    default:
      throw new Error(`Unsupported interpretation action type: ${type || "<empty>"}`);
  }
}

export function createStreamActionDispatcher(options = {}) {
  const store = options.store;
  const onError = typeof options.onError === "function" ? options.onError : () => {};

  if (!store || typeof store.applySessionInterpretationActions !== "function") {
    throw new Error("createStreamActionDispatcher requires a store with applySessionInterpretationActions().");
  }

  function dispatch(sessionId, actions, meta = {}) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId || !Array.isArray(actions) || actions.length === 0) {
      return [];
    }
    const normalizedActions = [];
    for (const action of actions) {
      try {
        normalizedActions.push(normalizeStreamInterpretationAction(action));
      } catch (error) {
        onError({
          sessionId: normalizedSessionId,
          action,
          meta,
          error
        });
      }
    }
    if (normalizedActions.length === 0) {
      return [];
    }
    store.applySessionInterpretationActions(normalizedSessionId, normalizedActions);
    return normalizedActions;
  }

  return {
    dispatch
  };
}
