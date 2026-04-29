function findSessionById(sessions, sessionId) {
  return Array.isArray(sessions) ? sessions.find((session) => session.id === sessionId) || null : null;
}

export function resolveSingleSessionForCommand(
  selectorText,
  sessions,
  activeSessionId,
  missingActiveMessage,
  selectorLabel,
  resolveTargetSelectors
) {
  const normalizedSelector = String(selectorText || "").trim();
  if (!normalizedSelector || normalizedSelector.toLowerCase() === "active") {
    if (!activeSessionId) {
      return { error: missingActiveMessage, session: null };
    }
    const activeSession = findSessionById(sessions, activeSessionId);
    if (!activeSession) {
      return { error: missingActiveMessage, session: null };
    }
    return { error: "", session: activeSession };
  }

  const resolvedTargets =
    typeof resolveTargetSelectors === "function"
      ? resolveTargetSelectors(normalizedSelector, sessions, { source: "slash" })
      : { error: "Target resolution unavailable.", sessions: [] };
  if (resolvedTargets.error) {
    return { error: resolvedTargets.error, session: null };
  }
  if (!Array.isArray(resolvedTargets.sessions) || resolvedTargets.sessions.length !== 1) {
    return { error: `${selectorLabel} must resolve to exactly one session.`, session: null };
  }
  return { error: "", session: resolvedTargets.sessions[0] };
}

export function resolveDirectTargetSession(
  interpreted,
  sessions,
  activeSessionId,
  missingActiveMessage,
  selectorLabel,
  resolveTargetSelectors
) {
  const targetSelector = String(interpreted?.targetSelector || "").trim();
  if (!targetSelector) {
    return { error: "", session: null };
  }
  return resolveSingleSessionForCommand(
    targetSelector,
    sessions,
    activeSessionId,
    missingActiveMessage,
    selectorLabel,
    resolveTargetSelectors
  );
}

export function resolveActiveOrDirectTargetSession(
  interpreted,
  sessions,
  activeSessionId,
  missingActiveMessage,
  selectorLabel,
  resolveTargetSelectors
) {
  const directTarget = resolveDirectTargetSession(
    interpreted,
    sessions,
    activeSessionId,
    missingActiveMessage,
    selectorLabel,
    resolveTargetSelectors
  );
  if (directTarget.error || directTarget.session) {
    return directTarget;
  }
  return resolveSingleSessionForCommand(
    "",
    sessions,
    activeSessionId,
    missingActiveMessage,
    selectorLabel,
    resolveTargetSelectors
  );
}

export function createCommandExecutorSessionHandlers(options = {}) {
  const formatUsage =
    typeof options.formatUsage === "function"
      ? options.formatUsage
      : (commandName, subcommandName = "") => `Usage unavailable: ${commandName}${subcommandName ? ` ${subcommandName}` : ""}`;
  const getActiveDeck = typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => null;
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const setActiveSession = typeof options.setActiveSession === "function" ? options.setActiveSession : () => null;
  const resolveTargetSelectors =
    typeof options.resolveTargetSelectors === "function"
      ? options.resolveTargetSelectors
      : () => ({ error: "Target resolution unavailable.", sessions: [] });
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "");
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (id) => String(id || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || "");
  const isSessionExited = typeof options.isSessionExited === "function" ? options.isSessionExited : () => false;
  const isSessionActionBlocked = typeof options.isSessionActionBlocked === "function" ? options.isSessionActionBlocked : () => false;
  const getBlockedSessionActionMessage =
    typeof options.getBlockedSessionActionMessage === "function"
      ? options.getBlockedSessionActionMessage
      : (_sessions, actionLabel) => `${actionLabel} blocked.`;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const resolveDirectTarget =
    typeof options.resolveDirectTargetSession === "function"
      ? options.resolveDirectTargetSession
      : (interpreted, sessions, activeSessionId, missingActiveMessage, selectorLabel) =>
          resolveDirectTargetSession(
            interpreted,
            sessions,
            activeSessionId,
            missingActiveMessage,
            selectorLabel,
            resolveTargetSelectors
          );
  const resolveActiveOrDirectTarget =
    typeof options.resolveActiveOrDirectTargetSession === "function"
      ? options.resolveActiveOrDirectTargetSession
      : (interpreted, sessions, activeSessionId, missingActiveMessage, selectorLabel) =>
          resolveActiveOrDirectTargetSession(
            interpreted,
            sessions,
            activeSessionId,
            missingActiveMessage,
            selectorLabel,
            resolveTargetSelectors
          );
  const swapSessionTokens = typeof options.swapSessionTokens === "function" ? options.swapSessionTokens : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const api = options.api && typeof options.api === "object" ? options.api : {};

  async function executeCloseCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";

    if (sessions.length === 0) {
      return "No sessions available.";
    }

    let targetSessions = [];
    if (args.length === 0) {
      if (!activeSessionId) {
        return "No active session to close.";
      }
      const activeSession = findSessionById(sessions, activeSessionId);
      if (!activeSession) {
        return "No active session to close.";
      }
      targetSessions = [activeSession];
    } else {
      const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = Array.isArray(resolvedTargets.sessions) ? resolvedTargets.sessions : [];
    }

    if (targetSessions.length === 0) {
      return "No active session to close.";
    }

    const exitedTargets = targetSessions.filter((session) => isSessionExited(session));
    const liveTargets = targetSessions.filter((session) => !isSessionExited(session));
    await Promise.all(liveTargets.map((session) => api.deleteSession(session.id)));
    for (const session of targetSessions) {
      applyRuntimeEvent({ type: "session.closed", sessionId: session.id });
    }
    if (exitedTargets.length > 0 && liveTargets.length === 0) {
      return exitedTargets.length === 1
        ? `Removed exited session [${formatSessionToken(exitedTargets[0].id)}] ${formatSessionDisplayName(exitedTargets[0])}.`
        : `Removed ${exitedTargets.length} exited sessions.`;
    }
    if (targetSessions.length === 1) {
      return `Closed session ${targetSessions[0].id.slice(0, 8)}.`;
    }
    return `Closed ${targetSessions.length} sessions.`;
  }

  async function executeSwitchCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeDeckId = getActiveDeck()?.id || "";

    if (args.length === 0) {
      return formatUsage("switch");
    }

    const resolvedTargets = resolveTargetSelectors(args[0], sessions, {
      source: "slash",
      scopeMode: "active-deck",
      activeDeckId
    });
    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }
    if (!Array.isArray(resolvedTargets.sessions) || resolvedTargets.sessions.length !== 1) {
      return "Switch selector must resolve to exactly one session.";
    }

    const target = resolvedTargets.sessions[0];
    const targetDeckId = resolveSessionDeckId(target);
    if (targetDeckId && targetDeckId !== activeDeckId) {
      setActiveDeck(targetDeckId);
    }
    setActiveSession(target.id);
    return `Active session: [${formatSessionToken(target.id)}] ${formatSessionDisplayName(target)}.`;
  }

  async function executeSwapCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];

    if (args.length !== 2 || !args[0] || !args[1]) {
      return formatUsage("swap");
    }

    const leftResolved = resolveTargetSelectors(args[0], sessions, { source: "slash" });
    if (leftResolved.error) {
      return leftResolved.error;
    }
    if (!Array.isArray(leftResolved.sessions) || leftResolved.sessions.length !== 1) {
      return "Swap selector A must resolve to exactly one session.";
    }

    const rightResolved = resolveTargetSelectors(args[1], sessions, { source: "slash" });
    if (rightResolved.error) {
      return rightResolved.error;
    }
    if (!Array.isArray(rightResolved.sessions) || rightResolved.sessions.length !== 1) {
      return "Swap selector B must resolve to exactly one session.";
    }

    const leftSession = leftResolved.sessions[0];
    const rightSession = rightResolved.sessions[0];
    if (leftSession.id === rightSession.id) {
      return "Swap targets resolve to the same session.";
    }

    const leftTokenBefore = formatSessionToken(leftSession.id);
    const rightTokenBefore = formatSessionToken(rightSession.id);
    if (typeof api.swapSessionQuickIds !== "function") {
      if (!swapSessionTokens(leftSession.id, rightSession.id)) {
        return "Failed to swap session quick IDs.";
      }
    } else {
      const result = await api.swapSessionQuickIds(leftSession.id, rightSession.id);
      if (!result?.leftSession || !result?.rightSession) {
        return "Failed to swap session quick IDs.";
      }
      applyRuntimeEvent({ type: "session.updated", session: result.leftSession });
      applyRuntimeEvent({ type: "session.updated", session: result.rightSession });
    }

    requestRender();
    return `Swapped quick IDs: [${leftTokenBefore}] ${formatSessionDisplayName(leftSession)} <-> [${rightTokenBefore}] ${formatSessionDisplayName(rightSession)}.`;
  }

  async function executeCycleCommand(context = {}) {
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";
    const command = String(context.command || "");
    const activeDeckId = getActiveDeck()?.id || "";
    const scopedSessions = activeDeckId
      ? sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId)
      : sessions.slice();

    if (scopedSessions.length === 0) {
      return "No sessions available.";
    }

    const currentIndex = Math.max(
      0,
      scopedSessions.findIndex((session) => session.id === activeSessionId)
    );
    const delta = command === "next" ? 1 : -1;
    const nextIndex = (currentIndex + delta + scopedSessions.length) % scopedSessions.length;
    const nextSession = scopedSessions[nextIndex];
    setActiveSession(nextSession.id);
    return `Active session: [${formatSessionToken(nextSession.id)}] ${formatSessionDisplayName(nextSession)}.`;
  }

  async function executeRenameCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";

    if (args.length === 0) {
      return formatUsage("rename");
    }

    const resolvedTarget = resolveActiveOrDirectTarget(
      interpreted,
      sessions,
      activeSessionId,
      "No active session to rename.",
      "Rename selector"
    );
    if (resolvedTarget.error) {
      return resolvedTarget.error;
    }

    const name = args.join(" ").trim();
    if (!name) {
      return formatUsage("rename");
    }
    if (isSessionExited(resolvedTarget.session)) {
      return getBlockedSessionActionMessage([resolvedTarget.session], "Rename");
    }

    const updated = await api.updateSession(resolvedTarget.session.id, { name });
    applyRuntimeEvent({ type: "session.updated", session: updated });
    return `Renamed session [${formatSessionToken(updated.id)}] to ${updated.name}.`;
  }

  async function executeRestartCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";

    if (sessions.length === 0) {
      return "No sessions available.";
    }

    let targetSessions = [];
    if (args.length === 0) {
      const resolvedTarget = resolveActiveOrDirectTarget(
        interpreted,
        sessions,
        activeSessionId,
        "No active session to restart.",
        "Restart selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      targetSessions = resolvedTarget.session ? [resolvedTarget.session] : [];
    } else {
      const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = Array.isArray(resolvedTargets.sessions) ? resolvedTargets.sessions : [];
    }

    if (targetSessions.length === 0) {
      return "No active session to restart.";
    }

    const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
    if (blockedSessions.length > 0) {
      return getBlockedSessionActionMessage(blockedSessions, "Restart");
    }

    const restartedSessions = await Promise.all(targetSessions.map((session) => api.restartSession(session.id)));
    for (const restarted of restartedSessions) {
      applyRuntimeEvent({ type: "session.updated", session: restarted });
    }
    if (restartedSessions.length > 0) {
      setActiveSession(restartedSessions[0].id);
    }
    if (restartedSessions.length === 1) {
      const restarted = restartedSessions[0];
      return `Restarted session [${formatSessionToken(restarted.id)}] ${formatSessionDisplayName(restarted)}.`;
    }
    return `Restarted ${restartedSessions.length} sessions.`;
  }

  async function executeNoteCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";

    const resolvedTarget = resolveActiveOrDirectTarget(
      interpreted,
      sessions,
      activeSessionId,
      "No active session for /note.",
      "Note selector"
    );
    if (resolvedTarget.error) {
      return resolvedTarget.error;
    }

    const note = args.join(" ").trim();
    const updated = await api.updateSession(resolvedTarget.session.id, { note });
    applyRuntimeEvent({ type: "session.updated", session: updated });
    if (updated?.note) {
      return `Updated note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
    }
    return `Cleared note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
  }

  async function executeStructuredCommand(context = {}) {
    switch (context.command) {
      case "close":
        return executeCloseCommand(context);
      case "switch":
        return executeSwitchCommand(context);
      case "swap":
        return executeSwapCommand(context);
      case "next":
      case "prev":
        return executeCycleCommand(context);
      case "rename":
        return executeRenameCommand(context);
      case "restart":
        return executeRestartCommand(context);
      case "note":
        return executeNoteCommand(context);
      default:
        return null;
    }
  }

  return Object.freeze({
    executeStructuredCommand,
    executeCloseCommand,
    executeSwitchCommand,
    executeSwapCommand,
    executeCycleCommand,
    executeRenameCommand,
    executeRestartCommand,
    executeNoteCommand
  });
}
