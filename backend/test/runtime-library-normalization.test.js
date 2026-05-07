import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeLibraryNormalization } from "../src/runtime-library-normalization.js";

function createDefaultThemeSlots() {
  const themeProfile = {
    background: "#0a0d12",
    foreground: "#d8dee9",
    cursor: "#8ec07c",
    black: "#0a0d12",
    red: "#fb4934",
    green: "#8ec07c",
    yellow: "#fabd2f",
    blue: "#83a598",
    magenta: "#b48ead",
    cyan: "#8fbcbb",
    white: "#d8dee9",
    brightBlack: "#4b5563",
    brightRed: "#ff6b5a",
    brightGreen: "#a5d68a",
    brightYellow: "#ffd36a",
    brightBlue: "#98b6cc",
    brightMagenta: "#c8a7d8",
    brightCyan: "#a9d9d6",
    brightWhite: "#f5f7fa"
  };
  return {
    themeProfile,
    activeThemeProfile: themeProfile,
    inactiveThemeProfile: themeProfile
  };
}

function createHarness(overrides = {}) {
  const decks = overrides.decks || new Map([
    ["default", { id: "default", name: "Default" }],
    ["ops", { id: "ops", name: "Ops" }]
  ]);
  const layoutProfiles = overrides.layoutProfiles || new Map([
    ["focus", { id: "focus", name: "Focus" }]
  ]);
  const knownSessions = overrides.knownSessions || new Map([
    ["session-1", "default"],
    ["session-2", "ops"],
    ["session-3", "default"]
  ]);
  const randomBytesQueue = overrides.randomBytesQueue || [
    Buffer.from("abcdefghijkl"),
    Buffer.from("mnopqrstuvwx")
  ];
  let randomIndex = 0;

  return createRuntimeLibraryNormalization({
    decks,
    layoutProfiles,
    getDeckOrThrow(deckId) {
      if (!decks.has(deckId)) {
        throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
      }
      return decks.get(deckId);
    },
    getApiSessionOrThrow(sessionId) {
      if (!knownSessions.has(sessionId)) {
        throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
      }
      return { id: sessionId };
    },
    hasKnownSession: (sessionId) => knownSessions.has(sessionId),
    resolveSessionDeckId: (sessionId) => knownSessions.get(sessionId) || "default",
    normalizeSessionKind(value, { strict = true } = {}) {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "local";
      if (normalized === "ssh" || normalized === "local") {
        return normalized;
      }
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'kind' must be 'local' or 'ssh'.");
      }
      return "local";
    },
    normalizeSessionStartupConfig(input = {}, { strict = true } = {}) {
      const fallbackCwd = typeof input.fallbackCwd === "string" && input.fallbackCwd.trim() ? input.fallbackCwd.trim() : "/home/test";
      const startCwd = typeof input.startCwd === "string" && input.startCwd.trim() ? input.startCwd.trim() : fallbackCwd;
      if (!startCwd && strict) {
        throw new ApiError(400, "ValidationError", "Field 'startCwd' must be a non-empty string.");
      }
      return {
        startCwd,
        startCommand: typeof input.startCommand === "string" ? input.startCommand : "",
        env: input.env && typeof input.env === "object" && !Array.isArray(input.env) ? structuredClone(input.env) : {}
      };
    },
    normalizeSessionRemoteConnection(input, kind, { strict = true } = {}) {
      if (kind !== "ssh") {
        return undefined;
      }
      const host = typeof input?.host === "string" ? input.host.trim() : "";
      if (!host && strict) {
        throw new ApiError(400, "ValidationError", "Field 'remoteConnection.host' must be set.");
      }
      if (!host) {
        return undefined;
      }
      return {
        host,
        port: Number.isInteger(input?.port) ? input.port : 22,
        ...(typeof input?.username === "string" && input.username.trim() ? { username: input.username.trim() } : {})
      };
    },
    normalizeSessionRemoteAuth(input, kind) {
      if (kind !== "ssh") {
        return undefined;
      }
      return input && typeof input === "object" && !Array.isArray(input)
        ? {
            method: typeof input.method === "string" && input.method.trim() ? input.method.trim() : "privateKey",
            ...(typeof input.privateKeyPath === "string" && input.privateKeyPath.trim()
              ? { privateKeyPath: input.privateKeyPath.trim() }
              : {})
          }
        : { method: "privateKey" };
    },
    normalizeSessionThemeSlots() {
      return createDefaultThemeSlots();
    },
    normalizeSessionTags(input) {
      return Array.isArray(input)
        ? Array.from(new Set(input.filter((entry) => typeof entry === "string").map((entry) => entry.trim().toLowerCase()).filter(Boolean))).sort()
        : [];
    },
    defaultLocalStartCwd: "/home/test",
    nowFn: overrides.nowFn || (() => 1700000000000),
    randomBytesImpl(size) {
      const next = randomBytesQueue[randomIndex] || Buffer.alloc(size, 0x61 + randomIndex);
      randomIndex += 1;
      return next;
    }
  });
}

test("runtime library normalization builds and sorts custom commands deterministically", () => {
  const normalization = createHarness();

  const template = normalization.buildCustomCommandEntry("Deploy", {
    content: "run {{param:env}} for {{var:session.id}}",
    kind: "template",
    scope: "session",
    sessionId: " session-1 ",
    templateVariables: ["session.id", "session.id"]
  });
  const plain = normalization.buildCustomCommandEntry("Deploy", {
    content: "echo deploy",
    scope: "project"
  });

  assert.equal(template.name, "deploy");
  assert.equal(template.scope, "session");
  assert.equal(template.sessionId, "session-1");
  assert.deepEqual(template.templateVariables, ["session.id"]);
  assert.equal(plain.precedence < template.precedence, true);

  const sorted = [plain, template].sort(normalization.compareCustomCommandEntries);
  assert.deepEqual(sorted.map((entry) => `${entry.scope}:${entry.sessionId || ""}`), [
    "session:session-1",
    "project:"
  ]);

  assert.throws(
    () =>
      normalization.buildCustomCommandEntry("broken", {
        content: "echo nope",
        kind: "plain",
        templateVariables: ["session.id"]
      }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.error, "CustomCommandTemplateVariablesNotAllowed");
      return true;
    }
  );
});

test("runtime library normalization validates custom command edge cases fail-closed", () => {
  const normalization = createHarness();

  assert.equal(
    normalization.buildCustomCommandEntry("missing-session", {
      content: "echo nope",
      scope: "session"
    }, { strict: false }),
    null
  );
  assert.equal(
    normalization.buildCustomCommandEntry("extra-session", {
      content: "echo nope",
      scope: "project",
      sessionId: "session-1"
    }, { strict: false }),
    null
  );
  assert.equal(
    normalization.buildCustomCommandEntry("bad-template", {
      content: "run {{bad}}",
      kind: "template",
      templateVariables: []
    }, { strict: false }),
    null
  );

  assert.throws(
    () =>
      normalization.buildCustomCommandEntry("no-placeholders", {
        content: "echo deploy",
        kind: "template"
      }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.error, "CustomCommandTemplateEmpty");
      return true;
    }
  );

  assert.throws(
    () =>
      normalization.buildCustomCommandEntry("bad-var", {
        content: "run {{var:session.note}}",
        kind: "template",
        templateVariables: []
      }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.error, "CustomCommandTemplateVariableNotAllowed");
      return true;
    }
  );

  assert.equal(normalization.normalizeCustomCommandName(" Deploy "), "deploy");
  assert.equal(normalization.normalizeCustomCommandScope("GLOBAL"), "global");
  assert.equal(normalization.normalizeCustomCommandScope("nonsense"), "project");
  assert.equal(normalization.normalizeCustomCommandSessionId(" session-1 "), "session-1");
  assert.equal(normalization.buildCustomCommandKey("Deploy", "session", " session-1 "), "session:session-1:deploy");
});

test("runtime library normalization shapes decks and connection profiles fail-closed", () => {
  const normalization = createHarness();

  const deck = normalization.normalizeDeckEntity({
    id: "ops",
    settings: ["invalid"]
  });
  assert.deepEqual(deck, {
    id: "ops",
    name: "ops",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    settings: {}
  });
  assert.equal(normalization.slugifyDeckId(" Ops Primary "), "ops-primary");

  const profile = normalization.normalizeConnectionProfileEntity(
    {
      name: "Ops SSH",
      launch: {
        kind: "ssh",
        deckId: "ops",
        remoteConnection: { host: "ops.example.test", username: "alice" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" },
        startCommand: "htop",
        tags: ["Prod", "prod"]
      }
    },
    { defaultShell: "bash" }
  );

  assert.equal(profile.launch.kind, "ssh");
  assert.equal(profile.launch.deckId, "ops");
  assert.equal(profile.launch.shell, "ssh");
  assert.equal(profile.launch.startCwd, "~");
  assert.deepEqual(profile.launch.tags, ["prod"]);
  assert.equal(profile.launch.remoteConnection.host, "ops.example.test");

  const normalizedDeckId = normalization.normalizeConnectionProfileDeckId("missing", { strict: false });
  assert.equal(normalizedDeckId, "default");
});

test("runtime library normalization validates deck and connection-profile boundaries", () => {
  const normalization = createHarness();

  const defaultDeck = normalization.buildDefaultDeck();
  assert.equal(defaultDeck.id, "default");
  assert.equal(defaultDeck.name, "Default");
  assert.deepEqual(defaultDeck.settings, {});

  assert.equal(normalization.normalizeDeckEntity(null), null);
  assert.equal(normalization.compareDeckEntries(
    { id: "ops", createdAt: 2 },
    { id: "default", createdAt: 1 }
  ) > 0, true);
  assert.equal(normalization.slugifyDeckId(" ### "), "deck");
  assert.equal(normalization.slugifyConnectionProfileId(" Ops Primary "), "ops-primary");

  assert.throws(() => normalization.normalizeDeckName("x".repeat(65)), /maximum length/i);
  assert.throws(() => normalization.normalizeDeckSettings([], { strict: true }), /settings/i);
  assert.throws(() => normalization.normalizeDeckIdInput("Invalid Deck"), /pattern/i);
  assert.throws(() => normalization.normalizeConnectionProfileName("x".repeat(65)), /maximum length/i);
  assert.throws(() => normalization.normalizeConnectionProfileIdInput("Invalid Profile"), /pattern/i);

  const fallbackLocalLaunch = normalization.normalizeConnectionProfileLaunch([], {
    strict: false,
    defaultShell: "bash"
  });
  assert.equal(fallbackLocalLaunch.kind, "local");
  assert.equal(fallbackLocalLaunch.deckId, "default");
  assert.equal(fallbackLocalLaunch.shell, "bash");
  assert.equal(fallbackLocalLaunch.startCwd, "/home/test");

  const fallbackSshLaunch = normalization.normalizeConnectionProfileLaunch(
    {
      kind: "ssh",
      deckId: "missing",
      shell: 17,
      remoteConnection: {},
      remoteAuth: {}
    },
    {
      strict: false,
      defaultShell: "bash"
    }
  );
  assert.equal(fallbackSshLaunch.deckId, "default");
  assert.equal(fallbackSshLaunch.shell, "ssh");
  assert.equal(fallbackSshLaunch.remoteConnection, undefined);
  assert.deepEqual(fallbackSshLaunch.remoteAuth, { method: "privateKey" });

  assert.equal(
    normalization.normalizeConnectionProfileEntity({ id: "broken", name: "" }, { strict: false }),
    null
  );
  assert.equal(
    normalization.compareConnectionProfileEntries(
      { id: "b", name: "Alpha", createdAt: 2 },
      { id: "a", name: "Alpha", createdAt: 1 }
    ) > 0,
    true
  );
});

test("runtime library normalization cleans split-layout state for layout profiles", () => {
  const normalization = createHarness();

  const layout = normalization.normalizeLayoutProfileLayout(
    {
      activeDeckId: "ops",
      sidebarVisible: false,
      sessionFilterText: " build ",
      deckTerminalSettings: {
        default: { cols: 120, rows: 30 },
        invalid: { cols: 10, rows: 2 }
      },
      deckSplitLayouts: {
        default: {
          root: {
            type: "row",
            children: [
              { type: "pane", paneId: "main" },
              { type: "pane", paneId: "side" }
            ]
          },
          paneSessions: {
            main: ["session-1", "session-2", "session-1"],
            side: ["session-3", "missing"]
          }
        }
      }
    },
    {
      strict: false,
      hasKnownSession: (sessionId) => ["session-1", "session-2", "session-3"].includes(sessionId),
      resolveSessionDeckId: (sessionId) => (sessionId === "session-2" ? "ops" : "default")
    }
  );

  assert.equal(layout.activeDeckId, "ops");
  assert.equal(layout.sidebarVisible, false);
  assert.equal(layout.sessionFilterText, "build");
  assert.deepEqual(layout.deckTerminalSettings, {
    default: { cols: 120, rows: 30 }
  });
  assert.deepEqual(layout.deckSplitLayouts.default.paneSessions, {
    main: ["session-1"],
    side: ["session-3"]
  });
});

test("runtime library normalization validates layout split-layout and control-pane branches", () => {
  const normalization = createHarness();

  const defaultLayout = normalization.normalizeLayoutProfileLayout(undefined, { strict: false });
  assert.deepEqual(defaultLayout, {
    activeDeckId: "default",
    sidebarVisible: true,
    sessionFilterText: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 240,
    deckTerminalSettings: {},
    deckSplitLayouts: {}
  });
  assert.equal(normalization.slugifyLayoutProfileId(" ### "), "layout");
  assert.equal(normalization.compareLayoutProfileEntries(
    { id: "b", name: "Alpha", createdAt: 2 },
    { id: "a", name: "Alpha", createdAt: 1 }
  ) > 0, true);

  const lenientLayout = normalization.normalizeLayoutProfileLayout(
    {
      activeDeckId: "Invalid Deck",
      sessionFilterText: "x".repeat(300),
      controlPanePosition: "center",
      controlPaneSize: "9999",
      deckTerminalSettings: {
        "Invalid Deck": { cols: 40, rows: 20 },
        default: { cols: 10, rows: 2 }
      },
      deckSplitLayouts: {
        default: {
          root: { type: "pane", paneId: "Invalid Pane" },
          paneSessions: {
            main: ["session-1"]
          }
        }
      }
    },
    { strict: false }
  );
  assert.equal(lenientLayout.activeDeckId, "default");
  assert.equal(lenientLayout.sessionFilterText.length, 256);
  assert.equal(lenientLayout.controlPanePosition, "bottom");
  assert.equal(lenientLayout.controlPaneSize, 240);
  assert.deepEqual(lenientLayout.deckTerminalSettings, {});
  assert.deepEqual(lenientLayout.deckSplitLayouts.default, {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: ["session-1"] }
  });

  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "main" }
              ]
            }
          }
        }
      }),
    /must be unique/i
  );

  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "side" }
              ],
              weights: [0, 1]
            }
          }
        }
      }),
    /positive number/i
  );

  assert.equal(normalization.normalizeLayoutProfileEntity({ id: "not valid" }), null);
});

test("runtime library normalization keeps lenient split-layout fallback branches deterministic", () => {
  const normalization = createHarness();

  const lenientLayout = normalization.normalizeLayoutProfileLayout(
    {
      deckSplitLayouts: {
        "Invalid Deck": {
          root: { type: "pane", paneId: "ignored" }
        },
        default: {
          root: {
            type: "row",
            children: [
              { type: "pane", paneId: null },
              { type: "pane", paneId: "Main" }
            ],
            weights: "invalid"
          },
          paneSessions: {
            main: ["session-1", "session-2", "session-1", 17],
            side: ["session-3"],
            "Invalid Pane": ["session-1"]
          }
        }
      }
    },
    {
      strict: false,
      hasKnownSession: (sessionId) => ["session-1", "session-2", "session-3"].includes(sessionId),
      resolveSessionDeckId: (sessionId) => (sessionId === "session-2" ? "ops" : "default")
    }
  );

  assert.deepEqual(lenientLayout.deckSplitLayouts, {
    default: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["session-1"] }
    }
  });
});

test("runtime library normalization keeps malformed weight and workspace-group fallbacks deterministic in lenient mode", () => {
  const normalization = createHarness();

  const lenientLayout = normalization.normalizeLayoutProfileLayout(
    {
      deckSplitLayouts: {
        default: {
          root: {
            type: "column",
            children: [
              { type: "pane", paneId: "main" },
              { type: "pane", paneId: "side" }
            ],
            weights: [1]
          },
          paneSessions: "invalid"
        }
      }
    },
    { strict: false }
  );
  assert.deepEqual(lenientLayout.deckSplitLayouts.default, {
    root: {
      type: "column",
      children: [
        { type: "pane", paneId: "main" },
        { type: "pane", paneId: "side" }
      ],
      weights: [0.5, 0.5]
    },
    paneSessions: {
      main: [],
      side: []
    }
  });

  const lenientWorkspace = normalization.normalizeWorkspacePresetWorkspace(
    {
      deckGroups: {
        ops: {
          activeGroupId: "missing",
          groups: [
            null,
            { id: "bad id", name: "Deploy", sessionIds: ["session-2", 17, "missing"] },
            { name: "", sessionIds: ["session-2"] },
            { name: "Deploy", sessionIds: ["session-2"] }
          ]
        }
      }
    },
    { strict: false }
  );
  assert.deepEqual(lenientWorkspace.deckGroups, {
    ops: {
      activeGroupId: "",
      groups: [
        {
          id: "deploy",
          name: "Deploy",
          sessionIds: ["session-2"]
        }
      ]
    }
  });
});

test("runtime library normalization rejects duplicate pane session placement and malformed pane assignment arrays in strict mode", () => {
  const normalization = createHarness();

  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "side" }
              ]
            },
            paneSessions: {
              main: ["session-1"],
              side: ["session-1"]
            }
          }
        }
      }),
    /cannot be assigned to multiple panes/i
  );

  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "side" }
              ]
            },
            paneSessions: {
              main: "session-1"
            }
          }
        }
      }),
    /must be an array of session ids/i
  );
});

test("runtime library normalization shapes workspace presets against known decks, sessions, and layouts", () => {
  const normalization = createHarness();

  const preset = normalization.normalizeWorkspacePresetEntity(
    {
      id: "ops-workspace",
      name: " Ops Workspace ",
      workspace: {
        activeDeckId: "ops",
        layoutProfileId: "focus",
        controlPaneVisible: false,
        deckGroups: {
          ops: {
            activeGroupId: "deploy",
            groups: [
              { id: "deploy", name: "Deploy", sessionIds: ["session-2", "session-1", "session-2"] },
              { id: "invalid", name: "Ignore", sessionIds: ["missing"] }
            ]
          },
          missing: {
            groups: []
          }
        },
        deckSplitLayouts: {
          ops: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "logs" }
              ]
            },
            paneSessions: {
              main: ["session-2"],
              logs: ["session-1", "missing"]
            }
          }
        }
      }
    },
    { strict: false }
  );

  assert.equal(preset.name, "Ops Workspace");
  assert.equal(preset.workspace.activeDeckId, "ops");
  assert.equal(preset.workspace.layoutProfileId, "focus");
  assert.equal(preset.workspace.controlPaneVisible, false);
  assert.deepEqual(preset.workspace.deckGroups, {
    ops: {
      activeGroupId: "deploy",
      groups: [
        { id: "deploy", name: "Deploy", sessionIds: ["session-2"] },
        { id: "invalid", name: "Ignore", sessionIds: [] }
      ]
    }
  });
  assert.deepEqual(preset.workspace.deckSplitLayouts.ops.paneSessions, {
    main: ["session-2"],
    logs: []
  });
});

test("runtime library normalization validates workspace preset fallbacks and branch guards", () => {
  const normalization = createHarness();

  assert.equal(normalization.slugifyWorkspacePresetId(" ### "), "workspace");
  assert.equal(
    normalization.compareWorkspacePresetEntries(
      { id: "b", name: "Alpha", createdAt: 2 },
      { id: "a", name: "Alpha", createdAt: 1 }
    ) > 0,
    true
  );

  const defaultWorkspace = normalization.normalizeWorkspacePresetWorkspace(undefined, { strict: false });
  assert.deepEqual(defaultWorkspace, {
    activeDeckId: "default",
    layoutProfileId: "",
    controlPaneVisible: true,
    controlPanePosition: "bottom",
    controlPaneSize: 240,
    deckGroups: {},
    deckSplitLayouts: {}
  });

  const lenientWorkspace = normalization.normalizeWorkspacePresetWorkspace(
    {
      activeDeckId: "missing",
      layoutProfileId: "unknown-layout",
      controlPanePosition: "center",
      controlPaneSize: "0",
      deckGroups: {
        ops: {
          activeGroupId: "missing",
          groups: [
            { id: "bad group", name: "Invalid", sessionIds: ["session-2", "missing", "session-2"] },
            "broken"
          ]
        },
        missing: {
          groups: []
        }
      },
      deckSplitLayouts: {
        missing: {
          root: {
            type: "row",
            children: [
              { type: "pane", paneId: "main" },
              { type: "pane", paneId: "side" }
            ]
          }
        }
      }
    },
    { strict: false }
  );
  assert.equal(lenientWorkspace.activeDeckId, "default");
  assert.equal(lenientWorkspace.layoutProfileId, "");
  assert.equal(lenientWorkspace.controlPanePosition, "bottom");
  assert.equal(lenientWorkspace.controlPaneSize, 240);
  assert.deepEqual(lenientWorkspace.deckGroups, {
    ops: {
      activeGroupId: "",
      groups: [
        { id: "invalid", name: "Invalid", sessionIds: ["session-2"] }
      ]
    }
  });
  assert.deepEqual(lenientWorkspace.deckSplitLayouts, {});

  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            activeGroupId: "missing",
            groups: [{ id: "deploy", name: "Deploy", sessionIds: ["session-2"] }]
          }
        }
      }),
    /does not exist/i
  );

  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            groups: [{ id: "deploy", name: "Deploy", sessionIds: [17] }]
          }
        }
      }),
    /must contain only strings/i
  );

  assert.equal(normalization.normalizeWorkspacePresetEntity({ id: "not valid" }), null);
});

test("runtime library normalization keeps lenient workspace fallback branches deterministic without a default deck", () => {
  const normalization = createHarness({
    decks: new Map([["ops", { id: "ops", name: "Ops" }]]),
    layoutProfiles: new Map(),
    knownSessions: new Map([["session-2", "ops"]])
  });

  const workspace = normalization.normalizeWorkspacePresetWorkspace(
    {
      activeDeckId: "missing",
      layoutProfileId: "invalid id",
      controlPaneVisible: false,
      deckGroups: {
        ops: [],
        "bad deck": {
          groups: []
        }
      },
      deckSplitLayouts: []
    },
    { strict: false }
  );

  assert.deepEqual(workspace, {
    activeDeckId: "ops",
    layoutProfileId: "",
    controlPaneVisible: false,
    controlPanePosition: "bottom",
    controlPaneSize: 240,
    deckGroups: {
      ops: {
        activeGroupId: "",
        groups: []
      }
    },
    deckSplitLayouts: {}
  });
});

test("runtime library normalization creates and restores share-link entities deterministically", () => {
  const normalization = createHarness();

  const shareLink = normalization.normalizeShareLinkEntity(
    {
      targetType: "session",
      targetId: "session-1",
      expiresInSeconds: 600
    },
    {
      subject: "alice",
      tenantId: "tenant-1"
    }
  );

  assert.equal(shareLink.id, "share-6162636465666768696a6b6c");
  assert.equal(shareLink.tokenId, "bW5vcHFyc3R1dnd4");
  assert.equal(shareLink.permissionMode, "read_only");
  assert.equal(shareLink.creatorSubject, "alice");
  assert.equal(shareLink.expiresAt, 1700000600000);

  const restored = normalization.normalizePersistedShareLinkEntity(
    {
      ...shareLink,
      revokedAt: "invalid"
    },
    { strict: false }
  );
  assert.equal(restored.revokedAt, null);

  assert.equal(
    normalization.normalizePersistedShareLinkEntity({
      id: "invalid",
      targetType: "session"
    }, { strict: false }),
    null
  );
});

test("runtime library normalization validates share-link failures and slug-like ids", () => {
  const normalization = createHarness();

  assert.throws(
    () =>
      normalization.normalizeShareLinkEntity(
        {
          targetType: "session",
          targetId: "missing",
          expiresInSeconds: 30
        },
        {}
      ),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      return true;
    }
  );

  assert.equal(
    normalization.normalizeShareLinkEntity(
      {
        targetType: "unknown",
        targetId: "session-1"
      },
      {},
      { strict: false }
    ),
    null
  );

  assert.throws(
    () => normalization.normalizePersistedShareLinkEntity({ id: "invalid" }),
    /Persisted share link entry is invalid/i
  );
});

test("runtime library normalization validates retained strict share-link guard rails", () => {
  const normalization = createHarness();

  assert.throws(
    () => normalization.normalizeShareLinkEntity([], null),
    /Body must be an object/i
  );
  assert.throws(
    () =>
      normalization.normalizeShareLinkEntity({
        targetType: "session",
        targetId: "   "
      }, null),
    /Field 'targetId' must be a non-empty string/i
  );
  assert.throws(
    () =>
      normalization.normalizeShareLinkEntity({
        targetType: "session",
        targetId: "session-1",
        expiresInSeconds: 30.5
      }, null),
    /expiresInSeconds/i
  );
});

test("runtime library normalization covers retained scalar guard rails and entity fallbacks deterministically", () => {
  const normalization = createHarness();

  assert.equal(normalization.normalizeConnectionProfileName(" Ops SSH "), "Ops SSH");
  assert.equal(normalization.normalizeConnectionProfileIdInput(undefined), "");
  assert.equal(normalization.normalizeConnectionProfileIdInput(" Ops-Ssh "), "ops-ssh");
  assert.throws(
    () => normalization.normalizeConnectionProfileName(null),
    /Field 'name' must be a string/i
  );
  assert.throws(
    () => normalization.normalizeConnectionProfileIdInput("Invalid Profile"),
    /Field 'id' must match pattern/i
  );

  assert.equal(normalization.normalizeLayoutProfileName(" Focus "), "Focus");
  assert.equal(normalization.normalizeLayoutProfileIdInput(undefined), "");
  assert.equal(normalization.normalizeLayoutProfileIdInput(" Focus-Left "), "focus-left");
  assert.throws(
    () => normalization.normalizeLayoutProfileName(""),
    /Field 'name' must be a non-empty string/i
  );
  assert.throws(
    () => normalization.normalizeLayoutProfileIdInput("Invalid Layout"),
    /Field 'id' must match pattern/i
  );

  assert.equal(normalization.normalizeWorkspacePresetName(" Ops Workspace "), "Ops Workspace");
  assert.equal(normalization.normalizeWorkspacePresetIdInput(undefined), "");
  assert.equal(normalization.normalizeWorkspacePresetIdInput(" Ops-Workspace "), "ops-workspace");
  assert.throws(
    () => normalization.normalizeWorkspacePresetName({}),
    /Field 'name' must be a string/i
  );
  assert.throws(
    () => normalization.normalizeWorkspacePresetIdInput("Invalid Workspace"),
    /Field 'id' must match pattern/i
  );

  assert.throws(
    () => normalization.normalizeConnectionProfileDeckId("Invalid Deck"),
    /Field 'launch.deckId' must be a valid deck id/i
  );
  assert.throws(
    () => normalization.normalizeConnectionProfileDeckId("missing"),
    /Deck 'missing' was not found for connection profile launch/i
  );
  assert.equal(normalization.normalizeConnectionProfileDeckId("missing", { strict: false }), "default");

  const layoutProfile = normalization.normalizeLayoutProfileEntity({
    id: "focus-left",
    name: " Focus Left ",
    layout: {
      activeDeckId: "ops",
      controlPanePosition: "left",
      controlPaneSize: 320
    }
  });
  assert.equal(layoutProfile.name, "Focus Left");
  assert.equal(layoutProfile.layout.activeDeckId, "ops");
  assert.equal(layoutProfile.layout.controlPanePosition, "left");
  assert.equal(layoutProfile.layout.controlPaneSize, 320);
  assert.equal(
    normalization.compareLayoutProfileEntries(
      { id: "beta", name: "Beta", createdAt: 1 },
      { id: "alpha", name: "Alpha", createdAt: 1 }
    ) > 0,
    true
  );

  assert.equal(
    normalization.normalizeShareLinkEntity(
      {
        targetType: " deck ",
        targetId: "   "
      },
      null,
      { strict: false }
    ),
    null
  );
  assert.equal(
    normalization.normalizeShareLinkEntity(
      {
        targetType: "bogus",
        targetId: "ops",
        expiresInSeconds: "not-a-number"
      },
      null,
      { strict: false }
    ),
    null
  );
});

test("runtime library normalization validates retained split-layout and workspace-group strict branches", () => {
  const normalization = createHarness();

  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "bogus"
            }
          }
        }
      }),
    /must be one of row, column, or pane/i
  );
  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: "broken"
            }
          }
        }
      }),
    /children' must be an array/i
  );
  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [{ type: "pane", paneId: "main" }]
            }
          }
        }
      }),
    /at least two valid child nodes/i
  );
  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout({
        deckSplitLayouts: {
          default: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "side" }
              ]
            },
            paneSessions: {
              unknown: ["session-1"]
            }
          }
        }
      }),
    /unknown pane id/i
  );
  assert.throws(
    () =>
      normalization.normalizeLayoutProfileLayout(
        {
          deckSplitLayouts: {
            default: {
              root: {
                type: "row",
                children: [
                  { type: "pane", paneId: "main" },
                  { type: "pane", paneId: "side" }
                ]
              },
              paneSessions: {
                main: ["session-2"]
              }
            }
          }
        },
        {
          hasKnownSession: (sessionId) => sessionId === "session-2",
          resolveSessionDeckId: () => "ops"
        }
      ),
    /split-layout pane assignment/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            groups: [{ name: null, sessionIds: [] }]
          }
        }
      }),
    /groups\.\*\.name' must be a string/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            groups: [{ name: "x".repeat(65), sessionIds: [] }]
          }
        }
      }),
    /exceeds maximum length/i
  );
});

test("runtime library normalization covers strict layout and workspace guard rails", () => {
  const normalization = createHarness();

  assert.throws(
    () => normalization.normalizeLayoutProfileLayout([]),
    /Field 'layout' must be an object/i
  );
  assert.throws(
    () => normalization.normalizeLayoutProfileLayout({ activeDeckId: "Invalid Deck" }),
    /layout\.activeDeckId/i
  );
  assert.throws(
    () => normalization.normalizeLayoutProfileLayout({ deckTerminalSettings: [] }),
    /layout\.deckTerminalSettings/i
  );

  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace([]),
    /Field 'workspace' must be an object/i
  );
  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace({ activeDeckId: "Invalid Deck" }),
    /workspace\.activeDeckId/i
  );
  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace({ activeDeckId: "missing" }),
    /Deck 'missing' was not found for workspace preset/i
  );
  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace({ deckGroups: [] }),
    /workspace\.deckGroups' must be an object/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          "Invalid Deck": { groups: [] }
        }
      }),
    /workspace\.deckGroups' contains an invalid deck id/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckSplitLayouts: {
          missing: {
            root: {
              type: "row",
              children: [
                { type: "pane", paneId: "main" },
                { type: "pane", paneId: "side" }
              ]
            }
          }
        }
      }),
    /Deck 'missing' was not found for split-layout state/i
  );
});

test("runtime library normalization covers share-link and workspace detail guard rails", () => {
  const normalization = createHarness();

  const deckShareLink = normalization.normalizeShareLinkEntity(
    {
      targetType: "deck",
      targetId: "ops",
      expiresInSeconds: ""
    },
    null
  );
  assert.equal(deckShareLink.targetType, "deck");
  assert.equal(deckShareLink.targetId, "ops");
  assert.equal(deckShareLink.creatorSubject, "");
  assert.equal(deckShareLink.creatorTenantId, "");
  assert.equal(deckShareLink.expiresAt, 1700086400000);

  const lenientDeckShareLink = normalization.normalizeShareLinkEntity(
    {
      targetType: "deck",
      targetId: "ops",
      expiresInSeconds: 9999999
    },
    {},
    { strict: false }
  );
  assert.equal(lenientDeckShareLink.expiresAt, 1700086400000);

  assert.equal(normalization.normalizeShareLinkEntity([], {}, { strict: false }), null);

  const restored = normalization.normalizePersistedShareLinkEntity(
    {
      ...deckShareLink,
      revokedAt: 1700000100000
    },
    { strict: false }
  );
  assert.equal(restored.revokedAt, 1700000100000);

  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace({ layoutProfileId: "Invalid Profile" }),
    /workspace\.layoutProfileId/i
  );
  assert.throws(
    () => normalization.normalizeWorkspacePresetWorkspace({ layoutProfileId: "missing" }),
    /Layout profile 'missing' was not found/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: []
        }
      }),
    /Each 'workspace\.deckGroups' entry must be an object/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            groups: {}
          }
        }
      }),
    /workspace\.deckGroups\.\*\.groups' must be an array/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            groups: [{ id: "deploy", name: "Deploy", sessionIds: ["missing"] }]
          }
        }
      }),
    /workspace group membership/i
  );
  assert.throws(
    () =>
      normalization.normalizeWorkspacePresetWorkspace({
        deckGroups: {
          ops: {
            activeGroupId: "Invalid Group",
            groups: [{ id: "deploy", name: "Deploy", sessionIds: ["session-2"] }]
          }
        }
      }),
    /activeGroupId' must be a valid group id/i
  );
});
