export function createConnectionProfileRuntimeActions(options = {}) {
  const api = options.api || {};
  const defaultDeckId = options.defaultDeckId || "default";
  const defaultThemeProfile = options.defaultThemeProfile && typeof options.defaultThemeProfile === "object" ? options.defaultThemeProfile : {};
  const normalizeText =
    typeof options.normalizeText === "function" ? options.normalizeText : (value) => String(value || "").trim();
  const normalizeLower =
    typeof options.normalizeLower === "function" ? options.normalizeLower : (value) => String(value || "").trim().toLowerCase();
  const getErrorMessage =
    typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : () => null;
  const getActiveSessionId =
    typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const getLaunchForSession =
    typeof options.getLaunchForSession === "function" ? options.getLaunchForSession : () => null;
  const getProfile =
    typeof options.getProfile === "function" ? options.getProfile : () => null;
  const getSelectedProfile =
    typeof options.getSelectedProfile === "function" ? options.getSelectedProfile : () => null;
  const requireUpsertedProfile =
    typeof options.requireUpsertedProfile === "function" ? options.requireUpsertedProfile : (profile) => profile;
  const removeProfile =
    typeof options.removeProfile === "function" ? options.removeProfile : () => false;
  const replaceProfiles =
    typeof options.replaceProfiles === "function" ? options.replaceProfiles : () => [];
  const listProfiles =
    typeof options.listProfiles === "function" ? options.listProfiles : () => [];
  const promptForLaunchSecret =
    typeof options.promptForLaunchSecret === "function"
      ? options.promptForLaunchSecret
      : async () => ({ ok: true, remoteSecret: undefined, cancelled: false });
  const ensureTrustedHostKeyBeforeLaunch =
    typeof options.ensureTrustedHostKeyBeforeLaunch === "function" ? options.ensureTrustedHostKeyBeforeLaunch : async () => "";
  const runtimeSecretInputEl = options.runtimeSecretInputEl || null;
  const applyRuntimeEvent =
    typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const setActiveDeck =
    typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => true;
  const setActiveSession =
    typeof options.setActiveSession === "function" ? options.setActiveSession : () => {};
  const requestRender =
    typeof options.requestRender === "function" ? options.requestRender : () => {};
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (value) => String(value || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => String(session?.name || "");
  const buildPersistedDraftLaunch =
    typeof options.buildPersistedDraftLaunch === "function"
      ? options.buildPersistedDraftLaunch
      : () => {
          throw new Error("Draft launch builder unavailable.");
        };
  const getDraftState =
    typeof options.getDraftState === "function" ? options.getDraftState : () => null;
  const setDraftState =
    typeof options.setDraftState === "function" ? options.setDraftState : () => {};
  const clearSshTrustState =
    typeof options.clearSshTrustState === "function" ? options.clearSshTrustState : () => {};
  const refreshSshTrustEntries =
    typeof options.refreshSshTrustEntries === "function" ? options.refreshSshTrustEntries : async () => [];
  const setError =
    typeof options.setError === "function" ? options.setError : () => {};
  const setCommandFeedback =
    typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setStatus =
    typeof options.setStatus === "function" ? options.setStatus : () => {};
  const windowRef = options.windowRef || null;
  const buildBlankConnectionProfileLaunch =
    typeof options.buildBlankConnectionProfileLaunch === "function"
      ? options.buildBlankConnectionProfileLaunch
      : () => ({});
  const normalizeConnectionLaunch =
    typeof options.normalizeConnectionLaunch === "function" ? options.normalizeConnectionLaunch : (launch) => launch;
  const loadDraftFromActiveSession =
    typeof options.loadDraftFromActiveSession === "function" ? options.loadDraftFromActiveSession : () => {};
  const resetDraftFromSelectedProfile =
    typeof options.resetDraftFromSelectedProfile === "function" ? options.resetDraftFromSelectedProfile : () => {};
  const getDraftNameInputValue =
    typeof options.getDraftNameInputValue === "function" ? options.getDraftNameInputValue : () => "";
  const clearPendingDeleteConfirmation =
    typeof options.clearPendingDeleteConfirmation === "function" ? options.clearPendingDeleteConfirmation : () => {};
  const renderDraftComputedState =
    typeof options.renderDraftComputedState === "function" ? options.renderDraftComputedState : () => {};
  const getPendingDeleteProfileId =
    typeof options.getPendingDeleteProfileId === "function" ? options.getPendingDeleteProfileId : () => "";
  const setPendingDeleteProfileId =
    typeof options.setPendingDeleteProfileId === "function" ? options.setPendingDeleteProfileId : () => {};

  function formatSshTargetForLaunch(launch) {
    const host = normalizeText(launch?.remoteConnection?.host) || "?";
    const port = Number.isInteger(Number(launch?.remoteConnection?.port)) ? Number(launch.remoteConnection.port) : 22;
    const username = normalizeText(launch?.remoteConnection?.username);
    return `${username ? `${username}@` : ""}${host}:${port}`;
  }

  async function createProfileFromSession(sessionOrId, name, actionOptions = {}) {
    const session = typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId;
    if (!session) {
      throw new Error("Session is required to save a connection profile.");
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const launch = getLaunchForSession(session);
    if (!launch) {
      throw new Error("Session launch settings are incomplete and cannot be saved as a connection profile.");
    }
    const created = await api.createConnectionProfile({
      ...(normalizeText(actionOptions.id) ? { id: normalizeText(actionOptions.id) } : {}),
      name: normalizedName,
      launch
    });
    const profile = requireUpsertedProfile(created, "connection profile save");
    return `Saved connection profile [${profile.id}] ${profile.name} from [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
  }

  async function applyProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    await ensureTrustedHostKeyBeforeLaunch(profile);
    const secretResult = await promptForLaunchSecret(profile);
    if (secretResult.cancelled) {
      return `Connection profile apply cancelled for [${profile.id}] ${profile.name}.`;
    }
    const session = await api.createSession({
      connectionProfileId: profile.id,
      ...(secretResult.remoteSecret !== undefined ? { remoteSecret: secretResult.remoteSecret } : {})
    });
    if (runtimeSecretInputEl) {
      runtimeSecretInputEl.value = "";
    }
    applyRuntimeEvent({ type: "session.created", session });
    if (normalizeText(session.deckId)) {
      setActiveDeck(session.deckId);
    }
    setActiveSession(session.id);
    requestRender();
    return `Started session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} from connection profile [${profile.id}] ${profile.name}.`;
  }

  async function launchConnectionLaunch(launch, launchOptions = {}) {
    const normalizedLaunch = normalizeConnectionLaunch(launch);
    if (!normalizedLaunch || typeof normalizedLaunch !== "object" || Array.isArray(normalizedLaunch)) {
      throw new Error("Connection launch is incomplete.");
    }
    const launchName =
      normalizeText(launchOptions.name) ||
      (normalizeLower(normalizedLaunch.kind) === "ssh" ? `SSH ${formatSshTargetForLaunch(normalizedLaunch)}` : "Ad hoc Connection");
    const launchContext = {
      id: "",
      name: launchName,
      launch: normalizedLaunch,
      seedDraftOnMissingTrust: launchOptions.seedDraftOnMissingTrust === true
    };
    await ensureTrustedHostKeyBeforeLaunch(launchContext);
    const secretResult = await promptForLaunchSecret(launchContext);
    if (secretResult.cancelled) {
      if (normalizeLower(normalizedLaunch.kind) === "ssh") {
        return `SSH launch cancelled for ${formatSshTargetForLaunch(normalizedLaunch)}.`;
      }
      return `Connection launch cancelled for ${launchName}.`;
    }
    const session = await api.createSession({
      ...normalizedLaunch,
      ...(secretResult.remoteSecret !== undefined ? { remoteSecret: secretResult.remoteSecret } : {})
    });
    if (runtimeSecretInputEl) {
      runtimeSecretInputEl.value = "";
    }
    applyRuntimeEvent({ type: "session.created", session });
    if (normalizeText(session.deckId)) {
      setActiveDeck(session.deckId);
    }
    setActiveSession(session.id);
    requestRender();
    const feedback =
      normalizeLower(normalizedLaunch.kind) === "ssh"
        ? `Started session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} for ${formatSshTargetForLaunch(normalizedLaunch)}.`
        : `Started session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} from ${launchName}.`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameProfileById(profileId, name) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const updated = await api.updateConnectionProfile(profile.id, { name: normalizedName });
    const updatedProfile = requireUpsertedProfile(updated, "connection profile rename");
    return `Renamed connection profile [${updatedProfile.id}] to ${updatedProfile.name}.`;
  }

  async function duplicateProfileById(profileId, name) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const created = await api.createConnectionProfile({
      name: normalizedName,
      launch: profile.launch
    });
    const duplicated = requireUpsertedProfile(created, "connection profile duplicate");
    return `Duplicated connection profile [${profile.id}] ${profile.name} as [${duplicated.id}] ${duplicated.name}.`;
  }

  async function deleteProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    await api.deleteConnectionProfile(profile.id);
    removeProfile(profile.id);
    return `Deleted connection profile [${profile.id}] ${profile.name}.`;
  }

  async function saveDraftById() {
    const draftState = getDraftState();
    const name = normalizeText(getDraftNameInputValue() || draftState?.name);
    if (!name) {
      throw new Error("Connection profile name is required.");
    }
    const launch = buildPersistedDraftLaunch();
    const existingProfileId = normalizeText(draftState?.profileId);
    if (existingProfileId && getProfile(existingProfileId)) {
      const updated = await api.updateConnectionProfile(existingProfileId, { name, launch });
      const profile = requireUpsertedProfile(updated, "connection profile update");
      setDraftState({
        mode: "profile",
        profileId: profile?.id,
        name: profile?.name,
        launch: profile?.launch
      });
      return `Updated connection profile [${profile.id}] ${profile.name}.`;
    }
    const created = await api.createConnectionProfile({ name, launch });
    const profile = requireUpsertedProfile(created, "connection profile save");
    setDraftState({
      mode: "profile",
      profileId: profile?.id,
      name: profile?.name,
      launch: profile?.launch
    });
    return `Saved connection profile [${profile.id}] ${profile.name}.`;
  }

  async function saveAndLaunchDraftFlow() {
    const inlineRuntimeSecret = typeof runtimeSecretInputEl?.value === "string" ? runtimeSecretInputEl.value : "";
    const feedback = await saveDraftById();
    if (runtimeSecretInputEl && inlineRuntimeSecret && !runtimeSecretInputEl.value) {
      runtimeSecretInputEl.value = inlineRuntimeSecret;
    }
    const profile = getSelectedProfile();
    if (!profile) {
      setCommandFeedback(feedback);
      setStatus(feedback);
      return feedback;
    }
    const launchFeedback = await applyProfileById(profile.id);
    const combinedFeedback = `${feedback}\n${launchFeedback}`;
    setCommandFeedback(combinedFeedback);
    setStatus(launchFeedback);
    return combinedFeedback;
  }

  async function loadProfiles() {
    if (typeof api.listConnectionProfiles !== "function") {
      clearSshTrustState();
      replaceProfiles([]);
      return [];
    }
    try {
      const payload = await api.listConnectionProfiles();
      replaceProfiles(payload || []);
      clearSshTrustState();
      await refreshSshTrustEntries({ silent: true });
      return listProfiles();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to load connection profiles."));
      clearSshTrustState();
      replaceProfiles([]);
      return [];
    }
  }

  async function createProfileFlow(name, sessionOrId = undefined) {
    const activeSessionId = getActiveSessionId();
    const session = sessionOrId ? (typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId) : getSessionById(activeSessionId);
    if (!session) {
      throw new Error("No active session to save as a connection profile.");
    }
    const defaultName = formatSessionDisplayName(session);
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Connection profile name", defaultName));
    if (!input) {
      return "";
    }
    const feedback = await createProfileFromSession(session, input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function newDraftFlow(kind = "local") {
    const activeSession = getSessionById(getActiveSessionId());
    const normalizedKind = normalizeLower(kind) === "ssh" ? "ssh" : "local";
    setDraftState({
      mode: "blank",
      profileId: "",
      name: normalizedKind === "ssh" ? "New SSH Connection" : "New Local Connection",
      deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
      launch: buildBlankConnectionProfileLaunch({
        deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
        defaultThemeProfile,
        kind: normalizedKind
      })
    });
    const feedback =
      normalizedKind === "ssh"
        ? "Opened a new guided SSH connection profile draft."
        : "Opened a new guided local connection profile draft.";
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function loadActiveDraftFlow() {
    loadDraftFromActiveSession();
    const feedback = "Loaded the active session into a new connection profile draft.";
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function saveDraftFlow() {
    const feedback = await saveDraftById();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function resetDraftFlow() {
    resetDraftFromSelectedProfile();
    const feedback = "Reset the connection profile draft.";
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
    clearPendingDeleteConfirmation();
    renderDraftComputedState();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameSelectedProfileFlow(name) {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const input = normalizeText(name) || getDraftNameInputValue();
    if (!input) {
      throw new Error("Enter the desired saved profile name in Profile Name before renaming.");
    }
    const feedback = await renameProfileById(profile.id, input);
    clearPendingDeleteConfirmation();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function duplicateSelectedProfileFlow(name) {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const requestedName = normalizeText(name) || getDraftNameInputValue();
    const input = requestedName && requestedName !== profile.name ? requestedName : `${profile.name} Copy`;
    const feedback = await duplicateProfileById(profile.id, input);
    clearPendingDeleteConfirmation();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function requestDeleteSelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    setPendingDeleteProfileId(profile.id);
    renderDraftComputedState();
    const feedback = `Confirm deletion for saved connection profile [${profile.id}] ${profile.name}.`;
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    if (getPendingDeleteProfileId() !== profile.id) {
      return requestDeleteSelectedProfileFlow();
    }
    const feedback = await deleteProfileById(profile.id);
    clearPendingDeleteConfirmation();
    renderDraftComputedState();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function cancelDeleteSelectedProfileFlow() {
    clearPendingDeleteConfirmation();
    renderDraftComputedState();
    const feedback = "Cancelled deletion of the saved connection profile.";
    setStatus(feedback);
    return feedback;
  }

  return Object.freeze({
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
    renameSelectedProfileFlow,
    duplicateSelectedProfileFlow,
    requestDeleteSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow
  });
}
