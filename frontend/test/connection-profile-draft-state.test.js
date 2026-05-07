import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBlankConnectionProfileLaunch,
  buildConnectionProfileLaunchFromSession,
  buildPersistedDraftLaunch,
  cloneRemoteAuth,
  cloneRemoteConnection,
  cloneStringRecord,
  cloneThemeProfile,
  cloneDraftLaunch,
  createDraftState,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  formatStringRecord,
  formatTags,
  getDefaultShellForKind,
  getDefaultStartCwdForKind,
  getDeckOptionsForDraft,
  getDraftLaunchFromInputs,
  getDraftModeMessage,
  getThemePresetSelectOptions,
  normalizeConnectionProfileCollection,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  normalizeTagList,
  normalizeThemePresetCollection,
  parseStringRecord,
  parseTags,
  resolveConnectionProfileToken,
  resolveThemePresetSelectionId,
  resolveThemeProfileFromSelection,
  themeProfilesEqual
} from "../src/public/connection-profile-draft-state.js";

const DEFAULT_THEME = {
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

const ALT_THEME = {
  ...DEFAULT_THEME,
  background: "#111111",
  foreground: "#eeeeee"
};

const THEME_PRESETS = [
  {
    id: "night",
    name: "Night",
    category: "dark",
    profile: DEFAULT_THEME
  },
  {
    id: "day",
    name: "Day",
    category: "light",
    profile: ALT_THEME
  }
];

test("connection profile draft state normalizes launches, records, selectors, and reports", () => {
  const launch = normalizeConnectionProfileLaunch({
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "/srv/app",
    startCommand: "tmux a",
    env: { NODE_ENV: "prod", INVALID: 1 },
    tags: ["ops", "ops", "prod"],
    activeThemeProfile: DEFAULT_THEME,
    inactiveThemeProfile: ALT_THEME,
    remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
  });

  assert.deepEqual(launch, {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "/srv/app",
    startCommand: "tmux a",
    env: { NODE_ENV: "prod" },
    tags: ["ops", "prod"],
    activeThemeProfile: DEFAULT_THEME,
    inactiveThemeProfile: ALT_THEME,
    remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
  });

  const record = normalizeConnectionProfileRecord({
    id: "ops-ssh",
    name: "Ops SSH",
    createdAt: 10,
    updatedAt: 20,
    launch
  });
  assert.equal(record.id, "ops-ssh");
  assert.equal(resolveConnectionProfileToken([record], "Ops SSH").profile?.id, "ops-ssh");
  assert.match(formatConnectionProfileSummary(record), /\[ops-ssh\] Ops SSH -> kind=ssh deck=ops shell=ssh target=ixpqtwnk@carpo.uberspace.de:22/);
  assert.match(formatConnectionProfileReport(record), /remoteConnection=\{"host":"carpo\.uberspace\.de","port":22,"username":"ixpqtwnk"\}/);
  assert.equal(normalizeConnectionProfileLaunch({ kind: "local", shell: "bash" }), null);
});

test("connection profile draft state formats records, tags, presets, and draft metadata deterministically", () => {
  assert.equal(formatStringRecord({ A: "1", B: "two" }), "A=1\nB=two");
  assert.deepEqual(parseStringRecord("A=1\nbad\nB=two"), { A: "1", B: "two" });
  assert.equal(formatTags(["ops", "prod", "ops"]), "ops, prod");
  assert.deepEqual(parseTags("ops, nightly deploy"), ["ops", "nightly", "deploy"]);
  assert.deepEqual(normalizeThemePresetCollection([{ id: "night", name: "Night", category: "dark", profile: DEFAULT_THEME }, { id: "", name: "", profile: null }]), [
    { id: "night", name: "Night", category: "dark", profile: DEFAULT_THEME }
  ]);
  assert.equal(themeProfilesEqual(DEFAULT_THEME, { ...DEFAULT_THEME }), true);
  assert.equal(resolveThemePresetSelectionId(THEME_PRESETS, DEFAULT_THEME), "night");
  assert.equal(resolveThemePresetSelectionId(THEME_PRESETS, { ...DEFAULT_THEME, background: "#222222" }), "__custom__");
  assert.deepEqual(resolveThemeProfileFromSelection(THEME_PRESETS, "day", DEFAULT_THEME, DEFAULT_THEME), ALT_THEME);
  assert.deepEqual(resolveThemeProfileFromSelection(THEME_PRESETS, "__custom__", ALT_THEME, DEFAULT_THEME), ALT_THEME);

  const blankSsh = buildBlankConnectionProfileLaunch({
    defaultThemeProfile: DEFAULT_THEME,
    deckId: "ops",
    kind: "ssh"
  });
  assert.equal(blankSsh.kind, "ssh");
  assert.equal(blankSsh.remoteAuth?.privateKeyPath, "~/.ssh/id_ed25519");

  const draftState = createDraftState(
    {
      mode: "profile",
      profileId: "ops-ssh",
      name: "Ops SSH",
      launch: blankSsh
    },
    {
      defaultDeckId: "default",
      defaultThemeProfile: DEFAULT_THEME
    }
  );
  assert.equal(
    getDraftModeMessage(draftState, {
      getProfile: () => ({ id: "ops-ssh", name: "Ops SSH" })
    }),
    "Editing saved profile [ops-ssh] Ops SSH."
  );
  assert.deepEqual(
    getDeckOptionsForDraft(draftState, {
      defaultDeckId: "default",
      getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }]
    }).map((entry) => [entry.value, entry.label]),
    [
      ["default", "[default] Default"],
      ["ops", "[ops] Ops"]
    ]
  );
  assert.deepEqual(
    getThemePresetSelectOptions(THEME_PRESETS, "night").map((entry) => entry.value),
    ["night", "day", "__custom__"]
  );
});

test("connection profile draft state clones, derives, and persists guided draft launches", () => {
  const draftState = createDraftState(
    {
      name: "Ops SSH",
      launch: {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: { NODE_ENV: "dev" },
        tags: ["ops"],
        activeThemeProfile: DEFAULT_THEME,
        inactiveThemeProfile: ALT_THEME,
        remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
      }
    },
    {
      defaultDeckId: "default",
      defaultThemeProfile: DEFAULT_THEME
    }
  );

  const cloned = cloneDraftLaunch(draftState.launch, {
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME
  });
  assert.equal(cloned.remoteConnection?.host, "carpo.uberspace.de");

  const guidedLaunch = getDraftLaunchFromInputs({
    hasGuidedDraftControls: true,
    draftState,
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME,
    themePresets: THEME_PRESETS,
    kindValue: "ssh",
    deckValue: "ops",
    shellValue: "ssh",
    startCwdValue: "/srv/app",
    startCommandValue: "tmux a || tmux",
    envText: "NODE_ENV=prod\nAPP_ENV=live",
    tagsText: "ops nightly",
    activeThemeSelection: "day",
    inactiveThemeSelection: "__custom__",
    remoteHostValue: "carpo.uberspace.de",
    remotePortValue: "2202",
    remoteUsernameValue: "ixpqtwnk",
    remoteAuthMethodValue: "password",
    remotePrivateKeyPathValue: "~/.ssh/id_ed25519"
  });
  assert.equal(guidedLaunch.remoteConnection?.port, 2202);
  assert.equal(guidedLaunch.remoteAuth?.method, "password");
  assert.deepEqual(guidedLaunch.activeThemeProfile, ALT_THEME);
  assert.deepEqual(guidedLaunch.inactiveThemeProfile, ALT_THEME);

  const rawFallback = getDraftLaunchFromInputs({
    hasGuidedDraftControls: false,
    rawDraftLaunch: "{",
    draftState,
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME,
    themePresets: THEME_PRESETS
  });
  assert.equal(rawFallback.remoteConnection?.host, "carpo.uberspace.de");

  const persisted = buildPersistedDraftLaunch(guidedLaunch, {
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME
  });
  assert.equal(persisted.remoteConnection?.port, 2202);
  assert.equal(persisted.remoteAuth?.method, "password");

  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          ...guidedLaunch,
          shell: ""
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: DEFAULT_THEME
        }
      ),
    /Shell is required\./
  );
  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          ...guidedLaunch,
          remoteConnection: { ...guidedLaunch.remoteConnection, host: "" }
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: DEFAULT_THEME
        }
      ),
    /SSH host is required\./
  );
});

test("connection profile draft state parses raw launch JSON, preserves local defaults, and persists keyboard-interactive ssh drafts", () => {
  const parsedRawLaunch = getDraftLaunchFromInputs({
    hasGuidedDraftControls: false,
    rawDraftLaunch: JSON.stringify({
      kind: "local",
      deckId: "ops",
      shell: "powershell",
      startCwd: "/mnt/c",
      startCommand: "Get-ChildItem",
      env: { FOO: "bar" },
      tags: ["ops"],
      activeThemeProfile: DEFAULT_THEME,
      inactiveThemeProfile: ALT_THEME
    }),
    draftState: null,
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME,
    themePresets: THEME_PRESETS
  });

  assert.deepEqual(parsedRawLaunch, {
    kind: "local",
    deckId: "ops",
    shell: "powershell",
    startCwd: "/mnt/c",
    startCommand: "Get-ChildItem",
    env: { FOO: "bar" },
    tags: ["ops"],
    themeProfile: DEFAULT_THEME,
    activeThemeProfile: DEFAULT_THEME,
    inactiveThemeProfile: ALT_THEME
  });

  const blankLocal = buildBlankConnectionProfileLaunch({
    defaultThemeProfile: DEFAULT_THEME,
    deckId: "ops",
    kind: "local"
  });
  assert.equal(blankLocal.shell, "bash");
  assert.equal(blankLocal.startCwd, "/");

  const persistedKeyboardInteractive = buildPersistedDraftLaunch(
    {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      startCommand: "",
      env: {},
      tags: [],
      activeThemeProfile: DEFAULT_THEME,
      inactiveThemeProfile: ALT_THEME,
      remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
      remoteAuth: { method: "keyboardInteractive", privateKeyPath: "~/.ssh/id_ed25519" }
    },
    {
      defaultDeckId: "default",
      defaultThemeProfile: DEFAULT_THEME
    }
  );

  assert.deepEqual(persistedKeyboardInteractive.remoteAuth, { method: "keyboardInteractive" });
});

test("connection profile draft state captures reusable launches from sessions", () => {
  assert.deepEqual(
    buildConnectionProfileLaunchFromSession(
      {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "tmux a",
        env: { NODE_ENV: "prod" },
        tags: ["ops"],
        themeProfile: DEFAULT_THEME,
        activeThemeProfile: DEFAULT_THEME,
        inactiveThemeProfile: ALT_THEME,
        remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
      },
      {
        defaultDeckId: "default"
      }
    ),
    {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      startCommand: "tmux a",
      env: { NODE_ENV: "prod" },
      tags: ["ops"],
      themeProfile: DEFAULT_THEME,
      activeThemeProfile: DEFAULT_THEME,
      inactiveThemeProfile: ALT_THEME,
      remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
      remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
    }
  );
});

test("connection profile draft state covers fail-closed selectors, defaults, and ssh edge branches deterministically", () => {
  assert.deepEqual(cloneStringRecord(null), {});
  assert.deepEqual(cloneStringRecord({ " A ": "1", blank: 2, "": "x" }), { A: "1" });
  assert.equal(cloneThemeProfile([]), undefined);
  assert.equal(cloneThemeProfile({ blank: 1 }), undefined);
  assert.deepEqual(cloneThemeProfile({ background: "#000000" }), { background: "#000000" });
  assert.equal(cloneRemoteConnection({ host: "", port: 22 }), undefined);
  assert.deepEqual(cloneRemoteConnection({ host: "host", port: "22", username: "" }), { host: "host", port: 22 });
  assert.equal(cloneRemoteAuth({ method: "token" }), undefined);
  assert.deepEqual(cloneRemoteAuth({ method: "keyboardInteractive" }), { method: "keyboardInteractive" });
  assert.deepEqual(normalizeTagList("ops"), []);

  assert.equal(normalizeConnectionProfileLaunch(null), null);
  assert.equal(
    normalizeConnectionProfileLaunch({
      kind: "local",
      deckId: "ops",
      shell: "bash",
      startCwd: "/srv/app",
      themeProfile: DEFAULT_THEME
    }).kind,
    "local"
  );
  assert.equal(
    normalizeConnectionProfileLaunch({
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      activeThemeProfile: DEFAULT_THEME
    }),
    null
  );
  assert.equal(normalizeConnectionProfileRecord({ id: "", name: "Broken", launch: {} }), null);

  const normalizedProfiles = normalizeConnectionProfileCollection([
    { id: "b", name: "Beta", launch: buildBlankConnectionProfileLaunch({ defaultThemeProfile: DEFAULT_THEME }) },
    { id: "a", name: "Alpha", launch: buildBlankConnectionProfileLaunch({ defaultThemeProfile: DEFAULT_THEME }) },
    { id: "a", name: "Duplicate", launch: buildBlankConnectionProfileLaunch({ defaultThemeProfile: DEFAULT_THEME }) },
    null
  ]);
  assert.deepEqual(normalizedProfiles.map((profile) => profile.id), ["a", "b"]);
  assert.deepEqual(resolveConnectionProfileToken(normalizedProfiles, ""), {
    profile: null,
    error: "Connection profile target is required."
  });
  assert.match(resolveConnectionProfileToken(normalizedProfiles, "missing").error, /Unknown connection profile/);
  assert.match(
    resolveConnectionProfileToken(
      [
        { id: "ops-a", name: "Ops A", launch: buildBlankConnectionProfileLaunch({ defaultThemeProfile: DEFAULT_THEME }) },
        { id: "ops-b", name: "Ops B", launch: buildBlankConnectionProfileLaunch({ defaultThemeProfile: DEFAULT_THEME }) }
      ],
      "ops"
    ).error,
    /Ambiguous connection profile/
  );

  assert.equal(buildConnectionProfileLaunchFromSession(null), null);
  assert.equal(buildConnectionProfileLaunchFromSession({ kind: "local", shell: "", cwd: "/" }), null);
  assert.equal(formatConnectionProfileSummary(null), "");
  assert.equal(formatConnectionProfileReport(null), "");

  assert.equal(getDefaultShellForKind("ssh"), "ssh");
  assert.equal(getDefaultShellForKind("local"), "bash");
  assert.equal(getDefaultStartCwdForKind("ssh"), "~");
  assert.equal(getDefaultStartCwdForKind("local"), "/");

  const defaultClone = cloneDraftLaunch(
    {
      kind: "ssh",
      deckId: "ops",
      remoteConnection: { host: "carpo.uberspace.de", port: 99999, username: "" },
      remoteAuth: { method: "token" }
    },
    {
      defaultDeckId: "default",
      defaultThemeProfile: DEFAULT_THEME
    }
  );
  assert.equal(defaultClone.shell, "ssh");
  assert.equal(defaultClone.startCwd, "~");
  assert.equal(defaultClone.remoteConnection?.port, 22);
  assert.equal(defaultClone.remoteAuth?.method, "privateKey");
  assert.equal(defaultClone.remoteAuth?.privateKeyPath, "~/.ssh/id_ed25519");

  assert.equal(getDraftModeMessage(null), "");
  assert.equal(getDraftModeMessage({ mode: "session", launch: { kind: "ssh" } }), "Loaded the active session into a new unsaved draft.");
  assert.equal(
    getDraftModeMessage({ mode: "blank", launch: { kind: "local" } }),
    "Editing a new unsaved local connection profile."
  );
  assert.deepEqual(
    getDeckOptionsForDraft(
      { launch: { deckId: "ops" } },
      {
        defaultDeckId: "default",
        getDecks: () => [{ id: "default", name: "Default" }, { id: "default", name: "Duplicate" }]
      }
    ).map((entry) => entry.value),
    ["default", "ops"]
  );
  assert.deepEqual(
    getThemePresetSelectOptions(THEME_PRESETS, "custom-selected").map((entry) => entry.value),
    ["night", "day", "__custom__", "custom-selected"]
  );
  assert.deepEqual(resolveThemeProfileFromSelection(THEME_PRESETS, "", null, DEFAULT_THEME), DEFAULT_THEME);
  assert.deepEqual(resolveThemeProfileFromSelection(THEME_PRESETS, "missing", null, DEFAULT_THEME), DEFAULT_THEME);

  const draftLaunch = getDraftLaunchFromInputs({
    hasGuidedDraftControls: false,
    rawDraftLaunch: JSON.stringify({
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      activeThemeProfile: DEFAULT_THEME,
      inactiveThemeProfile: DEFAULT_THEME
    }),
    defaultDeckId: "default",
    defaultThemeProfile: DEFAULT_THEME
  });
  assert.equal(draftLaunch.kind, "ssh");
  assert.equal(
    getDraftLaunchFromInputs({
      hasGuidedDraftControls: true,
      draftState: createDraftState({}, { defaultDeckId: "default", defaultThemeProfile: DEFAULT_THEME }),
      defaultDeckId: "default",
      defaultThemeProfile: DEFAULT_THEME,
      themePresets: THEME_PRESETS,
      kindValue: "local",
      deckValue: "default",
      shellValue: "bash",
      startCwdValue: "/",
      startCommandValue: "",
      envText: "",
      tagsText: "",
      activeThemeSelection: "",
      inactiveThemeSelection: "",
      remotePortValue: "not-a-port"
    }).remoteConnection,
    undefined
  );

  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          kind: "ssh",
          shell: "ssh",
          startCwd: "~",
          activeThemeProfile: DEFAULT_THEME,
          inactiveThemeProfile: DEFAULT_THEME,
          remoteConnection: { host: "carpo.uberspace.de", port: 22 },
          remoteAuth: { method: "token" }
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: DEFAULT_THEME
        }
      ),
    /SSH auth method must be password, privateKey, or keyboardInteractive\./
  );
  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          kind: "local",
          shell: "bash",
          startCwd: "/",
          activeThemeProfile: null,
          inactiveThemeProfile: null
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: null
        }
      ),
    /Connection profile draft is incomplete\./
  );
});

test("connection profile draft state rejects blank env keys and additional persisted ssh validation gaps", () => {
  assert.deepEqual(parseStringRecord(" =ignored\nVALID=value"), {
    VALID: "value"
  });

  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          kind: "local",
          deckId: "ops",
          shell: "bash",
          startCwd: "",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: DEFAULT_THEME,
          inactiveThemeProfile: ALT_THEME
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: DEFAULT_THEME
        }
      ),
    /Start directory is required\./
  );

  assert.throws(
    () =>
      buildPersistedDraftLaunch(
        {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: DEFAULT_THEME,
          inactiveThemeProfile: ALT_THEME,
          remoteConnection: {
            host: "carpo.uberspace.de",
            port: "70000",
            username: "ixpqtwnk"
          },
          remoteAuth: {
            method: "privateKey",
            privateKeyPath: "~/.ssh/id_ed25519"
          }
        },
        {
          defaultDeckId: "default",
          defaultThemeProfile: DEFAULT_THEME
        }
      ),
    /SSH port must be an integer between 1 and 65535\./
  );
});
