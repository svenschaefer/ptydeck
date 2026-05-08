import {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  captureCurrentVisibleDeckSessions,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  resolveWorkspaceDeckSessions,
  serializeSplitLayoutRoot
} from "./layout-workspace-orchestration-state.js";

export {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  captureCurrentVisibleDeckSessions,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  resolveWorkspaceDeckSessions,
  serializeSplitLayoutRoot
} from "./layout-workspace-orchestration-state.js";

export function normalizeWorkspacePresetRecord(preset) {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
    return null;
  }
  const id = normalizeText(preset.id);
  const name = normalizeText(preset.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    createdAt: Number.isInteger(preset.createdAt) ? preset.createdAt : 0,
    updatedAt: Number.isInteger(preset.updatedAt) ? preset.updatedAt : 0,
    workspace: cloneWorkspaceState(preset.workspace)
  };
}

export function formatWorkspacePresetSummary(preset) {
  const normalized = normalizeWorkspacePresetRecord(preset);
  if (!normalized) {
    return "No saved workspace preset selected.";
  }
  const groupDeckCount = Object.keys(normalized.workspace.deckGroups || {}).length;
  return [
    `[${normalized.id}] ${normalized.name}`,
    `returns you to deck [${normalized.workspace.activeDeckId || "default"}]`,
    normalized.workspace.layoutProfileId
      ? `uses layout [${normalized.workspace.layoutProfileId}]`
      : "keeps the current layout",
    groupDeckCount > 0 ? `restores saved groups on ${groupDeckCount} deck(s)` : "does not change deck groups"
  ].join(" · ");
}

export function formatWorkspacePresetDetail(preset) {
  const normalized = normalizeWorkspacePresetRecord(preset);
  if (!normalized) {
    return "No saved workspace preset selected.";
  }
  const workspace = normalized.workspace || {};
  const deckGroupDeckCount = Object.keys(workspace.deckGroups || {}).length;
  const totalGroupCount = Object.values(workspace.deckGroups || {}).reduce(
    (count, deckEntry) => count + (Array.isArray(deckEntry?.groups) ? deckEntry.groups.length : 0),
    0
  );
  const splitLayoutDeckCount = Object.keys(workspace.deckSplitLayouts || {}).length;
  return [
    `[${normalized.id}] ${normalized.name}`,
    `When applied, this preset opens deck [${workspace.activeDeckId || "default"}].`,
    workspace.layoutProfileId
      ? `It switches to saved layout profile [${workspace.layoutProfileId}].`
      : "It keeps whichever layout profile is already active.",
    `The input pane becomes ${workspace.controlPaneVisible !== false ? "visible" : "hidden"} on ${
      workspace.controlPanePosition || "bottom"
    } at ${workspace.controlPaneSize || 185}px.`,
    totalGroupCount > 0
      ? `It restores ${totalGroupCount} saved deck group(s) across ${deckGroupDeckCount} deck(s).`
      : "It does not restore any saved deck groups.",
    splitLayoutDeckCount > 0
      ? `It restores saved split panes on ${splitLayoutDeckCount} deck(s).`
      : "It does not restore any split-pane layout."
  ].join("\n");
}
