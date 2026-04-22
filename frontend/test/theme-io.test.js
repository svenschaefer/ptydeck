import test from "node:test";
import assert from "node:assert/strict";

import {
  parseExternalThemeProfile,
  serializeExternalThemeProfile
} from "../src/public/theme-io.js";

const THEME_KEYS = [
  "background",
  "foreground",
  "cursor",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
];

const BASE_THEME = Object.freeze(Object.fromEntries(THEME_KEYS.map((key) => [key, "#000000"])));

test("theme-io parses iTerm2 JSON component colors into normalized ptydeck profile keys", () => {
  const payload = JSON.stringify({
    "Background Color": {
      "Red Component": 0.1,
      "Green Component": 0.2,
      "Blue Component": 0.3
    },
    "Foreground Color": {
      "Red Component": 255,
      "Green Component": 238,
      "Blue Component": 221
    },
    "Ansi 5 Color": "#aabbcc"
  });

  const result = parseExternalThemeProfile(payload, {
    format: "iterm2",
    themeProfileKeys: THEME_KEYS,
    defaultThemeProfile: BASE_THEME
  });

  assert.equal(result.ok, true);
  assert.equal(result.format, "iterm2");
  assert.equal(result.profile.background, "#1a334d");
  assert.equal(result.profile.foreground, "#ffeedd");
  assert.equal(result.profile.magenta, "#aabbcc");
  assert.deepEqual(result.importedKeys, ["background", "foreground", "magenta"]);
});

test("theme-io parses Windows Terminal JSON fragments with purple aliases", () => {
  const result = parseExternalThemeProfile(
    JSON.stringify({
      name: "Operator",
      background: "#101112",
      foreground: "#f1f2f3",
      cursorColor: "#abcd12",
      purple: "#445566",
      brightPurple: "#778899"
    }),
    {
      format: "windows-terminal",
      themeProfileKeys: THEME_KEYS,
      defaultThemeProfile: BASE_THEME
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.profile.background, "#101112");
  assert.equal(result.profile.foreground, "#f1f2f3");
  assert.equal(result.profile.cursor, "#abcd12");
  assert.equal(result.profile.magenta, "#445566");
  assert.equal(result.profile.brightMagenta, "#778899");
});

test("theme-io parses Xresources payloads and preserves missing colors from the base profile", () => {
  const result = parseExternalThemeProfile(
    [
      "! ignored",
      "*.background: #010203",
      "*.foreground: #fefefe",
      "*.cursorColor: #123456",
      "*.color0: #111111",
      "*.color13: #131313"
    ].join("\n"),
    {
      format: "xresources",
      themeProfileKeys: THEME_KEYS,
      defaultThemeProfile: BASE_THEME,
      baseThemeProfile: {
        ...BASE_THEME,
        red: "#999999"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.profile.background, "#010203");
  assert.equal(result.profile.foreground, "#fefefe");
  assert.equal(result.profile.cursor, "#123456");
  assert.equal(result.profile.black, "#111111");
  assert.equal(result.profile.brightMagenta, "#131313");
  assert.equal(result.profile.red, "#999999");
});

test("theme-io serializes supported external formats with deterministic key mapping", () => {
  const profile = {
    ...BASE_THEME,
    background: "#010203",
    foreground: "#fefefe",
    cursor: "#123456",
    magenta: "#445566",
    brightMagenta: "#778899"
  };

  const windows = serializeExternalThemeProfile(profile, {
    format: "windows-terminal",
    name: "Operator Active",
    themeProfileKeys: THEME_KEYS,
    defaultThemeProfile: BASE_THEME
  });
  const xresources = serializeExternalThemeProfile(profile, {
    format: "xresources",
    themeProfileKeys: THEME_KEYS,
    defaultThemeProfile: BASE_THEME
  });
  const iterm2 = serializeExternalThemeProfile(profile, {
    format: "iterm2",
    themeProfileKeys: THEME_KEYS,
    defaultThemeProfile: BASE_THEME
  });

  assert.equal(windows.ok, true);
  assert.match(windows.text, /"name": "Operator Active"/);
  assert.match(windows.text, /"purple": "#445566"/);
  assert.match(windows.text, /"brightPurple": "#778899"/);
  assert.equal(xresources.ok, true);
  assert.match(xresources.text, /\*\.background: #010203/);
  assert.match(xresources.text, /\*\.color13: #778899/);
  assert.equal(iterm2.ok, true);
  assert.match(iterm2.text, /"Background Color"/);
  assert.match(iterm2.text, /"Ansi 13 Color"/);
});

test("theme-io rejects invalid payloads and unsupported formats explicitly", () => {
  assert.deepEqual(
    parseExternalThemeProfile("", {
      format: "xresources",
      themeProfileKeys: THEME_KEYS,
      defaultThemeProfile: BASE_THEME
    }),
    { ok: false, error: "Theme import payload is empty." }
  );

  assert.equal(
    parseExternalThemeProfile("{}", {
      format: "ptydeck",
      themeProfileKeys: THEME_KEYS,
      defaultThemeProfile: BASE_THEME
    }).error,
    "No supported theme colors found in ptydeck payload."
  );

  assert.equal(
    serializeExternalThemeProfile(BASE_THEME, {
      format: "bogus",
      themeProfileKeys: THEME_KEYS,
      defaultThemeProfile: BASE_THEME
    }).error,
    "Unsupported theme export format: bogus"
  );
});
