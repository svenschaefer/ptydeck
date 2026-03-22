import test from "node:test";
import assert from "node:assert/strict";
import { loadClientConfig } from "../src/config.js";

test("loadClientConfig applies defaults", () => {
  const config = loadClientConfig({});
  assert.equal(config.port, 18081);
  assert.equal(config.apiBaseUrl, "");
  assert.equal(config.wsUrl, "");
  assert.equal(config.debugLogs, false);
});

test("loadClientConfig maps environment values", () => {
  const config = loadClientConfig({
    FRONTEND_PORT: "6000",
    API_BASE_URL: "http://localhost:9000/api/v1",
    WS_URL: "ws://localhost:9000/ws",
    FRONTEND_DEBUG_LOGS: "true"
  });

  assert.equal(config.port, 6000);
  assert.equal(config.apiBaseUrl, "http://localhost:9000/api/v1");
  assert.equal(config.wsUrl, "ws://localhost:9000/ws");
  assert.equal(config.debugLogs, true);
});
