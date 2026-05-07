import assert from "node:assert/strict";
import test from "node:test";
import { createSessionManagerAppIdentityRuntime } from "../src/session-manager-app-identity-runtime.js";

function createHarness({
  nowFn = (() => {
    let current = 1710000000000;
    return () => current++;
  })(),
  inspectTerminalForegroundProcess = () => null
} = {}) {
  const sessions = new Map();
  const updates = [];
  const scheduled = [];
  const cleared = [];
  const runtime = createSessionManagerAppIdentityRuntime({
    nowFn,
    setTimeoutFn(fn, delay) {
      const timer = { fn, delay };
      scheduled.push(timer);
      return timer;
    },
    foregroundProcessRefreshDelayMs: 90,
    inspectTerminalForegroundProcess,
    clearForegroundProcessRefreshTimer(session) {
      if (session?.foregroundProcessRefreshTimer) {
        cleared.push(session.foregroundProcessRefreshTimer);
        session.foregroundProcessRefreshTimer = null;
      }
    },
    emitSessionUpdated(session, options = {}) {
      updates.push({
        sessionId: session.id,
        appIdentity: { ...session.meta.appIdentity },
        cwd: session.meta.cwd,
        updatedAt: options.updatedAt,
        trace: options.trace || null
      });
    },
    getSessionById(sessionId) {
      return sessions.get(sessionId) || null;
    }
  });

  return {
    runtime,
    sessions,
    updates,
    scheduled,
    cleared
  };
}

function createSession(runtime, sessions, overrides = {}) {
  const sessionHints = {
    kind: "local",
    shell: "/bin/bash",
    name: "shell-session",
    startCommand: "",
    ...(overrides.sessionHints || {})
  };
  const updatedAt = overrides.updatedAt ?? 1710000000000;
  const initial = runtime.createInitialIdentityRuntime(sessionHints, { updatedAt });
  const session = {
    id: overrides.id || "session-1",
    ptyProcess: overrides.ptyProcess || null,
    foregroundProcessRefreshTimer: overrides.foregroundProcessRefreshTimer || null,
    appIdentityState: initial.appIdentityState,
    terminalSignalState: initial.terminalSignalState,
    meta: {
      id: overrides.id || "session-1",
      kind: "local",
      cwd: "/tmp",
      shell: sessionHints.shell,
      name: sessionHints.name,
      startCommand: sessionHints.startCommand,
      updatedAt,
      appIdentity: initial.appIdentity,
      ...(overrides.meta || {})
    }
  };
  sessions.set(session.id, session);
  return session;
}

test("session-manager app-identity runtime creates initial explicit-hint state and refreshes changed hints", () => {
  const { runtime, sessions } = createHarness();
  const initial = runtime.createInitialIdentityRuntime(
    {
      kind: "local",
      shell: "/bin/bash",
      name: "codex",
      startCommand: "codex --json"
    },
    {
      updatedAt: 1710000000100
    }
  );

  assert.equal(initial.appIdentity.family, "coding-agent");
  assert.equal(initial.appIdentity.label, "codex");
  assert.equal(initial.appIdentity.source, "explicit-hint");
  assert.equal(Array.isArray(initial.appIdentityState.recentCandidates), true);
  assert.equal(initial.terminalSignalState.currentDirectory, "");
  assert.equal(initial.terminalSignalState.alternateScreenActive, false);

  const session = createSession(runtime, sessions, {
    id: "session-refresh",
    sessionHints: {
      name: "codex",
      startCommand: "codex --json"
    },
    updatedAt: 1710000000100
  });
  session.meta.name = "build-run";
  session.meta.startCommand = "npm test";

  const refreshed = runtime.refreshSessionAppIdentity(session, {
    updatedAt: 1710000000200
  });

  assert.equal(refreshed.family, "build-test");
  assert.equal(refreshed.label, "npm");
  assert.equal(refreshed.source, "explicit-hint");
  assert.equal(session.meta.appIdentity.family, "build-test");
  assert.equal(session.meta.updatedAt, 1710000000200);
});

test("session-manager app-identity runtime reconciles terminal signals into cwd and runtime identity updates", () => {
  const { runtime, sessions } = createHarness();
  const session = createSession(runtime, sessions, {
    id: "session-signals"
  });

  const shellMarker = runtime.observeSessionTerminalSignals(
    session,
    "\u001b]1337;CurrentDir=/workspace/code/ptydeck\u0007\u001b]133;A\u0007",
    {
      updatedAt: 1710000000300
    }
  );

  assert.equal(shellMarker.cwdChanged, true);
  assert.equal(shellMarker.metaChanged, true);
  assert.equal(session.meta.cwd, "/workspace/code/ptydeck");
  assert.equal(session.meta.appIdentity.family, "shell");
  assert.equal(session.meta.appIdentity.source, "shell-marker");

  const alternateScreen = runtime.observeSessionTerminalSignals(session, "\u001b[?1049h", {
    updatedAt: 1710000000400
  });

  assert.equal(alternateScreen.appIdentityChanged, true);
  assert.equal(session.meta.appIdentity.family, "tui");
  assert.equal(session.meta.appIdentity.source, "terminal-mode");
});

test("session-manager app-identity runtime only records bounded output heuristics and fails closed otherwise", () => {
  const { runtime, sessions } = createHarness();
  const session = createSession(runtime, sessions, {
    id: "session-output"
  });

  const noMatch = runtime.observeSessionOutputHeuristics(session, "plain prompt output\n", {
    updatedAt: 1710000000500
  });

  assert.deepEqual(noMatch, {
    candidateMatched: false,
    appIdentityChanged: false,
    metaChanged: false
  });
  assert.equal(session.meta.appIdentity.family, "shell");

  const matched = runtime.observeSessionOutputHeuristics(
    session,
    "────────────────────────────────────────────────────────────────────────────────\n",
    {
      updatedAt: 1710000000600
    }
  );

  assert.equal(matched.candidateMatched, true);
  assert.equal(matched.appIdentityChanged, true);
  assert.equal(matched.metaChanged, true);
  assert.equal(session.meta.appIdentity.family, "coding-agent");
  assert.equal(session.meta.appIdentity.source, "output-heuristic");
});

test("session-manager app-identity runtime schedules foreground refreshes deterministically and ignores stale timers", () => {
  const { runtime, sessions, updates, scheduled, cleared } = createHarness({
    inspectTerminalForegroundProcess(pid, details) {
      assert.equal(pid, 4321);
      assert.equal(details.sessionId, "session-foreground");
      assert.equal(details.ptyPath, "/dev/pts/9");
      return {
        terminalPid: 4321,
        foregroundProcessGroupId: 5000,
        representativeProcess: {
          pid: 5000,
          ppid: 4321,
          executableName: "codex",
          comm: "codex",
          name: "codex",
          executablePath: "/usr/local/bin/codex",
          commandLine: ["codex", "--json"],
          ttyPath: "/dev/pts/9"
        },
        foregroundProcesses: [],
        ancestry: []
      };
    }
  });
  const session = createSession(runtime, sessions, {
    id: "session-foreground",
    ptyProcess: {
      pid: 4321,
      _pty: "/dev/pts/9"
    }
  });

  assert.equal(runtime.scheduleSessionForegroundProcessIdentityRefresh(session), true);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 90);

  assert.equal(runtime.scheduleSessionForegroundProcessIdentityRefresh(session, { delayMs: 7 }), true);
  assert.equal(cleared.length, 1);
  assert.equal(scheduled.length, 2);

  scheduled[1].fn();

  assert.equal(updates.length, 1);
  assert.equal(session.meta.appIdentity.family, "coding-agent");
  assert.equal(session.meta.appIdentity.label, "codex");
  assert.equal(session.meta.appIdentity.source, "foreground-process");

  assert.equal(runtime.scheduleSessionForegroundProcessIdentityRefresh(session, { delayMs: 3 }), true);
  assert.equal(scheduled.length, 3);
  sessions.set(session.id, {
    ...session,
    ptyProcess: {
      pid: 9999,
      _pty: "/dev/pts/99"
    }
  });
  scheduled[2].fn();

  assert.equal(updates.length, 1);
  assert.equal(
    runtime.scheduleSessionForegroundProcessIdentityRefresh({
      id: "session-ssh",
      meta: { kind: "ssh" },
      ptyProcess: { pid: 1 }
    }),
    false
  );
});

test("session-manager app-identity runtime fails closed for noop identity updates and unavailable foreground refreshes", () => {
  const { runtime, sessions, updates } = createHarness();
  const session = createSession(runtime, sessions, {
    id: "session-noop"
  });
  const initialIdentity = { ...session.meta.appIdentity };
  const initialUpdatedAt = session.meta.updatedAt;

  const applied = runtime.applySessionAppIdentity(
    session,
    { ...session.meta.appIdentity, updatedAt: 1710000000700 },
    {
      emitUpdatedEvent: true,
      updatedAt: 1710000000700
    }
  );

  assert.equal(applied.family, initialIdentity.family);
  assert.equal(session.meta.updatedAt, initialUpdatedAt);
  assert.equal(updates.length, 0);

  const missing = runtime.refreshSessionForegroundProcessIdentity("missing-session", {
    updatedAt: 1710000000800
  });
  assert.equal(missing.family, "unknown");
  assert.equal(missing.source, "unknown");

  session.meta.kind = "ssh";
  session.ptyProcess = { pid: 1234 };
  const sshSkipped = runtime.refreshSessionForegroundProcessIdentity(session, {
    updatedAt: 1710000000900
  });
  assert.equal(sshSkipped.family, initialIdentity.family);
  assert.equal(sshSkipped.source, initialIdentity.source);

  const noSessionSignals = runtime.observeSessionTerminalSignals(null, "\u001b[?1049h", {
    updatedAt: 1710000001000
  });
  assert.equal(Array.isArray(noSessionSignals.signals), true);
  assert.equal(noSessionSignals.appIdentityChanged, false);
  assert.equal(noSessionSignals.cwdChanged, false);
});
