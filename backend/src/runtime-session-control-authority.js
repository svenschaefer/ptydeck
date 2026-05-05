import { ApiError } from "./errors.js";

function readRequestedClientId(req, headerName) {
  const headerValue = req?.headers?.[headerName];
  return Array.isArray(headerValue)
    ? String(headerValue[0] || "").trim()
    : typeof headerValue === "string"
      ? headerValue.trim()
      : "";
}

function createControllerClientRequiredError() {
  return new ApiError(
    409,
    "ControllerClientRequired",
    "This action requires an active attached session client. Reconnect the session UI and retry."
  );
}

function createControlDeniedError(message) {
  return new ApiError(403, "ControlDenied", message);
}

export function createRuntimeSessionControlAuthority(dependencies = {}) {
  const {
    sessionControlAttachmentRegistry = {
      listEntries: () => [],
      findActiveAttachment: () => null,
      updateAttachmentLabel: () => null,
      forgetAttachment: () => {}
    },
    sessionControlStates = new Map(),
    sessionControlClientIdHeader = "x-ptydeck-client-id",
    createSessionControlPrincipal = () => null,
    sessionControlPrincipalsMatch = () => false,
    buildSessionControlStateView = () => ({ attachedClients: [], currentController: null }),
    normalizeSessionControlState = (state) => state,
    setSessionControllerClient = (state, clientId, options = {}) => ({
      ...(state && typeof state === "object" ? state : {}),
      controllerClientId: clientId,
      allowAutoAssign: options.allowAutoAssign !== false
    }),
    updateSessionControlLastInput = (state) => state,
    normalizeSessionControlClientLabel = (label) => String(label || "").trim(),
    getSessionControlState = () => ({
      owner: null,
      controllerClientId: null,
      controllerChangedAt: 0,
      allowAutoAssign: true
    }),
    resolveSessionControlModel = () => null,
    isSessionVisibleToAuth = () => true,
    getApiSessionOrThrow = () => {
      throw new ApiError(404, "SessionNotFound", "Session not found.");
    },
    listSessionIdsForAuth = () => [],
    getDeckOrThrow = () => null,
    resolveSessionDeckId = () => "",
    broadcastSessionUpdated = () => {}
  } = dependencies;

  function listAttachedClientsForSession(sessionId, sessionModel = null) {
    const model = sessionModel || resolveSessionControlModel(sessionId);
    if (!model) {
      return [];
    }
    const attachedClients = [];
    for (const entry of sessionControlAttachmentRegistry.listEntries()) {
      if (!entry?.client) {
        continue;
      }
      if (!isSessionVisibleToAuth(model, entry.auth || null)) {
        continue;
      }
      attachedClients.push(entry.client);
    }
    return attachedClients;
  }

  function findAttachedClientForSession(sessionId, clientId, auth = null, options = {}) {
    const normalizedClientId = typeof clientId === "string" ? clientId.trim() : "";
    if (!normalizedClientId) {
      return null;
    }
    const requestPrincipal = createSessionControlPrincipal(auth);
    const activeOnly = options.activeOnly === true;
    return (
      listAttachedClientsForSession(sessionId).find((entry) => {
        if (entry.clientId !== normalizedClientId) {
          return false;
        }
        if (!sessionControlPrincipalsMatch(entry, requestPrincipal)) {
          return false;
        }
        if (activeOnly && entry.active !== true) {
          return false;
        }
        return true;
      }) || null
    );
  }

  function buildApiSessionControlState(sessionId, sessionModel = null) {
    const controlState = getSessionControlState(sessionId);
    return buildSessionControlStateView(controlState, listAttachedClientsForSession(sessionId, sessionModel));
  }

  function withPersistedSessionControlState(session, fallbackOwner = null) {
    return {
      ...session,
      controlState: { ...getSessionControlState(session.id, fallbackOwner) }
    };
  }

  function reconcileSessionControllerForSession(sessionId) {
    const sessionModel = resolveSessionControlModel(sessionId);
    if (!sessionModel) {
      return false;
    }
    const currentState = getSessionControlState(sessionId);
    const attachedClients = listAttachedClientsForSession(sessionId, sessionModel);
    const activeAttachedClients = attachedClients.filter((entry) => entry.active === true);
    const activeOperatorClients = activeAttachedClients.filter((entry) => entry.accessMode !== "spectator");
    let nextState = currentState;
    if (
      nextState.controllerClientId &&
      !attachedClients.some((entry) => entry.clientId === nextState.controllerClientId)
    ) {
      nextState = setSessionControllerClient(nextState, null);
    }
    if (!nextState.controllerClientId && nextState.allowAutoAssign !== false) {
      const ownerClient = activeOperatorClients.find((entry) => sessionControlPrincipalsMatch(entry, nextState.owner));
      if (ownerClient) {
        nextState = setSessionControllerClient(nextState, ownerClient.clientId, { allowAutoAssign: true });
      } else if (activeOperatorClients.length > 0) {
        nextState = setSessionControllerClient(nextState, activeOperatorClients[0].clientId, { allowAutoAssign: true });
      }
    }
    if (!nextState.controllerClientId && attachedClients.length === 0 && nextState.allowAutoAssign === false) {
      nextState = setSessionControllerClient(nextState, null, { allowAutoAssign: true });
    }
    if (
      nextState.controllerClientId === currentState.controllerClientId &&
      nextState.controllerChangedAt === currentState.controllerChangedAt &&
      nextState.allowAutoAssign === currentState.allowAutoAssign
    ) {
      return false;
    }
    sessionControlStates.set(sessionId, nextState);
    return true;
  }

  function broadcastSessionControlRefreshForAuth(auth = null, traceSeed = null) {
    for (const sessionId of listSessionIdsForAuth(auth)) {
      reconcileSessionControllerForSession(sessionId);
      broadcastSessionUpdated(sessionId, {
        ...(traceSeed && typeof traceSeed === "object" ? traceSeed : {}),
        sessionId
      });
    }
  }

  function resolveSessionControlClientId(req, sessionId, auth = null) {
    const requestedClientId = readRequestedClientId(req, sessionControlClientIdHeader);
    if (!requestedClientId) {
      return null;
    }
    return findAttachedClientForSession(sessionId, requestedClientId, auth, { activeOnly: true }) ? requestedClientId : null;
  }

  function recordSessionLastInput(sessionId, auth = null, req = null) {
    const nextState = updateSessionControlLastInput(getSessionControlState(sessionId), {
      principal: createSessionControlPrincipal(auth),
      clientId: resolveSessionControlClientId(req, sessionId, auth)
    });
    sessionControlStates.set(sessionId, nextState);
    return nextState;
  }

  function findActiveSessionControlAttachment(auth = null, clientId = "") {
    return sessionControlAttachmentRegistry.findActiveAttachment(auth, clientId);
  }

  function requireActiveSessionControlAttachment(auth = null, req = null) {
    const requestedClientId = readRequestedClientId(req, sessionControlClientIdHeader);
    if (!requestedClientId) {
      throw createControllerClientRequiredError();
    }
    const attachedClient = findActiveSessionControlAttachment(auth, requestedClientId);
    if (!attachedClient) {
      throw createControllerClientRequiredError();
    }
    return attachedClient;
  }

  function requireSessionControlRequestClient(sessionId, auth = null, req = null) {
    const requestClient = requireActiveSessionControlAttachment(auth, req);
    const attachedClient = findAttachedClientForSession(sessionId, requestClient.clientId, auth, { activeOnly: true });
    if (!attachedClient) {
      throw createControllerClientRequiredError();
    }
    return attachedClient;
  }

  function requireOperatorSessionControlRequestClient(sessionId, auth = null, req = null) {
    const requestClient = requireSessionControlRequestClient(sessionId, auth, req);
    if (requestClient.accessMode === "spectator") {
      throw createControlDeniedError("Read-only spectator clients cannot modify trusted-local device attachments.");
    }
    return requestClient;
  }

  function requireOperatorSessionControlAttachment(auth = null, req = null) {
    const requestClient = requireActiveSessionControlAttachment(auth, req);
    if (requestClient.accessMode === "spectator") {
      throw createControlDeniedError("Read-only spectator clients cannot modify trusted-local device attachments.");
    }
    return requestClient;
  }

  function getSessionControlViewOrThrow(sessionId, auth = null) {
    getApiSessionOrThrow(sessionId, auth);
    reconcileSessionControllerForSession(sessionId);
    return buildApiSessionControlState(sessionId);
  }

  function ensureSessionControllerAccess(sessionId, auth = null, req = null, actionLabel = "write to this session") {
    const controlView = getSessionControlViewOrThrow(sessionId, auth);
    const attachedClients = Array.isArray(controlView.attachedClients) ? controlView.attachedClients : [];
    const canUseImplicitOwnerFallback =
      !controlView.currentController &&
      attachedClients.every((entry) => entry?.accessMode === "spectator");
    if (canUseImplicitOwnerFallback) {
      if (!sessionControlPrincipalsMatch(createSessionControlPrincipal(auth), controlView.owner)) {
        throw createControlDeniedError(`Only the active controller may ${actionLabel}.`);
      }
      return {
        requestClient: null,
        controlView
      };
    }
    const requestClient = requireSessionControlRequestClient(sessionId, auth, req);
    if (!controlView.currentController) {
      throw new ApiError(409, "NoActiveController", "No client currently holds session control.");
    }
    if (controlView.currentController.clientId !== requestClient.clientId) {
      throw createControlDeniedError(`Only the active controller may ${actionLabel}.`);
    }
    return {
      requestClient,
      controlView
    };
  }

  function ensureMessagingSessionInputAccess(sessionId, actionLabel = "send terminal input through messaging") {
    const controlView = getSessionControlViewOrThrow(sessionId, null);
    const messagingPrincipal = createSessionControlPrincipal(null);
    if (!sessionControlPrincipalsMatch(messagingPrincipal, controlView.owner)) {
      throw createControlDeniedError(`Only the session owner may ${actionLabel}.`);
    }
    return {
      requestClient: null,
      controlView
    };
  }

  function updateSessionControlStateAndBroadcast(sessionId, nextState, traceSeed = null) {
    sessionControlStates.set(sessionId, normalizeSessionControlState(nextState, {
      fallbackOwner: getSessionControlState(sessionId).owner
    }));
    broadcastSessionUpdated(sessionId, {
      ...(traceSeed && typeof traceSeed === "object" ? traceSeed : {}),
      sessionId
    });
    return buildApiSessionControlState(sessionId);
  }

  function takeSessionControlOrThrow(sessionId, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlRequestClient(sessionId, auth, req);
    const currentState = getSessionControlState(sessionId);
    return updateSessionControlStateAndBroadcast(
      sessionId,
      setSessionControllerClient(currentState, requestClient.clientId, { allowAutoAssign: true }),
      traceSeed
    );
  }

  function releaseSessionControlOrThrow(sessionId, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlRequestClient(sessionId, auth, req);
    const currentState = getSessionControlState(sessionId);
    const controlView = getSessionControlViewOrThrow(sessionId, auth);
    const isOwnerClient = sessionControlPrincipalsMatch(requestClient, currentState.owner);
    const isCurrentController = controlView.currentController?.clientId === requestClient.clientId;
    if (!isOwnerClient && !isCurrentController) {
      throw createControlDeniedError("Only the owner or active controller can release session control.");
    }
    return updateSessionControlStateAndBroadcast(
      sessionId,
      setSessionControllerClient(currentState, null, { allowAutoAssign: false }),
      traceSeed
    );
  }

  function transferSessionControlOrThrow(sessionId, targetClientId, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlRequestClient(sessionId, auth, req);
    const normalizedTargetClientId = String(targetClientId || "").trim();
    if (!normalizedTargetClientId) {
      throw new ApiError(400, "ValidationError", "Field 'clientId' must be a non-empty string.");
    }
    const currentState = getSessionControlState(sessionId);
    const controlView = getSessionControlViewOrThrow(sessionId, auth);
    const isOwnerClient = sessionControlPrincipalsMatch(requestClient, currentState.owner);
    const isCurrentController = controlView.currentController?.clientId === requestClient.clientId;
    if (!isOwnerClient && !isCurrentController) {
      throw createControlDeniedError("Only the owner or active controller can transfer session control.");
    }
    const targetClient =
      listAttachedClientsForSession(sessionId).find(
        (entry) => entry.clientId === normalizedTargetClientId && entry.active === true
      ) || null;
    if (!targetClient) {
      throw new ApiError(
        409,
        "ControlTransferTargetNotAttached",
        "The target client is not actively attached to this session."
      );
    }
    return updateSessionControlStateAndBroadcast(
      sessionId,
      setSessionControllerClient(currentState, targetClient.clientId, { allowAutoAssign: true }),
      traceSeed
    );
  }

  function renameSessionControlClientOrThrow(sessionId, label, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlRequestClient(sessionId, auth, req);
    const nextLabel = normalizeSessionControlClientLabel(label);
    if (!nextLabel) {
      throw new ApiError(400, "ValidationError", "Field 'label' must be a non-empty string.");
    }
    const renamedClient = sessionControlAttachmentRegistry.updateAttachmentLabel(auth, requestClient.clientId, nextLabel);
    if (!renamedClient || renamedClient.active !== true) {
      throw createControllerClientRequiredError();
    }
    broadcastSessionControlRefreshForAuth(auth, traceSeed);
    return getSessionControlViewOrThrow(sessionId, auth);
  }

  function forgetSessionControlClientOrThrow(sessionId, targetClientId, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlRequestClient(sessionId, auth, req);
    const normalizedTargetClientId = String(targetClientId || "").trim();
    if (!normalizedTargetClientId) {
      throw new ApiError(400, "ValidationError", "Field 'clientId' must be a non-empty string.");
    }
    if (normalizedTargetClientId === requestClient.clientId) {
      throw new ApiError(409, "ControlAttachmentActive", "This device is still attached and cannot be forgotten.");
    }
    const targetClient = findAttachedClientForSession(sessionId, normalizedTargetClientId, auth);
    if (!targetClient) {
      throw new ApiError(409, "ControlTransferTargetNotAttached", "The target client is not attached to this session.");
    }
    if (targetClient.active === true || targetClient.activeConnectionCount > 0) {
      throw new ApiError(409, "ControlAttachmentActive", "Only stale offline devices can be forgotten.");
    }
    sessionControlAttachmentRegistry.forgetAttachment(auth, normalizedTargetClientId);
    broadcastSessionControlRefreshForAuth(auth, traceSeed);
    return getSessionControlViewOrThrow(sessionId, auth);
  }

  function listClaimableSessionIdsForScope(scope, options = {}, auth = null) {
    const normalizedScope = typeof scope === "string" ? scope.trim().toLowerCase() : "";
    if (normalizedScope === "all") {
      return listSessionIdsForAuth(auth);
    }
    if (normalizedScope === "deck") {
      const normalizedDeckId = typeof options.deckId === "string" ? options.deckId.trim() : "";
      if (!normalizedDeckId) {
        throw new ApiError(400, "ValidationError", "Field 'deckId' is required when scope is 'deck'.");
      }
      getDeckOrThrow(normalizedDeckId, auth);
      return listSessionIdsForAuth(auth).filter((sessionId) => resolveSessionDeckId(sessionId) === normalizedDeckId);
    }
    if (normalizedScope === "session") {
      const normalizedSessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
      if (!normalizedSessionId) {
        throw new ApiError(400, "ValidationError", "Field 'sessionId' is required when scope is 'session'.");
      }
      getApiSessionOrThrow(normalizedSessionId, auth);
      return [normalizedSessionId];
    }
    throw new ApiError(400, "ValidationError", "Field 'scope' must be one of: all, deck, session.");
  }

  function takeSessionControlScopeOrThrow(scope, options = {}, auth = null, req = null, traceSeed = null) {
    const requestClient = requireOperatorSessionControlAttachment(auth, req);
    const targetSessionIds = listClaimableSessionIdsForScope(scope, options, auth);
    const updatedSessions = [];
    for (const sessionId of targetSessionIds) {
      const currentState = getSessionControlState(sessionId);
      const updatedControlState = setSessionControllerClient(currentState, requestClient.clientId, { allowAutoAssign: true });
      sessionControlStates.set(sessionId, normalizeSessionControlState(updatedControlState, {
        fallbackOwner: currentState.owner
      }));
      broadcastSessionUpdated(sessionId, {
        ...(traceSeed && typeof traceSeed === "object" ? traceSeed : {}),
        sessionId
      });
      updatedSessions.push(getApiSessionOrThrow(sessionId, auth));
    }
    return {
      scope: typeof scope === "string" ? scope.trim().toLowerCase() : "",
      deckId: typeof options.deckId === "string" ? options.deckId.trim() : "",
      sessionId: typeof options.sessionId === "string" ? options.sessionId.trim() : "",
      controllerClientId: requestClient.clientId,
      updatedSessions
    };
  }

  return {
    broadcastSessionControlRefreshForAuth,
    buildApiSessionControlState,
    ensureMessagingSessionInputAccess,
    ensureSessionControllerAccess,
    findActiveSessionControlAttachment,
    findAttachedClientForSession,
    forgetSessionControlClientOrThrow,
    getSessionControlViewOrThrow,
    listAttachedClientsForSession,
    listClaimableSessionIdsForScope,
    recordSessionLastInput,
    reconcileSessionControllerForSession,
    releaseSessionControlOrThrow,
    renameSessionControlClientOrThrow,
    requireActiveSessionControlAttachment,
    requireOperatorSessionControlAttachment,
    requireOperatorSessionControlRequestClient,
    requireSessionControlRequestClient,
    resolveSessionControlClientId,
    takeSessionControlOrThrow,
    takeSessionControlScopeOrThrow,
    transferSessionControlOrThrow,
    updateSessionControlStateAndBroadcast,
    withPersistedSessionControlState
  };
}
