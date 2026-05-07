import { normalizeLayoutControlPaneState } from "./layout-runtime-state.js";
import { cloneDeckSplitLayoutMap } from "./split-layout-state.js";

export function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function serializeSplitLayoutRoot(root) {
  return JSON.stringify(root || null);
}

function cloneWorkspaceGroup(group) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return null;
  }
  const id = normalizeText(group.id);
  const name = normalizeText(group.name);
  if (!id || !name) {
    return null;
  }
  const sessionIds = [];
  const seen = new Set();
  for (const rawSessionId of Array.isArray(group.sessionIds) ? group.sessionIds : []) {
    const sessionId = normalizeText(rawSessionId);
    if (!sessionId || seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    sessionIds.push(sessionId);
  }
  return {
    id,
    name,
    sessionIds
  };
}

export function cloneWorkspaceDeckGroups(deckGroup) {
  if (!deckGroup || typeof deckGroup !== "object" || Array.isArray(deckGroup)) {
    return {
      activeGroupId: "",
      groups: []
    };
  }
  const groups = [];
  const seen = new Set();
  for (const rawGroup of Array.isArray(deckGroup.groups) ? deckGroup.groups : []) {
    const group = cloneWorkspaceGroup(rawGroup);
    if (!group || seen.has(group.id)) {
      continue;
    }
    seen.add(group.id);
    groups.push(group);
  }
  const activeGroupId = normalizeText(deckGroup.activeGroupId);
  return {
    activeGroupId: groups.some((group) => group.id === activeGroupId) ? activeGroupId : "",
    groups
  };
}

function cloneWorkspaceDeckGroupMap(deckGroups) {
  if (!deckGroups || typeof deckGroups !== "object" || Array.isArray(deckGroups)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(deckGroups)
      .map(([deckId, deckGroup]) => {
        const normalizedDeckId = normalizeText(deckId);
        if (!normalizedDeckId) {
          return null;
        }
        return [normalizedDeckId, cloneWorkspaceDeckGroups(deckGroup)];
      })
      .filter(Boolean)
  );
}

function normalizeControlPanePosition(value) {
  const normalized = normalizeLower(value);
  return ["top", "bottom", "left", "right"].includes(normalized) ? normalized : "bottom";
}

function normalizeControlPaneSize(value) {
  const normalized = Number.parseInt(String(value ?? ""), 10);
  if (Number.isInteger(normalized) && normalized >= 120 && normalized <= 960) {
    return normalized;
  }
  return 185;
}

export function normalizeControlPaneState(source) {
  const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    controlPaneVisible: value.controlPaneVisible !== false,
    controlPanePosition: normalizeControlPanePosition(value.controlPanePosition),
    controlPaneSize: normalizeControlPaneSize(value.controlPaneSize)
  };
}

export function cloneWorkspaceState(workspace) {
  const source = workspace && typeof workspace === "object" && !Array.isArray(workspace) ? workspace : {};
  return {
    activeDeckId: normalizeText(source.activeDeckId) || "default",
    layoutProfileId: normalizeText(source.layoutProfileId),
    ...normalizeControlPaneState(source),
    deckGroups: cloneWorkspaceDeckGroupMap(source.deckGroups),
    deckSplitLayouts: cloneDeckSplitLayoutMap(source.deckSplitLayouts)
  };
}

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

export function captureCurrentWorkspace(options = {}) {
  const {
    workspaceState = {},
    getActiveDeckId = () => "",
    getSelectedLayoutProfileId = () => "",
    getControlPaneState = null,
    getDeckSplitLayouts = null
  } = options;
  return {
    activeDeckId: normalizeText(getActiveDeckId()) || workspaceState.activeDeckId || "default",
    layoutProfileId: normalizeText(getSelectedLayoutProfileId()) || workspaceState.layoutProfileId || "",
    ...normalizeControlPaneState(typeof getControlPaneState === "function" ? getControlPaneState() : workspaceState),
    deckGroups: cloneWorkspaceDeckGroupMap(workspaceState.deckGroups),
    deckSplitLayouts: cloneDeckSplitLayoutMap(
      typeof getDeckSplitLayouts === "function" ? getDeckSplitLayouts() : workspaceState.deckSplitLayouts
    )
  };
}

export function captureLayoutProfileSnapshot(options = {}) {
  const {
    selectedProfile = null,
    getDecks = () => [],
    getDeckTerminalGeometry = () => ({}),
    getActiveDeckId = () => "",
    getSidebarVisible = () => true,
    getSessionFilterText = () => "",
    getControlPaneState = null,
    getDeckSplitLayouts = null
  } = options;
  const deckTerminalSettings = {};
  for (const deck of getDecks()) {
    const deckId = normalizeText(deck?.id);
    if (!deckId) {
      continue;
    }
    const geometry = getDeckTerminalGeometry(deckId);
    const cols = Number.parseInt(String(geometry?.cols ?? ""), 10);
    const rows = Number.parseInt(String(geometry?.rows ?? ""), 10);
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
      continue;
    }
    deckTerminalSettings[deckId] = { cols, rows };
  }
  return {
    activeDeckId: normalizeText(getActiveDeckId()) || "default",
    sidebarVisible: getSidebarVisible() !== false,
    sessionFilterText: normalizeText(getSessionFilterText()),
    ...normalizeLayoutControlPaneState(
      typeof getControlPaneState === "function" ? getControlPaneState() : selectedProfile?.layout
    ),
    deckTerminalSettings,
    deckSplitLayouts: cloneDeckSplitLayoutMap(
      typeof getDeckSplitLayouts === "function" ? getDeckSplitLayouts() : selectedProfile?.layout?.deckSplitLayouts
    )
  };
}
