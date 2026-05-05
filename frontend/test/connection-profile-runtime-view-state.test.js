import test from "node:test";
import assert from "node:assert/strict";

import { buildConnectionProfileDraftViewState } from "../src/public/connection-profile-runtime-view-state.js";

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

test("connection profile draft view state stays fail-closed for non-SSH drafts", () => {
  const launch = {
    kind: "local",
    deckId: "default",
    shell: "bash",
    startCwd: "/workspace",
    startCommand: "",
    env: {},
    tags: [],
    activeThemeProfile: createThemeProfile("#111111"),
    inactiveThemeProfile: createThemeProfile("#222222")
  };

  const viewState = buildConnectionProfileDraftViewState({
    draftState: { mode: "blank", name: "New Local Connection", launch },
    selectedProfile: null,
    currentLaunch: launch,
    pendingDeleteProfileId: "",
    target: null,
    matchingTrustEntries: [],
    probeCandidates: [],
    api: {}
  });

  assert.equal(viewState.summaryText, "No saved connection profile selected. You can still save and launch the draft below.");
  assert.equal(viewState.sshFieldsHidden, true);
  assert.equal(viewState.privateKeyFieldHidden, true);
  assert.equal(viewState.authHintText, "");
  assert.equal(viewState.secretHintText, "");
  assert.equal(viewState.draftStatusText, "Editing a new unsaved local connection profile.");
  assert.equal(viewState.deleteButtonText, "Delete Saved");
  assert.equal(viewState.deleteConfirmHidden, true);
  assert.equal(viewState.deleteConfirmMessageText, "");
  assert.deepEqual(viewState.trustOptions, [
    {
      value: "",
      label: "Switch to SSH to manage trust entries",
      disabled: true,
      documentRef: null
    }
  ]);
  assert.deepEqual(viewState.probeOptions, [
    {
      value: "",
      label: "Switch to SSH to fetch host keys",
      disabled: true,
      documentRef: null
    }
  ]);
  assert.equal(viewState.trustGuidanceText, "SSH trust entries are only used for SSH profiles.");
  assert.equal(viewState.trustStatusText, "SSH trust entries are only used for SSH profiles.");
  assert.equal(viewState.trustProbeDisabled, true);
  assert.equal(viewState.trustRefreshDisabled, true);
  assert.equal(viewState.trustSaveDisabled, true);
  assert.equal(viewState.trustDeleteDisabled, true);
  assert.equal(viewState.trustReplaceDisabled, true);
});

test("connection profile draft view state exposes SSH rotation review and action gating", () => {
  const launch = {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "",
    env: {},
    tags: ["ops"],
    activeThemeProfile: createThemeProfile("#111111"),
    inactiveThemeProfile: createThemeProfile("#222222"),
    remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
    remoteAuth: { method: "password" }
  };
  const selectedProfile = { id: "ops-ssh", name: "Ops SSH", launch };
  const trustEntry = {
    id: "trust-rsa-old",
    host: "carpo.uberspace.de",
    port: 22,
    keyType: "ssh-rsa",
    publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCold",
    fingerprintSha256: "SHA256:old-rsa"
  };
  const probeCandidate = {
    id: "probe-rsa-new",
    host: "carpo.uberspace.de",
    port: 22,
    keyType: "ssh-rsa",
    publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew",
    fingerprintSha256: "SHA256:new-rsa"
  };

  const viewState = buildConnectionProfileDraftViewState({
    draftState: { mode: "profile", profileId: "ops-ssh", name: "Ops SSH", launch },
    getProfile: (profileId) => (profileId === "ops-ssh" ? selectedProfile : null),
    selectedProfile,
    currentLaunch: launch,
    pendingDeleteProfileId: "ops-ssh",
    target: { host: "carpo.uberspace.de", port: 22 },
    matchingTrustEntries: [trustEntry],
    probeCandidates: [probeCandidate],
    selectedSshTrustEntryId: "",
    selectedSshProbeCandidateId: "",
    probingSshHostKeys: false,
    loadingSshTrustEntries: false,
    api: {
      listSshTrustEntries() {},
      probeSshHostKeys() {},
      createSshTrustEntry() {},
      deleteSshTrustEntry() {}
    }
  });

  assert.match(viewState.summaryText, /\[ops-ssh\] Ops SSH -> kind=ssh deck=ops shell=ssh target=ixpqtwnk@carpo\.uberspace\.de:22/);
  assert.equal(viewState.sshFieldsHidden, false);
  assert.equal(viewState.privateKeyFieldHidden, true);
  assert.match(viewState.authHintText, /Password auth stores only the method/);
  assert.match(viewState.secretHintText, /masked runtime secret/);
  assert.equal(viewState.draftStatusText, "Editing saved profile [ops-ssh] Ops SSH.");
  assert.equal(viewState.deleteButtonText, "Confirm Delete Saved");
  assert.equal(viewState.deleteConfirmHidden, false);
  assert.match(viewState.deleteConfirmMessageText, /Delete saved connection profile \[ops-ssh\] Ops SSH/);
  assert.equal(viewState.selectedSshTrustEntryId, "trust-rsa-old");
  assert.equal(viewState.selectedSshProbeCandidateId, "probe-rsa-new");
  assert.equal(viewState.trustKeyTypeValue, "ssh-rsa");
  assert.equal(viewState.trustFingerprintValue, "SHA256:new-rsa");
  assert.equal(viewState.trustPublicKeyValue, "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew");
  assert.match(viewState.trustGuidanceText, /Rotation review for carpo\.uberspace\.de:22/);
  assert.equal(viewState.trustStatusText, "Rotation candidate ready for carpo.uberspace.de:22");
  assert.equal(viewState.trustCompareHidden, false);
  assert.equal(viewState.trustCompareStatusText, "SHA256:old-rsa -> SHA256:new-rsa");
  assert.equal(viewState.trustCurrentKeyTypeValue, "ssh-rsa");
  assert.equal(viewState.trustCurrentFingerprintValue, "SHA256:old-rsa");
  assert.equal(viewState.trustCandidateKeyTypeValue, "ssh-rsa");
  assert.equal(viewState.trustCandidateFingerprintValue, "SHA256:new-rsa");
  assert.equal(viewState.trustProbeDisabled, false);
  assert.equal(viewState.trustRefreshDisabled, false);
  assert.equal(viewState.trustSaveDisabled, true);
  assert.equal(viewState.trustDeleteDisabled, false);
  assert.equal(viewState.trustReplaceDisabled, false);
});

test("connection profile draft view state prefers trusted SSH previews without fetched candidates", () => {
  const launch = {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "",
    env: {},
    tags: [],
    activeThemeProfile: createThemeProfile("#333333"),
    inactiveThemeProfile: createThemeProfile("#444444"),
    remoteConnection: { host: "ops.example", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
  };
  const trustedEntry = {
    id: "trust-ed25519",
    host: "ops.example",
    port: 22,
    keyType: "ssh-ed25519",
    publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAexisting",
    fingerprintSha256: "SHA256:existing"
  };

  const viewState = buildConnectionProfileDraftViewState({
    draftState: { mode: "session", profileId: "", name: "Ops Session Profile", launch },
    selectedProfile: null,
    currentLaunch: launch,
    pendingDeleteProfileId: "",
    target: { host: "ops.example", port: 22 },
    matchingTrustEntries: [trustedEntry],
    probeCandidates: [],
    selectedSshTrustEntryId: "missing",
    selectedSshProbeCandidateId: "missing",
    probingSshHostKeys: false,
    loadingSshTrustEntries: true,
    api: {
      listSshTrustEntries() {},
      deleteSshTrustEntry() {}
    }
  });

  assert.equal(viewState.privateKeyFieldHidden, false);
  assert.match(viewState.authHintText, /Private-key auth stores only the optional key path/);
  assert.match(viewState.secretHintText, /key-based auth without prompting/);
  assert.equal(viewState.draftStatusText, "Loaded the active session into a new unsaved draft.");
  assert.equal(viewState.selectedSshTrustEntryId, "trust-ed25519");
  assert.equal(viewState.selectedSshProbeCandidateId, "");
  assert.equal(viewState.trustKeyTypeValue, "ssh-ed25519");
  assert.equal(viewState.trustFingerprintValue, "SHA256:existing");
  assert.equal(viewState.trustPublicKeyValue, "AAAAC3NzaC1lZDI1NTE5AAAAexisting");
  assert.equal(viewState.trustCompareHidden, true);
  assert.equal(viewState.trustProbeDisabled, true);
  assert.equal(viewState.trustRefreshDisabled, true);
  assert.equal(viewState.trustSaveDisabled, true);
  assert.equal(viewState.trustDeleteDisabled, false);
  assert.equal(viewState.trustReplaceDisabled, true);
  assert.deepEqual(viewState.probeOptions, [
    {
      value: "",
      label: "Fetch host keys to review one before trusting it",
      disabled: true,
      documentRef: null
    }
  ]);
});
