function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function clearChildren(element) {
  if (!element || !Array.isArray(element.children)) {
    return;
  }
  while (element.children.length > 0) {
    element.removeChild(element.children[0]);
  }
}

function cloneDeckTerminalSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(settings)
      .map(([deckId, value]) => {
        const normalizedDeckId = normalizeText(deckId);
        const cols = Number.parseInt(String(value?.cols ?? ""), 10);
        const rows = Number.parseInt(String(value?.rows ?? ""), 10);
        if (!normalizedDeckId || !Number.isInteger(cols) || !Number.isInteger(rows)) {
          return null;
        }
        return [normalizedDeckId, { cols, rows }];
      })
      .filter(Boolean)
  );
}

export function normalizeLayoutProfileRecord(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  const id = normalizeText(profile.id);
  const name = normalizeText(profile.name);
  const layout = profile.layout && typeof profile.layout === "object" && !Array.isArray(profile.layout) ? profile.layout : {};
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    createdAt: Number.isInteger(profile.createdAt) ? profile.createdAt : 0,
    updatedAt: Number.isInteger(profile.updatedAt) ? profile.updatedAt : 0,
    layout: {
      activeDeckId: normalizeText(layout.activeDeckId) || "default",
      sidebarVisible: layout.sidebarVisible !== false,
      sessionFilterText: normalizeText(layout.sessionFilterText),
      deckTerminalSettings: cloneDeckTerminalSettings(layout.deckTerminalSettings)
    }
  };
}

function normalizeLayoutProfileCollection(profiles) {
  const next = [];
  const seen = new Set();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const normalized = normalizeLayoutProfileRecord(profile);
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

export function resolveLayoutProfileToken(profiles, token) {
  const normalizedToken = normalizeLower(token);
  if (!normalizedToken) {
    return { profile: null, error: "Layout profile target is required." };
  }
  const entries = normalizeLayoutProfileCollection(profiles);
  const exactId = entries.find((entry) => entry.id.toLowerCase() === normalizedToken);
  if (exactId) {
    return { profile: exactId, error: "" };
  }
  const exactName = entries.find((entry) => entry.name.toLowerCase() === normalizedToken);
  if (exactName) {
    return { profile: exactName, error: "" };
  }
  const matches = entries.filter(
    (entry) => entry.id.toLowerCase().startsWith(normalizedToken) || entry.name.toLowerCase().startsWith(normalizedToken)
  );
  if (matches.length === 1) {
    return { profile: matches[0], error: "" };
  }
  if (matches.length === 0) {
    return { profile: null, error: `Unknown layout profile: ${token}` };
  }
  return {
    profile: null,
    error: `Ambiguous layout profile '${token}': ${matches.map((entry) => entry.id).join(", ")}`
  };
}

export function createLayoutProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const selectEl = options.selectEl || null;
  const saveBtn = options.saveBtn || null;
  const applyBtn = options.applyBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const statusEl = options.statusEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const getSessionFilterText = typeof options.getSessionFilterText === "function" ? options.getSessionFilterText : () => "";
  const getSidebarVisible = typeof options.getSidebarVisible === "function" ? options.getSidebarVisible : () => true;
  const getDeckTerminalGeometry = typeof options.getDeckTerminalGeometry === "function" ? options.getDeckTerminalGeometry : () => ({ cols: 80, rows: 20 });
  const getDeckById = typeof options.getDeckById === "function" ? options.getDeckById : () => null;
  const setSessionFilterText = typeof options.setSessionFilterText === "function" ? options.setSessionFilterText : () => {};
  const setSidebarVisible = typeof options.setSidebarVisible === "function" ? options.setSidebarVisible : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => false;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};

  let profiles = [];
  let selectedProfileId = "";

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = normalizeText(message);
    }
  }

  function getSelectedProfile() {
    if (!selectedProfileId) {
      return null;
    }
    return profiles.find((entry) => entry.id === selectedProfileId) || null;
  }

  function syncSelection() {
    if (!selectedProfileId || !profiles.some((entry) => entry.id === selectedProfileId)) {
      selectedProfileId = profiles[0]?.id || "";
    }
    if (selectEl) {
      selectEl.value = selectedProfileId;
      selectEl.disabled = profiles.length === 0;
    }
    if (applyBtn) {
      applyBtn.disabled = profiles.length === 0;
    }
    if (renameBtn) {
      renameBtn.disabled = profiles.length === 0;
    }
    if (deleteBtn) {
      deleteBtn.disabled = profiles.length === 0;
    }
  }

  function render() {
    if (selectEl) {
      clearChildren(selectEl);
      if (profiles.length === 0) {
        const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
        option.value = "";
        option.textContent = "No layout profiles";
        option.disabled = true;
        option.selected = true;
        selectEl.appendChild(option);
      } else {
        for (const profile of profiles) {
          const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
          option.value = profile.id;
          option.textContent = `[${profile.id}] ${profile.name}`;
          selectEl.appendChild(option);
        }
      }
    }
    syncSelection();
    setStatus(profiles.length > 0 ? `${profiles.length} profile(s)` : "No saved layout profiles.");
  }

  function replaceProfiles(nextProfiles) {
    profiles = normalizeLayoutProfileCollection(nextProfiles);
    render();
    return profiles.slice();
  }

  function upsertProfile(profile) {
    const normalized = normalizeLayoutProfileRecord(profile);
    if (!normalized) {
      return null;
    }
    profiles = profiles.filter((entry) => entry.id !== normalized.id);
    profiles.push(normalized);
    profiles = normalizeLayoutProfileCollection(profiles);
    selectedProfileId = normalized.id;
    render();
    return normalized;
  }

  function removeProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return false;
    }
    const beforeLength = profiles.length;
    profiles = profiles.filter((entry) => entry.id !== normalizedId);
    if (profiles.length === beforeLength) {
      return false;
    }
    if (selectedProfileId === normalizedId) {
      selectedProfileId = "";
    }
    render();
    return true;
  }

  function listProfiles() {
    return profiles.slice();
  }

  function getProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return null;
    }
    return profiles.find((entry) => entry.id === normalizedId) || null;
  }

  function captureCurrentLayout() {
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
      deckTerminalSettings
    };
  }

  async function updateDeckGeometry(deckId, nextGeometry, preferredActiveDeckId) {
    const deck = getDeckById(deckId);
    if (!deck) {
      return null;
    }
    const payload = {
      settings: {
        ...(deck.settings && typeof deck.settings === "object" && !Array.isArray(deck.settings) ? deck.settings : {}),
        terminal: {
          cols: nextGeometry.cols,
          rows: nextGeometry.rows
        }
      }
    };
    const updated = await api.updateDeck(deckId, payload);
    applyRuntimeEvent(
      {
        type: "deck.updated",
        deck: updated
      },
      { preferredActiveDeckId }
    );
    return updated;
  }

  async function applyProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown layout profile: ${profileId}`);
    }
    const targetActiveDeckId = profile.layout.activeDeckId;
    const currentDecks = getDecks();
    for (const deck of currentDecks) {
      const deckId = normalizeText(deck?.id);
      const nextGeometry = profile.layout.deckTerminalSettings[deckId];
      if (!deckId || !nextGeometry) {
        continue;
      }
      const currentGeometry = getDeckTerminalGeometry(deckId);
      if (currentGeometry?.cols === nextGeometry.cols && currentGeometry?.rows === nextGeometry.rows) {
        continue;
      }
      await updateDeckGeometry(deckId, nextGeometry, targetActiveDeckId);
    }
    setSidebarVisible(profile.layout.sidebarVisible);
    setSessionFilterText(profile.layout.sessionFilterText);
    if (currentDecks.some((deck) => normalizeText(deck?.id) === targetActiveDeckId)) {
      setActiveDeck(targetActiveDeckId);
    }
    requestRender();
    selectedProfileId = profile.id;
    render();
    return `Applied layout profile [${profile.id}] ${profile.name}.`;
  }

  async function createProfileFromCurrentLayout(name) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Layout profile name is required.");
    }
    const created = await api.createLayoutProfile({
      name: normalizedName,
      layout: captureCurrentLayout()
    });
    const profile = upsertProfile(created);
    return `Saved layout profile [${profile.id}] ${profile.name}.`;
  }

  async function renameProfileById(profileId, name) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown layout profile: ${profileId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Layout profile name is required.");
    }
    const updated = await api.updateLayoutProfile(profile.id, { name: normalizedName });
    upsertProfile(updated);
    return `Renamed layout profile [${updated.id}] to ${updated.name}.`;
  }

  async function deleteProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown layout profile: ${profileId}`);
    }
    await api.deleteLayoutProfile(profile.id);
    removeProfile(profile.id);
    return `Deleted layout profile [${profile.id}] ${profile.name}.`;
  }

  async function loadProfiles() {
    if (typeof api.listLayoutProfiles !== "function") {
      replaceProfiles([]);
      return [];
    }
    try {
      const payload = await api.listLayoutProfiles();
      replaceProfiles(payload || []);
      return profiles.slice();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to load layout profiles."));
      replaceProfiles([]);
      return [];
    }
  }

  async function createProfileFlow(name) {
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Layout profile name", "Current Layout"));
    if (!input) {
      return "";
    }
    const feedback = await createProfileFromCurrentLayout(input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function applySelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const feedback = await applyProfileById(profile.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameSelectedProfileFlow(name) {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Layout profile name", profile.name));
    if (!input) {
      return "";
    }
    const feedback = await renameProfileById(profile.id, input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const confirmed = windowRef?.confirm?.(`Delete layout profile '${profile.name}'?`) !== false;
    if (!confirmed) {
      return "";
    }
    const feedback = await deleteProfileById(profile.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  function bindUiEvents() {
    selectEl?.addEventListener?.("change", () => {
      selectedProfileId = normalizeText(selectEl.value);
      syncSelection();
    });
    saveBtn?.addEventListener?.("click", () => {
      createProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to save layout profile.")));
    });
    applyBtn?.addEventListener?.("click", () => {
      applySelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply layout profile.")));
    });
    renameBtn?.addEventListener?.("click", () => {
      renameSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename layout profile.")));
    });
    deleteBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete layout profile.")));
    });
  }

  function resolveProfile(selectorText) {
    return resolveLayoutProfileToken(profiles, selectorText);
  }

  render();

  return {
    listProfiles,
    getProfile,
    replaceProfiles,
    upsertProfile,
    removeProfile,
    resolveProfile,
    captureCurrentLayout,
    createProfileFromCurrentLayout,
    applyProfileById,
    renameProfileById,
    deleteProfileById,
    loadProfiles,
    createProfileFlow,
    applySelectedProfileFlow,
    renameSelectedProfileFlow,
    deleteSelectedProfileFlow,
    bindUiEvents,
    render
  };
}
