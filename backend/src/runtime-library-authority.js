import { createDevToken } from "./auth.js";
import { ApiError } from "./errors.js";

function toApiShareLink(shareLink, options = {}, nowFn = () => Date.now()) {
  const now = nowFn();
  return {
    id: shareLink.id,
    targetType: shareLink.targetType,
    targetId: shareLink.targetId,
    permissionMode: shareLink.permissionMode,
    createdAt: shareLink.createdAt,
    updatedAt: shareLink.updatedAt,
    expiresAt: shareLink.expiresAt,
    revokedAt: shareLink.revokedAt || null,
    creatorSubject: shareLink.creatorSubject,
    creatorTenantId: shareLink.creatorTenantId,
    active: !shareLink.revokedAt && shareLink.expiresAt > now,
    ...(options.joinUrl ? { joinUrl: options.joinUrl } : {})
  };
}

function compareShareLinkEntries(left, right) {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }
  return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createRuntimeLibraryAuthority(dependencies = {}) {
  const {
    shareLinks = new Map(),
    connectionProfiles = new Map(),
    layoutProfiles = new Map(),
    workspacePresets = new Map(),
    authDevSecret = "",
    authIssuer = "ptydeck",
    authAudience = "ptydeck-users",
    defaultShell = "sh",
    normalizeShareLinkEntity = () => null,
    getDeckOrThrow = () => null,
    getApiSessionOrThrow = () => null,
    normalizeConnectionProfileEntity = (value) => value,
    normalizeConnectionProfileName = (value) => value,
    normalizeConnectionProfileLaunch = (value) => value,
    slugifyConnectionProfileId = (value) => value,
    compareConnectionProfileEntries = () => 0,
    normalizeLayoutProfileName = (value) => value,
    normalizeLayoutProfileIdInput = (value) => value,
    slugifyLayoutProfileId = (value) => value,
    normalizeLayoutProfileLayout = (value) => value,
    compareLayoutProfileEntries = () => 0,
    normalizeWorkspacePresetName = (value) => value,
    normalizeWorkspacePresetIdInput = (value) => value,
    slugifyWorkspacePresetId = (value) => value,
    normalizeWorkspacePresetWorkspace = (value) => value,
    hasKnownDeck = () => true,
    hasKnownSession = () => true,
    resolveSessionDeckId = () => "default",
    createDevTokenImpl = createDevToken,
    nowFn = () => Date.now()
  } = dependencies;

  function buildShareLinkBaseUrl(req, requestContext) {
    const requestOrigin = typeof req?.headers?.origin === "string" ? req.headers.origin.trim() : "";
    if (requestOrigin) {
      return requestOrigin;
    }
    const normalizedHost = typeof requestContext?.host === "string" ? requestContext.host.trim() : "";
    const appHost =
      normalizedHost.startsWith("api.") && normalizedHost.length > 4 ? normalizedHost.slice(4) : normalizedHost;
    const protocol = requestContext?.protocol === "https" ? "https" : "http";
    return `${protocol}://${appHost}`;
  }

  function buildShareLinkJoinUrl(shareLink, req, requestContext) {
    const expiresInSeconds = Math.max(1, Math.floor((shareLink.expiresAt - nowFn()) / 1000));
    const accessToken = createDevTokenImpl({
      secret: authDevSecret,
      issuer: authIssuer,
      audience: authAudience,
      subject: `share:${shareLink.id}`,
      tenantId: shareLink.creatorTenantId || "share",
      scopes: ["sessions:read", "ws:connect"],
      ttlSeconds: expiresInSeconds,
      extraClaims: {
        accessMode: "spectator",
        permissionMode: shareLink.permissionMode,
        shareLinkId: shareLink.id,
        shareTargetType: shareLink.targetType,
        shareTargetId: shareLink.targetId,
        shareTokenId: shareLink.tokenId
      }
    });
    const baseUrl = buildShareLinkBaseUrl(req, requestContext);
    return `${baseUrl}/?share_token=${encodeURIComponent(accessToken)}`;
  }

  function getShareLinkOrThrow(shareId) {
    const normalizedShareId = typeof shareId === "string" ? shareId.trim() : "";
    const shareLink = shareLinks.get(normalizedShareId);
    if (!shareLink) {
      throw new ApiError(404, "ShareLinkNotFound", `Share link '${normalizedShareId}' was not found.`);
    }
    return shareLink;
  }

  function listPersistedShareLinks() {
    return Array.from(shareLinks.values())
      .sort(compareShareLinkEntries)
      .map((entry) => ({ ...entry }));
  }

  function listShareLinks() {
    return Array.from(shareLinks.values())
      .sort(compareShareLinkEntries)
      .map((shareLink) => toApiShareLink(shareLink, {}, nowFn));
  }

  function createShareLink(body, auth, req, requestContext) {
    const shareLink = normalizeShareLinkEntity(body, auth, { strict: true });
    shareLinks.set(shareLink.id, shareLink);
    return toApiShareLink(
      shareLink,
      {
        joinUrl: buildShareLinkJoinUrl(shareLink, req, requestContext)
      },
      nowFn
    );
  }

  function getApiShareLinkOrThrow(shareId) {
    return toApiShareLink(getShareLinkOrThrow(shareId), {}, nowFn);
  }

  function revokeShareLink(shareId) {
    const existing = getShareLinkOrThrow(shareId);
    const next = {
      ...existing,
      revokedAt: existing.revokedAt || nowFn(),
      updatedAt: nowFn()
    };
    shareLinks.set(next.id, next);
    return toApiShareLink(next, {}, nowFn);
  }

  function toApiConnectionProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      launch: cloneJson(profile.launch)
    };
  }

  function listConnectionProfiles() {
    return Array.from(connectionProfiles.values()).sort(compareConnectionProfileEntries).map(toApiConnectionProfile);
  }

  function listPersistedConnectionProfiles() {
    return Array.from(connectionProfiles.values()).map(toApiConnectionProfile);
  }

  function getConnectionProfileOrThrow(profileId) {
    const profile = connectionProfiles.get(profileId);
    if (!profile) {
      throw new ApiError(404, "ConnectionProfileNotFound", `Connection profile '${profileId}' was not found.`);
    }
    return profile;
  }

  function createConnectionProfile(body) {
    const candidate = normalizeConnectionProfileEntity(body, {
      strict: true,
      defaultShell,
      hasKnownDeck
    });
    let profileId = candidate.id;
    if (!profileId) {
      const slug = slugifyConnectionProfileId(candidate.name);
      profileId = slug;
      let suffix = 2;
      while (connectionProfiles.has(profileId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "profile";
        profileId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (connectionProfiles.has(profileId)) {
      throw new ApiError(409, "ConnectionProfileAlreadyExists", `Connection profile '${profileId}' already exists.`);
    }
    const profile = {
      ...candidate,
      id: profileId
    };
    connectionProfiles.set(profile.id, profile);
    return toApiConnectionProfile(profile);
  }

  function updateConnectionProfile(profileId, body) {
    const existing = getConnectionProfileOrThrow(profileId);
    const hasName = body?.name !== undefined;
    const hasLaunch = body?.launch !== undefined;
    if (!hasName && !hasLaunch) {
      throw new ApiError(400, "ValidationError", "At least one updatable connection profile field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeConnectionProfileName(body.name) : existing.name,
      launch: hasLaunch
        ? normalizeConnectionProfileLaunch(body.launch, {
            strict: true,
            defaultShell,
            hasKnownDeck
          })
        : existing.launch,
      updatedAt: nowFn()
    };
    connectionProfiles.set(profileId, next);
    return toApiConnectionProfile(next);
  }

  function deleteConnectionProfile(profileId) {
    const profile = getConnectionProfileOrThrow(profileId);
    connectionProfiles.delete(profileId);
    return toApiConnectionProfile(profile);
  }

  function cleanupConnectionProfiles() {
    let changed = false;
    for (const [profileId, profile] of connectionProfiles.entries()) {
      const nextLaunch = normalizeConnectionProfileLaunch(profile.launch, {
        strict: false,
        defaultShell,
        hasKnownDeck
      });
      if (JSON.stringify(nextLaunch) === JSON.stringify(profile.launch)) {
        continue;
      }
      connectionProfiles.set(profileId, {
        ...profile,
        launch: nextLaunch,
        updatedAt: nowFn()
      });
      changed = true;
    }
    return changed;
  }

  function toApiLayoutProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      layout: {
        activeDeckId: profile.layout.activeDeckId,
        sidebarVisible: profile.layout.sidebarVisible,
        sessionFilterText: profile.layout.sessionFilterText,
        controlPaneVisible: profile.layout.controlPaneVisible,
        controlPanePosition: profile.layout.controlPanePosition,
        controlPaneSize: profile.layout.controlPaneSize,
        deckTerminalSettings: cloneJson(profile.layout.deckTerminalSettings),
        deckSplitLayouts: cloneJson(profile.layout.deckSplitLayouts)
      }
    };
  }

  function listLayoutProfiles() {
    return Array.from(layoutProfiles.values()).sort(compareLayoutProfileEntries).map(toApiLayoutProfile);
  }

  function listPersistedLayoutProfiles() {
    return Array.from(layoutProfiles.values()).map(toApiLayoutProfile);
  }

  function getLayoutProfileOrThrow(profileId) {
    const profile = layoutProfiles.get(profileId);
    if (!profile) {
      throw new ApiError(404, "LayoutProfileNotFound", `Layout profile '${profileId}' was not found.`);
    }
    return profile;
  }

  function createLayoutProfile(body) {
    const name = normalizeLayoutProfileName(body?.name);
    const requestedId = normalizeLayoutProfileIdInput(body?.id);
    let profileId = requestedId;
    if (!profileId) {
      const slug = slugifyLayoutProfileId(name);
      profileId = slug;
      let suffix = 2;
      while (layoutProfiles.has(profileId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "layout";
        profileId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (layoutProfiles.has(profileId)) {
      throw new ApiError(409, "LayoutProfileAlreadyExists", `Layout profile '${profileId}' already exists.`);
    }
    const now = nowFn();
    const profile = {
      id: profileId,
      name,
      createdAt: now,
      updatedAt: now,
      layout: normalizeLayoutProfileLayout(body?.layout, {
        strict: true,
        hasKnownSession,
        resolveSessionDeckId
      })
    };
    layoutProfiles.set(profile.id, profile);
    return toApiLayoutProfile(profile);
  }

  function updateLayoutProfile(profileId, body) {
    const existing = getLayoutProfileOrThrow(profileId);
    const hasName = body?.name !== undefined;
    const hasLayout = body?.layout !== undefined;
    if (!hasName && !hasLayout) {
      throw new ApiError(400, "ValidationError", "At least one updatable layout profile field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeLayoutProfileName(body.name) : existing.name,
      layout: hasLayout
        ? normalizeLayoutProfileLayout(body.layout, {
            strict: true,
            hasKnownSession,
            resolveSessionDeckId
          })
        : existing.layout,
      updatedAt: nowFn()
    };
    layoutProfiles.set(profileId, next);
    return toApiLayoutProfile(next);
  }

  function deleteLayoutProfile(profileId) {
    const profile = getLayoutProfileOrThrow(profileId);
    layoutProfiles.delete(profileId);
    cleanupWorkspacePresets();
    return toApiLayoutProfile(profile);
  }

  function cleanupLayoutProfiles() {
    let changed = false;
    for (const [profileId, profile] of layoutProfiles.entries()) {
      const nextLayout = normalizeLayoutProfileLayout(profile.layout, {
        strict: false,
        hasKnownSession,
        resolveSessionDeckId
      });
      if (JSON.stringify(nextLayout) === JSON.stringify(profile.layout)) {
        continue;
      }
      layoutProfiles.set(profileId, {
        ...profile,
        layout: nextLayout,
        updatedAt: nowFn()
      });
      changed = true;
    }
    return changed;
  }

  function compareWorkspacePresetEntries(a, b) {
    const nameCompare = a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
  }

  function toApiWorkspacePreset(preset) {
    return {
      id: preset.id,
      name: preset.name,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
      workspace: {
        activeDeckId: preset.workspace.activeDeckId,
        layoutProfileId: preset.workspace.layoutProfileId || undefined,
        controlPaneVisible: preset.workspace.controlPaneVisible,
        controlPanePosition: preset.workspace.controlPanePosition,
        controlPaneSize: preset.workspace.controlPaneSize,
        deckGroups: cloneJson(preset.workspace.deckGroups),
        deckSplitLayouts: cloneJson(preset.workspace.deckSplitLayouts)
      }
    };
  }

  function listWorkspacePresets() {
    return Array.from(workspacePresets.values()).sort(compareWorkspacePresetEntries).map(toApiWorkspacePreset);
  }

  function listPersistedWorkspacePresets() {
    return Array.from(workspacePresets.values()).map(toApiWorkspacePreset);
  }

  function getWorkspacePresetOrThrow(presetId) {
    const preset = workspacePresets.get(presetId);
    if (!preset) {
      throw new ApiError(404, "WorkspacePresetNotFound", `Workspace preset '${presetId}' was not found.`);
    }
    return preset;
  }

  function createWorkspacePreset(body) {
    const name = normalizeWorkspacePresetName(body?.name);
    const requestedId = normalizeWorkspacePresetIdInput(body?.id);
    let presetId = requestedId;
    if (!presetId) {
      const slug = slugifyWorkspacePresetId(name);
      presetId = slug;
      let suffix = 2;
      while (workspacePresets.has(presetId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "workspace";
        presetId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (workspacePresets.has(presetId)) {
      throw new ApiError(409, "WorkspacePresetAlreadyExists", `Workspace preset '${presetId}' already exists.`);
    }
    const now = nowFn();
    const preset = {
      id: presetId,
      name,
      createdAt: now,
      updatedAt: now,
      workspace: normalizeWorkspacePresetWorkspace(body?.workspace, { strict: true })
    };
    workspacePresets.set(preset.id, preset);
    return toApiWorkspacePreset(preset);
  }

  function updateWorkspacePreset(presetId, body) {
    const existing = getWorkspacePresetOrThrow(presetId);
    const hasName = body?.name !== undefined;
    const hasWorkspace = body?.workspace !== undefined;
    if (!hasName && !hasWorkspace) {
      throw new ApiError(400, "ValidationError", "At least one updatable workspace preset field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeWorkspacePresetName(body.name) : existing.name,
      workspace: hasWorkspace ? normalizeWorkspacePresetWorkspace(body.workspace, { strict: true }) : existing.workspace,
      updatedAt: nowFn()
    };
    workspacePresets.set(presetId, next);
    return toApiWorkspacePreset(next);
  }

  function deleteWorkspacePreset(presetId) {
    const preset = getWorkspacePresetOrThrow(presetId);
    workspacePresets.delete(presetId);
    return toApiWorkspacePreset(preset);
  }

  function cleanupWorkspacePresets() {
    let changed = false;
    for (const [presetId, preset] of workspacePresets.entries()) {
      const nextWorkspace = normalizeWorkspacePresetWorkspace(preset.workspace, { strict: false });
      if (JSON.stringify(nextWorkspace) === JSON.stringify(preset.workspace)) {
        continue;
      }
      workspacePresets.set(presetId, {
        ...preset,
        workspace: nextWorkspace,
        updatedAt: nowFn()
      });
      changed = true;
    }
    return changed;
  }

  return {
    listShareLinks,
    listPersistedShareLinks,
    createShareLink,
    getApiShareLinkOrThrow,
    revokeShareLink,
    toApiConnectionProfile,
    listConnectionProfiles,
    listPersistedConnectionProfiles,
    getConnectionProfileOrThrow,
    createConnectionProfile,
    updateConnectionProfile,
    deleteConnectionProfile,
    cleanupConnectionProfiles,
    toApiLayoutProfile,
    listLayoutProfiles,
    listPersistedLayoutProfiles,
    getLayoutProfileOrThrow,
    createLayoutProfile,
    updateLayoutProfile,
    deleteLayoutProfile,
    cleanupLayoutProfiles,
    toApiWorkspacePreset,
    listWorkspacePresets,
    listPersistedWorkspacePresets,
    getWorkspacePresetOrThrow,
    createWorkspacePreset,
    updateWorkspacePreset,
    deleteWorkspacePreset,
    cleanupWorkspacePresets
  };
}
