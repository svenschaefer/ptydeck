import { createCommandHelpText, getSlashCommandUsage } from "./command-schema.js";
import {
  buildSessionInputSafetyProfileFromPreset,
  detectSessionInputSafetyPreset,
  normalizeSessionInputSafetyProfile,
  SESSION_INPUT_SAFETY_PRESET_ORDER
} from "./input-safety-profile.js";

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

  function formatUsage(commandName, subcommandName = "") {
    return `Usage: ${getSlashCommandUsage(commandName, subcommandName)}`;
  }

  function formatSessionSettingsReport(session) {
    const token = formatSessionToken(session.id);
    const name = formatSessionDisplayName(session);
    const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
    const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
    const env = session?.env && typeof session.env === "object" ? session.env : {};
    const tags = normalizeSessionTags(session.tags);
    const themeProfile = normalizeThemeProfile(session.themeProfile);
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
      `themeProfile=${JSON.stringify(themeProfile)}`,
      `inputSafetyPreset=${inputSafetyPreset}`,
      `inputSafetyProfile=${JSON.stringify(inputSafetyProfile)}`
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

  async function execute(interpreted) {
    const commandRaw = interpreted.command;
    const command = commandRaw.toLowerCase();
    const args = interpreted.args;
    const state = store.getState();
    const sessions = state.sessions;
    const activeSessionId = state.activeSessionId;

    if (command === "help" || command === "") {
      return createCommandHelpText(systemSlashCommands);
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

    if (command === "custom") {
      if (args[0] === "list") {
        const commands = listCustomCommandState();
        if (!Array.isArray(commands) || commands.length === 0) {
          return "No custom commands defined.";
        }
        return commands.map((entry) => `/${entry.name}`).join("\n");
      }

      if (args[0] === "show") {
        const name = typeof args[1] === "string" ? args[1].trim() : "";
        if (!name) {
          return formatUsage("custom", "show");
        }
        const custom = getCustomCommandState(name);
        if (!custom) {
          return `Custom command not found: /${name}`;
        }
        return `/${custom.name}\n---\n${custom.content}\n---`;
      }

      if (args[0] === "remove") {
        const name = typeof args[1] === "string" ? args[1].trim() : "";
        if (!name) {
          return formatUsage("custom", "remove");
        }
        try {
          await api.deleteCustomCommand(name);
          removeCustomCommandState(name);
          return `Removed custom command /${name}.`;
        } catch (err) {
          if (err && err.status === 404) {
            return `Custom command not found: /${name}`;
          }
          throw err;
        }
      }

      const parsed = parseCustomDefinition(interpreted.raw);
      if (!parsed.ok) {
        return `Custom command definition error: ${parsed.error}`;
      }
      const saved = await api.upsertCustomCommand(parsed.name, parsed.content);
      upsertCustomCommandState(saved);
      return `Saved custom command /${saved.name} (${parsed.mode}).`;
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

    const custom = getCustomCommandState(commandRaw);
    if (custom) {
      let targetSessions = [];
      if (args.length === 0) {
        if (!activeSessionId) {
          return "No active session for custom command execution.";
        }
        const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
        if (!activeSession) {
          return "No active session for custom command execution.";
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
        return "No active session for custom command execution.";
      }
      const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
      if (blockedSessions.length > 0) {
        return getBlockedSessionActionMessage(blockedSessions, "Custom command execution");
      }
      await Promise.all(
        targetSessions.map((session) => {
          const normalizedPayload = normalizeCustomCommandPayloadForShell(custom.content);
          return sendInputWithConfiguredTerminator(
            api.sendInput.bind(api),
            session.id,
            normalizedPayload,
            getSessionSendTerminator(session.id),
            {
              normalizeMode: normalizeSendTerminatorMode,
              delayedSubmitMs
            }
          );
        })
      );
      const normalizedPayload = normalizeCustomCommandPayloadForShell(custom.content);
      for (const session of targetSessions) {
        recordCommandSubmission(session.id, {
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

  return Object.freeze({
    execute
  });
}
