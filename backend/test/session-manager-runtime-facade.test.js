import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createSessionManagerRuntimeFacade } from "../src/session-manager-runtime-facade.js";

test("session manager runtime facade delegates launch, startup, replay, mutation, and terminal bridges with the retained defaults", () => {
  const calls = [];
  const sessions = new Map([
    ["session-1", { meta: { id: "session-1", state: "running" } }]
  ]);
  const facade = createSessionManagerRuntimeFacade({
    sessions,
    nowFn: () => 77,
    foregroundProcessRefreshDelayMs: 33,
    sessionReplayMemoryMaxChars: 512,
    launchRuntime: {
      buildLaunchBundle(options) {
        calls.push(["buildLaunchBundle", options]);
        return { kind: options.kind };
      },
      markRemoteSessionConnected(session, timestamp) {
        calls.push(["markRemoteSessionConnected", session.id, timestamp]);
        return timestamp;
      },
      markRemoteSessionUnavailable(session, state, timestamp, details) {
        calls.push(["markRemoteSessionUnavailable", session.id, state, timestamp, details]);
        return state;
      },
      buildReconnectUnavailableError(session) {
        calls.push(["buildReconnectUnavailableError", session.id]);
        return new Error(session.id);
      },
      scheduleRemoteReconnect(session, details) {
        calls.push(["scheduleRemoteReconnect", session.id, details]);
        return details.reason;
      },
      attemptRemoteReconnect(sessionId, reason) {
        calls.push(["attemptRemoteReconnect", sessionId, reason]);
        return reason;
      },
      handlePtyExit(session, exit) {
        calls.push(["handlePtyExit", session.id, exit]);
        return exit;
      }
    },
    ptyRuntime: {
      attachPtyProcess(session, bundle) {
        calls.push(["attachPtyProcess", session.id, bundle.launchSpec]);
        return bundle;
      }
    },
    startupRuntime: {
      dispatchLaunchPostStartInput(session) {
        calls.push(["dispatchLaunchPostStartInput", session.id]);
      },
      scheduleLaunchPostStartInputDispatch(session, reason, delayMs) {
        calls.push(["scheduleLaunchPostStartInputDispatch", session.id, reason, delayMs]);
      },
      armLaunchPostStartInput(session, launchSpec, options) {
        calls.push(["armLaunchPostStartInput", session.id, launchSpec, options]);
      },
      observePendingLaunchPostStartInput(session, payload) {
        calls.push(["observePendingLaunchPostStartInput", session.id, payload]);
      },
      observeStartupTerminalQueryFallback(session, payload) {
        calls.push(["observeStartupTerminalQueryFallback", session.id, payload]);
      }
    },
    terminalRuntime: {
      updateSessionTraceSeed(session, trace, overrides) {
        calls.push(["updateSessionTraceSeed", session.id, trace, overrides]);
      },
      emitSessionActivityStarted(session, timestamp) {
        calls.push(["emitSessionActivityStarted", session.id, timestamp]);
      },
      emitSessionActivityCompleted(session, timestamp) {
        calls.push(["emitSessionActivityCompleted", session.id, timestamp]);
      },
      scheduleSessionActivityCompletion(session) {
        calls.push(["scheduleSessionActivityCompletion", session.id]);
      },
      handleAsyncPtyWriteEvent(session, event) {
        calls.push(["handleAsyncPtyWriteEvent", session.id, event]);
      },
      emitSessionUpdated(session, payload) {
        calls.push(["emitSessionUpdated", session.id, payload]);
      },
      transitionToRunning(session) {
        calls.push(["transitionToRunning", session.id]);
      },
      sendInput(sessionId, data, options) {
        calls.push(["sendInput", sessionId, data, options]);
        return data;
      },
      resize(sessionId, cols, rows, options) {
        calls.push(["resize", sessionId, cols, rows, options]);
        return cols + rows;
      },
      signal(sessionId, signal, options) {
        calls.push(["signal", sessionId, signal, options]);
        return signal;
      }
    },
    replayRuntime: {
      buildReplayRetentionResult(value, maxChars) {
        calls.push(["buildReplayRetentionResult", value, maxChars]);
        return { value, maxChars };
      },
      buildReplayRetentionState(value, shellBlocks, currentShellBlockStart, maxChars) {
        calls.push(["buildReplayRetentionState", value, shellBlocks, currentShellBlockStart, maxChars]);
        return { value, shellBlocks, currentShellBlockStart, maxChars };
      },
      appendReplayOutput(session, cleaned, promptBoundaries) {
        calls.push(["appendReplayOutput", session.id, cleaned, promptBoundaries]);
      },
      trimReplayOutput(value, maxChars) {
        calls.push(["trimReplayOutput", value, maxChars]);
        return value.slice(0, maxChars);
      },
      getSnapshot(iterable, options) {
        calls.push(["getSnapshot", Array.from(iterable).map((session) => session.meta.id), options]);
        return options;
      },
      getReplayExport(session) {
        calls.push(["getReplayExport", session.meta.id]);
        return session.meta.id;
      },
      getReplayExcerpt(sessionId, session, selectorText) {
        calls.push(["getReplayExcerpt", sessionId, session.meta.id, selectorText]);
        return selectorText;
      }
    },
    mutationRuntime: {
      applySessionAppIdentity(session, nextIdentity, options) {
        calls.push(["applySessionAppIdentity", session.id, nextIdentity, options]);
        return nextIdentity;
      },
      reconcileSessionAppIdentity(session, candidateUpdates, options) {
        calls.push(["reconcileSessionAppIdentity", session.id, candidateUpdates, options]);
        return candidateUpdates;
      },
      refreshSessionAppIdentity(sessionId, options) {
        calls.push(["refreshSessionAppIdentity", sessionId, options]);
        return sessionId;
      },
      setSessionAppIdentity(sessionId, appIdentity, options) {
        calls.push(["setSessionAppIdentity", sessionId, appIdentity, options]);
        return appIdentity;
      },
      refreshSessionForegroundProcessIdentity(sessionId, options) {
        calls.push(["refreshSessionForegroundProcessIdentity", sessionId, options]);
        return options;
      },
      observeSessionTerminalSignals(session, chunk, options) {
        calls.push(["observeSessionTerminalSignals", session.id, chunk, options]);
        return chunk;
      },
      observeSessionOutputHeuristics(session, output, options) {
        calls.push(["observeSessionOutputHeuristics", session.id, output, options]);
        return output;
      },
      scheduleSessionForegroundProcessIdentityRefresh(session, options) {
        calls.push(["scheduleSessionForegroundProcessIdentityRefresh", session.id, options]);
        return options.delayMs;
      },
      updateSession(sessionId, patch, options) {
        calls.push(["updateSession", sessionId, patch, options]);
        return patch;
      },
      rename(sessionId, name) {
        calls.push(["rename", sessionId, name]);
        return name;
      }
    },
    sessionRuntime: {
      createSession(options) {
        calls.push(["createSession", options]);
        return { id: "created", ...options };
      },
      startSession(sessionId, options) {
        calls.push(["startSession", sessionId, options]);
        return options;
      },
      stopSession(sessionId, options) {
        calls.push(["stopSession", sessionId, options]);
        return options;
      },
      restartSession(sessionId, options) {
        calls.push(["restartSession", sessionId, options]);
        return options;
      },
      closeSessionWithReason(sessionId, reason, options) {
        calls.push(["closeSessionWithReason", sessionId, reason, options]);
        return reason;
      },
      enforceGuardrails(currentTime) {
        calls.push(["enforceGuardrails", currentTime]);
        return currentTime;
      }
    }
  });

  const session = { id: "session-1", meta: { id: "session-1", state: "running" } };

  assert.deepEqual(facade.buildLaunchBundle({ kind: "local", shell: "bash" }), { kind: "local" });
  assert.equal(facade.markRemoteSessionConnected(session), 77);
  assert.equal(facade.markRemoteSessionUnavailable(session, "offline", 90, { reason: "bye" }), "offline");
  facade.attachPtyProcess(session, { ptyProcess: {}, shellAdapter: {}, launchSpec: { shell: "bash" } });
  facade.dispatchLaunchPostStartInput(session);
  facade.scheduleLaunchPostStartInputDispatch(session, "ready", 12);
  facade.armLaunchPostStartInput(session, { shell: "bash" }, { trace: { source: "rest" } });
  facade.observePendingLaunchPostStartInput(session, { rawData: "pwd", promptBoundaries: [] });
  facade.observeStartupTerminalQueryFallback(session, { rawData: "x", trace: { traceId: "trace-1" } });
  facade.handleAsyncPtyWriteEvent(session, { phase: "ok" });
  facade.buildReconnectUnavailableError(session);
  facade.scheduleRemoteReconnect(session, { reason: "exit" });
  facade.attemptRemoteReconnect("session-1");
  facade.handlePtyExit(session, { exitCode: 0 });
  assert.deepEqual(facade.list(), [{ id: "session-1", state: "running" }]);
  assert.deepEqual(facade.buildReplayRetentionResult("abcdef"), { value: "abcdef", maxChars: 512 });
  assert.deepEqual(facade.buildReplayRetentionState("abcdef"), {
    value: "abcdef",
    shellBlocks: [],
    currentShellBlockStart: null,
    maxChars: 512
  });
  facade.appendReplayOutput(session, "chunk", []);
  assert.equal(facade.trimReplayOutput("abcdef", 2), "ab");
  assert.deepEqual(facade.getSnapshot({ outputMaxChars: 20 }), {
    outputMaxChars: 20,
    includeTruncationMetadata: false,
    includeEmptyOutputs: false
  });
  assert.equal(facade.getReplayExport("session-1"), "session-1");
  assert.equal(facade.getReplayExcerpt("session-1", "tail:10"), "tail:10");
  facade.updateSessionTraceSeed(session, { traceId: "trace-2" });
  facade.emitSessionActivityStarted(session, 11);
  facade.emitSessionActivityCompleted(session, 12);
  facade.scheduleSessionActivityCompletion(session);
  facade.emitSessionUpdated(session);
  facade.applySessionAppIdentity(session, { family: "shell" });
  facade.reconcileSessionAppIdentity(session, { label: "bash" });
  facade.refreshSessionAppIdentity("session-1", { trace: { source: "rest" } });
  facade.setSessionAppIdentity("session-1", { family: "agent" });
  facade.refreshSessionForegroundProcessIdentity("session-1", { trace: { source: "pty" } });
  facade.observeSessionTerminalSignals(session, "SIGINT", {});
  facade.observeSessionOutputHeuristics(session, "done", {});
  assert.equal(facade.scheduleSessionForegroundProcessIdentityRefresh(session), 33);
  facade.transitionToRunning(session);
  assert.equal(typeof facade.create({ cwd: "/tmp" }).id, "string");
  assert.equal(facade.sendInput("session-1", "pwd\r"), "pwd\r");
  assert.equal(facade.resize("session-1", 80, 24), 104);
  assert.equal(facade.signal("session-1", "SIGUSR1"), "SIGUSR1");
  assert.equal(facade.interrupt("session-1"), "SIGINT");
  assert.equal(facade.terminate("session-1"), "SIGTERM");
  assert.equal(facade.kill("session-1"), "SIGKILL");
  assert.deepEqual(facade.updateSession("session-1", { note: "hi" }), { note: "hi" });
  assert.equal(facade.rename("session-1", "ops"), "ops");
  assert.deepEqual(facade.start("session-1", { trace: { source: "rest" } }), { trace: { source: "rest" } });
  assert.deepEqual(facade.stop("session-1", { trace: { source: "rest" } }), { trace: { source: "rest" } });
  assert.deepEqual(facade.restart("session-1", { trace: { source: "rest" } }), { trace: { source: "rest" } });
  assert.equal(facade.delete("session-1"), "deleted");
  assert.equal(facade.closeWithReason("session-1", "cleanup"), "cleanup");
  assert.equal(facade.enforceGuardrails(), 77);

  assert.throws(
    () => facade.get("missing"),
    (error) => error instanceof ApiError && error.statusCode === 404 && error.error === "SessionNotFound"
  );

  assert.ok(calls.some((entry) => entry[0] === "scheduleSessionForegroundProcessIdentityRefresh" && entry[2].delayMs === 33));
  assert.ok(calls.some((entry) => entry[0] === "signal" && entry[2] === "SIGINT"));
  assert.ok(calls.some((entry) => entry[0] === "closeSessionWithReason" && entry[2] === "deleted"));
  assert.ok(calls.some((entry) => entry[0] === "createSession" && entry[1].initialState === undefined));
});

test("session manager runtime facade forwards initial stopped state through create", () => {
  const calls = [];
  const facade = createSessionManagerRuntimeFacade({
    sessionRuntime: {
      createSession(options) {
        calls.push(options);
        return { ...options };
      }
    }
  });

  const created = facade.create({
    id: "session-stopped",
    cwd: "/tmp",
    shell: "bash",
    initialState: "stopped"
  });

  assert.equal(created.initialState, "stopped");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].initialState, "stopped");
});
