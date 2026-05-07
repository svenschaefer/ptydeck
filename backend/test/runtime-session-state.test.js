import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionState } from "../src/runtime-session-state.js";

function createManager(activeSessions = new Map()) {
  return {
    get(sessionId) {
      const session = activeSessions.get(sessionId);
      if (!session) {
        throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
      }
      return { meta: session };
    }
  };
}

test("runtime session state assigns default deck and quick ids to active and unrestored sessions deterministically", () => {
  const decks = new Map();
  const activeSessions = new Map([["session-1", { id: "session-1", deckId: "", updatedAt: 10 }]]);
  const unrestoredSessions = new Map([["session-2", { id: "session-2", deckId: "", updatedAt: 20 }]]);
  const state = createRuntimeSessionState({
    manager: createManager(activeSessions),
    unrestoredSessions,
    decks,
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default", name: "Default" }),
    sessionDeckAssignments: new Map(),
    sessionQuickIdAssignments: new Map(),
    sessionQuickIdPool: ["A", "B"],
    sessionQuickIdFallback: "?"
  });

  assert.equal(state.resolveSessionDeckId("session-1"), "default");
  assert.equal(activeSessions.get("session-1").deckId, "default");
  assert.equal(state.getSessionQuickIdToken("session-1"), "A");

  const unrestoredModel = state.withDeckId({ id: "session-2", name: "Restored Later" });
  assert.deepEqual(
    { deckId: unrestoredModel.deckId, quickIdToken: unrestoredModel.quickIdToken },
    { deckId: "default", quickIdToken: "B" }
  );
  assert.equal(unrestoredSessions.get("session-2").deckId, "default");
  assert.equal(unrestoredSessions.get("session-2").quickIdToken, "B");
});

test("runtime session state moves sessions across decks only when the target changes", () => {
  const cleanupCalls = [];
  const decks = new Map([
    ["default", { id: "default" }],
    ["ops", { id: "ops" }]
  ]);
  const activeSessions = new Map([["session-1", { id: "session-1", deckId: "default", updatedAt: 1 }]]);
  const state = createRuntimeSessionState({
    manager: createManager(activeSessions),
    decks,
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default" }),
    getDeckOrThrow(deckId) {
      const deck = decks.get(deckId);
      if (!deck) {
        throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
      }
      return deck;
    },
    sessionDeckAssignments: new Map([["session-1", "default"]]),
    sessionQuickIdAssignments: new Map(),
    sessionQuickIdPool: ["A"],
    cleanupLayoutProfiles: () => cleanupCalls.push("layout"),
    cleanupWorkspacePresets: () => cleanupCalls.push("workspace")
  });

  assert.equal(state.moveSessionToDeck("session-1", "default"), false);
  assert.deepEqual(cleanupCalls, []);

  assert.equal(state.moveSessionToDeck("session-1", "ops"), true);
  assert.equal(activeSessions.get("session-1").deckId, "ops");
  assert.equal(state.resolveSessionDeckId("session-1"), "ops");
  assert.deepEqual(cleanupCalls, ["layout", "workspace"]);
});

test("runtime session state quick-id helpers normalize preferred tokens and swap deterministically", () => {
  const sessionQuickIdAssignments = new Map();
  const activeSessions = new Map([["session-1", { id: "session-1", updatedAt: 5 }]]);
  const unrestoredSessions = new Map([["session-2", { id: "session-2", updatedAt: 7 }]]);
  const state = createRuntimeSessionState({
    manager: createManager(activeSessions),
    unrestoredSessions,
    decks: new Map([["default", { id: "default" }]]),
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default" }),
    sessionDeckAssignments: new Map(),
    sessionQuickIdAssignments,
    sessionQuickIdPool: ["A", "B"],
    sessionQuickIdFallback: "?",
    getApiSessionOrThrow(sessionId) {
      return {
        id: sessionId,
        quickIdToken: sessionQuickIdAssignments.get(sessionId)
      };
    }
  });

  assert.equal(state.assignSessionQuickIdToken("session-1", "b"), "B");
  assert.equal(state.assignSessionQuickIdToken("session-2", "B"), "A");
  assert.equal(state.getSessionQuickIdToken("missing"), "?");
  assert.equal(state.setSessionQuickIdToken("session-2", "invalid"), "A");
  assert.equal(unrestoredSessions.get("session-2").updatedAt > 7, true);

  const swapped = state.swapSessionQuickIds("session-1", "session-2");
  assert.deepEqual(swapped, {
    leftSession: { id: "session-1", quickIdToken: "A" },
    rightSession: { id: "session-2", quickIdToken: "B" }
  });

  assert.equal(state.deleteSessionQuickIdToken("session-2"), true);
  assert.equal(state.deleteSessionQuickIdToken(""), false);
});

test("runtime session state fails closed for missing sessions while resolving unrestored control models", () => {
  const unrestoredSessions = new Map([["session-u", { id: "session-u", updatedAt: 9 }]]);
  const state = createRuntimeSessionState({
    manager: createManager(new Map()),
    unrestoredSessions,
    decks: new Map(),
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default" }),
    sessionDeckAssignments: new Map(),
    sessionQuickIdAssignments: new Map(),
    sessionQuickIdPool: ["A"],
    sessionQuickIdFallback: "?"
  });

  state.ensureSessionExistsOrThrow("session-u");
  assert.throws(() => state.ensureSessionExistsOrThrow("session-missing"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 404);
    return true;
  });

  assert.deepEqual(state.resolveSessionControlModel("session-u"), {
    id: "session-u",
    updatedAt: 9,
    deckId: "default",
    quickIdToken: "A"
  });
  assert.equal(state.resolveSessionControlModel("session-missing"), null);
  assert.throws(() => state.setSessionQuickIdToken("", "A"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 404);
    return true;
  });
});

test("runtime session state keeps blank-input and unrestored fallback branches deterministic", () => {
  const state = createRuntimeSessionState({
    manager: createManager(new Map()),
    unrestoredSessions: new Map([["session-u", { id: "session-u", deckId: "", updatedAt: 3 }]]),
    decks: new Map([
      ["default", { id: "default" }],
      ["ops", { id: "ops" }]
    ]),
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default" }),
    sessionDeckAssignments: new Map(),
    sessionQuickIdAssignments: new Map([
      ["session-a", "A"],
      ["session-b", "B"]
    ]),
    sessionQuickIdPool: ["A", "B"],
    sessionQuickIdFallback: "?"
  });

  assert.equal(state.assignSessionQuickIdToken("", "A"), "?");
  assert.equal(state.getSessionQuickIdToken("   "), "?");
  assert.equal(state.setSessionDeckAssignment("", "ops"), "ops");
  assert.equal(state.setSessionDeckAssignment("session-u", "missing"), "default");
  assert.equal(state.resolveSessionDeckId("session-u"), "default");
});

test("runtime session state rethrows unexpected manager errors on active-session paths", () => {
  const originalError = new Error("manager boom");
  const state = createRuntimeSessionState({
    manager: {
      get() {
        throw originalError;
      }
    },
    unrestoredSessions: new Map(),
    decks: new Map([
      ["default", { id: "default" }],
      ["ops", { id: "ops" }]
    ]),
    defaultDeckId: "default",
    buildDefaultDeck: () => ({ id: "default" }),
    sessionDeckAssignments: new Map(),
    sessionQuickIdAssignments: new Map(),
    sessionQuickIdPool: ["A", "B"],
    sessionQuickIdFallback: "?"
  });

  assert.throws(() => state.ensureSessionExistsOrThrow("session-x"), /manager boom/);
  assert.throws(() => state.setSessionDeckAssignment("session-x", "ops"), /manager boom/);
  assert.throws(() => state.resolveSessionControlModel("session-x"), /manager boom/);
});
