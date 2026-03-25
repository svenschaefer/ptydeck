import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/public/api-client.js";

test("api client calls list sessions endpoint", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push({ url, method: "GET" });
    return { ok: true, status: 200, json: async () => [] };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.listSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/sessions");
});

test("api client calls ready endpoint outside api v1 base path", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push({ url, method: "GET" });
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "starting", phase: "starting_sessions", warmup: { enabled: true } })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  const payload = await api.getReadyStatus();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/ready");
  assert.equal(payload.status, "starting");
  assert.equal(payload.phase, "starting_sessions");
});

test("api client calls deck lifecycle and move endpoints", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const method = options.method || "GET";
    if (method === "DELETE") {
      return { ok: true, status: 204, json: async () => ({}) };
    }
    if (method === "POST" && String(url).includes(":move")) {
      return {
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("move 204 response must not be parsed as JSON");
        }
      };
    }
    if (method === "GET" && String(url).endsWith("/sessions/abc")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "abc",
          deckId: "ops",
          state: "active",
          shell: "bash",
          cwd: "~",
          name: "abc",
          tags: [],
          createdAt: 1,
          updatedAt: 2
        })
      };
    }
    return {
      ok: true,
      status: method === "POST" ? 201 : 200,
      json: async () => ({ id: "default", name: "Default", settings: {}, createdAt: 1, updatedAt: 2 })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.listDecks();
  await api.createDeck({ name: "Ops" });
  await api.updateDeck("ops", { name: "Ops Team" });
  await api.moveSessionToDeck("ops", "abc");
  await api.deleteDeck("ops", { force: true });

  assert.equal(calls.length, 6);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/decks");
  assert.equal(calls[1].url, "http://localhost:18080/api/v1/decks");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].url, "http://localhost:18080/api/v1/decks/ops");
  assert.equal(calls[2].options.method, "PATCH");
  assert.equal(calls[3].url, "http://localhost:18080/api/v1/decks/ops/sessions/abc:move");
  assert.equal(calls[3].options.method, "POST");
  assert.equal(calls[4].url, "http://localhost:18080/api/v1/sessions/abc");
  assert.equal((calls[4].options.method || "GET"), "GET");
  assert.equal(calls[5].url, "http://localhost:18080/api/v1/decks/ops?force=true");
  assert.equal(calls[5].options.method, "DELETE");
});

test("api client includes bearer auth header when token is set", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [] };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  api.setAuthToken("dev-token");
  await api.listSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, "Bearer dev-token");
});

test("api client retries once after 401 when unauthorized recovery succeeds", async () => {
  const calls = [];
  let attempt = 0;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    attempt += 1;
    if (attempt === 1) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized", message: "Token expired." })
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  let recoveryCalls = 0;
  const api = createApiClient("http://localhost:18080/api/v1", {
    async onUnauthorized() {
      recoveryCalls += 1;
      api.setAuthToken("fresh-token");
      return true;
    }
  });
  api.setAuthToken("stale-token");
  await api.listSessions();

  assert.equal(recoveryCalls, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.authorization, "Bearer stale-token");
  assert.equal(calls[1].options.headers.authorization, "Bearer fresh-token");
});

test("api client does not run unauthorized recovery for auth endpoints", async () => {
  let recoveryCalls = 0;
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "Unauthorized", message: "Unauthorized." })
  });

  const api = createApiClient("http://localhost:18080/api/v1", {
    async onUnauthorized() {
      recoveryCalls += 1;
      return true;
    }
  });

  await assert.rejects(api.createDevToken(), (err) => err.name === "ApiClientError" && err.status === 401);
  assert.equal(recoveryCalls, 0);
});

test("api client calls input endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 204, json: async () => ({}) };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.sendInput("abc", "pwd\n");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/sessions/abc/input");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
});

test("api client surfaces backend ErrorResponse on non-2xx", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: "SessionNotFound", message: "Session 'abc' was not found." })
  });

  const api = createApiClient("http://localhost:18080/api/v1");

  await assert.rejects(
    api.getSession("abc"),
    (err) =>
      err.name === "ApiClientError" &&
      err.status === 404 &&
      err.error === "SessionNotFound" &&
      err.message === "Session 'abc' was not found."
  );
});

test("api client throws fallback error when non-2xx body is not json", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("invalid json");
    }
  });

  const api = createApiClient("http://localhost:18080/api/v1");

  await assert.rejects(
    api.listSessions(),
    (err) =>
      err.name === "ApiClientError" &&
      err.status === 502 &&
      err.error === "RequestFailed" &&
      err.message === "Request failed with status 502."
  );
});

test("api client calls update session endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "abc", cwd: "/tmp", shell: "bash", name: "renamed", createdAt: 1, updatedAt: 2 })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.updateSession("abc", { name: "renamed" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/sessions/abc");
  assert.equal(calls[0].options.method, "PATCH");
});

test("api client calls restart session endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "abc", cwd: "/tmp", shell: "bash", name: "renamed", createdAt: 1, updatedAt: 3 })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.restartSession("abc");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/sessions/abc/restart");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
});

test("api client calls create dev token endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "abc", tokenType: "Bearer", expiresIn: 900, scope: "sessions:read" })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.createDevToken();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/auth/dev-token");
  assert.equal(calls[0].options.method, "POST");
});

test("api client calls create ws ticket endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ticket: "ticket-123", tokenType: "WsTicket", expiresIn: 30 })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  api.setAuthToken("dev-token");
  await api.createWsTicket();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/auth/ws-ticket");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer dev-token");
});

test("api client calls upsert custom command endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        name: "docu",
        content: "echo docs\n",
        createdAt: 1,
        updatedAt: 2
      })
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.upsertCustomCommand("docu", "echo docs\n");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/custom-commands/docu");
  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), { content: "echo docs\n" });
});

test("api client calls custom command list/get/delete endpoints", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if ((options.method || "GET") === "DELETE") {
      return { ok: true, status: 204, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [{ name: "docu", content: "echo docs\n", createdAt: 1, updatedAt: 2 }]
    };
  };

  const api = createApiClient("http://localhost:18080/api/v1");
  await api.listCustomCommands();
  await api.getCustomCommand("docu");
  await api.deleteCustomCommand("docu");

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "http://localhost:18080/api/v1/custom-commands");
  assert.equal(calls[1].url, "http://localhost:18080/api/v1/custom-commands/docu");
  assert.equal(calls[2].url, "http://localhost:18080/api/v1/custom-commands/docu");
  assert.equal(calls[2].options.method, "DELETE");
});
