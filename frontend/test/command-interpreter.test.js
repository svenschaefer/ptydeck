import test from "node:test";
import assert from "node:assert/strict";
import { interpretComposerInput } from "../src/public/command-interpreter.js";

test("interpretComposerInput routes non-slash input to terminal plane unchanged", () => {
  const result = interpretComposerInput("echo hello\npwd");
  assert.deepEqual(result, {
    kind: "terminal",
    data: "echo hello\npwd"
  });
});

test("interpretComposerInput routes slash input to control plane", () => {
  const result = interpretComposerInput("/switch abc");
  assert.equal(result.kind, "control");
  assert.equal(result.command, "switch");
  assert.deepEqual(result.args, ["abc"]);
});

test("interpretComposerInput keeps empty slash command as control input", () => {
  const result = interpretComposerInput("/");
  assert.equal(result.kind, "control");
  assert.equal(result.command, "");
  assert.deepEqual(result.args, []);
});

test("interpretComposerInput keeps leading-space slash input in terminal plane", () => {
  const result = interpretComposerInput(" /switch abc");
  assert.deepEqual(result, {
    kind: "terminal",
    data: " /switch abc"
  });
});

test("interpretComposerInput keeps later-line slash input in terminal plane", () => {
  const result = interpretComposerInput("echo hi\n/switch abc");
  assert.deepEqual(result, {
    kind: "terminal",
    data: "echo hi\n/switch abc"
  });
});
