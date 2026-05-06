function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function clearChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
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

function cloneWorkspaceDeckGroups(deckGroup) {
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

function normalizeControlPaneState(source) {
  const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    controlPaneVisible: value.controlPaneVisible !== false,
    controlPanePosition: normalizeControlPanePosition(value.controlPanePosition),
    controlPaneSize: normalizeControlPaneSize(value.controlPaneSize)
  };
}

function cloneSplitLayoutNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return null;
  }
  const type = normalizeLower(node.type);
  if (type === "pane") {
    const paneId = normalizeText(node.paneId).toLowerCase();
    if (!paneId) {
      return null;
    }
    return {
      type: "pane",
      paneId
    };
  }
  if (type !== "row" && type !== "column") {
    return null;
  }
  const children = [];
  for (const rawChild of Array.isArray(node.children) ? node.children : []) {
    const child = cloneSplitLayoutNode(rawChild);
    if (child) {
      children.push(child);
    }
  }
  if (children.length < 2) {
    return children[0] || null;
  }
  const weights =
    Array.isArray(node.weights) && node.weights.length === children.length
      ? node.weights.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0)
      : [];
  return {
    type,
    children,
    weights: weights.length === children.length ? weights : Array.from({ length: children.length }, () => 1 / children.length)
  };
}

function collectSplitLayoutPaneIds(node, target = []) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return target;
  }
  if (node.type === "pane" && normalizeText(node.paneId)) {
    target.push(normalizeText(node.paneId).toLowerCase());
    return target;
  }
  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectSplitLayoutPaneIds(child, target);
  }
  return target;
}

function cloneDeckSplitLayoutEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const root = cloneSplitLayoutNode(entry.root);
  if (!root) {
    return null;
  }
  const paneIds = new Set(collectSplitLayoutPaneIds(root));
  const paneSessions = Object.fromEntries(Array.from(paneIds, (paneId) => [paneId, []]));
  if (entry.paneSessions && typeof entry.paneSessions === "object" && !Array.isArray(entry.paneSessions)) {
    for (const [rawPaneId, rawSessionIds] of Object.entries(entry.paneSessions)) {
      const paneId = normalizeText(rawPaneId).toLowerCase();
      if (!paneId || !paneIds.has(paneId)) {
        continue;
      }
      const seenSessionIds = new Set();
      paneSessions[paneId] = [];
      for (const rawSessionId of Array.isArray(rawSessionIds) ? rawSessionIds : []) {
        const sessionId = normalizeText(rawSessionId);
        if (!sessionId || seenSessionIds.has(sessionId)) {
          continue;
        }
        seenSessionIds.add(sessionId);
        paneSessions[paneId].push(sessionId);
      }
    }
  }
  return {
    root,
    paneSessions
  };
}

function cloneDeckSplitLayoutMap(deckSplitLayouts) {
  if (!deckSplitLayouts || typeof deckSplitLayouts !== "object" || Array.isArray(deckSplitLayouts)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(deckSplitLayouts)
      .map(([deckId, entry]) => {
        const normalizedDeckId = normalizeText(deckId);
        const clonedEntry = cloneDeckSplitLayoutEntry(entry);
        if (!normalizedDeckId || !clonedEntry) {
          return null;
        }
        return [normalizedDeckId, clonedEntry];
      })
      .filter(Boolean)
  );
}

function cloneWorkspaceState(workspace) {
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

function normalizeWorkspacePresetCollection(presets) {
  const next = [];
  const seen = new Set();
  for (const preset of Array.isArray(presets) ? presets : []) {
    const normalized = normalizeWorkspacePresetRecord(preset);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
  });
  return next;
}

export function resolveWorkspacePresetToken(presets, token) {
  const normalizedToken = normalizeLower(token);
  if (!normalizedToken) {
    return { preset: null, error: "Workspace preset target is required." };
  }
  const entries = normalizeWorkspacePresetCollection(presets);
  const exactId = entries.find((entry) => entry.id.toLowerCase() === normalizedToken);
  if (exactId) {
    return { preset: exactId, error: "" };
  }
  const exactName = entries.find((entry) => entry.name.toLowerCase() === normalizedToken);
  if (exactName) {
    return { preset: exactName, error: "" };
  }
  const matches = entries.filter(
    (entry) => entry.id.toLowerCase().startsWith(normalizedToken) || entry.name.toLowerCase().startsWith(normalizedToken)
  );
  if (matches.length === 1) {
    return { preset: matches[0], error: "" };
  }
  if (matches.length === 0) {
    return { preset: null, error: `Unknown workspace preset: ${token}` };
  }
  return {
    preset: null,
    error: `Ambiguous workspace preset '${token}': ${matches.map((entry) => entry.id).join(", ")}`
  };
}

export function resolveWorkspaceGroupToken(groups, token) {
  const normalizedToken = normalizeLower(token);
  if (!normalizedToken) {
    return { group: null, error: "Workspace group target is required." };
  }
  const entries = Array.isArray(groups) ? groups.slice() : [];
  const exactId = entries.find((entry) => normalizeLower(entry.id) === normalizedToken);
  if (exactId) {
    return { group: exactId, error: "" };
  }
  const exactName = entries.find((entry) => normalizeLower(entry.name) === normalizedToken);
  if (exactName) {
    return { group: exactName, error: "" };
  }
  const matches = entries.filter(
    (entry) => normalizeLower(entry.id).startsWith(normalizedToken) || normalizeLower(entry.name).startsWith(normalizedToken)
  );
  if (matches.length === 1) {
    return { group: matches[0], error: "" };
  }
  if (matches.length === 0) {
    return { group: null, error: `Unknown workspace group: ${token}` };
  }
  return {
    group: null,
    error: `Ambiguous workspace group '${token}': ${matches.map((entry) => entry.id).join(", ")}`
  };
}

function formatWorkspacePresetSummary(preset) {
  const normalized = normalizeWorkspacePresetRecord(preset);
  if (!normalized) {
    return "No saved workspace preset selected.";
  }
  const groupDeckCount = Object.keys(normalized.workspace.deckGroups || {}).length;
  return [
    `[${normalized.id}] ${normalized.name}`,
    `returns you to deck [${normalized.workspace.activeDeckId || "default"}]`,
    normalized.workspace.layoutProfileId ? `uses layout [${normalized.workspace.layoutProfileId}]` : "keeps the current layout",
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
    `The input pane becomes ${workspace.controlPaneVisible !== false ? "visible" : "hidden"} on ${workspace.controlPanePosition || "bottom"} at ${workspace.controlPaneSize || 185}px.`,
    totalGroupCount > 0
      ? `It restores ${totalGroupCount} saved deck group(s) across ${deckGroupDeckCount} deck(s).`
      : "It does not restore any saved deck groups.",
    splitLayoutDeckCount > 0
      ? `It restores saved split panes on ${splitLayoutDeckCount} deck(s).`
      : "It does not restore any split-pane layout."
  ].join("\n");
}

export function createWorkspacePresetRuntimeState(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const presetSelectEl = options.presetSelectEl || null;
  const presetSaveBtn = options.presetSaveBtn || null;
  const presetApplyBtn = options.presetApplyBtn || null;
  const presetDuplicateBtn = options.presetDuplicateBtn || null;
  const presetRenameBtn = options.presetRenameBtn || null;
  const presetDeleteBtn = options.presetDeleteBtn || null;
  const presetNameInputEl = options.presetNameInputEl || null;
  const presetDeleteConfirmEl = options.presetDeleteConfirmEl || null;
  const presetDeleteConfirmMessageEl = options.presetDeleteConfirmMessageEl || null;
  const presetDeleteConfirmBtn = options.presetDeleteConfirmBtn || null;
  const presetDeleteCancelBtn = options.presetDeleteCancelBtn || null;
  const groupSelectEl = options.groupSelectEl || null;
  const groupSaveBtn = options.groupSaveBtn || null;
  const groupApplyBtn = options.groupApplyBtn || null;
  const groupRenameBtn = options.groupRenameBtn || null;
  const groupDeleteBtn = options.groupDeleteBtn || null;
  const groupClearBtn = options.groupClearBtn || null;
  const groupNameInputEl = options.groupNameInputEl || null;
  const groupDeleteConfirmEl = options.groupDeleteConfirmEl || null;
  const groupDeleteConfirmMessageEl = options.groupDeleteConfirmMessageEl || null;
  const groupDeleteConfirmBtn = options.groupDeleteConfirmBtn || null;
  const groupDeleteCancelBtn = options.groupDeleteCancelBtn || null;
  const statusEl = options.statusEl || null;
  const summaryEl = options.summaryEl || null;
  const detailEl = options.detailEl || null;
  const groupSummaryEl = options.groupSummaryEl || null;
  const groupPersistenceEl = options.groupPersistenceEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const getSessionFilterText = typeof options.getSessionFilterText === "function" ? options.getSessionFilterText : () => "";
  const getControlPaneState = typeof options.getControlPaneState === "function" ? options.getControlPaneState : null;
  const resolveFilterSelectors =
    typeof options.resolveFilterSelectors === "function" ? options.resolveFilterSelectors : null;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "default");
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const getSelectedLayoutProfileId =
    typeof options.getSelectedLayoutProfileId === "function" ? options.getSelectedLayoutProfileId : () => "";
  const listLayoutProfiles =
    typeof options.listLayoutProfiles === "function" ? options.listLayoutProfiles : () => [];
  const applyLayoutProfileById =
    typeof options.applyLayoutProfileById === "function" ? options.applyLayoutProfileById : async () => "";
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const setControlPaneState = typeof options.setControlPaneState === "function" ? options.setControlPaneState : null;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const getDeckSplitLayouts = typeof options.getDeckSplitLayouts === "function" ? options.getDeckSplitLayouts : null;
  const setDeckSplitLayouts = typeof options.setDeckSplitLayouts === "function" ? options.setDeckSplitLayouts : null;

  let presets = [];
  let selectedPresetId = "";
  let workspaceState = cloneWorkspaceState();
  const selectedGroupIdByDeck = new Map();
  let pendingDeletePresetId = "";
  let pendingDeleteGroupKey = "";
  let uiEventsBound = false;

  function getPresetNameInputValue() {
    return normalizeText(presetNameInputEl?.value);
  }

  function getGroupNameInputValue() {
    return normalizeText(groupNameInputEl?.value);
  }

  function clearPendingPresetDelete() {
    pendingDeletePresetId = "";
  }

  function clearPendingGroupDelete() {
    pendingDeleteGroupKey = "";
  }

  function getKnownDeckIds() {
    const known = new Set();
    for (const deck of getDecks()) {
      const deckId = normalizeText(deck?.id);
      if (deckId) {
        known.add(deckId);
      }
    }
    if (!known.has("default")) {
      known.add("default");
    }
    return known;
  }

  function getKnownLayoutProfileIds() {
    const known = new Set();
    for (const profile of listLayoutProfiles()) {
      const profileId = normalizeText(profile?.id);
      if (profileId) {
        known.add(profileId);
      }
    }
    return known;
  }

  function getKnownSessionIdsForDeck(deckId) {
    const normalizedDeckId = normalizeText(deckId);
    const known = new Set();
    for (const session of getSessions()) {
      const sessionId = normalizeText(session?.id);
      if (sessionId && resolveSessionDeckId(session) === normalizedDeckId) {
        known.add(sessionId);
      }
    }
    return known;
  }

  function normalizeWorkspaceStateAgainstCurrentState(nextWorkspace) {
    const normalizedWorkspace = cloneWorkspaceState(nextWorkspace);
    const knownDeckIds = getKnownDeckIds();
    const knownLayoutProfileIds = getKnownLayoutProfileIds();
    const firstDeckId = Array.from(knownDeckIds)[0] || "default";
    const activeDeckId = knownDeckIds.has(normalizedWorkspace.activeDeckId) ? normalizedWorkspace.activeDeckId : firstDeckId;
    const layoutProfileId =
      normalizedWorkspace.layoutProfileId && knownLayoutProfileIds.has(normalizedWorkspace.layoutProfileId)
        ? normalizedWorkspace.layoutProfileId
        : "";
    const deckGroups = {};
    for (const [deckId, deckGroup] of Object.entries(normalizedWorkspace.deckGroups)) {
      const normalizedDeckId = normalizeText(deckId);
      if (!normalizedDeckId || !knownDeckIds.has(normalizedDeckId)) {
        continue;
      }
      const knownSessionIds = getKnownSessionIdsForDeck(normalizedDeckId);
      const groups = cloneWorkspaceDeckGroups(deckGroup).groups.map((group) => ({
        ...group,
        sessionIds: group.sessionIds.filter((sessionId) => knownSessionIds.has(sessionId))
      }));
      const activeGroupId = cloneWorkspaceDeckGroups(deckGroup).activeGroupId;
      deckGroups[normalizedDeckId] = {
        activeGroupId: groups.some((group) => group.id === activeGroupId) ? activeGroupId : "",
        groups
      };
    }
    const deckSplitLayouts = {};
    for (const [deckId, entry] of Object.entries(normalizedWorkspace.deckSplitLayouts)) {
      const normalizedDeckId = normalizeText(deckId);
      if (!normalizedDeckId || !knownDeckIds.has(normalizedDeckId)) {
        continue;
      }
      const clonedEntry = cloneDeckSplitLayoutEntry(entry);
      if (!clonedEntry) {
        continue;
      }
      const knownSessionIds = getKnownSessionIdsForDeck(normalizedDeckId);
      const assignedSessionIds = new Set();
      for (const paneId of Object.keys(clonedEntry.paneSessions)) {
        clonedEntry.paneSessions[paneId] = clonedEntry.paneSessions[paneId].filter((sessionId) => {
          if (!knownSessionIds.has(sessionId) || assignedSessionIds.has(sessionId)) {
            return false;
          }
          assignedSessionIds.add(sessionId);
          return true;
        });
      }
      deckSplitLayouts[normalizedDeckId] = clonedEntry;
    }
    return {
      activeDeckId,
      layoutProfileId,
      ...normalizeControlPaneState(normalizedWorkspace),
      deckGroups,
      deckSplitLayouts
    };
  }

  function normalizePresetAgainstCurrentState(preset) {
    const normalized = normalizeWorkspacePresetRecord(preset);
    if (!normalized) {
      return null;
    }
    return {
      ...normalized,
      workspace: normalizeWorkspaceStateAgainstCurrentState(normalized.workspace)
    };
  }

  function sanitizePresetCollection(nextPresets) {
    const normalized = [];
    const seen = new Set();
    for (const preset of Array.isArray(nextPresets) ? nextPresets : []) {
      const entry = normalizePresetAgainstCurrentState(preset);
      if (!entry || seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      normalized.push(entry);
    }
    normalized.sort((left, right) => {
      const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
    });
    return normalized;
  }

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = normalizeText(message);
    }
  }

  function getSelectedPreset() {
    if (!selectedPresetId) {
      return null;
    }
    return presets.find((entry) => entry.id === selectedPresetId) || null;
  }

  function listPresets() {
    return presets.slice();
  }

  function getPreset(presetId) {
    const normalizedId = normalizeText(presetId);
    if (!normalizedId) {
      return null;
    }
    return presets.find((entry) => entry.id === normalizedId) || null;
  }

  function getWorkspaceState() {
    return cloneWorkspaceState(workspaceState);
  }

  function replaceWorkspaceState(nextWorkspace) {
    workspaceState = normalizeWorkspaceStateAgainstCurrentState(nextWorkspace);
    if (typeof setDeckSplitLayouts === "function") {
      setDeckSplitLayouts(cloneDeckSplitLayoutMap(workspaceState.deckSplitLayouts));
    }
    render();
    requestRender();
    return getWorkspaceState();
  }

  function getDeckGroupState(deckId) {
    const normalizedDeckId = normalizeText(deckId) || normalizeText(getActiveDeckId()) || "default";
    return cloneWorkspaceDeckGroups(workspaceState.deckGroups[normalizedDeckId]);
  }

  function listGroupsForDeck(deckId) {
    return getDeckGroupState(deckId).groups;
  }

  function getActiveGroupIdForDeck(deckId) {
    return getDeckGroupState(deckId).activeGroupId;
  }

  function getSelectedGroupIdForDeck(deckId) {
    const normalizedDeckId = normalizeText(deckId) || normalizeText(getActiveDeckId()) || "default";
    const groupState = getDeckGroupState(normalizedDeckId);
    const selected = normalizeText(selectedGroupIdByDeck.get(normalizedDeckId));
    if (selected && groupState.groups.some((group) => group.id === selected)) {
      return selected;
    }
    if (groupState.activeGroupId && groupState.groups.some((group) => group.id === groupState.activeGroupId)) {
      return groupState.activeGroupId;
    }
    return "";
  }

  function setSelectedGroupIdForDeck(deckId, groupId) {
    const normalizedDeckId = normalizeText(deckId) || normalizeText(getActiveDeckId()) || "default";
    const normalizedGroupId = normalizeText(groupId);
    if (!normalizedGroupId) {
      selectedGroupIdByDeck.delete(normalizedDeckId);
      return "";
    }
    selectedGroupIdByDeck.set(normalizedDeckId, normalizedGroupId);
    return normalizedGroupId;
  }

  function syncSelection() {
    if (!selectedPresetId || !presets.some((entry) => entry.id === selectedPresetId)) {
      selectedPresetId = presets[0]?.id || "";
    }
    if (pendingDeletePresetId && pendingDeletePresetId !== selectedPresetId) {
      clearPendingPresetDelete();
    }
    if (presetSelectEl) {
      presetSelectEl.value = selectedPresetId;
      presetSelectEl.disabled = presets.length === 0;
    }
    if (presetApplyBtn) {
      presetApplyBtn.disabled = presets.length === 0;
    }
    if (presetDuplicateBtn) {
      presetDuplicateBtn.disabled = presets.length === 0;
    }
    if (presetRenameBtn) {
      presetRenameBtn.disabled = presets.length === 0;
    }
    if (presetDeleteBtn) {
      presetDeleteBtn.disabled = presets.length === 0;
    }

    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const groups = listGroupsForDeck(activeDeckId);
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    if (pendingDeleteGroupKey && pendingDeleteGroupKey !== `${activeDeckId}:${selectedGroupId}`) {
      clearPendingGroupDelete();
    }
    if (groupSelectEl) {
      groupSelectEl.value = selectedGroupId;
      groupSelectEl.disabled = groups.length === 0;
    }
    if (groupApplyBtn) {
      groupApplyBtn.disabled = groups.length === 0;
    }
    if (groupRenameBtn) {
      groupRenameBtn.disabled = !selectedGroupId;
    }
    if (groupDeleteBtn) {
      groupDeleteBtn.disabled = !selectedGroupId;
    }
    if (groupClearBtn) {
      groupClearBtn.disabled = !getActiveGroupIdForDeck(activeDeckId);
    }
  }

  function renderPresetSelect() {
    if (!presetSelectEl) {
      return;
    }
    clearChildren(presetSelectEl);
    if (presets.length === 0) {
      const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
      option.value = "";
      option.textContent = "No workspace presets";
      option.disabled = true;
      option.selected = true;
      presetSelectEl.appendChild(option);
      return;
    }
    for (const preset of presets) {
      const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
      option.value = preset.id;
      option.textContent = `[${preset.id}] ${preset.name}`;
      presetSelectEl.appendChild(option);
    }
  }

  function renderGroupSelect() {
    if (!groupSelectEl) {
      return;
    }
    clearChildren(groupSelectEl);
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const groups = listGroupsForDeck(activeDeckId);
    const allOption = documentRef?.createElement?.("option") || { value: "", textContent: "" };
    allOption.value = "";
    allOption.textContent = `All sessions in [${activeDeckId}]`;
    groupSelectEl.appendChild(allOption);
    for (const group of groups) {
      const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
      option.value = group.id;
      option.textContent = `[${group.id}] ${group.name}`;
      groupSelectEl.appendChild(option);
    }
  }

  function render() {
    workspaceState = normalizeWorkspaceStateAgainstCurrentState(workspaceState);
    presets = sanitizePresetCollection(presets);
    renderPresetSelect();
    renderGroupSelect();
    syncSelection();
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const groups = listGroupsForDeck(activeDeckId);
    const selectedPreset = getSelectedPreset();
    const activeGroupId = getActiveGroupIdForDeck(activeDeckId);
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
    const presetCountText = presets.length > 0 ? `${presets.length} preset(s)` : "No saved workspace presets.";
    const groupCountText = groups.length > 0 ? `${groups.length} group(s) on [${activeDeckId}]` : `No saved groups on [${activeDeckId}].`;
    setStatus(`${presetCountText} ${groupCountText}`.trim());
    if (presetNameInputEl && !normalizeText(presetNameInputEl.value)) {
      presetNameInputEl.value = selectedPreset?.name || "";
    }
    if (groupNameInputEl && !normalizeText(groupNameInputEl.value)) {
      groupNameInputEl.value = selectedGroup?.name || "";
    }
    if (summaryEl) {
      summaryEl.textContent = formatWorkspacePresetSummary(selectedPreset);
    }
    if (detailEl) {
      detailEl.textContent = formatWorkspacePresetDetail(selectedPreset);
    }
    if (groupSummaryEl) {
      groupSummaryEl.textContent = activeGroupId
        ? `Deck [${activeDeckId}] · active group [${activeGroupId}] · ${groups.length} group(s)`
        : `Deck [${activeDeckId}] · no active group · ${groups.length} group(s)`;
    }
    if (groupPersistenceEl) {
      groupPersistenceEl.textContent = selectedPreset
        ? `Changes you make here are saved into preset [${selectedPreset.id}] ${selectedPreset.name}. Save Visible remembers the sessions currently shown in deck [${activeDeckId}], Apply Group narrows the deck to that saved set, and Clear Active Group shows all sessions again.`
        : `No workspace preset is selected. Changes you make here affect only the current browser view until you save a preset. Save Visible remembers the sessions currently shown in deck [${activeDeckId}], Apply Group narrows the deck to that saved set, and Clear Active Group shows all sessions again.`;
    }
    if (presetDeleteBtn) {
      presetDeleteBtn.textContent = pendingDeletePresetId && pendingDeletePresetId === selectedPreset?.id ? "Confirm Delete Preset" : "Delete Preset";
    }
    if (presetDeleteConfirmEl) {
      presetDeleteConfirmEl.hidden = !(selectedPreset && pendingDeletePresetId === selectedPreset.id);
    }
    if (presetDeleteConfirmMessageEl) {
      presetDeleteConfirmMessageEl.textContent =
        selectedPreset && pendingDeletePresetId === selectedPreset.id
          ? `Delete workspace preset [${selectedPreset.id}] ${selectedPreset.name}? This removes only the saved preset.`
          : "";
    }
    if (groupDeleteBtn) {
      groupDeleteBtn.textContent =
        pendingDeleteGroupKey && pendingDeleteGroupKey === `${activeDeckId}:${selectedGroupId}` ? "Confirm Delete Group" : "Delete Group";
    }
    if (groupDeleteConfirmEl) {
      groupDeleteConfirmEl.hidden = !(selectedGroup && pendingDeleteGroupKey === `${activeDeckId}:${selectedGroupId}`);
    }
    if (groupDeleteConfirmMessageEl) {
      groupDeleteConfirmMessageEl.textContent =
        selectedGroup && pendingDeleteGroupKey === `${activeDeckId}:${selectedGroupId}`
          ? `Delete workspace group [${selectedGroup.id}] ${selectedGroup.name} from deck [${activeDeckId}]?`
          : "";
    }
  }

  function replacePresets(nextPresets) {
    presets = sanitizePresetCollection(nextPresets);
    render();
    return presets.slice();
  }

  function upsertPreset(preset) {
    const normalized = normalizePresetAgainstCurrentState(preset);
    if (!normalized) {
      return null;
    }
    presets = presets.filter((entry) => entry.id !== normalized.id);
    presets.push(normalized);
    presets = normalizeWorkspacePresetCollection(presets);
    selectedPresetId = normalized.id;
    render();
    return normalized;
  }

  function requireUpsertedPreset(preset, operationLabel) {
    const normalized = upsertPreset(preset);
    if (normalized) {
      return normalized;
    }
    throw new Error(
      `Workspace preset API returned an invalid preset record${normalizeText(operationLabel) ? ` for ${operationLabel}` : ""}.`
    );
  }

  function removePreset(presetId) {
    const normalizedId = normalizeText(presetId);
    if (!normalizedId) {
      return false;
    }
    const beforeLength = presets.length;
    presets = presets.filter((entry) => entry.id !== normalizedId);
    if (beforeLength === presets.length) {
      return false;
    }
    if (selectedPresetId === normalizedId) {
      selectedPresetId = "";
    }
    render();
    return true;
  }

  function resolvePreset(selectorText) {
    return resolveWorkspacePresetToken(presets, selectorText);
  }

  function resolveDeckSessions(deckId, deckSessions) {
    const normalizedDeckId = normalizeText(deckId);
    const orderedDeckSessions = Array.isArray(deckSessions) ? deckSessions.slice() : [];
    if (!normalizedDeckId) {
      return orderedDeckSessions;
    }
    const deckGroupState = getDeckGroupState(normalizedDeckId);
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

  function captureCurrentVisibleDeckSessions(deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const sessions = sortSessionsByQuickId(getSessions()).filter((session) => resolveSessionDeckId(session) === normalizedDeckId);
    const groupedSessions = resolveDeckSessions(normalizedDeckId, sessions);
    const sessionFilterText = normalizedDeckId === normalizeText(getActiveDeckId()) ? normalizeText(getSessionFilterText()) : "";
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

  function captureCurrentWorkspace() {
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

  function resolveGroup(selectorText, deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    return resolveWorkspaceGroupToken(listGroupsForDeck(normalizedDeckId), selectorText);
  }

  async function loadPresets() {
    if (typeof api.listWorkspacePresets !== "function") {
      replacePresets([]);
      return [];
    }
    try {
      const payload = await api.listWorkspacePresets();
      replacePresets(payload || []);
      return presets.slice();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to load workspace presets."));
      replacePresets([]);
      return [];
    }
  }

  render();

  return Object.freeze({
    normalizeText,
    cloneWorkspaceState,
    cloneWorkspaceDeckGroups,
    normalizeControlPaneState,
    getPresetNameInputValue,
    getGroupNameInputValue,
    clearPendingPresetDelete,
    clearPendingGroupDelete,
    getPendingDeletePresetId: () => pendingDeletePresetId,
    setPendingDeletePresetId: (value) => {
      pendingDeletePresetId = normalizeText(value);
      return pendingDeletePresetId;
    },
    getPendingDeleteGroupKey: () => pendingDeleteGroupKey,
    setPendingDeleteGroupKey: (value) => {
      pendingDeleteGroupKey = normalizeText(value);
      return pendingDeleteGroupKey;
    },
    listPresets,
    getPreset,
    getSelectedPreset,
    getSelectedPresetId: () => selectedPresetId,
    setSelectedPresetId: (value) => {
      selectedPresetId = normalizeText(value);
      return selectedPresetId;
    },
    replacePresets,
    upsertPreset,
    requireUpsertedPreset,
    removePreset,
    resolvePreset,
    getWorkspaceState,
    setWorkspaceState: (nextState) => {
      workspaceState = cloneWorkspaceState(nextState);
      return getWorkspaceState();
    },
    replaceWorkspaceState,
    getDeckGroupState,
    listGroupsForDeck,
    getActiveGroupIdForDeck,
    getSelectedGroupIdForDeck,
    setSelectedGroupIdForDeck,
    resolveDeckSessions,
    captureCurrentWorkspace,
    captureCurrentVisibleDeckSessions,
    resolveGroup,
    loadPresets,
    setStatus,
    render,
    syncSelection
  });
}
