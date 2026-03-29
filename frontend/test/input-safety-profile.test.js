import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SESSION_INPUT_SAFETY_PROFILE,
  SESSION_INPUT_SAFETY_BOOLEAN_KEYS,
  SESSION_INPUT_SAFETY_INTEGER_DEFAULTS,
  areSessionInputSafetyProfilesEqual,
  normalizeSessionInputSafetyProfile
} from "../src/public/input-safety-profile.js";

test("input safety profile normalizes defaults and explicit option values", () => {
  assert.deepEqual(normalizeSessionInputSafetyProfile(null), DEFAULT_SESSION_INPUT_SAFETY_PROFILE);

  const normalized = normalizeSessionInputSafetyProfile({
    requireValidShellSyntax: true,
    confirmOnDangerousShellCommand: true,
    targetSwitchGraceMs: "1234",
    pasteLengthConfirmThreshold: 222,
    pasteLineConfirmThreshold: "7"
  });

  assert.equal(normalized.requireValidShellSyntax, true);
  assert.equal(normalized.confirmOnDangerousShellCommand, true);
  assert.equal(normalized.targetSwitchGraceMs, 1234);
  assert.equal(normalized.pasteLengthConfirmThreshold, 222);
  assert.equal(normalized.pasteLineConfirmThreshold, 7);
});

test("input safety profile equality uses the explicit boolean and integer field sets", () => {
  const custom = normalizeSessionInputSafetyProfile({
    requireValidShellSyntax: true,
    confirmOnNaturalLanguageInput: true,
    pasteLengthConfirmThreshold: 111,
    pasteLineConfirmThreshold: 2
  });

  assert.equal(
    areSessionInputSafetyProfilesEqual(custom, {
      requireValidShellSyntax: true,
      confirmOnNaturalLanguageInput: true,
      pasteLengthConfirmThreshold: 111,
      pasteLineConfirmThreshold: 2
    }),
    true
  );

  assert.equal(
    areSessionInputSafetyProfilesEqual(custom, {
      requireValidShellSyntax: true,
      pasteLengthConfirmThreshold: 111,
      pasteLineConfirmThreshold: 2
    }),
    false
  );

  assert.deepEqual(SESSION_INPUT_SAFETY_BOOLEAN_KEYS, [
    "requireValidShellSyntax",
    "confirmOnIncompleteShellConstruct",
    "confirmOnNaturalLanguageInput",
    "confirmOnDangerousShellCommand",
    "confirmOnMultilineInput",
    "confirmOnRecentTargetSwitch"
  ]);
  assert.deepEqual(SESSION_INPUT_SAFETY_INTEGER_DEFAULTS, {
    targetSwitchGraceMs: 4000,
    pasteLengthConfirmThreshold: 400,
    pasteLineConfirmThreshold: 5
  });
});
