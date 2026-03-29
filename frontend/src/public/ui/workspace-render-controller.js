export function createWorkspaceRenderController(options = {}) {
  const stateEl = options.stateEl || null;
  const accessStateEl = options.accessStateEl || null;
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
  const workflowStatusEl = options.workflowStatusEl || null;
  const workflowTargetEl = options.workflowTargetEl || null;
  const workflowProgressEl = options.workflowProgressEl || null;
  const workflowDetailEl = options.workflowDetailEl || null;
  const workflowResultEl = options.workflowResultEl || null;
  const workflowStopBtn = options.workflowStopBtn || null;
  const workflowInterruptBtn = options.workflowInterruptBtn || null;
  const workflowKillBtn = options.workflowKillBtn || null;
  const createBtn = options.createBtn || null;
  const deckCreateBtn = options.deckCreateBtn || null;
  const commandInput = options.commandInput || null;
  const sendBtn = options.sendBtn || null;
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
    accessSummary = "",
    readOnlySpectator = false,
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
    commandGuardPreview = "",
    workflowStatus = "Workflow: ready.",
    workflowTarget = "Target: no workflow session.",
    workflowProgress = "Progress: 0/0.",
    workflowDetail = "Detail: no workflow running.",
    workflowResult = "",
    workflowCanStop = false,
    workflowCanInterrupt = false,
    workflowCanKill = false
  }) {
    if (stateEl) {
      stateEl.textContent = connectionState;
    }
    if (accessStateEl) {
      const normalizedAccessSummary = String(accessSummary || "").trim();
      accessStateEl.hidden = !normalizedAccessSummary;
      accessStateEl.textContent = normalizedAccessSummary;
      if (normalizedAccessSummary) {
        accessStateEl.setAttribute("title", normalizedAccessSummary);
      } else {
        accessStateEl.removeAttribute("title");
      }
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
    if (workflowStatusEl) {
      workflowStatusEl.textContent = workflowStatus || "Workflow: ready.";
    }
    if (workflowTargetEl) {
      workflowTargetEl.textContent = workflowTarget || "Target: no workflow session.";
    }
    if (workflowProgressEl) {
      workflowProgressEl.textContent = workflowProgress || "Progress: 0/0.";
    }
    if (workflowDetailEl) {
      workflowDetailEl.textContent = workflowDetail || "Detail: no workflow running.";
    }
    if (workflowResultEl) {
      workflowResultEl.textContent = workflowResult || "";
    }
    if (workflowStopBtn) {
      workflowStopBtn.disabled = workflowCanStop !== true;
    }
    if (workflowInterruptBtn) {
      workflowInterruptBtn.disabled = workflowCanInterrupt !== true;
    }
    if (workflowKillBtn) {
      workflowKillBtn.disabled = workflowCanKill !== true;
    }
    if (createBtn) {
      createBtn.disabled = readOnlySpectator === true;
    }
    if (deckCreateBtn) {
      deckCreateBtn.disabled = readOnlySpectator === true;
    }
    if (sendBtn) {
      sendBtn.disabled = readOnlySpectator === true;
    }
    if (commandInput) {
      commandInput.disabled = readOnlySpectator === true;
      if (readOnlySpectator === true) {
        commandInput.setAttribute("aria-disabled", "true");
        commandInput.setAttribute("title", accessSummary || "Read-only spectator mode.");
      } else {
        commandInput.removeAttribute("aria-disabled");
        commandInput.removeAttribute("title");
      }
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
