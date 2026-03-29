import test from "node:test";
import assert from "node:assert/strict";

import { createSessionUiFacadeController } from "../src/public/ui/session-ui-facade-controller.js";

test("session-ui facade controller delegates session view-model behavior", () => {
  const calls = [];
  const sessionViewModel = {
    getSessionRuntimeState(session) {
      calls.push(["state", session.id]);
      return "busy";
    },
    isSessionUnrestored(session) {
      calls.push(["unrestored", session.id]);
      return false;
    },
    isSessionExited(session) {
      calls.push(["exited", session.id]);
      return true;
    },
    isSessionActionBlocked(session) {
      calls.push(["blocked", session.id]);
      return true;
    },
    getSessionStateBadgeText() {
      return "EXITED";
    },
    getExitedSessionStatusSuffix() {
      return " (exit code 1)";
    },
    getSessionStateHintText() {
      return "Session exited.";
    },
    getSessionActivityIndicatorState() {
      return "live";
    },
    getUnrestoredSessionMessage() {
      return "unrestored";
    },
    getExitedSessionMessage() {
      return "exited";
    },
    getBlockedSessionActionMessage() {
      return "blocked";
    },
    formatSessionEnv() {
      return "FOO=bar";
    },
    normalizeSessionTags() {
      return ["ops"];
    },
    formatSessionTags() {
      return "ops";
    },
    parseSessionTags() {
      return { ok: true, tags: ["ops"] };
    },
    parseSessionEnv() {
      return { ok: true, env: { FOO: "bar" } };
    },
    normalizeSessionStartupFromSession() {
      return {
        startCwd: "/workspace",
        startCommand: "npm run dev",
        env: { FOO: "bar" },
        tags: ["ops"]
      };
    }
  };
  const controller = createSessionUiFacadeController({
    getSessionViewModel: () => sessionViewModel
  });

  assert.equal(controller.getSessionRuntimeState({ id: "s1" }), "busy");
  assert.equal(controller.isSessionUnrestored({ id: "s1" }), false);
  assert.equal(controller.isSessionExited({ id: "s1" }), true);
  assert.equal(controller.isSessionActionBlocked({ id: "s1" }), true);
  assert.equal(controller.getSessionStateBadgeText({ id: "s1" }), "EXITED");
  assert.equal(controller.getExitedSessionStatusSuffix({ id: "s1" }), " (exit code 1)");
  assert.equal(controller.getSessionStateHintText({ id: "s1" }), "Session exited.");
  assert.equal(controller.getSessionActivityIndicatorState({ id: "s1" }), "live");
  assert.equal(controller.getUnrestoredSessionMessage({ id: "s1" }), "unrestored");
  assert.equal(controller.getExitedSessionMessage({ id: "s1" }), "exited");
  assert.equal(controller.getBlockedSessionActionMessage([{ id: "s1" }], "Delete"), "blocked");
  assert.equal(controller.formatSessionEnv({ FOO: "bar" }), "FOO=bar");
  assert.deepEqual(controller.normalizeSessionTags(["Ops"]), ["ops"]);
  assert.equal(controller.formatSessionTags(["ops"]), "ops");
  assert.deepEqual(controller.parseSessionTags("ops"), { ok: true, tags: ["ops"] });
  assert.deepEqual(controller.parseSessionEnv("FOO=bar"), { ok: true, env: { FOO: "bar" } });
  assert.deepEqual(controller.normalizeSessionStartupFromSession({ id: "s1" }), {
    startCwd: "/workspace",
    startCommand: "npm run dev",
    env: { FOO: "bar" },
    tags: ["ops"]
  });
  assert.deepEqual(calls, [
    ["state", "s1"],
    ["unrestored", "s1"],
    ["exited", "s1"],
    ["blocked", "s1"]
  ]);
});

test("session-ui facade controller delegates settings/theme behavior and preserves defaults", () => {
  const calls = [];
  const settingsStateController = {
    isValidHexColor(value) {
      calls.push(["hex", value]);
      return value === "#112233";
    },
    normalizeThemeProfile(profile) {
      calls.push(["normalize-profile", profile]);
      return { background: "#111111", foreground: "#eeeeee" };
    },
    normalizeThemeFilterCategory(value) {
      calls.push(["normalize-category", value]);
      return "dark";
    },
    getThemePresetById(presetId) {
      calls.push(["preset", presetId]);
      return { id: presetId };
    },
    detectThemePreset(profile) {
      calls.push(["detect", profile]);
      return "gruvbox-dark";
    },
    getSessionThemeConfig(sessionId) {
      calls.push(["theme-config", sessionId]);
      return {
        preset: "gruvbox-dark",
        profile: { background: "#111111", foreground: "#eeeeee" },
        category: "dark",
        search: "gruv"
      };
    },
    buildThemeFromConfig(config) {
      calls.push(["build-theme", config.preset]);
      return { background: "#111111", foreground: "#eeeeee" };
    },
    applyThemeForSession(sessionId) {
      calls.push(["apply-theme", sessionId]);
    },
    readThemeProfileFromControls(entry) {
      calls.push(["read-theme", entry.id]);
      return { background: "#222222", foreground: "#dddddd" };
    },
    syncSessionThemeControls(entry, sessionId) {
      calls.push(["sync-theme", entry.id, sessionId]);
    },
    setStartupSettingsFeedback(entry, message, isError) {
      calls.push(["feedback", entry.id, message, isError]);
    },
    syncSessionStartupControls(entry, session) {
      calls.push(["sync-startup", entry.id, session.id]);
    },
    syncSessionNoteControls(entry, session) {
      calls.push(["sync-note", entry.id, session.id]);
    },
    readSessionStartupFromControls(entry) {
      calls.push(["read-startup", entry.id]);
      return {
        startCwd: "/workspace",
        startCommand: "npm run dev",
        envResult: { ok: true, env: { FOO: "bar" } },
        mouseForwardingMode: "off",
        sendTerminator: "crlf",
        tagResult: { ok: true, tags: ["ops"] }
      };
    },
    readSessionNoteFromControls(entry) {
      calls.push(["read-note", entry.id]);
      return "first line\nsecond line";
    },
    normalizeSessionNoteText(value) {
      calls.push(["normalize-note", value]);
      return String(value || "").replace(/\r\n?/g, "\n").trim();
    },
    setActiveSettingsTab(entry, tab) {
      calls.push(["tab", entry.id, tab]);
      return tab;
    },
    isSessionSettingsDirty(entry, session) {
      calls.push(["dirty", entry.id, session.id]);
      return true;
    }
  };
  const controller = createSessionUiFacadeController({
    getSessionSettingsStateController: () => settingsStateController,
    themeProfileKeys: ["background", "foreground"],
    defaultTerminalTheme: { background: "#000000", foreground: "#ffffff" }
  });

  assert.equal(controller.isValidHexColor("#112233"), true);
  assert.deepEqual(controller.normalizeThemeProfile({ background: "#010101" }), {
    background: "#111111",
    foreground: "#eeeeee"
  });
  assert.equal(controller.normalizeThemeFilterCategory("light"), "dark");
  assert.deepEqual(controller.getThemePresetById("gruvbox-dark"), { id: "gruvbox-dark" });
  assert.equal(controller.detectThemePreset({ background: "#111111" }), "gruvbox-dark");
  assert.deepEqual(controller.getSessionThemeConfig("s1"), {
    preset: "gruvbox-dark",
    profile: { background: "#111111", foreground: "#eeeeee" },
    category: "dark",
    search: "gruv"
  });
  assert.deepEqual(controller.buildThemeFromConfig({ preset: "gruvbox-dark" }), {
    background: "#111111",
    foreground: "#eeeeee"
  });
  controller.applyThemeForSession("s1");
  assert.deepEqual(controller.readThemeProfileFromControls({ id: "entry-1" }), {
    background: "#222222",
    foreground: "#dddddd"
  });
  controller.syncSessionThemeControls({ id: "entry-1" }, "s1");
  controller.setStartupSettingsFeedback({ id: "entry-1" }, "Saved", false);
  controller.syncSessionStartupControls({ id: "entry-1" }, { id: "s1" });
  controller.syncSessionNoteControls({ id: "entry-1" }, { id: "s1" });
  assert.deepEqual(controller.readSessionStartupFromControls({ id: "entry-1" }), {
    startCwd: "/workspace",
    startCommand: "npm run dev",
    envResult: { ok: true, env: { FOO: "bar" } },
    mouseForwardingMode: "off",
    sendTerminator: "crlf",
    tagResult: { ok: true, tags: ["ops"] }
  });
  assert.equal(controller.readSessionNoteFromControls({ id: "entry-1" }), "first line\nsecond line");
  assert.equal(controller.normalizeSessionNoteText("line one\r\nline two"), "line one\nline two");
  assert.equal(controller.setActiveSettingsTab({ id: "entry-1" }, "note"), "note");
  assert.equal(controller.isSessionSettingsDirty({ id: "entry-1" }, { id: "s1" }), true);

  assert.deepEqual(calls, [
    ["hex", "#112233"],
    ["normalize-profile", { background: "#010101" }],
    ["normalize-category", "light"],
    ["preset", "gruvbox-dark"],
    ["detect", { background: "#111111" }],
    ["theme-config", "s1"],
    ["build-theme", "gruvbox-dark"],
    ["apply-theme", "s1"],
    ["read-theme", "entry-1"],
    ["sync-theme", "entry-1", "s1"],
    ["feedback", "entry-1", "Saved", false],
    ["sync-startup", "entry-1", "s1"],
    ["sync-note", "entry-1", "s1"],
    ["read-startup", "entry-1"],
    ["read-note", "entry-1"],
    ["normalize-note", "line one\r\nline two"],
    ["tab", "entry-1", "note"],
    ["dirty", "entry-1", "s1"]
  ]);
});

test("session-ui facade controller delegates meta rendering and falls back safely without subcontrollers", () => {
  const calls = [];
  const metaController = {
    setSettingsDirty(entry, dirty) {
      calls.push(["dirty", entry.id, dirty]);
    },
    renderSessionTagList(entry, session) {
      calls.push(["tags", entry.id, session.id]);
    },
    renderSessionNote(entry, session) {
      calls.push(["note", entry.id, session.id]);
    }
  };
  const controller = createSessionUiFacadeController({
    getSessionCardMetaController: () => metaController,
    themeProfileKeys: ["background", "foreground"],
    defaultTerminalTheme: { background: "#000000", foreground: "#ffffff" }
  });
  const entry = { id: "entry-1" };
  const session = { id: "s1" };

  controller.setSettingsDirty(entry, true);
  controller.renderSessionTagList(entry, session);
  controller.renderSessionNote(entry, session);

  assert.deepEqual(calls, [
    ["dirty", "entry-1", true],
    ["tags", "entry-1", "s1"],
    ["note", "entry-1", "s1"]
  ]);

  const fallbackController = createSessionUiFacadeController({
    themeProfileKeys: ["background", "foreground"],
    defaultTerminalTheme: { background: "#000000", foreground: "#ffffff" }
  });
  assert.deepEqual(fallbackController.normalizeThemeProfile({ background: "invalid" }), {
    background: "#000000",
    foreground: "#ffffff"
  });
  assert.deepEqual(fallbackController.readSessionStartupFromControls({}), {
    startCwd: "",
    startCommand: "",
    envResult: { ok: true, env: {} },
    mouseForwardingMode: "off",
    sendTerminator: "auto",
    tagResult: { ok: true, tags: [] }
  });
  assert.equal(fallbackController.isSessionSettingsDirty({}, {}), false);
});
