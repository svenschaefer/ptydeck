import { createApiClient as defaultCreateApiClient } from "./api-client.js";
import { createClipboardRuntimeController as defaultCreateClipboardRuntimeController } from "./clipboard-runtime-controller.js";
import { createCommandDiscoveryUsageStore as defaultCreateCommandDiscoveryUsageStore } from "./command-discovery-ranking.js";
import { createFileTransferRuntimeController as defaultCreateFileTransferRuntimeController } from "./file-transfer-runtime-controller.js";
import { createReplayExportRuntimeController as defaultCreateReplayExportRuntimeController } from "./replay-export-runtime-controller.js";
import { resolveRuntimeConfig as defaultResolveRuntimeConfig } from "./runtime-config.js";
import { createStartupBackupRuntimeController as defaultCreateStartupBackupRuntimeController } from "./startup-backup-runtime-controller.js";
import { createStore as defaultCreateStore } from "./store.js";
import { createStreamDebugTraceController as defaultCreateStreamDebugTraceController } from "./stream-debug-trace-controller.js";
import { createStreamInterpretationPluginEngine as defaultCreateStreamInterpretationPluginEngine } from "./stream-interpretation-plugin-engine.js";
import { createTraceDebugController as defaultCreateTraceDebugController } from "./trace-debug-controller.js";
import { createTrustedLocalClientRuntimeController as defaultCreateTrustedLocalClientRuntimeController } from "./trusted-local-client-runtime-controller.js";

function createNoopTraceController() {
  return {
    record() {},
    dispose() {}
  };
}

export function createAppRuntimeFoundation(options = {}) {
  const windowRef = options.windowRef ?? globalThis.window ?? null;
  const documentRef = options.documentRef ?? globalThis.document ?? null;
  const consoleRef = options.consoleRef ?? globalThis.console ?? null;
  const resolveRuntimeConfig = options.resolveRuntimeConfig ?? defaultResolveRuntimeConfig;
  const createApiClient = options.createApiClient ?? defaultCreateApiClient;
  const createClipboardRuntimeController =
    options.createClipboardRuntimeController ?? defaultCreateClipboardRuntimeController;
  const createCommandDiscoveryUsageStore =
    options.createCommandDiscoveryUsageStore ?? defaultCreateCommandDiscoveryUsageStore;
  const createStartupBackupRuntimeController =
    options.createStartupBackupRuntimeController ?? defaultCreateStartupBackupRuntimeController;
  const createTrustedLocalClientRuntimeController =
    options.createTrustedLocalClientRuntimeController ?? defaultCreateTrustedLocalClientRuntimeController;
  const createReplayExportRuntimeController =
    options.createReplayExportRuntimeController ?? defaultCreateReplayExportRuntimeController;
  const createFileTransferRuntimeController =
    options.createFileTransferRuntimeController ?? defaultCreateFileTransferRuntimeController;
  const createStreamDebugTraceController =
    options.createStreamDebugTraceController ?? defaultCreateStreamDebugTraceController;
  const createTraceDebugController = options.createTraceDebugController ?? defaultCreateTraceDebugController;
  const createStore = options.createStore ?? defaultCreateStore;
  const createStreamInterpretationPluginEngine =
    options.createStreamInterpretationPluginEngine ?? defaultCreateStreamInterpretationPluginEngine;
  const getAppRuntimeStateController =
    typeof options.getAppRuntimeStateController === "function" ? options.getAppRuntimeStateController : () => null;
  const getAppSessionRuntimeFacadeController =
    typeof options.getAppSessionRuntimeFacadeController === "function"
      ? options.getAppSessionRuntimeFacadeController
      : () => null;

  const config = options.config ?? resolveRuntimeConfig(windowRef);
  const debugLogs = config?.debugLogs === true;
  const debugLog = (event, details = {}) => {
    if (!debugLogs || typeof consoleRef?.debug !== "function") {
      return;
    }
    const timestamp = new Date().toISOString();
    consoleRef.debug(`[ptydeck][${timestamp}] ${event}`, details);
  };

  const traceDebugController = debugLogs ? createTraceDebugController({ windowRef }) : createNoopTraceController();
  const streamDebugTraceController = debugLogs
    ? createStreamDebugTraceController({ windowRef })
    : createNoopTraceController();

  const api = createApiClient(config.apiBaseUrl, {
    debug: debugLogs,
    log: debugLog,
    onTrace: (meta) => traceDebugController.record("api.response", meta),
    async onUnauthorized() {
      const refreshed = await getAppRuntimeStateController()?.bootstrapDevAuthToken?.();
      if (!refreshed) {
        debugLog("auth.recovery.failed", {});
      }
      return refreshed;
    }
  });

  const clipboardRuntimeController = createClipboardRuntimeController({
    navigatorRef: windowRef?.navigator || globalThis.navigator || null
  });
  const commandDiscoveryUsageStore = createCommandDiscoveryUsageStore({
    storageRef: windowRef?.localStorage || null
  });
  const startupBackupRuntimeController = createStartupBackupRuntimeController({
    localStorageRef: windowRef?.localStorage || null
  });
  const trustedLocalClientRuntimeController = createTrustedLocalClientRuntimeController({
    localStorageRef: windowRef?.localStorage || null,
    navigatorRef: windowRef?.navigator || globalThis.navigator || null,
    cryptoRef: windowRef?.crypto || globalThis.crypto || null
  });
  const replayExportRuntimeController = createReplayExportRuntimeController({
    api,
    documentRef,
    URLRef: windowRef?.URL || globalThis.URL || null,
    BlobCtor: windowRef?.Blob || globalThis.Blob,
    writeClipboardText: (text) => clipboardRuntimeController.writeText(text),
    formatSessionToken: (sessionId) => getAppSessionRuntimeFacadeController()?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) =>
      getAppSessionRuntimeFacadeController()?.formatSessionDisplayName?.(session) || ""
  });
  const fileTransferRuntimeController = createFileTransferRuntimeController({
    api,
    documentRef,
    windowRef,
    URLRef: windowRef?.URL || globalThis.URL || null,
    BlobCtor: windowRef?.Blob || globalThis.Blob,
    formatSessionToken: (sessionId) => getAppSessionRuntimeFacadeController()?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) =>
      getAppSessionRuntimeFacadeController()?.formatSessionDisplayName?.(session) || ""
  });
  const store = createStore();
  const streamInterpretationPluginEngine = createStreamInterpretationPluginEngine({
    plugins: Array.isArray(options.streamInterpretationPlugins) ? options.streamInterpretationPlugins : []
  });

  return {
    api,
    clipboardRuntimeController,
    commandDiscoveryUsageStore,
    config,
    debugLog,
    debugLogs,
    fileTransferRuntimeController,
    replayExportRuntimeController,
    startupBackupRuntimeController,
    store,
    streamDebugTraceController,
    streamInterpretationPluginEngine,
    traceDebugController,
    trustedLocalClientRuntimeController
  };
}
