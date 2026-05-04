import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeBootstrapAssembly } from "../src/public/app-runtime-bootstrap-assembly.js";

test("app runtime bootstrap assembly delegates bootstrap composition wiring and returns the composed controllers", async () => {
  const calls = [];
  let capturedOptions = null;
  const session = { id: "s-1", name: "Ops" };
  const composedControllers = {
    commandEngine: { id: "engine" },
    commandTargetRuntimeController: { id: "target" },
    commandExecutor: { id: "executor" },
    authBootstrapRuntimeController: { id: "auth" },
    wsRuntimeController: { id: "ws" },
    commandComposerAutocompleteController: { id: "autocomplete" },
    commandComposerRuntimeController: { id: "composer" },
    appLifecycleController: { id: "lifecycle" }
  };
  const store = {
    applySessionInterpretationActions(sessionId, actions) {
      calls.push(["apply-actions", sessionId, actions]);
    }
  };
  const api = {
    async listShares() {
      return [{ id: "share-1" }];
    },
    async createShareLink(payload) {
      return { shareId: payload.sessionId };
    },
    async revokeShareLink(shareId) {
      return shareId === "share-1";
    }
  };
  const streamInterpretationPluginEngine = {
    interpretRuntimeEvent(event, context) {
      calls.push(["interpret", event.type, context.getSessionById("s-1")]);
      return { batches: [{ sessionId: "s-1", actions: ["render"] }], errors: [] };
    }
  };
  const streamDebugTraceController = {
    record(sessionId, eventType, payload) {
      calls.push(["trace", sessionId, eventType, payload]);
    },
    dispose() {
      calls.push(["stream-trace-dispose"]);
    }
  };
  const traceDebugController = {
    dispose() {
      calls.push(["trace-dispose"]);
    }
  };
  const pasteObservationRuntimeController = {
    observeSessionOutput(sessionId, data) {
      calls.push(["observe-output", sessionId, data]);
    }
  };
  const appSessionRuntimeFacadeController = {
    getSessionById(sessionId) {
      return sessionId === "s-1" ? session : null;
    }
  };
  const commandDiscoveryUsageStore = {
    getUsageScore(key) {
      calls.push(["usage-score", key]);
      return 7;
    },
    record(key) {
      calls.push(["usage-record", key]);
    }
  };
  const clipboardRuntimeController = {
    async readText() {
      calls.push(["clipboard-read"]);
      return "clipboard";
    },
    async writeText(text) {
      calls.push(["clipboard-write", text]);
      return true;
    }
  };
  const trustedLocalClientRuntimeController = {
    getWsTicketPayload() {
      calls.push(["ws-ticket"]);
      return { clientId: "client-local" };
    }
  };
  const replayViewerRuntimeController = {
    openSessionReplayViewer(nextSession) {
      calls.push(["replay-open", nextSession.id]);
      return true;
    }
  };
  const replayExportRuntimeController = {
    exportSessionReplay(nextSession, options) {
      calls.push(["replay-export", nextSession.id, options.mode]);
      return Promise.resolve(options.mode);
    },
    loadSessionReplayExcerpt(nextSession, selector) {
      calls.push(["replay-load", nextSession.id, selector]);
      return Promise.resolve({ selector });
    },
    copySessionReplayExcerpt(nextSession, selector, runtimeOptions) {
      calls.push(["replay-copy", nextSession.id, selector, runtimeOptions]);
      return Promise.resolve(true);
    },
    previewSessionReplayExcerpt(nextSession, payload) {
      calls.push(["replay-preview", nextSession.id, payload]);
      return { ok: true };
    }
  };
  const fileTransferRuntimeController = {
    uploadSessionFile(nextSession, runtimeOptions) {
      calls.push(["upload", nextSession.id, runtimeOptions]);
      return Promise.resolve("upload");
    },
    downloadSessionFile(nextSession, runtimeOptions) {
      calls.push(["download", nextSession.id, runtimeOptions]);
      return Promise.resolve("download");
    }
  };
  const sessionQuickSendRuntimeController = {
    buildCustomCommandUsageApiOptions(command) {
      calls.push(["quick-send", command.lookupKey]);
      return { sessionId: "s-1", lookupKey: command.lookupKey };
    }
  };
  const slashWorkflowRuntimeController = {
    runWorkflowDetailed(interpreted) {
      calls.push(["workflow-run", interpreted.kind]);
      return { ok: true };
    },
    stopActiveWorkflow() {
      calls.push(["workflow-stop"]);
      return true;
    },
    interruptWorkflowSession() {
      calls.push(["workflow-interrupt"]);
      return Promise.resolve("interrupt");
    },
    killWorkflowSession() {
      calls.push(["workflow-kill"]);
      return Promise.resolve("kill");
    },
    dispose() {
      calls.push(["workflow-dispose"]);
    }
  };

  const assembly = createAppRuntimeBootstrapAssembly({
    createAppBootstrapCompositionController(options) {
      capturedOptions = options;
      return {
        composeControllers() {
          calls.push(["compose"]);
          return composedControllers;
        },
        bootstrapUiAndRuntime() {
          calls.push(["bootstrap"]);
          return Promise.resolve({ ok: true });
        }
      };
    },
    store,
    api,
    commandInput: { value: "" },
    terminals: new Map([["s-1", { terminal: true }]]),
    terminalObservers: new Map(),
    getTerminalSettings: () => ({ cols: 80, rows: 24 }),
    streamInterpretationPluginEngine,
    streamDebugTraceController,
    traceDebugController,
    pasteObservationRuntimeController,
    appSessionRuntimeFacadeController,
    commandDiscoveryUsageStore,
    clipboardRuntimeController,
    trustedLocalClientRuntimeController,
    replayViewerRuntimeController,
    replayExportRuntimeController,
    fileTransferRuntimeController,
    sessionQuickSendRuntimeController,
    slashWorkflowRuntimeController
  });

  assert.equal(assembly.commandEngine, composedControllers.commandEngine);
  assert.equal(assembly.commandTargetRuntimeController, composedControllers.commandTargetRuntimeController);
  assert.equal(assembly.commandExecutor, composedControllers.commandExecutor);
  assert.equal(assembly.authBootstrapRuntimeController, composedControllers.authBootstrapRuntimeController);
  assert.equal(assembly.wsRuntimeController, composedControllers.wsRuntimeController);
  assert.equal(
    assembly.commandComposerAutocompleteController,
    composedControllers.commandComposerAutocompleteController
  );
  assert.equal(assembly.commandComposerRuntimeController, composedControllers.commandComposerRuntimeController);
  assert.equal(assembly.appLifecycleController, composedControllers.appLifecycleController);
  assert.equal(typeof capturedOptions.interpretRuntimeEvent, "function");
  assert.equal(typeof capturedOptions.observeSessionData, "function");
  assert.equal(typeof capturedOptions.buildCustomCommandUsageApiOptions, "function");
  assert.equal(typeof capturedOptions.getWsTicketPayload, "function");

  assert.deepEqual(capturedOptions.interpretRuntimeEvent({ type: "session.created" }), {
    batches: [{ sessionId: "s-1", actions: ["render"] }],
    errors: []
  });
  capturedOptions.applySessionInterpretationActions("s-1", ["render"]);
  capturedOptions.observeSessionData("s-1", "pwd\n");
  assert.deepEqual(capturedOptions.buildCustomCommandUsageApiOptions({ lookupKey: "deploy" }), {
    sessionId: "s-1",
    lookupKey: "deploy"
  });
  assert.equal(capturedOptions.getDiscoveryUsageScore("ssh"), 7);
  capturedOptions.recordDiscoveryUsage("ssh");
  assert.equal(await capturedOptions.readClipboardText(), "clipboard");
  assert.equal(await capturedOptions.writeClipboardText("hello"), true);
  assert.deepEqual(capturedOptions.getWsTicketPayload(), { clientId: "client-local" });
  assert.equal(await capturedOptions.exportSessionReplayDownload(session), "download");
  assert.equal(await capturedOptions.exportSessionReplayCopy(session), "copy");
  assert.deepEqual(await capturedOptions.loadSessionReplayExcerpt(session, "last"), { selector: "last" });
  assert.equal(await capturedOptions.copySessionReplayExcerpt(session, "last", { copy: true }), true);
  assert.deepEqual(capturedOptions.previewSessionReplayExcerpt(session, { selector: "last" }), { ok: true });
  assert.deepEqual(await capturedOptions.listShares(), [{ id: "share-1" }]);
  assert.deepEqual(await capturedOptions.createShareLink({ sessionId: "s-1" }), { shareId: "s-1" });
  assert.equal(await capturedOptions.revokeShareLink("share-1"), true);
  assert.equal(await capturedOptions.uploadSessionFile(session, { path: "/tmp/log.txt" }), "upload");
  assert.equal(await capturedOptions.downloadSessionFile(session, { path: "/tmp/log.txt" }), "download");
  assert.deepEqual(capturedOptions.runWorkflowDetailed({ kind: "slash" }), { ok: true });
  assert.equal(capturedOptions.stopWorkflow(), true);
  assert.equal(await capturedOptions.interruptWorkflowSession(), "interrupt");
  assert.equal(await capturedOptions.killWorkflowSession(), "kill");
  capturedOptions.disposeWorkflowRuntime();
  capturedOptions.disposeStreamDebugTrace();

  assert.deepEqual(calls, [
    ["compose"],
    ["interpret", "session.created", session],
    ["apply-actions", "s-1", ["render"]],
    ["trace", "s-1", "ws.session.data", { chunk: "pwd\n", hasTerminal: true }],
    ["observe-output", "s-1", "pwd\n"],
    ["quick-send", "deploy"],
    ["usage-score", "ssh"],
    ["usage-record", "ssh"],
    ["clipboard-read"],
    ["clipboard-write", "hello"],
    ["ws-ticket"],
    ["replay-export", "s-1", "download"],
    ["replay-export", "s-1", "copy"],
    ["replay-load", "s-1", "last"],
    ["replay-copy", "s-1", "last", { copy: true }],
    ["replay-preview", "s-1", { selector: "last" }],
    ["upload", "s-1", { path: "/tmp/log.txt" }],
    ["download", "s-1", { path: "/tmp/log.txt" }],
    ["workflow-run", "slash"],
    ["workflow-stop"],
    ["workflow-interrupt"],
    ["workflow-kill"],
    ["workflow-dispose"],
    ["stream-trace-dispose"],
    ["trace-dispose"]
  ]);
});

test("app runtime bootstrap assembly provides safe fallbacks for optional collaborators", async () => {
  const assembly = createAppRuntimeBootstrapAssembly({
    createAppBootstrapCompositionController(options) {
      return {
        composeControllers() {
          return {
            commandEngine: options
          };
        }
      };
    }
  });

  assert.equal(typeof assembly.commandEngine.interpretRuntimeEvent, "function");
  assert.deepEqual(assembly.commandEngine.interpretRuntimeEvent({ type: "noop" }), { batches: [], errors: [] });
  assembly.commandEngine.observeSessionData("missing", "");
  assert.deepEqual(assembly.commandEngine.buildCustomCommandUsageApiOptions({ lookupKey: "noop" }), undefined);
  assert.equal(assembly.commandEngine.getDiscoveryUsageScore("noop"), 0);
  assembly.commandEngine.recordDiscoveryUsage("noop");
  assert.equal(await assembly.commandEngine.readClipboardText(), "");
  assert.equal(await assembly.commandEngine.writeClipboardText("noop"), false);
  assert.deepEqual(assembly.commandEngine.getWsTicketPayload(), {});
  assert.deepEqual(await assembly.commandEngine.listShares(), []);
  assert.equal(await assembly.commandEngine.createShareLink({}), null);
  assert.equal(await assembly.commandEngine.revokeShareLink("missing"), false);
});
