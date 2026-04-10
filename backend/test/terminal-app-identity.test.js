import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnknownTerminalAppIdentity,
  deriveTerminalAppIdentityFromForegroundProcess,
  deriveTerminalAppIdentityFromSessionHints,
  deriveTerminalAppIdentityFromTerminalSignals,
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

test("deriveTerminalAppIdentityFromForegroundProcess recognizes coding-agent processes directly", () => {
  const identity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      terminalPid: 200,
      foregroundProcessGroupId: 210,
      representativeProcess: {
        pid: 210,
        ppid: 200,
        executableName: "codex",
        comm: "codex",
        name: "codex",
        executablePath: "/usr/local/bin/codex",
        commandLine: ["codex", "--json"],
        ttyPath: "/dev/pts/5"
      },
      foregroundProcesses: [
        {
          pid: 210,
          ppid: 200,
          executableName: "codex",
          comm: "codex",
          name: "codex",
          executablePath: "/usr/local/bin/codex",
          commandLine: ["codex", "--json"],
          ttyPath: "/dev/pts/5"
        }
      ],
      ancestry: [
        {
          pid: 200,
          ppid: 100,
          executableName: "bash",
          comm: "bash",
          name: "bash",
          executablePath: "/usr/bin/bash",
          commandLine: ["bash"],
          ttyPath: "/dev/pts/5"
        }
      ]
    },
    { updatedAt: 1710000000005 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "foreground-process");
  assert.equal(identity.details.foregroundProcess.representativeProcess.pid, 210);
});

test("deriveTerminalAppIdentityFromForegroundProcess falls back deterministically for shell wrappers and multiplexers", () => {
  const shellIdentity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 300,
        ppid: 1,
        executableName: "bash",
        comm: "bash",
        name: "bash",
        executablePath: "/usr/bin/bash",
        commandLine: ["bash"],
        ttyPath: "/dev/pts/7"
      },
      foregroundProcesses: [],
      ancestry: []
    },
    { updatedAt: 1710000000006 }
  );
  assert.equal(shellIdentity.family, "shell");
  assert.equal(shellIdentity.label, "bash");
  assert.equal(shellIdentity.source, "foreground-process");

  const tmuxIdentity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 301,
        ppid: 1,
        executableName: "tmux",
        comm: "tmux",
        name: "tmux",
        executablePath: "/usr/bin/tmux",
        commandLine: ["tmux"],
        ttyPath: "/dev/pts/7"
      },
      foregroundProcesses: [],
      ancestry: []
    },
    { updatedAt: 1710000000007 }
  );
  assert.equal(tmuxIdentity.family, "tui");
  assert.equal(tmuxIdentity.label, "tmux");
  assert.equal(tmuxIdentity.source, "foreground-process");
});

test("deriveTerminalAppIdentityFromTerminalSignals promotes shell markers into shell identity", () => {
  const identity = deriveTerminalAppIdentityFromTerminalSignals(
    {
      shellPhase: "prompt",
      lastShellMarkerProtocol: "osc-133",
      lastShellMarker: "prompt-start",
      lastShellMarkerAt: 1710000000008,
      currentDirectory: "/workspace/code/ptydeck",
      currentDirectoryProtocol: "osc-1337",
      currentDirectoryUpdatedAt: 1710000000008,
      alternateScreenActive: false,
      alternateScreenCode: null,
      alternateScreenUpdatedAt: null
    },
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000008 }
  );

  assert.equal(identity.family, "shell");
  assert.equal(identity.label, "bash");
  assert.equal(identity.source, "shell-marker");
  assert.equal(identity.details.shellMarkers.currentDirectory, "/workspace/code/ptydeck");
});

test("deriveTerminalAppIdentityFromTerminalSignals uses alternate screen as a bounded tui-family hint", () => {
  const identity = deriveTerminalAppIdentityFromTerminalSignals(
    {
      shellPhase: "output",
      lastShellMarkerProtocol: "osc-633",
      lastShellMarker: "command-output-start",
      lastShellMarkerAt: 1710000000009,
      currentDirectory: "",
      currentDirectoryProtocol: "",
      currentDirectoryUpdatedAt: null,
      alternateScreenActive: true,
      alternateScreenCode: 1049,
      alternateScreenUpdatedAt: 1710000000009
    },
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000009 }
  );

  assert.equal(identity.family, "tui");
  assert.equal(identity.label, "");
  assert.equal(identity.source, "terminal-mode");
  assert.equal(identity.details.terminalMode.alternateScreenCode, 1049);
});

test("deriveTerminalAppIdentityFromTerminalSignals does not override stronger foreground-process identities", () => {
  const existingIdentity = {
    family: "coding-agent",
    label: "codex",
    source: "foreground-process",
    confidence: 0.94,
    details: {
      foregroundProcess: {
        representativeProcess: {
          executableName: "codex"
        }
      }
    },
    updatedAt: 1710000000010
  };
  const identity = deriveTerminalAppIdentityFromTerminalSignals(
    {
      shellPhase: "prompt",
      lastShellMarkerProtocol: "osc-133",
      lastShellMarker: "prompt-start",
      lastShellMarkerAt: 1710000000011,
      currentDirectory: "/workspace",
      currentDirectoryProtocol: "osc-1337",
      currentDirectoryUpdatedAt: 1710000000011,
      alternateScreenActive: false,
      alternateScreenCode: null,
      alternateScreenUpdatedAt: null
    },
    {
      shell: "/bin/bash"
    },
    { existingIdentity, updatedAt: 1710000000011 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "foreground-process");
});
