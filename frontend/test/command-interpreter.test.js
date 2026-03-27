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

test("interpretComposerInput routes quick-switch input to quick-switch plane", () => {
  const result = interpretComposerInput(">abc");
  assert.deepEqual(result, {
    kind: "quick-switch",
    selector: "abc",
    raw: ">abc"
  });
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

test("interpretComposerInput keeps later-line quick-switch input in terminal plane", () => {
  const result = interpretComposerInput("echo hi\n>abc");
  assert.deepEqual(result, {
    kind: "terminal",
    data: "echo hi\n>abc"
  });
});

test("interpretComposerInput routes newline-separated slash commands to the control-script plane", () => {
  const result = interpretComposerInput("/deck switch ops\n/switch 1");
  assert.deepEqual(result, {
    kind: "control-script",
    mode: "multiline",
    commands: [
      { kind: "control", command: "deck", args: ["switch", "ops"], raw: "/deck switch ops" },
      { kind: "control", command: "switch", args: ["1"], raw: "/switch 1" }
    ],
    raw: "/deck switch ops\n/switch 1"
  });
});

test("interpretComposerInput routes explicit /run blocks to the control-script plane", () => {
  const result = interpretComposerInput("/run\n/deck switch ops\n/switch 1");
  assert.deepEqual(result, {
    kind: "control-script",
    mode: "run-block",
    commands: [
      { kind: "control", command: "deck", args: ["switch", "ops"], raw: "/deck switch ops" },
      { kind: "control", command: "switch", args: ["1"], raw: "/switch 1" }
    ],
    raw: "/run\n/deck switch ops\n/switch 1"
  });
});
