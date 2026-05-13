import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeStartupRestore } from "../src/runtime-startup-restore.js";
import { normalizePersistedOperatorComposerPlacementEntry } from "../src/runtime-operator-composer-authority.js";

function createHarness(overrides = {}) {
  const startupWarmupCalls = [];
  const syncCalls = [];
  const ensureDefaultDeckCalls = [];
  const replaceTopicBindingCalls = [];
  const setSessionControlStateCalls = [];
  const reconcileCalls = [];
  const restoreAttempts = [];
  const logEntries = [];
  const consoleErrors = [];
  const quickIdAssignments = new Map();

  const decks = new Map([overrides.seedDecks || []]);
  const connectionProfiles = new Map([overrides.seedConnectionProfiles || []]);
  const layoutProfiles = new Map([overrides.seedLayoutProfiles || []]);
  const workspacePresets = new Map([overrides.seedWorkspacePresets || []]);
  const sshTrustEntries = new Map([overrides.seedSshTrustEntries || []]);
  const shareLinks = new Map([overrides.seedShareLinks || []]);
  const operatorComposerPlacements = new Map([overrides.seedOperatorComposerPlacements || []]);
  const telegramTopicBindings = new Map([overrides.seedTelegramTopicBindings || []]);
  const sessionDeckAssignments = new Map([overrides.seedSessionDeckAssignments || []]);
  const sessionQuickIdAssignments = new Map([overrides.seedSessionQuickIdAssignments || []]);
  const sessionControlStates = new Map([overrides.seedSessionControlStates || []]);
  const unrestoredSessions = new Map([overrides.seedUnrestoredSessions || []]);
  const customCommands = new Map([overrides.seedCustomCommands || []]);
  const restoredSessions = new Set(overrides.restoredSessionIds || []);
  const metrics = { sessionsUnrestoredTotal: 0 };

  const persistence = {
    async loadState() {
      return structuredClone(overrides.persistedState || {});
    }
  };

  const startupRestore = createRuntimeStartupRestore({
    persistence,
    sessionReplayPersistMaxChars: overrides.sessionReplayPersistMaxChars || 120,
    startupWarmup: {
      setEnabled(value) {
        startupWarmupCalls.push(value);
      }
    },
    decks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    sshTrustEntries,
    shareLinks,
    operatorComposerPlacements,
    telegramTopicBindings,
    sessionDeckAssignments,
    sessionQuickIdAssignments,
    sessionControlStates,
    unrestoredSessions,
    customCommands,
    manager: {
      list: () => Array.from(restoredSessions, (id) => ({ id }))
    },
    messagingRuntime: {
      replaceTelegramTopicBindings(bindings) {
        replaceTopicBindingCalls.push(bindings.map((entry) => ({ ...entry })));
      }
    },
    normalizeDeckEntity: overrides.normalizeDeckEntity || ((entry) => (entry && entry.id ? { ...entry } : null)),
    normalizeLayoutProfileEntity:
      overrides.normalizeLayoutProfileEntity ||
      ((entry) => (entry && entry.id ? { ...entry } : null)),
    normalizeConnectionProfileEntity:
      overrides.normalizeConnectionProfileEntity ||
      ((entry) => {
        if (!entry || entry.skip) {
          return null;
        }
        return {
          id: entry.id || "",
          name: entry.name || "profile",
          launch: entry.launch || { kind: "local", shell: "sh" }
        };
      }),
    slugifyConnectionProfileId: (value) => String(value || "profile").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "profile",
    normalizeSshTrustEntryEntity:
      overrides.normalizeSshTrustEntryEntity ||
      ((entry) => (entry && entry.id ? { ...entry } : null)),
    findSshTrustConflict: overrides.findSshTrustConflict || (() => null),
    normalizePersistedShareLinkEntity:
      overrides.normalizePersistedShareLinkEntity ||
      ((entry) => (entry && entry.id ? { ...entry } : null)),
    normalizePersistedOperatorComposerPlacementEntry:
      overrides.normalizePersistedOperatorComposerPlacementEntry ||
      ((entry) => (entry && entry.attachmentKey ? { ...entry } : null)),
    normalizeMessagingTopicBindings: overrides.normalizeMessagingTopicBindings || ((value) => (Array.isArray(value) ? value : [])),
    syncSshKnownHostsFile: async () => {
      syncCalls.push("sync");
    },
    ensureDefaultDeck: () => {
      ensureDefaultDeckCalls.push("default");
      if (!decks.has("default")) {
        decks.set("default", { id: "default", name: "Default" });
      }
    },
    logDebug: (event, details) => {
      logEntries.push([event, structuredClone(details)]);
    },
    createLocalOperatorPrincipal: () => ({ type: "local-operator" }),
    setSessionControlState: (sessionId, state, owner) => {
      setSessionControlStateCalls.push([sessionId, structuredClone(state), structuredClone(owner)]);
      sessionControlStates.set(sessionId, { owner, ...(state || {}) });
      return sessionControlStates.get(sessionId);
    },
    normalizeSessionKind: (value) => String(value || "local"),
    normalizeSessionStartupConfig: (value = {}) => ({
      startCwd: value.startCwd || value.fallbackCwd || "/tmp",
      startCommand: value.startCommand || "",
      env: value.env && typeof value.env === "object" ? { ...value.env } : {}
    }),
    normalizeSessionRemoteConnection: (value) => (value ? { ...value } : undefined),
    normalizeSessionRemoteAuth: (value) => (value ? { ...value } : undefined),
    normalizeSessionThemeSlots: (value = {}) => ({
      themeProfile: value.themeProfile || { background: "#000000" },
      activeThemeProfile: value.activeThemeProfile || { background: "#111111" },
      inactiveThemeProfile: value.inactiveThemeProfile || { background: "#222222" }
    }),
    normalizeSessionNote: (value) => (typeof value === "string" ? value : ""),
    normalizeSessionMouseForwardingMode: (value) => value || "auto",
    normalizeSessionInputSafetyProfile: (value) => value || { mode: "prompt" },
    normalizeSessionTags: (value) => (Array.isArray(value) ? [...value] : []),
    normalizeQuickSendUsageEntries: (value) => (Array.isArray(value) ? structuredClone(value) : []),
    assignSessionQuickIdToken: (sessionId, token) => {
      const next = token || `Q-${sessionId}`;
      quickIdAssignments.set(sessionId, next);
      sessionQuickIdAssignments.set(sessionId, next);
      return next;
    },
    deriveTerminalAppIdentityFromSessionHints: ({ kind, shell, startCommand }) => ({
      source: "derived",
      kind,
      shell,
      command: startCommand || ""
    }),
    remoteAuthRequiresSecret:
      overrides.remoteAuthRequiresSecret ||
      ((remoteAuth) => remoteAuth?.method === "password" || remoteAuth?.method === "keyboardInteractive"),
    tryCreateRestoredSession: overrides.tryCreateRestoredSession || ((payload) => {
      restoreAttempts.push({
        sessionId: payload.session.id,
        shell: payload.shell,
        cwd: payload.cwd,
        startCwd: payload.startCwd,
        initialState: payload.initialState,
        replayOutput: payload.replayOutput,
        replayOutputTruncated: payload.replayOutputTruncated === true
      });
      restoredSessions.add(payload.session.id);
      return { id: payload.session.id };
    }),
    listSessionIdsForAuth: overrides.listSessionIdsForAuth || (() => Array.from(new Set([...restoredSessions, ...unrestoredSessions.keys()]))),
    reconcileSessionControllerForSession: (sessionId) => {
      reconcileCalls.push(sessionId);
      return true;
    },
    buildCustomCommandEntry:
      overrides.buildCustomCommandEntry ||
      ((name, entry) => {
        if (!entry || entry.skip) {
          return null;
        }
        return {
          name: String(name || entry.name || ""),
          scope: entry.scope || "project",
          sessionId: entry.sessionId || "",
          content: entry.content || "",
          kind: entry.kind || "plain"
        };
      }),
    buildCustomCommandKey: (name, scope = "", sessionId = "") => `${name}:${scope}:${sessionId}`,
    compareCustomCommandEntries: (left, right) => `${left.name}:${left.scope}:${left.sessionId}`.localeCompare(`${right.name}:${right.scope}:${right.sessionId}`),
    ensureSessionExistsOrThrow: (sessionId) => {
      if (!overrides.knownSessionIds?.has(sessionId) && !restoredSessions.has(sessionId) && !unrestoredSessions.has(sessionId)) {
        throw new Error("missing session");
      }
    },
    normalizeWorkspacePresetEntity:
      overrides.normalizeWorkspacePresetEntity ||
      ((entry) => (entry && entry.id ? { ...entry } : null)),
    cleanupLayoutProfiles: () => {
      logEntries.push(["cleanup.layout", { count: layoutProfiles.size }]);
      return false;
    },
    cleanupConnectionProfiles: () => {
      logEntries.push(["cleanup.connection", { count: connectionProfiles.size }]);
      return false;
    },
    cleanupWorkspacePresets: () => {
      logEntries.push(["cleanup.workspace", { count: workspacePresets.size }]);
      return false;
    },
    hasKnownSession: overrides.hasKnownSession || ((sessionId) => restoredSessions.has(sessionId) || unrestoredSessions.has(sessionId)),
    resolveSessionDeckId: overrides.resolveSessionDeckId || ((sessionId) => sessionDeckAssignments.get(sessionId) || "default"),
    metrics,
    customCommandReservedNames: new Set(["new"]),
    customCommandMaxNameLength: overrides.customCommandMaxNameLength || 32,
    customCommandMaxContentLength: overrides.customCommandMaxContentLength || 8192,
    customCommandMaxCount: overrides.customCommandMaxCount || 256,
    defaultDeckId: "default",
    defaultSshClient: "ssh",
    sessionKindSsh: "ssh",
    defaultShell: "sh",
    nowFn: () => 1700000000000,
    consoleError: (...args) => {
      consoleErrors.push(args);
    }
  });

  return {
    startupRestore,
    decks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    sshTrustEntries,
    shareLinks,
    operatorComposerPlacements,
    telegramTopicBindings,
    sessionDeckAssignments,
    sessionQuickIdAssignments,
    sessionControlStates,
    unrestoredSessions,
    customCommands,
    metrics,
    startupWarmupCalls,
    syncCalls,
    ensureDefaultDeckCalls,
    replaceTopicBindingCalls,
    setSessionControlStateCalls,
    reconcileCalls,
    restoreAttempts,
    logEntries,
    consoleErrors,
    quickIdAssignments,
    restoredSessions
  };
}

test("runtime startup restore normalizes catalogs, topic bindings, and replay outputs deterministically", async () => {
  const harness = createHarness({
    persistedState: {
      sessions: [
        {
          id: "session-1",
          deckId: "ops",
          kind: "local",
          cwd: "/srv/app",
          startCwd: "/srv/app",
          shell: "bash",
          quickIdToken: "A1",
          controlState: { owner: { type: "seed" } },
          quickSendUsage: [{ lookupKey: "build", count: 2 }],
          createdAt: 10,
          updatedAt: 20
        }
      ],
      sessionOutputs: [
        { sessionId: "session-1", data: "tail", truncated: true },
        { sessionId: "skip", data: 5 }
      ],
      decks: [{ id: "ops", name: "Operations" }, { nope: true }],
      connectionProfiles: [{ name: "Ops SSH", launch: { kind: "ssh" } }, { skip: true }],
      layoutProfiles: [{ id: "layout-1" }],
      workspacePresets: [{ id: "workspace-1", name: "Workspace" }],
      sshTrustEntries: [
        { id: "ssh-1", host: "host-1", port: 22, keyType: "ssh-ed25519" },
        { id: "ssh-2", host: "host-2", port: 22, keyType: "ssh-rsa" },
        { id: "ssh-3", host: "host-3", port: 22, keyType: "ssh-rsa" }
      ],
      shareLinks: [{ id: "share-1", targetType: "session", targetId: "session-1" }],
      messagingTelegramTopicBindings: [{ chatId: "100", sessionId: "session-1" }]
    },
    findSshTrustConflict: (entry) => {
      if (entry.id === "ssh-2") {
        return { type: "exact" };
      }
      if (entry.id === "ssh-3") {
        return { type: "conflict" };
      }
      return null;
    }
  });

  const result = await harness.startupRestore.restorePersistedRuntimeState();

  assert.deepEqual(harness.startupWarmupCalls, [true]);
  assert.equal(harness.syncCalls.length, 1);
  assert.equal(harness.ensureDefaultDeckCalls.length, 1);
  assert.deepEqual(result.persistedReplayOutputs.get("session-1"), {
    data: "tail",
    retainedChars: 4,
    retentionLimitChars: 120,
    truncated: true
  });
  assert.deepEqual(Array.from(harness.decks.keys()).sort(), ["default", "ops"]);
  assert.equal(harness.connectionProfiles.has("ops-ssh"), true);
  assert.equal(harness.layoutProfiles.has("layout-1"), true);
  assert.equal(harness.workspacePresets.has("workspace-1"), true);
  assert.deepEqual(Array.from(harness.sshTrustEntries.keys()), ["ssh-1"]);
  assert.equal(harness.shareLinks.has("share-1"), true);
  assert.deepEqual(Array.from(harness.telegramTopicBindings.keys()), ["100:session-1"]);
  assert.deepEqual(harness.replaceTopicBindingCalls.at(-1), [{ chatId: "100", sessionId: "session-1" }]);
  assert.equal(harness.restoreAttempts.length, 1);
  assert.equal(harness.restoreAttempts[0].replayOutput, "tail");
  assert.equal(harness.restoreAttempts[0].replayOutputTruncated, true);
  assert.deepEqual(harness.quickIdAssignments.get("session-1"), "A1");
  assert.equal(harness.consoleErrors.length, 0);
});

test("runtime startup restore rehydrates persisted operator composer placements against known sessions", async () => {
  const harness = createHarness({
    normalizePersistedOperatorComposerPlacementEntry,
    persistedState: {
      sessions: [
        {
          id: "session-1",
          deckId: "default",
          kind: "local",
          cwd: "/srv/app",
          startCwd: "/srv/app",
          shell: "bash",
          quickIdToken: "A1",
          createdAt: 10,
          updatedAt: 20
        }
      ],
      operatorComposerPlacements: [
        {
          attachmentKey: "client-1\u001foperator-1\u001fops\u001foperator\u001f",
          clientId: "client-1",
          subject: "operator-1",
          tenantId: "ops",
          accessMode: "operator",
          permissionMode: "",
          mode: "active-overlay",
          pinnedSessionIds: ["session-1", "missing"],
          sharedDraft: "echo shared",
          pinnedDrafts: {
            "session-1": "pwd",
            missing: "skip me"
          }
        }
      ]
    }
  });

  await harness.startupRestore.restorePersistedRuntimeState();

  assert.equal(harness.operatorComposerPlacements.size, 1);
  assert.deepEqual(harness.operatorComposerPlacements.get("client-1\u001foperator-1\u001fops\u001foperator\u001f"), {
    attachmentKey: "client-1\u001foperator-1\u001fops\u001foperator\u001f",
    clientId: "client-1",
    subject: "operator-1",
    tenantId: "ops",
    accessMode: "operator",
    permissionMode: "",
    mode: "active-overlay",
    pinnedSessionIds: ["session-1"],
    sharedDraft: "echo shared",
    pinnedDrafts: {
      "session-1": "pwd"
    }
  });
});

test("runtime startup restore fails closed for secret-backed and unrecoverable sessions while bounding custom commands", async () => {
  const harness = createHarness({
    persistedState: {
      sessions: [
        {
          id: "ssh-secret",
          deckId: "default",
          kind: "ssh",
          cwd: "~/app",
          startCwd: "~/app",
          shell: "ssh",
          remoteAuth: { method: "password" },
          quickIdToken: "S1",
          createdAt: 10,
          updatedAt: 20
        },
        {
          id: "local-fail",
          deckId: "default",
          kind: "local",
          cwd: "/broken",
          startCwd: "/broken",
          shell: "bash",
          quickIdToken: "F1",
          createdAt: 30,
          updatedAt: 40
        },
        {
          id: "local-ok",
          deckId: "default",
          kind: "local",
          cwd: "/ok",
          startCwd: "/ok",
          shell: "bash",
          quickIdToken: "O1",
          createdAt: 50,
          updatedAt: 60
        }
      ],
      customCommands: [
        { name: "Build", scope: "project", content: "old" },
        { name: "Build", scope: "project", content: "new" },
        { name: "Attach", scope: "session", sessionId: "local-ok", content: "echo ok" },
        { name: "SkipMissing", scope: "session", sessionId: "missing", content: "echo miss" },
        { name: "Third", scope: "project", content: "echo third" },
        { name: "new", scope: "project", content: "reserved" }
      ]
    },
    customCommandMaxCount: 2,
    knownSessionIds: new Set(["local-ok"]),
    tryCreateRestoredSession: (payload) => {
      if (payload.session.id === "local-fail") {
        throw new Error(`failed:${payload.shell}:${payload.startCwd}`);
      }
      harness.restoredSessions.add(payload.session.id);
      harness.restoreAttempts.push({ sessionId: payload.session.id, shell: payload.shell, startCwd: payload.startCwd });
      return { id: payload.session.id };
    },
    listSessionIdsForAuth: () => ["ssh-secret", "local-fail", "local-ok"]
  });

  await harness.startupRestore.restorePersistedRuntimeState();

  assert.equal(harness.unrestoredSessions.has("ssh-secret"), true);
  assert.equal(harness.unrestoredSessions.has("local-fail"), true);
  assert.equal(harness.unrestoredSessions.has("local-ok"), false);
  assert.equal(harness.metrics.sessionsUnrestoredTotal, 1);
  assert.equal(harness.restoreAttempts.filter((entry) => entry.sessionId === "local-fail").length, 0);
  assert.equal(harness.restoreAttempts.filter((entry) => entry.sessionId === "local-ok").length, 1);
  assert.equal(harness.setSessionControlStateCalls.length, 3);
  assert.deepEqual(harness.reconcileCalls, ["ssh-secret", "local-fail", "local-ok"]);
  assert.deepEqual(Array.from(harness.customCommands.keys()).sort(), ["Attach:session:local-ok", "Build:project:"]);
  assert.equal(harness.customCommands.get("Build:project:").content, "new");
  assert.equal(harness.customCommands.get("Attach:session:local-ok").content, "echo ok");
  assert.equal(harness.customCommands.has("Third:project:"), false);
  assert.equal(harness.consoleErrors.length, 1);
  assert.equal(harness.consoleErrors[0][1], "local-fail");
  assert.equal(harness.sessionDeckAssignments.get("ssh-secret"), "default");
  assert.equal(harness.sessionQuickIdAssignments.get("local-ok"), "O1");
});

test("runtime startup restore recreates persisted stopped sessions without launching them", async () => {
  const harness = createHarness({
    persistedState: {
      sessions: [
        {
          id: "stopped-1",
          deckId: "default",
          kind: "ssh",
          state: "stopped",
          cwd: "/srv/app",
          startCwd: "/srv/app",
          shell: "ssh",
          quickIdToken: "S1",
          remoteConnection: { host: "example.internal", port: 22, username: "ops" },
          remoteAuth: { method: "password" },
          createdAt: 10,
          updatedAt: 20
        }
      ]
    }
  });

  await harness.startupRestore.restorePersistedRuntimeState();

  assert.equal(harness.restoreAttempts.length, 1);
  assert.deepEqual(harness.restoreAttempts[0], {
    sessionId: "stopped-1",
    shell: "ssh",
    cwd: "/srv/app",
    startCwd: "/srv/app",
    initialState: "stopped",
    replayOutput: "",
    replayOutputTruncated: false
  });
  assert.equal(harness.unrestoredSessions.has("stopped-1"), false);
  assert.equal(harness.sessionQuickIdAssignments.get("stopped-1"), "S1");
});
