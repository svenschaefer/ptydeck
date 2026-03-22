import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/public/api-client.js";

test("api client calls list sessions endpoint", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push({ url, method: "GET" });
    return { ok: true, status: 200, json: async () => [] };
  };

  const api = createApiClient("http://localhost:8080/api/v1");
  await api.listSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/v1/sessions");
});

test("api client calls input endpoint", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 204, json: async () => ({}) };
  };

  const api = createApiClient("http://localhost:8080/api/v1");
  await api.sendInput("abc", "pwd\n");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/v1/sessions/abc/input");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
});

test("api client surfaces backend ErrorResponse on non-2xx", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: "SessionNotFound", message: "Session 'abc' was not found." })
  });

  const api = createApiClient("http://localhost:8080/api/v1");

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

  const api = createApiClient("http://localhost:8080/api/v1");

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

  const api = createApiClient("http://localhost:8080/api/v1");
  await api.updateSession("abc", { name: "renamed" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/v1/sessions/abc");
  assert.equal(calls[0].options.method, "PATCH");
});
