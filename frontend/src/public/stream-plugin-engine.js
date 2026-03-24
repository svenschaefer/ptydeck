function normalizeText(value) {
  return String(value || "").trim();
}

function clonePlainRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }
  return { ...record };
}

function freezeSessionContext(session, sessionId) {
  const source = session && typeof session === "object" ? session : {};
  const context = {
    id: normalizeText(source.id || sessionId),
    deckId: normalizeText(source.deckId),
    name: typeof source.name === "string" ? source.name : "",
    state: normalizeText(source.state),
    lifecycleState: normalizeText(source.lifecycleState),
    cwd: typeof source.cwd === "string" ? source.cwd : "",
    tags: Array.isArray(source.tags) ? source.tags.map((value) => String(value)) : [],
    meta: clonePlainRecord(source.meta)
  };
  Object.freeze(context.tags);
  Object.freeze(context.meta);
  return Object.freeze(context);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneAction(action, pluginId) {
  if (!isPlainObject(action)) {
    throw new Error(`Plugin ${pluginId} emitted a non-object action.`);
  }
  const type = normalizeText(action.type);
  if (!type) {
    throw new Error(`Plugin ${pluginId} emitted an action without a type.`);
  }
  return Object.freeze({
    ...action,
    type,
    pluginId: normalizeText(action.pluginId) || pluginId
  });
}

function normalizePlugin(plugin, registrationIndex) {
  if (!isPlainObject(plugin)) {
    throw new Error("Stream plugin must be an object.");
  }
  const id = normalizeText(plugin.id);
  if (!id) {
    throw new Error("Stream plugin id is required.");
  }
  const priority = Number.isFinite(plugin.priority) ? Number(plugin.priority) : 0;
  const normalized = {
    id,
    priority,
    registrationIndex,
    onSessionStart: typeof plugin.onSessionStart === "function" ? plugin.onSessionStart : null,
    onSessionDispose: typeof plugin.onSessionDispose === "function" ? plugin.onSessionDispose : null,
    onData: typeof plugin.onData === "function" ? plugin.onData : null,
    onLine: typeof plugin.onLine === "function" ? plugin.onLine : null,
    onIdle: typeof plugin.onIdle === "function" ? plugin.onIdle : null
  };
  return Object.freeze(normalized);
}

function normalizeHookResult(result, pluginId) {
  if (result == null) {
    return [];
  }
  if (!Array.isArray(result)) {
    throw new Error(`Plugin ${pluginId} must return an array of actions or null.`);
  }
  return result.map((action) => cloneAction(action, pluginId));
}

function resolveActionConflicts(actions, sessionId) {
  const resolvedByKey = new Map();
  actions.forEach((action, index) => {
    const conflictKey = normalizeText(action.conflictKey) || action.type;
    resolvedByKey.set(`${sessionId}::${conflictKey}`, { action, index });
  });
  return Array.from(resolvedByKey.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.action);
}

export function createStreamPluginEngine(options = {}) {
  const pluginRegistry = [];
  const sessionContexts = new Map();
  const getSession =
    typeof options.getSession === "function" ? options.getSession : () => null;
  const onActions =
    typeof options.onActions === "function" ? options.onActions : () => {};
  const onPluginError =
    typeof options.onPluginError === "function" ? options.onPluginError : () => {};
  let nextRegistrationIndex = 0;

  function listPlugins() {
    return pluginRegistry.slice();
  }

  function sortRegistry() {
    pluginRegistry.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.registrationIndex - right.registrationIndex;
    });
  }

  function registerPlugin(plugin) {
    const normalized = normalizePlugin(plugin, nextRegistrationIndex);
    nextRegistrationIndex += 1;
    if (pluginRegistry.some((entry) => entry.id === normalized.id)) {
      throw new Error(`Duplicate stream plugin id: ${normalized.id}`);
    }
    pluginRegistry.push(normalized);
    sortRegistry();
    return normalized;
  }

  function replacePlugins(plugins) {
    pluginRegistry.length = 0;
    nextRegistrationIndex = 0;
    for (const plugin of Array.isArray(plugins) ? plugins : []) {
      registerPlugin(plugin);
    }
    return listPlugins();
  }

  function getOrCreateSessionContext(sessionId, sessionOverride) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return null;
    }
    const latestSession = sessionOverride || getSession(normalizedSessionId) || { id: normalizedSessionId };
    const nextContext = freezeSessionContext(latestSession, normalizedSessionId);
    sessionContexts.set(normalizedSessionId, nextContext);
    return nextContext;
  }

  function ensureSession(sessionOrId) {
    const sessionId =
      typeof sessionOrId === "string" ? sessionOrId : normalizeText(sessionOrId?.id);
    const sessionContext = getOrCreateSessionContext(sessionId, sessionOrId);
    if (!sessionContext) {
      return null;
    }
    for (const plugin of pluginRegistry) {
      if (!plugin.onSessionStart) {
        continue;
      }
      try {
        plugin.onSessionStart(sessionContext);
      } catch (error) {
        onPluginError({
          pluginId: plugin.id,
          hook: "onSessionStart",
          sessionId: sessionContext.id,
          error
        });
      }
    }
    return sessionContext;
  }

  function disposeSession(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return;
    }
    const sessionContext = sessionContexts.get(normalizedSessionId) || freezeSessionContext({ id: normalizedSessionId }, normalizedSessionId);
    for (const plugin of pluginRegistry) {
      if (!plugin.onSessionDispose) {
        continue;
      }
      try {
        plugin.onSessionDispose(sessionContext);
      } catch (error) {
        onPluginError({
          pluginId: plugin.id,
          hook: "onSessionDispose",
          sessionId: normalizedSessionId,
          error
        });
      }
    }
    sessionContexts.delete(normalizedSessionId);
  }

  function dispatchHook(hookName, sessionId, payload, sessionOverride) {
    const sessionContext = getOrCreateSessionContext(sessionId, sessionOverride);
    if (!sessionContext) {
      return [];
    }
    const collectedActions = [];
    for (const plugin of pluginRegistry) {
      const hook = plugin[hookName];
      if (!hook) {
        continue;
      }
      try {
        const nextActions = normalizeHookResult(hook(sessionContext, payload), plugin.id);
        collectedActions.push(...nextActions);
      } catch (error) {
        onPluginError({
          pluginId: plugin.id,
          hook: hookName,
          sessionId: sessionContext.id,
          error
        });
      }
    }
    const resolvedActions = resolveActionConflicts(collectedActions, sessionContext.id);
    if (resolvedActions.length > 0) {
      onActions(sessionContext.id, resolvedActions, {
        hook: hookName,
        session: sessionContext
      });
    }
    return resolvedActions;
  }

  return {
    listPlugins,
    registerPlugin,
    replacePlugins,
    ensureSession,
    disposeSession,
    handleData(sessionId, chunk, sessionOverride) {
      return dispatchHook("onData", sessionId, String(chunk || ""), sessionOverride);
    },
    handleLine(sessionId, line, sessionOverride) {
      return dispatchHook("onLine", sessionId, String(line || ""), sessionOverride);
    },
    handleIdle(sessionId, sessionOverride) {
      return dispatchHook("onIdle", sessionId, null, sessionOverride);
    }
  };
}
