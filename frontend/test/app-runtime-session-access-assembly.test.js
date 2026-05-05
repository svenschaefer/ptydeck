import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeSessionAccessAssembly } from "../src/public/app-runtime-session-access-assembly.js";

test("app runtime session access assembly delegates session-control wiring and feedback action handling", async () => {
  let capturedControlOptions = null;
  let handledSessionId = null;
  const uiState = { commandFeedbackActionSessionId: "s-1" };
  const sessions = [{ id: "s-1" }];
  const sessionControlRuntimeController = {
    setAccessState(payload) {
      return payload;
    },
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
      return "blocked";
    },
    canTakeSessionControl() {
      return true;
    },
    setRuntimeClientId() {},
    getRuntimeClientId() {
      return "client-local";
    },
    renameTrustedLocalDevice(sessionId, label) {
      return { sessionId, label };
    },
    showBlockedWriteReclaimUi() {
      return "reclaim-ui";
    },
    renderSessionControl() {
      return "<button>Take Control</button>";
    },
    maybeRedirectToCanonicalOrigin() {
      return true;
    },
    maybeAutoRepairOriginHandoffControl() {
      return Promise.resolve("repaired");
    },
    handleCommandFeedbackAction(sessionId) {
      handledSessionId = sessionId;
      return Promise.resolve("retried");
    }
  };
  const sessionQuickSendRuntimeController = { id: "quick-send" };

  const assembly = createAppRuntimeSessionAccessAssembly({
    uiState,
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "1" : "?"),
    formatSessionDisplayName: (session) => session?.name || session?.id || "",
    takeSessionControlScope: async (scope, payload) => ({ scope, payload }),
    renameTrustedLocalClientIdentity: (label) => ({ label }),
    retryBlockedAction: async (retryAction) => retryAction,
    applyResizeForSession: (sessionId, resize) => ({ sessionId, resize }),
    showControlPane: () => "shown",
    createSessionControlRuntimeController(options) {
      capturedControlOptions = options;
      return sessionControlRuntimeController;
    },
    createSessionQuickSendRuntimeController() {
      return sessionQuickSendRuntimeController;
    }
  });

  assert.equal(assembly.sessionControlRuntimeController, sessionControlRuntimeController);
  assert.equal(assembly.sessionQuickSendRuntimeController, sessionQuickSendRuntimeController);
  assert.equal(capturedControlOptions.uiState, uiState);
  assert.deepEqual(capturedControlOptions.getSessions(), sessions);
  assert.equal(capturedControlOptions.getSessionById("s-1")?.id, "s-1");
  assert.equal(capturedControlOptions.formatSessionToken("s-1"), "1");
  assert.equal(capturedControlOptions.formatSessionDisplayName({ id: "s-1", name: "Ops" }), "Ops");
  assert.equal(assembly.isReadOnlyMode(), true);
  assert.equal(assembly.getReadOnlyModeMessage(), "Read-only.");
  assert.equal(assembly.canWriteToSession({ id: "s-1" }), false);
  assert.equal(assembly.getSessionWriteBlockMessage({ id: "s-1" }), "blocked");
  assert.equal(assembly.canTakeSessionControl({ id: "s-1" }), true);
  assert.deepEqual(assembly.renameTrustedLocalDevice("s-1", "Laptop"), { sessionId: "s-1", label: "Laptop" });
  assert.equal(assembly.showBlockedWriteReclaimUi(), "reclaim-ui");
  assert.equal(assembly.renderSessionControl(), "<button>Take Control</button>");
  assert.equal(assembly.maybeRedirectToCanonicalOrigin(), true);
  assert.equal(await assembly.maybeAutoRepairOriginHandoffControl(), "repaired");
  assert.equal(await assembly.handleCommandFeedbackAction(), "retried");
  assert.equal(handledSessionId, "s-1");
});

test("app runtime session access assembly wires quick-send with session-control access guards and deck fallback", async () => {
  let capturedQuickSendOptions = null;
  const state = {
    sessions: [{ id: "s-1", deckId: "ops" }],
    decks: [{ id: "ops", name: "Ops" }]
  };
  const commands = [{ lookupKey: "deploy", name: "deploy" }];
  const apiCalls = [];
  const recordedSubmissions = [];
  const sessionControlRuntimeController = {
    setAccessState() {},
    isReadOnlyMode() {
      return false;
    },
    getReadOnlyModeMessage() {
      return "Read-only.";
    },
    canWriteToSession(session) {
      return session?.id === "s-1";
    },
    getSessionWriteBlockMessage() {
      return "blocked";
    },
    canTakeSessionControl() {
      return true;
    },
    setRuntimeClientId() {},
    getRuntimeClientId() {
      return "client-local";
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
      return false;
    },
    handleCommandFeedbackAction() {
      return Promise.resolve(false);
    }
  };
  const sessionQuickSendRuntimeController = { id: "quick-send" };

  createAppRuntimeSessionAccessAssembly({
    store: {
      getState() {
        return state;
      },
      recordSessionCommandSubmission(sessionId, submission) {
        recordedSubmissions.push([sessionId, submission]);
      }
    },
    api: {
      sendInput(sessionId, data, requestOptions) {
        apiCalls.push([sessionId, data, requestOptions]);
        return Promise.resolve({ ok: true });
      }
    },
    listCustomCommands: () => commands,
    getSessionById: (sessionId) => state.sessions.find((session) => session.id === sessionId) || null,
    resolveDeckForSession: () => null,
    canReadClipboardText: () => true,
    readClipboardText: async () => "clipboard",
    submitTerminalPaste: async () => ({ ok: true, status: "sent" }),
    sendInputWithConfiguredTerminator: async () => "sent",
    normalizeCustomCommandPayloadForShell: (value) => `normalized:${value}`,
    normalizeSendTerminatorMode: (value) => String(value || "auto").toLowerCase(),
    getSessionSendTerminator: () => "LF",
    isSessionActionBlocked: (session) => session?.id === "s-1",
    getBlockedSessionActionMessage: () => "blocked by policy",
    setCommandFeedback() {},
    setError() {},
    clearError() {},
    getErrorMessage: (error, fallback) => error?.message || fallback,
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "1" : "?"),
    formatSessionDisplayName: (session) => session?.name || session?.id || "",
    createSessionControlRuntimeController() {
      return sessionControlRuntimeController;
    },
    createSessionQuickSendRuntimeController(options) {
      capturedQuickSendOptions = options;
      return sessionQuickSendRuntimeController;
    }
  });

  assert.deepEqual(capturedQuickSendOptions.listCustomCommands(), commands);
  assert.equal(capturedQuickSendOptions.getSessionById("s-1")?.id, "s-1");
  assert.deepEqual(capturedQuickSendOptions.getSessions(), state.sessions);
  assert.deepEqual(capturedQuickSendOptions.resolveDeckForSession({ id: "s-1", deckId: "ops" }), {
    id: "ops",
    name: "Ops"
  });
  assert.equal(capturedQuickSendOptions.canReadClipboardText(), true);
  assert.equal(await capturedQuickSendOptions.readClipboardText(), "clipboard");
  assert.deepEqual(await capturedQuickSendOptions.submitTerminalPaste("s-1", "pwd", {}), {
    ok: true,
    status: "sent"
  });
  await capturedQuickSendOptions.apiSendInput("s-1", "pwd\n", { audit: true });
  assert.deepEqual(apiCalls, [["s-1", "pwd\n", { audit: true }]]);
  assert.equal(await capturedQuickSendOptions.sendInputWithConfiguredTerminator("s-1", "pwd"), "sent");
  assert.equal(capturedQuickSendOptions.normalizeCustomCommandPayloadForShell("pwd"), "normalized:pwd");
  assert.equal(capturedQuickSendOptions.normalizeSendTerminatorMode("LF"), "lf");
  assert.equal(capturedQuickSendOptions.getSessionSendTerminator("s-1"), "LF");
  capturedQuickSendOptions.recordCommandSubmission("s-1", { text: "pwd" });
  assert.deepEqual(recordedSubmissions, [["s-1", { text: "pwd" }]]);
  assert.equal(capturedQuickSendOptions.canWriteToSession({ id: "s-1" }), true);
  assert.equal(capturedQuickSendOptions.isSessionActionBlocked({ id: "s-1" }), true);
  assert.equal(capturedQuickSendOptions.getBlockedSessionActionMessage([{ id: "s-1" }], "Quick send"), "blocked by policy");
  assert.equal(capturedQuickSendOptions.isReadOnlyMode(), false);
  assert.equal(capturedQuickSendOptions.getReadOnlyModeMessage(), "Read-only.");
  assert.equal(capturedQuickSendOptions.getSessionWriteBlockedMessage({ id: "s-2" }), "blocked");
  assert.equal(capturedQuickSendOptions.formatSessionToken("s-1"), "1");
  assert.equal(capturedQuickSendOptions.formatSessionDisplayName({ id: "s-1", name: "Ops" }), "Ops");
});
