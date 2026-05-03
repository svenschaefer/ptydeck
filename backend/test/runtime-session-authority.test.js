import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionAuthority } from "../src/runtime-session-authority.js";

const READ_ONLY_SPECTATOR_AUTH = Object.freeze({
  accessMode: "spectator",
  permissionMode: "read_only",
  shareLinkId: "share-1"
});

function createSession(id, deckId, extras = {}) {
  return {
    id,
    name: id,
    deckId,
    state: "running",
    quickSendUsage: [],
    ...extras
  };
}

function createManager(activeSessions = []) {
  const sessionMap = new Map(activeSessions.map((session) => [session.id, structuredClone(session)]));
  return {
    list() {
      return Array.from(sessionMap.values(), (session) => structuredClone(session));
    },
    get(sessionId) {
      const session = sessionMap.get(sessionId);
      if (!session) {
        throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
      }
      return {
        meta: structuredClone(session)
      };
    }
  };
}

function createAuthority({ activeSessions = [], unrestoredSessions = [], toApiSession } = {}) {
  const unrestoredMap = new Map(unrestoredSessions.map((session) => [session.id, structuredClone(session)]));
  return createRuntimeSessionAuthority({
    manager: createManager(activeSessions),
    unrestoredSessions: unrestoredMap,
    isSpectatorAuth: (auth) =>
      Boolean(
        auth &&
          auth.accessMode === "spectator" &&
          auth.permissionMode === "read_only" &&
          typeof auth.shareLinkId === "string" &&
          auth.shareLinkId
      ),
    toApiSession:
      toApiSession ||
      ((session, explicitState) => ({
        ...structuredClone(session),
        state: explicitState || session.state || "running",
        controlState: { owner: { subject: "owner", tenantId: "default" } }
      })),
    withDeckId: (session) => ({
      ...structuredClone(session),
      deckId: session.deckId || "default"
    }),
    shareTargetTypeSession: "session",
    shareTargetTypeDeck: "deck"
  });
}

test("runtime session authority sanitizes session-share spectators deterministically", () => {
  const sessionA = createSession("session-a", "deck-1", {
    quickSendUsage: [{ lookupKey: "project::build", uses: 7, lastUsedAt: 100 }]
  });
  const sessionB = createSession("session-b", "deck-2", {
    quickSendUsage: [{ lookupKey: "project::test", uses: 2, lastUsedAt: 90 }]
  });
  const authority = createAuthority({
    activeSessions: [sessionA, sessionB],
    unrestoredSessions: [createSession("session-c", "deck-1", { state: "unrestored" })]
  });
  const auth = {
    ...READ_ONLY_SPECTATOR_AUTH,
    shareTargetType: "session",
    shareTargetId: "session-a"
  };

  assert.deepEqual(authority.listSessionIdsForAuth(auth), ["session-a"]);
  assert.deepEqual(authority.listApiSessions(auth), [
    {
      ...sessionA,
      controlState: { owner: { subject: "owner", tenantId: "default" } },
      quickSendUsage: []
    }
  ]);
  assert.deepEqual(authority.getApiSessionOrThrow("session-a", auth), {
    ...sessionA,
    controlState: { owner: { subject: "owner", tenantId: "default" } },
    quickSendUsage: []
  });
  assert.throws(() => authority.getApiSessionOrThrow("session-b", auth), /Session 'session-b' was not found/);

  assert.deepEqual(
    authority.filterOutputsForAuth(
      [
        { sessionId: "session-a", data: "visible" },
        { sessionId: "session-b", data: "hidden" },
        { sessionId: "session-c", data: "hidden" },
        { bad: true }
      ],
      auth
    ),
    [{ sessionId: "session-a", data: "visible" }]
  );

  assert.deepEqual(
    authority.filterPayloadForAuth(
      {
        type: "snapshot",
        sessions: [sessionA, sessionB],
        outputs: [
          { sessionId: "session-a", data: "visible" },
          { sessionId: "session-b", data: "hidden" }
        ],
        customCommands: [{ name: "build" }],
        decks: [{ id: "deck-1" }, { id: "deck-2" }]
      },
      auth
    ),
    {
      type: "snapshot",
      sessions: [
        {
          ...sessionA,
          quickSendUsage: []
        }
      ],
      outputs: [{ sessionId: "session-a", data: "visible" }],
      customCommands: [],
      decks: [{ id: "deck-1" }]
    }
  );

  assert.equal(
    authority.filterPayloadForAuth(
      {
        type: "session.updated",
        session: sessionB
      },
      auth
    ),
    null
  );
  assert.deepEqual(
    authority.filterPayloadForAuth(
      {
        type: "session.updated",
        session: sessionA
      },
      auth
    ),
    {
      type: "session.updated",
      session: {
        ...sessionA,
        quickSendUsage: []
      }
    }
  );
});

test("runtime session authority deduplicates active and unrestored deck-share sessions deterministically", () => {
  const sessionA = createSession("session-a", "deck-1", {
    quickSendUsage: [{ lookupKey: "project::build", uses: 4, lastUsedAt: 100 }]
  });
  const sessionB = createSession("session-b", "deck-2");
  const unrestoredA = createSession("session-a", "deck-1", { state: "unrestored", updatedAt: 88 });
  const unrestoredC = createSession("session-c", "deck-1", {
    state: "unrestored",
    quickSendUsage: [{ lookupKey: "project::logs", uses: 3, lastUsedAt: 95 }]
  });
  const authority = createAuthority({
    activeSessions: [sessionA, sessionB],
    unrestoredSessions: [unrestoredA, unrestoredC]
  });
  const auth = {
    ...READ_ONLY_SPECTATOR_AUTH,
    shareTargetType: "deck",
    shareTargetId: "deck-1"
  };

  assert.deepEqual(authority.listSessionIdsForAuth(auth), ["session-a", "session-c"]);
  assert.deepEqual(
    authority.listApiSessions(auth, { deckId: "deck-1" }).map((session) => ({
      id: session.id,
      deckId: session.deckId,
      state: session.state,
      quickSendUsage: session.quickSendUsage
    })),
    [
      { id: "session-a", deckId: "deck-1", state: "running", quickSendUsage: [] },
      { id: "session-c", deckId: "deck-1", state: "unrestored", quickSendUsage: [] }
    ]
  );
  assert.deepEqual(
    authority.getApiSessionOrThrow("session-c", auth),
    {
      ...unrestoredC,
      controlState: { owner: { subject: "owner", tenantId: "default" } },
      quickSendUsage: []
    }
  );

  assert.deepEqual(
    authority.filterPayloadForAuth(
      { type: "session.data", sessionId: "session-c", data: "visible" },
      auth
    ),
    { type: "session.data", sessionId: "session-c", data: "visible" }
  );
  assert.equal(
    authority.filterPayloadForAuth(
      { type: "session.closed", sessionId: "session-b", code: 0 },
      auth
    ),
    null
  );
  assert.deepEqual(
    authority.filterPayloadForAuth(
      { type: "deck.updated", deck: { id: "deck-1", name: "Ops" } },
      auth
    ),
    { type: "deck.updated", deck: { id: "deck-1", name: "Ops" } }
  );
  assert.equal(
    authority.filterPayloadForAuth(
      { type: "custom-command.updated", command: { name: "build" } },
      auth
    ),
    null
  );
  assert.deepEqual(
    authority.filterPayloadForAuth(
      {
        type: "session.activity.completed",
        session: unrestoredC
      },
      auth
    ),
    {
      type: "session.activity.completed",
      session: {
        ...unrestoredC,
        quickSendUsage: []
      }
    }
  );
});

test("runtime session authority falls back to unrestored session targets and leaves operator payloads untouched", () => {
  const unrestoredTarget = createSession("session-x", "deck-fallback", {
    state: "unrestored",
    quickSendUsage: [{ lookupKey: "project::reconnect", uses: 1, lastUsedAt: 50 }]
  });
  const authority = createAuthority({
    activeSessions: [createSession("session-z", "deck-z")],
    unrestoredSessions: [unrestoredTarget]
  });
  const spectatorAuth = {
    ...READ_ONLY_SPECTATOR_AUTH,
    shareTargetType: "session",
    shareTargetId: "session-x"
  };
  const operatorAuth = {
    subject: "operator",
    accessMode: "operator",
    permissionMode: "write"
  };

  assert.deepEqual(authority.getSpectatorTargetSession(spectatorAuth), {
    ...unrestoredTarget,
    controlState: { owner: { subject: "owner", tenantId: "default" } },
    quickSendUsage: []
  });
  assert.equal(authority.isDeckVisibleToAuth("deck-fallback", spectatorAuth), true);
  assert.equal(authority.isDeckVisibleToAuth("deck-z", spectatorAuth), false);
  assert.deepEqual(
    authority.filterPayloadForAuth(
      { type: "deck.deleted", deckId: "deck-fallback" },
      spectatorAuth
    ),
    { type: "deck.deleted", deckId: "deck-fallback" }
  );

  const operatorPayload = {
    type: "snapshot",
    sessions: [createSession("session-z", "deck-z", { quickSendUsage: [{ lookupKey: "project::ship", uses: 9, lastUsedAt: 99 }] })],
    outputs: [{ sessionId: "session-z", data: "all" }],
    customCommands: [{ name: "ship" }],
    decks: [{ id: "deck-z" }]
  };
  assert.equal(authority.filterPayloadForAuth(operatorPayload, operatorAuth), operatorPayload);
});
