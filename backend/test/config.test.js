import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("loadConfig applies defaults", () => {
  const config = loadConfig({});
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.port, 18080);
  assert.equal(config.shell, "bash");
  assert.equal(config.dataPath, "./data/sessions.json");
  assert.equal(config.corsOrigin, "*");
  assert.deepEqual(config.corsAllowedOrigins, ["*"]);
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
  assert.deepEqual(config.corsAllowedOrigins, ["http://localhost:3000"]);
  assert.equal(config.maxBodyBytes, 4096);
  assert.equal(config.debugLogs, true);
  assert.equal(config.debugLogFile, "/tmp/ptydeck-debug.log");
});

test("loadConfig requires explicit CORS allowlist in production", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production" }),
    /CORS_ORIGIN must be set in production\./
  );
});

test("loadConfig parses comma-separated CORS allowlist", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    CORS_ORIGIN: " https://app.example.com , https://ops.example.com "
  });
  assert.deepEqual(config.corsAllowedOrigins, ["https://app.example.com", "https://ops.example.com"]);
  assert.equal(config.corsOrigin, "https://app.example.com");
});

test("loadConfig rejects invalid critical numeric values", () => {
  assert.throws(() => loadConfig({ PORT: "0" }), /PORT must be an integer between 1 and 65535\./);
  assert.throws(() => loadConfig({ MAX_BODY_BYTES: "0" }), /MAX_BODY_BYTES must be a positive integer\./);
});

test("loadConfig rejects invalid CORS origin values", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "ftp://example.com"
      }),
    /CORS_ORIGIN contains invalid origin/
  );
});
