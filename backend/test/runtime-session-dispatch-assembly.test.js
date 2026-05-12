import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeSessionDispatchAssembly } from "../src/runtime-session-dispatch-assembly.js";

test("runtime session dispatch assembly wires the extracted authority and HTTP request handler through shared dispatch delegates", () => {
  const captured = {
    authority: null,
    http: null
  };
  let registerCalls = 0;
  const dispatches = {
    resourceDispatch: {
      dispatchResourceRequest(input) {
        return { type: "resource", input };
      }
    },
    sessionControlDispatch: {
      dispatchSessionControlRequest(input) {
        return { type: "control", input };
      }
    },
    sessionDispatch: {
      dispatchSessionRequest(input) {
        return { type: "session", input };
      }
    },
    runtimeSessionEventAuthority: {
      registerManagerEventHandlers() {
        registerCalls += 1;
      }
    }
  };
  const httpHandler = { marker: "handleHttpRequest" };
  const shared = {
    startupWarmup: Symbol("startupWarmup"),
    getIsReady: Symbol("getIsReady"),
    manager: Symbol("manager"),
    metrics: Symbol("metrics"),
    messagingRuntime: Symbol("messagingRuntime"),
    logDebug: Symbol("logDebug")
  };

  const assembly = createRuntimeSessionDispatchAssembly({
    ...shared,
    createRuntimeSessionDispatchAuthorityImpl(options) {
      captured.authority = options;
      return dispatches;
    },
    createRuntimeHttpRequestHandlerImpl(options) {
      captured.http = options;
      return httpHandler;
    }
  });

  assert.equal(captured.authority.startupWarmup, shared.startupWarmup);
  assert.equal(captured.authority.manager, shared.manager);
  assert.equal(captured.authority.metrics, shared.metrics);
  assert.equal(registerCalls, 1);

  assert.equal(assembly.handleHttpRequest, httpHandler);
  assert.equal(assembly.resourceDispatch, dispatches.resourceDispatch);
  assert.equal(assembly.sessionControlDispatch, dispatches.sessionControlDispatch);
  assert.equal(assembly.sessionDispatch, dispatches.sessionDispatch);
  assert.equal(assembly.runtimeSessionEventAuthority, dispatches.runtimeSessionEventAuthority);

  assert.equal(captured.http.startupWarmup, shared.startupWarmup);
  assert.equal(captured.http.messagingRuntime, shared.messagingRuntime);
  assert.equal(captured.http.logDebug, shared.logDebug);
  assert.deepEqual(captured.http.dispatchResourceRequest({ path: "/share" }), {
    type: "resource",
    input: { path: "/share" }
  });
  assert.deepEqual(captured.http.dispatchSessionRequest({ path: "/sessions" }), {
    type: "session",
    input: { path: "/sessions" }
  });
  assert.deepEqual(captured.http.dispatchSessionControlRequest({ path: "/session-control" }), {
    type: "control",
    input: { path: "/session-control" }
  });
});
