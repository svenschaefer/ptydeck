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
  return {
    type,
    children
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

export function createWorkspacePresetRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const presetSelectEl = options.presetSelectEl || null;
  const presetSaveBtn = options.presetSaveBtn || null;
  const presetApplyBtn = options.presetApplyBtn || null;
  const presetRenameBtn = options.presetRenameBtn || null;
  const presetDeleteBtn = options.presetDeleteBtn || null;
  const groupSelectEl = options.groupSelectEl || null;
  const groupSaveBtn = options.groupSaveBtn || null;
  const groupApplyBtn = options.groupApplyBtn || null;
  const groupRenameBtn = options.groupRenameBtn || null;
  const groupDeleteBtn = options.groupDeleteBtn || null;
  const groupClearBtn = options.groupClearBtn || null;
  const statusEl = options.statusEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const getSessionFilterText = typeof options.getSessionFilterText === "function" ? options.getSessionFilterText : () => "";
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
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};

  let presets = [];
  let selectedPresetId = "";
  let workspaceState = cloneWorkspaceState();
  const selectedGroupIdByDeck = new Map();

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
    workspaceState = cloneWorkspaceState(nextWorkspace);
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
    if (presetSelectEl) {
      presetSelectEl.value = selectedPresetId;
      presetSelectEl.disabled = presets.length === 0;
    }
    if (presetApplyBtn) {
      presetApplyBtn.disabled = presets.length === 0;
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
    const presetCountText = presets.length > 0 ? `${presets.length} preset(s)` : "No saved workspace presets.";
    const groupCountText = groups.length > 0 ? `${groups.length} group(s) on [${activeDeckId}]` : `No saved groups on [${activeDeckId}].`;
    setStatus(`${presetCountText} ${groupCountText}`.trim());
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
      deckGroups: cloneWorkspaceDeckGroupMap(workspaceState.deckGroups),
      deckSplitLayouts: cloneDeckSplitLayoutMap(workspaceState.deckSplitLayouts)
    };
  }

  async function persistWorkspaceStateForSelectedPreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return null;
    }
    const updated = await api.updateWorkspacePreset(preset.id, {
      workspace: captureCurrentWorkspace()
    });
    const normalized = upsertPreset(updated);
    if (normalized) {
      workspaceState = cloneWorkspaceState(normalized.workspace);
    }
    render();
    requestRender();
    return normalized;
  }

  async function applyPresetById(presetId) {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown workspace preset: ${presetId}`);
    }
    workspaceState = cloneWorkspaceState(preset.workspace);
    selectedPresetId = preset.id;
    if (workspaceState.layoutProfileId) {
      await applyLayoutProfileById(workspaceState.layoutProfileId);
    }
    if (workspaceState.activeDeckId) {
      setActiveDeck(workspaceState.activeDeckId);
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
    const preset = upsertPreset(created);
    if (preset) {
      workspaceState = cloneWorkspaceState(preset.workspace);
    }
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
    upsertPreset(updated);
    return `Renamed workspace preset [${updated.id}] to ${updated.name}.`;
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
      const root = (groupId.slice(0, rootMaxLength).replace(/-+$/g, "") || "group");
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
    workspaceState = cloneWorkspaceState(nextWorkspace);
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
    workspaceState = cloneWorkspaceState(nextWorkspace);
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
    workspaceState = cloneWorkspaceState(nextWorkspace);
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
    workspaceState = cloneWorkspaceState(nextWorkspace);
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
    workspaceState = cloneWorkspaceState(nextWorkspace);
    setSelectedGroupIdForDeck(normalizedDeckId, "");
    render();
    requestRender();
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

  async function createPresetFlow(name) {
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Workspace preset name", "Current Workspace"));
    if (!input) {
      return "";
    }
    const feedback = await createPresetFromCurrentWorkspace(input);
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
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Workspace preset name", preset.name));
    if (!input) {
      return "";
    }
    const feedback = await renamePresetById(preset.id, input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedPresetFlow() {
    const preset = getSelectedPreset();
    if (!preset) {
      return "";
    }
    const confirmed = windowRef?.confirm?.(`Delete workspace preset '${preset.name}'?`) !== false;
    if (!confirmed) {
      return "";
    }
    const feedback = await deletePresetById(preset.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function saveGroupFlow(name) {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Workspace group name", "Current Deck"));
    if (!input) {
      return "";
    }
    const group = createGroupFromVisibleDeckSessions(input, activeDeckId);
    let feedback = `Saved workspace group [${group.id}] ${group.name} for deck [${activeDeckId}].`;
    if (getSelectedPreset()) {
      await persistWorkspaceStateForSelectedPreset();
      feedback = `Saved workspace group [${group.id}] ${group.name} for preset [${getSelectedPreset()?.id}] ${getSelectedPreset()?.name}.`;
    } else {
      feedback = `${feedback} Save a workspace preset to persist it.`;
    }
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function applySelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const selectedGroupId = getSelectedGroupIdForDeck(activeDeckId);
    applyGroupLocally(selectedGroupId, activeDeckId);
    if (getSelectedPreset()) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = selectedGroupId
      ? `Active workspace group for deck [${activeDeckId}] is now [${selectedGroupId}].`
      : `Cleared active workspace group for deck [${activeDeckId}].`;
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
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Workspace group name", group.name));
    if (!input) {
      return "";
    }
    const updatedGroup = renameGroupLocally(selectedGroupId, input, activeDeckId);
    if (getSelectedPreset()) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = `Renamed workspace group [${updatedGroup.id}] to ${updatedGroup.name}.`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedGroupFlow() {
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
    const confirmed = windowRef?.confirm?.(`Delete workspace group '${group.name}' from deck '${activeDeckId}'?`) !== false;
    if (!confirmed) {
      return "";
    }
    const deletedGroup = deleteGroupLocally(selectedGroupId, activeDeckId);
    if (getSelectedPreset()) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = `Deleted workspace group [${deletedGroup.id}] ${deletedGroup.name}.`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function clearSelectedGroupFlow() {
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    clearGroupLocally(activeDeckId);
    if (getSelectedPreset()) {
      await persistWorkspaceStateForSelectedPreset();
    }
    const feedback = `Cleared active workspace group for deck [${activeDeckId}].`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  function bindUiEvents() {
    presetSelectEl?.addEventListener?.("change", () => {
      selectedPresetId = normalizeText(presetSelectEl.value);
      syncSelection();
    });
    presetSaveBtn?.addEventListener?.("click", () => {
      createPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to save workspace preset.")));
    });
    presetApplyBtn?.addEventListener?.("click", () => {
      applySelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply workspace preset.")));
    });
    presetRenameBtn?.addEventListener?.("click", () => {
      renameSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename workspace preset.")));
    });
    presetDeleteBtn?.addEventListener?.("click", () => {
      deleteSelectedPresetFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete workspace preset.")));
    });
    groupSelectEl?.addEventListener?.("change", () => {
      setSelectedGroupIdForDeck(getActiveDeckId(), normalizeText(groupSelectEl.value));
      syncSelection();
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
    groupClearBtn?.addEventListener?.("click", () => {
      clearSelectedGroupFlow().catch((error) => setError(getErrorMessage(error, "Failed to clear workspace group.")));
    });
  }

  render();

  return {
    listPresets,
    getPreset,
    replacePresets,
    upsertPreset,
    removePreset,
    resolvePreset,
    getWorkspaceState,
    replaceWorkspaceState,
    listGroupsForDeck,
    getActiveGroupIdForDeck,
    getSelectedGroupIdForDeck,
    setSelectedGroupIdForDeck,
    resolveDeckSessions,
    captureCurrentWorkspace,
    createPresetFromCurrentWorkspace,
    applyPresetById,
    renamePresetById,
    deletePresetById,
    createGroupFromVisibleDeckSessions,
    applyGroupLocally,
    renameGroupLocally,
    deleteGroupLocally,
    clearGroupLocally,
    loadPresets,
    createPresetFlow,
    applySelectedPresetFlow,
    renameSelectedPresetFlow,
    deleteSelectedPresetFlow,
    saveGroupFlow,
    applySelectedGroupFlow,
    renameSelectedGroupFlow,
    deleteSelectedGroupFlow,
    clearSelectedGroupFlow,
    bindUiEvents,
    render
  };
}
