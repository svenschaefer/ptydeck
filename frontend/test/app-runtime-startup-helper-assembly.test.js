import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeStartupHelperAssembly } from "../src/public/app-runtime-startup-helper-assembly.js";

test("app runtime startup helper assembly wires initialization, reclaim, and trusted-local helper bridges", async () => {
  const calls = [];
  const startupResult = { appRuntimeInitializationController: { id: "init" } };
  const layoutFoundationStateRef = {
    terminalSettings: { cols: 132, rows: 40 }
  };
  const traceDebugController = {
    record(channel, entry) {
      calls.push(["trace", channel, entry]);
    }
  };
  const sessionControlRuntimeController = {
    consumeOriginHandoffSourceFromWindow() {
      calls.push(["consume"]);
      return "https://handoff.example";
    },
    setRuntimeClientIdentityCreatedOnThisOrigin(value) {
      calls.push(["created-on-origin", value]);
    },
    setTrustedLocalClientLabel(label) {
      calls.push(["set-label", label]);
    }
  };
  const trustedLocalClientRuntimeController = {
    getClientIdentity() {
      calls.push(["get-client"]);
      return { clientId: "client-1" };
    },
    ensureClientIdentity() {
      calls.push(["ensure-client"]);
      return Promise.resolve({ clientId: "client-1", label: "Alpha" });
    }
  };
  const startupBackupRuntimeController = {
    ensureStartupBackup() {
      calls.push(["backup"]);
      return Promise.resolve("backed-up");
    }
  };
  const appCommandUiFacadeController = {
    setError(message) {
      calls.push(["set-error", message]);
    }
  };

  let startupArgs = null;
  const assembly = createAppRuntimeStartupHelperAssembly({
    store: { id: "store" },
    api: { id: "api" },
    commandInput: { id: "command-input" },
    maybeRedirectToCanonicalOrigin: () => false,
    showBlockedWriteReclaimUi: () => "reclaim-ui",
    setAccessState: () => "access-state",
    handleCommandFeedbackAction: () => Promise.resolve("feedback"),
    setRuntimeClientId: () => "runtime-client",
    layoutFoundationStateRef,
    traceDebugController,
    sessionControlRuntimeController,
    trustedLocalClientRuntimeController,
    startupBackupRuntimeController,
    appCommandUiFacadeController,
    createAppRuntimeStartupComposition(args) {
      startupArgs = args;
      return startupResult;
    }
  });

  assert.equal(assembly, startupResult);
  assert.equal(startupArgs.store.id, "store");
  assert.deepEqual(startupArgs.getTerminalSettings(), layoutFoundationStateRef.terminalSettings);
  startupArgs.recordTrace({ event: "ws.ready" });
  assert.deepEqual(calls.shift(), ["trace", "ws.event", { event: "ws.ready" }]);
  assert.equal(startupArgs.consumeOriginHandoffSourceFromWindow(), "https://handoff.example");
  assert.deepEqual(calls.shift(), ["consume"]);
  assert.equal(await startupArgs.ensureStartupBackup(), "backed-up");
  assert.deepEqual(calls.shift(), ["backup"]);
  assert.deepEqual(startupArgs.getTrustedLocalClientIdentity(), { clientId: "client-1" });
  assert.deepEqual(calls.shift(), ["get-client"]);
  assert.deepEqual(await startupArgs.ensureTrustedLocalClientIdentity(), { clientId: "client-1", label: "Alpha" });
  assert.deepEqual(calls.shift(), ["ensure-client"]);
  startupArgs.setRuntimeClientIdentityCreatedOnThisOrigin(true);
  assert.deepEqual(calls.shift(), ["created-on-origin", true]);
  startupArgs.setTrustedLocalClientLabel("Deck Alpha");
  assert.deepEqual(calls.shift(), ["set-label", "Deck Alpha"]);
  startupArgs.applyInitializationError("Init failed.");
  assert.deepEqual(calls.shift(), ["set-error", "Init failed."]);
  assert.equal(startupArgs.showBlockedWriteReclaimUi(), "reclaim-ui");
});

test("app runtime startup helper assembly fails closed for missing optional collaborators", async () => {
  let startupArgs = null;

  createAppRuntimeStartupHelperAssembly({
    createAppRuntimeStartupComposition(args) {
      startupArgs = args;
      return {};
    }
  });

  assert.equal(startupArgs.getTerminalSettings(), null);
  assert.equal(startupArgs.recordTrace({ event: "ignored" }), undefined);
  assert.equal(startupArgs.consumeOriginHandoffSourceFromWindow(), null);
  assert.equal(await startupArgs.ensureStartupBackup(), undefined);
  assert.equal(startupArgs.getTrustedLocalClientIdentity(), null);
  assert.equal(await startupArgs.ensureTrustedLocalClientIdentity(), null);
  assert.equal(startupArgs.setRuntimeClientIdentityCreatedOnThisOrigin(true), undefined);
  assert.equal(startupArgs.setTrustedLocalClientLabel("Deck"), undefined);
  assert.equal(startupArgs.applyInitializationError("Init failed."), undefined);
});
