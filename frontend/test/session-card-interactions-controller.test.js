import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCardInteractionsController } from "../src/public/ui/session-card-interactions-controller.js";

function createEventTarget(value = "") {
  const listeners = new Map();
  return {
    value,
    listeners,
    addEventListener(type, handler) {
      listeners.set(String(type), handler);
    },
    async emit(type, event = {}) {
      const handler = listeners.get(String(type));
      if (!handler) {
        return;
      }
      return handler(event);
    }
  };
}

test("session-card-interactions controller wires focus and settings dialog controls", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({});
  const refs = {
    focusBtn: createEventTarget(),
    settingsBtn: createEventTarget(),
    settingsDismissBtn: createEventTarget(),
    settingsDialog: createEventTarget()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {},
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry-1" }),
    onActivateSession: (sessionId) => calls.push(`focus:${sessionId}`),
    syncSessionStartupControls: () => calls.push("sync-startup"),
    syncSessionInputSafetyControls: () => calls.push("sync-input-safety"),
    syncSessionThemeControls: () => calls.push("sync-theme"),
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`),
    toggleSettingsDialog: () => calls.push("toggle"),
    closeSettingsDialog: () => calls.push("close")
  });

  await refs.focusBtn.emit("click");
  await refs.settingsBtn.emit("click");
  await refs.settingsDismissBtn.emit("click");
  await refs.settingsDialog.emit("cancel", { preventDefault: () => calls.push("prevent") });

  assert.deepEqual(calls, [
    "focus:s1",
    "sync-startup",
    "sync-input-safety",
    "sync-theme",
    "dirty:false",
    "toggle",
    "close",
    "prevent",
    "close"
  ]);
});

test("session-card-interactions controller handles theme select changes through injected callbacks", async () => {
  const calls = [];
  const sessionThemeDrafts = new Map();
  const controller = createSessionCardInteractionsController({
    themeModeSet: new Set(["dark"]),
    normalizeThemeSlot: (value) => value || "active",
    readThemeProfileFromControls: () => ({ background: "#000000" }),
    getThemePresetById: () => ({ profile: { background: "#111111" } }),
    normalizeThemeProfile: (profile) => profile,
    normalizeThemeFilterCategory: (value) => value,
    updateSessionThemeDraftFromControls: (_refs, sessionId, overrides) => {
      sessionThemeDrafts.set(sessionId, {
        selectedSlot: overrides.selectedSlot,
        active: {
          preset: overrides.preset,
          profile: overrides.profile,
          category: overrides.category,
          search: overrides.search
        },
        inactive: {
          preset: "custom",
          profile: { background: "#222222" },
          category: "all",
          search: ""
        }
      });
    },
    isSessionSettingsDirty: () => true
  });
  const refs = {
    focusBtn: createEventTarget(),
    themeSlotSelect: createEventTarget("active"),
    themeSelect: createEventTarget("dark"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    themeBg: createEventTarget("#000000"),
    themeFg: createEventTarget("#ffffff"),
    themeInputs: {},
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget(""),
    startEnvInput: createEventTarget(""),
    sessionSendTerminatorSelect: createEventTarget("auto"),
    sessionTagsInput: createEventTarget("")
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {},
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts,
    syncSessionThemeControls: () => calls.push("sync-theme"),
    applyThemeForSession: (sessionId) => calls.push(`apply-theme:${sessionId}`),
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`),
    clearError: () => calls.push("clear-error"),
    requestRender: () => calls.push("render")
  });

  await refs.themeSelect.emit("change");

  assert.deepEqual(sessionThemeDrafts.get("s1"), {
    selectedSlot: "active",
    active: {
      preset: "dark",
      profile: { background: "#111111" },
      category: "all",
      search: ""
    },
    inactive: {
      preset: "custom",
      profile: { background: "#222222" },
      category: "all",
      search: ""
    }
  });
  assert.deepEqual(calls, ["sync-theme", "apply-theme:s1", "dirty:true", "clear-error", "render"]);
});

test("session-card-interactions controller blocks settings apply when startCwd is empty", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({
    themeProfileKeys: ["background"],
    normalizeThemeSlot: (value) => value || "active",
    readSessionStartupFromControls: () => ({
      startCwd: "",
      envResult: { ok: true, env: {} },
      tagResult: { ok: true, tags: [] },
      startCommand: "",
      sendTerminator: "auto"
    }),
    readSessionInputSafetyFromControls: () => ({
      requireValidShellSyntax: true
    }),
    readSessionThemeProfilesForSave: () => ({
      activeThemeProfile: { background: "#000000" },
      inactiveThemeProfile: { background: "#111111" }
    }),
    isValidHexColor: () => true,
    detectThemePreset: () => "custom"
  });
  const refs = {
    focusBtn: createEventTarget(),
    settingsApplyBtn: createEventTarget(),
    themeSlotSelect: createEventTarget("active"),
    themeSelect: createEventTarget("custom"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    inputSafetyPresetSelect: createEventTarget("shell_balanced"),
    startFeedback: {}
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: { updateSession: async () => ({}) },
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: new Map(),
    setStartupSettingsFeedback: (_entry, message, isError) => calls.push(`feedback:${message}:${isError === true}`),
    setSettingsDirty: () => calls.push("dirty"),
    setError: (message) => calls.push(`error:${message}`)
  });

  await refs.settingsApplyBtn.emit("click");

  assert.deepEqual(calls, ["feedback:Working Directory cannot be empty.:true"]);
});

test("session-card-interactions controller renames sessions through api update", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({
    windowRef: {
      prompt() {
        return " renamed ";
      }
    }
  });
  const refs = {
    focusBtn: createEventTarget(),
    renameBtn: createEventTarget()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "old" },
    refs,
    api: {
      async updateSession(sessionId, payload) {
        calls.push(`api:${sessionId}:${payload.name}`);
        return { id: sessionId, name: payload.name };
      }
    },
    getSession: () => ({ id: "s1", name: "old" }),
    applyRuntimeEvent: (event) => calls.push(`event:${event.type}:${event.session.name}`),
    clearError: () => calls.push("clear-error"),
    setError: (message) => calls.push(`error:${message}`)
  });

  await refs.renameBtn.emit("click");

  assert.deepEqual(calls, ["api:s1:renamed", "event:session.updated:renamed", "clear-error"]);
});

test("session-card-interactions controller deletes exited sessions locally", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({
    isSessionExited: () => true
  });
  const refs = {
    focusBtn: createEventTarget(),
    closeBtn: createEventTarget(),
    settingsDialog: {}
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs,
    api: {},
    getSession: () => ({ id: "s1", name: "alpha" }),
    confirmSessionDelete: () => true,
    removeSession: (sessionId) => calls.push(`remove:${sessionId}`),
    closeSettingsDialog: () => calls.push("close-dialog"),
    clearError: () => calls.push("clear-error"),
    setCommandFeedback: (message) => calls.push(`feedback:${message}`),
    formatSessionToken: () => "A",
    formatSessionDisplayName: () => "alpha"
  });

  await refs.closeBtn.emit("click");

  assert.deepEqual(calls, ["remove:s1", "close-dialog", "clear-error", "feedback:Removed exited session [A] alpha."]);
});

test("session-card-interactions controller applies valid settings and persists session update", async () => {
  const calls = [];
  const drafts = new Map();
  const controller = createSessionCardInteractionsController({
    themeModeSet: new Set(["custom"]),
    themeProfileKeys: ["background"],
    readSessionStartupFromControls: () => ({
      startCwd: "/tmp",
      envResult: { ok: true, env: { A: "1" } },
      tagResult: { ok: true, tags: ["x"] },
      startCommand: "echo hi",
      sendTerminator: "crlf"
    }),
    readSessionInputSafetyFromControls: () => ({
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true
    }),
    readThemeProfileFromControls: () => ({ background: "#000000" }),
    isValidHexColor: () => true,
    detectThemePreset: () => "custom",
    normalizeThemeFilterCategory: (value) => value
  });
  const refs = {
    focusBtn: createEventTarget(),
    settingsApplyBtn: createEventTarget(),
    inputSafetyPresetSelect: createEventTarget("shell_balanced"),
    themeSelect: createEventTarget("custom"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    themeInputs: {},
    themeBg: createEventTarget("#000000"),
    themeFg: createEventTarget("#ffffff"),
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget("echo hi"),
    startEnvInput: createEventTarget("A=1"),
    sessionTagsInput: createEventTarget("x"),
    sessionSendTerminatorSelect: createEventTarget("crlf"),
    startFeedback: {}
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {
      async updateSession(sessionId, payload) {
        calls.push(`api:${sessionId}:${payload.startCwd}:${payload.startCommand}`);
        calls.push(payload.inputSafetyProfile);
        return { id: sessionId, ...payload };
      }
    },
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: drafts,
    applyThemeForSession: (sessionId) => calls.push(`theme:${sessionId}`),
    syncSessionThemeControls: () => calls.push("sync-theme"),
    applyRuntimeEvent: (event) => calls.push(`event:${event.type}`),
    setSessionSendTerminator: (sessionId, mode) => calls.push(`terminator:${sessionId}:${mode}`),
    setStartupSettingsFeedback: (_entry, message, isError) => calls.push(`feedback:${message}:${isError === true}`),
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`),
    clearError: () => calls.push("clear-error")
  });

  await refs.settingsApplyBtn.emit("click");

  assert.equal(drafts.has("s1"), false);
  assert.deepEqual(calls, [
    "theme:s1",
    "sync-theme",
    "clear-error",
    "api:s1:/tmp:echo hi",
    {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true
    },
    "event:session.updated",
    "terminator:s1:crlf",
    "feedback:Settings saved.:false",
    "dirty:false"
  ]);
});

test("session-card-interactions controller restores draft state on settings cancel", async () => {
  const calls = [];
  const drafts = new Map([["s1", { preset: "custom" }]]);
  const controller = createSessionCardInteractionsController({});
  const refs = {
    focusBtn: createEventTarget(),
    settingsCancelBtn: createEventTarget(),
    inputSafetyPresetSelect: createEventTarget("shell_balanced"),
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget(""),
    startEnvInput: createEventTarget(""),
    sessionTagsInput: createEventTarget(""),
    sessionSendTerminatorSelect: createEventTarget("auto"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    themeSelect: createEventTarget("custom"),
    themeInputs: {},
    themeBg: createEventTarget("#000000"),
    themeFg: createEventTarget("#ffffff"),
    startFeedback: {}
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {},
    getSession: () => ({ id: "s1", startCwd: "/tmp" }),
    sessionThemeDrafts: drafts,
    syncSessionStartupControls: () => calls.push("sync-startup"),
    syncSessionInputSafetyControls: () => calls.push("sync-input-safety"),
    syncSessionThemeControls: () => calls.push("sync-theme"),
    applyThemeForSession: (sessionId) => calls.push(`theme:${sessionId}`),
    setStartupSettingsFeedback: (_entry, message) => calls.push(`feedback:${message}`),
    getEntry: () => ({ id: "entry" }),
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`)
  });

  await refs.settingsCancelBtn.emit("click");

  assert.equal(drafts.has("s1"), false);
  assert.deepEqual(calls, ["sync-startup", "sync-input-safety", "sync-theme", "theme:s1", "feedback:", "dirty:false"]);
});
