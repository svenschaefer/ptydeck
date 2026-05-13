import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCardInteractionsController } from "../src/public/ui/session-card-interactions-controller.js";

function createEventTarget(value = "") {
  const listeners = new Map();
  return {
    value,
    checked: false,
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

function createInputSafetyControls(overrides = {}) {
  return {
    confirmOnAnyInput: { ...createEventTarget(), checked: false, ...overrides.confirmOnAnyInput },
    requireValidShellSyntax: { ...createEventTarget(), checked: false, ...overrides.requireValidShellSyntax },
    confirmOnIncompleteShellConstruct: {
      ...createEventTarget(),
      checked: false,
      ...overrides.confirmOnIncompleteShellConstruct
    },
    confirmOnNaturalLanguageInput: { ...createEventTarget(), checked: false, ...overrides.confirmOnNaturalLanguageInput },
    confirmOnDangerousShellCommand: { ...createEventTarget(), checked: false, ...overrides.confirmOnDangerousShellCommand },
    confirmOnMultilineInput: { ...createEventTarget(), checked: false, ...overrides.confirmOnMultilineInput },
    confirmOnRecentTargetSwitch: { ...createEventTarget(), checked: false, ...overrides.confirmOnRecentTargetSwitch },
    targetSwitchGraceMs: createEventTarget("4000"),
    pasteLengthConfirmThreshold: createEventTarget("400"),
    pasteLineConfirmThreshold: createEventTarget("5"),
    ...overrides
  };
}

test("session-card-interactions controller wires focus and settings dialog controls", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({
    windowRef: {
      requestAnimationFrame(callback) {
        callback();
        return 1;
      }
    },
    stabilizeSettingsLayout: () => calls.push("stabilize"),
    setActiveSettingsTab: (_entry, tab) => calls.push(`tab:${tab}`)
  });
  const refs = {
    focusBtn: createEventTarget(),
    refreshBtn: createEventTarget(),
    settingsBtn: createEventTarget(),
    settingsDismissBtn: createEventTarget(),
    settingsDialog: createEventTarget(),
    settingsTabStartupBtn: createEventTarget(),
    settingsTabInputBtn: createEventTarget(),
    settingsTabNoteBtn: createEventTarget(),
    settingsTabThemeBtn: createEventTarget(),
    mouseForwardingModeSelect: createEventTarget("off")
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {},
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry-1" }),
    sessionThemeDrafts: new Map([["s1", { active: {}, inactive: {} }]]),
    onActivateSession: (sessionId) => calls.push(`focus:${sessionId}`),
    refreshMountedTerminal: (sessionId) => calls.push(`refresh:${sessionId}`),
    syncSessionStartupControls: () => calls.push("sync-startup"),
    syncSessionInputSafetyControls: () => calls.push("sync-input-safety"),
    syncSessionThemeControls: () => calls.push("sync-theme"),
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`),
    toggleSettingsDialog: () => calls.push("toggle"),
    closeSettingsDialog: () => calls.push("close")
  });

  await refs.focusBtn.emit("click");
  await refs.refreshBtn.emit("click");
  await refs.settingsBtn.emit("click");
  await refs.settingsTabInputBtn.emit("click");
  await refs.settingsTabNoteBtn.emit("click");
  await refs.settingsTabThemeBtn.emit("click");
  await refs.settingsTabStartupBtn.emit("click");
  await refs.settingsDismissBtn.emit("click");
  await refs.settingsDialog.emit("cancel", { preventDefault: () => calls.push("prevent") });

  assert.deepEqual(calls, [
    "focus:s1",
    "refresh:s1",
    "sync-startup",
    "sync-input-safety",
    "sync-theme",
    "tab:startup",
    "dirty:false",
    "toggle",
    "stabilize",
    "stabilize",
    "tab:input",
    "stabilize",
    "stabilize",
    "tab:note",
    "stabilize",
    "stabilize",
    "tab:theme",
    "stabilize",
    "stabilize",
    "tab:startup",
    "stabilize",
    "stabilize",
    "sync-startup",
    "sync-input-safety",
    "sync-theme",
    "dirty:false",
    "close",
    "prevent",
    "sync-startup",
    "sync-input-safety",
    "sync-theme",
    "dirty:false",
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
    mouseForwardingModeSelect: createEventTarget("off"),
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
      mouseForwardingMode: "off",
      sendTerminator: "auto"
    }),
    readSessionInputSafetyFromControls: () => ({
      confirmOnAnyInput: true,
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
    settingsTabInputBtn: createEventTarget(),
    mouseForwardingModeSelect: createEventTarget("off"),
    themeSlotSelect: createEventTarget("active"),
    themeSelect: createEventTarget("custom"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    inputSafetyControls: createInputSafetyControls(),
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

test("session-card-interactions controller renames the current trusted-local device", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController();
  const refs = {
    focusBtn: createEventTarget(),
    settingsTabInputBtn: createEventTarget(),
    sessionControlDeviceNameInput: createEventTarget("Desk Browser"),
    sessionControlDeviceSaveBtn: createEventTarget()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs,
    api: {},
    getSession: () => ({ id: "s1", name: "alpha" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: new Map(),
    renameTrustedLocalDevice: async (sessionId, label) => {
      calls.push(["rename", sessionId, label]);
      return { id: sessionId };
    },
    applyRuntimeEvent: (event) => calls.push(["runtime", event.type, event.session.id]),
    clearError: () => calls.push(["clearError"]),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    formatSessionToken: () => "1"
  });

  await refs.sessionControlDeviceSaveBtn.emit("click");

  assert.deepEqual(calls, [
    ["rename", "s1", "Desk Browser"],
    ["runtime", "session.updated", "s1"],
    ["clearError"],
    ["feedback", "Renamed this device to Desk Browser."]
  ]);
});

test("session-card-interactions controller forgets a stale trusted-local device after confirmation", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController();
  const refs = {
    focusBtn: createEventTarget(),
    settingsTabInputBtn: createEventTarget(),
    sessionControlClientsEl: createEventTarget()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs,
    api: {
      forgetSessionControlClient: async (sessionId, clientId) => {
        calls.push(["forget", sessionId, clientId]);
        return { id: sessionId };
      }
    },
    getSession: () => ({ id: "s1", name: "alpha" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: new Map(),
    confirmForgetSessionControlClient: async (_session, target) => {
      calls.push(["confirm", target.clientId, target.label]);
      return true;
    },
    applyRuntimeEvent: (event) => calls.push(["runtime", event.type, event.session.id]),
    clearError: () => calls.push(["clearError"]),
    setCommandFeedback: (message) => calls.push(["feedback", message])
  });

  await refs.sessionControlClientsEl.emit("click", {
    target: {
      closest() {
        return {
          dataset: {
            sessionControlAction: "forget",
            clientId: "client-stale",
            clientLabel: "Tablet"
          }
        };
      }
    }
  });

  assert.deepEqual(calls, [
    ["confirm", "client-stale", "Tablet"],
    ["forget", "s1", "client-stale"],
    ["runtime", "session.updated", "s1"],
    ["clearError"],
    ["feedback", "Forgot stale device Tablet."]
  ]);
});

test("session-card-interactions controller wires take, release, and transfer session-control actions", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController();
  const refs = {
    focusBtn: createEventTarget(),
    sessionControlTakeBtn: createEventTarget(),
    sessionControlReleaseBtn: createEventTarget(),
    sessionControlClientsEl: createEventTarget()
  };
  const session = { id: "s1", name: "alpha" };

  controller.bindSessionCardInteractions({
    session,
    refs,
    api: {
      takeSessionControl: async () => ({ id: "s1", controlState: { currentController: { clientId: "self" } } }),
      releaseSessionControl: async () => ({ id: "s1", controlState: { currentController: null } }),
      transferSessionControl: async (_sessionId, clientId) => ({ id: "s1", controlState: { currentController: { clientId } } })
    },
    getSession: () => session,
    getEntry: () => ({ id: "entry" }),
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.controlState.currentController?.clientId || "none"]),
    clearError: () => calls.push(["clearError"]),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    formatSessionToken: () => "A",
    formatSessionDisplayName: () => "alpha",
    setError: (message) => calls.push(["error", message])
  });

  await refs.sessionControlTakeBtn.emit("click");
  await refs.sessionControlReleaseBtn.emit("click");
  await refs.sessionControlClientsEl.emit("click", {
    target: {
      closest() {
        return {
          dataset: {
            sessionControlAction: "transfer",
            clientId: "peer-client"
          }
        };
      }
    }
  });

  assert.deepEqual(calls, [
    ["event", "session.updated", "self"],
    ["clearError"],
    ["feedback", "Took control of [A] alpha."],
    ["event", "session.updated", "none"],
    ["clearError"],
    ["feedback", "Released control of [A] alpha."],
    ["event", "session.updated", "peer-client"],
    ["clearError"],
    ["feedback", "Transferred control of [A] alpha."]
  ]);
});

test("session-card-interactions controller handles session-control errors, blank device labels, and canceled stale-device forgets", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController();
  const refs = {
    focusBtn: createEventTarget(),
    sessionControlTakeBtn: createEventTarget(),
    sessionControlReleaseBtn: createEventTarget(),
    sessionControlClientsEl: createEventTarget(),
    sessionControlDeviceNameInput: createEventTarget("   "),
    sessionControlDeviceSaveBtn: createEventTarget()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs,
    api: {
      releaseSessionControl: async () => {
        throw new Error("release failed");
      },
      transferSessionControl: async () => {
        throw new Error("transfer failed");
      }
    },
    takeTrustedLocalControl: async () => {
      throw new Error("take failed");
    },
    getSession: () => ({ id: "s1", name: "alpha" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: new Map(),
    confirmForgetSessionControlClient: async () => false,
    setError: (message) => calls.push(["error", message]),
    applyRuntimeEvent: () => calls.push(["event"])
  });

  await refs.sessionControlTakeBtn.emit("click");
  await refs.sessionControlReleaseBtn.emit("click");
  await refs.sessionControlClientsEl.emit("click", {
    target: {
      closest() {
        return null;
      }
    }
  });
  await refs.sessionControlClientsEl.emit("click", {
    target: {
      closest() {
        return {
          dataset: {
            sessionControlAction: "forget",
            clientId: "client-stale",
            clientLabel: "Tablet"
          }
        };
      }
    }
  });
  await refs.sessionControlClientsEl.emit("click", {
    target: {
      closest() {
        return {
          dataset: {
            sessionControlAction: "transfer",
            clientId: "peer"
          }
        };
      }
    }
  });
  await refs.sessionControlDeviceSaveBtn.emit("click");

  assert.deepEqual(calls, [
    ["error", "take failed"],
    ["error", "release failed"],
    ["error", "transfer failed"],
    ["error", "Device name cannot be empty."]
  ]);
});

test("session-card-interactions controller renames sessions through api update", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController();
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
    requestSessionRename: async () => " renamed ",
    applyRuntimeEvent: (event) => calls.push(`event:${event.type}:${event.session.name}`),
    clearError: () => calls.push("clear-error"),
    setError: (message) => calls.push(`error:${message}`)
  });

  await refs.renameBtn.emit("click");

  assert.deepEqual(calls, ["api:s1:renamed", "event:session.updated:renamed", "clear-error"]);
});

test("session-card-interactions controller blocks exited rename, rejects blank rename, and reports rename failures", async () => {
  const blockedCalls = [];
  const blockedController = createSessionCardInteractionsController({
    isSessionExited: () => true,
    getBlockedSessionActionMessage: () => "Rename is blocked."
  });
  const blockedRefs = {
    focusBtn: createEventTarget(),
    renameBtn: createEventTarget()
  };

  blockedController.bindSessionCardInteractions({
    session: { id: "s1", name: "old" },
    refs: blockedRefs,
    api: {},
    getSession: () => ({ id: "s1", name: "old" }),
    setError: (message) => blockedCalls.push(message)
  });
  await blockedRefs.renameBtn.emit("click");

  const blankCalls = [];
  const blankController = createSessionCardInteractionsController();
  const blankRefs = {
    focusBtn: createEventTarget(),
    renameBtn: createEventTarget()
  };
  blankController.bindSessionCardInteractions({
    session: { id: "s1", name: "old" },
    refs: blankRefs,
    api: {},
    getSession: () => ({ id: "s1", name: "old" }),
    requestSessionRename: async () => "   ",
    setError: (message) => blankCalls.push(message)
  });
  await blankRefs.renameBtn.emit("click");

  const failureCalls = [];
  const failureController = createSessionCardInteractionsController();
  const failureRefs = {
    focusBtn: createEventTarget(),
    renameBtn: createEventTarget()
  };
  failureController.bindSessionCardInteractions({
    session: { id: "s1", name: "old" },
    refs: failureRefs,
    api: {
      async updateSession() {
        throw new Error("boom");
      }
    },
    getSession: () => ({ id: "s1", name: "old" }),
    requestSessionRename: async () => "new",
    setError: (message) => failureCalls.push(message)
  });
  await failureRefs.renameBtn.emit("click");

  assert.deepEqual(blockedCalls, ["Rename is blocked."]);
  assert.deepEqual(blankCalls, ["Session name cannot be empty."]);
  assert.deepEqual(failureCalls, ["Failed to rename session."]);
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

test("session-card-interactions controller handles delete cancel and delete failure paths", async () => {
  const cancelCalls = [];
  const cancelController = createSessionCardInteractionsController();
  const cancelRefs = {
    focusBtn: createEventTarget(),
    closeBtn: createEventTarget(),
    settingsDialog: {}
  };
  cancelController.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs: cancelRefs,
    api: {},
    confirmSessionDelete: async () => false,
    setError: (message) => cancelCalls.push(message)
  });
  await cancelRefs.closeBtn.emit("click");

  const failureCalls = [];
  const failureController = createSessionCardInteractionsController();
  const failureRefs = {
    focusBtn: createEventTarget(),
    closeBtn: createEventTarget(),
    settingsDialog: {}
  };
  failureController.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs: failureRefs,
    api: {
      async deleteSession() {
        throw new Error("boom");
      }
    },
    getSession: () => ({ id: "s1", name: "alpha" }),
    confirmSessionDelete: async () => true,
    setError: (message) => failureCalls.push(message)
  });
  await failureRefs.closeBtn.emit("click");

  assert.deepEqual(cancelCalls, []);
  assert.deepEqual(failureCalls, ["Failed to delete session."]);
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
      mouseForwardingMode: "application",
      sendTerminator: "crlf"
    }),
    readSessionInputSafetyFromControls: () => ({
      confirmOnAnyInput: true,
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
    mouseForwardingModeSelect: createEventTarget("application"),
    inputSafetyControls: createInputSafetyControls(),
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
        calls.push(`mouse:${payload.mouseForwardingMode}`);
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
    "mouse:application",
    {
      confirmOnAnyInput: true,
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true
    },
    "event:session.updated",
    "terminator:s1:crlf",
    "feedback:Settings saved.:false",
    "dirty:false"
  ]);
});

test("session-card-interactions controller covers settings-apply validation and failure branches", async () => {
  const blockedCalls = [];
  const blockedController = createSessionCardInteractionsController({
    isSessionExited: () => true,
    getBlockedSessionActionMessage: () => "Settings apply is blocked."
  });
  const blockedRefs = {
    focusBtn: createEventTarget(),
    settingsApplyBtn: createEventTarget(),
    startFeedback: {}
  };
  blockedController.bindSessionCardInteractions({
    session: { id: "s1" },
    refs: blockedRefs,
    api: {},
    getSession: () => ({ id: "s1" }),
    setError: (message) => blockedCalls.push(`error:${message}`),
    setStartupSettingsFeedback: (_entry, message, isError) => blockedCalls.push(`feedback:${message}:${isError === true}`)
  });
  await blockedRefs.settingsApplyBtn.emit("click");

  const envCalls = [];
  const envController = createSessionCardInteractionsController({
    themeProfileKeys: ["background"],
    readSessionStartupFromControls: () => ({
      startCwd: "/tmp",
      envResult: { ok: false, error: "Bad env" },
      tagResult: { ok: true, tags: [] },
      startCommand: "",
      mouseForwardingMode: "off",
      sendTerminator: "auto"
    }),
    readSessionThemeProfilesForSave: () => ({
      activeThemeProfile: { background: "#000000" },
      inactiveThemeProfile: { background: "#111111" }
    }),
    readSessionInputSafetyFromControls: () => ({}),
    isValidHexColor: () => true
  });
  const envRefs = {
    focusBtn: createEventTarget(),
    settingsApplyBtn: createEventTarget(),
    inputSafetyControls: createInputSafetyControls(),
    themeSelect: createEventTarget("custom"),
    themeSlotSelect: createEventTarget("active"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget(""),
    startEnvInput: createEventTarget("A=1"),
    mouseForwardingModeSelect: createEventTarget("off"),
    sessionTagsInput: createEventTarget(""),
    sessionSendTerminatorSelect: createEventTarget("auto"),
    startFeedback: {}
  };
  envController.bindSessionCardInteractions({
    session: { id: "s1" },
    refs: envRefs,
    api: {},
    getSession: () => ({ id: "s1" }),
    setStartupSettingsFeedback: (_entry, message, isError) => envCalls.push(`feedback:${message}:${isError === true}`)
  });
  await envRefs.settingsApplyBtn.emit("click");

  const failureCalls = [];
  const failureController = createSessionCardInteractionsController({
    themeProfileKeys: ["background"],
    readSessionStartupFromControls: () => ({
      startCwd: "/tmp",
      envResult: { ok: true, env: {} },
      tagResult: { ok: true, tags: [] },
      startCommand: "",
      mouseForwardingMode: "off",
      sendTerminator: "auto"
    }),
    readSessionThemeProfilesForSave: () => ({
      activeThemeProfile: { background: "#000000" },
      inactiveThemeProfile: { background: "#111111" }
    }),
    readSessionInputSafetyFromControls: () => ({}),
    isValidHexColor: () => true,
    updateSessionThemeDraftFromControls: () => failureCalls.push("draft")
  });
  const failureRefs = {
    focusBtn: createEventTarget(),
    settingsApplyBtn: createEventTarget(),
    inputSafetyControls: createInputSafetyControls(),
    themeSelect: createEventTarget("custom"),
    themeSlotSelect: createEventTarget("active"),
    themeCategory: createEventTarget("all"),
    themeSearch: createEventTarget(""),
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget(""),
    startEnvInput: createEventTarget("A=1"),
    mouseForwardingModeSelect: createEventTarget("off"),
    sessionTagsInput: createEventTarget(""),
    sessionSendTerminatorSelect: createEventTarget("auto"),
    startFeedback: {}
  };
  failureController.bindSessionCardInteractions({
    session: { id: "s1" },
    refs: failureRefs,
    api: {
      async updateSession() {
        throw new Error("boom");
      }
    },
    getSession: () => ({ id: "s1" }),
    sessionThemeDrafts: new Map(),
    applyThemeForSession: () => failureCalls.push("theme"),
    syncSessionThemeControls: () => failureCalls.push("sync"),
    clearError: () => failureCalls.push("clear"),
    setError: (message) => failureCalls.push(`error:${message}`),
    setStartupSettingsFeedback: (_entry, message, isError) => failureCalls.push(`feedback:${message}:${isError === true}`)
  });
  await failureRefs.settingsApplyBtn.emit("click");

  assert.deepEqual(blockedCalls, [
    "error:Settings apply is blocked.",
    "feedback:Settings apply is blocked.:true"
  ]);
  assert.deepEqual(envCalls, ["feedback:Bad env:true"]);
  assert.deepEqual(failureCalls, [
    "draft",
    "theme",
    "sync",
    "clear",
    "error:Failed to save settings.",
    "feedback:Failed to save settings.:true"
  ]);
});

test("session-card-interactions controller updates theme-slot, category, search, and custom theme input branches", async () => {
  const calls = [];
  const controller = createSessionCardInteractionsController({
    themeProfileKeys: ["background"],
    normalizeThemeSlot: (value) => value || "active",
    normalizeThemeFilterCategory: (value) => value,
    readThemeProfileFromControls: () => ({ background: "#123456" }),
    updateSessionThemeDraftFromControls: (_refs, sessionId, overrides) => {
      calls.push(["draft", sessionId, overrides]);
    },
    isSessionSettingsDirty: () => true
  });
  const refs = {
    focusBtn: createEventTarget(),
    themeSlotSelect: createEventTarget("inactive"),
    themeCategory: createEventTarget("Ops"),
    themeSearch: createEventTarget("ssh"),
    themeInputs: {
      background: createEventTarget("#123456")
    },
    themeBg: createEventTarget("#123456"),
    themeFg: createEventTarget("#ffffff"),
    startCwdInput: createEventTarget("/tmp"),
    startCommandInput: createEventTarget(""),
    startEnvInput: createEventTarget(""),
    mouseForwardingModeSelect: createEventTarget("off"),
    sessionNoteInput: createEventTarget(""),
    sessionSendTerminatorSelect: createEventTarget("auto"),
    sessionTagsInput: createEventTarget(""),
    inputSafetyControls: createInputSafetyControls()
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1" },
    refs,
    api: {},
    getSession: () => ({ id: "s1" }),
    getEntry: () => ({ id: "entry" }),
    sessionThemeDrafts: new Map(),
    syncSessionThemeControls: () => calls.push(["sync"]),
    applyThemeForSession: (_sessionId, payload) => calls.push(["theme", payload.themeSlot]),
    setSettingsDirty: (_entry, dirty) => calls.push(["dirty", dirty]),
    clearError: () => calls.push(["clear"])
  });

  await refs.themeSlotSelect.emit("change");
  await refs.themeCategory.emit("change");
  await refs.themeSearch.emit("input");
  await refs.themeInputs.background.emit("input");

  assert.deepEqual(calls, [
    ["draft", "s1", { selectedSlot: "inactive" }],
    ["sync"],
    ["theme", "inactive"],
    ["dirty", true],
    ["clear"],
    ["draft", "s1", { selectedSlot: "inactive", slot: "inactive", category: "ops", search: "ssh" }],
    ["sync"],
    ["dirty", true],
    ["draft", "s1", { selectedSlot: "inactive", slot: "inactive", category: "ops", search: "ssh" }],
    ["sync"],
    ["dirty", true],
    ["draft", "s1", { selectedSlot: "inactive", slot: "inactive", preset: "custom", profile: { background: "#123456" } }],
    ["theme", "inactive"],
    ["dirty", true]
  ]);
});

test("session-card-interactions controller restores draft state on settings cancel", async () => {
  const calls = [];
  const drafts = new Map([["s1", { preset: "custom" }]]);
  const controller = createSessionCardInteractionsController({});
  const refs = {
    focusBtn: createEventTarget(),
    settingsCancelBtn: createEventTarget(),
    mouseForwardingModeSelect: createEventTarget("application"),
    inputSafetyControls: createInputSafetyControls(),
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
    setSettingsDirty: (_entry, dirty) => calls.push(`dirty:${dirty}`),
    closeSettingsDialog: () => calls.push("close-dialog")
  });

  await refs.settingsCancelBtn.emit("click");

  assert.equal(drafts.has("s1"), false);
  assert.deepEqual(calls, [
    "sync-startup",
    "sync-input-safety",
    "sync-theme",
    "theme:s1",
    "feedback:",
    "dirty:false",
    "close-dialog"
  ]);
});

test("session-card-interactions controller wires theme import, export, and copy workflows", async () => {
  const calls = [];
  const importCalls = [];
  const exportCalls = [];
  const clipboardWrites = [];
  const controller = createSessionCardInteractionsController({
    normalizeThemeSlot: (value) => (value === "inactive" ? "inactive" : "active"),
    importThemeProfileIntoDraft: (_refs, sessionId, options) => {
      importCalls.push({ sessionId, options });
      return {
        ok: true,
        format: "xresources",
        slot: options.slot
      };
    },
    exportThemeProfileFromDraft: (_refs, sessionId, options) => {
      exportCalls.push({ sessionId, options });
      return {
        ok: true,
        format: options.format,
        slot: options.slot,
        text: "{\"background\":\"#010203\"}\n"
      };
    },
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    },
    isSessionSettingsDirty: () => true
  });
  const refs = {
    focusBtn: createEventTarget(),
    themeSlotSelect: createEventTarget("inactive"),
    themeImportFormat: createEventTarget("xresources"),
    themeImportPayload: createEventTarget("*.background: #010203\n"),
    themeImportBtn: createEventTarget(),
    themeExportFormat: createEventTarget("windows-terminal"),
    themeExportPayload: createEventTarget(""),
    themeExportBtn: createEventTarget(),
    themeCopyExportBtn: createEventTarget(),
    startFeedback: {}
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "alpha" },
    refs,
    api: {},
    getSession: () => ({ id: "s1", name: "alpha" }),
    getEntry: () => ({ id: "entry" }),
    syncSessionThemeControls: () => calls.push(["sync"]),
    applyThemeForSession: (_sessionId, payload) => calls.push(["theme", payload.themeSlot]),
    setSettingsDirty: (_entry, dirty) => calls.push(["dirty", dirty]),
    clearError: () => calls.push(["clear"]),
    setError: (message) => calls.push(["error", message]),
    setStartupSettingsFeedback: (_entry, message, isError) => calls.push(["feedback", message, isError === true]),
    requestRender: () => calls.push(["render"]),
    formatSessionDisplayName: () => "alpha"
  });

  await refs.themeImportBtn.emit("click");
  await refs.themeCopyExportBtn.emit("click");
  refs.themeExportPayload.value = "";
  await refs.themeExportBtn.emit("click");

  assert.deepEqual(importCalls, [
    {
      sessionId: "s1",
      options: {
        slot: "inactive",
        format: "xresources",
        payload: "*.background: #010203\n"
      }
    }
  ]);
  assert.deepEqual(exportCalls, [
    {
      sessionId: "s1",
      options: {
        slot: "inactive",
        format: "windows-terminal",
        name: "alpha inactive"
      }
    },
    {
      sessionId: "s1",
      options: {
        slot: "inactive",
        format: "windows-terminal",
        name: "alpha inactive"
      }
    }
  ]);
  assert.deepEqual(clipboardWrites, ["{\"background\":\"#010203\"}\n"]);
  assert.equal(refs.themeExportPayload.value, "{\"background\":\"#010203\"}\n");
  assert.deepEqual(calls, [
    ["sync"],
    ["theme", "inactive"],
    ["dirty", true],
    ["clear"],
    ["feedback", "Imported xresources theme into inactive theme draft. Save Settings to persist it.", false],
    ["render"],
    ["clear"],
    ["feedback", "Copied exported theme payload.", false],
    ["clear"],
    ["feedback", "Exported inactive theme as windows-terminal.", false]
  ]);
});

test("session-card-interactions controller routes start-stop actions through the session API", async () => {
  const calls = [];
  const sessions = new Map([["s1", { id: "s1", name: "Alpha", state: "stopped" }]]);
  const controller = createSessionCardInteractionsController({
    isSessionStopped: (session) => session?.state === "stopped",
    getSessionRuntimeState: (session) => session?.state || "running"
  });
  const refs = {
    focusBtn: createEventTarget(),
    startStopBtn: createEventTarget(),
    mouseForwardingModeSelect: createEventTarget("off")
  };

  controller.bindSessionCardInteractions({
    session: { id: "s1", name: "Alpha" },
    refs,
    api: {
      startSession: async (sessionId) => {
        calls.push(["start", sessionId]);
        const next = { id: sessionId, name: "Alpha", state: "running" };
        sessions.set(sessionId, next);
        return next;
      },
      stopSession: async (sessionId) => {
        calls.push(["stop", sessionId]);
        const next = { id: sessionId, name: "Alpha", state: "stopped" };
        sessions.set(sessionId, next);
        return next;
      }
    },
    getSession: () => sessions.get("s1"),
    getEntry: () => ({ id: "entry-1" }),
    sessionThemeDrafts: new Map(),
    formatSessionToken: () => "1",
    formatSessionDisplayName: (session) => session.name,
    applyRuntimeEvent: (event) => calls.push(["event", event.type, event.session.state]),
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    clearError: () => calls.push(["clear-error"]),
    setError: (message) => calls.push(["error", message])
  });

  await refs.startStopBtn.emit("click");
  await refs.startStopBtn.emit("click");

  assert.deepEqual(calls, [
    ["start", "s1"],
    ["event", "session.updated", "running"],
    ["clear-error"],
    ["feedback", "Started [1] Alpha."],
    ["stop", "s1"],
    ["event", "session.updated", "stopped"],
    ["clear-error"],
    ["feedback", "Stopped [1] Alpha."]
  ]);
});
