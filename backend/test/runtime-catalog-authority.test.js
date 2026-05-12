import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeCatalogAuthority } from "../src/runtime-catalog-authority.js";

const DEFAULT_DECK_ID = "default";
const CUSTOM_COMMAND_SCOPE_PRECEDENCE = {
  global: 100,
  project: 200,
  session: 300
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compareCustomCommandEntries(left, right) {
  const scopeDelta =
    (CUSTOM_COMMAND_SCOPE_PRECEDENCE[left.scope] || 0) - (CUSTOM_COMMAND_SCOPE_PRECEDENCE[right.scope] || 0);
  if (scopeDelta !== 0) {
    return scopeDelta;
  }
  const nameDelta = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
  if (nameDelta !== 0) {
    return nameDelta;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.sessionId.localeCompare(right.sessionId, "en-US", { sensitivity: "base" });
}

function compareDeckEntries(left, right) {
  const nameDelta = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
  if (nameDelta !== 0) {
    return nameDelta;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
}

function slugifyDeckId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "deck";
}

function createHarness(overrides = {}) {
  let customCommandTimestamp = 100;
  const customCommands = overrides.customCommands || new Map();
  const sessionControlStates = overrides.sessionControlStates || new Map();
  const sessionDeckAssignments =
    overrides.sessionDeckAssignments ||
    new Map([
      ["session-1", DEFAULT_DECK_ID],
      ["session-2", "ops"],
      ["session-3", "ops"]
    ]);
  const activeSessions =
    overrides.activeSessions ||
    new Map([
      ["session-1", { id: "session-1", name: "Primary", deckId: DEFAULT_DECK_ID, updatedAt: 11 }],
      ["session-2", { id: "session-2", name: "Ops Active", deckId: "ops", updatedAt: 12 }]
    ]);
  const unrestoredSessions =
    overrides.unrestoredSessions ||
    new Map([["session-3", { id: "session-3", name: "Ops Restored", deckId: "ops", updatedAt: 13 }]]);
  const decks =
    overrides.decks ||
    new Map([
      [DEFAULT_DECK_ID, { id: DEFAULT_DECK_ID, name: "Default", createdAt: 1, updatedAt: 1, settings: { color: "blue" } }],
      ["ops", { id: "ops", name: "Ops", createdAt: 2, updatedAt: 2, settings: { color: "red" } }]
    ]);
  const cleanupCalls = [];
  const persistedConnectionProfiles = [{ id: "profile-1", name: "Ops SSH" }];
  const persistedLayoutProfiles = [{ id: "layout-1", name: "Wide" }];
  const persistedWorkspacePresets = [{ id: "workspace-1", name: "Ops Workspace" }];
  const persistedShareLinks = [{ id: "share-1", targetType: "session", targetId: "session-1" }];
  const sshTrustEntries = [{ id: "trust-1", host: "example.test", port: 22, keyType: "ssh-ed25519" }];
  const telegramTopicBindings = new Map([
    ["100:session-2", { chatId: "100", sessionId: "session-2" }],
    ["099:session-1", { chatId: "099", sessionId: "session-1" }]
  ]);

  function ensureSessionExistsOrThrow(sessionId) {
    if (activeSessions.has(sessionId) || unrestoredSessions.has(sessionId)) {
      return;
    }
    throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
  }

  function ensureDefaultDeck() {
    if (decks.has(DEFAULT_DECK_ID)) {
      return decks.get(DEFAULT_DECK_ID);
    }
    const defaultDeck = { id: DEFAULT_DECK_ID, name: "Default", createdAt: 1, updatedAt: 1, settings: {} };
    decks.set(DEFAULT_DECK_ID, defaultDeck);
    return defaultDeck;
  }

  function resolveSessionDeckId(sessionId) {
    return sessionDeckAssignments.get(sessionId) || DEFAULT_DECK_ID;
  }

  function setSessionDeckAssignment(sessionId, deckId) {
    const nextDeckId = decks.has(deckId) ? deckId : DEFAULT_DECK_ID;
    sessionDeckAssignments.set(sessionId, nextDeckId);
    if (activeSessions.has(sessionId)) {
      activeSessions.get(sessionId).deckId = nextDeckId;
    }
    if (unrestoredSessions.has(sessionId)) {
      unrestoredSessions.get(sessionId).deckId = nextDeckId;
    }
    return nextDeckId;
  }

  const authority = createRuntimeCatalogAuthority({
    customCommands,
    buildCustomCommandEntry(name, payload, { currentEntry = null } = {}) {
      const scope = payload?.scope === "global" || payload?.scope === "session" ? payload.scope : "project";
      const sessionId = scope === "session" ? String(payload?.sessionId || "").trim() : "";
      const kind = payload?.kind === "template" ? "template" : "plain";
      const content = typeof payload?.content === "string" ? payload.content : "";
      const createdAt = Number.isInteger(currentEntry?.createdAt) ? currentEntry.createdAt : customCommandTimestamp++;
      const updatedAt = customCommandTimestamp++;
      return {
        name,
        scope,
        sessionId,
        kind,
        content,
        createdAt,
        updatedAt
      };
    },
    buildCustomCommandKey: (name, scope = "", sessionId = "") => `${name}:${scope}:${sessionId}`,
    compareCustomCommandEntries,
    normalizeCustomCommandName: (value) => String(value || "").trim().toLowerCase(),
    normalizeCustomCommandScope: (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return normalized === "global" || normalized === "session" ? normalized : "project";
    },
    normalizeCustomCommandSessionId: (value) => String(value || "").trim(),
    ensureSessionExistsOrThrow,
    customCommandMaxNameLength: 32,
    customCommandMaxContentLength: 128,
    customCommandMaxCount: 8,
    customCommandNamePattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    customCommandReservedNames: new Set(["rename", "switch"]),
    decks,
    defaultDeckId: DEFAULT_DECK_ID,
    normalizeDeckName(value) {
      const normalized = String(value || "").trim();
      if (!normalized) {
        throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
      }
      return normalized;
    },
    normalizeDeckIdInput: (value) => String(value || "").trim().toLowerCase(),
    slugifyDeckId,
    normalizeDeckSettings: (value) => clone(value && typeof value === "object" ? value : {}),
    compareDeckEntries,
    isDeckVisibleToAuth: (deck, auth = null) => {
      if (!auth || !Array.isArray(auth.allowedDeckIds)) {
        return true;
      }
      return auth.allowedDeckIds.includes(deck.id);
    },
    ensureDefaultDeck,
    manager: {
      list: () => Array.from(activeSessions.values()),
      getSnapshot: () => ({
        sessions: Array.from(activeSessions.values()).map((session) => clone(session)),
        outputs: [{ sessionId: "session-1", data: "stdout", truncated: false }]
      })
    },
    unrestoredSessions,
    resolveSessionDeckId,
    setSessionDeckAssignment,
    cleanupConnectionProfiles: () => cleanupCalls.push("connections"),
    cleanupLayoutProfiles: () => cleanupCalls.push("layouts"),
    cleanupWorkspacePresets: () => cleanupCalls.push("workspace"),
    sessionControlStates,
    normalizeSessionControlState(state, options = {}) {
      return {
        owner: state?.owner || options.fallbackOwner || { subject: "local", tenantId: "default" },
        controllerClientId: state?.controllerClientId || null,
        allowAutoAssign: state?.allowAutoAssign !== false
      };
    },
    createSessionControlPrincipal: (auth = null) => ({
      subject: auth?.subject || "local",
      tenantId: auth?.tenantId || "default"
    }),
    withPersistedSessionControlState: (session) => ({
      ...session,
      controlState: {
        ...(sessionControlStates.get(session.id) || {
          owner: { subject: "local", tenantId: "default" },
          controllerClientId: null,
          allowAutoAssign: true
        })
      }
    }),
    withDeckId: (session) => ({ ...session, deckId: resolveSessionDeckId(session.id) }),
    sessionReplayPersistMaxChars: 4096,
    listPersistedConnectionProfiles: () => persistedConnectionProfiles.map((entry) => ({ ...entry })),
    listPersistedLayoutProfiles: () => persistedLayoutProfiles.map((entry) => ({ ...entry })),
    listPersistedWorkspacePresets: () => persistedWorkspacePresets.map((entry) => ({ ...entry })),
    listSshTrustEntries: () => sshTrustEntries.map((entry) => ({ ...entry })),
    listPersistedShareLinks: () => persistedShareLinks.map((entry) => ({ ...entry })),
    telegramTopicBindings
  });

  return {
    activeSessions,
    authority,
    cleanupCalls,
    decks,
    sessionControlStates,
    sessionDeckAssignments,
    unrestoredSessions
  };
}

test("runtime catalog authority manages scoped custom commands deterministically", () => {
  const { authority } = createHarness();

  const projectEntry = authority.upsertCustomCommand("Deploy", {
    scope: "project",
    kind: "plain",
    content: "npm run deploy"
  });
  const sessionEntry = authority.upsertCustomCommand("deploy", {
    scope: "session",
    sessionId: "session-1",
    kind: "plain",
    content: "./deploy.sh"
  });

  assert.equal(projectEntry.name, "deploy");
  assert.equal(sessionEntry.sessionId, "session-1");
  assert.equal(authority.hasCustomCommand("deploy"), true);
  assert.equal(authority.hasCustomCommand("deploy", { scope: "session", sessionId: "session-1" }), true);
  assert.deepEqual(
    authority.listCustomCommands().map((entry) => `${entry.scope}:${entry.name}`),
    ["project:deploy", "session:deploy"]
  );
  assert.throws(() => authority.getCustomCommandOrThrow("deploy"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 409);
    assert.equal(error.error, "CustomCommandAmbiguous");
    return true;
  });
  assert.deepEqual(
    authority.removeCustomCommandsForSession("session-1").map((entry) => entry.sessionId),
    ["session-1"]
  );
  assert.equal(authority.hasCustomCommand("deploy", { scope: "session", sessionId: "session-1" }), false);
  assert.throws(
    () => authority.upsertCustomCommand("rename", { scope: "project", kind: "plain", content: "bad" }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 409);
      assert.equal(error.error, "CustomCommandNameReserved");
      return true;
    }
  );
});

test("runtime catalog authority manages deck lifecycle, visibility, and forced reassignment deterministically", () => {
  const { authority, activeSessions, cleanupCalls, sessionDeckAssignments, unrestoredSessions } = createHarness();

  const created = authority.createDeck({ name: "Build Farm", settings: { columns: 2 } });
  assert.equal(created.id, "build-farm");
  assert.equal(created.settings.columns, 2);
  assert.deepEqual(authority.listDecks({ allowedDeckIds: [DEFAULT_DECK_ID, "build-farm"] }).map((deck) => deck.id), [
    "build-farm",
    DEFAULT_DECK_ID
  ]);
  assert.throws(() => authority.getDeckOrThrow("ops", { allowedDeckIds: [DEFAULT_DECK_ID] }), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 404);
    return true;
  });

  const updated = authority.updateDeck("build-farm", { name: "Build Grid", settings: { columns: 3 } });
  assert.equal(updated.name, "Build Grid");
  assert.equal(updated.settings.columns, 3);
  assert.equal(authority.countSessionsInDeck("ops"), 2);
  assert.deepEqual(authority.listSessionIdsInDeck("ops"), ["session-2", "session-3"]);
  assert.throws(() => authority.deleteDeck("ops"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 409);
    assert.equal(error.error, "DeckNotEmpty");
    return true;
  });

  const deleted = authority.deleteDeck("ops", { force: true });
  assert.deepEqual(deleted, {
    deckId: "ops",
    fallbackDeckId: DEFAULT_DECK_ID,
    reassignedSessionIds: ["session-2", "session-3"]
  });
  assert.equal(activeSessions.get("session-2").deckId, DEFAULT_DECK_ID);
  assert.equal(unrestoredSessions.get("session-3").deckId, DEFAULT_DECK_ID);
  assert.equal(sessionDeckAssignments.get("session-2"), DEFAULT_DECK_ID);
  assert.equal(sessionDeckAssignments.get("session-3"), DEFAULT_DECK_ID);
  assert.deepEqual(cleanupCalls, ["connections", "layouts", "workspace"]);
});

test("runtime catalog authority snapshots persisted runtime state with session-control state and topic bindings", () => {
  const { authority, decks, sessionControlStates } = createHarness({ decks: new Map() });

  authority.upsertCustomCommand("deploy", {
    scope: "project",
    kind: "plain",
    content: "npm run deploy"
  });
  const createdControlState = authority.getSessionControlState("session-4", {
    subject: "owner-4",
    tenantId: "ops"
  });
  assert.deepEqual(createdControlState.owner, { subject: "owner-4", tenantId: "ops" });
  authority.setSessionControlState("session-1", {
    owner: { subject: "owner-1", tenantId: "ops" },
    controllerClientId: "client-1",
    allowAutoAssign: false
  });

  const snapshot = authority.snapshotRuntimeState();
  const snapshotSessionIds = snapshot.sessions.map((session) => session.id).sort();
  const defaultDeck = decks.get(DEFAULT_DECK_ID);

  assert.ok(defaultDeck);
  assert.deepEqual(snapshotSessionIds, ["session-1", "session-2", "session-3"]);
  assert.deepEqual(
    snapshot.sessions.find((session) => session.id === "session-1").controlState,
    sessionControlStates.get("session-1")
  );
  assert.deepEqual(snapshot.customCommands.map((entry) => entry.name), ["deploy"]);
  assert.deepEqual(snapshot.decks.map((deck) => deck.id), [DEFAULT_DECK_ID]);
  assert.deepEqual(snapshot.connectionProfiles.map((entry) => entry.id), ["profile-1"]);
  assert.deepEqual(snapshot.layoutProfiles.map((entry) => entry.id), ["layout-1"]);
  assert.deepEqual(snapshot.workspacePresets.map((entry) => entry.id), ["workspace-1"]);
  assert.deepEqual(snapshot.sshTrustEntries.map((entry) => entry.id), ["trust-1"]);
  assert.deepEqual(snapshot.shareLinks.map((entry) => entry.id), ["share-1"]);
  assert.deepEqual(snapshot.operatorComposerPlacements, []);
  assert.deepEqual(
    snapshot.messagingTelegramTopicBindings.map((entry) => `${entry.chatId}:${entry.sessionId}`),
    ["099:session-1", "100:session-2"]
  );
  authority.deleteSessionControlState("session-4");
  assert.equal(sessionControlStates.has("session-4"), false);
});
