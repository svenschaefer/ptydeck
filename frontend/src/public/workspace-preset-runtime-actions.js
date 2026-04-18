export function createWorkspacePresetRuntimeActions(options = {}) {
  const api = options.api || {};
  const normalizeText =
    typeof options.normalizeText === "function" ? options.normalizeText : (value) => String(value || "").trim();
  const cloneWorkspaceState =
    typeof options.cloneWorkspaceState === "function" ? options.cloneWorkspaceState : (value) => value;
  const cloneWorkspaceDeckGroups =
    typeof options.cloneWorkspaceDeckGroups === "function" ? options.cloneWorkspaceDeckGroups : (value) => value;
  const normalizeControlPaneState =
    typeof options.normalizeControlPaneState === "function" ? options.normalizeControlPaneState : (value) => value;
  const getPreset =
    typeof options.getPreset === "function" ? options.getPreset : () => null;
  const getSelectedPreset =
    typeof options.getSelectedPreset === "function" ? options.getSelectedPreset : () => null;
  const setSelectedPresetId =
    typeof options.setSelectedPresetId === "function" ? options.setSelectedPresetId : () => {};
  const getWorkspaceState =
    typeof options.getWorkspaceState === "function" ? options.getWorkspaceState : () => ({});
  const setWorkspaceState =
    typeof options.setWorkspaceState === "function" ? options.setWorkspaceState : () => {};
  const requireUpsertedPreset =
    typeof options.requireUpsertedPreset === "function" ? options.requireUpsertedPreset : (preset) => preset;
  const removePreset =
    typeof options.removePreset === "function" ? options.removePreset : () => false;
  const captureCurrentWorkspace =
    typeof options.captureCurrentWorkspace === "function" ? options.captureCurrentWorkspace : () => ({});
  const captureCurrentVisibleDeckSessions =
    typeof options.captureCurrentVisibleDeckSessions === "function" ? options.captureCurrentVisibleDeckSessions : () => [];
  const getActiveDeckId =
    typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const listGroupsForDeck =
    typeof options.listGroupsForDeck === "function" ? options.listGroupsForDeck : () => [];
  const setSelectedGroupIdForDeck =
    typeof options.setSelectedGroupIdForDeck === "function" ? options.setSelectedGroupIdForDeck : () => {};
  const getSelectedGroupIdForDeck =
    typeof options.getSelectedGroupIdForDeck === "function" ? options.getSelectedGroupIdForDeck : () => "";
  const resolveGroup =
    typeof options.resolveGroup === "function" ? options.resolveGroup : () => ({ group: null, error: "Unknown workspace group." });
  const applyLayoutProfileById =
    typeof options.applyLayoutProfileById === "function" ? options.applyLayoutProfileById : async () => "";
  const setDeckSplitLayouts =
    typeof options.setDeckSplitLayouts === "function" ? options.setDeckSplitLayouts : () => {};
  const setControlPaneState =
    typeof options.setControlPaneState === "function" ? options.setControlPaneState : () => {};
  const setActiveDeck =
    typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => true;
  const requestRender =
    typeof options.requestRender === "function" ? options.requestRender : () => {};
  const render =
    typeof options.render === "function" ? options.render : () => {};
  const setStatus =
    typeof options.setStatus === "function" ? options.setStatus : () => {};
  const setCommandFeedback =
    typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const presetNameInputEl = options.presetNameInputEl || null;
  const groupNameInputEl = options.groupNameInputEl || null;
  const clearPendingPresetDelete =
    typeof options.clearPendingPresetDelete === "function" ? options.clearPendingPresetDelete : () => {};
  const clearPendingGroupDelete =
    typeof options.clearPendingGroupDelete === "function" ? options.clearPendingGroupDelete : () => {};
  const getPendingDeletePresetId =
    typeof options.getPendingDeletePresetId === "function" ? options.getPendingDeletePresetId : () => "";
  const setPendingDeletePresetId =
    typeof options.setPendingDeletePresetId === "function" ? options.setPendingDeletePresetId : () => {};
  const getPendingDeleteGroupKey =
    typeof options.getPendingDeleteGroupKey === "function" ? options.getPendingDeleteGroupKey : () => "";
  const setPendingDeleteGroupKey =
    typeof options.setPendingDeleteGroupKey === "function" ? options.setPendingDeleteGroupKey : () => {};
  const getPresetNameInputValue =
    typeof options.getPresetNameInputValue === "function" ? options.getPresetNameInputValue : () => "";
  const getGroupNameInputValue =
    typeof options.getGroupNameInputValue === "function" ? options.getGroupNameInputValue : () => "";

  async function persistWorkspaceStateForSelectedPreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return null;
    }
    const updated = await api.updateWorkspacePreset(preset.id, {
      workspace: captureCurrentWorkspace()
    });
    const normalized = requireUpsertedPreset(updated, "workspace persistence");
    setWorkspaceState(cloneWorkspaceState(normalized.workspace));
    render();
    requestRender();
    return normalized;
  }

  async function applyPresetById(presetId) {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown workspace preset: ${presetId}`);
    }
    const nextWorkspaceState = cloneWorkspaceState(preset.workspace);
    setWorkspaceState(nextWorkspaceState);
    setSelectedPresetId(preset.id);
    if (nextWorkspaceState.layoutProfileId) {
      await applyLayoutProfileById(nextWorkspaceState.layoutProfileId);
    }
    setDeckSplitLayouts(nextWorkspaceState.deckSplitLayouts);
    setControlPaneState(normalizeControlPaneState(nextWorkspaceState));
    if (nextWorkspaceState.activeDeckId) {
      setActiveDeck(nextWorkspaceState.activeDeckId);
    }
    render();
    requestRender();
    return `Applied workspace preset [${preset.id}] ${preset.name}.`;
  }

  async function createPresetFromCurrentWorkspace(name) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Workspace preset name is required.");
    }
    const created = await api.createWorkspacePreset({
      name: normalizedName,
      workspace: captureCurrentWorkspace()
    });
    const preset = requireUpsertedPreset(created, "workspace preset save");
    setWorkspaceState(cloneWorkspaceState(preset.workspace));
    requestRender();
    return `Saved workspace preset [${preset.id}] ${preset.name}.`;
  }

  async function renamePresetById(presetId, name) {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown workspace preset: ${presetId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Workspace preset name is required.");
    }
    const updated = await api.updateWorkspacePreset(preset.id, { name: normalizedName });
    const updatedPreset = requireUpsertedPreset(updated, "workspace preset rename");
    return `Renamed workspace preset [${updatedPreset.id}] to ${updatedPreset.name}.`;
  }

  async function duplicatePresetById(presetId, name) {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown workspace preset: ${presetId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Workspace preset name is required.");
    }
    const created = await api.createWorkspacePreset({
      name: normalizedName,
      workspace: cloneWorkspaceState(preset.workspace)
    });
    const duplicated = requireUpsertedPreset(created, "workspace preset duplicate");
    setWorkspaceState(cloneWorkspaceState(duplicated.workspace));
    requestRender();
    return `Duplicated workspace preset [${preset.id}] ${preset.name} as [${duplicated.id}] ${duplicated.name}.`;
  }

  async function deletePresetById(presetId) {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown workspace preset: ${presetId}`);
    }
    await api.deleteWorkspacePreset(preset.id);
    removePreset(preset.id);
    requestRender();
    return `Deleted workspace preset [${preset.id}] ${preset.name}.`;
  }

  function createGroupFromVisibleDeckSessions(name, deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Workspace group name is required.");
    }
    const visibleSessions = captureCurrentVisibleDeckSessions(normalizedDeckId);
    if (visibleSessions.length === 0) {
      throw new Error("No visible deck sessions to capture for a workspace group.");
    }
    const nextWorkspace = captureCurrentWorkspace();
    const deckGroupState = cloneWorkspaceDeckGroups(nextWorkspace.deckGroups[normalizedDeckId]);
    let groupId =
      normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "group";
    groupId = groupId.slice(0, 32).replace(/-+$/g, "") || "group";
    let suffix = 2;
    const usedIds = new Set(deckGroupState.groups.map((group) => group.id));
    while (usedIds.has(groupId)) {
      const suffixText = `-${suffix}`;
      const rootMaxLength = 32 - suffixText.length;
      const root = groupId.slice(0, rootMaxLength).replace(/-+$/g, "") || "group";
      groupId = `${root}${suffixText}`;
      suffix += 1;
    }
    const nextGroup = {
      id: groupId,
      name: normalizedName,
      sessionIds: visibleSessions.map((session) => session.id)
    };
    deckGroupState.groups = deckGroupState.groups.filter((group) => group.id !== nextGroup.id);
    deckGroupState.groups.push(nextGroup);
    deckGroupState.activeGroupId = nextGroup.id;
    nextWorkspace.deckGroups[normalizedDeckId] = deckGroupState;
    setWorkspaceState(cloneWorkspaceState(nextWorkspace));
    setSelectedGroupIdForDeck(normalizedDeckId, nextGroup.id);
    render();
    requestRender();
    return nextGroup;
  }

  function applyGroupLocally(groupId, deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const normalizedGroupId = normalizeText(groupId);
    const nextWorkspace = captureCurrentWorkspace();
    const deckGroupState = cloneWorkspaceDeckGroups(nextWorkspace.deckGroups[normalizedDeckId]);
    if (normalizedGroupId && !deckGroupState.groups.some((group) => group.id === normalizedGroupId)) {
      throw new Error(`Unknown workspace group: ${normalizedGroupId}`);
    }
    deckGroupState.activeGroupId = normalizedGroupId;
    nextWorkspace.deckGroups[normalizedDeckId] = deckGroupState;
    setWorkspaceState(cloneWorkspaceState(nextWorkspace));
    setSelectedGroupIdForDeck(normalizedDeckId, normalizedGroupId);
    render();
    requestRender();
    return normalizedGroupId;
  }

  function renameGroupLocally(groupId, name, deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Workspace group name is required.");
    }
    const nextWorkspace = captureCurrentWorkspace();
    const deckGroupState = cloneWorkspaceDeckGroups(nextWorkspace.deckGroups[normalizedDeckId]);
    const index = deckGroupState.groups.findIndex((group) => group.id === normalizeText(groupId));
    if (index < 0) {
      throw new Error(`Unknown workspace group: ${groupId}`);
    }
    deckGroupState.groups[index] = {
      ...deckGroupState.groups[index],
      name: normalizedName
    };
    nextWorkspace.deckGroups[normalizedDeckId] = deckGroupState;
    setWorkspaceState(cloneWorkspaceState(nextWorkspace));
    render();
    requestRender();
    return deckGroupState.groups[index];
  }

  function deleteGroupLocally(groupId, deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const normalizedGroupId = normalizeText(groupId);
    const nextWorkspace = captureCurrentWorkspace();
    const deckGroupState = cloneWorkspaceDeckGroups(nextWorkspace.deckGroups[normalizedDeckId]);
    const group = deckGroupState.groups.find((entry) => entry.id === normalizedGroupId) || null;
    if (!group) {
      throw new Error(`Unknown workspace group: ${groupId}`);
    }
    deckGroupState.groups = deckGroupState.groups.filter((entry) => entry.id !== normalizedGroupId);
    if (deckGroupState.activeGroupId === normalizedGroupId) {
      deckGroupState.activeGroupId = "";
    }
    nextWorkspace.deckGroups[normalizedDeckId] = deckGroupState;
    setWorkspaceState(cloneWorkspaceState(nextWorkspace));
    setSelectedGroupIdForDeck(normalizedDeckId, "");
    render();
    requestRender();
    return group;
  }

  function clearGroupLocally(deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const nextWorkspace = captureCurrentWorkspace();
    const deckGroupState = cloneWorkspaceDeckGroups(nextWorkspace.deckGroups[normalizedDeckId]);
    deckGroupState.activeGroupId = "";
    nextWorkspace.deckGroups[normalizedDeckId] = deckGroupState;
    setWorkspaceState(cloneWorkspaceState(nextWorkspace));
    setSelectedGroupIdForDeck(normalizedDeckId, "");
    render();
    requestRender();
  }

  async function createPresetFlow(name) {
    const input = normalizeText(name) || getPresetNameInputValue();
    if (!input) {
      throw new Error("Enter the preset name before saving the current workspace.");
    }
    const feedback = await createPresetFromCurrentWorkspace(input);
    clearPendingPresetDelete();
    if (presetNameInputEl) {
      presetNameInputEl.value = input;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function applySelectedPresetFlow() {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    const feedback = await applyPresetById(preset.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameSelectedPresetFlow(name) {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    const input = normalizeText(name) || getPresetNameInputValue();
    if (!input) {
      throw new Error("Enter the desired preset name before renaming.");
    }
    const feedback = await renamePresetById(preset.id, input);
    clearPendingPresetDelete();
    if (presetNameInputEl) {
      presetNameInputEl.value = input;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function requestDeleteSelectedPresetFlow() {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    setPendingDeletePresetId(preset.id);
    render();
    const feedback = `Confirm deletion for workspace preset [${preset.id}] ${preset.name}.`;
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedPresetFlow() {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    if (getPendingDeletePresetId() !== preset.id) {
      return requestDeleteSelectedPresetFlow();
    }
    const feedback = await deletePresetById(preset.id);
    clearPendingPresetDelete();
    if (presetNameInputEl) {
      presetNameInputEl.value = "";
    }
    render();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function cancelDeleteSelectedPresetFlow() {
    clearPendingPresetDelete();
    render();
    const feedback = "Cancelled deletion of the workspace preset.";
    setStatus(feedback);
    return feedback;
  }

  async function duplicateSelectedPresetFlow(name) {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    const requestedName = normalizeText(name) || getPresetNameInputValue();
    const input = requestedName && requestedName !== preset.name ? requestedName : `${preset.name} Copy`;
    const feedback = await duplicatePresetById(preset.id, input);
    clearPendingPresetDelete();
    if (presetNameInputEl) {
      presetNameInputEl.value = input;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function saveGroupByName(name, deckId = getActiveDeckId()) {
    const activeDeckId = normalizeText(deckId) || "default";
    const group = createGroupFromVisibleDeckSessions(name, activeDeckId);
    let feedback = `Saved workspace group [${group.id}] ${group.name} for deck [${activeDeckId}].`;
    const preset = getSelectedPreset();
    if (preset) {
      await persistWorkspaceStateForSelectedPreset();
      feedback = `Saved workspace group [${group.id}] ${group.name} for deck [${activeDeckId}] and persisted it into preset [${preset.id}] ${preset.name}.`;
    } else {
      feedback = `${feedback} It is local-only until you save or select a workspace preset.`;
    }
    clearPendingGroupDelete();
    if (groupNameInputEl) {
      groupNameInputEl.value = group.name;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function saveGroupFlow(name) {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const input = normalizeText(name) || getGroupNameInputValue();
    if (!input) {
      throw new Error("Enter the group name before saving the visible deck sessions.");
    }
    return saveGroupByName(input, activeDeckId);
  }

  async function applyGroupById(groupId, deckId = getActiveDeckId()) {
    const activeDeckId = normalizeText(deckId) || "default";
    const normalizedGroupId = normalizeText(groupId);
    applyGroupLocally(normalizedGroupId, activeDeckId);
    const preset = getSelectedPreset();
    if (preset) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = normalizedGroupId
      ? preset
        ? `Active workspace group for deck [${activeDeckId}] is now [${normalizedGroupId}] and persisted into preset [${preset.id}] ${preset.name}.`
        : `Active workspace group for deck [${activeDeckId}] is now [${normalizedGroupId}]. It is local-only until you save or select a workspace preset.`
      : preset
        ? `Cleared the active workspace group for deck [${activeDeckId}] and persisted it into preset [${preset.id}] ${preset.name}.`
        : `Cleared the active workspace group for deck [${activeDeckId}]. The change is local-only until you save or select a workspace preset.`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function applySelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    return applyGroupById(getSelectedGroupIdForDeck(activeDeckId), activeDeckId);
  }

  async function renameGroupById(groupId, name, deckId = getActiveDeckId()) {
    const activeDeckId = normalizeText(deckId) || "default";
    const normalizedGroupId = normalizeText(groupId);
    if (!normalizedGroupId) {
      return "";
    }
    const groups = listGroupsForDeck(activeDeckId);
    const group = groups.find((entry) => entry.id === normalizedGroupId) || null;
    if (!group) {
      return "";
    }
    const input = normalizeText(name);
    if (!input) {
      throw new Error("Workspace group name is required.");
    }
    const updatedGroup = renameGroupLocally(normalizedGroupId, input, activeDeckId);
    const preset = getSelectedPreset();
    if (preset) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = preset
      ? `Renamed workspace group [${updatedGroup.id}] to ${updatedGroup.name} and persisted it into preset [${preset.id}] ${preset.name}.`
      : `Renamed workspace group [${updatedGroup.id}] to ${updatedGroup.name}. The change is local-only until you save or select a workspace preset.`;
    clearPendingGroupDelete();
    if (groupNameInputEl) {
      groupNameInputEl.value = updatedGroup.name;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameSelectedGroupFlow(name) {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    if (!selectedGroupId) {
      return "";
    }
    const groups = listGroupsForDeck(activeDeckId);
    const group = groups.find((entry) => entry.id === selectedGroupId) || null;
    if (!group) {
      return "";
    }
    const input = normalizeText(name) || getGroupNameInputValue();
    if (!input) {
      throw new Error("Enter the desired group name before renaming.");
    }
    return renameGroupById(selectedGroupId, input, activeDeckId);
  }

  async function deleteGroupById(groupId, deckId = getActiveDeckId()) {
    const activeDeckId = normalizeText(deckId) || "default";
    const normalizedGroupId = normalizeText(groupId);
    if (!normalizedGroupId) {
      return "";
    }
    const deletedGroup = deleteGroupLocally(normalizedGroupId, activeDeckId);
    const preset = getSelectedPreset();
    if (preset) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = preset
      ? `Deleted workspace group [${deletedGroup.id}] ${deletedGroup.name} and persisted it into preset [${preset.id}] ${preset.name}.`
      : `Deleted workspace group [${deletedGroup.id}] ${deletedGroup.name}. The change is local-only until you save or select a workspace preset.`;
    clearPendingGroupDelete();
    if (groupNameInputEl) {
      groupNameInputEl.value = "";
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function requestDeleteSelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    if (!selectedGroupId) {
      return "";
    }
    const groups = listGroupsForDeck(activeDeckId);
    const group = groups.find((entry) => entry.id === selectedGroupId) || null;
    if (!group) {
      return "";
    }
    setPendingDeleteGroupKey(`${activeDeckId}:${selectedGroupId}`);
    render();
    const feedback = `Confirm deletion for workspace group [${group.id}] ${group.name} on deck [${activeDeckId}].`;
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    if (!selectedGroupId) {
      return "";
    }
    if (getPendingDeleteGroupKey() !== `${activeDeckId}:${selectedGroupId}`) {
      return requestDeleteSelectedGroupFlow();
    }
    return deleteGroupById(selectedGroupId, activeDeckId);
  }

  async function cancelDeleteSelectedGroupFlow() {
    clearPendingGroupDelete();
    render();
    const feedback = "Cancelled deletion of the workspace group.";
    setStatus(feedback);
    return feedback;
  }

  async function clearGroupForDeck(deckId = getActiveDeckId()) {
    const activeDeckId = normalizeText(deckId) || "default";
    clearGroupLocally(activeDeckId);
    const preset = getSelectedPreset();
    if (preset) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = preset
      ? `Cleared the active workspace group for deck [${activeDeckId}] and persisted it into preset [${preset.id}] ${preset.name}.`
      : `Cleared the active workspace group for deck [${activeDeckId}]. The change is local-only until you save or select a workspace preset.`;
    clearPendingGroupDelete();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function clearSelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    return clearGroupForDeck(activeDeckId);
  }

  return Object.freeze({
    persistWorkspaceStateForSelectedPreset,
    applyPresetById,
    createPresetFromCurrentWorkspace,
    renamePresetById,
    duplicatePresetById,
    deletePresetById,
    createGroupFromVisibleDeckSessions,
    applyGroupLocally,
    renameGroupLocally,
    deleteGroupLocally,
    clearGroupLocally,
    createPresetFlow,
    applySelectedPresetFlow,
    renameSelectedPresetFlow,
    requestDeleteSelectedPresetFlow,
    deleteSelectedPresetFlow,
    cancelDeleteSelectedPresetFlow,
    duplicateSelectedPresetFlow,
    saveGroupByName,
    saveGroupFlow,
    applyGroupById,
    applySelectedGroupFlow,
    renameGroupById,
    renameSelectedGroupFlow,
    deleteGroupById,
    requestDeleteSelectedGroupFlow,
    deleteSelectedGroupFlow,
    cancelDeleteSelectedGroupFlow,
    clearGroupForDeck,
    clearSelectedGroupFlow
  });
}
