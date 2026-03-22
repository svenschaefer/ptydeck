import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("loadConfig applies defaults", () => {
  const config = loadConfig({});
  assert.equal(config.port, 8080);
  assert.equal(config.shell, "bash");
  assert.equal(config.dataPath, "./data/sessions.json");
  assert.equal(config.corsOrigin, "*");
  assert.equal(config.maxBodyBytes, 1024 * 1024);
  assert.equal(config.debugLogs, false);
  assert.equal(config.debugLogFile, "");
});

test("loadConfig maps environment values", () => {
  const config = loadConfig({
    PORT: "9090",
    SHELL: "zsh",
    DATA_PATH: "/tmp/ptydeck.json",
    CORS_ORIGIN: "http://localhost:3000",
    MAX_BODY_BYTES: "4096",
    BACKEND_DEBUG_LOGS: "true",
    BACKEND_DEBUG_LOG_FILE: "/tmp/ptydeck-debug.log"
  });

  assert.equal(config.port, 9090);
  assert.equal(config.shell, "zsh");
  assert.equal(config.dataPath, "/tmp/ptydeck.json");
  assert.equal(config.corsOrigin, "http://localhost:3000");
  assert.equal(config.maxBodyBytes, 4096);
  assert.equal(config.debugLogs, true);
  assert.equal(config.debugLogFile, "/tmp/ptydeck-debug.log");
});
