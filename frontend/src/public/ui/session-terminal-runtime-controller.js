export function createSessionTerminalRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const ResizeObserverCtor =
    typeof windowRef.ResizeObserver === "function" ? windowRef.ResizeObserver : globalThis.ResizeObserver;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const terminalFontSize = Number(options.terminalFontSize) || 16;
  const terminalLineHeight = Number(options.terminalLineHeight) || 1.2;
  const terminalFontFamily = String(options.terminalFontFamily || "monospace");
  const debugLog = options.debugLog || (() => {});

  function mountSessionTerminalCard(args = {}) {
    const session = args.session;
    const refs = args.refs || {};
    const initialVisible = args.initialVisible === true;
    const gridEl = args.gridEl;
    const terminals = args.terminals;
    const terminalObservers = args.terminalObservers;
    const resolveInitialTheme = args.resolveInitialTheme || (() => ({}));
    const streamPluginEngine = args.streamPluginEngine;
    const onTerminalData = args.onTerminalData || (() => {});
    const afterEntryRegistered = args.afterEntryRegistered || (() => {});
    const onFirstTerminalMounted = args.onFirstTerminalMounted || (() => {});
    const applyResizeForSession = args.applyResizeForSession || (() => {});

    const terminal = new windowRef.Terminal({
      convertEol: true,
      fontSize: terminalFontSize,
      lineHeight: terminalLineHeight,
      fontFamily: terminalFontFamily,
      cursorBlink: true,
      theme: resolveInitialTheme(session.id)
    });
    debugLog("terminal.created", { sessionId: session.id });
    streamPluginEngine?.ensureSession?.(session);

    gridEl.appendChild(refs.node);
    terminal.open(refs.mount);
    terminal.onData((data) => {
      onTerminalData(session.id, data);
    });

    const entry = {
      terminal,
      element: refs.node,
      focusBtn: refs.focusBtn,
      quickIdEl: refs.quickIdEl,
      stateBadgeEl: refs.stateBadgeEl,
      pluginBadgesEl: refs.pluginBadgesEl,
      unrestoredHintEl: refs.unrestoredHintEl,
      sessionStatusEl: refs.sessionStatusEl,
      sessionArtifactsEl: refs.sessionArtifactsEl,
      settingsDialog: refs.settingsDialog,
      startCwdInput: refs.startCwdInput,
      startCommandInput: refs.startCommandInput,
      startEnvInput: refs.startEnvInput,
      sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
      sessionTagsInput: refs.sessionTagsInput,
      startFeedback: refs.startFeedback,
      tagListEl: refs.tagListEl,
      settingsApplyBtn: refs.settingsApplyBtn,
      settingsStatus: refs.settingsStatus,
      themeCategory: refs.themeCategory,
      themeSearch: refs.themeSearch,
      themeSelect: refs.themeSelect,
      themeBg: refs.themeBg,
      themeFg: refs.themeFg,
      themeInputs: refs.themeInputs,
      mount: refs.mount,
      settingsDirty: false,
      isVisible: initialVisible,
      pendingViewportSync: !initialVisible,
      followOnShow: true,
      searchRevision: 0
    };
    terminals.set(session.id, entry);
    afterEntryRegistered(entry, session);

    const observer = new ResizeObserverCtor(() => {
      applyResizeForSession(session.id);
    });
    observer.observe(refs.mount);
    terminalObservers.set(session.id, observer);

    onFirstTerminalMounted();
    applyResizeForSession(session.id);
    setTimeoutFn(() => applyResizeForSession(session.id), 120);
    setTimeoutFn(() => applyResizeForSession(session.id), 400);
    setTimeoutFn(() => applyResizeForSession(session.id), 900);

    return entry;
  }

  return {
    mountSessionTerminalCard
  };
}
