import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerPtyRuntime } from "../src/session-manager-pty-runtime.js";

function createFakePty() {
  let dataHandler = null;
  let exitHandler = null;
  return {
    onData(handler) {
      dataHandler = handler;
    },
    onExit(handler) {
      exitHandler = handler;
    },
    emitData(data) {
      if (typeof dataHandler === "function") {
        dataHandler(data);
      }
    },
    emitExit(exit) {
      if (typeof exitHandler === "function") {
        exitHandler(exit);
      }
    }
  };
}

function createSession(overrides = {}) {
  return {
    id: "session-1",
    traceSeed: { correlationId: "corr-1", source: "rest" },
    meta: {
      id: "session-1",
      kind: "local",
      activityState: "inactive",
      updatedAt: 0,
      remoteRuntime: { connectivityState: "connected" },
      ...((overrides && overrides.meta) || {})
    },
    ...overrides
  };
}

function createHarness(overrides = {}) {
  const observed = {
    patches: [],
    emitted: [],
    startupFallback: [],
    terminalSignals: [],
    outputHeuristics: [],
    capturedChunks: [],
    sessionUpdated: [],
    replay: [],
    pendingLaunch: [],
    remoteConnected: [],
    activityStarted: [],
    activityCompletion: [],
    foregroundRefresh: [],
    asyncWrite: [],
    exits: [],
    traceUpdates: []
  };
  let traceCounter = 0;
  const runtime = createSessionManagerPtyRuntime({
    nowFn: overrides.nowFn || (() => 1700),
    foregroundProcessRefreshDelayMs: overrides.foregroundProcessRefreshDelayMs || 90,
    nodePtyAsyncWriteOptions: { retryLimit: 2 },
    attachNodePtyAsyncWritePatchImpl(ptyProcess, options) {
      observed.patches.push([ptyProcess, options]);
    },
    emit(eventName, payload) {
      observed.emitted.push([eventName, payload]);
    },
    createTraceEnvelope(seed, extra = {}) {
      traceCounter += 1;
      return {
        ...(seed && typeof seed === "object" ? seed : {}),
        ...(extra && typeof extra === "object" ? extra : {}),
        traceId: `trace-${traceCounter}`
      };
    },
    updateSessionTraceSeed(session, trace, overrides = {}) {
      observed.traceUpdates.push([session.id, trace, overrides]);
      session.traceSeed = { ...(session.traceSeed || {}), ...(trace || {}), ...(overrides || {}) };
      return session.traceSeed;
    },
    observeStartupTerminalQueryFallback(session, payload) {
      observed.startupFallback.push([session.id, payload]);
    },
    observeSessionTerminalSignals(session, chunk, options) {
      observed.terminalSignals.push([session.id, chunk, options]);
      if (typeof overrides.observeSessionTerminalSignals === "function") {
        return overrides.observeSessionTerminalSignals(session, chunk, options);
      }
      return { signals: [], metaChanged: false };
    },
    observeSessionOutputHeuristics(session, output, options) {
      observed.outputHeuristics.push([session.id, output, options]);
      if (typeof overrides.observeSessionOutputHeuristics === "function") {
        return overrides.observeSessionOutputHeuristics(session, output, options);
      }
      return { candidateMatched: false, appIdentityChanged: false, metaChanged: false };
    },
    captureSessionStreamChunk:
      Object.prototype.hasOwnProperty.call(overrides, "captureSessionStreamChunk")
        ? overrides.captureSessionStreamChunk
        : (event) => {
            observed.capturedChunks.push(event);
          },
    emitSessionUpdated(session, options) {
      observed.sessionUpdated.push([session.id, options]);
    },
    appendReplayOutput(session, cleaned, promptBoundaries) {
      observed.replay.push([session.id, cleaned, promptBoundaries]);
    },
    observePendingLaunchPostStartInput(session, payload) {
      observed.pendingLaunch.push([session.id, payload]);
    },
    markRemoteSessionConnected(session, timestamp) {
      observed.remoteConnected.push([session.id, timestamp]);
      session.meta.remoteRuntime.connectivityState = "connected";
    },
    emitSessionActivityStarted(session, timestamp) {
      observed.activityStarted.push([session.id, timestamp]);
      session.meta.activityState = "active";
    },
    scheduleSessionActivityCompletion(session) {
      observed.activityCompletion.push(session.id);
    },
    scheduleSessionForegroundProcessIdentityRefresh(session, options) {
      observed.foregroundRefresh.push([session.id, options]);
    },
    handleAsyncPtyWriteEvent(session, event) {
      observed.asyncWrite.push([session.id, event]);
    },
    handlePtyExit(session, exit) {
      observed.exits.push([session.id, exit]);
    }
  });
  return {
    observed,
    runtime
  };
}

test("session-manager pty runtime bridges cleaned SSH stream output through activity, replay, and event emission", () => {
  const ptyProcess = createFakePty();
  const session = createSession({
    meta: {
      kind: "ssh",
      remoteRuntime: { connectivityState: "degraded" }
    },
    shellAdapter: {
      capability: { shellBlockTrackingSupported: true }
    }
  });
  const harness = createHarness({
    observeSessionTerminalSignals() {
      return { signals: [{ kind: "prompt" }], metaChanged: false };
    },
    observeSessionOutputHeuristics() {
      return { candidateMatched: true, appIdentityChanged: true, metaChanged: true };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: true },
      consumeOutput() {
        return {
          cleaned: "pwd\n",
          promptBoundaries: [{ start: 0, end: 4 }]
        };
      }
    }
  });
  ptyProcess.emitData("pwd\r\n");

  assert.equal(session.ptyProcess, ptyProcess);
  assert.equal(session.replayShellBlockTrackingSupported, true);
  assert.equal(harness.observed.patches.length, 1);
  assert.deepEqual(harness.observed.remoteConnected, [["session-1", 1700]]);
  assert.deepEqual(harness.observed.activityStarted, [["session-1", 1700]]);
  assert.deepEqual(harness.observed.sessionUpdated, [
    [
      "session-1",
      {
        trace: {
          correlationId: "corr-1",
          source: "pty",
          sessionId: "session-1",
          traceId: "trace-1"
        },
        updatedAt: 1700
      }
    ]
  ]);
  assert.deepEqual(harness.observed.replay, [["session-1", "pwd\n", [{ start: 0, end: 4 }]]]);
  assert.deepEqual(harness.observed.activityCompletion, ["session-1"]);
  assert.equal(
    harness.observed.emitted.some(
      ([eventName, payload]) => eventName === "session.data" && payload.sessionId === "session-1" && payload.data === "pwd\n"
    ),
    true
  );
  assert.equal(harness.observed.foregroundRefresh.length, 2);
  assert.equal(harness.observed.capturedChunks.length, 1);
});

test("session-manager pty runtime preserves prompt-boundary-only updates and forwards PTY exits", () => {
  const ptyProcess = createFakePty();
  const session = createSession({
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false }
    }
  });
  const harness = createHarness({
    observeSessionTerminalSignals() {
      return { signals: [{ kind: "prompt_boundary" }], metaChanged: true };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: [{ start: 5, end: 5 }]
        };
      }
    }
  });
  ptyProcess.emitData("\u001b]0;title\u0007");
  ptyProcess.emitExit({ exitCode: 0, signal: 0 });

  assert.deepEqual(harness.observed.replay, [["session-1", "", [{ start: 5, end: 5 }]]]);
  assert.equal(
    harness.observed.emitted.some(
      ([eventName, payload]) => eventName === "session.data" && payload.sessionId === "session-1" && payload.data === ""
    ),
    true
  );
  assert.deepEqual(harness.observed.sessionUpdated, [
    [
      "session-1",
      {
        trace: {
          correlationId: "corr-1",
          source: "pty",
          sessionId: "session-1",
          traceId: "trace-1"
        },
        updatedAt: 1700
      }
    ]
  ]);
  assert.deepEqual(harness.observed.exits, [["session-1", { exitCode: 0, signal: 0 }]]);
});

test("session-manager pty runtime updates already-active sessions without re-emitting activity started", () => {
  const ptyProcess = createFakePty();
  const session = createSession({
    meta: {
      kind: "local",
      activityState: "active",
      updatedAt: 12,
      remoteRuntime: { connectivityState: "connected" }
    }
  });
  const harness = createHarness();

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "echo ok\n",
          promptBoundaries: []
        };
      }
    }
  });
  ptyProcess.emitData("echo ok\r\n");

  assert.deepEqual(harness.observed.remoteConnected, []);
  assert.deepEqual(harness.observed.activityStarted, []);
  assert.equal(session.meta.activityState, "active");
  assert.equal(session.meta.updatedAt, 1700);
  assert.deepEqual(harness.observed.replay, [["session-1", "echo ok\n", []]]);
  assert.equal(
    harness.observed.emitted.some(
      ([eventName, payload]) => eventName === "session.data" && payload.sessionId === "session-1" && payload.data === "echo ok\n"
    ),
    true
  );
  assert.deepEqual(harness.observed.sessionUpdated, []);
});

test("session-manager pty runtime keeps signal-only chunks fail-closed when metadata does not change", () => {
  const ptyProcess = createFakePty();
  const session = createSession();
  const harness = createHarness({
    observeSessionTerminalSignals() {
      return { signals: [{ kind: "alt_screen" }], metaChanged: false };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: []
        };
      }
    }
  });
  ptyProcess.emitData("\u001b[?1049h");

  assert.deepEqual(harness.observed.replay, []);
  assert.deepEqual(harness.observed.sessionUpdated, []);
  assert.deepEqual(harness.observed.activityStarted, []);
  assert.deepEqual(harness.observed.activityCompletion, []);
  assert.equal(harness.observed.emitted.some(([eventName]) => eventName === "session.data"), false);
  assert.equal(harness.observed.foregroundRefresh.length, 2);
});

test("session-manager pty runtime forwards async PTY write events through the attached patch callback", () => {
  const ptyProcess = createFakePty();
  const session = createSession();
  const harness = createHarness();

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: []
        };
      }
    }
  });

  const [, patchOptions] = harness.observed.patches[0];
  patchOptions.onAsyncWriteEvent({ stage: "retry", retryCount: 1 });

  assert.deepEqual(harness.observed.asyncWrite, [[
    "session-1",
    { stage: "retry", retryCount: 1 }
  ]]);
});

test("session-manager pty runtime keeps prompt-boundary-only chunks without metadata changes fail-closed apart from replay emission", () => {
  const ptyProcess = createFakePty();
  const session = createSession();
  const harness = createHarness({
    observeSessionTerminalSignals() {
      return { metaChanged: false };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: [{ start: 2, end: 2 }]
        };
      }
    }
  });
  ptyProcess.emitData("\u001b]0;prompt\u0007");

  assert.deepEqual(harness.observed.sessionUpdated, []);
  assert.deepEqual(harness.observed.replay, [["session-1", "", [{ start: 2, end: 2 }]]]);
  assert.deepEqual(harness.observed.capturedChunks[0].terminalSignalKinds, []);
  assert.equal(
    harness.observed.emitted.some(
      ([eventName, payload]) => eventName === "session.data" && payload.sessionId === "session-1" && payload.data === ""
    ),
    true
  );
  assert.equal(harness.observed.foregroundRefresh.length, 2);
});

test("session-manager pty runtime updates signal-only chunks when terminal metadata changes", () => {
  const ptyProcess = createFakePty();
  const session = createSession();
  const harness = createHarness({
    observeSessionTerminalSignals() {
      return { signals: [{ kind: "alt_screen" }], metaChanged: true };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: []
        };
      }
    }
  });
  ptyProcess.emitData(Buffer.from("\u001b[?1049h"));

  assert.deepEqual(harness.observed.replay, []);
  assert.deepEqual(harness.observed.activityStarted, []);
  assert.deepEqual(harness.observed.activityCompletion, []);
  assert.deepEqual(harness.observed.sessionUpdated, [[
    "session-1",
    {
      trace: {
        correlationId: "corr-1",
        source: "pty",
        sessionId: "session-1",
        traceId: "trace-1"
      },
      updatedAt: 1700
    }
  ]]);
  assert.equal(harness.observed.emitted.some(([eventName]) => eventName === "session.data"), false);
  assert.equal(harness.observed.foregroundRefresh.length, 2);
});

test("session-manager pty runtime stays quiescent for empty chunks when stream capture is disabled and no signals are present", () => {
  const ptyProcess = createFakePty();
  const session = createSession();
  const harness = createHarness({
    captureSessionStreamChunk: null,
    observeSessionTerminalSignals() {
      return { signals: [], metaChanged: false };
    }
  });

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "",
          promptBoundaries: []
        };
      }
    }
  });
  ptyProcess.emitData(Buffer.from(""));

  assert.deepEqual(harness.observed.capturedChunks, []);
  assert.deepEqual(harness.observed.replay, []);
  assert.deepEqual(harness.observed.sessionUpdated, []);
  assert.deepEqual(harness.observed.activityStarted, []);
  assert.deepEqual(harness.observed.activityCompletion, []);
  assert.deepEqual(harness.observed.traceUpdates, []);
  assert.equal(harness.observed.emitted.some(([eventName]) => eventName === "session.data"), false);
  assert.equal(harness.observed.foregroundRefresh.length, 1);
});

test("session-manager pty runtime starts inactive local sessions on cleaned output without forcing metadata updates", () => {
  const ptyProcess = createFakePty();
  const session = createSession({
    meta: {
      kind: "local",
      activityState: "inactive",
      remoteRuntime: { connectivityState: "connected" }
    }
  });
  const harness = createHarness();

  harness.runtime.attachPtyProcess(session, {
    ptyProcess,
    shellAdapter: {
      capability: { shellBlockTrackingSupported: false },
      consumeOutput() {
        return {
          cleaned: "ls\n",
          promptBoundaries: []
        };
      }
    }
  });
  ptyProcess.emitData("ls\r\n");

  assert.deepEqual(harness.observed.remoteConnected, []);
  assert.deepEqual(harness.observed.activityStarted, [["session-1", 1700]]);
  assert.deepEqual(harness.observed.sessionUpdated, []);
  assert.deepEqual(harness.observed.replay, [["session-1", "ls\n", []]]);
  assert.equal(session.lastActivityAt, 1700);
  assert.equal(harness.observed.foregroundRefresh.length, 2);
});
