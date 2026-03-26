const BOOLEAN_KEYS = [
  "requireValidShellSyntax",
  "confirmOnIncompleteShellConstruct",
  "confirmOnNaturalLanguageInput",
  "confirmOnDangerousShellCommand",
  "confirmOnMultilineInput",
  "confirmOnRecentTargetSwitch"
];

const INTEGER_DEFAULTS = {
  targetSwitchGraceMs: 4000,
  pasteLengthConfirmThreshold: 400,
  pasteLineConfirmThreshold: 5
};

export const DEFAULT_SESSION_INPUT_SAFETY_PROFILE = Object.freeze({
  requireValidShellSyntax: false,
  confirmOnIncompleteShellConstruct: false,
  confirmOnNaturalLanguageInput: false,
  confirmOnDangerousShellCommand: false,
  confirmOnMultilineInput: false,
  confirmOnRecentTargetSwitch: false,
  ...INTEGER_DEFAULTS
});

const PRESET_DEFINITIONS = {
  off: {
    label: "Off",
    profile: {}
  },
  shell_syntax_gated: {
    label: "Shell Syntax Gated",
    profile: {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true
    }
  },
  shell_balanced: {
    label: "Shell Balanced",
    profile: {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnNaturalLanguageInput: true,
      confirmOnDangerousShellCommand: true,
      confirmOnRecentTargetSwitch: true,
      targetSwitchGraceMs: 4000
    }
  },
  shell_strict: {
    label: "Shell Strict",
    profile: {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnNaturalLanguageInput: true,
      confirmOnDangerousShellCommand: true,
      confirmOnMultilineInput: true,
      confirmOnRecentTargetSwitch: true,
      targetSwitchGraceMs: 6000,
      pasteLengthConfirmThreshold: 200,
      pasteLineConfirmThreshold: 3
    }
  },
  agent: {
    label: "Agent",
    profile: {
      confirmOnRecentTargetSwitch: true,
      targetSwitchGraceMs: 4000
    }
  }
};

export const SESSION_INPUT_SAFETY_PRESET_ORDER = Object.freeze([
  "off",
  "shell_syntax_gated",
  "shell_balanced",
  "shell_strict",
  "agent",
  "custom"
]);

export function normalizeSessionInputSafetyProfile(input) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = {
    ...DEFAULT_SESSION_INPUT_SAFETY_PROFILE
  };

  for (const key of BOOLEAN_KEYS) {
    normalized[key] = source[key] === true;
  }

  for (const [key, fallback] of Object.entries(INTEGER_DEFAULTS)) {
    const value = Number(source[key]);
    normalized[key] = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
  }

  return normalized;
}

export function areSessionInputSafetyProfilesEqual(left, right) {
  const normalizedLeft = normalizeSessionInputSafetyProfile(left);
  const normalizedRight = normalizeSessionInputSafetyProfile(right);
  return [...BOOLEAN_KEYS, ...Object.keys(INTEGER_DEFAULTS)].every((key) => normalizedLeft[key] === normalizedRight[key]);
}

export function buildSessionInputSafetyProfileFromPreset(presetKey) {
  const key = typeof presetKey === "string" ? presetKey : "off";
  const preset = PRESET_DEFINITIONS[key] || PRESET_DEFINITIONS.off;
  return normalizeSessionInputSafetyProfile(preset.profile);
}

export function detectSessionInputSafetyPreset(profile) {
  const normalized = normalizeSessionInputSafetyProfile(profile);
  for (const key of SESSION_INPUT_SAFETY_PRESET_ORDER) {
    if (key === "custom") {
      continue;
    }
    if (areSessionInputSafetyProfilesEqual(normalized, buildSessionInputSafetyProfileFromPreset(key))) {
      return key;
    }
  }
  return "custom";
}

export function getSessionInputSafetyPresetLabel(presetKey) {
  if (presetKey === "custom") {
    return "Custom";
  }
  return PRESET_DEFINITIONS[presetKey]?.label || PRESET_DEFINITIONS.off.label;
}

export function listSessionInputSafetyPresetOptions() {
  return SESSION_INPUT_SAFETY_PRESET_ORDER.map((value) => ({
    value,
    label: getSessionInputSafetyPresetLabel(value)
  }));
}
