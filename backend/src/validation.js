import { ApiError } from "./errors.js";
import {
  SESSION_INPUT_SAFETY_PROFILE_BOOLEAN_KEYS,
  SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS,
  SESSION_INPUT_SAFETY_PROFILE_KEYS
} from "./session-input-safety-profile.js";

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

function isInputSafetyProfile(value) {
  if (!isObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== SESSION_INPUT_SAFETY_PROFILE_KEYS.length) {
    return false;
  }
  for (const key of SESSION_INPUT_SAFETY_PROFILE_BOOLEAN_KEYS) {
    if (typeof value[key] !== "boolean") {
      return false;
    }
  }
  for (const [key, limits] of Object.entries(SESSION_INPUT_SAFETY_PROFILE_INTEGER_LIMITS)) {
    if (!Number.isInteger(value[key]) || value[key] < limits.min || value[key] > limits.max) {
      return false;
    }
  }
  return keys.every((key) => SESSION_INPUT_SAFETY_PROFILE_KEYS.includes(key));
}

function isDeck(value) {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Number.isInteger(value.createdAt) &&
    Number.isInteger(value.updatedAt) &&
    isObject(value.settings)
  );
}

function isLayoutProfileDeckTerminalSettings(value) {
  return (
    isObject(value) &&
    Number.isInteger(value.cols) &&
    value.cols >= 20 &&
    value.cols <= 400 &&
    Number.isInteger(value.rows) &&
    value.rows >= 5 &&
    value.rows <= 120
  );
}

function isLayoutProfileLayout(value) {
  return (
    isObject(value) &&
    typeof value.activeDeckId === "string" &&
    typeof value.sidebarVisible === "boolean" &&
    typeof value.sessionFilterText === "string" &&
    isObject(value.deckTerminalSettings) &&
    Object.values(value.deckTerminalSettings).every((entry) => isLayoutProfileDeckTerminalSettings(entry))
  );
}

function isLayoutProfile(value) {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Number.isInteger(value.createdAt) &&
    Number.isInteger(value.updatedAt) &&
    isLayoutProfileLayout(value.layout)
  );
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
    if (body?.note !== undefined && typeof body.note !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'note' must be a string.");
    }
    if (body?.inputSafetyProfile !== undefined && !isObject(body.inputSafetyProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'inputSafetyProfile' must be an object.");
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
    if (body?.activeThemeProfile !== undefined && !isObject(body.activeThemeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'activeThemeProfile' must be an object.");
    }
    if (body?.inactiveThemeProfile !== undefined && !isObject(body.inactiveThemeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'inactiveThemeProfile' must be an object.");
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
      body.note === undefined &&
      body.inputSafetyProfile === undefined &&
      body.env === undefined &&
      body.tags === undefined &&
      body.themeProfile === undefined &&
      body.activeThemeProfile === undefined &&
      body.inactiveThemeProfile === undefined
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
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'note' must be a string.");
    }
    if (body.inputSafetyProfile !== undefined && !isObject(body.inputSafetyProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'inputSafetyProfile' must be an object.");
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
    if (body.activeThemeProfile !== undefined && !isObject(body.activeThemeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'activeThemeProfile' must be an object.");
    }
    if (body.inactiveThemeProfile !== undefined && !isObject(body.inactiveThemeProfile)) {
      throw new ApiError(400, "ValidationError", "Field 'inactiveThemeProfile' must be an object.");
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

  if (method === "POST" && pathname === "/api/v1/auth/ws-ticket") {
    if (body !== undefined && !isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
  }

  if (method === "GET" && pathname.match(/^\/api\/v1\/custom-commands\/[^/]+$/)) {
    if (!params.commandName || typeof params.commandName !== "string") {
      throw new ApiError(400, "ValidationError", "Missing commandName path parameter.");
    }
  }

  if (method === "GET" && pathname.match(/^\/api\/v1\/sessions\/[^/]+\/replay-export$/)) {
    if (!params.sessionId || typeof params.sessionId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
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

  if (method === "GET" && pathname.match(/^\/api\/v1\/decks\/[^/]+$/)) {
    if (!params.deckId || typeof params.deckId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing deckId path parameter.");
    }
  }

  if (method === "POST" && pathname === "/api/v1/decks") {
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
    }
    if (body.id !== undefined && typeof body.id !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'id' must be a string.");
    }
    if (body.settings !== undefined && !isObject(body.settings)) {
      throw new ApiError(400, "ValidationError", "Field 'settings' must be an object.");
    }
  }

  if (method === "PATCH" && pathname.match(/^\/api\/v1\/decks\/[^/]+$/)) {
    if (!params.deckId || typeof params.deckId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing deckId path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (body.name === undefined && body.settings === undefined) {
      throw new ApiError(400, "ValidationError", "At least one updatable deck field is required.");
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
    }
    if (body.settings !== undefined && !isObject(body.settings)) {
      throw new ApiError(400, "ValidationError", "Field 'settings' must be an object.");
    }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/v1\/decks\/[^/]+$/)) {
    if (!params.deckId || typeof params.deckId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing deckId path parameter.");
    }
  }

  if (method === "POST" && pathname.match(/^\/api\/v1\/decks\/[^/]+\/sessions\/[^/]+:move$/)) {
    if (!params.deckId || typeof params.deckId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing deckId path parameter.");
    }
    if (!params.sessionId || typeof params.sessionId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (body !== undefined && !isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
  }

  if (method === "GET" && pathname.match(/^\/api\/v1\/layout-profiles\/[^/]+$/)) {
    if (!params.profileId || typeof params.profileId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing profileId path parameter.");
    }
  }

  if (method === "POST" && pathname === "/api/v1/layout-profiles") {
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
    }
    if (body.id !== undefined && typeof body.id !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'id' must be a string.");
    }
    if (body.layout !== undefined && !isObject(body.layout)) {
      throw new ApiError(400, "ValidationError", "Field 'layout' must be an object.");
    }
  }

  if (method === "PATCH" && pathname.match(/^\/api\/v1\/layout-profiles\/[^/]+$/)) {
    if (!params.profileId || typeof params.profileId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing profileId path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (body.name === undefined && body.layout === undefined) {
      throw new ApiError(400, "ValidationError", "At least one updatable layout profile field is required.");
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
    }
    if (body.layout !== undefined && !isObject(body.layout)) {
      throw new ApiError(400, "ValidationError", "Field 'layout' must be an object.");
    }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/v1\/layout-profiles\/[^/]+$/)) {
    if (!params.profileId || typeof params.profileId !== "string") {
      throw new ApiError(400, "ValidationError", "Missing profileId path parameter.");
    }
  }
}

function isSession(value) {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.deckId === "string" &&
    (value.state === "starting" || value.state === "running" || value.state === "unrestored") &&
    typeof value.cwd === "string" &&
    typeof value.shell === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.note === undefined || typeof value.note === "string") &&
    typeof value.startCwd === "string" &&
    typeof value.startCommand === "string" &&
    isObject(value.env) &&
    Object.values(value.env).every((entry) => typeof entry === "string") &&
    isInputSafetyProfile(value.inputSafetyProfile) &&
    Array.isArray(value.tags) &&
    value.tags.every((entry) => typeof entry === "string") &&
    isThemeProfile(value.activeThemeProfile) &&
    isThemeProfile(value.inactiveThemeProfile) &&
    (value.themeProfile === undefined || isThemeProfile(value.themeProfile)) &&
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

function isWsTicket(value) {
  return (
    isObject(value) &&
    typeof value.ticket === "string" &&
    typeof value.tokenType === "string" &&
    Number.isInteger(value.expiresIn)
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

function isSessionReplayExport(value) {
  return (
    isObject(value) &&
    typeof value.sessionId === "string" &&
    (
      value.sessionState === "starting" ||
      value.sessionState === "running" ||
      value.sessionState === "exited" ||
      value.sessionState === "unrestored"
    ) &&
    value.scope === "retained_replay_tail" &&
    value.format === "text" &&
    typeof value.contentType === "string" &&
    typeof value.fileName === "string" &&
    typeof value.data === "string" &&
    Number.isInteger(value.retainedChars) &&
    value.retainedChars >= 0 &&
    Number.isInteger(value.retentionLimitChars) &&
    value.retentionLimitChars >= 0 &&
    typeof value.truncated === "boolean"
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

  if (expect === "wsTicket" && !isWsTicket(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match WsTicketResponse schema.");
  }

  if (expect === "sessionReplayExport" && !isSessionReplayExport(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match SessionReplayExport schema.");
  }

  if (expect === "customCommand" && !isCustomCommand(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match CustomCommand schema.");
  }

  if (expect === "customCommandList") {
    if (!Array.isArray(body) || !body.every((item) => isCustomCommand(item))) {
      throw new ApiError(500, "ResponseValidationError", "Response does not match CustomCommand[] schema.");
    }
  }

  if (expect === "deck" && !isDeck(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match Deck schema.");
  }

  if (expect === "deckList") {
    if (!Array.isArray(body) || !body.every((item) => isDeck(item))) {
      throw new ApiError(500, "ResponseValidationError", "Response does not match Deck[] schema.");
    }
  }

  if (expect === "layoutProfile" && !isLayoutProfile(body)) {
    throw new ApiError(500, "ResponseValidationError", "Response does not match LayoutProfile schema.");
  }

  if (expect === "layoutProfileList") {
    if (!Array.isArray(body) || !body.every((item) => isLayoutProfile(item))) {
      throw new ApiError(500, "ResponseValidationError", "Response does not match LayoutProfile[] schema.");
    }
  }
}
