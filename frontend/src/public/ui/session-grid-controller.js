export function createSessionGridController(options = {}) {
  const defaultDeckId = String(options.defaultDeckId || "").trim();
  const deckRenameBtn = options.deckRenameBtn || null;
  const deckDeleteBtn = options.deckDeleteBtn || null;
  const terminals = options.terminals;
  const terminalObservers = options.terminalObservers;
  const resizeTimers = options.resizeTimers;
  const terminalSizes = options.terminalSizes;
  const sessionThemeDrafts = options.sessionThemeDrafts;
  const template = options.template || null;
  const gridEl = options.gridEl || null;
  const getActiveDeck = options.getActiveDeck || (() => null);
  const resolveSessionDeckId = options.resolveSessionDeckId || (() => defaultDeckId);
  const getSessionFilterText = options.getSessionFilterText || (() => "");
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const resolveDeckSessions =
    typeof options.resolveDeckSessions === "function" ? options.resolveDeckSessions : (_deckId, sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const pruneQuickIds = options.pruneQuickIds || (() => {});
  const renderDeckTabs = options.renderDeckTabs || (() => {});
  const workspaceRenderController = options.workspaceRenderController || null;
  const getCommandTargetSummary = options.getCommandTargetSummary || (() => "");
  const syncActiveTerminalSearch = options.syncActiveTerminalSearch || (() => {});
  const sessionDisposalController = options.sessionDisposalController || null;
  const closeSettingsDialog = options.closeSettingsDialog || (() => {});
  const onSessionDisposed = options.onSessionDisposed || (() => {});
  const terminalSearchState = options.terminalSearchState || {};
  const clearTerminalSearchSelection = options.clearTerminalSearchSelection || (() => {});
  const sessionCardRenderController = options.sessionCardRenderController || null;
  const sessionCardFactoryController = options.sessionCardFactoryController || null;
  const sessionCardInteractionsController = options.sessionCardInteractionsController || null;
  const sessionTerminalRuntimeController = options.sessionTerminalRuntimeController || null;
  const onSessionMounted = options.onSessionMounted || (() => {});
  const resolveInitialTheme = options.resolveInitialTheme || (() => ({}));
  const handleSessionTerminalInput = options.handleSessionTerminalInput || (() => {});
  const handleSessionTerminalPaste = options.handleSessionTerminalPaste || handleSessionTerminalInput;
  const syncSessionStartupControls = options.syncSessionStartupControls || (() => {});
  const syncSessionInputSafetyControls = options.syncSessionInputSafetyControls || (() => {});
  const syncSessionThemeControls = options.syncSessionThemeControls || (() => {});
  const setSettingsDirty = options.setSettingsDirty || (() => {});
  const applyResizeForSession = options.applyResizeForSession || (() => {});
  const scheduleGlobalResize = options.scheduleGlobalResize || (() => {});
  const scheduleDeferredResizePasses = options.scheduleDeferredResizePasses || (() => {});
  const setActiveSession = options.setActiveSession || (() => {});
  const getSessionById = options.getSessionById || (() => null);
  const toggleSettingsDialog = options.toggleSettingsDialog || (() => {});
  const confirmSessionDelete = options.confirmSessionDelete || (() => true);
  const removeSession = options.removeSession || (() => {});
  const setCommandFeedback = options.setCommandFeedback || (() => {});
  const formatSessionToken = options.formatSessionToken || ((sessionId) => String(sessionId || ""));
  const formatSessionDisplayName = options.formatSessionDisplayName || ((session) => String(session?.name || ""));
  const setError = options.setError || (() => {});
  const clearError = options.clearError || (() => {});
  const applyRuntimeEvent = options.applyRuntimeEvent || (() => false);
  const applyThemeForSession = options.applyThemeForSession || (() => {});
  const getSessionThemeConfig = options.getSessionThemeConfig || (() => ({}));
  const setSessionSendTerminator = options.setSessionSendTerminator || (() => {});
  const setStartupSettingsFeedback = options.setStartupSettingsFeedback || (() => {});
  const requestRender = options.requestRender || (() => {});
  const api = options.api;
  const themeProfileKeys = options.themeProfileKeys || [];
  const debugLog = options.debugLog || (() => {});

  function getCollectionLength(collection) {
    return collection && typeof collection.length === "number" ? collection.length : 0;
  }

  function getCollectionItem(collection, index) {
    if (!collection) {
      return null;
    }
    if (typeof collection.item === "function") {
      return collection.item(index);
    }
    return collection[index] || null;
  }

  function reorderExistingSessionCardsIfNeeded(sessions) {
    if (!gridEl || typeof gridEl.appendChild !== "function" || !Array.isArray(sessions) || sessions.length === 0) {
      return;
    }

    const desiredNodes = sessions
      .map((session) => terminals.get(session.id)?.element || null)
      .filter(Boolean);
    if (desiredNodes.length === 0) {
      return;
    }

    const children = gridEl.children;
    if (!children || getCollectionLength(children) === 0) {
      for (const node of desiredNodes) {
        gridEl.appendChild(node);
      }
      return;
    }

    let needsReorder = getCollectionLength(children) < desiredNodes.length;
    if (!needsReorder) {
      for (let index = 0; index < desiredNodes.length; index += 1) {
        if (getCollectionItem(children, index) !== desiredNodes[index]) {
          needsReorder = true;
          break;
        }
      }
    }

    if (!needsReorder) {
      return;
    }

    for (const node of desiredNodes) {
      gridEl.appendChild(node);
    }
  }

  function renderWorkspace({ state, uiState, startupPerf, nowMs, maybeReportStartupPerf, resolveFilterSelectors }) {
    const activeDeck = getActiveDeck();
    const activeDeckId = activeDeck ? activeDeck.id : "";
    const orderedSessions = sortSessionsByQuickId(state.sessions);
    const activeDeckSessions = activeDeckId
      ? orderedSessions.filter((session) => resolveSessionDeckId(session) === activeDeckId)
      : orderedSessions.slice();
    const deckSessions = resolveDeckSessions(activeDeckId, activeDeckSessions, {
      activeDeck,
      sessions: orderedSessions
    });

    renderDeckTabs(orderedSessions);
    const hasDecks = state.decks.length > 0;
    if (deckRenameBtn) {
      deckRenameBtn.disabled = !hasDecks;
    }
    if (deckDeleteBtn) {
      deckDeleteBtn.disabled = !activeDeck || activeDeck.id === defaultDeckId;
    }

    const sessionFilterText = getSessionFilterText();
    const visibilityState =
      workspaceRenderController?.resolveVisibleSessions({
        sessions: state.sessions,
        deckSessions,
        sessionFilterText,
        activeSessionId: state.activeSessionId,
        resolveFilterSelectors,
        setActiveSession
      }) || {};
    const visibleSessionIds = visibilityState.visibleSessionIds || new Set(deckSessions.map((session) => session.id));
    const filterActive = visibilityState.filterActive === true;
    if (visibilityState.switchedActiveSession) {
      return { aborted: true };
    }

    pruneQuickIds(orderedSessions.map((session) => session.id));
    if (orderedSessions.length > 0 && startupPerf.firstNonEmptyRenderAtMs === null) {
      startupPerf.firstNonEmptyRenderAtMs = nowMs();
      maybeReportStartupPerf();
    }

    debugLog("ui.render", {
      sessions: orderedSessions.length,
      deckSessions: deckSessions.length,
      visibleSessions: visibleSessionIds.size,
      activeSessionId: state.activeSessionId,
      connectionState: state.connectionState,
      loading: uiState.loading,
      hasError: Boolean(uiState.error)
    });

    workspaceRenderController?.renderEmptyState({
      sessions: orderedSessions,
      deckSessions,
      visibleSessionIds,
      filterActive
    });
    workspaceRenderController?.renderStatus({
      connectionState: state.connectionState,
      loading: uiState.loading,
      startupGateActive: uiState.startupGateActive,
      startupGateMessage: uiState.startupGateMessage,
      startupGateDetail: uiState.startupGateDetail,
      startupGateCanSkip: uiState.startupGateCanSkip,
      error: uiState.error,
      commandTargetText: getCommandTargetSummary(),
      commandFeedback: uiState.commandFeedback,
      commandInlineHint: uiState.commandInlineHint,
      commandInlineHintPrefixPx: uiState.commandInlineHintPrefixPx,
      commandPreview: uiState.commandPreview,
      commandSuggestions: uiState.commandSuggestions,
      commandGuardActive: uiState.commandGuardActive,
      commandGuardSummary: uiState.commandGuardSummary,
      commandGuardReasons: uiState.commandGuardReasons,
      commandGuardPreview: uiState.commandGuardPreview
    });
    syncActiveTerminalSearch({ preserveSelection: true });

    const activeIds = new Set(orderedSessions.map((session) => session.id));
    let shouldRunResizePass =
      sessionDisposalController?.cleanupRemovedSessions({
        activeSessionIds: activeIds,
        terminals,
        terminalObservers,
        closeSettingsDialog,
        onSessionDisposed,
        terminalSearchState,
        clearTerminalSearchSelection,
        resizeTimers,
        terminalSizes,
        sessionThemeDrafts
      }) === true;

    for (const session of orderedSessions) {
      if (terminals.has(session.id)) {
        const entry = terminals.get(session.id);
        const nextVisible = visibleSessionIds.has(session.id);
        sessionCardRenderController?.updateExistingSessionCard({
          entry,
          session,
          activeSessionId: state.activeSessionId,
          nextVisible
        });
        continue;
      }

      const initialVisible = visibleSessionIds.has(session.id);
      const refs =
        sessionCardFactoryController?.createSessionCardView({
          template,
          session,
          themeProfileKeys,
          activeSessionId: state.activeSessionId,
          visible: initialVisible
        }) || {};

      sessionCardInteractionsController?.bindSessionCardInteractions({
        session,
        refs: {
          focusBtn: refs.focusBtn,
          settingsBtn: refs.settingsBtn,
          renameBtn: refs.renameBtn,
          closeBtn: refs.closeBtn,
          settingsDialog: refs.settingsDialog,
          settingsDismissBtn: refs.settingsDismissBtn,
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          inputSafetyPresetSelect: refs.inputSafetyPresetSelect,
          sessionTagsInput: refs.sessionTagsInput,
          startFeedback: refs.startFeedback,
          themeCategory: refs.themeCategory,
          themeSearch: refs.themeSearch,
          themeSlotSelect: refs.themeSlotSelect,
          themeSelect: refs.themeSelect,
          themeBg: refs.themeBg,
          themeFg: refs.themeFg,
          themeInputs: refs.themeInputs,
          settingsApplyBtn: refs.settingsApplyBtn,
          settingsCancelBtn: refs.settingsCancelBtn
        },
        api,
        getSession: () => getSessionById(session.id),
        getEntry: () => terminals.get(session.id),
        onActivateSession: setActiveSession,
        toggleSettingsDialog,
        closeSettingsDialog,
        confirmSessionDelete,
        removeSession,
        setCommandFeedback,
        formatSessionToken,
        formatSessionDisplayName,
        setError,
        clearError,
        applyRuntimeEvent,
        syncSessionThemeControls,
        syncSessionStartupControls,
        applyThemeForSession,
        getSessionThemeConfig,
        sessionThemeDrafts,
        setSettingsDirty,
        setSessionSendTerminator,
        setStartupSettingsFeedback,
        requestRender
      });

      sessionTerminalRuntimeController?.mountSessionTerminalCard({
        session,
        refs: {
          node: refs.node,
          focusBtn: refs.focusBtn,
          quickIdEl: refs.quickIdEl,
          stateBadgeEl: refs.stateBadgeEl,
          sessionMetaRowEl: refs.sessionMetaRowEl,
          sessionNoteEl: refs.sessionNoteEl,
          unrestoredHintEl: refs.unrestoredHintEl,
          settingsDialog: refs.settingsDialog,
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          inputSafetyPresetSelect: refs.inputSafetyPresetSelect,
          sessionTagsInput: refs.sessionTagsInput,
          startFeedback: refs.startFeedback,
          tagListEl: refs.tagListEl,
          settingsApplyBtn: refs.settingsApplyBtn,
          settingsStatus: refs.settingsStatus,
          themeCategory: refs.themeCategory,
          themeSearch: refs.themeSearch,
          themeSlotSelect: refs.themeSlotSelect,
          themeSelect: refs.themeSelect,
          themeBg: refs.themeBg,
          themeFg: refs.themeFg,
          themeInputs: refs.themeInputs,
          mount: refs.mount
        },
        initialVisible,
        gridEl,
        terminals,
        terminalObservers,
        resolveInitialTheme,
        onSessionMounted,
        onTerminalData: handleSessionTerminalInput,
        onTerminalPaste: handleSessionTerminalPaste,
        afterEntryRegistered: (entry, currentSession) => {
          syncSessionStartupControls(entry, currentSession);
          syncSessionInputSafetyControls(entry, currentSession);
          syncSessionThemeControls(entry, currentSession.id);
          setSettingsDirty(entry, false);
        },
        onFirstTerminalMounted: () => {
          if (startupPerf.firstTerminalMountedAtMs === null) {
            startupPerf.firstTerminalMountedAtMs = nowMs();
            maybeReportStartupPerf();
          }
        },
        applyResizeForSession
      });
      shouldRunResizePass = true;
    }

    reorderExistingSessionCardsIfNeeded(orderedSessions);

    syncActiveTerminalSearch({ preserveSelection: true });

    if (shouldRunResizePass) {
      scheduleGlobalResize();
      scheduleDeferredResizePasses();
    }

    return {
      aborted: false,
      activeDeckId,
      deckSessions,
      visibleSessionIds,
      filterActive
    };
  }

  return {
    renderWorkspace
  };
}
