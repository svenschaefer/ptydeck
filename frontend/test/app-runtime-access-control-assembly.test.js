import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeAccessControlAssembly } from "../src/public/app-runtime-access-control-assembly.js";

test("app runtime access control assembly composes access initialization with helper hook installation", () => {
  const initializationAccessOptions = { scope: "access" };
  const uiState = {};
  const api = { name: "api" };
  const store = {
    getState() {
      return { sessions: [] };
    }
  };
  const streamAdapter = { name: "stream" };
  const collaboratorSetters = {
    controlPaneRuntimeController() {}
  };
  const testHooks = {};
  const createdInitializationAccessOptions = [];
  const helperAssemblyCalls = [];
  const accessComposition = {
    appRuntimeStateController: { name: "state" },
    appCommandUiFacadeController: { name: "command-ui" },
    sessionControlRuntimeController: { name: "session-control" },
    sessionQuickSendRuntimeController: { name: "quick-send" },
    setAccessState() {
      return "set-access";
    },
    setRuntimeClientId() {
      return "set-runtime-client-id";
    },
    isReadOnlyMode() {
      return false;
    },
    getReadOnlyModeMessage() {
      return "";
    },
    canWriteToSession() {
      return true;
    },
    getSessionWriteBlockMessage() {
      return "";
    },
    canTakeSessionControl() {
      return true;
    },
    getRuntimeClientId() {
      return "client-1";
    },
    renameTrustedLocalDevice() {
      return true;
    },
    showBlockedWriteReclaimUi() {
      return "reclaim";
    },
    renderSessionControl() {
      return "rendered";
    },
    maybeRedirectToCanonicalOrigin() {
      return false;
    },
    maybeAutoRepairOriginHandoffControl() {
      return true;
    },
    handleCommandFeedbackAction() {
      return "handled";
    }
  };

  const assembly = createAppRuntimeAccessControlAssembly({
    createAppRuntimeInitializationAccessComposition(options) {
      createdInitializationAccessOptions.push(options);
      return accessComposition;
    },
    createAppRuntimeCompositionHelperAssembly(options) {
      helperAssemblyCalls.push(options);
      return {
        installTestHooks() {
          testHooks.installed = true;
        }
      };
    },
    initializationAccessOptions,
    testHooks,
    uiState,
    api,
    store,
    streamAdapter,
    getInitializationErrorMessage: () => "Initialization failed.",
    showBlockedWriteReclaimUi: () => "show-reclaim-ui",
    maybeAutoRepairOriginHandoffControl: () => "auto-repair",
    handleCommandFeedbackAction: () => "handle-feedback",
    getTrustedLocalHandoffRuntimeController: () => ({ name: "handoff" }),
    getOriginHandoffSourceOrigin: () => "https://ptydeck.example",
    setOriginHandoffSourceOrigin() {},
    setRuntimeClientIdentityCreatedOnThisOrigin() {},
    normalizeCommandFeedbackActionSessionId: (sessionId) => String(sessionId || "").trim(),
    collaboratorSetters
  });

  assert.equal(assembly, accessComposition);
  assert.deepEqual(createdInitializationAccessOptions, [initializationAccessOptions]);
  assert.equal(helperAssemblyCalls.length, 1);
  assert.equal(helperAssemblyCalls[0].testHooks, testHooks);
  assert.equal(helperAssemblyCalls[0].uiState, uiState);
  assert.equal(helperAssemblyCalls[0].api, api);
  assert.equal(helperAssemblyCalls[0].store, store);
  assert.equal(helperAssemblyCalls[0].streamAdapter, streamAdapter);
  assert.equal(helperAssemblyCalls[0].setAccessState, accessComposition.setAccessState);
  assert.equal(helperAssemblyCalls[0].setRuntimeClientId, accessComposition.setRuntimeClientId);
  assert.equal(helperAssemblyCalls[0].sessionControlRuntimeController, accessComposition.sessionControlRuntimeController);
  assert.equal(helperAssemblyCalls[0].getInitializationErrorMessage(), "Initialization failed.");
  assert.equal(helperAssemblyCalls[0].showBlockedWriteReclaimUi(), "reclaim");
  assert.equal(helperAssemblyCalls[0].maybeAutoRepairOriginHandoffControl(), true);
  assert.equal(helperAssemblyCalls[0].handleCommandFeedbackAction(), "handled");
  assert.equal(helperAssemblyCalls[0].getTrustedLocalHandoffRuntimeController().name, "handoff");
  assert.equal(helperAssemblyCalls[0].getOriginHandoffSourceOrigin(), "https://ptydeck.example");
  assert.equal(helperAssemblyCalls[0].normalizeCommandFeedbackActionSessionId(" s-1 "), "s-1");
  assert.equal(helperAssemblyCalls[0].collaboratorSetters, collaboratorSetters);
  assert.equal(testHooks.installed, true);
});

test("app runtime access control assembly falls back safely for missing helper callbacks", () => {
  const helperAssemblyCalls = [];
  const accessComposition = {
    appRuntimeStateController: null,
    appCommandUiFacadeController: null,
    sessionControlRuntimeController: null,
    sessionQuickSendRuntimeController: null,
    setAccessState() {},
    setRuntimeClientId() {}
  };

  createAppRuntimeAccessControlAssembly({
    createAppRuntimeInitializationAccessComposition() {
      return accessComposition;
    },
    createAppRuntimeCompositionHelperAssembly(options) {
      helperAssemblyCalls.push(options);
      return {
        installTestHooks() {}
      };
    },
    initializationAccessOptions: null,
    collaboratorSetters: null
  });

  assert.equal(helperAssemblyCalls.length, 1);
  assert.equal(helperAssemblyCalls[0].getInitializationErrorMessage(), "");
  assert.equal(helperAssemblyCalls[0].showBlockedWriteReclaimUi(), false);
  assert.equal(helperAssemblyCalls[0].maybeAutoRepairOriginHandoffControl(), false);
  assert.equal(helperAssemblyCalls[0].handleCommandFeedbackAction(), false);
  assert.equal(helperAssemblyCalls[0].getTrustedLocalHandoffRuntimeController(), null);
  assert.equal(helperAssemblyCalls[0].getOriginHandoffSourceOrigin(), "");
  assert.equal(helperAssemblyCalls[0].normalizeCommandFeedbackActionSessionId(" session-1 "), " session-1 ");
  assert.deepEqual(helperAssemblyCalls[0].collaboratorSetters, {});
});
