import test from "node:test";
import assert from "node:assert/strict";

import { createConnectionProfileRuntimeAssembly } from "../src/public/connection-profile-runtime-assembly.js";

function createElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    value: "",
    addEventListener() {}
  };
}

test("connection profile runtime assembly wires presentation, ssh lifecycle, actions, bindings, and initial render deterministically", () => {
  const calls = [];
  let presentationOptions = null;
  let sshLifecycleOptions = null;
  let runtimeActionsOptions = null;
  let uiBindingsOptions = null;
  let refreshLookup = null;
  const sentinelRefresh = async () => ["trust-1"];

  createConnectionProfileRuntimeAssembly({
    selectEl: createElement("select"),
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
    draftRemoteHostInputEl: createElement("input"),
    draftRemotePortInputEl: createElement("input"),
    draftRemoteUsernameInputEl: createElement("input"),
    draftRemoteAuthMethodSelectEl: createElement("select"),
    draftRemotePrivateKeyPathInputEl: createElement("input"),
    sshTrustKeyTypeInputEl: createElement("input"),
    sshTrustPublicKeyTextareaEl: createElement("textarea"),
    normalizeText: (value) => String(value || "").trim(),
    normalizeLower: (value) => String(value || "").trim().toLowerCase(),
    authMethodRequiresSecret: (remoteAuth) => remoteAuth?.method === "password",
    createRuntimePresentation(runtimeOptions) {
      presentationOptions = runtimeOptions;
      refreshLookup = runtimeOptions.getRefreshSshTrustEntries;
      return {
        describeSshLaunchContext: () => "context",
        getSshLifecycleState: () => ({}),
        updateSshLifecycleState() {},
        getCurrentSshTrustTarget: () => ({ host: "ops.example", port: 22 }),
        shouldRenderSshTrustTarget: () => true,
        renderDraftComputedState() {
          calls.push("render-draft");
        },
        setStatus() {},
        getSshProbeCandidatesForTarget: () => [],
        getSshTrustEntriesForTarget: () => [],
        findSshTrustConflictEntry: () => null,
        seedDraftOnMissingTrust() {},
        selectProfileForMissingTrust() {},
        getLaunchForSession: () => ({ kind: "local" }),
        getProfile: () => null,
        getSelectedProfile: () => null,
        requireUpsertedProfile: () => ({ id: "ops" }),
        removeProfile() {},
        replaceProfiles() {},
        listProfiles: () => [],
        readPersistedDraftLaunch: () => ({ kind: "local" }),
        getDraftState: () => ({ mode: "blank" }),
        setDraftState() {},
        clearSshTrustState() {},
        loadDraftFromActiveSession() {},
        resetDraftFromSelectedProfile() {},
        getDraftNameInputValue: () => "draft",
        clearPendingDeleteConfirmation() {},
        getPendingDeleteProfileId: () => "",
        setPendingDeleteProfileId() {},
        setSelectedProfileId() {},
        syncSelection() {},
        syncDraftStateFromInputs() {},
        setSelectedSshTrustEntryId() {},
        setSelectedSshProbeCandidateId() {},
        getSelectedProfileId: () => "ops",
        resolveProfile: () => ({ id: "ops" }),
        upsertProfile() {},
        getDraftStateSnapshot: () => ({ mode: "blank" }),
        render() {
          calls.push("render");
        }
      };
    },
    createSshLifecycle(runtimeOptions) {
      sshLifecycleOptions = runtimeOptions;
      return {
        refreshSshTrustEntries: sentinelRefresh,
        promptForLaunchSecret: async () => "secret",
        ensureTrustedHostKeyBeforeLaunch: async () => ({ ok: true }),
        probeSshHostKeysForTarget: async () => ({ candidates: [] }),
        probeSshHostKeysFlow: async () => "probe",
        saveTrustEntryForTarget: async () => ({ feedback: "trusted" }),
        saveTrustEntryFlow: async () => "trust",
        replaceTrustEntryForTarget: async () => ({ feedback: "replaced" }),
        replaceTrustEntryFlow: async () => "replace",
        listSshTrustEntriesForTarget: async () => [],
        deleteTrustEntryForTarget: async () => ({ feedback: "deleted" }),
        deleteTrustEntryFlow: async () => "delete"
      };
    },
    createRuntimeActions(runtimeOptions) {
      runtimeActionsOptions = runtimeOptions;
      return {
        createProfileFromSession: async () => "created",
        applyProfileById: async () => "applied-id",
        renameProfileById: async () => "renamed-id",
        duplicateProfileById: async () => "duplicated-id",
        deleteProfileById: async () => "deleted-id",
        launchConnectionLaunch: async () => "launched",
        saveDraftById: async () => "saved-id",
        saveAndLaunchDraftFlow: async () => "save-launch",
        loadProfiles: async () => "loaded",
        createProfileFlow: async () => "create-flow",
        newDraftFlow: async () => "new-draft",
        loadActiveDraftFlow: async () => "load-active",
        saveDraftFlow: async () => "save-draft",
        resetDraftFlow: async () => "reset-draft",
        applySelectedProfileFlow: async () => "apply-selected",
        duplicateSelectedProfileFlow: async () => "duplicate-selected",
        renameSelectedProfileFlow: async () => "rename-selected",
        requestDeleteSelectedProfileFlow: async () => "request-delete",
        deleteSelectedProfileFlow: async () => "delete-selected",
        cancelDeleteSelectedProfileFlow: async () => "cancel-delete"
      };
    },
    createUiBindings(runtimeOptions) {
      uiBindingsOptions = runtimeOptions;
      return {
        bindUiEvents() {
          calls.push("bind");
        }
      };
    }
  });

  assert.equal(refreshLookup(), sentinelRefresh);
  assert.equal(presentationOptions.defaultDeckId, "default");
  assert.equal(sshLifecycleOptions.describeSshLaunchContext(), "context");
  assert.equal(runtimeActionsOptions.promptForLaunchSecret !== null, true);
  assert.equal(runtimeActionsOptions.ensureTrustedHostKeyBeforeLaunch !== null, true);
  assert.equal(runtimeActionsOptions.buildBlankConnectionProfileLaunch !== null, true);
  assert.equal(uiBindingsOptions.setSelectedProfileId !== null, true);
  assert.equal(uiBindingsOptions.refreshSshTrustEntries, sentinelRefresh);
  assert.equal(uiBindingsOptions.draftInputElements.length, 17);
  assert.deepEqual(calls, ["bind", "render"]);
});

test("connection profile runtime assembly returns the composed public runtime surface", async () => {
  const surface = createConnectionProfileRuntimeAssembly({
    createRuntimePresentation() {
      return {
        describeSshLaunchContext() {},
        getSshLifecycleState: () => ({}),
        updateSshLifecycleState() {},
        getCurrentSshTrustTarget: () => null,
        shouldRenderSshTrustTarget: () => false,
        renderDraftComputedState() {},
        setStatus() {},
        getSshProbeCandidatesForTarget: () => [],
        getSshTrustEntriesForTarget: async () => ["trust-entry"],
        findSshTrustConflictEntry: () => null,
        seedDraftOnMissingTrust() {},
        selectProfileForMissingTrust() {},
        listProfiles: () => ["profile"],
        getProfile: () => "profile-by-id",
        getSelectedProfile: () => "selected-profile",
        getSelectedProfileId: () => "ops",
        resolveProfile: () => "resolved-profile",
        replaceProfiles: () => "replace-profiles",
        upsertProfile: () => "upsert-profile",
        removeProfile: () => "remove-profile",
        getLaunchForSession: () => "launch-for-session",
        loadDraftFromActiveSession: () => "load-draft",
        setDraftState: () => "set-draft",
        getDraftStateSnapshot: () => "draft-state",
        getDraftState: () => ({ mode: "blank" }),
        readPersistedDraftLaunch: () => ({ kind: "local" }),
        clearSshTrustState() {},
        resetDraftFromSelectedProfile() {},
        getDraftNameInputValue: () => "",
        clearPendingDeleteConfirmation() {},
        getPendingDeleteProfileId: () => "",
        setPendingDeleteProfileId() {},
        setSelectedProfileId() {},
        syncSelection() {},
        syncDraftStateFromInputs() {},
        setSelectedSshTrustEntryId() {},
        setSelectedSshProbeCandidateId() {},
        render() {
          return "rendered";
        }
      };
    },
    createSshLifecycle() {
      return {
        refreshSshTrustEntries: async () => ["refreshed"],
        promptForLaunchSecret: async () => "secret",
        ensureTrustedHostKeyBeforeLaunch: async () => ({ ok: true }),
        probeSshHostKeysForTarget: async () => ["probe"],
        probeSshHostKeysFlow: async () => "probe-flow",
        saveTrustEntryForTarget: async () => "save-target",
        saveTrustEntryFlow: async () => "save-flow",
        replaceTrustEntryForTarget: async () => "replace-target",
        replaceTrustEntryFlow: async () => "replace-flow",
        listSshTrustEntriesForTarget: async () => ["trust-list"],
        deleteTrustEntryForTarget: async () => "delete-target",
        deleteTrustEntryFlow: async () => "delete-flow"
      };
    },
    createRuntimeActions() {
      return {
        createProfileFromSession: async () => "create-from-session",
        applyProfileById: async () => "apply-id",
        renameProfileById: async () => "rename-id",
        duplicateProfileById: async () => "duplicate-id",
        deleteProfileById: async () => "delete-id",
        launchConnectionLaunch: async () => "launch",
        saveDraftById: async () => "save-draft-id",
        saveAndLaunchDraftFlow: async () => "save-launch-flow",
        loadProfiles: async () => "load-profiles",
        createProfileFlow: async () => "create-flow",
        newDraftFlow: async () => "new-draft-flow",
        loadActiveDraftFlow: async () => "load-active-draft-flow",
        saveDraftFlow: async () => "save-draft-flow",
        resetDraftFlow: async () => "reset-draft-flow",
        applySelectedProfileFlow: async () => "apply-selected-flow",
        duplicateSelectedProfileFlow: async () => "duplicate-selected-flow",
        renameSelectedProfileFlow: async () => "rename-selected-flow",
        requestDeleteSelectedProfileFlow: async () => "request-delete-flow",
        deleteSelectedProfileFlow: async () => "delete-selected-flow",
        cancelDeleteSelectedProfileFlow: async () => "cancel-delete-flow"
      };
    },
    createUiBindings() {
      return {
        bindUiEvents() {}
      };
    }
  });

  assert.deepEqual(surface.listProfiles(), ["profile"]);
  assert.equal(surface.getProfile(), "profile-by-id");
  assert.equal(surface.getSelectedProfile(), "selected-profile");
  assert.equal(surface.getSelectedProfileId(), "ops");
  assert.equal(surface.resolveProfile(), "resolved-profile");
  assert.equal(surface.replaceProfiles(), "replace-profiles");
  assert.equal(surface.upsertProfile(), "upsert-profile");
  assert.equal(surface.removeProfile(), "remove-profile");
  assert.equal(surface.getLaunchForSession(), "launch-for-session");
  assert.equal(await surface.createProfileFromSession(), "create-from-session");
  assert.equal(await surface.launchConnectionLaunch(), "launch");
  assert.equal(await surface.saveDraftById(), "save-draft-id");
  assert.equal(surface.loadDraftFromActiveSession(), "load-draft");
  assert.equal(surface.setDraftState(), "set-draft");
  assert.equal(surface.getDraftState(), "draft-state");
  assert.equal(await surface.applyProfileById(), "apply-id");
  assert.equal(await surface.renameProfileById(), "rename-id");
  assert.equal(await surface.duplicateProfileById(), "duplicate-id");
  assert.equal(await surface.deleteProfileById(), "delete-id");
  assert.equal(await surface.loadProfiles(), "load-profiles");
  assert.equal(await surface.createProfileFlow(), "create-flow");
  assert.equal(await surface.newDraftFlow(), "new-draft-flow");
  assert.equal(await surface.loadActiveDraftFlow(), "load-active-draft-flow");
  assert.equal(await surface.saveDraftFlow(), "save-draft-flow");
  assert.equal(await surface.saveAndLaunchDraftFlow(), "save-launch-flow");
  assert.equal(await surface.resetDraftFlow(), "reset-draft-flow");
  assert.equal(await surface.applySelectedProfileFlow(), "apply-selected-flow");
  assert.equal(await surface.duplicateSelectedProfileFlow(), "duplicate-selected-flow");
  assert.equal(await surface.renameSelectedProfileFlow(), "rename-selected-flow");
  assert.equal(await surface.requestDeleteSelectedProfileFlow(), "request-delete-flow");
  assert.equal(await surface.deleteSelectedProfileFlow(), "delete-selected-flow");
  assert.equal(await surface.cancelDeleteSelectedProfileFlow(), "cancel-delete-flow");
  assert.deepEqual(await surface.refreshSshTrustEntries(), ["refreshed"]);
  assert.deepEqual(await surface.listSshTrustEntriesForTarget(), ["trust-list"]);
  assert.deepEqual(await surface.probeSshHostKeysForTarget(), ["probe"]);
  assert.equal(await surface.saveTrustEntryForTarget(), "save-target");
  assert.equal(await surface.replaceTrustEntryForTarget(), "replace-target");
  assert.equal(await surface.deleteTrustEntryForTarget(), "delete-target");
  assert.equal(await surface.saveTrustEntryFlow(), "save-flow");
  assert.equal(await surface.replaceTrustEntryFlow(), "replace-flow");
  assert.equal(await surface.deleteTrustEntryFlow(), "delete-flow");
  assert.equal(surface.render(), "rendered");
});
