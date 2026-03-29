import test from "node:test";
import assert from "node:assert/strict";

import { createWsRuntimeController } from "../src/public/ws-runtime-controller.js";

test("ws-runtime controller wires state transitions, session-data routing, and runtime events", async () => {
  const calls = [];
  const traceEntries = [];
  let capturedHandlers = null;
  let capturedOptions = null;
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
    getWsAuthToken: () => ""
  });

  const started = controller.start();
  assert.equal(started, client);
  assert.equal(typeof capturedOptions.protocolsProvider, "function");
  assert.deepEqual(await capturedOptions.protocolsProvider(), ["ptydeck.v1"]);

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
