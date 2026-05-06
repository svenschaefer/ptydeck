import { createConnectionProfileRuntimeActions } from "./connection-profile-runtime-actions.js";
import {
  buildBlankConnectionProfileLaunch,
  cloneThemeProfile,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord
} from "./connection-profile-draft-state.js";
import { createConnectionProfileRuntimePresentation } from "./connection-profile-runtime-presentation.js";
import { createConnectionProfileSshLifecycle } from "./connection-profile-ssh-lifecycle.js";
import { createConnectionProfileUiBindings } from "./connection-profile-ui-bindings.js";

export {
  buildConnectionProfileLaunchFromSession,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  resolveConnectionProfileToken
} from "./connection-profile-draft-state.js";

function normalizeTextValue(value) {
  return String(value || "").trim();
}

function normalizeLowerValue(value) {
  return normalizeTextValue(value).toLowerCase();
}

function authMethodRequiresSecret(remoteAuth) {
  const method = normalizeLowerValue(remoteAuth?.method);
  return method === "password" || method === "keyboardinteractive";
}

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
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
  const defaultDeckId = normalizeTextValue(options.defaultDeckId) || "default";
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;

  let refreshSshTrustEntriesRef = async () => [];

  const presentation = createConnectionProfileRuntimePresentation({
    documentRef,
    api,
    refs: {
      selectEl: options.selectEl,
      applyBtn: options.applyBtn,
      duplicateBtn: options.duplicateBtn,
      renameBtn: options.renameBtn,
      deleteBtn: options.deleteBtn,
      deleteConfirmEl: options.deleteConfirmEl,
      deleteConfirmMessageEl: options.deleteConfirmMessageEl,
      statusEl: options.statusEl,
      summaryEl: options.summaryEl,
      draftNameInputEl: options.draftNameInputEl,
      draftKindSelectEl: options.draftKindSelectEl,
      draftDeckSelectEl: options.draftDeckSelectEl,
      draftShellInputEl: options.draftShellInputEl,
      draftStartCwdInputEl: options.draftStartCwdInputEl,
      draftStartCommandTextareaEl: options.draftStartCommandTextareaEl,
      draftEnvTextareaEl: options.draftEnvTextareaEl,
      draftTagsInputEl: options.draftTagsInputEl,
      draftActiveThemeSelectEl: options.draftActiveThemeSelectEl,
      draftInactiveThemeSelectEl: options.draftInactiveThemeSelectEl,
      sshFieldsEl: options.sshFieldsEl,
      draftRemoteHostInputEl: options.draftRemoteHostInputEl,
      draftRemotePortInputEl: options.draftRemotePortInputEl,
      draftRemoteUsernameInputEl: options.draftRemoteUsernameInputEl,
      draftRemoteAuthMethodSelectEl: options.draftRemoteAuthMethodSelectEl,
      draftRemotePrivateKeyFieldEl: options.draftRemotePrivateKeyFieldEl,
      draftRemotePrivateKeyPathInputEl: options.draftRemotePrivateKeyPathInputEl,
      authHintEl: options.authHintEl,
      secretHintEl: options.secretHintEl,
      runtimeSecretFieldEl: options.runtimeSecretFieldEl,
      runtimeSecretInputEl: options.runtimeSecretInputEl,
      sshTrustStatusEl: options.sshTrustStatusEl,
      sshTrustGuidanceEl: options.sshTrustGuidanceEl,
      sshTrustProbeBtn: options.sshTrustProbeBtn,
      sshProbeSelectEl: options.sshProbeSelectEl,
      sshTrustSelectEl: options.sshTrustSelectEl,
      sshTrustKeyTypeInputEl: options.sshTrustKeyTypeInputEl,
      sshTrustFingerprintInputEl: options.sshTrustFingerprintInputEl,
      sshTrustPublicKeyTextareaEl: options.sshTrustPublicKeyTextareaEl,
      sshTrustCompareEl: options.sshTrustCompareEl,
      sshTrustCompareStatusEl: options.sshTrustCompareStatusEl,
      sshTrustCurrentKeyTypeInputEl: options.sshTrustCurrentKeyTypeInputEl,
      sshTrustCurrentFingerprintInputEl: options.sshTrustCurrentFingerprintInputEl,
      sshTrustCandidateKeyTypeInputEl: options.sshTrustCandidateKeyTypeInputEl,
      sshTrustCandidateFingerprintInputEl: options.sshTrustCandidateFingerprintInputEl,
      sshTrustRefreshBtn: options.sshTrustRefreshBtn,
      sshTrustSaveBtn: options.sshTrustSaveBtn,
      sshTrustDeleteBtn: options.sshTrustDeleteBtn,
      sshTrustReplaceBtn: options.sshTrustReplaceBtn,
      draftLaunchTextareaEl: options.draftLaunchTextareaEl,
      draftStatusEl: options.draftStatusEl
    },
    getDecks,
    getSessions,
    getSessionById,
    getActiveSessionId,
    formatSessionDisplayName,
    normalizeThemeProfile,
    defaultDeckId,
    themePresets: options.themePresets,
    defaultThemeProfile,
    getRefreshSshTrustEntries: () => refreshSshTrustEntriesRef
  });

  const sshLifecycle = createConnectionProfileSshLifecycle({
    api,
    defaultDeckId,
    normalizeText: normalizeTextValue,
    normalizeLower: normalizeLowerValue,
    authMethodRequiresSecret,
    requestSecret,
    describeSshLaunchContext: presentation.describeSshLaunchContext,
    getErrorMessage,
    getState: presentation.getSshLifecycleState,
    updateState: presentation.updateSshLifecycleState,
    getCurrentSshTrustTarget: presentation.getCurrentSshTrustTarget,
    shouldRenderSshTrustTarget: presentation.shouldRenderSshTrustTarget,
    renderDraftComputedState: presentation.renderDraftComputedState,
    setCommandFeedback,
    setStatus: presentation.setStatus,
    getSshProbeCandidatesForTarget: presentation.getSshProbeCandidatesForTarget,
    getSshTrustEntriesForTarget: presentation.getSshTrustEntriesForTarget,
    findSshTrustConflictEntry: presentation.findSshTrustConflictEntry,
    seedDraftOnMissingTrust: presentation.seedDraftOnMissingTrust,
    selectProfileForMissingTrust: presentation.selectProfileForMissingTrust
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
  refreshSshTrustEntriesRef = refreshSshTrustEntries;

  const runtimeActions = createConnectionProfileRuntimeActions({
    api,
    defaultDeckId,
    defaultThemeProfile,
    normalizeText: normalizeTextValue,
    normalizeLower: normalizeLowerValue,
    getErrorMessage,
    getSessionById,
    getActiveSessionId,
    getLaunchForSession: presentation.getLaunchForSession,
    getProfile: presentation.getProfile,
    getSelectedProfile: presentation.getSelectedProfile,
    requireUpsertedProfile: presentation.requireUpsertedProfile,
    removeProfile: presentation.removeProfile,
    replaceProfiles: presentation.replaceProfiles,
    listProfiles: presentation.listProfiles,
    promptForLaunchSecret,
    ensureTrustedHostKeyBeforeLaunch,
    runtimeSecretInputEl: options.runtimeSecretInputEl || null,
    applyRuntimeEvent,
    setActiveDeck,
    setActiveSession,
    requestRender,
    formatSessionToken,
    formatSessionDisplayName,
    buildPersistedDraftLaunch: presentation.readPersistedDraftLaunch,
    normalizeConnectionLaunch: normalizeConnectionProfileLaunch,
    getDraftState: presentation.getDraftState,
    setDraftState: presentation.setDraftState,
    clearSshTrustState: presentation.clearSshTrustState,
    refreshSshTrustEntries,
    setError,
    setCommandFeedback,
    setStatus: presentation.setStatus,
    windowRef,
    buildBlankConnectionProfileLaunch,
    loadDraftFromActiveSession: presentation.loadDraftFromActiveSession,
    resetDraftFromSelectedProfile: presentation.resetDraftFromSelectedProfile,
    getDraftNameInputValue: presentation.getDraftNameInputValue,
    clearPendingDeleteConfirmation: presentation.clearPendingDeleteConfirmation,
    renderDraftComputedState: presentation.renderDraftComputedState,
    getPendingDeleteProfileId: presentation.getPendingDeleteProfileId,
    setPendingDeleteProfileId: presentation.setPendingDeleteProfileId
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
    normalizeText: normalizeTextValue,
    getErrorMessage,
    setError,
    selectEl: options.selectEl || null,
    newBtn: options.newBtn || null,
    newSshBtn: options.newSshBtn || null,
    saveBtn: options.saveBtn || null,
    saveDraftBtn: options.saveDraftBtn || null,
    saveAndLaunchBtn: options.saveAndLaunchBtn || null,
    resetDraftBtn: options.resetDraftBtn || null,
    applyBtn: options.applyBtn || null,
    duplicateBtn: options.duplicateBtn || null,
    renameBtn: options.renameBtn || null,
    deleteBtn: options.deleteBtn || null,
    deleteConfirmBtn: options.deleteConfirmBtn || null,
    deleteCancelBtn: options.deleteCancelBtn || null,
    sshTrustRefreshBtn: options.sshTrustRefreshBtn || null,
    sshTrustProbeBtn: options.sshTrustProbeBtn || null,
    sshTrustSaveBtn: options.sshTrustSaveBtn || null,
    sshTrustDeleteBtn: options.sshTrustDeleteBtn || null,
    sshTrustReplaceBtn: options.sshTrustReplaceBtn || null,
    sshTrustSelectEl: options.sshTrustSelectEl || null,
    sshProbeSelectEl: options.sshProbeSelectEl || null,
    setSelectedProfileId: presentation.setSelectedProfileId,
    syncSelection: presentation.syncSelection,
    resetDraftFromSelectedProfile: presentation.resetDraftFromSelectedProfile,
    syncDraftStateFromInputs: presentation.syncDraftStateFromInputs,
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
    setSelectedSshTrustEntryId: presentation.setSelectedSshTrustEntryId,
    setSelectedSshProbeCandidateId: presentation.setSelectedSshProbeCandidateId,
    renderDraftComputedState: presentation.renderDraftComputedState,
    draftInputElements: [
      options.draftNameInputEl || null,
      { element: options.draftKindSelectEl || null, eventName: "change" },
      { element: options.draftDeckSelectEl || null, eventName: "change" },
      options.draftShellInputEl || null,
      options.draftStartCwdInputEl || null,
      options.draftStartCommandTextareaEl || null,
      options.draftEnvTextareaEl || null,
      options.draftTagsInputEl || null,
      { element: options.draftActiveThemeSelectEl || null, eventName: "change" },
      { element: options.draftInactiveThemeSelectEl || null, eventName: "change" },
      options.draftRemoteHostInputEl || null,
      options.draftRemotePortInputEl || null,
      options.draftRemoteUsernameInputEl || null,
      { element: options.draftRemoteAuthMethodSelectEl || null, eventName: "change" },
      options.draftRemotePrivateKeyPathInputEl || null,
      options.sshTrustKeyTypeInputEl || null,
      options.sshTrustPublicKeyTextareaEl || null
    ]
  });

  bindUiEvents();
  presentation.render();

  return {
    listProfiles: presentation.listProfiles,
    getProfile: presentation.getProfile,
    getSelectedProfile: presentation.getSelectedProfile,
    getSelectedProfileId: presentation.getSelectedProfileId,
    resolveProfile: presentation.resolveProfile,
    replaceProfiles: presentation.replaceProfiles,
    upsertProfile: presentation.upsertProfile,
    removeProfile: presentation.removeProfile,
    getLaunchForSession: presentation.getLaunchForSession,
    createProfileFromSession,
    launchConnectionLaunch,
    saveDraftById,
    loadDraftFromActiveSession: presentation.loadDraftFromActiveSession,
    setDraftState: presentation.setDraftState,
    getDraftState: presentation.getDraftStateSnapshot,
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
    render: presentation.render
  };
}
