import test from "node:test";
import assert from "node:assert/strict";

import { createSessionSettingsStateController } from "../src/public/ui/session-settings-state-controller.js";

class FakeClassList {
  constructor() {
    this.tokens = new Set();
  }

  toggle(token, force) {
    const shouldAdd = typeof force === "boolean" ? force : !this.tokens.has(token);
    if (shouldAdd) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    return shouldAdd;
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeSelect {
  constructor() {
    this.children = [];
    this.value = "";
  }

  get firstChild() {
    return this.children[0] || null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    return child;
  }
}

function createFakeDocument() {
  return {
    createElement() {
      return { value: "", textContent: "" };
    }
  };
}

function createInput(value = "") {
  return {
    value,
    checked: false,
    disabled: false,
    classList: new FakeClassList()
  };
}

function createInputSafetyControls(overrides = {}) {
  return {
    requireValidShellSyntax: { ...createInput(), checked: false, ...overrides.requireValidShellSyntax },
    confirmOnIncompleteShellConstruct: {
      ...createInput(),
      checked: false,
      ...overrides.confirmOnIncompleteShellConstruct
    },
    confirmOnNaturalLanguageInput: { ...createInput(), checked: false, ...overrides.confirmOnNaturalLanguageInput },
    confirmOnDangerousShellCommand: { ...createInput(), checked: false, ...overrides.confirmOnDangerousShellCommand },
    confirmOnMultilineInput: { ...createInput(), checked: false, ...overrides.confirmOnMultilineInput },
    confirmOnRecentTargetSwitch: { ...createInput(), checked: false, ...overrides.confirmOnRecentTargetSwitch },
    targetSwitchGraceMs: createInput("4000"),
    pasteLengthConfirmThreshold: createInput("400"),
    pasteLineConfirmThreshold: createInput("5"),
    ...overrides
  };
}

test("session-settings state controller syncs theme controls and applies draft theme", () => {
  const themeProfileKeys = ["background", "foreground", "cursor"];
  const defaultTheme = {
    background: "#000000",
    foreground: "#ffffff",
    cursor: "#00ff00"
  };
  const presetProfile = {
    background: "#1d2021",
    foreground: "#ebdbb2",
    cursor: "#fabd2f"
  };
  const calls = [];
  const terminals = new Map([
    [
      "s1",
      {
        terminal: {
          setOption(name, value) {
            calls.push([name, value]);
          }
        }
      }
    ]
  ]);
  const sessionThemeDrafts = new Map([
    [
      "s1",
      {
        selectedSlot: "inactive",
        active: {
          preset: "custom",
          profile: defaultTheme,
          category: "all",
          search: ""
        },
        inactive: {
          preset: "gruvbox-dark",
          profile: presetProfile,
          category: "dark",
          search: "gruv"
        }
      }
    ]
  ]);
  const controller = createSessionSettingsStateController({
    themeProfileKeys,
    defaultTerminalTheme: defaultTheme,
    themeFilterCategorySet: new Set(["all", "dark", "light"]),
    terminalThemePresetMap: new Map([["gruvbox-dark", { id: "gruvbox-dark", category: "dark", name: "Gruvbox Dark", profile: presetProfile }]]),
    terminalThemePresets: [{ id: "gruvbox-dark", category: "dark", name: "Gruvbox Dark", profile: presetProfile }],
    terminalThemeModeSet: new Set(["custom", "gruvbox-dark"]),
    sessionThemeDrafts,
    getSessionById: () => ({
      id: "s1",
      activeThemeProfile: defaultTheme,
      inactiveThemeProfile: presetProfile
    }),
    terminals,
    documentRef: createFakeDocument()
  });

  const entry = {
    themeSlotSelect: new FakeSelect(),
    themeCategory: createInput(),
    themeSearch: createInput(),
    themeSelect: new FakeSelect(),
    themeInputs: {
      background: createInput(),
      foreground: createInput(),
      cursor: createInput()
    }
  };

  controller.syncSessionThemeControls(entry, "s1");

  assert.equal(entry.themeSlotSelect.value, "inactive");
  assert.equal(entry.themeCategory.value, "dark");
  assert.equal(entry.themeSearch.value, "gruv");
  assert.equal(entry.themeSelect.value, "gruvbox-dark");
  assert.equal(entry.themeInputs.background.value, presetProfile.background);
  assert.equal(entry.themeInputs.foreground.value, presetProfile.foreground);
  assert.equal(entry.themeInputs.cursor.value, presetProfile.cursor);
  assert.equal(entry.themeInputs.background.disabled, true);
  assert.equal(entry.themeSelect.children.length, 2);
  assert.equal(entry.themeSlotSelect.children.length, 2);

  controller.applyThemeForSession("s1", { themeSlot: "inactive" });
  assert.deepEqual(calls, [["theme", presetProfile]]);
});

test("session-settings state controller detects startup/theme/terminator dirtiness and feedback state", () => {
  const themeProfileKeys = ["background", "foreground"];
  const session = {
    id: "s1",
    startCwd: "/workspace",
    startCommand: "npm run dev",
    note: "first line\nsecond line",
    inputSafetyProfile: {
      requireValidShellSyntax: false
    },
    activeThemeProfile: {
      background: "#111111",
      foreground: "#eeeeee"
    },
    inactiveThemeProfile: {
      background: "#111111",
      foreground: "#eeeeee"
    }
  };
  const controller = createSessionSettingsStateController({
    themeProfileKeys,
    defaultTerminalTheme: {
      background: "#000000",
      foreground: "#ffffff"
    },
    parseSessionEnv: (raw) => ({ ok: true, env: raw ? { FOO: "bar" } : {} }),
    parseSessionTags: (raw) => ({ ok: true, tags: raw ? ["ops"] : [] }),
    formatSessionEnv: (env) => (env && env.FOO ? "FOO=bar" : ""),
    formatSessionTags: (tags) => (Array.isArray(tags) && tags.length > 0 ? tags.join("\n") : ""),
    normalizeSessionStartupFromSession: () => ({
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { FOO: "bar" },
      tags: ["ops"]
    }),
    getSessionById: () => session,
    getSessionSendTerminator: () => "crlf",
    normalizeSendTerminatorMode: (value) => value
  });

  const startFeedback = {
    textContent: "",
    classList: new FakeClassList()
  };
  const entry = {
    settingsTabStartupBtn: createInput(),
    settingsTabNoteBtn: createInput(),
    settingsTabThemeBtn: createInput(),
    settingsPanelStartup: { hidden: false },
    settingsPanelNote: { hidden: true },
    settingsPanelTheme: { hidden: true },
    themeSlotSelect: createInput("active"),
    startCwdInput: createInput("/workspace"),
    startCommandInput: createInput("npm run dev"),
    startEnvInput: createInput("FOO=bar"),
    sessionNoteInput: createInput("first line\nsecond line"),
    sessionTagsInput: createInput("ops"),
    sessionSendTerminatorSelect: createInput("crlf"),
    inputSafetyControls: createInputSafetyControls(),
    themeInputs: {
      background: createInput("#111111"),
      foreground: createInput("#eeeeee")
    },
    startFeedback
  };

  assert.equal(controller.isSessionSettingsDirty(entry, session), false);

  controller.setActiveSettingsTab(entry, "note");
  assert.equal(entry.settingsPanelStartup.hidden, true);
  assert.equal(entry.settingsPanelNote.hidden, false);
  assert.equal(entry.settingsTabNoteBtn.classList.contains("active"), true);

  entry.themeSlotSelect.value = "inactive";
  entry.themeInputs.background.value = "#222222";
  assert.equal(controller.isSessionSettingsDirty(entry, session), true);
  entry.themeInputs.background.value = "#111111";
  entry.themeSlotSelect.value = "active";

  entry.sessionSendTerminatorSelect.value = "lf";
  assert.equal(controller.isSessionSettingsDirty(entry, session), true);
  entry.sessionSendTerminatorSelect.value = "crlf";
  entry.sessionNoteInput.value = "first line\nupdated";
  assert.equal(controller.isSessionSettingsDirty(entry, session), true);
  entry.sessionNoteInput.value = "first line\nsecond line";
  entry.inputSafetyControls.requireValidShellSyntax.checked = true;
  assert.equal(controller.isSessionSettingsDirty(entry, session), true);

  controller.setStartupSettingsFeedback({ startFeedback }, "Failed to save settings.", true);
  assert.equal(startFeedback.textContent, "Failed to save settings.");
  assert.equal(startFeedback.classList.contains("error"), true);
});

test("session-settings state controller syncs and reads multiline session notes", () => {
  const controller = createSessionSettingsStateController({});
  const entry = {
    sessionNoteInput: createInput("")
  };

  controller.syncSessionNoteControls(entry, {
    note: "  first line  \r\n second line  "
  });
  assert.equal(entry.sessionNoteInput.value, "first line\nsecond line");
  assert.equal(controller.readSessionNoteFromControls(entry), "first line\nsecond line");
});

test("session-settings state controller syncs and reads explicit input safety controls", () => {
  const controller = createSessionSettingsStateController({});
  const entry = {
    inputSafetyControls: createInputSafetyControls()
  };
  const session = {
    id: "s1",
    inputSafetyProfile: {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnDangerousShellCommand: true,
      targetSwitchGraceMs: 2222
    }
  };

  controller.syncSessionInputSafetyControls(entry, session);
  assert.equal(entry.inputSafetyControls.requireValidShellSyntax.checked, true);
  assert.equal(entry.inputSafetyControls.confirmOnIncompleteShellConstruct.checked, true);
  assert.equal(entry.inputSafetyControls.confirmOnDangerousShellCommand.checked, true);
  assert.equal(entry.inputSafetyControls.targetSwitchGraceMs.value, "2222");

  entry.inputSafetyControls.confirmOnNaturalLanguageInput.checked = true;
  entry.inputSafetyControls.pasteLengthConfirmThreshold.value = "123";
  const profile = controller.readSessionInputSafetyFromControls(entry, session);
  assert.equal(profile.requireValidShellSyntax, true);
  assert.equal(profile.confirmOnDangerousShellCommand, true);
  assert.equal(profile.confirmOnNaturalLanguageInput, true);
  assert.equal(profile.pasteLengthConfirmThreshold, 123);
});
