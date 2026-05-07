import { normalizeLayoutControlPaneState } from "./layout-runtime-state.js";
import { cloneDeckSplitLayoutMap } from "./split-layout-state.js";

export function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
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

export function serializeSplitLayoutRoot(root) {
  return JSON.stringify(root || null);
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
