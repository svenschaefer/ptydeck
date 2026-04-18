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
  const duplicateConnectionProfile =
    typeof options.duplicateConnectionProfile === "function" ? options.duplicateConnectionProfile : async () => "";
  const renameConnectionProfile =
    typeof options.renameConnectionProfile === "function" ? options.renameConnectionProfile : async () => "";
  const deleteConnectionProfile =
    typeof options.deleteConnectionProfile === "function" ? options.deleteConnectionProfile : async () => "";

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
    executeWorkspaceCommand,
    executeBroadcastCommand,
    executeShareCommand
  });
}
