import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeOperatorSupportAssembly } from "../src/public/app-runtime-operator-support-assembly.js";

test("app runtime operator support assembly wires workspace, trusted-local, send-history, paste, and broadcast controllers", () => {
  const state = {
    activeDeckId: "ops",
    activeSessionId: "s-1",
    sessions: [
      { id: "s-1", deckId: "ops", name: "Alpha" },
      { id: "s-2", deckId: "infra", name: "Beta" }
    ]
  };
  const commandInput = {
    value: "",
    focusCalls: 0,
    selectionRanges: [],
    focus() {
      this.focusCalls += 1;
    },
    setSelectionRange(start, end) {
      this.selectionRanges.push([start, end]);
    }
  };

  let workspaceArgs = null;
  let sendHistoryArgs = null;
  let trustedLocalArgs = null;
  let pasteArgs = null;
  let broadcastArgs = null;

  const workspaceManagerRuntimeController = { id: "workspace" };
  const sendHistoryRuntimeController = { id: "history" };
  const trustedLocalLayoutRuntimeController = { id: "layout" };
  const trustedLocalHandoffRuntimeController = { id: "handoff" };
  const pasteObservationRuntimeController = { id: "paste" };
  const broadcastInputRuntimeController = { id: "broadcast" };

  const assembly = createAppRuntimeOperatorSupportAssembly({
    windowRef: { localStorage: { kind: "local-storage" } },
    store: {
      getState() {
        return state;
      }
    },
    commandInput,
    dialogEl: { id: "workspace-dialog" },
    openBtn: { id: "workspace-open" },
    closeBtn: { id: "workspace-close" },
    metaEl: { id: "workspace-meta" },
    connectionsTabBtn: { id: "connections-tab" },
    workspaceTabBtn: { id: "workspace-tab" },
    connectionsPanelEl: { id: "connections-panel" },
    workspacePanelEl: { id: "workspace-panel" },
    connectionSelectEl: { id: "connection-select" },
    workspacePresetSelectEl: { id: "preset-select" },
    workspaceGroupSelectEl: { id: "group-select" },
    connectionSummaryEl: { id: "connection-summary" },
    workspacePresetSummaryEl: { id: "preset-summary" },
    workspaceGroupSummaryEl: { id: "group-summary" },
    getConnectionProfileRuntimeController: () => ({ id: "connection-profile" }),
    getWorkspacePresetRuntimeController: () => ({ id: "workspace-preset" }),
    sendHistoryDialogEl: { id: "send-history-dialog" },
    sendHistoryOpenBtn: { id: "send-history-open" },
    sendHistoryCloseBtn: { id: "send-history-close" },
    sendHistorySwitchSessionBtn: { id: "send-history-switch" },
    sendHistoryMetaEl: { id: "send-history-meta" },
    sendHistorySearchInputEl: { id: "send-history-search" },
    sendHistoryDeleteSelectedBtn: { id: "send-history-delete-selected" },
    sendHistoryClearSessionBtn: { id: "send-history-clear" },
    sendHistoryEmptyEl: { id: "send-history-empty" },
    sendHistoryListEl: { id: "send-history-list" },
    sendHistoryDetailMetaEl: { id: "send-history-detail-meta" },
    sendHistoryDetailTextEl: { id: "send-history-detail-text" },
    sendHistoryUseBtn: { id: "send-history-use" },
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "1" : "2"),
    formatSessionDisplayName: (session) => session?.name || session?.id || "",
    confirmAction: () => Promise.resolve(true),
    scheduleCommandPreview: () => "preview",
    scheduleCommandSuggestions: () => "suggestions",
    requestRender: () => "rendered",
    captureCurrentLayout: () => ({ split: true }),
    applyLayoutSnapshot: () => "layout-applied",
    promptEl: { id: "prompt" },
    promptMessageEl: { id: "prompt-message" },
    promptYesBtn: { id: "prompt-yes" },
    promptNoBtn: { id: "prompt-no" },
    trustedLocalControlOpenBtn: { id: "trusted-open" },
    trustedLocalControlDialogEl: { id: "trusted-dialog" },
    trustedLocalControlMetaEl: { id: "trusted-meta" },
    trustedLocalControlCloseBtn: { id: "trusted-close" },
    trustedLocalControlTakeAllBtn: { id: "trusted-all" },
    trustedLocalControlTakeDeckBtn: { id: "trusted-deck" },
    trustedLocalControlTakeSessionBtn: { id: "trusted-session" },
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    resolveSessionDeckId: (session) => session?.deckId || "default",
    resolveDeckName: (deckId) => (deckId === "ops" ? "Ops" : deckId),
    canTakeSessionControl: () => true,
    isReadOnlyMode: () => false,
    getRuntimeClientId: () => "client-local",
    takeSessionControl: async () => ({ ok: true }),
    takeSessionControlScope: async () => ({ ok: true }),
    applyRuntimeEvent: () => true,
    setCommandFeedback: () => {},
    setError: () => {},
    getErrorMessage: (error, fallback) => error?.message || fallback,
    pasteObservationEl: { id: "paste-panel" },
    pasteObservationSummaryEl: { id: "paste-summary" },
    pasteObservationDetailEl: { id: "paste-detail" },
    pasteObservationContinueBtn: { id: "paste-continue" },
    requestContinuePaste: () => Promise.resolve({ ok: true }),
    showCommandUi: () => "shown",
    sortSessionsByQuickId: (sessions) => sessions.slice().reverse(),
    listGroupsForDeck: (deckId) => (deckId === "ops" ? [{ id: "g-1" }] : []),
    getActiveGroupIdForDeck: (deckId) => (deckId === "ops" ? "g-1" : ""),
    applyGroupLocally: (groupId, deckId) => ({ groupId, deckId }),
    createWorkspaceManagerRuntimeController(args) {
      workspaceArgs = args;
      return workspaceManagerRuntimeController;
    },
    createSendHistoryRuntimeController(args) {
      sendHistoryArgs = args;
      return sendHistoryRuntimeController;
    },
    createAppRuntimeTrustedLocalComposition(args) {
      trustedLocalArgs = args;
      return {
        trustedLocalLayoutRuntimeController,
        trustedLocalHandoffRuntimeController
      };
    },
    createPasteObservationRuntimeController(args) {
      pasteArgs = args;
      return pasteObservationRuntimeController;
    },
    createBroadcastInputRuntimeController(args) {
      broadcastArgs = args;
      return broadcastInputRuntimeController;
    }
  });

  assert.equal(assembly.workspaceManagerRuntimeController, workspaceManagerRuntimeController);
  assert.equal(assembly.sendHistoryRuntimeController, sendHistoryRuntimeController);
  assert.equal(assembly.trustedLocalLayoutRuntimeController, trustedLocalLayoutRuntimeController);
  assert.equal(assembly.trustedLocalHandoffRuntimeController, trustedLocalHandoffRuntimeController);
  assert.equal(assembly.pasteObservationRuntimeController, pasteObservationRuntimeController);
  assert.equal(assembly.broadcastInputRuntimeController, broadcastInputRuntimeController);

  assert.equal(workspaceArgs.getActiveDeckId(), "ops");
  assert.equal(sendHistoryArgs.getActiveSession()?.id, "s-1");
  assert.equal(sendHistoryArgs.getSessionById("s-2")?.id, "s-2");
  sendHistoryArgs.setCommandValue("ls -la");
  sendHistoryArgs.focusCommandInput();
  assert.equal(commandInput.value, "ls -la");
  assert.equal(commandInput.focusCalls, 1);
  assert.deepEqual(commandInput.selectionRanges, [[6, 6]]);
  assert.equal(trustedLocalArgs.getActiveDeckId(), "ops");
  assert.equal(trustedLocalArgs.getSessionById("s-1")?.id, "s-1");
  assert.equal(pasteArgs.getActiveSession()?.id, "s-1");
  assert.equal(pasteArgs.getSessionById("s-2")?.id, "s-2");
  assert.deepEqual(broadcastArgs.getSessions(), state.sessions);
  assert.equal(broadcastArgs.getActiveDeckId(), "ops");
  assert.deepEqual(broadcastArgs.listGroupsForDeck("ops"), [{ id: "g-1" }]);
});

test("app runtime operator support assembly fails closed for missing state and inert command inputs", () => {
  let sendHistoryArgs = null;
  let pasteArgs = null;
  let broadcastArgs = null;

  createAppRuntimeOperatorSupportAssembly({
    createWorkspaceManagerRuntimeController() {
      return {};
    },
    createSendHistoryRuntimeController(args) {
      sendHistoryArgs = args;
      return {};
    },
    createAppRuntimeTrustedLocalComposition() {
      return {};
    },
    createPasteObservationRuntimeController(args) {
      pasteArgs = args;
      return {};
    },
    createBroadcastInputRuntimeController(args) {
      broadcastArgs = args;
      return {};
    }
  });

  assert.equal(sendHistoryArgs.getActiveSession(), null);
  assert.equal(sendHistoryArgs.getSessionById("missing"), null);
  assert.equal(sendHistoryArgs.getCommandValue(), "");
  sendHistoryArgs.setCommandValue("pwd");
  sendHistoryArgs.focusCommandInput();
  assert.equal(pasteArgs.getActiveSession(), null);
  assert.equal(pasteArgs.getSessionById("missing"), null);
  assert.deepEqual(broadcastArgs.getSessions(), []);
  assert.equal(broadcastArgs.getActiveDeckId(), "");
});
