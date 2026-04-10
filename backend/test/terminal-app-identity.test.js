import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnknownTerminalAppIdentity,
  deriveTerminalAppIdentityFromSessionHints,
  normalizeTerminalAppIdentity,
  terminalAppIdentityEquals
} from "../src/terminal-app-identity.js";

test("deriveTerminalAppIdentityFromSessionHints prefers start command and corroborates session name", () => {
  const identity = deriveTerminalAppIdentityFromSessionHints(
    {
      shell: "/bin/bash",
      name: "codex",
      startCommand: "codex --json"
    },
    { updatedAt: 1710000000000 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "explicit-hint");
  assert.equal(identity.confidence, 0.92);
  assert.equal(identity.updatedAt, 1710000000000);
  assert.equal(identity.details.explicitHints.length, 2);
});

test("deriveTerminalAppIdentityFromSessionHints recognizes build-test commands", () => {
  const identity = deriveTerminalAppIdentityFromSessionHints(
    {
      shell: "/bin/bash",
      name: "test-runner",
      startCommand: "pnpm run test"
    },
    { updatedAt: 1710000000001 }
  );

  assert.equal(identity.family, "build-test");
  assert.equal(identity.label, "pnpm");
  assert.equal(identity.details.explicitHints[0].subcommand, "test");
});

test("deriveTerminalAppIdentityFromSessionHints falls back to shell when no stronger hint exists", () => {
  const identity = deriveTerminalAppIdentityFromSessionHints(
    {
      shell: "/usr/bin/zsh",
      startCommand: "",
      name: "main-shell"
    },
    { updatedAt: 1710000000002 }
  );

  assert.equal(identity.family, "shell");
  assert.equal(identity.label, "zsh");
  assert.equal(identity.source, "explicit-hint");
});

test("deriveTerminalAppIdentityFromSessionHints preserves updatedAt when the normalized identity does not change", () => {
  const first = deriveTerminalAppIdentityFromSessionHints(
    {
      shell: "/bin/bash",
      startCommand: "codex"
    },
    { updatedAt: 1710000000003 }
  );
  const second = deriveTerminalAppIdentityFromSessionHints(
    {
      shell: "/bin/bash",
      startCommand: "codex"
    },
    { existingIdentity: first, updatedAt: 1710000000999 }
  );

  assert.equal(second.updatedAt, first.updatedAt);
  assert.equal(terminalAppIdentityEquals(first, second), true);
});

test("normalizeTerminalAppIdentity coerces malformed payloads to the unknown contract", () => {
  const identity = normalizeTerminalAppIdentity(
    {
      family: "bogus",
      source: "nope",
      confidence: 10,
      details: "bad"
    },
    { fallbackUpdatedAt: 1710000000004 }
  );

  assert.deepEqual(identity, buildUnknownTerminalAppIdentity(1710000000004));
});
