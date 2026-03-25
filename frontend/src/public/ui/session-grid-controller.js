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
  const pruneQuickIds = options.pruneQuickIds || (() => {});
  const renderDeckTabs = options.renderDeckTabs || (() => {});
  const workspaceRenderController = options.workspaceRenderController || null;
  const syncStatusTicker = options.syncStatusTicker || (() => {});
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
  const syncSessionStartupControls = options.syncSessionStartupControls || (() => {});
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

  function renderWorkspace({ state, uiState, startupPerf, nowMs, maybeReportStartupPerf, resolveFilterSelectors }) {
    const activeDeck = getActiveDeck();
    const activeDeckId = activeDeck ? activeDeck.id : "";
    const deckSessions = activeDeckId
      ? state.sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId)
      : state.sessions.slice();

    renderDeckTabs(state.sessions);
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

    pruneQuickIds(state.sessions.map((session) => session.id));
    if (state.sessions.length > 0 && startupPerf.firstNonEmptyRenderAtMs === null) {
      startupPerf.firstNonEmptyRenderAtMs = nowMs();
      maybeReportStartupPerf();
    }

    debugLog("ui.render", {
      sessions: state.sessions.length,
      deckSessions: deckSessions.length,
      visibleSessions: visibleSessionIds.size,
      activeSessionId: state.activeSessionId,
      connectionState: state.connectionState,
      loading: uiState.loading,
      hasError: Boolean(uiState.error)
    });

    syncStatusTicker(state.sessions);
    workspaceRenderController?.renderEmptyState({
      sessions: state.sessions,
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
      commandFeedback: uiState.commandFeedback,
      commandInlineHint: uiState.commandInlineHint,
      commandInlineHintPrefixPx: uiState.commandInlineHintPrefixPx,
      commandPreview: uiState.commandPreview,
      commandSuggestions: uiState.commandSuggestions
    });
    syncActiveTerminalSearch({ preserveSelection: true });

    const activeIds = new Set(state.sessions.map((session) => session.id));
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

    for (const session of state.sessions) {
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
          sessionArtifactsDismissBtn: refs.sessionArtifactsDismissBtn,
          settingsDialog: refs.settingsDialog,
          settingsDismissBtn: refs.settingsDismissBtn,
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          sessionTagsInput: refs.sessionTagsInput,
          startFeedback: refs.startFeedback,
          themeCategory: refs.themeCategory,
          themeSearch: refs.themeSearch,
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
          pluginBadgesEl: refs.pluginBadgesEl,
          unrestoredHintEl: refs.unrestoredHintEl,
          sessionStatusEl: refs.sessionStatusEl,
          sessionArtifactsOverlayEl: refs.sessionArtifactsOverlayEl,
          sessionArtifactsEl: refs.sessionArtifactsEl,
          sessionArtifactsDismissBtn: refs.sessionArtifactsDismissBtn,
          settingsDialog: refs.settingsDialog,
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          sessionTagsInput: refs.sessionTagsInput,
          startFeedback: refs.startFeedback,
          tagListEl: refs.tagListEl,
          settingsApplyBtn: refs.settingsApplyBtn,
          settingsStatus: refs.settingsStatus,
          themeCategory: refs.themeCategory,
          themeSearch: refs.themeSearch,
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
        afterEntryRegistered: (entry, currentSession) => {
          syncSessionStartupControls(entry, currentSession);
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
