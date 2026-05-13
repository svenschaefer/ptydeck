export function createSessionCardFactoryController(options = {}) {
  const ensureQuickId = options.ensureQuickId || ((sessionId) => String(sessionId || ""));
  const getSessionHeaderLabel =
    typeof options.getSessionHeaderLabel === "function"
      ? options.getSessionHeaderLabel
      : (session) => session?.name || String(session?.id || "").slice(0, 8);
  const getSessionStateBadgeText = options.getSessionStateBadgeText || (() => "");
  const getSessionStateHintText = options.getSessionStateHintText || (() => "");
  const isSessionStopped = options.isSessionStopped || (() => false);
  const isSessionUnrestored = options.isSessionUnrestored || (() => false);
  const isSessionExited = options.isSessionExited || (() => false);
  const renderSessionAppIdentity = options.renderSessionAppIdentity || (() => {});
  const renderSessionTagList = options.renderSessionTagList || (() => {});
  const renderSessionNote = options.renderSessionNote || (() => {});
  const renderSessionQuickSend = options.renderSessionQuickSend || (() => {});
  const setSessionCardVisibility = options.setSessionCardVisibility || (() => {});

  function createSessionCardView({ template, session, themeProfileKeys = [], activeSessionId = "", visible = true }) {
    const node = template.content.firstElementChild.cloneNode(true);
    const quickIdEl = node.querySelector(".session-quick-id");
    const focusBtn = node.querySelector(".session-focus");
    const stateBadgeEl = node.querySelector(".session-state-badge");
    const controlBadgeEl = node.querySelector(".session-control-badge");
    const sessionMetaRowEl = node.querySelector(".terminal-toolbar-meta");
    const toolbarEl = node.querySelector(".terminal-toolbar");
    const sessionAppIdentityEl = node.querySelector(".session-app-identity");
    const sessionNoteEl = node.querySelector(".session-note-text");
    const unrestoredHintEl = node.querySelector(".session-unrestored-hint");
    const startStopBtn = node.querySelector(".session-start-stop");
    const startStopIconEl = node.querySelector(".session-start-stop-icon");
    const refreshBtn = node.querySelector(".session-refresh");
    const settingsBtn = node.querySelector(".session-settings");
    const composerPinBtn = node.querySelector(".session-composer-pin");
    const composerOverlayHostEl = node.querySelector(".session-composer-overlay-host");
    const quickSendPanelEl = node.querySelector(".session-quick-send-panel");
    const quickSendTitleEl = node.querySelector(".session-quick-send-title");
    const quickSendTargetEl = node.querySelector(".session-quick-send-target");
    const quickSendActionsEl = node.querySelector(".session-quick-send-actions");
    const renameBtn = node.querySelector(".session-rename");
    const closeBtn = node.querySelector(".session-close");
    const settingsDialog = node.querySelector(".session-settings-dialog");
    const settingsDismissBtn = node.querySelector(".session-settings-dismiss");
    const sessionControlTakeBtn = node.querySelector(".session-control-take");
    const sessionControlReleaseBtn = node.querySelector(".session-control-release");
    const sessionControlSummaryEl = node.querySelector(".session-control-summary");
    const sessionControlDeviceNameInput = node.querySelector(".session-control-device-name");
    const sessionControlDeviceSaveBtn = node.querySelector(".session-control-device-save");
    const sessionControlClientsEl = node.querySelector(".session-control-clients");
    const settingsTabStartupBtn = node.querySelector(".session-settings-tab-startup");
    const settingsTabInputBtn = node.querySelector(".session-settings-tab-input");
    const settingsTabNoteBtn = node.querySelector(".session-settings-tab-note");
    const settingsTabThemeBtn = node.querySelector(".session-settings-tab-theme");
    const settingsLayout = node.querySelector(".session-settings-layout");
    const settingsPanelStartup = node.querySelector(".session-settings-panel-startup");
    const settingsPanelInput = node.querySelector(".session-settings-panel-input");
    const settingsPanelNote = node.querySelector(".session-settings-panel-note");
    const settingsPanelTheme = node.querySelector(".session-settings-panel-theme");
    const startCwdInput = node.querySelector(".session-start-cwd");
    const startCommandInput = node.querySelector(".session-start-command");
    const startEnvInput = node.querySelector(".session-start-env");
    const mouseForwardingModeSelect = node.querySelector(".session-mouse-forwarding-mode");
    const sessionNoteInput = node.querySelector(".session-note-input");
    const sessionSendTerminatorSelect = node.querySelector(".session-send-terminator");
    const inputSafetyRequireValidShellSyntax = node.querySelector(".session-input-safety-require-valid-shell-syntax");
    const inputSafetyConfirmOnAnyInput = node.querySelector(".session-input-safety-confirm-on-any-input");
    const inputSafetyConfirmIncompleteShellConstruct = node.querySelector(
      ".session-input-safety-confirm-incomplete-shell-construct"
    );
    const inputSafetyConfirmNaturalLanguageInput = node.querySelector(".session-input-safety-confirm-natural-language-input");
    const inputSafetyConfirmDangerousShellCommand = node.querySelector(
      ".session-input-safety-confirm-dangerous-shell-command"
    );
    const inputSafetyConfirmMultilineInput = node.querySelector(".session-input-safety-confirm-multiline-input");
    const inputSafetyAutoContinueStalledPaste = node.querySelector(".session-input-safety-auto-continue-stalled-paste");
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
    const themeImportFormat = node.querySelector(".session-theme-import-format");
    const themeImportPayload = node.querySelector(".session-theme-import-payload");
    const themeImportBtn = node.querySelector(".session-theme-import");
    const themeExportFormat = node.querySelector(".session-theme-export-format");
    const themeExportPayload = node.querySelector(".session-theme-export-payload");
    const themeExportBtn = node.querySelector(".session-theme-export");
    const themeCopyExportBtn = node.querySelector(".session-theme-copy-export");
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
      confirmOnAnyInput: inputSafetyConfirmOnAnyInput,
      requireValidShellSyntax: inputSafetyRequireValidShellSyntax,
      confirmOnIncompleteShellConstruct: inputSafetyConfirmIncompleteShellConstruct,
      confirmOnNaturalLanguageInput: inputSafetyConfirmNaturalLanguageInput,
      confirmOnDangerousShellCommand: inputSafetyConfirmDangerousShellCommand,
      confirmOnMultilineInput: inputSafetyConfirmMultilineInput,
      autoContinueStalledPaste: inputSafetyAutoContinueStalledPaste,
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
      focusBtn.textContent = getSessionHeaderLabel(session);
    }
    if (quickIdEl) {
      quickIdEl.textContent = quickId;
    }
    node.classList.toggle("stopped", isSessionStopped(session));
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
    renderSessionAppIdentity({ sessionMetaRowEl, sessionAppIdentityEl, sessionNoteEl, tagListEl }, session);
    renderSessionTagList({ sessionMetaRowEl, sessionAppIdentityEl, sessionNoteEl, tagListEl }, session);
    renderSessionNote({ sessionMetaRowEl, sessionAppIdentityEl, sessionNoteEl, tagListEl }, session);
    renderSessionQuickSend({ quickSendPanelEl, quickSendActionsEl }, session);
    setSessionCardVisibility(node, visible);

    return {
      node,
      quickIdEl,
      focusBtn,
      stateBadgeEl,
      controlBadgeEl,
      toolbarEl,
      sessionMetaRowEl,
      sessionAppIdentityEl,
      sessionNoteEl,
      unrestoredHintEl,
      startStopBtn,
      startStopIconEl,
      refreshBtn,
      settingsBtn,
      composerPinBtn,
      composerOverlayHostEl,
      quickSendPanelEl,
      quickSendTitleEl,
      quickSendTargetEl,
      quickSendActionsEl,
      renameBtn,
      closeBtn,
      settingsDialog,
      settingsDismissBtn,
      sessionControlTakeBtn,
      sessionControlReleaseBtn,
      sessionControlSummaryEl,
      sessionControlDeviceNameInput,
      sessionControlDeviceSaveBtn,
      sessionControlClientsEl,
      settingsTabStartupBtn,
      settingsTabInputBtn,
      settingsTabNoteBtn,
      settingsTabThemeBtn,
      settingsLayout,
      settingsPanelStartup,
      settingsPanelInput,
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
      themeImportFormat,
      themeImportPayload,
      themeImportBtn,
      themeExportFormat,
      themeExportPayload,
      themeExportBtn,
      themeCopyExportBtn,
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
