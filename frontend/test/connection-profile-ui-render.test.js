import test from "node:test";
import assert from "node:assert/strict";

import {
  applyConnectionProfileDraftViewState,
  renderConnectionProfileProfileSelect,
  setConnectionProfileSelectOptions
} from "../src/public/connection-profile-ui-render.js";

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
    }
  };
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

test("connection profile ui render builds select options deterministically", () => {
  const selectEl = createElement("select");
  const documentRef = createDocumentRef();

  setConnectionProfileSelectOptions(
    selectEl,
    [
      { value: "ops", label: "Ops", documentRef },
      { value: "prod", label: "Prod", disabled: true, documentRef }
    ],
    "prod"
  );

  assert.equal(selectEl.value, "prod");
  assert.equal(selectEl.children.length, 2);
  assert.equal(selectEl.children[0].textContent, "Ops");
  assert.equal(selectEl.children[1].selected, true);
  assert.equal(selectEl.children[1].disabled, true);
});

test("connection profile ui render populates the saved-profile select and stays fail-closed for empty lists", () => {
  const selectEl = createElement("select");
  const documentRef = createDocumentRef();

  renderConnectionProfileProfileSelect({ selectEl, profiles: [], documentRef });
  assert.equal(selectEl.children.length, 1);
  assert.equal(selectEl.children[0].textContent, "No connection profiles");
  assert.equal(selectEl.children[0].disabled, true);

  renderConnectionProfileProfileSelect({
    selectEl,
    documentRef,
    profiles: [
      { id: "ops-ssh", name: "Ops SSH" },
      { id: "local-dev", name: "Local Dev" }
    ]
  });

  assert.equal(selectEl.children.length, 2);
  assert.equal(selectEl.children[0].value, "ops-ssh");
  assert.equal(selectEl.children[0].textContent, "[ops-ssh] Ops SSH");
  assert.equal(selectEl.children[1].textContent, "[local-dev] Local Dev");
});

test("connection profile ui render fails closed when select refs or document factories are absent", () => {
  assert.doesNotThrow(() => setConnectionProfileSelectOptions(null, [], ""));
  assert.doesNotThrow(() => renderConnectionProfileProfileSelect({ profiles: [] }));

  const selectEl = createElement("select");
  setConnectionProfileSelectOptions(
    selectEl,
    [
      { value: "ssh", label: "SSH" }
    ],
    "ssh"
  );

  assert.equal(selectEl.children.length, 1);
  assert.equal(selectEl.children[0].value, "ssh");
  assert.equal(selectEl.children[0].textContent, "SSH");
  assert.equal(selectEl.children[0].selected, true);
});

test("connection profile ui render applies SSH trust and draft view-state fields through one direct seam", () => {
  const summaryEl = createElement("p");
  const sshFieldsEl = createElement("section");
  const draftRemotePrivateKeyFieldEl = createElement("div");
  const authHintEl = createElement("p");
  const secretHintEl = createElement("p");
  const runtimeSecretFieldEl = createElement("div");
  const runtimeSecretInputEl = createElement("input");
  const draftLaunchTextareaEl = createElement("textarea");
  const deleteBtn = createElement("button");
  const deleteConfirmEl = createElement("div");
  const deleteConfirmMessageEl = createElement("p");
  const sshProbeSelectEl = createElement("select");
  const sshTrustSelectEl = createElement("select");
  const sshTrustKeyTypeInputEl = createElement("input");
  const sshTrustFingerprintInputEl = createElement("input");
  const sshTrustPublicKeyTextareaEl = createElement("textarea");
  const sshTrustGuidanceEl = createElement("p");
  const sshTrustStatusEl = createElement("p");
  const sshTrustCompareEl = createElement("section");
  const sshTrustCompareStatusEl = createElement("p");
  const sshTrustCurrentKeyTypeInputEl = createElement("input");
  const sshTrustCurrentFingerprintInputEl = createElement("input");
  const sshTrustCandidateKeyTypeInputEl = createElement("input");
  const sshTrustCandidateFingerprintInputEl = createElement("input");
  const sshTrustProbeBtn = createElement("button");
  const sshTrustRefreshBtn = createElement("button");
  const sshTrustSaveBtn = createElement("button");
  const sshTrustDeleteBtn = createElement("button");
  const sshTrustReplaceBtn = createElement("button");
  const documentRef = createDocumentRef();
  const statuses = [];

  const nextSelection = applyConnectionProfileDraftViewState({
    setDraftStatus: (message) => statuses.push(message),
    refs: {
      summaryEl,
      sshFieldsEl,
      draftRemotePrivateKeyFieldEl,
      authHintEl,
      secretHintEl,
      runtimeSecretFieldEl,
      runtimeSecretInputEl,
      draftLaunchTextareaEl,
      deleteBtn,
      deleteConfirmEl,
      deleteConfirmMessageEl,
      sshProbeSelectEl,
      sshTrustSelectEl,
      sshTrustKeyTypeInputEl,
      sshTrustFingerprintInputEl,
      sshTrustPublicKeyTextareaEl,
      sshTrustGuidanceEl,
      sshTrustStatusEl,
      sshTrustCompareEl,
      sshTrustCompareStatusEl,
      sshTrustCurrentKeyTypeInputEl,
      sshTrustCurrentFingerprintInputEl,
      sshTrustCandidateKeyTypeInputEl,
      sshTrustCandidateFingerprintInputEl,
      sshTrustProbeBtn,
      sshTrustRefreshBtn,
      sshTrustSaveBtn,
      sshTrustDeleteBtn,
      sshTrustReplaceBtn
    },
    viewState: {
      summaryText: "[ops-ssh] Ops SSH -> kind=ssh deck=ops shell=ssh target=ops@example:22",
      sshFieldsHidden: false,
      privateKeyFieldHidden: true,
      authHintText: "Password auth stores only the method.",
      secretHintText: "Use the masked runtime secret prompt before launch.",
      runtimeSecretFieldHidden: false,
      runtimeSecretInputHidden: true,
      runtimeSecretInputDisabled: true,
      runtimeSecretInputValue: "",
      draftLaunchJson: "{\"kind\":\"ssh\"}",
      draftStatusText: "Editing saved profile [ops-ssh] Ops SSH.",
      deleteButtonText: "Confirm Delete Saved",
      deleteConfirmHidden: false,
      deleteConfirmMessageText: "Delete saved connection profile [ops-ssh] Ops SSH?",
      selectedSshProbeCandidateId: "probe-rsa-new",
      selectedSshTrustEntryId: "trust-rsa-old",
      probeOptions: [
        { value: "probe-rsa-new", label: "ssh-rsa · SHA256:new-rsa", documentRef }
      ],
      trustOptions: [
        { value: "trust-rsa-old", label: "ssh-rsa · SHA256:old-rsa", documentRef }
      ],
      trustKeyTypeValue: "ssh-rsa",
      trustFingerprintValue: "SHA256:new-rsa",
      trustPublicKeyValue: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew",
      trustGuidanceText: "Rotation review for ops.example:22",
      trustStatusText: "Rotation candidate ready for ops.example:22",
      trustCompareHidden: false,
      trustCompareStatusText: "SHA256:old-rsa -> SHA256:new-rsa",
      trustCurrentKeyTypeValue: "ssh-rsa",
      trustCurrentFingerprintValue: "SHA256:old-rsa",
      trustCandidateKeyTypeValue: "ssh-rsa",
      trustCandidateFingerprintValue: "SHA256:new-rsa",
      trustProbeDisabled: false,
      trustRefreshDisabled: false,
      trustSaveDisabled: true,
      trustDeleteDisabled: false,
      trustReplaceDisabled: false
    }
  });

  assert.deepEqual(nextSelection, {
    selectedSshTrustEntryId: "trust-rsa-old",
    selectedSshProbeCandidateId: "probe-rsa-new"
  });
  assert.equal(summaryEl.textContent, "[ops-ssh] Ops SSH -> kind=ssh deck=ops shell=ssh target=ops@example:22");
  assert.equal(sshFieldsEl.hidden, false);
  assert.equal(draftRemotePrivateKeyFieldEl.hidden, true);
  assert.match(authHintEl.textContent, /Password auth/);
  assert.match(secretHintEl.textContent, /masked runtime secret/);
  assert.equal(runtimeSecretFieldEl.hidden, false);
  assert.equal(runtimeSecretInputEl.hidden, true);
  assert.equal(runtimeSecretInputEl.disabled, true);
  assert.equal(draftLaunchTextareaEl.readOnly, true);
  assert.equal(draftLaunchTextareaEl.value, "{\"kind\":\"ssh\"}");
  assert.deepEqual(statuses, ["Editing saved profile [ops-ssh] Ops SSH."]);
  assert.equal(deleteBtn.textContent, "Confirm Delete Saved");
  assert.equal(deleteConfirmEl.hidden, false);
  assert.match(deleteConfirmMessageEl.textContent, /Delete saved connection profile/);
  assert.equal(sshProbeSelectEl.value, "probe-rsa-new");
  assert.equal(sshTrustSelectEl.value, "trust-rsa-old");
  assert.equal(sshTrustKeyTypeInputEl.value, "ssh-rsa");
  assert.equal(sshTrustFingerprintInputEl.value, "SHA256:new-rsa");
  assert.equal(sshTrustPublicKeyTextareaEl.value, "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew");
  assert.match(sshTrustGuidanceEl.textContent, /Rotation review/);
  assert.match(sshTrustStatusEl.textContent, /Rotation candidate ready/);
  assert.equal(sshTrustCompareEl.hidden, false);
  assert.equal(sshTrustCompareStatusEl.textContent, "SHA256:old-rsa -> SHA256:new-rsa");
  assert.equal(sshTrustCurrentKeyTypeInputEl.value, "ssh-rsa");
  assert.equal(sshTrustCurrentFingerprintInputEl.value, "SHA256:old-rsa");
  assert.equal(sshTrustCandidateKeyTypeInputEl.value, "ssh-rsa");
  assert.equal(sshTrustCandidateFingerprintInputEl.value, "SHA256:new-rsa");
  assert.equal(sshTrustProbeBtn.disabled, false);
  assert.equal(sshTrustRefreshBtn.disabled, false);
  assert.equal(sshTrustSaveBtn.disabled, true);
  assert.equal(sshTrustDeleteBtn.disabled, false);
  assert.equal(sshTrustReplaceBtn.disabled, false);
});
