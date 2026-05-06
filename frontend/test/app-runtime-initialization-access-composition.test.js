import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeInitializationAccessComposition } from "../src/public/app-runtime-initialization-access-composition.js";

test("app runtime initialization/access composition wires state, command-ui, and session-access seams in order", () => {
  const captured = {
    stateOptions: null,
    uiOptions: null,
    accessOptions: null
  };
  const forwarded = {
    feedback: [],
    errors: [],
    clearedFeedback: [],
    feedbackActions: [],
    clearedErrors: 0,
    renders: 0,
    bootstrapFallbacks: 0,
    bootstrapTokens: [],
    retries: []
  };
  const store = {
    getState() {
      return {
        sessions: [{ id: "s-1" }],
        decks: [{ id: "default", name: "Default" }]
      };
    },
    recordSessionCommandSubmission() {}
  };
  const authBootstrapRuntimeController = {
    hasBootstrapInFlight() {
      return true;
    },
    bootstrapRuntimeFallback() {
      forwarded.bootstrapFallbacks += 1;
      return "fallback";
    },
    bootstrapDevAuthToken(runtimeOptions) {
      forwarded.bootstrapTokens.push(runtimeOptions);
      return runtimeOptions?.ok === true;
    }
  };
  const stateController = {
    clearCommandFeedbackAction(runtimeOptions) {
      forwarded.clearedFeedback.push(runtimeOptions);
    },
    setCommandFeedbackAction(nextState) {
      forwarded.feedbackActions.push(nextState);
    },
    clearError() {
      forwarded.clearedErrors += 1;
    }
  };
  const uiFacadeController = {
    render() {
      forwarded.renders += 1;
    },
    setCommandFeedback(message) {
      forwarded.feedback.push(message);
    },
    setError(message) {
      forwarded.errors.push(message);
    },
    getErrorMessage(_error, fallback) {
      return `wrapped:${fallback}`;
    }
  };
  const accessAssembly = {
    sessionControlRuntimeController: { id: "control" },
    sessionQuickSendRuntimeController: { id: "quick-send" },
    setAccessState() {},
    isReadOnlyMode() {
      return false;
    },
    getReadOnlyModeMessage() {
      return "read-only";
    },
    canWriteToSession() {
      return true;
    },
    getSessionWriteBlockMessage() {
      return "blocked";
    },
    canTakeSessionControl() {
      return true;
    },
    setRuntimeClientId() {},
    getRuntimeClientId() {
      return "runtime-client";
    },
    renameTrustedLocalDevice() {},
    showBlockedWriteReclaimUi(session, runtimeOptions) {
      forwarded.retries.push({ session, runtimeOptions });
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

  const result = createAppRuntimeInitializationAccessComposition({
    windowRef: { location: { href: "https://ptydeck.local" } },
    documentRef: { body: {} },
    config: { canonicalOrigin: "https://ptydeck.local" },
    uiState: { error: "" },
    startupPerf: { appStartAtMs: 1 },
    nowMs: () => 42,
    wsBootstrapFallbackMs: 250,
    debugLog: () => {},
    terminalSearchState: { query: "" },
    store,
    getAuthBootstrapRuntimeController: () => authBootstrapRuntimeController,
    getTerminalSearchController: () => ({ id: "search" }),
    getCommandComposerAutocompleteController: () => ({ id: "autocomplete" }),
    getCommandComposerRuntimeController: () => ({ id: "composer" }),
    getCommandTargetRuntimeController: () => ({ id: "target" }),
    getSessionGridController: () => ({ id: "grid" }),
    getConnectionProfileRuntimeController: () => ({ id: "connection" }),
    getControlPaneRuntimeController: () => ({ id: "control-pane" }),
    getWorkspacePresetRuntimeController: () => ({ id: "workspace-preset" }),
    getWorkspaceManagerRuntimeController: () => ({ id: "workspace-manager" }),
    getSendHistoryRuntimeController: () => ({ id: "history" }),
    getTrustedLocalHandoffRuntimeController: () => ({ id: "handoff" }),
    getPasteObservationRuntimeController: () => ({ id: "paste" }),
    getCommandExecutor: () => ({ id: "executor" }),
    api: { sendInput() {} },
    getSessions: () => [{ id: "s-1" }],
    getSessionById: (sessionId) => ({ id: sessionId }),
    formatSessionToken: (sessionId) => `#${sessionId}`,
    formatSessionDisplayName: (session) => session?.id || "",
    takeSessionControlScope: async () => ({}),
    renameTrustedLocalClientIdentity: (label) => ({ label }),
    retryBlockedAction: async (retryAction) => retryAction?.kind === "send",
    applyResizeForSession: () => {},
    showControlPane: () => {},
    listCustomCommands: () => [],
    resolveDeckForSession: () => ({ id: "default", name: "Default" }),
    canReadClipboardText: () => true,
    readClipboardText: async () => "",
    submitTerminalPaste: async () => ({ ok: true }),
    apiSendInput: async () => ({}),
    sendInputWithConfiguredTerminator: async () => ({}),
    normalizeCustomCommandPayloadForShell: (value) => String(value || ""),
    normalizeSendTerminatorMode: () => "auto",
    getSessionSendTerminator: () => "auto",
    delayedSubmitMs: 90,
    recordCommandSubmission: () => {},
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "",
    defaultDeckId: "default",
    createAppRuntimeStateController(options) {
      captured.stateOptions = options;
      return stateController;
    },
    createAppCommandUiFacadeController(options) {
      captured.uiOptions = options;
      return uiFacadeController;
    },
    createAppRuntimeSessionAccessAssembly(options) {
      captured.accessOptions = options;
      return accessAssembly;
    }
  });

  assert.equal(result.appRuntimeStateController, stateController);
  assert.equal(result.appCommandUiFacadeController, uiFacadeController);
  assert.equal(result.sessionControlRuntimeController, accessAssembly.sessionControlRuntimeController);
  assert.equal(result.sessionQuickSendRuntimeController, accessAssembly.sessionQuickSendRuntimeController);
  assert.equal(captured.stateOptions.uiState.error, "");
  assert.equal(captured.stateOptions.startupPerf.appStartAtMs, 1);
  assert.equal(captured.stateOptions.hasBootstrapInFlight(), true);
  assert.equal(captured.stateOptions.runBootstrapFallback(), "fallback");
  assert.equal(captured.stateOptions.runBootstrapDevAuthToken({ ok: true }), true);
  assert.deepEqual(forwarded.bootstrapTokens, [{ ok: true }]);
  captured.stateOptions.requestRender();
  assert.equal(forwarded.renders, 1);

  assert.equal(captured.uiOptions.getAppRuntimeStateController(), stateController);
  assert.equal(captured.uiOptions.getTerminalSearchController().id, "search");
  assert.equal(captured.uiOptions.getCommandExecutor().id, "executor");
  assert.equal(captured.accessOptions.getErrorMessage(new Error("ignored"), "fallback"), "wrapped:fallback");
  captured.accessOptions.setCommandFeedback("Saved.");
  captured.accessOptions.setError("Failed.");
  captured.accessOptions.clearCommandFeedbackAction({ reason: "done" });
  captured.accessOptions.setCommandFeedbackAction({ label: "Retry" });
  captured.accessOptions.clearError();
  assert.deepEqual(forwarded.feedback, ["Saved."]);
  assert.deepEqual(forwarded.errors, ["Failed."]);
  assert.deepEqual(forwarded.clearedFeedback, [{ reason: "done" }]);
  assert.deepEqual(forwarded.feedbackActions, [{ label: "Retry" }]);
  assert.equal(forwarded.clearedErrors, 1);

  assert.equal(result.renderSessionControl(), "rendered");
  assert.equal(result.getRuntimeClientId(), "runtime-client");
  assert.equal(result.showBlockedWriteReclaimUi({ id: "s-1" }, { retryAction: { kind: "send" } }), true);
  assert.deepEqual(forwarded.retries, [{ session: { id: "s-1" }, runtimeOptions: { retryAction: { kind: "send" } } }]);
});

test("app runtime initialization/access composition falls back safely when optional collaborators are missing", () => {
  const result = createAppRuntimeInitializationAccessComposition({
    createAppRuntimeStateController() {
      return {
        clearCommandFeedbackAction() {},
        setCommandFeedbackAction() {},
        clearError() {}
      };
    },
    createAppCommandUiFacadeController() {
      return {
        render() {},
        setCommandFeedback() {},
        setError() {},
        getErrorMessage(_error, fallback) {
          return fallback;
        }
      };
    },
    createAppRuntimeSessionAccessAssembly() {
      return {
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
          return null;
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

  assert.equal(result.isReadOnlyMode(), true);
  assert.equal(result.getReadOnlyModeMessage(), "Read-only.");
  assert.equal(result.canWriteToSession(), false);
  assert.equal(result.getSessionWriteBlockMessage(), "Blocked.");
  assert.equal(result.showBlockedWriteReclaimUi(), false);
  assert.equal(result.renderSessionControl(), "");
});
