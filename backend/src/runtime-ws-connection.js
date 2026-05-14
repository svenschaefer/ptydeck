export function createRuntimeWsConnectionHandler(dependencies = {}) {
  const {
    sockets = new Set(),
    metrics = {},
    wsClientConnections = new Map(),
    logDebug = () => {},
    bumpMetricCounter = () => {},
    createTraceId = () => "ws-connection",
    sessionControlAttachmentRegistry = {
      getAttachmentKey: () => "",
      registerAttachment: () => null,
      unregisterAttachment: () => {}
    },
    normalizeWsDisconnectReason = () => "unknown",
    broadcastSessionControlRefreshForAuth = () => {},
    broadcastSessionControlRefreshForAuthExceptSocket = null,
    listSessionIdsForAuth = () => [],
    reconcileSessionControllerForSession = () => {},
    manager = {
      getSnapshot: () => ({ outputs: [] })
    },
    filterPayloadForAuth = (payload) => payload,
    withTracePayload = (payload) => payload,
    listApiSessions = () => [],
    listCustomCommands = () => [],
    listDecks = () => [],
    getOperatorComposerPlacementState = () => ({
      clientId: "",
      mode: "shared-footer",
      pinnedSessionIds: [],
      sharedDraft: "",
      pinnedDrafts: {}
    }),
    recordWsError = () => {}
  } = dependencies;

  return function handleAcceptedRuntimeWsConnection(ws, { auth: wsAuth, requestContext = {}, upgradeTraceContext = {} } = {}) {
    sockets.add(ws);
    metrics.wsConnectionsOpenedTotal += 1;

    const normalizedClientIp =
      typeof requestContext.clientIp === "string" && requestContext.clientIp ? requestContext.clientIp : "unknown";
    const wsClientState = wsClientConnections.get(normalizedClientIp) || {
      activeConnections: 0,
      acceptedConnections: 0,
      lastDisconnectReason: "none"
    };
    if (wsClientState.acceptedConnections > 0 && wsClientState.activeConnections === 0) {
      metrics.wsReconnectsTotal += 1;
      const reconnectReason =
        typeof wsClientState.lastDisconnectReason === "string" && wsClientState.lastDisconnectReason
          ? wsClientState.lastDisconnectReason
          : "unknown";
      bumpMetricCounter(metrics.wsReconnectsByReason, reconnectReason);
    }
    wsClientState.acceptedConnections += 1;
    wsClientState.activeConnections += 1;
    wsClientConnections.set(normalizedClientIp, wsClientState);

    ws.connectionId = createTraceId("ws");
    ws.traceContext = {
      ...upgradeTraceContext,
      connectionId: ws.connectionId,
      source: "ws"
    };
    ws.clientIp = normalizedClientIp;
    ws.auth = wsAuth;

    const sessionControlClientId =
      typeof wsAuth?.sessionControlClientId === "string" && wsAuth.sessionControlClientId.trim()
        ? wsAuth.sessionControlClientId.trim()
        : ws.connectionId;
    const sessionControlClientLabel = typeof wsAuth?.sessionControlClientLabel === "string" ? wsAuth.sessionControlClientLabel : "";
    ws.sessionControlAttachmentKey = sessionControlAttachmentRegistry.getAttachmentKey({
      clientId: sessionControlClientId,
      auth: wsAuth
    });
    ws.sessionControlClient = sessionControlAttachmentRegistry.registerAttachment({
      clientId: sessionControlClientId,
      label: sessionControlClientLabel,
      auth: wsAuth
    });
    ws.isAlive = true;

    logDebug(
      "ws.upgrade.accepted",
      {
        socketCount: sockets.size,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      },
      ws.traceContext
    );

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("close", (code, reasonBuffer) => {
      sockets.delete(ws);
      sessionControlAttachmentRegistry.unregisterAttachment(ws);
      metrics.wsConnectionsClosedTotal += 1;
      const clientIp = typeof ws.clientIp === "string" ? ws.clientIp : "unknown";
      const clientState = wsClientConnections.get(clientIp);
      const reasonText = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : "";
      const disconnectReason = normalizeWsDisconnectReason(code, reasonText, ws.closeReasonHint);
      bumpMetricCounter(metrics.wsDisconnectsByReason, disconnectReason);
      if (clientState) {
        clientState.activeConnections = Math.max(0, clientState.activeConnections - 1);
        clientState.lastDisconnectReason = disconnectReason;
        wsClientConnections.set(clientIp, clientState);
      }
      logDebug("ws.client.closed", { socketCount: sockets.size }, ws.traceContext || upgradeTraceContext);
      broadcastSessionControlRefreshForAuth(ws.auth || null, ws.traceContext || upgradeTraceContext);
    });

    ws.on("error", () => {
      recordWsError("socket_error");
    });

    for (const sessionId of listSessionIdsForAuth(ws.auth || null)) {
      reconcileSessionControllerForSession(sessionId);
    }

    const snapshot = manager.getSnapshot();
    const snapshotPayload = filterPayloadForAuth(
      withTracePayload(
        {
          type: "snapshot",
          clientId: ws.sessionControlClient?.clientId || sessionControlClientId,
          sessions: listApiSessions(ws.auth || null),
          outputs: snapshot.outputs,
          customCommands: listCustomCommands(),
          decks: listDecks(ws.auth || null),
          composerPlacement: getOperatorComposerPlacementState(
            ws.auth || null,
            ws.sessionControlClient?.clientId || sessionControlClientId
          )
        },
        ws.traceContext
      ),
      ws.auth || null
    );
    ws.send(JSON.stringify(snapshotPayload));
    logDebug(
      "ws.snapshot.sent",
      {
        sessionCount: Array.isArray(snapshotPayload.sessions) ? snapshotPayload.sessions.length : 0,
        outputCount: Array.isArray(snapshotPayload.outputs) ? snapshotPayload.outputs.length : 0,
        customCommandCount: Array.isArray(snapshotPayload.customCommands) ? snapshotPayload.customCommands.length : 0
      },
      snapshotPayload.trace || ws.traceContext
    );
    if (typeof broadcastSessionControlRefreshForAuthExceptSocket === "function") {
      broadcastSessionControlRefreshForAuthExceptSocket(ws.auth || null, ws, ws.traceContext);
    } else {
      broadcastSessionControlRefreshForAuth(ws.auth || null, ws.traceContext);
    }
  };
}
