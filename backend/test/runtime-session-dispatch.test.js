import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionDispatch } from "../src/runtime-session-dispatch.js";

function createBaseDependencies(overrides = {}) {
  return {
    validateResponse: () => {},
    createSessionRateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    rateLimitRestCreateMax: 10,
    normalizeConnectionProfileIdInput: (value) => value,
    getConnectionProfileOrThrow: () => null,
    normalizeSessionKind: (value) => value,
    normalizeSessionStartupConfig: () => ({ startCwd: "/srv/app", startCommand: "", env: {} }),
    normalizeSessionRemoteConnection: (value) => value,
    normalizeSessionRemoteAuth: (value) => value,
    normalizeSessionRemoteSecret: (value) => value,
    normalizeSessionThemeSlots: () => ({ themeProfile: {}, activeThemeProfile: {}, inactiveThemeProfile: {} }),
    normalizeSessionNote: (value) => value,
    normalizeSessionMouseForwardingMode: (value) => value,
    normalizeSessionInputSafetyProfile: (value) => value,
    normalizeSessionTags: (value) => value,
    normalizeConnectionProfileDeckId: (value) => value || "default",
    normalizeQuickSendUsageMutation: () => null,
    getApiSessionOrThrow: (sessionId) => ({ id: sessionId, deckId: "default", kind: "local" }),
    listApiSessions: () => [],
    buildSessionReplayExportOrThrow: (sessionId) => ({ sessionId, data: "export" }),
    buildSessionReplayExcerptOrThrow: (sessionId, selector) => ({ sessionId, selector, data: "excerpt" }),
    buildSessionFileDownloadOrThrow: async (sessionId, path) => ({ sessionId, path, contentBase64: "aGk=" }),
    uploadSessionFileOrThrow: async (sessionId, path) => ({ sessionId, path, sizeBytes: 2 }),
    ensureSessionControllerAccess: () => {},
    messagingRuntime: {
      observeSessionInput: () => {},
      syncTelegramCommandCatalog: async () => {}
    },
    manager: {
      create: (payload) => payload,
      get: () => ({ meta: { kind: "local", cwd: "/tmp", startCwd: "/tmp", startCommand: "", env: {}, remoteConnection: null, remoteAuth: null } }),
      updateSession: (sessionId, patch) => ({ id: sessionId, deckId: "default", kind: "local", ...patch }),
      sendInput: () => {},
      delete: () => {},
      restart: (sessionId) => ({ id: sessionId, quickIdToken: "R1", deckId: "default", kind: "local" }),
      interrupt: () => {},
      terminate: () => {},
      kill: () => {},
      resize: () => {}
    },
    assignSessionQuickIdToken: () => "Q1",
    deleteSessionQuickIdToken: () => true,
    createDefaultSessionOwner: () => ({ subject: "operator" }),
    setSessionControlState: () => {},
    deleteSessionControlState: () => {},
    reconcileSessionControllerForSession: () => true,
    toApiSession: (value) => ({ ...value, api: true }),
    persistNow: async () => {},
    persistSoon: () => {},
    broadcast: () => {},
    broadcastSessionUpdated: () => {},
    removeCustomCommandsForSession: () => [],
    cleanupLayoutProfiles: () => false,
    cleanupWorkspacePresets: () => false,
    deleteUnrestoredSession: () => false,
    deleteSessionDeckAssignment: () => false,
    setPendingSessionDeckAssignment: () => {},
    randomUuid: () => "session-1",
    defaultSshClient: "ssh",
    sessionKindSsh: "ssh",
    setAuditContext: () => {},
    swapSessionQuickIds: (leftSessionId, rightSessionId) => ({
      leftSession: { id: leftSessionId, deckId: "left" },
      rightSession: { id: rightSessionId, deckId: "right" }
    }),
    recordSessionLastInput: () => {},
    ...overrides
  };
}

function createDispatchHarness(dependencyOverrides = {}) {
  const auditCalls = [];
  const responseCalls = [];
  const dependencies = createBaseDependencies({
    setAuditContext: (value) => auditCalls.push(value),
    ...dependencyOverrides
  });
  const dispatch = createRuntimeSessionDispatch(dependencies);
  return {
    dispatch,
    dependencies,
    auditCalls,
    responseCalls,
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  };
}

test("runtime session dispatch returns false for unrelated route kinds", async () => {
  const { dispatch, responseCalls } = createDispatchHarness();

  const handled = await dispatch.dispatchSessionRequest({
    match: { kind: "other", params: {} },
    parsedUrl: new URL("http://127.0.0.1/api/v1/other"),
    body: {},
    auth: null,
    req: null,
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trace-1" },
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  });

  assert.equal(handled, false);
  assert.deepEqual(responseCalls, []);
});

test("runtime session dispatch creates sessions through the extracted create-session seam", async () => {
  const validateCalls = [];
  const createCalls = [];
  const persistReasons = [];
  const broadcastCalls = [];
  const auditCalls = [];
  const pendingDeckAssignments = [];
  const controlStateCalls = [];
  const responseCalls = [];

  const { dispatch } = createDispatchHarness({
    validateResponse: (value) => validateCalls.push(value),
    getConnectionProfileOrThrow: () => ({
      id: "ops-ssh",
      launch: {
        kind: "ssh",
        deckId: "infra",
        startCwd: "/srv/app",
        startCommand: "tmux a || tmux",
        env: { LANG: "C" },
        remoteConnection: { host: "example.com", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" },
        note: "from profile",
        tags: ["prod"]
      }
    }),
    normalizeSessionKind: () => "ssh",
    normalizeSessionStartupConfig: (value) => ({
      startCwd: value.startCwd,
      startCommand: value.startCommand,
      env: value.env
    }),
    normalizeSessionRemoteConnection: (value) => value,
    normalizeSessionRemoteAuth: (value) => value,
    normalizeSessionRemoteSecret: (value) => value,
    normalizeSessionThemeSlots: () => ({
      themeProfile: { background: "#000000" },
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" }
    }),
    normalizeSessionNote: (value) => value,
    normalizeSessionMouseForwardingMode: (value) => value || "off",
    normalizeSessionInputSafetyProfile: (value) => value || { mode: "prompt" },
    normalizeSessionTags: (value) => value,
    normalizeConnectionProfileDeckId: (value) => value,
    assignSessionQuickIdToken: () => "Q7",
    setPendingSessionDeckAssignment: (sessionId, deckId) => pendingDeckAssignments.push({ sessionId, deckId }),
    setSessionControlState: (sessionId, value, owner) => controlStateCalls.push({ sessionId, value, owner }),
    createDefaultSessionOwner: (auth) => ({ subject: auth.subject }),
    manager: {
      create: (payload) => {
        createCalls.push(payload);
        return { ...payload, createdAt: 1, updatedAt: 2 };
      }
    },
    reconcileSessionControllerForSession: () => true,
    toApiSession: (value) => ({ ...value, api: true }),
    persistNow: async (reason) => persistReasons.push(reason),
    broadcastSessionUpdated: (sessionId, trace, fallbackSession) => broadcastCalls.push({ sessionId, trace, fallbackSession }),
    setAuditContext: (value) => auditCalls.push(value)
  });

  const handled = await dispatch.dispatchSessionRequest({
    match: { kind: "createSession", params: {} },
    parsedUrl: new URL("http://127.0.0.1/api/v1/sessions"),
    body: {
      connectionProfileId: "ops-ssh",
      name: "carpo",
      startCommand: "htop",
      remoteSecret: "secret-value",
      mouseForwardingMode: "force",
      inputSafetyProfile: { mode: "allow" },
      tags: ["ssh"]
    },
    auth: { subject: "operator-1" },
    req: null,
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trace-create" },
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  });

  assert.equal(handled, true);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].id, "session-1");
  assert.equal(createCalls[0].quickIdToken, "Q7");
  assert.equal(createCalls[0].shell, "ssh");
  assert.deepEqual(createCalls[0].remoteConnection, { host: "example.com", port: 22, username: "ops" });
  assert.deepEqual(createCalls[0].remoteAuth, { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" });
  assert.equal(createCalls[0].remoteSecret, "secret-value");
  assert.equal(createCalls[0].startCwd, "/srv/app");
  assert.equal(createCalls[0].startCommand, "htop");
  assert.deepEqual(createCalls[0].env, { LANG: "C" });
  assert.deepEqual(createCalls[0].tags, ["ssh"]);
  assert.deepEqual(pendingDeckAssignments, [{ sessionId: "session-1", deckId: "infra" }]);
  assert.equal(controlStateCalls[0].sessionId, "session-1");
  assert.deepEqual(validateCalls, [{ statusCode: 201, body: responseCalls[0].body, expect: "session" }]);
  assert.deepEqual(persistReasons, ["session.create"]);
  assert.deepEqual(auditCalls, [{ target: { sessionId: "session-1" }, metadata: { deckId: "infra", sessionKind: "ssh" } }]);
  assert.equal(broadcastCalls.length, 1);
  assert.equal(broadcastCalls[0].sessionId, "session-1");
  assert.deepEqual(broadcastCalls[0].fallbackSession, responseCalls[0].body);
  assert.equal(responseCalls.length, 1);
  assert.equal(responseCalls[0].statusCode, 201);
  assert.equal(responseCalls[0].body.api, true);
});

test("runtime session dispatch rolls back pending session state when create fails", async () => {
  const deletedDeckAssignments = [];
  const deletedQuickIds = [];
  const deletedControlStates = [];

  const { dispatch } = createDispatchHarness({
    normalizeSessionKind: () => "local",
    manager: {
      create: () => {
        throw new Error("spawn failed");
      }
    },
    deleteSessionDeckAssignment: (sessionId) => deletedDeckAssignments.push(sessionId),
    deleteSessionQuickIdToken: (sessionId) => deletedQuickIds.push(sessionId),
    deleteSessionControlState: (sessionId) => deletedControlStates.push(sessionId)
  });

  await assert.rejects(
    () => dispatch.dispatchSessionRequest({
      match: { kind: "createSession", params: {} },
      parsedUrl: new URL("http://127.0.0.1/api/v1/sessions"),
      body: { kind: "local", shell: "sh" },
      auth: { subject: "operator-1" },
      req: null,
      requestContext: { clientIp: "127.0.0.1" },
      requestTraceContext: { traceId: "trace-create-fail" },
      writeJsonResponse: () => {}
    }),
    /spawn failed/
  );

  assert.deepEqual(deletedDeckAssignments, ["session-1"]);
  assert.deepEqual(deletedQuickIds, ["session-1"]);
  assert.deepEqual(deletedControlStates, ["session-1"]);
});

test("runtime session dispatch records direct input and quick-send usage metadata", async () => {
  const controllerChecks = [];
  const observedInputs = [];
  const sendInputCalls = [];
  const persistSoonCalls = [];
  const lastInputCalls = [];
  const broadcastCalls = [];
  const auditCalls = [];
  const responseCalls = [];

  const { dispatch } = createDispatchHarness({
    normalizeQuickSendUsageMutation: (value) => value,
    ensureSessionControllerAccess: (...args) => controllerChecks.push(args),
    messagingRuntime: {
      observeSessionInput: (sessionId, trace) => observedInputs.push({ sessionId, trace })
    },
    manager: {
      sendInput: (sessionId, data, options) => sendInputCalls.push({ sessionId, data, options })
    },
    recordSessionLastInput: (...args) => lastInputCalls.push(args),
    persistSoon: () => persistSoonCalls.push(true),
    broadcastSessionUpdated: (sessionId, trace) => broadcastCalls.push({ sessionId, trace }),
    setAuditContext: (value) => auditCalls.push(value)
  });

  const handled = await dispatch.dispatchSessionRequest({
    match: { kind: "input", params: { sessionId: "session-9" } },
    parsedUrl: new URL("http://127.0.0.1/api/v1/sessions/session-9/input"),
    body: {
      data: "echo hi\n",
      customCommandUsage: { lookupKey: "session::build" }
    },
    auth: { subject: "operator-2" },
    req: { headers: { "x-ptydeck-client-id": "client-1" } },
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trace-input" },
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  });

  assert.equal(handled, true);
  assert.equal(controllerChecks.length, 1);
  assert.deepEqual(auditCalls, [{
    target: { sessionId: "session-9" },
    metadata: { inputBytes: Buffer.byteLength("echo hi\n", "utf8"), quickSendLookupKey: "session::build" }
  }]);
  assert.equal(observedInputs.length, 1);
  assert.equal(observedInputs[0].sessionId, "session-9");
  assert.equal(observedInputs[0].trace.replyPromotionEligible, true);
  assert.equal(observedInputs[0].trace.replyInputText, "echo hi");
  assert.equal(sendInputCalls.length, 1);
  assert.equal(sendInputCalls[0].options.customCommandUsage.lookupKey, "session::build");
  assert.equal(lastInputCalls.length, 1);
  assert.equal(persistSoonCalls.length, 1);
  assert.equal(broadcastCalls.length, 1);
  assert.deepEqual(responseCalls, [{ statusCode: 204, body: undefined }]);
});

test("runtime session dispatch cleans up dependent state when deleting a session", async () => {
  const deleteCalls = [];
  const deletedDeckAssignments = [];
  const deletedQuickIds = [];
  const deletedControlStates = [];
  const deletedUnrestored = [];
  const broadcastCalls = [];
  const persistReasons = [];
  const syncCalls = [];
  const auditCalls = [];
  const responseCalls = [];

  const { dispatch } = createDispatchHarness({
    manager: {
      delete: (sessionId, options) => deleteCalls.push({ sessionId, options })
    },
    deleteSessionDeckAssignment: (sessionId) => deletedDeckAssignments.push(sessionId),
    deleteSessionQuickIdToken: (sessionId) => deletedQuickIds.push(sessionId),
    deleteSessionControlState: (sessionId) => deletedControlStates.push(sessionId),
    deleteUnrestoredSession: (sessionId) => deletedUnrestored.push(sessionId),
    removeCustomCommandsForSession: () => [{ name: "Build" }, { name: "Logs" }],
    broadcast: (payload, trace) => broadcastCalls.push({ payload, trace }),
    cleanupLayoutProfiles: () => true,
    cleanupWorkspacePresets: () => true,
    persistNow: async (reason) => persistReasons.push(reason),
    messagingRuntime: {
      syncTelegramCommandCatalog: async (trace) => syncCalls.push(trace)
    },
    setAuditContext: (value) => auditCalls.push(value)
  });

  const handled = await dispatch.dispatchSessionRequest({
    match: { kind: "deleteSession", params: { sessionId: "session-4" } },
    parsedUrl: new URL("http://127.0.0.1/api/v1/sessions/session-4"),
    body: {},
    auth: { subject: "operator-3" },
    req: null,
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trace-delete" },
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  });

  assert.equal(handled, true);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].sessionId, "session-4");
  assert.deepEqual(deletedDeckAssignments, ["session-4"]);
  assert.deepEqual(deletedQuickIds, ["session-4"]);
  assert.deepEqual(deletedControlStates, ["session-4"]);
  assert.deepEqual(deletedUnrestored, ["session-4"]);
  assert.equal(broadcastCalls.length, 2);
  assert.deepEqual(persistReasons, ["session.delete"]);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(auditCalls, [{ target: { sessionId: "session-4" } }]);
  assert.deepEqual(responseCalls, [{ statusCode: 204, body: undefined }]);
});

test("runtime session dispatch persists restart payloads through the extracted seam", async () => {
  const validateCalls = [];
  const quickIdAssignments = [];
  const persistReasons = [];
  const responseCalls = [];

  const { dispatch } = createDispatchHarness({
    validateResponse: (value) => validateCalls.push(value),
    manager: {
      restart: (sessionId, options) => ({ id: sessionId, quickIdToken: "R9", deckId: "ops", kind: "local", options })
    },
    assignSessionQuickIdToken: (sessionId, token) => {
      quickIdAssignments.push({ sessionId, token });
      return token;
    },
    toApiSession: (value) => ({ ...value, api: true }),
    persistNow: async (reason) => persistReasons.push(reason)
  });

  const handled = await dispatch.dispatchSessionRequest({
    match: { kind: "restart", params: { sessionId: "session-8" } },
    parsedUrl: new URL("http://127.0.0.1/api/v1/sessions/session-8/restart"),
    body: {},
    auth: { subject: "operator-4" },
    req: null,
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trace-restart" },
    writeJsonResponse: (statusCode, body) => responseCalls.push({ statusCode, body })
  });

  assert.equal(handled, true);
  assert.deepEqual(quickIdAssignments, [{ sessionId: "session-8", token: "R9" }]);
  assert.deepEqual(validateCalls, [{ statusCode: 200, body: responseCalls[0].body, expect: "session" }]);
  assert.deepEqual(persistReasons, ["session.restart"]);
  assert.deepEqual(responseCalls, [{
    statusCode: 200,
    body: {
      id: "session-8",
      quickIdToken: "R9",
      deckId: "ops",
      kind: "local",
      options: { trace: { traceId: "trace-restart", sessionId: "session-8" } },
      api: true
    }
  }]);
});

test("runtime session dispatch surfaces session-creation rate limit errors deterministically", async () => {
  const { dispatch } = createDispatchHarness({
    createSessionRateLimiter: { check: () => ({ allowed: false, retryAfterSeconds: 12 }) }
  });

  await assert.rejects(
    () => dispatch.dispatchSessionRequest({
      match: { kind: "createSession", params: {} },
      parsedUrl: new URL("http://127.0.0.1/api/v1/sessions"),
      body: { kind: "local", shell: "sh" },
      auth: null,
      req: null,
      requestContext: { clientIp: "127.0.0.1" },
      requestTraceContext: { traceId: "trace-rate-limit" },
      writeJsonResponse: () => {}
    }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 429);
      assert.equal(error.error, "RateLimitExceeded");
      assert.match(error.message, /Retry in 12 seconds/);
      return true;
    }
  );
});
