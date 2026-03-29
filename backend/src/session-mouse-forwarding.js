import { ApiError } from "./errors.js";

export const SESSION_MOUSE_FORWARDING_MODE_OFF = "off";
export const SESSION_MOUSE_FORWARDING_MODE_APPLICATION = "application";
export const SESSION_MOUSE_FORWARDING_MODE_VALUES = Object.freeze([
  SESSION_MOUSE_FORWARDING_MODE_OFF,
  SESSION_MOUSE_FORWARDING_MODE_APPLICATION
]);

export function normalizeSessionMouseForwardingMode(value, { strict = true } = {}) {
  if (value === undefined || value === null || value === "") {
    return SESSION_MOUSE_FORWARDING_MODE_OFF;
  }
  if (typeof value !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'mouseForwardingMode' must be a string.");
    }
    return SESSION_MOUSE_FORWARDING_MODE_OFF;
  }
  const normalized = value.trim().toLowerCase();
  if (SESSION_MOUSE_FORWARDING_MODE_VALUES.includes(normalized)) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'mouseForwardingMode' must be one of: ${SESSION_MOUSE_FORWARDING_MODE_VALUES.join(", ")}.`
    );
  }
  return SESSION_MOUSE_FORWARDING_MODE_OFF;
}
