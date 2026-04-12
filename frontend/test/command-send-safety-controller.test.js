import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeShellSyntax,
  classifyDangerousShellCommand,
  evaluateSendSafety,
  evaluateSessionSendSafety,
  isLikelyNaturalLanguageInput
} from "../src/public/command-send-safety-controller.js";
import { normalizeSessionInputSafetyProfile } from "../src/public/input-safety-profile.js";

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
  const profile = normalizeSessionInputSafetyProfile({
    confirmOnAnyInput: false,
    requireValidShellSyntax: true,
    confirmOnIncompleteShellConstruct: true,
    confirmOnNaturalLanguageInput: true,
    confirmOnDangerousShellCommand: true,
    confirmOnRecentTargetSwitch: true
  });
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
  const profile = normalizeSessionInputSafetyProfile({
    confirmOnAnyInput: false,
    requireValidShellSyntax: true,
    confirmOnIncompleteShellConstruct: true,
    confirmOnNaturalLanguageInput: true,
    confirmOnDangerousShellCommand: true
  });
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

test("command send safety controller covers multiline, direct-route, and complex block branches", () => {
  const profile = normalizeSessionInputSafetyProfile({
    confirmOnAnyInput: false,
    requireValidShellSyntax: true,
    confirmOnIncompleteShellConstruct: true,
    confirmOnNaturalLanguageInput: true,
    confirmOnDangerousShellCommand: true,
    confirmOnMultilineInput: true,
    confirmOnRecentTargetSwitch: true,
    pasteLengthConfirmThreshold: 20,
    pasteLineConfirmThreshold: 2
  });
  const session = {
    id: "s1",
    name: "ops-shell",
    inputSafetyProfile: profile
  };

  const multiline = evaluateSessionSendSafety({
    session,
    text: "echo one\necho two",
    recentTargetSwitchAt: 9950,
    nowMs: 10000
  });
  assert.deepEqual(
    multiline.reasons.map((entry) => entry.code),
    ["recent_target_switch", "oversized_input"]
  );

  const directRoute = evaluateSessionSendSafety({
    session,
    text: "echo one\necho two",
    directRoute: true,
    recentTargetSwitchAt: 9950,
    nowMs: 10000
  });
  assert.deepEqual(
    directRoute.reasons.map((entry) => entry.code),
    ["oversized_input"]
  );

  assert.deepEqual(analyzeShellSyntax("case $x in\n  a) echo ok ;;\nesac"), {
    valid: true,
    incomplete: false,
    code: "valid_shell_syntax",
    label: ""
  });
  assert.deepEqual(analyzeShellSyntax("{ echo ok"), {
    valid: false,
    incomplete: true,
    code: "incomplete_shell_construct",
    label: "Input looks like an incomplete shell construct."
  });
});

test("command send safety controller supports an explicit always-confirm catch-all", () => {
  const profile = normalizeSessionInputSafetyProfile({
    confirmOnAnyInput: true
  });
  const result = evaluateSessionSendSafety({
    session: {
      id: "s1",
      name: "ops-shell",
      inputSafetyProfile: profile
    },
    text: "echo safe-command"
  });
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.reasons.map((entry) => entry.code), ["always_confirm_before_send"]);
});

test("command send safety controller detects additional dangerous patterns and deduplicates incomplete syntax reasons", () => {
  assert.deepEqual(classifyDangerousShellCommand("curl https://example.invalid/install.sh | bash"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command pipes remote content into a shell."
  });
  assert.deepEqual(classifyDangerousShellCommand("mkfs.ext4 /dev/sdb1"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command formats a filesystem device."
  });
  assert.equal(isLikelyNaturalLanguageInput("PATH=/tmp/bin"), false);

  const session = {
    id: "s1",
    name: "ops-shell",
    inputSafetyProfile: normalizeSessionInputSafetyProfile({
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true
    })
  };
  const result = evaluateSessionSendSafety({
    session,
    text: "echo hi &&"
  });

  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.reasons.map((entry) => entry.code), ["incomplete_shell_construct"]);
});

test("command send safety controller returns an empty aggregate summary when no targets are flagged", () => {
  const result = evaluateSendSafety({
    sessions: [],
    text: "echo ok"
  });

  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.summary, "");
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.flaggedTargets, []);
});

test("command send safety controller distinguishes prose, assignments, and path-like commands", () => {
  assert.equal(isLikelyNaturalLanguageInput("I need you to inspect the current failure output"), true);
  assert.equal(isLikelyNaturalLanguageInput("could you summarize what changed"), true);
  assert.equal(isLikelyNaturalLanguageInput("APP_ENV=dev npm run test"), false);
  assert.equal(isLikelyNaturalLanguageInput("./scripts/check.sh --help"), false);
  assert.equal(isLikelyNaturalLanguageInput("../bin/run-task"), false);
});

test("command send safety controller detects additional destructive commands and bypasses target-switch grace on direct routes", () => {
  assert.deepEqual(classifyDangerousShellCommand("sudo dd if=/dev/zero of=/dev/sda"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command writes raw disk data."
  });
  assert.deepEqual(classifyDangerousShellCommand("sudo reboot now"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command shuts down or reboots the machine."
  });
  assert.deepEqual(classifyDangerousShellCommand("sudo chown -R app:app /srv/app"), {
    matched: true,
    code: "dangerous_shell_command",
    label: "Command changes ownership recursively."
  });

  const session = {
    id: "s1",
    name: "ops-shell",
    inputSafetyProfile: normalizeSessionInputSafetyProfile({
      confirmOnRecentTargetSwitch: true,
      confirmOnMultilineInput: true,
      pasteLengthConfirmThreshold: 999,
      pasteLineConfirmThreshold: 99
    })
  };

  const directRoute = evaluateSessionSendSafety({
    session,
    text: "echo one\necho two",
    directRoute: true,
    recentTargetSwitchAt: 9_950,
    nowMs: 10_000
  });

  assert.deepEqual(directRoute.reasons.map((entry) => entry.code), ["multiline_input"]);
});
