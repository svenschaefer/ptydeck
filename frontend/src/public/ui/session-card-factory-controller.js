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
    const settingsBtn = node.querySelector(".session-settings");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const settingsDialog = node.querySelector(".session-settings-dialog");
    const settingsDismissBtn = node.querySelector(".session-settings-dismiss");
    const settingsTabStartupBtn = node.querySelector(".session-settings-tab-startup");
    const settingsTabNoteBtn = node.querySelector(".session-settings-tab-note");
    const settingsTabThemeBtn = node.querySelector(".session-settings-tab-theme");
    const settingsPanelStartup = node.querySelector(".session-settings-panel-startup");
    const settingsPanelNote = node.querySelector(".session-settings-panel-note");
    const settingsPanelTheme = node.querySelector(".session-settings-panel-theme");
    const startCwdInput = node.querySelector(".session-start-cwd");
    const startCommandInput = node.querySelector(".session-start-command");
    const startEnvInput = node.querySelector(".session-start-env");
    const mouseForwardingModeSelect = node.querySelector(".session-mouse-forwarding-mode");
    const sessionNoteInput = node.querySelector(".session-note-input");
    const sessionSendTerminatorSelect = node.querySelector(".session-send-terminator");
    const inputSafetyRequireValidShellSyntax = node.querySelector(".session-input-safety-require-valid-shell-syntax");
    const inputSafetyConfirmIncompleteShellConstruct = node.querySelector(
      ".session-input-safety-confirm-incomplete-shell-construct"
    );
    const inputSafetyConfirmNaturalLanguageInput = node.querySelector(".session-input-safety-confirm-natural-language-input");
    const inputSafetyConfirmDangerousShellCommand = node.querySelector(
      ".session-input-safety-confirm-dangerous-shell-command"
    );
    const inputSafetyConfirmMultilineInput = node.querySelector(".session-input-safety-confirm-multiline-input");
    const inputSafetyConfirmRecentTargetSwitch = node.querySelector(".session-input-safety-confirm-recent-target-switch");
    const inputSafetyTargetSwitchGraceMs = node.querySelector(".session-input-safety-target-switch-grace-ms");
    const inputSafetyPasteLengthConfirmThreshold = node.querySelector(".session-input-safety-paste-length-threshold");
    const inputSafetyPasteLineConfirmThreshold = node.querySelector(".session-input-safety-paste-line-threshold");
    const sessionTagsInput = node.querySelector(".session-tags-input");
    const startFeedback = node.querySelector(".session-start-feedback");
    const settingsFeedback = node.querySelector(".session-settings-feedback");
    const tagListEl = node.querySelector(".session-tag-list");
    const themeCategory = node.querySelector(".session-theme-category");
    const themeSearch = node.querySelector(".session-theme-search");
    const themeSlotSelect = node.querySelector(".session-theme-slot");
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
    const inputSafetyControls = {
      requireValidShellSyntax: inputSafetyRequireValidShellSyntax,
      confirmOnIncompleteShellConstruct: inputSafetyConfirmIncompleteShellConstruct,
      confirmOnNaturalLanguageInput: inputSafetyConfirmNaturalLanguageInput,
      confirmOnDangerousShellCommand: inputSafetyConfirmDangerousShellCommand,
      confirmOnMultilineInput: inputSafetyConfirmMultilineInput,
      confirmOnRecentTargetSwitch: inputSafetyConfirmRecentTargetSwitch,
      targetSwitchGraceMs: inputSafetyTargetSwitchGraceMs,
      pasteLengthConfirmThreshold: inputSafetyPasteLengthConfirmThreshold,
      pasteLineConfirmThreshold: inputSafetyPasteLineConfirmThreshold
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
      settingsBtn,
      renameBtn,
      closeBtn,
      settingsDialog,
      settingsDismissBtn,
      settingsTabStartupBtn,
      settingsTabNoteBtn,
      settingsTabThemeBtn,
      settingsPanelStartup,
      settingsPanelNote,
      settingsPanelTheme,
      startCwdInput,
      startCommandInput,
      startEnvInput,
      mouseForwardingModeSelect,
      sessionNoteInput,
      sessionSendTerminatorSelect,
      inputSafetyControls,
      sessionTagsInput,
      startFeedback,
      settingsFeedback,
      tagListEl,
      themeCategory,
      themeSearch,
      themeSlotSelect,
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
