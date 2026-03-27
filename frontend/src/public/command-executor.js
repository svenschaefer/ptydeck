import { createCommandHelpText, createCommandTopicHelpText, createSlashCommandRegistry, getSlashCommandUsage } from "./command-schema.js";
import { formatConnectionProfileSummary } from "./connection-profile-runtime-controller.js";
import {
  buildSessionInputSafetyProfileFromPreset,
  detectSessionInputSafetyPreset,
  normalizeSessionInputSafetyProfile,
  SESSION_INPUT_SAFETY_PRESET_ORDER
} from "./input-safety-profile.js";
import {
  analyzeCustomCommandTemplate,
  compareCustomCommandRecords,
  formatCustomCommandScopeLabel,
  listScopedCustomCommandsByName,
  normalizeCustomCommandRecord,
  parseCustomCommandReferenceArgs,
  parseCustomCommandInvocation,
  resolveCustomCommandForSession,
  resolveExactCustomCommand,
  renderCustomCommandForSession
} from "./custom-command-model.js";

export function createCommandExecutor(options = {}) {
  const store = options.store;
  const api = options.api;
  const defaultDeckId = options.defaultDeckId || "default";
  const delayedSubmitMs = Number.isInteger(options.delayedSubmitMs) ? options.delayedSubmitMs : 80;
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];

  const resolveTargetSelectors = options.resolveTargetSelectors;
  const resolveDeckToken = options.resolveDeckToken;
  const parseSizeCommandArgs = options.parseSizeCommandArgs;
  const applyTerminalSizeSettings = options.applyTerminalSizeSettings;
  const setSessionFilterText = options.setSessionFilterText;
  const getActiveDeck = options.getActiveDeck;
  const getSessionCountForDeck = options.getSessionCountForDeck;
  const applyRuntimeEvent = options.applyRuntimeEvent;
  const setActiveDeck = options.setActiveDeck;
  const resolveSessionDeckId = options.resolveSessionDeckId;
  const formatSessionToken = options.formatSessionToken;
  const formatSessionDisplayName = options.formatSessionDisplayName;
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const swapSessionTokens =
    typeof options.swapSessionTokens === "function" ? options.swapSessionTokens : () => false;
  const getSessionRuntimeState = options.getSessionRuntimeState;
  const isSessionExited = options.isSessionExited;
  const isSessionActionBlocked = options.isSessionActionBlocked;
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage;
  const listCustomCommandState = options.listCustomCommandState;
  const getCustomCommandState = options.getCustomCommandState;
  const removeCustomCommandState = options.removeCustomCommandState;
  const parseCustomDefinition = options.parseCustomDefinition;
  const upsertCustomCommandState = options.upsertCustomCommandState;
  const resolveSettingsTargets = options.resolveSettingsTargets;
  const parseSettingsPayload = options.parseSettingsPayload;
  const normalizeSendTerminatorMode = options.normalizeSendTerminatorMode;
  const setSessionSendTerminator = options.setSessionSendTerminator;
  const getSessionSendTerminator = options.getSessionSendTerminator;
  const sendInputWithConfiguredTerminator = options.sendInputWithConfiguredTerminator;
  const recordCommandSubmission =
    typeof options.recordCommandSubmission === "function" ? options.recordCommandSubmission : () => null;
  const normalizeCustomCommandPayloadForShell = options.normalizeCustomCommandPayloadForShell;
  const normalizeSessionTags = options.normalizeSessionTags;
  const normalizeThemeProfile = options.normalizeThemeProfile;
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => ({ cols: 80, rows: 20 });
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const exportSessionReplayDownload =
    typeof options.exportSessionReplayDownload === "function" ? options.exportSessionReplayDownload : async () => null;
  const exportSessionReplayCopy =
    typeof options.exportSessionReplayCopy === "function" ? options.exportSessionReplayCopy : async () => null;
  const openSessionReplayViewer =
    typeof options.openSessionReplayViewer === "function" ? options.openSessionReplayViewer : async () => null;
  const listLayoutProfiles = typeof options.listLayoutProfiles === "function" ? options.listLayoutProfiles : () => [];
  const listConnectionProfiles = typeof options.listConnectionProfiles === "function" ? options.listConnectionProfiles : () => [];
  const resolveLayoutProfile = typeof options.resolveLayoutProfile === "function" ? options.resolveLayoutProfile : () => ({ profile: null, error: "Unknown layout profile." });
  const resolveConnectionProfile =
    typeof options.resolveConnectionProfile === "function"
      ? options.resolveConnectionProfile
      : () => ({ profile: null, error: "Unknown connection profile." });
  const createLayoutProfileFromCurrent =
    typeof options.createLayoutProfileFromCurrent === "function" ? options.createLayoutProfileFromCurrent : async () => "";
  const createConnectionProfileFromSession =
    typeof options.createConnectionProfileFromSession === "function" ? options.createConnectionProfileFromSession : async () => "";
  const applyLayoutProfile = typeof options.applyLayoutProfile === "function" ? options.applyLayoutProfile : async () => "";
  const applyConnectionProfile = typeof options.applyConnectionProfile === "function" ? options.applyConnectionProfile : async () => "";
  const renameLayoutProfile = typeof options.renameLayoutProfile === "function" ? options.renameLayoutProfile : async () => "";
  const renameConnectionProfile = typeof options.renameConnectionProfile === "function" ? options.renameConnectionProfile : async () => "";
  const deleteLayoutProfile = typeof options.deleteLayoutProfile === "function" ? options.deleteLayoutProfile : async () => "";
  const deleteConnectionProfile = typeof options.deleteConnectionProfile === "function" ? options.deleteConnectionProfile : async () => "";
  const listWorkspacePresets = typeof options.listWorkspacePresets === "function" ? options.listWorkspacePresets : () => [];
  const resolveWorkspacePreset =
    typeof options.resolveWorkspacePreset === "function"
      ? options.resolveWorkspacePreset
      : () => ({ preset: null, error: "Unknown workspace preset." });
  const createWorkspacePresetFromCurrent =
    typeof options.createWorkspacePresetFromCurrent === "function" ? options.createWorkspacePresetFromCurrent : async () => "";
  const applyWorkspacePreset = typeof options.applyWorkspacePreset === "function" ? options.applyWorkspacePreset : async () => "";
  const renameWorkspacePreset = typeof options.renameWorkspacePreset === "function" ? options.renameWorkspacePreset : async () => "";
  const deleteWorkspacePreset = typeof options.deleteWorkspacePreset === "function" ? options.deleteWorkspacePreset : async () => "";
  const getBroadcastStatus = typeof options.getBroadcastStatus === "function" ? options.getBroadcastStatus : () => "Broadcast: off.";
  const enableGroupBroadcast = typeof options.enableGroupBroadcast === "function" ? options.enableGroupBroadcast : async () => "";
  const disableBroadcast = typeof options.disableBroadcast === "function" ? options.disableBroadcast : async () => "";
  const slashCommandRegistry = createSlashCommandRegistry(systemSlashCommands);

  function buildCommandExecutionResult(ok, feedback) {
    return Object.freeze({
      ok: ok === true,
      feedback: typeof feedback === "string" ? feedback : String(feedback || "")
    });
  }

  function isCommandExecutionFailure(feedback) {
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
      /^Multiple scoped custom commands share /,
      /^Field '.+'/
    ].some((pattern) => pattern.test(text));
  }

  function formatUsage(commandName, subcommandName = "") {
    return `Usage: ${getSlashCommandUsage(commandName, subcommandName, systemSlashCommands)}`;
  }

  function resolveSlashCommand(interpreted) {
    const resolved = slashCommandRegistry.resolve(interpreted?.command);
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

  function formatSessionSettingsReport(session) {
    const token = formatSessionToken(session.id);
    const name = formatSessionDisplayName(session);
    const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
    const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
    const env = session?.env && typeof session.env === "object" ? session.env : {};
    const tags = normalizeSessionTags(session.tags);
    const activeThemeProfile = normalizeThemeProfile(session.activeThemeProfile || session.themeProfile);
    const inactiveThemeProfile = normalizeThemeProfile(session.inactiveThemeProfile || session.themeProfile);
    const sendTerminator = getSessionSendTerminator(session.id);
    const inputSafetyProfile = normalizeSessionInputSafetyProfile(session.inputSafetyProfile);
    const inputSafetyPreset = detectSessionInputSafetyPreset(inputSafetyProfile);
    return [
      `[${token}] ${name}`,
      `startCwd=${JSON.stringify(startCwd)}`,
      `startCommand=${JSON.stringify(startCommand)}`,
      `env=${JSON.stringify(env)}`,
      `tags=${JSON.stringify(tags)}`,
      `sendTerminator=${sendTerminator}`,
      `activeThemeProfile=${JSON.stringify(activeThemeProfile)}`,
      `inactiveThemeProfile=${JSON.stringify(inactiveThemeProfile)}`,
      `inputSafetyPreset=${inputSafetyPreset}`,
      `inputSafetyProfile=${JSON.stringify(inputSafetyProfile)}`
    ].join("\n");
  }

  function formatConnectionProfileReport(profile) {
    const launch = profile?.launch && typeof profile.launch === "object" ? profile.launch : {};
    return [
      `[${profile.id}] ${profile.name}`,
      `kind=${JSON.stringify(launch.kind || "local")}`,
      `deckId=${JSON.stringify(launch.deckId || defaultDeckId)}`,
      `shell=${JSON.stringify(launch.shell || "")}`,
      `startCwd=${JSON.stringify(launch.startCwd || "")}`,
      `startCommand=${JSON.stringify(launch.startCommand || "")}`,
      `env=${JSON.stringify(launch.env || {})}`,
      `tags=${JSON.stringify(Array.isArray(launch.tags) ? launch.tags : [])}`,
      `remoteConnection=${JSON.stringify(launch.remoteConnection || null)}`,
      `remoteAuth=${JSON.stringify(launch.remoteAuth || null)}`,
      `activeThemeProfile=${JSON.stringify(launch.activeThemeProfile || {})}`,
      `inactiveThemeProfile=${JSON.stringify(launch.inactiveThemeProfile || {})}`
    ].join("\n");
  }

  function resolveSingleSessionForCommand(selectorText, sessions, activeSessionId, missingActiveMessage, selectorLabel) {
    const normalizedSelector = String(selectorText || "").trim();
    if (!normalizedSelector || normalizedSelector.toLowerCase() === "active") {
      if (!activeSessionId) {
        return { error: missingActiveMessage, session: null };
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return { error: missingActiveMessage, session: null };
      }
      return { error: "", session: activeSession };
    }

    const resolvedTargets = resolveTargetSelectors(normalizedSelector, sessions, { source: "slash" });
    if (resolvedTargets.error) {
      return { error: resolvedTargets.error, session: null };
    }
    if (resolvedTargets.sessions.length !== 1) {
      return { error: `${selectorLabel} must resolve to exactly one session.`, session: null };
    }
    return { error: "", session: resolvedTargets.sessions[0] };
  }

  function resolveCustomCommandTargets(selectorText, sessions, activeSessionId, missingActiveMessage) {
    const normalizedSelector = String(selectorText || "").trim();
    if (!normalizedSelector) {
      if (!activeSessionId) {
        return { error: missingActiveMessage, sessions: [] };
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return { error: missingActiveMessage, sessions: [] };
      }
      return { error: "", sessions: [activeSession] };
    }

    const resolvedTargets = resolveTargetSelectors(normalizedSelector, sessions, { source: "slash" });
    if (resolvedTargets.error) {
      return { error: resolvedTargets.error, sessions: [] };
    }
    if (!Array.isArray(resolvedTargets.sessions) || resolvedTargets.sessions.length === 0) {
      return { error: missingActiveMessage, sessions: [] };
    }
    return { error: "", sessions: resolvedTargets.sessions };
  }

  function listNormalizedCustomCommands() {
    return listCustomCommandState().map((entry) => normalizeCustomCommandRecord(entry)).filter(Boolean).sort(compareCustomCommandRecords);
  }

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

  function resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands, options = {}) {
    const exactRequired = options.exactRequired === true;
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
        error: `Multiple scoped custom commands share /${reference.name}. Use @global, @project, or @session:<selector>.`,
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
      error: `Multiple scoped custom commands share /${reference.name}. Use @global, @project, or @session:<selector>.`,
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

  async function execute(interpreted) {
    const resolvedSlashCommand = resolveSlashCommand(interpreted);
    const commandRaw = resolvedSlashCommand.commandRaw;
    const command = resolvedSlashCommand.command;
    const args = resolvedSlashCommand.args;
    const state = store.getState();
    const sessions = sortSessionsByQuickId(state.sessions);
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const activeSessionId = state.activeSessionId;

    if (command === "" || command === "help") {
      if (args.length === 0) {
        return createCommandHelpText(systemSlashCommands);
      }
      const topicHelp = createCommandTopicHelpText(args[0], args[1] || "", systemSlashCommands);
      if (topicHelp) {
        return topicHelp;
      }
      return createCommandHelpText(systemSlashCommands);
    }

    if (command === "run") {
      return formatUsage("run");
    }

    if (command === "deck") {
      const subcommand = String(args[0] || "").toLowerCase();
      const rest = args.slice(1);
      const decks = state.decks.slice();
      const activeDeck = getActiveDeck();

      if (!subcommand || subcommand === "list") {
        if (decks.length === 0) {
          return "No decks available.";
        }
        const lines = decks.map((deck) => {
          const marker = activeDeck && deck.id === activeDeck.id ? "*" : " ";
          const count = getSessionCountForDeck(deck.id, sessions);
          return `${marker} [${deck.id}] ${deck.name} (${count} sessions)`;
        });
        return lines.join("\n");
      }

      if (subcommand === "new") {
        const terminalSettings = getTerminalSettings();
        const name = rest.join(" ").trim();
        if (!name) {
          return formatUsage("deck", "new");
        }
        const created = await api.createDeck({
          name,
          settings: {
            terminal: {
              cols: terminalSettings.cols,
              rows: terminalSettings.rows
            }
          }
        });
        applyRuntimeEvent(
          {
            type: "deck.created",
            deck: created
          },
          { preferredActiveDeckId: created.id }
        );
        return `Created deck [${created.id}] ${created.name}.`;
      }

      if (subcommand === "rename") {
        if (!activeDeck) {
          return "No active deck to rename.";
        }
        if (rest.length === 0) {
          return formatUsage("deck", "rename");
        }

        let targetDeck = activeDeck;
        let name = "";
        if (rest.length === 1) {
          name = rest[0].trim();
        } else {
          const resolvedDeck = resolveDeckToken(rest[0], decks);
          if (!resolvedDeck.deck) {
            return resolvedDeck.error;
          }
          targetDeck = resolvedDeck.deck;
          name = rest.slice(1).join(" ").trim();
        }

        if (!name) {
          return formatUsage("deck", "rename");
        }
        const updated = await api.updateDeck(targetDeck.id, { name });
        applyRuntimeEvent(
          {
            type: "deck.updated",
            deck: updated
          },
          { preferredActiveDeckId: updated.id }
        );
        return `Renamed deck [${updated.id}] to ${updated.name}.`;
      }

      if (subcommand === "switch") {
        if (rest.length !== 1) {
          return formatUsage("deck", "switch");
        }
        const resolved = resolveDeckToken(rest[0], decks);
        if (!resolved.deck) {
          return resolved.error;
        }
        const changed = setActiveDeck(resolved.deck.id);
        if (!changed) {
          return `Failed to switch deck: ${resolved.deck.id}`;
        }
        return `Active deck: [${resolved.deck.id}] ${resolved.deck.name}.`;
      }

      if (subcommand === "delete") {
        if (!activeDeck) {
          return "No active deck to delete.";
        }
        if (rest.length > 2) {
          return formatUsage("deck", "delete");
        }
        let force = false;
        let selector = "";
        if (rest.length === 1) {
          if (String(rest[0]).toLowerCase() === "force") {
            force = true;
          } else {
            selector = rest[0];
          }
        } else if (rest.length === 2) {
          selector = rest[0];
          if (String(rest[1]).toLowerCase() !== "force") {
            return formatUsage("deck", "delete");
          }
          force = true;
        }

        let targetDeck = activeDeck;
        if (selector) {
          const resolved = resolveDeckToken(selector, decks);
          if (!resolved.deck) {
            return resolved.error;
          }
          targetDeck = resolved.deck;
        }

        if (targetDeck.id === defaultDeckId) {
          return "Default deck cannot be deleted.";
        }

        try {
          await api.deleteDeck(targetDeck.id, { force });
        } catch (err) {
          if (err && err.status === 409 && !force) {
            return `Deck '${targetDeck.name}' is not empty. Retry with '/deck delete ${targetDeck.id} force'.`;
          }
          throw err;
        }

        const fallbackId = decks.find((deck) => deck.id !== targetDeck.id)?.id || defaultDeckId;
        applyRuntimeEvent(
          {
            type: "deck.deleted",
            deckId: targetDeck.id,
            fallbackDeckId: fallbackId
          },
          { preferredActiveDeckId: fallbackId }
        );
        return `Deleted deck [${targetDeck.id}] ${targetDeck.name}.`;
      }

      return formatUsage("deck");
    }

    if (command === "move") {
      if (args.length !== 2) {
        return formatUsage("move");
      }
      const sessionSelector = args[0];
      const deckSelector = args[1];
      const resolvedTargets = resolveTargetSelectors(sessionSelector, sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      if (resolvedTargets.sessions.length === 0) {
        return "No sessions resolved for /move.";
      }
      const resolvedDeck = resolveDeckToken(deckSelector, state.decks);
      if (!resolvedDeck.deck) {
        return resolvedDeck.error;
      }

      const moved = await Promise.all(
        resolvedTargets.sessions.map((session) => api.moveSessionToDeck(resolvedDeck.deck.id, session.id))
      );
      for (const session of moved) {
        applyRuntimeEvent({ type: "session.updated", session });
      }
      if (moved.length === 1) {
        return `Moved session [${formatSessionToken(moved[0].id)}] to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
      }
      return `Moved ${moved.length} sessions to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
    }

    if (command === "size") {
      const terminalSettings = getTerminalSettings();
      const parsed = parseSizeCommandArgs(args, terminalSettings.cols, terminalSettings.rows);
      if (!parsed.ok) {
        return parsed.error;
      }
      await applyTerminalSizeSettings(parsed.cols, parsed.rows);
      const activeDeck = getActiveDeck();
      return `Terminal size set to ${parsed.cols}x${parsed.rows} (cols x rows) for deck '${activeDeck?.name || "unknown"}'.`;
    }

    if (command === "filter") {
      const selectorText = args.join(" ").trim();
      if (!selectorText) {
        setSessionFilterText("");
        return "Display filter cleared.";
      }
      const activeDeck = getActiveDeck();
      let activeDeckId = activeDeck ? activeDeck.id : "";
      const resolved = options.resolveFilterSelectors(selectorText, sessions, {
        scopeMode: "active-deck",
        activeDeckId
      });
      if (resolved.error) {
        return resolved.error;
      }
      setSessionFilterText(selectorText);
      if (selectorText.includes("::") && resolved.sessions.length > 0) {
        const targetDeckId = resolveSessionDeckId(resolved.sessions[0]);
        if (targetDeckId && targetDeckId !== activeDeckId) {
          setActiveDeck(targetDeckId);
          activeDeckId = targetDeckId;
        }
      }
      if (resolved.sessions.length > 0 && !resolved.sessions.some((session) => session.id === activeSessionId)) {
        store.setActiveSession(resolved.sessions[0].id);
      }
      const scopedCount = activeDeckId
        ? store.getState().sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId).length
        : store.getState().sessions.length;
      return `Display filter active (${resolved.sessions.length}/${scopedCount}): ${selectorText}`;
    }

    if (command === "list") {
      if (sessions.length === 0) {
        return "No sessions available.";
      }
      const lines = sessions.map((session) => {
        const marker = session.id === activeSessionId ? "*" : " ";
        const token = formatSessionToken(session.id);
        const stateValue = getSessionRuntimeState(session);
        const stateSuffix = stateValue === "active" ? "" : ` [${stateValue}]`;
        return `${marker} [${token}] ${formatSessionDisplayName(session)} (${session.id.slice(0, 8)})${stateSuffix}`;
      });
      return lines.join("\n");
    }

    if (command === "new") {
      const payload = {};
      if (args.length > 0) {
        payload.shell = args[0];
      }
      const session = await api.createSession(payload);
      applyRuntimeEvent({ type: "session.created", session });
      store.setActiveSession(session.id);
      return `Created session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
    }

    if (command === "close") {
      if (sessions.length === 0) {
        return "No sessions available.";
      }
      let targetSessions = [];
      if (args.length === 0) {
        if (!activeSessionId) {
          return "No active session to close.";
        }
        const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
        if (!activeSession) {
          return "No active session to close.";
        }
        targetSessions = [activeSession];
      } else {
        const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
        if (resolvedTargets.error) {
          return resolvedTargets.error;
        }
        targetSessions = resolvedTargets.sessions;
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

    if (command === "switch") {
      if (args.length === 0) {
        return formatUsage("switch");
      }
      const activeDeckId = getActiveDeck()?.id || "";
      const resolvedTargets = resolveTargetSelectors(args[0], sessions, {
        source: "slash",
        scopeMode: "active-deck",
        activeDeckId
      });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      if (resolvedTargets.sessions.length !== 1) {
        return "Switch selector must resolve to exactly one session.";
      }
      const target = resolvedTargets.sessions[0];
      const targetDeckId = resolveSessionDeckId(target);
      if (targetDeckId && targetDeckId !== activeDeckId) {
        setActiveDeck(targetDeckId);
      }
      store.setActiveSession(target.id);
      return `Active session: [${formatSessionToken(target.id)}] ${formatSessionDisplayName(target)}.`;
    }

    if (command === "swap") {
      if (args.length !== 2 || !args[0] || !args[1]) {
        return formatUsage("swap");
      }
      const leftResolved = resolveTargetSelectors(args[0], sessions, { source: "slash" });
      if (leftResolved.error) {
        return leftResolved.error;
      }
      if (leftResolved.sessions.length !== 1) {
        return "Swap selector A must resolve to exactly one session.";
      }
      const rightResolved = resolveTargetSelectors(args[1], sessions, { source: "slash" });
      if (rightResolved.error) {
        return rightResolved.error;
      }
      if (rightResolved.sessions.length !== 1) {
        return "Swap selector B must resolve to exactly one session.";
      }
      const leftSession = leftResolved.sessions[0];
      const rightSession = rightResolved.sessions[0];
      if (leftSession.id === rightSession.id) {
        return "Swap targets resolve to the same session.";
      }
      const leftTokenBefore = formatSessionToken(leftSession.id);
      const rightTokenBefore = formatSessionToken(rightSession.id);
      if (!swapSessionTokens(leftSession.id, rightSession.id)) {
        return "Failed to swap session quick IDs.";
      }
      requestRender();
      return `Swapped quick IDs: [${leftTokenBefore}] ${formatSessionDisplayName(leftSession)} <-> [${rightTokenBefore}] ${formatSessionDisplayName(rightSession)}.`;
    }

    if (command === "next" || command === "prev") {
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
      store.setActiveSession(nextSession.id);
      return `Active session: [${formatSessionToken(nextSession.id)}] ${formatSessionDisplayName(nextSession)}.`;
    }

    if (command === "rename") {
      if (args.length === 0) {
        return formatUsage("rename");
      }

      if (args.length === 1) {
        if (!activeSessionId) {
          return "No active session to rename.";
        }
        const name = args[0].trim();
        if (!name) {
          return formatUsage("rename");
        }
        const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
        if (isSessionExited(activeSession)) {
          return getBlockedSessionActionMessage([activeSession], "Rename");
        }
        const updated = await api.updateSession(activeSessionId, { name });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        return `Renamed active session to ${updated.name}.`;
      }

      const selectorText = args[0];
      const name = args.slice(1).join(" ").trim();
      if (!name) {
        return formatUsage("rename");
      }
      const resolvedTargets = resolveTargetSelectors(selectorText, sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      if (resolvedTargets.sessions.length !== 1) {
        return "Rename selector must resolve to exactly one session.";
      }
      if (isSessionExited(resolvedTargets.sessions[0])) {
        return getBlockedSessionActionMessage(resolvedTargets.sessions, "Rename");
      }
      const updated = await api.updateSession(resolvedTargets.sessions[0].id, { name });
      applyRuntimeEvent({ type: "session.updated", session: updated });
      return `Renamed session [${formatSessionToken(updated.id)}] to ${updated.name}.`;
    }

    if (command === "restart") {
      if (sessions.length === 0) {
        return "No sessions available.";
      }
      let targetSessions = [];
      if (args.length === 0) {
        if (!activeSessionId) {
          return "No active session to restart.";
        }
        const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
        if (!activeSession) {
          return "No active session to restart.";
        }
        targetSessions = [activeSession];
      } else {
        const resolvedTargets = resolveTargetSelectors(args.join(" "), sessions, { source: "slash" });
        if (resolvedTargets.error) {
          return resolvedTargets.error;
        }
        targetSessions = resolvedTargets.sessions;
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
        store.setActiveSession(restartedSessions[0].id);
      }
      if (restartedSessions.length === 1) {
        const restarted = restartedSessions[0];
        return `Restarted session [${formatSessionToken(restarted.id)}] ${formatSessionDisplayName(restarted)}.`;
      }
      return `Restarted ${restartedSessions.length} sessions.`;
    }

    if (command === "note") {
      if (args.length === 0) {
        return formatUsage("note");
      }

      const resolvedTarget = resolveSingleSessionForCommand(
        args[0],
        sessions,
        activeSessionId,
        "No active session for /note.",
        "Note selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }

      const note = args.slice(1).join(" ").trim();
      const updated = await api.updateSession(resolvedTarget.session.id, { note });
      applyRuntimeEvent({ type: "session.updated", session: updated });
      if (updated?.note) {
        return `Updated note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
      }
      return `Cleared note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
    }

    if (command === "replay") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      if (subcommand !== "view" && subcommand !== "export" && subcommand !== "copy") {
        return formatUsage("replay");
      }
      const selectorText = args[1] || "active";
      const resolvedTarget = resolveSingleSessionForCommand(
        selectorText,
        sessions,
        activeSessionId,
        "No active session for /replay.",
        "Replay selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      if (subcommand === "view") {
        const outcome = await openSessionReplayViewer(resolvedTarget.session);
        return outcome?.feedback || "";
      }
      const outcome =
        subcommand === "copy"
          ? await exportSessionReplayCopy(resolvedTarget.session)
          : await exportSessionReplayDownload(resolvedTarget.session);
      return outcome?.feedback || "";
    }

    if (command === "layout") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      const rest = args.slice(1);
      if (!subcommand || subcommand === "list") {
        const profiles = listLayoutProfiles();
        if (!Array.isArray(profiles) || profiles.length === 0) {
          return "No layout profiles available.";
        }
        return profiles
          .map((profile) => `[${profile.id}] ${profile.name} -> deck=${profile.layout?.activeDeckId || "default"} filter=${JSON.stringify(profile.layout?.sessionFilterText || "")}`)
          .join("\n");
      }

      if (subcommand === "save") {
        const name = rest.join(" ").trim();
        if (!name) {
          return formatUsage("layout", "save");
        }
        return createLayoutProfileFromCurrent(name);
      }

      if (subcommand === "apply") {
        if (rest.length !== 1) {
          return formatUsage("layout", "apply");
        }
        const resolved = resolveLayoutProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        return applyLayoutProfile(resolved.profile.id);
      }

      if (subcommand === "rename") {
        if (rest.length < 2) {
          return formatUsage("layout", "rename");
        }
        const resolved = resolveLayoutProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        const name = rest.slice(1).join(" ").trim();
        if (!name) {
          return formatUsage("layout", "rename");
        }
        return renameLayoutProfile(resolved.profile.id, name);
      }

      if (subcommand === "delete") {
        if (rest.length !== 1) {
          return formatUsage("layout", "delete");
        }
        const resolved = resolveLayoutProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        return deleteLayoutProfile(resolved.profile.id);
      }

      return formatUsage("layout");
    }

    if (command === "connection") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      const rest = args.slice(1);
      if (!subcommand || subcommand === "list") {
        const profiles = listConnectionProfiles();
        if (!Array.isArray(profiles) || profiles.length === 0) {
          return "No connection profiles available.";
        }
        return profiles.map((profile) => formatConnectionProfileSummary(profile)).join("\n");
      }

      if (subcommand === "save") {
        if (rest.length === 0) {
          return formatUsage("connection", "save");
        }
        let targetSession = null;
        let name = "";
        if (rest.length === 1) {
          const resolvedTarget = resolveSingleSessionForCommand(
            "",
            sessions,
            activeSessionId,
            "No active session to save as a connection profile.",
            "Connection profile session selector"
          );
          if (resolvedTarget.error || !resolvedTarget.session) {
            return resolvedTarget.error || "No active session to save as a connection profile.";
          }
          targetSession = resolvedTarget.session;
          name = rest[0].trim();
        } else {
          const selectorToken = String(rest[0] || "").trim();
          const resolvedTarget = resolveSingleSessionForCommand(
            selectorToken,
            sessions,
            activeSessionId,
            "No active session to save as a connection profile.",
            "Connection profile session selector"
          );
          const selectorWasExplicit =
            selectorToken.toLowerCase() === "active" ||
            (!resolvedTarget.error && !!resolvedTarget.session);
          if (selectorWasExplicit) {
            targetSession = resolvedTarget.session;
            name = rest.slice(1).join(" ").trim();
          } else {
            const activeTarget = resolveSingleSessionForCommand(
              "",
              sessions,
              activeSessionId,
              "No active session to save as a connection profile.",
              "Connection profile session selector"
            );
            if (activeTarget.error || !activeTarget.session) {
              return activeTarget.error || "No active session to save as a connection profile.";
            }
            targetSession = activeTarget.session;
            name = rest.join(" ").trim();
          }
        }
        if (!name) {
          return formatUsage("connection", "save");
        }
        return createConnectionProfileFromSession(targetSession, name);
      }

      if (subcommand === "show") {
        if (rest.length !== 1) {
          return formatUsage("connection", "show");
        }
        const resolved = resolveConnectionProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        return formatConnectionProfileReport(resolved.profile);
      }

      if (subcommand === "apply") {
        if (rest.length !== 1) {
          return formatUsage("connection", "apply");
        }
        const resolved = resolveConnectionProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        return applyConnectionProfile(resolved.profile.id);
      }

      if (subcommand === "rename") {
        if (rest.length < 2) {
          return formatUsage("connection", "rename");
        }
        const resolved = resolveConnectionProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        const name = rest.slice(1).join(" ").trim();
        if (!name) {
          return formatUsage("connection", "rename");
        }
        return renameConnectionProfile(resolved.profile.id, name);
      }

      if (subcommand === "delete") {
        if (rest.length !== 1) {
          return formatUsage("connection", "delete");
        }
        const resolved = resolveConnectionProfile(rest[0]);
        if (!resolved.profile) {
          return resolved.error;
        }
        return deleteConnectionProfile(resolved.profile.id);
      }

      return formatUsage("connection");
    }

    if (command === "workspace") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      const rest = args.slice(1);
      if (!subcommand || subcommand === "list") {
        const presets = listWorkspacePresets();
        if (!Array.isArray(presets) || presets.length === 0) {
          return "No workspace presets available.";
        }
        return presets
          .map((preset) => `[${preset.id}] ${preset.name} -> deck=${preset.workspace?.activeDeckId || "default"} layout=${preset.workspace?.layoutProfileId || "-"} decks=${Object.keys(preset.workspace?.deckGroups || {}).length}`)
          .join("\n");
      }

      if (subcommand === "save") {
        const name = rest.join(" ").trim();
        if (!name) {
          return formatUsage("workspace", "save");
        }
        return createWorkspacePresetFromCurrent(name);
      }

      if (subcommand === "apply") {
        if (rest.length !== 1) {
          return formatUsage("workspace", "apply");
        }
        const resolved = resolveWorkspacePreset(rest[0]);
        if (!resolved.preset) {
          return resolved.error;
        }
        return applyWorkspacePreset(resolved.preset.id);
      }

      if (subcommand === "rename") {
        if (rest.length < 2) {
          return formatUsage("workspace", "rename");
        }
        const resolved = resolveWorkspacePreset(rest[0]);
        if (!resolved.preset) {
          return resolved.error;
        }
        const name = rest.slice(1).join(" ").trim();
        if (!name) {
          return formatUsage("workspace", "rename");
        }
        return renameWorkspacePreset(resolved.preset.id, name);
      }

      if (subcommand === "delete") {
        if (rest.length !== 1) {
          return formatUsage("workspace", "delete");
        }
        const resolved = resolveWorkspacePreset(rest[0]);
        if (!resolved.preset) {
          return resolved.error;
        }
        return deleteWorkspacePreset(resolved.preset.id);
      }

      return formatUsage("workspace");
    }

    if (command === "broadcast") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      const selector = args.slice(1).join(" ").trim();

      if (!subcommand || subcommand === "status") {
        return getBroadcastStatus();
      }
      if (subcommand === "off") {
        return disableBroadcast();
      }
      if (subcommand === "group") {
        return enableGroupBroadcast(selector);
      }
      return formatUsage("broadcast");
    }

    if (command === "custom") {
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
          return [`/${normalized.name}`, `kind: plain`, `scope: ${scopeLabel}`, `precedence: ${normalized.precedence}`, "---", normalized.content, "---"].join("\n");
        }
        const template = analyzeCustomCommandTemplate(normalized.content);
        const metadata = [`/${normalized.name}`, "kind: template", `scope: ${scopeLabel}`, `precedence: ${normalized.precedence}`];
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
        } catch (err) {
          if (err && err.status === 404) {
            return `Custom command not found: /${reference.name}`;
          }
          throw err;
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

    if (command === "settings") {
      const showMatch = /^\/settings\s+show(?:\s+([^\s]+))?\s*$/i.exec(interpreted.raw || "");
      if (showMatch) {
        const selectorText = showMatch[1] || "active";
        const resolvedTargets = resolveSettingsTargets(selectorText, sessions, activeSessionId);
        if (resolvedTargets.error) {
          return resolvedTargets.error;
        }
        return resolvedTargets.sessions.map((session) => formatSessionSettingsReport(session)).join("\n\n");
      }

      const applyMatch = /^\/settings\s+apply\s+([^\s]+)\s+([\s\S]+)$/i.exec(interpreted.raw || "");
      if (!applyMatch) {
        return formatUsage("settings");
      }
      const selectorText = applyMatch[1];
      const parsedPayload = parseSettingsPayload(applyMatch[2]);
      if (!parsedPayload.ok) {
        return parsedPayload.error;
      }

      const resolvedTargets = resolveSettingsTargets(selectorText, sessions, activeSessionId);
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      const targets = resolvedTargets.sessions;
      if (targets.length === 0) {
        return "No target sessions resolved for /settings apply.";
      }
      const blockedTargets = targets.filter((session) => isSessionExited(session));
      if (blockedTargets.length > 0) {
        return getBlockedSessionActionMessage(blockedTargets, "Settings apply");
      }

      const payload = parsedPayload.payload;
      const allowedKeys = new Set([
        "startCwd",
        "startCommand",
        "env",
        "tags",
        "themeProfile",
        "activeThemeProfile",
        "inactiveThemeProfile",
        "sendTerminator",
        "inputSafetyProfile",
        "inputSafetyPreset"
      ]);
      const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key));
      if (unknownKeys.length > 0) {
        return `Unknown settings key(s): ${unknownKeys.join(", ")}`;
      }

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(payload, "startCwd")) {
        patch.startCwd = payload.startCwd;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "startCommand")) {
        patch.startCommand = payload.startCommand;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "env")) {
        patch.env = payload.env;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
        patch.tags = payload.tags;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "themeProfile")) {
        patch.themeProfile = payload.themeProfile;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "activeThemeProfile")) {
        patch.activeThemeProfile = payload.activeThemeProfile;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "inactiveThemeProfile")) {
        patch.inactiveThemeProfile = payload.inactiveThemeProfile;
      }
      if (
        Object.prototype.hasOwnProperty.call(payload, "inputSafetyProfile") &&
        Object.prototype.hasOwnProperty.call(payload, "inputSafetyPreset")
      ) {
        return "Specify either inputSafetyProfile or inputSafetyPreset, not both.";
      }
      if (Object.prototype.hasOwnProperty.call(payload, "inputSafetyProfile")) {
        patch.inputSafetyProfile = normalizeSessionInputSafetyProfile(payload.inputSafetyProfile);
      }
      if (Object.prototype.hasOwnProperty.call(payload, "inputSafetyPreset")) {
        const presetKey = String(payload.inputSafetyPreset || "").trim();
        if (!SESSION_INPUT_SAFETY_PRESET_ORDER.includes(presetKey) || presetKey === "custom") {
          return "Invalid inputSafetyPreset. Allowed values: off, shell_syntax_gated, shell_balanced, shell_strict, agent.";
        }
        patch.inputSafetyProfile = buildSessionInputSafetyProfileFromPreset(presetKey);
      }

      let sendTerminatorMode = null;
      if (Object.prototype.hasOwnProperty.call(payload, "sendTerminator")) {
        const requested = String(payload.sendTerminator || "").trim().toLowerCase();
        sendTerminatorMode = normalizeSendTerminatorMode(requested);
        if (requested && requested !== sendTerminatorMode) {
          return "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay.";
        }
      }

      const hasPatch = Object.keys(patch).length > 0;
      const hasTerminator = typeof sendTerminatorMode === "string";
      if (!hasPatch && !hasTerminator) {
        return "No applicable settings keys in payload.";
      }

      if (hasPatch) {
        const updatedSessions = await Promise.all(targets.map((session) => api.updateSession(session.id, patch)));
        for (const updated of updatedSessions) {
          applyRuntimeEvent({ type: "session.updated", session: updated });
        }
      }
      if (hasTerminator) {
        for (const session of targets) {
          setSessionSendTerminator(session.id, sendTerminatorMode);
        }
      }
      const appliedKeys = [
        ...Object.keys(patch),
        ...(hasTerminator ? ["sendTerminator"] : [])
      ];
      return `Applied settings to ${targets.length} session(s): ${appliedKeys.join(", ")}.`;
    }

    const allCustomCommands = listNormalizedCustomCommands();
    const candidateCustom = listScopedCustomCommandsByName(allCustomCommands, commandRaw)[0] || null;
    const custom = normalizeCustomCommandRecord(candidateCustom);
    if (custom) {
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
      await Promise.all(
        rendered.entries.map((entry) => {
          const normalizedPayload = normalizeCustomCommandPayloadForShell(entry.text);
          return sendInputWithConfiguredTerminator(
            api.sendInput.bind(api),
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
