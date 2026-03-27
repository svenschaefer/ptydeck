export function createSessionCardInteractionsController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const themeModeSet = options.themeModeSet || new Set();
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys.slice() : [];
  const getThemePresetById = options.getThemePresetById || (() => null);
  const normalizeThemeProfile = options.normalizeThemeProfile || ((value) => value);
  const normalizeThemeFilterCategory = options.normalizeThemeFilterCategory || ((value) => value);
  const readThemeProfileFromControls = options.readThemeProfileFromControls || (() => ({}));
  const readSessionStartupFromControls = options.readSessionStartupFromControls || (() => ({}));
  const readSessionInputSafetyFromControls = options.readSessionInputSafetyFromControls || ((_, session) => session?.inputSafetyProfile || {});
  const isValidHexColor = options.isValidHexColor || (() => true);
  const detectThemePreset = options.detectThemePreset || (() => "custom");
  const isSessionSettingsDirty = options.isSessionSettingsDirty || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage || (() => "");
  const getErrorMessage = options.getErrorMessage || ((error, fallback) => (error instanceof Error && error.message ? error.message : fallback));

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
    const removeSession = args.removeSession || (() => {});
    const setCommandFeedback = args.setCommandFeedback || (() => {});
    const formatSessionToken = args.formatSessionToken || ((sessionId) => String(sessionId || ""));
    const formatSessionDisplayName = args.formatSessionDisplayName || ((currentSession) => currentSession?.name || "");
    const setError = args.setError || (() => {});
    const clearError = args.clearError || (() => {});
    const applyRuntimeEvent = args.applyRuntimeEvent || (() => {});
    const syncSessionThemeControls = args.syncSessionThemeControls || (() => {});
    const syncSessionStartupControls = args.syncSessionStartupControls || (() => {});
    const syncSessionInputSafetyControls = args.syncSessionInputSafetyControls || (() => {});
    const applyThemeForSession = args.applyThemeForSession || (() => {});
    const getSessionThemeConfig = args.getSessionThemeConfig || (() => ({}));
    const sessionThemeDrafts = args.sessionThemeDrafts;
    const setSettingsDirty = args.setSettingsDirty || (() => {});
    const setSessionSendTerminator = args.setSessionSendTerminator || (() => {});
    const setStartupSettingsFeedback = args.setStartupSettingsFeedback || (() => {});
    const requestRender = args.requestRender || (() => {});
    const exportSessionReplayDownload = args.exportSessionReplayDownload || (() => Promise.resolve({ feedback: "" }));

    if (!session || !refs.focusBtn) {
      return;
    }

    function markDirtyFromControls() {
      const nextDirty = isSessionSettingsDirty(
        {
          startCwdInput: refs.startCwdInput,
          startCommandInput: refs.startCommandInput,
          startEnvInput: refs.startEnvInput,
          sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
          inputSafetyPresetSelect: refs.inputSafetyPresetSelect,
          sessionTagsInput: refs.sessionTagsInput,
          themeInputs: refs.themeInputs
        },
        getSession()
      );
      setSettingsDirty(getEntry(), nextDirty);
    }

    refs.focusBtn.addEventListener("click", () => onActivateSession(session.id));
    refs.replayExportBtn?.addEventListener("click", async () => {
      try {
        const currentSession = getSession() || session;
        const outcome = await exportSessionReplayDownload(currentSession);
        clearError();
        if (outcome?.feedback) {
          setCommandFeedback(outcome.feedback);
        }
      } catch (error) {
        setError(getErrorMessage(error, "Failed to export session replay."));
      }
    });
    refs.settingsBtn?.addEventListener("click", () => toggleSettingsDialog(refs.settingsDialog));
    refs.settingsDismissBtn?.addEventListener("click", () => closeSettingsDialog(refs.settingsDialog));
    if (refs.settingsDialog && typeof refs.settingsDialog.addEventListener === "function") {
      refs.settingsDialog.addEventListener("cancel", (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        closeSettingsDialog(refs.settingsDialog);
      });
    }

    refs.renameBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (isSessionExited(currentSession)) {
        setError(getBlockedSessionActionMessage([currentSession], "Rename"));
        return;
      }
      const nextName = windowRef?.prompt?.("Session name", currentSession.name || session.id.slice(0, 8));
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
      if (!confirmSessionDelete(session)) {
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
    refs.sessionTagsInput?.addEventListener("input", markDirtyFromControls);
    refs.sessionSendTerminatorSelect?.addEventListener("change", markDirtyFromControls);
    refs.inputSafetyPresetSelect?.addEventListener("change", markDirtyFromControls);

    refs.themeSelect?.addEventListener("change", () => {
      const nextPreset = themeModeSet.has(refs.themeSelect.value) ? refs.themeSelect.value : "custom";
      const currentProfile = readThemeProfileFromControls({
        themeInputs: refs.themeInputs,
        themeBg: refs.themeBg,
        themeFg: refs.themeFg
      });
      const preset = getThemePresetById(nextPreset);
      const nextProfile = nextPreset === "custom" || !preset ? currentProfile : normalizeThemeProfile(preset.profile);
      sessionThemeDrafts.set(session.id, {
        preset: nextPreset,
        profile: nextProfile,
        category: normalizeThemeFilterCategory(String(refs.themeCategory?.value || "all").toLowerCase()),
        search: String(refs.themeSearch?.value || "")
      });
      syncSessionThemeControls(refs, session.id);
      applyThemeForSession(session.id);
      markDirtyFromControls();
      clearError();
      requestRender();
    });

    refs.themeCategory?.addEventListener("change", () => {
      const current = getSessionThemeConfig(session.id);
      const category = normalizeThemeFilterCategory(String(refs.themeCategory.value || "all").toLowerCase());
      sessionThemeDrafts.set(session.id, {
        ...current,
        category,
        search: String(refs.themeSearch?.value || "")
      });
      syncSessionThemeControls(refs, session.id);
      markDirtyFromControls();
    });

    refs.themeSearch?.addEventListener("input", () => {
      const current = getSessionThemeConfig(session.id);
      sessionThemeDrafts.set(session.id, {
        ...current,
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
        const draft = getSessionThemeConfig(session.id);
        sessionThemeDrafts.set(session.id, {
          ...draft,
          preset: "custom",
          profile: readThemeProfileFromControls({
            themeInputs: refs.themeInputs,
            themeBg: refs.themeBg,
            themeFg: refs.themeFg
          })
        });
        applyThemeForSession(session.id);
        markDirtyFromControls();
      });
    }

    refs.settingsApplyBtn?.addEventListener("click", async () => {
      const currentSession = getSession() || session;
      if (isSessionExited(currentSession)) {
        const blockedMessage = getBlockedSessionActionMessage([currentSession], "Settings apply");
        setError(blockedMessage);
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, blockedMessage, true);
        return;
      }
      const startupDraft = readSessionStartupFromControls({
        startCwdInput: refs.startCwdInput,
        startCommandInput: refs.startCommandInput,
        startEnvInput: refs.startEnvInput,
        sessionTagsInput: refs.sessionTagsInput,
        sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect
      });
      const inputSafetyProfile = readSessionInputSafetyFromControls(
        {
          inputSafetyPresetSelect: refs.inputSafetyPresetSelect
        },
        currentSession
      );
      if (!startupDraft.startCwd) {
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, "Working Directory cannot be empty.", true);
        return;
      }
      if (!startupDraft.envResult.ok) {
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, startupDraft.envResult.error, true);
        return;
      }
      if (!startupDraft.tagResult.ok) {
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, startupDraft.tagResult.error, true);
        return;
      }
      const profile = readThemeProfileFromControls({
        themeInputs: refs.themeInputs,
        themeBg: refs.themeBg,
        themeFg: refs.themeFg
      });
      const invalidKey = themeProfileKeys.find((key) => !isValidHexColor(profile[key]));
      if (invalidKey) {
        setError("Custom theme colors must be valid hex values like #1d2021.");
        return;
      }
      const detectedPreset = detectThemePreset(profile);
      const requestedPreset = themeModeSet.has(refs.themeSelect?.value) ? refs.themeSelect.value : "custom";
      const nextPreset =
        requestedPreset === "custom" ? "custom" : detectedPreset === requestedPreset ? requestedPreset : "custom";
      sessionThemeDrafts.set(session.id, {
        preset: nextPreset,
        profile,
        category: normalizeThemeFilterCategory(String(refs.themeCategory?.value || "all").toLowerCase()),
        search: String(refs.themeSearch?.value || "")
      });
      applyThemeForSession(session.id);
      syncSessionThemeControls(refs, session.id);
      clearError();
      try {
        const updated = await api.updateSession(session.id, {
          startCwd: startupDraft.startCwd,
          startCommand: startupDraft.startCommand,
          env: startupDraft.envResult.env,
          tags: startupDraft.tagResult.tags,
          themeProfile: profile,
          inputSafetyProfile
        });
        applyRuntimeEvent({ type: "session.updated", session: updated });
        sessionThemeDrafts.delete(session.id);
        setSessionSendTerminator(session.id, startupDraft.sendTerminator);
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, "Settings saved.");
        setSettingsDirty(getEntry(), false);
      } catch {
        setError("Failed to save theme settings.");
        setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, "Failed to save settings.", true);
      }
    });

    refs.settingsCancelBtn?.addEventListener("click", () => {
      const freshSession = getSession();
      sessionThemeDrafts.delete(session.id);
      if (freshSession) {
        syncSessionStartupControls(
          {
            startCwdInput: refs.startCwdInput,
            startCommandInput: refs.startCommandInput,
            startEnvInput: refs.startEnvInput,
            sessionTagsInput: refs.sessionTagsInput,
            sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
            inputSafetyPresetSelect: refs.inputSafetyPresetSelect
          },
          freshSession
        );
        syncSessionInputSafetyControls(refs, freshSession);
        syncSessionThemeControls(refs, session.id);
      }
      applyThemeForSession(session.id);
      setStartupSettingsFeedback({ startFeedback: refs.startFeedback }, "");
      setSettingsDirty(getEntry(), false);
    });
  }

  return {
    bindSessionCardInteractions
  };
}
