export function createSessionCardRenderController(options = {}) {
  const isSessionUnrestored = options.isSessionUnrestored || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const getSessionStateBadgeText = options.getSessionStateBadgeText || (() => "");
  const getSessionStateHintText = options.getSessionStateHintText || (() => "");
  const isTerminalAtBottom = options.isTerminalAtBottom || (() => true);
  const setSessionCardVisibility = options.setSessionCardVisibility || (() => {});
  const syncTerminalViewportAfterShow = options.syncTerminalViewportAfterShow || (() => {});
  const ensureQuickId = options.ensureQuickId || ((sessionId) => String(sessionId || ""));
  const renderSessionTagList = options.renderSessionTagList || (() => {});
  const renderSessionPluginBadges = options.renderSessionPluginBadges || (() => {});
  const renderSessionNote = options.renderSessionNote || (() => {});
  const renderSessionStatus = options.renderSessionStatus || (() => {});
  const renderSessionArtifacts = options.renderSessionArtifacts || (() => {});
  const syncSessionStartupControls = options.syncSessionStartupControls || (() => {});
  const syncSessionThemeControls = options.syncSessionThemeControls || (() => {});
  const setSettingsDirty = options.setSettingsDirty || (() => {});

  function updateExistingSessionCard({ entry, session, activeSessionId, nextVisible }) {
    if (!entry || !session) {
      return;
    }
    const stateBadgeText = getSessionStateBadgeText(session);
    const stateHintText = getSessionStateHintText(session);
    const wasVisible = entry.isVisible !== false;

    entry.element.classList.toggle("active", activeSessionId === session.id);
    entry.element.classList.toggle("unrestored", isSessionUnrestored(session));
    entry.element.classList.toggle("exited", isSessionExited(session));
    entry.element.classList.toggle("attention", session?.attentionActive === true);

    if (wasVisible && !nextVisible) {
      entry.followOnShow = isTerminalAtBottom(entry.terminal);
    }
    setSessionCardVisibility(entry.element, nextVisible);
    entry.isVisible = nextVisible;

    if (nextVisible && (!wasVisible || entry.pendingViewportSync)) {
      syncTerminalViewportAfterShow(session.id, entry);
    }

    entry.focusBtn.textContent = session.name || session.id.slice(0, 8);
    entry.quickIdEl.textContent = ensureQuickId(session.id);

    if (entry.stateBadgeEl) {
      entry.stateBadgeEl.hidden = !stateBadgeText;
      entry.stateBadgeEl.textContent = stateBadgeText;
    }
    if (entry.unrestoredHintEl) {
      entry.unrestoredHintEl.hidden = !stateHintText;
      entry.unrestoredHintEl.textContent = stateHintText;
    }

    renderSessionTagList(entry, session);
    renderSessionPluginBadges(entry, session);
    renderSessionNote(entry, session);
    renderSessionStatus(entry, session);
    renderSessionArtifacts(entry, session);

    if (!entry.settingsDirty) {
      syncSessionStartupControls(entry, session);
      syncSessionThemeControls(entry, session.id);
      setSettingsDirty(entry, false);
    }
  }

  return {
    updateExistingSessionCard
  };
}
