import test from "node:test";
import assert from "node:assert/strict";

import { createSessionViewModel } from "../src/public/session-view-model.js";

const model = createSessionViewModel({
  defaultDeckId: "default",
  sessionTagPattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  sessionTagMaxEntries: 3,
  sessionTagMaxLength: 8,
  sessionEnvKeyPattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
  sessionEnvMaxEntries: 2,
  formatSessionToken: (id) => id.slice(0, 2)
});

test("session view model normalizes tags deterministically", () => {
  assert.deepEqual(model.normalizeSessionTags(["Beta", "alpha", "beta", "bad tag", "toolongtag"]), ["alpha", "beta"]);
});

test("session view model validates environment payloads", () => {
  assert.deepEqual(model.parseSessionEnv("FOO=1\nBAR=two"), {
    ok: true,
    env: { FOO: "1", BAR: "two" }
  });
  assert.equal(model.parseSessionEnv("1BAD=value").ok, false);
});

test("session runtime helpers produce exited messaging", () => {
  const session = { id: "abcd1234", name: "build", state: "exited", exitCode: 2, exitSignal: "" };
  assert.equal(model.getSessionStateBadgeText(session), "EXITED");
  assert.match(model.getExitedSessionMessage(session), /exit code 2/);
});
