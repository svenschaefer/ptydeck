import { mergeDeckSplitLayoutSnapshot } from "./layout-split-layout-runtime-state.js";
import { captureLayoutProfileSnapshot } from "./layout-workspace-capture-state.js";
import {
  normalizeLayoutControlPaneState,
  normalizeLayoutProfileCollection,
  normalizeLayoutProfileRecord,
  resolveLayoutProfileToken
} from "./layout-runtime-state.js";

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

  if (element.firstChild) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    return;
  }

  const children = element.children;
  if (!children || typeof children.length !== "number") {
    return;
  }

  while (children.length > 0) {
    const firstChild = children[0] || (typeof children.item === "function" ? children.item(0) : null);
    if (!firstChild) {
      break;
    }
    element.removeChild(firstChild);
  }
}

export { normalizeLayoutProfileRecord, resolveLayoutProfileToken } from "./layout-runtime-state.js";

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
  const getControlPaneState = typeof options.getControlPaneState === "function" ? options.getControlPaneState : null;
  const getDeckTerminalGeometry = typeof options.getDeckTerminalGeometry === "function" ? options.getDeckTerminalGeometry : () => ({ cols: 80, rows: 20 });
  const getDeckById = typeof options.getDeckById === "function" ? options.getDeckById : () => null;
  const setSessionFilterText = typeof options.setSessionFilterText === "function" ? options.setSessionFilterText : () => {};
  const setSidebarVisible = typeof options.setSidebarVisible === "function" ? options.setSidebarVisible : () => {};
  const setControlPaneState = typeof options.setControlPaneState === "function" ? options.setControlPaneState : null;
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => false;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestText =
    typeof options.requestText === "function"
      ? options.requestText
      : async ({ message = "", defaultValue = "" } = {}) => {
          if (typeof windowRef?.prompt !== "function") {
            return null;
          }
          const value = windowRef.prompt(message, defaultValue);
          return value === null || value === undefined ? null : String(value);
        };
  const confirmAction =
    typeof options.confirmAction === "function"
      ? options.confirmAction
      : async ({ message = "" } = {}) => {
          if (typeof windowRef?.confirm !== "function") {
            return false;
          }
          return windowRef.confirm(message);
        };
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const getDeckSplitLayouts = typeof options.getDeckSplitLayouts === "function" ? options.getDeckSplitLayouts : null;
  const setDeckSplitLayouts = typeof options.setDeckSplitLayouts === "function" ? options.setDeckSplitLayouts : null;
  const mergeDeckSplitLayouts =
    typeof options.mergeDeckSplitLayouts === "function" ? options.mergeDeckSplitLayouts : null;

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

  function getSelectedProfileId() {
    return selectedProfileId;
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

  function requireUpsertedProfile(profile, operationLabel) {
    const normalized = upsertProfile(profile);
    if (normalized) {
      return normalized;
    }
    throw new Error(
      `Layout profile API returned an invalid profile record${normalizeText(operationLabel) ? ` for ${operationLabel}` : ""}.`
    );
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
    return captureLayoutProfileSnapshot({
      selectedProfile: getSelectedProfile(),
      getDecks,
      getDeckTerminalGeometry,
      getActiveDeckId,
      getSidebarVisible,
      getSessionFilterText,
      getControlPaneState,
      getDeckSplitLayouts
    });
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
    await applyLayoutSnapshot(profile.layout, {
      scope: "all",
      targetDeckId: profile.layout.activeDeckId
    });
    selectedProfileId = profile.id;
    render();
    return `Applied layout profile [${profile.id}] ${profile.name}.`;
  }

  async function applyLayoutSnapshot(layout, options = {}) {
    const normalizedLayout = normalizeLayoutProfileRecord({
      id: "__device-layout__",
      name: "Device Layout",
      createdAt: 0,
      updatedAt: 0,
      layout
    })?.layout;
    if (!normalizedLayout) {
      throw new Error("Invalid layout snapshot.");
    }
    const scope = normalizeLower(options.scope) || "all";
    const currentDecks = getDecks();
    const requestedTargetDeckId = normalizeText(options.targetDeckId);
    const targetActiveDeckId =
      requestedTargetDeckId ||
      normalizedLayout.activeDeckId;
    const deckIdsToApply =
      scope === "all"
        ? currentDecks
            .map((deck) => normalizeText(deck?.id))
            .filter(Boolean)
        : [targetActiveDeckId].filter(Boolean);
    for (const deckId of deckIdsToApply) {
      const nextGeometry = normalizedLayout.deckTerminalSettings[deckId];
      if (!deckId || !nextGeometry) {
        continue;
      }
      const currentGeometry = getDeckTerminalGeometry(deckId);
      if (currentGeometry?.cols === nextGeometry.cols && currentGeometry?.rows === nextGeometry.rows) {
        continue;
      }
      await updateDeckGeometry(deckId, nextGeometry, targetActiveDeckId);
    }
    setSidebarVisible(normalizedLayout.sidebarVisible);
    setSessionFilterText(normalizedLayout.sessionFilterText);
    if (typeof setControlPaneState === "function") {
      setControlPaneState(normalizeLayoutControlPaneState(normalizedLayout));
    }
    if (typeof mergeDeckSplitLayouts === "function") {
      mergeDeckSplitLayouts(normalizedLayout.deckSplitLayouts, {
        scope,
        targetDeckId: targetActiveDeckId
      });
    } else if (typeof setDeckSplitLayouts === "function") {
      setDeckSplitLayouts(
        mergeDeckSplitLayoutSnapshot(
          typeof getDeckSplitLayouts === "function" ? getDeckSplitLayouts() : {},
          normalizedLayout.deckSplitLayouts,
          {
            scope,
            targetDeckId: targetActiveDeckId
          }
        )
      );
    }
    if (currentDecks.some((deck) => normalizeText(deck?.id) === targetActiveDeckId)) {
      setActiveDeck(targetActiveDeckId);
    }
    requestRender();
    render();
    return targetActiveDeckId
      ? `Applied layout snapshot for deck [${targetActiveDeckId}].`
      : "Applied layout snapshot.";
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
    const profile = requireUpsertedProfile(created, "layout profile save");
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
    const updatedProfile = requireUpsertedProfile(updated, "layout profile rename");
    return `Renamed layout profile [${updatedProfile.id}] to ${updatedProfile.name}.`;
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
    const input =
      normalizeText(name) ||
      normalizeText(
        await requestText({
          title: "Save Layout",
          message: "Enter a name for the current saved layout.",
          inputLabel: "Layout Name",
          defaultValue: "Current Layout",
          confirmLabel: "Save"
        })
      );
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
    const input =
      normalizeText(name) ||
      normalizeText(
        await requestText({
          title: "Rename Layout",
          message: `Enter a new name for saved layout '${profile.name}'.`,
          inputLabel: "Layout Name",
          defaultValue: profile.name,
          confirmLabel: "Rename"
        })
      );
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
    const confirmed = await confirmAction({
      title: "Delete Layout",
      message: `Delete saved layout '${profile.name}'?`,
      confirmLabel: "Delete"
    });
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
    getSelectedProfileId,
    replaceProfiles,
    upsertProfile,
    removeProfile,
    resolveProfile,
    captureCurrentLayout,
    applyLayoutSnapshot,
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
