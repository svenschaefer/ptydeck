import test from "node:test";
import assert from "node:assert/strict";

import { createAuthBootstrapRuntimeController } from "../src/public/auth-bootstrap-runtime-controller.js";

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const token = { fn, delay, cleared: false };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      if (token) {
        token.cleared = true;
      }
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("auth-bootstrap runtime controller dedupes fallback bootstrap and applies REST snapshot", async () => {
  const decksDeferred = createDeferred();
  const sessionsDeferred = createDeferred();
  const decksCalls = [];
  const sessionsCalls = [];
  const readyCalls = [];
  const errorCalls = [];
  let listDeckCalls = 0;
  let listSessionCalls = 0;

  const controller = createAuthBootstrapRuntimeController({
    api: {
      listDecks: () => {
        listDeckCalls += 1;
        return decksDeferred.promise;
      },
      listSessions: () => {
        listSessionCalls += 1;
        return sessionsDeferred.promise;
      },
      setAuthToken() {}
    },
    getPreferredActiveDeckId: () => "deck-a",
    setDecks: (decks, options) => decksCalls.push([decks, options]),
    setSessions: (sessions) => sessionsCalls.push(sessions),
    setUiError: (message) => errorCalls.push(message),
    markRuntimeBootstrapReady: (source) => readyCalls.push(source)
  });

  const first = controller.bootstrapRuntimeFallback();
  const second = controller.bootstrapRuntimeFallback();

  assert.equal(controller.hasBootstrapInFlight(), true);
  assert.equal(listDeckCalls, 1);
  assert.equal(listSessionCalls, 1);

  decksDeferred.resolve([{ id: "deck-a", name: "Deck A" }]);
  sessionsDeferred.resolve([{ id: "s1" }]);
  await Promise.all([first, second]);

  assert.equal(controller.hasBootstrapInFlight(), false);
  assert.deepEqual(decksCalls, [
    [[{ id: "deck-a", name: "Deck A" }], { preferredActiveDeckId: "deck-a" }]
  ]);
  assert.deepEqual(sessionsCalls, [[{ id: "s1" }]]);
  assert.deepEqual(errorCalls, [""]);
  assert.deepEqual(readyCalls, ["rest"]);
});

test("auth-bootstrap runtime controller falls back to default deck when deck bootstrap fails", async () => {
  let decksPayload = null;
  let sessionsPayload = null;
  let errorMessage = "";
  let readySource = "";

  const controller = createAuthBootstrapRuntimeController({
    defaultDeckId: "default",
    getTerminalSettings: () => ({ cols: 121, rows: 59 }),
    api: {
      async listDecks() {
        throw new Error("boom");
      },
      async listSessions() {
        return [{ id: "s1" }];
      },
      setAuthToken() {}
    },
    setDecks: (decks) => {
      decksPayload = decks;
    },
    setSessions: (sessions) => {
      sessionsPayload = sessions;
    },
    setUiError: (message) => {
      errorMessage = message;
    },
    markRuntimeBootstrapReady: (source) => {
      readySource = source;
    }
  });

  await controller.bootstrapRuntimeFallback();

  assert.deepEqual(decksPayload, [
    {
      id: "default",
      name: "Default",
      settings: {
        terminal: {
          cols: 121,
          rows: 59
        }
      }
    }
  ]);
  assert.deepEqual(sessionsPayload, [{ id: "s1" }]);
  assert.equal(errorMessage, "Failed to fully load runtime state.");
  assert.equal(readySource, "rest");
});

test("auth-bootstrap runtime controller stores dev token and schedules refresh", async () => {
  const windowRef = createFakeWindow();
  const authTokens = [];
  const logs = [];
  const controller = createAuthBootstrapRuntimeController({
    windowRef,
    dateNow: () => 2_000,
    api: {
      async createDevToken() {
        return {
          accessToken: "  bearer-token  ",
          expiresIn: 300,
          scope: "dev"
        };
      },
      setAuthToken(token) {
        authTokens.push(token);
      }
    },
    debugLog: (event, payload) => logs.push([event, payload.reason || payload.refreshAtMs || 0])
  });

  const refreshed = await controller.bootstrapDevAuthToken({ reason: "bootstrap" });

  assert.equal(refreshed, true);
  assert.equal(controller.getWsAuthToken(), "bearer-token");
  assert.deepEqual(authTokens, ["bearer-token"]);
  assert.equal(windowRef.timers.length, 1);
  assert.equal(windowRef.timers[0].delay, 240_000);
  assert.deepEqual(logs, [["auth.dev_token.ok", "bootstrap"]]);
});

test("auth-bootstrap runtime controller stops retries when dev token route is unavailable", async () => {
  const windowRef = createFakeWindow();
  const controller = createAuthBootstrapRuntimeController({
    windowRef,
    api: {
      async createDevToken() {
        const error = new Error("Not found");
        error.status = 404;
        throw error;
      },
      setAuthToken() {}
    }
  });

  const refreshed = await controller.bootstrapDevAuthToken({ reason: "bootstrap" });

  assert.equal(refreshed, false);
  assert.equal(controller.getWsAuthToken(), "");
  assert.equal(windowRef.timers.length, 0);
});

test("auth-bootstrap runtime controller schedules retry after transient dev token failure", async () => {
  const windowRef = createFakeWindow();
  const controller = createAuthBootstrapRuntimeController({
    windowRef,
    devAuthRetryDelayMs: 45_000,
    api: {
      async createDevToken() {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
      },
      setAuthToken() {}
    }
  });

  const refreshed = await controller.bootstrapDevAuthToken({ reason: "bootstrap" });

  assert.equal(refreshed, false);
  assert.equal(windowRef.timers.length, 1);
  assert.equal(windowRef.timers[0].delay, 45_000);
});
