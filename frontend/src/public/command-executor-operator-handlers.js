import { createCommandHelpText, createCommandTopicHelpText } from "./command-schema.js";

export function createCommandExecutorOperatorHandlers(options = {}) {
  const store = options.store && typeof options.store === "object" ? options.store : {};
  const api = options.api && typeof options.api === "object" ? options.api : {};
  const defaultDeckId = String(options.defaultDeckId || "default");
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const formatUsage =
    typeof options.formatUsage === "function"
      ? options.formatUsage
      : (commandName, subcommandName = "") => `Usage unavailable: ${commandName}${subcommandName ? ` ${subcommandName}` : ""}`;
  const resolveTargetSelectors =
    typeof options.resolveTargetSelectors === "function"
      ? options.resolveTargetSelectors
      : () => ({ sessions: [], error: "Target resolution unavailable." });
  const resolveDeckToken =
    typeof options.resolveDeckToken === "function"
      ? options.resolveDeckToken
      : () => ({ deck: null, error: "Deck resolution unavailable." });
  const parseSizeCommandArgs =
    typeof options.parseSizeCommandArgs === "function"
      ? options.parseSizeCommandArgs
      : () => ({ ok: false, error: "Terminal size parsing unavailable." });
  const applyTerminalSizeSettings =
    typeof options.applyTerminalSizeSettings === "function" ? options.applyTerminalSizeSettings : async () => {};
  const setSessionFilterText =
    typeof options.setSessionFilterText === "function" ? options.setSessionFilterText : () => {};
  const resolveFilterSelectors =
    typeof options.resolveFilterSelectors === "function"
      ? options.resolveFilterSelectors
      : () => ({ sessions: [], error: "Display filter resolution unavailable." });
  const getActiveDeck =
    typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => ({ id: defaultDeckId, name: defaultDeckId });
  const getSessionCountForDeck =
    typeof options.getSessionCountForDeck === "function" ? options.getSessionCountForDeck : () => 0;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || defaultDeckId);
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || "");
  const getSessionRuntimeState =
    typeof options.getSessionRuntimeState === "function" ? options.getSessionRuntimeState : () => "active";
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => ({ cols: 80, rows: 20 });

  const createDeck = typeof api.createDeck === "function" ? api.createDeck.bind(api) : null;
  const updateDeck = typeof api.updateDeck === "function" ? api.updateDeck.bind(api) : null;
  const deleteDeck = typeof api.deleteDeck === "function" ? api.deleteDeck.bind(api) : null;
  const moveSessionToDeck = typeof api.moveSessionToDeck === "function" ? api.moveSessionToDeck.bind(api) : null;
  const createSession = typeof api.createSession === "function" ? api.createSession.bind(api) : null;

  function getCurrentState(fallbackState = {}) {
    return typeof store.getState === "function" ? store.getState() || fallbackState : fallbackState;
  }

  function setActiveSession(sessionId) {
    if (typeof store.setActiveSession === "function") {
      store.setActiveSession(sessionId);
    }
  }

  async function executeDeckCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const decks = Array.isArray(context.decks) ? context.decks : [];
    const activeDeck = getActiveDeck();
    const subcommand = String(args[0] || "").toLowerCase();
    const rest = args.slice(1);

    if (!subcommand || subcommand === "list") {
      if (decks.length === 0) {
        return "No decks available.";
      }
      return decks
        .map((deck) => {
          const marker = activeDeck && deck.id === activeDeck.id ? "*" : " ";
          const count = getSessionCountForDeck(deck.id, sessions);
          return `${marker} [${deck.id}] ${deck.name} (${count} sessions)`;
        })
        .join("\n");
    }

    if (subcommand === "new") {
      const terminalSettings = getTerminalSettings();
      const name = rest.join(" ").trim();
      if (!name) {
        return formatUsage("deck", "new");
      }
      if (!createDeck) {
        return "Deck creation is unavailable.";
      }
      const created = await createDeck({
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
      if (!updateDeck) {
        return "Deck rename is unavailable.";
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
      const updated = await updateDeck(targetDeck.id, { name });
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
      if (!deleteDeck) {
        return "Deck deletion is unavailable.";
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
        await deleteDeck(targetDeck.id, { force });
      } catch (error) {
        if (error && error.status === 409 && !force) {
          return `Deck '${targetDeck.name}' is not empty. Retry with '/deck delete ${targetDeck.id} force'.`;
        }
        throw error;
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

  async function executeStructuredCommand(context = {}) {
    const command = String(context.command || "").trim().toLowerCase();
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const decks = Array.isArray(context.decks) ? context.decks : [];
    const activeSessionId = String(context.activeSessionId || "");
    const state = context.state && typeof context.state === "object" ? context.state : getCurrentState({});

    if (command === "" || command === "help") {
      if (args.length === 0) {
        return createCommandHelpText(systemSlashCommands);
      }
      const topicHelp = createCommandTopicHelpText(args[0], args[1] || "", systemSlashCommands);
      return topicHelp || createCommandHelpText(systemSlashCommands);
    }

    if (command === "run") {
      return formatUsage("run");
    }

    if (command === "deck") {
      return executeDeckCommand({
        args,
        sessions,
        decks
      });
    }

    if (command === "move") {
      if (args.length !== 2) {
        return formatUsage("move");
      }
      if (!moveSessionToDeck) {
        return "Session move is unavailable.";
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
      const resolvedDeck = resolveDeckToken(deckSelector, decks);
      if (!resolvedDeck.deck) {
        return resolvedDeck.error;
      }

      const moved = await Promise.all(
        resolvedTargets.sessions.map((session) => moveSessionToDeck(resolvedDeck.deck.id, session.id))
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
      const resolved = resolveFilterSelectors(selectorText, sessions, {
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
        setActiveSession(resolved.sessions[0].id);
      }
      const nextState = getCurrentState(state);
      const nextSessions = Array.isArray(nextState.sessions) ? nextState.sessions : [];
      const scopedCount = activeDeckId
        ? nextSessions.filter((session) => resolveSessionDeckId(session) === activeDeckId).length
        : nextSessions.length;
      return `Display filter active (${resolved.sessions.length}/${scopedCount}): ${selectorText}`;
    }

    if (command === "list") {
      if (sessions.length === 0) {
        return "No sessions available.";
      }
      return sessions
        .map((session) => {
          const marker = session.id === activeSessionId ? "*" : " ";
          const token = formatSessionToken(session.id);
          const stateValue = getSessionRuntimeState(session);
          const stateSuffix = stateValue === "active" ? "" : ` [${stateValue}]`;
          return `${marker} [${token}] ${formatSessionDisplayName(session)} (${session.id.slice(0, 8)})${stateSuffix}`;
        })
        .join("\n");
    }

    if (command === "new") {
      if (!createSession) {
        return "Session creation is unavailable.";
      }
      const payload = {};
      if (args.length > 0) {
        payload.shell = args[0];
      }
      const session = await createSession(payload);
      applyRuntimeEvent({ type: "session.created", session });
      setActiveSession(session.id);
      return `Created session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
    }

    return null;
  }

  return Object.freeze({
    executeStructuredCommand
  });
}
