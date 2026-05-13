export function createSessionCardRenderController(options = {}) {
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const isSessionUnrestored = options.isSessionUnrestored || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const isSessionStopped = options.isSessionStopped || (() => false);
  const isSessionStartBlocked = options.isSessionStartBlocked || (() => false);
  const getSessionRuntimeState = options.getSessionRuntimeState || ((session) => String(session?.state || "").trim().toLowerCase());
  const getSessionStateBadgeText = options.getSessionStateBadgeText || (() => "");
  const getSessionStateHintText = options.getSessionStateHintText || (() => "");
  const getSessionStartBlockedMessage = options.getSessionStartBlockedMessage || (() => "Session start is unavailable.");
  const isTerminalAtBottom = options.isTerminalAtBottom || (() => true);
  const setSessionCardVisibility = options.setSessionCardVisibility || (() => {});
  const syncTerminalViewportAfterShow = options.syncTerminalViewportAfterShow || (() => {});
  const ensureQuickId = options.ensureQuickId || ((sessionId) => String(sessionId || ""));
  const getSessionHeaderLabel =
    typeof options.getSessionHeaderLabel === "function"
      ? options.getSessionHeaderLabel
      : (session) => session?.name || String(session?.id || "").slice(0, 8);
  const renderSessionAppIdentity = options.renderSessionAppIdentity || (() => {});
  const renderSessionTagList = options.renderSessionTagList || (() => {});
  const renderSessionNote = options.renderSessionNote || (() => {});
  const renderSessionQuickSend = options.renderSessionQuickSend || (() => {});
  const syncSessionStartupControls = options.syncSessionStartupControls || (() => {});
  const syncSessionNoteControls = options.syncSessionNoteControls || (() => {});
  const syncSessionInputSafetyControls = options.syncSessionInputSafetyControls || (() => {});
  const syncSessionThemeControls = options.syncSessionThemeControls || (() => {});
  const setSettingsDirty = options.setSettingsDirty || (() => {});
  const applyThemeForSession = options.applyThemeForSession || (() => {});
  const renderSessionControl = options.renderSessionControl || (() => {});
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const getReadOnlyModeMessage =
    typeof options.getReadOnlyModeMessage === "function"
      ? options.getReadOnlyModeMessage
      : () => "Read-only spectator mode. Write actions are disabled.";
  const getActiveElement =
    typeof options.getActiveElement === "function" ? options.getActiveElement : () => documentRef?.activeElement || null;
  const refocusTerminal =
    typeof options.refocusTerminal === "function" ? options.refocusTerminal : (entry) => entry?.terminal?.focus?.();

  function isTerminalMountFocused(entry, activeElement) {
    if (!entry?.mount || !activeElement) {
      return false;
    }
    if (activeElement === entry.mount) {
      return true;
    }
    if (typeof entry.mount.contains === "function" && entry.mount.contains(activeElement)) {
      return true;
    }
    return false;
  }

  function updateExistingSessionCard({ entry, session, activeSessionId, nextVisible }) {
    if (!entry || !session) {
      return;
    }
    const activeElementBeforeUpdate = getActiveElement();
    const shouldRestoreTerminalFocus =
      activeSessionId === session.id && nextVisible !== false && isTerminalMountFocused(entry, activeElementBeforeUpdate);
    const stateBadgeText = getSessionStateBadgeText(session);
    const stateHintText = getSessionStateHintText(session);
    const wasVisible = entry.isVisible !== false;
    const readOnlyMode = isReadOnlyMode();
    const readOnlyMessage = readOnlyMode ? getReadOnlyModeMessage() : "";

    entry.element.classList.toggle("active", activeSessionId === session.id);
    entry.element.classList.toggle("unrestored", isSessionUnrestored(session));
    entry.element.classList.toggle("stopped", isSessionStopped(session));
    entry.element.classList.toggle("exited", isSessionExited(session));
    applyThemeForSession(session.id, { active: activeSessionId === session.id });
    if (wasVisible && !nextVisible) {
      entry.followOnShow = isTerminalAtBottom(entry.terminal);
    }
    setSessionCardVisibility(entry.element, nextVisible);
    entry.isVisible = nextVisible;

    if (nextVisible && (!wasVisible || entry.pendingViewportSync)) {
      syncTerminalViewportAfterShow(session.id, entry);
    }

    entry.focusBtn.textContent = getSessionHeaderLabel(session);
    entry.quickIdEl.textContent = ensureQuickId(session.id);

    if (entry.stateBadgeEl) {
      entry.stateBadgeEl.hidden = !stateBadgeText;
      entry.stateBadgeEl.textContent = stateBadgeText;
    }
    if (entry.unrestoredHintEl) {
      entry.unrestoredHintEl.hidden = !stateHintText;
      entry.unrestoredHintEl.textContent = stateHintText;
    }

    renderSessionAppIdentity(entry, session);
    renderSessionTagList(entry, session);
    renderSessionNote(entry, session);
    renderSessionQuickSend(entry, session);
    renderSessionControl(entry, session);

    if (entry.startStopBtn) {
      const runtimeState = getSessionRuntimeState(session);
      const sessionStopped = isSessionStopped(session);
      const startBlocked = isSessionStartBlocked(session);
      const startBlockedMessage = startBlocked ? getSessionStartBlockedMessage(session) : "";
      const interactiveToggleState =
        runtimeState === "created" ||
        runtimeState === "starting" ||
        runtimeState === "running" ||
        runtimeState === "busy" ||
        runtimeState === "idle" ||
        sessionStopped;
      const startMode = sessionStopped;
      entry.startStopBtn.disabled = readOnlyMode || !interactiveToggleState || startBlocked;
      entry.startStopBtn.setAttribute(
        "aria-label",
        startBlocked ? "Start session unavailable" : startMode ? "Start session" : "Stop session"
      );
      entry.startStopBtn.setAttribute(
        "title",
        readOnlyMessage || startBlockedMessage || (startMode ? "Start session" : "Stop session")
      );
      if (entry.startStopIconEl) {
        entry.startStopIconEl.classList.toggle("icon-tabler-player-play-filled", startMode);
        entry.startStopIconEl.classList.toggle("icon-tabler-player-stop-filled", !startMode);
      }
    }

    for (const control of [entry.settingsBtn, entry.renameBtn, entry.closeBtn, entry.settingsApplyBtn]) {
      if (!control) {
        continue;
      }
      control.disabled = readOnlyMode;
      if (readOnlyMessage) {
        control.setAttribute("title", readOnlyMessage);
      } else {
        control.removeAttribute("title");
      }
    }

    if (!entry.settingsDirty && entry.settingsDialog?.open === true) {
      syncSessionStartupControls(entry, session);
      syncSessionNoteControls(entry, session);
      syncSessionInputSafetyControls(entry, session);
      syncSessionThemeControls(entry, session.id);
      setSettingsDirty(entry, false);
    }

    if (shouldRestoreTerminalFocus) {
      refocusTerminal(entry, activeElementBeforeUpdate);
    }
  }

  return {
    updateExistingSessionCard
  };
}
