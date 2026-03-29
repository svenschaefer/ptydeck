export const SESSION_MOUSE_FORWARDING_MODE_OFF = "off";
export const SESSION_MOUSE_FORWARDING_MODE_APPLICATION = "application";

export const SESSION_MOUSE_FORWARDING_MODE_VALUES = Object.freeze([
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION
]);

const MOUSE_TRACKING_PRIVATE_MODES = Object.freeze(["9", "1000", "1001", "1002", "1003", "1004", "1005", "1006", "1015", "1016"]);
const MOUSE_TRACKING_PRIVATE_MODE_SET = new Set(MOUSE_TRACKING_PRIVATE_MODES);
const MOUSE_TRACKING_SEQUENCE_PATTERN = /\u001b\[\?([0-9;]+)([hl])/g;
const MOUSE_TRACKING_RESET_SEQUENCE = MOUSE_TRACKING_PRIVATE_MODES.map((mode) => `\u001b[?${mode}l`).join("");

export function normalizeSessionMouseForwardingMode(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SESSION_MOUSE_FORWARDING_MODE_VALUES.includes(normalized)
    ? normalized
    : SESSION_MOUSE_FORWARDING_MODE_OFF;
}

export function stripMouseTrackingControlSequences(chunk) {
  if (typeof chunk !== "string" || chunk.length === 0) {
    return "";
  }
  return chunk.replace(MOUSE_TRACKING_SEQUENCE_PATTERN, (_match, rawModes, operation) => {
    const retainedModes = String(rawModes || "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value && !MOUSE_TRACKING_PRIVATE_MODE_SET.has(value));
    if (retainedModes.length === 0) {
      return "";
    }
    return `\u001b[?${retainedModes.join(";")}${operation}`;
  });
}

export function getMouseTrackingResetSequence() {
  return MOUSE_TRACKING_RESET_SEQUENCE;
}
