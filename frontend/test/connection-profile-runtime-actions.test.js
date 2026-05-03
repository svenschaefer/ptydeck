import test from "node:test";
import assert from "node:assert/strict";

import { createConnectionProfileRuntimeActions } from "../src/public/connection-profile-runtime-actions.js";

test("connection profile runtime actions keep cancelled apply flows non-destructive", async () => {
  const createSessionCalls = [];
  const runtimeSecretInputEl = { value: "secret" };
  const profiles = [
    {
      id: "ops",
      name: "Ops SSH",
      launch: { kind: "ssh", remoteAuth: { method: "password" } }
    }
  ];
  const actions = createConnectionProfileRuntimeActions({
    api: {
      async createSession(payload) {
        createSessionCalls.push(payload);
        return { id: "s-new", name: "New", deckId: "ops" };
      }
    },
    getProfile: (profileId) => profiles.find((profile) => profile.id === profileId) || null,
    ensureTrustedHostKeyBeforeLaunch: async () => "",
    promptForLaunchSecret: async () => ({ ok: false, remoteSecret: undefined, cancelled: true }),
    runtimeSecretInputEl
  });

  const feedback = await actions.applyProfileById("ops");
  assert.equal(feedback, "Connection profile apply cancelled for [ops] Ops SSH.");
  assert.deepEqual(createSessionCalls, []);
  assert.equal(runtimeSecretInputEl.value, "secret");
});

test("connection profile runtime actions launch ad hoc SSH sessions through the shared trust and secret gates", async () => {
  const calls = [];
  const runtimeEvents = [];
  const runtimeSecretInputEl = { value: "inline-secret" };
  const actions = createConnectionProfileRuntimeActions({
    api: {
      async createSession(payload) {
        calls.push(["create-session", payload]);
        return { id: "s-ssh", name: "carpo", deckId: "ops" };
      }
    },
    normalizeConnectionLaunch: (launch) => launch,
    ensureTrustedHostKeyBeforeLaunch: async (launchContext) => {
      calls.push(["ensure-trust", launchContext]);
      return "";
    },
    promptForLaunchSecret: async (launchContext) => {
      calls.push(["prompt-secret", launchContext.name]);
      return { ok: true, remoteSecret: "pw", cancelled: false };
    },
    runtimeSecretInputEl,
    applyRuntimeEvent: (event) => runtimeEvents.push(event),
    setActiveDeck: (deckId) => calls.push(["set-active-deck", deckId]),
    setActiveSession: (sessionId) => calls.push(["set-active-session", sessionId]),
    requestRender: () => calls.push(["render"]),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    setStatus: (message) => calls.push(["status", message]),
    formatSessionToken: (sessionId) => (sessionId === "s-ssh" ? "8" : sessionId),
    formatSessionDisplayName: (session) => String(session?.name || "")
  });

  assert.equal(
    await actions.launchConnectionLaunch(
      {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: {},
        tags: [],
        activeThemeProfile: {},
        inactiveThemeProfile: {},
        remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
        remoteAuth: { method: "password" }
      },
      { name: "SSH ixpqtwnk@carpo.uberspace.de:22", seedDraftOnMissingTrust: true }
    ),
    "Started session [8] carpo for ixpqtwnk@carpo.uberspace.de:22."
  );
  assert.equal(runtimeSecretInputEl.value, "");
  assert.deepEqual(runtimeEvents, [
    {
      type: "session.created",
      session: { id: "s-ssh", name: "carpo", deckId: "ops" }
    }
  ]);
  assert.deepEqual(calls, [
    [
      "ensure-trust",
      {
        id: "",
        name: "SSH ixpqtwnk@carpo.uberspace.de:22",
        launch: {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: {},
          inactiveThemeProfile: {},
          remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
          remoteAuth: { method: "password" }
        },
        seedDraftOnMissingTrust: true
      }
    ],
    ["prompt-secret", "SSH ixpqtwnk@carpo.uberspace.de:22"],
    [
      "create-session",
      {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: {},
        tags: [],
        activeThemeProfile: {},
        inactiveThemeProfile: {},
        remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
        remoteAuth: { method: "password" },
        remoteSecret: "pw"
      }
    ],
    ["set-active-deck", "ops"],
    ["set-active-session", "s-ssh"],
    ["render"],
    ["feedback", "Started session [8] carpo for ixpqtwnk@carpo.uberspace.de:22."],
    ["status", "Started session [8] carpo for ixpqtwnk@carpo.uberspace.de:22."]
  ]);
});

test("connection profile runtime actions clear stale state on load failure", async () => {
  const errors = [];
  const replaceCalls = [];
  let trustCleared = 0;
  const actions = createConnectionProfileRuntimeActions({
    api: {
      async listConnectionProfiles() {
        throw new Error("boom");
      }
    },
    clearSshTrustState: () => {
      trustCleared += 1;
    },
    replaceProfiles: (profiles) => {
      replaceCalls.push(profiles);
      return profiles;
    },
    listProfiles: () => [],
    setError: (message) => errors.push(message),
    getErrorMessage: (_, fallback) => fallback
  });

  const loaded = await actions.loadProfiles();
  assert.deepEqual(loaded, []);
  assert.deepEqual(errors, ["Failed to load connection profiles."]);
  assert.equal(trustCleared, 1);
  assert.deepEqual(replaceCalls, [[]]);
});

test("connection profile runtime actions require confirmation before deleting the selected profile", async () => {
  const feedback = [];
  let pendingDeleteProfileId = "";
  let renderCount = 0;
  let profiles = [
    {
      id: "ops",
      name: "Ops SSH",
      launch: { kind: "ssh" }
    }
  ];
  const actions = createConnectionProfileRuntimeActions({
    api: {
      async deleteConnectionProfile(profileId) {
        assert.equal(profileId, "ops");
      }
    },
    getProfile: (profileId) => profiles.find((profile) => profile.id === profileId) || null,
    getSelectedProfile: () => profiles[0] || null,
    removeProfile: (profileId) => {
      profiles = profiles.filter((profile) => profile.id !== profileId);
      return true;
    },
    clearPendingDeleteConfirmation: () => {
      pendingDeleteProfileId = "";
    },
    getPendingDeleteProfileId: () => pendingDeleteProfileId,
    setPendingDeleteProfileId: (value) => {
      pendingDeleteProfileId = value;
    },
    renderDraftComputedState: () => {
      renderCount += 1;
    },
    setCommandFeedback: (message) => feedback.push(["command", message]),
    setStatus: (message) => feedback.push(["status", message])
  });

  assert.equal(
    await actions.deleteSelectedProfileFlow(),
    "Confirm deletion for saved connection profile [ops] Ops SSH."
  );
  assert.equal(pendingDeleteProfileId, "ops");

  assert.equal(
    await actions.deleteSelectedProfileFlow(),
    "Deleted connection profile [ops] Ops SSH."
  );
  assert.equal(pendingDeleteProfileId, "");
  assert.equal(profiles.length, 0);
  assert.equal(renderCount, 2);
  assert.deepEqual(feedback, [
    ["status", "Confirm deletion for saved connection profile [ops] Ops SSH."],
    ["command", "Deleted connection profile [ops] Ops SSH."],
    ["status", "Deleted connection profile [ops] Ops SSH."]
  ]);
});

test("connection profile runtime actions cover profile mutation, draft save, and apply flows", async () => {
  const apiCalls = [];
  const runtimeEvents = [];
  const runtimeSecretInputEl = { value: "inline-secret" };
  const session = { id: "s1", name: "Ops Shell", deckId: "ops" };
  let profiles = [
    {
      id: "ops",
      name: "Ops SSH",
      launch: { kind: "ssh", shell: "ssh", startCwd: "~" }
    }
  ];
  let draftState = {
    mode: "profile",
    profileId: "ops",
    name: "Ops Saved",
    launch: { kind: "local", shell: "bash", startCwd: "/srv/ops" }
  };

  const actions = createConnectionProfileRuntimeActions({
    api: {
      async createConnectionProfile(payload) {
        apiCalls.push(["create-profile", payload]);
        return {
          id: payload.id || payload.name.toLowerCase().replace(/\s+/g, "-"),
          name: payload.name,
          launch: payload.launch
        };
      },
      async updateConnectionProfile(profileId, payload) {
        apiCalls.push(["update-profile", profileId, payload]);
        return {
          id: profileId,
          name: payload.name,
          launch: payload.launch
        };
      },
      async deleteConnectionProfile(profileId) {
        apiCalls.push(["delete-profile", profileId]);
      },
      async createSession(payload) {
        apiCalls.push(["create-session", payload]);
        return { id: "s-launch", name: "Launched", deckId: "ops" };
      }
    },
    getSessionById: (sessionId) => (sessionId === "s1" ? session : null),
    getLaunchForSession: () => ({
      kind: "local",
      shell: "bash",
      startCwd: "/srv/ops",
      activeThemeProfile: {},
      inactiveThemeProfile: {}
    }),
    getProfile: (profileId) => profiles.find((profile) => profile.id === profileId) || null,
    requireUpsertedProfile: (profile) => profile,
    removeProfile: (profileId) => {
      profiles = profiles.filter((profile) => profile.id !== profileId);
      return true;
    },
    getDraftState: () => draftState,
    setDraftState: (nextDraft) => {
      draftState = { ...nextDraft };
    },
    buildPersistedDraftLaunch: () => ({ kind: "local", shell: "bash", startCwd: "/draft" }),
    getSelectedProfile: () => profiles.find((profile) => profile.id === "ops") || null,
    ensureTrustedHostKeyBeforeLaunch: async (profile) => {
      apiCalls.push(["ensure-host-key", profile.id]);
      return "";
    },
    promptForLaunchSecret: async () => ({ ok: true, remoteSecret: "pw", cancelled: false }),
    runtimeSecretInputEl,
    applyRuntimeEvent: (event) => runtimeEvents.push(event),
    setActiveDeck: (deckId) => apiCalls.push(["set-active-deck", deckId]),
    setActiveSession: (sessionId) => apiCalls.push(["set-active-session", sessionId]),
    requestRender: () => apiCalls.push(["render"]),
    formatSessionToken: (sessionId) => (sessionId === "s1" ? "1" : "8"),
    formatSessionDisplayName: (value) => String(value?.name || "")
  });

  assert.equal(
    await actions.createProfileFromSession("s1", "Saved Ops", { id: "saved-ops" }),
    "Saved connection profile [saved-ops] Saved Ops from [1] Ops Shell."
  );
  assert.equal(
    await actions.renameProfileById("ops", "Prod SSH"),
    "Renamed connection profile [ops] to Prod SSH."
  );
  assert.equal(
    await actions.duplicateProfileById("ops", "Ops Copy"),
    "Duplicated connection profile [ops] Ops SSH as [ops-copy] Ops Copy."
  );
  assert.equal(
    await actions.saveDraftById(),
    "Updated connection profile [ops] Ops Saved."
  );

  draftState = {
    mode: "blank",
    profileId: "",
    name: "Fresh Shell",
    launch: {}
  };
  assert.equal(
    await actions.saveDraftById(),
    "Saved connection profile [fresh-shell] Fresh Shell."
  );
  assert.deepEqual(draftState, {
    mode: "profile",
    profileId: "fresh-shell",
    name: "Fresh Shell",
    launch: { kind: "local", shell: "bash", startCwd: "/draft" }
  });

  assert.equal(
    await actions.applyProfileById("ops"),
    "Started session [8] Launched from connection profile [ops] Ops SSH."
  );
  assert.equal(runtimeSecretInputEl.value, "");
  assert.deepEqual(runtimeEvents, [
    {
      type: "session.created",
      session: { id: "s-launch", name: "Launched", deckId: "ops" }
    }
  ]);

  assert.equal(
    await actions.deleteProfileById("ops"),
    "Deleted connection profile [ops] Ops SSH."
  );
  assert.equal(profiles.some((profile) => profile.id === "ops"), false);
  assert.deepEqual(apiCalls, [
    [
      "create-profile",
      {
        id: "saved-ops",
        name: "Saved Ops",
        launch: {
          kind: "local",
          shell: "bash",
          startCwd: "/srv/ops",
          activeThemeProfile: {},
          inactiveThemeProfile: {}
        }
      }
    ],
    [
      "update-profile",
      "ops",
      {
        name: "Prod SSH"
      }
    ],
    [
      "create-profile",
      {
        name: "Ops Copy",
        launch: { kind: "ssh", shell: "ssh", startCwd: "~" }
      }
    ],
    [
      "update-profile",
      "ops",
      {
        name: "Ops Saved",
        launch: { kind: "local", shell: "bash", startCwd: "/draft" }
      }
    ],
    [
      "create-profile",
      {
        name: "Fresh Shell",
        launch: { kind: "local", shell: "bash", startCwd: "/draft" }
      }
    ],
    ["ensure-host-key", "ops"],
    [
      "create-session",
      {
        connectionProfileId: "ops",
        remoteSecret: "pw"
      }
    ],
    ["set-active-deck", "ops"],
    ["set-active-session", "s-launch"],
    ["render"],
    ["delete-profile", "ops"]
  ]);
});

test("connection profile runtime actions fail closed on missing inputs and keep save-only draft flows bounded", async () => {
  const profile = { id: "ops", name: "Ops SSH", launch: {} };
  const validationActions = createConnectionProfileRuntimeActions({
    getProfile: (profileId) => (profileId === "ops" ? profile : null),
    getDraftState: () => ({ mode: "blank", profileId: "", name: "", launch: {} })
  });

  await assert.rejects(validationActions.createProfileFromSession(null, "Ops"), /Session is required to save a connection profile\./);
  await assert.rejects(validationActions.createProfileFromSession({ id: "s1" }, ""), /Connection profile name is required\./);
  await assert.rejects(
    validationActions.createProfileFromSession({ id: "s1" }, "Ops"),
    /Session launch settings are incomplete and cannot be saved as a connection profile\./
  );
  await assert.rejects(validationActions.applyProfileById("missing"), /Unknown connection profile: missing/);
  await assert.rejects(validationActions.renameProfileById("ops", ""), /Connection profile name is required\./);
  await assert.rejects(validationActions.duplicateProfileById("ops", ""), /Connection profile name is required\./);
  await assert.rejects(validationActions.deleteProfileById("missing"), /Unknown connection profile: missing/);
  await assert.rejects(validationActions.saveDraftById(), /Connection profile name is required\./);

  const builderlessActions = createConnectionProfileRuntimeActions({
    getDraftState: () => ({ mode: "blank", profileId: "", name: "Draft", launch: {} })
  });
  await assert.rejects(builderlessActions.saveDraftById(), /Draft launch builder unavailable\./);

  const feedback = [];
  const runtimeSecretInputEl = { value: "inline-secret" };
  let draftState = {
    mode: "blank",
    profileId: "",
    name: "Draft",
    launch: {}
  };
  const boundedActions = createConnectionProfileRuntimeActions({
    api: {
      async createConnectionProfile(payload) {
        runtimeSecretInputEl.value = "";
        return {
          id: "draft",
          name: payload.name,
          launch: payload.launch
        };
      }
    },
    getDraftState: () => draftState,
    setDraftState: (nextDraft) => {
      draftState = { ...nextDraft };
    },
    buildPersistedDraftLaunch: () => ({ kind: "local", shell: "bash", startCwd: "/draft" }),
    getSelectedProfile: () => null,
    runtimeSecretInputEl,
    setCommandFeedback: (message) => feedback.push(["command", message]),
    setStatus: (message) => feedback.push(["status", message]),
    requireUpsertedProfile: (profile) => profile
  });

  assert.equal(
    await boundedActions.saveAndLaunchDraftFlow(),
    "Saved connection profile [draft] Draft."
  );
  assert.equal(runtimeSecretInputEl.value, "inline-secret");
  assert.deepEqual(feedback, [
    ["command", "Saved connection profile [draft] Draft."],
    ["status", "Saved connection profile [draft] Draft."]
  ]);
});

test("connection profile runtime actions cover guided draft helpers and selected-profile ui flows", async () => {
  const feedback = [];
  const sessions = {
    s1: {
      id: "s1",
      name: "Ops Shell",
      deckId: "ops",
      shell: "bash",
      startCwd: "/srv/ops",
      startCommand: "",
      env: {},
      tags: ["ops"],
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" }
    }
  };
  let draftState = null;
  let selectedProfile = {
    id: "ops",
    name: "Ops SSH",
    launch: { kind: "ssh", shell: "ssh", startCwd: "~" }
  };
  let pendingDeleteProfileId = "";
  let renderCount = 0;

  const actions = createConnectionProfileRuntimeActions({
    api: {
      async createConnectionProfile(payload) {
        return {
          id: "flow",
          name: payload.name,
          launch: payload.launch
        };
      },
      async createSession() {
        return { id: "s-new", name: "New", deckId: "ops" };
      }
    },
    getSessionById: (sessionId) => sessions[sessionId] || null,
    getActiveSessionId: () => "s1",
    getLaunchForSession: (session) => ({
      kind: "local",
      shell: session.shell,
      startCwd: session.startCwd,
      activeThemeProfile: session.activeThemeProfile,
      inactiveThemeProfile: session.inactiveThemeProfile
    }),
    getProfile: (profileId) => (selectedProfile && selectedProfile.id === profileId ? selectedProfile : null),
    getSelectedProfile: () => selectedProfile,
    buildBlankConnectionProfileLaunch: ({ deckId, kind, defaultThemeProfile }) => ({
      deckId,
      kind,
      activeThemeProfile: defaultThemeProfile,
      inactiveThemeProfile: defaultThemeProfile
    }),
    defaultThemeProfile: { background: "#000000" },
    defaultDeckId: "default",
    setDraftState: (nextDraft) => {
      draftState = { ...nextDraft };
    },
    loadDraftFromActiveSession: () => {
      draftState = { mode: "session", profileId: "", name: "Loaded Draft", launch: {} };
    },
    resetDraftFromSelectedProfile: () => {
      draftState = { mode: "profile", profileId: "ops", name: "Reset Draft", launch: {} };
    },
    getDraftNameInputValue: () => "",
    clearPendingDeleteConfirmation: () => {
      pendingDeleteProfileId = "";
    },
    renderDraftComputedState: () => {
      renderCount += 1;
    },
    getPendingDeleteProfileId: () => pendingDeleteProfileId,
    setPendingDeleteProfileId: (value) => {
      pendingDeleteProfileId = value;
    },
    ensureTrustedHostKeyBeforeLaunch: async () => "",
    promptForLaunchSecret: async () => ({ ok: true, remoteSecret: undefined, cancelled: false }),
    applyRuntimeEvent: () => {},
    setActiveDeck: () => {},
    setActiveSession: () => {},
    requestRender: () => {},
    setCommandFeedback: (message) => feedback.push(["command", message]),
    setStatus: (message) => feedback.push(["status", message]),
    formatSessionToken: (sessionId) => (sessionId === "s1" ? "1" : "8"),
    formatSessionDisplayName: (session) => String(session?.name || ""),
    windowRef: {
      prompt() {
        return "";
      }
    },
    requireUpsertedProfile: (profile) => profile
  });

  assert.equal(await actions.createProfileFlow("Saved Via Flow", "s1"), "Saved connection profile [flow] Saved Via Flow from [1] Ops Shell.");
  assert.equal(await actions.createProfileFlow("", "s1"), "");

  assert.equal(await actions.newDraftFlow("ssh"), "Opened a new guided SSH connection profile draft.");
  assert.equal(draftState.launch.kind, "ssh");
  assert.equal(await actions.newDraftFlow("local"), "Opened a new guided local connection profile draft.");
  assert.equal(draftState.launch.kind, "local");

  assert.equal(await actions.loadActiveDraftFlow(), "Loaded the active session into a new connection profile draft.");
  assert.equal(await actions.resetDraftFlow(), "Reset the connection profile draft.");
  assert.equal(await actions.applySelectedProfileFlow(), "Started session [8] New from connection profile [ops] Ops SSH.");
  await assert.rejects(actions.renameSelectedProfileFlow(""), /Enter the desired saved profile name in Profile Name before renaming\./);
  assert.equal(
    await actions.duplicateSelectedProfileFlow(""),
    "Duplicated connection profile [ops] Ops SSH as [flow] Ops SSH Copy."
  );
  assert.equal(
    await actions.requestDeleteSelectedProfileFlow(),
    "Confirm deletion for saved connection profile [ops] Ops SSH."
  );
  assert.equal(
    await actions.cancelDeleteSelectedProfileFlow(),
    "Cancelled deletion of the saved connection profile."
  );

  selectedProfile = null;
  assert.equal(await actions.applySelectedProfileFlow(), "");
  assert.equal(await actions.renameSelectedProfileFlow("Prod SSH"), "");
  assert.equal(await actions.duplicateSelectedProfileFlow("Prod Copy"), "");
  assert.equal(await actions.requestDeleteSelectedProfileFlow(), "");
  assert.equal(await actions.deleteSelectedProfileFlow(), "");

  assert.equal(renderCount, 3);
  assert.deepEqual(feedback, [
    ["command", "Saved connection profile [flow] Saved Via Flow from [1] Ops Shell."],
    ["status", "Saved connection profile [flow] Saved Via Flow from [1] Ops Shell."],
    ["command", "Opened a new guided SSH connection profile draft."],
    ["status", "Opened a new guided SSH connection profile draft."],
    ["command", "Opened a new guided local connection profile draft."],
    ["status", "Opened a new guided local connection profile draft."],
    ["command", "Loaded the active session into a new connection profile draft."],
    ["status", "Loaded the active session into a new connection profile draft."],
    ["command", "Reset the connection profile draft."],
    ["status", "Reset the connection profile draft."],
    ["command", "Started session [8] New from connection profile [ops] Ops SSH."],
    ["status", "Started session [8] New from connection profile [ops] Ops SSH."],
    ["command", "Duplicated connection profile [ops] Ops SSH as [flow] Ops SSH Copy."],
    ["status", "Duplicated connection profile [ops] Ops SSH as [flow] Ops SSH Copy."],
    ["status", "Confirm deletion for saved connection profile [ops] Ops SSH."],
    ["status", "Cancelled deletion of the saved connection profile."]
  ]);
});
