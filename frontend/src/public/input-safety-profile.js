export const SESSION_INPUT_SAFETY_BOOLEAN_KEYS = Object.freeze([
  "requireValidShellSyntax",
  "confirmOnIncompleteShellConstruct",
  "confirmOnNaturalLanguageInput",
  "confirmOnDangerousShellCommand",
  "confirmOnMultilineInput",
  "confirmOnRecentTargetSwitch"
]);

export const SESSION_INPUT_SAFETY_INTEGER_DEFAULTS = Object.freeze({
  targetSwitchGraceMs: 4000,
  pasteLengthConfirmThreshold: 400,
  pasteLineConfirmThreshold: 5
});

export const DEFAULT_SESSION_INPUT_SAFETY_PROFILE = Object.freeze({
  requireValidShellSyntax: false,
  confirmOnIncompleteShellConstruct: false,
  confirmOnNaturalLanguageInput: false,
  confirmOnDangerousShellCommand: false,
  confirmOnMultilineInput: false,
  confirmOnRecentTargetSwitch: false,
  ...SESSION_INPUT_SAFETY_INTEGER_DEFAULTS
});

export function normalizeSessionInputSafetyProfile(input) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = {
    ...DEFAULT_SESSION_INPUT_SAFETY_PROFILE
  };

  for (const key of SESSION_INPUT_SAFETY_BOOLEAN_KEYS) {
    normalized[key] = source[key] === true;
  }

  for (const [key, fallback] of Object.entries(SESSION_INPUT_SAFETY_INTEGER_DEFAULTS)) {
    const value = Number(source[key]);
    normalized[key] = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
  }

  return normalized;
}

export function areSessionInputSafetyProfilesEqual(left, right) {
  const normalizedLeft = normalizeSessionInputSafetyProfile(left);
  const normalizedRight = normalizeSessionInputSafetyProfile(right);
  return [...SESSION_INPUT_SAFETY_BOOLEAN_KEYS, ...Object.keys(SESSION_INPUT_SAFETY_INTEGER_DEFAULTS)].every(
    (key) => normalizedLeft[key] === normalizedRight[key]
  );
}
