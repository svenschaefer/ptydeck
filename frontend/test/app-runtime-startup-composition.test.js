import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeStartupComposition } from "../src/public/app-runtime-startup-composition.js";

test("app runtime startup composition wires slash workflow into bootstrap assembly before command composition", () => {
  const calls = [];
  const slashWorkflowRuntimeController = {
    runWorkflowDetailed() {},
    stopActiveWorkflow() {
      return true;
    },
    interruptWorkflowSession() {
      return Promise.resolve("");
    },
    killWorkflowSession() {
      return Promise.resolve("");
    },
    dispose() {}
  };
  const bootstrapResult = {
    appBootstrapCompositionController: {
      bootstrapUiAndRuntime() {
        return { ok: true };
      }
    },
    commandTargetRuntimeController: {
      activateSessionTarget(session) {
        return { ok: true, message: String(session?.id || "") };
      },
      activateDeckTarget(deck) {
        return { ok: true, message: String(deck?.id || "") };
      }
    },
    commandExecutor: {}
  };

  const composition = createAppRuntimeStartupComposition({
    store: {
      getState() {
        return {};
      }
    },
    api: {
      interruptSession() {
        return Promise.resolve("");
      },
      killSession() {
        return Promise.resolve("");
      }
    },
    terminals: new Map([["s-1", { id: "terminal-entry" }]]),
    systemSlashCommands: [{ name: "/help" }],
    commandDiscoveryUsageStore: {
      getUsageScore() {
        return 7;
      },
      record() {}
    },
    appCommandUiFacadeController: {
      executeControlCommandDetailed(interpreted) {
        calls.push(["executeControlCommandDetailed", interpreted]);
        return { ok: true, feedback: "ok" };
      },
      listCustomCommands() {
        return [{ name: "deploy" }];
      },
      setCommandFeedback() {},
      render() {}
    },
    appRuntimeStateController: {
      setWorkflowRunState() {},
      clearWorkflowRunState() {}
    },
    appSessionRuntimeFacadeController: {
      formatSessionToken(sessionId) {
        return `#${sessionId}`;
      },
      formatSessionDisplayName(session) {
        return String(session?.name || session?.id || "");
      }
    },
    commandInput: {
      value: "",
      focus() {},
      setSelectionRange() {},
      dispatchEvent() {}
    },
    windowRef: {
      Event: class Event {
        constructor(type, init = {}) {
          this.type = type;
          this.bubbles = init.bubbles === true;
        }
      }
    },
    createSlashWorkflowRuntimeController(args) {
      calls.push(["slash", args]);
      assert.equal(typeof args.executeControlCommandDetailed, "function");
      assert.equal(args.getTerminalEntry("s-1")?.id, "terminal-entry");
      return slashWorkflowRuntimeController;
    },
    createAppRuntimeBootstrapAssembly(args) {
      calls.push(["bootstrap", args]);
      assert.equal(args.slashWorkflowRuntimeController, slashWorkflowRuntimeController);
      return bootstrapResult;
    },
    createCommandPaletteRuntimeController(args) {
      calls.push(["palette", args]);
      assert.equal(args.getUsageScore("help"), 7);
      assert.deepEqual(args.activateSessionTarget({ id: "s-2" }), { ok: true, message: "s-2" });
      assert.deepEqual(args.activateDeckTarget({ id: "ops" }), { ok: true, message: "ops" });
      return { open() {} };
    },
    createAppRuntimeInitializationController(args) {
      calls.push(["init", args]);
      return {
        initialize() {
          return args.bootstrapUiAndRuntime();
        },
        setInitializationError() {},
        getInitializationErrorMessage() {
          return "";
        }
      };
    }
  });

  assert.deepEqual(
    calls.map(([name]) => name),
    ["slash", "bootstrap", "palette", "init"]
  );
  assert.equal(composition.slashWorkflowRuntimeController, slashWorkflowRuntimeController);
  assert.equal(composition.commandExecutor, bootstrapResult.commandExecutor);
  assert.deepEqual(composition.appRuntimeInitializationController.initialize(), { ok: true });
});

test("app runtime startup composition forwards initialization dependencies through the extracted seam", async () => {
  const observed = {};
  const composition = createAppRuntimeStartupComposition({
    createSlashWorkflowRuntimeController() {
      return {};
    },
    createAppRuntimeBootstrapAssembly() {
      return {
        appBootstrapCompositionController: {
          async bootstrapUiAndRuntime() {
            observed.bootstrapInvoked = true;
            return { phase: "bootstrapped" };
          }
        },
        commandTargetRuntimeController: null
      };
    },
    createCommandPaletteRuntimeController() {
      return { open() {} };
    },
    createAppRuntimeInitializationController(args) {
      observed.initializationArgs = args;
      return {
        async initialize() {
          return args.bootstrapUiAndRuntime();
        },
        setInitializationError(message) {
          observed.errorMessage = message;
        },
        getInitializationErrorMessage() {
          return observed.errorMessage || "";
        }
      };
    },
    maybeRedirectToCanonicalOrigin() {
      observed.redirectChecked = true;
      return false;
    },
    consumeOriginHandoffSourceFromWindow() {
      observed.originConsumed = true;
      return null;
    },
    ensureStartupBackup() {
      observed.backupEnsured = true;
      return Promise.resolve();
    },
    getTrustedLocalClientIdentity() {
      observed.identityRead = true;
      return { clientId: "client-1" };
    },
    ensureTrustedLocalClientIdentity() {
      observed.identityEnsured = true;
      return Promise.resolve({ clientId: "client-1" });
    },
    setRuntimeClientIdentityCreatedOnThisOrigin(value) {
      observed.createdOnThisOrigin = value;
    },
    setTrustedLocalClientLabel(label) {
      observed.clientLabel = label;
    },
    setRuntimeClientId(clientId) {
      observed.runtimeClientId = clientId;
    },
    applyInitializationError(message) {
      observed.appliedError = message;
    }
  });

  assert.equal(typeof observed.initializationArgs.bootstrapUiAndRuntime, "function");
  assert.equal(typeof observed.initializationArgs.maybeRedirectToCanonicalOrigin, "function");
  assert.equal(typeof observed.initializationArgs.ensureStartupBackup, "function");
  assert.equal(typeof observed.initializationArgs.ensureTrustedLocalClientIdentity, "function");
  const result = await composition.appRuntimeInitializationController.initialize();

  assert.deepEqual(result, { phase: "bootstrapped" });
  assert.equal(observed.bootstrapInvoked, true);

  composition.appRuntimeInitializationController.setInitializationError("Init failed.");
  assert.equal(composition.appRuntimeInitializationController.getInitializationErrorMessage(), "Init failed.");
});
