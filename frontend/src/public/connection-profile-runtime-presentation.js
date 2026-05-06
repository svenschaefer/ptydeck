import {
  buildBlankConnectionProfileLaunch,
  buildConnectionProfileLaunchFromSession,
  buildPersistedDraftLaunch,
  cloneDraftLaunch,
  cloneThemeProfile,
  createDraftState,
  formatStringRecord,
  formatTags,
  getDeckOptionsForDraft,
  getDraftLaunchFromInputs,
  getThemePresetSelectOptions,
  normalizeConnectionProfileCollection,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  normalizeText,
  resolveConnectionProfileToken,
  resolveThemePresetSelectionId
} from "./connection-profile-draft-state.js";
import {
  formatSshTarget,
  getSshTrustTargetKey,
  isSameSshTrustTarget,
  normalizeSshTrustTargetInput
} from "./connection-profile-ssh-lifecycle.js";
import { buildConnectionProfileDraftViewState } from "./connection-profile-runtime-view-state.js";
import {
  applyConnectionProfileDraftViewState,
  renderConnectionProfileProfileSelect,
  setConnectionProfileSelectOptions
} from "./connection-profile-ui-render.js";

export function createConnectionProfileRuntimePresentation(options = {}) {
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const refs = options.refs || {};
  const selectEl = refs.selectEl || null;
  const applyBtn = refs.applyBtn || null;
  const duplicateBtn = refs.duplicateBtn || null;
  const renameBtn = refs.renameBtn || null;
  const deleteBtn = refs.deleteBtn || null;
  const deleteConfirmEl = refs.deleteConfirmEl || null;
  const deleteConfirmMessageEl = refs.deleteConfirmMessageEl || null;
  const statusEl = refs.statusEl || null;
  const summaryEl = refs.summaryEl || null;
  const draftNameInputEl = refs.draftNameInputEl || null;
  const draftKindSelectEl = refs.draftKindSelectEl || null;
  const draftDeckSelectEl = refs.draftDeckSelectEl || null;
  const draftShellInputEl = refs.draftShellInputEl || null;
  const draftStartCwdInputEl = refs.draftStartCwdInputEl || null;
  const draftStartCommandTextareaEl = refs.draftStartCommandTextareaEl || null;
  const draftEnvTextareaEl = refs.draftEnvTextareaEl || null;
  const draftTagsInputEl = refs.draftTagsInputEl || null;
  const draftActiveThemeSelectEl = refs.draftActiveThemeSelectEl || null;
  const draftInactiveThemeSelectEl = refs.draftInactiveThemeSelectEl || null;
  const sshFieldsEl = refs.sshFieldsEl || null;
  const draftRemoteHostInputEl = refs.draftRemoteHostInputEl || null;
  const draftRemotePortInputEl = refs.draftRemotePortInputEl || null;
  const draftRemoteUsernameInputEl = refs.draftRemoteUsernameInputEl || null;
  const draftRemoteAuthMethodSelectEl = refs.draftRemoteAuthMethodSelectEl || null;
  const draftRemotePrivateKeyFieldEl = refs.draftRemotePrivateKeyFieldEl || null;
  const draftRemotePrivateKeyPathInputEl = refs.draftRemotePrivateKeyPathInputEl || null;
  const authHintEl = refs.authHintEl || null;
  const secretHintEl = refs.secretHintEl || null;
  const runtimeSecretFieldEl = refs.runtimeSecretFieldEl || null;
  const runtimeSecretInputEl = refs.runtimeSecretInputEl || null;
  const sshTrustStatusEl = refs.sshTrustStatusEl || null;
  const sshTrustGuidanceEl = refs.sshTrustGuidanceEl || null;
  const sshTrustProbeBtn = refs.sshTrustProbeBtn || null;
  const sshProbeSelectEl = refs.sshProbeSelectEl || null;
  const sshTrustSelectEl = refs.sshTrustSelectEl || null;
  const sshTrustKeyTypeInputEl = refs.sshTrustKeyTypeInputEl || null;
  const sshTrustFingerprintInputEl = refs.sshTrustFingerprintInputEl || null;
  const sshTrustPublicKeyTextareaEl = refs.sshTrustPublicKeyTextareaEl || null;
  const sshTrustCompareEl = refs.sshTrustCompareEl || null;
  const sshTrustCompareStatusEl = refs.sshTrustCompareStatusEl || null;
  const sshTrustCurrentKeyTypeInputEl = refs.sshTrustCurrentKeyTypeInputEl || null;
  const sshTrustCurrentFingerprintInputEl = refs.sshTrustCurrentFingerprintInputEl || null;
  const sshTrustCandidateKeyTypeInputEl = refs.sshTrustCandidateKeyTypeInputEl || null;
  const sshTrustCandidateFingerprintInputEl = refs.sshTrustCandidateFingerprintInputEl || null;
  const sshTrustRefreshBtn = refs.sshTrustRefreshBtn || null;
  const sshTrustSaveBtn = refs.sshTrustSaveBtn || null;
  const sshTrustDeleteBtn = refs.sshTrustDeleteBtn || null;
  const sshTrustReplaceBtn = refs.sshTrustReplaceBtn || null;
  const draftLaunchTextareaEl = refs.draftLaunchTextareaEl || null;
  const draftStatusEl = refs.draftStatusEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId) => (Array.isArray(getSessions()) ? getSessions().find((session) => session.id === sessionId) || null : null);
  const getActiveSessionId = typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => session?.name || String(session?.id || "");
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (value) => (value && typeof value === "object" ? value : {});
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const themePresets = Array.isArray(options.themePresets) ? options.themePresets.slice() : [];
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;
  const getRefreshSshTrustEntries =
    typeof options.getRefreshSshTrustEntries === "function" ? options.getRefreshSshTrustEntries : () => null;
  const hasGuidedDraftControls = Boolean(
    draftKindSelectEl ||
      draftDeckSelectEl ||
      draftShellInputEl ||
      draftStartCwdInputEl ||
      draftStartCommandTextareaEl ||
      draftEnvTextareaEl ||
      draftTagsInputEl
  );

  const state = {
    profiles: [],
    selectedProfileId: "",
    draftState: null,
    sshTrustEntries: [],
    selectedSshTrustEntryId: "",
    sshHostKeyProbeCandidates: [],
    selectedSshProbeCandidateId: "",
    probingSshHostKeys: false,
    sshProbeTargetKey: "",
    pendingDeleteProfileId: "",
    isRenderingDraft: false,
    loadingSshTrustEntries: false
  };

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = normalizeText(message);
    }
  }

  function setDraftStatus(message) {
    if (draftStatusEl) {
      draftStatusEl.textContent = normalizeText(message);
    }
  }

  function getProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return null;
    }
    return state.profiles.find((entry) => entry.id === normalizedId) || null;
  }

  function getSelectedProfile() {
    return getProfile(state.selectedProfileId);
  }

  function getSelectedProfileId() {
    return state.selectedProfileId;
  }

  function setSelectedProfileId(value) {
    state.selectedProfileId = normalizeText(value);
  }

  function getDraftState() {
    return state.draftState;
  }

  function getDraftStateSnapshot() {
    return state.draftState
      ? { ...state.draftState, launch: normalizeConnectionProfileLaunch(state.draftState.launch) }
      : null;
  }

  function readDraftLaunchFromInputs() {
    return getDraftLaunchFromInputs({
      hasGuidedDraftControls,
      rawDraftLaunch: draftLaunchTextareaEl?.value,
      draftState: state.draftState,
      defaultDeckId,
      defaultThemeProfile,
      themePresets,
      kindValue: draftKindSelectEl?.value,
      deckValue: draftDeckSelectEl?.value,
      shellValue: draftShellInputEl?.value,
      startCwdValue: draftStartCwdInputEl?.value,
      startCommandValue: draftStartCommandTextareaEl?.value,
      envText: draftEnvTextareaEl?.value,
      tagsText: draftTagsInputEl?.value,
      activeThemeSelection: draftActiveThemeSelectEl?.value,
      inactiveThemeSelection: draftInactiveThemeSelectEl?.value,
      remoteHostValue: draftRemoteHostInputEl?.value,
      remotePortValue: draftRemotePortInputEl?.value,
      remoteUsernameValue: draftRemoteUsernameInputEl?.value,
      remoteAuthMethodValue: draftRemoteAuthMethodSelectEl?.value,
      remotePrivateKeyPathValue: draftRemotePrivateKeyPathInputEl?.value
    });
  }

  function readPersistedDraftLaunch() {
    return buildPersistedDraftLaunch(readDraftLaunchFromInputs(), {
      defaultDeckId,
      defaultThemeProfile
    });
  }

  function getDraftNameInputValue() {
    return normalizeText(draftNameInputEl?.value || state.draftState?.name);
  }

  function clearPendingDeleteConfirmation() {
    state.pendingDeleteProfileId = "";
  }

  function getPendingDeleteProfileId() {
    return state.pendingDeleteProfileId;
  }

  function setPendingDeleteProfileId(value) {
    state.pendingDeleteProfileId = normalizeText(value);
  }

  function describeSshLaunchContext(profile) {
    const launch = profile?.launch;
    const target = formatSshTarget(launch?.remoteConnection?.host, launch?.remoteConnection?.port, launch?.remoteConnection?.username);
    const profileId = normalizeText(profile?.id);
    const profileName = normalizeText(profile?.name);
    if (profileId && profileName) {
      return {
        label: `saved SSH profile [${profileId}] ${profileName}`,
        target
      };
    }
    return {
      label: `SSH target ${target}`,
      target
    };
  }

  function getCurrentSshTrustTarget() {
    const draftLaunch = readDraftLaunchFromInputs();
    if (normalizeText(draftLaunch.kind).toLowerCase() !== "ssh") {
      return null;
    }
    const host = normalizeText(draftLaunch.remoteConnection?.host);
    const port = Number.parseInt(String(draftLaunch.remoteConnection?.port ?? 22), 10);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
    return { host, port };
  }

  function shouldRenderSshTrustTarget(target) {
    return isSameSshTrustTarget(getCurrentSshTrustTarget(), target);
  }

  function getSshLifecycleState() {
    return {
      sshTrustEntries: state.sshTrustEntries,
      selectedSshTrustEntryId: state.selectedSshTrustEntryId,
      sshHostKeyProbeCandidates: state.sshHostKeyProbeCandidates,
      selectedSshProbeCandidateId: state.selectedSshProbeCandidateId,
      probingSshHostKeys: state.probingSshHostKeys,
      sshProbeTargetKey: state.sshProbeTargetKey,
      loadingSshTrustEntries: state.loadingSshTrustEntries
    };
  }

  function updateSshLifecycleState(patch = {}) {
    if (Object.prototype.hasOwnProperty.call(patch, "sshTrustEntries")) {
      state.sshTrustEntries = Array.isArray(patch.sshTrustEntries) ? patch.sshTrustEntries : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "selectedSshTrustEntryId")) {
      state.selectedSshTrustEntryId = normalizeText(patch.selectedSshTrustEntryId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sshHostKeyProbeCandidates")) {
      state.sshHostKeyProbeCandidates = Array.isArray(patch.sshHostKeyProbeCandidates) ? patch.sshHostKeyProbeCandidates : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "selectedSshProbeCandidateId")) {
      state.selectedSshProbeCandidateId = normalizeText(patch.selectedSshProbeCandidateId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "probingSshHostKeys")) {
      state.probingSshHostKeys = patch.probingSshHostKeys === true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sshProbeTargetKey")) {
      state.sshProbeTargetKey = normalizeText(patch.sshProbeTargetKey);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "loadingSshTrustEntries")) {
      state.loadingSshTrustEntries = patch.loadingSshTrustEntries === true;
    }
  }

  function setSelectedSshTrustEntryId(value) {
    state.selectedSshTrustEntryId = normalizeText(value);
  }

  function setSelectedSshProbeCandidateId(value) {
    state.selectedSshProbeCandidateId = normalizeText(value);
  }

  function clearSshProbeCandidates() {
    updateSshLifecycleState({
      sshHostKeyProbeCandidates: [],
      selectedSshProbeCandidateId: "",
      sshProbeTargetKey: ""
    });
  }

  function clearSshTrustState() {
    updateSshLifecycleState({
      sshTrustEntries: [],
      selectedSshTrustEntryId: ""
    });
    clearSshProbeCandidates();
  }

  function getTrustEntriesForCurrentTarget() {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      return [];
    }
    return state.sshTrustEntries.filter((entry) => entry.host === target.host && entry.port === target.port);
  }

  function getSshProbeCandidatesForCurrentTarget() {
    const target = getCurrentSshTrustTarget();
    if (!target || getSshTrustTargetKey(target) !== state.sshProbeTargetKey) {
      return [];
    }
    return state.sshHostKeyProbeCandidates.slice();
  }

  function getSshProbeCandidatesForTarget(target) {
    const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
    return getSshTrustTargetKey(normalizedTarget) === state.sshProbeTargetKey ? state.sshHostKeyProbeCandidates.slice() : [];
  }

  function getSshTrustEntriesForTarget(target) {
    const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
    return state.sshTrustEntries.filter((entry) => entry.host === normalizedTarget.host && entry.port === normalizedTarget.port);
  }

  function findSshTrustConflictEntry(target, probeCandidate) {
    if (!probeCandidate) {
      return null;
    }
    const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
    return getSshTrustEntriesForTarget(normalizedTarget).find(
      (entry) => entry.keyType === probeCandidate.keyType && entry.publicKey !== probeCandidate.publicKey
    ) || null;
  }

  function syncDraftStateFromInputs() {
    if (!state.draftState || state.isRenderingDraft) {
      return;
    }
    const previousTargetKey = getSshTrustTargetKey(state.draftState.launch?.remoteConnection);
    const nextLaunch = readDraftLaunchFromInputs();
    state.draftState = {
      ...state.draftState,
      name: normalizeText(draftNameInputEl?.value || state.draftState.name),
      launch: nextLaunch
    };
    if (getSshTrustTargetKey(nextLaunch?.remoteConnection) !== previousTargetKey) {
      clearSshProbeCandidates();
    }
    renderDraftComputedState();
  }

  function renderDraftComputedState() {
    if (!state.draftState) {
      return;
    }
    const selectedProfile = getSelectedProfile();
    const currentLaunch = cloneDraftLaunch(readDraftLaunchFromInputs(), {
      defaultDeckId,
      defaultThemeProfile
    });
    const target = getCurrentSshTrustTarget();
    const matchingTrustEntries = getTrustEntriesForCurrentTarget();
    const probeCandidates = getSshProbeCandidatesForCurrentTarget();
    const viewState = buildConnectionProfileDraftViewState({
      draftState: state.draftState,
      getProfile,
      selectedProfile,
      currentLaunch,
      pendingDeleteProfileId: state.pendingDeleteProfileId,
      target,
      matchingTrustEntries,
      probeCandidates,
      selectedSshTrustEntryId: state.selectedSshTrustEntryId,
      selectedSshProbeCandidateId: state.selectedSshProbeCandidateId,
      probingSshHostKeys: state.probingSshHostKeys,
      loadingSshTrustEntries: state.loadingSshTrustEntries,
      documentRef,
      api
    });
    const nextSelection = applyConnectionProfileDraftViewState({
      viewState,
      setDraftStatus,
      refs: {
        summaryEl,
        sshFieldsEl,
        draftRemotePrivateKeyFieldEl,
        authHintEl,
        secretHintEl,
        runtimeSecretFieldEl,
        runtimeSecretInputEl,
        draftLaunchTextareaEl,
        deleteBtn,
        deleteConfirmEl,
        deleteConfirmMessageEl,
        sshProbeSelectEl,
        sshTrustSelectEl,
        sshTrustKeyTypeInputEl,
        sshTrustFingerprintInputEl,
        sshTrustPublicKeyTextareaEl,
        sshTrustGuidanceEl,
        sshTrustStatusEl,
        sshTrustCompareEl,
        sshTrustCompareStatusEl,
        sshTrustCurrentKeyTypeInputEl,
        sshTrustCurrentFingerprintInputEl,
        sshTrustCandidateKeyTypeInputEl,
        sshTrustCandidateFingerprintInputEl,
        sshTrustProbeBtn,
        sshTrustRefreshBtn,
        sshTrustSaveBtn,
        sshTrustDeleteBtn,
        sshTrustReplaceBtn
      }
    });
    state.selectedSshTrustEntryId = nextSelection.selectedSshTrustEntryId;
    state.selectedSshProbeCandidateId = nextSelection.selectedSshProbeCandidateId;
  }

  function renderDraft() {
    if (!state.draftState) {
      return;
    }
    const currentLaunch = cloneDraftLaunch(state.draftState.launch, { defaultDeckId, defaultThemeProfile });
    state.isRenderingDraft = true;
    if (draftNameInputEl) {
      draftNameInputEl.value = state.draftState.name;
    }
    setConnectionProfileSelectOptions(
      draftKindSelectEl,
      [
        { value: "local", label: "Local", documentRef },
        { value: "ssh", label: "SSH", documentRef }
      ],
      currentLaunch.kind
    );
    setConnectionProfileSelectOptions(
      draftDeckSelectEl,
      getDeckOptionsForDraft(state.draftState, { defaultDeckId, getDecks, documentRef }),
      currentLaunch.deckId
    );
    if (draftShellInputEl) {
      draftShellInputEl.value = currentLaunch.shell;
    }
    if (draftStartCwdInputEl) {
      draftStartCwdInputEl.value = currentLaunch.startCwd;
    }
    if (draftStartCommandTextareaEl) {
      draftStartCommandTextareaEl.value = currentLaunch.startCommand || "";
    }
    if (draftEnvTextareaEl) {
      draftEnvTextareaEl.value = formatStringRecord(currentLaunch.env);
    }
    if (draftTagsInputEl) {
      draftTagsInputEl.value = formatTags(currentLaunch.tags);
    }
    const activeThemeSelection = resolveThemePresetSelectionId(themePresets, currentLaunch.activeThemeProfile);
    const inactiveThemeSelection = resolveThemePresetSelectionId(themePresets, currentLaunch.inactiveThemeProfile);
    setConnectionProfileSelectOptions(
      draftActiveThemeSelectEl,
      getThemePresetSelectOptions(themePresets, activeThemeSelection, documentRef),
      activeThemeSelection
    );
    setConnectionProfileSelectOptions(
      draftInactiveThemeSelectEl,
      getThemePresetSelectOptions(themePresets, inactiveThemeSelection, documentRef),
      inactiveThemeSelection
    );
    if (draftRemoteHostInputEl) {
      draftRemoteHostInputEl.value = currentLaunch.remoteConnection?.host || "";
    }
    if (draftRemotePortInputEl) {
      draftRemotePortInputEl.value = String(currentLaunch.remoteConnection?.port || 22);
    }
    if (draftRemoteUsernameInputEl) {
      draftRemoteUsernameInputEl.value = currentLaunch.remoteConnection?.username || "";
    }
    setConnectionProfileSelectOptions(
      draftRemoteAuthMethodSelectEl,
      [
        { value: "privateKey", label: "Private Key", documentRef },
        { value: "password", label: "Password", documentRef },
        { value: "keyboardInteractive", label: "Keyboard-Interactive", documentRef }
      ],
      currentLaunch.remoteAuth?.method || "privateKey"
    );
    if (draftRemotePrivateKeyPathInputEl) {
      draftRemotePrivateKeyPathInputEl.value = currentLaunch.remoteAuth?.privateKeyPath || "";
    }
    state.isRenderingDraft = false;
    renderDraftComputedState();
    if (normalizeText(currentLaunch.kind).toLowerCase() === "ssh") {
      const refreshSshTrustEntries = getRefreshSshTrustEntries();
      if (typeof refreshSshTrustEntries === "function") {
        refreshSshTrustEntries({ silent: true }).catch(() => {});
      }
    }
  }

  function setDraftState(nextDraft) {
    clearPendingDeleteConfirmation();
    state.draftState = createDraftState(nextDraft, { defaultDeckId, defaultThemeProfile });
    renderDraft();
    return state.draftState;
  }

  function resetDraftFromSelectedProfile() {
    const selectedProfile = getSelectedProfile();
    if (selectedProfile) {
      return setDraftState({
        mode: "profile",
        profileId: selectedProfile.id,
        name: selectedProfile.name,
        launch: selectedProfile.launch
      });
    }
    const activeSession = getSessionById(getActiveSessionId());
    return setDraftState({
      mode: "blank",
      name: "New Local Connection",
      deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
      launch: buildBlankConnectionProfileLaunch({
        deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
        defaultThemeProfile,
        kind: "local"
      })
    });
  }

  function loadDraftFromActiveSession(sessionOrId = undefined) {
    const activeSessionId = getActiveSessionId();
    const session = sessionOrId
      ? (typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId)
      : getSessionById(activeSessionId);
    if (!session) {
      throw new Error("No active session to load into a connection profile draft.");
    }
    const launch = getLaunchForSession(session);
    if (!launch) {
      throw new Error("Session launch settings are incomplete and cannot seed a connection profile draft.");
    }
    return setDraftState({
      mode: "session",
      profileId: "",
      name: `${formatSessionDisplayName(session)} Profile`,
      launch
    });
  }

  function syncSelection() {
    if (!state.selectedProfileId || !state.profiles.some((entry) => entry.id === state.selectedProfileId)) {
      state.selectedProfileId = state.profiles[0]?.id || "";
    }
    if (state.pendingDeleteProfileId && state.pendingDeleteProfileId !== state.selectedProfileId) {
      clearPendingDeleteConfirmation();
    }
    if (selectEl) {
      selectEl.value = state.selectedProfileId;
      selectEl.disabled = state.profiles.length === 0;
    }
    if (applyBtn) {
      applyBtn.disabled = state.profiles.length === 0;
    }
    if (renameBtn) {
      renameBtn.disabled = state.profiles.length === 0;
    }
    if (duplicateBtn) {
      duplicateBtn.disabled = state.profiles.length === 0;
    }
    if (deleteBtn) {
      deleteBtn.disabled = state.profiles.length === 0;
    }
  }

  function render() {
    renderConnectionProfileProfileSelect({ selectEl, profiles: state.profiles, documentRef });
    syncSelection();
    if (!state.draftState || (state.draftState.mode === "profile" && !getProfile(state.draftState.profileId))) {
      resetDraftFromSelectedProfile();
    } else {
      renderDraft();
    }
    setStatus(state.profiles.length > 0 ? `${state.profiles.length} profile(s)` : "No saved connection profiles.");
  }

  function replaceProfiles(nextProfiles) {
    state.profiles = normalizeConnectionProfileCollection(nextProfiles);
    render();
    return state.profiles.slice();
  }

  function upsertProfile(profile) {
    const normalized = normalizeConnectionProfileRecord(profile);
    if (!normalized) {
      return null;
    }
    state.profiles = state.profiles.filter((entry) => entry.id !== normalized.id);
    state.profiles.push(normalized);
    state.profiles = normalizeConnectionProfileCollection(state.profiles);
    state.selectedProfileId = normalized.id;
    render();
    return normalized;
  }

  function requireUpsertedProfile(profile, operationLabel) {
    const normalized = upsertProfile(profile);
    if (normalized) {
      return normalized;
    }
    throw new Error(
      `Connection profile API returned an invalid profile record${normalizeText(operationLabel) ? ` for ${operationLabel}` : ""}.`
    );
  }

  function removeProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return false;
    }
    const beforeLength = state.profiles.length;
    state.profiles = state.profiles.filter((entry) => entry.id !== normalizedId);
    if (state.profiles.length === beforeLength) {
      return false;
    }
    if (state.selectedProfileId === normalizedId) {
      state.selectedProfileId = "";
    }
    render();
    return true;
  }

  function listProfiles() {
    return state.profiles.slice();
  }

  function resolveProfile(selectorText) {
    return resolveConnectionProfileToken(state.profiles, selectorText);
  }

  function getLaunchForSession(sessionOrId) {
    const session = typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId;
    return buildConnectionProfileLaunchFromSession(session, {
      defaultDeckId,
      normalizeThemeProfile
    });
  }

  function seedDraftOnMissingTrust(profile, launch) {
    setDraftState({
      mode: "blank",
      profileId: "",
      name: normalizeText(profile?.name) || "New SSH Connection",
      deckId: normalizeText(launch?.deckId) || defaultDeckId,
      launch
    });
  }

  function selectProfileForMissingTrust(profile) {
    if (normalizeText(state.selectedProfileId) === profile?.id) {
      return;
    }
    state.selectedProfileId = normalizeText(profile?.id);
    syncSelection();
    resetDraftFromSelectedProfile();
  }

  return {
    setStatus,
    getProfile,
    getSelectedProfile,
    getSelectedProfileId,
    setSelectedProfileId,
    getDraftState,
    getDraftStateSnapshot,
    readPersistedDraftLaunch,
    getDraftNameInputValue,
    clearPendingDeleteConfirmation,
    getPendingDeleteProfileId,
    setPendingDeleteProfileId,
    describeSshLaunchContext,
    getCurrentSshTrustTarget,
    shouldRenderSshTrustTarget,
    getSshLifecycleState,
    updateSshLifecycleState,
    setSelectedSshTrustEntryId,
    setSelectedSshProbeCandidateId,
    clearSshProbeCandidates,
    clearSshTrustState,
    getSshProbeCandidatesForTarget,
    getSshTrustEntriesForTarget,
    findSshTrustConflictEntry,
    syncDraftStateFromInputs,
    renderDraftComputedState,
    renderDraft,
    setDraftState,
    resetDraftFromSelectedProfile,
    loadDraftFromActiveSession,
    syncSelection,
    render,
    replaceProfiles,
    upsertProfile,
    requireUpsertedProfile,
    removeProfile,
    listProfiles,
    resolveProfile,
    getLaunchForSession,
    seedDraftOnMissingTrust,
    selectProfileForMissingTrust
  };
}
