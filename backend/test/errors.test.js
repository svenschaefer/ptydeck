import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, toErrorResponse } from "../src/errors.js";

test("toErrorResponse maps ApiError to structured payload", () => {
  const error = new ApiError(400, "ValidationError", "Invalid payload", { field: "cwd" });
  const mapped = toErrorResponse(error);

  assert.equal(mapped.statusCode, 400);
  assert.equal(mapped.body.error, "ValidationError");
  assert.equal(mapped.body.message, "Invalid payload");
  assert.deepEqual(mapped.body.details, { field: "cwd" });
});

test("toErrorResponse maps unknown error to internal server error", () => {
  const mapped = toErrorResponse(new Error("boom"));

  assert.equal(mapped.statusCode, 500);
  assert.equal(mapped.body.error, "InternalServerError");
  assert.equal(mapped.body.message, "An unexpected error occurred.");
});
