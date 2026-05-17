import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeStartupDispatchAssembly } from "../src/runtime-startup-dispatch-assembly.js";

test("runtime startup dispatch assembly wires dispatch, HTTP server, startup restore, lifecycle, and upgrade handling", async () => {
  const captured = {
    dispatch: null,
    startupRestore: null,
    lifecycle: null,
    httpHandler: null,
    upgradeListener: null,
    upgradeCalls: []
  };

  const handleHttpRequest = Symbol("handleHttpRequest");
  const runtimeStartupRestore = { marker: "runtimeStartupRestore" };
  const runtimeLifecycle = { marker: "runtimeLifecycle" };
  const sessionDispatchAssembly = {
    handleHttpRequest,
    resourceDispatch: { marker: "resourceDispatch" },
    sessionControlDispatch: { marker: "sessionControlDispatch" },
    sessionDispatch: { marker: "sessionDispatch" },
    runtimeSessionEventAuthority: { marker: "runtimeSessionEventAuthority" }
  };
  const server = {
    listeners: new Map(),
    on(eventName, listener) {
      this.listeners.set(eventName, listener);
      if (eventName === "upgrade") {
        captured.upgradeListener = listener;
      }
      return this;
    }
  };
  const shared = {
    manager: Symbol("manager"),
    persistence: Symbol("persistence"),
    config: { port: 18080 },
    sockets: Symbol("sockets")
  };

  const assembly = createRuntimeStartupDispatchAssembly({
    ...shared,
    handleWsUpgrade(request, socket, head) {
      captured.upgradeCalls.push({ request, socket, head });
      return Promise.resolve();
    },
    createRuntimeSessionDispatchAssemblyImpl(options) {
      captured.dispatch = options;
      return sessionDispatchAssembly;
    },
    createHttpServerImpl(handler) {
      captured.httpHandler = handler;
      return server;
    },
    createRuntimeStartupRestoreImpl(options) {
      captured.startupRestore = options;
      return runtimeStartupRestore;
    },
    createRuntimeLifecycleImpl(options) {
      captured.lifecycle = options;
      return runtimeLifecycle;
    }
  });

  assert.equal(captured.dispatch.manager, shared.manager);
  assert.equal(captured.dispatch.persistence, shared.persistence);
  assert.equal(captured.httpHandler, handleHttpRequest);
  assert.equal(captured.startupRestore.config, shared.config);
  assert.equal(captured.lifecycle.manager, shared.manager);
  assert.equal(captured.lifecycle.persistence, shared.persistence);
  assert.equal(captured.lifecycle.runtimeStartupRestore, runtimeStartupRestore);
  assert.equal(captured.lifecycle.server, server);

  assert.equal(assembly.server, server);
  assert.equal(assembly.runtimeStartupRestore, runtimeStartupRestore);
  assert.equal(assembly.runtimeLifecycle, runtimeLifecycle);
  assert.equal(assembly.resourceDispatch, sessionDispatchAssembly.resourceDispatch);
  assert.equal(assembly.sessionControlDispatch, sessionDispatchAssembly.sessionControlDispatch);
  assert.equal(assembly.sessionDispatch, sessionDispatchAssembly.sessionDispatch);
  assert.equal(assembly.runtimeSessionEventAuthority, sessionDispatchAssembly.runtimeSessionEventAuthority);

  assert.equal(typeof captured.upgradeListener, "function");
  const request = { url: "/ws" };
  const socket = { id: "socket-1" };
  const head = Buffer.from("head");
  captured.upgradeListener(request, socket, head);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured.upgradeCalls, [{ request, socket, head }]);
});

test("runtime startup dispatch assembly skips upgrade listener registration when no websocket upgrade handler is provided", () => {
  let registeredUpgradeListener = false;

  createRuntimeStartupDispatchAssembly({
    createRuntimeSessionDispatchAssemblyImpl() {
      return {
        handleHttpRequest() {},
        resourceDispatch: null,
        sessionControlDispatch: null,
        sessionDispatch: null,
        runtimeSessionEventAuthority: null
      };
    },
    createHttpServerImpl() {
      return {
        on(eventName) {
          if (eventName === "upgrade") {
            registeredUpgradeListener = true;
          }
          return this;
        }
      };
    },
    createRuntimeStartupRestoreImpl() {
      return { marker: "runtimeStartupRestore" };
    },
    createRuntimeLifecycleImpl() {
      return { marker: "runtimeLifecycle" };
    }
  });

  assert.equal(registeredUpgradeListener, false);
});
