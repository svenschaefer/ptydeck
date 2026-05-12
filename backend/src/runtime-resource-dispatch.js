export function createRuntimeResourceDispatch(dependencies = {}) {
  const {
    validateResponse = () => {},
    parseBooleanQueryParam = (value) => value,
    normalizeCustomCommandScope = (value) => value,
    normalizeCustomCommandSessionId = (value) => value,
    listShareLinks = () => [],
    createShareLink = () => null,
    getApiShareLinkOrThrow = () => null,
    revokeShareLink = () => null,
    persistNow = async () => {},
    getApiSessionOrThrow = () => null,
    listApiSessions = () => [],
    listCustomCommands = () => [],
    getCustomCommandOrThrow = () => null,
    hasCustomCommand = () => false,
    upsertCustomCommand = () => null,
    deleteCustomCommand = () => null,
    broadcast = () => {},
    listDecks = () => [],
    createDeck = () => null,
    getDeckOrThrow = () => null,
    toApiDeck = (value) => value,
    updateDeck = () => null,
    deleteDeck = () => null,
    broadcastSessionUpdated = () => {},
    broadcastDeckUpsert = () => {},
    broadcastDeckDeleted = () => {},
    moveSessionToDeck = () => {},
    listLayoutProfiles = () => [],
    createLayoutProfile = () => null,
    getLayoutProfileOrThrow = () => null,
    toApiLayoutProfile = (value) => value,
    updateLayoutProfile = () => null,
    deleteLayoutProfile = () => {},
    listConnectionProfiles = () => [],
    createConnectionProfile = () => null,
    getConnectionProfileOrThrow = () => null,
    toApiConnectionProfile = (value) => value,
    updateConnectionProfile = () => null,
    deleteConnectionProfile = () => {},
    listWorkspacePresets = () => [],
    createWorkspacePreset = () => null,
    getWorkspacePresetOrThrow = () => null,
    toApiWorkspacePreset = (value) => value,
    updateWorkspacePreset = () => null,
    deleteWorkspacePreset = () => {},
    listSshTrustEntries = () => [],
    upsertSshTrustEntry = () => ({ created: false, entry: null }),
    syncSshKnownHostsFile = async () => {},
    probeSshHostKeysOrThrow = async () => null,
    deleteSshTrustEntry = () => {},
    getOperatorComposerPlacementStateOrThrow = () => null,
    updateOperatorComposerPlacementStateOrThrow = () => null,
    broadcastOperatorComposerPlacementUpdated = () => {},
    messagingRuntime = {
      observeShareChange: async () => {},
      syncTelegramCommandCatalog: async () => {}
    }
  } = dependencies;

  async function observeShareChangeForDeck(action, shareLink, requestTraceContext) {
    for (const session of listApiSessions(null).filter((entry) => entry.deckId === shareLink.targetId)) {
      await messagingRuntime.observeShareChange({
        action,
        shareLink,
        session,
        trace: requestTraceContext
      });
    }
  }

  async function dispatchResourceRequest({
    match,
    parsedUrl,
    body,
    auth,
    req,
    requestContext,
    requestTraceContext,
    writeJsonResponse
  }) {
    if (match.kind === "listShares") {
      const payload = listShareLinks();
      validateResponse({ statusCode: 200, body: payload, expect: "shareLinkList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createShareLink") {
      const payload = createShareLink(body, auth, req, requestContext);
      validateResponse({ statusCode: 201, body: payload, expect: "shareLink" });
      await persistNow("share-link.create");
      if (payload.targetType === "session") {
        await messagingRuntime.observeShareChange({
          action: "created",
          shareLink: payload,
          session: getApiSessionOrThrow(payload.targetId),
          trace: requestTraceContext
        });
      } else if (payload.targetType === "deck") {
        await observeShareChangeForDeck("created", payload, requestTraceContext);
      }
      writeJsonResponse(201, payload);
      return true;
    }

    if (match.kind === "getShareLink") {
      const payload = getApiShareLinkOrThrow(match.params.shareId);
      validateResponse({ statusCode: 200, body: payload, expect: "shareLink" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "revokeShareLink") {
      const payload = revokeShareLink(match.params.shareId);
      validateResponse({ statusCode: 200, body: payload, expect: "shareLink" });
      await persistNow("share-link.revoke");
      if (payload.targetType === "session") {
        await messagingRuntime.observeShareChange({
          action: "revoked",
          shareLink: payload,
          session: getApiSessionOrThrow(payload.targetId),
          trace: requestTraceContext
        });
      } else if (payload.targetType === "deck") {
        await observeShareChangeForDeck("revoked", payload, requestTraceContext);
      }
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "listCustomCommands") {
      const scope = parsedUrl.searchParams.get("scope");
      const sessionId = parsedUrl.searchParams.get("sessionId");
      const payload = listCustomCommands({
        scope: scope ? normalizeCustomCommandScope(scope) : null,
        sessionId
      });
      validateResponse({ statusCode: 200, body: payload, expect: "customCommandList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "getCustomCommand") {
      const scope = parsedUrl.searchParams.get("scope");
      const sessionId = parsedUrl.searchParams.get("sessionId");
      const payload = getCustomCommandOrThrow(match.params.commandName, {
        scope: scope ? normalizeCustomCommandScope(scope) : null,
        sessionId
      });
      validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "upsertCustomCommand") {
      const targetScope = normalizeCustomCommandScope(body?.scope);
      const targetSessionId = targetScope === "session" ? normalizeCustomCommandSessionId(body?.sessionId) : "";
      const existed = hasCustomCommand(match.params.commandName, {
        scope: targetScope,
        sessionId: targetSessionId
      });
      const payload = upsertCustomCommand(match.params.commandName, body);
      validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
      broadcast({
        type: existed ? "custom-command.updated" : "custom-command.created",
        command: payload
      }, requestTraceContext);
      await persistNow("custom-command.upsert");
      await messagingRuntime.syncTelegramCommandCatalog(requestTraceContext);
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteCustomCommand") {
      const scope = parsedUrl.searchParams.get("scope");
      const sessionId = parsedUrl.searchParams.get("sessionId");
      const deletedCommand = deleteCustomCommand(match.params.commandName, {
        scope: scope ? normalizeCustomCommandScope(scope) : null,
        sessionId
      });
      broadcast({
        type: "custom-command.deleted",
        command: deletedCommand
      }, requestTraceContext);
      await persistNow("custom-command.delete");
      await messagingRuntime.syncTelegramCommandCatalog(requestTraceContext);
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "listDecks") {
      const payload = listDecks(auth);
      validateResponse({ statusCode: 200, body: payload, expect: "deckList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createDeck") {
      const payload = createDeck(body);
      validateResponse({ statusCode: 201, body: payload, expect: "deck" });
      await persistNow("deck.create");
      broadcastDeckUpsert("deck.created", payload, requestTraceContext);
      writeJsonResponse(201, payload);
      return true;
    }

    if (match.kind === "getDeck") {
      const payload = toApiDeck(getDeckOrThrow(match.params.deckId, auth));
      validateResponse({ statusCode: 200, body: payload, expect: "deck" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "updateDeck") {
      const payload = updateDeck(match.params.deckId, body);
      validateResponse({ statusCode: 200, body: payload, expect: "deck" });
      await persistNow("deck.update");
      broadcastDeckUpsert("deck.updated", payload, requestTraceContext);
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteDeck") {
      const force = parseBooleanQueryParam(parsedUrl.searchParams.get("force"), "force");
      const result = deleteDeck(match.params.deckId, { force });
      await persistNow("deck.delete");
      for (const sessionId of result.reassignedSessionIds) {
        broadcastSessionUpdated(sessionId, {
          ...requestTraceContext,
          sessionId,
          deckId: result.fallbackDeckId
        });
      }
      broadcastDeckDeleted(result.deckId, result.fallbackDeckId, requestTraceContext);
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "moveSessionToDeck") {
      moveSessionToDeck(match.params.sessionId, match.params.deckId);
      await persistNow("deck.move-session");
      broadcastSessionUpdated(match.params.sessionId, {
        ...requestTraceContext,
        sessionId: match.params.sessionId,
        deckId: match.params.deckId
      });
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "listLayoutProfiles") {
      const payload = listLayoutProfiles();
      validateResponse({ statusCode: 200, body: payload, expect: "layoutProfileList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createLayoutProfile") {
      const payload = createLayoutProfile(body);
      validateResponse({ statusCode: 201, body: payload, expect: "layoutProfile" });
      await persistNow("layout-profile.create");
      writeJsonResponse(201, payload);
      return true;
    }

    if (match.kind === "getLayoutProfile") {
      const payload = toApiLayoutProfile(getLayoutProfileOrThrow(match.params.profileId));
      validateResponse({ statusCode: 200, body: payload, expect: "layoutProfile" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "updateLayoutProfile") {
      const payload = updateLayoutProfile(match.params.profileId, body);
      validateResponse({ statusCode: 200, body: payload, expect: "layoutProfile" });
      await persistNow("layout-profile.update");
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteLayoutProfile") {
      deleteLayoutProfile(match.params.profileId);
      await persistNow("layout-profile.delete");
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "listConnectionProfiles") {
      const payload = listConnectionProfiles();
      validateResponse({ statusCode: 200, body: payload, expect: "connectionProfileList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createConnectionProfile") {
      const payload = createConnectionProfile(body);
      validateResponse({ statusCode: 201, body: payload, expect: "connectionProfile" });
      await persistNow("connection-profile.create");
      writeJsonResponse(201, payload);
      return true;
    }

    if (match.kind === "getConnectionProfile") {
      const payload = toApiConnectionProfile(getConnectionProfileOrThrow(match.params.profileId));
      validateResponse({ statusCode: 200, body: payload, expect: "connectionProfile" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "updateConnectionProfile") {
      const payload = updateConnectionProfile(match.params.profileId, body);
      validateResponse({ statusCode: 200, body: payload, expect: "connectionProfile" });
      await persistNow("connection-profile.update");
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteConnectionProfile") {
      deleteConnectionProfile(match.params.profileId);
      await persistNow("connection-profile.delete");
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "listWorkspacePresets") {
      const payload = listWorkspacePresets();
      validateResponse({ statusCode: 200, body: payload, expect: "workspacePresetList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createWorkspacePreset") {
      const payload = createWorkspacePreset(body);
      validateResponse({ statusCode: 201, body: payload, expect: "workspacePreset" });
      await persistNow("workspace-preset.create");
      writeJsonResponse(201, payload);
      return true;
    }

    if (match.kind === "getWorkspacePreset") {
      const payload = toApiWorkspacePreset(getWorkspacePresetOrThrow(match.params.presetId));
      validateResponse({ statusCode: 200, body: payload, expect: "workspacePreset" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "updateWorkspacePreset") {
      const payload = updateWorkspacePreset(match.params.presetId, body);
      validateResponse({ statusCode: 200, body: payload, expect: "workspacePreset" });
      await persistNow("workspace-preset.update");
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteWorkspacePreset") {
      deleteWorkspacePreset(match.params.presetId);
      await persistNow("workspace-preset.delete");
      writeJsonResponse(204);
      return true;
    }

    if (match.kind === "listSshTrustEntries") {
      const payload = listSshTrustEntries();
      validateResponse({ statusCode: 200, body: payload, expect: "sshTrustEntryList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "getOperatorComposerPlacement") {
      const payload = getOperatorComposerPlacementStateOrThrow(auth, req);
      validateResponse({ statusCode: 200, body: payload, expect: "operatorComposerPlacement" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "updateOperatorComposerPlacement") {
      const payload = updateOperatorComposerPlacementStateOrThrow(body, auth, req);
      validateResponse({ statusCode: 200, body: payload, expect: "operatorComposerPlacement" });
      await persistNow("operator-composer-placement.update");
      broadcastOperatorComposerPlacementUpdated(auth, payload.clientId, requestTraceContext);
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "createSshTrustEntry") {
      const { created, entry } = upsertSshTrustEntry(body);
      await syncSshKnownHostsFile();
      await persistNow(created ? "ssh-trust-entry.create" : "ssh-trust-entry.reuse");
      validateResponse({ statusCode: created ? 201 : 200, body: entry, expect: "sshTrustEntry" });
      writeJsonResponse(created ? 201 : 200, entry);
      return true;
    }

    if (match.kind === "probeSshHostKeys") {
      const payload = await probeSshHostKeysOrThrow(body);
      validateResponse({ statusCode: 200, body: payload, expect: "sshHostKeyProbeCandidateList" });
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "deleteSshTrustEntry") {
      deleteSshTrustEntry(match.params.entryId);
      await syncSshKnownHostsFile();
      await persistNow("ssh-trust-entry.delete");
      writeJsonResponse(204);
      return true;
    }

    return false;
  }

  return {
    dispatchResourceRequest
  };
}
