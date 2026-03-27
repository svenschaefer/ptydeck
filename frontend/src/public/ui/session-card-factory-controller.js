export function createSessionCardFactoryController(options = {}) {
  const ensureQuickId = options.ensureQuickId || ((sessionId) => String(sessionId || ""));
  const getSessionStateBadgeText = options.getSessionStateBadgeText || (() => "");
  const getSessionStateHintText = options.getSessionStateHintText || (() => "");
  const isSessionUnrestored = options.isSessionUnrestored || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const renderSessionTagList = options.renderSessionTagList || (() => {});
  const renderSessionNote = options.renderSessionNote || (() => {});
  const setSessionCardVisibility = options.setSessionCardVisibility || (() => {});

  function createSessionCardView({ template, session, themeProfileKeys = [], activeSessionId = "", visible = true }) {
    const node = template.content.firstElementChild.cloneNode(true);
    const quickIdEl = node.querySelector(".session-quick-id");
    const focusBtn = node.querySelector(".session-focus");
    const stateBadgeEl = node.querySelector(".session-state-badge");
    const sessionMetaRowEl = node.querySelector(".terminal-toolbar-meta");
    const sessionNoteEl = node.querySelector(".session-note-text");
    const unrestoredHintEl = node.querySelector(".session-unrestored-hint");
    const replayViewBtn = node.querySelector(".session-replay-view");
    const replayExportBtn = node.querySelector(".session-replay-export");
    const settingsBtn = node.querySelector(".session-settings");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const settingsDialog = node.querySelector(".session-settings-dialog");
    const settingsDismissBtn = node.querySelector(".session-settings-dismiss");
    const startCwdInput = node.querySelector(".session-start-cwd");
    const startCommandInput = node.querySelector(".session-start-command");
    const startEnvInput = node.querySelector(".session-start-env");
    const sessionSendTerminatorSelect = node.querySelector(".session-send-terminator");
    const inputSafetyPresetSelect = node.querySelector(".session-input-safety-preset");
    const sessionTagsInput = node.querySelector(".session-tags-input");
    const startFeedback = node.querySelector(".session-start-feedback");
    const tagListEl = node.querySelector(".session-tag-list");
    const themeCategory = node.querySelector(".session-theme-category");
    const themeSearch = node.querySelector(".session-theme-search");
    const themeSelect = node.querySelector(".session-theme-select");
    const themeBg = node.querySelector(".session-theme-bg");
    const themeFg = node.querySelector(".session-theme-fg");
    const settingsApplyBtn = node.querySelector(".session-settings-apply");
    const settingsCancelBtn = node.querySelector(".session-settings-cancel");
    const settingsStatus = node.querySelector(".session-settings-status");
    const mount = node.querySelector(".terminal-mount");

    const themeInputs = {
      background: themeBg,
      foreground: themeFg
    };
    for (const key of themeProfileKeys) {
      if (themeInputs[key]) {
        continue;
      }
      const classSuffix = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      const input = node.querySelector(`.session-theme-${classSuffix}`);
      if (input) {
        themeInputs[key] = input;
      }
    }

    const quickId = ensureQuickId(session.id);
    const stateBadgeText = getSessionStateBadgeText(session);
    const stateHintText = getSessionStateHintText(session);

    if (focusBtn) {
      focusBtn.textContent = session.name || session.id.slice(0, 8);
    }
    if (quickIdEl) {
      quickIdEl.textContent = quickId;
    }
    node.classList.toggle("unrestored", isSessionUnrestored(session));
    node.classList.toggle("exited", isSessionExited(session));
    node.classList.toggle("active", activeSessionId === session.id);
    if (stateBadgeEl) {
      stateBadgeEl.hidden = !stateBadgeText;
      stateBadgeEl.textContent = stateBadgeText;
    }
    if (unrestoredHintEl) {
      unrestoredHintEl.hidden = !stateHintText;
      unrestoredHintEl.textContent = stateHintText;
    }
    renderSessionTagList({ sessionMetaRowEl, sessionNoteEl, tagListEl }, session);
    renderSessionNote({ sessionMetaRowEl, sessionNoteEl, tagListEl }, session);
    setSessionCardVisibility(node, visible);

    return {
      node,
      quickIdEl,
      focusBtn,
      stateBadgeEl,
      sessionMetaRowEl,
      sessionNoteEl,
      unrestoredHintEl,
      replayViewBtn,
      replayExportBtn,
      settingsBtn,
      renameBtn,
      closeBtn,
      settingsDialog,
      settingsDismissBtn,
      startCwdInput,
      startCommandInput,
      startEnvInput,
      sessionSendTerminatorSelect,
      inputSafetyPresetSelect,
      sessionTagsInput,
      startFeedback,
      tagListEl,
      themeCategory,
      themeSearch,
      themeSelect,
      themeBg,
      themeFg,
      themeInputs,
      settingsApplyBtn,
      settingsCancelBtn,
      settingsStatus,
      mount
    };
  }

  return {
    createSessionCardView
  };
}
