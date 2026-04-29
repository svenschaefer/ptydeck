import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeResourceDispatch } from "../src/runtime-resource-dispatch.js";

function createSearchParams(entries = {}) {
  const url = new URL("https://ptydeck.local/api/v1/test");
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function createWriter() {
  const calls = [];
  return {
    calls,
    writeJsonResponse(statusCode, body) {
      calls.push({ statusCode, body });
    }
  };
}

function createValidateRecorder() {
  const calls = [];
  return {
    calls,
    validateResponse(input) {
      calls.push(input);
    }
  };
}

test("runtime resource dispatch handles share routes and messaging side effects deterministically", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  const dispatcher = createRuntimeResourceDispatch({
    validateResponse: validation.validateResponse,
    listShareLinks: () => [{ id: "share-list" }],
    createShareLink(body, auth, req, requestContext) {
      observed.push(["createShareLink", body.targetType, auth.subject, req.method, requestContext.clientIp]);
      return { id: "share-session", targetType: "session", targetId: "session-1" };
    },
    getApiShareLinkOrThrow(shareId) {
      observed.push(["getShareLink", shareId]);
      return { id: shareId, targetType: "session", targetId: "session-1" };
    },
    revokeShareLink(shareId) {
      observed.push(["revokeShareLink", shareId]);
      return { id: shareId, targetType: "deck", targetId: "deck-1" };
    },
    persistNow: async (reason) => {
      observed.push(["persist", reason]);
    },
    getApiSessionOrThrow(sessionId) {
      return { id: sessionId, deckId: "deck-1" };
    },
    listApiSessions() {
      return [
        { id: "session-1", deckId: "deck-1" },
        { id: "session-2", deckId: "deck-1" },
        { id: "session-3", deckId: "deck-2" }
      ];
    },
    messagingRuntime: {
      async observeShareChange(payload) {
        observed.push(["shareChange", payload.action, payload.shareLink.id, payload.session.id]);
      },
      async syncTelegramCommandCatalog() {}
    }
  });

  assert.equal(
    await dispatcher.dispatchResourceRequest({
      match: { kind: "listShares", params: {} },
      parsedUrl: createSearchParams(),
      body: undefined,
      auth: { subject: "alice" },
      req: { method: "GET" },
      requestContext: { clientIp: "127.0.0.1" },
      requestTraceContext: { traceId: "trc-1" },
      writeJsonResponse: writer.writeJsonResponse
    }),
    true
  );
  assert.deepEqual(writer.calls.shift(), { statusCode: 200, body: [{ id: "share-list" }] });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "createShareLink", params: {} },
    parsedUrl: createSearchParams(),
    body: { targetType: "session" },
    auth: { subject: "alice" },
    req: { method: "POST" },
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trc-1" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), {
    statusCode: 201,
    body: { id: "share-session", targetType: "session", targetId: "session-1" }
  });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "getShareLink", params: { shareId: "share-session" } },
    parsedUrl: createSearchParams(),
    body: undefined,
    auth: { subject: "alice" },
    req: { method: "GET" },
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trc-1" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), {
    statusCode: 200,
    body: { id: "share-session", targetType: "session", targetId: "session-1" }
  });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "revokeShareLink", params: { shareId: "share-deck" } },
    parsedUrl: createSearchParams(),
    body: undefined,
    auth: { subject: "alice" },
    req: { method: "POST" },
    requestContext: { clientIp: "127.0.0.1" },
    requestTraceContext: { traceId: "trc-1" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), {
    statusCode: 200,
    body: { id: "share-deck", targetType: "deck", targetId: "deck-1" }
  });

  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect]), [
    [200, "shareLinkList"],
    [201, "shareLink"],
    [200, "shareLink"],
    [200, "shareLink"]
  ]);
  assert.deepEqual(observed, [
    ["createShareLink", "session", "alice", "POST", "127.0.0.1"],
    ["persist", "share-link.create"],
    ["shareChange", "created", "share-session", "session-1"],
    ["getShareLink", "share-session"],
    ["revokeShareLink", "share-deck"],
    ["persist", "share-link.revoke"],
    ["shareChange", "revoked", "share-deck", "session-1"],
    ["shareChange", "revoked", "share-deck", "session-2"]
  ]);
});

test("runtime resource dispatch handles custom-command routes deterministically", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  const dispatcher = createRuntimeResourceDispatch({
    validateResponse: validation.validateResponse,
    normalizeCustomCommandScope: (value) => String(value || "").trim().toLowerCase() || "project",
    normalizeCustomCommandSessionId: (value) => String(value || "").trim(),
    listCustomCommands: ({ scope, sessionId }) => {
      observed.push(["list", scope, sessionId]);
      return [{ name: "build" }];
    },
    getCustomCommandOrThrow(name, { scope, sessionId }) {
      observed.push(["get", name, scope, sessionId]);
      return { name, scope, sessionId };
    },
    hasCustomCommand(name, { scope, sessionId }) {
      observed.push(["has", name, scope, sessionId]);
      return false;
    },
    upsertCustomCommand(name, body) {
      observed.push(["upsert", name, body.scope, body.sessionId]);
      return { name, scope: body.scope, sessionId: body.sessionId };
    },
    deleteCustomCommand(name, { scope, sessionId }) {
      observed.push(["delete", name, scope, sessionId]);
      return { name, scope, sessionId };
    },
    broadcast(event, trace) {
      observed.push(["broadcast", event.type, event.command.name, trace.traceId]);
    },
    persistNow: async (reason) => {
      observed.push(["persist", reason]);
    },
    messagingRuntime: {
      async observeShareChange() {},
      async syncTelegramCommandCatalog(trace) {
        observed.push(["syncCatalog", trace.traceId]);
      }
    }
  });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "listCustomCommands", params: {} },
    parsedUrl: createSearchParams({ scope: "Session", sessionId: "  session-1  " }),
    body: undefined,
    auth: null,
    req: { method: "GET" },
    requestContext: {},
    requestTraceContext: { traceId: "trc-2" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), { statusCode: 200, body: [{ name: "build" }] });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "getCustomCommand", params: { commandName: "build" } },
    parsedUrl: createSearchParams({ scope: "Project", sessionId: "ignored" }),
    body: undefined,
    auth: null,
    req: { method: "GET" },
    requestContext: {},
    requestTraceContext: { traceId: "trc-2" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), {
    statusCode: 200,
    body: { name: "build", scope: "project", sessionId: "ignored" }
  });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "upsertCustomCommand", params: { commandName: "build" } },
    parsedUrl: createSearchParams(),
    body: { scope: "session", sessionId: "session-1" },
    auth: null,
    req: { method: "PUT" },
    requestContext: {},
    requestTraceContext: { traceId: "trc-2" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), {
    statusCode: 200,
    body: { name: "build", scope: "session", sessionId: "session-1" }
  });

  await dispatcher.dispatchResourceRequest({
    match: { kind: "deleteCustomCommand", params: { commandName: "build" } },
    parsedUrl: createSearchParams({ scope: "global" }),
    body: undefined,
    auth: null,
    req: { method: "DELETE" },
    requestContext: {},
    requestTraceContext: { traceId: "trc-2" },
    writeJsonResponse: writer.writeJsonResponse
  });
  assert.deepEqual(writer.calls.shift(), { statusCode: 204, body: undefined });

  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect]), [
    [200, "customCommandList"],
    [200, "customCommand"],
    [200, "customCommand"]
  ]);
  assert.deepEqual(observed, [
    ["list", "session", "  session-1  "],
    ["get", "build", "project", "ignored"],
    ["has", "build", "session", "session-1"],
    ["upsert", "build", "session", "session-1"],
    ["broadcast", "custom-command.created", "build", "trc-2"],
    ["persist", "custom-command.upsert"],
    ["syncCatalog", "trc-2"],
    ["delete", "build", "global", null],
    ["broadcast", "custom-command.deleted", "build", "trc-2"],
    ["persist", "custom-command.delete"],
    ["syncCatalog", "trc-2"]
  ]);
});

test("runtime resource dispatch handles deck routes with persistence and broadcast side effects", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  const dispatcher = createRuntimeResourceDispatch({
    validateResponse: validation.validateResponse,
    parseBooleanQueryParam: (value, fieldName) => {
      observed.push(["parseBoolean", fieldName, value]);
      return value === "true";
    },
    listDecks: (auth) => {
      observed.push(["listDecks", auth.subject]);
      return [{ id: "deck-1" }];
    },
    createDeck: (body) => {
      observed.push(["createDeck", body.name]);
      return { id: "deck-2" };
    },
    getDeckOrThrow: (deckId, auth) => {
      observed.push(["getDeck", deckId, auth.subject]);
      return { id: deckId };
    },
    toApiDeck: (deck) => ({ ...deck, api: true }),
    updateDeck: (deckId, body) => {
      observed.push(["updateDeck", deckId, body.name]);
      return { id: deckId, name: body.name };
    },
    deleteDeck: (deckId, options) => {
      observed.push(["deleteDeck", deckId, options.force]);
      return { deckId, fallbackDeckId: "default", reassignedSessionIds: ["session-1", "session-2"] };
    },
    moveSessionToDeck: (sessionId, deckId) => {
      observed.push(["moveSessionToDeck", sessionId, deckId]);
    },
    persistNow: async (reason) => {
      observed.push(["persist", reason]);
    },
    broadcastSessionUpdated: (sessionId, trace) => {
      observed.push(["sessionUpdated", sessionId, trace.deckId]);
    },
    broadcastDeckUpsert: (eventName, deck, trace) => {
      observed.push(["deckUpsert", eventName, deck.id, trace.traceId]);
    },
    broadcastDeckDeleted: (deckId, fallbackDeckId, trace) => {
      observed.push(["deckDeleted", deckId, fallbackDeckId, trace.traceId]);
    }
  });

  const auth = { subject: "alice" };
  const trace = { traceId: "trc-3" };

  for (const request of [
    { match: { kind: "listDecks", params: {} }, parsedUrl: createSearchParams(), body: undefined },
    { match: { kind: "createDeck", params: {} }, parsedUrl: createSearchParams(), body: { name: "Dev" } },
    { match: { kind: "getDeck", params: { deckId: "deck-1" } }, parsedUrl: createSearchParams(), body: undefined },
    { match: { kind: "updateDeck", params: { deckId: "deck-1" } }, parsedUrl: createSearchParams(), body: { name: "Ops" } },
    { match: { kind: "deleteDeck", params: { deckId: "deck-1" } }, parsedUrl: createSearchParams({ force: "true" }), body: undefined },
    { match: { kind: "moveSessionToDeck", params: { sessionId: "session-9", deckId: "deck-2" } }, parsedUrl: createSearchParams(), body: undefined }
  ]) {
    await dispatcher.dispatchResourceRequest({
      ...request,
      auth,
      req: { method: "POST" },
      requestContext: {},
      requestTraceContext: trace,
      writeJsonResponse: writer.writeJsonResponse
    });
  }

  assert.deepEqual(writer.calls, [
    { statusCode: 200, body: [{ id: "deck-1" }] },
    { statusCode: 201, body: { id: "deck-2" } },
    { statusCode: 200, body: { id: "deck-1", api: true } },
    { statusCode: 200, body: { id: "deck-1", name: "Ops" } },
    { statusCode: 204, body: undefined },
    { statusCode: 204, body: undefined }
  ]);
  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect]), [
    [200, "deckList"],
    [201, "deck"],
    [200, "deck"],
    [200, "deck"]
  ]);
  assert.deepEqual(observed, [
    ["listDecks", "alice"],
    ["createDeck", "Dev"],
    ["persist", "deck.create"],
    ["deckUpsert", "deck.created", "deck-2", "trc-3"],
    ["getDeck", "deck-1", "alice"],
    ["updateDeck", "deck-1", "Ops"],
    ["persist", "deck.update"],
    ["deckUpsert", "deck.updated", "deck-1", "trc-3"],
    ["parseBoolean", "force", "true"],
    ["deleteDeck", "deck-1", true],
    ["persist", "deck.delete"],
    ["sessionUpdated", "session-1", "default"],
    ["sessionUpdated", "session-2", "default"],
    ["deckDeleted", "deck-1", "default", "trc-3"],
    ["moveSessionToDeck", "session-9", "deck-2"],
    ["persist", "deck.move-session"],
    ["sessionUpdated", "session-9", "deck-2"]
  ]);
});

test("runtime resource dispatch handles layout, connection, and workspace profile routes deterministically", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  const dispatcher = createRuntimeResourceDispatch({
    validateResponse: validation.validateResponse,
    listLayoutProfiles: () => [{ id: "layout-1" }],
    createLayoutProfile: (body) => {
      observed.push(["createLayoutProfile", body.name]);
      return { id: "layout-2" };
    },
    getLayoutProfileOrThrow: (id) => ({ id }),
    toApiLayoutProfile: (value) => ({ ...value, api: true }),
    updateLayoutProfile: (id, body) => ({ id, name: body.name }),
    deleteLayoutProfile: (id) => observed.push(["deleteLayoutProfile", id]),
    listConnectionProfiles: () => [{ id: "connection-1" }],
    createConnectionProfile: (body) => ({ id: body.name }),
    getConnectionProfileOrThrow: (id) => ({ id }),
    toApiConnectionProfile: (value) => ({ ...value, api: true }),
    updateConnectionProfile: (id, body) => ({ id, name: body.name }),
    deleteConnectionProfile: (id) => observed.push(["deleteConnectionProfile", id]),
    listWorkspacePresets: () => [{ id: "preset-1" }],
    createWorkspacePreset: (body) => ({ id: body.name }),
    getWorkspacePresetOrThrow: (id) => ({ id }),
    toApiWorkspacePreset: (value) => ({ ...value, api: true }),
    updateWorkspacePreset: (id, body) => ({ id, name: body.name }),
    deleteWorkspacePreset: (id) => observed.push(["deleteWorkspacePreset", id]),
    persistNow: async (reason) => observed.push(["persist", reason])
  });

  const requests = [
    { kind: "listLayoutProfiles", params: {}, expected: { statusCode: 200, body: [{ id: "layout-1" }] } },
    { kind: "createLayoutProfile", params: {}, body: { name: "Layout Two" }, expected: { statusCode: 201, body: { id: "layout-2" } } },
    { kind: "getLayoutProfile", params: { profileId: "layout-1" }, expected: { statusCode: 200, body: { id: "layout-1", api: true } } },
    { kind: "updateLayoutProfile", params: { profileId: "layout-1" }, body: { name: "Layout One" }, expected: { statusCode: 200, body: { id: "layout-1", name: "Layout One" } } },
    { kind: "deleteLayoutProfile", params: { profileId: "layout-1" }, expected: { statusCode: 204, body: undefined } },
    { kind: "listConnectionProfiles", params: {}, expected: { statusCode: 200, body: [{ id: "connection-1" }] } },
    { kind: "createConnectionProfile", params: {}, body: { name: "Conn Two" }, expected: { statusCode: 201, body: { id: "Conn Two" } } },
    { kind: "getConnectionProfile", params: { profileId: "connection-1" }, expected: { statusCode: 200, body: { id: "connection-1", api: true } } },
    { kind: "updateConnectionProfile", params: { profileId: "connection-1" }, body: { name: "Conn One" }, expected: { statusCode: 200, body: { id: "connection-1", name: "Conn One" } } },
    { kind: "deleteConnectionProfile", params: { profileId: "connection-1" }, expected: { statusCode: 204, body: undefined } },
    { kind: "listWorkspacePresets", params: {}, expected: { statusCode: 200, body: [{ id: "preset-1" }] } },
    { kind: "createWorkspacePreset", params: {}, body: { name: "Preset Two" }, expected: { statusCode: 201, body: { id: "Preset Two" } } },
    { kind: "getWorkspacePreset", params: { presetId: "preset-1" }, expected: { statusCode: 200, body: { id: "preset-1", api: true } } },
    { kind: "updateWorkspacePreset", params: { presetId: "preset-1" }, body: { name: "Preset One" }, expected: { statusCode: 200, body: { id: "preset-1", name: "Preset One" } } },
    { kind: "deleteWorkspacePreset", params: { presetId: "preset-1" }, expected: { statusCode: 204, body: undefined } }
  ];

  for (const request of requests) {
    await dispatcher.dispatchResourceRequest({
      match: { kind: request.kind, params: request.params },
      parsedUrl: createSearchParams(),
      body: request.body,
      auth: null,
      req: { method: "POST" },
      requestContext: {},
      requestTraceContext: { traceId: "trc-4" },
      writeJsonResponse: writer.writeJsonResponse
    });
  }

  assert.deepEqual(writer.calls, requests.map((entry) => entry.expected));
  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect]), [
    [200, "layoutProfileList"],
    [201, "layoutProfile"],
    [200, "layoutProfile"],
    [200, "layoutProfile"],
    [200, "connectionProfileList"],
    [201, "connectionProfile"],
    [200, "connectionProfile"],
    [200, "connectionProfile"],
    [200, "workspacePresetList"],
    [201, "workspacePreset"],
    [200, "workspacePreset"],
    [200, "workspacePreset"]
  ]);
  assert.deepEqual(observed, [
    ["createLayoutProfile", "Layout Two"],
    ["persist", "layout-profile.create"],
    ["persist", "layout-profile.update"],
    ["deleteLayoutProfile", "layout-1"],
    ["persist", "layout-profile.delete"],
    ["persist", "connection-profile.create"],
    ["persist", "connection-profile.update"],
    ["deleteConnectionProfile", "connection-1"],
    ["persist", "connection-profile.delete"],
    ["persist", "workspace-preset.create"],
    ["persist", "workspace-preset.update"],
    ["deleteWorkspacePreset", "preset-1"],
    ["persist", "workspace-preset.delete"]
  ]);
});

test("runtime resource dispatch handles ssh trust routes and returns false for unrelated route kinds", async () => {
  const observed = [];
  const validation = createValidateRecorder();
  const writer = createWriter();
  let upsertCalls = 0;
  const dispatcher = createRuntimeResourceDispatch({
    validateResponse: validation.validateResponse,
    listSshTrustEntries: () => [{ id: "trust-1" }],
    upsertSshTrustEntry: (body) => {
      upsertCalls += 1;
      observed.push(["upsert", body.host, upsertCalls]);
      return {
        created: upsertCalls === 1,
        entry: { id: `trust-${upsertCalls}` }
      };
    },
    syncSshKnownHostsFile: async () => {
      observed.push(["syncKnownHosts"]);
    },
    probeSshHostKeysOrThrow: async (body) => {
      observed.push(["probe", body.host]);
      return [{ host: body.host, fingerprintSha256: "abc" }];
    },
    deleteSshTrustEntry: (entryId) => {
      observed.push(["delete", entryId]);
    },
    persistNow: async (reason) => {
      observed.push(["persist", reason]);
    }
  });

  for (const request of [
    { kind: "listSshTrustEntries", params: {}, body: undefined },
    { kind: "createSshTrustEntry", params: {}, body: { host: "host-1" } },
    { kind: "createSshTrustEntry", params: {}, body: { host: "host-1" } },
    { kind: "probeSshHostKeys", params: {}, body: { host: "host-1" } },
    { kind: "deleteSshTrustEntry", params: { entryId: "trust-2" }, body: undefined }
  ]) {
    await dispatcher.dispatchResourceRequest({
      match: { kind: request.kind, params: request.params },
      parsedUrl: createSearchParams(),
      body: request.body,
      auth: null,
      req: { method: "POST" },
      requestContext: {},
      requestTraceContext: { traceId: "trc-5" },
      writeJsonResponse: writer.writeJsonResponse
    });
  }

  assert.equal(
    await dispatcher.dispatchResourceRequest({
      match: { kind: "listSessions", params: {} },
      parsedUrl: createSearchParams(),
      body: undefined,
      auth: null,
      req: { method: "GET" },
      requestContext: {},
      requestTraceContext: { traceId: "trc-5" },
      writeJsonResponse: writer.writeJsonResponse
    }),
    false
  );

  assert.deepEqual(writer.calls, [
    { statusCode: 200, body: [{ id: "trust-1" }] },
    { statusCode: 201, body: { id: "trust-1" } },
    { statusCode: 200, body: { id: "trust-2" } },
    { statusCode: 200, body: [{ host: "host-1", fingerprintSha256: "abc" }] },
    { statusCode: 204, body: undefined }
  ]);
  assert.deepEqual(validation.calls.map((entry) => [entry.statusCode, entry.expect]), [
    [200, "sshTrustEntryList"],
    [201, "sshTrustEntry"],
    [200, "sshTrustEntry"],
    [200, "sshHostKeyProbeCandidateList"]
  ]);
  assert.deepEqual(observed, [
    ["upsert", "host-1", 1],
    ["syncKnownHosts"],
    ["persist", "ssh-trust-entry.create"],
    ["upsert", "host-1", 2],
    ["syncKnownHosts"],
    ["persist", "ssh-trust-entry.reuse"],
    ["probe", "host-1"],
    ["delete", "trust-2"],
    ["syncKnownHosts"],
    ["persist", "ssh-trust-entry.delete"]
  ]);
});
