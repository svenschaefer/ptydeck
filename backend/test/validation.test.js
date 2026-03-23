import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, validateResponse } from "../src/validation.js";

const THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};

test("validateRequest accepts valid input body", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: { data: "echo hi\n" }
    });
  });
});

test("validateRequest rejects invalid resize payload", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/resize",
      params: { sessionId: "abc" },
      body: { cols: 0, rows: 10 }
    });
  });
});

test("validateResponse checks session list schema", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionList",
      body: [
        {
          id: "a",
          deckId: "default",
          state: "active",
          cwd: "/tmp",
          shell: "bash",
          startCwd: "/tmp",
          startCommand: "",
          env: {},
          tags: [],
          themeProfile: THEME_PROFILE,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    });
  });
});

test("validateRequest rejects invalid session create body", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: "not-an-object"
    });
  });
});

test("validateRequest rejects missing input payload field", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: {}
    });
  });
});

test("validateResponse rejects invalid session shape", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: {
        id: "a",
        cwd: "/tmp"
      }
    });
  });
});

test("validateRequest accepts valid session patch payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        name: "renamed",
        startCwd: "/tmp",
        startCommand: "echo hi",
        env: { FOO: "BAR" },
        tags: ["ops", "prod"],
        themeProfile: THEME_PROFILE
      }
    });
  });
});

test("validateRequest accepts valid dev token request payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/dev-token",
      params: {},
      body: { subject: "alice", tenantId: "dev", scopes: ["sessions:read"] }
    });
  });
});

test("validateResponse accepts auth token response", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "authToken",
      body: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: 900,
        scope: "sessions:read"
      }
    });
  });
});

test("validateRequest accepts valid custom command upsert payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: "echo hi\n" }
    });
  });
});

test("validateRequest rejects invalid custom command upsert payload", () => {
  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: 123 }
    });
  });
});

test("validateResponse accepts custom command payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "customCommand",
      body: {
        name: "docu",
        content: "echo hi\n",
        createdAt: 1,
        updatedAt: 2
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "customCommandList",
      body: [
        {
          name: "docu",
          content: "echo hi\n",
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  });
});

test("validateRequest accepts valid deck create/patch and move payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/decks",
      params: {},
      body: { id: "ops", name: "Operations", settings: { terminal: { cols: 80, rows: 24 } } }
    });
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/decks/ops",
      params: { deckId: "ops" },
      body: { name: "Ops" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/decks/ops/sessions/abc:move",
      params: { deckId: "ops", sessionId: "abc" },
      body: {}
    });
  });
});

test("validateResponse accepts deck payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "deck",
      body: {
        id: "ops",
        name: "Operations",
        settings: {},
        createdAt: 1,
        updatedAt: 2
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "deckList",
      body: [
        {
          id: "ops",
          name: "Operations",
          settings: {},
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  });
});
