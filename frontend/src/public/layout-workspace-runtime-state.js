import {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  serializeSplitLayoutRoot
} from "./layout-workspace-capture-state.js";

const normalizeLower = (value) => normalizeText(value).toLowerCase();

export {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  serializeSplitLayoutRoot
} from "./layout-workspace-capture-state.js";

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

export function resolveWorkspaceDeckSessions(deckId, deckSessions, deckGroups) {
  const normalizedDeckId = normalizeText(deckId);
  const orderedDeckSessions = Array.isArray(deckSessions) ? deckSessions.slice() : [];
  if (!normalizedDeckId) {
    return orderedDeckSessions;
  }
  const deckGroupState = cloneWorkspaceDeckGroups(deckGroups?.[normalizedDeckId]);
  if (!deckGroupState.activeGroupId) {
    return orderedDeckSessions;
  }
  const activeGroup = deckGroupState.groups.find((group) => group.id === deckGroupState.activeGroupId) || null;
  if (!activeGroup) {
    return orderedDeckSessions;
  }
  const byId = new Map(orderedDeckSessions.map((session) => [session.id, session]));
  const resolved = [];
  for (const sessionId of activeGroup.sessionIds) {
    const session = byId.get(sessionId);
    if (session) {
      resolved.push(session);
    }
  }
  return resolved;
}

export function captureCurrentVisibleDeckSessions(options = {}) {
  const {
    deckId = "",
    getActiveDeckId = () => "",
    getSessions = () => [],
    sortSessionsByQuickId = (sessions) => (Array.isArray(sessions) ? sessions.slice() : []),
    resolveSessionDeckId = (session) => session?.deckId || "",
    deckGroups = {},
    getSessionFilterText = () => "",
    resolveFilterSelectors = null
  } = options;
  const normalizedDeckId = normalizeText(deckId) || normalizeText(getActiveDeckId()) || "default";
  const sessions = sortSessionsByQuickId(getSessions()).filter(
    (session) => resolveSessionDeckId(session) === normalizedDeckId
  );
  const groupedSessions = resolveWorkspaceDeckSessions(normalizedDeckId, sessions, deckGroups);
  const sessionFilterText =
    normalizedDeckId === normalizeText(getActiveDeckId()) ? normalizeText(getSessionFilterText()) : "";
  if (!sessionFilterText || typeof resolveFilterSelectors !== "function") {
    return groupedSessions;
  }
  const resolved = resolveFilterSelectors(sessionFilterText, groupedSessions, {
    scopeMode: "active-deck",
    activeDeckId: normalizedDeckId
  });
  if (resolved && Array.isArray(resolved.sessions)) {
    return resolved.sessions;
  }
  return groupedSessions;
}
