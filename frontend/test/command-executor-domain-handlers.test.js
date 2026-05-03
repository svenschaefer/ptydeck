import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSshConnectionLaunch,
  createCommandExecutorDomainHandlers,
  parseSshCommandArgs
} from "../src/public/command-executor-domain-handlers.js";

test("command executor domain handlers route connection draft commands through extracted hooks", async () => {
  const draftCalls = [];
  let currentDraft = null;
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    getSessionById: (sessionId, sessions) => sessions.find((session) => session.id === sessionId) || null,
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    parseJsonObjectToken: (text) => JSON.parse(text),
    normalizeConnectionProfileLaunch: (launch) => launch,
    resolveActiveOrDirectTargetSession: () => ({ error: "", session: { id: "s-1", deckId: "ops", name: "Ops" } }),
    createConnectionProfileFromSession: async (session, name) => `saved:${session.id}:${name}`,
    setConnectionProfileDraft: (draft) => {
      currentDraft = draft;
      draftCalls.push(draft);
    },
    getConnectionProfileDraft: () => currentDraft,
    saveConnectionProfileDraft: async () => "draft-saved",
    loadConnectionProfileDraftFromActive: () => {
      draftCalls.push("loaded-active");
    }
  });

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["new", "Ops", "Draft"],
      sessions: [{ id: "s-1", deckId: "ops", name: "Ops" }],
      activeSessionId: "s-1"
    }),
    "draft-saved"
  );
  assert.equal(draftCalls[0].deckId, "ops");
  assert.equal(draftCalls[0].name, "Ops Draft");

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["draft", "set", "{\"deckId\":\"dev\",\"shell\":\"bash\",\"startCwd\":\"/tmp\",\"activeThemeProfile\":{},\"inactiveThemeProfile\":{}}"],
      sessions: [],
      activeSessionId: ""
    }),
    "Updated the connection profile draft."
  );
  assert.equal(currentDraft.deckId, "dev");
  assert.equal(currentDraft.launch.shell, "bash");

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["draft", "active"],
      interpreted: {},
      sessions: [{ id: "s-1", deckId: "ops", name: "Ops" }],
      activeSessionId: "s-1"
    }),
    "Loaded the active session into a new connection profile draft."
  );
});

test("command executor domain handlers parse and route one-shot ssh launches deterministically", async () => {
  assert.deepEqual(parseSshCommandArgs([]), { ok: false, usage: true, error: "" });
  assert.deepEqual(parseSshCommandArgs(["ixpqtwnk@carpo.uberspace.de:2222", "--password"]), {
    ok: true,
    value: {
      host: "carpo.uberspace.de",
      port: 2222,
      username: "ixpqtwnk",
      authMethod: "password",
      privateKeyPath: "",
      deckToken: "",
      startCwd: "",
      startCommand: ""
    }
  });
  assert.deepEqual(parseSshCommandArgs(["carpo.uberspace.de", "--deck", "ops", "--cwd", "/srv/app", "--command", "tmux a || tmux"]), {
    ok: true,
    value: {
      host: "carpo.uberspace.de",
      port: 22,
      username: "",
      authMethod: "privateKey",
      privateKeyPath: "",
      deckToken: "ops",
      startCwd: "/srv/app",
      startCommand: "tmux a || tmux"
    }
  });
  assert.equal(
    parseSshCommandArgs(["carpo.uberspace.de", "--keyboard-interactive", "--key", "~/.ssh/id_ed25519"]).error,
    "SSH auth method flags are mutually exclusive. Use either private-key, password, or keyboard-interactive auth."
  );
  assert.equal(parseSshCommandArgs(["carpo.uberspace.de", "--port", "70000"]).error, "SSH port must be an integer between 1 and 65535.");
  assert.equal(parseSshCommandArgs(["carpo.uberspace.de", "--deck"]).error, "SSH deck value is required.");
  assert.equal(parseSshCommandArgs(["carpo.uberspace.de", "--wat"]).error, "Unknown SSH option: --wat");

  assert.deepEqual(
    buildSshConnectionLaunch(
      {
        host: "carpo.uberspace.de",
        port: 22,
        username: "ixpqtwnk",
        authMethod: "privateKey",
        privateKeyPath: "~/.ssh/id_ed25519",
        startCwd: "/srv/app",
        startCommand: "tmux a || tmux"
      },
      {
        deckId: "ops",
        defaultDeckId: "default",
        defaultThemeProfile: { background: "#111111" },
        normalizeThemeProfile: (profile) => profile
      }
    ),
    {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "/srv/app",
      startCommand: "tmux a || tmux",
      env: {},
      tags: [],
      themeProfile: { background: "#111111" },
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#111111" },
      remoteConnection: {
        host: "carpo.uberspace.de",
        port: 22,
        username: "ixpqtwnk"
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "~/.ssh/id_ed25519"
      }
    }
  );

  const launchCalls = [];
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    resolveDeckToken: (token) =>
      token === "infra" ? { deck: { id: "infra", name: "Infra" }, error: "" } : { deck: null, error: `Unknown deck: ${token}` },
    normalizeThemeProfile: (profile) => profile || {},
    defaultThemeProfile: { background: "#111111" },
    normalizeConnectionProfileLaunch: (launch) => launch,
    launchConnectionLaunch: async (launch, launchOptions) => {
      launchCalls.push([launch, launchOptions]);
      return "ssh-launched";
    }
  });

  assert.equal(await handlers.executeSshCommand({ args: [] }), "usage:ssh:");
  assert.equal(await handlers.executeSshCommand({ args: ["carpo.uberspace.de", "--wat"] }), "Unknown SSH option: --wat");
  assert.equal(await handlers.executeSshCommand({ args: ["carpo.uberspace.de", "--deck", "missing"] }), "Unknown deck: missing");
  assert.equal(
    await handlers.executeSshCommand({
      args: [
        "ixpqtwnk@carpo.uberspace.de",
        "--key",
        "~/.ssh/id_ed25519",
        "--deck",
        "infra",
        "--cwd",
        "/srv/app",
        "--command",
        "tmux a || tmux"
      ]
    }),
    "ssh-launched"
  );
  assert.deepEqual(launchCalls, [
    [
      {
        kind: "ssh",
        deckId: "infra",
        shell: "ssh",
        startCwd: "/srv/app",
        startCommand: "tmux a || tmux",
        env: {},
        tags: [],
        themeProfile: { background: "#111111" },
        activeThemeProfile: { background: "#111111" },
        inactiveThemeProfile: { background: "#111111" },
        remoteConnection: {
          host: "carpo.uberspace.de",
          port: 22,
          username: "ixpqtwnk"
        },
        remoteAuth: {
          method: "privateKey",
          privateKeyPath: "~/.ssh/id_ed25519"
        }
      },
      {
        name: "SSH ixpqtwnk@carpo.uberspace.de:22",
        seedDraftOnMissingTrust: true
      }
    ]
  ]);
});

test("command executor domain handlers expose SSH host-key lifecycle commands through extracted seams", async () => {
  const calls = [];
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    listSshTrustEntriesForTarget: async (target) => {
      calls.push(["list", target]);
      if (!target) {
        return [
          {
            id: "trust-rsa",
            host: "carpo.uberspace.de",
            port: 22,
            keyType: "ssh-rsa",
            fingerprintSha256: "SHA256:rsa"
          }
        ];
      }
      return [
        {
          id: "trust-ed25519",
          host: target.host,
          port: target.port,
          keyType: "ssh-ed25519",
          fingerprintSha256: "SHA256:ed25519"
        }
      ];
    },
    probeSshHostKeysForTarget: async (target) => {
      calls.push(["probe", target]);
      return {
        target,
        candidates: [
          {
            id: "probe-rsa",
            host: target.host,
            port: target.port,
            keyType: "ssh-rsa",
            fingerprintSha256: "SHA256:rsa"
          },
          {
            id: "probe-ed25519",
            host: target.host,
            port: target.port,
            keyType: "ssh-ed25519",
            fingerprintSha256: "SHA256:ed25519"
          }
        ]
      };
    },
    saveSshTrustEntryForTarget: async (target, selector, runtimeOptions) => {
      calls.push(["trust", target, selector, runtimeOptions]);
      return {
        target,
        entry: {
          id: "trust-rsa",
          host: target.host,
          port: target.port,
          keyType: "ssh-rsa",
          fingerprintSha256: "SHA256:rsa"
        },
        feedback: `Trusted SSH host key for ${target.host}:${target.port} (ssh-rsa · SHA256:rsa).`
      };
    },
    deleteSshTrustEntryForTarget: async (target, selector, runtimeOptions) => {
      calls.push(["delete", target, selector, runtimeOptions]);
      return {
        target,
        entry: {
          id: "trust-rsa",
          host: target.host,
          port: target.port,
          keyType: "ssh-rsa",
          fingerprintSha256: "SHA256:rsa"
        },
        feedback: `Deleted trusted SSH host key for ${target.host}:${target.port} (ssh-rsa).`
      };
    }
  });

  assert.equal(
    await handlers.executeSshCommand({ args: ["hostkey", "list"] }),
    ["Trusted SSH host keys:", "- carpo.uberspace.de:22 ssh-rsa · SHA256:rsa"].join("\n")
  );
  assert.equal(
    await handlers.executeSshCommand({ args: ["hostkey", "list", "carpo.uberspace.de:22"] }),
    ["Trusted SSH host keys for carpo.uberspace.de:22:", "- ssh-ed25519 · SHA256:ed25519"].join("\n")
  );
  assert.equal(
    await handlers.executeSshCommand({ args: ["hostkey", "probe", "carpo.uberspace.de:22"] }),
    [
      "Fetched 2 SSH host key(s) for carpo.uberspace.de:22:",
      "- ssh-rsa · SHA256:rsa",
      "- ssh-ed25519 · SHA256:ed25519",
      "Trust one with `/ssh hostkey trust carpo.uberspace.de:22 <keyType|fingerprint>`."
    ].join("\n")
  );
  assert.equal(
    await handlers.executeSshCommand({ args: ["hostkey", "trust", "carpo.uberspace.de:22", "ssh-rsa"] }),
    "Trusted SSH host key for carpo.uberspace.de:22 (ssh-rsa · SHA256:rsa)."
  );
  assert.equal(
    await handlers.executeSshCommand({ args: ["hostkey", "delete", "carpo.uberspace.de:22", "ssh-rsa"] }),
    "Deleted trusted SSH host key for carpo.uberspace.de:22 (ssh-rsa)."
  );
  assert.equal(await handlers.executeSshCommand({ args: ["hostkey", "probe"] }), "usage:ssh:hostkey");

  assert.deepEqual(calls, [
    ["list", null],
    ["list", { host: "carpo.uberspace.de", port: 22 }],
    ["probe", { host: "carpo.uberspace.de", port: 22 }],
    ["trust", { host: "carpo.uberspace.de", port: 22 }, "ssh-rsa", { silent: true }],
    ["delete", { host: "carpo.uberspace.de", port: 22 }, "ssh-rsa", { silent: true }]
  ]);
});

test("command executor domain handlers manage workspace and broadcast paths through extracted seams", async () => {
  const calls = [];
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    listWorkspacePresets: () => [
      {
        id: "ops",
        name: "Ops Workspace",
        workspace: { activeDeckId: "ops", layoutProfileId: "focus", deckGroups: { ops: { groups: [{}] } } }
      }
    ],
    resolveWorkspacePreset: (selector) => (selector === "ops" ? { preset: { id: "ops", name: "Ops Workspace" }, error: "" } : { preset: null, error: `Unknown workspace preset: ${selector}` }),
    formatWorkspacePresetDetail: (preset) => `detail:${preset.id}`,
    createWorkspacePresetFromCurrent: async (name) => `saved:${name}`,
    applyWorkspacePreset: async (presetId) => `applied:${presetId}`,
    renameWorkspacePreset: async (presetId, name) => `renamed:${presetId}:${name}`,
    deleteWorkspacePreset: async (presetId) => `deleted:${presetId}`,
    listWorkspaceGroupsForDeck: (deckId) => (deckId === "ops" ? [{ id: "build", name: "Build", sessionIds: ["s-1"] }] : []),
    resolveWorkspaceGroup: (selector, deckId) =>
      selector === "build" && deckId === "ops" ? { group: { id: "build", name: "Build" }, error: "" } : { group: null, error: `Unknown workspace group: ${selector}` },
    saveWorkspaceGroup: async (name, deckId) => `group-saved:${deckId}:${name}`,
    applyWorkspaceGroup: async (groupId, deckId) => `group-applied:${deckId}:${groupId}`,
    renameWorkspaceGroup: async (groupId, name, deckId) => `group-renamed:${deckId}:${groupId}:${name}`,
    deleteWorkspaceGroup: async (groupId, deckId) => `group-deleted:${deckId}:${groupId}`,
    clearWorkspaceGroup: async (deckId) => `group-cleared:${deckId}`,
    getBroadcastStatus: () => "Broadcast: off.",
    enableGroupBroadcast: async (selector) => {
      calls.push(["broadcast-group", selector]);
      return `broadcast:${selector}`;
    },
    disableBroadcast: async () => "Broadcast disabled."
  });

  assert.equal(
    await handlers.executeWorkspaceCommand({ args: ["list"] }),
    "[ops] Ops Workspace -> deck=ops layout=focus decks=1"
  );
  assert.equal(await handlers.executeWorkspaceCommand({ args: ["show", "ops"] }), "detail:ops");
  assert.equal(await handlers.executeWorkspaceCommand({ args: ["group", "apply", "build"] }), "group-applied:ops:build");
  assert.equal(await handlers.executeBroadcastCommand({ args: ["group", "build"] }), "broadcast:build");
  assert.deepEqual(calls, [["broadcast-group", "build"]]);
});

test("command executor domain handlers manage share commands and return null for unrelated commands", async () => {
  const clipboardWrites = [];
  const handlers = createCommandExecutorDomainHandlers({
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    resolveActiveOrDirectTargetSession: () => ({ error: "", session: { id: "s-1", name: "Ops", deckId: "ops" } }),
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    resolveDeckToken: (selector, decks) => ({ deck: decks.find((deck) => deck.id === selector) || null, error: `Unknown deck: ${selector}` }),
    listShares: async () => [],
    createShareLink: async ({ targetType, targetId }) => ({
      id: `${targetType}-${targetId}`,
      targetType,
      targetId,
      permissionMode: "read_only",
      active: true,
      expiresAt: 1700000000000,
      joinUrl: `https://example.invalid/${targetType}/${targetId}`
    }),
    revokeShareLink: async (shareId) => ({
      id: shareId,
      targetType: "deck",
      targetId: "ops",
      permissionMode: "read_only",
      revokedAt: 1700000001000,
      expiresAt: 1700000000000
    }),
    writeClipboardText: async (value) => {
      clipboardWrites.push(value);
      return true;
    },
    formatShareLinkSummary: (shareLink) => `[${shareLink.id}] ${shareLink.targetType}:${shareLink.targetId}`
  });

  const sessions = [{ id: "s-1", name: "Ops", deckId: "ops" }];
  const decks = [{ id: "ops", name: "Ops" }];

  assert.equal(await handlers.executeStructuredCommand({ command: "noop" }), null);
  assert.equal(
    await handlers.executeShareCommand({ args: ["session"], interpreted: {}, sessions, decks, activeSessionId: "s-1" }),
    "[session-s-1] session:s-1\nCopied join URL to clipboard.\nhttps://example.invalid/session/s-1"
  );
  assert.equal(
    await handlers.executeShareCommand({ args: ["deck"], interpreted: {}, sessions, decks, activeSessionId: "s-1" }),
    "[deck-ops] deck:ops\nCopied join URL to clipboard.\nhttps://example.invalid/deck/ops"
  );
  assert.equal(
    await handlers.executeShareCommand({ args: ["revoke", "deck-ops"], sessions, decks }),
    "Revoked [deck-ops] deck:ops."
  );
  assert.deepEqual(clipboardWrites, [
    "https://example.invalid/session/s-1",
    "https://example.invalid/deck/ops"
  ]);
});

test("command executor domain handlers fail closed on malformed connection draft inputs and usage-only branches", async () => {
  let draftSetCount = 0;
  const baseOptions = {
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    parseJsonObjectToken: () => ({ deckId: "ops" }),
    getSessionById: () => null,
    resolveActiveOrDirectTargetSession: (_interpreted, _sessions, _activeSessionId, _missingMessage, selectorLabel) => ({
      error: `${selectorLabel} failed`,
      session: null
    }),
    listConnectionProfiles: () => [],
    resolveConnectionProfile: (selector) => ({ profile: null, error: `Unknown connection profile: ${selector}` }),
    getConnectionProfileDraft: () => ({ mode: "blank", name: "Draft", launch: {} }),
    setConnectionProfileDraft: () => {
      draftSetCount += 1;
    },
    saveConnectionProfileDraft: async () => "draft-saved",
    normalizeConnectionProfileLaunch: () => null
  };

  const handlers = createCommandExecutorDomainHandlers(baseOptions);
  assert.equal(await handlers.executeConnectionCommand({ args: ["list"] }), "No connection profiles available.");
  assert.equal(await handlers.executeConnectionCommand({ args: ["new"] }), "usage:connection:new");
  assert.equal(
    await handlers.executeConnectionCommand({ args: ["save", "Ops"], interpreted: {}, sessions: [], activeSessionId: "" }),
    "Connection profile session selector failed"
  );
  assert.equal(await handlers.executeConnectionCommand({ args: ["duplicate", "ops"] }), "usage:connection:duplicate");
  assert.equal(
    await handlers.executeConnectionCommand({ args: ["rename", "ops", " "] }),
    "Unknown connection profile: ops"
  );
  assert.equal(await handlers.executeConnectionCommand({ args: ["draft", "show", "extra"] }), "usage:connection:draft");
  assert.equal(await handlers.executeConnectionCommand({ args: ["draft", "active", "extra"] }), "usage:connection:draft");
  assert.equal(await handlers.executeConnectionCommand({ args: ["draft", "set"] }), "usage:connection:draft");
  assert.equal(
    await handlers.executeConnectionCommand({ args: ["draft", "set", "{\"deckId\":\"ops\"}"] }),
    "Connection draft launch JSON is incomplete. Required fields: shell, startCwd, activeThemeProfile, inactiveThemeProfile."
  );
  assert.equal(await handlers.executeConnectionCommand({ args: ["draft", "reset", "extra"] }), "usage:connection:draft");
  assert.equal(draftSetCount, 0);

  const invalidJsonHandlers = createCommandExecutorDomainHandlers({
    ...baseOptions,
    parseJsonObjectToken() {
      throw new Error("Connection draft launch JSON is invalid: boom");
    }
  });
  await assert.rejects(
    invalidJsonHandlers.executeConnectionCommand({ args: ["draft", "set", "{"] }),
    /Connection draft launch JSON is invalid: boom/
  );
});

test("command executor domain handlers suppress workspace, share, and broadcast side effects on usage errors", async () => {
  const calls = [];
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    getActiveDeck: () => null,
    listWorkspacePresets: () => [],
    listWorkspaceGroupsForDeck: () => [],
    resolveWorkspacePreset: (selector) => ({ preset: null, error: `Unknown workspace preset: ${selector}` }),
    resolveWorkspaceGroup: (selector) => ({ group: null, error: `Unknown workspace group: ${selector}` }),
    enableGroupBroadcast: async (selector) => {
      calls.push(["broadcast-group", selector]);
      return `broadcast:${selector}`;
    },
    disableBroadcast: async () => {
      calls.push(["broadcast-off"]);
      return "Broadcast disabled.";
    },
    listShares: async () => [],
    resolveActiveOrDirectTargetSession: () => ({ error: "Share session selector failed", session: null }),
    resolveDeckToken: (selector) => ({ deck: null, error: `Unknown deck: ${selector}` }),
    createShareLink: async () => {
      calls.push(["share-create"]);
      return null;
    },
    revokeShareLink: async () => {
      calls.push(["share-revoke"]);
      return null;
    }
  });

  assert.equal(await handlers.executeWorkspaceCommand({ args: ["list"] }), "No workspace presets available.");
  assert.equal(await handlers.executeWorkspaceCommand({ args: ["group", "list"] }), "No workspace groups on deck [default].");
  assert.equal(
    await handlers.executeWorkspaceCommand({ args: ["group", "rename", "missing", "Build"] }),
    "Unknown workspace group: missing"
  );
  assert.equal(await handlers.executeBroadcastCommand({ args: ["wat"] }), "usage:broadcast:");
  assert.equal(await handlers.executeShareCommand({ args: ["list"] }), "No share links available.");
  assert.equal(await handlers.executeShareCommand({ args: ["session", "extra"] }), "usage:share:session");
  assert.equal(await handlers.executeShareCommand({ args: ["session"] }), "Share session selector failed");
  assert.equal(await handlers.executeShareCommand({ args: ["deck"] }), "No active deck for /share deck.");
  assert.equal(
    await handlers.executeShareCommand({ args: ["deck", "ops"], decks: [{ id: "default", name: "Default" }] }),
    "Unknown deck: ops"
  );
  assert.equal(await handlers.executeShareCommand({ args: ["revoke", "   "] }), "usage:share:revoke");
  assert.equal(await handlers.executeShareCommand({ args: ["wat"] }), "usage:share:");
  assert.deepEqual(calls, []);
});
