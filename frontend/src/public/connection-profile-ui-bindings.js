function defaultNormalizeText(value) {
  return String(value || "").trim();
}

export function createConnectionProfileUiBindings(options = {}) {
  const normalizeText = typeof options.normalizeText === "function" ? options.normalizeText : defaultNormalizeText;
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const setSelectedProfileId =
    typeof options.setSelectedProfileId === "function" ? options.setSelectedProfileId : () => {};
  const syncSelection = typeof options.syncSelection === "function" ? options.syncSelection : () => {};
  const resetDraftFromSelectedProfile =
    typeof options.resetDraftFromSelectedProfile === "function" ? options.resetDraftFromSelectedProfile : () => {};
  const syncDraftStateFromInputs =
    typeof options.syncDraftStateFromInputs === "function" ? options.syncDraftStateFromInputs : () => {};
  const newDraftFlow = typeof options.newDraftFlow === "function" ? options.newDraftFlow : async () => {};
  const loadActiveDraftFlow =
    typeof options.loadActiveDraftFlow === "function" ? options.loadActiveDraftFlow : async () => {};
  const saveDraftFlow = typeof options.saveDraftFlow === "function" ? options.saveDraftFlow : async () => {};
  const saveAndLaunchDraftFlow =
    typeof options.saveAndLaunchDraftFlow === "function" ? options.saveAndLaunchDraftFlow : async () => {};
  const resetDraftFlow = typeof options.resetDraftFlow === "function" ? options.resetDraftFlow : async () => {};
  const applySelectedProfileFlow =
    typeof options.applySelectedProfileFlow === "function" ? options.applySelectedProfileFlow : async () => {};
  const duplicateSelectedProfileFlow =
    typeof options.duplicateSelectedProfileFlow === "function" ? options.duplicateSelectedProfileFlow : async () => {};
  const renameSelectedProfileFlow =
    typeof options.renameSelectedProfileFlow === "function" ? options.renameSelectedProfileFlow : async () => {};
  const deleteSelectedProfileFlow =
    typeof options.deleteSelectedProfileFlow === "function" ? options.deleteSelectedProfileFlow : async () => {};
  const cancelDeleteSelectedProfileFlow =
    typeof options.cancelDeleteSelectedProfileFlow === "function" ? options.cancelDeleteSelectedProfileFlow : async () => {};
  const refreshSshTrustEntries =
    typeof options.refreshSshTrustEntries === "function" ? options.refreshSshTrustEntries : async () => {};
  const probeSshHostKeysFlow =
    typeof options.probeSshHostKeysFlow === "function" ? options.probeSshHostKeysFlow : async () => {};
  const saveTrustEntryFlow =
    typeof options.saveTrustEntryFlow === "function" ? options.saveTrustEntryFlow : async () => {};
  const deleteTrustEntryFlow =
    typeof options.deleteTrustEntryFlow === "function" ? options.deleteTrustEntryFlow : async () => {};
  const replaceTrustEntryFlow =
    typeof options.replaceTrustEntryFlow === "function" ? options.replaceTrustEntryFlow : async () => {};
  const setSelectedSshTrustEntryId =
    typeof options.setSelectedSshTrustEntryId === "function" ? options.setSelectedSshTrustEntryId : () => {};
  const setSelectedSshProbeCandidateId =
    typeof options.setSelectedSshProbeCandidateId === "function" ? options.setSelectedSshProbeCandidateId : () => {};
  const renderDraftComputedState =
    typeof options.renderDraftComputedState === "function" ? options.renderDraftComputedState : () => {};
  const selectEl = options.selectEl || null;
  const newBtn = options.newBtn || null;
  const newSshBtn = options.newSshBtn || null;
  const saveBtn = options.saveBtn || null;
  const saveDraftBtn = options.saveDraftBtn || null;
  const saveAndLaunchBtn = options.saveAndLaunchBtn || null;
  const resetDraftBtn = options.resetDraftBtn || null;
  const applyBtn = options.applyBtn || null;
  const duplicateBtn = options.duplicateBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const deleteConfirmBtn = options.deleteConfirmBtn || null;
  const deleteCancelBtn = options.deleteCancelBtn || null;
  const sshTrustRefreshBtn = options.sshTrustRefreshBtn || null;
  const sshTrustProbeBtn = options.sshTrustProbeBtn || null;
  const sshTrustSaveBtn = options.sshTrustSaveBtn || null;
  const sshTrustDeleteBtn = options.sshTrustDeleteBtn || null;
  const sshTrustReplaceBtn = options.sshTrustReplaceBtn || null;
  const sshTrustSelectEl = options.sshTrustSelectEl || null;
  const sshProbeSelectEl = options.sshProbeSelectEl || null;
  const draftInputElements = Array.isArray(options.draftInputElements) ? options.draftInputElements : [];

  let uiEventsBound = false;

  function bindHandledClick(element, action, fallbackMessage) {
    element?.addEventListener?.("click", () => {
      action().catch((error) => setError(getErrorMessage(error, fallbackMessage)));
    });
  }

  function bindDraftSync(element, eventName = "input") {
    element?.addEventListener?.(eventName, () => {
      syncDraftStateFromInputs();
    });
  }

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;

    selectEl?.addEventListener?.("change", () => {
      setSelectedProfileId(normalizeText(selectEl.value));
      syncSelection();
      resetDraftFromSelectedProfile();
    });

    bindHandledClick(newBtn, () => newDraftFlow("local"), "Failed to open a new local connection profile draft.");
    bindHandledClick(newSshBtn, () => newDraftFlow("ssh"), "Failed to open a new SSH connection profile draft.");
    bindHandledClick(saveBtn, loadActiveDraftFlow, "Failed to load the active session into a connection profile draft.");
    bindHandledClick(saveDraftBtn, saveDraftFlow, "Failed to save the connection profile draft.");
    bindHandledClick(saveAndLaunchBtn, saveAndLaunchDraftFlow, "Failed to save and launch the connection profile draft.");
    bindHandledClick(resetDraftBtn, resetDraftFlow, "Failed to reset the connection profile draft.");
    bindHandledClick(applyBtn, applySelectedProfileFlow, "Failed to apply connection profile.");
    bindHandledClick(duplicateBtn, duplicateSelectedProfileFlow, "Failed to duplicate connection profile.");
    bindHandledClick(renameBtn, renameSelectedProfileFlow, "Failed to rename connection profile.");
    bindHandledClick(deleteBtn, deleteSelectedProfileFlow, "Failed to delete connection profile.");
    bindHandledClick(deleteConfirmBtn, deleteSelectedProfileFlow, "Failed to delete connection profile.");
    bindHandledClick(deleteCancelBtn, cancelDeleteSelectedProfileFlow, "Failed to cancel connection profile deletion.");
    bindHandledClick(sshTrustRefreshBtn, refreshSshTrustEntries, "Failed to load SSH trust entries.");
    bindHandledClick(sshTrustProbeBtn, probeSshHostKeysFlow, "Failed to fetch SSH host keys.");
    bindHandledClick(sshTrustSaveBtn, saveTrustEntryFlow, "Failed to trust SSH host key.");
    bindHandledClick(sshTrustDeleteBtn, deleteTrustEntryFlow, "Failed to delete SSH trust entry.");
    bindHandledClick(sshTrustReplaceBtn, replaceTrustEntryFlow, "Failed to replace SSH trust entry.");

    sshTrustSelectEl?.addEventListener?.("change", () => {
      setSelectedSshTrustEntryId(normalizeText(sshTrustSelectEl.value));
      renderDraftComputedState();
    });
    sshProbeSelectEl?.addEventListener?.("change", () => {
      setSelectedSshProbeCandidateId(normalizeText(sshProbeSelectEl.value));
      renderDraftComputedState();
    });

    for (const entry of draftInputElements) {
      if (!entry) {
        continue;
      }
      if (entry.element) {
        bindDraftSync(entry.element, entry.eventName || "input");
        continue;
      }
      bindDraftSync(entry, "input");
    }
  }

  return {
    bindUiEvents
  };
}
