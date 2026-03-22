import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/public/api-client.js";

test("api client calls list sessions endpoint", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push({ url, method: "GET" });
    return { json: async () => [] };
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
    return { json: async () => ({}) };
  };

  const api = createApiClient("http://localhost:8080/api/v1");
  await api.sendInput("abc", "pwd\n");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/v1/sessions/abc/input");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
});
