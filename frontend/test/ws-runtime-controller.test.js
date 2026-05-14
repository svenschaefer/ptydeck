import test from "node:test";
import assert from "node:assert/strict";

import { createWsRuntimeController } from "../src/public/ws-runtime-controller.js";

test("ws-runtime controller wires state transitions, session-data routing, and runtime events", async () => {
  const calls = [];
  const traceEntries = [];
  let capturedHandlers = null;
  let capturedOptions = null;
  let wsTicketCalls = 0;
  const client = { close() {} };
  const controller = createWsRuntimeController({
    createWsClient(url, handlers, options) {
      calls.push(["create", url]);
      capturedHandlers = handlers;
      capturedOptions = options;
      return client;
    },
    wsUrl: "ws://localhost:18080/ws",
    debug: true,
    log: (event, payload) => calls.push(["log", event, payload.status || payload.type || payload.sessionId || ""]),
    setConnectionState: (status) => calls.push(["state", status]),
    recordTrace: (entry) => traceEntries.push(entry),
    getRuntimeBootstrapSource: () => "rest",
    onRuntimeConnected: () => calls.push(["ready"]),
    hasTerminal: (sessionId) => sessionId === "s1",
    pushSessionData: (sessionId, data) => calls.push(["data", sessionId, data]),
    applyRuntimeEvent: (event) => calls.push(["event", event.type]),
    getWsAuthToken: () => "",
    createWsTicket: async () => {
      wsTicketCalls += 1;
      return { ticket: "ticket-local-1" };
    },
    getTrustedLocalWsClientMetadata: () => ({ clientId: "trusted-local-1", label: "Desk Browser" })
  });

  const started = controller.start();
  assert.equal(started, client);
  assert.equal(typeof capturedOptions.protocolsProvider, "function");
  const protocols = await capturedOptions.protocolsProvider();
  assert.equal(protocols[0], "ptydeck.v1");
  assert.match(protocols[1], /^ptydeck\.client\./);
  assert.deepEqual(
    JSON.parse(Buffer.from(protocols[1].slice("ptydeck.client.".length), "base64url").toString("utf8")),
    { clientId: "trusted-local-1", label: "Desk Browser" }
  );
  assert.equal(wsTicketCalls, 0);

  capturedHandlers.onState("connected");
  capturedHandlers.onMessage({
    type: "session.data",
    sessionId: "s1",
    data: "pwd\n",
    trace: { traceId: "trc-1", correlationId: "corr-1", sessionId: "s1" }
  });
  capturedHandlers.onMessage({ type: "deck.updated", deck: { id: "d1" } });

  assert.deepEqual(calls, [
    ["create", "ws://localhost:18080/ws"],
    ["log", "ws.state", "connected"],
    ["state", "connected"],
    ["ready"],
    ["log", "ws.event", "session.data"],
    ["data", "s1", "pwd\n"],
    ["log", "ws.event", "deck.updated"],
    ["event", "deck.updated"]
  ]);
  assert.deepEqual(traceEntries, [
    {
      source: "ws",
      type: "session.data",
      sessionId: "s1",
      trace: { traceId: "trc-1", correlationId: "corr-1", sessionId: "s1" }
    }
  ]);
});

test("ws-runtime controller falls back to a bare ws protocol when no ws ticket creator is available", async () => {
  let capturedOptions = null;
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => ""
  }).start();

  assert.deepEqual(await capturedOptions.protocolsProvider(), ["ptydeck.v1"]);
});

test("ws-runtime controller retries ws ticket acquisition once after 401 refresh", async () => {
  let capturedOptions = null;
  let ticketAttempts = 0;
  const refreshReasons = [];
  const controller = createWsRuntimeController({
    createWsClient(url, handlers, options) {
      capturedOptions = options;
      return { close() {}, url, handlers };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => "bearer",
    createWsTicket: async () => {
      ticketAttempts += 1;
      if (ticketAttempts === 1) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
      }
      return { ticket: "ticket-123" };
    },
    bootstrapDevAuthToken: async ({ reason }) => {
      refreshReasons.push(reason);
      return true;
    }
  });

  controller.start();
  const protocols = await capturedOptions.protocolsProvider();

  assert.equal(ticketAttempts, 2);
  assert.deepEqual(refreshReasons, ["ws-ticket-401"]);
  assert.deepEqual(protocols, ["ptydeck.v1", "ptydeck.auth.ticket-123"]);
});

test("ws-runtime controller bootstraps auth before falling back to trusted-local ws protocols", async () => {
  let capturedOptions = null;
  let authToken = "";
  let ticketCalls = 0;
  const refreshReasons = [];
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => authToken,
    createWsTicket: async () => {
      ticketCalls += 1;
      return { ticket: "ticket-after-refresh" };
    },
    bootstrapDevAuthToken: async ({ reason }) => {
      refreshReasons.push(reason);
      authToken = "bearer-after-refresh";
      return true;
    },
    getTrustedLocalWsClientMetadata: () => ({ clientId: "trusted-local-1", label: "Desk Browser" })
  }).start();

  const protocols = await capturedOptions.protocolsProvider();

  assert.deepEqual(refreshReasons, ["ws-missing-auth"]);
  assert.equal(ticketCalls, 1);
  assert.deepEqual(protocols, ["ptydeck.v1", "ptydeck.auth.ticket-after-refresh"]);
});

test("ws-runtime controller falls back to trusted-local metadata when auth bootstrap still has no token", async () => {
  let capturedOptions = null;
  const refreshReasons = [];
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => "",
    createWsTicket: async () => ({ ticket: "unused" }),
    bootstrapDevAuthToken: async ({ reason }) => {
      refreshReasons.push(reason);
      return false;
    },
    getTrustedLocalWsClientMetadata: () => ({ clientId: "trusted-local-1", label: "Desk Browser" })
  }).start();

  const protocols = await capturedOptions.protocolsProvider();

  assert.deepEqual(refreshReasons, ["ws-missing-auth"]);
  assert.equal(protocols[0], "ptydeck.v1");
  assert.match(protocols[1], /^ptydeck\.client\./);
});

test("ws-runtime controller delays ready notification until runtime bootstrap is no longer pending and routes unmapped session data through runtime events", () => {
  const calls = [];
  let capturedHandlers = null;
  createWsRuntimeController({
    createWsClient(_url, handlers) {
      capturedHandlers = handlers;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getRuntimeBootstrapSource: () => "pending",
    onRuntimeConnected: () => calls.push(["ready"]),
    hasTerminal: () => false,
    observeSessionData: (sessionId, data) => calls.push(["observe", sessionId, data]),
    applyRuntimeEvent: (event) => calls.push(["event", event.type])
  }).start();

  capturedHandlers.onState("connected");
  capturedHandlers.onMessage({ type: "session.data", sessionId: "s2", data: "pwd\n" });

  assert.deepEqual(calls, [
    ["observe", "s2", "pwd\n"],
    ["event", "session.data"]
  ]);
});

test("ws-runtime controller applies stream interpretation for mounted terminal data before terminal write", () => {
  const calls = [];
  let capturedHandlers = null;
  createWsRuntimeController({
    createWsClient(_url, handlers) {
      capturedHandlers = handlers;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    log: (event, payload) => calls.push(["log", event, payload.pluginId || payload.type || ""]),
    hasTerminal: () => true,
    observeSessionData: (sessionId, data) => calls.push(["observe", sessionId, data]),
    interpretRuntimeEvent: (event) => {
      calls.push(["interpret", event.type]);
      return {
        batches: [
          {
            sessionId: event.sessionId,
            actions: [{ type: "setSessionStatus", value: "Ready" }]
          }
        ],
        errors: [{ pluginId: "example-plugin", message: "non-fatal" }]
      };
    },
    applySessionInterpretationActions: (sessionId, actions) =>
      calls.push(["applyInterpretation", sessionId, actions[0].type]),
    pushSessionData: (sessionId, data) => calls.push(["data", sessionId, data]),
    applyRuntimeEvent: (event) => calls.push(["event", event.type])
  }).start();

  capturedHandlers.onMessage({ type: "session.data", sessionId: "s1", data: "ready\n" });

  assert.deepEqual(calls, [
    ["log", "ws.event", "session.data"],
    ["observe", "s1", "ready\n"],
    ["interpret", "session.data"],
    ["log", "ws.interpretation.error", "example-plugin"],
    ["applyInterpretation", "s1", "setSessionStatus"],
    ["data", "s1", "ready\n"]
  ]);
});

test("ws-runtime controller fails clearly when the ws ticket response is missing a ticket", async () => {
  let capturedOptions = null;
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => "bearer",
    createWsTicket: async () => ({ ticket: "   " })
  }).start();

  await assert.rejects(
    () => capturedOptions.protocolsProvider(),
    /did not include a ticket/
  );
});

test("ws-runtime controller rethrows the original 401 error when refresh does not recover auth", async () => {
  let capturedOptions = null;
  const authError = new Error("Unauthorized");
  authError.status = 401;
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => "bearer",
    createWsTicket: async () => {
      throw authError;
    },
    bootstrapDevAuthToken: async () => false
  }).start();

  await assert.rejects(() => capturedOptions.protocolsProvider(), authError);
});

test("ws-runtime controller tolerates malformed interpretation payloads and logs thrown interpretation failures deterministically", () => {
  const calls = [];
  let capturedHandlers = null;
  createWsRuntimeController({
    createWsClient(_url, handlers) {
      capturedHandlers = handlers;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    log: (event, payload) => calls.push([event, payload.type || payload.message || ""]),
    hasTerminal: () => false,
    interpretRuntimeEvent: (event) => {
      if (event.type === "session.data") {
        return [{ sessionId: "", actions: [] }, { sessionId: "s1", actions: [{ type: "setSessionStatus" }] }];
      }
      if (event.type === "session.exited") {
        return null;
      }
      throw new Error("plugin exploded");
    },
    applySessionInterpretationActions: (sessionId, actions) =>
      calls.push(["apply-interpretation", `${sessionId}:${actions[0].type}`]),
    applyRuntimeEvent: (event) => calls.push(["event", event.type])
  }).start();

  capturedHandlers.onMessage({ type: "session.data", sessionId: "s1", data: "pwd\n" });
  capturedHandlers.onMessage({ type: "session.exited", sessionId: "s1" });
  capturedHandlers.onMessage({ type: "session.closed", sessionId: "s1" });

  assert.deepEqual(calls, [
    ["ws.event", "session.data"],
    ["apply-interpretation", "s1:setSessionStatus"],
    ["event", "session.data"],
    ["ws.event", "session.exited"],
    ["event", "session.exited"],
    ["ws.event", "session.closed"],
    ["event", "session.closed"],
    ["ws.interpretation.error", "session.closed"]
  ]);
});

test("ws-runtime controller rethrows non-401 ws ticket errors without retrying auth refresh", async () => {
  let capturedOptions = null;
  const transportError = new Error("Gateway timeout");
  transportError.status = 504;
  const refreshReasons = [];
  createWsRuntimeController({
    createWsClient(_url, _handlers, options) {
      capturedOptions = options;
      return { close() {} };
    },
    wsUrl: "ws://localhost:18080/ws",
    getWsAuthToken: () => "bearer",
    createWsTicket: async () => {
      throw transportError;
    },
    bootstrapDevAuthToken: async ({ reason }) => {
      refreshReasons.push(reason);
      return true;
    }
  }).start();

  await assert.rejects(() => capturedOptions.protocolsProvider(), transportError);
  assert.deepEqual(refreshReasons, []);
});
