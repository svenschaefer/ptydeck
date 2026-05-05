import { createSlashCommandRegistry, getSlashCommandUsage } from "./command-schema.js";
import {
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch
} from "./connection-profile-draft-state.js";
import { formatWorkspacePresetDetail } from "./workspace-preset-runtime-controller.js";
import { createCommandExecutorCustomHandlers } from "./command-executor-custom-handlers.js";
import { createCommandExecutorCustomAdminHandlers } from "./command-executor-custom-admin-handlers.js";
import { createCommandExecutorDomainHandlers } from "./command-executor-domain-handlers.js";
import { createCommandExecutorOperatorHandlers } from "./command-executor-operator-handlers.js";
import { createCommandExecutorReportingHandlers } from "./command-executor-reporting-handlers.js";
import {
  createCommandExecutorRuntimeRouter,
  formatConnectionDraftReport,
  formatShareLinkSummary,
  normalizeKeyword,
  parseJsonObjectToken,
  resolveSlashCommandWithRegistry
} from "./command-executor-runtime-router.js";
import { createCommandExecutorSettingsHandlers } from "./command-executor-settings-handlers.js";
import {
  createCommandExecutorSessionHandlers,
  resolveActiveOrDirectTargetSession as resolveActiveOrDirectTargetSessionWithSelectors,
  resolveDirectTargetSession as resolveDirectTargetSessionWithSelectors,
  resolveSingleSessionForCommand as resolveSingleSessionForCommandWithSelectors
} from "./command-executor-session-handlers.js";

export function createCommandExecutor(options = {}) {
  const store = options.store;
  const api = options.api;
  const defaultDeckId = options.defaultDeckId || "default";
  const delayedSubmitMs = Number.isInteger(options.delayedSubmitMs) ? options.delayedSubmitMs : 80;
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];

  const resolveTargetSelectors = options.resolveTargetSelectors;
  const resolveDeckToken = options.resolveDeckToken;
  const parseSizeCommandArgs = options.parseSizeCommandArgs;
  const applyTerminalSizeSettings = options.applyTerminalSizeSettings;
  const setSessionFilterText = options.setSessionFilterText;
  const getActiveDeck = options.getActiveDeck;
  const getSessionCountForDeck = options.getSessionCountForDeck;
  const applyRuntimeEvent = options.applyRuntimeEvent;
  const setActiveDeck = options.setActiveDeck;
  const resolveSessionDeckId = options.resolveSessionDeckId;
  const formatSessionToken = options.formatSessionToken;
  const formatSessionDisplayName = options.formatSessionDisplayName;
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const swapSessionTokens =
    typeof options.swapSessionTokens === "function" ? options.swapSessionTokens : () => false;
  const getSessionRuntimeState = options.getSessionRuntimeState;
  const isSessionExited = options.isSessionExited;
  const isSessionActionBlocked = options.isSessionActionBlocked;
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage;
  const listCustomCommandState = options.listCustomCommandState;
  const getCustomCommandState = options.getCustomCommandState;
  const removeCustomCommandState = options.removeCustomCommandState;
  const parseCustomDefinition = options.parseCustomDefinition;
  const upsertCustomCommandState = options.upsertCustomCommandState;
  const parseSettingsPayload = options.parseSettingsPayload;
  const normalizeSendTerminatorMode = options.normalizeSendTerminatorMode;
  const setSessionSendTerminator = options.setSessionSendTerminator;
  const getSessionSendTerminator = options.getSessionSendTerminator;
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys : [];
  const defaultTerminalTheme = options.defaultTerminalTheme && typeof options.defaultTerminalTheme === "object" ? options.defaultTerminalTheme : {};
  const terminalThemePresets = Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [];
  const sendInputWithConfiguredTerminator = options.sendInputWithConfiguredTerminator;
  const recordCommandSubmission =
    typeof options.recordCommandSubmission === "function" ? options.recordCommandSubmission : () => null;
  const buildCustomCommandUsageApiOptions =
    typeof options.buildCustomCommandUsageApiOptions === "function"
      ? options.buildCustomCommandUsageApiOptions
      : () => undefined;
  const normalizeCustomCommandPayloadForShell = options.normalizeCustomCommandPayloadForShell;
  const normalizeSessionTags = options.normalizeSessionTags;
  const normalizeThemeProfile = options.normalizeThemeProfile;
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => ({ cols: 80, rows: 20 });
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const exportSessionReplayDownload =
    typeof options.exportSessionReplayDownload === "function" ? options.exportSessionReplayDownload : async () => null;
  const exportSessionReplayCopy =
    typeof options.exportSessionReplayCopy === "function" ? options.exportSessionReplayCopy : async () => null;
  const loadSessionReplayExcerpt =
    typeof options.loadSessionReplayExcerpt === "function" ? options.loadSessionReplayExcerpt : async () => null;
  const copySessionReplayExcerpt =
    typeof options.copySessionReplayExcerpt === "function" ? options.copySessionReplayExcerpt : async () => null;
  const previewSessionReplayExcerpt =
    typeof options.previewSessionReplayExcerpt === "function" ? options.previewSessionReplayExcerpt : () => "";
  const uploadSessionFile =
    typeof options.uploadSessionFile === "function" ? options.uploadSessionFile : async () => null;
  const downloadSessionFile =
    typeof options.downloadSessionFile === "function" ? options.downloadSessionFile : async () => null;
  const openSessionReplayViewer =
    typeof options.openSessionReplayViewer === "function" ? options.openSessionReplayViewer : async () => null;
  const submitTerminalPaste =
    typeof options.submitTerminalPaste === "function"
      ? options.submitTerminalPaste
      : async () => ({ ok: false, status: "unavailable", feedback: "Replay paste path is unavailable." });
  const listLayoutProfiles = typeof options.listLayoutProfiles === "function" ? options.listLayoutProfiles : () => [];
  const listConnectionProfiles = typeof options.listConnectionProfiles === "function" ? options.listConnectionProfiles : () => [];
  const resolveLayoutProfile = typeof options.resolveLayoutProfile === "function" ? options.resolveLayoutProfile : () => ({ profile: null, error: "Unknown layout profile." });
  const resolveConnectionProfile =
    typeof options.resolveConnectionProfile === "function"
      ? options.resolveConnectionProfile
      : () => ({ profile: null, error: "Unknown connection profile." });
  const createLayoutProfileFromCurrent =
    typeof options.createLayoutProfileFromCurrent === "function" ? options.createLayoutProfileFromCurrent : async () => "";
  const createConnectionProfileFromSession =
    typeof options.createConnectionProfileFromSession === "function" ? options.createConnectionProfileFromSession : async () => "";
  const getConnectionProfileDraft =
    typeof options.getConnectionProfileDraft === "function" ? options.getConnectionProfileDraft : () => null;
  const setConnectionProfileDraft =
    typeof options.setConnectionProfileDraft === "function" ? options.setConnectionProfileDraft : () => null;
  const loadConnectionProfileDraftFromActive =
    typeof options.loadConnectionProfileDraftFromActive === "function" ? options.loadConnectionProfileDraftFromActive : () => null;
  const saveConnectionProfileDraft =
    typeof options.saveConnectionProfileDraft === "function" ? options.saveConnectionProfileDraft : async () => "";
  const resetConnectionProfileDraft =
    typeof options.resetConnectionProfileDraft === "function" ? options.resetConnectionProfileDraft : async () => "";
  const applyLayoutProfile = typeof options.applyLayoutProfile === "function" ? options.applyLayoutProfile : async () => "";
  const applyConnectionProfile = typeof options.applyConnectionProfile === "function" ? options.applyConnectionProfile : async () => "";
  const launchConnectionLaunch = typeof options.launchConnectionLaunch === "function" ? options.launchConnectionLaunch : async () => "";
  const listSshTrustEntriesForTarget =
    typeof options.listSshTrustEntriesForTarget === "function" ? options.listSshTrustEntriesForTarget : async () => [];
  const probeSshHostKeysForTarget =
    typeof options.probeSshHostKeysForTarget === "function" ? options.probeSshHostKeysForTarget : async () => ({ target: null, candidates: [], feedback: "" });
  const saveSshTrustEntryForTarget =
    typeof options.saveSshTrustEntryForTarget === "function" ? options.saveSshTrustEntryForTarget : async () => ({ target: null, entry: null, feedback: "" });
  const deleteSshTrustEntryForTarget =
    typeof options.deleteSshTrustEntryForTarget === "function" ? options.deleteSshTrustEntryForTarget : async () => ({ target: null, entry: null, feedback: "" });
  const renameLayoutProfile = typeof options.renameLayoutProfile === "function" ? options.renameLayoutProfile : async () => "";
  const renameConnectionProfile = typeof options.renameConnectionProfile === "function" ? options.renameConnectionProfile : async () => "";
  const duplicateConnectionProfile =
    typeof options.duplicateConnectionProfile === "function" ? options.duplicateConnectionProfile : async () => "";
  const deleteLayoutProfile = typeof options.deleteLayoutProfile === "function" ? options.deleteLayoutProfile : async () => "";
  const deleteConnectionProfile = typeof options.deleteConnectionProfile === "function" ? options.deleteConnectionProfile : async () => "";
  const listWorkspacePresets = typeof options.listWorkspacePresets === "function" ? options.listWorkspacePresets : () => [];
  const resolveWorkspacePreset =
    typeof options.resolveWorkspacePreset === "function"
      ? options.resolveWorkspacePreset
      : () => ({ preset: null, error: "Unknown workspace preset." });
  const createWorkspacePresetFromCurrent =
    typeof options.createWorkspacePresetFromCurrent === "function" ? options.createWorkspacePresetFromCurrent : async () => "";
  const applyWorkspacePreset = typeof options.applyWorkspacePreset === "function" ? options.applyWorkspacePreset : async () => "";
  const duplicateWorkspacePreset =
    typeof options.duplicateWorkspacePreset === "function" ? options.duplicateWorkspacePreset : async () => "";
  const renameWorkspacePreset = typeof options.renameWorkspacePreset === "function" ? options.renameWorkspacePreset : async () => "";
  const deleteWorkspacePreset = typeof options.deleteWorkspacePreset === "function" ? options.deleteWorkspacePreset : async () => "";
  const listWorkspaceGroupsForDeck =
    typeof options.listWorkspaceGroupsForDeck === "function" ? options.listWorkspaceGroupsForDeck : () => [];
  const resolveWorkspaceGroup =
    typeof options.resolveWorkspaceGroup === "function"
      ? options.resolveWorkspaceGroup
      : () => ({ group: null, error: "Unknown workspace group." });
  const saveWorkspaceGroup = typeof options.saveWorkspaceGroup === "function" ? options.saveWorkspaceGroup : async () => "";
  const applyWorkspaceGroup = typeof options.applyWorkspaceGroup === "function" ? options.applyWorkspaceGroup : async () => "";
  const renameWorkspaceGroup = typeof options.renameWorkspaceGroup === "function" ? options.renameWorkspaceGroup : async () => "";
  const deleteWorkspaceGroup = typeof options.deleteWorkspaceGroup === "function" ? options.deleteWorkspaceGroup : async () => "";
  const clearWorkspaceGroup = typeof options.clearWorkspaceGroup === "function" ? options.clearWorkspaceGroup : async () => "";
  const getBroadcastStatus = typeof options.getBroadcastStatus === "function" ? options.getBroadcastStatus : () => "Broadcast: off.";
  const enableGroupBroadcast = typeof options.enableGroupBroadcast === "function" ? options.enableGroupBroadcast : async () => "";
  const disableBroadcast = typeof options.disableBroadcast === "function" ? options.disableBroadcast : async () => "";
  const listShares = typeof options.listShares === "function" ? options.listShares : async () => [];
  const createShareLink = typeof options.createShareLink === "function" ? options.createShareLink : async () => null;
  const revokeShareLink = typeof options.revokeShareLink === "function" ? options.revokeShareLink : async () => null;
  const writeClipboardText = typeof options.writeClipboardText === "function" ? options.writeClipboardText : async () => false;
  const slashCommandRegistry = createSlashCommandRegistry(systemSlashCommands);

  function formatUsage(commandName, subcommandName = "") {
    return `Usage: ${getSlashCommandUsage(commandName, subcommandName, systemSlashCommands)}`;
  }

  function resolveSlashCommand(interpreted) {
    return resolveSlashCommandWithRegistry(interpreted, slashCommandRegistry);
  }

  function resolveSingleSessionForCommand(selectorText, sessions, activeSessionId, missingActiveMessage, selectorLabel) {
    return resolveSingleSessionForCommandWithSelectors(
      selectorText,
      sessions,
      activeSessionId,
      missingActiveMessage,
      selectorLabel,
      resolveTargetSelectors
    );
  }

  function resolveDirectTargetSession(interpreted, sessions, activeSessionId, missingActiveMessage, selectorLabel) {
    return resolveDirectTargetSessionWithSelectors(
      interpreted,
      sessions,
      activeSessionId,
      missingActiveMessage,
      selectorLabel,
      resolveTargetSelectors
    );
  }

  function resolveActiveOrDirectTargetSession(interpreted, sessions, activeSessionId, missingActiveMessage, selectorLabel) {
    return resolveActiveOrDirectTargetSessionWithSelectors(
      interpreted,
      sessions,
      activeSessionId,
      missingActiveMessage,
      selectorLabel,
      resolveTargetSelectors
    );
  }

  function resolveCustomCommandTargets(selectorText, sessions, activeSessionId, missingActiveMessage) {
    const normalizedSelector = String(selectorText || "").trim();
    if (!normalizedSelector) {
      if (!activeSessionId) {
        return { error: missingActiveMessage, sessions: [] };
      }
      const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
      if (!activeSession) {
        return { error: missingActiveMessage, sessions: [] };
      }
      return { error: "", sessions: [activeSession] };
    }

    const resolvedTargets = resolveTargetSelectors(normalizedSelector, sessions, { source: "slash" });
    if (resolvedTargets.error) {
      return { error: resolvedTargets.error, sessions: [] };
    }
    if (!Array.isArray(resolvedTargets.sessions) || resolvedTargets.sessions.length === 0) {
      return { error: missingActiveMessage, sessions: [] };
    }
    return { error: "", sessions: resolvedTargets.sessions };
  }

  function getSessionById(sessionId, sessions) {
    return Array.isArray(sessions) ? sessions.find((session) => session.id === sessionId) || null : null;
  }


  const domainHandlers = createCommandExecutorDomainHandlers({
    defaultDeckId,
    normalizeKeyword,
    formatUsage,
    parseJsonObjectToken,
    getSessionById,
    resolveActiveOrDirectTargetSession,
    listLayoutProfiles,
    resolveLayoutProfile,
    createLayoutProfileFromCurrent,
    applyLayoutProfile,
    renameLayoutProfile,
    deleteLayoutProfile,
    listConnectionProfiles,
    formatConnectionProfileSummary,
    formatConnectionProfileReport,
    resolveConnectionProfile,
    createConnectionProfileFromSession,
    getConnectionProfileDraft,
    setConnectionProfileDraft,
    loadConnectionProfileDraftFromActive,
    formatConnectionDraftReport: (draft) => formatConnectionDraftReport(draft, normalizeConnectionProfileLaunch),
    normalizeConnectionProfileLaunch,
    saveConnectionProfileDraft,
    resetConnectionProfileDraft,
    applyConnectionProfile,
    launchConnectionLaunch,
    listSshTrustEntriesForTarget,
    probeSshHostKeysForTarget,
    saveSshTrustEntryForTarget,
    deleteSshTrustEntryForTarget,
    duplicateConnectionProfile,
    renameConnectionProfile,
    deleteConnectionProfile,
    listWorkspacePresets,
    resolveWorkspacePreset,
    formatWorkspacePresetDetail,
    createWorkspacePresetFromCurrent,
    applyWorkspacePreset,
    duplicateWorkspacePreset,
    renameWorkspacePreset,
    deleteWorkspacePreset,
    getActiveDeck,
    listWorkspaceGroupsForDeck,
    resolveWorkspaceGroup,
    saveWorkspaceGroup,
    applyWorkspaceGroup,
    renameWorkspaceGroup,
    deleteWorkspaceGroup,
    clearWorkspaceGroup,
    getBroadcastStatus,
    enableGroupBroadcast,
    disableBroadcast,
    normalizeThemeProfile,
    defaultThemeProfile: defaultTerminalTheme,
    listShares,
    createShareLink,
    revokeShareLink,
    writeClipboardText,
    resolveDeckToken,
    formatShareLinkSummary: (shareLink, sessions, decks) =>
      formatShareLinkSummary(shareLink, sessions, decks, { formatSessionToken, formatSessionDisplayName })
  });

  const sessionHandlers = createCommandExecutorSessionHandlers({
    formatUsage,
    getActiveDeck,
    setActiveDeck,
    setActiveSession: (sessionId) => store.setActiveSession(sessionId),
    resolveTargetSelectors,
    resolveSessionDeckId,
    formatSessionToken,
    formatSessionDisplayName,
    isSessionExited,
    isSessionActionBlocked,
    getBlockedSessionActionMessage,
    requestRender,
    resolveDirectTargetSession,
    resolveActiveOrDirectTargetSession,
    swapSessionTokens,
    applyRuntimeEvent,
    api
  });

  const settingsHandlers = createCommandExecutorSettingsHandlers({
    api,
    formatUsage,
    normalizeKeyword,
    parseJsonObjectToken,
    resolveActiveOrDirectTargetSession,
    formatSessionToken,
    formatSessionDisplayName,
    normalizeSessionTags,
    normalizeThemeProfile,
    getSessionSendTerminator,
    setSessionSendTerminator,
    applyRuntimeEvent,
    parseSettingsPayload,
    normalizeSendTerminatorMode,
    isSessionExited,
    getBlockedSessionActionMessage,
    themeProfileKeys,
    defaultTerminalTheme,
    terminalThemePresets
  });

  const customAdminHandlers = createCommandExecutorCustomAdminHandlers({
    api,
    formatUsage,
    listCustomCommandState,
    removeCustomCommandState,
    parseCustomDefinition,
    upsertCustomCommandState,
    resolveSingleSessionForCommand,
    resolveCustomCommandTargets,
    resolveSessionDeckId,
    formatSessionToken,
    formatSessionDisplayName
  });

  const customHandlers = createCommandExecutorCustomHandlers({
    resolveCustomCommandTargets,
    renderCustomCommandForTargets: customAdminHandlers.renderCustomCommandForTargets,
    isSessionActionBlocked,
    getBlockedSessionActionMessage,
    sendInputWithConfiguredTerminator,
    getSessionSendTerminator,
    normalizeSendTerminatorMode,
    delayedSubmitMs,
    buildCustomCommandUsageApiOptions,
    recordCommandSubmission,
    normalizeCustomCommandPayloadForShell,
    formatSessionToken,
    api
  });

  const operatorHandlers = createCommandExecutorOperatorHandlers({
    store,
    api,
    defaultDeckId,
    systemSlashCommands,
    formatUsage,
    resolveTargetSelectors,
    resolveDeckToken,
    parseSizeCommandArgs,
    applyTerminalSizeSettings,
    setSessionFilterText,
    resolveFilterSelectors: options.resolveFilterSelectors,
    getActiveDeck,
    getSessionCountForDeck,
    applyRuntimeEvent,
    setActiveDeck,
    resolveSessionDeckId,
    formatSessionToken,
    formatSessionDisplayName,
    getSessionRuntimeState,
    getTerminalSettings
  });

  const reportingHandlers = createCommandExecutorReportingHandlers({
    formatUsage,
    resolveActiveOrDirectTargetSession,
    resolveSingleSessionForCommand,
    openSessionReplayViewer,
    exportSessionReplayDownload,
    exportSessionReplayCopy,
    loadSessionReplayExcerpt,
    copySessionReplayExcerpt,
    previewSessionReplayExcerpt,
    submitTerminalPaste,
    uploadSessionFile,
    downloadSessionFile,
    formatSessionToken,
    formatSessionDisplayName
  });

  const runtimeRouter = createCommandExecutorRuntimeRouter({
    getState: () => store.getState(),
    sortSessionsByQuickId,
    resolveSlashCommand,
    handlers: [
      ({ command, args, interpreted, sessions, decks, activeSessionId, state }) =>
        operatorHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          decks,
          activeSessionId,
          state
        }),
      ({ command, args, interpreted, sessions, activeSessionId }) =>
        sessionHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          activeSessionId
        }),
      ({ command, args, interpreted, sessions, activeSessionId }) =>
        reportingHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          activeSessionId
        }),
      ({ command, args, interpreted, sessions, decks, activeSessionId }) =>
        domainHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          decks,
          activeSessionId
        }),
      ({ command, args, interpreted, sessions, activeSessionId }) =>
        settingsHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          activeSessionId
        }),
      ({ command, args, interpreted, sessions, decks, activeSessionId }) =>
        customAdminHandlers.executeStructuredCommand({
          command,
          args,
          interpreted,
          sessions,
          decks,
          activeSessionId
        }),
      ({ commandRaw, interpreted, sessions, decks, activeSessionId }) =>
        customHandlers.executeCustomCommand({
          commandRaw,
          interpreted,
          sessions,
          decks,
          activeSessionId,
          allCustomCommands: customAdminHandlers.listNormalizedCustomCommands()
        })
    ]
  });

  return Object.freeze({
    execute: runtimeRouter.execute,
    executeDetailed: runtimeRouter.executeDetailed
  });
}
