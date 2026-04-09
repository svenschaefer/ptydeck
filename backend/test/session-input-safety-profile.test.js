import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SESSION_INPUT_SAFETY_PROFILE,
  normalizeSessionInputSafetyProfile
} from "../src/session-input-safety-profile.js";

test("normalizeSessionInputSafetyProfile returns defaults for empty input", () => {
  assert.deepEqual(normalizeSessionInputSafetyProfile(), DEFAULT_SESSION_INPUT_SAFETY_PROFILE);
  assert.deepEqual(normalizeSessionInputSafetyProfile(null), DEFAULT_SESSION_INPUT_SAFETY_PROFILE);
});

test("normalizeSessionInputSafetyProfile normalizes a valid explicit profile", () => {
  assert.deepEqual(
    normalizeSessionInputSafetyProfile({
      confirmOnAnyInput: true,
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnNaturalLanguageInput: false,
      confirmOnDangerousShellCommand: true,
      confirmOnMultilineInput: true,
      autoContinueStalledPaste: true,
      confirmOnRecentTargetSwitch: false,
      targetSwitchGraceMs: 1200,
      pasteLengthConfirmThreshold: 640,
      pasteLineConfirmThreshold: 7
    }),
    {
      confirmOnAnyInput: true,
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnNaturalLanguageInput: false,
      confirmOnDangerousShellCommand: true,
      confirmOnMultilineInput: true,
      autoContinueStalledPaste: true,
      confirmOnRecentTargetSwitch: false,
      targetSwitchGraceMs: 1200,
      pasteLengthConfirmThreshold: 640,
      pasteLineConfirmThreshold: 7
    }
  );
});

test("normalizeSessionInputSafetyProfile rejects invalid strict payloads", () => {
  assert.throws(
    () => normalizeSessionInputSafetyProfile("invalid"),
    /Field 'inputSafetyProfile' must be an object/
  );
  assert.throws(
    () => normalizeSessionInputSafetyProfile({ requireValidShellSyntax: "yes" }),
    /inputSafetyProfile\.requireValidShellSyntax/
  );
  assert.throws(
    () => normalizeSessionInputSafetyProfile({ targetSwitchGraceMs: -1 }),
    /inputSafetyProfile\.targetSwitchGraceMs/
  );
  assert.throws(
    () => normalizeSessionInputSafetyProfile({ unsupportedFlag: true }),
    /inputSafetyProfile\.unsupportedFlag/
  );
});

test("normalizeSessionInputSafetyProfile falls back to defaults in non-strict mode", () => {
  assert.deepEqual(
    normalizeSessionInputSafetyProfile(
      {
        requireValidShellSyntax: "yes",
        pasteLengthConfirmThreshold: 999999,
        unsupportedFlag: true
      },
      { strict: false }
    ),
    DEFAULT_SESSION_INPUT_SAFETY_PROFILE
  );
});
