import test from "node:test";
import assert from "node:assert/strict";

import {
  buildComposerRepairDiff,
  createComposerRepairPreviewState,
  requestComposerRepairCandidate
} from "../src/public/composer-repair-runtime.js";

test("composer repair runtime builds a simple line diff for changed multiline input", () => {
  const diff = buildComposerRepairDiff("echo one\nbroken", "echo one\nfixed");
  assert.equal(diff, " echo one\n-broken\n+fixed");
});

test("composer repair runtime returns an unavailable preview shell state when no candidate matches", () => {
  const preview = createComposerRepairPreviewState("docker run \\\n--name demo", null);
  assert.equal(preview.active, true);
  assert.equal(preview.canApply, false);
  assert.equal(preview.summary, "No repair suggestion available.");
  assert.equal(preview.originalText, "docker run \\\n--name demo");
  assert.equal(preview.repairedText, "");
  assert.equal(preview.diffText, "");
});

test("composer repair runtime returns an apply-ready preview state for changed candidates", () => {
  const preview = createComposerRepairPreviewState("Ubuntu-\n24.04", {
    repairedText: "Ubuntu-24.04",
    languageFamily: "powershell",
    confidence: 0.92,
    operations: ["joined wrapped token"]
  });
  assert.equal(preview.active, true);
  assert.equal(preview.canApply, true);
  assert.equal(preview.summary, "Review repair suggestion.");
  assert.equal(preview.detail, "Family: powershell | Confidence: 92% | Ops: joined wrapped token");
  assert.equal(preview.originalText, "Ubuntu-\n24.04");
  assert.equal(preview.repairedText, "Ubuntu-24.04");
  assert.equal(preview.diffText, "-Ubuntu-\n-24.04\n+Ubuntu-24.04");
});

test("composer repair runtime repairs wrapped PowerShell path tokens when confidence is strong enough", () => {
  const candidate = requestComposerRepairCandidate({
    draft:
      "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-\n24.04\\home\\wsl\\workspace\\demo.ps1\""
  });
  assert.equal(
    candidate?.repairedText,
    "powershell -ExecutionPolicy Bypass -File \"\\\\wsl.localhost\\Ubuntu-24.04\\home\\wsl\\workspace\\demo.ps1\""
  );
  assert.equal(candidate?.languageFamily, "powershell");
  assert.ok(Math.abs((candidate?.confidence || 0) - 0.88) < 0.001);
  assert.deepEqual(candidate?.operations, ["removed hard-wrap line break inside quoted argument"]);
});

test("composer repair runtime repairs explicit shell continuation markers into a single command line", () => {
  const candidate = requestComposerRepairCandidate({
    draft: "docker run \\\n--name my-container \\\n-e SOME_VAR=hello\nworld"
  });
  assert.deepEqual(candidate, {
    repairedText: "docker run --name my-container -e SOME_VAR=helloworld",
    languageFamily: "shell",
    confidence: 1,
    operations: [
      "collapsed explicit line-continuation marker",
      "joined wrapped argument value"
    ]
  });
});

test("composer repair runtime fails closed on ambiguous multiline input without strong repair signals", () => {
  const candidate = requestComposerRepairCandidate({
    draft: "hello\nworld"
  });
  assert.equal(candidate, null);
});

test("composer repair runtime repairs wrapped JSON string values and validates them through JSON.parse", () => {
  const candidate = requestComposerRepairCandidate({
    draft: "{\n  \"script\": \"powershell -ExecutionPolicy Bypass -File \\\\\\\\wsl.localhost\\\\Ubuntu-\n24.04\\\\demo.ps1\"\n}"
  });
  assert.equal(
    candidate?.repairedText,
    "{\n  \"script\": \"powershell -ExecutionPolicy Bypass -File \\\\\\\\wsl.localhost\\\\Ubuntu-24.04\\\\demo.ps1\"\n}"
  );
  assert.equal(candidate?.languageFamily, "json");
  assert.ok(Math.abs((candidate?.confidence || 0) - 0.84) < 0.001);
  assert.deepEqual(candidate?.operations, ["joined wrapped JSON string"]);
});
