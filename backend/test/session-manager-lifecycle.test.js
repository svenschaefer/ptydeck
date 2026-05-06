import test from "node:test";
import assert from "node:assert/strict";

import {
  applySessionPatch,
  buildReplayRetentionResult,
  buildReplayRetentionState,
  buildRestartSessionCreatePayload,
  buildSessionRecord
} from "../src/session-manager-lifecycle.js";

test("session manager lifecycle helpers trim replay output deterministically", () => {
  assert.deepEqual(buildReplayRetentionResult("abcdef", 4), {
    value: "cdef",
    truncated: true
  });
  assert.deepEqual(buildReplayRetentionResult("abcdef", 0), {
    value: "",
    truncated: true
  });
  assert.deepEqual(buildReplayRetentionResult("", 4), {
    value: "",
    truncated: false
  });
});

test("session manager lifecycle helpers rebase retained shell blocks after replay trimming", () => {
  const state = buildReplayRetentionState(
    "prompt$ echo one\none\nprompt$ echo two\ntwo\nprompt$ ",
    [
      { start: 0, end: 21 },
      { start: 21, end: 42 }
    ],
    42,
    28
  );

  assert.deepEqual(state, {
    value: "rompt$ echo two\ntwo\nprompt$ ",
    truncated: true,
    shellBlocks: [],
    currentShellBlockStart: 20
  });
});

test("session manager lifecycle helpers build persisted ssh session records deterministically", () => {
  const launchInputs = [];
  const identityInputs = [];
  const { session, launchBundle } = buildSessionRecord(
    {
      id: "restore-ssh-1",
      quickIdToken: "  A7  ",
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "password"
      },
      remoteSecret: "super-secret",
      startCwd: "~/workspace",
      startCommand: "tmux attach || tmux new",
      env: {
        TERM: "xterm-256color",
        IGNORED: 7
      },
      deckId: "  ops  ",
      replayOutput: "line-1\nline-2\nline-3\n",
      replayOutputTruncated: false,
      note: "  Capture logs  \n  before restart  ",
      mouseForwardingMode: "application",
      inputSafetyProfile: {
        requireValidShellSyntax: true,
        pasteLineConfirmThreshold: 3
      },
      tags: [" Ops ", "ops", "prod"],
      quickSendUsage: [{ lookupKey: "cmd::deploy", count: 2, lastUsedAt: 1700000000000 }],
      themeProfile: {
        background: "#112233"
      },
      inactiveThemeProfile: {
        background: "#445566"
      },
      createdAt: 1710000000000,
      updatedAt: 1710000000500,
      traceSeed: { requestId: "req-1" }
    },
    {
      defaultShell: "bash",
      buildLaunchBundle: (input) => {
        launchInputs.push(input);
        return {
          launchSpec: {
            metaCwd: "~/workspace",
            command: "ssh"
          }
        };
      },
      createInitialIdentityRuntime: (input, options) => {
        identityInputs.push({ input, options });
        return {
          appIdentityState: { source: "seeded" },
          terminalSignalState: { lastSignalKind: "" },
          appIdentity: {
            title: "tmux",
            terminalType: "shell"
          }
        };
      },
      remoteReconnectMaxAttempts: 4,
      remoteReconnectDelayMs: 250,
      sessionReplayMemoryMaxChars: 8,
      nowFn: () => 1710000009999
    }
  );

  assert.deepEqual(launchInputs, [
    {
      kind: "ssh",
      shell: "ssh",
      cwd: process.env.HOME,
      startCwd: "~/workspace",
      startCommand: "tmux attach || tmux new",
      env: {
        TERM: "xterm-256color"
      },
      remoteConnection: {
        host: "example.internal",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "password"
      },
      remoteSecret: "super-secret"
    }
  ]);
  assert.deepEqual(identityInputs, [
    {
      input: {
        kind: "ssh",
        shell: "ssh",
        startCommand: "tmux attach || tmux new"
      },
      options: {
        updatedAt: 1710000000500
      }
    }
  ]);
  assert.equal(session.outputBuffer, "\nline-3\n");
  assert.equal(session.outputTruncated, true);
  assert.equal(session.remoteSecret, "super-secret");
  assert.deepEqual(session.traceSeed, { requestId: "req-1" });
  assert.equal(session.meta.quickIdToken, "A7");
  assert.equal(session.meta.deckId, "ops");
  assert.equal(session.meta.note, "Capture logs\nbefore restart");
  assert.deepEqual(session.meta.tags, ["ops", "prod"]);
  assert.deepEqual(session.meta.remoteRuntime.reconnectPolicy, {
    maxAttempts: 4,
    delayMs: 250
  });
  assert.equal(session.meta.themeProfile.background, "#112233");
  assert.equal(session.meta.activeThemeProfile.background, "#112233");
  assert.equal(session.meta.inactiveThemeProfile.background, "#445566");
  assert.equal(session.meta.appIdentity.title, "tmux");
  assert.equal(launchBundle.launchSpec.command, "ssh");
});

test("session manager lifecycle helpers clear ssh-only metadata and timers when switching back to local", () => {
  const clearedReconnect = [];
  const clearedExpected = [];
  const { session } = buildSessionRecord(
    {
      id: "session-1",
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "password"
      },
      remoteSecret: "super-secret",
      startCwd: "~/ops"
    },
    {
      buildLaunchBundle: () => ({
        launchSpec: {
          metaCwd: "~/ops",
          command: "ssh"
        }
      }),
      createInitialIdentityRuntime: () => ({
        appIdentityState: {},
        terminalSignalState: {},
        appIdentity: {
          title: "",
          terminalType: "shell"
        }
      }),
      remoteReconnectMaxAttempts: 3,
      remoteReconnectDelayMs: 1500,
      nowFn: () => 1710000000000
    }
  );

  session.expectedExitReason = "restart";

  const result = applySessionPatch(
    session,
    {
      kind: "local",
      startCwd: "/tmp/local"
    },
    {
      defaultShell: "bash",
      remoteReconnectMaxAttempts: 3,
      remoteReconnectDelayMs: 1500,
      clearRemoteReconnectTimers: (currentSession) => clearedReconnect.push(currentSession.id),
      clearExpectedExitReason: (currentSession) => {
        clearedExpected.push(currentSession.id);
        currentSession.expectedExitReason = "";
      },
      nowFn: () => 1710000001234
    }
  );

  assert.equal(result.updatedAt, 1710000001234);
  assert.equal(session.meta.kind, "local");
  assert.equal(session.meta.shell, "bash");
  assert.equal(session.meta.startCwd, "/tmp/local");
  assert.equal(session.meta.cwd, "/tmp/local");
  assert.equal(session.meta.remoteConnection, undefined);
  assert.equal(session.meta.remoteAuth, undefined);
  assert.equal(session.meta.remoteRuntime, undefined);
  assert.equal(session.remoteSecret, undefined);
  assert.equal(session.expectedExitReason, "");
  assert.deepEqual(clearedReconnect, ["session-1"]);
  assert.deepEqual(clearedExpected, ["session-1"]);
});

test("session manager lifecycle helpers fail closed when switching to ssh without required metadata", () => {
  const { session } = buildSessionRecord(
    {
      id: "session-2",
      cwd: "/tmp/local"
    },
    {
      buildLaunchBundle: () => ({
        launchSpec: {
          metaCwd: "/tmp/local",
          command: "bash"
        }
      }),
      createInitialIdentityRuntime: () => ({
        appIdentityState: {},
        terminalSignalState: {},
        appIdentity: {
          title: "",
          terminalType: "shell"
        }
      })
    }
  );

  assert.throws(() => {
    applySessionPatch(session, { kind: "ssh" });
  }, /Field 'remoteConnection' is required for ssh sessions/);

  assert.throws(() => {
    applySessionPatch(session, {
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "password"
      }
    });
  }, /Field 'remoteSecret' is required when changing to password or keyboardInteractive ssh auth\./);

  const result = applySessionPatch(
    session,
    {
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "privateKey"
      },
      startCwd: "~/ops"
    },
    {
      defaultShell: "bash",
      remoteReconnectMaxAttempts: 2,
      remoteReconnectDelayMs: 500,
      nowFn: () => 1710000002000
    }
  );

  assert.equal(result.updatedAt, 1710000002000);
  assert.equal(session.meta.kind, "ssh");
  assert.equal(session.meta.shell, "ssh");
  assert.equal(session.meta.cwd, "~/ops");
  assert.deepEqual(session.meta.remoteConnection, {
    host: "example.internal",
    port: 22
  });
  assert.deepEqual(session.meta.remoteRuntime.reconnectPolicy, {
    maxAttempts: 2,
    delayMs: 500
  });
});

test("session manager lifecycle helpers preserve restart payload state deterministically", () => {
  const payload = buildRestartSessionCreatePayload({
    sessionMeta: {
      id: "session-3",
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "privateKey"
      },
      quickIdToken: "A7",
      cwd: "~/ops",
      shell: "ssh",
      name: "ops-shell",
      startCwd: "~/ops",
      startCommand: "tmux attach || tmux new",
      env: {
        TERM: "xterm-256color"
      },
      note: "restart marker",
      mouseForwardingMode: "application",
      inputSafetyProfile: {
        requireValidShellSyntax: true
      },
      tags: ["ops"],
      quickSendUsage: [{ lookupKey: "cmd::deploy", count: 1, lastUsedAt: 1700000000000 }],
      themeProfile: {
        background: "#112233"
      },
      activeThemeProfile: {
        background: "#112233"
      },
      inactiveThemeProfile: {
        background: "#445566"
      },
      createdAt: 1710000000000
    },
    remoteSecret: "super-secret",
    updatedAt: 1710000005000,
    trace: { requestId: "req-9" }
  });

  assert.deepEqual(payload, {
    id: "session-3",
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "privateKey"
    },
    remoteSecret: "super-secret",
    quickIdToken: "A7",
    cwd: "~/ops",
    shell: "ssh",
    name: "ops-shell",
    startCwd: "~/ops",
    startCommand: "tmux attach || tmux new",
    env: {
      TERM: "xterm-256color"
    },
    note: "restart marker",
    mouseForwardingMode: "application",
    inputSafetyProfile: {
      requireValidShellSyntax: true
    },
    tags: ["ops"],
    quickSendUsage: [{ lookupKey: "cmd::deploy", count: 1, lastUsedAt: 1700000000000 }],
    themeProfile: {
      background: "#112233"
    },
    activeThemeProfile: {
      background: "#112233"
    },
    inactiveThemeProfile: {
      background: "#445566"
    },
    createdAt: 1710000000000,
    updatedAt: 1710000005000,
    trace: { requestId: "req-9" }
  });
});
