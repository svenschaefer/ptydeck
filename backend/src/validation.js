import { ApiError } from "./errors.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const THEME_PROFILE_KEYS = [
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
const THEME_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isThemeProfile(value) {
  if (!isObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== THEME_PROFILE_KEYS.length) {
    return false;
  }
  for (const key of THEME_PROFILE_KEYS) {
    if (typeof value[key] !== "string" || !THEME_HEX_PATTERN.test(value[key])) {
      return false;
    }
  }
  return keys.every((key) => THEME_PROFILE_KEYS.includes(key));
}

export function validateRequest({ method, pathname, params, body }) {
  if (method === "POST" && pathname === "/api/v1/sessions") {
    if (body !== undefined && !isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (body?.cwd !== undefined && typeof body.cwd !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'cwd' must be a string.");
    }
    if (body?.shell !== undefined && typeof body.shell !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'shell' must be a string.");
    }
    if (body?.name !== undefined && typeof body.name !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
    }
    if (body?.startCwd !== undefined && typeof body.startCwd !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'startCwd' must be a string.");
    }
    if (body?.startCommand !== undefined && typeof body.startCommand !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'startCommand' must be a string.");
    }
    if (body?.env !== undefined) {
      if (!isObject(body.env) || !Object.values(body.env).every((value) => typeof value === "string")) {
        throw new ApiError(400, "ValidationError", "Field 'env' must be an object with string values.");
      }
    }
    if (body?.tags !== undefined) {
      if (!Array.isArray(body.tags) || !body.tags.every((value) => typeof value === "string")) {
        throw new ApiError(400, "ValidationError", "Field 'tags' must be an array of strings.");
      }
    }
    if (body?.themeProfile !== undefined && !isObject(body.themeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'themeProfile' must be an object.");
    }
  }

  if (method === "PATCH" && pathname.match(/^\/api\/v1\/sessions\/[^/]+$/)) {
    if (!params.sessionId) {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (
      body.name === undefined &&
      body.startCwd === undefined &&
      body.startCommand === undefined &&
      body.env === undefined &&
      body.tags === undefined &&
      body.themeProfile === undefined
    ) {
      throw new ApiError(400, "ValidationError", "At least one updatable field is required.");
    }
    if (body.name !== undefined && typeof body.name !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
    }
    if (body.startCwd !== undefined && typeof body.startCwd !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'startCwd' must be a string.");
    }
    if (body.startCommand !== undefined && typeof body.startCommand !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'startCommand' must be a string.");
    }
    if (body.env !== undefined) {
      if (!isObject(body.env) || !Object.values(body.env).every((value) => typeof value === "string")) {
        throw new ApiError(400, "ValidationError", "Field 'env' must be an object with string values.");
      }
    }
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || !body.tags.every((value) => typeof value === "string")) {
        throw new ApiError(400, "ValidationError", "Field 'tags' must be an array of strings.");
      }
    }
    if (body.themeProfile !== undefined && !isObject(body.themeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'themeProfile' must be an object.");
    }
  }

  if (method === "POST" && pathname.endsWith("/input")) {
    if (!params.sessionId) {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (!isObject(body) || typeof body.data !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'data' must be a string.");
    }
  }

  if (method === "POST" && pathname.endsWith("/resize")) {
    if (!params.sessionId) {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }

    const { cols, rows } = body;
    if (!Number.isInteger(cols) || cols < 1) {
      throw new ApiError(400, "ValidationError", "Field 'cols' must be an integer >= 1.");
    }
    if (!Number.isInteger(rows) || rows < 1) {
      throw new ApiError(400, "ValidationError", "Field 'rows' must be an integer >= 1.");
    }
  }

  if (method === "POST" && pathname.endsWith("/restart")) {
    if (!params.sessionId) {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (body !== undefined && !isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
  }

  if (method === "POST" && pathname === "/api/v1/auth/dev-token") {
    if (body !== undefined && !isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (body?.subject !== undefined && typeof body.subject !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'subject' must be a string.");
    }
    if (body?.tenantId !== undefined && typeof body.tenantId !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'tenantId' must be a string.");
    }
    if (body?.scopes !== undefined) {
      if (!Array.isArray(body.scopes) || !body.scopes.every((entry) => typeof entry === "string")) {
        throw new ApiError(400, "ValidationError", "Field 'scopes' must be a string array.");
      }
    }
  }

  if (method === "GET" && pathname.match(/^\/api\/v1\/custom-commands\/[^/]+$/)) {
    if (!params.commandName || typeof params.commandName !== "string") {
      throw new ApiError(400, "ValidationError", "Missing commandName path parameter.");
    }
  }

  if (method === "PUT" && pathname.match(/^\/api\/v1\/custom-commands\/[^/]+$/)) {
    if (!params.commandName || typeof params.commandName !== "string") {
      throw new ApiError(400, "ValidationError", "Missing commandName path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (typeof body.content !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'content' must be a string.");
    }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/v1\/custom-commands\/[^/]+$/)) {
    if (!params.commandName || typeof params.commandName !== "string") {
      throw new ApiError(400, "ValidationError", "Missing commandName path parameter.");
    }
  }
}

function isSession(value) {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    (value.state === "active" || value.state === "unrestored") &&
    typeof value.cwd === "string" &&
    typeof value.shell === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
    typeof value.startCwd === "string" &&
    typeof value.startCommand === "string" &&
    isObject(value.env) &&
    Object.values(value.env).every((entry) => typeof entry === "string") &&
    Array.isArray(value.tags) &&
    value.tags.every((entry) => typeof entry === "string") &&
    isThemeProfile(value.themeProfile) &&
    Number.isInteger(value.createdAt) &&
    Number.isInteger(value.updatedAt)
  );
}

function isAuthToken(value) {
  return (
    isObject(value) &&
    typeof value.accessToken === "string" &&
    typeof value.tokenType === "string" &&
    Number.isInteger(value.expiresIn) &&
    typeof value.scope === "string"
  );
}

function isCustomCommand(value) {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.content === "string" &&
    Number.isInteger(value.createdAt) &&
    Number.isInteger(value.updatedAt)
  );
}

export function validateResponse({ statusCode, body, expect }) {
  if (expect === "session" && !isSession(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match Session schema.");
  }

  if (expect === "sessionList") {
    if (!Array.isArray(body) || !body.every((item) => isSession(item))) {
      throw new ApiError(500, "ResponseValidationError", "Response does not match Session[] schema.");
    }
  }

  if (expect === "error") {
    if (!isObject(body) || typeof body.error !== "string" || typeof body.message !== "string") {
      throw new ApiError(statusCode, "ResponseValidationError", "Error response schema mismatch.");
    }
  }

  if (expect === "authToken" && !isAuthToken(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match AuthTokenResponse schema.");
  }

  if (expect === "customCommand" && !isCustomCommand(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match CustomCommand schema.");
  }

  if (expect === "customCommandList") {
    if (!Array.isArray(body) || !body.every((item) => isCustomCommand(item))) {
      throw new ApiError(500, "ResponseValidationError", "Response does not match CustomCommand[] schema.");
    }
  }
}
