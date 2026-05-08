import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerRuntimeAssembly } from "../src/session-manager-runtime-assembly.js";

function createHarness(overrides = {}) {
  const captured = {};
  const emittedEvents = [];
  const traceUpdates = [];
  const launchBundleCalls = [];
  const initialIdentityCalls = [];

  const traceRuntime = {
    createTraceEnvelope: (seed, overrides = {}) => ({
      traceId: "trace-1",
      seed,
      ...overrides
    }),
    normalizeTraceSeed: (trace) => (trace && typeof trace === "object" ? { normalized: true, ...trace } : null),
    countCursorPositionQueries: (rawData) => String(rawData || "").split("\u001b[6n").length - 1,
    buildCursorPositionReport: (rawData) => ({ rawData })
  };
  const launchRuntime = {
    buildLaunchBundle: (options) => {
      launchBundleCalls.push(options);
      return { from: "launchRuntime", options };
    }
  };
  const appIdentityRuntime = {
    createInitialIdentityRuntime: (identityInput, options) => {
      initialIdentityCalls.push({ identityInput, options });
      return { from: "appIdentityRuntime", identityInput, options };
    }
  };
  const sessionRuntime = { marker: "sessionRuntime" };
  const terminalRuntime = { marker: "terminalRuntime" };
  const startupRuntime = { marker: "startupRuntime" };
  const replayRuntime = { marker: "replayRuntime" };
  const mutationRuntime = { marker: "mutationRuntime" };
  const ptyRuntime = { marker: "ptyRuntime" };
  const applySessionPatchImpl = () => "patched";

  const assembly = createSessionManagerRuntimeAssembly({
    sessions: new Map(),
    defaultShell: "bash",
    sessionMaxConcurrent: 2,
    sessionIdleTimeoutMs: 10,
    sessionMaxLifetimeMs: 20,
    sessionReplayMemoryMaxChars: 1024,
    sessionActivityQuietMs: 30,
    remoteReconnectMaxAttempts: 4,
    remoteReconnectDelayMs: 40,
    remoteReconnectStableMs: 50,
    sshAskpassPath: "/tmp/askpass",
    sshKnownHostsPath: "/tmp/known_hosts",
    resolveSshTrustedHostKeyTypes: () => ["ssh-ed25519"],
    baseEnv: { LANG: "C" },
    createPty: () => ({ pid: 101 }),
    nowFn: () => 99,
    setTimeoutFn: (handler, delay) => ({ handler, delay }),
    createTraceId: () => "trace-id",
    inspectTerminalForegroundProcess: overrides.inspectTerminalForegroundProcess,
    foregroundProcessRefreshDelayMs: 90,
    startupPostInputFallbackMs: 120,
    startupTerminalQueryFallbackWindowMs: 130,
    startupTerminalQueryFallbackMaxResponses: 3,
    captureSessionStreamChunk: overrides.captureSessionStreamChunk || (() => {}),
    nodePtyAsyncWriteOptions: { maxEintrRetries: 2 },
    emitEvent: (eventName, payload) => emittedEvents.push({ eventName, payload }),
    clearExpectedExitReason: () => {},
    clearRemoteReconnectTimers: () => {},
    clearSessionActivityTimer: () => {},
    clearLaunchPostStartInputTimer: () => {},
    clearPendingLaunchPostStartInput: () => {},
    clearStartupTerminalQueryFallback: () => {},
    clearForegroundProcessRefreshTimer: () => {},
    clearRemoteReconnectStabilizeTimer: () => {},
    attachPtyProcess: () => {},
    emitSessionUpdated: () => {},
    getSessionById: () => null,
    getSessionOrThrow: () => null,
    removeSessionById: () => {},
    sendInput: () => {},
    updateSessionTraceSeed: (...args) => {
      traceUpdates.push(args);
    },
    transitionToRunning: () => {},
    armLaunchPostStartInput: () => {},
    scheduleLaunchPostStartInputDispatch: () => {},
    buildReconnectUnavailableError: () => new Error("unavailable"),
    appendReplayOutput: () => {},
    observePendingLaunchPostStartInput: () => {},
    observeStartupTerminalQueryFallback: () => {},
    observeSessionTerminalSignals: () => {},
    observeSessionOutputHeuristics: () => {},
    markRemoteSessionConnected: () => {},
    emitSessionActivityStarted: () => {},
    scheduleSessionActivityCompletion: () => {},
    scheduleSessionForegroundProcessIdentityRefresh: () => {},
    handleAsyncPtyWriteEvent: () => {},
    handlePtyExit: () => {},
    createTraceRuntimeImpl: (deps) => {
      captured.trace = deps;
      return traceRuntime;
    },
    createLaunchRuntimeImpl: (deps) => {
      captured.launch = deps;
      return launchRuntime;
    },
    createSessionRuntimeImpl: (deps) => {
      captured.session = deps;
      return sessionRuntime;
    },
    createStartupRuntimeImpl: (deps) => {
      captured.startup = deps;
      return startupRuntime;
    },
    createReplayRuntimeImpl: (deps) => {
      captured.replay = deps;
      return replayRuntime;
    },
    createTerminalRuntimeImpl: (deps) => {
      captured.terminal = deps;
      return terminalRuntime;
    },
    createPtyRuntimeImpl: (deps) => {
      captured.pty = deps;
      return ptyRuntime;
    },
    createAppIdentityRuntimeImpl: (deps) => {
      captured.appIdentity = deps;
      return appIdentityRuntime;
    },
    createMutationRuntimeImpl: (deps) => {
      captured.mutation = deps;
      return mutationRuntime;
    },
    applySessionPatchImpl
  });

  return {
    appIdentityRuntime,
    applySessionPatchImpl,
    assembly,
    captured,
    emittedEvents,
    initialIdentityCalls,
    launchBundleCalls,
    traceUpdates
  };
}

test("session manager runtime assembly wires shared lifecycle collaborators into runtime factories", () => {
  const captureSessionStreamChunk = () => {};
  const { assembly, applySessionPatchImpl, captured, initialIdentityCalls, launchBundleCalls } = createHarness({
    inspectTerminalForegroundProcess: "not-a-function",
    captureSessionStreamChunk
  });

  assert.equal(assembly.launchRuntime.marker, undefined);
  assert.equal(assembly.sessionRuntime.marker, "sessionRuntime");
  assert.equal(assembly.terminalRuntime.marker, "terminalRuntime");
  assert.equal(assembly.startupRuntime.marker, "startupRuntime");
  assert.equal(assembly.replayRuntime.marker, "replayRuntime");
  assert.equal(assembly.mutationRuntime.marker, "mutationRuntime");
  assert.equal(assembly.ptyRuntime.marker, "ptyRuntime");

  assert.equal(typeof captured.appIdentity.inspectTerminalForegroundProcess, "function");
  assert.equal(captured.launch.sshKnownHostsPath, "/tmp/known_hosts");
  assert.equal(captured.launch.remoteReconnectStableMs, 50);
  assert.equal(captured.startup.startupTerminalQueryFallbackWindowMs, 130);
  assert.equal(captured.startup.startupTerminalQueryFallbackMaxResponses, 3);
  assert.equal(captured.replay.sessionReplayMemoryMaxChars, 1024);
  assert.equal(captured.pty.captureSessionStreamChunk, captureSessionStreamChunk);
  assert.equal(captured.mutation.applySessionPatch, applySessionPatchImpl);
  assert.equal(captured.mutation.appIdentityRuntime, assembly.appIdentityRuntime);

  assert.deepEqual(captured.session.buildLaunchBundle({ kind: "local", shell: "bash" }), {
    from: "launchRuntime",
    options: { kind: "local", shell: "bash" }
  });
  assert.deepEqual(launchBundleCalls, [{ kind: "local", shell: "bash" }]);

  assert.deepEqual(
    captured.session.createInitialIdentityRuntime({ family: "shell" }, { updatedAt: 55 }),
    {
      from: "appIdentityRuntime",
      identityInput: { family: "shell" },
      options: { updatedAt: 55 }
    }
  );
  assert.deepEqual(initialIdentityCalls, [{ identityInput: { family: "shell" }, options: { updatedAt: 55 } }]);

  assert.deepEqual(captured.terminal.createTraceEnvelope({ source: "rest" }, { sessionId: "session-1" }), {
    traceId: "trace-1",
    seed: { source: "rest" },
    sessionId: "session-1"
  });
  assert.deepEqual(captured.startup.buildCursorPositionReport("\u001b[6n"), { rawData: "\u001b[6n" });
});

test("session manager runtime assembly forwards launch exit callbacks through normalized session.exit events", () => {
  const { captured, emittedEvents, traceUpdates } = createHarness();
  const session = {
    id: "session-1",
    traceSeed: { source: "messaging:telegram", traceId: "seed-1" },
    meta: {
      id: "session-1",
      updatedAt: 777,
      state: "running"
    }
  };

  captured.launch.emitSessionExit(session, {
    exitCode: 23,
    exitSignal: "SIGTERM",
    exitTimestamp: 888
  });

  assert.deepEqual(traceUpdates, [
    [
      session,
      {
        traceId: "trace-1",
        seed: { source: "messaging:telegram", traceId: "seed-1" },
        sessionId: "session-1",
        source: "messaging:telegram"
      },
      {
        source: "messaging:telegram"
      }
    ]
  ]);
  assert.deepEqual(emittedEvents, [
    {
      eventName: "session.exit",
      payload: {
        sessionId: "session-1",
        exitCode: 23,
        signal: "SIGTERM",
        exitedAt: 888,
        updatedAt: 777,
        session: {
          id: "session-1",
          updatedAt: 777,
          state: "running"
        },
        trace: {
          traceId: "trace-1",
          seed: { source: "messaging:telegram", traceId: "seed-1" },
          sessionId: "session-1",
          source: "messaging:telegram"
        }
      }
    }
  ]);
});
