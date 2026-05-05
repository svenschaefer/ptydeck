import { createAppRuntimeTrustedLocalComposition as defaultCreateAppRuntimeTrustedLocalComposition } from "./app-runtime-trusted-local-composition.js";
import { createBroadcastInputRuntimeController as defaultCreateBroadcastInputRuntimeController } from "./broadcast-input-runtime-controller.js";
import { createPasteObservationRuntimeController as defaultCreatePasteObservationRuntimeController } from "./paste-observation-runtime-controller.js";
import { createSendHistoryRuntimeController as defaultCreateSendHistoryRuntimeController } from "./send-history-runtime-controller.js";
import { createWorkspaceManagerRuntimeController as defaultCreateWorkspaceManagerRuntimeController } from "./workspace-manager-runtime-controller.js";

function createNoopStore() {
  return {
    getState() {
      return {
        sessions: [],
        activeSessionId: "",
        activeDeckId: ""
      };
    }
  };
}

function resolveStateArray(state, key) {
  return state && Array.isArray(state[key]) ? state[key] : [];
}

function resolveActiveSessionFromState(store) {
  const state = store?.getState?.() || {};
  const sessions = resolveStateArray(state, "sessions");
  const activeSessionId = String(state.activeSessionId || "").trim();
  if (!activeSessionId) {
    return null;
  }
  return sessions.find((session) => String(session?.id || "").trim() === activeSessionId) || null;
}

function resolveSessionByIdFromState(store, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return null;
  }
  const state = store?.getState?.() || {};
  const sessions = resolveStateArray(state, "sessions");
  return sessions.find((session) => String(session?.id || "").trim() === normalizedSessionId) || null;
}

export function createAppRuntimeOperatorSupportAssembly(options = {}) {
  const createWorkspaceManagerRuntimeController =
    typeof options.createWorkspaceManagerRuntimeController === "function"
      ? options.createWorkspaceManagerRuntimeController
      : defaultCreateWorkspaceManagerRuntimeController;
  const createSendHistoryRuntimeController =
    typeof options.createSendHistoryRuntimeController === "function"
      ? options.createSendHistoryRuntimeController
      : defaultCreateSendHistoryRuntimeController;
  const createAppRuntimeTrustedLocalComposition =
    typeof options.createAppRuntimeTrustedLocalComposition === "function"
      ? options.createAppRuntimeTrustedLocalComposition
      : defaultCreateAppRuntimeTrustedLocalComposition;
  const createPasteObservationRuntimeController =
    typeof options.createPasteObservationRuntimeController === "function"
      ? options.createPasteObservationRuntimeController
      : defaultCreatePasteObservationRuntimeController;
  const createBroadcastInputRuntimeController =
    typeof options.createBroadcastInputRuntimeController === "function"
      ? options.createBroadcastInputRuntimeController
      : defaultCreateBroadcastInputRuntimeController;

  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createNoopStore();
  const commandInput = options.commandInput || null;

  const getActiveSession =
    typeof options.getActiveSession === "function"
      ? options.getActiveSession
      : () => resolveActiveSessionFromState(store);
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId) => resolveSessionByIdFromState(store, sessionId);

  const workspaceManagerRuntimeController = createWorkspaceManagerRuntimeController({
    dialogEl: options.dialogEl || null,
    openBtn: options.openBtn || null,
    closeBtn: options.closeBtn || null,
    metaEl: options.metaEl || null,
    connectionsTabBtn: options.connectionsTabBtn || null,
    workspaceTabBtn: options.workspaceTabBtn || null,
    connectionsPanelEl: options.connectionsPanelEl || null,
    workspacePanelEl: options.workspacePanelEl || null,
    connectionSelectEl: options.connectionSelectEl || null,
    workspacePresetSelectEl: options.workspacePresetSelectEl || null,
    workspaceGroupSelectEl: options.workspaceGroupSelectEl || null,
    connectionSummaryEl: options.connectionSummaryEl || null,
    workspacePresetSummaryEl: options.workspacePresetSummaryEl || null,
    workspaceGroupSummaryEl: options.workspaceGroupSummaryEl || null,
    getConnectionProfileRuntimeController: options.getConnectionProfileRuntimeController,
    getWorkspacePresetRuntimeController: options.getWorkspacePresetRuntimeController,
    getActiveDeckId:
      typeof options.getActiveDeckId === "function"
        ? options.getActiveDeckId
        : () => String(store?.getState?.().activeDeckId || options.defaultDeckId || "")
  });

  const sendHistoryRuntimeController = createSendHistoryRuntimeController({
    windowRef,
    documentRef,
    localStorageRef: options.localStorageRef || windowRef?.localStorage || null,
    dialogEl: options.sendHistoryDialogEl || null,
    openBtn: options.sendHistoryOpenBtn || null,
    closeBtn: options.sendHistoryCloseBtn || null,
    switchSessionBtn: options.sendHistorySwitchSessionBtn || null,
    metaEl: options.sendHistoryMetaEl || null,
    searchInputEl: options.sendHistorySearchInputEl || null,
    deleteSelectedBtn: options.sendHistoryDeleteSelectedBtn || null,
    clearSessionBtn: options.sendHistoryClearSessionBtn || null,
    emptyEl: options.sendHistoryEmptyEl || null,
    listEl: options.sendHistoryListEl || null,
    detailMetaEl: options.sendHistoryDetailMetaEl || null,
    detailTextEl: options.sendHistoryDetailTextEl || null,
    useBtn: options.sendHistoryUseBtn || null,
    getActiveSession,
    getSessionById,
    formatSessionToken: options.formatSessionToken,
    formatSessionDisplayName: options.formatSessionDisplayName,
    getCommandValue: () => String(commandInput?.value || ""),
    setCommandValue: (value) => {
      if (commandInput) {
        commandInput.value = value;
      }
    },
    focusCommandInput: () => {
      commandInput?.focus?.();
      const value = String(commandInput?.value || "");
      commandInput?.setSelectionRange?.(value.length, value.length);
    },
    confirmAction: options.confirmAction,
    scheduleCommandPreview: options.scheduleCommandPreview,
    scheduleCommandSuggestions: options.scheduleCommandSuggestions,
    requestRender: options.requestRender
  });

  const {
    trustedLocalLayoutRuntimeController = null,
    trustedLocalHandoffRuntimeController = null
  } = createAppRuntimeTrustedLocalComposition({
    windowRef,
    localStorageRef: options.localStorageRef || windowRef?.localStorage || null,
    captureCurrentLayout: options.captureCurrentLayout,
    applyLayoutSnapshot: options.applyLayoutSnapshot,
    promptEl: options.promptEl || null,
    promptMessageEl: options.promptMessageEl || null,
    promptYesBtn: options.promptYesBtn || null,
    promptNoBtn: options.promptNoBtn || null,
    openBtn: options.trustedLocalControlOpenBtn || null,
    dialogEl: options.trustedLocalControlDialogEl || null,
    dialogMetaEl: options.trustedLocalControlMetaEl || null,
    dialogCloseBtn: options.trustedLocalControlCloseBtn || null,
    dialogTakeAllBtn: options.trustedLocalControlTakeAllBtn || null,
    dialogTakeDeckBtn: options.trustedLocalControlTakeDeckBtn || null,
    dialogTakeSessionBtn: options.trustedLocalControlTakeSessionBtn || null,
    getState:
      typeof options.getState === "function" ? options.getState : () => store?.getState?.() || {},
    getSessionById,
    getActiveDeck: options.getActiveDeck,
    getActiveDeckId:
      typeof options.getActiveDeckId === "function"
        ? options.getActiveDeckId
        : () => String(store?.getState?.().activeDeckId || options.defaultDeckId || ""),
    resolveSessionDeckId: options.resolveSessionDeckId,
    resolveDeckName: options.resolveDeckName,
    formatSessionToken: options.formatSessionToken,
    formatSessionDisplayName: options.formatSessionDisplayName,
    canTakeSessionControl: options.canTakeSessionControl,
    isReadOnlyMode: options.isReadOnlyMode,
    getRuntimeClientId: options.getRuntimeClientId,
    takeSessionControl: options.takeSessionControl,
    takeSessionControlScope: options.takeSessionControlScope,
    applyRuntimeEvent: options.applyRuntimeEvent,
    setCommandFeedback: options.setCommandFeedback,
    setError: options.setError,
    getErrorMessage: options.getErrorMessage,
    requestRender: options.requestRender
  });

  const pasteObservationRuntimeController = createPasteObservationRuntimeController({
    windowRef,
    panelEl: options.pasteObservationEl || null,
    summaryEl: options.pasteObservationSummaryEl || null,
    detailEl: options.pasteObservationDetailEl || null,
    continueBtn: options.pasteObservationContinueBtn || null,
    getActiveSession,
    getSessionById,
    formatSessionToken: options.formatSessionToken,
    formatSessionDisplayName: options.formatSessionDisplayName,
    requestContinuePaste: options.requestContinuePaste,
    showCommandUi: options.showCommandUi
  });

  const broadcastInputRuntimeController = createBroadcastInputRuntimeController({
    getActiveDeckId:
      typeof options.getActiveDeckId === "function"
        ? options.getActiveDeckId
        : () => String(store?.getState?.().activeDeckId || options.defaultDeckId || ""),
    getSessions:
      typeof options.getSessions === "function"
        ? options.getSessions
        : () => resolveStateArray(store?.getState?.() || {}, "sessions"),
    resolveSessionDeckId: options.resolveSessionDeckId,
    sortSessionsByQuickId: options.sortSessionsByQuickId,
    listGroupsForDeck: options.listGroupsForDeck,
    getActiveGroupIdForDeck: options.getActiveGroupIdForDeck,
    applyGroupLocally: options.applyGroupLocally
  });

  return {
    workspaceManagerRuntimeController,
    sendHistoryRuntimeController,
    trustedLocalLayoutRuntimeController,
    trustedLocalHandoffRuntimeController,
    pasteObservationRuntimeController,
    broadcastInputRuntimeController
  };
}
