import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeShellSyntax,
  buildSessionInputSafetyProfileFromPresetKey,
  classifyDangerousShellCommand,
  evaluateSendSafety,
  evaluateSessionSendSafety,
  isLikelyNaturalLanguageInput
} from "../src/public/command-send-safety-controller.js";

test("command send safety controller detects shell syntax and natural language signals", () => {
  assert.deepEqual(analyzeShellSyntax("echo hi"), {
    valid: true,
    incomplete: false,
    code: "valid_shell_syntax",
    label: ""
  });
  assert.deepEqual(analyzeShellSyntax("echo done"), {
    valid: true,
    incomplete: false,
    code: "valid_shell_syntax",
    label: ""
  });
  assert.deepEqual(analyzeShellSyntax("if true; then"), {
    valid: false,
    incomplete: true,
    code: "incomplete_shell_construct",
    label: "Input looks like an incomplete shell construct."
  });
  assert.deepEqual(analyzeShellSyntax("if true\nthen\necho ok\nfi"), {
    valid: true,
    incomplete: false,
    code: "valid_shell_syntax",
    label: ""
  });
  assert.equal(isLikelyNaturalLanguageInput("please inspect the failing tests and fix them"), true);
  assert.equal(isLikelyNaturalLanguageInput("fix tests"), true);
  assert.equal(isLikelyNaturalLanguageInput("what changed"), true);
  assert.equal(isLikelyNaturalLanguageInput("git status"), false);
  assert.equal(isLikelyNaturalLanguageInput("grep the pattern in file.txt"), false);
  assert.deepEqual(classifyDangerousShellCommand("git reset --hard HEAD"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command resets git state destructively."
  });
});

test("command send safety controller evaluates per-session risks and grouped confirmation reasons", () => {
  const profile = buildSessionInputSafetyProfileFromPresetKey("shell_balanced");
  const session = {
    id: "s1",
    name: "ops-shell",
    inputSafetyProfile: profile
  };

  const single = evaluateSessionSendSafety({
    session,
    text: "please inspect the failing tests and fix them",
    recentTargetSwitchAt: 900,
    nowMs: 1000
  });

  assert.equal(single.requiresConfirmation, true);
  assert.deepEqual(
    single.reasons.map((entry) => entry.code),
    ["recent_target_switch", "natural_language_input"]
  );

  const grouped = evaluateSendSafety({
    sessions: [
      session,
      { id: "s2", name: "build-shell", inputSafetyProfile: profile }
    ],
    text: "rm -rf ./tmp",
    recentTargetSwitchAt: 0,
    nowMs: 10000,
    formatSessionToken: (sessionId) => (sessionId === "s1" ? "7" : "8"),
    formatSessionDisplayName: (target) => target.name
  });

  assert.equal(grouped.requiresConfirmation, true);
  assert.equal(grouped.summary, "Confirmation required before sending to 2 sessions.");
  assert.deepEqual(
    grouped.reasons.map((entry) => entry.code),
    ["dangerous_shell_command"]
  );
  assert.deepEqual(grouped.reasons[0].targets, ["[7] ops-shell", "[8] build-shell"]);
});

test("command send safety controller keeps common shell commands clear while catching terse natural language in strict mode", () => {
  const profile = buildSessionInputSafetyProfileFromPresetKey("shell_strict");
  const session = {
    id: "s1",
    name: "ops-shell",
    inputSafetyProfile: profile
  };

  const prose = evaluateSessionSendSafety({
    session,
    text: "fix tests",
    recentTargetSwitchAt: 0,
    nowMs: 10000
  });
  assert.deepEqual(
    prose.reasons.map((entry) => entry.code),
    ["natural_language_input"]
  );

  const shellCommand = evaluateSessionSendSafety({
    session,
    text: "grep the pattern in file.txt",
    recentTargetSwitchAt: 0,
    nowMs: 10000
  });
  assert.equal(shellCommand.requiresConfirmation, false);
  assert.deepEqual(shellCommand.reasons, []);

  const multilineShellBlock = evaluateSessionSendSafety({
    session,
    text:
      "npm run rollout:gcp-hosted:wsl -- --environment dev --source-commit-sha af0ed75\n" +
      "npm run -s check:hosted:dev:sweep\n" +
      "npm run -s check:runner-api:interactive-startup:dev",
    recentTargetSwitchAt: 9500,
    nowMs: 10000
  });
  assert.equal(multilineShellBlock.requiresConfirmation, false);
  assert.deepEqual(multilineShellBlock.reasons, []);
});
