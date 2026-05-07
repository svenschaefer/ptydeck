import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBlankConnectionProfileLaunch,
  buildConnectionProfileLaunchFromSession,
  buildPersistedDraftLaunch,
  cloneDraftLaunch,
  createDraftState,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  formatStringRecord,
  formatTags,
  getDeckOptionsForDraft,
  getDraftLaunchFromInputs,
  getDraftModeMessage,
  getThemePresetSelectOptions,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
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
