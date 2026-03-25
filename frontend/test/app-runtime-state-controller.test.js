import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeStateController } from "../src/public/app-runtime-state-controller.js";

function createFakeWindow() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const token = { fn, delay, cleared: false };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      if (token) {
        token.cleared = true;
      }
    }
  };
}

test("app-runtime state controller updates ui state and formats errors", () => {
  const calls = [];
  const uiState = {
    loading: true,
    error: "",
    commandFeedback: "",
    commandPreview: ""
  };
  const controller = createAppRuntimeStateController({
    uiState,
    debugLog: (event, payload) => calls.push(["log", event, payload.message]),
    requestRender: () => calls.push(["render"])
  });

  controller.setError("Broken");
  controller.setCommandFeedback("ok");
  controller.setCommandPreview("preview");
  controller.clearError();

  assert.equal(uiState.error, "");
  assert.equal(uiState.commandFeedback, "ok");
  assert.equal(uiState.commandPreview, "preview");
  assert.equal(controller.getErrorMessage(new Error("Boom"), "fallback"), "Boom");
  assert.equal(controller.getErrorMessage({}, "fallback"), "fallback");
  assert.deepEqual(calls, [
    ["log", "ui.error", "Broken"],
    ["render"],
    ["render"],
    ["render"]
  ]);
});

test("app-runtime state controller schedules bootstrap fallback and reports startup readiness once", async () => {
  const windowRef = createFakeWindow();
  const calls = [];
  const startupPerf = {
    appStartAtMs: 100,
    bootstrapRequestCount: 0,
    bootstrapReadyAtMs: null,
    firstNonEmptyRenderAtMs: 160,
    firstTerminalMountedAtMs: 170,
    startupReported: false
  };
  let bootstrapInFlight = false;
  const controller = createAppRuntimeStateController({
    windowRef,
    uiState: { loading: true, error: "" },
    startupPerf,
    nowMs: () => 220,
    wsBootstrapFallbackMs: 250,
    hasBootstrapInFlight: () => bootstrapInFlight,
    runBootstrapFallback: async () => {
      calls.push(["fallback"]);
    },
    debugLog: (event, payload) => calls.push([event, payload]),
    requestRender: () => calls.push(["render"])
  });

  controller.scheduleBootstrapFallback();
  assert.equal(windowRef.timers.length, 1);
  assert.equal(windowRef.timers[0].delay, 250);

  await windowRef.timers[0].fn();
  controller.markRuntimeBootstrapReady("rest");
  controller.markRuntimeBootstrapReady("rest");

  assert.equal(startupPerf.bootstrapRequestCount, 1);
  assert.equal(startupPerf.bootstrapReadyAtMs, 220);
  assert.equal(startupPerf.startupReported, true);
  assert.equal(calls[0][0], "sessions.bootstrap.request");
  assert.equal(calls[0][1].bootstrapRequestCount, 1);
  assert.deepEqual(calls[1], ["fallback"]);
  assert.equal(calls[2][0], "perf.startup.ready");
  assert.equal(calls[2][1].bootstrapRequestCount, 1);
  assert.equal(calls[2][1].toBootstrapReadyMs, 120);
  assert.deepEqual(calls.slice(3), [["render"], ["render"]]);

  bootstrapInFlight = true;
  controller.scheduleBootstrapFallback();
  assert.equal(windowRef.timers.length, 1);
});

test("app-runtime state controller tracks runtime bootstrap source, connectivity, and dev auth passthrough", async () => {
  const uiState = {
    loading: true,
    error: "broken"
  };
  const calls = [];
  const controller = createAppRuntimeStateController({
    uiState,
    runBootstrapDevAuthToken: async (options) => {
      calls.push(["dev-auth", options.reason]);
      return true;
    },
    requestRender: () => calls.push(["render"])
  });

  controller.setUiError("partial");
  assert.equal(uiState.error, "partial");
  assert.equal(controller.getRuntimeBootstrapSource(), "pending");

  const refreshed = await controller.bootstrapDevAuthToken({ reason: "bootstrap" });
  controller.markRuntimeConnected();

  assert.equal(refreshed, true);
  assert.equal(controller.getRuntimeBootstrapSource(), "pending");
  assert.equal(uiState.loading, false);
  assert.equal(uiState.error, "");
  assert.deepEqual(calls, [
    ["dev-auth", "bootstrap"],
    ["render"]
  ]);
});
