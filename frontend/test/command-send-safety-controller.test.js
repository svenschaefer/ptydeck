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
  assert.deepEqual(analyzeShellSyntax("if true; then"), {
    valid: false,
    incomplete: true,
    code: "incomplete_shell_construct",
    label: "Input looks like an incomplete shell construct."
  });
  assert.equal(isLikelyNaturalLanguageInput("please inspect the failing tests and fix them"), true);
  assert.equal(isLikelyNaturalLanguageInput("git status"), false);
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
