import test from "node:test";
import assert from "node:assert/strict";

import { createConnectionProfileRuntimePresentation } from "../src/public/connection-profile-runtime-presentation.js";

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
    }
  };
}

function createConnectionProfileUiRefs() {
  return {
    selectEl: createElement("select"),
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
    sshTrustGuidanceEl: createElement("p"),
    sshTrustProbeBtn: createElement("button"),
    sshProbeSelectEl: createElement("select"),
    sshTrustSelectEl: createElement("select"),
    sshTrustKeyTypeInputEl: createElement("input"),
    sshTrustFingerprintInputEl: createElement("input"),
    sshTrustPublicKeyTextareaEl: createElement("textarea"),
    sshTrustCompareEl: createElement("section"),
    sshTrustCompareStatusEl: createElement("p"),
    sshTrustCurrentKeyTypeInputEl: createElement("input"),
    sshTrustCurrentFingerprintInputEl: createElement("input"),
    sshTrustCandidateKeyTypeInputEl: createElement("input"),
    sshTrustCandidateFingerprintInputEl: createElement("input"),
    sshTrustRefreshBtn: createElement("button"),
    sshTrustSaveBtn: createElement("button"),
    sshTrustDeleteBtn: createElement("button"),
    sshTrustReplaceBtn: createElement("button"),
    deleteConfirmEl: createElement("div"),
    deleteConfirmMessageEl: createElement("p"),
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

function createPresentation(overrides = {}) {
  const ui = createConnectionProfileUiRefs();
  const presentation = createConnectionProfileRuntimePresentation({
    documentRef: createDocumentRef(),
    refs: ui,
    defaultThemeProfile: createThemeProfile("#090909"),
    ...overrides
  });
  return { ui, presentation };
}

test("connection profile runtime presentation exposes fail-closed helper branches", () => {
  const { presentation } = createPresentation();

  assert.equal(presentation.getCurrentSshTrustTarget(), null);
  assert.equal(presentation.findSshTrustConflictEntry({ host: "ops.example", port: 22 }, null), null);
  assert.doesNotThrow(() => presentation.syncDraftStateFromInputs());
  assert.doesNotThrow(() => presentation.renderDraftComputedState());
  assert.doesNotThrow(() => presentation.renderDraft());

  presentation.updateSshLifecycleState({
    sshTrustEntries: [{ id: "t-1", host: "ops.example", port: 22, keyType: "ssh-ed25519", publicKey: "AAA" }],
    selectedSshTrustEntryId: "t-1",
    sshHostKeyProbeCandidates: [{ id: "p-1", host: "ops.example", port: 22, keyType: "ssh-ed25519", publicKey: "BBB" }],
    selectedSshProbeCandidateId: "p-1",
    probingSshHostKeys: true,
    sshProbeTargetKey: "ops.example:22",
    loadingSshTrustEntries: true
  });
  presentation.clearSshTrustState();

  assert.deepEqual(presentation.getSshLifecycleState(), {
    sshTrustEntries: [],
    selectedSshTrustEntryId: "",
    sshHostKeyProbeCandidates: [],
    selectedSshProbeCandidateId: "",
    probingSshHostKeys: true,
    sshProbeTargetKey: "",
    loadingSshTrustEntries: true
  });
});

test("connection profile runtime presentation supports raw draft parsing when guided controls are absent", () => {
  const draftLaunchTextareaEl = createElement("textarea");
  draftLaunchTextareaEl.value = JSON.stringify({
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "",
    env: {},
    tags: ["ssh"],
    activeThemeProfile: createThemeProfile("#999999"),
    inactiveThemeProfile: createThemeProfile("#aaaaaa"),
    remoteConnection: { host: "raw.example", port: 2222, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
  });
  const presentation = createConnectionProfileRuntimePresentation({
    documentRef: createDocumentRef(),
    refs: {
      draftLaunchTextareaEl
    },
    defaultThemeProfile: createThemeProfile("#090909")
  });

  presentation.setDraftState({
    mode: "blank",
    name: "Raw Draft",
    launch: {
      kind: "local",
      deckId: "default",
      shell: "bash",
      startCwd: "/workspace",
      startCommand: "",
      env: {},
      tags: [],
      activeThemeProfile: createThemeProfile("#111111"),
      inactiveThemeProfile: createThemeProfile("#222222")
    }
  });
  presentation.syncDraftStateFromInputs();
  presentation.setSelectedSshTrustEntryId("trust-raw");
  presentation.setSelectedSshProbeCandidateId("probe-raw");

  assert.equal(presentation.getDraftState().launch.kind, "ssh");
  assert.equal(presentation.getDraftState().launch.remoteConnection.host, "raw.example");
  assert.equal(presentation.getDraftState().launch.remoteConnection.port, 2222);
  assert.equal(presentation.getCurrentSshTrustTarget().host, "raw.example");
  assert.equal(presentation.getSshLifecycleState().selectedSshTrustEntryId, "trust-raw");
  assert.equal(presentation.getSshLifecycleState().selectedSshProbeCandidateId, "probe-raw");
});

test("connection profile runtime presentation falls back to the first saved profile and clears stale delete confirmation", () => {
  const { ui, presentation } = createPresentation();

  presentation.replaceProfiles([
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
        inactiveThemeProfile: createThemeProfile("#222222")
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
        activeThemeProfile: createThemeProfile("#333333"),
        inactiveThemeProfile: createThemeProfile("#444444"),
        remoteConnection: { host: "ops.example", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
      }
    }
  ]);

  presentation.setSelectedProfileId("missing");
  presentation.setPendingDeleteProfileId("other-profile");
  presentation.syncSelection();

  assert.equal(presentation.getSelectedProfileId(), "ops-local");
  assert.equal(presentation.getPendingDeleteProfileId(), "");
  assert.equal(ui.selectEl.value, "ops-local");
  assert.equal(ui.selectEl.disabled, false);
  assert.equal(ui.applyBtn.disabled, false);
  assert.equal(ui.renameBtn.disabled, false);
  assert.equal(ui.duplicateBtn.disabled, false);
  assert.equal(ui.deleteBtn.disabled, false);
});

test("connection profile runtime presentation clears probed SSH host keys when the draft target changes", () => {
  const { ui, presentation } = createPresentation({
    getSessionById: () => null,
    getActiveSessionId: () => ""
  });

  presentation.setDraftState({
    mode: "blank",
    name: "SSH Draft",
    launch: {
      kind: "ssh",
      deckId: "default",
      shell: "ssh",
      startCwd: "~",
      startCommand: "",
      env: {},
      tags: ["ssh"],
      activeThemeProfile: createThemeProfile("#555555"),
      inactiveThemeProfile: createThemeProfile("#666666"),
      remoteConnection: { host: "old.example", port: 22, username: "ops" },
      remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
    }
  });
  presentation.updateSshLifecycleState({
    sshHostKeyProbeCandidates: [
      { id: "probe-1", host: "old.example", port: 22, keyType: "ssh-ed25519", publicKey: "AAA", fingerprintSha256: "SHA256:old" }
    ],
    selectedSshProbeCandidateId: "probe-1",
    sshProbeTargetKey: "old.example:22"
  });

  ui.draftRemoteHostInputEl.value = "new.example";
  presentation.syncDraftStateFromInputs();

  assert.equal(presentation.getDraftState().launch.remoteConnection.host, "new.example");
  assert.deepEqual(presentation.getSshProbeCandidatesForTarget({ host: "new.example", port: 22 }), []);
  assert.deepEqual(presentation.getSshLifecycleState().sshHostKeyProbeCandidates, []);
  assert.equal(presentation.getSshLifecycleState().selectedSshProbeCandidateId, "");
  assert.equal(presentation.getSshLifecycleState().sshProbeTargetKey, "");
});

test("connection profile runtime presentation renders and reloads saved-profile drafts through selection changes", () => {
  const { ui, presentation } = createPresentation({
    getDecks: () => [{ id: "default", name: "Default" }, { id: "ops", name: "Ops" }]
  });

  presentation.replaceProfiles([
    {
      id: "ops-ssh",
      name: "Ops SSH",
      launch: {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "tmux a || tmux",
        env: { LANG: "en_US.UTF-8" },
        tags: ["ops", "ssh"],
        activeThemeProfile: createThemeProfile("#777777"),
        inactiveThemeProfile: createThemeProfile("#888888"),
        remoteConnection: { host: "ops.example", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
      }
    }
  ]);

  presentation.setSelectedProfileId("ops-ssh");
  presentation.resetDraftFromSelectedProfile();

  assert.equal(ui.draftNameInputEl.value, "Ops SSH");
  assert.equal(ui.draftKindSelectEl.value, "ssh");
  assert.equal(ui.draftRemoteHostInputEl.value, "ops.example");
  assert.equal(ui.draftRemotePortInputEl.value, "22");
  assert.equal(ui.draftRemoteUsernameInputEl.value, "ops");
  assert.equal(ui.draftRemotePrivateKeyPathInputEl.value, "~/.ssh/id_ed25519");
  assert.match(ui.draftStatusEl.textContent, /Editing saved profile \[ops-ssh\]/i);
});
