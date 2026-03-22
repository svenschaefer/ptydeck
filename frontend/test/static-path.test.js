import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolvePublicFilePath } from "../src/static-path.js";

test("resolvePublicFilePath maps root request to index.html", () => {
  const root = "/tmp/public";
  assert.equal(resolvePublicFilePath(root, "/"), resolve(root, "index.html"));
});

test("resolvePublicFilePath rejects path traversal attempts", () => {
  const root = "/tmp/public";
  assert.equal(resolvePublicFilePath(root, "/../secrets.txt"), null);
  assert.equal(resolvePublicFilePath(root, "/%2e%2e/secrets.txt"), null);
});

test("resolvePublicFilePath strips query and hash parts", () => {
  const root = "/tmp/public";
  assert.equal(resolvePublicFilePath(root, "/app.js?v=1#test"), resolve(root, "app.js"));
});

test("resolvePublicFilePath rejects malformed URI encoding", () => {
  const root = "/tmp/public";
  assert.equal(resolvePublicFilePath(root, "/%E0%A4%A"), null);
});
