import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspacePresetRuntimeActions } from "../src/public/workspace-preset-runtime-actions.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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
