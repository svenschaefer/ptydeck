import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspacePresetRuntimeController } from "../src/public/workspace-preset-runtime-controller.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(type) {
    const list = this.listeners.get(type) || [];
    for (const handler of list) {
      handler({ target: this, type });
    }
  }

  click() {
    this.dispatchEvent("click");
  }
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

test("workspace preset runtime controller manages preset lifecycle through backend-backed hooks", async () => {
  const calls = [];
  let activeDeckId = "ops";
  const presetSelectEl = new FakeElement("select");
  const groupSelectEl = new FakeElement("select");
  const statusEl = new FakeElement("p");
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    api: {
      async listWorkspacePresets() {
        calls.push(["list"]);
        return [
          {
            id: "ops",
            name: "Ops Workspace",
            workspace: {
              activeDeckId: "ops",
              layoutProfileId: "focus",
              deckGroups: {}
            }
          }
        ];
      },
      async createWorkspacePreset(payload) {
        calls.push(["create", payload]);
        return {
          id: "ops-2",
          name: payload.name,
          createdAt: 1,
          updatedAt: 2,
          workspace: payload.workspace
        };
      },
      async updateWorkspacePreset(presetId, payload) {
        calls.push(["update", presetId, payload]);
        return {
          id: presetId,
          name: payload.name || "Ops Workspace",
          createdAt: 1,
          updatedAt: 3,
          workspace: payload.workspace || {
            activeDeckId: "ops",
            layoutProfileId: "focus",
            deckGroups: {}
          }
        };
      },
      async deleteWorkspacePreset(presetId) {
        calls.push(["delete", presetId]);
      }
    },
    presetSelectEl,
    presetSaveBtn: new FakeElement("button"),
    presetApplyBtn: new FakeElement("button"),
    presetRenameBtn: new FakeElement("button"),
    presetDeleteBtn: new FakeElement("button"),
    groupSelectEl,
    groupSaveBtn: new FakeElement("button"),
    groupApplyBtn: new FakeElement("button"),
    groupRenameBtn: new FakeElement("button"),
    groupDeleteBtn: new FakeElement("button"),
    groupClearBtn: new FakeElement("button"),
    statusEl,
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [{ id: "s1", deckId: "ops" }, { id: "s2", deckId: "ops" }],
    getActiveDeckId: () => activeDeckId,
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "focus",
    listLayoutProfiles: () => [{ id: "focus" }],
    applyLayoutProfileById: async (profileId) => {
      calls.push(["apply-layout", profileId]);
      return "";
    },
    setActiveDeck: (deckId) => {
      calls.push(["set-active-deck", deckId]);
      activeDeckId = deckId;
      return true;
    },
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    requestRender: () => calls.push(["render"])
  });

  await controller.loadPresets();
  assert.equal(controller.listPresets().length, 1);
  assert.equal(presetSelectEl.children.length, 1);

  const saveFeedback = await controller.createPresetFromCurrentWorkspace("Ops Snapshot");
  assert.equal(saveFeedback, "Saved workspace preset [ops-2] Ops Snapshot.");
  assert.equal(calls[1][0], "create");
  assert.equal(calls[1][1].workspace.activeDeckId, "ops");
  assert.equal(calls[1][1].workspace.layoutProfileId, "focus");

  const applyFeedback = await controller.applyPresetById("ops");
  assert.equal(applyFeedback, "Applied workspace preset [ops] Ops Workspace.");
  assert.ok(calls.some((entry) => entry[0] === "apply-layout" && entry[1] === "focus"));
  assert.ok(calls.some((entry) => entry[0] === "set-active-deck" && entry[1] === "ops"));

  const renameFeedback = await controller.renamePresetById("ops", "Ops Renamed");
  assert.equal(renameFeedback, "Renamed workspace preset [ops] to Ops Renamed.");

  const deleteFeedback = await controller.deletePresetById("ops");
  assert.equal(deleteFeedback, "Deleted workspace preset [ops] Ops Renamed.");
  assert.equal(controller.getPreset("ops"), null);
  assert.match(statusEl.textContent, /preset/);
});

test("workspace preset runtime controller normalizes stale references and resolves active deck groups", () => {
  const controller = createWorkspacePresetRuntimeController({
    documentRef: createDocumentRef(),
    presetSelectEl: new FakeElement("select"),
    groupSelectEl: new FakeElement("select"),
    statusEl: new FakeElement("p"),
    getDecks: () => [{ id: "default" }, { id: "ops" }],
    getSessions: () => [
      { id: "s1", deckId: "default" },
      { id: "s2", deckId: "ops" },
      { id: "s3", deckId: "ops" }
    ],
    getActiveDeckId: () => "ops",
    getSessionFilterText: () => "",
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    getSelectedLayoutProfileId: () => "",
    listLayoutProfiles: () => [{ id: "focus" }]
  });

  controller.replaceWorkspaceState({
    activeDeckId: "ghost",
    layoutProfileId: "missing",
    deckGroups: {
      ghost: {
        activeGroupId: "ghost",
        groups: [{ id: "ghost", name: "Ghost", sessionIds: ["missing"] }]
      },
      ops: {
        activeGroupId: "ops-team",
        groups: [{ id: "ops-team", name: "Ops Team", sessionIds: ["s2", "missing"] }]
      }
    }
  });

  const normalized = controller.getWorkspaceState();
  assert.equal(normalized.activeDeckId, "default");
  assert.equal(normalized.layoutProfileId, "");
  assert.equal(normalized.deckGroups.ghost, undefined);
  assert.deepEqual(normalized.deckGroups.ops.groups[0].sessionIds, ["s2"]);

  const resolved = controller.resolveDeckSessions("ops", [
    { id: "s2", deckId: "ops" },
    { id: "s3", deckId: "ops" }
  ]);
  assert.deepEqual(
    resolved.map((session) => session.id),
    ["s2"]
  );
});
