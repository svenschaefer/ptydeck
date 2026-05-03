import {
  formatThemeIoFormats,
  parseExternalThemeProfile,
  serializeExternalThemeProfile
} from "./theme-io.js";
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

function normalizeText(value) {
  return String(value || "").trim();
}

function defaultNormalizeKeyword(value) {
  return normalizeText(value).toLowerCase();
}

function defaultParseJsonObjectToken(text, label) {
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

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(normalizeText(value));
}

function parseBooleanToken(value, normalizeKeyword) {
  const normalized = normalizeKeyword(value);
  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return null;
}

function resolveThemeSlotToken(value, normalizeKeyword) {
  return normalizeKeyword(value) === "inactive" ? "inactive" : "active";
}

function resolveThemeProfileKey(value, themeProfileKeys, normalizeKeyword) {
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
  return Array.isArray(themeProfileKeys) && themeProfileKeys.includes(resolved) ? resolved : "";
}

function resolveThemePresetToken(value, terminalThemePresets, normalizeKeyword) {
  const normalized = normalizeKeyword(value);
  if (!normalized) {
    return { preset: null, error: "Theme preset is required." };
  }
  const presets = Array.isArray(terminalThemePresets) ? terminalThemePresets : [];
  const exactId = presets.find((entry) => normalizeKeyword(entry?.id) === normalized) || null;
  if (exactId) {
    return { preset: exactId, error: "" };
  }
  const exactName = presets.find((entry) => normalizeKeyword(entry?.name) === normalized) || null;
  if (exactName) {
    return { preset: exactName, error: "" };
  }
  const matches = presets.filter(
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

function formatThemeSlotReport(session, slot, normalizeThemeProfile, normalizeKeyword) {
  const normalizedSlot = resolveThemeSlotToken(slot, normalizeKeyword);
  const profile = normalizeThemeProfile(
    normalizedSlot === "inactive" ? session?.inactiveThemeProfile || session?.themeProfile : session?.activeThemeProfile || session?.themeProfile
  );
  return `${normalizedSlot}ThemeProfile=${JSON.stringify(profile, null, 2)}`;
}

function getThemeSlotPatchKey(slot, normalizeKeyword) {
  return resolveThemeSlotToken(slot, normalizeKeyword) === "inactive" ? "inactiveThemeProfile" : "activeThemeProfile";
}

function getThemeSlotProfile(session, slot, normalizeThemeProfile, normalizeKeyword) {
  return normalizeThemeProfile(
    resolveThemeSlotToken(slot, normalizeKeyword) === "inactive"
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

function resolveInputSafetyField(value, normalizeKeyword) {
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

export function createCommandExecutorSettingsHandlers(options = {}) {
  const api = options.api || {};
  const formatUsage =
    typeof options.formatUsage === "function"
      ? options.formatUsage
      : (commandName, subcommandName = "") => `Usage unavailable: ${commandName}${subcommandName ? ` ${subcommandName}` : ""}`;
  const normalizeKeyword =
    typeof options.normalizeKeyword === "function" ? options.normalizeKeyword : defaultNormalizeKeyword;
  const parseJsonObjectToken =
    typeof options.parseJsonObjectToken === "function" ? options.parseJsonObjectToken : defaultParseJsonObjectToken;
  const resolveActiveOrDirectTargetSession =
    typeof options.resolveActiveOrDirectTargetSession === "function"
      ? options.resolveActiveOrDirectTargetSession
      : () => ({ error: "Settings target resolution unavailable.", session: null });
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => normalizeText(sessionId);
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => normalizeText(session?.name);
  const normalizeSessionTags =
    typeof options.normalizeSessionTags === "function" ? options.normalizeSessionTags : (tags) => (Array.isArray(tags) ? tags : []);
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (profile) => profile || {};
  const getSessionSendTerminator =
    typeof options.getSessionSendTerminator === "function" ? options.getSessionSendTerminator : () => "auto";
  const setSessionSendTerminator =
    typeof options.setSessionSendTerminator === "function" ? options.setSessionSendTerminator : () => {};
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const parseSettingsPayload =
    typeof options.parseSettingsPayload === "function" ? options.parseSettingsPayload : () => ({ ok: false, error: "Settings payload parser unavailable." });
  const normalizeSendTerminatorMode =
    typeof options.normalizeSendTerminatorMode === "function" ? options.normalizeSendTerminatorMode : (value) => normalizeKeyword(value);
  const isSessionExited = typeof options.isSessionExited === "function" ? options.isSessionExited : () => false;
  const getBlockedSessionActionMessage =
    typeof options.getBlockedSessionActionMessage === "function" ? options.getBlockedSessionActionMessage : () => "Session settings update is unavailable.";
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys : [];
  const defaultTerminalTheme =
    options.defaultTerminalTheme && typeof options.defaultTerminalTheme === "object" ? options.defaultTerminalTheme : {};
  const terminalThemePresets = Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [];

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

  function blockExitedSession(session, actionLabel = "Settings update") {
    if (isSessionExited(session)) {
      return getBlockedSessionActionMessage([session], actionLabel);
    }
    return "";
  }

  async function executeStructuredCommand(context = {}) {
    const command = String(context.command || "").trim().toLowerCase();
    if (command !== "settings") {
      return null;
    }
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = normalizeText(context.activeSessionId);

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
      const blocked = blockExitedSession(resolvedTarget.session);
      if (blocked) {
        return blocked;
      }
      if (startupSubcommand === "cwd") {
        const nextValue = startupArgs.join(" ").trim();
        if (!nextValue) {
          return formatUsage("settings", "startup");
        }
        const updated = await applySessionSettingsPatch(resolvedTarget.session, {
          startCwd: normalizeKeyword(nextValue) === "clear" ? "" : nextValue
        });
        return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: startCwd.`;
      }
      if (startupSubcommand === "command") {
        const nextValue = startupArgs.join(" ");
        if (!nextValue.trim()) {
          return formatUsage("settings", "startup");
        }
        const updated = await applySessionSettingsPatch(resolvedTarget.session, {
          startCommand: normalizeKeyword(nextValue) === "clear" ? "" : nextValue
        });
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
      const blocked = blockExitedSession(resolvedTarget.session);
      if (blocked) {
        return blocked;
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
          return formatThemeSlotReport(resolvedTarget.session, themeArgs[0], normalizeThemeProfile, normalizeKeyword);
        }
        return [
          `[${formatSessionToken(resolvedTarget.session.id)}] ${formatSessionDisplayName(resolvedTarget.session)}`,
          formatThemeSlotReport(resolvedTarget.session, "active", normalizeThemeProfile, normalizeKeyword),
          formatThemeSlotReport(resolvedTarget.session, "inactive", normalizeThemeProfile, normalizeKeyword)
        ].join("\n");
      }
      const blocked = blockExitedSession(resolvedTarget.session);
      if (blocked) {
        return blocked;
      }
      if (themeSubcommand === "preset") {
        if (themeArgs.length < 2) {
          return formatUsage("settings", "theme");
        }
        const slot = resolveThemeSlotToken(themeArgs[0], normalizeKeyword);
        const presetResolution = resolveThemePresetToken(themeArgs.slice(1).join(" "), terminalThemePresets, normalizeKeyword);
        if (!presetResolution.preset) {
          return presetResolution.error;
        }
        const patchKey = getThemeSlotPatchKey(slot, normalizeKeyword);
        const updated = await applySessionSettingsPatch(resolvedTarget.session, {
          [patchKey]: normalizeThemeProfile(presetResolution.preset.profile || defaultTerminalTheme)
        });
        return `Applied settings to [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.`;
      }
      if (themeSubcommand === "set") {
        if (themeArgs.length !== 3) {
          return formatUsage("settings", "theme");
        }
        const slot = resolveThemeSlotToken(themeArgs[0], normalizeKeyword);
        const themeKey = resolveThemeProfileKey(themeArgs[1], themeProfileKeys, normalizeKeyword);
        if (!themeKey) {
          return `Unknown theme key: ${themeArgs[1]}`;
        }
        if (!isValidHexColor(themeArgs[2])) {
          return "Theme value must be a #rrggbb color.";
        }
        const patchKey = getThemeSlotPatchKey(slot, normalizeKeyword);
        const baseProfile = getThemeSlotProfile(resolvedTarget.session, slot, normalizeThemeProfile, normalizeKeyword);
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
        const slot = resolveThemeSlotToken(themeArgs[0], normalizeKeyword);
        const patchKey = getThemeSlotPatchKey(slot, normalizeKeyword);
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
        const slot = resolveThemeSlotToken(parsedImport.slot, normalizeKeyword);
        const baseProfile = getThemeSlotProfile(resolvedTarget.session, slot, normalizeThemeProfile, normalizeKeyword);
        const result = parseExternalThemeProfile(parsedImport.payload, {
          format: parsedImport.format,
          themeProfileKeys,
          defaultThemeProfile: defaultTerminalTheme,
          baseThemeProfile: baseProfile
        });
        if (!result.ok) {
          return result.error;
        }
        const patchKey = getThemeSlotPatchKey(slot, normalizeKeyword);
        const updated = await applySessionSettingsPatch(resolvedTarget.session, {
          [patchKey]: normalizeThemeProfile(result.profile)
        });
        return `Imported ${result.format} theme into [${formatSessionToken(updated.id)}] ${formatSessionDisplayName(updated)}: ${patchKey}.`;
      }
      if (themeSubcommand === "export") {
        if (themeArgs.length !== 2) {
          return formatUsage("settings", "theme");
        }
        const slot = resolveThemeSlotToken(themeArgs[0], normalizeKeyword);
        const result = serializeExternalThemeProfile(
          getThemeSlotProfile(resolvedTarget.session, slot, normalizeThemeProfile, normalizeKeyword),
          {
            format: themeArgs[1],
            name: `${formatSessionDisplayName(resolvedTarget.session) || resolvedTarget.session.id || "ptydeck"} ${slot}`,
            themeProfileKeys,
            defaultThemeProfile: defaultTerminalTheme
          }
        );
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
      const blocked = blockExitedSession(resolvedTarget.session);
      if (blocked) {
        return blocked;
      }
      if (safetySubcommand === "set") {
        if (safetyArgs.length !== 2) {
          return formatUsage("settings", "input-safety");
        }
        const field = resolveInputSafetyField(safetyArgs[0], normalizeKeyword);
        if (!field) {
          return `Unknown input safety field: ${safetyArgs[0]}. Allowed fields: ${formatInputSafetyFieldList()}.`;
        }
        const currentProfile = normalizeSessionInputSafetyProfile(resolvedTarget.session.inputSafetyProfile);
        const nextProfile = { ...currentProfile };
        if (SESSION_INPUT_SAFETY_BOOLEAN_KEYS.includes(field)) {
          const booleanValue = parseBooleanToken(safetyArgs[1], normalizeKeyword);
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
      const blocked = blockExitedSession(resolvedTarget.session);
      if (blocked) {
        return blocked;
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
    const blocked = blockExitedSession(resolvedTarget.session, "Settings apply");
    if (blocked) {
      return blocked;
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

  return {
    executeStructuredCommand
  };
}
