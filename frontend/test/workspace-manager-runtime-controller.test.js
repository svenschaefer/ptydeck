import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceManagerRuntimeController } from "../src/public/workspace-manager-runtime-controller.js";

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(token) {
    this.values.add(token);
  }

  remove(token) {
    this.values.delete(token);
  }

  toggle(token, force) {
    const shouldAdd = typeof force === "boolean" ? force : !this.values.has(token);
    if (shouldAdd) {
      this.values.add(token);
    } else {
      this.values.delete(token);
    }
    return shouldAdd;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.classList = new ClassList();
    this.listeners = new Map();
    this.textContent = "";
    this.hidden = false;
    this.open = false;
    this.attributes = new Map();
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  click() {
    for (const handler of this.listeners.get("click") || []) {
      handler({ type: "click" });
    }
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) || null;
  }
}

test("workspace manager runtime controller opens the dialog, switches tabs, and renders summaries", () => {
  const dialogEl = new FakeElement("dialog");
  const openBtn = new FakeElement("button");
  const closeBtn = new FakeElement("button");
  const metaEl = new FakeElement("p");
  const connectionsTabBtn = new FakeElement("button");
  const workspaceTabBtn = new FakeElement("button");
  const connectionsPanelEl = new FakeElement("section");
  const workspacePanelEl = new FakeElement("section");
  const connectionSummaryEl = new FakeElement("p");
  const workspacePresetSummaryEl = new FakeElement("p");
  const workspaceGroupSummaryEl = new FakeElement("p");

  const controller = createWorkspaceManagerRuntimeController({
    dialogEl,
    openBtn,
    closeBtn,
    metaEl,
    connectionsTabBtn,
    workspaceTabBtn,
    connectionsPanelEl,
    workspacePanelEl,
    connectionSummaryEl,
    workspacePresetSummaryEl,
    workspaceGroupSummaryEl,
    getConnectionProfileRuntimeController: () => ({
      getSelectedProfile: () => ({
        id: "ops-ssh",
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: ["ops"],
          activeThemeProfile: {
            background: "#101010",
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
          },
          inactiveThemeProfile: {
            background: "#080808",
            foreground: "#dddddd",
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
          },
          remoteConnection: { host: "ops.example", port: 22, username: "ops" }
        }
      })
    }),
    getWorkspacePresetRuntimeController: () => ({
      getSelectedPreset: () => ({
        id: "ops",
        name: "Ops Workspace",
        workspace: {
          activeDeckId: "ops",
          layoutProfileId: "focus",
          deckGroups: {
            ops: {
              activeGroupId: "build",
              groups: [{ id: "build", name: "Build", sessionIds: ["s1"] }]
            }
          }
        }
      }),
      listGroupsForDeck: () => [{ id: "build", name: "Build", sessionIds: ["s1"] }],
      getActiveGroupIdForDeck: () => "build"
    }),
    getActiveDeckId: () => "ops"
  });

  controller.bindUiEvents();

  assert.equal(controller.getActiveTab(), "connections");
  assert.equal(connectionsPanelEl.hidden, false);
  assert.equal(workspacePanelEl.hidden, true);
  assert.match(metaEl.textContent, /connection profiles/i);
  assert.match(connectionSummaryEl.textContent, /Ops SSH/);

  openBtn.click();
  assert.equal(dialogEl.open, true);

  workspaceTabBtn.click();
  assert.equal(controller.getActiveTab(), "workspace");
  assert.equal(connectionsPanelEl.hidden, true);
  assert.equal(workspacePanelEl.hidden, false);
  assert.match(metaEl.textContent, /workspace presets/i);
  assert.match(workspacePresetSummaryEl.textContent, /deck=ops/);
  assert.match(workspaceGroupSummaryEl.textContent, /active group \[build\]/i);

  closeBtn.click();
  assert.equal(dialogEl.open, false);
});

test("workspace manager runtime controller falls back cleanly without modal helpers or selected items", () => {
  const dialogEl = {
    open: false,
    listeners: new Map(),
    addEventListener(type, handler) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    }
  };
  const openBtn = new FakeElement("button");
  const closeBtn = new FakeElement("button");
  const metaEl = new FakeElement("p");
  const connectionsTabBtn = new FakeElement("button");
  const workspaceTabBtn = new FakeElement("button");
  const connectionsPanelEl = new FakeElement("section");
  const workspacePanelEl = new FakeElement("section");
  const connectionSummaryEl = new FakeElement("p");
  const workspacePresetSummaryEl = new FakeElement("p");
  const workspaceGroupSummaryEl = new FakeElement("p");

  const controller = createWorkspaceManagerRuntimeController({
    dialogEl,
    openBtn,
    closeBtn,
    metaEl,
    connectionsTabBtn,
    workspaceTabBtn,
    connectionsPanelEl,
    workspacePanelEl,
    connectionSummaryEl,
    workspacePresetSummaryEl,
    workspaceGroupSummaryEl,
    getConnectionProfileRuntimeController: () => ({
      getSelectedProfile: () => null
    }),
    getWorkspacePresetRuntimeController: () => ({
      getSelectedPreset: () => null,
      listGroupsForDeck: () => [],
      getActiveGroupIdForDeck: () => ""
    }),
    getActiveDeckId: () => ""
  });

  controller.setActiveTab("invalid");
  assert.equal(controller.getActiveTab(), "connections");
  assert.match(connectionSummaryEl.textContent, /No saved connection profile selected/);
  assert.match(workspacePresetSummaryEl.textContent, /No saved workspace preset selected/);
  assert.match(workspaceGroupSummaryEl.textContent, /Deck \[default\] · no active group/i);

  openBtn.click();
  assert.equal(dialogEl.open, true);
  closeBtn.click();
  assert.equal(dialogEl.open, false);
});
