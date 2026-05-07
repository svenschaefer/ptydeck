import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionMessagingAuthority } from "../src/runtime-session-messaging-authority.js";

function createHarness(overrides = {}) {
  const manager = {
    list: () => [],
    create: (payload) => payload,
    restart: () => {
      throw new ApiError(404, "SessionNotFound", "missing session");
    },
    terminate: () => {},
    sendInput: () => {},
    ...(overrides.manager || {})
  };
  const sendInputCalls = [];
  const observeCalls = [];
  const broadcastCalls = [];
  const recordLastInputCalls = [];
  const assignQuickIdCalls = [];
  const ensureAccessCalls = [];
  const timeoutCalls = [];

  const authority = createRuntimeSessionMessagingAuthority({
    manager: {
      ...manager,
      sendInput: (sessionId, data, options) => {
        sendInputCalls.push({ sessionId, data, options });
        return manager.sendInput(sessionId, data, options);
      }
    },
    withDeckId:
      overrides.withDeckId ||
      ((session) => ({
        ...(session || {}),
        deckId: session?.deckId || "default",
        quickIdToken: session?.quickIdToken || "A"
      })),
    buildApiSessionControlState:
      overrides.buildApiSessionControlState || ((sessionId) => ({ sessionId, mode: "local" })),
    getApiSessionOrThrow:
      overrides.getApiSessionOrThrow || ((sessionId) => ({ id: sessionId, state: "running", deckId: "default" })),
    ensureMessagingSessionInputAccess: (sessionId, action) => {
      ensureAccessCalls.push({ sessionId, action });
      return overrides.ensureMessagingSessionInputAccess?.(sessionId, action);
    },
    assignSessionQuickIdToken: (sessionId, token) => {
      assignQuickIdCalls.push({ sessionId, token });
      return overrides.assignSessionQuickIdToken?.(sessionId, token) || token || "A";
    },
    getSessionQuickIdToken: overrides.getSessionQuickIdToken || ((sessionId) => (sessionId === "session-1" ? "A" : "B")),
    observeSessionInput: (sessionId, trace) => {
      observeCalls.push({ sessionId, trace });
      return overrides.observeSessionInput?.(sessionId, trace);
    },
    recordSessionLastInput: (...args) => {
      recordLastInputCalls.push(args);
      return overrides.recordSessionLastInput?.(...args);
    },
    broadcastSessionUpdated: (sessionId, trace) => {
      broadcastCalls.push({ sessionId, trace });
      return overrides.broadcastSessionUpdated?.(sessionId, trace);
    },
    buildSessionReplayExcerptOrThrow:
      overrides.buildSessionReplayExcerptOrThrow || ((sessionId, selector) => ({ sessionId, selector, data: "excerpt" })),
    normalizeTraceSeed:
      overrides.normalizeTraceSeed ||
      ((trace) => {
        if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
          return null;
        }
        const normalized = Object.fromEntries(
          Object.entries(trace).filter(([, value]) => typeof value === "string" && value.trim())
        );
        return Object.keys(normalized).length ? normalized : null;
      }),
    logDebug: overrides.logDebug || (() => {}),
    setTimeoutFn: (handler, delay) => {
      timeoutCalls.push({ handler, delay });
      return overrides.setTimeoutFn?.(handler, delay) || handler;
    },
    messagingCodexSubmitDelayMs: overrides.messagingCodexSubmitDelayMs || 25,
    normalizeTerminalAppIdentity:
      overrides.normalizeTerminalAppIdentity ||
      ((identity, { fallbackUpdatedAt } = {}) => ({
        source: identity?.source || "unknown",
        family: identity?.family || "unknown",
        label: identity?.label || "",
        updatedAt: fallbackUpdatedAt
      })),
    deriveTerminalAppIdentityFromSessionHints:
      overrides.deriveTerminalAppIdentityFromSessionHints ||
      ((session, { updatedAt } = {}) => ({
        source: "derived",
        family: "shell",
        label: session?.shell || "shell",
        updatedAt
      }))
  });

  return {
    assignQuickIdCalls,
    authority,
    broadcastCalls,
    ensureAccessCalls,
    observeCalls,
    recordLastInputCalls,
    sendInputCalls,
    timeoutCalls
  };
}

test("runtime session messaging authority shapes api sessions with derived identities and control state", () => {
  const { authority } = createHarness({
    withDeckId: (session) => ({
      ...session,
      deckId: "ops",
      quickIdToken: "Q1"
    }),
    buildApiSessionControlState: (sessionId, sessionModel) => ({
      sessionId,
      deckId: sessionModel.deckId
    })
  });

  const payload = authority.toApiSession({
    id: "session-1",
    name: "shell",
    state: "running",
    shell: "bash",
    updatedAt: 55
  });

  assert.deepEqual(payload, {
    id: "session-1",
    name: "shell",
    state: "running",
    shell: "bash",
    updatedAt: 55,
    deckId: "ops",
    quickIdToken: "Q1",
    appIdentity: {
      source: "derived",
      family: "shell",
      label: "bash",
      updatedAt: 55
    },
    controlState: {
      sessionId: "session-1",
      deckId: "ops"
    }
  });
});

test("runtime session messaging authority resolves and rejects messaging targets deterministically", () => {
  const sessions = [
    { id: "session-1", name: "ops", deckId: "default" },
    { id: "session-2", name: "ops", deckId: "default" }
  ];
  const { authority } = createHarness({
    manager: {
      list: () => sessions
    },
    getApiSessionOrThrow: (sessionId) => ({ id: sessionId, state: "running" }),
    getSessionQuickIdToken: () => "A"
  });

  assert.deepEqual(authority.resolveSessionForMessagingTarget({ sessionId: "session-9" }), {
    id: "session-9",
    state: "running"
  });
  assert.throws(
    () => authority.resolveSessionForMessagingTarget({ quickIdToken: "A" }),
    (error) => error instanceof ApiError && error.statusCode === 409 && error.error === "MessagingTargetAmbiguous"
  );
  assert.throws(
    () => authority.resolveSessionForMessagingTarget({ sessionName: "missing" }),
    (error) => error instanceof ApiError && error.statusCode === 404 && error.error === "SessionNotFound"
  );
});

test("runtime session messaging authority retries via manager restart before falling back to restored session creation", () => {
  const restarted = { id: "session-1", quickIdToken: "B", name: "ops", deckId: "default", state: "running" };
  const restartHarness = createHarness({
    manager: {
      restart: () => restarted
    }
  });
  assert.equal(restartHarness.authority.requestMessagingRetry("session-1").id, "session-1");
  assert.deepEqual(restartHarness.assignQuickIdCalls, [{ sessionId: "session-1", token: "B" }]);

  const createdPayloads = [];
  const restoredHarness = createHarness({
    manager: {
      create: (payload) => {
        createdPayloads.push(payload);
        return { ...payload, state: "running" };
      }
    }
  });
  const restored = restoredHarness.authority.requestMessagingRetry("session-restore", {
    trace: { source: "messaging:telegram" },
    sessionSnapshot: {
      id: "session-restore",
      kind: "ssh",
      remoteConnection: { host: "example.com", port: 22, username: "ops" },
      remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" },
      remoteSecret: "secret",
      quickIdToken: "C",
      cwd: "/srv/app",
      startCwd: "/srv/app",
      shell: "ssh",
      name: "restore",
      deckId: "ops",
      startCommand: "tmux a",
      env: { LANG: "C" },
      note: "note",
      mouseForwardingMode: "force",
      inputSafetyProfile: { mode: "allow" },
      tags: ["prod"],
      quickSendUsage: [{ lookupKey: "deploy", count: 2 }],
      themeProfile: { background: "#000000" },
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" },
      createdAt: 10
    }
  });
  assert.equal(restored.id, "session-restore");
  assert.equal(createdPayloads.length, 1);
  assert.equal(createdPayloads[0].quickSendUsage[0].lookupKey, "deploy");
  assert.deepEqual(restoredHarness.assignQuickIdCalls, [{ sessionId: "session-restore", token: "C" }]);
});

test("runtime session messaging authority fails closed for retry errors without a viable restore snapshot", () => {
  const restartError = new ApiError(500, "RestartFailed", "boom");
  const errorHarness = createHarness({
    manager: {
      restart: () => {
        throw restartError;
      }
    }
  });
  assert.throws(
    () => errorHarness.authority.requestMessagingRetry("session-1"),
    (error) => error === restartError
  );

  const missingSnapshotHarness = createHarness();
  assert.throws(
    () => missingSnapshotHarness.authority.requestMessagingRetry("session-missing"),
    (error) => error instanceof ApiError && error.statusCode === 404 && error.error === "SessionNotFound"
  );
});

test("runtime session messaging authority stops and replays excerpts via dedicated delegates", () => {
  const terminateCalls = [];
  const { authority } = createHarness({
    manager: {
      terminate: (sessionId, options) => {
        terminateCalls.push({ sessionId, options });
      }
    }
  });

  assert.equal(authority.requestMessagingStop("session-1", { trace: { source: "telegram" } }), null);
  assert.deepEqual(terminateCalls, [{ sessionId: "session-1", options: { trace: { source: "telegram" } } }]);
  assert.deepEqual(authority.requestMessagingReplayExcerpt("session-2", "tail:20"), {
    sessionId: "session-2",
    selector: "tail:20",
    data: "excerpt"
  });
});

test("runtime session messaging authority sends direct input and records follow-up state", () => {
  const { authority, broadcastCalls, ensureAccessCalls, observeCalls, recordLastInputCalls, sendInputCalls } = createHarness();

  const result = authority.requestMessagingSendInput("session-1", "pwd", {
    trace: { source: "messaging:telegram", requestId: "req-1" }
  });

  assert.equal(result.id, "session-1");
  assert.deepEqual(ensureAccessCalls, [{ sessionId: "session-1", action: "send terminal input" }]);
  assert.equal(observeCalls.length, 1);
  assert.equal(observeCalls[0].trace.replyPromotionEligible, undefined);
  assert.deepEqual(sendInputCalls, [
    {
      sessionId: "session-1",
      data: "pwd",
      options: {
        trace: {
          source: "messaging:telegram",
          requestId: "req-1",
          sessionId: "session-1",
          replyInputText: "pwd"
        },
        writeKind: "direct"
      }
    }
  ]);
  assert.deepEqual(recordLastInputCalls, [["session-1", null, null]]);
  assert.deepEqual(broadcastCalls, [{ sessionId: "session-1", trace: { source: "messaging:telegram", requestId: "req-1" } }]);
});

test("runtime session messaging authority rethrows direct and delayed submit write failures", async () => {
  const directError = new Error("direct write failed");
  const directHarness = createHarness({
    manager: {
      sendInput() {
        throw directError;
      }
    }
  });
  assert.throws(
    () => directHarness.authority.requestMessagingSendInput("session-1", "pwd", {
      trace: { source: "messaging:telegram" }
    }),
    (error) => error === directError
  );

  let callCount = 0;
  const delayedError = new Error("submit failed");
  const delayedHarness = createHarness({
    manager: {
      sendInput() {
        callCount += 1;
        if (callCount === 2) {
          throw delayedError;
        }
      }
    }
  });

  const pending = delayedHarness.authority.requestMessagingSendInput("session-1", "echo hi\r", {
    trace: { source: "messaging:telegram" }
  });
  delayedHarness.timeoutCalls[0].handler();
  await assert.rejects(() => pending, (error) => error === delayedError);
});

test("runtime session messaging authority schedules delayed submit writes for reply promotion", async () => {
  const harness = createHarness();

  const pending = harness.authority.requestMessagingSendInput("session-1", "echo hi\r", {
    trace: { source: "messaging:telegram", requestId: "req-2" }
  });

  assert.equal(harness.sendInputCalls.length, 1);
  assert.equal(harness.sendInputCalls[0].data, "echo hi");
  assert.equal(harness.timeoutCalls.length, 1);
  assert.equal(harness.timeoutCalls[0].delay, 25);

  harness.timeoutCalls[0].handler();
  const result = await pending;

  assert.equal(result.id, "session-1");
  assert.equal(harness.sendInputCalls.length, 2);
  assert.equal(harness.sendInputCalls[1].data, "\r");
  assert.equal(harness.observeCalls.length, 2);
  assert.equal(harness.observeCalls[1].trace.replyInputText, "echo hi");
  assert.deepEqual(harness.recordLastInputCalls, [["session-1", null, null]]);
  assert.deepEqual(harness.broadcastCalls, [{ sessionId: "session-1", trace: { source: "messaging:telegram", requestId: "req-2" } }]);
});
