export function createAppLifecycleController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const createBtn = options.createBtn || null;
  const deckCreateBtn = options.deckCreateBtn || null;
  const deckRenameBtn = options.deckRenameBtn || null;
  const deckDeleteBtn = options.deckDeleteBtn || null;
  const startupWarmupSkipBtn = options.startupWarmupSkipBtn || null;
  const sendBtn = options.sendBtn || null;
  const commandGuardSendOnceBtn = options.commandGuardSendOnceBtn || null;
  const commandGuardCancelBtn = options.commandGuardCancelBtn || null;
  const api = options.api || null;
  const getActiveDeck = typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => null;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "");
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const clearUiError = typeof options.clearUiError === "function" ? options.clearUiError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const createDeckFlow = typeof options.createDeckFlow === "function" ? options.createDeckFlow : () => Promise.resolve();
  const renameDeckFlow = typeof options.renameDeckFlow === "function" ? options.renameDeckFlow : () => Promise.resolve();
  const deleteDeckFlow = typeof options.deleteDeckFlow === "function" ? options.deleteDeckFlow : () => Promise.resolve();
  const submitCommand = typeof options.submitCommand === "function" ? options.submitCommand : () => Promise.resolve();
  const confirmPendingCommandSend =
    typeof options.confirmPendingCommandSend === "function" ? options.confirmPendingCommandSend : () => Promise.resolve(false);
  const cancelPendingCommandSend =
    typeof options.cancelPendingCommandSend === "function" ? options.cancelPendingCommandSend : () => {};
  const bootstrapDevAuthToken =
    typeof options.bootstrapDevAuthToken === "function" ? options.bootstrapDevAuthToken : () => Promise.resolve(false);
  const waitForStartupWarmup =
    typeof options.waitForStartupWarmup === "function" ? options.waitForStartupWarmup : () => Promise.resolve("ready");
  const skipStartupWarmupWait =
    typeof options.skipStartupWarmupWait === "function" ? options.skipStartupWarmupWait : () => {};
  const startWsRuntime = typeof options.startWsRuntime === "function" ? options.startWsRuntime : () => null;
  const setWsClient = typeof options.setWsClient === "function" ? options.setWsClient : () => {};
  const scheduleBootstrapFallback =
    typeof options.scheduleBootstrapFallback === "function" ? options.scheduleBootstrapFallback : () => {};
  const disposeAppRuntimeState =
    typeof options.disposeAppRuntimeState === "function" ? options.disposeAppRuntimeState : () => {};
  const scheduleGlobalResize = typeof options.scheduleGlobalResize === "function" ? options.scheduleGlobalResize : () => {};
  const disposeActivityCompletionNotifier =
    typeof options.disposeActivityCompletionNotifier === "function" ? options.disposeActivityCompletionNotifier : () => {};
  const disposeStartupWarmup =
    typeof options.disposeStartupWarmup === "function" ? options.disposeStartupWarmup : () => {};
  const disposeStreamDebugTrace =
    typeof options.disposeStreamDebugTrace === "function" ? options.disposeStreamDebugTrace : () => {};
  const closeWsClient = typeof options.closeWsClient === "function" ? options.closeWsClient : () => {};
  const disposeAuthBootstrapRuntime =
    typeof options.disposeAuthBootstrapRuntime === "function" ? options.disposeAuthBootstrapRuntime : () => {};
  const disposeSessionTerminalResize =
    typeof options.disposeSessionTerminalResize === "function" ? options.disposeSessionTerminalResize : () => {};
  const disposeTerminalSearch = typeof options.disposeTerminalSearch === "function" ? options.disposeTerminalSearch : () => {};
  const disposeCommandComposerRuntime =
    typeof options.disposeCommandComposerRuntime === "function" ? options.disposeCommandComposerRuntime : () => {};
  const disposeCommandComposerAutocomplete =
    typeof options.disposeCommandComposerAutocomplete === "function" ? options.disposeCommandComposerAutocomplete : () => {};
  const disconnectTerminalObservers =
    typeof options.disconnectTerminalObservers === "function" ? options.disconnectTerminalObservers : () => {};
  const disposeTerminals = typeof options.disposeTerminals === "function" ? options.disposeTerminals : () => {};

  async function handleCreateSession() {
    try {
      debugLog("sessions.create.start");
      const createdSession = await api.createSession();
      let session = createdSession;
      const activeDeck = getActiveDeck();
      if (activeDeck && resolveSessionDeckId(createdSession) !== activeDeck.id) {
        session = await api.moveSessionToDeck(activeDeck.id, createdSession.id);
      }
      applyRuntimeEvent({
        type: session.deckId === createdSession.deckId ? "session.created" : "session.updated",
        session
      });
      clearUiError();
      debugLog("sessions.create.ok", { sessionId: session.id, deckId: session.deckId || null });
    } catch {
      setError("Failed to create session.");
    }
  }

  function bindAsyncClick(element, handler, fallbackMessage) {
    if (!element || typeof element.addEventListener !== "function") {
      return;
    }
    element.addEventListener("click", async () => {
      try {
        await handler();
        clearUiError();
      } catch (error) {
        setError(getErrorMessage(error, fallbackMessage));
      }
    });
  }

  function bindUiEvents() {
    if (createBtn && typeof createBtn.addEventListener === "function") {
      createBtn.addEventListener("click", handleCreateSession);
    }
    bindAsyncClick(deckCreateBtn, createDeckFlow, "Failed to create deck.");
    bindAsyncClick(deckRenameBtn, renameDeckFlow, "Failed to rename deck.");
    bindAsyncClick(deckDeleteBtn, deleteDeckFlow, "Failed to delete deck.");
    if (startupWarmupSkipBtn && typeof startupWarmupSkipBtn.addEventListener === "function") {
      startupWarmupSkipBtn.addEventListener("click", () => {
        skipStartupWarmupWait();
      });
    }
    if (sendBtn && typeof sendBtn.addEventListener === "function") {
      sendBtn.addEventListener("click", () => {
        submitCommand().catch(() => {
          setError("Failed to send command.");
        });
      });
    }
    if (commandGuardSendOnceBtn && typeof commandGuardSendOnceBtn.addEventListener === "function") {
      commandGuardSendOnceBtn.addEventListener("click", () => {
        confirmPendingCommandSend().catch(() => {
          setError("Failed to send guarded command.");
        });
      });
    }
    if (commandGuardCancelBtn && typeof commandGuardCancelBtn.addEventListener === "function") {
      commandGuardCancelBtn.addEventListener("click", () => {
        cancelPendingCommandSend();
      });
    }
  }

  function handleBeforeUnload() {
    disposeAppRuntimeState();
    disposeActivityCompletionNotifier();
    disposeStartupWarmup();
    disposeStreamDebugTrace();
    closeWsClient();
    disposeAuthBootstrapRuntime();
    disposeSessionTerminalResize();
    disposeTerminalSearch();
    disposeCommandComposerRuntime();
    disposeCommandComposerAutocomplete();
    disconnectTerminalObservers();
    disposeTerminals();
  }

  function bindWindowEvents() {
    if (windowRef && typeof windowRef.addEventListener === "function") {
      windowRef.addEventListener("beforeunload", handleBeforeUnload);
      windowRef.addEventListener("resize", scheduleGlobalResize);
    }
  }

  async function initializeRuntime() {
    await waitForStartupWarmup();
    await bootstrapDevAuthToken();
    setWsClient(startWsRuntime() || null);
    scheduleBootstrapFallback();
  }

  return {
    initializeRuntime,
    bindUiEvents,
    bindWindowEvents,
    handleBeforeUnload,
    handleCreateSession
  };
}
