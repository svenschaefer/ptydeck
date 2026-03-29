import { createAppLifecycleController as defaultCreateAppLifecycleController } from "./app-lifecycle-controller.js";
import { createAuthBootstrapRuntimeController as defaultCreateAuthBootstrapRuntimeController } from "./auth-bootstrap-runtime-controller.js";
import { createCommandComposerAutocompleteController as defaultCreateCommandComposerAutocompleteController } from "./command-composer-autocomplete-controller.js";
import { createCommandComposerRuntimeController as defaultCreateCommandComposerRuntimeController } from "./command-composer-runtime-controller.js";
import { createCommandEngine as defaultCreateCommandEngine } from "./command-engine.js";
import { createCommandExecutor as defaultCreateCommandExecutor } from "./command-executor.js";
import { interpretComposerInput as defaultInterpretComposerInput } from "./command-interpreter.js";
import { createCommandTargetRuntimeController as defaultCreateCommandTargetRuntimeController } from "./command-target-runtime-controller.js";
import { createStartupWarmupController as defaultCreateStartupWarmupController } from "./startup-warmup-controller.js";
import { createWsClient as defaultCreateWsClient } from "./ws-client.js";
import { createWsRuntimeController as defaultCreateWsRuntimeController } from "./ws-runtime-controller.js";
import {
  normalizeCustomCommandPayloadForShell as defaultNormalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator as defaultSendInputWithConfiguredTerminator
} from "./terminal-stream.js";

export function createAppBootstrapCompositionController(options = {}) {
  const createCommandEngine =
    typeof options.createCommandEngine === "function" ? options.createCommandEngine : defaultCreateCommandEngine;
  const createCommandTargetRuntimeController =
    typeof options.createCommandTargetRuntimeController === "function"
      ? options.createCommandTargetRuntimeController
      : defaultCreateCommandTargetRuntimeController;
  const createStartupWarmupController =
    typeof options.createStartupWarmupController === "function"
      ? options.createStartupWarmupController
      : defaultCreateStartupWarmupController;
  const createCommandExecutor =
    typeof options.createCommandExecutor === "function" ? options.createCommandExecutor : defaultCreateCommandExecutor;
  const createAuthBootstrapRuntimeController =
    typeof options.createAuthBootstrapRuntimeController === "function"
      ? options.createAuthBootstrapRuntimeController
      : defaultCreateAuthBootstrapRuntimeController;
  const createWsRuntimeController =
    typeof options.createWsRuntimeController === "function"
      ? options.createWsRuntimeController
      : defaultCreateWsRuntimeController;
  const createCommandComposerAutocompleteController =
    typeof options.createCommandComposerAutocompleteController === "function"
      ? options.createCommandComposerAutocompleteController
      : defaultCreateCommandComposerAutocompleteController;
  const createCommandComposerRuntimeController =
    typeof options.createCommandComposerRuntimeController === "function"
      ? options.createCommandComposerRuntimeController
      : defaultCreateCommandComposerRuntimeController;
  const createAppLifecycleController =
    typeof options.createAppLifecycleController === "function"
      ? options.createAppLifecycleController
      : defaultCreateAppLifecycleController;
  const createWsClient = typeof options.createWsClient === "function" ? options.createWsClient : defaultCreateWsClient;
  const interpretComposerInput =
    typeof options.interpretComposerInput === "function" ? options.interpretComposerInput : defaultInterpretComposerInput;
  const sendInputWithConfiguredTerminator =
    typeof options.sendInputWithConfiguredTerminator === "function"
      ? options.sendInputWithConfiguredTerminator
      : defaultSendInputWithConfiguredTerminator;
  const normalizeCustomCommandPayloadForShell =
    typeof options.normalizeCustomCommandPayloadForShell === "function"
      ? options.normalizeCustomCommandPayloadForShell
      : defaultNormalizeCustomCommandPayloadForShell;

  const store = options.store || null;
  const api = options.api || null;
  const config = options.config || { wsUrl: "" };
  const debugLogs = options.debugLogs === true;
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const uiState = options.uiState || {};
  const commandInput = options.commandInput || { value: "" };
  const terminals = options.terminals || new Map();
  const terminalObservers = options.terminalObservers || new Map();
  const terminalSettings = typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => null;
  const defaultDeckId = String(options.defaultDeckId || "default");
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const terminalThemePresets = Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [];
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const wsStateRef = options.wsStateRef || { current: null };
  const readClipboardText =
    typeof options.readClipboardText === "function" ? options.readClipboardText : async () => "";
  const writeClipboardText =
    typeof options.writeClipboardText === "function" ? options.writeClipboardText : async () => false;
  const isReadOnlyMode = typeof options.isReadOnlyMode === "function" ? options.isReadOnlyMode : () => false;
  const getReadOnlyModeMessage =
    typeof options.getReadOnlyModeMessage === "function"
      ? options.getReadOnlyModeMessage
      : () => "Read-only spectator mode. Write actions are disabled.";
  const setAccessState = typeof options.setAccessState === "function" ? options.setAccessState : () => {};
  const disposeStreamDebugTrace =
    typeof options.disposeStreamDebugTrace === "function" ? options.disposeStreamDebugTrace : () => {};
  const createBtn = options.createBtn || null;
  const deckCreateBtn = options.deckCreateBtn || null;
  const startupWarmupSkipBtn = options.startupWarmupSkipBtn || null;
  const sendBtn = options.sendBtn || null;
  const workflowStopBtn = options.workflowStopBtn || null;
  const workflowInterruptBtn = options.workflowInterruptBtn || null;
  const workflowKillBtn = options.workflowKillBtn || null;
  const layoutRuntimeController = options.layoutRuntimeController || null;
  const layoutProfileRuntimeController = options.layoutProfileRuntimeController || null;
  const connectionProfileRuntimeController = options.connectionProfileRuntimeController || null;
  const workspacePresetRuntimeController = options.workspacePresetRuntimeController || null;
  const broadcastInputRuntimeController = options.broadcastInputRuntimeController || null;
  const terminalSearchController = options.terminalSearchController || null;
  const sessionTerminalResizeController = options.sessionTerminalResizeController || null;
  const appCommandUiFacadeController = options.appCommandUiFacadeController || null;
  const appLayoutDeckFacadeController = options.appLayoutDeckFacadeController || null;
  const appRuntimeStateController = options.appRuntimeStateController || null;
  const appSessionRuntimeFacadeController = options.appSessionRuntimeFacadeController || null;
  const sessionUiFacadeController = options.sessionUiFacadeController || null;
  const streamAdapter = options.streamAdapter || null;
  const sessionViewModel = options.sessionViewModel || null;
  const runtimeEventController = options.runtimeEventController || null;
  const deckRuntimeController = options.deckRuntimeController || null;
  const getCustomCommands =
    typeof options.getCustomCommands === "function" ? options.getCustomCommands : () => [];
  const getDiscoveryUsageScore =
    typeof options.getDiscoveryUsageScore === "function" ? options.getDiscoveryUsageScore : () => 0;
  const recordDiscoveryUsage =
    typeof options.recordDiscoveryUsage === "function" ? options.recordDiscoveryUsage : () => {};
  const observeSessionData =
    typeof options.observeSessionData === "function" ? options.observeSessionData : () => {};
  const exportSessionReplayDownload =
    typeof options.exportSessionReplayDownload === "function" ? options.exportSessionReplayDownload : async () => null;
  const exportSessionReplayCopy =
    typeof options.exportSessionReplayCopy === "function" ? options.exportSessionReplayCopy : async () => null;
  const openSessionReplayViewer =
    typeof options.openSessionReplayViewer === "function" ? options.openSessionReplayViewer : async () => null;
  const uploadSessionFile =
    typeof options.uploadSessionFile === "function" ? options.uploadSessionFile : async () => null;
  const downloadSessionFile =
    typeof options.downloadSessionFile === "function" ? options.downloadSessionFile : async () => null;
  const listShares = typeof options.listShares === "function" ? options.listShares : async () => [];
  const createShareLink = typeof options.createShareLink === "function" ? options.createShareLink : async () => null;
  const revokeShareLink = typeof options.revokeShareLink === "function" ? options.revokeShareLink : async () => null;
  const runWorkflowDetailed =
    typeof options.runWorkflowDetailed === "function" ? options.runWorkflowDetailed : null;
  const stopWorkflow = typeof options.stopWorkflow === "function" ? options.stopWorkflow : () => false;
  const interruptWorkflowSession =
    typeof options.interruptWorkflowSession === "function" ? options.interruptWorkflowSession : () => Promise.resolve("");
  const killWorkflowSession =
    typeof options.killWorkflowSession === "function" ? options.killWorkflowSession : () => Promise.resolve("");
  const disposeWorkflowRuntime =
    typeof options.disposeWorkflowRuntime === "function" ? options.disposeWorkflowRuntime : () => {};

  let commandEngine = null;
  let commandTargetRuntimeController = null;
  let commandExecutor = null;
  let authBootstrapRuntimeController = null;
  let startupWarmupController = null;
  let wsRuntimeController = null;
  let commandComposerAutocompleteController = null;
  let commandComposerRuntimeController = null;
  let appLifecycleController = null;

  function composeControllers() {
    commandEngine = createCommandEngine({
      systemSlashCommands,
      listCustomCommands: () => appCommandUiFacadeController?.listCustomCommands?.() || getCustomCommands(),
      getSessions: () => store?.getState?.().sessions || [],
      getDecks: () => store?.getState?.().decks || [],
      getThemes: () => terminalThemePresets,
      getActiveDeckId: () => store?.getState?.().activeDeckId || "",
      getActiveSessionId: () => store?.getState?.().activeSessionId || "",
      getSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
      getSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
      getSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
      getDiscoveryUsageScore
    });

    commandTargetRuntimeController = createCommandTargetRuntimeController({
      commandEngine,
      store,
      setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId),
      resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
      formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
      formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
      getBroadcastTargetSummary: () => broadcastInputRuntimeController?.formatTargetSummary?.() || ""
    });

    commandExecutor = createCommandExecutor({
      store,
      api,
      defaultDeckId,
      delayedSubmitMs,
      systemSlashCommands,
      resolveTargetSelectors: commandTargetRuntimeController.resolveTargetSelectors,
      resolveFilterSelectors: commandTargetRuntimeController.resolveFilterSelectors,
      resolveDeckToken: commandTargetRuntimeController.resolveDeckToken,
      parseSizeCommandArgs: commandTargetRuntimeController.parseSizeCommandArgs,
      applyTerminalSizeSettings: (nextCols, nextRows) => appLayoutDeckFacadeController?.applyTerminalSizeSettings?.(nextCols, nextRows),
      setSessionFilterText: (value) => appLayoutDeckFacadeController?.setSessionFilterText?.(value),
      getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
      getSessionCountForDeck: (deckId, sessions) => appLayoutDeckFacadeController?.getSessionCountForDeck?.(deckId, sessions) || 0,
      applyRuntimeEvent: (event, runtimeOptions) => appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
      setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId),
      resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
      formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
      formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
      sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
      swapSessionTokens: (sessionIdA, sessionIdB) => appSessionRuntimeFacadeController?.swapSessionTokens?.(sessionIdA, sessionIdB) === true,
      getSessionRuntimeState: sessionUiFacadeController?.getSessionRuntimeState,
      isSessionExited: sessionUiFacadeController?.isSessionExited,
      isSessionActionBlocked: sessionUiFacadeController?.isSessionActionBlocked,
      getBlockedSessionActionMessage: sessionUiFacadeController?.getBlockedSessionActionMessage,
      listCustomCommandState: () => appCommandUiFacadeController?.listCustomCommands?.() || [],
      getCustomCommandState: (name) => appCommandUiFacadeController?.getCustomCommand?.(name),
      removeCustomCommandState: (name) => appCommandUiFacadeController?.removeCustomCommand?.(name),
      parseCustomDefinition: commandTargetRuntimeController.parseCustomDefinition,
      upsertCustomCommandState: (command) => appCommandUiFacadeController?.upsertCustomCommand?.(command),
      resolveSettingsTargets: commandTargetRuntimeController.resolveSettingsTargets,
      parseSettingsPayload: commandTargetRuntimeController.parseSettingsPayload,
      normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode?.(value) || "auto",
      setSessionSendTerminator: (sessionId, mode) => appLayoutDeckFacadeController?.setSessionSendTerminator?.(sessionId, mode),
      getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator?.(sessionId) || "auto",
      sendInputWithConfiguredTerminator,
      recordCommandSubmission: (sessionId, submission) => store?.recordSessionCommandSubmission?.(sessionId, submission),
      normalizeCustomCommandPayloadForShell,
      normalizeSessionTags: sessionUiFacadeController?.normalizeSessionTags,
      normalizeThemeProfile: sessionUiFacadeController?.normalizeThemeProfile,
      getTerminalSettings: terminalSettings,
      requestRender: () => appCommandUiFacadeController?.render(),
      listLayoutProfiles: () => layoutProfileRuntimeController?.listProfiles?.() || [],
      listConnectionProfiles: () => connectionProfileRuntimeController?.listProfiles?.() || [],
      resolveLayoutProfile: (selectorText) =>
        layoutProfileRuntimeController?.resolveProfile?.(selectorText) || { profile: null, error: "Unknown layout profile." },
      resolveConnectionProfile: (selectorText) =>
        connectionProfileRuntimeController?.resolveProfile?.(selectorText) || { profile: null, error: "Unknown connection profile." },
      createLayoutProfileFromCurrent: (name) => layoutProfileRuntimeController?.createProfileFromCurrentLayout?.(name) || "",
      createConnectionProfileFromSession: (sessionOrId, name, createOptions) =>
        connectionProfileRuntimeController?.createProfileFromSession?.(sessionOrId, name, createOptions) || "",
      applyLayoutProfile: (profileId) => layoutProfileRuntimeController?.applyProfileById?.(profileId) || "",
      applyConnectionProfile: (profileId) => connectionProfileRuntimeController?.applyProfileById?.(profileId) || "",
      renameLayoutProfile: (profileId, name) => layoutProfileRuntimeController?.renameProfileById?.(profileId, name) || "",
      renameConnectionProfile: (profileId, name) => connectionProfileRuntimeController?.renameProfileById?.(profileId, name) || "",
      deleteLayoutProfile: (profileId) => layoutProfileRuntimeController?.deleteProfileById?.(profileId) || "",
      deleteConnectionProfile: (profileId) => connectionProfileRuntimeController?.deleteProfileById?.(profileId) || "",
      listWorkspacePresets: () => workspacePresetRuntimeController?.listPresets?.() || [],
      resolveWorkspacePreset: (selectorText) =>
        workspacePresetRuntimeController?.resolvePreset?.(selectorText) || { preset: null, error: "Unknown workspace preset." },
      createWorkspacePresetFromCurrent: (name) => workspacePresetRuntimeController?.createPresetFromCurrentWorkspace?.(name) || "",
      applyWorkspacePreset: (presetId) => workspacePresetRuntimeController?.applyPresetById?.(presetId) || "",
      renameWorkspacePreset: (presetId, name) => workspacePresetRuntimeController?.renamePresetById?.(presetId, name) || "",
      deleteWorkspacePreset: (presetId) => workspacePresetRuntimeController?.deletePresetById?.(presetId) || "",
      getBroadcastStatus: () => broadcastInputRuntimeController?.getStatus?.() || "Broadcast: off.",
      enableGroupBroadcast: (selectorText) => broadcastInputRuntimeController?.enableGroupBroadcast?.(selectorText) || "",
      disableBroadcast: () => broadcastInputRuntimeController?.disableBroadcast?.() || "Broadcast mode disabled.",
      openSessionReplayViewer,
      exportSessionReplayDownload,
      exportSessionReplayCopy,
      listShares,
      createShareLink,
      revokeShareLink,
      writeClipboardText,
      uploadSessionFile,
      downloadSessionFile
    });

    authBootstrapRuntimeController = createAuthBootstrapRuntimeController({
      windowRef,
      api,
      defaultDeckId,
      getTerminalSettings: terminalSettings,
      getPreferredActiveDeckId: () => store?.getState?.().activeDeckId || "",
      getRuntimeBootstrapSource: () => appRuntimeStateController?.getRuntimeBootstrapSource?.() || "pending",
      setDecks: (nextDecks, runtimeOptions) => appLayoutDeckFacadeController?.setDecks?.(nextDecks, runtimeOptions),
      setSessions: (sessions) => store?.setSessions?.(sessions || []),
      setUiError: (message) => appRuntimeStateController?.setUiError?.(message),
      markRuntimeBootstrapReady: (source) => appCommandUiFacadeController?.markRuntimeBootstrapReady?.(source),
      setAccessState,
      debugLog,
      devAuthRefreshMinDelayMs: options.devAuthRefreshMinDelayMs,
      devAuthRefreshSafetyMs: options.devAuthRefreshSafetyMs,
      devAuthRetryDelayMs: options.devAuthRetryDelayMs
    });

    startupWarmupController = createStartupWarmupController({
      windowRef,
      api,
      setConnectionState: (value) => store?.setConnectionState?.(value),
      setStartupGateState: (nextState) => appRuntimeStateController?.setStartupGateState?.(nextState),
      clearStartupGateState: () => appRuntimeStateController?.clearStartupGateState?.(),
      debugLog
    });

    wsRuntimeController = createWsRuntimeController({
      createWsClient,
      wsUrl: config.wsUrl,
      debug: debugLogs,
      log: debugLog,
      setConnectionState: (status) => store?.setConnectionState?.(status),
      getRuntimeBootstrapSource: () => appRuntimeStateController?.getRuntimeBootstrapSource?.() || "pending",
      onRuntimeConnected: () => appRuntimeStateController?.markRuntimeConnected?.(),
      hasTerminal: (sessionId) => terminals.has(sessionId),
      pushSessionData: (sessionId, data) => streamAdapter?.push?.(sessionId, data),
      observeSessionData,
      applyRuntimeEvent: (event, runtimeOptions) => appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
      getWsAuthToken: () => authBootstrapRuntimeController?.getWsAuthToken?.() || "",
      createWsTicket: () => api?.createWsTicket?.(),
      bootstrapDevAuthToken: (runtimeOptions) => appRuntimeStateController?.bootstrapDevAuthToken?.(runtimeOptions)
    });

    commandComposerAutocompleteController = createCommandComposerAutocompleteController({
      windowRef,
      documentRef,
      commandInput,
      uiState,
      navigatorRef: windowRef?.navigator || globalThis.navigator || null,
      readClipboardText,
      writeClipboardText,
      render: () => appCommandUiFacadeController?.render?.(),
      scheduleCommandPreview: () => appCommandUiFacadeController?.scheduleCommandPreview?.(),
      parseAutocompleteContext: (rawInput, customCommands) => commandEngine?.parseAutocompleteContext?.(rawInput, customCommands) || null,
      listCustomCommands: () => appCommandUiFacadeController?.listCustomCommands?.() || [],
      setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
      submitCommand: () => appCommandUiFacadeController?.submitCommand?.(),
      recordDiscoveryUsage,
      onInputChange: () => commandComposerRuntimeController?.clearPendingSend?.({ renderAfterClear: true })
    });

    commandComposerRuntimeController = createCommandComposerRuntimeController({
      windowRef,
      getCommandValue: () => commandInput.value || "",
      setCommandValue: (value) => {
        commandInput.value = value;
      },
      resetCommandAutocompleteState: () => commandComposerAutocompleteController?.resetAutocompleteState?.(),
      interpretComposerInput,
      getState: () => store?.getState?.() || {},
      resolveQuickSwitchTarget: commandTargetRuntimeController.resolveQuickSwitchTarget,
      activateSessionTarget: commandTargetRuntimeController.activateSessionTarget,
      activateDeckTarget: commandTargetRuntimeController.activateDeckTarget,
      setActiveSession: (sessionId) => store?.setActiveSession?.(sessionId),
      setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
      setCommandPreview: (message) => appCommandUiFacadeController?.setCommandPreview?.(message),
      setCommandGuardState: (nextState) => appCommandUiFacadeController?.setCommandGuardState?.(nextState),
      clearCommandGuardState: (runtimeOptions) => appCommandUiFacadeController?.clearCommandGuardState?.(runtimeOptions),
      clearCommandSuggestions: () => appCommandUiFacadeController?.clearCommandSuggestions?.(),
      render: () => appCommandUiFacadeController?.render?.(),
      debugLog,
      executeControlCommand: (interpreted) => appCommandUiFacadeController?.executeControlCommand?.(interpreted),
      executeControlCommandDetailed: (interpreted) =>
        appCommandUiFacadeController?.executeControlCommandDetailed?.(interpreted) || { ok: true, feedback: "" },
      runWorkflowDetailed: (interpreted) => runWorkflowDetailed?.(interpreted),
      recordSlashHistory: (rawCommand) => commandComposerAutocompleteController?.recordSlashHistory?.(rawCommand),
      getErrorMessage: (err, fallback) => appCommandUiFacadeController?.getErrorMessage?.(err, fallback) || fallback,
      resetSlashHistoryNavigationState: () => commandComposerAutocompleteController?.resetSlashHistoryNavigationState?.(),
      parseDirectTargetRoutingInput: commandTargetRuntimeController.parseDirectTargetRoutingInput,
      resolveTargetSelectors: commandTargetRuntimeController.resolveTargetSelectors,
      resolveBroadcastTargets: () => broadcastInputRuntimeController?.getBroadcastTargets?.() || { active: false, sessions: [], error: "", routeFeedback: "" },
      getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
      formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
      formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
      evaluateSendSafety: options.evaluateSendSafety,
      getLastActiveSessionSwitchAt: () => commandTargetRuntimeController?.getLastActiveSessionSwitchAt?.() || 0,
      getBlockedSessionActionMessage: sessionUiFacadeController?.getBlockedSessionActionMessage,
      isSessionActionBlocked: sessionUiFacadeController?.isSessionActionBlocked,
      isReadOnlyMode,
      getReadOnlyModeMessage,
      getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator?.(sessionId) || "auto",
      apiSendInput: api?.sendInput?.bind(api),
      sendInputWithConfiguredTerminator,
      recordCommandSubmission: (sessionId, submission) => store?.recordSessionCommandSubmission?.(sessionId, submission),
      normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode?.(value) || "auto",
      delayedSubmitMs,
      setError: (message) => appCommandUiFacadeController?.setError?.(message),
      clearError: () => appRuntimeStateController?.clearError?.(),
      getCustomCommandState: (name) => appCommandUiFacadeController?.getCustomCommand?.(name),
      formatQuickSwitchPreview: commandTargetRuntimeController.formatQuickSwitchPreview
    });

    appLifecycleController = createAppLifecycleController({
      windowRef,
      createBtn,
      deckCreateBtn,
      startupWarmupSkipBtn,
      sendBtn,
      workflowStopBtn,
      workflowInterruptBtn,
      workflowKillBtn,
      commandGuardSendOnceBtn: options.commandGuardSendOnceBtn,
      commandGuardCancelBtn: options.commandGuardCancelBtn,
      api,
      getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
      resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session),
      applyRuntimeEvent: (event, runtimeOptions) => appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
      setError: (message) => appCommandUiFacadeController?.setError?.(message),
      clearUiError: () => appRuntimeStateController?.clearError?.(),
      getErrorMessage: (err, fallback) => appCommandUiFacadeController?.getErrorMessage?.(err, fallback) || fallback,
      debugLog,
      isReadOnlyMode,
      getReadOnlyModeMessage,
      createDeckFlow: () => appLayoutDeckFacadeController?.createDeckFlow?.(),
      submitCommand: () => appCommandUiFacadeController?.submitCommand?.(),
      confirmPendingCommandSend: () => commandComposerRuntimeController?.confirmPendingSend?.(),
      cancelPendingCommandSend: () => commandComposerRuntimeController?.cancelPendingSend?.(),
      stopWorkflow: () => stopWorkflow(),
      interruptWorkflowSession: () => interruptWorkflowSession(),
      killWorkflowSession: () => killWorkflowSession(),
      setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
      waitForStartupWarmup: () => startupWarmupController?.waitForServerWarmup?.(),
      skipStartupWarmupWait: () => startupWarmupController?.skipWait?.(),
      bootstrapDevAuthToken: (runtimeOptions) => appRuntimeStateController?.bootstrapDevAuthToken?.(runtimeOptions),
      startWsRuntime: () => wsRuntimeController?.start?.() || null,
      setWsClient: (client) => {
        wsStateRef.current = client || null;
      },
      scheduleBootstrapFallback: () => appCommandUiFacadeController?.scheduleBootstrapFallback?.(),
      scheduleGlobalResize: (runtimeOptions) => appLayoutDeckFacadeController?.scheduleGlobalResize?.(runtimeOptions),
      disposeAppRuntimeState: () => appRuntimeStateController?.dispose?.(),
      disposeStartupWarmup: () => startupWarmupController?.dispose?.(),
      disposeStreamDebugTrace,
      closeWsClient: () => wsStateRef.current?.close?.(),
      disposeAuthBootstrapRuntime: () => authBootstrapRuntimeController?.dispose?.(),
      disposeSessionTerminalResize: () => sessionTerminalResizeController?.dispose?.(),
      disposeTerminalSearch: () => terminalSearchController?.dispose?.(),
      disposeCommandComposerRuntime: () => commandComposerRuntimeController?.dispose?.(),
      disposeCommandComposerAutocomplete: () => commandComposerAutocompleteController?.dispose?.(),
      disposeWorkflowRuntime,
      disconnectTerminalObservers: () => {
        for (const observer of terminalObservers.values()) {
          observer.disconnect?.();
        }
      },
      disposeTerminals: () => {
        for (const entry of terminals.values()) {
          entry?.terminal?.dispose?.();
        }
      }
    });

    return {
      commandEngine,
      commandTargetRuntimeController,
      commandExecutor,
      authBootstrapRuntimeController,
      wsRuntimeController,
      commandComposerAutocompleteController,
      commandComposerRuntimeController,
      appLifecycleController
    };
  }

  async function bootstrapUiAndRuntime() {
    if (!commandComposerAutocompleteController || !appLifecycleController) {
      throw new Error("composeControllers() must be called before bootstrapUiAndRuntime().");
    }
    store?.hydrateRuntimePreferences?.({
      activeDeckId: deckRuntimeController?.loadStoredActiveDeckId?.(),
      sessionFilterText: appLayoutDeckFacadeController?.loadStoredSessionFilterText?.()
    });
    store?.subscribe?.(() => appCommandUiFacadeController?.render?.());
    appLayoutDeckFacadeController?.syncSettingsUi?.();
    appLayoutDeckFacadeController?.syncTerminalGeometryCss?.();
    appCommandUiFacadeController?.render?.();
    layoutRuntimeController?.bindUiEvents?.();
    layoutProfileRuntimeController?.bindUiEvents?.();
    connectionProfileRuntimeController?.bindUiEvents?.();
    workspacePresetRuntimeController?.bindUiEvents?.();
    terminalSearchController?.bindUiEvents?.();
    terminalSearchController?.updateUi?.();
    commandComposerAutocompleteController.bindUiEvents?.();
    appLifecycleController.bindUiEvents?.();
    appLifecycleController.bindWindowEvents?.();
    const initializationResult = await appLifecycleController.initializeRuntime?.();
    await layoutProfileRuntimeController?.loadProfiles?.();
    await connectionProfileRuntimeController?.loadProfiles?.();
    await workspacePresetRuntimeController?.loadPresets?.();
    return initializationResult;
  }

  return {
    composeControllers,
    bootstrapUiAndRuntime
  };
}
