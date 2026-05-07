import { ApiError } from "./errors.js";

export function createRuntimeCatalogAuthority(dependencies = {}) {
  const {
    customCommands = new Map(),
    buildCustomCommandEntry = () => null,
    buildCustomCommandKey = (name, scope = "", sessionId = "") => `${name}:${scope}:${sessionId}`,
    compareCustomCommandEntries = () => 0,
    normalizeCustomCommandName = (value) => String(value || "").trim(),
    normalizeCustomCommandScope = (value) => String(value || "").trim() || "project",
    normalizeCustomCommandSessionId = (value) => String(value || "").trim(),
    ensureSessionExistsOrThrow = () => {},
    customCommandMaxNameLength = 32,
    customCommandMaxContentLength = 8192,
    customCommandMaxCount = 256,
    customCommandNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    customCommandReservedNames = new Set(),
    decks = new Map(),
    defaultDeckId = "default",
    normalizeDeckName = (value) => String(value || "").trim(),
    normalizeDeckIdInput = (value) => String(value || "").trim(),
    slugifyDeckId = (value) => String(value || "").trim().toLowerCase(),
    normalizeDeckSettings = (value) => value,
    compareDeckEntries = () => 0,
    isDeckVisibleToAuth = () => true,
    ensureDefaultDeck = () => null,
    manager = {
      list: () => [],
      getSnapshot: () => ({ sessions: [], outputs: [] })
    },
    unrestoredSessions = new Map(),
    resolveSessionDeckId = () => defaultDeckId,
    setSessionDeckAssignment = () => defaultDeckId,
    cleanupConnectionProfiles = () => {},
    cleanupLayoutProfiles = () => {},
    cleanupWorkspacePresets = () => {},
    sessionControlStates = new Map(),
    normalizeSessionControlState = (state) => state,
    createSessionControlPrincipal = () => null,
    withPersistedSessionControlState = (session) => session,
    withDeckId = (session) => session,
    sessionReplayPersistMaxChars = 0,
    listPersistedConnectionProfiles = () => [],
    listPersistedLayoutProfiles = () => [],
    listPersistedWorkspacePresets = () => [],
    listSshTrustEntries = () => [],
    listPersistedShareLinks = () => [],
    telegramTopicBindings = new Map()
  } = dependencies;

  function listCustomCommands({ scope = null, sessionId = null } = {}) {
    const entries = Array.from(customCommands.values());
    const filtered = scope
      ? entries.filter(
          (entry) =>
            entry.scope === scope && (scope !== "session" || entry.sessionId === normalizeCustomCommandSessionId(sessionId))
        )
      : entries;
    return filtered.sort(compareCustomCommandEntries);
  }

  function listCustomCommandsByName(name) {
    const normalizedName = normalizeCustomCommandName(name);
    return listCustomCommands().filter((entry) => entry.name === normalizedName);
  }

  function getCustomCommandOrThrow(name, { scope = null, sessionId = null } = {}) {
    const normalizedName = normalizeCustomCommandName(name);
    if (!normalizedName) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    if (scope) {
      const entry = customCommands.get(buildCustomCommandKey(normalizedName, scope, sessionId));
      if (!entry) {
        throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
      }
      return { ...entry };
    }
    const candidates = listCustomCommandsByName(normalizedName);
    if (candidates.length === 0) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    if (candidates.length > 1) {
      throw new ApiError(
        409,
        "CustomCommandAmbiguous",
        "Multiple scoped custom commands share this name. Specify scope (and sessionId for session scope)."
      );
    }
    return { ...candidates[0] };
  }

  function upsertCustomCommand(name, payload) {
    const normalizedName = normalizeCustomCommandName(name);
    if (normalizedName.length > customCommandMaxNameLength) {
      throw new ApiError(
        400,
        "CustomCommandNameTooLong",
        `Custom command name exceeds maximum length (${customCommandMaxNameLength}).`
      );
    }
    if (!customCommandNamePattern.test(normalizedName)) {
      throw new ApiError(
        400,
        "CustomCommandNameInvalid",
        "Custom command name must match pattern [A-Za-z0-9][A-Za-z0-9_-]*."
      );
    }
    if (customCommandReservedNames.has(normalizedName)) {
      throw new ApiError(409, "CustomCommandNameReserved", "Custom command name collides with a system command.");
    }
    const nextInput = {
      ...payload,
      name: normalizedName
    };
    const nextScope = normalizeCustomCommandScope(nextInput.scope);
    const nextSessionId = nextScope === "session" ? normalizeCustomCommandSessionId(nextInput.sessionId) : "";
    if (nextScope === "session") {
      ensureSessionExistsOrThrow(nextSessionId);
    }
    const current = customCommands.get(buildCustomCommandKey(normalizedName, nextScope, nextSessionId));
    const next = buildCustomCommandEntry(normalizedName, nextInput, {
      strict: true,
      fieldPathPrefix: "body",
      currentEntry: current
    });
    const existingSameName = listCustomCommandsByName(normalizedName);
    if (existingSameName.some((entry) => entry.kind !== next.kind)) {
      throw new ApiError(
        409,
        "CustomCommandKindConflict",
        "Scoped custom commands sharing the same name must use the same kind."
      );
    }
    if (next.content.length > customCommandMaxContentLength) {
      throw new ApiError(
        400,
        "CustomCommandContentTooLarge",
        `Custom command content exceeds maximum length (${customCommandMaxContentLength}).`
      );
    }
    const nextKey = buildCustomCommandKey(normalizedName, next.scope, next.sessionId);
    if (!customCommands.has(nextKey) && customCommands.size >= customCommandMaxCount) {
      throw new ApiError(
        409,
        "CustomCommandLimitExceeded",
        `Custom command limit reached (${customCommandMaxCount}).`
      );
    }
    customCommands.set(nextKey, next);
    return { ...next };
  }

  function deleteCustomCommand(name, { scope = null, sessionId = null } = {}) {
    const existing = getCustomCommandOrThrow(name, { scope, sessionId });
    const key = buildCustomCommandKey(existing.name, existing.scope, existing.sessionId);
    if (!customCommands.has(key)) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    customCommands.delete(key);
    return { ...existing };
  }

  function hasCustomCommand(name, { scope = null, sessionId = null } = {}) {
    if (!scope) {
      return listCustomCommandsByName(name).length > 0;
    }
    return customCommands.has(buildCustomCommandKey(name, scope, sessionId));
  }

  function removeCustomCommandsForSession(sessionId) {
    const normalizedSessionId = normalizeCustomCommandSessionId(sessionId);
    if (!normalizedSessionId) {
      return [];
    }
    const deleted = [];
    for (const [key, entry] of customCommands.entries()) {
      if (entry.scope === "session" && entry.sessionId === normalizedSessionId) {
        deleted.push({ ...entry });
        customCommands.delete(key);
      }
    }
    deleted.sort(compareCustomCommandEntries);
    return deleted;
  }

  function toApiDeck(deck) {
    return {
      id: deck.id,
      name: deck.name,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      settings: deck.settings
    };
  }

  function listDecks(auth = null) {
    ensureDefaultDeck();
    return Array.from(decks.values())
      .filter((deck) => isDeckVisibleToAuth(deck, auth))
      .sort(compareDeckEntries)
      .map(toApiDeck);
  }

  function getDeckOrThrow(deckId, auth = null) {
    const deck = decks.get(deckId);
    if (!deck || !isDeckVisibleToAuth(deck, auth)) {
      throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
    }
    return deck;
  }

  function createDeck(body) {
    const name = normalizeDeckName(body?.name);
    const requestedId = normalizeDeckIdInput(body?.id);
    let deckId = requestedId;
    if (!deckId) {
      const slug = slugifyDeckId(name);
      deckId = slug;
      let suffix = 2;
      while (decks.has(deckId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "deck";
        deckId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (decks.has(deckId)) {
      throw new ApiError(409, "DeckAlreadyExists", `Deck '${deckId}' already exists.`);
    }
    const now = Date.now();
    const deck = {
      id: deckId,
      name,
      createdAt: now,
      updatedAt: now,
      settings: normalizeDeckSettings(body?.settings, { strict: true })
    };
    decks.set(deck.id, deck);
    return toApiDeck(deck);
  }

  function updateDeck(deckId, body) {
    const existing = getDeckOrThrow(deckId);
    const hasName = body?.name !== undefined;
    const hasSettings = body?.settings !== undefined;
    if (!hasName && !hasSettings) {
      throw new ApiError(400, "ValidationError", "At least one updatable deck field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeDeckName(body.name) : existing.name,
      settings: hasSettings ? normalizeDeckSettings(body.settings, { strict: true }) : existing.settings,
      updatedAt: Date.now()
    };
    decks.set(deckId, next);
    return toApiDeck(next);
  }

  function countSessionsInDeck(deckId) {
    let count = 0;
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        count += 1;
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        count += 1;
      }
    }
    return count;
  }

  function reassignDeckSessions(deckId, targetDeckId) {
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        setSessionDeckAssignment(session.id, targetDeckId);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        setSessionDeckAssignment(sessionId, targetDeckId);
      }
    }
  }

  function listSessionIdsInDeck(deckId) {
    const sessionIds = [];
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        sessionIds.push(session.id);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }

  function deleteDeck(deckId, { force = false } = {}) {
    if (deckId === defaultDeckId) {
      throw new ApiError(409, "DeckDeleteForbidden", "Default deck cannot be deleted.");
    }
    getDeckOrThrow(deckId);
    const affectedSessionIds = listSessionIdsInDeck(deckId);
    if (affectedSessionIds.length > 0 && !force) {
      throw new ApiError(409, "DeckNotEmpty", "Deck is not empty. Use force=true to delete and reassign sessions.");
    }
    if (affectedSessionIds.length > 0 && force) {
      ensureDefaultDeck();
      reassignDeckSessions(deckId, defaultDeckId);
    }
    decks.delete(deckId);
    cleanupConnectionProfiles();
    cleanupLayoutProfiles();
    cleanupWorkspacePresets();
    return {
      deckId,
      fallbackDeckId: defaultDeckId,
      reassignedSessionIds: force ? affectedSessionIds : []
    };
  }

  function createDefaultSessionOwner(auth = null) {
    return createSessionControlPrincipal(auth);
  }

  function setSessionControlState(sessionId, value, fallbackOwner = null) {
    const normalized = normalizeSessionControlState(value, {
      fallbackOwner: fallbackOwner || createDefaultSessionOwner()
    });
    sessionControlStates.set(sessionId, normalized);
    return normalized;
  }

  function getSessionControlState(sessionId, fallbackOwner = null) {
    const existing = sessionControlStates.get(sessionId);
    if (existing) {
      return existing;
    }
    return setSessionControlState(sessionId, {}, fallbackOwner);
  }

  function deleteSessionControlState(sessionId) {
    sessionControlStates.delete(sessionId);
  }

  function snapshotRuntimeState() {
    const snapshot = manager.getSnapshot({
      outputMaxChars: sessionReplayPersistMaxChars,
      includeTruncationMetadata: true,
      includeEmptyOutputs: true
    });
    const sessionMap = new Map();
    for (const session of snapshot.sessions) {
      sessionMap.set(session.id, withPersistedSessionControlState(withDeckId(session)));
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, withPersistedSessionControlState(withDeckId(session)));
      }
    }
    ensureDefaultDeck();
    return {
      sessions: Array.from(sessionMap.values()),
      sessionOutputs: snapshot.outputs,
      customCommands: listCustomCommands(),
      decks: Array.from(decks.values()),
      connectionProfiles: listPersistedConnectionProfiles(),
      layoutProfiles: listPersistedLayoutProfiles(),
      workspacePresets: listPersistedWorkspacePresets(),
      sshTrustEntries: listSshTrustEntries().map((entry) => ({ ...entry })),
      shareLinks: listPersistedShareLinks(),
      messagingTelegramTopicBindings: Array.from(telegramTopicBindings.values())
        .sort((left, right) => `${left.chatId}:${left.sessionId}`.localeCompare(`${right.chatId}:${right.sessionId}`))
        .map((entry) => ({ ...entry }))
    };
  }

  return {
    countSessionsInDeck,
    createDefaultSessionOwner,
    createDeck,
    deleteCustomCommand,
    deleteDeck,
    deleteSessionControlState,
    getCustomCommandOrThrow,
    getDeckOrThrow,
    getSessionControlState,
    hasCustomCommand,
    listCustomCommands,
    listDecks,
    listSessionIdsInDeck,
    removeCustomCommandsForSession,
    reassignDeckSessions,
    setSessionControlState,
    snapshotRuntimeState,
    toApiDeck,
    updateDeck,
    upsertCustomCommand
  };
}
