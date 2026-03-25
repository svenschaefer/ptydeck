export function createCommandComposerRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const getCommandValue = options.getCommandValue || (() => "");
  const setCommandValue = options.setCommandValue || (() => {});
  const resetCommandAutocompleteState = options.resetCommandAutocompleteState || (() => {});
  const interpretComposerInput = options.interpretComposerInput || (() => ({ kind: "input", data: "" }));
  const getState = options.getState || (() => ({ sessions: [], activeSessionId: "" }));
  const resolveQuickSwitchTarget = options.resolveQuickSwitchTarget || (() => ({ error: "Unknown target." }));
  const activateSessionTarget = options.activateSessionTarget || (() => ({ message: "" }));
  const activateDeckTarget = options.activateDeckTarget || (() => ({ message: "" }));
  const setCommandFeedback = options.setCommandFeedback || (() => {});
  const setCommandPreview = options.setCommandPreview || (() => {});
  const clearCommandSuggestions = options.clearCommandSuggestions || (() => {});
  const render = options.render || (() => {});
  const debugLog = options.debugLog || (() => {});
  const executeControlCommand = options.executeControlCommand || (() => Promise.resolve(""));
  const recordSlashHistory = options.recordSlashHistory || (() => {});
  const getErrorMessage = options.getErrorMessage || (() => "Failed to execute control command.");
  const resetSlashHistoryNavigationState = options.resetSlashHistoryNavigationState || (() => {});
  const parseDirectTargetRoutingInput = options.parseDirectTargetRoutingInput || (() => ({ matched: false, payload: "", targetToken: "" }));
  const resolveTargetSelectors = options.resolveTargetSelectors || (() => ({ sessions: [], error: "" }));
  const getActiveDeck = options.getActiveDeck || (() => null);
  const formatSessionToken = options.formatSessionToken || ((sessionId) => String(sessionId || ""));
  const formatSessionDisplayName = options.formatSessionDisplayName || ((session) => String(session?.name || ""));
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage || (() => "");
  const isSessionActionBlocked = options.isSessionActionBlocked || (() => false);
  const getSessionSendTerminator = options.getSessionSendTerminator || (() => "CR");
  const apiSendInput = options.apiSendInput || (() => Promise.resolve());
  const sendInputWithConfiguredTerminator = options.sendInputWithConfiguredTerminator || (() => Promise.resolve());
  const normalizeSendTerminatorMode = options.normalizeSendTerminatorMode || ((mode) => mode);
  const delayedSubmitMs = Number(options.delayedSubmitMs) || 0;
  const setError = options.setError || (() => {});
  const clearError = options.clearError || (() => {});
  const getCustomCommandState = options.getCustomCommandState || (() => null);
  const formatQuickSwitchPreview = options.formatQuickSwitchPreview || (() => "");

  let commandPreviewTimer = null;

  function clearPreviewTimer() {
    if (commandPreviewTimer !== null) {
      clearTimeoutFn(commandPreviewTimer);
      commandPreviewTimer = null;
    }
  }

  async function submitCommand() {
    resetCommandAutocompleteState();
    const command = getCommandValue();
    if (!command.trim()) {
      return;
    }

    const interpreted = interpretComposerInput(command);
    if (interpreted.kind === "quick-switch") {
      const state = getState();
      const resolved = resolveQuickSwitchTarget(interpreted.selector, state.sessions);
      if (resolved.error) {
        setCommandFeedback(resolved.error);
        return;
      }
      const result =
        resolved.kind === "session" ? activateSessionTarget(resolved.target) : activateDeckTarget(resolved.target);
      setCommandFeedback(result.message);
      setCommandValue("");
      setCommandPreview("");
      clearCommandSuggestions();
      render();
      return;
    }

    if (interpreted.kind === "control") {
      debugLog("command.control.start", {
        command: interpreted.command,
        argsCount: interpreted.args.length
      });
      try {
        const feedback = await executeControlCommand(interpreted);
        setCommandFeedback(feedback);
        recordSlashHistory(command);
        debugLog("command.control.ok", { command: interpreted.command });
        setCommandValue("");
        setCommandPreview("");
        clearCommandSuggestions();
        resetSlashHistoryNavigationState();
        render();
      } catch (err) {
        setCommandFeedback(getErrorMessage(err, "Failed to execute control command."));
      }
      return;
    }

    const state = getState();
    const sessions = state.sessions;
    const directRouting = parseDirectTargetRoutingInput(interpreted.data);

    let targetSessionId = state.activeSessionId;
    let targetSessions = [];
    let targetPayload = interpreted.data;
    let routeFeedback = "";

    if (directRouting.matched) {
      const resolvedTargets = resolveTargetSelectors(directRouting.targetToken, sessions, {
        source: "direct-route",
        scopeMode: "active-deck",
        activeDeckId: getActiveDeck()?.id || ""
      });
      if (resolvedTargets.error) {
        setCommandFeedback(resolvedTargets.error);
        return;
      }
      targetSessions = resolvedTargets.sessions;
      targetSessionId = targetSessions[0]?.id || "";
      targetPayload = directRouting.payload;
      if (targetSessions.length === 1) {
        routeFeedback = `Sent to [${formatSessionToken(targetSessions[0].id)}] ${formatSessionDisplayName(targetSessions[0])}.`;
      } else {
        routeFeedback = `Sent to ${targetSessions.length} sessions.`;
      }
    }

    if (!targetSessionId) {
      return;
    }
    if (!directRouting.matched) {
      const activeSession = sessions.find((session) => session.id === targetSessionId) || null;
      if (isSessionActionBlocked(activeSession)) {
        setCommandFeedback(getBlockedSessionActionMessage([activeSession], "Command send"));
        return;
      }
    }

    try {
      if (directRouting.matched && targetSessions.length > 0) {
        const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
        if (blockedSessions.length > 0) {
          setCommandFeedback(getBlockedSessionActionMessage(blockedSessions, "Command send"));
          return;
        }
        await Promise.all(
          targetSessions.map((session) => {
            const terminatorMode = getSessionSendTerminator(session.id);
            debugLog("command.send.start", {
              activeSessionId: session.id,
              mode: terminatorMode,
              directRoute: directRouting.matched
            });
            return sendInputWithConfiguredTerminator(apiSendInput, session.id, targetPayload, terminatorMode, {
              normalizeMode: normalizeSendTerminatorMode,
              delayedSubmitMs
            });
          })
        );
      } else {
        const terminatorMode = getSessionSendTerminator(targetSessionId);
        debugLog("command.send.start", {
          activeSessionId: targetSessionId,
          mode: terminatorMode,
          directRoute: directRouting.matched
        });
        await sendInputWithConfiguredTerminator(apiSendInput, targetSessionId, targetPayload, terminatorMode, {
          normalizeMode: normalizeSendTerminatorMode,
          delayedSubmitMs
        });
      }

      setCommandValue("");
      setCommandPreview("");
      clearCommandSuggestions();
      clearError();
      if (routeFeedback) {
        setCommandFeedback(routeFeedback);
      }
      resetSlashHistoryNavigationState();
      debugLog("command.send.ok", { activeSessionId: targetSessionId, directRoute: directRouting.matched });
      render();
    } catch {
      setError("Failed to send command.");
    }
  }

  async function refreshCommandPreview() {
    const rawInput = getCommandValue();
    const interpreted = interpretComposerInput(rawInput);
    if (interpreted.kind === "quick-switch") {
      const preview = formatQuickSwitchPreview(interpreted.selector, getState().sessions);
      setCommandPreview(preview);
      return;
    }
    if (interpreted.kind !== "control") {
      setCommandPreview("");
      return;
    }

    const commandRaw = interpreted.command;
    const command = commandRaw.toLowerCase();
    if (!commandRaw || command === "custom" || command === "help") {
      setCommandPreview("");
      return;
    }
    if (interpreted.args.length > 1) {
      setCommandPreview("");
      return;
    }

    const custom = getCustomCommandState(commandRaw);
    if (custom) {
      setCommandPreview(custom.content || "");
      return;
    }
    setCommandPreview("");
  }

  function scheduleCommandPreview() {
    clearPreviewTimer();
    commandPreviewTimer = setTimeoutFn(() => {
      commandPreviewTimer = null;
      refreshCommandPreview();
    }, 120);
  }

  function dispose() {
    clearPreviewTimer();
  }

  return {
    submitCommand,
    refreshCommandPreview,
    scheduleCommandPreview,
    dispose
  };
}
