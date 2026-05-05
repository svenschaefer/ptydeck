import test from "node:test";
import assert from "node:assert/strict";

import { createConnectionProfileUiBindings } from "../src/public/connection-profile-ui-bindings.js";

function createElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    value: "",
    listeners: new Map(),
    addEventListener(type, handler) {
      const next = this.listeners.get(type) || [];
      next.push(handler);
      this.listeners.set(type, next);
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

test("connection profile ui bindings wire operator actions and fail closed through error wrappers", async () => {
  const calls = [];
  const errors = [];
  const selectEl = createElement("select");
  const newBtn = createElement("button");
  const newSshBtn = createElement("button");
  const saveBtn = createElement("button");
  const saveDraftBtn = createElement("button");
  const saveAndLaunchBtn = createElement("button");
  const resetDraftBtn = createElement("button");
  const applyBtn = createElement("button");
  const duplicateBtn = createElement("button");
  const renameBtn = createElement("button");
  const deleteBtn = createElement("button");
  const deleteConfirmBtn = createElement("button");
  const deleteCancelBtn = createElement("button");
  const sshTrustRefreshBtn = createElement("button");
  const sshTrustProbeBtn = createElement("button");
  const sshTrustSaveBtn = createElement("button");
  const sshTrustDeleteBtn = createElement("button");
  const sshTrustReplaceBtn = createElement("button");
  const sshTrustSelectEl = createElement("select");
  const sshProbeSelectEl = createElement("select");
  const draftNameInputEl = createElement("input");
  const draftKindSelectEl = createElement("select");

  const bindings = createConnectionProfileUiBindings({
    normalizeText: (value) => String(value || "").trim(),
    getErrorMessage: (error, fallback) => error?.message || fallback,
    setError: (message) => errors.push(message),
    selectEl,
    newBtn,
    newSshBtn,
    saveBtn,
    saveDraftBtn,
    saveAndLaunchBtn,
    resetDraftBtn,
    applyBtn,
    duplicateBtn,
    renameBtn,
    deleteBtn,
    deleteConfirmBtn,
    deleteCancelBtn,
    sshTrustRefreshBtn,
    sshTrustProbeBtn,
    sshTrustSaveBtn,
    sshTrustDeleteBtn,
    sshTrustReplaceBtn,
    sshTrustSelectEl,
    sshProbeSelectEl,
    setSelectedProfileId: (value) => calls.push(["set-profile", value]),
    syncSelection: () => calls.push(["sync-selection"]),
    resetDraftFromSelectedProfile: () => calls.push(["reset-draft"]),
    syncDraftStateFromInputs: () => calls.push(["sync-draft"]),
    newDraftFlow: async (kind) => {
      calls.push(["new-draft", kind]);
      if (kind === "ssh") {
        throw new Error("ssh draft failed");
      }
    },
    loadActiveDraftFlow: async () => {
      throw new Error("load active failed");
    },
    saveDraftFlow: async () => {
      calls.push(["save-draft"]);
    },
    saveAndLaunchDraftFlow: async () => {
      throw new Error("save and launch failed");
    },
    resetDraftFlow: async () => {
      calls.push(["reset-draft-flow"]);
    },
    applySelectedProfileFlow: async () => {
      calls.push(["apply-profile"]);
    },
    duplicateSelectedProfileFlow: async () => {
      throw new Error("duplicate failed");
    },
    renameSelectedProfileFlow: async () => {
      calls.push(["rename-profile"]);
    },
    deleteSelectedProfileFlow: async () => {
      calls.push(["delete-profile"]);
    },
    cancelDeleteSelectedProfileFlow: async () => {
      throw new Error("cancel delete failed");
    },
    refreshSshTrustEntries: async () => {
      calls.push(["refresh-trust"]);
    },
    probeSshHostKeysFlow: async () => {
      throw new Error("probe failed");
    },
    saveTrustEntryFlow: async () => {
      calls.push(["save-trust"]);
    },
    deleteTrustEntryFlow: async () => {
      throw new Error("delete trust failed");
    },
    replaceTrustEntryFlow: async () => {
      calls.push(["replace-trust"]);
    },
    setSelectedSshTrustEntryId: (value) => calls.push(["set-trust", value]),
    setSelectedSshProbeCandidateId: (value) => calls.push(["set-probe", value]),
    renderDraftComputedState: () => calls.push(["render-draft"]),
    draftInputElements: [
      draftNameInputEl,
      { element: draftKindSelectEl, eventName: "change" }
    ]
  });

  bindings.bindUiEvents();
  bindings.bindUiEvents();

  selectEl.value = " ops-ssh ";
  selectEl.dispatch("change");
  draftNameInputEl.dispatch("input");
  draftKindSelectEl.dispatch("change");
  sshTrustSelectEl.value = " trust-1 ";
  sshTrustSelectEl.dispatch("change");
  sshProbeSelectEl.value = " probe-1 ";
  sshProbeSelectEl.dispatch("change");

  newBtn.click();
  newSshBtn.click();
  saveBtn.click();
  saveDraftBtn.click();
  saveAndLaunchBtn.click();
  resetDraftBtn.click();
  applyBtn.click();
  duplicateBtn.click();
  renameBtn.click();
  deleteBtn.click();
  deleteConfirmBtn.click();
  deleteCancelBtn.click();
  sshTrustRefreshBtn.click();
  sshTrustProbeBtn.click();
  sshTrustSaveBtn.click();
  sshTrustDeleteBtn.click();
  sshTrustReplaceBtn.click();

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["set-profile", "ops-ssh"],
    ["sync-selection"],
    ["reset-draft"],
    ["sync-draft"],
    ["sync-draft"],
    ["set-trust", "trust-1"],
    ["render-draft"],
    ["set-probe", "probe-1"],
    ["render-draft"],
    ["new-draft", "local"],
    ["new-draft", "ssh"],
    ["save-draft"],
    ["reset-draft-flow"],
    ["apply-profile"],
    ["rename-profile"],
    ["delete-profile"],
    ["delete-profile"],
    ["refresh-trust"],
    ["save-trust"],
    ["replace-trust"]
  ]);
  assert.deepEqual(errors, [
    "ssh draft failed",
    "load active failed",
    "save and launch failed",
    "duplicate failed",
    "cancel delete failed",
    "probe failed",
    "delete trust failed"
  ]);
  assert.equal(newBtn.listeners.get("click").length, 1);
  assert.equal(draftNameInputEl.listeners.get("input").length, 1);
  assert.equal(draftKindSelectEl.listeners.get("change").length, 1);
});

test("connection profile ui bindings fail closed when optional elements are absent", () => {
  const bindings = createConnectionProfileUiBindings({
    setError: () => {
      throw new Error("should not be called");
    }
  });

  assert.doesNotThrow(() => bindings.bindUiEvents());
  assert.doesNotThrow(() => bindings.bindUiEvents());
});
