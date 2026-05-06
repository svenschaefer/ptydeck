import { createWorkspacePresetRuntimeActions } from "./workspace-preset-runtime-actions.js";
import {
  createWorkspacePresetRuntimeState,
  formatWorkspacePresetDetail,
  normalizeWorkspacePresetRecord,
  resolveWorkspaceGroupToken,
  resolveWorkspacePresetToken
} from "./workspace-preset-runtime-state.js";

export {
  formatWorkspacePresetDetail,
  normalizeWorkspacePresetRecord,
  resolveWorkspaceGroupToken,
  resolveWorkspacePresetToken
} from "./workspace-preset-runtime-state.js";

export function createWorkspacePresetRuntimeController(options = {}) {
  const api = options.api || {};
  const presetSelectEl = options.presetSelectEl || null;
  const presetSaveBtn = options.presetSaveBtn || null;
  const presetApplyBtn = options.presetApplyBtn || null;
  const presetDuplicateBtn = options.presetDuplicateBtn || null;
  const presetRenameBtn = options.presetRenameBtn || null;
  const presetDeleteBtn = options.presetDeleteBtn || null;
  const presetDeleteConfirmBtn = options.presetDeleteConfirmBtn || null;
  const presetDeleteCancelBtn = options.presetDeleteCancelBtn || null;
  const presetNameInputEl = options.presetNameInputEl || null;
  const groupSelectEl = options.groupSelectEl || null;
  const groupSaveBtn = options.groupSaveBtn || null;
  const groupApplyBtn = options.groupApplyBtn || null;
  const groupRenameBtn = options.groupRenameBtn || null;
  const groupDeleteBtn = options.groupDeleteBtn || null;
  const groupDeleteConfirmBtn = options.groupDeleteConfirmBtn || null;
  const groupDeleteCancelBtn = options.groupDeleteCancelBtn || null;
  const groupClearBtn = options.groupClearBtn || null;
  const groupNameInputEl = options.groupNameInputEl || null;
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const applyLayoutProfileById =
    typeof options.applyLayoutProfileById === "function" ? options.applyLayoutProfileById : async () => "";
  const setDeckSplitLayouts = typeof options.setDeckSplitLayouts === "function" ? options.setDeckSplitLayouts : () => {};
  const setControlPaneState = typeof options.setControlPaneState === "function" ? options.setControlPaneState : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => true;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;

  const runtimeState = createWorkspacePresetRuntimeState(options);
  const runtimeActions = createWorkspacePresetRuntimeActions({
    api,
    normalizeText: runtimeState.normalizeText,
    cloneWorkspaceState: runtimeState.cloneWorkspaceState,
    cloneWorkspaceDeckGroups: runtimeState.cloneWorkspaceDeckGroups,
    normalizeControlPaneState: runtimeState.normalizeControlPaneState,
    getPreset: runtimeState.getPreset,
    getSelectedPreset: runtimeState.getSelectedPreset,
    setSelectedPresetId: runtimeState.setSelectedPresetId,
    getWorkspaceState: runtimeState.getWorkspaceState,
    setWorkspaceState: runtimeState.setWorkspaceState,
    requireUpsertedPreset: runtimeState.requireUpsertedPreset,
    removePreset: runtimeState.removePreset,
    captureCurrentWorkspace: runtimeState.captureCurrentWorkspace,
    captureCurrentVisibleDeckSessions: runtimeState.captureCurrentVisibleDeckSessions,
    getActiveDeckId,
    listGroupsForDeck: runtimeState.listGroupsForDeck,
    setSelectedGroupIdForDeck: runtimeState.setSelectedGroupIdForDeck,
    getSelectedGroupIdForDeck: runtimeState.getSelectedGroupIdForDeck,
    resolveGroup: runtimeState.resolveGroup,
    applyLayoutProfileById,
    setDeckSplitLayouts,
    setControlPaneState,
    setActiveDeck,
    requestRender,
    render: runtimeState.render,
    setStatus: runtimeState.setStatus,
    setCommandFeedback,
    presetNameInputEl,
    groupNameInputEl,
    clearPendingPresetDelete: runtimeState.clearPendingPresetDelete,
    clearPendingGroupDelete: runtimeState.clearPendingGroupDelete,
    getPendingDeletePresetId: runtimeState.getPendingDeletePresetId,
    setPendingDeletePresetId: runtimeState.setPendingDeletePresetId,
    getPendingDeleteGroupKey: runtimeState.getPendingDeleteGroupKey,
    setPendingDeleteGroupKey: runtimeState.setPendingDeleteGroupKey,
    getPresetNameInputValue: runtimeState.getPresetNameInputValue,
    getGroupNameInputValue: runtimeState.getGroupNameInputValue
  });

  const {
    createPresetFromCurrentWorkspace,
    applyPresetById,
    duplicatePresetById,
    renamePresetById,
    deletePresetById,
    createGroupFromVisibleDeckSessions,
    applyGroupLocally,
    renameGroupLocally,
    deleteGroupLocally,
    clearGroupLocally,
    createPresetFlow,
    applySelectedPresetFlow,
    duplicateSelectedPresetFlow,
    renameSelectedPresetFlow,
    requestDeleteSelectedPresetFlow,
    deleteSelectedPresetFlow,
    cancelDeleteSelectedPresetFlow,
    saveGroupByName,
    applyGroupById,
    renameGroupById,
    deleteGroupById,
    clearGroupForDeck,
    saveGroupFlow,
    applySelectedGroupFlow,
    renameSelectedGroupFlow,
    requestDeleteSelectedGroupFlow,
    deleteSelectedGroupFlow,
    cancelDeleteSelectedGroupFlow,
    clearSelectedGroupFlow
  } = runtimeActions;

  let uiEventsBound = false;

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    presetSelectEl?.addEventListener?.("change", () => {
      runtimeState.setSelectedPresetId(presetSelectEl.value);
      runtimeState.clearPendingPresetDelete();
      if (presetNameInputEl) {
        presetNameInputEl.value = runtimeState.getSelectedPreset()?.name || "";
      }
      runtimeState.render();
    });
    presetSaveBtn?.addEventListener?.("click", () => {
      createPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to save workspace preset.")));
    });
    presetApplyBtn?.addEventListener?.("click", () => {
      applySelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply workspace preset.")));
    });
    presetDuplicateBtn?.addEventListener?.("click", () => {
      duplicateSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to duplicate workspace preset.")));
    });
    presetRenameBtn?.addEventListener?.("click", () => {
      renameSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename workspace preset.")));
    });
    presetDeleteBtn?.addEventListener?.("click", () => {
      deleteSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete workspace preset.")));
    });
    presetDeleteConfirmBtn?.addEventListener?.("click", () => {
      deleteSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete workspace preset.")));
    });
    presetDeleteCancelBtn?.addEventListener?.("click", () => {
      cancelDeleteSelectedPresetFlow().catch((error) =>
        setError(getErrorMessage(error, "Failed to cancel workspace preset deletion."))
      );
    });
    groupSelectEl?.addEventListener?.("change", () => {
      runtimeState.setSelectedGroupIdForDeck(getActiveDeckId(), runtimeState.normalizeText(groupSelectEl.value));
      runtimeState.clearPendingGroupDelete();
      const activeDeckId = runtimeState.normalizeText(getActiveDeckId()) || "default";
      const selectedGroupId = runtimeState.getSelectedGroupIdForDeck(activeDeckId);
      const group = runtimeState.listGroupsForDeck(activeDeckId).find((entry) => entry.id === selectedGroupId) || null;
      if (groupNameInputEl) {
        groupNameInputEl.value = group?.name || "";
      }
      runtimeState.render();
    });
    groupSaveBtn?.addEventListener?.("click", () => {
      saveGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to save workspace group.")));
    });
    groupApplyBtn?.addEventListener?.("click", () => {
      applySelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply workspace group.")));
    });
    groupRenameBtn?.addEventListener?.("click", () => {
      renameSelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename workspace group.")));
    });
    groupDeleteBtn?.addEventListener?.("click", () => {
      deleteSelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete workspace group.")));
    });
    groupDeleteConfirmBtn?.addEventListener?.("click", () => {
      deleteSelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete workspace group.")));
    });
    groupDeleteCancelBtn?.addEventListener?.("click", () => {
      cancelDeleteSelectedGroupFlow().catch((error) =>
        setError(getErrorMessage(error, "Failed to cancel workspace group deletion."))
      );
    });
    groupClearBtn?.addEventListener?.("click", () => {
      clearSelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to clear workspace group.")));
    });
  }

  bindUiEvents();
  runtimeState.render();

  return Object.freeze({
    listPresets: runtimeState.listPresets,
    getPreset: runtimeState.getPreset,
    getSelectedPreset: runtimeState.getSelectedPreset,
    getSelectedPresetId: runtimeState.getSelectedPresetId,
    replacePresets: runtimeState.replacePresets,
    upsertPreset: runtimeState.upsertPreset,
    removePreset: runtimeState.removePreset,
    resolvePreset: runtimeState.resolvePreset,
    getWorkspaceState: runtimeState.getWorkspaceState,
    replaceWorkspaceState: runtimeState.replaceWorkspaceState,
    listGroupsForDeck: runtimeState.listGroupsForDeck,
    getActiveGroupIdForDeck: runtimeState.getActiveGroupIdForDeck,
    getSelectedGroupIdForDeck: runtimeState.getSelectedGroupIdForDeck,
    setSelectedGroupIdForDeck: runtimeState.setSelectedGroupIdForDeck,
    resolveDeckSessions: runtimeState.resolveDeckSessions,
    captureCurrentWorkspace: runtimeState.captureCurrentWorkspace,
    createPresetFromCurrentWorkspace,
    applyPresetById,
    duplicatePresetById,
    renamePresetById,
    deletePresetById,
    resolveGroup: runtimeState.resolveGroup,
    createGroupFromVisibleDeckSessions,
    applyGroupLocally,
    renameGroupLocally,
    deleteGroupLocally,
    clearGroupLocally,
    loadPresets: runtimeState.loadPresets,
    createPresetFlow,
    applySelectedPresetFlow,
    duplicateSelectedPresetFlow,
    renameSelectedPresetFlow,
    requestDeleteSelectedPresetFlow,
    deleteSelectedPresetFlow,
    cancelDeleteSelectedPresetFlow,
    saveGroupByName,
    applyGroupById,
    renameGroupById,
    deleteGroupById,
    clearGroupForDeck,
    saveGroupFlow,
    applySelectedGroupFlow,
    renameSelectedGroupFlow,
    requestDeleteSelectedGroupFlow,
    deleteSelectedGroupFlow,
    cancelDeleteSelectedGroupFlow,
    clearSelectedGroupFlow,
    bindUiEvents,
    render: runtimeState.render
  });
}
