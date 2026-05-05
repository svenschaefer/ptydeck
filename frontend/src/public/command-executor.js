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

  function buildCommandExecutionResult(ok, feedback) {
    return Object.freeze({
      ok: ok === true,
      feedback: typeof feedback === "string" ? feedback : String(feedback || "")
    });
  }

  function isCommandExecutionFailure(feedback) {
    const text = String(feedback || "").trim();
    if (!text) {
      return false;
    }
    return [
      /^Usage: /,
      /^Unknown command: /,
      /^No /,
      /^Unknown /,
      /^Ambiguous /,
      /^Missing /,
      /^Failed /,
      /^Display filter failed/i,
      /must resolve to exactly one session/i,
      /^Default deck cannot be deleted\./,
      /^Deck '.+' is not empty\./,
      /^Scoped custom command /,
      /^Custom command not found:/,
      /^Custom command definition error:/,
      /^Multiple scoped custom commands share /,
      /^Field '.+'/
    ].some((pattern) => pattern.test(text));
  }

  function formatUsage(commandName, subcommandName = "") {
    return `Usage: ${getSlashCommandUsage(commandName, subcommandName, systemSlashCommands)}`;
  }

  function resolveSlashCommand(interpreted) {
    const resolved = slashCommandRegistry.resolve(interpreted?.command);
    if (!resolved) {
      return Object.freeze({
        commandRaw: String(interpreted?.command || ""),
        command: String(interpreted?.command || "").toLowerCase(),
        args: Array.isArray(interpreted?.args) ? interpreted.args.slice() : [],
        matchedAlias: null
      });
    }
    return Object.freeze({
      commandRaw: String(interpreted?.command || ""),
      command: resolved.canonicalCommand || String(interpreted?.command || "").toLowerCase(),
      args: [...resolved.argsPrefix, ...(Array.isArray(interpreted?.args) ? interpreted.args : [])],
      matchedAlias: resolved.entry?.isAlias === true ? resolved.entry : null
    });
  }

  function normalizeKeyword(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidHexColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
  }

  function parseBooleanToken(value) {
    const normalized = normalizeKeyword(value);
    if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
    return null;
  }

  function parseJsonObjectToken(text, label) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || "").trim());
    } catch (error) {
      throw new Error(`${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} JSON must be an object.`);
    }
    return parsed;
  }

  function formatConnectionDraftReport(draft) {
    if (!draft || typeof draft !== "object") {
      return "No connection profile draft available.";
    }
    const normalizedLaunch = normalizeConnectionProfileLaunch(draft.launch) || {};
    return [
      "Connection profile draft",
      `mode=${JSON.stringify(String(draft.mode || "blank"))}`,
      `profileId=${JSON.stringify(String(draft.profileId || ""))}`,
      `name=${JSON.stringify(String(draft.name || ""))}`,
      `launch=${JSON.stringify(normalizedLaunch, null, 2)}`
    ].join("\n");
  }

  function formatShareTargetLabel(shareLink, sessions, decks) {
    if (!shareLink || typeof shareLink !== "object") {
      return "unknown";
    }
    if (shareLink.targetType === "session") {
      const session = Array.isArray(sessions) ? sessions.find((entry) => entry.id === shareLink.targetId) || null : null;
      if (session) {
        return `session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
      }
      return `session ${shareLink.targetId || "unknown"}`;
    }
    if (shareLink.targetType === "deck") {
      const deck = Array.isArray(decks) ? decks.find((entry) => entry.id === shareLink.targetId) || null : null;
      if (deck) {
        return `deck [${deck.id}] ${deck.name}`;
      }
      return `deck ${shareLink.targetId || "unknown"}`;
    }
    return "unknown";
  }

  function formatShareLinkStatus(shareLink) {
    if (!shareLink || typeof shareLink !== "object") {
      return "unknown";
    }
    if (shareLink.revokedAt) {
      return "revoked";
    }
    if (shareLink.active === true) {
      return "active";
    }
    return "expired";
  }

  function formatShareLinkSummary(shareLink, sessions, decks) {
    const targetLabel = formatShareTargetLabel(shareLink, sessions, decks);
    const permissionMode = String(shareLink?.permissionMode || "read_only");
    const shareStatus = formatShareLinkStatus(shareLink);
    const expiresAt = Number.isInteger(shareLink?.expiresAt) ? new Date(shareLink.expiresAt).toISOString() : "-";
    return `[${shareLink?.id || "unknown"}] ${targetLabel} · ${permissionMode} · ${shareStatus} · expires=${expiresAt}`;
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
    formatConnectionDraftReport,
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
    formatShareLinkSummary
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

  async function execute(interpreted) {
    const resolvedSlashCommand = resolveSlashCommand(interpreted);
    const commandRaw = resolvedSlashCommand.commandRaw;
    const command = resolvedSlashCommand.command;
    const args = resolvedSlashCommand.args;
    const state = store.getState();
    const sessions = sortSessionsByQuickId(state.sessions);
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const activeSessionId = state.activeSessionId;

    const operatorFeedback = await operatorHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      decks,
      activeSessionId,
      state
    });
    if (operatorFeedback !== null) {
      return operatorFeedback;
    }

    const sessionCommandFeedback = await sessionHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      activeSessionId
    });
    if (sessionCommandFeedback !== null) {
      return sessionCommandFeedback;
    }

    const reportingFeedback = await reportingHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      activeSessionId
    });
    if (reportingFeedback !== null) {
      return reportingFeedback;
    }

    const structuredDomainFeedback = await domainHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      decks,
      activeSessionId
    });
    if (structuredDomainFeedback !== null) {
      return structuredDomainFeedback;
    }

    const settingsFeedback = await settingsHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      activeSessionId
    });
    if (settingsFeedback !== null) {
      return settingsFeedback;
    }

    const customAdminFeedback = await customAdminHandlers.executeStructuredCommand({
      command,
      args,
      interpreted,
      sessions,
      decks,
      activeSessionId
    });
    if (customAdminFeedback !== null) {
      return customAdminFeedback;
    }

    const customFeedback = await customHandlers.executeCustomCommand({
      commandRaw,
      interpreted,
      sessions,
      decks,
      activeSessionId,
      allCustomCommands: customAdminHandlers.listNormalizedCustomCommands()
    });
    if (customFeedback !== null) {
      return customFeedback;
    }

    return `Unknown command: /${commandRaw}`;
  }

  async function executeDetailed(interpreted) {
    const feedback = await execute(interpreted);
    return buildCommandExecutionResult(!isCommandExecutionFailure(feedback), feedback);
  }

  return Object.freeze({
    execute,
    executeDetailed
  });
}
