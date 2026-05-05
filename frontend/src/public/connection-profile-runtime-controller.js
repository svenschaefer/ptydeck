import { createConnectionProfileRuntimeActions } from "./connection-profile-runtime-actions.js";
import {
  buildBlankConnectionProfileLaunch,
  buildConnectionProfileLaunchFromSession,
  buildPersistedDraftLaunch,
  cloneDraftLaunch,
  cloneRemoteAuth,
  cloneRemoteConnection,
  cloneStringRecord,
  cloneThemeProfile,
  createDraftState,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  formatStringRecord,
  formatTags,
  getDeckOptionsForDraft,
  getDraftLaunchFromInputs,
  getThemePresetSelectOptions,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileCollection,
  normalizeConnectionProfileRecord,
  normalizeLower,
  normalizeTagList,
  normalizeText,
  normalizeThemePresetCollection,
  parseStringRecord,
  parseTags,
  resolveConnectionProfileToken,
  resolveThemePresetSelectionId,
  resolveThemeProfileFromSelection,
  themeProfilesEqual
} from "./connection-profile-draft-state.js";
import {
  createConnectionProfileSshLifecycle,
  formatSshTarget,
  getSshTrustTargetKey,
  isSameSshTrustTarget,
  normalizeSshTrustTargetInput
} from "./connection-profile-ssh-lifecycle.js";
import {
  buildConnectionProfileDraftViewState
} from "./connection-profile-runtime-view-state.js";
import { createConnectionProfileUiBindings } from "./connection-profile-ui-bindings.js";

function clearChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export {
  buildConnectionProfileLaunchFromSession,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  resolveConnectionProfileToken
} from "./connection-profile-draft-state.js";

function authMethodRequiresSecret(remoteAuth) {
  const method = normalizeLower(remoteAuth?.method);
  return method === "password" || method === "keyboardinteractive";
}

function setSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }
  clearChildren(selectEl);
  for (const optionConfig of Array.isArray(options) ? options : []) {
    const option = optionConfig.documentRef?.createElement?.("option") || {
      value: "",
      textContent: "",
      selected: false,
      disabled: false
    };
    option.value = String(optionConfig.value || "");
    option.textContent = String(optionConfig.label || option.value);
    option.selected = option.value === String(selectedValue || "");
    option.disabled = optionConfig.disabled === true;
    selectEl.appendChild(option);
  }
  selectEl.value = String(selectedValue || "");
}

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const selectEl = options.selectEl || null;
  const newBtn = options.newBtn || null;
  const newSshBtn = options.newSshBtn || null;
  const saveBtn = options.saveBtn || null;
  const saveDraftBtn = options.saveDraftBtn || null;
  const saveAndLaunchBtn = options.saveAndLaunchBtn || null;
  const resetDraftBtn = options.resetDraftBtn || null;
  const applyBtn = options.applyBtn || null;
  const duplicateBtn = options.duplicateBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const deleteConfirmEl = options.deleteConfirmEl || null;
  const deleteConfirmMessageEl = options.deleteConfirmMessageEl || null;
  const deleteConfirmBtn = options.deleteConfirmBtn || null;
  const deleteCancelBtn = options.deleteCancelBtn || null;
  const statusEl = options.statusEl || null;
  const summaryEl = options.summaryEl || null;
  const draftNameInputEl = options.draftNameInputEl || null;
  const draftKindSelectEl = options.draftKindSelectEl || null;
  const draftDeckSelectEl = options.draftDeckSelectEl || null;
  const draftShellInputEl = options.draftShellInputEl || null;
  const draftStartCwdInputEl = options.draftStartCwdInputEl || null;
  const draftStartCommandTextareaEl = options.draftStartCommandTextareaEl || null;
  const draftEnvTextareaEl = options.draftEnvTextareaEl || null;
  const draftTagsInputEl = options.draftTagsInputEl || null;
  const draftActiveThemeSelectEl = options.draftActiveThemeSelectEl || null;
  const draftInactiveThemeSelectEl = options.draftInactiveThemeSelectEl || null;
  const sshFieldsEl = options.sshFieldsEl || null;
  const draftRemoteHostInputEl = options.draftRemoteHostInputEl || null;
  const draftRemotePortInputEl = options.draftRemotePortInputEl || null;
  const draftRemoteUsernameInputEl = options.draftRemoteUsernameInputEl || null;
  const draftRemoteAuthMethodSelectEl = options.draftRemoteAuthMethodSelectEl || null;
  const draftRemotePrivateKeyFieldEl = options.draftRemotePrivateKeyFieldEl || null;
  const draftRemotePrivateKeyPathInputEl = options.draftRemotePrivateKeyPathInputEl || null;
  const authHintEl = options.authHintEl || null;
  const secretHintEl = options.secretHintEl || null;
  const runtimeSecretFieldEl = options.runtimeSecretFieldEl || null;
  const runtimeSecretInputEl = options.runtimeSecretInputEl || null;
  const sshTrustStatusEl = options.sshTrustStatusEl || null;
  const sshTrustGuidanceEl = options.sshTrustGuidanceEl || null;
  const sshTrustProbeBtn = options.sshTrustProbeBtn || null;
  const sshProbeSelectEl = options.sshProbeSelectEl || null;
  const sshTrustSelectEl = options.sshTrustSelectEl || null;
  const sshTrustKeyTypeInputEl = options.sshTrustKeyTypeInputEl || null;
  const sshTrustFingerprintInputEl = options.sshTrustFingerprintInputEl || null;
  const sshTrustPublicKeyTextareaEl = options.sshTrustPublicKeyTextareaEl || null;
  const sshTrustCompareEl = options.sshTrustCompareEl || null;
  const sshTrustCompareStatusEl = options.sshTrustCompareStatusEl || null;
  const sshTrustCurrentKeyTypeInputEl = options.sshTrustCurrentKeyTypeInputEl || null;
  const sshTrustCurrentFingerprintInputEl = options.sshTrustCurrentFingerprintInputEl || null;
  const sshTrustCandidateKeyTypeInputEl = options.sshTrustCandidateKeyTypeInputEl || null;
  const sshTrustCandidateFingerprintInputEl = options.sshTrustCandidateFingerprintInputEl || null;
  const sshTrustRefreshBtn = options.sshTrustRefreshBtn || null;
  const sshTrustSaveBtn = options.sshTrustSaveBtn || null;
  const sshTrustDeleteBtn = options.sshTrustDeleteBtn || null;
  const sshTrustReplaceBtn = options.sshTrustReplaceBtn || null;
  const draftLaunchTextareaEl = options.draftLaunchTextareaEl || null;
  const draftStatusEl = options.draftStatusEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId) => (Array.isArray(getSessions()) ? getSessions().find((session) => session.id === sessionId) || null : null);
  const getActiveSessionId = typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const setActiveSession = typeof options.setActiveSession === "function" ? options.setActiveSession : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => false;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestSecret = typeof options.requestSecret === "function" ? options.requestSecret : null;
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => session?.name || String(session?.id || "");
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (value) => (value && typeof value === "object" ? value : {});
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const themePresets = normalizeThemePresetCollection(options.themePresets);
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;
  const hasGuidedDraftControls = Boolean(
    draftKindSelectEl ||
      draftDeckSelectEl ||
      draftShellInputEl ||
      draftStartCwdInputEl ||
      draftStartCommandTextareaEl ||
      draftEnvTextareaEl ||
      draftTagsInputEl
  );

  let profiles = [];
  let selectedProfileId = "";
  let draftState = null;
  let sshTrustEntries = [];
  let selectedSshTrustEntryId = "";
  let sshHostKeyProbeCandidates = [];
  let selectedSshProbeCandidateId = "";
  let probingSshHostKeys = false;
  let sshProbeTargetKey = "";
  let pendingDeleteProfileId = "";
  let isRenderingDraft = false;
  let loadingSshTrustEntries = false;

  function getSshLifecycleState() {
    return {
      sshTrustEntries,
      selectedSshTrustEntryId,
      sshHostKeyProbeCandidates,
      selectedSshProbeCandidateId,
      probingSshHostKeys,
      sshProbeTargetKey,
      loadingSshTrustEntries
    };
  }

  function updateSshLifecycleState(patch = {}) {
    if (Object.prototype.hasOwnProperty.call(patch, "sshTrustEntries")) {
      sshTrustEntries = Array.isArray(patch.sshTrustEntries) ? patch.sshTrustEntries : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "selectedSshTrustEntryId")) {
      selectedSshTrustEntryId = normalizeText(patch.selectedSshTrustEntryId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sshHostKeyProbeCandidates")) {
      sshHostKeyProbeCandidates = Array.isArray(patch.sshHostKeyProbeCandidates) ? patch.sshHostKeyProbeCandidates : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "selectedSshProbeCandidateId")) {
      selectedSshProbeCandidateId = normalizeText(patch.selectedSshProbeCandidateId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "probingSshHostKeys")) {
      probingSshHostKeys = patch.probingSshHostKeys === true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sshProbeTargetKey")) {
      sshProbeTargetKey = normalizeText(patch.sshProbeTargetKey);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "loadingSshTrustEntries")) {
      loadingSshTrustEntries = patch.loadingSshTrustEntries === true;
    }
  }

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = normalizeText(message);
    }
  }

  function getProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return null;
    }
    return profiles.find((entry) => entry.id === normalizedId) || null;
  }

  function getSelectedProfile() {
    return getProfile(selectedProfileId);
  }

  function readDraftLaunchFromInputs() {
    return getDraftLaunchFromInputs({
      hasGuidedDraftControls,
      rawDraftLaunch: draftLaunchTextareaEl?.value,
      draftState,
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

  function setDraftStatus(message) {
    if (draftStatusEl) {
      draftStatusEl.textContent = normalizeText(message);
    }
  }

  function getDraftNameInputValue() {
    return normalizeText(draftNameInputEl?.value || draftState?.name);
  }

  function clearPendingDeleteConfirmation() {
    pendingDeleteProfileId = "";
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
    if (normalizeLower(draftLaunch.kind) !== "ssh") {
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
    return sshTrustEntries.filter((entry) => entry.host === target.host && entry.port === target.port);
  }

  function getSshProbeCandidatesForCurrentTarget() {
    const target = getCurrentSshTrustTarget();
    if (!target || getSshTrustTargetKey(target) !== sshProbeTargetKey) {
      return [];
    }
    return sshHostKeyProbeCandidates.slice();
  }

  function getSshProbeCandidatesForTarget(target) {
    const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
    return getSshTrustTargetKey(normalizedTarget) === sshProbeTargetKey ? sshHostKeyProbeCandidates.slice() : [];
  }

  function getSshTrustEntriesForTarget(target) {
    const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
    return sshTrustEntries.filter((entry) => entry.host === normalizedTarget.host && entry.port === normalizedTarget.port);
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
    if (!draftState || isRenderingDraft) {
      return;
    }
    const previousTargetKey = getSshTrustTargetKey(draftState.launch?.remoteConnection);
    const nextLaunch = readDraftLaunchFromInputs();
    draftState = {
      ...draftState,
      name: normalizeText(draftNameInputEl?.value || draftState.name),
      launch: nextLaunch
    };
    if (getSshTrustTargetKey(nextLaunch?.remoteConnection) !== previousTargetKey) {
      clearSshProbeCandidates();
    }
    renderDraftComputedState();
  }

  function renderDraftComputedState() {
    if (!draftState) {
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
      draftState,
      getProfile,
      selectedProfile,
      currentLaunch,
      pendingDeleteProfileId,
      target,
      matchingTrustEntries,
      probeCandidates,
      selectedSshTrustEntryId,
      selectedSshProbeCandidateId,
      probingSshHostKeys,
      loadingSshTrustEntries,
      documentRef,
      api
    });
    selectedSshTrustEntryId = viewState.selectedSshTrustEntryId;
    selectedSshProbeCandidateId = viewState.selectedSshProbeCandidateId;
    if (summaryEl) {
      summaryEl.textContent = viewState.summaryText;
    }
    if (sshFieldsEl) {
      sshFieldsEl.hidden = viewState.sshFieldsHidden;
    }
    if (draftRemotePrivateKeyFieldEl) {
      draftRemotePrivateKeyFieldEl.hidden = viewState.privateKeyFieldHidden;
    }
    if (authHintEl) {
      authHintEl.textContent = viewState.authHintText;
    }
    if (secretHintEl) {
      secretHintEl.textContent = viewState.secretHintText;
    }
    if (runtimeSecretFieldEl) {
      runtimeSecretFieldEl.hidden = viewState.runtimeSecretFieldHidden;
    }
    if (runtimeSecretInputEl) {
      runtimeSecretInputEl.hidden = viewState.runtimeSecretInputHidden;
      runtimeSecretInputEl.disabled = viewState.runtimeSecretInputDisabled;
      runtimeSecretInputEl.value = viewState.runtimeSecretInputValue;
    }
    if (draftLaunchTextareaEl) {
      draftLaunchTextareaEl.readOnly = true;
      draftLaunchTextareaEl.value = viewState.draftLaunchJson;
    }
    setDraftStatus(viewState.draftStatusText);
    if (deleteBtn) {
      deleteBtn.textContent = viewState.deleteButtonText;
    }
    if (deleteConfirmEl) {
      deleteConfirmEl.hidden = viewState.deleteConfirmHidden;
    }
    if (deleteConfirmMessageEl) {
      deleteConfirmMessageEl.textContent = viewState.deleteConfirmMessageText;
    }
    setSelectOptions(sshProbeSelectEl, viewState.probeOptions, selectedSshProbeCandidateId || viewState.probeOptions[0]?.value || "");
    setSelectOptions(sshTrustSelectEl, viewState.trustOptions, selectedSshTrustEntryId || viewState.trustOptions[0]?.value || "");
    if (sshTrustKeyTypeInputEl) {
      sshTrustKeyTypeInputEl.value = viewState.trustKeyTypeValue;
      sshTrustKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustFingerprintInputEl) {
      sshTrustFingerprintInputEl.value = viewState.trustFingerprintValue;
      sshTrustFingerprintInputEl.readOnly = true;
    }
    if (sshTrustPublicKeyTextareaEl) {
      sshTrustPublicKeyTextareaEl.value = viewState.trustPublicKeyValue;
      sshTrustPublicKeyTextareaEl.readOnly = true;
    }
    if (sshTrustGuidanceEl) {
      sshTrustGuidanceEl.textContent = viewState.trustGuidanceText;
    }
    if (sshTrustStatusEl) {
      sshTrustStatusEl.textContent = viewState.trustStatusText;
    }
    if (sshTrustCompareEl) {
      sshTrustCompareEl.hidden = viewState.trustCompareHidden;
    }
    if (sshTrustCompareStatusEl) {
      sshTrustCompareStatusEl.textContent = viewState.trustCompareStatusText;
    }
    if (sshTrustCurrentKeyTypeInputEl) {
      sshTrustCurrentKeyTypeInputEl.value = viewState.trustCurrentKeyTypeValue;
      sshTrustCurrentKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustCurrentFingerprintInputEl) {
      sshTrustCurrentFingerprintInputEl.value = viewState.trustCurrentFingerprintValue;
      sshTrustCurrentFingerprintInputEl.readOnly = true;
    }
    if (sshTrustCandidateKeyTypeInputEl) {
      sshTrustCandidateKeyTypeInputEl.value = viewState.trustCandidateKeyTypeValue;
      sshTrustCandidateKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustCandidateFingerprintInputEl) {
      sshTrustCandidateFingerprintInputEl.value = viewState.trustCandidateFingerprintValue;
      sshTrustCandidateFingerprintInputEl.readOnly = true;
    }
    if (sshTrustProbeBtn) {
      sshTrustProbeBtn.disabled = viewState.trustProbeDisabled;
    }
    if (sshTrustRefreshBtn) {
      sshTrustRefreshBtn.disabled = viewState.trustRefreshDisabled;
    }
    if (sshTrustSaveBtn) {
      sshTrustSaveBtn.disabled = viewState.trustSaveDisabled;
    }
    if (sshTrustDeleteBtn) {
      sshTrustDeleteBtn.disabled = viewState.trustDeleteDisabled;
    }
    if (sshTrustReplaceBtn) {
      sshTrustReplaceBtn.disabled = viewState.trustReplaceDisabled;
    }
  }

  function renderDraft() {
    if (!draftState) {
      return;
    }
    const currentLaunch = cloneDraftLaunch(draftState.launch, { defaultDeckId, defaultThemeProfile });
    isRenderingDraft = true;
    if (draftNameInputEl) {
      draftNameInputEl.value = draftState.name;
    }
    setSelectOptions(
      draftKindSelectEl,
      [
        { value: "local", label: "Local", documentRef },
        { value: "ssh", label: "SSH", documentRef }
      ],
      currentLaunch.kind
    );
    setSelectOptions(
      draftDeckSelectEl,
      getDeckOptionsForDraft(draftState, { defaultDeckId, getDecks, documentRef }),
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
    setSelectOptions(
      draftActiveThemeSelectEl,
      getThemePresetSelectOptions(themePresets, activeThemeSelection, documentRef),
      activeThemeSelection
    );
    setSelectOptions(
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
    setSelectOptions(
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
    isRenderingDraft = false;
    renderDraftComputedState();
    if (normalizeLower(currentLaunch.kind) === "ssh") {
      refreshSshTrustEntries({ silent: true }).catch(() => {});
    }
  }

  function setDraftState(nextDraft) {
    clearPendingDeleteConfirmation();
    draftState = createDraftState(nextDraft, { defaultDeckId, defaultThemeProfile });
    renderDraft();
    return draftState;
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
    if (!selectedProfileId || !profiles.some((entry) => entry.id === selectedProfileId)) {
      selectedProfileId = profiles[0]?.id || "";
    }
    if (pendingDeleteProfileId && pendingDeleteProfileId !== selectedProfileId) {
      clearPendingDeleteConfirmation();
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
    if (duplicateBtn) {
      duplicateBtn.disabled = profiles.length === 0;
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
        option.textContent = "No connection profiles";
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
    if (!draftState || (draftState.mode === "profile" && !getProfile(draftState.profileId))) {
      resetDraftFromSelectedProfile();
    } else {
      renderDraft();
    }
    setStatus(profiles.length > 0 ? `${profiles.length} profile(s)` : "No saved connection profiles.");
  }

  function replaceProfiles(nextProfiles) {
    profiles = normalizeConnectionProfileCollection(nextProfiles);
    render();
    return profiles.slice();
  }

  function upsertProfile(profile) {
    const normalized = normalizeConnectionProfileRecord(profile);
    if (!normalized) {
      return null;
    }
    profiles = profiles.filter((entry) => entry.id !== normalized.id);
    profiles.push(normalized);
    profiles = normalizeConnectionProfileCollection(profiles);
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
      `Connection profile API returned an invalid profile record${normalizeText(operationLabel) ? ` for ${operationLabel}` : ""}.`
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

  function resolveProfile(selectorText) {
    return resolveConnectionProfileToken(profiles, selectorText);
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
    if (normalizeText(selectedProfileId) === profile?.id) {
      return;
    }
    selectedProfileId = normalizeText(profile?.id);
    syncSelection();
    resetDraftFromSelectedProfile();
  }

  const sshLifecycle = createConnectionProfileSshLifecycle({
    api,
    defaultDeckId,
    normalizeText,
    normalizeLower,
    authMethodRequiresSecret,
    requestSecret,
    describeSshLaunchContext,
    getErrorMessage,
    getState: getSshLifecycleState,
    updateState: updateSshLifecycleState,
    getCurrentSshTrustTarget,
    shouldRenderSshTrustTarget,
    renderDraftComputedState,
    setCommandFeedback,
    setStatus,
    getSshProbeCandidatesForTarget,
    getSshTrustEntriesForTarget,
    findSshTrustConflictEntry,
    seedDraftOnMissingTrust,
    selectProfileForMissingTrust
  });

  const {
    refreshSshTrustEntries,
    promptForLaunchSecret,
    ensureTrustedHostKeyBeforeLaunch,
    probeSshHostKeysForTarget,
    probeSshHostKeysFlow,
    saveTrustEntryForTarget,
    saveTrustEntryFlow,
    replaceTrustEntryForTarget,
    replaceTrustEntryFlow,
    listSshTrustEntriesForTarget,
    deleteTrustEntryForTarget,
    deleteTrustEntryFlow
  } = sshLifecycle;

  const runtimeActions = createConnectionProfileRuntimeActions({
    api,
    defaultDeckId,
    defaultThemeProfile,
    normalizeText,
    normalizeLower,
    getErrorMessage,
    getSessionById,
    getActiveSessionId,
    getLaunchForSession,
    getProfile,
    getSelectedProfile,
    requireUpsertedProfile,
    removeProfile,
    replaceProfiles,
    listProfiles,
    promptForLaunchSecret,
    ensureTrustedHostKeyBeforeLaunch,
    runtimeSecretInputEl,
    applyRuntimeEvent,
    setActiveDeck,
    setActiveSession,
    requestRender,
    formatSessionToken,
    formatSessionDisplayName,
    buildPersistedDraftLaunch: readPersistedDraftLaunch,
    normalizeConnectionLaunch: normalizeConnectionProfileLaunch,
    getDraftState: () => draftState,
    setDraftState,
    clearSshTrustState,
    refreshSshTrustEntries,
    setError,
    setCommandFeedback,
    setStatus,
    windowRef,
    buildBlankConnectionProfileLaunch,
    loadDraftFromActiveSession,
    resetDraftFromSelectedProfile,
    getDraftNameInputValue,
    clearPendingDeleteConfirmation,
    renderDraftComputedState,
    getPendingDeleteProfileId: () => pendingDeleteProfileId,
    setPendingDeleteProfileId: (value) => {
      pendingDeleteProfileId = normalizeText(value);
    }
  });

  const {
    createProfileFromSession,
    applyProfileById,
    renameProfileById,
    duplicateProfileById,
    deleteProfileById,
    launchConnectionLaunch,
    saveDraftById,
    saveAndLaunchDraftFlow,
    loadProfiles,
    createProfileFlow,
    newDraftFlow,
    loadActiveDraftFlow,
    saveDraftFlow,
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    requestDeleteSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow
  } = runtimeActions;

  const { bindUiEvents } = createConnectionProfileUiBindings({
    normalizeText,
    getErrorMessage,
    setError,
    selectEl,
    newBtn,
    newSshBtn,
    saveBtn,
    saveDraftBtn,
    saveAndLaunchBtn,
    resetDraftBtn,
    applyBtn,
    duplicateBtn,
    renameBtn,
    deleteBtn,
    deleteConfirmBtn,
    deleteCancelBtn,
    sshTrustRefreshBtn,
    sshTrustProbeBtn,
    sshTrustSaveBtn,
    sshTrustDeleteBtn,
    sshTrustReplaceBtn,
    sshTrustSelectEl,
    sshProbeSelectEl,
    setSelectedProfileId: (value) => {
      selectedProfileId = value;
    },
    syncSelection,
    resetDraftFromSelectedProfile,
    syncDraftStateFromInputs,
    newDraftFlow,
    loadActiveDraftFlow,
    saveDraftFlow,
    saveAndLaunchDraftFlow,
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow,
    refreshSshTrustEntries,
    probeSshHostKeysFlow,
    saveTrustEntryFlow,
    deleteTrustEntryFlow,
    replaceTrustEntryFlow,
    setSelectedSshTrustEntryId: (value) => {
      selectedSshTrustEntryId = value;
    },
    setSelectedSshProbeCandidateId: (value) => {
      selectedSshProbeCandidateId = value;
    },
    renderDraftComputedState,
    draftInputElements: [
      draftNameInputEl,
      { element: draftKindSelectEl, eventName: "change" },
      { element: draftDeckSelectEl, eventName: "change" },
      draftShellInputEl,
      draftStartCwdInputEl,
      draftStartCommandTextareaEl,
      draftEnvTextareaEl,
      draftTagsInputEl,
      { element: draftActiveThemeSelectEl, eventName: "change" },
      { element: draftInactiveThemeSelectEl, eventName: "change" },
      draftRemoteHostInputEl,
      draftRemotePortInputEl,
      draftRemoteUsernameInputEl,
      { element: draftRemoteAuthMethodSelectEl, eventName: "change" },
      draftRemotePrivateKeyPathInputEl,
      sshTrustKeyTypeInputEl,
      sshTrustPublicKeyTextareaEl
    ]
  });

  bindUiEvents();
  render();

  return {
    listProfiles,
    getProfile,
    getSelectedProfile,
    getSelectedProfileId: () => selectedProfileId,
    resolveProfile,
    replaceProfiles,
    upsertProfile,
    removeProfile,
    getLaunchForSession,
    createProfileFromSession,
    launchConnectionLaunch,
    saveDraftById,
    loadDraftFromActiveSession,
    setDraftState,
    getDraftState: () => (draftState ? { ...draftState, launch: normalizeConnectionProfileLaunch(draftState.launch) } : null),
    applyProfileById,
    renameProfileById,
    duplicateProfileById,
    deleteProfileById,
    loadProfiles,
    createProfileFlow,
    newDraftFlow,
    loadActiveDraftFlow,
    saveDraftFlow,
    saveAndLaunchDraftFlow,
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    requestDeleteSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow,
    refreshSshTrustEntries,
    listSshTrustEntriesForTarget,
    probeSshHostKeysForTarget,
    saveTrustEntryForTarget,
    replaceTrustEntryForTarget,
    deleteTrustEntryForTarget,
    saveTrustEntryFlow,
    replaceTrustEntryFlow,
    deleteTrustEntryFlow,
    bindUiEvents,
    render
  };
}
