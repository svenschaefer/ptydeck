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
