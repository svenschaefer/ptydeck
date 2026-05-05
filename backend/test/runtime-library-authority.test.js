import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeLibraryAuthority } from "../src/runtime-library-authority.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value, fallback = "entry") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function compareNamedEntries(left, right) {
  const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
}

function createLayoutNormalizer({ knownDecks, knownSessions }) {
  return (layout, { hasKnownSession = () => true, resolveSessionDeckId = () => "default" } = {}) => {
    const source = layout && typeof layout === "object" && !Array.isArray(layout) ? layout : {};
    const activeDeckId =
      typeof source.activeDeckId === "string" && knownDecks.has(source.activeDeckId.trim()) ? source.activeDeckId.trim() : "default";
    const deckTerminalSettings = deepClone(source.deckTerminalSettings || {});
    const deckSplitLayouts = {};
    const rawDeckSplitLayouts = source.deckSplitLayouts && typeof source.deckSplitLayouts === "object" ? source.deckSplitLayouts : {};
    for (const [deckId, deckLayout] of Object.entries(rawDeckSplitLayouts)) {
      if (!knownDecks.has(deckId)) {
        continue;
      }
      const normalizedLayout = deckLayout && typeof deckLayout === "object" && !Array.isArray(deckLayout) ? deckLayout : {};
      const paneSessions = {};
      const rawPaneSessions = normalizedLayout.paneSessions && typeof normalizedLayout.paneSessions === "object" ? normalizedLayout.paneSessions : {};
      for (const [paneId, sessionIds] of Object.entries(rawPaneSessions)) {
        paneSessions[paneId] = Array.isArray(sessionIds)
          ? sessionIds.filter((sessionId) => hasKnownSession(sessionId) && resolveSessionDeckId(sessionId) === deckId)
          : [];
      }
      deckSplitLayouts[deckId] = {
        root: deepClone(normalizedLayout.root || { type: "pane", paneId: "main" }),
        paneSessions
      };
    }
    return {
      activeDeckId,
      sidebarVisible: source.sidebarVisible !== false,
      sessionFilterText: typeof source.sessionFilterText === "string" ? source.sessionFilterText : "",
      controlPaneVisible: source.controlPaneVisible !== false,
      controlPanePosition: typeof source.controlPanePosition === "string" ? source.controlPanePosition : "bottom",
      controlPaneSize: Number.isInteger(source.controlPaneSize) ? source.controlPaneSize : 240,
      deckTerminalSettings,
      deckSplitLayouts
    };
  };
}

function createWorkspaceNormalizer({ knownDecks, knownSessions, layoutProfiles }) {
  return (workspace, _options = {}) => {
    const source = workspace && typeof workspace === "object" && !Array.isArray(workspace) ? workspace : {};
    const activeDeckId =
      typeof source.activeDeckId === "string" && knownDecks.has(source.activeDeckId.trim()) ? source.activeDeckId.trim() : "default";
    const requestedLayoutProfileId = typeof source.layoutProfileId === "string" ? source.layoutProfileId.trim() : "";
    const layoutProfileId = requestedLayoutProfileId && layoutProfiles.has(requestedLayoutProfileId) ? requestedLayoutProfileId : "";
    const deckGroups = {};
    const rawDeckGroups = source.deckGroups && typeof source.deckGroups === "object" ? source.deckGroups : {};
    for (const [deckId, deckGroup] of Object.entries(rawDeckGroups)) {
      if (!knownDecks.has(deckId)) {
        continue;
      }
      const normalizedDeckGroup = deckGroup && typeof deckGroup === "object" && !Array.isArray(deckGroup) ? deckGroup : {};
      deckGroups[deckId] = {
        activeGroupId: typeof normalizedDeckGroup.activeGroupId === "string" ? normalizedDeckGroup.activeGroupId : "",
        groups: Array.isArray(normalizedDeckGroup.groups)
          ? normalizedDeckGroup.groups.map((group) => ({
              id: typeof group?.id === "string" ? group.id : "group",
              name: typeof group?.name === "string" ? group.name : "Group",
              sessionIds: Array.isArray(group?.sessionIds)
                ? group.sessionIds.filter((sessionId) => knownSessions.get(sessionId) === deckId)
                : []
            }))
          : []
      };
    }
    const deckSplitLayouts = {};
    const rawDeckSplitLayouts = source.deckSplitLayouts && typeof source.deckSplitLayouts === "object" ? source.deckSplitLayouts : {};
    for (const [deckId, deckLayout] of Object.entries(rawDeckSplitLayouts)) {
      if (!knownDecks.has(deckId)) {
        continue;
      }
      const normalizedLayout = deckLayout && typeof deckLayout === "object" && !Array.isArray(deckLayout) ? deckLayout : {};
      const paneSessions = {};
      const rawPaneSessions = normalizedLayout.paneSessions && typeof normalizedLayout.paneSessions === "object" ? normalizedLayout.paneSessions : {};
      for (const [paneId, sessionIds] of Object.entries(rawPaneSessions)) {
        paneSessions[paneId] = Array.isArray(sessionIds)
          ? sessionIds.filter((sessionId) => knownSessions.get(sessionId) === deckId)
          : [];
      }
      deckSplitLayouts[deckId] = {
        root: deepClone(normalizedLayout.root || { type: "pane", paneId: "main" }),
        paneSessions
      };
    }
    return {
      activeDeckId,
      layoutProfileId,
      controlPaneVisible: source.controlPaneVisible !== false,
      controlPanePosition: typeof source.controlPanePosition === "string" ? source.controlPanePosition : "bottom",
      controlPaneSize: Number.isInteger(source.controlPaneSize) ? source.controlPaneSize : 240,
      deckGroups,
      deckSplitLayouts
    };
  };
}

function createHarness(overrides = {}) {
  const now = overrides.now || 1700000000000;
  const knownDecks = overrides.knownDecks || new Set(["default", "ops"]);
  const knownSessions = overrides.knownSessions || new Map([
    ["session-1", "default"],
    ["session-2", "ops"]
  ]);
  const shareLinks = overrides.shareLinks || new Map();
  const connectionProfiles = overrides.connectionProfiles || new Map();
  const layoutProfiles = overrides.layoutProfiles || new Map();
  const workspacePresets = overrides.workspacePresets || new Map();
  let shareCounter = 1;

  const authority = createRuntimeLibraryAuthority({
    shareLinks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    authDevSecret: "dev-secret",
    authIssuer: "ptydeck",
    authAudience: "ptydeck-users",
    nowFn: () => now,
    createDevTokenImpl: ({ extraClaims }) => `share-token-${extraClaims.shareLinkId}`,
    normalizeShareLinkEntity(input, auth, { strict = true } = {}) {
      const targetType = typeof input?.targetType === "string" ? input.targetType.trim() : "";
      const targetId = typeof input?.targetId === "string" ? input.targetId.trim() : "";
      if (strict && (!targetType || !targetId)) {
        throw new ApiError(400, "ValidationError", "Invalid share target.");
      }
      if (targetType === "session") {
        if (!knownSessions.has(targetId)) {
          throw new ApiError(404, "SessionNotFound", `Session '${targetId}' was not found.`);
        }
      } else if (!knownDecks.has(targetId)) {
        throw new ApiError(404, "DeckNotFound", `Deck '${targetId}' was not found.`);
      }
      const id = `share-${String(shareCounter).padStart(24, "0")}`;
      const tokenId = `token-${shareCounter}`;
      shareCounter += 1;
      const expiresInSeconds = Number.isInteger(input?.expiresInSeconds) ? input.expiresInSeconds : 600;
      return {
        id,
        targetType,
        targetId,
        permissionMode: "read_only",
        tokenId,
        creatorSubject: typeof auth?.subject === "string" ? auth.subject : "",
        creatorTenantId: typeof auth?.tenantId === "string" ? auth.tenantId : "",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + (expiresInSeconds * 1000),
        revokedAt: null
      };
    },
    normalizeConnectionProfileEntity(input, { defaultShell, hasKnownDeck } = {}) {
      const name = typeof input?.name === "string" && input.name.trim() ? input.name.trim() : "Profile";
      const launch = this?.normalizeConnectionProfileLaunch
        ? this.normalizeConnectionProfileLaunch(input?.launch || input, { defaultShell, hasKnownDeck })
        : null;
      return {
        id: typeof input?.id === "string" ? input.id.trim() : "",
        name,
        createdAt: now,
        updatedAt: now,
        launch:
          launch ||
          normalizeConnectionProfileLaunch(input?.launch || input, {
            defaultShell,
            hasKnownDeck
          })
      };
    },
    normalizeConnectionProfileName(value) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized) {
        throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
      }
      return normalized;
    },
    normalizeConnectionProfileLaunch,
    slugifyConnectionProfileId: (value) => slugify(value, "profile"),
    compareConnectionProfileEntries: compareNamedEntries,
    normalizeLayoutProfileName(value) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized) {
        throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
      }
      return normalized;
    },
    normalizeLayoutProfileIdInput(value) {
      return typeof value === "string" ? value.trim().toLowerCase() : "";
    },
    slugifyLayoutProfileId: (value) => slugify(value, "layout"),
    normalizeLayoutProfileLayout: createLayoutNormalizer({ knownDecks, knownSessions }),
    compareLayoutProfileEntries: compareNamedEntries,
    normalizeWorkspacePresetName(value) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized) {
        throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
      }
      return normalized;
    },
    normalizeWorkspacePresetIdInput(value) {
      return typeof value === "string" ? value.trim().toLowerCase() : "";
    },
    slugifyWorkspacePresetId: (value) => slugify(value, "workspace"),
    normalizeWorkspacePresetWorkspace: createWorkspaceNormalizer({ knownDecks, knownSessions, layoutProfiles }),
    hasKnownDeck: (deckId) => knownDecks.has(deckId),
    hasKnownSession: (sessionId) => knownSessions.has(sessionId),
    resolveSessionDeckId: (sessionId) => knownSessions.get(sessionId) || "default"
  });

  return {
    authority,
    knownDecks,
    knownSessions,
    shareLinks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    now
  };
}

function normalizeConnectionProfileLaunch(launch, { defaultShell = "sh", hasKnownDeck = () => true } = {}) {
  const source = launch && typeof launch === "object" && !Array.isArray(launch) ? launch : {};
  const requestedDeckId = typeof source.deckId === "string" ? source.deckId.trim() : "";
  const deckId = requestedDeckId && hasKnownDeck(requestedDeckId) ? requestedDeckId : "default";
  return {
    kind: source.kind === "ssh" ? "ssh" : "local",
    deckId,
    shell: typeof source.shell === "string" && source.shell.trim() ? source.shell.trim() : defaultShell,
    startCwd: typeof source.startCwd === "string" ? source.startCwd : "~",
    startCommand: typeof source.startCommand === "string" ? source.startCommand : "",
    env: source.env && typeof source.env === "object" && !Array.isArray(source.env) ? deepClone(source.env) : {},
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
    ...(source.remoteConnection ? { remoteConnection: deepClone(source.remoteConnection) } : {}),
    ...(source.remoteAuth ? { remoteAuth: deepClone(source.remoteAuth) } : {})
  };
}

test("runtime library authority manages share links with deterministic join urls and persistence ordering", () => {
  const { authority, shareLinks, now } = createHarness();
  shareLinks.set("share-existing", {
    id: "share-existing",
    targetType: "deck",
    targetId: "ops",
    permissionMode: "read_only",
    tokenId: "token-existing",
    creatorSubject: "bob",
    creatorTenantId: "tenant-2",
    createdAt: now - 5000,
    updatedAt: now - 5000,
    expiresAt: now + 600000,
    revokedAt: null
  });

  const created = authority.createShareLink(
    {
      targetType: "session",
      targetId: "session-1",
      expiresInSeconds: 600
    },
    {
      subject: "alice",
      tenantId: "tenant-1"
    },
    {
      headers: {
        origin: "https://ptydeck.local"
      }
    },
    {
      protocol: "https",
      host: "api.ptydeck.local"
    }
  );

  assert.equal(created.id, "share-000000000000000000000001");
  assert.equal(created.joinUrl, "https://ptydeck.local/?share_token=share-token-share-000000000000000000000001");
  assert.equal(created.active, true);
  assert.deepEqual(
    authority.listShareLinks().map((entry) => entry.id),
    ["share-000000000000000000000001", "share-existing"]
  );
  assert.deepEqual(
    authority.listPersistedShareLinks().map((entry) => ({ id: entry.id, tokenId: entry.tokenId })),
    [
      { id: "share-000000000000000000000001", tokenId: "token-1" },
      { id: "share-existing", tokenId: "token-existing" }
    ]
  );

  const revoked = authority.revokeShareLink(created.id);
  assert.equal(revoked.active, false);
  assert.equal(revoked.revokedAt, now);
  assert.equal(authority.getApiShareLinkOrThrow(created.id).active, false);
});

test("runtime library authority manages connection profiles deterministically across create update cleanup and delete", () => {
  const { authority, knownDecks } = createHarness();

  const created = authority.createConnectionProfile({
    name: "Ops SSH",
    launch: {
      kind: "ssh",
      deckId: "ops",
      startCwd: "~/workspace",
      startCommand: "pwd",
      env: { LANG: "en_US.UTF-8" },
      tags: ["ops"],
      remoteConnection: {
        host: "ops.internal",
        port: 22,
        username: "deploy"
      }
    }
  });
  assert.equal(created.id, "ops-ssh");
  assert.equal(created.launch.deckId, "ops");
  assert.equal(created.launch.shell, "sh");

  const duplicate = authority.createConnectionProfile({
    name: "Ops SSH",
    launch: {
      kind: "ssh",
      deckId: "ops"
    }
  });
  assert.equal(duplicate.id, "ops-ssh-2");

  const updated = authority.updateConnectionProfile(created.id, {
    name: "Ops SSH Prod",
    launch: {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCommand: "hostname"
    }
  });
  assert.equal(updated.name, "Ops SSH Prod");
  assert.equal(updated.launch.shell, "ssh");
  assert.equal(updated.launch.startCommand, "hostname");

  knownDecks.delete("ops");
  assert.equal(authority.cleanupConnectionProfiles(), true);
  assert.equal(authority.getConnectionProfileOrThrow(created.id).launch.deckId, "default");
  assert.equal(authority.cleanupConnectionProfiles(), false);

  assert.throws(() => authority.updateConnectionProfile(created.id, {}), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 400);
    assert.equal(error.error, "ValidationError");
    return true;
  });

  const deleted = authority.deleteConnectionProfile(duplicate.id);
  assert.equal(deleted.id, "ops-ssh-2");
  assert.deepEqual(authority.listConnectionProfiles().map((entry) => entry.id), ["ops-ssh"]);
});

test("runtime library authority keeps layout and workspace preset cleanup in sync", () => {
  const { authority, knownDecks, knownSessions } = createHarness();

  const createdLayout = authority.createLayoutProfile({
    name: "Focus Layout",
    layout: {
      activeDeckId: "ops",
      sidebarVisible: true,
      sessionFilterText: "",
      controlPaneVisible: true,
      controlPanePosition: "right",
      controlPaneSize: 320,
      deckTerminalSettings: {
        ops: {
          cols: 132,
          rows: 40
        }
      },
      deckSplitLayouts: {
        ops: {
          root: { type: "pane", paneId: "runner" },
          paneSessions: {
            runner: ["session-2"]
          }
        }
      }
    }
  });
  assert.equal(createdLayout.id, "focus-layout");

  const createdPreset = authority.createWorkspacePreset({
    name: "Ops Workspace",
    workspace: {
      activeDeckId: "ops",
      layoutProfileId: createdLayout.id,
      controlPaneVisible: false,
      controlPanePosition: "bottom",
      controlPaneSize: 260,
      deckGroups: {
        ops: {
          activeGroupId: "runner",
          groups: [
            {
              id: "runner",
              name: "Runner",
              sessionIds: ["session-2"]
            }
          ]
        }
      },
      deckSplitLayouts: {
        ops: {
          root: { type: "pane", paneId: "runner" },
          paneSessions: {
            runner: ["session-2"]
          }
        }
      }
    }
  });
  assert.equal(createdPreset.workspace.layoutProfileId, "focus-layout");

  knownSessions.delete("session-2");
  assert.equal(authority.cleanupLayoutProfiles(), true);
  assert.deepEqual(authority.getLayoutProfileOrThrow(createdLayout.id).layout.deckSplitLayouts.ops.paneSessions.runner, []);

  assert.equal(authority.cleanupWorkspacePresets(), true);
  assert.deepEqual(authority.getWorkspacePresetOrThrow(createdPreset.id).workspace.deckSplitLayouts.ops.paneSessions.runner, []);
  assert.deepEqual(authority.getWorkspacePresetOrThrow(createdPreset.id).workspace.deckGroups.ops.groups[0].sessionIds, []);

  const deletedLayout = authority.deleteLayoutProfile(createdLayout.id);
  assert.equal(deletedLayout.id, createdLayout.id);
  assert.equal(authority.listWorkspacePresets()[0].workspace.layoutProfileId, undefined);

  knownDecks.delete("ops");
  assert.equal(authority.cleanupWorkspacePresets(), true);
  assert.equal(authority.listWorkspacePresets()[0].workspace.activeDeckId, "default");

  const deletedPreset = authority.deleteWorkspacePreset(createdPreset.id);
  assert.equal(deletedPreset.id, createdPreset.id);
  assert.deepEqual(authority.listWorkspacePresets(), []);
});
