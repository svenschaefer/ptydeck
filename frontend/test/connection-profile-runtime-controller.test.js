import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConnectionProfileLaunchFromSession,
  createConnectionProfileRuntimeController,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  resolveConnectionProfileToken
} from "../src/public/connection-profile-runtime-controller.js";

function createElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    value: "",
    textContent: "",
    disabled: false,
    selected: false,
    hidden: false,
    readOnly: false,
    children: [],
    listeners: new Map(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      return child;
    },
    get firstChild() {
      return this.children[0] || null;
    },
    addEventListener(type, handler) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler({ type, preventDefault() {}, ...event });
      }
    },
    click() {
      this.dispatch("click");
    }
  };
}

function createConnectionProfileUiRefs() {
  return {
    selectEl: createElement("select"),
    newBtn: createElement("button"),
    newSshBtn: createElement("button"),
    saveBtn: createElement("button"),
    saveDraftBtn: createElement("button"),
    saveAndLaunchBtn: createElement("button"),
    resetDraftBtn: createElement("button"),
    applyBtn: createElement("button"),
    duplicateBtn: createElement("button"),
    renameBtn: createElement("button"),
    deleteBtn: createElement("button"),
    statusEl: createElement("p"),
    summaryEl: createElement("p"),
    draftNameInputEl: createElement("input"),
    draftKindSelectEl: createElement("select"),
    draftDeckSelectEl: createElement("select"),
    draftShellInputEl: createElement("input"),
    draftStartCwdInputEl: createElement("input"),
    draftStartCommandTextareaEl: createElement("textarea"),
    draftEnvTextareaEl: createElement("textarea"),
    draftTagsInputEl: createElement("input"),
    draftActiveThemeSelectEl: createElement("select"),
    draftInactiveThemeSelectEl: createElement("select"),
    sshFieldsEl: createElement("section"),
    draftRemoteHostInputEl: createElement("input"),
    draftRemotePortInputEl: createElement("input"),
    draftRemoteUsernameInputEl: createElement("input"),
    draftRemoteAuthMethodSelectEl: createElement("select"),
    draftRemotePrivateKeyFieldEl: createElement("div"),
    draftRemotePrivateKeyPathInputEl: createElement("input"),
    authHintEl: createElement("p"),
    secretHintEl: createElement("p"),
    runtimeSecretFieldEl: createElement("div"),
    runtimeSecretInputEl: createElement("input"),
    sshTrustStatusEl: createElement("p"),
    sshTrustProbeBtn: createElement("button"),
    sshProbeSelectEl: createElement("select"),
    sshTrustSelectEl: createElement("select"),
    sshTrustKeyTypeInputEl: createElement("input"),
    sshTrustFingerprintInputEl: createElement("input"),
    sshTrustPublicKeyTextareaEl: createElement("textarea"),
    sshTrustRefreshBtn: createElement("button"),
    sshTrustSaveBtn: createElement("button"),
    sshTrustDeleteBtn: createElement("button"),
    deleteConfirmEl: createElement("div"),
    deleteConfirmMessageEl: createElement("p"),
    deleteConfirmBtn: createElement("button"),
    deleteCancelBtn: createElement("button"),
    draftLaunchTextareaEl: createElement("textarea"),
    draftStatusEl: createElement("p")
  };
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

function createThemeProfile(seed) {
  return {
    background: seed,
    foreground: "#eeeeee",
    cursor: "#ffffff",
    black: "#111111",
    red: "#ff0000",
    green: "#00ff00",
    yellow: "#ffff00",
    blue: "#0000ff",
    magenta: "#ff00ff",
    cyan: "#00ffff",
    white: "#ffffff",
    brightBlack: "#222222",
    brightRed: "#ff1111",
    brightGreen: "#11ff11",
    brightYellow: "#ffff11",
    brightBlue: "#1111ff",
    brightMagenta: "#ff11ff",
    brightCyan: "#11ffff",
    brightWhite: "#f5f5f5"
  };
}

test("resolveConnectionProfileToken matches exact and unique prefix selectors", () => {
  const profiles = [
    {
      id: "ops-local",
      name: "Ops Local",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/ops",
        startCommand: "",
        env: {},
        tags: ["ops"],
        activeThemeProfile: createThemeProfile("#101010"),
        inactiveThemeProfile: createThemeProfile("#202020")
      }
    },
    {
      id: "ops-ssh",
      name: "Ops SSH",
      launch: {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: {},
        tags: ["ssh"],
        activeThemeProfile: createThemeProfile("#303030"),
        inactiveThemeProfile: createThemeProfile("#404040"),
        remoteConnection: { host: "ops.example", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
      }
    }
  ];

  assert.equal(resolveConnectionProfileToken(profiles, "ops-local").profile?.id, "ops-local");
  assert.equal(resolveConnectionProfileToken(profiles, "Ops SSH").profile?.id, "ops-ssh");
  assert.equal(resolveConnectionProfileToken(profiles, "ops-s").profile?.id, "ops-ssh");
  assert.match(resolveConnectionProfileToken(profiles, "missing").error, /Unknown connection profile/);
  assert.equal(formatConnectionProfileSummary(profiles[1]), "[ops-ssh] Ops SSH -> kind=ssh deck=ops shell=ssh target=ops@ops.example:22");
});

test("buildConnectionProfileLaunchFromSession captures reusable launch settings from a session", () => {
  const session = {
    id: "s1",
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    cwd: "/ignored",
    startCwd: "~",
    startCommand: "tmux a || tmux",
    env: { LANG: "en_US.UTF-8" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111"),
    activeThemeProfile: createThemeProfile("#121212"),
    inactiveThemeProfile: createThemeProfile("#131313"),
    remoteConnection: { host: "ops.example", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
  };

  assert.deepEqual(buildConnectionProfileLaunchFromSession(session), {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "tmux a || tmux",
    env: { LANG: "en_US.UTF-8" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111"),
    activeThemeProfile: createThemeProfile("#121212"),
    inactiveThemeProfile: createThemeProfile("#131313"),
    remoteConnection: { host: "ops.example", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
  });
});

test("connection profile helpers normalize launches and reject malformed records deterministically", () => {
  const launch = normalizeConnectionProfileLaunch({
    kind: "local",
    deckId: " ops ",
    shell: " bash ",
    startCwd: " /srv/app ",
    env: { NODE_ENV: "production" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111")
  });

  assert.deepEqual(launch, {
    kind: "local",
    deckId: "ops",
    shell: "bash",
    startCwd: "/srv/app",
    startCommand: "",
    env: { NODE_ENV: "production" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111"),
    activeThemeProfile: createThemeProfile("#111111"),
    inactiveThemeProfile: createThemeProfile("#111111")
  });
  assert.equal(normalizeConnectionProfileLaunch({ kind: "local", shell: "bash" }), null);
  assert.equal(normalizeConnectionProfileRecord({ id: "ops", name: "", launch }), null);
});

test("connection profile helpers report missing and ambiguous selectors with stable local reports", () => {
  const profiles = [
    {
      id: "ops-east",
      name: "Ops East",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/east",
        activeThemeProfile: createThemeProfile("#101010"),
        inactiveThemeProfile: createThemeProfile("#202020")
      }
    },
    {
      id: "ops-west",
      name: "Ops West",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/west",
        activeThemeProfile: createThemeProfile("#303030"),
        inactiveThemeProfile: createThemeProfile("#404040")
      }
    }
  ];

  assert.equal(resolveConnectionProfileToken(profiles, "").error, "Connection profile target is required.");
  assert.equal(
    resolveConnectionProfileToken(profiles, "ops").error,
    "Ambiguous connection profile 'ops': ops-east, ops-west"
  );
  assert.match(formatConnectionProfileReport(profiles[0]), /^\[ops-east\] Ops East$/m);
  assert.match(formatConnectionProfileReport(profiles[0]), /remoteConnection=null/);
});

test("connection profile helpers fail closed on malformed ssh details and empty formatting targets", () => {
  assert.equal(buildConnectionProfileLaunchFromSession(null), null);
  assert.equal(buildConnectionProfileLaunchFromSession({ kind: "ssh", shell: "ssh" }), null);
  assert.equal(formatConnectionProfileSummary(null), "");
  assert.equal(formatConnectionProfileReport(null), "");

  const launch = normalizeConnectionProfileLaunch({
    kind: "ssh",
    deckId: " ops ",
    shell: " ssh ",
    startCwd: " ~ ",
    startCommand: "tmux a",
    env: { LANG: "en_US.UTF-8", PORT: 22, " ": "ignored" },
    tags: ["ops", "ops", "prod", " "],
    themeProfile: createThemeProfile("#121212"),
    remoteConnection: { host: "ops.example", port: "70000", username: "ops" },
    remoteAuth: { method: "token", privateKeyPath: "/ignored" }
  });

  assert.deepEqual(launch, {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "tmux a",
    env: { LANG: "en_US.UTF-8" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#121212"),
    activeThemeProfile: createThemeProfile("#121212"),
    inactiveThemeProfile: createThemeProfile("#121212")
  });
  assert.equal(
    normalizeConnectionProfileLaunch({
      kind: "local",
      deckId: "default",
      shell: "bash",
      startCwd: "/srv/app"
    }),
    null
  );
});

test("connection profile helper selectors sort duplicate names by id for ambiguous prefix matches", () => {
  const profiles = [
    {
      id: "ops-b",
      name: "Ops",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/b",
        activeThemeProfile: createThemeProfile("#111111"),
        inactiveThemeProfile: createThemeProfile("#222222")
      }
    },
    {
      id: "ops-a",
      name: "Ops",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/a",
        activeThemeProfile: createThemeProfile("#333333"),
        inactiveThemeProfile: createThemeProfile("#444444")
      }
    }
  ];

  assert.equal(
    resolveConnectionProfileToken(profiles, "op").error,
    "Ambiguous connection profile 'op': ops-a, ops-b"
  );
});

test("connection profile runtime controller manages backend-backed lifecycle and launches sessions from profiles", async () => {
  const sessions = [
    {
      id: "s-local",
      deckId: "default",
      kind: "local",
      shell: "bash",
      cwd: "/workspace",
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { NODE_ENV: "development" },
      tags: ["local", "dev"],
      themeProfile: createThemeProfile("#010101"),
      activeThemeProfile: createThemeProfile("#020202"),
      inactiveThemeProfile: createThemeProfile("#030303")
    }
  ];
  const calls = [];
  const ui = createConnectionProfileUiRefs();
  let activeSessionId = "s-local";
  const controller = createConnectionProfileRuntimeController({
    windowRef: {
      confirm() {
        calls.push(["confirm"]);
        return true;
      }
    },
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async listConnectionProfiles() {
        calls.push(["list"]);
        return [
          {
            id: "ops-ssh",
            name: "Ops SSH",
            createdAt: 1,
            updatedAt: 1,
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: ["ssh"],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        calls.push(["list-trust"]);
        return [
          {
            id: "trust-ops",
            host: "ops.example",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
            fingerprintSha256: "SHA256:existing"
          }
        ];
      },
      async createConnectionProfile(payload) {
        calls.push(["create", payload]);
        const createdId = payload.name === "Ops SSH Copy" ? "ops-ssh-copy" : "local-dev";
        return {
          id: createdId,
          name: payload.name,
          createdAt: 2,
          updatedAt: 2,
          launch: payload.launch
        };
      },
      async createSession(payload) {
        calls.push(["create-session", payload]);
        return {
          id: "s-created",
          deckId: "ops",
          name: "Ops SSH",
          kind: "ssh"
        };
      },
      async updateConnectionProfile(profileId, payload) {
        calls.push(["update", profileId, payload]);
        return {
          id: profileId,
          name: payload.name,
          createdAt: 1,
          updatedAt: 3,
          launch: {
            kind: "ssh",
            deckId: "ops",
            shell: "ssh",
            startCwd: "~",
            startCommand: "",
            env: {},
            tags: ["ssh"],
            activeThemeProfile: createThemeProfile("#111111"),
            inactiveThemeProfile: createThemeProfile("#121212"),
            remoteConnection: { host: "ops.example", port: 22, username: "ops" },
            remoteAuth: { method: "password" }
          }
        };
      },
      async deleteConnectionProfile(profileId) {
        calls.push(["delete", profileId]);
      }
    },
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }],
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    getActiveSessionId: () => activeSessionId,
    setActiveSession: (sessionId) => {
      calls.push(["set-active-session", sessionId]);
      activeSessionId = sessionId;
    },
    setActiveDeck: (deckId) => {
      calls.push(["set-active-deck", deckId]);
      return true;
    },
    applyRuntimeEvent: (event) => {
      calls.push(["runtime-event", event.type, event.session?.id || ""]);
      return true;
    },
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    requestSecret: async (options) => {
      calls.push(["request-secret", options.title, options.message]);
      return "secret-1";
    },
    requestRender: () => calls.push(["render"]),
    formatSessionToken: (sessionId) => sessionId === "s-local" ? "1" : "8",
    formatSessionDisplayName: (session) => session?.name || session?.id || "",
    normalizeThemeProfile: (profile) => profile,
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await controller.loadProfiles();
  controller.bindUiEvents();
  assert.equal(ui.selectEl.children.length, 1);
  assert.equal(ui.statusEl.textContent, "1 profile(s)");
  assert.match(ui.summaryEl.textContent, /Ops SSH/);

  const saveFeedback = await controller.createProfileFromSession("s-local", "Local Dev");
  assert.equal(saveFeedback, "Saved connection profile [local-dev] Local Dev from [1] s-local.");
  assert.deepEqual(calls.find((entry) => entry[0] === "create")?.[1], {
    name: "Local Dev",
    launch: {
      kind: "local",
      deckId: "default",
      shell: "bash",
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { NODE_ENV: "development" },
      tags: ["local", "dev"],
      themeProfile: createThemeProfile("#010101"),
      activeThemeProfile: createThemeProfile("#020202"),
      inactiveThemeProfile: createThemeProfile("#030303")
    }
  });

  const loadDraftFeedback = await controller.loadActiveDraftFlow();
  assert.equal(loadDraftFeedback, "Loaded the active session into a new connection profile draft.");
  assert.equal(ui.draftNameInputEl.value, "s-local Profile");
  assert.equal(ui.draftKindSelectEl.value, "local");
  assert.equal(ui.draftShellInputEl.value, "bash");
  assert.equal(ui.draftStartCwdInputEl.value, "/workspace");
  assert.match(ui.draftStatusEl.textContent, /unsaved draft/i);
  ui.draftNameInputEl.value = "Drafted Local";

  const saveDraftFeedback = await controller.saveDraftFlow();
  assert.equal(saveDraftFeedback, "Saved connection profile [local-dev] Drafted Local.");
  const createCalls = calls.filter((entry) => entry[0] === "create");
  assert.deepEqual(createCalls[1]?.[1], {
    name: "Drafted Local",
    launch: {
      kind: "local",
      deckId: "default",
      shell: "bash",
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { NODE_ENV: "development" },
      tags: ["local", "dev"],
      themeProfile: createThemeProfile("#010101"),
      activeThemeProfile: createThemeProfile("#020202"),
      inactiveThemeProfile: createThemeProfile("#030303")
    }
  });
  assert.match(ui.draftStatusEl.textContent, /Editing saved profile \[local-dev\]/i);

  const applyFeedback = await controller.applyProfileById("ops-ssh");
  assert.equal(applyFeedback, "Started session [8] Ops SSH from connection profile [ops-ssh] Ops SSH.");
  assert.deepEqual(calls.find((entry) => entry[0] === "create-session")?.[1], {
    connectionProfileId: "ops-ssh",
    remoteSecret: "secret-1"
  });
  assert.ok(
    calls.some(
      (entry) =>
        entry[0] === "request-secret" &&
        entry[1] === "SSH Runtime Secret" &&
        /saved SSH profile \[ops-ssh\] Ops SSH/.test(entry[2])
    )
  );
  assert.equal(ui.runtimeSecretInputEl.value, "");
  assert.ok(calls.some((entry) => entry[0] === "set-active-deck" && entry[1] === "ops"));
  assert.ok(calls.some((entry) => entry[0] === "set-active-session" && entry[1] === "s-created"));
  assert.ok(calls.some((entry) => entry[0] === "runtime-event" && entry[1] === "session.created" && entry[2] === "s-created"));

  const renameFeedback = await controller.renameProfileById("ops-ssh", "Ops SSH Prod");
  assert.equal(renameFeedback, "Renamed connection profile [ops-ssh] to Ops SSH Prod.");

  const duplicateFeedback = await controller.duplicateProfileById("ops-ssh", "Ops SSH Copy");
  assert.equal(
    duplicateFeedback,
    "Duplicated connection profile [ops-ssh] Ops SSH Prod as [ops-ssh-copy] Ops SSH Copy."
  );
  assert.equal(controller.getSelectedProfileId(), "ops-ssh-copy");

  ui.selectEl.value = "ops-ssh";
  ui.selectEl.dispatch("change");
  const pendingDeleteFeedback = await controller.deleteSelectedProfileFlow();
  assert.equal(pendingDeleteFeedback, "Confirm deletion for saved connection profile [ops-ssh] Ops SSH Prod.");
  assert.equal(calls.some((entry) => entry[0] === "delete"), false);
  assert.equal(ui.deleteConfirmEl.hidden, false);
  assert.match(ui.deleteConfirmMessageEl.textContent, /Ops SSH Prod/);

  const cancelDeleteFeedback = await controller.cancelDeleteSelectedProfileFlow();
  assert.equal(cancelDeleteFeedback, "Cancelled deletion of the saved connection profile.");
  assert.equal(ui.deleteConfirmEl.hidden, true);

  await controller.deleteSelectedProfileFlow();
  const deleteFeedback = await controller.deleteSelectedProfileFlow();
  assert.equal(deleteFeedback, "Deleted connection profile [ops-ssh] Ops SSH Prod.");
});

test("connection profile runtime controller hides SSH-only and auth-specific fields for local drafts", async () => {
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async listConnectionProfiles() {
        return [];
      }
    },
    getDecks: () => [{ id: "default", name: "Default" }],
    getSessions: () => [],
    getActiveSessionId: () => "",
    setCommandFeedback: () => {},
    requestRender: () => {},
    normalizeThemeProfile: (profile) => profile,
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await controller.newDraftFlow("local");
  assert.equal(ui.sshFieldsEl.hidden, true);
  assert.equal(ui.draftRemotePrivateKeyFieldEl.hidden, true);
  assert.equal(ui.runtimeSecretFieldEl.hidden, true);

  await controller.newDraftFlow("ssh");
  assert.equal(ui.sshFieldsEl.hidden, false);
  assert.equal(ui.draftRemotePrivateKeyFieldEl.hidden, false);
  assert.equal(ui.runtimeSecretFieldEl.hidden, true);

  ui.draftRemoteAuthMethodSelectEl.value = "password";
  ui.draftRemoteAuthMethodSelectEl.dispatch("change");
  assert.equal(ui.draftRemotePrivateKeyFieldEl.hidden, true);
  assert.equal(ui.runtimeSecretFieldEl.hidden, true);
});

test("connection profile runtime controller updates saved drafts instead of creating duplicates", async () => {
  const calls = [];
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async updateConnectionProfile(profileId, payload) {
        calls.push(["update", profileId, payload]);
        return {
          id: profileId,
          name: payload.name,
          createdAt: 1,
          updatedAt: 2,
          launch: payload.launch
        };
      }
    },
    defaultThemeProfile: createThemeProfile("#111111")
  });

  controller.replaceProfiles([
    {
      id: "ops-local",
      name: "Ops Local",
      launch: {
        kind: "local",
        deckId: "ops",
        shell: "bash",
        startCwd: "/srv/ops",
        startCommand: "",
        env: { LANG: "en_US.UTF-8" },
        tags: ["ops"],
        activeThemeProfile: createThemeProfile("#111111"),
        inactiveThemeProfile: createThemeProfile("#121212")
      }
    }
  ]);
  controller.setDraftState({
    mode: "profile",
    profileId: "ops-local",
    name: "Ops Local",
    launch: controller.getProfile("ops-local").launch
  });
  ui.draftNameInputEl.value = "Ops Local Updated";

  const feedback = await controller.saveDraftById();
  assert.equal(feedback, "Updated connection profile [ops-local] Ops Local Updated.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][1], "ops-local");
  assert.equal(calls[0][2].name, "Ops Local Updated");
});

test("connection profile runtime controller reports apply cancellation when secret prompt is dismissed", async () => {
  const calls = [];
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    requestSecret: async () => {
      calls.push(["request-secret"]);
      return null;
    },
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-ssh",
            name: "Ops SSH",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: [],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [
          {
            id: "trust-ops",
            host: "ops.example",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
            fingerprintSha256: "SHA256:existing"
          }
        ];
      },
      async createSession(payload) {
        calls.push(["create-session", payload]);
        throw new Error("should not be reached");
      }
    }
  });

  await controller.loadProfiles();

  const feedback = await controller.applyProfileById("ops-ssh");
  assert.equal(feedback, "Connection profile apply cancelled for [ops-ssh] Ops SSH.");
  assert.equal(calls.some((entry) => entry[0] === "create-session"), false);
  assert.equal(calls.some((entry) => entry[0] === "request-secret"), true);
});

test("connection profile runtime controller sanitizes malformed reload payloads and clears stale trust state after trust refresh failure", async () => {
  const ui = createConnectionProfileUiRefs();
  const errors = [];
  const api = {
    async listConnectionProfiles() {
      return [
        null,
        {
          id: "ops-ssh",
          name: "Ops SSH",
          launch: {
            kind: "ssh",
            deckId: "ops",
            shell: "ssh",
            startCwd: "~",
            startCommand: "",
            env: {},
            tags: [],
            activeThemeProfile: createThemeProfile("#111111"),
            inactiveThemeProfile: createThemeProfile("#121212"),
            remoteConnection: { host: "ops.example", port: 22, username: "ops" },
            remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
          }
        },
        {
          id: "ops-ssh",
          name: "Duplicate Should Be Dropped",
          launch: {
            kind: "ssh",
            deckId: "ops",
            shell: "ssh",
            startCwd: "~",
            startCommand: "",
            env: {},
            tags: [],
            activeThemeProfile: createThemeProfile("#313131"),
            inactiveThemeProfile: createThemeProfile("#323232"),
            remoteConnection: { host: "dupe.example", port: 22, username: "ops" },
            remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
          }
        }
      ];
    },
    async listSshTrustEntries() {
      return [
        {
          id: "trust-ops",
          host: "ops.example",
          port: 22,
          keyType: "ssh-ed25519",
          publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
          fingerprintSha256: "SHA256:existing"
        }
      ];
    }
  };
  const controller = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...ui,
    api,
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }],
    getSessions: () => [],
    getActiveSessionId: () => "",
    setError: (message) => errors.push(message),
    getErrorMessage: (_, fallback) => fallback,
    defaultThemeProfile: createThemeProfile("#090909")
  });

  const loadedProfiles = await controller.loadProfiles();
  assert.equal(loadedProfiles.length, 1);
  assert.equal(loadedProfiles[0].id, "ops-ssh");

  await controller.newDraftFlow("ssh");
  ui.draftRemoteHostInputEl.value = "ops.example";
  ui.draftRemoteHostInputEl.dispatch("input");
  assert.match(ui.sshTrustSelectEl.children[0].textContent, /SHA256:existing/);

  api.listConnectionProfiles = async () => {
    return [
      {
        id: "ops-ssh",
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: createThemeProfile("#111111"),
          inactiveThemeProfile: createThemeProfile("#121212"),
          remoteConnection: { host: "ops.example", port: 22, username: "ops" },
          remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
        }
      }
    ];
  };
  api.listSshTrustEntries = async () => {
    throw new Error("trust reload failed");
  };

  const reloadedProfiles = await controller.loadProfiles();
  assert.equal(reloadedProfiles.length, 1);
  assert.equal(controller.listProfiles().length, 1);
  assert.equal(errors.length, 0);

  await controller.newDraftFlow("ssh");
  ui.draftRemoteHostInputEl.value = "ops.example";
  ui.draftRemoteHostInputEl.dispatch("input");
  assert.equal(ui.sshTrustSelectEl.children[0].textContent, "No trusted keys for this SSH target");
});

test("connection profile runtime controller supports guided SSH drafts, save-and-launch, and SSH trust entry management", async () => {
  const calls = [];
  const secretRequests = [];
  const trustEntries = [
    {
      id: "trust-1",
      host: "ops.example",
      port: 22,
      keyType: "ssh-ed25519",
      publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
      fingerprintSha256: "SHA256:existing"
    }
  ];
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    windowRef: {},
    documentRef: createDocumentRef(),
    ...ui,
    requestSecret: async (options) => {
      secretRequests.push(options);
      return "runtime-secret";
    },
    api: {
      async createConnectionProfile(payload) {
        calls.push(["create", payload]);
        return {
          id: "ops-guided",
          name: payload.name,
          createdAt: 1,
          updatedAt: 1,
          launch: payload.launch
        };
      },
      async updateConnectionProfile(profileId, payload) {
        calls.push(["update", profileId, payload]);
        return {
          id: profileId,
          name: payload.name,
          createdAt: 1,
          updatedAt: 2,
          launch: payload.launch
        };
      },
      async createSession(payload) {
        calls.push(["create-session", payload]);
        return {
          id: "s-ssh",
          deckId: "ops",
          name: "Guided SSH",
          kind: "ssh"
        };
      },
      async listSshTrustEntries() {
        calls.push(["list-trust"]);
        return trustEntries.slice();
      },
      async probeSshHostKeys(payload) {
        calls.push(["probe-trust", payload]);
        return [
          {
            host: payload.host,
            port: payload.port,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAcreated",
            fingerprintSha256: "SHA256:created"
          }
        ];
      },
      async createSshTrustEntry(payload) {
        calls.push(["create-trust", payload]);
        const created = {
          id: "trust-2",
          host: payload.host,
          port: payload.port,
          keyType: payload.keyType,
          publicKey: payload.publicKey,
          fingerprintSha256: "SHA256:created"
        };
        trustEntries.push(created);
        return created;
      },
      async deleteSshTrustEntry(entryId) {
        calls.push(["delete-trust", entryId]);
        const index = trustEntries.findIndex((entry) => entry.id === entryId);
        if (index >= 0) {
          trustEntries.splice(index, 1);
        }
      }
    },
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }],
    setActiveDeck: (deckId) => {
      calls.push(["set-active-deck", deckId]);
      return true;
    },
    setActiveSession: (sessionId) => {
      calls.push(["set-active-session", sessionId]);
    },
    applyRuntimeEvent: (event) => {
      calls.push(["runtime-event", event.type, event.session?.id || ""]);
      return true;
    },
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    requestRender: () => calls.push(["render"]),
    themePresets: [
      { id: "ptydeck-dark", name: "ptydeck-dark", category: "dark", profile: createThemeProfile("#151515") },
      { id: "ptydeck-light", name: "ptydeck-light", category: "light", profile: createThemeProfile("#efefef") }
    ],
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await controller.newDraftFlow("ssh");
  assert.equal(ui.draftKindSelectEl.value, "ssh");
  assert.equal(ui.sshFieldsEl.hidden, false);

  ui.draftNameInputEl.value = "Guided SSH";
  ui.draftDeckSelectEl.value = "ops";
  ui.draftShellInputEl.value = "ssh";
  ui.draftStartCwdInputEl.value = "~";
  ui.draftStartCommandTextareaEl.value = "tmux a || tmux";
  ui.draftEnvTextareaEl.value = "LANG=en_US.UTF-8";
  ui.draftTagsInputEl.value = "ops, ssh";
  ui.draftActiveThemeSelectEl.value = "ptydeck-dark";
  ui.draftInactiveThemeSelectEl.value = "ptydeck-light";
  ui.draftRemoteHostInputEl.value = "ops-new.example";
  ui.draftRemotePortInputEl.value = "22";
  ui.draftRemoteUsernameInputEl.value = "ops";
  ui.draftRemoteAuthMethodSelectEl.value = "password";
  ui.draftRemotePrivateKeyPathInputEl.value = "";

  const saveFeedback = await controller.saveDraftById();
  assert.match(saveFeedback, /Saved connection profile \[ops-guided\] Guided SSH\./);

  const firstLaunchFeedback = await controller.applyProfileById("ops-guided").catch((error) => error.message);
  assert.match(firstLaunchFeedback, /No trusted host key is stored/);
  assert.deepEqual(calls.find((entry) => entry[0] === "probe-trust")?.[1], {
    host: "ops-new.example",
    port: 22
  });
  assert.equal(calls.some((entry) => entry[0] === "create-session"), false);
  assert.equal(ui.sshProbeSelectEl.value.includes("ssh-ed25519"), true);
  assert.equal(ui.sshTrustKeyTypeInputEl.value, "ssh-ed25519");
  assert.equal(ui.sshTrustFingerprintInputEl.value, "SHA256:created");
  assert.equal(ui.sshTrustPublicKeyTextareaEl.value, "AAAAC3NzaC1lZDI1NTE5AAAAcreated");

  const trustFeedback = await controller.saveTrustEntryFlow();
  assert.match(trustFeedback, /Trusted SSH host key/);
  assert.deepEqual(calls.find((entry) => entry[0] === "create-trust")?.[1], {
    host: "ops-new.example",
    port: 22,
    keyType: "ssh-ed25519",
    publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAcreated"
  });

  const combinedFeedback = await controller.saveAndLaunchDraftFlow();
  assert.match(combinedFeedback, /Updated connection profile \[ops-guided\] Guided SSH\./);
  assert.match(combinedFeedback, /Started session \[s-ssh\] Guided SSH from connection profile \[ops-guided\] Guided SSH\./);
  assert.deepEqual(calls.find((entry) => entry[0] === "create")?.[1], {
    name: "Guided SSH",
    launch: {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      startCommand: "tmux a || tmux",
      env: { LANG: "en_US.UTF-8" },
      tags: ["ops", "ssh"],
      themeProfile: createThemeProfile("#151515"),
      activeThemeProfile: createThemeProfile("#151515"),
      inactiveThemeProfile: createThemeProfile("#efefef"),
      remoteConnection: {
        host: "ops-new.example",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "password"
      }
    }
  });
  assert.deepEqual(calls.find((entry) => entry[0] === "create-session")?.[1], {
    connectionProfileId: "ops-guided",
    remoteSecret: "runtime-secret"
  });
  assert.equal(secretRequests.length, 1);
  assert.match(secretRequests[0].message, /saved SSH profile \[ops-guided\] Guided SSH/);
  assert.match(ui.authHintEl.textContent, /Password auth/i);
  assert.match(ui.secretHintEl.textContent, /masked runtime secret/i);

  ui.sshTrustSelectEl.value = "trust-1";
  ui.sshTrustSelectEl.dispatch("change");
  const deleteTrustFeedback = await controller.deleteTrustEntryFlow();
  assert.match(deleteTrustFeedback, /Deleted trusted SSH host key/);
  assert.ok(calls.some((entry) => entry[0] === "delete-trust"));
});

test("connection profile runtime controller seeds the SSH draft when a one-shot launch stops on missing trust", async () => {
  const calls = [];
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    windowRef: {},
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async listSshTrustEntries() {
        calls.push(["list-trust"]);
        return [];
      },
      async probeSshHostKeys(payload) {
        calls.push(["probe-trust", payload]);
        return [
          {
            host: payload.host,
            port: payload.port,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAcreated",
            fingerprintSha256: "SHA256:created"
          }
        ];
      }
    },
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }],
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await assert.rejects(
    () =>
      controller.launchConnectionLaunch(
        {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: createThemeProfile("#111111"),
          inactiveThemeProfile: createThemeProfile("#121212"),
          remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
          remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
        },
        { name: "SSH ixpqtwnk@carpo.uberspace.de:22", seedDraftOnMissingTrust: true }
      ),
    /No trusted host key is stored for carpo\.uberspace\.de:22/
  );

  assert.deepEqual(calls.filter((entry) => entry[0] === "probe-trust"), [
    ["probe-trust", { host: "carpo.uberspace.de", port: 22 }]
  ]);
  assert.equal(ui.draftKindSelectEl.value, "ssh");
  assert.equal(ui.draftNameInputEl.value, "SSH ixpqtwnk@carpo.uberspace.de:22");
  assert.equal(controller.getDraftState()?.launch?.remoteConnection?.host, "carpo.uberspace.de");
  assert.equal(ui.sshTrustFingerprintInputEl.value, "SHA256:created");
});

test("connection profile runtime controller rejects malformed SSH trust create payloads deterministically", async () => {
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    windowRef: {},
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-guided",
            name: "Guided SSH",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: ["ssh"],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops-new.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [];
      },
      async probeSshHostKeys(payload) {
        return [
          {
            host: payload.host,
            port: payload.port,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAcreated",
            fingerprintSha256: "SHA256:created"
          }
        ];
      },
      async createSshTrustEntry() {
        return {
          id: "",
          host: "",
          port: 0,
          keyType: "",
          publicKey: "",
          fingerprintSha256: ""
        };
      }
    },
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }],
    getSessions: () => [],
    getActiveSessionId: () => "",
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await controller.loadProfiles();
  ui.selectEl.value = "ops-guided";
  ui.selectEl.dispatch("change");
  await assert.rejects(
    () => controller.applyProfileById("ops-guided"),
    /No trusted host key is stored/
  );
  await assert.rejects(
    () => controller.saveTrustEntryFlow(),
    /SSH trust entry API returned an invalid trust entry/
  );
});

test("connection profile runtime controller rejects malformed create and update payloads deterministically", async () => {
  const ui = createConnectionProfileUiRefs();
  const session = {
    id: "s-local",
    name: "Local Session",
    deckId: "default",
    kind: "local",
    shell: "bash",
    cwd: "/workspace",
    startCwd: "/workspace",
    startCommand: "npm test",
    env: {},
    tags: ["local"],
    themeProfile: createThemeProfile("#010101"),
    activeThemeProfile: createThemeProfile("#020202"),
    inactiveThemeProfile: createThemeProfile("#030303")
  };
  const controller = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...ui,
    api: {
      async createConnectionProfile() {
        return {
          id: "",
          name: "",
          launch: null
        };
      },
      async updateConnectionProfile(profileId) {
        return {
          id: profileId,
          name: "",
          launch: null
        };
      }
    },
    getSessions: () => [session],
    getSessionById: (sessionId) => (sessionId === session.id ? session : null),
    getActiveSessionId: () => session.id,
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await assert.rejects(
    () => controller.createProfileFromSession(session.id, "Broken Profile"),
    /Connection profile API returned an invalid profile record for connection profile save/
  );

  controller.replaceProfiles([
    {
      id: "ops-local",
      name: "Ops Local",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/workspace",
        startCommand: "",
        env: {},
        tags: [],
        activeThemeProfile: createThemeProfile("#111111"),
        inactiveThemeProfile: createThemeProfile("#121212")
      }
    }
  ]);

  await assert.rejects(
    () => controller.renameProfileById("ops-local", "Ops Local Updated"),
    /Connection profile API returned an invalid profile record for connection profile rename/
  );
});

test("connection profile runtime controller exposes fail-closed draft and trust helper branches", async () => {
  const ui = createConnectionProfileUiRefs();
  const controller = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...ui,
    api: {},
    getSessionById: () => null,
    getActiveSessionId: () => "",
    defaultThemeProfile: createThemeProfile("#090909")
  });

  assert.equal(controller.getProfile(""), null);
  assert.equal(controller.getProfile("missing"), null);
  assert.equal(controller.removeProfile(""), false);
  assert.equal(controller.removeProfile("missing"), false);
  assert.deepEqual(await controller.refreshSshTrustEntries(), []);
  assert.throws(
    () => controller.loadDraftFromActiveSession(),
    /No active session to load into a connection profile draft/
  );
  assert.throws(
    () => controller.loadDraftFromActiveSession({ id: "s-broken", name: "Broken" }),
    /Session launch settings are incomplete/
  );
  await assert.rejects(() => controller.applyProfileById("missing"), /Unknown connection profile/);

  await controller.newDraftFlow("ssh");
  await assert.rejects(() => controller.saveTrustEntryFlow(), /Enter an SSH host and port before trusting a host key/);
  await assert.rejects(() => controller.deleteTrustEntryFlow(), /Select a trusted SSH host key to delete/);
});

test("connection profile runtime controller surfaces secret and probing precondition errors deterministically", async () => {
  const inlineUi = createConnectionProfileUiRefs();
  const inlineSecretController = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...inlineUi,
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-inline",
            name: "Ops Inline",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: [],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [
          {
            id: "trust-inline",
            host: "ops.example",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
            fingerprintSha256: "SHA256:existing"
          }
        ];
      }
    },
    requestSecret: null,
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await inlineSecretController.loadProfiles();
  await assert.rejects(
    () => inlineSecretController.applyProfileById("ops-inline"),
    /SSH runtime-secret prompt is unavailable/
  );

  const promptUi = createConnectionProfileUiRefs();
  const promptController = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...promptUi,
    requestSecret: async () => "   ",
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-prompt",
            name: "Ops Prompt",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: [],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "keyboardInteractive" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [
          {
            id: "trust-prompt",
            host: "ops.example",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
            fingerprintSha256: "SHA256:existing"
          }
        ];
      }
    },
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await promptController.loadProfiles();
  await assert.rejects(
    () => promptController.applyProfileById("ops-prompt"),
    /SSH secret is required for password and keyboard-interactive SSH launches/
  );

  const invalidHostUi = createConnectionProfileUiRefs();
  const invalidHostController = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...invalidHostUi,
    requestSecret: async () => "secret",
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-invalid",
            name: "Ops Invalid",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: [],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "", port: 0, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [];
      }
    },
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await invalidHostController.loadProfiles();
  await assert.rejects(
    () => invalidHostController.applyProfileById("ops-invalid"),
    /Enter an SSH host and port before launching this SSH connection/
  );

  const probingUi = createConnectionProfileUiRefs();
  const probingController = createConnectionProfileRuntimeController({
    documentRef: createDocumentRef(),
    ...probingUi,
    requestSecret: async () => "secret",
    api: {
      async listConnectionProfiles() {
        return [
          {
            id: "ops-probe",
            name: "Ops Probe",
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: [],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async listSshTrustEntries() {
        return [];
      }
    },
    defaultThemeProfile: createThemeProfile("#090909")
  });

  await probingController.loadProfiles();
  probingController.setDraftState({
    mode: "profile",
    profileId: "ops-probe",
    name: "Ops Probe",
    launch: probingController.getProfile("ops-probe").launch
  });
  await assert.rejects(() => probingController.applyProfileById("ops-probe"), /SSH host-key probing is not available/);
});
