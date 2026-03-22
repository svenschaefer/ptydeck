import { ApiError } from "./errors.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  }

  if (method === "PATCH" && pathname.match(/^\/api\/v1\/sessions\/[^/]+$/)) {
    if (!params.sessionId) {
      throw new ApiError(400, "ValidationError", "Missing sessionId path parameter.");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    if (typeof body.name !== "string") {
      throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
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
}

function isSession(value) {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.cwd === "string" &&
    typeof value.shell === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
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
}
