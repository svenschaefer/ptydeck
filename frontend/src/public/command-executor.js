import { createCommandHelpText, createCommandTopicHelpText, createSlashCommandRegistry, getSlashCommandUsage } from "./command-schema.js";
import {
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch
} from "./connection-profile-runtime-controller.js";
import {
  normalizeSessionInputSafetyProfile,
  SESSION_INPUT_SAFETY_BOOLEAN_KEYS,
  SESSION_INPUT_SAFETY_INTEGER_DEFAULTS
} from "./input-safety-profile.js";
import {
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION,
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  normalizeSessionMouseForwardingMode
} from "./session-mouse-forwarding.js";
import { formatWorkspacePresetDetail } from "./workspace-preset-runtime-controller.js";
import {
  analyzeCustomCommandTemplate,
  compareCustomCommandRecords,
  formatCustomCommandScopeLabel,
  listScopedCustomCommandsByName,
  normalizeCustomCommandRecord,
  parseCustomCommandReferenceArgs,
  parseCustomCommandInvocation,
  resolveCustomCommandForSession,
  resolveExactCustomCommand,
  renderCustomCommandForSession
} from "./custom-command-model.js";
import { createCommandExecutorDomainHandlers } from "./command-executor-domain-handlers.js";
import {
  createCommandExecutorSessionHandlers,
  resolveActiveOrDirectTargetSession as resolveActiveOrDirectTargetSessionWithSelectors,
  resolveDirectTargetSession as resolveDirectTargetSessionWithSelectors,
  resolveSingleSessionForCommand as resolveSingleSessionForCommandWithSelectors
} from "./command-executor-session-handlers.js";
import {
  formatThemeIoFormats,
  parseExternalThemeProfile,
  serializeExternalThemeProfile
} from "./theme-io.js";

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

  function formatSessionSettingsReport(session) {
    const token = formatSessionToken(session.id);
    const name = formatSessionDisplayName(session);
    const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
    const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
    const env = session?.env && typeof session.env === "object" ? session.env : {};
    const tags = normalizeSessionTags(session.tags);
    const note = typeof session?.note === "string" ? session.note : "";
    const activeThemeProfile = normalizeThemeProfile(session.activeThemeProfile || session.themeProfile);
    const inactiveThemeProfile = normalizeThemeProfile(session.inactiveThemeProfile || session.themeProfile);
    const sendTerminator = getSessionSendTerminator(session.id);
    const mouseForwardingMode = normalizeSessionMouseForwardingMode(session?.mouseForwardingMode);
    const inputSafetyProfile = normalizeSessionInputSafetyProfile(session.inputSafetyProfile);
    return [
      `[${token}] ${name}`,
      `startCwd=${JSON.stringify(startCwd)}`,
      `startCommand=${JSON.stringify(startCommand)}`,
      `env=${JSON.stringify(env)}`,
      `tags=${JSON.stringify(tags)}`,
      `note=${JSON.stringify(note)}`,
      `sendTerminator=${sendTerminator}`,
      `mouseForwardingMode=${JSON.stringify(mouseForwardingMode)}`,
      `activeThemeProfile=${JSON.stringify(activeThemeProfile)}`,
      `inactiveThemeProfile=${JSON.stringify(inactiveThemeProfile)}`,
      `inputSafetyProfile=${JSON.stringify(inputSafetyProfile)}`
    ].join("\n");
  }

  function formatConnectionProfileReport(profile) {
    const launch = profile?.launch && typeof profile.launch === "object" ? profile.launch : {};
    return [
      `[${profile.id}] ${profile.name}`,
      `kind=${JSON.stringify(launch.kind || "local")}`,
      `deckId=${JSON.stringify(launch.deckId || defaultDeckId)}`,
      `shell=${JSON.stringify(launch.shell || "")}`,
      `startCwd=${JSON.stringify(launch.startCwd || "")}`,
      `startCommand=${JSON.stringify(launch.startCommand || "")}`,
      `env=${JSON.stringify(launch.env || {})}`,
      `tags=${JSON.stringify(Array.isArray(launch.tags) ? launch.tags : [])}`,
      `remoteConnection=${JSON.stringify(launch.remoteConnection || null)}`,
      `remoteAuth=${JSON.stringify(launch.remoteAuth || null)}`,
      `activeThemeProfile=${JSON.stringify(launch.activeThemeProfile || {})}`,
      `inactiveThemeProfile=${JSON.stringify(launch.inactiveThemeProfile || {})}`
    ].join("\n");
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

  function resolveThemeSlotToken(value) {
    return normalizeKeyword(value) === "inactive" ? "inactive" : "active";
  }

  function resolveThemeProfileKey(value) {
    const normalized = normalizeKeyword(value);
    const aliases = new Map([
      ["bg", "background"],
      ["background", "background"],
      ["fg", "foreground"],
      ["foreground", "foreground"],
      ["cursor", "cursor"],
      ["black", "black"],
      ["red", "red"],
      ["green", "green"],
      ["yellow", "yellow"],
      ["blue", "blue"],
      ["magenta", "magenta"],
      ["cyan", "cyan"],
      ["white", "white"],
      ["brightblack", "brightBlack"],
      ["bright-black", "brightBlack"],
      ["brightred", "brightRed"],
      ["bright-red", "brightRed"],
      ["brightgreen", "brightGreen"],
      ["bright-green", "brightGreen"],
      ["brightyellow", "brightYellow"],
      ["bright-yellow", "brightYellow"],
      ["brightblue", "brightBlue"],
      ["bright-blue", "brightBlue"],
      ["brightmagenta", "brightMagenta"],
      ["bright-magenta", "brightMagenta"],
      ["brightcyan", "brightCyan"],
      ["bright-cyan", "brightCyan"],
      ["brightwhite", "brightWhite"],
      ["bright-white", "brightWhite"]
    ]);
    const resolved = aliases.get(normalized) || "";
    return themeProfileKeys.includes(resolved) ? resolved : "";
  }

  function resolveThemePresetToken(value) {
    const normalized = normalizeKeyword(value);
    if (!normalized) {
      return { preset: null, error: "Theme preset is required." };
    }
    const exactId = terminalThemePresets.find((entry) => normalizeKeyword(entry?.id) === normalized) || null;
    if (exactId) {
      return { preset: exactId, error: "" };
    }
    const exactName = terminalThemePresets.find((entry) => normalizeKeyword(entry?.name) === normalized) || null;
    if (exactName) {
      return { preset: exactName, error: "" };
    }
    const matches = terminalThemePresets.filter(
      (entry) => normalizeKeyword(entry?.id).startsWith(normalized) || normalizeKeyword(entry?.name).startsWith(normalized)
    );
    if (matches.length === 1) {
      return { preset: matches[0], error: "" };
    }
    if (matches.length > 1) {
      return { preset: null, error: `Ambiguous theme preset: ${value}` };
    }
    return { preset: null, error: `Unknown theme preset: ${value}` };
  }

  function formatThemeSlotReport(session, slot) {
    const normalizedSlot = resolveThemeSlotToken(slot);
    const profile = normalizeThemeProfile(
      normalizedSlot === "inactive" ? session?.inactiveThemeProfile || session?.themeProfile : session?.activeThemeProfile || session?.themeProfile
    );
    return `${normalizedSlot}ThemeProfile=${JSON.stringify(profile, null, 2)}`;
  }

  function getThemeSlotPatchKey(slot) {
    return resolveThemeSlotToken(slot) === "inactive" ? "inactiveThemeProfile" : "activeThemeProfile";
  }

  function getThemeSlotProfile(session, slot) {
    return normalizeThemeProfile(
      resolveThemeSlotToken(slot) === "inactive"
        ? session?.inactiveThemeProfile || session?.themeProfile
        : session?.activeThemeProfile || session?.themeProfile
    );
  }

  function parseThemeImportRaw(raw) {
    const match = /^\/settings\s+theme\s+import\s+(\S+)\s+(\S+)\s+([\s\S]+)$/i.exec(String(raw || ""));
    if (!match) {
      return null;
    }
    return {
      slot: match[1],
      format: match[2],
      payload: match[3]
    };
  }

  function formatInputSafetyFieldList() {
    return [
      "confirmOnAnyInput",
      "requireValidShellSyntax",
      "confirmOnIncompleteShellConstruct",
      "confirmOnNaturalLanguageInput",
      "confirmOnDangerousShellCommand",
      "confirmOnMultilineInput",
      "autoContinueStalledPaste",
      "confirmOnRecentTargetSwitch",
      "targetSwitchGraceMs",
      "pasteLengthConfirmThreshold",
      "pasteLineConfirmThreshold"
    ].join(", ");
  }

  function resolveInputSafetyField(value) {
    const normalized = normalizeKeyword(value);
    const aliases = new Map([
      ["always", "confirmOnAnyInput"],
      ["always-confirm", "confirmOnAnyInput"],
      ["confirmonanyinput", "confirmOnAnyInput"],
      ["alwaysconfirmbeforesend", "confirmOnAnyInput"],
      ["syntax", "requireValidShellSyntax"],
      ["requirevalidshellsyntax", "requireValidShellSyntax"],
      ["incomplete", "confirmOnIncompleteShellConstruct"],
      ["confirmonincompleteshellconstruct", "confirmOnIncompleteShellConstruct"],
      ["natural-language", "confirmOnNaturalLanguageInput"],
      ["naturallanguage", "confirmOnNaturalLanguageInput"],
      ["confirmonnaturallanguageinput", "confirmOnNaturalLanguageInput"],
      ["dangerous", "confirmOnDangerousShellCommand"],
      ["confirmondangerousshellcommand", "confirmOnDangerousShellCommand"],
      ["multiline", "confirmOnMultilineInput"],
      ["confirmonmultilineinput", "confirmOnMultilineInput"],
      ["paste-auto-continue", "autoContinueStalledPaste"],
      ["autocontinuestalledpaste", "autoContinueStalledPaste"],
      ["stalled-paste-auto-continue", "autoContinueStalledPaste"],
      ["recent-target-switch", "confirmOnRecentTargetSwitch"],
      ["recenttargetswitch", "confirmOnRecentTargetSwitch"],
      ["confirmonrecenttargetswitch", "confirmOnRecentTargetSwitch"],
      ["grace-ms", "targetSwitchGraceMs"],
      ["targetswitchgracems", "targetSwitchGraceMs"],
      ["paste-length", "pasteLengthConfirmThreshold"],
      ["pastelengthconfirmthreshold", "pasteLengthConfirmThreshold"],
      ["paste-lines", "pasteLineConfirmThreshold"],
      ["pastelineconfirmthreshold", "pasteLineConfirmThreshold"]
    ]);
    const resolved = aliases.get(normalized) || "";
    return SESSION_INPUT_SAFETY_BOOLEAN_KEYS.includes(resolved) || Object.prototype.hasOwnProperty.call(SESSION_INPUT_SAFETY_INTEGER_DEFAULTS, resolved)
      ? resolved
      : "";
  }

  async function applySessionSettingsPatch(session, patch, sendTerminatorMode = null) {
    let effectiveSession = session;
    if (Object.keys(patch).length > 0) {
      effectiveSession = await api.updateSession(session.id, patch);
      applyRuntimeEvent({ type: "session.updated", session: effectiveSession });
    }
    if (typeof sendTerminatorMode === "string") {
      setSessionSendTerminator(session.id, sendTerminatorMode);
    }
    return effectiveSession;
  }

  function formatStartupSettingsReport(session) {
    const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
    const startCommand = typeof session.startCommand === "string" ? session.startCommand : "";
    const env = session?.env && typeof session.env === "object" ? session.env : {};
    const tags = normalizeSessionTags(session.tags);
    const sendTerminator = getSessionSendTerminator(session.id);
    return [
      `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`,
      `startCwd=${JSON.stringify(startCwd)}`,
      `startCommand=${JSON.stringify(startCommand)}`,
      `env=${JSON.stringify(env)}`,
      `tags=${JSON.stringify(tags)}`,
      `sendTerminator=${sendTerminator}`
    ].join("\n");
  }

  function formatSessionNoteReport(session) {
    return [
      `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`,
      `note=${JSON.stringify(typeof session?.note === "string" ? session.note : "")}`
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

  function buildReplayExcerptSummary(payload) {
    const selector = String(payload?.selector || "excerpt").trim() || "excerpt";
    const resolvedCount = Number.isInteger(payload?.resolvedCount) ? payload.resolvedCount : 0;
    const availableCount = Number.isInteger(payload?.availableCount) ? payload.availableCount : resolvedCount;
    const chars = Number.isInteger(payload?.chars) ? payload.chars : String(payload?.data || "").length;
    const lines = Number.isInteger(payload?.lines) ? payload.lines : String(payload?.data || "").split("\n").filter(Boolean).length;
    const partialSuffix = payload?.selectorSatisfied === true ? "" : ", partial";
    return `${selector} -> ${resolvedCount}/${availableCount} units, ${chars} chars, ${lines} lines${partialSuffix}`;
  }

  function buildReplayExcerptEmptyFeedback(session, selector) {
    return `No replay excerpt matched ${selector} on [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
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

  function listNormalizedCustomCommands() {
    return listCustomCommandState().map((entry) => normalizeCustomCommandRecord(entry)).filter(Boolean).sort(compareCustomCommandRecords);
  }

  function getSessionById(sessionId, sessions) {
    return Array.isArray(sessions) ? sessions.find((session) => session.id === sessionId) || null : null;
  }

  function formatScopedCustomCommandLabel(custom, sessions) {
    return formatCustomCommandScopeLabel(custom, {
      getSessionById: (sessionId) => getSessionById(sessionId, sessions),
      formatSessionToken,
      formatSessionDisplayName
    });
  }

  function resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands, options = {}) {
    const exactRequired = options.exactRequired === true;
    if (!reference?.name) {
      return { error: "Custom command name is required.", custom: null, exactSession: null };
    }
    if (reference.scope) {
      if (reference.scope === "session") {
        const resolvedSession = resolveSingleSessionForCommand(
          reference.sessionSelector,
          sessions,
          activeSessionId,
          "No active session for scoped custom command resolution.",
          "Session-scoped custom command selector"
        );
        if (resolvedSession.error) {
          return { error: resolvedSession.error, custom: null, exactSession: null };
        }
        const exact = resolveExactCustomCommand(commands, reference.name, "session", resolvedSession.session.id);
        if (!exact) {
          return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
        }
        return { error: "", custom: exact, exactSession: resolvedSession.session };
      }
      const exact = resolveExactCustomCommand(commands, reference.name, reference.scope, "");
      if (!exact) {
        return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
      }
      return { error: "", custom: exact, exactSession: null };
    }

    const matches = listScopedCustomCommandsByName(commands, reference.name);
    if (matches.length === 0) {
      return { error: `Custom command not found: /${reference.name}`, custom: null, exactSession: null };
    }
      if (exactRequired && matches.length > 1) {
        return {
        error: `Multiple scoped custom commands share /${reference.name}. Use scope:global, scope:project, or scope:session:<selector>.`,
          custom: null,
          exactSession: null
        };
      }
    if (activeSessionId) {
      const effective = resolveCustomCommandForSession(commands, reference.name, activeSessionId);
      if (effective) {
        return { error: "", custom: effective, exactSession: null };
      }
    }
    if (matches.length === 1) {
      return { error: "", custom: matches[0], exactSession: null };
    }
    return {
      error: `Multiple scoped custom commands share /${reference.name}. Use scope:global, scope:project, or scope:session:<selector>.`,
      custom: null,
      exactSession: null
    };
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

  function renderCustomCommandForTargets(commandName, exactCustom, targetSessions, parameterAssignments, decks, commands, sessions) {
    const renderedEntries = [];
    for (const session of targetSessions) {
      const resolvedCustom = exactCustom || resolveCustomCommandForSession(commands, commandName, session.id);
      if (!resolvedCustom) {
        return { error: `Custom command not found: /${commandName}`, entries: [] };
      }
      if (resolvedCustom.scope === "session" && resolvedCustom.sessionId !== session.id) {
        return {
          error: `Scoped custom command /${resolvedCustom.name} is bound to ${formatScopedCustomCommandLabel(resolvedCustom, sessions)}.`,
          entries: []
        };
      }
      const deckId = resolveSessionDeckId(session);
      const deck = Array.isArray(decks) ? decks.find((entry) => entry.id === deckId) || null : null;
      const rendered = renderCustomCommandForSession(resolvedCustom, session, deck, parameterAssignments);
      if (!rendered.ok) {
        return { error: rendered.error, entries: [] };
      }
      renderedEntries.push({ session, text: rendered.text, custom: resolvedCustom });
    }
    return { error: "", entries: renderedEntries };
  }

  function formatCustomCommandPreview(custom, entries, sessions) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return "";
    }
    if (entries.length === 1) {
      const entry = entries[0];
      return [
        `/${custom.name} · ${formatScopedCustomCommandLabel(entry.custom || custom, sessions)} -> [${formatSessionToken(entry.session.id)}] ${formatSessionDisplayName(entry.session)}`,
        "---",
        entry.text,
        "---"
      ].join("\n");
    }
    return entries
      .map((entry) =>
        [
          `[${formatSessionToken(entry.session.id)}] ${formatSessionDisplayName(entry.session)} · ${formatScopedCustomCommandLabel(entry.custom || custom, sessions)}`,
          "---",
          entry.text,
          "---"
        ].join("\n")
      )
      .join("\n\n");
  }

  async function execute(interpreted) {
    const resolvedSlashCommand = resolveSlashCommand(interpreted);
    const commandRaw = resolvedSlashCommand.commandRaw;
    const command = resolvedSlashCommand.command;
    const args = resolvedSlashCommand.args;
    const state = store.getState();
    const sessions = sortSessionsByQuickId(state.sessions);
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const activeSessionId = state.activeSessionId;

    if (command === "" || command === "help") {
      if (args.length === 0) {
        return createCommandHelpText(systemSlashCommands);
      }
      const topicHelp = createCommandTopicHelpText(args[0], args[1] || "", systemSlashCommands);
      if (topicHelp) {
        return topicHelp;
      }
      return createCommandHelpText(systemSlashCommands);
    }

    if (command === "run") {
      return formatUsage("run");
    }

    if (command === "deck") {
      const subcommand = String(args[0] || "").toLowerCase();
      const rest = args.slice(1);
      const decks = state.decks.slice();
      const activeDeck = getActiveDeck();

      if (!subcommand || subcommand === "list") {
        if (decks.length === 0) {
          return "No decks available.";
        }
        const lines = decks.map((deck) => {
          const marker = activeDeck && deck.id === activeDeck.id ? "*" : " ";
          const count = getSessionCountForDeck(deck.id, sessions);
          return `${marker} [${deck.id}] ${deck.name} (${count} sessions)`;
        });
        return lines.join("\n");
      }

      if (subcommand === "new") {
        const terminalSettings = getTerminalSettings();
        const name = rest.join(" ").trim();
        if (!name) {
          return formatUsage("deck", "new");
        }
        const created = await api.createDeck({
          name,
          settings: {
            terminal: {
              cols: terminalSettings.cols,
              rows: terminalSettings.rows
            }
          }
        });
        applyRuntimeEvent(
          {
            type: "deck.created",
            deck: created
          },
          { preferredActiveDeckId: created.id }
        );
        return `Created deck [${created.id}] ${created.name}.`;
      }

      if (subcommand === "rename") {
        if (!activeDeck) {
          return "No active deck to rename.";
        }
        if (rest.length === 0) {
          return formatUsage("deck", "rename");
        }

        let targetDeck = activeDeck;
        let name = "";
        if (rest.length === 1) {
          name = rest[0].trim();
        } else {
          const resolvedDeck = resolveDeckToken(rest[0], decks);
          if (!resolvedDeck.deck) {
            return resolvedDeck.error;
          }
          targetDeck = resolvedDeck.deck;
          name = rest.slice(1).join(" ").trim();
        }

        if (!name) {
          return formatUsage("deck", "rename");
        }
        const updated = await api.updateDeck(targetDeck.id, { name });
        applyRuntimeEvent(
          {
            type: "deck.updated",
            deck: updated
          },
          { preferredActiveDeckId: updated.id }
        );
        return `Renamed deck [${updated.id}] to ${updated.name}.`;
      }

      if (subcommand === "switch") {
        if (rest.length !== 1) {
          return formatUsage("deck", "switch");
        }
        const resolved = resolveDeckToken(rest[0], decks);
        if (!resolved.deck) {
          return resolved.error;
        }
        const changed = setActiveDeck(resolved.deck.id);
        if (!changed) {
          return `Failed to switch deck: ${resolved.deck.id}`;
        }
        return `Active deck: [${resolved.deck.id}] ${resolved.deck.name}.`;
      }

      if (subcommand === "delete") {
        if (!activeDeck) {
          return "No active deck to delete.";
        }
        if (rest.length > 2) {
          return formatUsage("deck", "delete");
        }
        let force = false;
        let selector = "";
        if (rest.length === 1) {
          if (String(rest[0]).toLowerCase() === "force") {
            force = true;
          } else {
            selector = rest[0];
          }
        } else if (rest.length === 2) {
          selector = rest[0];
          if (String(rest[1]).toLowerCase() !== "force") {
            return formatUsage("deck", "delete");
          }
          force = true;
        }

        let targetDeck = activeDeck;
        if (selector) {
          const resolved = resolveDeckToken(selector, decks);
          if (!resolved.deck) {
            return resolved.error;
          }
          targetDeck = resolved.deck;
        }

        if (targetDeck.id === defaultDeckId) {
          return "Default deck cannot be deleted.";
        }

        try {
          await api.deleteDeck(targetDeck.id, { force });
        } catch (err) {
          if (err && err.status === 409 && !force) {
            return `Deck '${targetDeck.name}' is not empty. Retry with '/deck delete ${targetDeck.id} force'.`;
          }
          throw err;
        }

        const fallbackId = decks.find((deck) => deck.id !== targetDeck.id)?.id || defaultDeckId;
        applyRuntimeEvent(
          {
            type: "deck.deleted",
            deckId: targetDeck.id,
            fallbackDeckId: fallbackId
          },
          { preferredActiveDeckId: fallbackId }
        );
        return `Deleted deck [${targetDeck.id}] ${targetDeck.name}.`;
      }

      return formatUsage("deck");
    }

    if (command === "move") {
      if (args.length !== 2) {
        return formatUsage("move");
      }
      const sessionSelector = args[0];
      const deckSelector = args[1];
      const resolvedTargets = resolveTargetSelectors(sessionSelector, sessions, { source: "slash" });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      if (resolvedTargets.sessions.length === 0) {
        return "No sessions resolved for /move.";
      }
      const resolvedDeck = resolveDeckToken(deckSelector, state.decks);
      if (!resolvedDeck.deck) {
        return resolvedDeck.error;
      }

      const moved = await Promise.all(
        resolvedTargets.sessions.map((session) => api.moveSessionToDeck(resolvedDeck.deck.id, session.id))
      );
      for (const session of moved) {
        applyRuntimeEvent({ type: "session.updated", session });
      }
      if (moved.length === 1) {
        return `Moved session [${formatSessionToken(moved[0].id)}] to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
      }
      return `Moved ${moved.length} sessions to deck [${resolvedDeck.deck.id}] ${resolvedDeck.deck.name}.`;
    }

    if (command === "size") {
      const terminalSettings = getTerminalSettings();
      const parsed = parseSizeCommandArgs(args, terminalSettings.cols, terminalSettings.rows);
      if (!parsed.ok) {
        return parsed.error;
      }
      await applyTerminalSizeSettings(parsed.cols, parsed.rows);
      const activeDeck = getActiveDeck();
      return `Terminal size set to ${parsed.cols}x${parsed.rows} (cols x rows) for deck '${activeDeck?.name || "unknown"}'.`;
    }

    if (command === "filter") {
      const selectorText = args.join(" ").trim();
      if (!selectorText) {
        setSessionFilterText("");
        return "Display filter cleared.";
      }
      const activeDeck = getActiveDeck();
      let activeDeckId = activeDeck ? activeDeck.id : "";
      const resolved = options.resolveFilterSelectors(selectorText, sessions, {
        scopeMode: "active-deck",
        activeDeckId
      });
      if (resolved.error) {
        return resolved.error;
      }
      setSessionFilterText(selectorText);
      if (selectorText.includes("::") && resolved.sessions.length > 0) {
        const targetDeckId = resolveSessionDeckId(resolved.sessions[0]);
        if (targetDeckId && targetDeckId !== activeDeckId) {
          setActiveDeck(targetDeckId);
          activeDeckId = targetDeckId;
        }
      }
      if (resolved.sessions.length > 0 && !resolved.sessions.some((session) => session.id === activeSessionId)) {
        store.setActiveSession(resolved.sessions[0].id);
      }
      const scopedCount = activeDeckId
        ? store.getState().sessions.filter((session) => resolveSessionDeckId(session) === activeDeckId).length
        : store.getState().sessions.length;
      return `Display filter active (${resolved.sessions.length}/${scopedCount}): ${selectorText}`;
    }

    if (command === "list") {
      if (sessions.length === 0) {
        return "No sessions available.";
      }
      const lines = sessions.map((session) => {
        const marker = session.id === activeSessionId ? "*" : " ";
        const token = formatSessionToken(session.id);
        const stateValue = getSessionRuntimeState(session);
        const stateSuffix = stateValue === "active" ? "" : ` [${stateValue}]`;
        return `${marker} [${token}] ${formatSessionDisplayName(session)} (${session.id.slice(0, 8)})${stateSuffix}`;
      });
      return lines.join("\n");
    }

    if (command === "new") {
      const payload = {};
      if (args.length > 0) {
        payload.shell = args[0];
      }
      const session = await api.createSession(payload);
      applyRuntimeEvent({ type: "session.created", session });
      store.setActiveSession(session.id);
      return `Created session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
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

    if (command === "replay") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      if (subcommand === "view" || subcommand === "export" || (subcommand === "copy" && args.length === 1)) {
        const resolvedTarget = resolveActiveOrDirectTargetSession(
          interpreted,
          sessions,
          activeSessionId,
          "No active session for /replay.",
          "Replay selector"
        );
        if (resolvedTarget.error) {
          return resolvedTarget.error;
        }
        if (subcommand === "view") {
          const outcome = await openSessionReplayViewer(resolvedTarget.session);
          return outcome?.feedback || "";
        }
        const outcome =
          subcommand === "copy"
            ? await exportSessionReplayCopy(resolvedTarget.session)
            : await exportSessionReplayDownload(resolvedTarget.session);
        return outcome?.feedback || "";
      }

      if (subcommand === "preview" || subcommand === "copy" || subcommand === "paste") {
        if (subcommand === "preview" && args.length !== 3) {
          return formatUsage("replay", "preview");
        }
        if (subcommand === "copy" && args.length !== 3) {
          return formatUsage("replay", "copy");
        }
        if (subcommand === "paste" && args.length !== 4) {
          return formatUsage("replay", "paste");
        }

        const sourceResolution = resolveSingleSessionForCommand(
          args[1],
          sessions,
          activeSessionId,
          "Replay source selector must resolve to exactly one session.",
          "Replay source selector"
        );
        if (sourceResolution.error) {
          return sourceResolution.error;
        }
        const sliceSelector = String(args[subcommand === "paste" ? 3 : 2] || "").trim();
        if (!sliceSelector) {
          return formatUsage("replay", subcommand);
        }
        const excerptPayload = await loadSessionReplayExcerpt(sourceResolution.session, sliceSelector);
        if (!excerptPayload || typeof excerptPayload !== "object") {
          return "Failed to load replay excerpt.";
        }
        if (!excerptPayload.data) {
          return buildReplayExcerptEmptyFeedback(sourceResolution.session, sliceSelector);
        }
        if (subcommand === "preview") {
          return (
            previewSessionReplayExcerpt(sourceResolution.session, excerptPayload) ||
            `Preview from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} (${buildReplayExcerptSummary(excerptPayload)}).\n\n${excerptPayload.data}`
          );
        }
        if (subcommand === "copy") {
          const outcome = await copySessionReplayExcerpt(sourceResolution.session, sliceSelector, {
            payload: excerptPayload
          });
          return (
            outcome?.feedback ||
            `Copied replay excerpt from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} (${buildReplayExcerptSummary(excerptPayload)}).`
          );
        }
        const targetResolution = resolveSingleSessionForCommand(
          args[2],
          sessions,
          activeSessionId,
          "Replay target selector must resolve to exactly one session.",
          "Replay target selector"
        );
        if (targetResolution.error) {
          return targetResolution.error;
        }
        const pasteResult = await submitTerminalPaste(targetResolution.session.id, excerptPayload.data, {
          source: "replay-paste",
          activateTargetBeforeSend: true
        });
        if (pasteResult?.status === "sent") {
          return `Pasted replay excerpt ${buildReplayExcerptSummary(excerptPayload)} from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} to [${formatSessionToken(targetResolution.session.id)}] ${formatSessionDisplayName(targetResolution.session)}.`;
        }
        return pasteResult?.feedback || "Failed to paste replay excerpt.";
      }

      return formatUsage("replay");
    }

    if (command === "transfer") {
      const subcommand = String(args[0] || "").trim().toLowerCase();
      if (subcommand !== "upload" && subcommand !== "download") {
        return formatUsage("transfer");
      }
      const resolvedTarget = resolveActiveOrDirectTargetSession(
        interpreted,
        sessions,
        activeSessionId,
        "No active session for /transfer.",
        "Transfer selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      if (subcommand === "upload") {
        const remotePath = args.slice(1).join(" ").trim();
        const outcome = await uploadSessionFile(resolvedTarget.session, { remotePath });
        return outcome?.feedback || "";
      }
      const remotePath = args.slice(1).join(" ").trim();
      if (!remotePath) {
        return formatUsage("transfer", "download");
      }
      const outcome = await downloadSessionFile(resolvedTarget.session, { remotePath });
      return outcome?.feedback || "";
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

    if (command === "custom") {
      if (args[0] === "list") {
        const commands = listNormalizedCustomCommands();
        if (commands.length === 0) {
          return "No custom commands defined.";
        }
        return commands.map((custom) => `/${custom.name} (${custom.kind} · ${formatScopedCustomCommandLabel(custom, sessions)})`).join("\n");
      }

      if (args[0] === "show") {
        const reference = parseCustomCommandReferenceArgs(args.slice(1));
        if (!reference.ok || !reference.name) {
          return formatUsage("custom", "show");
        }
        const commands = listNormalizedCustomCommands();
        const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands);
        if (resolved.error || !resolved.custom) {
          return resolved.error;
        }
        const normalized = resolved.custom;
        const scopeLabel = formatScopedCustomCommandLabel(normalized, sessions);
        if (normalized.kind !== "template") {
          return [`/${normalized.name}`, `kind: plain`, `scope: ${scopeLabel}`, `precedence: ${normalized.precedence}`, "---", normalized.content, "---"].join("\n");
        }
        const template = analyzeCustomCommandTemplate(normalized.content);
        const metadata = [`/${normalized.name}`, "kind: template", `scope: ${scopeLabel}`, `precedence: ${normalized.precedence}`];
        if (template.ok && template.parameters.length > 0) {
          metadata.push(`parameters: ${template.parameters.join(", ")}`);
        }
        if (normalized.templateVariables.length > 0) {
          metadata.push(`templateVariables: ${normalized.templateVariables.join(", ")}`);
        }
        return `${metadata.join("\n")}\n---\n${normalized.content}\n---`;
      }

      if (args[0] === "preview") {
        const reference = parseCustomCommandReferenceArgs(args.slice(1));
        if (!reference.ok || !reference.name) {
          return formatUsage("custom", "preview");
        }
        const commands = listNormalizedCustomCommands();
        const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands);
        if (resolved.error || !resolved.custom) {
          return resolved.error;
        }
        const custom = resolved.custom;
        const invocationRaw = `/${custom.name}${reference.rest.length > 0 ? ` ${reference.rest.join(" ")}` : ""}`;
        const invocation = parseCustomCommandInvocation(invocationRaw, custom);
        if (!invocation.ok) {
          return invocation.error;
        }
        const targetResolution =
          resolved.exactSession && !invocation.targetSelector
            ? { error: "", sessions: [resolved.exactSession] }
            : resolveCustomCommandTargets(
                invocation.targetSelector,
                sessions,
                activeSessionId,
                "No active session for custom command preview."
              );
        if (targetResolution.error) {
          return targetResolution.error;
        }
        const rendered = renderCustomCommandForTargets(
          custom.name,
          reference.scope ? custom : null,
          targetResolution.sessions,
          invocation.parameterAssignments,
          decks,
          commands,
          sessions
        );
        if (rendered.error) {
          return rendered.error;
        }
        return formatCustomCommandPreview(custom, rendered.entries, sessions);
      }

      if (args[0] === "remove") {
        const reference = parseCustomCommandReferenceArgs(args.slice(1));
        if (!reference.ok || !reference.name) {
          return formatUsage("custom", "remove");
        }
        const commands = listNormalizedCustomCommands();
        const resolved = resolveScopedCustomCommandReference(reference, sessions, activeSessionId, commands, {
          exactRequired: true
        });
        if (resolved.error || !resolved.custom) {
          return resolved.error;
        }
        try {
          await api.deleteCustomCommand(resolved.custom.name, {
            scope: resolved.custom.scope,
            sessionId: resolved.custom.sessionId || undefined
          });
          removeCustomCommandState(resolved.custom);
          return `Removed custom command /${resolved.custom.name} (${formatScopedCustomCommandLabel(resolved.custom, sessions)}).`;
        } catch (err) {
          if (err && err.status === 404) {
            return `Custom command not found: /${reference.name}`;
          }
          throw err;
        }
      }

      const parsed = parseCustomDefinition(interpreted.raw);
      if (!parsed.ok) {
        return `Custom command definition error: ${parsed.error}`;
      }
      let sessionId = null;
      if (parsed.scope === "session") {
        const resolvedSession = resolveSingleSessionForCommand(
          parsed.sessionSelector,
          sessions,
          activeSessionId,
          "No active session for session-scoped custom command.",
          "Session-scoped custom command selector"
        );
        if (resolvedSession.error) {
          return resolvedSession.error;
        }
        sessionId = resolvedSession.session.id;
      }
      const saved = await api.upsertCustomCommand(parsed.name, {
        content: parsed.content,
        kind: parsed.kind,
        templateVariables: parsed.templateVariables,
        scope: parsed.scope,
        sessionId
      });
      upsertCustomCommandState(saved);
      const savedRecord = normalizeCustomCommandRecord(saved) || normalizeCustomCommandRecord(parsed);
      const savedLabel = savedRecord?.kind === "template" ? "Saved template custom command" : "Saved custom command";
      return `${savedLabel} /${saved.name} (${parsed.mode} · ${formatScopedCustomCommandLabel(savedRecord || saved, sessions)}).`;
    }

    if (command === "settings") {
      if (args.length === 0) {
        return formatUsage("settings");
      }
      const resolvedTarget = resolveActiveOrDirectTargetSession(
        interpreted,
        sessions,
        activeSessionId,
        "No active session for /settings.",
        "Settings selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      const subcommand = normalizeKeyword(args[0]);
      const rest = args.slice(1);

      if (subcommand === "show" && rest.length === 0) {
        return formatSessionSettingsReport(resolvedTarget.session);
      }

      if (subcommand === "startup") {
        const startupSubcommand = normalizeKeyword(rest[0]);
        const startupArgs = rest.slice(1);
        if (!startupSubcommand || startupSubcommand === "show") {
          if (startupArgs.length > 0) {
            return formatUsage("settings", "startup");
          }
          return formatStartupSettingsReport(resolvedTarget.session);
        }
        if (isSessionExited(resolvedTarget.session)) {
          return getBlockedSessionActionMessage([resolvedTarget.session], "Settings update");
        }
        if (startupSubcommand === "cwd") {
          const nextValue = startupArgs.join(" ").trim();
          if (!nextValue) {
            return formatUsage("settings", "startup");
          }
          const patch = {
            startCwd: normalizeKeyword(nextValue) === "clear" ? "" : nextValue
          };
          const updated = await applySessionSettingsPatch(resolvedTarget.session, patch);
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: startCwd.`;
        }
        if (startupSubcommand === "command") {
          const nextValue = startupArgs.join(" ");
          if (!nextValue.trim()) {
            return formatUsage("settings", "startup");
          }
          const patch = {
            startCommand: normalizeKeyword(nextValue) === "clear" ? "" : nextValue
          };
          const updated = await applySessionSettingsPatch(resolvedTarget.session, patch);
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: startCommand.`;
        }
        if (startupSubcommand === "env") {
          const payloadText = startupArgs.join(" ").trim();
          if (!payloadText) {
            return formatUsage("settings", "startup");
          }
          const env = normalizeKeyword(payloadText) === "clear" ? {} : parseJsonObjectToken(payloadText, "Startup env");
          const updated = await applySessionSettingsPatch(resolvedTarget.session, { env });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: env.`;
        }
        if (startupSubcommand === "tags") {
          const payloadText = startupArgs.join(" ").trim();
          if (!payloadText) {
            return formatUsage("settings", "startup");
          }
          const tags = normalizeKeyword(payloadText) === "clear"
            ? []
            : normalizeSessionTags(
                payloadText
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              );
          const updated = await applySessionSettingsPatch(resolvedTarget.session, { tags });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: tags.`;
        }
        if (startupSubcommand === "terminator") {
          if (startupArgs.length !== 1) {
            return formatUsage("settings", "startup");
          }
          const requested = normalizeKeyword(startupArgs[0]);
          const sendTerminatorMode = normalizeSendTerminatorMode(requested);
          if (requested !== sendTerminatorMode) {
            return "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay.";
          }
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {}, sendTerminatorMode);
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: sendTerminator.`;
        }
        return formatUsage("settings", "startup");
      }

      if (subcommand === "note") {
        const noteSubcommand = normalizeKeyword(rest[0]);
        const noteArgs = rest.slice(1);
        if (!noteSubcommand || noteSubcommand === "show") {
          if (noteArgs.length > 0) {
            return formatUsage("settings", "note");
          }
          return formatSessionNoteReport(resolvedTarget.session);
        }
        if (isSessionExited(resolvedTarget.session)) {
          return getBlockedSessionActionMessage([resolvedTarget.session], "Settings update");
        }
        if (noteSubcommand === "set") {
          const note = noteArgs.join(" ").trim();
          if (!note) {
            return formatUsage("settings", "note");
          }
          const updated = await applySessionSettingsPatch(resolvedTarget.session, { note });
          return `Updated note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
        }
        if (noteSubcommand === "clear") {
          if (noteArgs.length !== 0) {
            return formatUsage("settings", "note");
          }
          const updated = await applySessionSettingsPatch(resolvedTarget.session, { note: "" });
          return `Cleared note for [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}.`;
        }
        return formatUsage("settings", "note");
      }

      if (subcommand === "theme") {
        const themeSubcommand = normalizeKeyword(rest[0]);
        const themeArgs = rest.slice(1);
        if (!themeSubcommand || themeSubcommand === "show") {
          if (themeArgs.length > 1) {
            return formatUsage("settings", "theme");
          }
          if (themeArgs.length === 1) {
            return formatThemeSlotReport(resolvedTarget.session, themeArgs[0]);
          }
          return [
            `[${formatSessionToken(resolvedTarget.session.id)}] ${formatSessionDisplayName(resolvedTarget.session)}`,
            formatThemeSlotReport(resolvedTarget.session, "active"),
            formatThemeSlotReport(resolvedTarget.session, "inactive")
          ].join("\n");
        }
        if (isSessionExited(resolvedTarget.session)) {
          return getBlockedSessionActionMessage([resolvedTarget.session], "Settings update");
        }
        if (themeSubcommand === "preset") {
          if (themeArgs.length < 2) {
            return formatUsage("settings", "theme");
          }
          const slot = resolveThemeSlotToken(themeArgs[0]);
          const presetResolution = resolveThemePresetToken(themeArgs.slice(1).join(" "));
          if (!presetResolution.preset) {
            return presetResolution.error;
          }
          const patchKey = getThemeSlotPatchKey(slot);
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {
            [patchKey]: normalizeThemeProfile(presetResolution.preset.profile || defaultTerminalTheme)
          });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.`;
        }
        if (themeSubcommand === "set") {
          if (themeArgs.length !== 3) {
            return formatUsage("settings", "theme");
          }
          const slot = resolveThemeSlotToken(themeArgs[0]);
          const themeKey = resolveThemeProfileKey(themeArgs[1]);
          if (!themeKey) {
            return `Unknown theme key: ${themeArgs[1]}`;
          }
          if (!isValidHexColor(themeArgs[2])) {
            return "Theme value must be a #rrggbb color.";
          }
          const patchKey = getThemeSlotPatchKey(slot);
          const baseProfile = getThemeSlotProfile(resolvedTarget.session, slot);
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {
            [patchKey]: {
              ...baseProfile,
              [themeKey]: themeArgs[2].trim()
            }
          });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.${themeKey}.`;
        }
        if (themeSubcommand === "reset") {
          if (themeArgs.length !== 1) {
            return formatUsage("settings", "theme");
          }
          const slot = resolveThemeSlotToken(themeArgs[0]);
          const patchKey = getThemeSlotPatchKey(slot);
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {
            [patchKey]: normalizeThemeProfile(defaultTerminalTheme)
          });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.`;
        }
        if (themeSubcommand === "import") {
          const parsedImport = parseThemeImportRaw(interpreted.raw);
          if (!parsedImport) {
            return formatUsage("settings", "theme");
          }
          const slot = resolveThemeSlotToken(parsedImport.slot);
          const baseProfile = getThemeSlotProfile(resolvedTarget.session, slot);
          const result = parseExternalThemeProfile(parsedImport.payload, {
            format: parsedImport.format,
            themeProfileKeys,
            defaultThemeProfile: defaultTerminalTheme,
            baseThemeProfile: baseProfile
          });
          if (!result.ok) {
            return result.error;
          }
          const patchKey = getThemeSlotPatchKey(slot);
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {
            [patchKey]: normalizeThemeProfile(result.profile)
          });
          return `Imported ${result.format} theme into [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.`;
        }
        if (themeSubcommand === "export") {
          if (themeArgs.length !== 2) {
            return formatUsage("settings", "theme");
          }
          const slot = resolveThemeSlotToken(themeArgs[0]);
          const result = serializeExternalThemeProfile(getThemeSlotProfile(resolvedTarget.session, slot), {
            format: themeArgs[1],
            name: `${formatSessionDisplayName(resolvedTarget.session) || resolvedTarget.session.id || "ptydeck"} ${slot}`,
            themeProfileKeys,
            defaultThemeProfile: defaultTerminalTheme
          });
          if (!result.ok) {
            return `${result.error} Supported formats: ${formatThemeIoFormats()}.`;
          }
          return result.text;
        }
        return formatUsage("settings", "theme");
      }

      if (subcommand === "input-safety") {
        const safetySubcommand = normalizeKeyword(rest[0]);
        const safetyArgs = rest.slice(1);
        if (!safetySubcommand || safetySubcommand === "show") {
          if (safetyArgs.length > 0) {
            return formatUsage("settings", "input-safety");
          }
          const inputSafetyProfile = normalizeSessionInputSafetyProfile(resolvedTarget.session.inputSafetyProfile);
          return [
            `[${formatSessionToken(resolvedTarget.session.id)}] ${formatSessionDisplayName(resolvedTarget.session)}`,
            `inputSafetyProfile=${JSON.stringify(inputSafetyProfile, null, 2)}`
          ].join("\n");
        }
        if (isSessionExited(resolvedTarget.session)) {
          return getBlockedSessionActionMessage([resolvedTarget.session], "Settings update");
        }
        if (safetySubcommand === "set") {
          if (safetyArgs.length !== 2) {
            return formatUsage("settings", "input-safety");
          }
          const field = resolveInputSafetyField(safetyArgs[0]);
          if (!field) {
            return `Unknown input safety field: ${safetyArgs[0]}. Allowed fields: ${formatInputSafetyFieldList()}.`;
          }
          const currentProfile = normalizeSessionInputSafetyProfile(resolvedTarget.session.inputSafetyProfile);
          const nextProfile = { ...currentProfile };
          if (SESSION_INPUT_SAFETY_BOOLEAN_KEYS.includes(field)) {
            const booleanValue = parseBooleanToken(safetyArgs[1]);
            if (booleanValue === null) {
              return `Invalid boolean value: ${safetyArgs[1]}`;
            }
            nextProfile[field] = booleanValue;
          } else {
            const numericValue = Number(safetyArgs[1]);
            if (!Number.isFinite(numericValue) || numericValue < 0) {
              return `Invalid numeric value: ${safetyArgs[1]}`;
            }
            nextProfile[field] = Math.trunc(numericValue);
          }
          const updated = await applySessionSettingsPatch(resolvedTarget.session, {
            inputSafetyProfile: normalizeSessionInputSafetyProfile(nextProfile)
          });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: inputSafetyProfile.${field}.`;
        }
        return formatUsage("settings", "input-safety");
      }

      if (subcommand === "mouse-forwarding") {
        const mouseSubcommand = normalizeKeyword(rest[0]);
        const mouseArgs = rest.slice(1);
        if (!mouseSubcommand || mouseSubcommand === "show") {
          if (mouseArgs.length > 0) {
            return formatUsage("settings", "mouse-forwarding");
          }
          return [
            `[${formatSessionToken(resolvedTarget.session.id)}] ${formatSessionDisplayName(resolvedTarget.session)}`,
            `mouseForwardingMode=${JSON.stringify(normalizeSessionMouseForwardingMode(resolvedTarget.session.mouseForwardingMode))}`
          ].join("\n");
        }
        if (isSessionExited(resolvedTarget.session)) {
          return getBlockedSessionActionMessage([resolvedTarget.session], "Settings update");
        }
        if (mouseSubcommand === "set") {
          if (mouseArgs.length !== 1) {
            return formatUsage("settings", "mouse-forwarding");
          }
          const mode = normalizeSessionMouseForwardingMode(mouseArgs[0]);
          if (![SESSION_MOUSE_FORWARDING_MODE_OFF, SESSION_MOUSE_FORWARDING_MODE_APPLICATION].includes(mode)) {
            return "Invalid mouse forwarding mode. Allowed values: off, application.";
          }
          const updated = await applySessionSettingsPatch(resolvedTarget.session, { mouseForwardingMode: mode });
          return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: mouseForwardingMode.`;
        }
        return formatUsage("settings", "mouse-forwarding");
      }

      if (subcommand !== "apply") {
        return formatUsage("settings");
      }

      const applyMatch = /^\/settings\s+apply\s+([\s\S]+)$/i.exec(interpreted.raw || "");
      if (!applyMatch) {
        return formatUsage("settings");
      }
      const parsedPayload = parseSettingsPayload(applyMatch[1]);
      if (!parsedPayload.ok) {
        return parsedPayload.error;
      }
      if (isSessionExited(resolvedTarget.session)) {
        return getBlockedSessionActionMessage([resolvedTarget.session], "Settings apply");
      }

      const payload = parsedPayload.payload;
      const allowedKeys = new Set([
        "startCwd",
        "startCommand",
        "env",
        "tags",
        "note",
        "themeProfile",
        "activeThemeProfile",
        "inactiveThemeProfile",
        "sendTerminator",
        "inputSafetyProfile",
        "mouseForwardingMode"
      ]);
      const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key));
      if (unknownKeys.length > 0) {
        return `Unknown settings key(s): ${unknownKeys.join(", ")}`;
      }

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(payload, "startCwd")) {
        patch.startCwd = payload.startCwd;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "startCommand")) {
        patch.startCommand = payload.startCommand;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "env")) {
        patch.env = payload.env;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
        patch.tags = payload.tags;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "note")) {
        patch.note = payload.note;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "themeProfile")) {
        patch.themeProfile = payload.themeProfile;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "activeThemeProfile")) {
        patch.activeThemeProfile = payload.activeThemeProfile;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "inactiveThemeProfile")) {
        patch.inactiveThemeProfile = payload.inactiveThemeProfile;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "inputSafetyProfile")) {
        patch.inputSafetyProfile = normalizeSessionInputSafetyProfile(payload.inputSafetyProfile);
      }
      if (Object.prototype.hasOwnProperty.call(payload, "mouseForwardingMode")) {
        patch.mouseForwardingMode = normalizeSessionMouseForwardingMode(payload.mouseForwardingMode);
      }

      let sendTerminatorMode = null;
      if (Object.prototype.hasOwnProperty.call(payload, "sendTerminator")) {
        const requested = normalizeKeyword(payload.sendTerminator);
        sendTerminatorMode = normalizeSendTerminatorMode(requested);
        if (requested && requested !== sendTerminatorMode) {
          return "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay.";
        }
      }

      const hasPatch = Object.keys(patch).length > 0;
      const hasTerminator = typeof sendTerminatorMode === "string";
      if (!hasPatch && !hasTerminator) {
        return "No applicable settings keys in payload.";
      }

      const updated = await applySessionSettingsPatch(
        resolvedTarget.session,
        patch,
        hasTerminator ? sendTerminatorMode : null
      );
      const appliedKeys = [
        ...Object.keys(patch),
        ...(hasTerminator ? ["sendTerminator"] : [])
      ];
      return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${appliedKeys.join(", ")}.`;
    }

    const allCustomCommands = listNormalizedCustomCommands();
    const candidateCustom = listScopedCustomCommandsByName(allCustomCommands, commandRaw)[0] || null;
    const custom = normalizeCustomCommandRecord(candidateCustom);
    if (custom) {
      const invocation = parseCustomCommandInvocation(interpreted.raw || `/${custom.name}`, custom);
      if (!invocation.ok) {
        return invocation.error;
      }
      const targetResolution = resolveCustomCommandTargets(
        invocation.targetSelector,
        sessions,
        activeSessionId,
        "No active session for custom command execution."
      );
      if (targetResolution.error) {
        return targetResolution.error;
      }
      const targetSessions = targetResolution.sessions;
      const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
      if (blockedSessions.length > 0) {
        return getBlockedSessionActionMessage(blockedSessions, "Custom command execution");
      }
      const rendered = renderCustomCommandForTargets(
        custom.name,
        null,
        targetSessions,
        invocation.parameterAssignments,
        decks,
        allCustomCommands,
        sessions
      );
      if (rendered.error) {
        return rendered.error;
      }
      await Promise.all(
        rendered.entries.map((entry) => {
          const normalizedPayload = normalizeCustomCommandPayloadForShell(entry.text);
          return sendInputWithConfiguredTerminator(
            api.sendInput.bind(api),
            entry.session.id,
            normalizedPayload,
            getSessionSendTerminator(entry.session.id),
            {
              normalizeMode: normalizeSendTerminatorMode,
              delayedSubmitMs
            }
          );
        })
      );
      for (const entry of rendered.entries) {
        const normalizedPayload = normalizeCustomCommandPayloadForShell(entry.text);
        recordCommandSubmission(entry.session.id, {
          source: "custom-command",
          commandName: custom.name,
          label: `/${custom.name}`,
          text: normalizedPayload,
          submittedAt: Date.now()
        });
      }
      if (targetSessions.length === 1) {
        return `Executed /${custom.name} on [${formatSessionToken(targetSessions[0].id)}].`;
      }
      return `Executed /${custom.name} on ${targetSessions.length} sessions.`;
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
