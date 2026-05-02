import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeWsConnectionHandler } from "../src/runtime-ws-connection.js";

function createSocket() {
  const handlers = new Map();
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, ...args) {
      const handler = handlers.get(event);
      if (handler) {
        handler(...args);
      }
    },
    send(payload) {
      this.sent.push(String(payload));
    }
  };
}

function createDependencies(overrides = {}) {
  const observed = {
    debug: [],
    reconnects: [],
    registered: [],
    unregistered: [],
    refreshes: [],
    reconciled: [],
    errors: []
  };
  const sockets = new Set();
  const metrics = {
    wsConnectionsOpenedTotal: 0,
    wsReconnectsTotal: 0,
    wsReconnectsByReason: new Map(),
    wsConnectionsClosedTotal: 0,
    wsDisconnectsByReason: new Map()
  };
  const dependencies = {
    sockets,
    metrics,
    wsClientConnections: new Map(),
    logDebug(event, details, trace) {
      observed.debug.push({ event, details, trace });
    },
    bumpMetricCounter(map, key, amount = 1) {
      map.set(key, (map.get(key) || 0) + amount);
      observed.reconnects.push([key, amount]);
    },
    createTraceId: () => "ws-1",
    sessionControlAttachmentRegistry: {
      getAttachmentKey({ clientId, auth }) {
        return `${clientId}:${auth?.subject || "anon"}`;
      },
      registerAttachment({ clientId, label, auth }) {
        observed.registered.push({ clientId, label, auth });
        return { clientId, label };
      },
      unregisterAttachment(ws) {
        observed.unregistered.push(ws.connectionId);
      }
    },
    normalizeWsDisconnectReason: () => "disconnect-normalized",
    broadcastSessionControlRefreshForAuth(auth, trace) {
      observed.refreshes.push({ auth, trace });
    },
    listSessionIdsForAuth() {
      return ["session-1", "session-2"];
    },
    reconcileSessionControllerForSession(sessionId) {
      observed.reconciled.push(sessionId);
    },
    manager: {
      getSnapshot() {
        return {
          outputs: [{ sessionId: "session-1", data: "hello" }]
        };
      }
    },
    filterPayloadForAuth(payload) {
      return payload;
    },
    withTracePayload(payload, traceSeed) {
      return {
        ...payload,
        trace: traceSeed
      };
    },
    listApiSessions(auth) {
      return [{ id: "session-1", owner: auth?.subject || "anon", deckId: "deck-1" }];
    },
    listCustomCommands() {
      return [{ name: "build" }];
    },
    listDecks(auth) {
      return [{ id: "deck-1", owner: auth?.subject || "anon" }];
    },
    recordWsError(reason) {
      observed.errors.push(reason);
    },
    ...overrides
  };
  return { dependencies, observed, sockets, metrics };
}

test("runtime ws connection handler registers accepted sockets and sends the filtered snapshot deterministically", () => {
  const { dependencies, observed, sockets, metrics } = createDependencies();
  const handler = createRuntimeWsConnectionHandler(dependencies);
  const socket = createSocket();

  handler(socket, {
    auth: {
      subject: "alice",
      sessionControlClientId: "client-1",
      sessionControlClientLabel: "Laptop"
    },
    requestContext: {
      clientIp: "127.0.0.1",
      protocol: "https",
      trustedProxy: true
    },
    upgradeTraceContext: {
      traceId: "upgrade-1",
      correlationId: "corr-1"
    }
  });

  assert.equal(sockets.has(socket), true);
  assert.equal(metrics.wsConnectionsOpenedTotal, 1);
  assert.equal(socket.connectionId, "ws-1");
  assert.equal(socket.clientIp, "127.0.0.1");
  assert.equal(socket.auth.subject, "alice");
  assert.equal(socket.sessionControlAttachmentKey, "client-1:alice");
  assert.deepEqual(socket.sessionControlClient, { clientId: "client-1", label: "Laptop" });
  assert.equal(socket.isAlive, true);
  assert.deepEqual(observed.registered, [
    {
      clientId: "client-1",
      label: "Laptop",
      auth: {
        subject: "alice",
        sessionControlClientId: "client-1",
        sessionControlClientLabel: "Laptop"
      }
    }
  ]);
  assert.deepEqual(observed.reconciled, ["session-1", "session-2"]);
  assert.equal(observed.refreshes.length, 1);

  const snapshotPayload = JSON.parse(socket.sent[0]);
  assert.deepEqual(snapshotPayload, {
    type: "snapshot",
    clientId: "client-1",
    sessions: [{ id: "session-1", owner: "alice", deckId: "deck-1" }],
    outputs: [{ sessionId: "session-1", data: "hello" }],
    customCommands: [{ name: "build" }],
    decks: [{ id: "deck-1", owner: "alice" }],
    trace: {
      traceId: "upgrade-1",
      correlationId: "corr-1",
      connectionId: "ws-1",
      source: "ws"
    }
  });
  assert.equal(observed.debug[0]?.event, "ws.upgrade.accepted");
  assert.equal(observed.debug[1]?.event, "ws.snapshot.sent");

  socket.isAlive = false;
  socket.emit("pong");
  assert.equal(socket.isAlive, true);
});

test("runtime ws connection handler records reconnect and close metrics and unregisters attachments deterministically", () => {
  const clientStateMap = new Map([
    [
      "127.0.0.1",
      {
        activeConnections: 0,
        acceptedConnections: 1,
        lastDisconnectReason: "heartbeat_timeout"
      }
    ]
  ]);
  const { dependencies, observed, sockets, metrics } = createDependencies({
    wsClientConnections: clientStateMap
  });
  const handler = createRuntimeWsConnectionHandler(dependencies);
  const socket = createSocket();

  handler(socket, {
    auth: { subject: "alice" },
    requestContext: { clientIp: "127.0.0.1" },
    upgradeTraceContext: { traceId: "upgrade-2" }
  });

  assert.equal(metrics.wsReconnectsTotal, 1);
  assert.equal(metrics.wsReconnectsByReason.get("heartbeat_timeout"), 1);
  assert.equal(clientStateMap.get("127.0.0.1").activeConnections, 1);
  assert.equal(clientStateMap.get("127.0.0.1").acceptedConnections, 2);

  socket.closeReasonHint = "client_close";
  socket.emit("close", 1000, Buffer.from("closing"));

  assert.equal(sockets.has(socket), false);
  assert.equal(metrics.wsConnectionsClosedTotal, 1);
  assert.equal(metrics.wsDisconnectsByReason.get("disconnect-normalized"), 1);
  assert.deepEqual(observed.unregistered, ["ws-1"]);
  assert.equal(clientStateMap.get("127.0.0.1").activeConnections, 0);
  assert.equal(clientStateMap.get("127.0.0.1").lastDisconnectReason, "disconnect-normalized");
  assert.equal(observed.refreshes.length, 2);
  assert.equal(observed.debug.at(-1)?.event, "ws.client.closed");
});

test("runtime ws connection handler falls back to connection identity and records socket errors", () => {
  const { dependencies, observed } = createDependencies();
  const handler = createRuntimeWsConnectionHandler(dependencies);
  const socket = createSocket();

  handler(socket, {
    auth: null,
    requestContext: {},
    upgradeTraceContext: { traceId: "upgrade-3" }
  });

  const snapshotPayload = JSON.parse(socket.sent[0]);
  assert.equal(snapshotPayload.clientId, "ws-1");
  assert.equal(socket.clientIp, "unknown");
  assert.equal(socket.sessionControlAttachmentKey, "ws-1:anon");
  assert.deepEqual(socket.sessionControlClient, { clientId: "ws-1", label: "" });

  socket.emit("error", new Error("boom"));
  assert.deepEqual(observed.errors, ["socket_error"]);
});
