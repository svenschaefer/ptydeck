import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeFoundation } from "../src/public/app-runtime-foundation.js";

test("app-runtime foundation wires debug trace hooks and deferred auth recovery into the shared api client", async () => {
  const traceEvents = [];
  const streamTraceFactories = [];
  const apiCalls = [];
  const debugEntries = [];
  let refreshCount = 0;
  let appRuntimeStateController = {
    async bootstrapDevAuthToken() {
      refreshCount += 1;
      return true;
    }
  };

  const foundation = createAppRuntimeFoundation({
    config: {
      apiBaseUrl: "/api/v1",
      debugLogs: true
    },
    consoleRef: {
      debug(...args) {
        debugEntries.push(args);
      }
    },
    createApiClient(baseUrl, options) {
      apiCalls.push({ baseUrl, options });
      return { kind: "api-client" };
    },
    createTraceDebugController() {
      return {
        record(type, payload) {
          traceEvents.push({ type, payload });
        },
        dispose() {}
      };
    },
    createStreamDebugTraceController() {
      streamTraceFactories.push("created");
      return {
        record() {},
        dispose() {}
      };
    },
    getAppRuntimeStateController() {
      return appRuntimeStateController;
    }
  });

  assert.equal(foundation.debugLogs, true);
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].baseUrl, "/api/v1");
  assert.equal(apiCalls[0].options.debug, true);
  assert.equal(streamTraceFactories.length, 1);

  apiCalls[0].options.onTrace({ status: 200, traceId: "trace-123" });
  assert.deepEqual(traceEvents, [
    {
      type: "api.response",
      payload: { status: 200, traceId: "trace-123" }
    }
  ]);

  const refreshed = await apiCalls[0].options.onUnauthorized();
  assert.equal(refreshed, true);
  assert.equal(refreshCount, 1);

  appRuntimeStateController = {
    async bootstrapDevAuthToken() {
      refreshCount += 1;
      return false;
    }
  };
  const failedRefresh = await apiCalls[0].options.onUnauthorized();
  assert.equal(failedRefresh, false);
  assert.equal(refreshCount, 2);
  assert.equal(debugEntries.length, 1);
  assert.match(debugEntries[0][0], /^\[ptydeck\]\[[^\]]+\] auth\.recovery\.failed$/);
  assert.deepEqual(debugEntries[0][1], {});
});

test("app-runtime foundation keeps debug-only controllers fail-closed when debug mode is disabled", async () => {
  const apiCalls = [];
  let traceFactoryCount = 0;
  let streamTraceFactoryCount = 0;
  let refreshCount = 0;

  const foundation = createAppRuntimeFoundation({
    config: {
      apiBaseUrl: "/api/v1",
      debugLogs: false
    },
    consoleRef: {
      debug() {
        throw new Error("debug logging should stay disabled");
      }
    },
    createApiClient(baseUrl, options) {
      apiCalls.push({ baseUrl, options });
      return { kind: "api-client" };
    },
    createTraceDebugController() {
      traceFactoryCount += 1;
      return {
        record() {},
        dispose() {}
      };
    },
    createStreamDebugTraceController() {
      streamTraceFactoryCount += 1;
      return {
        record() {},
        dispose() {}
      };
    },
    getAppRuntimeStateController() {
      return {
        async bootstrapDevAuthToken() {
          refreshCount += 1;
          return false;
        }
      };
    }
  });

  assert.equal(foundation.debugLogs, false);
  assert.equal(traceFactoryCount, 0);
  assert.equal(streamTraceFactoryCount, 0);
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].options.debug, false);

  foundation.traceDebugController.record("ignored", { ok: false });
  foundation.traceDebugController.dispose();
  foundation.streamDebugTraceController.record("session-1", "chunk", { size: 1 });
  foundation.streamDebugTraceController.dispose();

  const refreshed = await apiCalls[0].options.onUnauthorized();
  assert.equal(refreshed, false);
  assert.equal(refreshCount, 1);
});

test("app-runtime foundation wires browser-local services and facade formatters into replay and transfer controllers", () => {
  const storageRef = { kind: "storage" };
  const navigatorRef = { kind: "navigator" };
  const cryptoRef = { kind: "crypto" };
  const URLRef = { kind: "url" };
  const BlobCtor = class BlobMock {};
  const clipboardWrites = [];
  const replayFactoryCalls = [];
  const transferFactoryCalls = [];
  const pluginFactoryCalls = [];
  const startupBackupCalls = [];
  const trustedLocalCalls = [];
  const commandDiscoveryCalls = [];
  let sessionRuntimeFacadeController = {
    formatSessionToken(sessionId) {
      return `#${sessionId}`;
    },
    formatSessionDisplayName(session) {
      return session?.name ? `${session.name}!` : "";
    }
  };

  const foundation = createAppRuntimeFoundation({
    windowRef: {
      localStorage: storageRef,
      navigator: navigatorRef,
      crypto: cryptoRef,
      URL: URLRef,
      Blob: BlobCtor
    },
    documentRef: { kind: "document" },
    config: {
      apiBaseUrl: "/api/v1",
      debugLogs: false
    },
    streamInterpretationPlugins: [{ id: "plugin-1" }],
    createApiClient() {
      return { kind: "api-client" };
    },
    createClipboardRuntimeController(options) {
      assert.equal(options.navigatorRef, navigatorRef);
      return {
        writeText(text) {
          clipboardWrites.push(text);
        }
      };
    },
    createCommandDiscoveryUsageStore(options) {
      commandDiscoveryCalls.push(options);
      return { kind: "command-discovery" };
    },
    createStartupBackupRuntimeController(options) {
      startupBackupCalls.push(options);
      return { kind: "startup-backup" };
    },
    createTrustedLocalClientRuntimeController(options) {
      trustedLocalCalls.push(options);
      return { kind: "trusted-local" };
    },
    createReplayExportRuntimeController(options) {
      replayFactoryCalls.push(options);
      return { kind: "replay-export" };
    },
    createFileTransferRuntimeController(options) {
      transferFactoryCalls.push(options);
      return { kind: "file-transfer" };
    },
    createStreamInterpretationPluginEngine(options) {
      pluginFactoryCalls.push(options);
      return { kind: "stream-engine", options };
    },
    getAppSessionRuntimeFacadeController() {
      return sessionRuntimeFacadeController;
    }
  });

  assert.equal(commandDiscoveryCalls.length, 1);
  assert.equal(commandDiscoveryCalls[0].storageRef, storageRef);
  assert.deepEqual(startupBackupCalls, [{ localStorageRef: storageRef }]);
  assert.deepEqual(trustedLocalCalls, [
    {
      localStorageRef: storageRef,
      navigatorRef,
      cryptoRef
    }
  ]);
  assert.deepEqual(pluginFactoryCalls, [{ plugins: [{ id: "plugin-1" }] }]);
  assert.equal(foundation.commandDiscoveryUsageStore.kind, "command-discovery");
  assert.equal(foundation.startupBackupRuntimeController.kind, "startup-backup");
  assert.equal(foundation.trustedLocalClientRuntimeController.kind, "trusted-local");

  assert.equal(replayFactoryCalls.length, 1);
  assert.equal(replayFactoryCalls[0].documentRef.kind, "document");
  assert.equal(replayFactoryCalls[0].URLRef, URLRef);
  assert.equal(replayFactoryCalls[0].BlobCtor, BlobCtor);
  assert.equal(transferFactoryCalls.length, 1);
  assert.equal(transferFactoryCalls[0].windowRef.localStorage, storageRef);
  assert.equal(transferFactoryCalls[0].URLRef, URLRef);
  assert.equal(transferFactoryCalls[0].BlobCtor, BlobCtor);

  replayFactoryCalls[0].writeClipboardText("pwd");
  assert.deepEqual(clipboardWrites, ["pwd"]);
  assert.equal(replayFactoryCalls[0].formatSessionToken("7"), "#7");
  assert.equal(replayFactoryCalls[0].formatSessionDisplayName({ name: "alpha" }), "alpha!");
  assert.equal(transferFactoryCalls[0].formatSessionToken("7"), "#7");
  assert.equal(transferFactoryCalls[0].formatSessionDisplayName({ name: "alpha" }), "alpha!");

  sessionRuntimeFacadeController = null;
  assert.equal(replayFactoryCalls[0].formatSessionToken("9"), "?");
  assert.equal(replayFactoryCalls[0].formatSessionDisplayName({ name: "beta" }), "");
});
