import { ApiError } from "./errors.js";

export const SESSION_INPUT_SAFETY_PROFILE_BOOLEAN_KEYS = [
  "requireValidShellSyntax",
  "confirmOnIncompleteShellConstruct",
  "confirmOnNaturalLanguageInput",
  "confirmOnDangerousShellCommand",
  "confirmOnMultilineInput",
  "confirmOnRecentTargetSwitch"
];

export const SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS = {
  targetSwitchGraceMs: { min: 0, max: 60_000, defaultValue: 4_000 },
  pasteLengthConfirmThreshold: { min: 0, max: 20_000, defaultValue: 400 },
  pasteLineConfirmThreshold: { min: 0, max: 1_000, defaultValue: 5 }
};

export const SESSION_INPUT_SAFETY_PROFILE_KEYS = [
  ...SESSION_INPUT_SAFETY_PROFILE_BOOLEAN_KEYS,
  ...Object.keys(SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS)
];

export const DEFAULT_SESSION_INPUT_SAFETY_PROFILE = Object.freeze({
  requireValidShellSyntax: false,
  confirmOnIncompleteShellConstruct: false,
  confirmOnNaturalLanguageInput: false,
  confirmOnDangerousShellCommand: false,
  confirmOnMultilineInput: false,
  confirmOnRecentTargetSwitch: false,
  targetSwitchGraceMs: SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS.targetSwitchGraceMs.defaultValue,
  pasteLengthConfirmThreshold: SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS.pasteLengthConfirmThreshold.defaultValue,
  pasteLineConfirmThreshold: SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS.pasteLineConfirmThreshold.defaultValue
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeBooleanField(value, fieldName, strict) {
  if (value === undefined) {
    return DEFAULT_SESSION_INPUT_SAFETY_PROFILE[fieldName];
  }
  if (typeof value !== "boolean") {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field 'inputSafetyProfile.${fieldName}' must be a boolean.`);
    }
    return DEFAULT_SESSION_INPUT_SAFETY_PROFILE[fieldName];
  }
  return value;
}

function normalizeIntegerField(value, fieldName, strict) {
  const limits = SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS[fieldName];
  if (value === undefined) {
    return limits.defaultValue;
  }
  if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'inputSafetyProfile.${fieldName}' must be an integer between ${limits.min} and ${limits.max}.`
      );
    }
    return limits.defaultValue;
  }
  return value;
}

export function normalizeSessionInputSafetyProfile(input, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return { ...DEFAULT_SESSION_INPUT_SAFETY_PROFILE };
  }
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'inputSafetyProfile' must be an object.");
    }
    return { ...DEFAULT_SESSION_INPUT_SAFETY_PROFILE };
  }

  const allowedKeys = new Set(SESSION_INPUT_SAFETY_PROFILE_KEYS);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field 'inputSafetyProfile.${key}' is not supported.`);
      }
    }
  }

  const normalized = {};
  for (const key of SESSION_INPUT_SAFETY_PROFILE_BOOLEAN_KEYS) {
    normalized[key] = normalizeBooleanField(input[key], key, strict);
  }
  for (const key of Object.keys(SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS)) {
    normalized[key] = normalizeIntegerField(input[key], key, strict);
  }
  return normalized;
}
