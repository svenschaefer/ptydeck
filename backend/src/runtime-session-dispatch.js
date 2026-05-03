import crypto from "node:crypto";

import { ApiError } from "./errors.js";

export function createRuntimeSessionDispatch(dependencies = {}) {
  const {
    validateResponse = () => {},
    createSessionRateLimiter = { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    rateLimitRestCreateMax = 0,
    normalizeConnectionProfileIdInput = (value) => value,
    getConnectionProfileOrThrow = () => null,
    normalizeSessionKind = (value) => value,
    normalizeSessionStartupConfig = (value) => value,
    normalizeSessionRemoteConnection = (value) => value,
    normalizeSessionRemoteAuth = (value) => value,
    normalizeSessionRemoteSecret = (value) => value,
    normalizeSessionThemeSlots = (value) => value,
    normalizeSessionNote = (value) => value,
    normalizeSessionMouseForwardingMode = (value) => value,
    normalizeSessionInputSafetyProfile = (value) => value,
    normalizeSessionTags = (value) => value,
    hasKnownDeck = () => true,
    normalizeConnectionProfileDeckId = (value) => value,
    normalizeQuickSendUsageMutation = () => null,
    getApiSessionOrThrow = () => null,
    listApiSessions = () => [],
    buildSessionReplayExportOrThrow = () => null,
    buildSessionReplayExcerptOrThrow = () => null,
    buildSessionFileDownloadOrThrow = async () => null,
    uploadSessionFileOrThrow = async () => null,
    ensureSessionControllerAccess = () => {},
    messagingRuntime = { observeSessionInput: () => {} },
    manager = {
      create: () => null,
      get: () => ({ meta: {} }),
      updateSession: () => null,
      sendInput: () => {},
      delete: () => {},
      restart: () => null,
      interrupt: () => {},
      terminate: () => {},
      kill: () => {},
      resize: () => {}
    },
    assignSessionQuickIdToken = () => "?",
    deleteSessionQuickIdToken = () => false,
    createDefaultSessionOwner = () => null,
    setSessionControlState = () => {},
    deleteSessionControlState = () => {},
    reconcileSessionControllerForSession = () => false,
    toApiSession = (value) => value,
    persistNow = async () => {},
    persistSoon = () => {},
    broadcast = () => {},
    broadcastSessionUpdated = () => {},
    removeCustomCommandsForSession = () => [],
    cleanupLayoutProfiles = () => false,
    cleanupWorkspacePresets = () => false,
    deleteUnrestoredSession = () => false,
    deleteSessionDeckAssignment = () => false,
    setPendingSessionDeckAssignment = () => {},
    swapSessionQuickIds = () => ({ leftSession: null, rightSession: null }),
    recordSessionLastInput = () => {},
    randomUuid = () => crypto.randomUUID(),
    defaultSshClient = "ssh",
    sessionKindSsh = "ssh",
    setAuditContext: defaultSetAuditContext = () => {}
  } = dependencies;

  async function dispatchSessionRequest({
    match,
    parsedUrl,
    body,
    auth,
    req,
    requestContext,
    requestTraceContext,
    setAuditContext = defaultSetAuditContext,
    writeJsonResponse
  }) {
    if (match.kind === "listSessions") {
      const requestedDeckId = parsedUrl.searchParams.get("deckId");
      const deckIdFilter = typeof requestedDeckId === "string" && requestedDeckId.trim() ? requestedDeckId.trim() : "";
      const payload = listApiSessions(auth, { deckId: deckIdFilter || undefined });
      validateResponse({ statusCode: 200, body: payload, expect: "sessionList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createSession") {
      const rateLimitResult = createSessionRateLimiter.check(requestContext.clientIp, rateLimitRestCreateMax);
      if (!rateLimitResult.allowed) {
        throw new ApiError(
          429,
          "RateLimitExceeded",
          `Session creation rate limit exceeded. Retry in ${rateLimitResult.retryAfterSeconds} seconds.`
        );
      }
      const connectionProfileId =
        typeof body?.connectionProfileId === "string" && body.connectionProfileId.trim()
          ? normalizeConnectionProfileIdInput(body.connectionProfileId)
          : "";
      const connectionProfile = connectionProfileId ? getConnectionProfileOrThrow(connectionProfileId) : null;
      const launchSource = connectionProfile?.launch || {};
      const mergedBody = {
        ...launchSource,
        ...(body || {})
      };
      const kind = normalizeSessionKind(mergedBody?.kind, { strict: true });
      const startupConfig = normalizeSessionStartupConfig(
        {
          startCwd: mergedBody?.startCwd !== undefined ? mergedBody.startCwd : mergedBody?.cwd,
          startCommand: mergedBody?.startCommand,
          env: mergedBody?.env,
          fallbackCwd: kind === sessionKindSsh ? "~" : mergedBody?.cwd
        },
        { strict: true }
      );
      const remoteConnection = normalizeSessionRemoteConnection(mergedBody?.remoteConnection, kind, { strict: true });
      const remoteAuth = normalizeSessionRemoteAuth(mergedBody?.remoteAuth, kind, { strict: true });
      const remoteSecret = normalizeSessionRemoteSecret(body?.remoteSecret, remoteAuth, kind, { strict: true });
      const themeSlots = normalizeSessionThemeSlots(mergedBody, { strict: true });
      const note = normalizeSessionNote(mergedBody?.note, { strict: true });
      const mouseForwardingMode = normalizeSessionMouseForwardingMode(mergedBody?.mouseForwardingMode, { strict: true });
      const inputSafetyProfile = normalizeSessionInputSafetyProfile(mergedBody?.inputSafetyProfile, { strict: true });
      const tags = normalizeSessionTags(mergedBody?.tags, { strict: true });
      const assignedDeckId = normalizeConnectionProfileDeckId(mergedBody?.deckId, {
        strict: false,
        hasKnownDeck
      });
      const sessionId = randomUuid();
      const quickIdToken = assignSessionQuickIdToken(sessionId);
      setPendingSessionDeckAssignment(sessionId, assignedDeckId);
      setSessionControlState(sessionId, {}, createDefaultSessionOwner(auth));
      let payload = null;
      try {
        payload = manager.create({
          id: sessionId,
          quickIdToken,
          kind,
          remoteConnection,
          remoteAuth,
          remoteSecret,
          cwd: startupConfig.startCwd,
          shell: mergedBody?.shell !== undefined ? mergedBody.shell : kind === sessionKindSsh ? defaultSshClient : undefined,
          name: mergedBody?.name,
          deckId: assignedDeckId,
          startCwd: startupConfig.startCwd,
          startCommand: startupConfig.startCommand,
          env: startupConfig.env,
          note,
          mouseForwardingMode,
          inputSafetyProfile,
          tags,
          themeProfile: themeSlots.themeProfile,
          activeThemeProfile: themeSlots.activeThemeProfile,
          inactiveThemeProfile: themeSlots.inactiveThemeProfile,
          trace: requestTraceContext
        });
      } catch (error) {
        deleteSessionDeckAssignment(sessionId);
        deleteSessionQuickIdToken(sessionId);
        deleteSessionControlState(sessionId);
        throw error;
      }
      reconcileSessionControllerForSession(payload.id);
      const apiPayload = toApiSession(payload);
      setAuditContext({
        target: { sessionId: apiPayload.id },
        metadata: {
          deckId: apiPayload.deckId,
          sessionKind: apiPayload.kind
        }
      });
      validateResponse({ statusCode: 201, body: apiPayload, expect: "session" });
      await persistNow("session.create");
      broadcastSessionUpdated(payload.id, {
        ...requestTraceContext,
        sessionId: payload.id,
        deckId: apiPayload.deckId
      });
      writeJsonResponse(201, apiPayload);
      return true;
    }

    if (match.kind === "getSession") {
      const payload = getApiSessionOrThrow(match.params.sessionId, auth);
      validateResponse({ statusCode: 200, body: payload, expect: "session" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "getSessionReplayExport") {
      const payload = buildSessionReplayExportOrThrow(match.params.sessionId);
      validateResponse({ statusCode: 200, body: payload, expect: "sessionReplayExport" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "getSessionReplayExcerpt") {
      const payload = buildSessionReplayExcerptOrThrow(match.params.sessionId, parsedUrl.searchParams.get("slice"));
      validateResponse({ statusCode: 200, body: payload, expect: "sessionReplayExcerpt" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "downloadSessionFile") {
      const payload = await buildSessionFileDownloadOrThrow(match.params.sessionId, body.path);
      validateResponse({ statusCode: 200, body: payload, expect: "sessionFileDownload" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteSession") {
      setAuditContext({ target: { sessionId: match.params.sessionId } });
      manager.delete(match.params.sessionId, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      deleteSessionDeckAssignment(match.params.sessionId);
      deleteSessionQuickIdToken(match.params.sessionId);
      deleteSessionControlState(match.params.sessionId);
      deleteUnrestoredSession(match.params.sessionId);
      for (const deletedCommand of removeCustomCommandsForSession(match.params.sessionId)) {
        broadcast({
          type: "custom-command.deleted",
          command: deletedCommand
        }, {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        });
      }
      cleanupLayoutProfiles();
      cleanupWorkspacePresets();
      await persistNow("session.delete");
      await messagingRuntime.syncTelegramCommandCatalog({
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "swapSessionQuickId") {
      const result = swapSessionQuickIds(match.params.sessionId, body.otherSessionId);
      validateResponse({ statusCode: 200, body: result, expect: "sessionQuickIdSwap" });
      await persistNow("session.quick_id.swap");
      broadcast({
        type: "session.updated",
        session: result.leftSession
      }, {
        ...requestTraceContext,
        sessionId: result.leftSession.id,
        deckId: result.leftSession.deckId
      });
      broadcast({
        type: "session.updated",
        session: result.rightSession
      }, {
        ...requestTraceContext,
        sessionId: result.rightSession.id,
        deckId: result.rightSession.deckId
      });
      writeJsonResponse(200, result);
      return true;
    }

    if (match.kind === "updateSession") {
      const patch = {};
      if (body?.name !== undefined) {
        patch.name = body.name;
      }
      const current = manager.get(match.params.sessionId).meta;
      const effectiveKind = normalizeSessionKind(body?.kind !== undefined ? body.kind : current.kind, { strict: true });
      if (body?.kind !== undefined) {
        patch.kind = effectiveKind;
      }
      if (body?.remoteConnection !== undefined || body?.kind !== undefined) {
        patch.remoteConnection = normalizeSessionRemoteConnection(
          body?.remoteConnection !== undefined
            ? body.remoteConnection
            : body?.kind !== undefined && effectiveKind !== current.kind
              ? undefined
              : current.remoteConnection,
          effectiveKind,
          { strict: true }
        );
      }
      const effectiveRemoteAuth = normalizeSessionRemoteAuth(
        body?.remoteAuth !== undefined
          ? body.remoteAuth
          : body?.kind !== undefined && effectiveKind !== current.kind
            ? undefined
            : current.remoteAuth,
        effectiveKind,
        { strict: true }
      );
      if (body?.remoteAuth !== undefined || body?.kind !== undefined) {
        patch.remoteAuth = effectiveRemoteAuth;
      }
      if (body?.remoteSecret !== undefined) {
        patch.remoteSecret = normalizeSessionRemoteSecret(body.remoteSecret, effectiveRemoteAuth, effectiveKind, {
          strict: true
        });
      }
      const hasStartupUpdates =
        body?.startCwd !== undefined || body?.startCommand !== undefined || body?.env !== undefined;
      if (hasStartupUpdates) {
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: body?.startCwd !== undefined ? body.startCwd : current.startCwd || current.cwd,
            startCommand: body?.startCommand !== undefined ? body.startCommand : current.startCommand || "",
            env: body?.env !== undefined ? body.env : current.env || {},
            fallbackCwd: effectiveKind === sessionKindSsh ? "~" : current.startCwd || current.cwd
          },
          { strict: true }
        );
        patch.startCwd = startupConfig.startCwd;
        patch.startCommand = startupConfig.startCommand;
        patch.env = startupConfig.env;
      }
      if (
        body?.themeProfile !== undefined ||
        body?.activeThemeProfile !== undefined ||
        body?.inactiveThemeProfile !== undefined
      ) {
        const themeSlots = normalizeSessionThemeSlots(
          {
            themeProfile: body?.themeProfile,
            activeThemeProfile: body?.activeThemeProfile,
            inactiveThemeProfile: body?.inactiveThemeProfile
          },
          { strict: true }
        );
        patch.themeProfile = themeSlots.themeProfile;
        patch.activeThemeProfile = themeSlots.activeThemeProfile;
        patch.inactiveThemeProfile = themeSlots.inactiveThemeProfile;
      }
      if (body?.note !== undefined) {
        patch.note = normalizeSessionNote(body.note, { strict: true });
      }
      if (body?.mouseForwardingMode !== undefined) {
        patch.mouseForwardingMode = normalizeSessionMouseForwardingMode(body.mouseForwardingMode, { strict: true });
      }
      if (body?.inputSafetyProfile !== undefined) {
        patch.inputSafetyProfile = normalizeSessionInputSafetyProfile(body.inputSafetyProfile, { strict: true });
      }
      if (body?.tags !== undefined) {
        patch.tags = normalizeSessionTags(body.tags, { strict: true });
      }
      if (!Object.keys(patch).length) {
        throw new ApiError(400, "ValidationError", "No updatable session fields provided.");
      }
      const payload = manager.updateSession(match.params.sessionId, patch, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      const apiPayload = toApiSession(payload);
      validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
      await persistNow("session.update");
      broadcast({
        type: "session.updated",
        session: apiPayload
      }, {
        ...requestTraceContext,
        sessionId: apiPayload.id,
        deckId: apiPayload.deckId
      });
      writeJsonResponse(200, apiPayload);
      return true;
    }

    if (match.kind === "input") {
      const metadata = {
        inputBytes: typeof body?.data === "string" ? Buffer.byteLength(body.data, "utf8") : 0
      };
      const customCommandUsage = normalizeQuickSendUsageMutation(body?.customCommandUsage);
      if (customCommandUsage) {
        metadata.quickSendLookupKey = customCommandUsage.lookupKey;
      }
      setAuditContext({ target: { sessionId: match.params.sessionId }, metadata });
      getApiSessionOrThrow(match.params.sessionId, auth);
      ensureSessionControllerAccess(match.params.sessionId, auth, req, "send terminal input");
      const normalizedReplyInputText =
        typeof body.data === "string" ? body.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "").trim() : "";
      const inputTrace = {
        ...requestTraceContext,
        sessionId: match.params.sessionId,
        ...(typeof body.data === "string" && /[\r\n]/.test(body.data) ? { replyPromotionEligible: true } : {}),
        ...(normalizedReplyInputText ? { replyInputText: normalizedReplyInputText } : {})
      };
      messagingRuntime.observeSessionInput(match.params.sessionId, inputTrace);
      manager.sendInput(match.params.sessionId, body.data, {
        trace: inputTrace,
        ...(customCommandUsage ? { customCommandUsage } : {})
      });
      recordSessionLastInput(match.params.sessionId, auth, req);
      if (customCommandUsage) {
        persistSoon();
      }
      broadcastSessionUpdated(match.params.sessionId, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "uploadSessionFile") {
      const payload = await uploadSessionFileOrThrow(match.params.sessionId, body.path, body.contentBase64);
      validateResponse({ statusCode: 200, body: payload, expect: "sessionFileUpload" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "resize") {
      setAuditContext({
        target: { sessionId: match.params.sessionId },
        metadata: {
          cols: body?.cols,
          rows: body?.rows
        }
      });
      getApiSessionOrThrow(match.params.sessionId, auth);
      ensureSessionControllerAccess(match.params.sessionId, auth, req, "resize this terminal");
      manager.resize(match.params.sessionId, body.cols, body.rows, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "restart") {
      const payload = manager.restart(match.params.sessionId, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      assignSessionQuickIdToken(payload.id, payload.quickIdToken);
      const apiPayload = toApiSession(payload);
      validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
      await persistNow("session.restart");
      writeJsonResponse(200, apiPayload);
      return true;
    }

    if (match.kind === "interrupt") {
      manager.interrupt(match.params.sessionId, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "terminate") {
      manager.terminate(match.params.sessionId, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "kill") {
      manager.kill(match.params.sessionId, {
        trace: {
          ...requestTraceContext,
          sessionId: match.params.sessionId
        }
      });
      writeJsonResponse(204);
      return true;
    }

    return false;
  }

  return {
    dispatchSessionRequest
  };
}
