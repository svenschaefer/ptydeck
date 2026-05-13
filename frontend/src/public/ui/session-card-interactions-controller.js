export function createSessionCardInteractionsController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const themeModeSet = options.themeModeSet || new Set();
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys.slice() : [];
  const getThemePresetById = options.getThemePresetById || (() => null);
  const normalizeThemeSlot = options.normalizeThemeSlot || ((value) => value);
  const normalizeThemeProfile = options.normalizeThemeProfile || ((value) => value);
  const normalizeThemeFilterCategory = options.normalizeThemeFilterCategory || ((value) => value);
  const readThemeProfileFromControls = options.readThemeProfileFromControls || (() => ({}));
  const importThemeProfileIntoDraft =
    typeof options.importThemeProfileIntoDraft === "function"
      ? options.importThemeProfileIntoDraft
      : () => ({ ok: false, error: "Theme import is unavailable." });
  const exportThemeProfileFromDraft =
    typeof options.exportThemeProfileFromDraft === "function"
      ? options.exportThemeProfileFromDraft
      : () => ({ ok: false, error: "Theme export is unavailable." });
  const updateSessionThemeDraftFromControls = options.updateSessionThemeDraftFromControls || (() => null);
  const readSessionThemeProfilesForSave = options.readSessionThemeProfilesForSave || (() => ({
    activeThemeProfile: {},
    inactiveThemeProfile: {}
  }));
  const readSessionStartupFromControls = options.readSessionStartupFromControls || (() => ({}));
  const readSessionNoteFromControls = options.readSessionNoteFromControls || (() => "");
  const readSessionInputSafetyFromControls = options.readSessionInputSafetyFromControls || ((_, session) => session?.inputSafetyProfile || {});
  const isValidHexColor = options.isValidHexColor || (() => true);
  const detectThemePreset = options.detectThemePreset || (() => "custom");
  const isSessionSettingsDirty = options.isSessionSettingsDirty || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const isSessionStopped = options.isSessionStopped || (() => false);
  const isSessionStartBlocked = options.isSessionStartBlocked || (() => false);
  const getSessionRuntimeState = options.getSessionRuntimeState || ((session) => String(session?.state || "").trim().toLowerCase());
  const getSessionStartBlockedMessage = options.getSessionStartBlockedMessage || (() => "Session start is unavailable.");
  const setActiveSettingsTab = options.setActiveSettingsTab || (() => "startup");
  const stabilizeSettingsLayout = options.stabilizeSettingsLayout || (() => 0);
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage || (() => "");
  const canWriteToSession = typeof options.canWriteToSession === "function" ? options.canWriteToSession : () => true;
  const getSessionWriteBlockedMessage =
    typeof options.getSessionWriteBlockedMessage === "function"
      ? options.getSessionWriteBlockedMessage
      : () => "This client cannot send input to the selected session.";
  const showBlockedWriteReclaimUi =
    typeof options.showBlockedWriteReclaimUi === "function" ? options.showBlockedWriteReclaimUi : () => false;
  const getErrorMessage = options.getErrorMessage || ((error, fallback) => (error instanceof Error && error.message ? error.message : fallback));
  const writeClipboardText = typeof options.writeClipboardText === "function" ? options.writeClipboardText : async () => false;

  function bindSessionCardInteractions(args = {}) {
    const session = args.session;
    const refs = args.refs || {};
    const api = args.api;
    const getSession = args.getSession || (() => null);
    const getEntry = args.getEntry || (() => null);
    const onActivateSession = args.onActivateSession || (() => {});
    const toggleSettingsDialog = args.toggleSettingsDialog || (() => {});
    const closeSettingsDialog = args.closeSettingsDialog || (() => {});
    const confirmSessionDelete = args.confirmSessionDelete || (() => true);
    const requestSessionRename =
      args.requestSessionRename ||
      (async (currentSession) => {
        if (typeof windowRef?.prompt !== "function") {
          return null;
        }
        const value = windowRef.prompt("Session name", currentSession?.name || currentSession?.id || "");
        return value === null || value === undefined ? null : String(value);
      });
    const removeSession = args.removeSession || (() => {});
    const renameTrustedLocalDevice = args.renameTrustedLocalDevice || (() => Promise.resolve(null));
    const takeTrustedLocalControl =
      args.takeTrustedLocalControl ||
      ((_scope, runtimeOptions = {}) =>
        typeof api?.takeSessionControl === "function"
          ? api.takeSessionControl(runtimeOptions.sessionId || session.id)
          : Promise.resolve(null));
    const confirmForgetSessionControlClient =
      args.confirmForgetSessionControlClient || (() => Promise.resolve(false));
    const setCommandFeedback = args.setCommandFeedback || (() => {});
    const formatSessionToken = args.formatSessionToken || ((sessionId) => String(sessionId || ""));
    const formatSessionDisplayName = args.formatSessionDisplayName || ((currentSession) => currentSession?.name || "");
    const setError = args.setError || (() => {});
    const clearError = args.clearError || (() => {});
    const applyRuntimeEvent = args.applyRuntimeEvent || (() => {});
    const syncSessionThemeControls = args.syncSessionThemeControls || (() => {});
    const syncSessionStartupControls = args.syncSessionStartupControls || (() => {});
    const syncSessionNoteControls = args.syncSessionNoteControls || (() => {});
    const syncSessionInputSafetyControls = args.syncSessionInputSafetyControls || (() => {});
    const applyThemeForSession = args.applyThemeForSession || (() => {});
    const getSessionThemeConfig = args.getSessionThemeConfig || (() => ({}));
    const sessionThemeDrafts = args.sessionThemeDrafts;
    const setSettingsDirty = args.setSettingsDirty || (() => {});
    const setSessionSendTerminator = args.setSessionSendTerminator || (() => {});
    const setStartupSettingsFeedback = args.setStartupSettingsFeedback || (() => {});
    const requestRender = args.requestRender || (() => {});
    const refreshMountedTerminal = args.refreshMountedTerminal || (() => false);

    if (!session || !refs.focusBtn) {
      return;
    }

    function markDirtyFromControls() {
      const nextDirty = isSessionSettingsDirty(
        {
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          mouseForwardingModeSelect: refs.mouseForwardingModeSelect,
          sessionNoteInput: refs.sessionNoteInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          inputSafetyControls: refs.inputSafetyControls,
          sessionTagsInput: refs.sessionTagsInput,
          themeInputs: refs.themeInputs
        },
        getSession()
      );
      setSettingsDirty(getEntry(), nextDirty);
    }

    function syncSettingsDialogControls() {
      const currentSession = getSession() || session;
      const entry = getEntry();
      syncSessionStartupControls(entry, currentSession);
      syncSessionNoteControls(entry, currentSession);
      syncSessionInputSafetyControls(entry, currentSession);
      syncSessionThemeControls(entry, currentSession.id);
      setActiveSettingsTab(entry, entry?.activeSettingsTab || "startup");
      setSettingsDirty(entry, false);
    }

    function scheduleSettingsLayoutStabilization() {
      const entry = getEntry();
      stabilizeSettingsLayout(entry);
      if (typeof windowRef?.requestAnimationFrame === "function") {
        windowRef.requestAnimationFrame(() => stabilizeSettingsLayout(getEntry()));
      }
    }

    function discardSettingsDraftAndClose() {
      const freshSession = getSession();
      const entry = getEntry() || refs;
      sessionThemeDrafts?.delete?.(session.id);
      if (freshSession) {
        syncSessionStartupControls(entry, freshSession);
        syncSessionNoteControls(entry, freshSession);
        syncSessionInputSafetyControls(entry, freshSession);
        syncSessionThemeControls(entry, session.id);
      }
      applyThemeForSession(session.id);
      setStartupSettingsFeedback(buildSettingsFeedbackEntry(), "");
      setSettingsDirty(entry, false);
      closeSettingsDialog(refs.settingsDialog);
    }

    function buildSettingsFeedbackEntry() {
      return {
        settingsFeedback: refs.settingsFeedback,
        startFeedback: refs.startFeedback
      };
    }

    async function applySessionControlUpdate(task, feedbackMessage, fallbackError) {
      try {
        const updated = await task();
        applyRuntimeEvent({ type: "session.updated", session: updated });
        clearError();
        if (feedbackMessage) {
          setCommandFeedback(feedbackMessage);
        }
      } catch (error) {
        setError(getErrorMessage(error, fallbackError));
      }
    }

    refs.focusBtn.addEventListener("click", () => onActivateSession(session.id));
    refs.refreshBtn?.addEventListener("click", () => {
      refreshMountedTerminal(session.id);
      clearError();
    });
    refs.startStopBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (!api?.startSession || !api?.stopSession) {
        setError("Session start/stop is unavailable.");
        return;
      }
      if (isSessionStartBlocked(currentSession)) {
        setError(getSessionStartBlockedMessage(currentSession));
        return;
      }
      if (!canWriteToSession(currentSession)) {
        const message = getSessionWriteBlockedMessage(currentSession);
        setError(message);
        showBlockedWriteReclaimUi(currentSession, {
          source: "session-start-stop",
          message,
          retryAction: {
            kind: isSessionStopped(currentSession) ? "session-start" : "session-stop",
            sessionId: session.id
          }
        });
        return;
      }
      if (isSessionStopped(currentSession)) {
        await applySessionControlUpdate(
          () => api.startSession(session.id),
          `Started [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`,
          "Failed to start the session."
        );
        return;
      }
      const runtimeState = getSessionRuntimeState(currentSession);
      if (
        runtimeState === "created" ||
        runtimeState === "starting" ||
        runtimeState === "running" ||
        runtimeState === "busy" ||
        runtimeState === "idle"
      ) {
        await applySessionControlUpdate(
          () => api.stopSession(session.id),
          `Stopped [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`,
          "Failed to stop the session."
        );
      }
    });
    refs.settingsBtn?.addEventListener("click", () => {
      const wasOpen = refs.settingsDialog?.open === true;
      if (!wasOpen) {
        syncSettingsDialogControls();
      }
      toggleSettingsDialog(refs.settingsDialog);
      if (!wasOpen) {
        scheduleSettingsLayoutStabilization();
      }
    });
    refs.settingsDismissBtn?.addEventListener("click", () => discardSettingsDraftAndClose());
    refs.sessionControlTakeBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      await applySessionControlUpdate(
        () => takeTrustedLocalControl("session", { sessionId: session.id }),
        `Took control of [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`,
        "Failed to take session control."
      );
    });
    refs.sessionControlReleaseBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      await applySessionControlUpdate(
        () => api.releaseSessionControl(session.id),
        `Released control of [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`,
        "Failed to release session control."
      );
    });
    refs.sessionControlClientsEl?.addEventListener?.("click", async (event) => {
      const actionBtn = event?.target?.closest?.("[data-session-control-action]");
      const targetClientId = actionBtn?.dataset?.clientId || "";
      const action = actionBtn?.dataset?.sessionControlAction || "";
      if (!targetClientId || !action) {
        return;
      }
      const currentSession = getSession() || session;
      if (action === "transfer") {
        await applySessionControlUpdate(
          () => api.transferSessionControl(session.id, targetClientId),
          `Transferred control of [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`,
          "Failed to transfer session control."
        );
        return;
      }
      if (action === "forget") {
        const targetLabel = actionBtn?.dataset?.clientLabel || targetClientId;
        const confirmed = await confirmForgetSessionControlClient(currentSession, {
          clientId: targetClientId,
          label: targetLabel
        });
        if (!confirmed) {
          return;
        }
        await applySessionControlUpdate(
          () => api.forgetSessionControlClient(session.id, targetClientId),
          `Forgot stale device ${targetLabel}.`,
          "Failed to forget the stale device."
        );
      }
    });
    refs.sessionControlDeviceSaveBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      const nextLabel = String(refs.sessionControlDeviceNameInput?.value || "").trim();
      if (!nextLabel) {
        setError("Device name cannot be empty.");
        return;
      }
      await applySessionControlUpdate(
        () => renameTrustedLocalDevice(currentSession.id, nextLabel),
        `Renamed this device to ${nextLabel}.`,
        "Failed to rename this device."
      );
    });
    if (refs.settingsDialog && typeof refs.settingsDialog.addEventListener === "function") {
      refs.settingsDialog.addEventListener("cancel", (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        discardSettingsDraftAndClose();
      });
    }
    refs.settingsTabStartupBtn?.addEventListener("click", () => {
      setActiveSettingsTab(getEntry(), "startup");
      scheduleSettingsLayoutStabilization();
    });
    refs.settingsTabInputBtn?.addEventListener("click", () => {
      setActiveSettingsTab(getEntry(), "input");
      scheduleSettingsLayoutStabilization();
    });
    refs.settingsTabNoteBtn?.addEventListener("click", () => {
      setActiveSettingsTab(getEntry(), "note");
      scheduleSettingsLayoutStabilization();
    });
    refs.settingsTabThemeBtn?.addEventListener("click", () => {
      setActiveSettingsTab(getEntry(), "theme");
      scheduleSettingsLayoutStabilization();
    });

    refs.renameBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (isSessionExited(currentSession)) {
        setError(getBlockedSessionActionMessage([currentSession], "Rename"));
        return;
      }
      const nextName = await requestSessionRename(currentSession);
      if (nextName === null || nextName === undefined) {
        return;
      }
      const trimmed = String(nextName).trim();
      if (!trimmed) {
        setError("Session name cannot be empty.");
        return;
      }
      try {
        const updated = await api.updateSession(session.id, { name: trimmed });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        clearError();
      } catch {
        setError("Failed to rename session.");
      }
    });

    refs.closeBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (!(await confirmSessionDelete(session))) {
        return;
      }
      if (isSessionExited(currentSession)) {
        removeSession(currentSession.id);
        closeSettingsDialog(refs.settingsDialog);
        clearError();
        setCommandFeedback(
          `Removed exited session [${formatSessionToken(currentSession.id)}] ${formatSessionDisplayName(currentSession)}.`
        );
        return;
      }
      try {
        await api.deleteSession(session.id);
        applyRuntimeEvent({ type: "session.closed", sessionId: session.id });
        clearError();
      } catch {
        setError("Failed to delete session.");
      }
    });

    refs.startCwdInput?.addEventListener("input", markDirtyFromControls);
    refs.startCommandInput?.addEventListener("input", markDirtyFromControls);
    refs.startEnvInput?.addEventListener("input", markDirtyFromControls);
    refs.mouseForwardingModeSelect?.addEventListener("change", markDirtyFromControls);
    refs.sessionNoteInput?.addEventListener("input", markDirtyFromControls);
    refs.sessionTagsInput?.addEventListener("input", markDirtyFromControls);
    refs.sessionSendTerminatorSelect?.addEventListener("change", markDirtyFromControls);
    for (const control of Object.values(refs.inputSafetyControls || {})) {
      control?.addEventListener?.("input", markDirtyFromControls);
      control?.addEventListener?.("change", markDirtyFromControls);
    }
    refs.themeSlotSelect?.addEventListener("change", () => {
      updateSessionThemeDraftFromControls(refs, session.id, {
        selectedSlot: normalizeThemeSlot(refs.themeSlotSelect?.value)
      });
      syncSessionThemeControls(refs, session.id);
      applyThemeForSession(session.id, {
        themeSlot: normalizeThemeSlot(refs.themeSlotSelect?.value)
      });
      markDirtyFromControls();
      clearError();
    });

    refs.themeSelect?.addEventListener("change", () => {
      const nextPreset = themeModeSet.has(refs.themeSelect.value) ? refs.themeSelect.value : "custom";
      const currentProfile = readThemeProfileFromControls({
        themeInputs: refs.themeInputs,
        themeBg: refs.themeBg,
        themeFg: refs.themeFg
      });
      const preset = getThemePresetById(nextPreset);
      const nextProfile = nextPreset === "custom" || !preset ? currentProfile : normalizeThemeProfile(preset.profile);
      updateSessionThemeDraftFromControls(refs, session.id, {
        selectedSlot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        preset: nextPreset,
        profile: nextProfile,
        category: normalizeThemeFilterCategory(String(refs.themeCategory?.value || "all").toLowerCase()),
        search: String(refs.themeSearch?.value || "")
      });
      syncSessionThemeControls(refs, session.id);
      applyThemeForSession(session.id, {
        themeSlot: normalizeThemeSlot(refs.themeSlotSelect?.value)
      });
      markDirtyFromControls();
      clearError();
      requestRender();
    });

    refs.themeCategory?.addEventListener("change", () => {
      updateSessionThemeDraftFromControls(refs, session.id, {
        selectedSlot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        category: normalizeThemeFilterCategory(String(refs.themeCategory.value || "all").toLowerCase()),
        search: String(refs.themeSearch?.value || "")
      });
      syncSessionThemeControls(refs, session.id);
      markDirtyFromControls();
    });

    refs.themeSearch?.addEventListener("input", () => {
      updateSessionThemeDraftFromControls(refs, session.id, {
        selectedSlot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        category: normalizeThemeFilterCategory(String(refs.themeCategory?.value || "all").toLowerCase()),
        search: String(refs.themeSearch.value || "")
      });
      syncSessionThemeControls(refs, session.id);
      markDirtyFromControls();
    });

    for (const key of themeProfileKeys) {
      const input = refs.themeInputs?.[key];
      if (!input) {
        continue;
      }
      input.addEventListener("input", () => {
        updateSessionThemeDraftFromControls(refs, session.id, {
          selectedSlot: normalizeThemeSlot(refs.themeSlotSelect?.value),
          slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
          preset: "custom",
          profile: readThemeProfileFromControls({
            themeInputs: refs.themeInputs,
            themeBg: refs.themeBg,
            themeFg: refs.themeFg
          })
        });
        applyThemeForSession(session.id, {
          themeSlot: normalizeThemeSlot(refs.themeSlotSelect?.value)
        });
        markDirtyFromControls();
      });
    }

    refs.themeImportBtn?.addEventListener("click", () => {
      const result = importThemeProfileIntoDraft(refs, session.id, {
        slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        format: refs.themeImportFormat?.value || "auto",
        payload: refs.themeImportPayload?.value || ""
      });
      if (!result.ok) {
        const message = result.error || "Theme import failed.";
        setError(message);
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), message, true);
        return;
      }
      syncSessionThemeControls(refs, session.id);
      applyThemeForSession(session.id, { themeSlot: result.slot });
      markDirtyFromControls();
      clearError();
      setStartupSettingsFeedback(
        buildSettingsFeedbackEntry(),
        `Imported ${result.format} theme into ${result.slot} theme draft. Save Settings to persist it.`
      );
      requestRender();
    });

    refs.themeExportBtn?.addEventListener("click", () => {
      const currentSession = getSession() || session;
      const result = exportThemeProfileFromDraft(refs, session.id, {
        slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
        format: refs.themeExportFormat?.value || "ptydeck",
        name: `${formatSessionDisplayName(currentSession) || currentSession.id || "ptydeck"} ${normalizeThemeSlot(refs.themeSlotSelect?.value)}`
      });
      if (!result.ok) {
        const message = result.error || "Theme export failed.";
        setError(message);
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), message, true);
        return;
      }
      if (refs.themeExportPayload) {
        refs.themeExportPayload.value = result.text;
      }
      clearError();
      setStartupSettingsFeedback(buildSettingsFeedbackEntry(), `Exported ${result.slot} theme as ${result.format}.`);
    });

    refs.themeCopyExportBtn?.addEventListener("click", async () => {
      let text = String(refs.themeExportPayload?.value || "");
      if (!text.trim()) {
        const currentSession = getSession() || session;
        const result = exportThemeProfileFromDraft(refs, session.id, {
          slot: normalizeThemeSlot(refs.themeSlotSelect?.value),
          format: refs.themeExportFormat?.value || "ptydeck",
          name: `${formatSessionDisplayName(currentSession) || currentSession.id || "ptydeck"} ${normalizeThemeSlot(refs.themeSlotSelect?.value)}`
        });
        if (!result.ok) {
          const message = result.error || "Theme export failed.";
          setError(message);
          setStartupSettingsFeedback(buildSettingsFeedbackEntry(), message, true);
          return;
        }
        text = result.text;
        if (refs.themeExportPayload) {
          refs.themeExportPayload.value = text;
        }
      }
      if (!text.trim()) {
        return;
      }
      try {
        const copied = await writeClipboardText(text);
        if (!copied) {
          throw new Error("clipboard unavailable");
        }
        clearError();
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), "Copied exported theme payload.");
      } catch {
        const message = "Failed to copy exported theme payload.";
        setError(message);
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), message, true);
      }
    });

    refs.settingsApplyBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (isSessionExited(currentSession)) {
        const blockedMessage = getBlockedSessionActionMessage([currentSession], "Settings apply");
        setError(blockedMessage);
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), blockedMessage, true);
        return;
      }
      const startupDraft = readSessionStartupFromControls({
        startCwdInput: refs.startCwdInput,
        startCommandInput: refs.startCommandInput,
        startEnvInput: refs.startEnvInput,
        mouseForwardingModeSelect: refs.mouseForwardingModeSelect,
        sessionNoteInput: refs.sessionNoteInput,
        sessionTagsInput: refs.sessionTagsInput,
        sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect
      });
      const note = readSessionNoteFromControls({
        sessionNoteInput: refs.sessionNoteInput
      });
      const inputSafetyProfile = readSessionInputSafetyFromControls(
        {
          inputSafetyControls: refs.inputSafetyControls
        },
        currentSession
      );
      if (!startupDraft.startCwd) {
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), "Working Directory cannot be empty.", true);
        return;
      }
      if (!startupDraft.envResult.ok) {
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), startupDraft.envResult.error, true);
        return;
      }
      if (!startupDraft.tagResult.ok) {
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), startupDraft.tagResult.error, true);
        return;
      }
      const { activeThemeProfile, inactiveThemeProfile } = readSessionThemeProfilesForSave(refs, session.id, currentSession);
      const invalidKey = themeProfileKeys.find(
        (key) => !isValidHexColor(activeThemeProfile[key]) || !isValidHexColor(inactiveThemeProfile[key])
      );
      if (invalidKey) {
        setError("Custom theme colors must be valid hex values like #1d2021.");
        return;
      }
      const requestedPreset = themeModeSet.has(refs.themeSelect?.value) ? refs.themeSelect.value : "custom";
      const selectedSlot = normalizeThemeSlot(refs.themeSlotSelect?.value);
      const selectedProfile = selectedSlot === "inactive" ? inactiveThemeProfile : activeThemeProfile;
      const detectedPreset = detectThemePreset(selectedProfile);
      const nextPreset =
        requestedPreset === "custom" ? "custom" : detectedPreset === requestedPreset ? requestedPreset : "custom";
      updateSessionThemeDraftFromControls(refs, session.id, {
        selectedSlot,
        slot: selectedSlot,
        preset: nextPreset,
        profile: selectedProfile,
        category: normalizeThemeFilterCategory(String(refs.themeCategory?.value || "all").toLowerCase()),
        search: String(refs.themeSearch?.value || "")
      });
      applyThemeForSession(session.id, { themeSlot: selectedSlot });
      syncSessionThemeControls(refs, session.id);
      clearError();
      try {
        const updated = await api.updateSession(session.id, {
          startCwd: startupDraft.startCwd,
          startCommand: startupDraft.startCommand,
          env: startupDraft.envResult.env,
          mouseForwardingMode: startupDraft.mouseForwardingMode,
          note,
          tags: startupDraft.tagResult.tags,
          activeThemeProfile,
          inactiveThemeProfile,
          inputSafetyProfile
        });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        sessionThemeDrafts.delete(session.id);
        setSessionSendTerminator(session.id, startupDraft.sendTerminator);
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), "Settings saved.");
        setSettingsDirty(getEntry(), false);
      } catch {
        setError("Failed to save settings.");
        setStartupSettingsFeedback(buildSettingsFeedbackEntry(), "Failed to save settings.", true);
      }
    });

    refs.settingsCancelBtn?.addEventListener("click", () => {
      discardSettingsDraftAndClose();
    });
  }

  return {
    bindSessionCardInteractions
  };
}
