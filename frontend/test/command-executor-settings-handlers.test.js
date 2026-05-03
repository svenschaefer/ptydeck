import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutorSettingsHandlers } from "../src/public/command-executor-settings-handlers.js";

const THEME_KEYS = ["background", "foreground", "cursor", "magenta", "brightMagenta"];
const DEFAULT_THEME = {
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#00ff00",
  magenta: "#111111",
  brightMagenta: "#222222"
};

function normalizeThemeProfile(profile) {
  const source = profile || {};
  return Object.fromEntries(THEME_KEYS.map((key) => [key, source[key] || DEFAULT_THEME[key]]));
}

function createHarness(overrides = {}) {
  const calls = [];
  const sessions = overrides.sessions || [
    {
      id: "s1",
      name: "one",
      deckId: "default",
      cwd: "/srv/one",
      startCwd: "",
      startCommand: "",
      env: { NODE_ENV: "dev" },
      tags: ["ops"],
      note: "initial",
      activeThemeProfile: normalizeThemeProfile(DEFAULT_THEME),
      inactiveThemeProfile: normalizeThemeProfile({ ...DEFAULT_THEME, background: "#101010" }),
      inputSafetyProfile: {},
      mouseForwardingMode: "off"
    }
  ];
  const sendTerminators = new Map(overrides.sendTerminators || [["s1", "auto"]]);

  const handlers = createCommandExecutorSettingsHandlers({
    api: {
      async updateSession(sessionId, payload) {
        calls.push(["patch", sessionId, payload]);
        const index = sessions.findIndex((session) => session.id === sessionId);
        assert.notEqual(index, -1);
        sessions[index] = { ...sessions[index], ...payload };
        return sessions[index];
      },
      ...(overrides.api || {})
    },
    formatUsage: overrides.formatUsage || ((commandName, subcommandName = "") => `usage:${commandName}${subcommandName ? `:${subcommandName}` : ""}`),
    normalizeKeyword: overrides.normalizeKeyword || ((value) => String(value || "").trim().toLowerCase()),
    resolveActiveOrDirectTargetSession:
      overrides.resolveActiveOrDirectTargetSession ||
      ((interpreted, availableSessions, activeSessionId, missingActiveMessage) => {
        if (interpreted?.targetSelector === "missing") {
          return { error: "Unknown session identifier: missing", session: null };
        }
        const sessionId = interpreted?.targetSelector || activeSessionId;
        const session = availableSessions.find((entry) => entry.id === sessionId) || null;
        return session ? { error: "", session } : { error: missingActiveMessage, session: null };
      }),
    formatSessionToken: overrides.formatSessionToken || (() => "7"),
    formatSessionDisplayName: overrides.formatSessionDisplayName || ((session) => session.name),
    normalizeSessionTags: overrides.normalizeSessionTags || ((tags) => (Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter(Boolean)),
    normalizeThemeProfile: overrides.normalizeThemeProfile || normalizeThemeProfile,
    getSessionSendTerminator: overrides.getSessionSendTerminator || ((sessionId) => sendTerminators.get(sessionId) || "auto"),
    setSessionSendTerminator:
      overrides.setSessionSendTerminator ||
      ((sessionId, mode) => {
        calls.push(["terminator", sessionId, mode]);
        sendTerminators.set(sessionId, mode);
      }),
    applyRuntimeEvent: overrides.applyRuntimeEvent || ((event) => calls.push(["event", event.type, event.session.id])),
    parseSettingsPayload:
      overrides.parseSettingsPayload ||
      ((text) => {
        try {
          return { ok: true, payload: JSON.parse(text) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    normalizeSendTerminatorMode:
      overrides.normalizeSendTerminatorMode ||
      ((value) => {
        const normalized = String(value || "").trim().toLowerCase();
        return ["auto", "crlf", "lf", "cr", "cr2", "cr_delay"].includes(normalized) ? normalized : "auto";
      }),
    isSessionExited: overrides.isSessionExited || ((session) => session?.status === "exited"),
    getBlockedSessionActionMessage: overrides.getBlockedSessionActionMessage || ((_sessions, actionLabel) => `${actionLabel} blocked.`),
    themeProfileKeys: overrides.themeProfileKeys || THEME_KEYS,
    defaultTerminalTheme: overrides.defaultTerminalTheme || DEFAULT_THEME,
    terminalThemePresets:
      overrides.terminalThemePresets || [
        {
          id: "night",
          name: "Night",
          profile: {
            background: "#222222",
            foreground: "#eeeeee",
            cursor: "#00ff00",
            magenta: "#333333",
            brightMagenta: "#444444"
          }
        },
        {
          id: "nimbus",
          name: "Nimbus",
          profile: {
            background: "#123456",
            foreground: "#fefefe",
            cursor: "#abcdef",
            magenta: "#654321",
            brightMagenta: "#112233"
          }
        }
      ]
  });

  return {
    calls,
    handlers,
    sendTerminators,
    sessions
  };
}

test("settings handlers return null for unrelated commands and resolve show reports", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "missing",
      args: [],
      interpreted: { raw: "/missing" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    null
  );

  const settingsReport = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["show"],
    interpreted: { raw: "/settings show" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(settingsReport, /^\[7\] one$/m);
  assert.match(settingsReport, /startCwd="\/srv\/one"/);
  assert.match(settingsReport, /sendTerminator=auto/);
  assert.match(settingsReport, /mouseForwardingMode="off"/);

  const startupReport = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["startup", "show"],
    interpreted: { raw: "/settings startup show" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(startupReport, /env=\{"NODE_ENV":"dev"\}/);
  assert.match(startupReport, /tags=\["ops"\]/);

  const noteReport = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["note", "show"],
    interpreted: { raw: "/settings note show" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(noteReport, /note="initial"/);
});

test("settings handlers apply startup and note mutations and honor direct-target routing", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "cwd", "/srv/app"],
      interpreted: { raw: "/settings startup cwd /srv/app" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: startCwd."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "env", "{\"FOO\":\"bar\"}"],
      interpreted: { raw: "/settings startup env {\"FOO\":\"bar\"}", targetSelector: "s1" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: env."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "tags", "ops,", "nightly"],
      interpreted: { raw: "/settings startup tags ops, nightly" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: tags."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "terminator", "crlf"],
      interpreted: { raw: "/settings startup terminator crlf" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: sendTerminator."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["note", "set", "deploy", "window"],
      interpreted: { raw: "/settings note set deploy window" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Updated note for [7] one."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["note", "clear"],
      interpreted: { raw: "/settings note clear" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Cleared note for [7] one."
  );

  await assert.rejects(
    harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "env", "{"],
      interpreted: { raw: "/settings startup env {" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    /Startup env JSON is invalid:/
  );

  assert.equal(harness.sessions[0].startCwd, "/srv/app");
  assert.deepEqual(harness.sessions[0].env, { FOO: "bar" });
  assert.deepEqual(harness.sessions[0].tags, ["ops", "nightly"]);
  assert.equal(harness.sendTerminators.get("s1"), "crlf");
  assert.equal(harness.sessions[0].note, "");
  assert.deepEqual(
    harness.calls.filter((entry) => entry[0] === "patch").map((entry) => entry[2]),
    [
      { startCwd: "/srv/app" },
      { env: { FOO: "bar" } },
      { tags: ["ops", "nightly"] },
      { note: "deploy window" },
      { note: "" }
    ]
  );
});

test("settings handlers cover theme show, preset, set, reset, import, export, and validation branches", async () => {
  const harness = createHarness();

  const themeShow = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["theme", "show", "inactive"],
    interpreted: { raw: "/settings theme show inactive" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(themeShow, /inactiveThemeProfile=/);
  assert.match(themeShow, /#101010/);

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "preset", "active", "night"],
      interpreted: { raw: "/settings theme preset active night" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: activeThemeProfile."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "set", "inactive", "bg", "#010203"],
      interpreted: { raw: "/settings theme set inactive bg #010203" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: inactiveThemeProfile.background."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "reset", "inactive"],
      interpreted: { raw: "/settings theme reset inactive" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: inactiveThemeProfile."
  );

  const importPayload = JSON.stringify({
    background: "#0f1011",
    foreground: "#fefefe",
    cursorColor: "#123456",
    purple: "#445566",
    brightPurple: "#778899"
  });
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "import", "active", "windows-terminal", importPayload],
      interpreted: { raw: `/settings theme import active windows-terminal ${importPayload}` },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Imported windows-terminal theme into [7] one: activeThemeProfile."
  );

  const exported = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["theme", "export", "active", "xresources"],
    interpreted: { raw: "/settings theme export active xresources" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(exported, /\*\.background: #0f1011/);
  assert.match(exported, /\*\.cursorColor: #123456/);

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "preset", "active", "ni"],
      interpreted: { raw: "/settings theme preset active ni" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Ambiguous theme preset: ni"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "preset", "active", "dusk"],
      interpreted: { raw: "/settings theme preset active dusk" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Unknown theme preset: dusk"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "set", "active", "mystery", "#010203"],
      interpreted: { raw: "/settings theme set active mystery #010203" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Unknown theme key: mystery"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["theme", "set", "active", "bg", "blue"],
      interpreted: { raw: "/settings theme set active bg blue" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Theme value must be a #rrggbb color."
  );
});

test("settings handlers cover input-safety and mouse-forwarding branches", async () => {
  const harness = createHarness();

  const inputSafetyShow = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["input-safety", "show"],
    interpreted: { raw: "/settings input-safety show" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(inputSafetyShow, /inputSafetyProfile=/);

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["input-safety", "set", "syntax", "on"],
      interpreted: { raw: "/settings input-safety set syntax on" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: inputSafetyProfile.requireValidShellSyntax."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["input-safety", "set", "paste-lines", "6"],
      interpreted: { raw: "/settings input-safety set paste-lines 6" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: inputSafetyProfile.pasteLineConfirmThreshold."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["input-safety", "set", "mystery", "on"],
      interpreted: { raw: "/settings input-safety set mystery on" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Unknown input safety field: mystery. Allowed fields: confirmOnAnyInput, requireValidShellSyntax, confirmOnIncompleteShellConstruct, confirmOnNaturalLanguageInput, confirmOnDangerousShellCommand, confirmOnMultilineInput, autoContinueStalledPaste, confirmOnRecentTargetSwitch, targetSwitchGraceMs, pasteLengthConfirmThreshold, pasteLineConfirmThreshold."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["input-safety", "set", "syntax", "maybe"],
      interpreted: { raw: "/settings input-safety set syntax maybe" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Invalid boolean value: maybe"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["input-safety", "set", "paste-lines", "-1"],
      interpreted: { raw: "/settings input-safety set paste-lines -1" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Invalid numeric value: -1"
  );

  const mouseForwardingShow = await harness.handlers.executeStructuredCommand({
    command: "settings",
    args: ["mouse-forwarding", "show"],
    interpreted: { raw: "/settings mouse-forwarding show" },
    sessions: harness.sessions,
    activeSessionId: "s1"
  });
  assert.match(mouseForwardingShow, /mouseForwardingMode="off"/);

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["mouse-forwarding", "set", "application"],
      interpreted: { raw: "/settings mouse-forwarding set application" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: mouseForwardingMode."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["mouse-forwarding", "set", "weird"],
      interpreted: { raw: "/settings mouse-forwarding set weird" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: mouseForwardingMode."
  );
  assert.equal(harness.sessions[0].mouseForwardingMode, "off");
});

test("settings handlers validate apply payloads and fail closed for exited sessions", async () => {
  const harness = createHarness({
    parseSettingsPayload: (text) => {
      if (text === "bad-json") {
        return { ok: false, error: "bad json" };
      }
      return { ok: true, payload: JSON.parse(text) };
    }
  });

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "bad-json"],
      interpreted: { raw: "/settings apply bad-json" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "bad json"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "{\"unsupported\":true}"],
      interpreted: { raw: "/settings apply {\"unsupported\":true}" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Unknown settings key(s): unsupported"
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "{}"],
      interpreted: { raw: "/settings apply {}" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "No applicable settings keys in payload."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "{\"sendTerminator\":\"weird\"}"],
      interpreted: { raw: "/settings apply {\"sendTerminator\":\"weird\"}" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Invalid sendTerminator. Allowed values: auto, crlf, lf, cr, cr2, cr_delay."
  );

  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "{\"note\":\"release\",\"sendTerminator\":\"lf\",\"mouseForwardingMode\":\"application\"}"],
      interpreted: { raw: "/settings apply {\"note\":\"release\",\"sendTerminator\":\"lf\",\"mouseForwardingMode\":\"application\"}" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Applied settings to [7] one: note, mouseForwardingMode, sendTerminator."
  );
  assert.equal(harness.sessions[0].note, "release");
  assert.equal(harness.sessions[0].mouseForwardingMode, "application");
  assert.equal(harness.sendTerminators.get("s1"), "lf");

  harness.sessions[0].status = "exited";
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["startup", "cwd", "/blocked"],
      interpreted: { raw: "/settings startup cwd /blocked" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Settings update blocked."
  );
  assert.equal(
    await harness.handlers.executeStructuredCommand({
      command: "settings",
      args: ["apply", "{\"note\":\"blocked\"}"],
      interpreted: { raw: "/settings apply {\"note\":\"blocked\"}" },
      sessions: harness.sessions,
      activeSessionId: "s1"
    }),
    "Settings apply blocked."
  );
});
