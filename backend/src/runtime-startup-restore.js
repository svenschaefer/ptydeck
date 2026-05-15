import { homedir } from "node:os";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildPersistedReplayOutputs(sessionOutputs, retentionLimitChars) {
  return new Map(
    toArray(sessionOutputs)
      .filter(
        (entry) =>
          entry &&
          typeof entry.sessionId === "string" &&
          typeof entry.data === "string" &&
          (entry.truncated === undefined || typeof entry.truncated === "boolean")
      )
      .map((entry) => [
        entry.sessionId,
        {
          data: entry.data,
          retainedChars: entry.data.length,
          retentionLimitChars,
          truncated: entry.truncated === true
        }
      ])
  );
}

function normalizePersistedState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    sessions: toArray(state.sessions),
    sessionOutputs: toArray(state.sessionOutputs),
    customCommands: toArray(state.customCommands),
    decks: toArray(state.decks),
    connectionProfiles: toArray(state.connectionProfiles),
    layoutProfiles: toArray(state.layoutProfiles),
    workspacePresets: toArray(state.workspacePresets),
    sshTrustEntries: toArray(state.sshTrustEntries),
    shareLinks: toArray(state.shareLinks),
    messagingTelegramTopicBindings: toArray(state.messagingTelegramTopicBindings),
    operatorComposerPlacements: toArray(state.operatorComposerPlacements)
  };
}

export function createRuntimeStartupRestore(dependencies = {}) {
  const {
    persistence = { loadState: async () => ({}) },
    sessionReplayPersistMaxChars = 0,
    startupWarmup = { setEnabled: () => {} },
    decks = new Map(),
    connectionProfiles = new Map(),
    layoutProfiles = new Map(),
    workspacePresets = new Map(),
    sshTrustEntries = new Map(),
    shareLinks = new Map(),
    operatorComposerPlacements = new Map(),
    telegramTopicBindings = new Map(),
    sessionDeckAssignments = new Map(),
    sessionQuickIdAssignments = new Map(),
    sessionControlStates = new Map(),
    unrestoredSessions = new Map(),
    customCommands = new Map(),
    manager = { list: () => [] },
    messagingRuntime = {
      replaceTelegramTopicBindings: () => {}
    },
    normalizeDeckEntity = () => null,
    normalizeLayoutProfileEntity = () => null,
    normalizeConnectionProfileEntity = () => null,
    slugifyConnectionProfileId = (value) => value,
    normalizeSshTrustEntryEntity = () => null,
    findSshTrustConflict = () => null,
    normalizePersistedShareLinkEntity = () => null,
    normalizePersistedOperatorComposerPlacementEntry = () => null,
    normalizeMessagingTopicBindings = (value) => toArray(value),
    syncSshKnownHostsFile = async () => {},
    ensureDefaultDeck = () => {},
    logDebug = () => {},
    createLocalOperatorPrincipal = () => null,
    setSessionControlState = () => {},
    normalizeSessionKind = (value) => value,
    normalizeSessionStartupConfig = (value) => value,
    normalizeSessionRemoteConnection = (value) => value,
    normalizeSessionRemoteAuth = (value) => value,
    normalizeSessionThemeSlots = (value) => value,
    normalizeSessionNote = () => "",
    normalizeSessionMouseForwardingMode = (value) => value,
    normalizeSessionInputSafetyProfile = (value) => value,
    normalizeSessionTags = (value) => value,
    normalizeQuickSendUsageEntries = (value) => value,
    assignSessionQuickIdToken = (sessionId, quickIdToken) => quickIdToken || sessionId,
    deriveTerminalAppIdentityFromSessionHints = () => ({ source: "unknown" }),
    remoteAuthRequiresSecret = () => false,
    tryCreateRestoredSession = () => {},
    listSessionIdsForAuth = () => [],
    reconcileSessionControllerForSession = () => {},
    buildCustomCommandEntry = () => null,
    buildCustomCommandKey = (name, scope = "", sessionId = "") => `${name}:${scope}:${sessionId}`,
    compareCustomCommandEntries = () => 0,
    ensureSessionExistsOrThrow = () => {},
    normalizeWorkspacePresetEntity = () => null,
    cleanupLayoutProfiles = () => false,
    cleanupConnectionProfiles = () => false,
    cleanupWorkspacePresets = () => false,
    hasKnownSession = () => false,
    resolveSessionDeckId = () => "default",
    metrics = { sessionsUnrestoredTotal: 0 },
    customCommandNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    customCommandReservedNames = new Set(),
    customCommandMaxNameLength = 32,
    customCommandMaxContentLength = 8192,
    customCommandMaxCount = 256,
    defaultDeckId = "default",
    defaultSshClient = "ssh",
    sessionKindSsh = "ssh",
    defaultShell = "sh",
    nowFn = () => Date.now(),
    consoleError = (...args) => console.error(...args)
  } = dependencies;

  async function restorePersistedRuntimeState() {
    const persistedState = normalizePersistedState(await persistence.loadState());
    const persistedReplayOutputs = buildPersistedReplayOutputs(
      persistedState.sessionOutputs,
      sessionReplayPersistMaxChars
    );

    startupWarmup.setEnabled(persistedState.sessions.length > 0);
    decks.clear();
    connectionProfiles.clear();
    layoutProfiles.clear();
    workspacePresets.clear();
    sshTrustEntries.clear();
    shareLinks.clear();
    operatorComposerPlacements.clear();
    telegramTopicBindings.clear();
    sessionDeckAssignments.clear();
    sessionQuickIdAssignments.clear();
    sessionControlStates.clear();
    unrestoredSessions.clear();
    customCommands.clear();

    for (const persistedDeck of persistedState.decks) {
      const normalizedDeck = normalizeDeckEntity(persistedDeck);
      if (!normalizedDeck) {
        continue;
      }
      decks.set(normalizedDeck.id, normalizedDeck);
    }

    const persistedSessionDeckAssignments = new Map();
    for (const session of persistedState.sessions) {
      if (!session || typeof session.id !== "string" || !session.id) {
        continue;
      }
      const persistedDeckId =
        typeof session.deckId === "string" && session.deckId && decks.has(session.deckId)
          ? session.deckId
          : defaultDeckId;
      persistedSessionDeckAssignments.set(session.id, persistedDeckId);
    }

    for (const persistedLayoutProfile of persistedState.layoutProfiles) {
      const normalizedProfile = normalizeLayoutProfileEntity(persistedLayoutProfile, {
        strict: false,
        hasKnownSession: (sessionId) => persistedSessionDeckAssignments.has(sessionId) || hasKnownSession(sessionId),
        resolveSessionDeckId: (sessionId) => persistedSessionDeckAssignments.get(sessionId) || resolveSessionDeckId(sessionId)
      });
      if (!normalizedProfile) {
        continue;
      }
      layoutProfiles.set(normalizedProfile.id, normalizedProfile);
    }

    for (const persistedConnectionProfile of persistedState.connectionProfiles) {
      const normalizedProfile = normalizeConnectionProfileEntity(persistedConnectionProfile, {
        strict: false,
        defaultShell,
        hasKnownDeck: (deckId) => decks.has(deckId)
      });
      if (!normalizedProfile) {
        continue;
      }
      if (!normalizedProfile.id) {
        normalizedProfile.id = slugifyConnectionProfileId(normalizedProfile.name);
      }
      connectionProfiles.set(normalizedProfile.id, normalizedProfile);
    }

    for (const persistedSshTrustEntry of persistedState.sshTrustEntries) {
      const normalizedEntry = normalizeSshTrustEntryEntity(persistedSshTrustEntry, { strict: false });
      if (!normalizedEntry) {
        continue;
      }
      const conflict = findSshTrustConflict(normalizedEntry);
      if (conflict?.type === "conflict") {
        logDebug("runtime.restore.ssh_trust_entry_skip", {
          entryId: normalizedEntry.id,
          host: normalizedEntry.host,
          port: normalizedEntry.port,
          keyType: normalizedEntry.keyType,
          reason: "conflicting-existing-entry"
        });
        continue;
      }
      if (conflict?.type === "exact") {
        continue;
      }
      sshTrustEntries.set(normalizedEntry.id, normalizedEntry);
    }

    for (const persistedShareLink of persistedState.shareLinks) {
      const normalizedShareLink = normalizePersistedShareLinkEntity(persistedShareLink, { strict: false });
      if (!normalizedShareLink) {
        continue;
      }
      shareLinks.set(normalizedShareLink.id, normalizedShareLink);
    }

    for (const persistedOperatorComposerPlacement of persistedState.operatorComposerPlacements) {
      const normalizedEntry = normalizePersistedOperatorComposerPlacementEntry(persistedOperatorComposerPlacement, {
        strict: false,
        hasKnownSession: (sessionId) => persistedSessionDeckAssignments.has(sessionId) || hasKnownSession(sessionId)
      });
      if (!normalizedEntry) {
        continue;
      }
      operatorComposerPlacements.set(normalizedEntry.attachmentKey, normalizedEntry);
    }

    for (const binding of normalizeMessagingTopicBindings(persistedState.messagingTelegramTopicBindings)) {
      telegramTopicBindings.set(`${binding.chatId}:${binding.sessionId}`, { ...binding });
    }
    messagingRuntime.replaceTelegramTopicBindings(Array.from(telegramTopicBindings.values()));
    await syncSshKnownHostsFile();
    ensureDefaultDeck();

    logDebug("runtime.restore.start", {
      persistedSessionCount: persistedState.sessions.length,
      persistedCustomCommandCount: persistedState.customCommands.length,
      persistedDeckCount: persistedState.decks.length,
      persistedConnectionProfileCount: persistedState.connectionProfiles.length,
      persistedLayoutProfileCount: persistedState.layoutProfiles.length,
      persistedWorkspacePresetCount: persistedState.workspacePresets.length,
      persistedSshTrustEntryCount: persistedState.sshTrustEntries.length,
      persistedShareLinkCount: persistedState.shareLinks.length,
      persistedOperatorComposerPlacementCount: persistedState.operatorComposerPlacements.length
    });

    for (const session of persistedState.sessions) {
      try {
        const persistedDeckId =
          typeof session.deckId === "string" && session.deckId && decks.has(session.deckId)
            ? session.deckId
            : defaultDeckId;
        sessionDeckAssignments.set(session.id, persistedDeckId);
        setSessionControlState(session.id, session.controlState, createLocalOperatorPrincipal());
        const kind = normalizeSessionKind(session.kind, { strict: false });
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: session.startCwd !== undefined ? session.startCwd : session.cwd,
            startCommand: session.startCommand,
            env: session.env,
            fallbackCwd: kind === sessionKindSsh ? "~" : session.cwd
          },
          { strict: false }
        );
        const remoteConnection = normalizeSessionRemoteConnection(session.remoteConnection, kind, { strict: false });
        const remoteAuth = normalizeSessionRemoteAuth(session.remoteAuth, kind, { strict: false });
        const themeSlots = normalizeSessionThemeSlots(
          {
            themeProfile: session.themeProfile,
            activeThemeProfile: session.activeThemeProfile,
            inactiveThemeProfile: session.inactiveThemeProfile
          },
          { strict: false }
        );
        const note = normalizeSessionNote(session.note, { strict: false });
        const mouseForwardingMode = normalizeSessionMouseForwardingMode(session.mouseForwardingMode, { strict: false });
        const inputSafetyProfile = normalizeSessionInputSafetyProfile(session.inputSafetyProfile, { strict: false });
        const tags = normalizeSessionTags(session.tags, { strict: false });
        const quickSendUsage = normalizeQuickSendUsageEntries(session.quickSendUsage);
        const quickIdToken = assignSessionQuickIdToken(session.id, session.quickIdToken);
        const requestedShell =
          typeof session.shell === "string" && session.shell.trim()
            ? session.shell
            : kind === sessionKindSsh
              ? defaultSshClient
              : defaultShell;
        const restoredCreatedAt = Number.isInteger(session.createdAt) ? session.createdAt : nowFn();
        const restoredUpdatedAt = Number.isInteger(session.updatedAt) ? session.updatedAt : restoredCreatedAt;
        const persistedSessionState =
          typeof session.state === "string" && session.state.trim() ? session.state.trim().toLowerCase() : "";
        const normalizedUnrestoredSession = {
          id: typeof session.id === "string" && session.id ? session.id : "",
          kind,
          ...(remoteConnection ? { remoteConnection } : {}),
          ...(remoteAuth ? { remoteAuth } : {}),
          cwd:
            typeof session.cwd === "string" && session.cwd.trim()
              ? session.cwd
              : startupConfig.startCwd,
          shell: requestedShell,
          ...(typeof session.name === "string" ? { name: session.name } : {}),
          startCwd: startupConfig.startCwd,
          startCommand: startupConfig.startCommand,
          env: startupConfig.env,
          ...(note ? { note } : {}),
          mouseForwardingMode,
          quickIdToken,
          inputSafetyProfile,
          tags,
          quickSendUsage,
          themeProfile: themeSlots.themeProfile,
          activeThemeProfile: themeSlots.activeThemeProfile,
          inactiveThemeProfile: themeSlots.inactiveThemeProfile,
          appIdentity: deriveTerminalAppIdentityFromSessionHints(
            {
              kind,
              shell: requestedShell,
              ...(typeof session.name === "string" ? { name: session.name } : {}),
              startCommand: startupConfig.startCommand
            },
            { updatedAt: restoredUpdatedAt }
          ),
          deckId: persistedDeckId,
          createdAt: restoredCreatedAt,
          updatedAt: restoredUpdatedAt
        };
        if (persistedSessionState === "stopped") {
          tryCreateRestoredSession({
            session,
            kind,
            remoteConnection,
            remoteAuth,
            shell: requestedShell,
            cwd:
              typeof session.cwd === "string" && session.cwd.trim()
                ? session.cwd
                : startupConfig.startCwd,
            startCwd: startupConfig.startCwd,
            startCommand: startupConfig.startCommand,
            replayOutput: "",
            replayOutputTruncated: false,
            remoteSecret: undefined,
            env: startupConfig.env,
            quickIdToken,
            note,
            mouseForwardingMode,
            inputSafetyProfile,
            tags,
            quickSendUsage,
            themeProfile: themeSlots.themeProfile,
            activeThemeProfile: themeSlots.activeThemeProfile,
            inactiveThemeProfile: themeSlots.inactiveThemeProfile,
            initialState: "stopped"
          });
          unrestoredSessions.delete(normalizedUnrestoredSession.id);
          logDebug("runtime.restore.session_restored_stopped", {
            sessionId: normalizedUnrestoredSession.id
          });
          continue;
        }
        if (persistedSessionState === "exited") {
          tryCreateRestoredSession({
            session,
            kind,
            remoteConnection,
            remoteAuth,
            shell: requestedShell,
            cwd:
              typeof session.cwd === "string" && session.cwd.trim()
                ? session.cwd
                : startupConfig.startCwd,
            startCwd: startupConfig.startCwd,
            startCommand: startupConfig.startCommand,
            replayOutput: persistedReplayOutputs.get(session.id)?.data || "",
            replayOutputTruncated: persistedReplayOutputs.get(session.id)?.truncated === true,
            remoteSecret: undefined,
            env: startupConfig.env,
            quickIdToken,
            note,
            mouseForwardingMode,
            inputSafetyProfile,
            tags,
            quickSendUsage,
            themeProfile: themeSlots.themeProfile,
            activeThemeProfile: themeSlots.activeThemeProfile,
            inactiveThemeProfile: themeSlots.inactiveThemeProfile,
            initialState: "exited",
            exitCode: Number.isInteger(session.exitCode) ? session.exitCode : null,
            exitSignal: typeof session.exitSignal === "string" ? session.exitSignal : "",
            exitedAt: Number.isInteger(session.exitedAt) ? session.exitedAt : restoredUpdatedAt
          });
          unrestoredSessions.delete(normalizedUnrestoredSession.id);
          logDebug("runtime.restore.session_restored_exited", {
            sessionId: normalizedUnrestoredSession.id
          });
          continue;
        }
        const requestedCwd = startupConfig.startCwd;
        const fallbackCwd = kind === sessionKindSsh ? "~" : homedir();
        const fallbackShell = kind === sessionKindSsh ? defaultSshClient : defaultShell;
        if (remoteAuthRequiresSecret(remoteAuth)) {
          unrestoredSessions.set(normalizedUnrestoredSession.id, normalizedUnrestoredSession);
          logDebug("restore.session.skip", {
            sessionId: normalizedUnrestoredSession.id,
            reason: "missing-remote-secret",
            kind,
            authMethod: remoteAuth?.method || null
          });
          continue;
        }

        const restoreAttempts = [
          { shell: requestedShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "saved-shell+saved-cwd" },
          { shell: fallbackShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "fallback-shell+saved-cwd" },
          { shell: requestedShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "saved-shell+home-cwd" },
          { shell: fallbackShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "fallback-shell+home-cwd" }
        ];

        let restored = false;
        for (const attempt of restoreAttempts) {
          try {
            tryCreateRestoredSession({
              session,
              kind,
              remoteConnection,
              remoteAuth,
              shell: attempt.shell,
              cwd: attempt.cwd,
              startCwd: attempt.startCwd,
              startCommand: startupConfig.startCommand,
              replayOutput: persistedReplayOutputs.get(session.id)?.data || "",
              remoteSecret: undefined,
              replayOutputTruncated: persistedReplayOutputs.get(session.id)?.truncated === true,
              env: startupConfig.env,
              quickIdToken,
              note,
              mouseForwardingMode,
              inputSafetyProfile,
              tags,
              quickSendUsage,
              themeProfile: themeSlots.themeProfile,
              activeThemeProfile: themeSlots.activeThemeProfile,
              inactiveThemeProfile: themeSlots.inactiveThemeProfile
            });
            restored = true;
            if (attempt.reason !== "saved-shell+saved-cwd") {
              logDebug("runtime.restore.session_fallback_applied", {
                sessionId: session.id,
                reason: attempt.reason,
                requestedShell,
                requestedStartCwd: requestedCwd,
                appliedShell: attempt.shell,
                appliedStartCwd: attempt.startCwd
              });
            }
            break;
          } catch (error) {
            logDebug("runtime.restore.session_attempt_failed", {
              sessionId: session.id,
              reason: attempt.reason,
              shell: attempt.shell,
              startCwd: attempt.startCwd,
              error: error?.message || String(error)
            });
          }
        }

        if (!restored) {
          unrestoredSessions.set(normalizedUnrestoredSession.id, normalizedUnrestoredSession);
          metrics.sessionsUnrestoredTotal += 1;
          logDebug("runtime.restore.session_marked_unrestored", {
            sessionId: normalizedUnrestoredSession.id
          });
          throw new Error("all restore attempts failed");
        }
        unrestoredSessions.delete(normalizedUnrestoredSession.id);
      } catch (error) {
        consoleError("failed to restore session", session.id, error);
      }
    }

    for (const sessionId of listSessionIdsForAuth(null)) {
      reconcileSessionControllerForSession(sessionId);
    }

    const restoreCandidates = [];
    for (const customCommand of persistedState.customCommands) {
      const candidate = buildCustomCommandEntry(customCommand?.name, customCommand, {
        strict: false,
        fieldPathPrefix: "customCommands[]"
      });
      if (!candidate) {
        continue;
      }
      if (
        candidate.name.length > customCommandMaxNameLength ||
        !customCommandNamePattern.test(candidate.name) ||
        customCommandReservedNames.has(candidate.name) ||
        candidate.content.length > customCommandMaxContentLength
      ) {
        continue;
      }
      restoreCandidates.push(candidate);
    }
    restoreCandidates.sort(compareCustomCommandEntries);
    for (const candidate of restoreCandidates) {
      if (candidate.scope === "session") {
        try {
          ensureSessionExistsOrThrow(candidate.sessionId);
        } catch {
          continue;
        }
      }
      const key = buildCustomCommandKey(candidate.name, candidate.scope, candidate.sessionId);
      if (customCommands.has(key)) {
        customCommands.set(key, candidate);
        continue;
      }
      if (customCommands.size >= customCommandMaxCount) {
        continue;
      }
      customCommands.set(key, candidate);
    }

    for (const persistedWorkspacePreset of persistedState.workspacePresets) {
      const normalizedPreset = normalizeWorkspacePresetEntity(persistedWorkspacePreset, { strict: false });
      if (!normalizedPreset) {
        continue;
      }
      workspacePresets.set(normalizedPreset.id, normalizedPreset);
    }

    cleanupLayoutProfiles();
    cleanupConnectionProfiles();
    cleanupWorkspacePresets();
    logDebug("runtime.restore.done", {
      restoredSessionCount: manager.list().length,
      unrestoredSessionCount: unrestoredSessions.size,
      restoredCustomCommandCount: customCommands.size,
      restoredDeckCount: decks.size,
      restoredConnectionProfileCount: connectionProfiles.size,
      restoredWorkspacePresetCount: workspacePresets.size
    });

    return {
      persistedReplayOutputs,
      persistedState
    };
  }

  return {
    restorePersistedRuntimeState
  };
}
