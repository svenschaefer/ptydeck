import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeStartupReadiness } from "../src/runtime-startup-readiness.js";

function createStartupWarmupHarness() {
  const calls = [];
  const state = {
    enabled: true,
    quietMs: 80
  };
  return {
    calls,
    startupWarmup: {
      abort() {
        calls.push("abort");
      },
      getState() {
        calls.push("getState");
        return { ...state };
      },
      prepareForStart() {
        calls.push("prepareForStart");
      },
      reconcile() {
        calls.push("reconcile");
      },
      releaseGate() {
        calls.push("releaseGate");
      }
    }
  };
}

test("runtime startup readiness marks runtime ready once and logs warmup metadata deterministically", async () => {
  const harness = createStartupWarmupHarness();
  const debugEvents = [];
  const messagingRuntime = {
    markRuntimeReadyCalls: 0,
    markRuntimeReady() {
      this.markRuntimeReadyCalls += 1;
    }
  };
  const readiness = createRuntimeStartupReadiness({
    messagingRuntime,
    logDebug: (event, details) => {
      debugEvents.push({ event, details });
    },
    listSessions: () => [{ id: "s-1" }, { id: "s-2" }],
    port: 18080
  });

  readiness.attachStartupWarmup(harness.startupWarmup);
  readiness.prepareForStart();
  const waitForReady = readiness.releaseGateAndAwaitReadiness();
  readiness.markReadyFromWarmup();
  await waitForReady;
  readiness.markReadyFromWarmup();

  assert.equal(readiness.getIsReady(), true);
  assert.equal(messagingRuntime.markRuntimeReadyCalls, 1);
  assert.deepEqual(harness.calls, ["prepareForStart", "releaseGate", "reconcile", "getState"]);
  assert.deepEqual(debugEvents, [
    {
      event: "runtime.ready",
      details: {
        port: 18080,
        sessionCount: 2,
        startupWarmupEnabled: true,
        startupWarmupQuietMs: 80
      }
    }
  ]);
});

test("runtime startup readiness aborts pending warmup waiters during stop and tracks stopped state deterministically", async () => {
  const harness = createStartupWarmupHarness();
  const readiness = createRuntimeStartupReadiness();

  readiness.attachStartupWarmup(harness.startupWarmup);
  readiness.prepareForStart();
  const waitForReady = readiness.releaseGateAndAwaitReadiness();
  readiness.beginStop();
  await waitForReady;
  readiness.markStopped();

  assert.equal(readiness.getIsReady(), false);
  assert.equal(readiness.getIsStopping(), false);
  assert.equal(readiness.getIsStopped(), true);
  assert.deepEqual(harness.calls, ["prepareForStart", "releaseGate", "reconcile", "abort"]);
});
