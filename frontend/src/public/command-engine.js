import {
  createSuggestionProviderRegistry,
  normalizeCompletionCandidate,
  normalizeCompletionCandidates
} from "./command-completion.js";
import { createSlashCommandRegistry, getSlashCommandUsage } from "./command-schema.js";
import {
  normalizeCustomCommandName,
  normalizeCustomCommandRecord,
  parseCustomCommandDefinition,
  parseCustomCommandInvocation
} from "./custom-command-model.js";

export function createCustomCommandRegistry() {
  const state = new Map();
  return {
    normalizeName: normalizeCustomCommandName,
    list() {
      return Array.from(state.values()).sort((left, right) => left.name.localeCompare(right.name, "en-US", { sensitivity: "base" }));
    },
    get(name) {
      const normalizedName = normalizeCustomCommandName(name);
      if (!normalizedName) {
        return null;
      }
      return state.get(normalizedName) || null;
    },
    upsert(command) {
      const normalized = normalizeCustomCommandRecord(command);
      if (!normalized) {
        return null;
      }
      state.set(normalized.name, normalized);
      return normalized;
    },
    remove(name) {
      const normalizedName = normalizeCustomCommandName(name);
      if (!normalizedName) {
        return false;
      }
      return state.delete(normalizedName);
    },
    replace(commands) {
      state.clear();
      for (const command of Array.isArray(commands) ? commands : []) {
        const normalized = normalizeCustomCommandRecord(command);
        if (normalized) {
          state.set(normalized.name, normalized);
        }
      }
    }
  };
}

export function createCommandEngine(options = {}) {
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getThemes = typeof options.getThemes === "function" ? options.getThemes : () => [];
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "";
  const getActiveSessionId = typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => null;
  const getSessionToken =
    typeof options.getSessionToken === "function" ? options.getSessionToken : (sessionId) => String(sessionId || "");
  const getSessionDisplayName =
    typeof options.getSessionDisplayName === "function"
      ? options.getSessionDisplayName
      : (session) => session?.name || String(session?.id || "").slice(0, 8);
  const getSessionDeckId =
    typeof options.getSessionDeckId === "function" ? options.getSessionDeckId : (session) => String(session?.deckId || "default");
  const slashCommandRegistry = createSlashCommandRegistry(systemSlashCommands);
  const slashCommandSpecs = normalizeCompletionCandidates(slashCommandRegistry.list(), { replacePrefix: "/" });
  const suggestionProviders = createSuggestionProviderRegistry({
    getSessions,
    getDecks,
    getThemes,
    listCustomCommands,
    getSessionToken,
    getSessionDisplayName,
    getSessionDeckId
  });

  function parseSlashInputForAutocomplete(rawInput) {
    const value = typeof rawInput === "string" ? rawInput : "";
    if (!value.startsWith("/")) {
      return null;
    }
    if (value.includes("\n")) {
      return null;
    }
    return {
      value,
      afterSlash: value.slice(1)
    };
  }

  function parseQuickSwitchInputForAutocomplete(rawInput) {
    const value = typeof rawInput === "string" ? rawInput : "";
    if (!value.startsWith(">")) {
      return null;
    }
    if (value.includes("\n")) {
      return null;
    }
    return {
      value,
      afterMarker: value.slice(1)
    };
  }

  function buildCustomCommandNameList(customCommands) {
    const ordered = [];
    const seen = new Set();
    for (const entry of Array.isArray(customCommands) ? customCommands : []) {
      const normalized = String(entry?.name || "").trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }
    return ordered;
  }

  function getSlashCommandSpec(commandName) {
    return slashCommandRegistry.get(commandName);
  }

  function deriveReplacePrefix(rawInput, token) {
    const input = typeof rawInput === "string" ? rawInput : "";
    const currentToken = typeof token === "string" ? token : "";
    if (!currentToken) {
      return input;
    }
    return input.endsWith(currentToken) ? input.slice(0, input.length - currentToken.length) : input;
  }

  function filterCompletionCandidates(candidates, prefix = "") {
    const normalizedPrefix = normalizeCustomCommandName(prefix);
    const normalizedCandidates = normalizeCompletionCandidates(candidates);
    if (!normalizedPrefix) {
      return normalizedCandidates;
    }
    return normalizedCandidates.filter((candidate) => {
      const normalized = normalizeCompletionCandidate(candidate);
      if (!normalized) {
        return false;
      }
      return (
        normalized.insertText.toLowerCase().startsWith(normalizedPrefix) ||
        normalized.label.toLowerCase().startsWith(`/${normalizedPrefix}`) ||
        normalized.label.toLowerCase().startsWith(normalizedPrefix)
      );
    });
  }

  function buildRootSlashCompletionCandidates(customCommands = listCustomCommands()) {
    const candidates = [...slashCommandSpecs];
    for (const entry of Array.isArray(customCommands) ? customCommands : []) {
      const name = String(entry?.name || "").trim().toLowerCase();
      if (!name) {
        continue;
      }
      candidates.push({
        key: `slash-custom:${name}`,
        insertText: name,
        label: `/${name}`,
        kind: "custom-command",
        description: "saved custom command",
        example: `/${name} 1`
      });
    }
    return normalizeCompletionCandidates(candidates, { replacePrefix: "/" });
  }

  function resolveProviderAutocompleteContext(rawInput, argSpecs, argTokens, context = {}) {
    if (!Array.isArray(argSpecs) || argSpecs.length === 0) {
      return null;
    }
    const trailingSpace = /\s$/.test(String(rawInput || ""));
    const currentToken = trailingSpace ? "" : String(argTokens[argTokens.length - 1] || "");
    const argIndex = trailingSpace ? argTokens.length : Math.max(argTokens.length - 1, 0);
    const argSpec = argSpecs[argIndex] || null;
    if (!argSpec?.provider) {
      return null;
    }
    return {
      replacePrefix: deriveReplacePrefix(rawInput, currentToken),
      matches: suggestionProviders.provide(argSpec.provider, currentToken, context)
    };
  }

  function pushUniqueCandidate(candidates, seen, value, prefix = "") {
    const token = String(value || "").trim();
    if (!token) {
      return;
    }
    const normalizedToken = token.toLowerCase();
    const normalizedPrefix = String(prefix || "").toLowerCase();
    if (normalizedPrefix && !normalizedToken.startsWith(normalizedPrefix)) {
      return;
    }
    if (seen.has(normalizedToken)) {
      return;
    }
    seen.add(normalizedToken);
    candidates.push(token);
  }

  function buildSessionAutocompleteCandidates(prefix = "", extraOptions = {}) {
    const sessions = Array.isArray(extraOptions.sessions) ? extraOptions.sessions : getSessions();
    const includeNamesWithWhitespace = extraOptions.includeNamesWithWhitespace === true;
    const candidates = [];
    const seen = new Set();
    for (const session of sessions) {
      pushUniqueCandidate(candidates, seen, getSessionToken(session.id), prefix);
      const sessionName = String(session?.name || "").trim();
      if (sessionName && (includeNamesWithWhitespace || !/\s/.test(sessionName))) {
        pushUniqueCandidate(candidates, seen, sessionName, prefix);
      }
      pushUniqueCandidate(candidates, seen, session?.id, prefix);
    }
    return candidates;
  }

  function buildDeckAutocompleteCandidates(prefix = "", extraOptions = {}) {
    const candidates = [];
    const seen = new Set();
    const includeExplicitPrefix = extraOptions.includeExplicitPrefix === true;
    for (const deck of getDecks()) {
      const id = String(deck?.id || "").trim();
      const name = String(deck?.name || "").trim();
      if (!id) {
        continue;
      }
      pushUniqueCandidate(candidates, seen, id, prefix);
      pushUniqueCandidate(candidates, seen, name, prefix);
      if (includeExplicitPrefix) {
        pushUniqueCandidate(candidates, seen, `deck:${id}`, prefix);
        pushUniqueCandidate(candidates, seen, `deck:${name}`, prefix);
      }
    }
    return candidates;
  }

  function resolveSessionToken(token, sessions) {
    const normalized = String(token || "").trim();
    if (!normalized) {
      return { session: null, error: "Missing session identifier." };
    }

    const exactId = sessions.find((session) => session.id === normalized);
    if (exactId) {
      return { session: exactId, error: "" };
    }

    const normalizedUpper = normalized.toUpperCase();
    const quickIdMatches = sessions.filter((session) => getSessionToken(session.id).toUpperCase() === normalizedUpper);
    if (quickIdMatches.length === 1) {
      return { session: quickIdMatches[0], error: "" };
    }
    if (quickIdMatches.length > 1) {
      return { session: null, error: `Ambiguous session identifier: ${normalized}` };
    }

    const lower = normalized.toLowerCase();
    const exactNameMatches = sessions.filter((session) => typeof session.name === "string" && session.name.toLowerCase() === lower);
    if (exactNameMatches.length === 1) {
      return { session: exactNameMatches[0], error: "" };
    }
    if (exactNameMatches.length > 1) {
      return { session: null, error: `Ambiguous session identifier: ${normalized}` };
    }

    const prefixMatches = sessions.filter((session) => session.id.startsWith(normalized));
    if (prefixMatches.length === 1) {
      return { session: prefixMatches[0], error: "" };
    }
    if (prefixMatches.length > 1) {
      return { session: null, error: `Ambiguous session identifier: ${normalized}` };
    }

    return { session: null, error: `Unknown session identifier: ${normalized}` };
  }

  function resolveDeckToken(token, decks = getDecks()) {
    const normalized = String(token || "").trim();
    if (!normalized) {
      return { deck: null, error: "Missing deck identifier." };
    }

    const exactId = decks.find((deck) => deck.id === normalized) || null;
    if (exactId) {
      return { deck: exactId, error: "" };
    }

    const lower = normalized.toLowerCase();
    const exactNameMatches = decks.filter((deck) => String(deck?.name || "").toLowerCase() === lower);
    if (exactNameMatches.length === 1) {
      return { deck: exactNameMatches[0], error: "" };
    }
    if (exactNameMatches.length > 1) {
      return { deck: null, error: `Ambiguous deck identifier: ${normalized}` };
    }

    const prefixMatches = decks.filter((deck) => String(deck?.id || "").startsWith(normalized));
    if (prefixMatches.length === 1) {
      return { deck: prefixMatches[0], error: "" };
    }
    if (prefixMatches.length > 1) {
      return { deck: null, error: `Ambiguous deck identifier: ${normalized}` };
    }

    return { deck: null, error: `Unknown deck identifier: ${normalized}` };
  }

  function normalizeSessionTagToken(token) {
    return String(token || "").trim().toLowerCase();
  }

  function resolveCrossDeckSelector(selectorToken, sessions) {
    const normalizedSelector = String(selectorToken || "").trim();
    const splitIndex = normalizedSelector.indexOf("::");
    if (splitIndex <= 0) {
      return {
        ok: false,
        explicit: false,
        sessions,
        token: normalizedSelector,
        error: ""
      };
    }
    const deckToken = normalizedSelector.slice(0, splitIndex).trim();
    const nestedToken = normalizedSelector.slice(splitIndex + 2).trim();
    if (!deckToken || !nestedToken) {
      return {
        ok: true,
        explicit: true,
        sessions: [],
        token: "",
        error: "Cross-deck selector must be '<deckSelector>::<sessionSelector>'."
      };
    }
    const resolvedDeck = resolveDeckToken(deckToken, getDecks());
    if (!resolvedDeck.deck) {
      return {
        ok: true,
        explicit: true,
        sessions: [],
        token: "",
        error: resolvedDeck.error
      };
    }
    return {
      ok: true,
      explicit: true,
      sessions: sessions.filter((session) => getSessionDeckId(session) === resolvedDeck.deck.id),
      token: nestedToken,
      deckId: resolvedDeck.deck.id,
      error: ""
    };
  }

  function resolveSelectorMatches(selector, sessions, extraOptions = {}) {
    const normalized = String(selector || "").trim();
    if (!normalized) {
      return { sessions: [], error: "Missing session identifier." };
    }

    const allSessions = Array.isArray(sessions) ? sessions : [];
    let candidateSessions = allSessions;
    const scopeMode = extraOptions.scopeMode === "active-deck" ? "active-deck" : "all";
    const activeDeckId = String(extraOptions.activeDeckId || "").trim();
    if (scopeMode === "active-deck" && activeDeckId) {
      candidateSessions = allSessions.filter((session) => getSessionDeckId(session) === activeDeckId);
    }

    const crossDeck = resolveCrossDeckSelector(normalized, allSessions);
    if (crossDeck.error) {
      return { sessions: [], error: crossDeck.error };
    }
    if (crossDeck.explicit) {
      candidateSessions = crossDeck.sessions;
    }
    const token = crossDeck.explicit ? crossDeck.token : normalized;
    const normalizedToken = token.toLowerCase();

    if (token === "*") {
      return { sessions: candidateSessions.slice(), error: "" };
    }

    if (normalizedToken.startsWith("deck:")) {
      const deckToken = token.slice("deck:".length).trim();
      if (!deckToken) {
        return { sessions: [], error: "Deck selector must be 'deck:<deckSelector>'." };
      }
      const resolvedDeck = resolveDeckToken(deckToken, getDecks());
      if (!resolvedDeck.deck) {
        return { sessions: [], error: resolvedDeck.error };
      }
      const deckMatches = allSessions.filter((session) => getSessionDeckId(session) === resolvedDeck.deck.id);
      if (deckMatches.length === 0) {
        return { sessions: [], error: `No sessions found for deck '${resolvedDeck.deck.id}'.` };
      }
      return { sessions: deckMatches, error: "" };
    }

    const dedupe = new Map();
    const resolved = resolveSessionToken(token, candidateSessions);
    if (resolved.session) {
      dedupe.set(resolved.session.id, resolved.session);
    }

    const tagToken = normalizeSessionTagToken(token);
    const tagMatches = candidateSessions.filter((session) =>
      Array.isArray(session.tags) && session.tags.some((entry) => normalizeSessionTagToken(entry) === tagToken)
    );
    for (const session of tagMatches) {
      dedupe.set(session.id, session);
    }

    if (dedupe.size === 0) {
      return { sessions: [], error: resolved.error || `Unknown session/tag identifier: ${normalized}` };
    }
    return { sessions: Array.from(dedupe.values()), error: "" };
  }

  function parseSelectorList(text, { source = "slash" } = {}) {
    const raw = String(text || "").trim();
    if (!raw) {
      return [];
    }
    if (source === "direct-route") {
      return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return raw
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function resolveTargetSelectors(selectorText, sessions, extraOptions = {}) {
    const selectorList = parseSelectorList(selectorText, { source: extraOptions.source || "slash" });
    if (selectorList.length === 0) {
      return { sessions: [], error: "Missing session identifier." };
    }
    const dedupe = new Map();
    for (const selector of selectorList) {
      const matched = resolveSelectorMatches(selector, sessions, extraOptions);
      if (matched.error) {
        return { sessions: [], error: matched.error };
      }
      for (const session of matched.sessions) {
        dedupe.set(session.id, session);
      }
    }
    return { sessions: Array.from(dedupe.values()), error: "" };
  }

  function resolveFilterSelectors(selectorText, sessions, extraOptions = {}) {
    const selectorList = parseSelectorList(selectorText, { source: "slash" });
    if (selectorList.length === 0) {
      return { sessions: [], error: "" };
    }
    const scopeMode = extraOptions.scopeMode === "active-deck" ? "active-deck" : "all";
    const activeDeckId = String(extraOptions.activeDeckId || "").trim();
    const allSessions = Array.isArray(sessions) ? sessions : [];
    let candidateSessions = allSessions;
    if (scopeMode === "active-deck" && activeDeckId) {
      candidateSessions = allSessions.filter((session) => getSessionDeckId(session) === activeDeckId);
    }
    const dedupe = new Map();
    for (const selector of selectorList) {
      const crossDeck = resolveCrossDeckSelector(selector, allSessions);
      if (crossDeck.error) {
        return { sessions: [], error: crossDeck.error };
      }
      const selectorSessions = crossDeck.explicit ? crossDeck.sessions : candidateSessions;
      const token = crossDeck.explicit ? crossDeck.token : String(selector || "").trim();
      if (!token) {
        continue;
      }
      if (token === "*") {
        for (const session of selectorSessions) {
          dedupe.set(session.id, session);
        }
        continue;
      }
      const normalizedToken = token.toLowerCase();
      if (normalizedToken.startsWith("deck:")) {
        const deckToken = token.slice("deck:".length).trim();
        if (!deckToken) {
          return { sessions: [], error: "Deck selector must be 'deck:<deckSelector>'." };
        }
        const resolvedDeck = resolveDeckToken(deckToken, getDecks());
        if (!resolvedDeck.deck) {
          return { sessions: [], error: resolvedDeck.error };
        }
        const deckMatches = allSessions.filter((session) => getSessionDeckId(session) === resolvedDeck.deck.id);
        if (deckMatches.length === 0) {
          return { sessions: [], error: `No sessions found for deck '${resolvedDeck.deck.id}'.` };
        }
        for (const session of deckMatches) {
          dedupe.set(session.id, session);
        }
        continue;
      }
      const exactIdMatch = selectorSessions.find((session) => session.id === token) || null;
      let idMatches = [];
      if (exactIdMatch) {
        idMatches = [exactIdMatch];
      } else {
        const prefixMatches = selectorSessions.filter((session) => session.id.startsWith(token));
        if (prefixMatches.length > 1) {
          return { sessions: [], error: `Ambiguous session id prefix: ${token}` };
        }
        idMatches = prefixMatches;
      }
      const tagToken = normalizeSessionTagToken(token);
      const tagMatches = selectorSessions.filter((session) =>
        Array.isArray(session.tags) && session.tags.some((entry) => normalizeSessionTagToken(entry) === tagToken)
      );
      if (idMatches.length === 0 && tagMatches.length === 0) {
        return { sessions: [], error: `Unknown session id/tag: ${token}` };
      }
      for (const session of idMatches) {
        dedupe.set(session.id, session);
      }
      for (const session of tagMatches) {
        dedupe.set(session.id, session);
      }
    }
    return { sessions: Array.from(dedupe.values()), error: "" };
  }

  function resolveSettingsTargets(selectorText, sessions, activeSessionId) {
    const normalized = String(selectorText || "").trim().toLowerCase();
    if (!normalized || normalized === "active") {
      if (!activeSessionId) {
        return { sessions: [], error: "No active session for settings command." };
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return { sessions: [], error: "No active session for settings command." };
      }
      return { sessions: [activeSession], error: "" };
    }
    return resolveTargetSelectors(selectorText, sessions, { source: "slash" });
  }

  function resolveSingleSessionSwitchTarget(selector, sessions) {
    const resolved = resolveSelectorMatches(selector, sessions, { source: "quick-switch" });
    if (resolved.error) {
      return { session: null, error: resolved.error, kind: "unknown" };
    }
    if (resolved.sessions.length === 1) {
      return { session: resolved.sessions[0], error: "", kind: "ok" };
    }
    if (resolved.sessions.length > 1) {
      return {
        session: null,
        error: "Quick-switch selector must resolve to exactly one session.",
        kind: "ambiguous"
      };
    }
    return { session: null, error: "Unknown session identifier.", kind: "unknown" };
  }

  function resolveQuickSwitchTarget(selectorText, sessions = getSessions()) {
    const selector = String(selectorText || "").trim();
    if (!selector) {
      return { kind: "", target: null, error: "Usage: >selector" };
    }

    if (selector.includes("::")) {
      const sessionResolved = resolveSingleSessionSwitchTarget(selector, sessions);
      if (sessionResolved.error) {
        return { kind: "", target: null, error: sessionResolved.error };
      }
      return { kind: "session", target: sessionResolved.session, error: "" };
    }

    if (selector.toLowerCase().startsWith("deck:")) {
      const deckResolved = resolveDeckToken(selector.slice("deck:".length), getDecks());
      if (!deckResolved.deck) {
        return { kind: "", target: null, error: deckResolved.error };
      }
      return { kind: "deck", target: deckResolved.deck, error: "" };
    }

    const sessionResolved = resolveSingleSessionSwitchTarget(selector, sessions);
    const deckResolved = resolveDeckToken(selector, getDecks());
    const hasSession = Boolean(sessionResolved.session);
    const hasDeck = Boolean(deckResolved.deck);

    if (hasSession && hasDeck) {
      return {
        kind: "",
        target: null,
        error: `Ambiguous quick-switch target: '${selector}' matches both a session and a deck. Use 'deck:${selector}' for the deck target.`
      };
    }
    if (hasSession) {
      return { kind: "session", target: sessionResolved.session, error: "" };
    }
    if (sessionResolved.kind === "ambiguous") {
      return { kind: "", target: null, error: sessionResolved.error };
    }
    if (hasDeck) {
      return { kind: "deck", target: deckResolved.deck, error: "" };
    }
    if (deckResolved.error && !deckResolved.error.startsWith("Unknown deck identifier")) {
      return { kind: "", target: null, error: deckResolved.error };
    }
    return { kind: "", target: null, error: sessionResolved.error || deckResolved.error || "Unknown navigation target." };
  }

  function formatQuickSwitchPreview(selectorText, sessions = getSessions()) {
    const resolved = resolveQuickSwitchTarget(selectorText, sessions);
    if (resolved.error) {
      return resolved.error;
    }
    if (resolved.kind === "session" && resolved.target) {
      const targetDeck = getDecks().find((deck) => deck.id === getSessionDeckId(resolved.target)) || null;
      const activation = getActiveSessionId() === resolved.target.id ? "Already active" : "Target session";
      const deckLabel = targetDeck ? ` deck [${targetDeck.id}] ${targetDeck.name}` : "";
      return `${activation}: [${getSessionToken(resolved.target.id)}] ${getSessionDisplayName(resolved.target)}${deckLabel}`;
    }
    if (resolved.kind === "deck" && resolved.target) {
      const activation = getActiveDeckId() === resolved.target.id ? "Already active" : "Target deck";
      return `${activation}: [${resolved.target.id}] ${resolved.target.name}`;
    }
    return "";
  }

  function resolveSlashAutocompleteContext(rawInput, customCommands) {
    const parsed = parseSlashInputForAutocomplete(rawInput);
    if (!parsed) {
      return null;
    }

    const afterSlash = parsed.afterSlash;
    const trailingSpace = /\s$/.test(afterSlash);
    const trimmed = afterSlash.trim();
    const rootCandidates = buildRootSlashCompletionCandidates(customCommands);
    const customNames = buildCustomCommandNameList(customCommands);
    const customSet = new Set(customNames);

    if (!trimmed) {
      return {
        replacePrefix: "/",
        matches: rootCandidates
      };
    }

    const hasWhitespace = /\s/.test(afterSlash);
    const parts = trimmed.split(/\s+/);
    const commandRaw = parts[0] || "";
    const command = commandRaw.toLowerCase();

    if (!hasWhitespace) {
      const matches = filterCompletionCandidates(rootCandidates, command);
      return {
        replacePrefix: "/",
        matches
      };
    }

    if (customSet.has(command) && (trailingSpace || parts.length === 2) && parts.length <= 2) {
      return {
        replacePrefix: deriveReplacePrefix(rawInput, trailingSpace ? "" : String(parts[1] || "")),
        matches: suggestionProviders.provide("session-selector", trailingSpace ? "" : String(parts[1] || ""))
      };
    }

    const spec = getSlashCommandSpec(command);
    if (!spec) {
      return null;
    }

    if (spec.subcommands) {
      const subcommands = Object.values(spec.subcommands);
      const subcommandRaw = String(parts[1] || "");
      const subcommand = subcommandRaw.toLowerCase();
      const resolvedSubcommand = spec.subcommands[subcommand] || null;

      if (parts.length === 1 || (!trailingSpace && parts.length === 2 && !resolvedSubcommand)) {
        return {
          replacePrefix: deriveReplacePrefix(rawInput, parts.length === 2 ? subcommandRaw : ""),
          matches: filterCompletionCandidates(subcommands, parts.length === 2 ? subcommandRaw : "")
        };
      }

      if (!resolvedSubcommand) {
        return null;
      }

      if (!trailingSpace && parts.length === 2) {
        return {
          replacePrefix: deriveReplacePrefix(rawInput, subcommandRaw),
          matches: filterCompletionCandidates([resolvedSubcommand], subcommandRaw)
        };
      }

      return resolveProviderAutocompleteContext(rawInput, resolvedSubcommand.args, parts.slice(2), {
        commandName: command,
        subcommandName: subcommand
      });
    }

    if (spec.args) {
      const context = {
        commandName: command
      };
      if (command === "filter") {
        context.scopeMode = "active-deck";
        context.activeDeckId = getActiveDeckId();
      }
      return resolveProviderAutocompleteContext(rawInput, spec.args, parts.slice(1), context);
    }

    return null;
  }

  function resolveQuickSwitchAutocompleteContext(rawInput) {
    const parsed = parseQuickSwitchInputForAutocomplete(rawInput);
    if (!parsed) {
      return null;
    }

    const rawSelector = parsed.afterMarker;
    const selector = rawSelector.trim();
    if (!selector) {
      return {
        replacePrefix: ">",
        matches: suggestionProviders.provide("quick-switch-target", "", { includeNamesWithWhitespace: true })
      };
    }

    const crossDeckIndex = selector.indexOf("::");
    if (crossDeckIndex >= 0) {
      const deckPrefix = selector.slice(0, crossDeckIndex).trim();
      const nestedPrefix = selector.slice(crossDeckIndex + 2).trim();
      if (!deckPrefix) {
        return {
          replacePrefix: ">",
          matches: suggestionProviders.provide("quick-switch-deck", "")
        };
      }
      const resolvedDeck = resolveDeckToken(deckPrefix, getDecks());
      if (!resolvedDeck.deck) {
        return {
          replacePrefix: ">",
          matches: suggestionProviders.provide("quick-switch-deck", deckPrefix)
        };
      }
      const deckSessions = getSessions().filter((session) => getSessionDeckId(session) === resolvedDeck.deck.id);
      return {
        replacePrefix: deriveReplacePrefix(rawInput, nestedPrefix),
        matches: suggestionProviders.provide("quick-switch-session", nestedPrefix, {
          sessions: deckSessions,
          includeNamesWithWhitespace: true
        })
      };
    }

    if (selector.toLowerCase().startsWith("deck:")) {
      const deckPrefix = selector.slice("deck:".length);
      return {
        replacePrefix: deriveReplacePrefix(rawInput, deckPrefix),
        matches: suggestionProviders.provide("quick-switch-deck", deckPrefix)
      };
    }

    return {
      replacePrefix: ">",
      matches: suggestionProviders.provide("quick-switch-target", selector, {
        includeNamesWithWhitespace: true,
        includeExplicitPrefix: true
      })
    };
  }

  function parseAutocompleteContext(rawInput, customCommands = listCustomCommands()) {
    return resolveSlashAutocompleteContext(rawInput, customCommands) || resolveQuickSwitchAutocompleteContext(rawInput);
  }

  function parseSettingsPayload(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      return { ok: false, error: "Missing JSON payload for /settings apply." };
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Invalid JSON payload for /settings apply." };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Settings payload must be a JSON object." };
    }
    return { ok: true, payload: parsed };
  }

  function parseSizeCommandArgs(args, currentCols, currentRows) {
    const COLS_MIN = 20;
    const COLS_MAX = 400;
    const ROWS_MIN = 5;
    const ROWS_MAX = 120;
    const rawArgs = Array.isArray(args) ? args.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
    const sizeUsage = `Usage: ${getSlashCommandUsage("size")}`;
    if (rawArgs.length === 0) {
      return { ok: false, error: sizeUsage };
    }

    let cols = currentCols;
    let rows = currentRows;
    let updatedCols = false;
    let updatedRows = false;

    const parseBoundedInt = (raw, min, max, label) => {
      if (!/^\d+$/.test(raw)) {
        return { ok: false, error: `${label} must be an integer.` };
      }
      const value = Number.parseInt(raw, 10);
      if (!Number.isInteger(value) || value < min || value > max) {
        return { ok: false, error: `${label} must be between ${min} and ${max}.` };
      }
      return { ok: true, value };
    };

    if (rawArgs.length === 2 && /^\d+$/.test(rawArgs[0]) && /^\d+$/.test(rawArgs[1])) {
      const nextCols = parseBoundedInt(rawArgs[0], COLS_MIN, COLS_MAX, "Columns");
      if (!nextCols.ok) {
        return nextCols;
      }
      const nextRows = parseBoundedInt(rawArgs[1], ROWS_MIN, ROWS_MAX, "Rows");
      if (!nextRows.ok) {
        return nextRows;
      }
      return { ok: true, cols: nextCols.value, rows: nextRows.value };
    }

    for (const tokenRaw of rawArgs) {
      const token = tokenRaw.toLowerCase();
      const colsMatch = /^c(\d+)$/.exec(token);
      if (colsMatch) {
        const parsed = parseBoundedInt(colsMatch[1], COLS_MIN, COLS_MAX, "Columns");
        if (!parsed.ok) {
          return parsed;
        }
        cols = parsed.value;
        updatedCols = true;
        continue;
      }
      const rowsMatch = /^r(\d+)$/.exec(token);
      if (rowsMatch) {
        const parsed = parseBoundedInt(rowsMatch[1], ROWS_MIN, ROWS_MAX, "Rows");
        if (!parsed.ok) {
          return parsed;
        }
        rows = parsed.value;
        updatedRows = true;
        continue;
      }
      return { ok: false, error: sizeUsage };
    }

    if (!updatedCols && !updatedRows) {
      return { ok: false, error: sizeUsage };
    }
    return { ok: true, cols, rows };
  }

  function parseDirectTargetRoutingInput(rawInput) {
    const input = String(rawInput || "");
    const match = /^@([^\s]+)\s+([\s\S]+)$/.exec(input);
    if (!match) {
      return {
        matched: false,
        targetToken: "",
        payload: ""
      };
    }
    return {
      matched: true,
      targetToken: match[1],
      payload: match[2]
    };
  }

  function parseCustomDefinition(rawInput) {
    return parseCustomCommandDefinition(rawInput, `Usage: ${getSlashCommandUsage("custom")}`);
  }

  function parseCustomInvocation(rawInput, command) {
    return parseCustomCommandInvocation(rawInput, command);
  }

  return {
    resolveSessionToken,
    resolveDeckToken,
    resolveQuickSwitchTarget,
    formatQuickSwitchPreview,
    resolveTargetSelectors,
    resolveFilterSelectors,
    resolveSettingsTargets,
    parseSettingsPayload,
    parseSizeCommandArgs,
    parseDirectTargetRoutingInput,
    parseCustomDefinition,
    parseCustomInvocation,
    parseAutocompleteContext
  };
}
