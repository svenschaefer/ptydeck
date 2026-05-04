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
  getDraftModeMessage,
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
  buildSshTrustGuidance,
  buildSshTrustStatus,
  createConnectionProfileSshLifecycle,
  formatSshTarget,
  getSshTrustTargetKey,
  isSameSshTrustTarget,
  normalizeSshTrustTargetInput
} from "./connection-profile-ssh-lifecycle.js";

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
  let uiEventsBound = false;

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

  function getSshAuthHint(launch) {
    if (normalizeLower(launch?.kind) !== "ssh") {
      return "";
    }
    const method = normalizeLower(launch?.remoteAuth?.method);
    if (method === "password") {
      return "Password auth stores only the method. The password is requested in a masked launch dialog each time you start this SSH connection.";
    }
    if (method === "keyboardinteractive") {
      return "Keyboard-interactive auth stores only the method. The challenge secret is requested in a masked launch dialog each time you start this SSH connection.";
    }
    return "Private-key auth stores only the optional key path. No SSH secret is stored in the saved profile or one-shot launch payload.";
  }

  function getSshSecretHint(launch) {
    if (normalizeLower(launch?.kind) !== "ssh") {
      return "";
    }
    return authMethodRequiresSecret(launch?.remoteAuth)
      ? "Launching this SSH connection will request a masked runtime secret right before start."
      : "Launching this SSH connection will use key-based auth without prompting for a runtime secret.";
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
    const isSsh = normalizeLower(currentLaunch.kind) === "ssh";
    const authMethod = normalizeLower(currentLaunch?.remoteAuth?.method) || "privatekey";
    if (summaryEl) {
      summaryEl.textContent = selectedProfile
        ? formatConnectionProfileSummary(selectedProfile)
        : "No saved connection profile selected. You can still save and launch the draft below.";
    }
    if (sshFieldsEl) {
      sshFieldsEl.hidden = !isSsh;
    }
    if (draftRemotePrivateKeyFieldEl) {
      draftRemotePrivateKeyFieldEl.hidden = !isSsh || authMethod !== "privatekey";
    }
    if (authHintEl) {
      authHintEl.textContent = getSshAuthHint(currentLaunch);
    }
    if (secretHintEl) {
      secretHintEl.textContent = getSshSecretHint(currentLaunch);
    }
    if (runtimeSecretFieldEl) {
      runtimeSecretFieldEl.hidden = true;
    }
    if (runtimeSecretInputEl) {
      runtimeSecretInputEl.hidden = true;
      runtimeSecretInputEl.disabled = true;
      runtimeSecretInputEl.value = "";
    }
    if (draftLaunchTextareaEl) {
      draftLaunchTextareaEl.readOnly = true;
      draftLaunchTextareaEl.value = JSON.stringify(currentLaunch, null, 2);
    }
    setDraftStatus(getDraftModeMessage(draftState, { getProfile }));
    if (deleteBtn) {
      deleteBtn.textContent = pendingDeleteProfileId && pendingDeleteProfileId === selectedProfile?.id ? "Confirm Delete Saved" : "Delete Saved";
    }
    if (deleteConfirmEl) {
      deleteConfirmEl.hidden = !(selectedProfile && pendingDeleteProfileId === selectedProfile.id);
    }
    if (deleteConfirmMessageEl) {
      deleteConfirmMessageEl.textContent =
        selectedProfile && pendingDeleteProfileId === selectedProfile.id
          ? `Delete saved connection profile [${selectedProfile.id}] ${selectedProfile.name}? This removes only the saved profile, not any already running sessions.`
          : "";
    }

    const target = getCurrentSshTrustTarget();
    const matchingTrustEntries = getTrustEntriesForCurrentTarget();
    const probeCandidates = getSshProbeCandidatesForCurrentTarget();
    const trustOptions = matchingTrustEntries.length
      ? matchingTrustEntries.map((entry) => ({
          value: entry.id,
          label: `${entry.keyType} · ${entry.fingerprintSha256}`,
          documentRef
        }))
      : [
          {
            value: "",
            label: isSsh ? "No trusted keys for this SSH target" : "Switch to SSH to manage trust entries",
            disabled: true,
            documentRef
          }
        ];
    const hasSelectedTrustEntry = matchingTrustEntries.some((entry) => entry.id === selectedSshTrustEntryId);
    if (!hasSelectedTrustEntry) {
      selectedSshTrustEntryId = matchingTrustEntries[0]?.id || "";
    }
    const probeOptions = probeCandidates.length
      ? probeCandidates.map((entry) => ({
          value: entry.id,
          label: `${entry.keyType} · ${entry.fingerprintSha256}`,
          documentRef
        }))
      : [
          {
            value: "",
            label: isSsh ? "Fetch host keys to review one before trusting it" : "Switch to SSH to fetch host keys",
            disabled: true,
            documentRef
          }
        ];
    const hasSelectedProbeCandidate = probeCandidates.some((entry) => entry.id === selectedSshProbeCandidateId);
    if (!hasSelectedProbeCandidate) {
      selectedSshProbeCandidateId = probeCandidates[0]?.id || "";
    }
    setSelectOptions(sshProbeSelectEl, probeOptions, selectedSshProbeCandidateId || probeOptions[0]?.value || "");
    setSelectOptions(sshTrustSelectEl, trustOptions, selectedSshTrustEntryId || trustOptions[0]?.value || "");
    const selectedProbeCandidate = probeCandidates.find((entry) => entry.id === selectedSshProbeCandidateId) || null;
    const selectedTrustEntry = matchingTrustEntries.find((entry) => entry.id === selectedSshTrustEntryId) || null;
    const selectedConflictEntry = target && selectedProbeCandidate ? findSshTrustConflictEntry(target, selectedProbeCandidate) : null;
    const selectedPreview = selectedProbeCandidate || selectedTrustEntry;
    if (sshTrustKeyTypeInputEl) {
      sshTrustKeyTypeInputEl.value = selectedPreview?.keyType || "";
      sshTrustKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustFingerprintInputEl) {
      sshTrustFingerprintInputEl.value = selectedPreview?.fingerprintSha256 || "";
      sshTrustFingerprintInputEl.readOnly = true;
    }
    if (sshTrustPublicKeyTextareaEl) {
      sshTrustPublicKeyTextareaEl.value = selectedPreview?.publicKey || "";
      sshTrustPublicKeyTextareaEl.readOnly = true;
    }
    if (sshTrustGuidanceEl) {
      sshTrustGuidanceEl.textContent = buildSshTrustGuidance({
        isSsh,
        target,
        matchingTrustEntries,
        probeCandidates,
        conflictEntry: selectedConflictEntry
      });
    }
    if (sshTrustStatusEl) {
      sshTrustStatusEl.textContent = buildSshTrustStatus({
        isSsh,
        target,
        matchingTrustEntries,
        probeCandidates,
        conflictEntry: selectedConflictEntry,
        probing: probingSshHostKeys
      });
    }
    if (sshTrustCompareEl) {
      sshTrustCompareEl.hidden = !selectedConflictEntry;
    }
    if (sshTrustCompareStatusEl) {
      sshTrustCompareStatusEl.textContent = selectedConflictEntry && selectedProbeCandidate
        ? `${selectedConflictEntry.fingerprintSha256} -> ${selectedProbeCandidate.fingerprintSha256}`
        : "";
    }
    if (sshTrustCurrentKeyTypeInputEl) {
      sshTrustCurrentKeyTypeInputEl.value = selectedConflictEntry?.keyType || "";
      sshTrustCurrentKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustCurrentFingerprintInputEl) {
      sshTrustCurrentFingerprintInputEl.value = selectedConflictEntry?.fingerprintSha256 || "";
      sshTrustCurrentFingerprintInputEl.readOnly = true;
    }
    if (sshTrustCandidateKeyTypeInputEl) {
      sshTrustCandidateKeyTypeInputEl.value = selectedConflictEntry ? selectedProbeCandidate?.keyType || "" : "";
      sshTrustCandidateKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustCandidateFingerprintInputEl) {
      sshTrustCandidateFingerprintInputEl.value = selectedConflictEntry ? selectedProbeCandidate?.fingerprintSha256 || "" : "";
      sshTrustCandidateFingerprintInputEl.readOnly = true;
    }
    if (sshTrustProbeBtn) {
      sshTrustProbeBtn.disabled = typeof api.probeSshHostKeys !== "function" || !isSsh || !target || probingSshHostKeys;
    }
    if (sshTrustRefreshBtn) {
      sshTrustRefreshBtn.disabled = typeof api.listSshTrustEntries !== "function" || !isSsh || loadingSshTrustEntries;
    }
    if (sshTrustSaveBtn) {
      sshTrustSaveBtn.disabled = typeof api.createSshTrustEntry !== "function" || !isSsh || !selectedProbeCandidate || Boolean(selectedConflictEntry);
    }
    if (sshTrustDeleteBtn) {
      sshTrustDeleteBtn.disabled = typeof api.deleteSshTrustEntry !== "function" || !selectedSshTrustEntryId;
    }
    if (sshTrustReplaceBtn) {
      sshTrustReplaceBtn.disabled =
        typeof api.createSshTrustEntry !== "function" ||
        typeof api.deleteSshTrustEntry !== "function" ||
        !isSsh ||
        !target ||
        !selectedProbeCandidate ||
        !selectedConflictEntry;
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

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    selectEl?.addEventListener?.("change", () => {
      selectedProfileId = normalizeText(selectEl.value);
      syncSelection();
      resetDraftFromSelectedProfile();
    });
    const bindDraftSync = (element, eventName = "input") => {
      element?.addEventListener?.(eventName, () => {
        syncDraftStateFromInputs();
      });
    };
    newBtn?.addEventListener?.("click", () => {
      newDraftFlow("local").catch((error) => setError(getErrorMessage(error, "Failed to open a new local connection profile draft.")));
    });
    newSshBtn?.addEventListener?.("click", () => {
      newDraftFlow("ssh").catch((error) => setError(getErrorMessage(error, "Failed to open a new SSH connection profile draft.")));
    });
    saveBtn?.addEventListener?.("click", () => {
      loadActiveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to load the active session into a connection profile draft.")));
    });
    saveDraftBtn?.addEventListener?.("click", () => {
      saveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to save the connection profile draft.")));
    });
    saveAndLaunchBtn?.addEventListener?.("click", () => {
      saveAndLaunchDraftFlow().catch((error) =>
        setError(getErrorMessage(error, "Failed to save and launch the connection profile draft."))
      );
    });
    resetDraftBtn?.addEventListener?.("click", () => {
      resetDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to reset the connection profile draft.")));
    });
    applyBtn?.addEventListener?.("click", () => {
      applySelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply connection profile.")));
    });
    duplicateBtn?.addEventListener?.("click", () => {
      duplicateSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to duplicate connection profile.")));
    });
    renameBtn?.addEventListener?.("click", () => {
      renameSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename connection profile.")));
    });
    deleteBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete connection profile.")));
    });
    deleteConfirmBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete connection profile.")));
    });
    deleteCancelBtn?.addEventListener?.("click", () => {
      cancelDeleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to cancel connection profile deletion.")));
    });
    sshTrustRefreshBtn?.addEventListener?.("click", () => {
      refreshSshTrustEntries().catch((error) => setError(getErrorMessage(error, "Failed to load SSH trust entries.")));
    });
    sshTrustProbeBtn?.addEventListener?.("click", () => {
      probeSshHostKeysFlow().catch((error) => setError(getErrorMessage(error, "Failed to fetch SSH host keys.")));
    });
    sshTrustSaveBtn?.addEventListener?.("click", () => {
      saveTrustEntryFlow().catch((error) => setError(getErrorMessage(error, "Failed to trust SSH host key.")));
    });
    sshTrustDeleteBtn?.addEventListener?.("click", () => {
      deleteTrustEntryFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete SSH trust entry.")));
    });
    sshTrustReplaceBtn?.addEventListener?.("click", () => {
      replaceTrustEntryFlow().catch((error) => setError(getErrorMessage(error, "Failed to replace SSH trust entry.")));
    });
    sshTrustSelectEl?.addEventListener?.("change", () => {
      selectedSshTrustEntryId = normalizeText(sshTrustSelectEl.value);
      renderDraftComputedState();
    });
    sshProbeSelectEl?.addEventListener?.("change", () => {
      selectedSshProbeCandidateId = normalizeText(sshProbeSelectEl.value);
      renderDraftComputedState();
    });
    bindDraftSync(draftNameInputEl);
    bindDraftSync(draftKindSelectEl, "change");
    bindDraftSync(draftDeckSelectEl, "change");
    bindDraftSync(draftShellInputEl);
    bindDraftSync(draftStartCwdInputEl);
    bindDraftSync(draftStartCommandTextareaEl);
    bindDraftSync(draftEnvTextareaEl);
    bindDraftSync(draftTagsInputEl);
    bindDraftSync(draftActiveThemeSelectEl, "change");
    bindDraftSync(draftInactiveThemeSelectEl, "change");
    bindDraftSync(draftRemoteHostInputEl);
    bindDraftSync(draftRemotePortInputEl);
    bindDraftSync(draftRemoteUsernameInputEl);
    bindDraftSync(draftRemoteAuthMethodSelectEl, "change");
    bindDraftSync(draftRemotePrivateKeyPathInputEl);
    bindDraftSync(sshTrustKeyTypeInputEl);
    bindDraftSync(sshTrustPublicKeyTextareaEl);
  }

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
