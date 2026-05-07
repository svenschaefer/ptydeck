import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeCompositionHelperAssembly } from "../src/public/app-runtime-composition-helper-assembly.js";

test("app runtime composition helper assembly installs deterministic test hooks and collaborator overrides", () => {
  const api = { name: "api" };
  const streamAdapter = { name: "stream-adapter" };
  const uiState = { commandFeedbackActionSessionId: "" };
  const storeState = { sessions: [{ id: "s-1" }] };
  const setSessionsCalls = [];
  const store = {
    getState() {
      return storeState;
    },
    setSessions(sessions) {
      setSessionsCalls.push(sessions);
    }
  };
  const commandFeedbackActionMetaValues = [];
  const trustedLocalClientLabels = [];
  let originHandoffSourceOrigin = "";
  let runtimeClientIdentityCreatedOnThisOrigin = false;
  let appSessionRuntimeFacadeController = { name: "session-facade-initial" };
  let appRuntimeStateController = { name: "state-initial" };
  let appCommandUiFacadeController = { name: "command-ui-initial" };
  let trustedLocalHandoffRuntimeController = { name: "handoff-initial" };
  let commandComposerRuntimeController = { name: "composer-initial" };
  let sessionTerminalResizeController = { name: "resize-initial" };
  let controlPaneRuntimeController = { name: "control-pane-initial" };
  const sessionControlRuntimeController = {
    setTrustedLocalClientLabel(label) {
      trustedLocalClientLabels.push(label);
    },
    getSessionWriteBlockMessage(session) {
      return `blocked:${session?.id || "?"}`;
    },
    getSessionControlSummary() {
      return "summary";
    },
    getSessionControlBadgeState() {
      return "badge";
    },
    getTakeOrReclaimControlLabel() {
      return "Take Control";
    },
    renderSessionControlClients(clients) {
      return Array.isArray(clients) ? clients.length : 0;
    },
    getCommandFeedbackActionMeta() {
      return commandFeedbackActionMetaValues.at(-1) || null;
    },
    setCommandFeedbackActionMeta(meta) {
      commandFeedbackActionMetaValues.push(meta);
    }
  };
  const hooks = {};
  const helperAssembly = createAppRuntimeCompositionHelperAssembly({
    testHooks: hooks,
    uiState,
    api,
    store,
    streamAdapter,
    setAccessState: () => "set-access-state",
    setRuntimeClientId: () => "set-runtime-client-id",
    sessionControlRuntimeController,
    getInitializationErrorMessage: () => "Initialization failed.",
    showBlockedWriteReclaimUi: () => "show-reclaim-ui",
    maybeAutoRepairOriginHandoffControl: () => "auto-repair",
    handleCommandFeedbackAction: () => "handle-feedback",
    getTrustedLocalHandoffRuntimeController: () => trustedLocalHandoffRuntimeController,
    getOriginHandoffSourceOrigin: () => originHandoffSourceOrigin,
    setOriginHandoffSourceOrigin(origin) {
      originHandoffSourceOrigin = origin;
    },
    setRuntimeClientIdentityCreatedOnThisOrigin(value) {
      runtimeClientIdentityCreatedOnThisOrigin = value;
    },
    normalizeCommandFeedbackActionSessionId: (sessionId) => String(sessionId || "").trim(),
    collaboratorSetters: {
      appSessionRuntimeFacadeController: (value) => {
        appSessionRuntimeFacadeController = value;
      },
      appRuntimeStateController: (value) => {
        appRuntimeStateController = value;
      },
      appCommandUiFacadeController: (value) => {
        appCommandUiFacadeController = value;
      },
      trustedLocalHandoffRuntimeController: (value) => {
        trustedLocalHandoffRuntimeController = value;
      },
      commandComposerRuntimeController: (value) => {
        commandComposerRuntimeController = value;
      },
      sessionTerminalResizeController: (value) => {
        sessionTerminalResizeController = value;
      },
      controlPaneRuntimeController: (value) => {
        controlPaneRuntimeController = value;
      }
    }
  });

  helperAssembly.installTestHooks();
  hooks.setTrustedLocalClientLabel("Laptop");
  hooks.setSessionsForTest([{ id: "s-2" }]);
  hooks.setCommandFeedbackActionSessionId(" s-2 ");
  hooks.setCommandFeedbackActionMeta({ scope: "session", sessionId: "s-2" });
  hooks.setOriginHandoffSourceOrigin("https://ptydeck.example");
  hooks.setRuntimeClientIdentityCreatedOnThisOrigin(true);
  hooks.setCollaborators({
    appSessionRuntimeFacadeController: { name: "session-facade-next" },
    appRuntimeStateController: { name: "state-next" },
    appCommandUiFacadeController: { name: "command-ui-next" },
    trustedLocalHandoffRuntimeController: { name: "handoff-next" },
    commandComposerRuntimeController: { name: "composer-next" },
    sessionTerminalResizeController: { name: "resize-next" },
    controlPaneRuntimeController: { name: "control-pane-next" }
  });

  assert.equal(hooks.uiState, uiState);
  assert.equal(hooks.getApi(), api);
  assert.equal(hooks.getStoreState(), storeState);
  assert.equal(hooks.getStreamAdapter(), streamAdapter);
  assert.equal(hooks.getInitializationErrorMessage(), "Initialization failed.");
  assert.equal(hooks.getSessionWriteBlockMessage({ id: "s-1" }), "blocked:s-1");
  assert.equal(hooks.getSessionControlSummary(), "summary");
  assert.equal(hooks.getSessionControlBadgeState(), "badge");
  assert.equal(hooks.getTakeOrReclaimControlLabel(), "Take Control");
  assert.equal(hooks.renderSessionControlClients([{ id: 1 }, { id: 2 }]), 2);
  assert.equal(hooks.showBlockedWriteReclaimUi(), "show-reclaim-ui");
  assert.equal(hooks.maybeAutoRepairOriginHandoffControl(), "auto-repair");
  assert.equal(hooks.handleCommandFeedbackAction(), "handle-feedback");
  assert.deepEqual(trustedLocalClientLabels, ["Laptop"]);
  assert.deepEqual(setSessionsCalls, [[{ id: "s-2" }]]);
  assert.equal(uiState.commandFeedbackActionSessionId, "s-2");
  assert.deepEqual(hooks.getCommandFeedbackActionMeta(), { scope: "session", sessionId: "s-2" });
  assert.equal(hooks.getOriginHandoffSourceOrigin(), "https://ptydeck.example");
  assert.equal(runtimeClientIdentityCreatedOnThisOrigin, true);
  assert.deepEqual(commandFeedbackActionMetaValues, [{ scope: "session", sessionId: "s-2" }]);
  assert.equal(hooks.getTrustedLocalHandoffRuntimeController(), trustedLocalHandoffRuntimeController);
  assert.deepEqual(appSessionRuntimeFacadeController, { name: "session-facade-next" });
  assert.deepEqual(appRuntimeStateController, { name: "state-next" });
  assert.deepEqual(appCommandUiFacadeController, { name: "command-ui-next" });
  assert.deepEqual(commandComposerRuntimeController, { name: "composer-next" });
  assert.deepEqual(sessionTerminalResizeController, { name: "resize-next" });
  assert.deepEqual(controlPaneRuntimeController, { name: "control-pane-next" });
});

test("app runtime composition helper assembly ignores missing test hooks and non-object collaborator overrides", () => {
  const helperAssembly = createAppRuntimeCompositionHelperAssembly({
    testHooks: null,
    uiState: {},
    api: {},
    store: {
      getState() {
        return {};
      },
      setSessions() {}
    },
    streamAdapter: {},
    setAccessState() {},
    setRuntimeClientId() {},
    sessionControlRuntimeController: {
      setTrustedLocalClientLabel() {},
      getSessionWriteBlockMessage() {
        return "";
      },
      getSessionControlSummary() {
        return "";
      },
      getSessionControlBadgeState() {
        return "";
      },
      getTakeOrReclaimControlLabel() {
        return "";
      },
      renderSessionControlClients() {
        return "";
      },
      getCommandFeedbackActionMeta() {
        return null;
      },
      setCommandFeedbackActionMeta() {}
    },
    getInitializationErrorMessage: () => "",
    showBlockedWriteReclaimUi: () => false,
    maybeAutoRepairOriginHandoffControl: () => false,
    handleCommandFeedbackAction: () => false,
    getTrustedLocalHandoffRuntimeController: () => null,
    getOriginHandoffSourceOrigin: () => "",
    setOriginHandoffSourceOrigin() {},
    setRuntimeClientIdentityCreatedOnThisOrigin() {},
    collaboratorSetters: {
      someCollaborator() {
        throw new Error("setter should not run for invalid overrides");
      }
    }
  });

  helperAssembly.installTestHooks();
  helperAssembly.setCollaborators(null);
  helperAssembly.setCollaborators("invalid");

  assert.equal(typeof helperAssembly.installTestHooks, "function");
  assert.equal(typeof helperAssembly.setCollaborators, "function");
});
