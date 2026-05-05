import {
  analyzeCustomCommandTemplate,
  compareCustomCommandRecords,
  formatCustomCommandScopeLabel,
  listScopedCustomCommandsByName,
  normalizeCustomCommandRecord,
  parseCustomCommandInvocation,
  parseCustomCommandReferenceArgs,
  renderCustomCommandForSession,
  resolveCustomCommandForSession,
  resolveExactCustomCommand
} from "./custom-command-model.js";

export function createCommandExecutorCustomAdminHandlers(options = {}) {
  const api = options.api && typeof options.api === "object" ? options.api : {};
  const formatUsage = typeof options.formatUsage === "function" ? options.formatUsage : () => "";
  const listCustomCommandState = typeof options.listCustomCommandState === "function" ? options.listCustomCommandState : () => [];
  const removeCustomCommandState =
    typeof options.removeCustomCommandState === "function" ? options.removeCustomCommandState : () => false;
  const parseCustomDefinition =
    typeof options.parseCustomDefinition === "function" ? options.parseCustomDefinition : () => ({ ok: false, error: "unsupported" });
  const upsertCustomCommandState =
    typeof options.upsertCustomCommandState === "function" ? options.upsertCustomCommandState : () => null;
  const resolveSingleSessionForCommand =
    typeof options.resolveSingleSessionForCommand === "function"
      ? options.resolveSingleSessionForCommand
      : () => ({ error: "Session selector resolution unavailable.", session: null });
  const resolveCustomCommandTargets =
    typeof options.resolveCustomCommandTargets === "function"
      ? options.resolveCustomCommandTargets
      : () => ({ error: "Custom command target resolution unavailable.", sessions: [] });
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : () => "default";
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (id) => String(id || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || "");

  function getSessionById(sessionId, sessions) {
    return Array.isArray(sessions) ? sessions.find((session) => session.id === sessionId) || null : null;
  }

  function formatScopedCustomCommandLabel(custom, sessions) {
    return formatCustomCommandScopeLabel(custom, {
      getSessionById: (sessionId) => getSessionById(sessionId, sessions),
      formatSessionToken,
      formatSessionDisplayName
    });
  }

  function listNormalizedCustomCommands() {
    return listCustomCommandState().map((entry) => normalizeCustomCommandRecord(entry)).filter(Boolean).sort(compareCustomCommandRecords);
  }

  function resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands, referenceOptions = {}) {
    const exactRequired = referenceOptions.exactRequired === true;
    if (!reference?.name) {
      return { error: "Custom command name is required.", custom: null, exactSession: null };
    }
    if (reference.scope) {
      if (reference.scope === "session") {
        const resolvedSession = resolveSingleSessionForCommand(
          reference.sessionSelector,
          sessions,
          activeSessionId,
          "No active session for scoped custom command resolution.",
          "Session-scoped custom command selector"
        );
        if (resolvedSession.error) {
          return { error: resolvedSession.error, custom: null, exactSession: null };
        }
        const exact = resolveExactCustomCommand(commands, reference.name, "session", resolvedSession.session.id);
        if (!exact) {
          return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
        }
        return { error: "", custom: exact, exactSession: resolvedSession.session };
      }
      const exact = resolveExactCustomCommand(commands, reference.name, reference.scope, "");
      if (!exact) {
        return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
      }
      return { error: "", custom: exact, exactSession: null };
    }

    const matches = listScopedCustomCommandsByName(commands, reference.name);
    if (matches.length === 0) {
      return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
    }
    if (exactRequired && matches.length > 1) {
      return {
        error: `Multiple scoped custom commands share /${reference.name}. Use scope:global, scope:project, or scope:session:<selector>.`,
        custom: null,
        exactSession: null
      };
    }
    if (activeSessionId) {
      const effective = resolveCustomCommandForSession(commands, reference.name, activeSessionId);
      if (effective) {
        return { error: "", custom: effective, exactSession: null };
      }
    }
    if (matches.length === 1) {
      return { error: "", custom: matches[0], exactSession: null };
    }
    return {
      error: `Multiple scoped custom commands share /${reference.name}. Use scope:global, scope:project, or scope:session:<selector>.`,
      custom: null,
      exactSession: null
    };
  }

  function renderCustomCommandForTargets(commandName, exactCustom, targetSessions, parameterAssignments, decks, commands, sessions) {
    const renderedEntries = [];
    for (const session of targetSessions) {
      const resolvedCustom = exactCustom || resolveCustomCommandForSession(commands, commandName, session.id);
      if (!resolvedCustom) {
        return { error: `Custom command not found: /${commandName}`, entries: [] };
      }
      if (resolvedCustom.scope === "session" && resolvedCustom.sessionId !== session.id) {
        return {
          error: `Scoped custom command /${resolvedCustom.name} is bound to ${formatScopedCustomCommandLabel(resolvedCustom, sessions)}.`,
          entries: []
        };
      }
      const deckId = resolveSessionDeckId(session);
      const deck = Array.isArray(decks) ? decks.find((entry) => entry.id === deckId) || null : null;
      const rendered = renderCustomCommandForSession(resolvedCustom, session, deck, parameterAssignments);
      if (!rendered.ok) {
        return { error: rendered.error, entries: [] };
      }
      renderedEntries.push({ session, text: rendered.text, custom: resolvedCustom });
    }
    return { error: "", entries: renderedEntries };
  }

  function formatCustomCommandPreview(custom, entries, sessions) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return "";
    }
    if (entries.length === 1) {
      const entry = entries[0];
      return [
        `/${custom.name} · ${formatScopedCustomCommandLabel(entry.custom || custom, sessions)} -> [${formatSessionToken(entry.session.id)}] ${formatSessionDisplayName(entry.session)}`,
        "---",
        entry.text,
        "---"
      ].join("\n");
    }
    return entries
      .map((entry) =>
        [
          `[${formatSessionToken(entry.session.id)}] ${formatSessionDisplayName(entry.session)} · ${formatScopedCustomCommandLabel(entry.custom || custom, sessions)}`,
          "---",
          entry.text,
          "---"
        ].join("\n")
      )
      .join("\n\n");
  }

  async function executeStructuredCommand(context = {}) {
    const command = String(context.command || "").trim().toLowerCase();
    if (command !== "custom") {
      return null;
    }

    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const decks = Array.isArray(context.decks) ? context.decks : [];
    const activeSessionId = context.activeSessionId || "";

    if (args[0] === "list") {
      const commands = listNormalizedCustomCommands();
      if (commands.length === 0) {
        return "No custom commands defined.";
      }
      return commands.map((custom) => `/${custom.name} (${custom.kind} · ${formatScopedCustomCommandLabel(custom, sessions)})`).join("\n");
    }

    if (args[0] === "show") {
      const reference = parseCustomCommandReferenceArgs(args.slice(1));
      if (!reference.ok || !reference.name) {
        return formatUsage("custom", "show");
      }
      const commands = listNormalizedCustomCommands();
      const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands);
      if (resolved.error || !resolved.custom) {
        return resolved.error;
      }
      const normalized = resolved.custom;
      const scopeLabel = formatScopedCustomCommandLabel(normalized, sessions);
      if (normalized.kind !== "template") {
        return [
          `/${normalized.name}`,
          "kind: plain",
          `scope: ${scopeLabel}`,
          `precedence: ${normalized.precedence}`,
          "---",
          normalized.content,
          "---"
        ].join("\n");
      }
      const template = analyzeCustomCommandTemplate(normalized.content);
      const metadata = [
        `/${normalized.name}`,
        "kind: template",
        `scope: ${scopeLabel}`,
        `precedence: ${normalized.precedence}`
      ];
      if (template.ok && template.parameters.length > 0) {
        metadata.push(`parameters: ${template.parameters.join(", ")}`);
      }
      if (normalized.templateVariables.length > 0) {
        metadata.push(`templateVariables: ${normalized.templateVariables.join(", ")}`);
      }
      return `${metadata.join("\n")}\n---\n${normalized.content}\n---`;
    }

    if (args[0] === "preview") {
      const reference = parseCustomCommandReferenceArgs(args.slice(1));
      if (!reference.ok || !reference.name) {
        return formatUsage("custom", "preview");
      }
      const commands = listNormalizedCustomCommands();
      const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands);
      if (resolved.error || !resolved.custom) {
        return resolved.error;
      }
      const custom = resolved.custom;
      const invocationRaw = `/${custom.name}${reference.rest.length > 0 ? ` ${reference.rest.join(" ")}` : ""}`;
      const invocation = parseCustomCommandInvocation(invocationRaw, custom);
      if (!invocation.ok) {
        return invocation.error;
      }
      const targetResolution =
        resolved.exactSession && !invocation.targetSelector
          ? { error: "", sessions: [resolved.exactSession] }
          : resolveCustomCommandTargets(
              invocation.targetSelector,
              sessions,
              activeSessionId,
              "No active session for custom command preview."
            );
      if (targetResolution.error) {
        return targetResolution.error;
      }
      const rendered = renderCustomCommandForTargets(
        custom.name,
        reference.scope ? custom : null,
        targetResolution.sessions,
        invocation.parameterAssignments,
        decks,
        commands,
        sessions
      );
      if (rendered.error) {
        return rendered.error;
      }
      return formatCustomCommandPreview(custom, rendered.entries, sessions);
    }

    if (args[0] === "remove") {
      const reference = parseCustomCommandReferenceArgs(args.slice(1));
      if (!reference.ok || !reference.name) {
        return formatUsage("custom", "remove");
      }
      const commands = listNormalizedCustomCommands();
      const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands, {
        exactRequired: true
      });
      if (resolved.error || !resolved.custom) {
        return resolved.error;
      }
      try {
        await api.deleteCustomCommand(resolved.custom.name, {
          scope: resolved.custom.scope,
          sessionId: resolved.custom.sessionId || undefined
        });
        removeCustomCommandState(resolved.custom);
        return `Removed custom command /${resolved.custom.name} (${formatScopedCustomCommandLabel(resolved.custom, sessions)}).`;
      } catch (error) {
        if (error && error.status === 404) {
          return `Custom command not found: /${reference.name}`;
        }
        throw error;
      }
    }

    const parsed = parseCustomDefinition(interpreted.raw);
    if (!parsed.ok) {
      return `Custom command definition error: ${parsed.error}`;
    }
    let sessionId = null;
    if (parsed.scope === "session") {
      const resolvedSession = resolveSingleSessionForCommand(
        parsed.sessionSelector,
        sessions,
        activeSessionId,
        "No active session for session-scoped custom command.",
        "Session-scoped custom command selector"
      );
      if (resolvedSession.error) {
        return resolvedSession.error;
      }
      sessionId = resolvedSession.session.id;
    }
    const saved = await api.upsertCustomCommand(parsed.name, {
      content: parsed.content,
      kind: parsed.kind,
      templateVariables: parsed.templateVariables,
      scope: parsed.scope,
      sessionId
    });
    upsertCustomCommandState(saved);
    const savedRecord = normalizeCustomCommandRecord(saved) || normalizeCustomCommandRecord(parsed);
    const savedLabel = savedRecord?.kind === "template" ? "Saved template custom command" : "Saved custom command";
    return `${savedLabel} /${saved.name} (${parsed.mode} · ${formatScopedCustomCommandLabel(savedRecord || saved, sessions)}).`;
  }

  return Object.freeze({
    executeStructuredCommand,
    listNormalizedCustomCommands,
    renderCustomCommandForTargets
  });
}
