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
  assert.equal(config.rateLimitWindowMs, 60000);
  assert.equal(config.rateLimitRestCreateMax, 60);
  assert.equal(config.rateLimitWsConnectMax, 60);
  assert.equal(config.debugLogs, false);
  assert.equal(config.debugLogFile, "");
  assert.deepEqual(config.trustedProxy, { mode: "off", ips: [] });
  assert.equal(config.authEnabled, false);
  assert.equal(config.authDevMode, false);
  assert.equal(config.authDevSecret, "ptydeck-dev-secret");
  assert.equal(config.authIssuer, "ptydeck-dev");
  assert.equal(config.authAudience, "ptydeck-local");
  assert.equal(config.authDevTokenTtlSeconds, 900);
});

test("loadConfig maps environment values", () => {
  const config = loadConfig({
    PORT: "9090",
    SHELL: "zsh",
    DATA_PATH: "/tmp/ptydeck.json",
    CORS_ORIGIN: "http://localhost:3000",
    MAX_BODY_BYTES: "4096",
    RATE_LIMIT_WINDOW_MS: "30000",
    RATE_LIMIT_REST_CREATE_MAX: "10",
    RATE_LIMIT_WS_CONNECT_MAX: "15",
    BACKEND_DEBUG_LOGS: "true",
    BACKEND_DEBUG_LOG_FILE: "/tmp/ptydeck-debug.log",
    TRUST_PROXY: "loopback",
    AUTH_ENABLED: "true",
    AUTH_DEV_MODE: "true",
    AUTH_DEV_SECRET: "custom-secret",
    AUTH_ISSUER: "issuer-a",
    AUTH_AUDIENCE: "aud-a",
    AUTH_DEV_TOKEN_TTL_SECONDS: "1200"
  });

  assert.equal(config.port, 9090);
  assert.equal(config.shell, "zsh");
  assert.equal(config.dataPath, "/tmp/ptydeck.json");
  assert.equal(config.corsOrigin, "http://localhost:3000");
  assert.deepEqual(config.corsAllowedOrigins, ["http://localhost:3000"]);
  assert.equal(config.maxBodyBytes, 4096);
  assert.equal(config.rateLimitWindowMs, 30000);
  assert.equal(config.rateLimitRestCreateMax, 10);
  assert.equal(config.rateLimitWsConnectMax, 15);
  assert.equal(config.debugLogs, true);
  assert.equal(config.debugLogFile, "/tmp/ptydeck-debug.log");
  assert.deepEqual(config.trustedProxy, { mode: "loopback", ips: [] });
  assert.equal(config.authEnabled, true);
  assert.equal(config.authDevMode, true);
  assert.equal(config.authDevSecret, "custom-secret");
  assert.equal(config.authIssuer, "issuer-a");
  assert.equal(config.authAudience, "aud-a");
  assert.equal(config.authDevTokenTtlSeconds, 1200);
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
  assert.throws(() => loadConfig({ RATE_LIMIT_WINDOW_MS: "0" }), /RATE_LIMIT_WINDOW_MS must be a positive integer\./);
  assert.throws(
    () => loadConfig({ RATE_LIMIT_REST_CREATE_MAX: "-1" }),
    /RATE_LIMIT_REST_CREATE_MAX must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ RATE_LIMIT_WS_CONNECT_MAX: "-1" }),
    /RATE_LIMIT_WS_CONNECT_MAX must be a non-negative integer\./
  );
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

test("loadConfig rejects unsupported auth mode without dev mode", () => {
  assert.throws(
    () => loadConfig({ AUTH_ENABLED: "true", AUTH_DEV_MODE: "false" }),
    /AUTH_ENABLED currently requires AUTH_DEV_MODE=1\./
  );
});

test("loadConfig rejects invalid trusted proxy configuration", () => {
  assert.throws(() => loadConfig({ TRUST_PROXY: "invalid-ip" }), /TRUST_PROXY contains invalid IP address/);
});
