import test from "node:test";
import assert from "node:assert/strict";

import { createSessionManagerStartupRuntime } from "../src/session-manager-startup-runtime.js";

function createTraceSeed(id) {
  return {
    correlationId: id,
    requestId: id,
    source: "rest"
  };
}

test("startup runtime dispatches post-start input, clears pending state, and arms terminal-query fallback", () => {
  const sentInputs = [];
  const runtime = createSessionManagerStartupRuntime({
    nowFn: () => 1000,
    clearPendingLaunchPostStartInput(session) {
      session.pendingLaunchPostStartInput = null;
    },
    sendInput(sessionId, input, options) {
      sentInputs.push({ sessionId, input, options });
    },
    normalizeTraceSeed: (value) => value || null
  });
  const session = {
    id: "session-1",
    ptyProcess: {},
    traceSeed: createTraceSeed("session-trace"),
    pendingLaunchPostStartInput: {
      input: "pwd\r",
      trace: createTraceSeed("pending-trace")
    }
  };

  assert.equal(runtime.dispatchLaunchPostStartInput(session), true);
  assert.equal(session.pendingLaunchPostStartInput, null);
  assert.deepEqual(session.pendingStartupTerminalQueryFallback, {
    expiresAt: 16000,
    remainingResponses: 4,
    trace: createTraceSeed("pending-trace")
  });
  assert.deepEqual(sentInputs, [
    {
      sessionId: "session-1",
      input: "pwd\r",
      options: {
        writeKind: "startup_submit_cr",
        trace: createTraceSeed("pending-trace")
      }
    }
  ]);
});

test("startup runtime schedules post-start dispatch only for the same live session and pty", () => {
  const scheduled = [];
  const sentInputs = [];
  let liveSession = null;
  const runtime = createSessionManagerStartupRuntime({
    setTimeoutFn(callback, delayMs) {
      scheduled.push({ callback, delayMs });
      return { delayMs };
    },
    clearLaunchPostStartInputTimer(session) {
      session.launchPostStartInputTimer = null;
    },
    clearPendingLaunchPostStartInput(session) {
      session.pendingLaunchPostStartInput = null;
    },
    getSessionById() {
      return liveSession;
    },
    sendInput(sessionId, input, options) {
      sentInputs.push({ sessionId, input, options });
    },
    normalizeTraceSeed: (value) => value || null
  });
  const ptyProcess = {};
  const session = {
    id: "session-2",
    ptyProcess,
    traceSeed: createTraceSeed("session-trace"),
    pendingLaunchPostStartInput: {
      input: "npm test\r",
      trace: null
    },
    launchPostStartInputTimer: { stale: true }
  };

  liveSession = session;
  assert.equal(runtime.scheduleLaunchPostStartInputDispatch(session, "prompt_boundary", 25), true);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 25);

  liveSession = null;
  scheduled[0].callback();
  assert.equal(sentInputs.length, 0);

  session.pendingLaunchPostStartInput = {
    input: "npm test\r",
    trace: null
  };
  liveSession = session;
  assert.equal(runtime.scheduleLaunchPostStartInputDispatch(session, "prompt_boundary", 10), true);
  session.ptyProcess = {};
  scheduled[1].callback();
  assert.equal(sentInputs.length, 0);

  session.ptyProcess = ptyProcess;
  session.pendingLaunchPostStartInput = {
    input: "npm test\r",
    trace: null
  };
  assert.equal(runtime.scheduleLaunchPostStartInputDispatch(session, "prompt_boundary", 0), true);
  scheduled[2].callback();
  assert.deepEqual(sentInputs, [
    {
      sessionId: "session-2",
      input: "npm test\r",
      options: {
        writeKind: "startup_submit_cr",
        trace: createTraceSeed("session-trace")
      }
    }
  ]);
});

test("startup runtime arms post-start input with normalized trace and clears stale fallback state", () => {
  const scheduled = [];
  let clearedFallback = 0;
  const runtime = createSessionManagerStartupRuntime({
    startupPostInputFallbackMs: 321,
    setTimeoutFn(callback, delayMs) {
      scheduled.push({ callback, delayMs });
      return { delayMs };
    },
    clearPendingLaunchPostStartInput(session) {
      session.pendingLaunchPostStartInput = null;
    },
    clearLaunchPostStartInputTimer(session) {
      session.launchPostStartInputTimer = null;
    },
    clearStartupTerminalQueryFallback() {
      clearedFallback += 1;
    },
    getSessionById(sessionId) {
      return sessionId === "session-3" ? session : null;
    },
    normalizeTraceSeed: (value) => value || null
  });
  const session = {
    id: "session-3",
    ptyProcess: {},
    traceSeed: createTraceSeed("session-trace"),
    pendingStartupTerminalQueryFallback: {
      expiresAt: 10,
      remainingResponses: 1,
      trace: null
    }
  };

  assert.equal(
    runtime.armLaunchPostStartInput(
      session,
      {
        postStartInput: "echo hi\r"
      },
      {
        trace: createTraceSeed("request-trace")
      }
    ),
    true
  );

  assert.equal(clearedFallback, 1);
  assert.deepEqual(session.pendingLaunchPostStartInput, {
    input: "echo hi\r",
    trace: createTraceSeed("request-trace"),
    observedPtyData: false
  });
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 321);
});

test("startup runtime observes pending post-start input activity and prompt boundaries deterministically", () => {
  const scheduled = [];
  const runtime = createSessionManagerStartupRuntime({
    setTimeoutFn(callback, delayMs) {
      scheduled.push({ callback, delayMs });
      return { delayMs };
    },
    clearLaunchPostStartInputTimer(session) {
      session.launchPostStartInputTimer = null;
    },
    getSessionById() {
      return session;
    },
    clearPendingLaunchPostStartInput() {},
    sendInput() {},
    normalizeTraceSeed: (value) => value || null
  });
  const session = {
    id: "session-4",
    ptyProcess: {},
    traceSeed: createTraceSeed("session-trace"),
    pendingLaunchPostStartInput: {
      input: "ls\r",
      trace: null,
      observedPtyData: false
    }
  };

  assert.equal(runtime.observePendingLaunchPostStartInput(session, { rawData: "prompt$ " }), false);
  assert.equal(session.pendingLaunchPostStartInput.observedPtyData, true);
  assert.equal(runtime.observePendingLaunchPostStartInput(session, { promptBoundaries: [{ start: 0, end: 4 }] }), true);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 0);
  assert.deepEqual(session.launchPostStartInputTimer, { delayMs: 0 });
});

test("startup runtime fails closed for expired or exhausted terminal-query fallback state", () => {
  let cleared = 0;
  const runtime = createSessionManagerStartupRuntime({
    nowFn: () => 1000,
    clearStartupTerminalQueryFallback(session) {
      cleared += 1;
      session.pendingStartupTerminalQueryFallback = null;
    },
    countCursorPositionQueries: () => 1
  });
  const session = {
    id: "session-5",
    ptyProcess: {},
    pendingStartupTerminalQueryFallback: {
      expiresAt: 999,
      remainingResponses: 1,
      trace: null
    }
  };

  assert.equal(runtime.observeStartupTerminalQueryFallback(session, { rawData: "\u001b[6n" }), false);
  assert.equal(session.pendingStartupTerminalQueryFallback, null);

  session.pendingStartupTerminalQueryFallback = {
    expiresAt: 2000,
    remainingResponses: 0,
    trace: null
  };
  assert.equal(runtime.observeStartupTerminalQueryFallback(session, { rawData: "\u001b[6n" }), false);
  assert.equal(session.pendingStartupTerminalQueryFallback, null);
  assert.equal(cleared, 2);
});

test("startup runtime answers only the remaining terminal-query budget and clears the fallback when exhausted", () => {
  const sentInputs = [];
  let cleared = 0;
  const runtime = createSessionManagerStartupRuntime({
    nowFn: () => 1000,
    clearStartupTerminalQueryFallback(session) {
      cleared += 1;
      session.pendingStartupTerminalQueryFallback = null;
    },
    countCursorPositionQueries(rawData) {
      return rawData === "\u001b[6n\u001b[6n" ? 2 : rawData === "\u001b[6n" ? 1 : 0;
    },
    buildCursorPositionReport: () => "\u001b[1;1R",
    sendInput(sessionId, input, options) {
      sentInputs.push({ sessionId, input, options });
    },
    normalizeTraceSeed: (value) => value || null
  });
  const session = {
    id: "session-6",
    ptyProcess: {},
    traceSeed: createTraceSeed("session-trace"),
    pendingStartupTerminalQueryFallback: {
      expiresAt: 2000,
      remainingResponses: 2,
      trace: createTraceSeed("fallback-trace")
    }
  };

  assert.equal(runtime.observeStartupTerminalQueryFallback(session, { rawData: "plain output" }), false);
  assert.equal(session.pendingStartupTerminalQueryFallback.remainingResponses, 2);

  assert.equal(runtime.observeStartupTerminalQueryFallback(session, { rawData: "\u001b[6n", trace: createTraceSeed("override-trace") }), true);
  assert.equal(session.pendingStartupTerminalQueryFallback.remainingResponses, 1);
  assert.deepEqual(sentInputs[0], {
    sessionId: "session-6",
    input: "\u001b[1;1R",
    options: {
      writeKind: "startup_terminal_query_response",
      trace: createTraceSeed("override-trace")
    }
  });

  assert.equal(runtime.observeStartupTerminalQueryFallback(session, { rawData: "\u001b[6n\u001b[6n" }), true);
  assert.equal(session.pendingStartupTerminalQueryFallback, null);
  assert.deepEqual(sentInputs[1], {
    sessionId: "session-6",
    input: "\u001b[1;1R",
    options: {
      writeKind: "startup_terminal_query_response",
      trace: createTraceSeed("fallback-trace")
    }
  });
  assert.equal(cleared, 1);
});
