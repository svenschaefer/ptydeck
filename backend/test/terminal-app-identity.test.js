import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnknownTerminalAppIdentity,
  createTerminalAppIdentityRuntimeState,
  deriveTerminalAppIdentityCandidateFromOutputHeuristics,
  deriveTerminalAppIdentityCandidateFromForegroundProcess,
  deriveTerminalAppIdentityCandidateFromSessionHints,
  deriveTerminalAppIdentityCandidatesFromTerminalSignals,
  deriveTerminalAppIdentityFromForegroundProcess,
  deriveTerminalAppIdentityFromSessionHints,
  deriveTerminalAppIdentityFromTerminalSignals,
  normalizeTerminalAppIdentity,
  normalizeTerminalAppIdentityRuntimeState,
  reconcileTerminalAppIdentityRuntimeState,
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

test("deriveTerminalAppIdentityFromForegroundProcess recognizes coding-agent processes from the full foreground group", () => {
  const identity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 410,
        ppid: 400,
        executableName: "bash",
        comm: "bash",
        name: "bash",
        executablePath: "/usr/bin/bash",
        commandLine: ["bash"],
        ttyPath: "/dev/pts/8"
      },
      foregroundProcesses: [
        {
          pid: 410,
          ppid: 400,
          executableName: "bash",
          comm: "bash",
          name: "bash",
          executablePath: "/usr/bin/bash",
          commandLine: ["bash"],
          ttyPath: "/dev/pts/8"
        },
        {
          pid: 411,
          ppid: 410,
          executableName: "codex",
          comm: "codex",
          name: "codex",
          executablePath: "/usr/local/bin/codex",
          commandLine: ["codex", "--json"],
          ttyPath: "/dev/pts/8"
        }
      ],
      ancestry: []
    },
    { updatedAt: 1710000000007 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "foreground-process");
  assert.equal(identity.details.foregroundHints.some((entry) => entry.relation === "foregroundProcess"), true);
});

test("deriveTerminalAppIdentityFromForegroundProcess recognizes wrapper command lines without losing shell fallback behavior", () => {
  const identity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 420,
        ppid: 1,
        executableName: "node",
        comm: "node",
        name: "node",
        executablePath: "/usr/bin/node",
        commandLine: ["node", "/usr/local/lib/codex/dist/index.js", "--json"],
        ttyPath: "/dev/pts/9"
      },
      foregroundProcesses: [],
      ancestry: [
        {
          pid: 400,
          ppid: 1,
          executableName: "bash",
          comm: "bash",
          name: "bash",
          executablePath: "/usr/bin/bash",
          commandLine: ["bash"],
          ttyPath: "/dev/pts/9"
        }
      ]
    },
    { updatedAt: 1710000000008 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "foreground-process");
  assert.equal(identity.details.foregroundHints.some((entry) => entry.type === "commandLine"), true);
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

test("deriveTerminalAppIdentityCandidateFromOutputHeuristics recognizes bounded coding-agent separators", () => {
  const identity = deriveTerminalAppIdentityCandidateFromOutputHeuristics(
    "\n────────────────────────────────────────────────────────────────────────────────\n",
    { updatedAt: 1710000000012 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.source, "output-heuristic");
});

test("terminal app identity arbitration lets corroborated shell signals override stale explicit coding-agent hints", () => {
  const initialState = createTerminalAppIdentityRuntimeState(
    {
      shell: "/bin/bash",
      startCommand: "codex"
    },
    { updatedAt: 1710000000013 }
  );
  const reconciled = reconcileTerminalAppIdentityRuntimeState(
    initialState,
    {
      "foreground-process": {
        family: "shell",
        label: "bash",
        source: "foreground-process",
        confidence: 0.78,
        details: {
          foregroundProcess: {
            representativeProcess: {
              executableName: "bash"
            }
          }
        },
        updatedAt: 1710000000014
      },
      "shell-marker": {
        family: "shell",
        label: "bash",
        source: "shell-marker",
        confidence: 0.78,
        details: {
          shellMarkers: {
            lastMarker: "prompt-start"
          }
        },
        updatedAt: 1710000000014
      }
    },
    {
      session: {
        shell: "/bin/bash",
        startCommand: "codex"
      },
      currentIdentity: initialState.current,
      updatedAt: 1710000000014
    }
  );

  assert.equal(reconciled.current.family, "shell");
  assert.equal(reconciled.current.label, "bash");
  assert.equal(reconciled.current.source, "foreground-process");
  assert.deepEqual(reconciled.current.details.arbitration.supportingSources, ["foreground-process", "shell-marker"]);
});

test("terminal app identity arbitration keeps stronger explicit coding-agent labels over weaker output-only hints", () => {
  const initialState = createTerminalAppIdentityRuntimeState(
    {
      shell: "/bin/bash",
      startCommand: "codex"
    },
    { updatedAt: 1710000000015 }
  );
  const reconciled = reconcileTerminalAppIdentityRuntimeState(
    initialState,
    {
      "output-heuristic": deriveTerminalAppIdentityCandidateFromOutputHeuristics("✦ Section\n", {
        updatedAt: 1710000000016
      })
    },
    {
      session: {
        shell: "/bin/bash",
        startCommand: "codex"
      },
      currentIdentity: initialState.current,
      updatedAt: 1710000000016
    }
  );

  assert.equal(reconciled.current.family, "coding-agent");
  assert.equal(reconciled.current.label, "codex");
  assert.equal(reconciled.current.source, "explicit-hint");
});

test("deriveTerminalAppIdentityFromForegroundProcess preserves a known identity when later inspections become unknown", () => {
  const existingIdentity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 510,
        executableName: "codex",
        comm: "codex",
        name: "codex",
        commandLine: ["codex", "--json"]
      }
    },
    { updatedAt: 1710000000017 }
  );

  const identity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 511,
        executableName: "",
        comm: "",
        name: "",
        commandLine: []
      }
    },
    { existingIdentity, updatedAt: 1710000000018 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.updatedAt, existingIdentity.updatedAt);
});

test("deriveTerminalAppIdentityFromTerminalSignals preserves updatedAt when reconciliation keeps the same identity", () => {
  const existingIdentity = deriveTerminalAppIdentityFromTerminalSignals(
    {
      shellPhase: "prompt",
      lastShellMarkerProtocol: "osc-133",
      lastShellMarker: "prompt-start",
      lastShellMarkerAt: 1710000000019,
      currentDirectory: "/workspace/code/ptydeck",
      currentDirectoryProtocol: "osc-1337",
      currentDirectoryUpdatedAt: 1710000000019,
      alternateScreenActive: false,
      alternateScreenCode: null,
      alternateScreenUpdatedAt: null
    },
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000019 }
  );

  const identity = deriveTerminalAppIdentityFromTerminalSignals(
    {
      shellPhase: "prompt",
      lastShellMarkerProtocol: "osc-133",
      lastShellMarker: "prompt-start",
      lastShellMarkerAt: 1710000000019,
      currentDirectory: "/workspace/code/ptydeck",
      currentDirectoryProtocol: "osc-1337",
      currentDirectoryUpdatedAt: 1710000000019,
      alternateScreenActive: false,
      alternateScreenCode: null,
      alternateScreenUpdatedAt: null
    },
    {
      shell: "/bin/bash"
    },
    { existingIdentity, updatedAt: 1710000000999 }
  );

  assert.equal(identity.family, "shell");
  assert.equal(identity.label, "bash");
  assert.equal(identity.source, "shell-marker");
  assert.equal(identity.updatedAt, existingIdentity.updatedAt);
});

test("terminal app identity candidate helpers fail closed and expose direct signal candidates", () => {
  const unknownHint = deriveTerminalAppIdentityCandidateFromSessionHints(
    {
      shell: "/usr/bin/python",
      startCommand: "",
      name: ""
    },
    { updatedAt: 1710000000020 }
  );
  assert.deepEqual(unknownHint, buildUnknownTerminalAppIdentity(1710000000020));

  const unknownForeground = deriveTerminalAppIdentityCandidateFromForegroundProcess(null, {
    updatedAt: 1710000000021
  });
  assert.deepEqual(unknownForeground, buildUnknownTerminalAppIdentity(1710000000021));

  const signalCandidates = deriveTerminalAppIdentityCandidatesFromTerminalSignals(
    {
      shellPhase: "prompt",
      lastShellMarkerProtocol: "osc-133",
      lastShellMarker: "prompt-start",
      lastShellMarkerAt: 1710000000022,
      currentDirectory: "/workspace",
      currentDirectoryProtocol: "osc-1337",
      currentDirectoryUpdatedAt: 1710000000022,
      alternateScreenActive: true,
      alternateScreenCode: 1049,
      alternateScreenUpdatedAt: 1710000000022
    },
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000022 }
  );
  assert.equal(signalCandidates["shell-marker"].family, "shell");
  assert.equal(signalCandidates["terminal-mode"].family, "tui");

  const blankOutput = deriveTerminalAppIdentityCandidateFromOutputHeuristics("   ", {
    updatedAt: 1710000000023
  });
  const unmatchedOutput = deriveTerminalAppIdentityCandidateFromOutputHeuristics("plain output", {
    updatedAt: 1710000000024
  });
  assert.deepEqual(blankOutput, buildUnknownTerminalAppIdentity(1710000000023));
  assert.deepEqual(unmatchedOutput, buildUnknownTerminalAppIdentity(1710000000024));
});

test("terminal app identity foreground and signal candidate helpers fail closed for generic processes and missing markers", () => {
  const genericProcessIdentity = deriveTerminalAppIdentityCandidateFromForegroundProcess(
    {
      representativeProcess: {
        pid: 700,
        executableName: "python",
        comm: "python",
        name: "python",
        commandLine: ["python", "script.py"]
      }
    },
    { updatedAt: 1710000000024 }
  );
  assert.equal(genericProcessIdentity.family, "unknown");
  assert.equal(genericProcessIdentity.label, "python");
  assert.equal(genericProcessIdentity.source, "foreground-process");

  const missingRepresentativeIdentity = deriveTerminalAppIdentityCandidateFromForegroundProcess(
    {},
    { updatedAt: 1710000000025 }
  );
  assert.deepEqual(missingRepresentativeIdentity, buildUnknownTerminalAppIdentity(1710000000025));

  const noSignalCandidates = deriveTerminalAppIdentityCandidatesFromTerminalSignals(
    {
      shellPhase: "output",
      lastShellMarkerProtocol: "",
      lastShellMarker: "",
      lastShellMarkerAt: null,
      currentDirectory: "",
      currentDirectoryProtocol: "",
      currentDirectoryUpdatedAt: null,
      alternateScreenActive: false,
      alternateScreenCode: null,
      alternateScreenUpdatedAt: null
    },
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000026 }
  );
  assert.deepEqual(noSignalCandidates["shell-marker"], buildUnknownTerminalAppIdentity(1710000000026));
  assert.deepEqual(noSignalCandidates["terminal-mode"], buildUnknownTerminalAppIdentity(1710000000026));
});

test("normalizeTerminalAppIdentityRuntimeState falls back for invalid state and restores explicit-hint candidates", () => {
  const fallback = normalizeTerminalAppIdentityRuntimeState(null, {
    session: {
      shell: "/bin/bash",
      startCommand: "codex"
    },
    updatedAt: 1710000000025
  });
  assert.equal(fallback.current.family, "coding-agent");
  assert.equal(fallback.current.source, "explicit-hint");

  const normalized = normalizeTerminalAppIdentityRuntimeState(
    {
      current: {
        family: "bogus",
        source: "nope",
        updatedAt: 1710000000026
      },
      candidates: {
        "explicit-hint": buildUnknownTerminalAppIdentity(1710000000026),
        "foreground-process": {
          family: "coding-agent",
          label: "codex",
          source: "foreground-process",
          confidence: 0.91,
          details: {
            weird: [1, Number.POSITIVE_INFINITY, { b: true, a: "x" }]
          },
          updatedAt: 1710000000026
        }
      },
      recentCandidates: Array.from({ length: 15 }, (_, index) => ({
        source: `source-${index}`,
        candidateSource: "foreground-process",
        family: "coding-agent",
        label: `agent-${index}`,
        confidence: index / 10,
        observedAt: index + 1
      })).concat([null, "bad"])
    },
    {
      session: {
        shell: "/bin/bash",
        startCommand: "codex"
      },
      updatedAt: 1710000000026
    }
  );

  assert.equal(normalized.current.family, "unknown");
  assert.equal(normalized.candidates["explicit-hint"].family, "coding-agent");
  assert.equal(normalized.candidates["foreground-process"].details.weird[1], null);
  assert.deepEqual(Object.keys(normalized.candidates["foreground-process"].details.weird[2]), ["a", "b"]);
  assert.equal(normalized.recentCandidates.length, 12);
  assert.equal(normalized.recentCandidates[0].label, "agent-3");
  assert.equal(normalized.recentCandidates.at(-1).label, "agent-14");
});

test("terminal app identity arbitration promotes alternate-screen tui, upgrades shell to specific foreground apps, and preserves same-family label continuity", () => {
  const shellState = createTerminalAppIdentityRuntimeState(
    {
      shell: "/bin/bash"
    },
    { updatedAt: 1710000000027 }
  );

  const tuiReconciled = reconcileTerminalAppIdentityRuntimeState(
    shellState,
    {
      "terminal-mode": {
        family: "tui",
        label: "",
        source: "terminal-mode",
        confidence: 0.64,
        details: {
          terminalMode: {
            alternateScreenActive: true
          }
        },
        updatedAt: 1710000000028
      }
    },
    {
      session: {
        shell: "/bin/bash"
      },
      currentIdentity: shellState.current,
      updatedAt: 1710000000028
    }
  );
  assert.equal(tuiReconciled.current.family, "tui");
  assert.equal(tuiReconciled.current.source, "terminal-mode");

  const editorReconciled = reconcileTerminalAppIdentityRuntimeState(
    shellState,
    {
      "foreground-process": {
        family: "editor",
        label: "nvim",
        source: "foreground-process",
        confidence: 0.94,
        details: {
          foregroundProcess: {
            representativeProcess: {
              executableName: "nvim"
            }
          }
        },
        updatedAt: 1710000000029
      }
    },
    {
      session: {
        shell: "/bin/bash"
      },
      currentIdentity: shellState.current,
      updatedAt: 1710000000029
    }
  );
  assert.equal(editorReconciled.current.family, "editor");
  assert.equal(editorReconciled.current.label, "nvim");

  const continuityState = normalizeTerminalAppIdentityRuntimeState(
    {
      current: {
        family: "coding-agent",
        label: "claude",
        source: "explicit-hint",
        confidence: 0.87,
        details: {},
        updatedAt: 1710000000030
      },
      candidates: {
        "explicit-hint": {
          family: "coding-agent",
          label: "claude",
          source: "explicit-hint",
          confidence: 0.87,
          details: {},
          updatedAt: 1710000000030
        }
      }
    },
    {
      updatedAt: 1710000000030
    }
  );
  const continuityReconciled = reconcileTerminalAppIdentityRuntimeState(
    continuityState,
    {
      "foreground-process": {
        family: "coding-agent",
        label: "codex",
        source: "foreground-process",
        confidence: 0.89,
        details: {
          foregroundProcess: {
            representativeProcess: {
              executableName: "codex"
            }
          }
        },
        updatedAt: 1710000000031
      }
    },
    {
      currentIdentity: continuityState.current,
      updatedAt: 1710000000031
    }
  );
  assert.equal(continuityReconciled.current.family, "coding-agent");
  assert.equal(continuityReconciled.current.label, "claude");
});

test("terminal app identity arbitration keeps current identity for weak tui continuity and empty candidate groups", () => {
  const editorState = normalizeTerminalAppIdentityRuntimeState(
    {
      current: {
        family: "editor",
        label: "nvim",
        source: "explicit-hint",
        confidence: 0.6,
        details: {},
        updatedAt: 1710000000032
      },
      candidates: {
        "explicit-hint": {
          family: "editor",
          label: "nvim",
          source: "explicit-hint",
          confidence: 0.6,
          details: {},
          updatedAt: 1710000000032
        }
      }
    },
    {
      updatedAt: 1710000000032
    }
  );
  const tuiContinuity = reconcileTerminalAppIdentityRuntimeState(
    editorState,
    {
      "terminal-mode": {
        family: "tui",
        label: "",
        source: "terminal-mode",
        confidence: 0.64,
        details: {
          terminalMode: {
            alternateScreenActive: true
          }
        },
        updatedAt: 1710000000033
      }
    },
    {
      currentIdentity: editorState.current,
      updatedAt: 1710000000033
    }
  );
  assert.equal(tuiContinuity.current.family, "editor");
  assert.equal(tuiContinuity.current.label, "nvim");

  const knownCurrent = {
    family: "coding-agent",
    label: "codex",
    source: "foreground-process",
    confidence: 0.94,
    details: {},
    updatedAt: 1710000000034
  };
  const noGroupState = normalizeTerminalAppIdentityRuntimeState(
    {
      current: knownCurrent
    },
    {
      session: {
        shell: ""
      },
      currentIdentity: knownCurrent,
      updatedAt: 1710000000034
    }
  );
  const noGroupReconciled = reconcileTerminalAppIdentityRuntimeState(
    noGroupState,
    {
      "explicit-hint": buildUnknownTerminalAppIdentity(1710000000035),
      "foreground-process": buildUnknownTerminalAppIdentity(1710000000035),
      "shell-marker": buildUnknownTerminalAppIdentity(1710000000035),
      "terminal-mode": buildUnknownTerminalAppIdentity(1710000000035),
      "output-heuristic": buildUnknownTerminalAppIdentity(1710000000035)
    },
    {
      session: {
        shell: ""
      },
      currentIdentity: knownCurrent,
      updatedAt: 1710000000035
    }
  );
  assert.equal(noGroupReconciled.current.family, "coding-agent");
  assert.equal(noGroupReconciled.current.label, "codex");
});

test("terminal app identity arbitration keeps the current family when a challenger wins by less than the replacement delta", () => {
  const currentIdentity = {
    family: "build-test",
    label: "pytest",
    source: "foreground-process",
    confidence: 0.9,
    details: {},
    updatedAt: 1710000000036
  };
  const state = normalizeTerminalAppIdentityRuntimeState(
    {
      current: currentIdentity,
      candidates: {
        "foreground-process": currentIdentity
      }
    },
    {
      currentIdentity,
      updatedAt: 1710000000036
    }
  );

  const reconciled = reconcileTerminalAppIdentityRuntimeState(
    state,
    {
      "explicit-hint": {
        family: "coding-agent",
        label: "codex",
        source: "explicit-hint",
        confidence: 0.91,
        details: {},
        updatedAt: 1710000000037
      }
    },
    {
      currentIdentity,
      updatedAt: 1710000000037
    }
  );

  assert.equal(reconciled.current.family, "build-test");
  assert.equal(reconciled.current.label, "pytest");
});

test("terminal app identity arbitration promotes the winner when the current identity is unknown", () => {
  const reconciled = reconcileTerminalAppIdentityRuntimeState(
    normalizeTerminalAppIdentityRuntimeState(
      {
        current: buildUnknownTerminalAppIdentity(1710000000038)
      },
      {
        updatedAt: 1710000000038
      }
    ),
    {
      "foreground-process": {
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
        updatedAt: 1710000000039
      }
    },
    {
      updatedAt: 1710000000039
    }
  );

  assert.equal(reconciled.current.family, "coding-agent");
  assert.equal(reconciled.current.label, "codex");
  assert.equal(reconciled.current.source, "foreground-process");
});

test("deriveTerminalAppIdentityFromForegroundProcess preserves updatedAt when the foreground identity does not change", () => {
  const existingIdentity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 610,
        executableName: "codex",
        comm: "codex",
        name: "codex",
        commandLine: ["codex", "--json"]
      }
    },
    { updatedAt: 1710000000038 }
  );

  const identity = deriveTerminalAppIdentityFromForegroundProcess(
    {
      representativeProcess: {
        pid: 610,
        executableName: "codex",
        comm: "codex",
        name: "codex",
        commandLine: ["codex", "--json"]
      }
    },
    { existingIdentity, updatedAt: 1710000000999 }
  );

  assert.equal(identity.family, "coding-agent");
  assert.equal(identity.label, "codex");
  assert.equal(identity.updatedAt, existingIdentity.updatedAt);
});
