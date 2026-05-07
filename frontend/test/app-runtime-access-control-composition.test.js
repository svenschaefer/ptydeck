import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeAccessControlComposition } from "../src/public/app-runtime-access-control-composition.js";

test("app runtime access-control composition forwards the initialization contract and collaborator setters deterministically", () => {
  const captured = {
    options: null,
    assigned: {}
  };
  const returnedAssembly = {
    appRuntimeStateController: { id: "state" },
    appCommandUiFacadeController: { id: "command-ui" },
    sessionControlRuntimeController: { id: "session-control" },
    sessionQuickSendRuntimeController: { id: "quick-send" },
    setAccessState() {},
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
    setRuntimeClientId() {},
    getRuntimeClientId() {
      return "runtime-client";
    },
    renameTrustedLocalDevice() {
      return true;
    },
    showBlockedWriteReclaimUi() {
      return true;
    },
    renderSessionControl() {
      return "rendered";
    },
    maybeRedirectToCanonicalOrigin() {
      return false;
    },
    maybeAutoRepairOriginHandoffControl() {
      return Promise.resolve(true);
    },
    handleCommandFeedbackAction() {
      return Promise.resolve(true);
    }
  };

  const result = createAppRuntimeAccessControlComposition({
    windowRef: { location: { href: "https://ptydeck.local" } },
    documentRef: { body: {} },
    config: { canonicalOrigin: "https://ptydeck.local" },
    uiState: { accessMode: "operator" },
    startupPerf: { appStartAtMs: 1 },
    nowMs: () => 42,
    wsBootstrapFallbackMs: 250,
    debugLog: () => {},
    terminalSearchState: { query: "ssh" },
    store: { getState: () => ({ sessions: [], decks: [] }) },
    api: { sendInput() {} },
    testHooks: {},
    streamAdapter: { id: "stream" },
    getAppRuntimeStateController: () => ({ id: "state-getter" }),
    getAppCommandUiFacadeController: () => ({ id: "ui-getter" }),
    getAuthBootstrapRuntimeController: () => ({ id: "auth" }),
    getTerminalSearchController: () => ({ id: "search" }),
    getCommandComposerAutocompleteController: () => ({ id: "autocomplete" }),
    getCommandComposerRuntimeController: () => ({ id: "composer" }),
    getCommandTargetRuntimeController: () => ({ id: "target" }),
    getSessionGridController: () => ({ id: "grid" }),
    getConnectionProfileRuntimeController: () => ({ id: "connection" }),
    getControlPaneRuntimeController: () => ({ id: "pane" }),
    getWorkspacePresetRuntimeController: () => ({ id: "preset" }),
    getWorkspaceManagerRuntimeController: () => ({ id: "workspace" }),
    getSendHistoryRuntimeController: () => ({ id: "history" }),
    getTrustedLocalHandoffRuntimeController: () => ({ id: "handoff" }),
    getPasteObservationRuntimeController: () => ({ id: "paste" }),
    getCommandExecutor: () => ({ id: "executor" }),
    getSessions: () => [{ id: "s-1" }],
    getSessionById: (sessionId) => ({ id: sessionId }),
    formatSessionToken: (sessionId) => `#${sessionId}`,
    formatSessionDisplayName: (session) => session.id,
    takeSessionControlScope: () => Promise.resolve({ ok: true }),
    renameTrustedLocalClientIdentity: (label) => label,
    retryBlockedAction: () => Promise.resolve(true),
    applyResizeForSession: () => {},
    showControlPane: () => {},
    listCustomCommands: () => [],
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    canReadClipboardText: () => true,
    readClipboardText: () => Promise.resolve("pwd"),
    submitTerminalPaste: () => Promise.resolve({ ok: true }),
    apiSendInput: () => Promise.resolve({ ok: true }),
    sendInputWithConfiguredTerminator: () => Promise.resolve({ ok: true }),
    normalizeCustomCommandPayloadForShell: (value) => String(value || ""),
    normalizeSendTerminatorMode: () => "auto",
    getSessionSendTerminator: () => "auto",
    delayedSubmitMs: 90,
    recordCommandSubmission: () => {},
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    defaultDeckId: "default",
    getInitializationErrorMessage: () => "bootstrap failed",
    getOriginHandoffSourceOrigin: () => "https://source.local",
    setOriginHandoffSourceOrigin: (value) => {
      captured.assigned.origin = value;
    },
    setRuntimeClientIdentityCreatedOnThisOrigin: (value) => {
      captured.assigned.createdOnOrigin = value;
    },
    normalizeCommandFeedbackActionSessionId: (sessionId) => String(sessionId || "").trim(),
    setAppSessionRuntimeFacadeController: (value) => {
      captured.assigned.sessionFacade = value;
    },
    setAppRuntimeStateController: (value) => {
      captured.assigned.runtimeState = value;
    },
    setAppCommandUiFacadeController: (value) => {
      captured.assigned.commandUi = value;
    },
    setTrustedLocalHandoffRuntimeController: (value) => {
      captured.assigned.handoff = value;
    },
    setCommandComposerRuntimeController: (value) => {
      captured.assigned.commandComposer = value;
    },
    setSessionTerminalResizeController: (value) => {
      captured.assigned.resize = value;
    },
    setControlPaneRuntimeController: (value) => {
      captured.assigned.controlPane = value;
    },
    createAppRuntimeAccessControlAssembly(options) {
      captured.options = options;
      return returnedAssembly;
    }
  });

  assert.equal(captured.options.initializationAccessOptions.windowRef.location.href, "https://ptydeck.local");
  assert.equal(captured.options.initializationAccessOptions.getCommandExecutor().id, "executor");
  assert.equal(captured.options.getInitializationErrorMessage(), "bootstrap failed");
  assert.equal(captured.options.getOriginHandoffSourceOrigin(), "https://source.local");
  assert.equal(captured.options.normalizeCommandFeedbackActionSessionId(" s-1 "), "s-1");

  captured.options.collaboratorSetters.appSessionRuntimeFacadeController({ id: "session-facade" });
  captured.options.collaboratorSetters.appRuntimeStateController({ id: "runtime-state" });
  captured.options.collaboratorSetters.appCommandUiFacadeController({ id: "command-ui" });
  captured.options.collaboratorSetters.trustedLocalHandoffRuntimeController({ id: "handoff" });
  captured.options.collaboratorSetters.commandComposerRuntimeController({ id: "composer" });
  captured.options.collaboratorSetters.sessionTerminalResizeController({ id: "resize" });
  captured.options.collaboratorSetters.controlPaneRuntimeController({ id: "control-pane" });
  captured.options.setOriginHandoffSourceOrigin("https://target.local");
  captured.options.setRuntimeClientIdentityCreatedOnThisOrigin(true);

  assert.deepEqual(captured.assigned, {
    sessionFacade: { id: "session-facade" },
    runtimeState: { id: "runtime-state" },
    commandUi: { id: "command-ui" },
    handoff: { id: "handoff" },
    commandComposer: { id: "composer" },
    resize: { id: "resize" },
    controlPane: { id: "control-pane" },
    origin: "https://target.local",
    createdOnOrigin: true
  });

  assert.equal(result.appRuntimeAccessControlAssembly, returnedAssembly);
  assert.equal(result.appRuntimeStateController, returnedAssembly.appRuntimeStateController);
  assert.equal(result.appCommandUiFacadeController, returnedAssembly.appCommandUiFacadeController);
  assert.equal(result.sessionControlRuntimeController, returnedAssembly.sessionControlRuntimeController);
  assert.equal(result.sessionQuickSendRuntimeController, returnedAssembly.sessionQuickSendRuntimeController);
  assert.equal(result.renderSessionControl(), "rendered");
  assert.equal(result.getRuntimeClientId(), "runtime-client");
});

test("app runtime access-control composition fails closed for missing optional callbacks", () => {
  const result = createAppRuntimeAccessControlComposition({
    createAppRuntimeAccessControlAssembly(options) {
      options.collaboratorSetters.appRuntimeStateController({ id: "state" });
      options.collaboratorSetters.controlPaneRuntimeController({ id: "pane" });
      return {
        appRuntimeStateController: { id: "state" },
        appCommandUiFacadeController: { id: "ui" },
        sessionControlRuntimeController: null,
        sessionQuickSendRuntimeController: null,
        setAccessState() {},
        isReadOnlyMode() {
          return true;
        },
        getReadOnlyModeMessage() {
          return "Read-only.";
        },
        canWriteToSession() {
          return false;
        },
        getSessionWriteBlockMessage() {
          return "Blocked.";
        },
        canTakeSessionControl() {
          return false;
        },
        setRuntimeClientId() {},
        getRuntimeClientId() {
          return "";
        },
        renameTrustedLocalDevice() {
          return false;
        },
        showBlockedWriteReclaimUi() {
          return false;
        },
        renderSessionControl() {
          return "";
        },
        maybeRedirectToCanonicalOrigin() {
          return false;
        },
        maybeAutoRepairOriginHandoffControl() {
          return Promise.resolve(false);
        },
        handleCommandFeedbackAction() {
          return Promise.resolve(false);
        }
      };
    }
  });

  assert.equal(result.appRuntimeStateController.id, "state");
  assert.equal(result.appCommandUiFacadeController.id, "ui");
  assert.equal(result.sessionControlRuntimeController, null);
  assert.equal(result.renderSessionControl(), "");
  assert.equal(result.isReadOnlyMode(), true);
});
