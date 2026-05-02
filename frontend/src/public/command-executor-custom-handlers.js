import {
  listScopedCustomCommandsByName,
  normalizeCustomCommandRecord,
  parseCustomCommandInvocation
} from "./custom-command-model.js";

export function createCommandExecutorCustomHandlers(options = {}) {
  const resolveCustomCommandTargets =
    typeof options.resolveCustomCommandTargets === "function"
      ? options.resolveCustomCommandTargets
      : () => ({ error: "Target resolution unavailable.", sessions: [] });
  const renderCustomCommandForTargets =
    typeof options.renderCustomCommandForTargets === "function"
      ? options.renderCustomCommandForTargets
      : () => ({ error: "Custom command rendering unavailable.", entries: [] });
  const isSessionActionBlocked = typeof options.isSessionActionBlocked === "function" ? options.isSessionActionBlocked : () => false;
  const getBlockedSessionActionMessage =
    typeof options.getBlockedSessionActionMessage === "function"
      ? options.getBlockedSessionActionMessage
      : (_sessions, actionLabel) => `${actionLabel} blocked.`;
  const sendInputWithConfiguredTerminator =
    typeof options.sendInputWithConfiguredTerminator === "function" ? options.sendInputWithConfiguredTerminator : async () => {};
  const getSessionSendTerminator =
    typeof options.getSessionSendTerminator === "function" ? options.getSessionSendTerminator : () => null;
  const normalizeSendTerminatorMode =
    typeof options.normalizeSendTerminatorMode === "function" ? options.normalizeSendTerminatorMode : (value) => value;
  const delayedSubmitMs = Number.isInteger(options.delayedSubmitMs) ? options.delayedSubmitMs : 80;
  const recordCustomCommandUsage =
    typeof options.recordCustomCommandUsage === "function" ? options.recordCustomCommandUsage : () => false;
  const recordCommandSubmission =
    typeof options.recordCommandSubmission === "function" ? options.recordCommandSubmission : () => null;
  const normalizeCustomCommandPayloadForShell =
    typeof options.normalizeCustomCommandPayloadForShell === "function"
      ? options.normalizeCustomCommandPayloadForShell
      : (value) => String(value || "");
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (id) => String(id || "");
  const api = options.api && typeof options.api === "object" ? options.api : {};

  async function executeCustomCommand(context = {}) {
    const commandRaw = String(context.commandRaw || "").trim();
    const allCustomCommands = Array.isArray(context.allCustomCommands) ? context.allCustomCommands : [];
    const candidateCustom = listScopedCustomCommandsByName(allCustomCommands, commandRaw)[0] || null;
    const custom = normalizeCustomCommandRecord(candidateCustom);
    if (!custom) {
      return null;
    }

    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const decks = Array.isArray(context.decks) ? context.decks : [];
    const activeSessionId = context.activeSessionId || "";
    const invocation = parseCustomCommandInvocation(interpreted.raw || `/${custom.name}`, custom);
    if (!invocation.ok) {
      return invocation.error;
    }

    const targetResolution = resolveCustomCommandTargets(
      invocation.targetSelector,
      sessions,
      activeSessionId,
      "No active session for custom command execution."
    );
    if (targetResolution.error) {
      return targetResolution.error;
    }

    const targetSessions = targetResolution.sessions;
    const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
    if (blockedSessions.length > 0) {
      return getBlockedSessionActionMessage(blockedSessions, "Custom command execution");
    }

    const rendered = renderCustomCommandForTargets(
      custom.name,
      null,
      targetSessions,
      invocation.parameterAssignments,
      decks,
      allCustomCommands,
      sessions
    );
    if (rendered.error) {
      return rendered.error;
    }

    const sendInput = typeof api.sendInput === "function" ? api.sendInput.bind(api) : null;
    await Promise.all(
      rendered.entries.map((entry) => {
        const normalizedPayload = normalizeCustomCommandPayloadForShell(entry.text);
        return sendInputWithConfiguredTerminator(
          sendInput,
          entry.session.id,
          normalizedPayload,
          getSessionSendTerminator(entry.session.id),
          {
            normalizeMode: normalizeSendTerminatorMode,
            delayedSubmitMs
          }
        );
      })
    );

    for (const entry of rendered.entries) {
      const normalizedPayload = normalizeCustomCommandPayloadForShell(entry.text);
      recordCustomCommandUsage(entry.session.id, entry.custom || custom, {
        usedAt: Date.now()
      });
      recordCommandSubmission(entry.session.id, {
        source: "custom-command",
        commandName: custom.name,
        label: `/${custom.name}`,
        text: normalizedPayload,
        submittedAt: Date.now()
      });
    }

    if (targetSessions.length === 1) {
      return `Executed /${custom.name} on [${formatSessionToken(targetSessions[0].id)}].`;
    }
    return `Executed /${custom.name} on ${targetSessions.length} sessions.`;
  }

  return Object.freeze({
    executeCustomCommand
  });
}
