export function buildCommandExecutionResult(ok, feedback) {
  return Object.freeze({
    ok: ok === true,
    feedback: typeof feedback === "string" ? feedback : String(feedback || "")
  });
}

export function isCommandExecutionFailure(feedback) {
  const text = String(feedback || "").trim();
  if (!text) {
    return false;
  }
  return [
    /^Usage: /,
    /^Unknown command: /,
    /^No /,
    /^Unknown /,
    /^Ambiguous /,
    /^Missing /,
    /^Failed /,
    /^Display filter failed/i,
    /must resolve to exactly one session/i,
    /^Default deck cannot be deleted\./,
    /^Deck '.+' is not empty\./,
    /^Scoped custom command /,
    /^Custom command not found:/,
    /^Custom command definition error:/,
    /^Multiple scoped custom commands share /,
    /^Field '.+'/
  ].some((pattern) => pattern.test(text));
}

export function resolveSlashCommandWithRegistry(interpreted, slashCommandRegistry) {
  const resolved = slashCommandRegistry?.resolve?.(interpreted?.command);
  if (!resolved) {
    return Object.freeze({
      commandRaw: String(interpreted?.command || ""),
      command: String(interpreted?.command || "").toLowerCase(),
      args: Array.isArray(interpreted?.args) ? interpreted.args.slice() : [],
      matchedAlias: null
    });
  }
  return Object.freeze({
    commandRaw: String(interpreted?.command || ""),
    command: resolved.canonicalCommand || String(interpreted?.command || "").toLowerCase(),
    args: [...resolved.argsPrefix, ...(Array.isArray(interpreted?.args) ? interpreted.args : [])],
    matchedAlias: resolved.entry?.isAlias === true ? resolved.entry : null
  });
}

export function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

export function parseJsonObjectToken(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} JSON must be an object.`);
  }
  return parsed;
}

export function formatConnectionDraftReport(draft, normalizeConnectionProfileLaunch) {
  if (!draft || typeof draft !== "object") {
    return "No connection profile draft available.";
  }
  const normalizedLaunch = normalizeConnectionProfileLaunch?.(draft.launch) || {};
  return [
    "Connection profile draft",
    `mode=${JSON.stringify(String(draft.mode || "blank"))}`,
    `profileId=${JSON.stringify(String(draft.profileId || ""))}`,
    `name=${JSON.stringify(String(draft.name || ""))}`,
    `launch=${JSON.stringify(normalizedLaunch, null, 2)}`
  ].join("\n");
}

export function formatShareTargetLabel(shareLink, sessions, decks, options = {}) {
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || "");
  if (!shareLink || typeof shareLink !== "object") {
    return "unknown";
  }
  if (shareLink.targetType === "session") {
    const session = Array.isArray(sessions) ? sessions.find((entry) => entry.id === shareLink.targetId) || null : null;
    if (session) {
      return `session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
    }
    return `session ${shareLink.targetId || "unknown"}`;
  }
  if (shareLink.targetType === "deck") {
    const deck = Array.isArray(decks) ? decks.find((entry) => entry.id === shareLink.targetId) || null : null;
    if (deck) {
      return `deck [${deck.id}] ${deck.name}`;
    }
    return `deck ${shareLink.targetId || "unknown"}`;
  }
  return "unknown";
}

export function formatShareLinkStatus(shareLink) {
  if (!shareLink || typeof shareLink !== "object") {
    return "unknown";
  }
  if (shareLink.revokedAt) {
    return "revoked";
  }
  if (shareLink.active === true) {
    return "active";
  }
  return "expired";
}

export function formatShareLinkSummary(shareLink, sessions, decks, options = {}) {
  const targetLabel = formatShareTargetLabel(shareLink, sessions, decks, options);
  const permissionMode = String(shareLink?.permissionMode || "read_only");
  const shareStatus = formatShareLinkStatus(shareLink);
  const expiresAt = Number.isInteger(shareLink?.expiresAt) ? new Date(shareLink.expiresAt).toISOString() : "-";
  return `[${shareLink?.id || "unknown"}] ${targetLabel} · ${permissionMode} · ${shareStatus} · expires=${expiresAt}`;
}

export function createCommandExecutorRuntimeRouter(options = {}) {
  const getState =
    typeof options.getState === "function"
      ? options.getState
      : () => ({ sessions: [], decks: [], activeSessionId: "" });
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function"
      ? options.sortSessionsByQuickId
      : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const resolveSlashCommand =
    typeof options.resolveSlashCommand === "function"
      ? options.resolveSlashCommand
      : (interpreted) => ({
          commandRaw: String(interpreted?.command || ""),
          command: String(interpreted?.command || "").toLowerCase(),
          args: Array.isArray(interpreted?.args) ? interpreted.args.slice() : []
        });
  const handlers = Array.isArray(options.handlers) ? options.handlers.filter((handler) => typeof handler === "function") : [];

  async function execute(interpreted) {
    const resolvedSlashCommand = resolveSlashCommand(interpreted);
    const commandRaw = resolvedSlashCommand.commandRaw;
    const command = resolvedSlashCommand.command;
    const args = resolvedSlashCommand.args;
    const state = getState();
    const sessions = sortSessionsByQuickId(state.sessions);
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const activeSessionId = state.activeSessionId;
    const context = {
      commandRaw,
      command,
      args,
      interpreted,
      sessions,
      decks,
      activeSessionId,
      state
    };

    for (const handler of handlers) {
      const feedback = await handler(context);
      if (feedback !== null) {
        return feedback;
      }
    }

    return `Unknown command: /${commandRaw}`;
  }

  async function executeDetailed(interpreted) {
    const feedback = await execute(interpreted);
    return buildCommandExecutionResult(!isCommandExecutionFailure(feedback), feedback);
  }

  return Object.freeze({
    execute,
    executeDetailed
  });
}
