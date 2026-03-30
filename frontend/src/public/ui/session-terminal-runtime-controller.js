import {
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION,
  normalizeSessionMouseForwardingMode
} from "../session-mouse-forwarding.js";

export function createSessionTerminalRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const navigatorRef = options.navigatorRef || windowRef.navigator || globalThis.navigator || null;
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
  const writeClipboardText =
    typeof options.writeClipboardText === "function"
      ? options.writeClipboardText
      : async (text) => {
          if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.writeText !== "function") {
            return false;
          }
          await navigatorRef.clipboard.writeText(String(text ?? ""));
          return true;
        };
  const canWriteClipboardText =
    typeof options.canWriteClipboardText === "function"
      ? options.canWriteClipboardText
      : () => !!navigatorRef?.clipboard && typeof navigatorRef.clipboard.writeText === "function";
  const readClipboardText =
    typeof options.readClipboardText === "function"
      ? options.readClipboardText
      : async () => {
          if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.readText !== "function") {
            return "";
          }
          const text = await navigatorRef.clipboard.readText();
          return typeof text === "string" ? text : String(text ?? "");
        };
  const requestTerminalCtrlCAction =
    typeof options.requestTerminalCtrlCAction === "function"
      ? options.requestTerminalCtrlCAction
      : async () => "cancel";
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;

  function getTerminalSelection(terminal) {
    if (!terminal) {
      return "";
    }
    if (typeof terminal.getSelection === "function") {
      const selection = terminal.getSelection();
      return typeof selection === "string" ? selection : String(selection ?? "");
    }
    return "";
  }

  function hasTerminalSelection(terminal) {
    if (!terminal) {
      return false;
    }
    if (typeof terminal.hasSelection === "function") {
      return terminal.hasSelection() === true;
    }
    return getTerminalSelection(terminal).length > 0;
  }

  function bindTerminalClipboardInteractions({ session, mount, terminal, onTerminalData, onTerminalPaste }) {
    if (!mount || typeof mount.addEventListener !== "function") {
      return () => {};
    }

    let ctrlCIntentPending = false;
    let suppressNextPaste = false;

    function isMouseForwardingEnabled() {
      const currentSession = getSessionById(session.id) || session;
      return normalizeSessionMouseForwardingMode(currentSession?.mouseForwardingMode) === SESSION_MOUSE_FORWARDING_MODE_APPLICATION;
    }

    const handleKeydown = (event) => {
      const isCtrlC =
        event &&
        String(event.key || "").toLowerCase() === "c" &&
        event.ctrlKey === true &&
        event.metaKey !== true &&
        event.altKey !== true;
      if (isCtrlC) {
        if (!hasTerminalSelection(terminal) || canWriteClipboardText() !== true) {
          return;
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        if (ctrlCIntentPending) {
          return;
        }
        ctrlCIntentPending = true;
        const selection = getTerminalSelection(terminal);
        Promise.resolve(requestTerminalCtrlCAction({ session, selection }))
          .then((action) => {
            if (action === "copy" && selection) {
              return Promise.resolve(writeClipboardText(selection)).then((copied) => {
                if (copied) {
                  debugLog("clipboard.copy.terminal", { sessionId: session.id, length: selection.length, source: "ctrl-c" });
                }
                terminal.focus?.();
              });
            }
            if (action === "cancel") {
              onTerminalData(session.id, "\u0003");
              debugLog("terminal.cancel.ctrl-c", { sessionId: session.id });
              terminal.focus?.();
            }
            return undefined;
          })
          .catch(() => {})
          .finally(() => {
            ctrlCIntentPending = false;
          });
        return;
      }
      if (!event || event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!hasTerminalSelection(terminal)) {
        return;
      }
      const selection = getTerminalSelection(terminal);
      if (!selection) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      Promise.resolve(writeClipboardText(selection))
        .then((copied) => {
          if (copied) {
            debugLog("clipboard.copy.terminal", { sessionId: session.id, length: selection.length });
          }
        })
        .catch(() => {});
    };

    const handleMiddleMouseDown = (event) => {
      if (!event || event.button !== 1) {
        return;
      }
      if (isMouseForwardingEnabled()) {
        suppressNextPaste = true;
        setTimeoutFn(() => {
          suppressNextPaste = false;
        }, 0);
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      Promise.resolve(readClipboardText())
        .then((text) => {
          if (!text) {
            return;
          }
          terminal.focus?.();
          onTerminalPaste(session.id, text);
          debugLog("clipboard.paste.terminal", { sessionId: session.id, length: text.length });
        })
        .catch(() => {});
    };

    const handlePaste = (event) => {
      if (suppressNextPaste && isMouseForwardingEnabled()) {
        suppressNextPaste = false;
        return;
      }
      const text = event?.clipboardData?.getData?.("text") || "";
      if (!text) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      terminal.focus?.();
      onTerminalPaste(session.id, text);
      debugLog("clipboard.paste.terminal", { sessionId: session.id, length: text.length, source: "clipboard" });
    };

    const handleAuxClick = (event) => {
      if (!event || event.button !== 1) {
        return;
      }
      if (isMouseForwardingEnabled()) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    mount.addEventListener("keydown", handleKeydown, true);
    mount.addEventListener("mousedown", handleMiddleMouseDown);
    mount.addEventListener("auxclick", handleAuxClick);
    mount.addEventListener("paste", handlePaste, true);

    return () => {
      if (typeof mount.removeEventListener === "function") {
        mount.removeEventListener("keydown", handleKeydown, true);
        mount.removeEventListener("mousedown", handleMiddleMouseDown);
        mount.removeEventListener("auxclick", handleAuxClick);
        mount.removeEventListener("paste", handlePaste, true);
      }
    };
  }

  function mountSessionTerminalCard(args = {}) {
    const session = args.session;
    const refs = args.refs || {};
    const initialVisible = args.initialVisible === true;
    const containerEl = args.containerEl || args.gridEl;
    const terminals = args.terminals;
    const terminalObservers = args.terminalObservers;
    const resolveInitialTheme = args.resolveInitialTheme || (() => ({}));
    const onSessionMounted = args.onSessionMounted || (() => {});
    const onTerminalData = args.onTerminalData || (() => {});
    const onTerminalPaste = args.onTerminalPaste || onTerminalData;
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
    onSessionMounted(session);

    containerEl.appendChild(refs.node);
    terminal.open(refs.mount);
    terminal.onData((data) => {
      onTerminalData(session.id, data);
    });
    const disposeClipboardBindings = bindTerminalClipboardInteractions({
      session,
      mount: refs.mount,
      terminal,
      onTerminalData,
      onTerminalPaste
    });

    const entry = {
      terminal,
      element: refs.node,
      focusBtn: refs.focusBtn,
      quickIdEl: refs.quickIdEl,
      stateBadgeEl: refs.stateBadgeEl,
      sessionMetaRowEl: refs.sessionMetaRowEl,
      sessionNoteEl: refs.sessionNoteEl,
      unrestoredHintEl: refs.unrestoredHintEl,
      settingsDialog: refs.settingsDialog,
      settingsTabStartupBtn: refs.settingsTabStartupBtn,
      settingsTabNoteBtn: refs.settingsTabNoteBtn,
      settingsTabThemeBtn: refs.settingsTabThemeBtn,
      settingsPanelStartup: refs.settingsPanelStartup,
      settingsPanelNote: refs.settingsPanelNote,
      settingsPanelTheme: refs.settingsPanelTheme,
      startCwdInput: refs.startCwdInput,
      startCommandInput: refs.startCommandInput,
      startEnvInput: refs.startEnvInput,
      mouseForwardingModeSelect: refs.mouseForwardingModeSelect,
      sessionNoteInput: refs.sessionNoteInput,
      sessionSendTerminatorSelect: refs.sessionSendTerminatorSelect,
      inputSafetyControls: refs.inputSafetyControls,
      sessionTagsInput: refs.sessionTagsInput,
      startFeedback: refs.startFeedback,
      tagListEl: refs.tagListEl,
      settingsApplyBtn: refs.settingsApplyBtn,
      settingsCancelBtn: refs.settingsCancelBtn,
      settingsStatus: refs.settingsStatus,
      themeCategory: refs.themeCategory,
      themeSearch: refs.themeSearch,
      themeSlotSelect: refs.themeSlotSelect,
      themeSelect: refs.themeSelect,
      themeBg: refs.themeBg,
      themeFg: refs.themeFg,
      themeInputs: refs.themeInputs,
      mount: refs.mount,
      settingsDirty: false,
      isVisible: initialVisible,
      pendingViewportSync: !initialVisible,
      followOnShow: true,
      searchRevision: 0,
      disposeClipboardBindings
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
