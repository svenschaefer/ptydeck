function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function parsePortToken(value, label = "SSH port") {
  const port = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { port: null, error: `${label} must be an integer between 1 and 65535.` };
  }
  return { port, error: "" };
}

function parseSshTargetToken(token, defaultPort = 22) {
  const raw = normalizeText(token);
  if (!raw) {
    return { host: "", port: defaultPort, username: "", error: "SSH target is required." };
  }

  let username = "";
  let hostPort = raw;
  const atIndex = raw.lastIndexOf("@");
  if (atIndex > 0) {
    username = normalizeText(raw.slice(0, atIndex));
    hostPort = normalizeText(raw.slice(atIndex + 1));
  }

  let host = hostPort;
  let port = defaultPort;
  if (hostPort.startsWith("[")) {
    const closingIndex = hostPort.indexOf("]");
    if (closingIndex < 0) {
      return { host: "", port: defaultPort, username, error: "SSH target contains an invalid bracketed host." };
    }
    host = normalizeText(hostPort.slice(1, closingIndex));
    const remainder = normalizeText(hostPort.slice(closingIndex + 1));
    if (remainder) {
      if (!remainder.startsWith(":")) {
        return { host: "", port: defaultPort, username, error: "SSH target contains an invalid bracketed host port suffix." };
      }
      const parsedPort = parsePortToken(remainder.slice(1));
      if (parsedPort.error) {
        return { host: "", port: defaultPort, username, error: parsedPort.error };
      }
      port = parsedPort.port;
    }
  } else {
    const colonIndex = hostPort.lastIndexOf(":");
    if (colonIndex > 0 && colonIndex === hostPort.indexOf(":")) {
      const maybePort = normalizeText(hostPort.slice(colonIndex + 1));
      if (/^\d+$/.test(maybePort)) {
        const parsedPort = parsePortToken(maybePort);
        if (parsedPort.error) {
          return { host: "", port: defaultPort, username, error: parsedPort.error };
        }
        host = normalizeText(hostPort.slice(0, colonIndex));
        port = parsedPort.port;
      }
    }
  }

  if (!host || /\s/.test(host)) {
    return { host: "", port: defaultPort, username, error: "SSH target host must be a non-empty hostname or address without whitespace." };
  }
  if (username && /\s/.test(username)) {
    return { host: "", port: defaultPort, username, error: "SSH target username must not contain whitespace." };
  }

  return { host, port, username, error: "" };
}

export function formatSshTargetSpec(target) {
  const host = normalizeText(target?.host) || "?";
  const port = Number.isInteger(Number(target?.port)) ? Number(target.port) : 22;
  const username = normalizeText(target?.username);
  return `${username ? `${username}@` : ""}${host}:${port}`;
}

function formatSshHostKeyRecord(record, { includeTarget = false } = {}) {
  const targetPrefix = includeTarget ? `${formatSshTargetSpec(record)} ` : "";
  return `${targetPrefix}${record.keyType} · ${record.fingerprintSha256}`;
}

export function parseSshCommandArgs(args = [], options = {}) {
  const defaultPort = Number.isInteger(options.defaultPort) ? options.defaultPort : 22;
  const tokens = Array.isArray(args) ? args : [];
  if (tokens.length === 0) {
    return { ok: false, usage: true, error: "" };
  }

  let targetToken = "";
  let username = "";
  let port = null;
  let authMethod = "privateKey";
  let privateKeyPath = "";
  let deckToken = "";
  let startCwd = "";
  let startCommand = "";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = normalizeText(tokens[index]);
    if (!token) {
      continue;
    }
    if (!token.startsWith("-")) {
      if (targetToken) {
        return { ok: false, usage: false, error: "SSH target can only be specified once." };
      }
      targetToken = token;
      continue;
    }
    const readValue = (label) => {
      const value = normalizeText(tokens[index + 1]);
      if (!value || value.startsWith("-")) {
        return { value: "", error: `${label} value is required.` };
      }
      index += 1;
      return { value, error: "" };
    };
    if (token === "-p" || token === "--port") {
      const next = readValue("SSH port");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      const parsedPort = parsePortToken(next.value);
      if (parsedPort.error) {
        return { ok: false, usage: false, error: parsedPort.error };
      }
      port = parsedPort.port;
      continue;
    }
    if (token === "-l" || token === "--user") {
      const next = readValue("SSH username");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      if (/\s/.test(next.value)) {
        return { ok: false, usage: false, error: "SSH username must not contain whitespace." };
      }
      username = next.value;
      continue;
    }
    if (token === "-i" || token === "--key") {
      const next = readValue("SSH private key path");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      if (authMethod !== "privateKey") {
        return {
          ok: false,
          usage: false,
          error: "SSH auth method flags are mutually exclusive. Use either private-key, password, or keyboard-interactive auth."
        };
      }
      privateKeyPath = next.value;
      continue;
    }
    if (token === "--deck") {
      const next = readValue("SSH deck");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      deckToken = next.value;
      continue;
    }
    if (token === "--cwd") {
      const next = readValue("SSH start directory");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      startCwd = next.value;
      continue;
    }
    if (token === "--command") {
      const next = readValue("SSH startup command");
      if (next.error) {
        return { ok: false, usage: false, error: next.error };
      }
      startCommand = next.value;
      continue;
    }
    if (token === "--password") {
      if (authMethod !== "privateKey" || privateKeyPath) {
        return {
          ok: false,
          usage: false,
          error: "SSH auth method flags are mutually exclusive. Use either private-key, password, or keyboard-interactive auth."
        };
      }
      authMethod = "password";
      continue;
    }
    if (token === "--keyboard-interactive") {
      if (authMethod !== "privateKey" || privateKeyPath) {
        return {
          ok: false,
          usage: false,
          error: "SSH auth method flags are mutually exclusive. Use either private-key, password, or keyboard-interactive auth."
        };
      }
      authMethod = "keyboardInteractive";
      continue;
    }
    return { ok: false, usage: false, error: `Unknown SSH option: ${token}` };
  }

  if (!targetToken) {
    return { ok: false, usage: true, error: "" };
  }

  const parsedTarget = parseSshTargetToken(targetToken, defaultPort);
  if (parsedTarget.error) {
    return { ok: false, usage: false, error: parsedTarget.error };
  }

  return {
    ok: true,
    value: {
      host: parsedTarget.host,
      port: port ?? parsedTarget.port,
      username: username || parsedTarget.username,
      authMethod,
      privateKeyPath,
      deckToken,
      startCwd,
      startCommand
    }
  };
}

export function buildSshConnectionLaunch(spec, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const deckId = normalizeText(options.deckId) || defaultDeckId;
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (value) => value || {};
  const themeProfile = normalizeThemeProfile(options.defaultThemeProfile || {});
  return {
    kind: "ssh",
    deckId,
    shell: "ssh",
    startCwd: normalizeText(spec.startCwd) || "~",
    startCommand: typeof spec.startCommand === "string" ? spec.startCommand : "",
    env: {},
    tags: [],
    themeProfile,
    activeThemeProfile: themeProfile,
    inactiveThemeProfile: themeProfile,
    remoteConnection: {
      host: spec.host,
      port: spec.port,
      ...(normalizeText(spec.username) ? { username: normalizeText(spec.username) } : {})
    },
    remoteAuth: {
      method: spec.authMethod,
      ...(spec.authMethod === "privateKey" && normalizeText(spec.privateKeyPath)
        ? { privateKeyPath: normalizeText(spec.privateKeyPath) }
        : {})
    }
  };
}

export function createCommandExecutorDomainHandlers(options = {}) {
  const defaultDeckId = options.defaultDeckId || "default";
  const normalizeKeyword =
    typeof options.normalizeKeyword === "function"
      ? options.normalizeKeyword
      : (value) => String(value || "").trim().toLowerCase();
  const formatUsage =
    typeof options.formatUsage === "function"
      ? options.formatUsage
      : (commandName, subcommandName = "") => `Usage unavailable: ${commandName}${subcommandName ? ` ${subcommandName}` : ""}`;
  const parseJsonObjectToken =
    typeof options.parseJsonObjectToken === "function"
      ? options.parseJsonObjectToken
      : () => {
          throw new Error("JSON parser unavailable.");
        };
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId, sessions) => (Array.isArray(sessions) ? sessions.find((session) => session.id === sessionId) || null : null);
  const resolveActiveOrDirectTargetSession =
    typeof options.resolveActiveOrDirectTargetSession === "function"
      ? options.resolveActiveOrDirectTargetSession
      : () => ({ error: "Target resolution unavailable.", session: null });

  const listLayoutProfiles = typeof options.listLayoutProfiles === "function" ? options.listLayoutProfiles : () => [];
  const resolveLayoutProfile =
    typeof options.resolveLayoutProfile === "function" ? options.resolveLayoutProfile : () => ({ profile: null, error: "Unknown layout profile." });
  const createLayoutProfileFromCurrent =
    typeof options.createLayoutProfileFromCurrent === "function" ? options.createLayoutProfileFromCurrent : async () => "";
  const applyLayoutProfile = typeof options.applyLayoutProfile === "function" ? options.applyLayoutProfile : async () => "";
  const renameLayoutProfile = typeof options.renameLayoutProfile === "function" ? options.renameLayoutProfile : async () => "";
  const deleteLayoutProfile = typeof options.deleteLayoutProfile === "function" ? options.deleteLayoutProfile : async () => "";

  const listConnectionProfiles = typeof options.listConnectionProfiles === "function" ? options.listConnectionProfiles : () => [];
  const formatConnectionProfileSummary =
    typeof options.formatConnectionProfileSummary === "function" ? options.formatConnectionProfileSummary : () => "";
  const formatConnectionProfileReport =
    typeof options.formatConnectionProfileReport === "function" ? options.formatConnectionProfileReport : () => "";
  const resolveConnectionProfile =
    typeof options.resolveConnectionProfile === "function"
      ? options.resolveConnectionProfile
      : () => ({ profile: null, error: "Unknown connection profile." });
  const createConnectionProfileFromSession =
    typeof options.createConnectionProfileFromSession === "function" ? options.createConnectionProfileFromSession : async () => "";
  const getConnectionProfileDraft =
    typeof options.getConnectionProfileDraft === "function" ? options.getConnectionProfileDraft : () => null;
  const setConnectionProfileDraft =
    typeof options.setConnectionProfileDraft === "function" ? options.setConnectionProfileDraft : () => null;
  const loadConnectionProfileDraftFromActive =
    typeof options.loadConnectionProfileDraftFromActive === "function" ? options.loadConnectionProfileDraftFromActive : () => null;
  const formatConnectionDraftReport =
    typeof options.formatConnectionDraftReport === "function" ? options.formatConnectionDraftReport : () => "No connection profile draft available.";
  const normalizeConnectionProfileLaunch =
    typeof options.normalizeConnectionProfileLaunch === "function" ? options.normalizeConnectionProfileLaunch : () => null;
  const saveConnectionProfileDraft =
    typeof options.saveConnectionProfileDraft === "function" ? options.saveConnectionProfileDraft : async () => "";
  const resetConnectionProfileDraft =
    typeof options.resetConnectionProfileDraft === "function" ? options.resetConnectionProfileDraft : async () => "";
  const applyConnectionProfile =
    typeof options.applyConnectionProfile === "function" ? options.applyConnectionProfile : async () => "";
  const launchConnectionLaunch =
    typeof options.launchConnectionLaunch === "function" ? options.launchConnectionLaunch : async () => "";
  const listSshTrustEntriesForTarget =
    typeof options.listSshTrustEntriesForTarget === "function" ? options.listSshTrustEntriesForTarget : async () => [];
  const probeSshHostKeysForTarget =
    typeof options.probeSshHostKeysForTarget === "function" ? options.probeSshHostKeysForTarget : async () => ({ target: null, candidates: [], feedback: "" });
  const saveSshTrustEntryForTarget =
    typeof options.saveSshTrustEntryForTarget === "function" ? options.saveSshTrustEntryForTarget : async () => ({ target: null, entry: null, feedback: "" });
  const deleteSshTrustEntryForTarget =
    typeof options.deleteSshTrustEntryForTarget === "function" ? options.deleteSshTrustEntryForTarget : async () => ({ target: null, entry: null, feedback: "" });
  const duplicateConnectionProfile =
    typeof options.duplicateConnectionProfile === "function" ? options.duplicateConnectionProfile : async () => "";
  const renameConnectionProfile =
    typeof options.renameConnectionProfile === "function" ? options.renameConnectionProfile : async () => "";
  const deleteConnectionProfile =
    typeof options.deleteConnectionProfile === "function" ? options.deleteConnectionProfile : async () => "";
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (profile) => profile || {};
  const defaultThemeProfile = options.defaultThemeProfile && typeof options.defaultThemeProfile === "object" ? options.defaultThemeProfile : {};

  const listWorkspacePresets = typeof options.listWorkspacePresets === "function" ? options.listWorkspacePresets : () => [];
  const resolveWorkspacePreset =
    typeof options.resolveWorkspacePreset === "function"
      ? options.resolveWorkspacePreset
      : () => ({ preset: null, error: "Unknown workspace preset." });
  const formatWorkspacePresetDetail =
    typeof options.formatWorkspacePresetDetail === "function" ? options.formatWorkspacePresetDetail : () => "";
  const createWorkspacePresetFromCurrent =
    typeof options.createWorkspacePresetFromCurrent === "function" ? options.createWorkspacePresetFromCurrent : async () => "";
  const applyWorkspacePreset = typeof options.applyWorkspacePreset === "function" ? options.applyWorkspacePreset : async () => "";
  const duplicateWorkspacePreset =
    typeof options.duplicateWorkspacePreset === "function" ? options.duplicateWorkspacePreset : async () => "";
  const renameWorkspacePreset =
    typeof options.renameWorkspacePreset === "function" ? options.renameWorkspacePreset : async () => "";
  const deleteWorkspacePreset =
    typeof options.deleteWorkspacePreset === "function" ? options.deleteWorkspacePreset : async () => "";
  const getActiveDeck = typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => null;
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
  const resolveDeckToken =
    typeof options.resolveDeckToken === "function" ? options.resolveDeckToken : () => ({ deck: null, error: "Unknown deck." });
  const formatShareLinkSummary =
    typeof options.formatShareLinkSummary === "function" ? options.formatShareLinkSummary : () => "[unknown] unknown";

  function formatLayoutProfileListEntry(profile) {
    return `[${profile.id}] ${profile.name} -> deck=${profile.layout?.activeDeckId || "default"} filter=${JSON.stringify(profile.layout?.sessionFilterText || "")}`;
  }

  function formatWorkspacePresetListEntry(preset) {
    return `[${preset.id}] ${preset.name} -> deck=${preset.workspace?.activeDeckId || "default"} layout=${preset.workspace?.layoutProfileId || "-"} decks=${Object.keys(preset.workspace?.deckGroups || {}).length}`;
  }

  function formatWorkspaceGroupListEntry(group) {
    return `[${group.id}] ${group.name} -> ${Array.isArray(group.sessionIds) ? group.sessionIds.length : 0} session(s)`;
  }

  async function executeLayoutCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const subcommand = String(args[0] || "").trim().toLowerCase();
    const rest = args.slice(1);

    if (!subcommand || subcommand === "list") {
      const profiles = listLayoutProfiles();
      if (!Array.isArray(profiles) || profiles.length === 0) {
        return "No layout profiles available.";
      }
      return profiles.map((profile) => formatLayoutProfileListEntry(profile)).join("\n");
    }
    if (subcommand === "save") {
      const name = rest.join(" ").trim();
      return name ? createLayoutProfileFromCurrent(name) : formatUsage("layout", "save");
    }
    if (subcommand === "apply") {
      if (rest.length !== 1) {
        return formatUsage("layout", "apply");
      }
      const resolved = resolveLayoutProfile(rest[0]);
      return resolved.profile ? applyLayoutProfile(resolved.profile.id) : resolved.error;
    }
    if (subcommand === "rename") {
      if (rest.length < 2) {
        return formatUsage("layout", "rename");
      }
      const resolved = resolveLayoutProfile(rest[0]);
      if (!resolved.profile) {
        return resolved.error;
      }
      const name = rest.slice(1).join(" ").trim();
      return name ? renameLayoutProfile(resolved.profile.id, name) : formatUsage("layout", "rename");
    }
    if (subcommand === "delete") {
      if (rest.length !== 1) {
        return formatUsage("layout", "delete");
      }
      const resolved = resolveLayoutProfile(rest[0]);
      return resolved.profile ? deleteLayoutProfile(resolved.profile.id) : resolved.error;
    }
    return formatUsage("layout");
  }

  async function executeConnectionCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const activeSessionId = context.activeSessionId || "";
    const subcommand = normalizeKeyword(args[0]);
    const rest = args.slice(1);

    if (!subcommand || subcommand === "list") {
      const profiles = listConnectionProfiles();
      if (!Array.isArray(profiles) || profiles.length === 0) {
        return "No connection profiles available.";
      }
      return profiles.map((profile) => formatConnectionProfileSummary(profile)).join("\n");
    }
    if (subcommand === "new") {
      const name = rest.join(" ").trim();
      if (!name) {
        return formatUsage("connection", "new");
      }
      const activeSession = getSessionById(activeSessionId, sessions);
      setConnectionProfileDraft({
        mode: "blank",
        profileId: "",
        name,
        deckId: activeSession?.deckId || defaultDeckId,
        launch: {}
      });
      return saveConnectionProfileDraft();
    }
    if (subcommand === "save") {
      if (rest.length === 0) {
        return formatUsage("connection", "save");
      }
      const resolvedTarget = resolveActiveOrDirectTargetSession(
        interpreted,
        sessions,
        activeSessionId,
        "No active session to save as a connection profile.",
        "Connection profile session selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      const name = rest.join(" ").trim();
      return name ? createConnectionProfileFromSession(resolvedTarget.session, name) : formatUsage("connection", "save");
    }
    if (subcommand === "show") {
      if (rest.length !== 1) {
        return formatUsage("connection", "show");
      }
      const resolved = resolveConnectionProfile(rest[0]);
      return resolved.profile ? formatConnectionProfileReport(resolved.profile) : resolved.error;
    }
    if (subcommand === "apply") {
      if (rest.length !== 1) {
        return formatUsage("connection", "apply");
      }
      const resolved = resolveConnectionProfile(rest[0]);
      return resolved.profile ? applyConnectionProfile(resolved.profile.id) : resolved.error;
    }
    if (subcommand === "duplicate") {
      if (rest.length < 2) {
        return formatUsage("connection", "duplicate");
      }
      const resolved = resolveConnectionProfile(rest[0]);
      if (!resolved.profile) {
        return resolved.error;
      }
      const name = rest.slice(1).join(" ").trim();
      return name ? duplicateConnectionProfile(resolved.profile.id, name) : formatUsage("connection", "duplicate");
    }
    if (subcommand === "rename") {
      if (rest.length < 2) {
        return formatUsage("connection", "rename");
      }
      const resolved = resolveConnectionProfile(rest[0]);
      if (!resolved.profile) {
        return resolved.error;
      }
      const name = rest.slice(1).join(" ").trim();
      return name ? renameConnectionProfile(resolved.profile.id, name) : formatUsage("connection", "rename");
    }
    if (subcommand === "delete") {
      if (rest.length !== 1) {
        return formatUsage("connection", "delete");
      }
      const resolved = resolveConnectionProfile(rest[0]);
      return resolved.profile ? deleteConnectionProfile(resolved.profile.id) : resolved.error;
    }
    if (subcommand === "draft") {
      const draftSubcommand = normalizeKeyword(rest[0]);
      const draftArgs = rest.slice(1);
      if (!draftSubcommand || draftSubcommand === "show") {
        return draftArgs.length === 0 ? formatConnectionDraftReport(getConnectionProfileDraft()) : formatUsage("connection", "draft");
      }
      if (draftSubcommand === "new") {
        const activeSession = getSessionById(activeSessionId, sessions);
        const name = draftArgs.join(" ").trim() || "New Connection";
        setConnectionProfileDraft({
          mode: "blank",
          profileId: "",
          name,
          deckId: activeSession?.deckId || defaultDeckId,
          launch: {}
        });
        return "Opened a new connection profile draft.";
      }
      if (draftSubcommand === "active") {
        if (draftArgs.length !== 0) {
          return formatUsage("connection", "draft");
        }
        const resolvedTarget = resolveActiveOrDirectTargetSession(
          interpreted,
          sessions,
          activeSessionId,
          "No active session to load into a connection profile draft.",
          "Connection draft selector"
        );
        if (resolvedTarget.error) {
          return resolvedTarget.error;
        }
        loadConnectionProfileDraftFromActive(resolvedTarget.session);
        return "Loaded the active session into a new connection profile draft.";
      }
      if (draftSubcommand === "set") {
        const payloadText = draftArgs.join(" ").trim();
        if (!payloadText) {
          return formatUsage("connection", "draft");
        }
        const launch = normalizeConnectionProfileLaunch(parseJsonObjectToken(payloadText, "Connection draft launch"));
        if (!launch) {
          return "Connection draft launch JSON is incomplete. Required fields: shell, startCwd, activeThemeProfile, inactiveThemeProfile.";
        }
        const currentDraft = getConnectionProfileDraft() || {};
        setConnectionProfileDraft({
          mode: currentDraft.mode || "blank",
          profileId: currentDraft.profileId || "",
          name: currentDraft.name || "New Connection",
          deckId: launch.deckId || currentDraft?.launch?.deckId || defaultDeckId,
          launch
        });
        return "Updated the connection profile draft.";
      }
      if (draftSubcommand === "save") {
        const name = draftArgs.join(" ").trim();
        const currentDraft = getConnectionProfileDraft() || {};
        if (name) {
          setConnectionProfileDraft({
            ...currentDraft,
            name
          });
        }
        return saveConnectionProfileDraft();
      }
      if (draftSubcommand === "reset") {
        return draftArgs.length === 0 ? resetConnectionProfileDraft() : formatUsage("connection", "draft");
      }
      return formatUsage("connection", "draft");
    }
    return formatUsage("connection");
  }

  async function executeSshCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const subcommand = normalizeKeyword(args[0]);
    if (subcommand === "hostkey") {
      return executeSshHostKeyCommand({ ...context, args: args.slice(1) });
    }
    const parsed = parseSshCommandArgs(args);
    if (!parsed.ok) {
      return parsed.usage ? formatUsage("ssh") : parsed.error;
    }
    const activeDeckId = normalizeText(getActiveDeck()?.id) || defaultDeckId;
    let launchDeckId = activeDeckId;
    if (normalizeText(parsed.value.deckToken)) {
      const resolvedDeck = resolveDeckToken(parsed.value.deckToken);
      if (resolvedDeck?.error || !resolvedDeck?.deck) {
        return resolvedDeck?.error || `Unknown deck: ${parsed.value.deckToken}`;
      }
      launchDeckId = normalizeText(resolvedDeck.deck.id) || activeDeckId;
    }
    const launch = normalizeConnectionProfileLaunch(
      buildSshConnectionLaunch(parsed.value, {
        deckId: launchDeckId,
        defaultDeckId,
        defaultThemeProfile,
        normalizeThemeProfile
      })
    );
    if (!launch) {
      return "SSH launch could not be prepared because the default terminal theme is incomplete.";
    }
    return launchConnectionLaunch(launch, {
      name: `SSH ${formatSshTargetSpec(parsed.value)}`,
      seedDraftOnMissingTrust: true
    });
  }

  async function executeSshHostKeyCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const action = normalizeKeyword(args[0]);
    const rest = args.slice(1);
    const parseTarget = (token) => {
      const parsed = parseSshTargetToken(token);
      if (parsed.error) {
        return { target: null, error: parsed.error };
      }
      return {
        target: {
          host: parsed.host,
          port: parsed.port
        },
        error: ""
      };
    };

    if (!action || action === "list") {
      if (rest.length > 1) {
        return formatUsage("ssh", "hostkey");
      }
      if (rest.length === 0) {
        const entries = await listSshTrustEntriesForTarget(null);
        if (!Array.isArray(entries) || entries.length === 0) {
          return "No trusted SSH host keys available.";
        }
        return ["Trusted SSH host keys:"].concat(entries.map((entry) => `- ${formatSshHostKeyRecord(entry, { includeTarget: true })}`)).join("\n");
      }
      const parsedTarget = parseTarget(rest[0]);
      if (parsedTarget.error) {
        return parsedTarget.error;
      }
      const entries = await listSshTrustEntriesForTarget(parsedTarget.target);
      if (!Array.isArray(entries) || entries.length === 0) {
        return `No trusted SSH host keys stored for ${formatSshTargetSpec(parsedTarget.target)}.`;
      }
      return [`Trusted SSH host keys for ${formatSshTargetSpec(parsedTarget.target)}:`]
        .concat(entries.map((entry) => `- ${formatSshHostKeyRecord(entry)}`))
        .join("\n");
    }

    if (action === "probe") {
      if (rest.length !== 1) {
        return formatUsage("ssh", "hostkey");
      }
      const parsedTarget = parseTarget(rest[0]);
      if (parsedTarget.error) {
        return parsedTarget.error;
      }
      const result = await probeSshHostKeysForTarget(parsedTarget.target, { silent: true });
      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      if (candidates.length === 0) {
        return `No SSH host keys were returned for ${formatSshTargetSpec(parsedTarget.target)}.`;
      }
      return [
        `Fetched ${candidates.length} SSH host key(s) for ${formatSshTargetSpec(parsedTarget.target)}:`,
        ...candidates.map((candidate) => `- ${formatSshHostKeyRecord(candidate)}`),
        `Trust one with \`/ssh hostkey trust ${formatSshTargetSpec(parsedTarget.target)} <keyType|fingerprint>\`.`
      ].join("\n");
    }

    if (action === "trust") {
      if (rest.length < 1 || rest.length > 2) {
        return formatUsage("ssh", "hostkey");
      }
      const parsedTarget = parseTarget(rest[0]);
      if (parsedTarget.error) {
        return parsedTarget.error;
      }
      const selector = normalizeText(rest[1]);
      const result = await saveSshTrustEntryForTarget(parsedTarget.target, selector, { silent: true });
      return result?.feedback || `Trusted SSH host key for ${formatSshTargetSpec(parsedTarget.target)}.`;
    }

    if (action === "delete") {
      if (rest.length < 1 || rest.length > 2) {
        return formatUsage("ssh", "hostkey");
      }
      const parsedTarget = parseTarget(rest[0]);
      if (parsedTarget.error) {
        return parsedTarget.error;
      }
      const selector = normalizeText(rest[1]);
      const result = await deleteSshTrustEntryForTarget(parsedTarget.target, selector, { silent: true });
      return result?.feedback || `Deleted trusted SSH host key for ${formatSshTargetSpec(parsedTarget.target)}.`;
    }

    return formatUsage("ssh", "hostkey");
  }

  async function executeWorkspaceCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const subcommand = normalizeKeyword(args[0]);
    const rest = args.slice(1);
    const activeDeckId = String(getActiveDeck()?.id || defaultDeckId).trim() || defaultDeckId;

    if (!subcommand || subcommand === "list") {
      const presets = listWorkspacePresets();
      if (!Array.isArray(presets) || presets.length === 0) {
        return "No workspace presets available.";
      }
      return presets.map((preset) => formatWorkspacePresetListEntry(preset)).join("\n");
    }
    if (subcommand === "save") {
      const name = rest.join(" ").trim();
      return name ? createWorkspacePresetFromCurrent(name) : formatUsage("workspace", "save");
    }
    if (subcommand === "show") {
      if (rest.length !== 1) {
        return formatUsage("workspace", "show");
      }
      const resolved = resolveWorkspacePreset(rest[0]);
      return resolved.preset ? formatWorkspacePresetDetail(resolved.preset) : resolved.error;
    }
    if (subcommand === "apply") {
      if (rest.length !== 1) {
        return formatUsage("workspace", "apply");
      }
      const resolved = resolveWorkspacePreset(rest[0]);
      return resolved.preset ? applyWorkspacePreset(resolved.preset.id) : resolved.error;
    }
    if (subcommand === "duplicate") {
      if (rest.length < 2) {
        return formatUsage("workspace", "duplicate");
      }
      const resolved = resolveWorkspacePreset(rest[0]);
      if (!resolved.preset) {
        return resolved.error;
      }
      const name = rest.slice(1).join(" ").trim();
      return name ? duplicateWorkspacePreset(resolved.preset.id, name) : formatUsage("workspace", "duplicate");
    }
    if (subcommand === "rename") {
      if (rest.length < 2) {
        return formatUsage("workspace", "rename");
      }
      const resolved = resolveWorkspacePreset(rest[0]);
      if (!resolved.preset) {
        return resolved.error;
      }
      const name = rest.slice(1).join(" ").trim();
      return name ? renameWorkspacePreset(resolved.preset.id, name) : formatUsage("workspace", "rename");
    }
    if (subcommand === "delete") {
      if (rest.length !== 1) {
        return formatUsage("workspace", "delete");
      }
      const resolved = resolveWorkspacePreset(rest[0]);
      return resolved.preset ? deleteWorkspacePreset(resolved.preset.id) : resolved.error;
    }
    if (subcommand === "group") {
      const groupSubcommand = String(rest[0] || "").trim().toLowerCase();
      const groupArgs = rest.slice(1);
      if (!groupSubcommand || groupSubcommand === "list") {
        const groups = listWorkspaceGroupsForDeck(activeDeckId);
        if (!Array.isArray(groups) || groups.length === 0) {
          return `No workspace groups on deck [${activeDeckId}].`;
        }
        return [`Deck [${activeDeckId}] workspace groups:`].concat(groups.map((group) => formatWorkspaceGroupListEntry(group))).join("\n");
      }
      if (groupSubcommand === "save") {
        const name = groupArgs.join(" ").trim();
        return name ? saveWorkspaceGroup(name, activeDeckId) : formatUsage("workspace", "group");
      }
      if (groupSubcommand === "apply") {
        if (groupArgs.length !== 1) {
          return formatUsage("workspace", "group");
        }
        const resolved = resolveWorkspaceGroup(groupArgs[0], activeDeckId);
        return resolved.group ? applyWorkspaceGroup(resolved.group.id, activeDeckId) : resolved.error;
      }
      if (groupSubcommand === "rename") {
        if (groupArgs.length < 2) {
          return formatUsage("workspace", "group");
        }
        const resolved = resolveWorkspaceGroup(groupArgs[0], activeDeckId);
        if (!resolved.group) {
          return resolved.error;
        }
        const name = groupArgs.slice(1).join(" ").trim();
        return name ? renameWorkspaceGroup(resolved.group.id, name, activeDeckId) : formatUsage("workspace", "group");
      }
      if (groupSubcommand === "delete") {
        if (groupArgs.length !== 1) {
          return formatUsage("workspace", "group");
        }
        const resolved = resolveWorkspaceGroup(groupArgs[0], activeDeckId);
        return resolved.group ? deleteWorkspaceGroup(resolved.group.id, activeDeckId) : resolved.error;
      }
      if (groupSubcommand === "clear") {
        return groupArgs.length === 0 ? clearWorkspaceGroup(activeDeckId) : formatUsage("workspace", "group");
      }
      return formatUsage("workspace", "group");
    }
    return formatUsage("workspace");
  }

  async function executeBroadcastCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const subcommand = String(args[0] || "").trim().toLowerCase();
    const selector = args.slice(1).join(" ").trim();

    if (!subcommand || subcommand === "status") {
      return getBroadcastStatus();
    }
    if (subcommand === "off") {
      return disableBroadcast();
    }
    if (subcommand === "group") {
      return enableGroupBroadcast(selector);
    }
    return formatUsage("broadcast");
  }

  async function executeShareCommand(context = {}) {
    const args = Array.isArray(context.args) ? context.args : [];
    const interpreted = context.interpreted || {};
    const sessions = Array.isArray(context.sessions) ? context.sessions : [];
    const decks = Array.isArray(context.decks) ? context.decks : [];
    const activeSessionId = context.activeSessionId || "";
    const subcommand = String(args[0] || "").trim().toLowerCase();
    const rest = args.slice(1);

    if (!subcommand || subcommand === "list") {
      const shares = await listShares();
      if (!Array.isArray(shares) || shares.length === 0) {
        return "No share links available.";
      }
      return shares.map((shareLink) => formatShareLinkSummary(shareLink, sessions, decks)).join("\n");
    }
    if (subcommand === "session") {
      if (rest.length > 0) {
        return formatUsage("share", "session");
      }
      const resolvedTarget = resolveActiveOrDirectTargetSession(
        interpreted,
        sessions,
        activeSessionId,
        "No active session for /share session.",
        "Share session selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      const shareLink = await createShareLink({
        targetType: "session",
        targetId: resolvedTarget.session.id,
        permissionMode: "read_only"
      });
      const copied = shareLink?.joinUrl ? await writeClipboardText(shareLink.joinUrl) : false;
      const summary = formatShareLinkSummary(shareLink, sessions, decks);
      return shareLink?.joinUrl ? `${summary}${copied ? "\nCopied join URL to clipboard." : ""}\n${shareLink.joinUrl}` : summary;
    }
    if (subcommand === "deck") {
      if (rest.length > 1) {
        return formatUsage("share", "deck");
      }
      const activeDeck = getActiveDeck();
      if (!activeDeck && rest.length === 0) {
        return "No active deck for /share deck.";
      }
      let targetDeck = activeDeck;
      if (rest.length === 1) {
        const resolvedDeck = resolveDeckToken(rest[0], decks);
        if (!resolvedDeck.deck) {
          return resolvedDeck.error;
        }
        targetDeck = resolvedDeck.deck;
      }
      if (!targetDeck) {
        return "No active deck for /share deck.";
      }
      const shareLink = await createShareLink({
        targetType: "deck",
        targetId: targetDeck.id,
        permissionMode: "read_only"
      });
      const copied = shareLink?.joinUrl ? await writeClipboardText(shareLink.joinUrl) : false;
      const summary = formatShareLinkSummary(shareLink, sessions, decks);
      return shareLink?.joinUrl ? `${summary}${copied ? "\nCopied join URL to clipboard." : ""}\n${shareLink.joinUrl}` : summary;
    }
    if (subcommand === "revoke") {
      if (rest.length !== 1) {
        return formatUsage("share", "revoke");
      }
      const shareId = String(rest[0] || "").trim();
      if (!shareId) {
        return formatUsage("share", "revoke");
      }
      const shareLink = await revokeShareLink(shareId);
      return `Revoked ${formatShareLinkSummary(shareLink, sessions, decks)}.`;
    }
    return formatUsage("share");
  }

  async function executeStructuredCommand(context = {}) {
    switch (context.command) {
      case "layout":
        return executeLayoutCommand(context);
      case "connection":
        return executeConnectionCommand(context);
      case "ssh":
        return executeSshCommand(context);
      case "workspace":
        return executeWorkspaceCommand(context);
      case "broadcast":
        return executeBroadcastCommand(context);
      case "share":
        return executeShareCommand(context);
      default:
        return null;
    }
  }

  return Object.freeze({
    executeStructuredCommand,
    executeLayoutCommand,
    executeConnectionCommand,
    executeSshCommand,
    executeSshHostKeyCommand,
    executeWorkspaceCommand,
    executeBroadcastCommand,
    executeShareCommand
  });
}
