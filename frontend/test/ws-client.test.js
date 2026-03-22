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
  const previousRandom = Math.random;
  const timers = [];
  let randomValues = [0.5];
  let randomIndex = 0;

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
  assert.equal(first.closeCalls, 1);

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

test("ws client appends access_token query when token provider is set", (t) => {
  withMockedGlobals(t);
  const client = createWsClient("ws://localhost:18080/ws", {
    onState: () => {},
    onMessage: () => {}
  }, {
    tokenProvider: () => "dev-token"
  });

  assert.equal(MockWebSocket.instances.length, 1);
  assert.equal(MockWebSocket.instances[0].url, "ws://localhost:18080/ws?access_token=dev-token");
  client.close();
});
