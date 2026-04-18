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
