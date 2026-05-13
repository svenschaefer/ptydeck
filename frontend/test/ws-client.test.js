import test from "node:test";
import assert from "node:assert/strict";
import { createWsClient } from "../src/public/ws-client.js";

class MockWebSocket {
  static instances = [];
  static throwOnCreate = null;

  constructor(url, protocols) {
    if (typeof MockWebSocket.throwOnCreate === "function") {
      const error = MockWebSocket.throwOnCreate(url, protocols);
      if (error) {
        throw error;
      }
    }
    this.url = url;
    this.protocols = protocols;
    this.listeners = new Map();
    this.closeCalls = 0;
    MockWebSocket.instances.push(this);
  }

  addEventListener(eventName, handler) {
    const list = this.listeners.get(eventName) || [];
    list.push(handler);
    this.listeners.set(eventName, list);
  }

  emit(eventName, payload = {}) {
    const list = this.listeners.get(eventName) || [];
    for (const handler of list) {
      handler(payload);
    }
  }

  close() {
    this.closeCalls += 1;
    this.emit("close");
  }
}

function withMockedGlobals(t) {
  const previousWebSocket = global.WebSocket;
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const previousRandom = Math.random;
  const timers = [];
  let randomValues = [0.5];
  let randomIndex = 0;

  MockWebSocket.instances = [];
  MockWebSocket.throwOnCreate = null;
  global.WebSocket = MockWebSocket;
  global.setTimeout = (fn, ms) => {
    const handle = { fn, ms, cleared: false };
    timers.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    if (handle) {
      handle.cleared = true;
    }
  };
  Math.random = () => {
    const value = randomValues[Math.min(randomIndex, randomValues.length - 1)];
    randomIndex += 1;
    return value;
  };

  t.after(() => {
    global.WebSocket = previousWebSocket;
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
    Math.random = previousRandom;
  });

  return {
    timers,
    setRandomSequence(values) {
      randomValues = Array.isArray(values) && values.length > 0 ? values.slice() : [0.5];
      randomIndex = 0;
    }
  };
}

test("ws client reconnects and reports state transitions", (t) => {
  const { timers } = withMockedGlobals(t);
  const states = [];
  const messages = [];
  createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: (message) => messages.push(message)
  });

  assert.equal(MockWebSocket.instances.length, 1);
  const first = MockWebSocket.instances[0];
  assert.equal(first.url, "ws://localhost:18080/ws");
  assert.deepEqual(states, ["connecting"]);

  first.emit("open");
  assert.deepEqual(states, ["connecting", "connected"]);

  first.emit("message", { data: JSON.stringify({ type: "snapshot", sessions: [] }) });
  assert.equal(messages.length, 1);

  first.emit("close");
  assert.deepEqual(states, ["connecting", "connected", "reconnecting"]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 500);

  timers[0].fn();
  assert.equal(MockWebSocket.instances.length, 2);
  assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connecting"]);

  const second = MockWebSocket.instances[1];
  second.emit("open");
  assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connecting", "connected"]);
});

test("ws client close stops reconnect and clears scheduled timer", (t) => {
  const { timers } = withMockedGlobals(t);
  const states = [];
  const client = createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: () => {}
  });

  const first = MockWebSocket.instances[0];
  first.emit("close");
  assert.deepEqual(states, ["connecting", "reconnecting"]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].cleared, false);

  client.close();
  assert.equal(timers[0].cleared, true);
  assert.equal(first.closeCalls, 0);

  first.emit("close");
  assert.deepEqual(states, ["connecting", "reconnecting"]);
});

test("ws client emits error state and applies bounded reconnect backoff with jitter", (t) => {
  const globals = withMockedGlobals(t);
  const { timers, setRandomSequence } = globals;
  setRandomSequence([0, 1, 1, 1, 1, 1, 1]);

  const states = [];
  createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: () => {}
  });

  const first = MockWebSocket.instances[0];
  first.emit("error");
  assert.deepEqual(states, ["connecting", "error"]);

  first.emit("close");
  assert.equal(timers[0].ms, 400);
  timers[0].fn();

  const second = MockWebSocket.instances[1];
  second.emit("close");
  assert.equal(timers[1].ms, 1200);
  timers[1].fn();

  const third = MockWebSocket.instances[2];
  third.emit("close");
  assert.equal(timers[2].ms, 2400);
  timers[2].fn();

  const fourth = MockWebSocket.instances[3];
  fourth.emit("close");
  assert.equal(timers[3].ms, 4800);
  timers[3].fn();

  const fifth = MockWebSocket.instances[4];
  fifth.emit("close");
  assert.equal(timers[4].ms, 9600);
  timers[4].fn();

  const sixth = MockWebSocket.instances[5];
  sixth.emit("close");
  assert.equal(timers[5].ms, 10000);
});

test("ws client resolves handshake protocols without mutating URL", async (t) => {
  withMockedGlobals(t);
  const client = createWsClient("ws://localhost:18080/ws", {
    onState: () => {},
    onMessage: () => {}
  }, {
    protocolsProvider: async () => ["ptydeck.v1", "ptydeck.auth.ticket-123"]
  });

  await Promise.resolve();
  assert.equal(MockWebSocket.instances.length, 1);
  assert.equal(MockWebSocket.instances[0].url, "ws://localhost:18080/ws");
  assert.deepEqual(MockWebSocket.instances[0].protocols, ["ptydeck.v1", "ptydeck.auth.ticket-123"]);
  client.close();
});

test("ws client falls back to reconnect when the protocols provider rejects", async (t) => {
  const { timers } = withMockedGlobals(t);
  const states = [];
  let attempts = 0;
  createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: () => {}
  }, {
    protocolsProvider: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("ticket unavailable");
      }
      return ["ptydeck.v1"];
    }
  });

  await Promise.resolve();
  assert.deepEqual(states, ["connecting", "error", "reconnecting"]);
  assert.equal(timers.length, 1);
  timers[0].fn();
  await Promise.resolve();
  assert.equal(MockWebSocket.instances.length, 1);
});

test("ws client ignores stale protocol resolution after the client was closed", async (t) => {
  withMockedGlobals(t);
  let resolveProtocols;
  const client = createWsClient("ws://localhost:18080/ws", {
    onState: () => {},
    onMessage: () => {}
  }, {
    protocolsProvider: () => new Promise((resolve) => {
      resolveProtocols = resolve;
    })
  });

  client.close();
  resolveProtocols(["ptydeck.v1"]);
  await Promise.resolve();

  assert.equal(MockWebSocket.instances.length, 0);
});

test("ws client retries when the WebSocket constructor throws and avoids duplicate reconnect timers", (t) => {
  const { timers } = withMockedGlobals(t);
  const states = [];
  MockWebSocket.throwOnCreate = () => new Error("constructor failed");

  createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: () => {}
  });

  assert.deepEqual(states, ["connecting", "error", "reconnecting"]);
  assert.equal(timers.length, 1);

  const first = MockWebSocket.instances[0];
  assert.equal(first, undefined);

  // Multiple reconnect triggers before the timer fires must not stack timers.
  MockWebSocket.throwOnCreate = null;
  timers[0].fn();
  const socket = MockWebSocket.instances[0];
  socket.emit("close");
  socket.emit("close");

  assert.equal(timers.length, 2);
  assert.deepEqual(states, ["connecting", "error", "reconnecting", "connecting", "reconnecting"]);
});

test("ws client ignores stale close and error events from an earlier socket after a reconnect succeeds", (t) => {
  const { timers } = withMockedGlobals(t);
  const states = [];
  createWsClient("ws://localhost:18080/ws", {
    onState: (state) => states.push(state),
    onMessage: () => {}
  });

  const first = MockWebSocket.instances[0];
  first.emit("close");
  assert.deepEqual(states, ["connecting", "reconnecting"]);
  assert.equal(timers.length, 1);

  timers[0].fn();
  const second = MockWebSocket.instances[1];
  second.emit("open");
  assert.deepEqual(states, ["connecting", "reconnecting", "connecting", "connected"]);

  first.emit("error");
  first.emit("close");

  assert.deepEqual(states, ["connecting", "reconnecting", "connecting", "connected"]);
  assert.equal(timers.length, 1);
});

test("ws client logs debug lifecycle events and ignores malformed messages", (t) => {
  withMockedGlobals(t);
  const events = [];
  const messages = [];
  const client = createWsClient("ws://localhost:18080/ws", {
    onState: () => {},
    onMessage: (message) => messages.push(message)
  }, {
    debug: true,
    log: (type, payload) => events.push([type, payload])
  });

  const socket = MockWebSocket.instances[0];
  socket.emit("open");
  socket.emit("message", { data: JSON.stringify({ type: "snapshot" }) });
  socket.emit("message", { data: "not-json" });
  socket.emit("error");
  client.close();

  assert.equal(messages.length, 1);
  assert.deepEqual(events.map(([type]) => type), [
    "ws.connecting",
    "ws.open",
    "ws.message",
    "ws.message.parse_error",
    "ws.error",
    "ws.closed.manual",
    "ws.close.requested"
  ]);
});

test("ws client omits protocols when the provider resolves to a non-array value", async (t) => {
  withMockedGlobals(t);
  createWsClient("ws://localhost:18080/ws", {
    onState: () => {},
    onMessage: () => {}
  }, {
    protocolsProvider: async () => ({ ticket: "not-an-array" })
  });

  await Promise.resolve();
  assert.equal(MockWebSocket.instances.length, 1);
  assert.equal(MockWebSocket.instances[0].protocols, undefined);
});
