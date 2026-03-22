import test from "node:test";
import assert from "node:assert/strict";
import { createWsClient } from "../src/public/ws-client.js";

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
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
  const timers = [];

  MockWebSocket.instances = [];
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

  t.after(() => {
    global.WebSocket = previousWebSocket;
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  });

  return timers;
}

test("ws client reconnects and reports state transitions", (t) => {
  const timers = withMockedGlobals(t);
  const states = [];
  const messages = [];
  createWsClient("ws://localhost:8080/ws", {
    onState: (state) => states.push(state),
    onMessage: (message) => messages.push(message)
  });

  assert.equal(MockWebSocket.instances.length, 1);
  const first = MockWebSocket.instances[0];
  assert.equal(first.url, "ws://localhost:8080/ws");
  assert.deepEqual(states, ["connecting"]);

  first.emit("open");
  assert.deepEqual(states, ["connecting", "connected"]);

  first.emit("message", { data: JSON.stringify({ type: "snapshot", sessions: [] }) });
  assert.equal(messages.length, 1);

  first.emit("close");
  assert.deepEqual(states, ["connecting", "connected", "reconnecting"]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);

  timers[0].fn();
  assert.equal(MockWebSocket.instances.length, 2);
  assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connecting"]);

  const second = MockWebSocket.instances[1];
  second.emit("open");
  assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connecting", "connected"]);
});

test("ws client close stops reconnect and clears scheduled timer", (t) => {
  const timers = withMockedGlobals(t);
  const states = [];
  const client = createWsClient("ws://localhost:8080/ws", {
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
  assert.equal(first.closeCalls, 1);

  first.emit("close");
  assert.deepEqual(states, ["connecting", "reconnecting"]);
});
