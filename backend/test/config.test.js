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
  assert.equal(config.sessionMaxConcurrent, 0);
  assert.equal(config.sessionIdleTimeoutMs, 0);
  assert.equal(config.sessionMaxLifetimeMs, 0);
  assert.equal(config.sessionReplayMemoryMaxChars, 16 * 1024);
  assert.equal(config.sessionReplayPersistMaxChars, 0);
  assert.equal(config.sessionFileTransferMaxBytes, 256 * 1024);
  assert.equal(config.sessionActivityQuietMs, 1400);
  assert.equal(config.sessionGuardrailSweepMs, 1000);
  assert.equal(config.debugLogs, false);
  assert.equal(config.debugLogFile, "");
  assert.equal(config.sessionStreamAnalysisCaptureFile, "");
  assert.deepEqual(config.sessionStreamAnalysisCaptureAppLabels, ["codex"]);
  assert.equal(config.sessionStreamAnalysisCaptureMaxBytes, 32 * 1024 * 1024);
  assert.equal(config.enforceTlsIngress, false);
  assert.equal(config.dataEncryptionProvider, null);
  assert.deepEqual(config.trustedProxy, { mode: "off", ips: [] });
  assert.equal(config.authMode, "off");
  assert.equal(config.authEnabled, false);
  assert.equal(config.authDevMode, false);
  assert.equal(config.authDevSecret, "ptydeck-dev-secret");
  assert.equal(config.authIssuer, "ptydeck-dev");
  assert.equal(config.authAudience, "ptydeck-local");
  assert.equal(config.authDevTokenTtlSeconds, 900);
  assert.equal(config.authWsTicketTtlSeconds, 30);
  assert.equal(config.messagingTelegramBotToken, "");
  assert.deepEqual(config.messagingTelegramTargets, []);
  assert.equal(config.messagingTelegramApiBaseUrl, "https://api.telegram.org");
  assert.equal(config.messagingTelegramOutboundEnabled, false);
  assert.equal(config.messagingTelegramInboundEnabled, false);
  assert.equal(config.messagingTelegramPollTimeoutSeconds, 3);
  assert.deepEqual(config.messagingDiscordTargets, []);
  assert.equal(config.messagingDiscordApiBaseUrl, "https://discord.com/api/v10");
  assert.equal(config.messagingDiscordOutboundEnabled, false);
  assert.equal(Object.hasOwn(config, "messagingTelegramOutboundHardBreakActive"), false);
  assert.equal(Object.hasOwn(config, "messagingTerminalSemanticPrimaryMode"), false);
});

test("loadConfig maps environment values", () => {
  const config = loadConfig({
    PORT: "9090",
    SHELL: "zsh",
    DATA_PATH: "/tmp/ptydeck.json",
    CORS_ORIGIN: "https://localhost:3000",
    MAX_BODY_BYTES: "4096",
    RATE_LIMIT_WINDOW_MS: "30000",
    RATE_LIMIT_REST_CREATE_MAX: "10",
    RATE_LIMIT_WS_CONNECT_MAX: "15",
    SESSION_MAX_CONCURRENT: "7",
    SESSION_IDLE_TIMEOUT_MS: "120000",
    SESSION_MAX_LIFETIME_MS: "3600000",
    SESSION_REPLAY_MEMORY_MAX_CHARS: "65536",
    SESSION_REPLAY_PERSIST_MAX_CHARS: "8192",
    SESSION_FILE_TRANSFER_MAX_BYTES: "262144",
    SESSION_ACTIVITY_QUIET_MS: "2500",
    SESSION_GUARDRAIL_SWEEP_MS: "250",
    DATA_ENCRYPTION_KEYS: `key-a:${Buffer.alloc(32, 1).toString("base64")}`,
    DATA_ENCRYPTION_ACTIVE_KEY_ID: "key-a",
    BACKEND_DEBUG_LOGS: "true",
    BACKEND_DEBUG_LOG_FILE: "/tmp/ptydeck-debug.log",
    SESSION_STREAM_ANALYSIS_CAPTURE_FILE: "/tmp/ptydeck-stream-analysis.jsonl",
    SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS: "codex, gemini-cli , codex",
    SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES: "65536",
    TRUST_PROXY: "loopback",
    AUTH_MODE: "dev",
    AUTH_DEV_SECRET: "custom-secret",
    AUTH_ISSUER: "issuer-a",
    AUTH_AUDIENCE: "aud-a",
    AUTH_DEV_TOKEN_TTL_SECONDS: "1200",
    AUTH_WS_TICKET_TTL_SECONDS: "45",
    ENFORCE_TLS_INGRESS: "true",
    MESSAGING_TELEGRAM_BOT_TOKEN: "telegram-token",
    MESSAGING_TELEGRAM_TARGETS: JSON.stringify([{ sessionName: "build", chatId: "1001" }]),
    MESSAGING_TELEGRAM_API_BASE_URL: "https://api.telegram.example",
    MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS: "7",
    MESSAGING_DISCORD_TARGETS: JSON.stringify([
      {
        sessionName: "claude",
        channelId: "ops-room",
        threadId: 71,
        webhookUrl: "https://discord.example/api/v10/webhooks/123/token"
      }
    ]),
    MESSAGING_DISCORD_API_BASE_URL: "https://discord.example/api/v10"
  });

  assert.equal(config.port, 9090);
  assert.equal(config.shell, "zsh");
  assert.equal(config.dataPath, "/tmp/ptydeck.json");
  assert.equal(config.corsOrigin, "https://localhost:3000");
  assert.deepEqual(config.corsAllowedOrigins, ["https://localhost:3000"]);
  assert.equal(config.maxBodyBytes, 4096);
  assert.equal(config.rateLimitWindowMs, 30000);
  assert.equal(config.rateLimitRestCreateMax, 10);
  assert.equal(config.rateLimitWsConnectMax, 15);
  assert.equal(config.sessionMaxConcurrent, 7);
  assert.equal(config.sessionIdleTimeoutMs, 120000);
  assert.equal(config.sessionMaxLifetimeMs, 3600000);
  assert.equal(config.sessionReplayMemoryMaxChars, 65536);
  assert.equal(config.sessionReplayPersistMaxChars, 8192);
  assert.equal(config.sessionFileTransferMaxBytes, 262144);
  assert.equal(config.sessionActivityQuietMs, 2500);
  assert.equal(config.sessionGuardrailSweepMs, 250);
  assert.equal(config.dataEncryptionProvider?.getActiveKey().id, "key-a");
  assert.equal(config.debugLogs, true);
  assert.equal(config.debugLogFile, "/tmp/ptydeck-debug.log");
  assert.equal(config.sessionStreamAnalysisCaptureFile, "/tmp/ptydeck-stream-analysis.jsonl");
  assert.deepEqual(config.sessionStreamAnalysisCaptureAppLabels, ["codex", "gemini-cli"]);
  assert.equal(config.sessionStreamAnalysisCaptureMaxBytes, 65536);
  assert.equal(config.enforceTlsIngress, true);
  assert.deepEqual(config.trustedProxy, { mode: "loopback", ips: [] });
  assert.equal(config.authMode, "dev");
  assert.equal(config.authEnabled, true);
  assert.equal(config.authDevMode, true);
  assert.equal(config.authDevSecret, "custom-secret");
  assert.equal(config.authIssuer, "issuer-a");
  assert.equal(config.authAudience, "aud-a");
  assert.equal(config.authDevTokenTtlSeconds, 1200);
  assert.equal(config.authWsTicketTtlSeconds, 45);
  assert.equal(config.messagingTelegramBotToken, "telegram-token");
  assert.deepEqual(config.messagingTelegramTargets, [{ sessionName: "build", chatId: "1001" }]);
  assert.equal(config.messagingTelegramApiBaseUrl, "https://api.telegram.example");
  assert.equal(config.messagingTelegramOutboundEnabled, true);
  assert.equal(config.messagingTelegramInboundEnabled, true);
  assert.equal(config.messagingTelegramPollTimeoutSeconds, 7);
  assert.deepEqual(config.messagingDiscordTargets, [
    {
      sessionName: "claude",
      channelId: "ops-room",
      threadId: 71,
      webhookUrl: "https://discord.example/api/v10/webhooks/123/token"
    }
  ]);
  assert.equal(config.messagingDiscordApiBaseUrl, "https://discord.example/api/v10");
  assert.equal(config.messagingDiscordOutboundEnabled, true);
  assert.equal(Object.hasOwn(config, "messagingTelegramOutboundHardBreakActive"), false);
  assert.equal(Object.hasOwn(config, "messagingTerminalSemanticPrimaryMode"), false);
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
    CORS_ORIGIN: " https://app.example.com , https://ops.example.com ",
    TRUST_PROXY: "loopback"
  });
  assert.deepEqual(config.corsAllowedOrigins, ["https://app.example.com", "https://ops.example.com"]);
  assert.equal(config.corsOrigin, "https://app.example.com");
});

test("loadConfig enables TLS ingress enforcement by default in production", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    CORS_ORIGIN: "https://app.example.com",
    TRUST_PROXY: "loopback"
  });
  assert.equal(config.enforceTlsIngress, true);
});

test("loadConfig rejects invalid critical numeric values", () => {
  assert.throws(() => loadConfig({ PORT: "0" }), /PORT must be an integer between 1 and 65535\./);
  assert.throws(() => loadConfig({ MAX_BODY_BYTES: "0" }), /MAX_BODY_BYTES must be a positive integer\./);
  assert.throws(() => loadConfig({ RATE_LIMIT_WINDOW_MS: "0" }), /RATE_LIMIT_WINDOW_MS must be a positive integer\./);
  assert.throws(
    () => loadConfig({ SESSION_REPLAY_MEMORY_MAX_CHARS: "-1" }),
    /SESSION_REPLAY_MEMORY_MAX_CHARS must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_REPLAY_PERSIST_MAX_CHARS: "-1" }),
    /SESSION_REPLAY_PERSIST_MAX_CHARS must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_FILE_TRANSFER_MAX_BYTES: "0" }),
    /SESSION_FILE_TRANSFER_MAX_BYTES must be a positive integer\./
  );
  assert.throws(
    () =>
      loadConfig({
        SESSION_REPLAY_MEMORY_MAX_CHARS: "1024",
        SESSION_REPLAY_PERSIST_MAX_CHARS: "2048"
      }),
    /SESSION_REPLAY_PERSIST_MAX_CHARS must be less than or equal to SESSION_REPLAY_MEMORY_MAX_CHARS\./
  );
  assert.throws(
    () => loadConfig({ SESSION_ACTIVITY_QUIET_MS: "0" }),
    /SESSION_ACTIVITY_QUIET_MS must be a positive integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES: "0" }),
    /SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES must be a positive integer\./
  );
  assert.throws(
    () => loadConfig({ RATE_LIMIT_REST_CREATE_MAX: "-1" }),
    /RATE_LIMIT_REST_CREATE_MAX must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ RATE_LIMIT_WS_CONNECT_MAX: "-1" }),
    /RATE_LIMIT_WS_CONNECT_MAX must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_MAX_CONCURRENT: "-1" }),
    /SESSION_MAX_CONCURRENT must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_IDLE_TIMEOUT_MS: "-1" }),
    /SESSION_IDLE_TIMEOUT_MS must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_MAX_LIFETIME_MS: "-1" }),
    /SESSION_MAX_LIFETIME_MS must be a non-negative integer\./
  );
  assert.throws(
    () => loadConfig({ SESSION_GUARDRAIL_SWEEP_MS: "0" }),
    /SESSION_GUARDRAIL_SWEEP_MS must be a positive integer\./
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

test("loadConfig rejects insecure production CORS wildcard and TLS ingress mismatches", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "*",
        TRUST_PROXY: "loopback"
      }),
    /CORS_ORIGIN wildcard is not allowed in production/
  );
  assert.throws(
    () =>
      loadConfig({
        ENFORCE_TLS_INGRESS: "true",
        CORS_ORIGIN: "http://app.example.com",
        TRUST_PROXY: "loopback"
      }),
    /ENFORCE_TLS_INGRESS requires HTTPS CORS_ORIGIN values/
  );
  assert.throws(
    () =>
      loadConfig({
        ENFORCE_TLS_INGRESS: "true",
        CORS_ORIGIN: "https://app.example.com",
        TRUST_PROXY: "off"
      }),
    /ENFORCE_TLS_INGRESS requires TRUST_PROXY to be configured/
  );
});

test("loadConfig derives dev mode from legacy flags and rejects unsupported prod mode", () => {
  const legacy = loadConfig({ AUTH_ENABLED: "true", AUTH_DEV_MODE: "true" });
  assert.equal(legacy.authMode, "dev");
  assert.throws(
    () => loadConfig({ AUTH_MODE: "prod" }),
    /AUTH_MODE=prod is not yet supported; use AUTH_MODE=off or AUTH_MODE=dev\./
  );
});

test("loadConfig rejects invalid trusted proxy configuration", () => {
  assert.throws(() => loadConfig({ TRUST_PROXY: "invalid-ip" }), /TRUST_PROXY contains invalid IP address/);
});

test("loadConfig rejects invalid data encryption configuration", () => {
  const keyA = Buffer.alloc(32, 1).toString("base64");
  assert.throws(
    () => loadConfig({ DATA_ENCRYPTION_KEYS: `key-a:${keyA}` }),
    /DATA_ENCRYPTION_KEYS and DATA_ENCRYPTION_ACTIVE_KEY_ID must be set together/
  );
  assert.throws(
    () => loadConfig({ DATA_ENCRYPTION_KEYS: "key-a:not-base64", DATA_ENCRYPTION_ACTIVE_KEY_ID: "key-a" }),
    /must be 32 bytes/
  );
});

test("loadConfig rejects partial or malformed telegram messaging configuration", () => {
  assert.throws(
    () => loadConfig({ MESSAGING_TELEGRAM_BOT_TOKEN: "token" }),
    /MESSAGING_TELEGRAM_BOT_TOKEN and MESSAGING_TELEGRAM_TARGETS must be configured together/
  );
  assert.throws(
    () => loadConfig({ MESSAGING_TELEGRAM_TARGETS: "[{\"sessionName\":\"build\",\"chatId\":\"1001\"}]" }),
    /MESSAGING_TELEGRAM_BOT_TOKEN and MESSAGING_TELEGRAM_TARGETS must be configured together/
  );
  assert.throws(
    () => loadConfig({ MESSAGING_TELEGRAM_BOT_TOKEN: "token", MESSAGING_TELEGRAM_TARGETS: "{bad}" }),
    /MESSAGING_TELEGRAM_TARGETS must contain a valid JSON array/
  );
  assert.throws(
    () => loadConfig({ MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS: "0" }),
    /MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS must be a positive integer/
  );
});
