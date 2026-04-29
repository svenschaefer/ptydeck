import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeSessionControlDispatch } from "../src/runtime-session-control-dispatch.js";

function createWriter() {
  const calls = [];
  return {
    calls,
    writeJsonResponse(statusCode, body) {
      calls.push({ statusCode, body });
    }
  };
}

function createValidateRecorder() {
  const calls = [];
  return {
    calls,
    validateResponse(input) {
      calls.push(input);
    }
  };
}

test("runtime session-control dispatch handles the dedicated control routes deterministically", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  const auth = { subject: "operator" };
  const req = { method: "POST" };
  const trace = { traceId: "trc-session-control" };
  const dispatcher = createRuntimeSessionControlDispatch({
    validateResponse: validation.validateResponse,
    takeSessionControlOrThrow(sessionId, requestAuth, request, traceSeed) {
      observed.push(["take", sessionId, requestAuth.subject, request.method, traceSeed.sessionId]);
      return { canWrite: true, controllerClientId: "client-1" };
    },
    takeSessionControlScopeOrThrow(scope, body, requestAuth, request, traceSeed) {
      observed.push(["scope", scope, body.deckId, requestAuth.subject, request.method, traceSeed.scope]);
      return {
        scope,
        deckId: body.deckId,
        sessionId: "",
        controllerClientId: "client-1",
        updatedSessions: [{ id: "session-2" }]
      };
    },
    releaseSessionControlOrThrow(sessionId, requestAuth, request, traceSeed) {
      observed.push(["release", sessionId, requestAuth.subject, request.method, traceSeed.sessionId]);
      return { canWrite: false, controllerClientId: "" };
    },
    transferSessionControlOrThrow(sessionId, clientId, requestAuth, request, traceSeed) {
      observed.push(["transfer", sessionId, clientId, requestAuth.subject, request.method, traceSeed.sessionId]);
      return { canWrite: true, controllerClientId: clientId };
    },
    renameSessionControlClientOrThrow(sessionId, label, requestAuth, request, traceSeed) {
      observed.push(["rename", sessionId, label, requestAuth.subject, request.method, traceSeed.sessionId]);
      return { canWrite: true, controllerClientId: "client-1", label };
    },
    forgetSessionControlClientOrThrow(sessionId, clientId, requestAuth, request, traceSeed) {
      observed.push(["forget", sessionId, clientId, requestAuth.subject, request.method, traceSeed.sessionId]);
      return { canWrite: true, controllerClientId: "client-1" };
    },
    getApiSessionOrThrow(sessionId, requestAuth) {
      observed.push(["getSession", sessionId, requestAuth.subject]);
      return { id: sessionId, deckId: "deck-1" };
    },
    persistNow: async (reason) => {
      observed.push(["persist", reason]);
    }
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "takeSessionControl", params: { sessionId: "session-1" } },
    body: {},
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "takeSessionControlScope", params: {} },
    body: { scope: "deck", deckId: "deck-1" },
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "releaseSessionControl", params: { sessionId: "session-1" } },
    body: {},
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "transferSessionControl", params: { sessionId: "session-1" } },
    body: { clientId: "client-2" },
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "renameSessionControlClient", params: { sessionId: "session-1" } },
    body: { label: "Desk" },
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  await dispatcher.dispatchSessionControlRequest({
    match: { kind: "forgetSessionControlClient", params: { sessionId: "session-1" } },
    body: { clientId: "client-3" },
    auth,
    req,
    requestTraceContext: trace,
    writeJsonResponse: writer.writeJsonResponse
  });

  assert.deepEqual(writer.calls, [
    {
      statusCode: 200,
      body: {
        id: "session-1",
        deckId: "deck-1",
        controlState: { canWrite: true, controllerClientId: "client-1" }
      }
    },
    {
      statusCode: 200,
      body: {
        scope: "deck",
        deckId: "deck-1",
        sessionId: "",
        controllerClientId: "client-1",
        updatedSessions: [{ id: "session-2" }]
      }
    },
    {
      statusCode: 200,
      body: {
        id: "session-1",
        deckId: "deck-1",
        controlState: { canWrite: false, controllerClientId: "" }
      }
    },
    {
      statusCode: 200,
      body: {
        id: "session-1",
        deckId: "deck-1",
        controlState: { canWrite: true, controllerClientId: "client-2" }
      }
    },
    {
      statusCode: 200,
      body: {
        id: "session-1",
        deckId: "deck-1",
        controlState: { canWrite: true, controllerClientId: "client-1", label: "Desk" }
      }
    },
    {
      statusCode: 200,
      body: {
        id: "session-1",
        deckId: "deck-1",
        controlState: { canWrite: true, controllerClientId: "client-1" }
      }
    }
  ]);

  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect, entry.body.id || entry.body.scope]), [
    [200, "session", "session-1"],
    [200, "session", "session-1"],
    [200, "session", "session-1"],
    [200, "session", "session-1"],
    [200, "session", "session-1"]
  ]);

  assert.deepEqual(observed, [
    ["take", "session-1", "operator", "POST", "session-1"],
    ["getSession", "session-1", "operator"],
    ["persist", "session.control.take"],
    ["scope", "deck", "deck-1", "operator", "POST", "deck"],
    ["persist", "session.control.scope_take"],
    ["release", "session-1", "operator", "POST", "session-1"],
    ["getSession", "session-1", "operator"],
    ["persist", "session.control.release"],
    ["transfer", "session-1", "client-2", "operator", "POST", "session-1"],
    ["getSession", "session-1", "operator"],
    ["persist", "session.control.transfer"],
    ["rename", "session-1", "Desk", "operator", "POST", "session-1"],
    ["getSession", "session-1", "operator"],
    ["persist", "session.control.rename_client"],
    ["forget", "session-1", "client-3", "operator", "POST", "session-1"],
    ["getSession", "session-1", "operator"],
    ["persist", "session.control.forget_client"]
  ]);
});

test("runtime session-control dispatch reports unmatched routes as unhandled", async () => {
  const writer = createWriter();
  const dispatcher = createRuntimeSessionControlDispatch();

  assert.equal(
    await dispatcher.dispatchSessionControlRequest({
      match: { kind: "restart", params: { sessionId: "session-1" } },
      body: {},
      auth: null,
      req: { method: "POST" },
      requestTraceContext: { traceId: "trc-noop" },
      writeJsonResponse: writer.writeJsonResponse
    }),
    false
  );
  assert.deepEqual(writer.calls, []);
});
