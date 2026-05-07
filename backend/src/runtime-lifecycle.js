export function createRuntimeLifecycle(options = {}) {
  const {
    accessTokenVerifier,
    messagingRuntime,
    runtimeStartupReadiness,
    runtimeStartupRestore,
    setPersistedReplayOutputs = () => {},
    server,
    manager,
    toApiSession,
    logDebug = () => {},
    config = {},
    persistence,
    snapshotRuntimeState,
    sockets,
    wsServer,
    clearHeartbeat = () => {},
    clearGuardrailTimer = () => {},
    clearPersistTimer = () => {},
    sessionControlAttachmentRegistry,
    listSessionIdsForAuth = () => [],
    reconcileSessionControllerForSession = () => {}
  } = options;

  async function start() {
    await accessTokenVerifier.prewarm();
    messagingRuntime.prepareForRuntimeStart();
    runtimeStartupReadiness.prepareForStart();
    const restoredState = await runtimeStartupRestore.restorePersistedRuntimeState();
    setPersistedReplayOutputs(restoredState.persistedReplayOutputs);

    await new Promise((resolve) => {
      server.listen(config.port, resolve);
    });
    await messagingRuntime.start();
    for (const session of manager.list()) {
      try {
        await messagingRuntime.ensureSessionTarget(toApiSession(session, session.state), {
          source: "runtime.start"
        });
      } catch (error) {
        logDebug(
          "messaging.target.ensure_failed",
          {
            sessionId: session?.id || null,
            error: error instanceof Error ? error.message : String(error || "Unknown messaging target setup failure.")
          },
          { source: "runtime.start", sessionId: session?.id || "" }
        );
      }
    }
    if (typeof config.onBeforeReady === "function") {
      await config.onBeforeReady();
    }
    await runtimeStartupReadiness.releaseGateAndAwaitReadiness();
  }

  async function stopInternal() {
    runtimeStartupReadiness.beginStop();
    clearHeartbeat();
    clearGuardrailTimer();
    clearPersistTimer();
    sessionControlAttachmentRegistry.clearPruneTimer();
    await messagingRuntime.stop();

    for (const ws of sockets) {
      ws.closeReasonHint = "server_shutdown";
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();
    for (const sessionId of listSessionIdsForAuth(null)) {
      reconcileSessionControllerForSession(sessionId);
    }

    const persistedSnapshot = snapshotRuntimeState();
    logDebug("runtime.stop.start", {
      sessionCount: persistedSnapshot.sessions.length,
      customCommandCount: persistedSnapshot.customCommands.length,
      deckCount: persistedSnapshot.decks.length,
      socketCount: sockets.size
    });

    for (const session of manager.list()) {
      try {
        manager.delete(session.id);
      } catch {
        // Ignore cleanup errors.
      }
    }

    await persistence.saveState(persistedSnapshot);
    logDebug("runtime.stop.persisted", {
      persistedSessionCount: persistedSnapshot.sessions.length,
      persistedCustomCommandCount: persistedSnapshot.customCommands.length,
      persistedDeckCount: persistedSnapshot.decks.length
    });

    if (server.listening) {
      await new Promise((resolve) => {
        server.close(resolve);
        if (typeof server.closeIdleConnections === "function") {
          server.closeIdleConnections();
        }
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
      });
    }

    runtimeStartupReadiness.markStopped();
    logDebug("runtime.stop.done", {});
  }

  return {
    start,
    stopInternal
  };
}
