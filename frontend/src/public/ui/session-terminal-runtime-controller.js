import {
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION,
  normalizeSessionMouseForwardingMode
} from "../session-mouse-forwarding.js";

export function createSessionTerminalRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = windowRef.document || globalThis.document || null;
  const navigatorRef = options.navigatorRef || windowRef.navigator || globalThis.navigator || null;
  const ResizeObserverCtor =
    typeof windowRef.ResizeObserver === "function" ? windowRef.ResizeObserver : globalThis.ResizeObserver;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
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
  const refreshTerminalViewport =
    typeof options.refreshTerminalViewport === "function" ? options.refreshTerminalViewport : () => {};
  const syncTerminalScrollArea =
    typeof options.syncTerminalScrollArea === "function" ? options.syncTerminalScrollArea : () => {};
  const terminals = options.terminals instanceof Map ? options.terminals : null;

  function stabilizeMountedTerminalEntry(entry, sessionId, applyResizeForSession) {
    if (!entry?.terminal) {
      return false;
    }
    if (entry.isVisible === false) {
      entry.pendingViewportSync = true;
      return false;
    }
    if (typeof applyResizeForSession === "function" && sessionId) {
      applyResizeForSession(sessionId, { force: true, skipRemote: true });
    }
    syncTerminalScrollArea(entry.terminal);
    refreshTerminalViewport(entry.terminal);
    if (entry.followOnShow !== false && typeof entry.terminal.scrollToBottom === "function") {
      entry.terminal.scrollToBottom();
    }
    syncTerminalScrollArea(entry.terminal);
    entry.pendingViewportSync = false;
    return true;
  }

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
    let suppressNextClipboardPasteEvent = false;
    let pendingKeyboardPasteSource = "";
    let pendingKeyboardPasteTimer = null;
    let pendingKeyboardPasteFallbackTimer = null;
    let releaseViewportScrollbarDrag = null;
    const handledClipboardEvents = new WeakSet();

    function isMouseForwardingEnabled() {
      const currentSession = getSessionById(session.id) || session;
      return normalizeSessionMouseForwardingMode(currentSession?.mouseForwardingMode) === SESSION_MOUSE_FORWARDING_MODE_APPLICATION;
    }

    function suppressNextClipboardPasteOnce() {
      suppressNextClipboardPasteEvent = true;
      setTimeoutFn(() => {
        suppressNextClipboardPasteEvent = false;
      }, 0);
    }

    function clearPendingKeyboardPasteSource() {
      if (pendingKeyboardPasteTimer !== null) {
        clearTimeoutFn(pendingKeyboardPasteTimer);
        pendingKeyboardPasteTimer = null;
      }
      if (pendingKeyboardPasteFallbackTimer !== null) {
        clearTimeoutFn(pendingKeyboardPasteFallbackTimer);
        pendingKeyboardPasteFallbackTimer = null;
      }
      pendingKeyboardPasteSource = "";
    }

    function armPendingKeyboardPasteSource(source) {
      clearPendingKeyboardPasteSource();
      pendingKeyboardPasteSource = String(source || "").trim();
      pendingKeyboardPasteFallbackTimer = setTimeoutFn(() => {
        pendingKeyboardPasteFallbackTimer = null;
        if (!pendingKeyboardPasteSource) {
          return;
        }
        const fallbackSource = pendingKeyboardPasteSource;
        suppressNextClipboardPasteOnce();
        Promise.resolve(readClipboardText())
          .then((text) => {
            if (!text || pendingKeyboardPasteSource !== fallbackSource) {
              return;
            }
            dispatchTerminalPaste(text, fallbackSource);
          })
          .catch(() => {})
          .finally(() => {
            if (pendingKeyboardPasteSource === fallbackSource) {
              clearPendingKeyboardPasteSource();
            }
          });
      }, 120);
      pendingKeyboardPasteTimer = setTimeoutFn(() => {
        pendingKeyboardPasteTimer = null;
        pendingKeyboardPasteSource = "";
      }, 750);
    }

    function consumePendingKeyboardPasteSource(fallbackSource) {
      const source = pendingKeyboardPasteSource || fallbackSource;
      clearPendingKeyboardPasteSource();
      return source;
    }

    function shouldIgnoreDuplicateClipboardEvent(event) {
      if (!event || typeof event !== "object") {
        return false;
      }
      if (handledClipboardEvents.has(event)) {
        event.preventDefault?.();
        event.stopPropagation?.();
        return true;
      }
      handledClipboardEvents.add(event);
      return false;
    }

    function getPasteShortcutSource(event) {
      const key = String(event?.key || "");
      const normalizedKey = key.toLowerCase();
      const isShortcutPaste =
        event &&
        normalizedKey === "v" &&
        ((event.ctrlKey === true && event.metaKey !== true) || (event.metaKey === true && event.ctrlKey !== true)) &&
        event.altKey !== true;
      if (isShortcutPaste) {
        return "shortcut";
      }
      const isShiftInsertPaste =
        event &&
        key === "Insert" &&
        event.shiftKey === true &&
        event.ctrlKey !== true &&
        event.metaKey !== true &&
        event.altKey !== true;
      if (isShiftInsertPaste) {
        return "shift-insert";
      }
      return "";
    }

    function resolveClipboardEventTargets() {
      const targets = [];
      const seen = new Set();
      const pushTarget = (target) => {
        if (!target || typeof target.addEventListener !== "function" || seen.has(target)) {
          return;
        }
        seen.add(target);
        targets.push(target);
      };
      pushTarget(mount);
      if (typeof mount.querySelector === "function") {
        pushTarget(mount.querySelector(".xterm-helper-textarea"));
      }
      if (terminal && typeof terminal === "object" && terminal.textarea && typeof terminal.textarea.addEventListener === "function") {
        pushTarget(terminal.textarea);
      }
      return targets;
    }

    function readClipboardPayloadFromEvent(event) {
      const dataTransferText = event?.clipboardData?.getData?.("text") || event?.dataTransfer?.getData?.("text") || "";
      if (dataTransferText) {
        return dataTransferText;
      }
      return typeof event?.data === "string" ? event.data : "";
    }

    function dispatchTerminalPaste(text, source) {
      if (!text) {
        return false;
      }
      terminal.focus?.();
      terminal.textarea?.focus?.();
      onTerminalPaste(session.id, text);
      debugLog("clipboard.paste.terminal", { sessionId: session.id, length: text.length, source });
      return true;
    }

    function focusTerminalSurface() {
      terminal.focus?.();
      terminal.textarea?.focus?.();
    }

    function getTerminalViewportElement() {
      if (typeof mount.querySelector !== "function") {
        return null;
      }
      return mount.querySelector(".xterm-viewport");
    }

    function getViewportScrollbarMetrics(viewport) {
      const clientHeight = Number(viewport?.clientHeight) || 0;
      const scrollHeight = Number(viewport?.scrollHeight) || 0;
      const clientWidth = Number(viewport?.clientWidth) || 0;
      const offsetWidth = Number(viewport?.offsetWidth) || 0;
      const scrollbarWidth = Math.max(0, offsetWidth - clientWidth);
      if (clientHeight <= 0 || scrollHeight <= clientHeight || scrollbarWidth <= 0) {
        return null;
      }
      const maxScrollTop = scrollHeight - clientHeight;
      const thumbHeight = Math.max(24, Math.round((clientHeight / scrollHeight) * clientHeight));
      const maxThumbTop = Math.max(0, clientHeight - thumbHeight);
      const currentScrollTop = Math.min(Math.max(Number(viewport?.scrollTop) || 0, 0), maxScrollTop);
      const thumbTop = maxScrollTop > 0 && maxThumbTop > 0 ? (currentScrollTop / maxScrollTop) * maxThumbTop : 0;
      return {
        clientHeight,
        scrollHeight,
        scrollbarWidth,
        thumbHeight,
        maxThumbTop,
        maxScrollTop,
        thumbTop
      };
    }

    function getEventClientPoint(event) {
      const clientX = Number(event?.clientX);
      const clientY = Number(event?.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return null;
      }
      return { clientX, clientY };
    }

    function setViewportScrollFromThumbTop(viewport, metrics, thumbTop) {
      if (!viewport || !metrics) {
        return;
      }
      const clampedThumbTop = Math.min(Math.max(thumbTop, 0), metrics.maxThumbTop);
      if (metrics.maxThumbTop <= 0 || metrics.maxScrollTop <= 0) {
        viewport.scrollTop = 0;
        return;
      }
      viewport.scrollTop = (clampedThumbTop / metrics.maxThumbTop) * metrics.maxScrollTop;
    }

    function tryStartViewportScrollbarDrag(event) {
      if (!event || event.button !== 0) {
        return false;
      }
      const viewport = getTerminalViewportElement();
      const metrics = getViewportScrollbarMetrics(viewport);
      if (!viewport || !metrics || typeof viewport.getBoundingClientRect !== "function") {
        return false;
      }
      const point = getEventClientPoint(event);
      if (!point) {
        return false;
      }
      const rect = viewport.getBoundingClientRect();
      const gutterLeft = rect.right - metrics.scrollbarWidth;
      if (point.clientX < gutterLeft || point.clientX > rect.right || point.clientY < rect.top || point.clientY > rect.bottom) {
        return false;
      }

      const globalEventTarget =
        typeof windowRef.addEventListener === "function" && typeof windowRef.removeEventListener === "function"
          ? windowRef
          : typeof documentRef?.addEventListener === "function" && typeof documentRef?.removeEventListener === "function"
            ? documentRef
            : null;
      if (!globalEventTarget) {
        return false;
      }

      event.preventDefault?.();
      event.stopPropagation?.();
      focusTerminalSurface();

      const thumbTopPx = rect.top + metrics.thumbTop;
      const thumbBottomPx = thumbTopPx + metrics.thumbHeight;
      let dragOffset = point.clientY - thumbTopPx;
      if (point.clientY < thumbTopPx || point.clientY > thumbBottomPx) {
        dragOffset = metrics.thumbHeight / 2;
        setViewportScrollFromThumbTop(viewport, metrics, point.clientY - rect.top - dragOffset);
      }

      const handleMouseMove = (moveEvent) => {
        const movePoint = getEventClientPoint(moveEvent);
        if (!movePoint) {
          return;
        }
        moveEvent.preventDefault?.();
        const nextMetrics = getViewportScrollbarMetrics(viewport);
        if (!nextMetrics) {
          return;
        }
        const nextRect = viewport.getBoundingClientRect();
        setViewportScrollFromThumbTop(viewport, nextMetrics, movePoint.clientY - nextRect.top - dragOffset);
      };

      const releaseDrag = () => {
        globalEventTarget.removeEventListener("mousemove", handleMouseMove, true);
        globalEventTarget.removeEventListener("mouseup", releaseDrag, true);
        releaseViewportScrollbarDrag = null;
      };

      if (typeof releaseViewportScrollbarDrag === "function") {
        releaseViewportScrollbarDrag();
      }
      releaseViewportScrollbarDrag = releaseDrag;
      globalEventTarget.addEventListener("mousemove", handleMouseMove, true);
      globalEventTarget.addEventListener("mouseup", releaseDrag, true);
      return true;
    }

    function requestClipboardPaste({ source, event, suppressFollowupPasteEvent = false }) {
      const inlineText = readClipboardPayloadFromEvent(event);
      if (inlineText) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (suppressFollowupPasteEvent) {
          suppressNextClipboardPasteOnce();
        }
        dispatchTerminalPaste(inlineText, source);
        return;
      }
      event?.preventDefault?.();
      event?.stopPropagation?.();
      Promise.resolve(readClipboardText())
        .then((text) => {
          if (!text) {
            return;
          }
          if (suppressFollowupPasteEvent) {
            suppressNextClipboardPasteOnce();
          }
          dispatchTerminalPaste(text, source);
        })
        .catch(() => {});
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
      focusTerminalSurface();
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
          dispatchTerminalPaste(text, "middle-click");
        })
        .catch(() => {});
    };

    const handleBeforeInput = (event) => {
      if (!event || event.inputType !== "insertFromPaste") {
        return;
      }
      if (shouldIgnoreDuplicateClipboardEvent(event)) {
        return;
      }
      if (suppressNextClipboardPasteEvent) {
        suppressNextClipboardPasteEvent = false;
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      if (suppressNextPaste && isMouseForwardingEnabled()) {
        suppressNextPaste = false;
        return;
      }
      requestClipboardPaste({
        source: consumePendingKeyboardPasteSource("beforeinput"),
        event,
        suppressFollowupPasteEvent: true
      });
    };

    const handlePaste = (event) => {
      if (shouldIgnoreDuplicateClipboardEvent(event)) {
        return;
      }
      if (suppressNextClipboardPasteEvent) {
        suppressNextClipboardPasteEvent = false;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return;
      }
      if (suppressNextPaste && isMouseForwardingEnabled()) {
        suppressNextPaste = false;
        return;
      }
      requestClipboardPaste({
        source: consumePendingKeyboardPasteSource("clipboard"),
        event
      });
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

    const handleMouseDown = (event) => {
      if (!event || event.button === 1) {
        return;
      }
      if (tryStartViewportScrollbarDrag(event)) {
        return;
      }
      focusTerminalSurface();
    };

    const handleContextMenu = () => {
      focusTerminalSurface();
    };

    const clipboardEventTargets = resolveClipboardEventTargets();
    for (const target of clipboardEventTargets) {
      target.addEventListener("keydown", handleKeydown, true);
      target.addEventListener("beforeinput", handleBeforeInput, true);
      target.addEventListener("paste", handlePaste, true);
    }
    mount.addEventListener("mousedown", handleMouseDown, true);
    mount.addEventListener("mousedown", handleMiddleMouseDown);
    mount.addEventListener("auxclick", handleAuxClick);
    mount.addEventListener("contextmenu", handleContextMenu, true);
    if (typeof terminal?.attachCustomKeyEventHandler === "function") {
      terminal.attachCustomKeyEventHandler((event) => {
        const pasteShortcutSource = getPasteShortcutSource(event);
        if (!pasteShortcutSource) {
          return true;
        }
        armPendingKeyboardPasteSource(pasteShortcutSource);
        return false;
      });
    }

    return () => {
      for (const target of clipboardEventTargets) {
        if (typeof target.removeEventListener !== "function") {
          continue;
        }
        target.removeEventListener("keydown", handleKeydown, true);
        target.removeEventListener("beforeinput", handleBeforeInput, true);
        target.removeEventListener("paste", handlePaste, true);
      }
      if (typeof mount.removeEventListener === "function") {
        mount.removeEventListener("mousedown", handleMouseDown, true);
        mount.removeEventListener("mousedown", handleMiddleMouseDown);
        mount.removeEventListener("auxclick", handleAuxClick);
        mount.removeEventListener("contextmenu", handleContextMenu, true);
      }
      if (typeof releaseViewportScrollbarDrag === "function") {
        releaseViewportScrollbarDrag();
      }
      if (typeof terminal?.attachCustomKeyEventHandler === "function") {
        terminal.attachCustomKeyEventHandler(() => true);
      }
      clearPendingKeyboardPasteSource();
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

    function stabilizeMountedTerminal(entry) {
      return stabilizeMountedTerminalEntry(entry, session.id, applyResizeForSession);
    }

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
      refreshBtn: refs.refreshBtn,
      settingsDialog: refs.settingsDialog,
      settingsTabStartupBtn: refs.settingsTabStartupBtn,
      settingsTabInputBtn: refs.settingsTabInputBtn,
      settingsTabNoteBtn: refs.settingsTabNoteBtn,
      settingsTabThemeBtn: refs.settingsTabThemeBtn,
      settingsPanelStartup: refs.settingsPanelStartup,
      settingsPanelInput: refs.settingsPanelInput,
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
      applyResizeForSession,
      settingsDirty: false,
      isVisible: initialVisible,
      pendingViewportSync: !initialVisible,
      followOnShow: true,
      searchRevision: 0,
      mouseForwardingOutputPending: "",
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
    stabilizeMountedTerminal(entry);
    setTimeoutFn(() => stabilizeMountedTerminal(entry), 120);
    setTimeoutFn(() => stabilizeMountedTerminal(entry), 400);
    setTimeoutFn(() => stabilizeMountedTerminal(entry), 900);

    return entry;
  }

  return {
    mountSessionTerminalCard,
    refreshMountedTerminal(sessionId) {
      if (!terminals || !sessionId) {
        return false;
      }
      const entry = terminals.get(sessionId);
      return stabilizeMountedTerminalEntry(entry, sessionId, entry?.applyResizeForSession);
    }
  };
}
