import test from "node:test";
import assert from "node:assert/strict";
import { loadClientConfig } from "../src/config.js";

test("loadClientConfig applies defaults", () => {
  const config = loadClientConfig({});
  assert.equal(config.port, 5173);
  assert.equal(config.apiBaseUrl, "http://localhost:8080/api/v1");
  assert.equal(config.wsUrl, "ws://localhost:8080/ws");
});

test("loadClientConfig maps environment values", () => {
  const config = loadClientConfig({
    FRONTEND_PORT: "6000",
    API_BASE_URL: "http://localhost:9000/api/v1",
    WS_URL: "ws://localhost:9000/ws"
  });

  assert.equal(config.port, 6000);
  assert.equal(config.apiBaseUrl, "http://localhost:9000/api/v1");
  assert.equal(config.wsUrl, "ws://localhost:9000/ws");
});
