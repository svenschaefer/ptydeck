import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, validateResponse } from "../src/validation.js";

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
          cwd: "/tmp",
          shell: "bash",
          startCwd: "/tmp",
          startCommand: "",
          env: {},
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
      body: { name: "renamed", startCwd: "/tmp", startCommand: "echo hi", env: { FOO: "BAR" } }
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
