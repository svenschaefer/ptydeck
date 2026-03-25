import { createSlashCommandSchema } from "./command-schema.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function freezeCandidate(candidate) {
  return Object.freeze(candidate);
}

export function normalizeCompletionCandidate(candidate, defaults = {}) {
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const insertText = normalizeText(candidate.insertText ?? candidate.value ?? candidate.label ?? "");
    if (!insertText) {
      return null;
    }
    const label = normalizeText(candidate.label ?? insertText) || insertText;
    const kind = normalizeText(candidate.kind ?? defaults.kind ?? "value") || "value";
    const description = normalizeText(candidate.description ?? defaults.description ?? "");
    const example = normalizeText(candidate.example ?? defaults.example ?? "");
    const previewText = normalizeText(candidate.previewText ?? defaults.previewText ?? `${defaults.replacePrefix || ""}${insertText}`);
    const sortText = normalizeLower(candidate.sortText ?? label);
    const key = normalizeText(candidate.key ?? `${kind}:${insertText.toLowerCase()}`);
    return freezeCandidate({
      key,
      insertText,
      label,
      kind,
      description,
      example,
      previewText,
      sortText
    });
  }

  const insertText = normalizeText(candidate);
  if (!insertText) {
    return null;
  }
  const kind = normalizeText(defaults.kind || "value") || "value";
  return freezeCandidate({
    key: `${kind}:${insertText.toLowerCase()}`,
    insertText,
    label: insertText,
    kind,
    description: normalizeText(defaults.description || ""),
    example: normalizeText(defaults.example || ""),
    previewText: normalizeText(defaults.previewText || `${defaults.replacePrefix || ""}${insertText}`),
    sortText: normalizeLower(insertText)
  });
}

export function normalizeCompletionCandidates(candidates, defaults = {}) {
  const normalized = [];
  const seen = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const normalizedCandidate = normalizeCompletionCandidate(candidate, defaults);
    if (!normalizedCandidate || seen.has(normalizedCandidate.key)) {
      continue;
    }
    seen.add(normalizedCandidate.key);
    normalized.push(normalizedCandidate);
  }
  return normalized;
}

export function areCompletionCandidateListsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftCandidate = normalizeCompletionCandidate(left[index]);
    const rightCandidate = normalizeCompletionCandidate(right[index]);
    if (!leftCandidate || !rightCandidate) {
      return false;
    }
    if (
      leftCandidate.key !== rightCandidate.key ||
      leftCandidate.insertText !== rightCandidate.insertText ||
      leftCandidate.label !== rightCandidate.label ||
      leftCandidate.kind !== rightCandidate.kind ||
      leftCandidate.description !== rightCandidate.description ||
      leftCandidate.example !== rightCandidate.example ||
      leftCandidate.previewText !== rightCandidate.previewText
    ) {
      return false;
    }
  }
  return true;
}

export function formatCompletionSuggestionLine(candidate, replacePrefix = "", selected = false) {
  const normalized = normalizeCompletionCandidate(candidate, { replacePrefix });
  if (!normalized) {
    return "";
  }
  const prefix = `${selected ? ">" : " "} ${replacePrefix}${normalized.insertText}`;
  const metadata = [];
  if (normalized.kind) {
    metadata.push(`[${normalized.kind}]`);
  }
  if (normalized.description) {
    metadata.push(normalized.description);
  }
  if (normalized.example) {
    metadata.push(`e.g. ${normalized.example}`);
  }
  if (selected && normalized.previewText) {
    metadata.push(`insert ${normalized.previewText}`);
  }
  return metadata.length > 0 ? `${prefix}  ${metadata.join("  ")}` : prefix;
}

function createStableCache(limit = 256) {
  const entries = new Map();
  return {
    get(key) {
      if (!entries.has(key)) {
        return null;
      }
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) {
        entries.delete(key);
      }
      entries.set(key, value);
      while (entries.size > limit) {
        const oldestKey = entries.keys().next().value;
        entries.delete(oldestKey);
      }
      return value;
    }
  };
}

function stableSessionSignature(sessions) {
  return (Array.isArray(sessions) ? sessions : [])
    .map((session) => {
      const tags = Array.isArray(session?.tags) ? session.tags.map((entry) => normalizeLower(entry)).sort().join(",") : "";
      const envKeys = session?.env && typeof session.env === "object" && !Array.isArray(session.env)
        ? Object.keys(session.env).map((entry) => normalizeLower(entry)).sort().join(",")
        : "";
      return [
        normalizeText(session?.id),
        normalizeLower(session?.name),
        normalizeText(session?.deckId),
        tags,
        normalizeText(session?.cwd),
        normalizeText(session?.startCwd),
        envKeys,
        normalizeText(session?.themeProfile?.background)
      ].join("|");
    })
    .sort()
    .join(";");
}

function stableDeckSignature(decks) {
  return (Array.isArray(decks) ? decks : [])
    .map((deck) => `${normalizeText(deck?.id)}|${normalizeLower(deck?.name)}`)
    .sort()
    .join(";");
}

function stableCommandSignature(commands) {
  return (Array.isArray(commands) ? commands : [])
    .map((command) => `${normalizeLower(command?.name)}|${normalizeText(command?.updatedAt)}`)
    .sort()
    .join(";");
}

function stableThemeSignature(themes) {
  return (Array.isArray(themes) ? themes : [])
    .map((theme) => `${normalizeText(theme?.id)}|${normalizeLower(theme?.name)}|${normalizeText(theme?.category)}`)
    .sort()
    .join(";");
}

function pushCandidate(candidates, seenKeys, candidate, defaults) {
  const normalized = normalizeCompletionCandidate(candidate, defaults);
  if (!normalized || seenKeys.has(normalized.key)) {
    return;
  }
  seenKeys.add(normalized.key);
  candidates.push(normalized);
}

export function createSuggestionProviderRegistry(options = {}) {
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const getThemes = typeof options.getThemes === "function" ? options.getThemes : () => [];
  const providerOverrides = options.providers && typeof options.providers === "object" ? options.providers : {};
  const getSessionToken = typeof options.getSessionToken === "function" ? options.getSessionToken : (sessionId) => String(sessionId || "");
  const getSessionDisplayName =
    typeof options.getSessionDisplayName === "function"
      ? options.getSessionDisplayName
      : (session) => normalizeText(session?.name) || normalizeText(session?.id).slice(0, 8);
  const getSessionDeckId = typeof options.getSessionDeckId === "function" ? options.getSessionDeckId : (session) => normalizeText(session?.deckId);
  const cache = createStableCache();

  function getScopedSessions(context = {}) {
    return Array.isArray(context.sessions) ? context.sessions : getSessions();
  }

  function getScopedDecks(context = {}) {
    return Array.isArray(context.decks) ? context.decks : getDecks();
  }

  function readCached(providerName, prefix, signatureParts, build) {
    const key = [providerName, normalizeLower(prefix), ...signatureParts].join("::");
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const next = Object.freeze(build());
    cache.set(key, next);
    return next;
  }

  function buildSessionCandidates(prefix = "", context = {}) {
    const sessions = getScopedSessions(context);
    const includeNamesWithWhitespace = context.includeNamesWithWhitespace === true;
    const candidates = [];
    const seen = new Set();
    const normalizedPrefix = normalizeLower(prefix);
    for (const session of sessions) {
      const displayName = getSessionDisplayName(session);
      const deckId = getSessionDeckId(session);
      const quickToken = normalizeText(getSessionToken(session.id));
      const sessionId = normalizeText(session?.id);
      const sessionName = normalizeText(session?.name);
      const deckLabel = deckId ? `deck ${deckId}` : "session";
      const description = `${displayName}${deckId ? ` in ${deckLabel}` : ""}`;
      const example = sessionId && sessionId !== quickToken ? sessionId : "";
      if (quickToken && (!normalizedPrefix || normalizeLower(quickToken).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: quickToken,
          label: quickToken,
          kind: "session",
          description,
          example,
          previewText: quickToken,
          key: `session-token:${normalizeLower(quickToken)}`
        });
      }
      if (sessionName && (includeNamesWithWhitespace || !/\s/.test(sessionName)) && (!normalizedPrefix || normalizeLower(sessionName).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: sessionName,
          label: sessionName,
          kind: "session",
          description: `${displayName}${sessionName === displayName ? "" : ` (${displayName})`}${deckId ? ` in deck ${deckId}` : ""}`,
          example: quickToken || sessionId,
          previewText: sessionName,
          key: `session-name:${normalizeLower(sessionName)}`
        });
      }
      if (sessionId && (!normalizedPrefix || normalizeLower(sessionId).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: sessionId,
          label: sessionId,
          kind: "session-id",
          description,
          example: quickToken,
          previewText: sessionId,
          key: `session-id:${normalizeLower(sessionId)}`
        });
      }
    }
    return candidates.slice(0, 48);
  }

  function buildDeckCandidates(prefix = "", context = {}) {
    const decks = getScopedDecks(context);
    const includeExplicitPrefix = context.includeExplicitPrefix === true;
    const candidates = [];
    const seen = new Set();
    const normalizedPrefix = normalizeLower(prefix);
    for (const deck of decks) {
      const deckId = normalizeText(deck?.id);
      const deckName = normalizeText(deck?.name);
      const description = deckName ? `${deckName} deck` : "Deck selector";
      if (deckId && (!normalizedPrefix || normalizeLower(deckId).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: deckId,
          label: deckId,
          kind: "deck",
          description,
          example: deckName,
          previewText: deckId,
          key: `deck-id:${normalizeLower(deckId)}`
        });
      }
      if (deckName && (!normalizedPrefix || normalizeLower(deckName).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: deckName,
          label: deckName,
          kind: "deck",
          description: `deck ${deckId || deckName}`,
          example: deckId,
          previewText: deckName,
          key: `deck-name:${normalizeLower(deckName)}`
        });
      }
      if (includeExplicitPrefix) {
        const explicitId = deckId ? `deck:${deckId}` : "";
        const explicitName = deckName ? `deck:${deckName}` : "";
        if (explicitId && (!normalizedPrefix || normalizeLower(explicitId).startsWith(normalizedPrefix))) {
          pushCandidate(candidates, seen, {
            insertText: explicitId,
            label: explicitId,
            kind: "deck-selector",
            description,
            example: deckName,
            previewText: explicitId,
            key: `deck-explicit-id:${normalizeLower(explicitId)}`
          });
        }
        if (explicitName && (!normalizedPrefix || normalizeLower(explicitName).startsWith(normalizedPrefix))) {
          pushCandidate(candidates, seen, {
            insertText: explicitName,
            label: explicitName,
            kind: "deck-selector",
            description: `explicit deck selector for ${deckId || deckName}`,
            example: explicitId,
            previewText: explicitName,
            key: `deck-explicit-name:${normalizeLower(explicitName)}`
          });
        }
      }
    }
    return candidates.slice(0, 48);
  }

  function buildCustomCommandCandidates(prefix = "") {
    const commands = listCustomCommands();
    const candidates = [];
    const seen = new Set();
    const normalizedPrefix = normalizeLower(prefix);
    for (const command of commands) {
      const name = normalizeText(command?.name);
      if (!name || (normalizedPrefix && !normalizeLower(name).startsWith(normalizedPrefix))) {
        continue;
      }
      pushCandidate(candidates, seen, {
        insertText: name,
        label: `/${name}`,
        kind: "custom-command",
        description: "saved custom command",
        example: `/${name} 1`,
        previewText: name,
        key: `custom-command:${normalizeLower(name)}`
      });
    }
    return candidates.slice(0, 48);
  }

  function buildTagCandidates(prefix = "", context = {}) {
    const sessions = getScopedSessions(context);
    const normalizedPrefix = normalizeLower(prefix);
    const candidates = [];
    const seen = new Set();
    for (const session of sessions) {
      for (const tag of Array.isArray(session?.tags) ? session.tags : []) {
        const token = normalizeText(tag);
        if (!token || (normalizedPrefix && !normalizeLower(token).startsWith(normalizedPrefix))) {
          continue;
        }
        pushCandidate(candidates, seen, {
          insertText: token,
          label: token,
          kind: "tag",
          description: "tag selector",
          example: `/${context.commandName || "filter"} ${token}`,
          previewText: token,
          key: `tag:${normalizeLower(token)}`
        });
      }
    }
    return candidates.slice(0, 32);
  }

  function buildPathCandidates(prefix = "", context = {}) {
    const sessions = getScopedSessions(context);
    const normalizedPrefix = normalizeLower(prefix);
    const candidates = [];
    const seen = new Set();
    for (const session of sessions) {
      for (const pathToken of [session?.cwd, session?.startCwd]) {
        const token = normalizeText(pathToken);
        if (!token || (normalizedPrefix && !normalizeLower(token).startsWith(normalizedPrefix))) {
          continue;
        }
        pushCandidate(candidates, seen, {
          insertText: token,
          label: token,
          kind: "path",
          description: "session path",
          example: getSessionDisplayName(session),
          previewText: token,
          key: `path:${normalizeLower(token)}`
        });
      }
    }
    return candidates.slice(0, 32);
  }

  function buildEnvKeyCandidates(prefix = "", context = {}) {
    const sessions = getScopedSessions(context);
    const normalizedPrefix = normalizeLower(prefix);
    const candidates = [];
    const seen = new Set();
    for (const session of sessions) {
      const env = session?.env && typeof session.env === "object" && !Array.isArray(session.env) ? session.env : {};
      for (const key of Object.keys(env)) {
        const token = normalizeText(key);
        if (!token || (normalizedPrefix && !normalizeLower(token).startsWith(normalizedPrefix))) {
          continue;
        }
        pushCandidate(candidates, seen, {
          insertText: token,
          label: token,
          kind: "env-key",
          description: "environment key",
          example: getSessionDisplayName(session),
          previewText: token,
          key: `env-key:${normalizeLower(token)}`
        });
      }
    }
    return candidates.slice(0, 32);
  }

  function buildThemeCandidates(prefix = "") {
    const themes = getThemes();
    const normalizedPrefix = normalizeLower(prefix);
    const candidates = [];
    const seen = new Set();
    for (const theme of themes) {
      const themeId = normalizeText(theme?.id);
      const themeName = normalizeText(theme?.name);
      const category = normalizeText(theme?.category || "theme");
      if (themeId && (!normalizedPrefix || normalizeLower(themeId).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: themeId,
          label: themeId,
          kind: "theme",
          description: `${themeName || themeId} (${category})`,
          example: themeName,
          previewText: themeId,
          key: `theme-id:${normalizeLower(themeId)}`
        });
      }
      if (themeName && (!normalizedPrefix || normalizeLower(themeName).startsWith(normalizedPrefix))) {
        pushCandidate(candidates, seen, {
          insertText: themeName,
          label: themeName,
          kind: "theme",
          description: `${themeId || themeName} (${category})`,
          example: themeId,
          previewText: themeName,
          key: `theme-name:${normalizeLower(themeName)}`
        });
      }
    }
    return candidates.slice(0, 48);
  }

  function provide(providerName, prefix = "", context = {}) {
    const sessions = getScopedSessions(context);
    const decks = getScopedDecks(context);
    const commands = listCustomCommands();
    const themes = getThemes();
    const signatureParts = [
      providerName,
      stableSessionSignature(sessions),
      stableDeckSignature(decks),
      stableCommandSignature(commands),
      stableThemeSignature(themes),
      context.includeNamesWithWhitespace === true ? "names:all" : "names:plain",
      context.includeExplicitPrefix === true ? "deck:explicit" : "deck:plain",
      normalizeText(context.commandName),
      normalizeText(context.deckId)
    ];

    return readCached(providerName, prefix, signatureParts, () => {
      try {
        if (typeof providerOverrides[providerName] === "function") {
          return normalizeCompletionCandidates(providerOverrides[providerName](prefix, context), {
            replacePrefix: context.replacePrefix || ""
          });
        }
        switch (providerName) {
          case "session-selector":
            return buildSessionCandidates(prefix, context);
          case "multi-target-selector": {
            const candidates = [];
            const seen = new Set();
            pushCandidate(candidates, seen, {
              insertText: "*",
              label: "*",
              kind: "wildcard",
              description: "all sessions in scope",
              example: "*",
              previewText: "*",
              key: "wildcard:*"
            });
            for (const candidate of buildSessionCandidates(prefix, context)) {
              pushCandidate(candidates, seen, candidate);
            }
            for (const candidate of buildTagCandidates(prefix, context)) {
              pushCandidate(candidates, seen, candidate);
            }
            for (const candidate of buildDeckCandidates(prefix, { ...context, includeExplicitPrefix: true })) {
              pushCandidate(candidates, seen, candidate);
            }
            return candidates.slice(0, 64);
          }
          case "filter-selector":
            return provide("multi-target-selector", prefix, { ...context, commandName: "filter" });
          case "deck-selector":
            return buildDeckCandidates(prefix, context);
          case "deck-selector-explicit":
            return buildDeckCandidates(prefix, { ...context, includeExplicitPrefix: true });
          case "custom-command-name":
            return buildCustomCommandCandidates(prefix);
          case "tag-selector":
            return buildTagCandidates(prefix, context);
          case "path-selector":
            return buildPathCandidates(prefix, context);
          case "env-key":
            return buildEnvKeyCandidates(prefix, context);
          case "theme-selector":
            return buildThemeCandidates(prefix);
          case "quick-switch-target": {
            const candidates = [];
            const seen = new Set();
            for (const candidate of buildSessionCandidates(prefix, { ...context, includeNamesWithWhitespace: true })) {
              pushCandidate(candidates, seen, candidate);
            }
            for (const candidate of buildDeckCandidates(prefix, { ...context, includeExplicitPrefix: true })) {
              pushCandidate(candidates, seen, candidate);
            }
            return candidates.slice(0, 64);
          }
          case "quick-switch-session":
            return buildSessionCandidates(prefix, { ...context, includeNamesWithWhitespace: true });
          case "quick-switch-deck":
            return buildDeckCandidates(prefix, context);
          default:
            return [];
        }
      } catch {
        return [];
      }
    });
  }

  return {
    provide
  };
}

function normalizeSlashCommandArg(arg) {
  if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
    return null;
  }
  const provider = normalizeText(arg.provider);
  if (!provider) {
    return null;
  }
  return Object.freeze({
    provider,
    optional: arg.optional === true
  });
}

function normalizeSlashCommandSpec(definition) {
  const normalized = normalizeCompletionCandidate(definition);
  if (!normalized) {
    return null;
  }
  const next = {
    ...normalized
  };
  const args = Array.isArray(definition?.args) ? definition.args.map((entry) => normalizeSlashCommandArg(entry)).filter(Boolean) : [];
  if (args.length > 0) {
    next.args = Object.freeze(args);
  }
  if (definition?.subcommands && typeof definition.subcommands === "object" && !Array.isArray(definition.subcommands)) {
    next.subcommands = Object.freeze(
      Object.fromEntries(
        Object.entries(definition.subcommands)
          .map(([name, entry]) => [name, normalizeSlashCommandSpec(entry)])
          .filter((entry) => Boolean(entry[1]))
      )
    );
  }
  if (Array.isArray(definition?.usage) && definition.usage.length > 0) {
    next.usage = Object.freeze(definition.usage.map((entry) => normalizeText(entry)).filter(Boolean));
  }
  return Object.freeze(next);
}

export function createSlashCommandSpecs(systemSlashCommands = []) {
  return Object.freeze(
    createSlashCommandSchema(systemSlashCommands)
      .map((entry) => normalizeSlashCommandSpec(entry))
      .filter(Boolean)
  );
}
