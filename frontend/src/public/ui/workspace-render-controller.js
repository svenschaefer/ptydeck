export function createWorkspaceRenderController(options = {}) {
  const stateEl = options.stateEl || null;
  const emptyStateEl = options.emptyStateEl || null;
  const statusMessageEl = options.statusMessageEl || null;
  const commandTargetEl = options.commandTargetEl || null;
  const commandFeedbackEl = options.commandFeedbackEl || null;
  const commandInlineHintEl = options.commandInlineHintEl || null;
  const commandPreviewEl = options.commandPreviewEl || null;
  const commandSuggestionsEl = options.commandSuggestionsEl || null;
  const commandGuardEl = options.commandGuardEl || null;
  const commandGuardSummaryEl = options.commandGuardSummaryEl || null;
  const commandGuardReasonsEl = options.commandGuardReasonsEl || null;
  const commandGuardPreviewEl = options.commandGuardPreviewEl || null;
  const startupWarmupGateEl = options.startupWarmupGateEl || null;
  const startupWarmupMessageEl = options.startupWarmupMessageEl || null;
  const startupWarmupDetailEl = options.startupWarmupDetailEl || null;
  const startupWarmupSkipBtn = options.startupWarmupSkipBtn || null;

  function resolveVisibleSessions({
    sessions = [],
    deckSessions = [],
    sessionFilterText = "",
    activeSessionId = "",
    resolveFilterSelectors,
    setActiveSession
  }) {
    const normalizedFilter = String(sessionFilterText || "").trim();
    const filterActive = normalizedFilter.length > 0;
    const filtered =
      typeof resolveFilterSelectors === "function"
        ? resolveFilterSelectors(sessionFilterText, deckSessions)
        : { sessions: deckSessions.slice() };
    const visibleSessionIds = new Set(filtered.sessions.map((session) => session.id));

    if (filterActive && filtered.sessions.length > 0) {
      const firstVisibleId = filtered.sessions[0].id;
      const activeVisible = activeSessionId && visibleSessionIds.has(activeSessionId);
      if (!activeVisible && typeof setActiveSession === "function") {
        setActiveSession(firstVisibleId);
        return {
          filterActive,
          filtered,
          visibleSessionIds,
          switchedActiveSession: true
        };
      }
    }

    if (!filterActive) {
      visibleSessionIds.clear();
      for (const session of deckSessions) {
        visibleSessionIds.add(session.id);
      }
    }

    return {
      filterActive,
      filtered,
      visibleSessionIds,
      switchedActiveSession: false
    };
  }

  function renderEmptyState({ sessions = [], deckSessions = [], visibleSessionIds, filterActive = false }) {
    if (!emptyStateEl) {
      return;
    }
    if (sessions.length === 0) {
      emptyStateEl.textContent = "No sessions yet. Create one to start.";
      emptyStateEl.style.display = "block";
      return;
    }
    if (deckSessions.length === 0) {
      emptyStateEl.textContent = "No sessions in active deck.";
      emptyStateEl.style.display = "block";
      return;
    }
    if (filterActive && visibleSessionIds.size === 0) {
      emptyStateEl.textContent = "No sessions match current filter.";
      emptyStateEl.style.display = "block";
      return;
    }
    emptyStateEl.textContent = "No sessions yet. Create one to start.";
    emptyStateEl.style.display = "none";
  }

  function renderStatus({
    connectionState = "",
    loading = false,
    startupGateActive = false,
    startupGateMessage = "",
    startupGateDetail = "",
    startupGateCanSkip = false,
    error = "",
    commandTargetText = "",
    commandFeedback = "",
    commandInlineHint = "",
    commandInlineHintPrefixPx = 0,
    commandPreview = "",
    commandSuggestions = "",
    commandGuardActive = false,
    commandGuardSummary = "",
    commandGuardReasons = "",
    commandGuardPreview = ""
  }) {
    if (stateEl) {
      stateEl.textContent = connectionState;
    }
    if (statusMessageEl) {
      if (startupGateActive) {
        statusMessageEl.textContent = startupGateMessage || "Server is starting sessions.";
      } else if (loading) {
        statusMessageEl.textContent = "Loading sessions...";
      } else if (error) {
        statusMessageEl.textContent = error;
      } else if (connectionState !== "connected") {
        statusMessageEl.textContent = `Connection state: ${connectionState}`;
      } else {
        statusMessageEl.textContent = "";
      }
    }
    if (commandFeedbackEl) {
      commandFeedbackEl.textContent = commandFeedback || "";
    }
    if (commandTargetEl) {
      commandTargetEl.textContent = commandTargetText || "";
    }
    if (commandInlineHintEl) {
      commandInlineHintEl.textContent = commandInlineHint || "";
      commandInlineHintEl.style.setProperty("--hint-prefix-px", `${commandInlineHintPrefixPx || 0}px`);
    }
    if (commandPreviewEl) {
      commandPreviewEl.textContent = commandPreview || "";
    }
    if (commandSuggestionsEl) {
      commandSuggestionsEl.textContent = commandSuggestions || "";
    }
    if (commandGuardEl) {
      commandGuardEl.hidden = commandGuardActive !== true;
    }
    if (commandGuardSummaryEl) {
      commandGuardSummaryEl.textContent = commandGuardSummary || "";
    }
    if (commandGuardReasonsEl) {
      commandGuardReasonsEl.textContent = commandGuardReasons || "";
    }
    if (commandGuardPreviewEl) {
      commandGuardPreviewEl.textContent = commandGuardPreview || "";
    }
    if (startupWarmupGateEl) {
      startupWarmupGateEl.hidden = startupGateActive !== true;
    }
    if (startupWarmupMessageEl) {
      startupWarmupMessageEl.textContent = startupGateMessage || "Server is starting sessions.";
    }
    if (startupWarmupDetailEl) {
      startupWarmupDetailEl.textContent = startupGateDetail || "";
    }
    if (startupWarmupSkipBtn) {
      startupWarmupSkipBtn.hidden = startupGateCanSkip !== true;
    }
  }

  return {
    resolveVisibleSessions,
    renderEmptyState,
    renderStatus
  };
}
