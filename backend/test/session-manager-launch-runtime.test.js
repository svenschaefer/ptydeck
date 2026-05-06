import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerLaunchRuntime } from "../src/session-manager-launch-runtime.js";

function createFakePty() {
  return {
    pid: 4101,
    _pty: "/dev/pts/test-launch-runtime",
    writes: [],
    onData() {},
    onExit() {},
    write(data) {
      this.writes.push(data);
    },
    resize() {},
    kill() {}
  };
}

function createLaunchRuntimeHarness(overrides = {}) {
  const sessions = new Map();
  const createdPtys = [];
  const attached = [];
  const sessionUpdates = [];
  const sessionExits = [];
  const timers = [];
  let currentTime = 1700000000000;
  const runtime = createSessionManagerLaunchRuntime({
    baseEnv: {
      PATH: "/usr/bin",
      LANG: "C.UTF-8"
    },
    createPty: (options) => {
      const pty = createFakePty();
      pty.spawnOptions = options;
      createdPtys.push(pty);
      return pty;
    },
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh",
    sshKnownHostsPath: "/tmp/ptydeck-test-known_hosts",
    resolveSshTrustedHostKeyTypes: (host, port) =>
      host === "example.internal" && port === 22 ? ["ssh-rsa"] : [],
    remoteReconnectMaxAttempts: 3,
    remoteReconnectDelayMs: 25,
    remoteReconnectStableMs: 10,
    nowFn: () => currentTime,
    setTimeoutFn: (fn, delayMs) => {
      const timer = { fn, delayMs };
      timers.push(timer);
      return timer;
    },
    homedirFn: () => "/home/tester",
    clearExpectedExitReason: (session) => {
      session.expectedExitReason = "";
      session.expectedExitReasonTimer = null;
    },
    clearRemoteReconnectTimers: (session) => {
      session.remoteReconnectTimer = null;
      session.remoteReconnectStabilizeTimer = null;
    },
    clearSessionActivityTimer: (session) => {
      session.activityTimer = null;
    },
    clearLaunchPostStartInputTimer: (session) => {
      session.launchPostStartInputTimer = null;
    },
    clearStartupTerminalQueryFallback: (session) => {
      session.pendingStartupTerminalQueryFallback = null;
    },
    clearForegroundProcessRefreshTimer: (session) => {
      session.foregroundProcessRefreshTimer = null;
    },
    clearRemoteReconnectStabilizeTimer: (session) => {
      session.remoteReconnectStabilizeTimer = null;
    },
    attachPtyProcess: (session, launchBundle) => {
      session.ptyProcess = launchBundle.ptyProcess;
      session.shellAdapter = launchBundle.shellAdapter;
      attached.push(launchBundle);
    },
    emitSessionUpdated: (session) => {
      sessionUpdates.push({
        sessionId: session.id,
        connectivityState: session.meta?.remoteRuntime?.connectivityState || "",
        reconnectAttempts: session.meta?.remoteRuntime?.reconnectAttempts ?? null,
        cwd: session.meta?.cwd || "",
        shell: session.meta?.shell || ""
      });
    },
    emitSessionExit: (session, payload) => {
      sessionExits.push({
        sessionId: session.id,
        exitCode: payload.exitCode,
        exitSignal: payload.exitSignal,
        exitedAt: payload.exitTimestamp,
        state: session.meta.state
      });
    },
    getSessionById: (sessionId) => sessions.get(sessionId) || null,
    removeSessionById: (sessionId) => sessions.delete(sessionId),
    ...overrides
  });
  return {
    runtime,
    sessions,
    createdPtys,
    attached,
    sessionUpdates,
    sessionExits,
    timers,
    setCurrentTime(nextTime) {
      currentTime = nextTime;
    }
  };
}

test("session-manager launch runtime fails closed for degraded and offline reconnect writes", () => {
  const { runtime } = createLaunchRuntimeHarness();

  const degradedError = runtime.buildReconnectUnavailableError({
    id: "session-1",
    meta: {
      remoteRuntime: {
        connectivityState: "degraded"
      }
    }
  });
  assert.equal(degradedError.statusCode, 409);
  assert.equal(degradedError.error, "RemoteSessionDegraded");
  assert.match(degradedError.message, /reconnecting/);

  const offlineError = runtime.buildReconnectUnavailableError({
    id: "session-2",
    meta: {
      remoteRuntime: {
        connectivityState: "offline"
      }
    }
  });
  assert.equal(offlineError.statusCode, 409);
  assert.equal(offlineError.error, "RemoteSessionOffline");
  assert.match(offlineError.message, /offline/);
});

test("session-manager launch runtime updates ssh remote availability state deterministically", () => {
  const { runtime, sessionUpdates } = createLaunchRuntimeHarness();
  const session = {
    id: "session-1",
    meta: {
      kind: "ssh",
      updatedAt: 0,
      remoteRuntime: {
        connectivityState: "connected",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 0,
        disconnectedAt: null,
        nextReconnectAt: null,
        lastReconnectAt: null,
        lastDisconnectReason: "",
        lastExitCode: null,
        lastExitSignal: ""
      }
    },
    remoteReconnectTimer: { id: "pending" },
    remoteReconnectStabilizeTimer: { id: "stabilize" }
  };

  runtime.markRemoteSessionUnavailable(session, "degraded", 1700000000100, {
    reason: "ssh-transport-exit",
    exitCode: 255,
    exitSignal: "SIGTERM",
    nextReconnectAt: 1700000000125
  });
  assert.equal(session.meta.remoteRuntime.connectivityState, "degraded");
  assert.equal(session.meta.remoteRuntime.lastDisconnectReason, "ssh-transport-exit");
  assert.equal(session.meta.remoteRuntime.nextReconnectAt, 1700000000125);

  runtime.markRemoteSessionConnected(session, 1700000000200);
  assert.equal(session.remoteReconnectTimer, null);
  assert.equal(session.remoteReconnectStabilizeTimer, null);
  assert.equal(session.meta.remoteRuntime.connectivityState, "connected");
  assert.equal(session.meta.remoteRuntime.reconnectAttempts, 0);
  assert.equal(session.meta.remoteRuntime.lastReconnectAt, 1700000000200);
  assert.equal(sessionUpdates.length, 2);
});

test("session-manager launch runtime keeps reconnect guard branches fail-closed", () => {
  const { runtime, sessions, sessionUpdates, timers } = createLaunchRuntimeHarness();

  runtime.markRemoteSessionConnected({ meta: { kind: "local" } }, 1700000000100);
  runtime.markRemoteSessionUnavailable({ meta: { kind: "local" } }, "offline", 1700000000100);
  assert.equal(runtime.scheduleRemoteReconnect({ meta: { kind: "local" } }, {}), false);

  runtime.attemptRemoteReconnect("missing", "ssh-transport-exit");

  sessions.set("local", {
    id: "local",
    ptyProcess: null,
    expectedExitReason: "",
    meta: {
      id: "local",
      kind: "local",
      remoteRuntime: null
    }
  });
  runtime.attemptRemoteReconnect("local", "ssh-transport-exit");

  sessions.set("expected", {
    id: "expected",
    ptyProcess: null,
    expectedExitReason: "deleted",
    meta: {
      id: "expected",
      kind: "ssh",
      shell: "ssh",
      remoteRuntime: {
        connectivityState: "degraded",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 1
      }
    }
  });
  runtime.attemptRemoteReconnect("expected", "ssh-transport-exit");

  sessions.set("busy", {
    id: "busy",
    ptyProcess: createFakePty(),
    expectedExitReason: "",
    meta: {
      id: "busy",
      kind: "ssh",
      shell: "ssh",
      remoteRuntime: {
        connectivityState: "degraded",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 1
      }
    }
  });
  runtime.attemptRemoteReconnect("busy", "ssh-transport-exit");

  assert.equal(sessionUpdates.length, 0);
  assert.equal(timers.length, 0);
});

test("session-manager launch runtime attempts ssh reconnects and marks them connected after the stabilize window", () => {
  const { runtime, sessions, attached, createdPtys, sessionUpdates, timers } = createLaunchRuntimeHarness();
  const session = {
    id: "session-1",
    ptyProcess: null,
    remoteSecret: "secret",
    expectedExitReason: "",
    meta: {
      id: "session-1",
      kind: "ssh",
      shell: "ssh",
      cwd: "~/old",
      startCwd: "~/workspace",
      startCommand: "hostname",
      env: {
        TERM: "xterm-256color"
      },
      remoteConnection: {
        host: "example.internal",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "/keys/id_rsa"
      },
      remoteRuntime: {
        connectivityState: "degraded",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 1,
        disconnectedAt: 1700000000000,
        nextReconnectAt: 1700000000025,
        lastReconnectAt: null,
        lastDisconnectReason: "ssh-transport-exit",
        lastExitCode: 255,
        lastExitSignal: ""
      },
      updatedAt: 1700000000000
    }
  };
  sessions.set(session.id, session);

  runtime.attemptRemoteReconnect(session.id, "reconnect spawn failed 2");

  assert.equal(attached.length, 1);
  assert.equal(createdPtys.length, 1);
  assert.equal(session.meta.cwd, "~/workspace");
  assert.equal(session.meta.shell, "ssh");
  assert.equal(session.meta.remoteRuntime.reconnectAttempts, 2);
  assert.equal(sessionUpdates.length >= 1, true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delayMs, 10);

  timers[0].fn();

  assert.equal(session.meta.remoteRuntime.connectivityState, "connected");
  assert.equal(session.meta.remoteRuntime.reconnectAttempts, 0);
  assert.equal(session.ptyProcess, attached[0].ptyProcess);
  assert.equal(attached[0].launchSpec.command, "ssh");
  assert.equal(createdPtys[0].spawnOptions.env.TERM, "xterm-256color");
  assert.equal(createdPtys[0].spawnOptions.args.includes("HostKeyAlgorithms=ssh-rsa"), true);
});

test("session-manager launch runtime ignores stale stabilize timers after reconnect attach", () => {
  const { runtime, sessions, timers, sessionUpdates } = createLaunchRuntimeHarness();
  const session = {
    id: "session-stale",
    ptyProcess: null,
    remoteSecret: "",
    expectedExitReason: "",
    meta: {
      id: "session-stale",
      kind: "ssh",
      shell: "ssh",
      cwd: "~/old",
      startCwd: "~/workspace",
      startCommand: "",
      env: {},
      remoteConnection: {
        host: "example.internal",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "/keys/id_rsa"
      },
      remoteRuntime: {
        connectivityState: "degraded",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 0,
        disconnectedAt: 1700000000000,
        nextReconnectAt: 1700000000025,
        lastReconnectAt: null,
        lastDisconnectReason: "ssh-transport-exit",
        lastExitCode: 255,
        lastExitSignal: ""
      },
      updatedAt: 1700000000000
    }
  };
  sessions.set(session.id, session);

  runtime.attemptRemoteReconnect(session.id, "ssh-transport-exit");

  assert.equal(timers.length, 1);
  const originalUpdates = sessionUpdates.length;
  session.ptyProcess = createFakePty({ pid: 4999 });
  timers[0].fn();

  assert.equal(session.meta.remoteRuntime.connectivityState, "degraded");
  assert.equal(sessionUpdates.length, originalUpdates);
});

test("session-manager launch runtime keeps failed reconnect attempts bounded and fail-closed", () => {
  const { runtime, sessions, sessionUpdates, timers } = createLaunchRuntimeHarness({
    createPty() {
      throw new Error("reconnect spawn failed 2");
    },
    remoteReconnectMaxAttempts: 2
  });
  const session = {
    id: "session-2",
    ptyProcess: null,
    remoteSecret: undefined,
    expectedExitReason: "",
    meta: {
      id: "session-2",
      kind: "ssh",
      shell: "ssh",
      cwd: "~/workspace",
      startCwd: "~/workspace",
      startCommand: "",
      env: {},
      remoteConnection: {
        host: "example.internal",
        port: 22,
        username: "ops"
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "/keys/id_rsa"
      },
      remoteRuntime: {
        connectivityState: "degraded",
        reconnectPolicy: {
          maxAttempts: 2,
          delayMs: 25
        },
        reconnectAttempts: 1,
        disconnectedAt: 1700000000000,
        nextReconnectAt: 1700000000025,
        lastReconnectAt: null,
        lastDisconnectReason: "ssh-transport-exit",
        lastExitCode: null,
        lastExitSignal: ""
      },
      updatedAt: 1700000000000
    }
  };
  sessions.set(session.id, session);

  runtime.attemptRemoteReconnect(session.id, "ssh-transport-exit");

  assert.equal(session.meta.remoteRuntime.connectivityState, "offline");
  assert.equal(session.meta.remoteRuntime.reconnectAttempts, 2);
  assert.equal(session.meta.remoteRuntime.lastDisconnectReason, "reconnect spawn failed 2");
  assert.equal(session.meta.remoteRuntime.nextReconnectAt, null);
  assert.equal(timers.length, 0);
  assert.equal(sessionUpdates.length, 2);
});

test("session-manager launch runtime schedules ssh reconnects on unexpected transport exit and emits closed exits otherwise", () => {
  const { runtime, sessions, sessionExits, timers } = createLaunchRuntimeHarness();

  const sshSession = {
    id: "session-ssh",
    ptyProcess: createFakePty(),
    expectedExitReason: "",
    activityTimer: { id: "activity" },
    launchPostStartInputTimer: { id: "launch" },
    foregroundProcessRefreshTimer: { id: "foreground" },
    remoteReconnectStabilizeTimer: { id: "stabilize" },
    pendingStartupTerminalQueryFallback: { expiresAt: 1 },
    lastActivityAt: 1700000000000,
    meta: {
      id: "session-ssh",
      kind: "ssh",
      state: "running",
      activityState: "active",
      activityUpdatedAt: 1700000000000,
      activityCompletedAt: null,
      updatedAt: 1700000000000,
      remoteRuntime: {
        connectivityState: "connected",
        reconnectPolicy: {
          maxAttempts: 3,
          delayMs: 25
        },
        reconnectAttempts: 0,
        disconnectedAt: null,
        nextReconnectAt: null,
        lastReconnectAt: null,
        lastDisconnectReason: "",
        lastExitCode: null,
        lastExitSignal: ""
      }
    }
  };
  sessions.set(sshSession.id, sshSession);

  runtime.handlePtyExit(sshSession, { exitCode: 255, signal: "SIGTERM" });

  assert.equal(sshSession.ptyProcess, null);
  assert.equal(sshSession.meta.remoteRuntime.connectivityState, "degraded");
  assert.equal(sshSession.meta.remoteRuntime.lastDisconnectReason, "ssh-transport-exit");
  assert.equal(sessionExits.length, 0);
  assert.equal(sessions.has(sshSession.id), true);
  assert.equal(timers.length, 1);

  const localSession = {
    id: "session-local",
    ptyProcess: createFakePty(),
    expectedExitReason: "",
    lastActivityAt: 1700000000000,
    meta: {
      id: "session-local",
      kind: "local",
      state: "running",
      activityState: "active",
      activityUpdatedAt: 1700000000000,
      activityCompletedAt: null,
      updatedAt: 1700000000000
    }
  };
  sessions.set(localSession.id, localSession);

  runtime.handlePtyExit(localSession, { exitCode: 1, signal: "SIGTERM" });

  assert.equal(localSession.meta.state, "exited");
  assert.equal(localSession.meta.exitCode, 1);
  assert.equal(localSession.meta.exitSignal, "SIGTERM");
  assert.equal(sessionExits.length, 1);
  assert.deepEqual(sessionExits[0], {
    sessionId: "session-local",
    exitCode: 1,
    exitSignal: "SIGTERM",
    exitedAt: 1700000000000,
    state: "exited"
  });
  assert.equal(sessions.has(localSession.id), false);
});
