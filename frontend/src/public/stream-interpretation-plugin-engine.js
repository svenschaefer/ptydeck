export const SESSION_INTERPRETATION_ACTION_TYPES = Object.freeze([
  "setSessionState",
  "setSessionStatus",
  "markSessionAttention",
  "setSessionBadges",
  "mergeSessionMeta",
  "setSessionTags",
  "upsertSessionArtifact",
  "removeSessionArtifact",
  "pushSessionNotification"
]);

const SESSION_INTERPRETATION_ACTION_TYPE_SET = new Set(SESSION_INTERPRETATION_ACTION_TYPES);

function normalizeText(value) {
  return String(value || "").trim();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEventTypes(eventTypes) {
  if (!Array.isArray(eventTypes)) {
    return new Set();
  }
  return new Set(eventTypes.map((eventType) => normalizeText(eventType)).filter(Boolean));
}

function normalizePlugin(plugin, index) {
  if (!isRecord(plugin) || typeof plugin.interpret !== "function") {
    return null;
  }
  const id = normalizeText(plugin.id);
  if (!id) {
    return null;
  }
  return {
    id,
    index,
    priority: Number.isFinite(plugin.priority) ? Number(plugin.priority) : 0,
    eventTypes: normalizeEventTypes(plugin.eventTypes),
    interpret: plugin.interpret
  };
}

function comparePlugins(left, right) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return left.index - right.index;
}

function cloneRecordWithPluginId(record, pluginId) {
  if (!isRecord(record)) {
    return record;
  }
  return {
    ...record,
    pluginId: normalizeText(record.pluginId) || pluginId
  };
}

function normalizeInterpretationAction(action, pluginId) {
  if (!isRecord(action)) {
    return null;
  }
  const type = normalizeText(action.type);
  if (!SESSION_INTERPRETATION_ACTION_TYPE_SET.has(type)) {
    return null;
  }
  const nextAction = { ...action, type };
  if (type === "setSessionBadges") {
    nextAction.badges = Array.isArray(action.badges)
      ? action.badges.map((badge) => cloneRecordWithPluginId(badge, pluginId))
      : [];
  }
  if (type === "upsertSessionArtifact") {
    nextAction.artifact = cloneRecordWithPluginId(action.artifact, pluginId);
  }
  if (type === "pushSessionNotification") {
    nextAction.notification = cloneRecordWithPluginId(action.notification, pluginId);
  }
  return nextAction;
}

function normalizeActionBatch(rawBatch, defaultSessionId, pluginId) {
  const sessionId = normalizeText(rawBatch?.sessionId) || defaultSessionId;
  if (!sessionId || !Array.isArray(rawBatch?.actions)) {
    return null;
  }
  const actions = rawBatch.actions
    .map((action) => normalizeInterpretationAction(action, pluginId))
    .filter(Boolean);
  if (actions.length === 0) {
    return null;
  }
  return { sessionId, actions };
}

function normalizePluginResult(result, defaultSessionId, pluginId) {
  if (Array.isArray(result)) {
    const batch = normalizeActionBatch({ sessionId: defaultSessionId, actions: result }, defaultSessionId, pluginId);
    return batch ? [batch] : [];
  }
  if (!isRecord(result)) {
    return [];
  }
  if (Array.isArray(result.batches)) {
    return result.batches
      .map((batch) => normalizeActionBatch(batch, defaultSessionId, pluginId))
      .filter(Boolean);
  }
  const batch = normalizeActionBatch(result, defaultSessionId, pluginId);
  return batch ? [batch] : [];
}

function createPluginError(pluginId, error) {
  return {
    pluginId,
    message: normalizeText(error?.message) || "Stream interpretation plugin failed."
  };
}

function createEventContext(event, options = {}) {
  const eventType = normalizeText(event?.type);
  const sessionId = normalizeText(event?.sessionId || event?.session?.id);
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  return {
    type: eventType,
    event,
    sessionId,
    session: sessionId ? getSessionById(sessionId) : null,
    data: eventType === "session.data" && typeof event?.data === "string" ? event.data : "",
    timestamp: Number.isFinite(options.timestamp) ? Number(options.timestamp) : Date.now()
  };
}

function shouldRunPlugin(plugin, eventType) {
  return plugin.eventTypes.size === 0 || plugin.eventTypes.has(eventType);
}

function mergeBatches(batches, batch) {
  const existing = batches.find((entry) => entry.sessionId === batch.sessionId);
  if (existing) {
    existing.actions.push(...batch.actions);
    return;
  }
  batches.push({
    sessionId: batch.sessionId,
    actions: batch.actions.slice()
  });
}

export function createStreamInterpretationPluginEngine(options = {}) {
  const plugins = [];
  const pluginIds = new Set();

  function registerPlugin(plugin) {
    const normalized = normalizePlugin(plugin, plugins.length);
    if (!normalized || pluginIds.has(normalized.id)) {
      return false;
    }
    pluginIds.add(normalized.id);
    plugins.push(normalized);
    plugins.sort(comparePlugins);
    return true;
  }

  for (const plugin of Array.isArray(options.plugins) ? options.plugins : []) {
    registerPlugin(plugin);
  }

  function listPlugins() {
    return plugins.map((plugin) => ({
      id: plugin.id,
      priority: plugin.priority,
      eventTypes: Array.from(plugin.eventTypes)
    }));
  }

  function interpretRuntimeEvent(event, runtimeOptions = {}) {
    if (!isRecord(event)) {
      return { batches: [], errors: [] };
    }
    const context = createEventContext(event, runtimeOptions);
    if (!context.type) {
      return { batches: [], errors: [] };
    }
    const batches = [];
    const errors = [];
    for (const plugin of plugins) {
      if (!shouldRunPlugin(plugin, context.type)) {
        continue;
      }
      try {
        for (const batch of normalizePluginResult(plugin.interpret(context), context.sessionId, plugin.id)) {
          mergeBatches(batches, batch);
        }
      } catch (error) {
        errors.push(createPluginError(plugin.id, error));
      }
    }
    return { batches, errors };
  }

  return {
    registerPlugin,
    listPlugins,
    interpretRuntimeEvent
  };
}
