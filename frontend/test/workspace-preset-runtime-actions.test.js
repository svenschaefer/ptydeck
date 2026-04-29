import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspacePresetRuntimeActions } from "../src/public/workspace-preset-runtime-actions.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createWorkspacePresetHarness(options = {}) {
  let mutableWorkspaceState = clone(
    options.workspaceState || {
      activeDeckId: "ops",
      layoutProfileId: "layout-ops",
      controlPaneVisible: false,
      controlPanePosition: "bottom",
      controlPaneSize: 180,
      deckGroups: {
        ops: {
          activeGroupId: "build",
          groups: [{ id: "build", name: "Build", sessionIds: ["s-1"] }]
        }
      },
      deckSplitLayouts: {
        ops: { direction: "row", children: [] }
      }
    }
  );
  let presets = clone(
    options.presets || [{ id: "ops", name: "Ops Workspace", workspace: clone(mutableWorkspaceState) }]
  );
  let selectedPresetId = Object.hasOwn(options, "selectedPresetId") ? options.selectedPresetId : presets[0]?.id || "";
  const selectedGroupIds = new Map(Object.entries(options.selectedGroupIds || { ops: "build" }));
  let pendingDeletePresetId = "";
  let pendingDeleteGroupKey = "";
  let renderCount = 0;
  let requestRenderCount = 0;
  const feedback = [];
  const updateCalls = [];
  const createCalls = [];
  const deleteCalls = [];
  const activeDeckCalls = [];
  const controlPaneStates = [];
  const appliedLayoutProfileIds = [];
  const presetNameInputEl = { value: options.presetNameInputValue || "" };
  const groupNameInputEl = { value: options.groupNameInputValue || "" };
  let nextPresetCounter = 1;

  const actions = createWorkspacePresetRuntimeActions({
    api: {
      async updateWorkspacePreset(presetId, payload) {
        updateCalls.push([presetId, clone(payload)]);
        const current = presets.find((preset) => preset.id === presetId) || { id: presetId, name: `Preset ${presetId}` };
        const updated = {
          ...current,
          ...clone(payload),
          workspace: clone(payload.workspace || current.workspace || {})
        };
        presets = presets
          .filter((preset) => preset.id !== presetId)
          .concat(updated);
        return updated;
      },
      async createWorkspacePreset(payload) {
        createCalls.push(clone(payload));
        const created = {
          id: `preset-${nextPresetCounter}`,
          name: payload.name,
          workspace: clone(payload.workspace)
        };
        nextPresetCounter += 1;
        presets.push(created);
        return created;
      },
      async deleteWorkspacePreset(presetId) {
        deleteCalls.push(presetId);
      }
    },
    normalizeText: (value) => String(value || "").trim(),
    cloneWorkspaceState: clone,
    cloneWorkspaceDeckGroups: (value) =>
      clone(
        value || {
          activeGroupId: "",
          groups: []
        }
      ),
    normalizeControlPaneState: (state) => ({
      activeDeckId: state.activeDeckId,
      controlPaneVisible: state.controlPaneVisible
    }),
    getPreset: (presetId) => presets.find((preset) => preset.id === presetId) || null,
    getSelectedPreset: () => presets.find((preset) => preset.id === selectedPresetId) || null,
    setSelectedPresetId: (presetId) => {
      selectedPresetId = presetId;
    },
    getWorkspaceState: () => clone(mutableWorkspaceState),
    setWorkspaceState: (nextState) => {
      mutableWorkspaceState = clone(nextState);
    },
    requireUpsertedPreset: (preset) => preset,
    removePreset: (presetId) => {
      const before = presets.length;
      presets = presets.filter((preset) => preset.id !== presetId);
      if (selectedPresetId === presetId) {
        selectedPresetId = "";
      }
      return presets.length !== before;
    },
    captureCurrentWorkspace: () => clone(mutableWorkspaceState),
    captureCurrentVisibleDeckSessions: (deckId) =>
      clone(options.visibleSessions?.[deckId] || options.visibleSessions || [{ id: "s-1" }, { id: "s-2" }]),
    getActiveDeckId: () => options.activeDeckId || mutableWorkspaceState.activeDeckId || "ops",
    listGroupsForDeck: (deckId) => clone(mutableWorkspaceState.deckGroups?.[deckId]?.groups || []),
    setSelectedGroupIdForDeck: (deckId, groupId) => {
      selectedGroupIds.set(deckId, groupId);
    },
    getSelectedGroupIdForDeck: (deckId) => selectedGroupIds.get(deckId) || "",
    applyLayoutProfileById: async (layoutProfileId) => {
      appliedLayoutProfileIds.push(layoutProfileId);
      return layoutProfileId;
    },
    setDeckSplitLayouts: (nextLayouts) => {
      mutableWorkspaceState.deckSplitLayouts = clone(nextLayouts);
    },
    setControlPaneState: (state) => {
      controlPaneStates.push(clone(state));
    },
    setActiveDeck: (deckId) => {
      activeDeckCalls.push(deckId);
      return true;
    },
    render: () => {
      renderCount += 1;
    },
    requestRender: () => {
      requestRenderCount += 1;
    },
    setStatus: (message) => feedback.push(["status", message]),
    setCommandFeedback: (message) => feedback.push(["command", message]),
    presetNameInputEl,
    groupNameInputEl,
    clearPendingPresetDelete: () => {
      pendingDeletePresetId = "";
    },
    clearPendingGroupDelete: () => {
      pendingDeleteGroupKey = "";
    },
    getPendingDeletePresetId: () => pendingDeletePresetId,
    setPendingDeletePresetId: (value) => {
      pendingDeletePresetId = value;
    },
    getPendingDeleteGroupKey: () => pendingDeleteGroupKey,
    setPendingDeleteGroupKey: (value) => {
      pendingDeleteGroupKey = value;
    },
    getPresetNameInputValue: () => presetNameInputEl.value,
    getGroupNameInputValue: () => groupNameInputEl.value
  });

  return {
    actions,
    feedback,
    updateCalls,
    createCalls,
    deleteCalls,
    activeDeckCalls,
    controlPaneStates,
    appliedLayoutProfileIds,
    presetNameInputEl,
    groupNameInputEl,
    getWorkspaceState: () => clone(mutableWorkspaceState),
    getPresets: () => clone(presets),
    getSelectedPresetId: () => selectedPresetId,
    getSelectedGroupIdForDeck: (deckId) => selectedGroupIds.get(deckId) || "",
    getPendingDeletePresetId: () => pendingDeletePresetId,
    getPendingDeleteGroupKey: () => pendingDeleteGroupKey,
    getRenderCount: () => renderCount,
    getRequestRenderCount: () => requestRenderCount
  };
}

test("workspace preset runtime actions create unique local group ids and update selection", () => {
  const selectedGroups = [];
  const workspaceState = {
    activeDeckId: "ops",
    deckGroups: {
      ops: {
        activeGroupId: "",
        groups: [{ id: "ops-team", name: "Ops Team", sessionIds: ["s-0"] }]
      }
    },
    deckSplitLayouts: {}
  };
  let mutableWorkspaceState = clone(workspaceState);
  let renderCount = 0;
  let requestRenderCount = 0;
  const actions = createWorkspacePresetRuntimeActions({
    cloneWorkspaceState: clone,
    cloneWorkspaceDeckGroups: (value) => clone(value),
    captureCurrentWorkspace: () => clone(mutableWorkspaceState),
    captureCurrentVisibleDeckSessions: () => [{ id: "s-1" }, { id: "s-2" }],
    getActiveDeckId: () => "ops",
    setWorkspaceState: (nextState) => {
      mutableWorkspaceState = clone(nextState);
    },
    setSelectedGroupIdForDeck: (deckId, groupId) => {
      selectedGroups.push([deckId, groupId]);
    },
    render: () => {
      renderCount += 1;
    },
    requestRender: () => {
      requestRenderCount += 1;
    }
  });

  const group = actions.createGroupFromVisibleDeckSessions("Ops Team", "ops");
  assert.equal(group.id, "ops-team-2");
  assert.equal(group.name, "Ops Team");
  assert.deepEqual(group.sessionIds, ["s-1", "s-2"]);
  assert.deepEqual(selectedGroups, [["ops", "ops-team-2"]]);
  assert.equal(mutableWorkspaceState.deckGroups.ops.activeGroupId, "ops-team-2");
  assert.equal(renderCount, 1);
  assert.equal(requestRenderCount, 1);
});

test("workspace preset runtime actions require confirmation before deleting a selected preset", async () => {
  const feedback = [];
  let pendingDeletePresetId = "";
  let presets = [{ id: "ops", name: "Ops Workspace", workspace: { activeDeckId: "ops", deckGroups: {}, deckSplitLayouts: {} } }];
  const actions = createWorkspacePresetRuntimeActions({
    api: {
      async deleteWorkspacePreset(presetId) {
        assert.equal(presetId, "ops");
      }
    },
    getPreset: (presetId) => presets.find((preset) => preset.id === presetId) || null,
    getSelectedPreset: () => presets[0] || null,
    removePreset: (presetId) => {
      presets = presets.filter((preset) => preset.id !== presetId);
      return true;
    },
    clearPendingPresetDelete: () => {
      pendingDeletePresetId = "";
    },
    getPendingDeletePresetId: () => pendingDeletePresetId,
    setPendingDeletePresetId: (value) => {
      pendingDeletePresetId = value;
    },
    render: () => {},
    setCommandFeedback: (message) => feedback.push(["command", message]),
    setStatus: (message) => feedback.push(["status", message])
  });

  assert.equal(
    await actions.deleteSelectedPresetFlow(),
    "Confirm deletion for workspace preset [ops] Ops Workspace."
  );
  assert.equal(pendingDeletePresetId, "ops");

  assert.equal(
    await actions.deleteSelectedPresetFlow(),
    "Deleted workspace preset [ops] Ops Workspace."
  );
  assert.equal(pendingDeletePresetId, "");
  assert.equal(presets.length, 0);
  assert.deepEqual(feedback, [
    ["status", "Confirm deletion for workspace preset [ops] Ops Workspace."],
    ["command", "Deleted workspace preset [ops] Ops Workspace."],
    ["status", "Deleted workspace preset [ops] Ops Workspace."]
  ]);
});

test("workspace preset runtime actions persist group application feedback for saved presets", async () => {
  const feedback = [];
  let mutableWorkspaceState = {
    activeDeckId: "ops",
    layoutProfileId: "",
    controlPaneVisible: false,
    controlPanePosition: "bottom",
    controlPaneSize: 180,
    deckGroups: {
      ops: {
        activeGroupId: "",
        groups: [{ id: "build", name: "Build", sessionIds: ["s-1"] }]
      }
    },
    deckSplitLayouts: {}
  };
  const updateCalls = [];
  const selectedPreset = { id: "ops", name: "Ops Workspace", workspace: clone(mutableWorkspaceState) };
  const actions = createWorkspacePresetRuntimeActions({
    api: {
      async updateWorkspacePreset(presetId, payload) {
        updateCalls.push([presetId, payload]);
        return { id: presetId, name: "Ops Workspace", workspace: clone(payload.workspace) };
      }
    },
    cloneWorkspaceState: clone,
    cloneWorkspaceDeckGroups: (value) => clone(value),
    normalizeControlPaneState: (state) => state,
    getPreset: () => selectedPreset,
    getSelectedPreset: () => selectedPreset,
    setSelectedPresetId: () => {},
    getWorkspaceState: () => clone(mutableWorkspaceState),
    setWorkspaceState: (nextState) => {
      mutableWorkspaceState = clone(nextState);
    },
    requireUpsertedPreset: (preset) => preset,
    captureCurrentWorkspace: () => clone(mutableWorkspaceState),
    getActiveDeckId: () => "ops",
    listGroupsForDeck: () => [{ id: "build", name: "Build", sessionIds: ["s-1"] }],
    setSelectedGroupIdForDeck: () => {},
    getSelectedGroupIdForDeck: () => "build",
    render: () => {},
    requestRender: () => {},
    setCommandFeedback: (message) => feedback.push(["command", message]),
    setStatus: (message) => feedback.push(["status", message])
  });

  const result = await actions.applyGroupById("build", "ops");
  assert.equal(
    result,
    "Active workspace group for deck [ops] is now [build] and persisted into preset [ops] Ops Workspace."
  );
  assert.equal(updateCalls.length, 1);
  assert.equal(mutableWorkspaceState.deckGroups.ops.activeGroupId, "build");
  assert.deepEqual(feedback, [
    ["command", "Active workspace group for deck [ops] is now [build] and persisted into preset [ops] Ops Workspace."],
    ["status", "Active workspace group for deck [ops] is now [build] and persisted into preset [ops] Ops Workspace."]
  ]);
});

test("workspace preset runtime actions cover direct preset CRUD helpers and preset application state", async () => {
  const harness = createWorkspacePresetHarness();

  const persisted = await harness.actions.persistWorkspaceStateForSelectedPreset();
  assert.equal(persisted.id, "ops");
  assert.equal(harness.updateCalls.length, 1);
  assert.equal(harness.getRenderCount(), 1);
  assert.equal(harness.getRequestRenderCount(), 1);

  const applied = await harness.actions.applyPresetById("ops");
  assert.equal(applied, "Applied workspace preset [ops] Ops Workspace.");
  assert.deepEqual(harness.appliedLayoutProfileIds, ["layout-ops"]);
  assert.deepEqual(harness.activeDeckCalls, ["ops"]);
  assert.deepEqual(harness.controlPaneStates.at(-1), {
    activeDeckId: "ops",
    controlPaneVisible: false
  });

  assert.equal(
    await harness.actions.createPresetFromCurrentWorkspace("  Release Deck  "),
    "Saved workspace preset [preset-1] Release Deck."
  );
  assert.equal(
    await harness.actions.renamePresetById("ops", "  Ops Renamed  "),
    "Renamed workspace preset [ops] to Ops Renamed."
  );
  assert.equal(
    await harness.actions.duplicatePresetById("ops", "  Ops Duplicate  "),
    "Duplicated workspace preset [ops] Ops Renamed as [preset-2] Ops Duplicate."
  );
  assert.equal(
    await harness.actions.deletePresetById("ops"),
    "Deleted workspace preset [ops] Ops Renamed."
  );
  assert.deepEqual(harness.deleteCalls, ["ops"]);

  await assert.rejects(() => harness.actions.applyPresetById("missing"), /Unknown workspace preset: missing/);
  await assert.rejects(
    () => harness.actions.createPresetFromCurrentWorkspace("   "),
    /Workspace preset name is required/
  );
  await assert.rejects(
    () => harness.actions.renamePresetById("preset-1", "   "),
    /Workspace preset name is required/
  );
  await assert.rejects(
    () => harness.actions.duplicatePresetById("preset-1", "   "),
    /Workspace preset name is required/
  );
});

test("workspace preset runtime actions cover preset flows, input fallbacks, and confirmation state", async () => {
  const harness = createWorkspacePresetHarness({
    presetNameInputValue: "Release Flow"
  });

  assert.equal(
    await harness.actions.createPresetFlow(""),
    "Saved workspace preset [preset-1] Release Flow."
  );
  assert.equal(harness.presetNameInputEl.value, "Release Flow");

  harness.presetNameInputEl.value = "Ops Flow Rename";
  assert.equal(
    await harness.actions.renameSelectedPresetFlow(""),
    "Renamed workspace preset [ops] to Ops Flow Rename."
  );
  assert.equal(harness.presetNameInputEl.value, "Ops Flow Rename");

  assert.equal(
    await harness.actions.duplicateSelectedPresetFlow(""),
    "Duplicated workspace preset [ops] Ops Flow Rename as [preset-2] Ops Flow Rename Copy."
  );
  assert.equal(harness.presetNameInputEl.value, "Ops Flow Rename Copy");

  assert.equal(
    await harness.actions.requestDeleteSelectedPresetFlow(),
    "Confirm deletion for workspace preset [ops] Ops Flow Rename."
  );
  assert.equal(harness.getPendingDeletePresetId(), "ops");
  assert.equal(
    await harness.actions.cancelDeleteSelectedPresetFlow(),
    "Cancelled deletion of the workspace preset."
  );
  assert.equal(harness.getPendingDeletePresetId(), "");

  assert.equal(
    await harness.actions.deleteSelectedPresetFlow(),
    "Confirm deletion for workspace preset [ops] Ops Flow Rename."
  );
  assert.equal(
    await harness.actions.deleteSelectedPresetFlow(),
    "Deleted workspace preset [ops] Ops Flow Rename."
  );
  assert.equal(harness.presetNameInputEl.value, "");

  const noSelectionHarness = createWorkspacePresetHarness({
    selectedPresetId: "",
    presetNameInputValue: ""
  });
  assert.equal(await noSelectionHarness.actions.applySelectedPresetFlow(), "");
  assert.equal(await noSelectionHarness.actions.renameSelectedPresetFlow(""), "");
  assert.equal(await noSelectionHarness.actions.duplicateSelectedPresetFlow("copy"), "");
  assert.equal(await noSelectionHarness.actions.requestDeleteSelectedPresetFlow(), "");
  assert.equal(await noSelectionHarness.actions.deleteSelectedPresetFlow(), "");
  await assert.rejects(
    () => noSelectionHarness.actions.createPresetFlow(""),
    /Enter the preset name before saving the current workspace/
  );
});

test("workspace preset runtime actions cover local group mutations, guards, and local-only feedback", async () => {
  const harness = createWorkspacePresetHarness({
    selectedPresetId: "",
    groupNameInputValue: "Review Team"
  });

  assert.throws(
    () => harness.actions.createGroupFromVisibleDeckSessions("", "ops"),
    /Workspace group name is required/
  );
  const emptyDeckHarness = createWorkspacePresetHarness({
    visibleSessions: { ops: [] }
  });
  assert.throws(
    () => emptyDeckHarness.actions.createGroupFromVisibleDeckSessions("No Sessions", "ops"),
    /No visible deck sessions to capture/
  );

  assert.throws(() => harness.actions.applyGroupLocally("missing", "ops"), /Unknown workspace group: missing/);
  assert.equal(harness.actions.applyGroupLocally("", "ops"), "");
  assert.equal(harness.getWorkspaceState().deckGroups.ops.activeGroupId, "");

  const renamedGroup = harness.actions.renameGroupLocally("build", "Build Two", "ops");
  assert.equal(renamedGroup.name, "Build Two");
  assert.throws(() => harness.actions.renameGroupLocally("build", "", "ops"), /Workspace group name is required/);
  assert.throws(() => harness.actions.renameGroupLocally("missing", "Name", "ops"), /Unknown workspace group: missing/);

  const deletedGroup = harness.actions.deleteGroupLocally("build", "ops");
  assert.equal(deletedGroup.id, "build");
  assert.throws(() => harness.actions.deleteGroupLocally("missing", "ops"), /Unknown workspace group: missing/);

  const savedFeedback = await harness.actions.saveGroupByName("  Review Team  ", "ops");
  assert.equal(
    savedFeedback,
    "Saved workspace group [review-team] Review Team for deck [ops]. It is local-only until you save or select a workspace preset."
  );
  assert.equal(harness.groupNameInputEl.value, "Review Team");

  assert.equal(
    await harness.actions.applyGroupById("review-team", "ops"),
    "Active workspace group for deck [ops] is now [review-team]. It is local-only until you save or select a workspace preset."
  );
  assert.equal(
    await harness.actions.renameGroupById("review-team", "Review Team Two", "ops"),
    "Renamed workspace group [review-team] to Review Team Two. The change is local-only until you save or select a workspace preset."
  );
  assert.equal(await harness.actions.renameGroupById("", "ignored", "ops"), "");
  assert.equal(
    await harness.actions.clearGroupForDeck("ops"),
    "Cleared the active workspace group for deck [ops]. The change is local-only until you save or select a workspace preset."
  );
});

test("workspace preset runtime actions cover group flows, persisted feedback, and delete confirmations", async () => {
  const harness = createWorkspacePresetHarness({
    groupNameInputValue: "Build Group"
  });

  assert.equal(
    await harness.actions.saveGroupFlow(""),
    "Saved workspace group [build-group] Build Group for deck [ops] and persisted it into preset [ops] Ops Workspace."
  );
  assert.equal(
    await harness.actions.applySelectedGroupFlow(),
    "Active workspace group for deck [ops] is now [build-group] and persisted into preset [ops] Ops Workspace."
  );
  harness.groupNameInputEl.value = "Build Group Renamed";
  assert.equal(
    await harness.actions.renameSelectedGroupFlow(""),
    "Renamed workspace group [build-group] to Build Group Renamed and persisted it into preset [ops] Ops Workspace."
  );

  assert.equal(
    await harness.actions.requestDeleteSelectedGroupFlow(),
    "Confirm deletion for workspace group [build-group] Build Group Renamed on deck [ops]."
  );
  assert.equal(harness.getPendingDeleteGroupKey(), "ops:build-group");
  assert.equal(
    await harness.actions.cancelDeleteSelectedGroupFlow(),
    "Cancelled deletion of the workspace group."
  );
  assert.equal(harness.getPendingDeleteGroupKey(), "");

  assert.equal(
    await harness.actions.deleteSelectedGroupFlow(),
    "Confirm deletion for workspace group [build-group] Build Group Renamed on deck [ops]."
  );
  assert.equal(
    await harness.actions.deleteSelectedGroupFlow(),
    "Deleted workspace group [build-group] Build Group Renamed and persisted it into preset [ops] Ops Workspace."
  );
  assert.equal(harness.groupNameInputEl.value, "");
  assert.equal(await harness.actions.deleteGroupById("", "ops"), "");

  const noGroupHarness = createWorkspacePresetHarness({
    selectedGroupIds: { ops: "" },
    groupNameInputValue: ""
  });
  assert.equal(
    await noGroupHarness.actions.applySelectedGroupFlow(),
    "Cleared the active workspace group for deck [ops] and persisted it into preset [ops] Ops Workspace."
  );
  assert.equal(await noGroupHarness.actions.renameSelectedGroupFlow(""), "");
  assert.equal(await noGroupHarness.actions.requestDeleteSelectedGroupFlow(), "");
  assert.equal(await noGroupHarness.actions.deleteSelectedGroupFlow(), "");
  await assert.rejects(
    () => noGroupHarness.actions.saveGroupFlow(""),
    /Enter the group name before saving the visible deck sessions/
  );
});
