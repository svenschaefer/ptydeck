import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SESSION_INPUT_SAFETY_PROFILE,
  areSessionInputSafetyProfilesEqual,
  buildSessionInputSafetyProfileFromPreset,
  detectSessionInputSafetyPreset,
  listSessionInputSafetyPresetOptions,
  normalizeSessionInputSafetyProfile
} from "../src/public/input-safety-profile.js";

test("input safety profile normalizes defaults and detects presets", () => {
  assert.deepEqual(normalizeSessionInputSafetyProfile(null), DEFAULT_SESSION_INPUT_SAFETY_PROFILE);

  const balanced = buildSessionInputSafetyProfileFromPreset("shell_balanced");
  assert.equal(balanced.requireValidShellSyntax, true);
  assert.equal(balanced.confirmOnDangerousShellCommand, true);
  assert.equal(balanced.confirmOnRecentTargetSwitch, true);
  assert.equal(detectSessionInputSafetyPreset(balanced), "shell_balanced");

  const strict = buildSessionInputSafetyProfileFromPreset("shell_strict");
  assert.equal(strict.confirmOnMultilineInput, true);
  assert.equal(strict.pasteLengthConfirmThreshold, 200);
  assert.equal(strict.pasteLineConfirmThreshold, 3);
  assert.equal(detectSessionInputSafetyPreset(strict), "shell_strict");
});

test("input safety profile equality and options handle custom values", () => {
  const custom = normalizeSessionInputSafetyProfile({
    requireValidShellSyntax: true,
    pasteLengthConfirmThreshold: "111",
    pasteLineConfirmThreshold: 2
  });
  assert.equal(custom.pasteLengthConfirmThreshold, 111);
  assert.equal(custom.pasteLineConfirmThreshold, 2);
  assert.equal(detectSessionInputSafetyPreset(custom), "custom");
  assert.equal(
    areSessionInputSafetyProfilesEqual(custom, {
      requireValidShellSyntax: true,
      pasteLengthConfirmThreshold: 111,
      pasteLineConfirmThreshold: 2
    }),
    true
  );

  const options = listSessionInputSafetyPresetOptions();
  assert.deepEqual(
    options.map((entry) => entry.value),
    ["off", "shell_syntax_gated", "shell_balanced", "shell_strict", "agent", "custom"]
  );
});
