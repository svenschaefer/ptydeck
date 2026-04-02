import test from "node:test";
import assert from "node:assert/strict";

import { ITERM2_THEME_LIBRARY } from "../src/public/theme-library.js";

const REQUIRED_THEME_KEYS = [
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

test("iTerm2 theme library entries stay structurally valid and unique", () => {
  assert.ok(ITERM2_THEME_LIBRARY.length > 100, "expected a substantial generated theme catalog");

  const ids = new Set();
  for (const entry of ITERM2_THEME_LIBRARY) {
    assert.equal(typeof entry.id, "string");
    assert.equal(entry.id.trim(), entry.id);
    assert.ok(entry.id.length > 0);
    assert.equal(ids.has(entry.id), false, `duplicate theme id: ${entry.id}`);
    ids.add(entry.id);

    assert.equal(typeof entry.name, "string");
    assert.equal(entry.name.trim(), entry.name);
    assert.ok(entry.name.length > 0);
    assert.ok(["dark", "light"].includes(entry.category), `unexpected category for ${entry.id}`);

    for (const key of REQUIRED_THEME_KEYS) {
      assert.match(
        entry.profile?.[key] || "",
        /^#[0-9a-f]{6}$/i,
        `invalid ${key} color for theme ${entry.id}`
      );
    }
  }
});
