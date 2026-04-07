import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";
import { createRuntime } from "../src/runtime.js";

function waitFor(predicate, timeoutMs = 4000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("timeout waiting for condition"));
      }
    }, 20);
  });
}

async function createStartedRuntime(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-ws-"));
  const dataPath = join(dir, "sessions.json");
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    ...overrides
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    dataPath,
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    wsUrl: `ws://127.0.0.1:${port}/ws`
  };
}

function createEchoPtyFactory() {
  return () => {
    let exitHandler = null;
    let dataHandler = null;
    return {
      onExit(handler) {
        exitHandler = handler;
      },
      onData(handler) {
        dataHandler = handler;
      },
      write(data) {
        if (dataHandler) {
          dataHandler(String(data));
        }
      },
      resize() {},
      kill() {
        if (exitHandler) {
          exitHandler({ exitCode: 0, signal: 0 });
        }
      }
    };
  };
}

async function issueDevToken(baseUrl, input = undefined) {
  const body =
    Array.isArray(input)
      ? { scopes: input }
      : input && typeof input === "object"
        ? input
        : {};
  const tokenRes = await fetch(`${baseUrl}/auth/dev-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(tokenRes.status, 200);
  const tokenPayload = await tokenRes.json();
  assert.equal(typeof tokenPayload.accessToken, "string");
  return tokenPayload.accessToken;
}

function createAuthHeaders(accessToken, { json = false } = {}) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(json ? { "content-type": "application/json" } : {})
  };
}

function extractShareToken(joinUrl) {
  const token = new URL(joinUrl).searchParams.get("share_token");
  assert.equal(typeof token, "string");
  assert.ok(token);
  return token;
}

function assertDeckShape(deck) {
  assert.equal(typeof deck?.id, "string");
  assert.equal(typeof deck?.name, "string");
  assert.ok(deck?.settings && typeof deck.settings === "object");
  assert.equal(typeof deck?.createdAt, "number");
  assert.equal(typeof deck?.updatedAt, "number");
}

function assertApiSessionShape(session) {
  assert.equal(typeof session?.id, "string");
  assert.equal(typeof session?.deckId, "string");
  assert.equal(typeof session?.quickIdToken, "string");
  assert.equal(typeof session?.state, "string");
  assert.ok(session.state === "starting" || session.state === "running" || session.state === "unrestored");
  assert.equal(typeof session?.cwd, "string");
  assert.equal(typeof session?.shell, "string");
  assert.ok(session?.note === undefined || typeof session.note === "string");
  assert.ok(session?.inputSafetyProfile && typeof session.inputSafetyProfile === "object");
  assert.equal(typeof session.inputSafetyProfile.confirmOnAnyInput, "boolean");
  assert.equal(typeof session.inputSafetyProfile.requireValidShellSyntax, "boolean");
  assert.equal(typeof session.inputSafetyProfile.targetSwitchGraceMs, "number");
  assert.ok(Array.isArray(session?.tags));
  assert.ok(session?.controlState && typeof session.controlState === "object");
  assert.equal(typeof session.controlState.owner?.subject, "string");
  assert.equal(typeof session.controlState.owner?.tenantId, "string");
  assert.equal(typeof session.controlState.owner?.accessMode, "string");
  assert.equal(typeof session.controlState.owner?.permissionMode, "string");
  assert.ok(session.controlState.controllerClientId === null || typeof session.controlState.controllerClientId === "string");
  assert.ok(session.controlState.controllerChangedAt === null || typeof session.controlState.controllerChangedAt === "number");
  assert.ok(session.controlState.currentController === null || typeof session.controlState.currentController.clientId === "string");
  assert.ok(session.controlState.lastInput === null || typeof session.controlState.lastInput.at === "number");
  assert.ok(Array.isArray(session.controlState.attachedClients));
  assert.ok(session?.activityState === "active" || session?.activityState === "inactive");
  assert.equal(typeof session?.activityUpdatedAt, "number");
  assert.equal(typeof session?.createdAt, "number");
  assert.equal(typeof session?.updatedAt, "number");
}

function assertCustomCommandShape(command) {
  assert.equal(typeof command?.name, "string");
  assert.equal(typeof command?.content, "string");
  assert.ok(command?.scope === "global" || command?.scope === "project" || command?.scope === "session");
  assert.ok(command?.sessionId === null || command?.sessionId === undefined || typeof command?.sessionId === "string");
  assert.equal(typeof command?.precedence, "number");
  assert.equal(typeof command?.createdAt, "number");
  assert.equal(typeof command?.updatedAt, "number");
}

test("WS connection creation is rate limited per client", async () => {
  const { runtime, wsUrl } = await createStartedRuntime({
    rateLimitWindowMs: 60000,
    rateLimitWsConnectMax: 1
  });

  try {
    const firstEvents = [];
    const firstWs = new WebSocket(wsUrl);
    firstWs.on("message", (buffer) => {
      firstEvents.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => firstEvents.some((event) => event.type === "snapshot"));

    const secondEvents = [];
    const secondWs = new WebSocket(wsUrl);
    secondWs.on("error", () => {
      secondEvents.push("error");
    });
    secondWs.on("close", () => {
      secondEvents.push("close");
    });
    await waitFor(() => secondEvents.includes("close"));

    firstWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS emits session events and reconnect receives snapshot", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime();
  const events = [];

  try {
    const ws = new WebSocket(wsUrl);
    ws.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => events.some((event) => event.type === "snapshot"));
    const snapshot = events.find((event) => event.type === "snapshot");
    assert.equal(typeof snapshot?.clientId, "string");

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    const created = await createRes.json();

    await waitFor(() =>
      events.some((event) => event.type === "session.created" && event.session.id === created.id)
    );
    const createdEvent = events.find((event) => event.type === "session.created" && event.session.id === created.id);
    assertApiSessionShape(createdEvent.session);
    assert.equal(createdEvent.session.state, "starting");
    assert.equal(createdEvent.session.deckId, "default");
    await waitFor(() =>
      events.some((event) => event.type === "session.started" && event.session.id === created.id)
    );
    const startedEvent = events.find((event) => event.type === "session.started" && event.session.id === created.id);
    assertApiSessionShape(startedEvent.session);
    assert.equal(startedEvent.session.state, "running");
    assert.equal(typeof startedEvent.startedAt, "number");
    assert.equal(typeof startedEvent.updatedAt, "number");

    const inputRes = await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ptydeck-client-id": snapshot.clientId
      },
      body: JSON.stringify({ data: "echo WS_OK\n" })
    });
    assert.equal(inputRes.status, 204);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.data" &&
          event.sessionId === created.id &&
          typeof event.data === "string" &&
          event.data.includes("WS_OK")
      )
    );

    const customCreateRes = await fetch(`${baseUrl}/custom-commands/Docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo WS_CUSTOM_A\n" })
    });
    assert.equal(customCreateRes.status, 200);
    await waitFor(() =>
      events.some(
        (event) => event.type === "custom-command.created" && event.command && event.command.name === "docu"
      )
    );

    const customUpdateRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo WS_CUSTOM_B\n" })
    });
    assert.equal(customUpdateRes.status, 200);
    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "custom-command.updated" &&
          event.command &&
          event.command.name === "docu" &&
          event.command.content === "echo WS_CUSTOM_B\n"
      )
    );

    ws.close();
    await waitFor(() => ws.readyState === WebSocket.CLOSED);

    const reconnectEvents = [];
    const wsReconnect = new WebSocket(wsUrl);
    wsReconnect.on("message", (buffer) => {
      reconnectEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() => reconnectEvents.some((event) => event.type === "snapshot"));
    const reconnectSnapshot = reconnectEvents.find((event) => event.type === "snapshot");
    assert.ok(Array.isArray(reconnectSnapshot.sessions));
    assert.ok(Array.isArray(reconnectSnapshot.outputs));
    assert.ok(Array.isArray(reconnectSnapshot.decks));
    assert.ok(Array.isArray(reconnectSnapshot.customCommands));
    const reconnectSession = reconnectSnapshot.sessions.find((session) => session.id === created.id);
    assert.ok(reconnectSession);
    assertApiSessionShape(reconnectSession);
    assert.equal(reconnectSession.deckId, "default");
    assert.equal(reconnectSnapshot.customCommands.length, 1);
    assertCustomCommandShape(reconnectSnapshot.customCommands[0]);
    assert.equal(reconnectSnapshot.customCommands[0].name, "docu");
    assertDeckShape(reconnectSnapshot.decks.find((deck) => deck.id === "default"));
    const reconnectMetricsRes = await fetch(`http://${new URL(baseUrl).host}/metrics`);
    assert.equal(reconnectMetricsRes.status, 200);
    const reconnectMetrics = await reconnectMetricsRes.text();
    assert.match(reconnectMetrics, /ptydeck_ws_reconnects_total [1-9]\d*/);
    assert.match(reconnectMetrics, /ptydeck_ws_reconnects_by_reason_total\{reason="[^"]+"\} [1-9]\d*/);
    assert.match(reconnectMetrics, /ptydeck_ws_disconnects_by_reason_total\{reason="[^"]+"\} [1-9]\d*/);

    const customDeleteRes = await fetch(`${baseUrl}/custom-commands/DoCu`, {
      method: "DELETE"
    });
    assert.equal(customDeleteRes.status, 204);
    await waitFor(() =>
      reconnectEvents.some(
        (event) => event.type === "custom-command.deleted" && event.command && event.command.name === "docu"
      )
    );

    wsReconnect.close();
  } finally {
    await runtime.stop();
  }
});

test("WS snapshot and session events preserve trace and correlation continuity", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime();
  const events = [];

  try {
    const ws = new WebSocket(wsUrl);
    ws.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() => events.some((event) => event.type === "snapshot"));
    const snapshot = events.find((event) => event.type === "snapshot");
    assert.equal(typeof snapshot?.clientId, "string");
    assert.equal(typeof snapshot.trace?.traceId, "string");
    assert.equal(typeof snapshot.trace?.correlationId, "string");
    assert.equal(snapshot.trace?.source, "ws");
    assert.equal(typeof snapshot.trace?.connectionId, "string");

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ptydeck-correlation-id": "corr-create-session"
      },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    const createTraceId = createRes.headers.get("x-ptydeck-trace-id") || "";
    assert.match(createTraceId, /^req-/);

    await waitFor(() =>
      events.some((event) => event.type === "session.created" && event.session?.id === created.id)
    );
    const createdEvent = events.find((event) => event.type === "session.created" && event.session?.id === created.id);
    assert.equal(createdEvent.trace?.correlationId, "corr-create-session");
    assert.equal(createdEvent.trace?.parentTraceId, createTraceId);
    assert.equal(createdEvent.trace?.sessionId, created.id);

    const inputRes = await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ptydeck-correlation-id": "corr-session-input",
        "x-ptydeck-client-id": snapshot.clientId
      },
      body: JSON.stringify({ data: "echo TRACE_OK\n" })
    });
    assert.equal(inputRes.status, 204);
    const inputTraceId = inputRes.headers.get("x-ptydeck-trace-id") || "";
    assert.match(inputTraceId, /^req-/);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.data" &&
          event.sessionId === created.id &&
          typeof event.data === "string" &&
          event.data.includes("TRACE_OK")
      )
    );
    const dataEvent = events.find(
      (event) =>
        event.type === "session.data" &&
        event.sessionId === created.id &&
        typeof event.data === "string" &&
        event.data.includes("TRACE_OK")
    );
    assert.equal(dataEvent.trace?.correlationId, "corr-session-input");
    assert.equal(dataEvent.trace?.parentTraceId, inputTraceId);
    assert.equal(dataEvent.trace?.sessionId, created.id);

    ws.close();
  } finally {
    await runtime.stop();
  }
});

test("WS emits authoritative deck and session metadata events", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime();
  const events = [];

  try {
    const ws = new WebSocket(wsUrl);
    ws.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => events.some((event) => event.type === "snapshot"));

    const snapshot = events.find((event) => event.type === "snapshot");
    assert.ok(Array.isArray(snapshot.decks));
    assert.ok(snapshot.decks.some((deck) => deck.id === "default"));
    assertDeckShape(snapshot.decks.find((deck) => deck.id === "default"));

    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();

    await waitFor(() =>
      events.some((event) => event.type === "session.created" && event.session && event.session.id === createdSession.id)
    );

    const createDeckRes = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ops", name: "Ops", settings: { terminal: { cols: 91, rows: 33 } } })
    });
    assert.equal(createDeckRes.status, 201);
    const createdDeck = await createDeckRes.json();

    await waitFor(() =>
      events.some((event) => event.type === "deck.created" && event.deck && event.deck.id === createdDeck.id)
    );
    const createdDeckEvent = events.find((event) => event.type === "deck.created" && event.deck && event.deck.id === createdDeck.id);
    assertDeckShape(createdDeckEvent.deck);

    const patchDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Operations" })
    });
    assert.equal(patchDeckRes.status, 200);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "deck.updated" && event.deck && event.deck.id === createdDeck.id && event.deck.name === "Operations"
      )
    );
    const updatedDeckEvent = events.find(
      (event) => event.type === "deck.updated" && event.deck && event.deck.id === createdDeck.id && event.deck.name === "Operations"
    );
    assertDeckShape(updatedDeckEvent.deck);

    const patchSessionRes = await fetch(`${baseUrl}/sessions/${createdSession.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "alpha", tags: ["ops"] })
    });
    assert.equal(patchSessionRes.status, 200);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.updated" &&
          event.session &&
          event.session.id === createdSession.id &&
          event.session.name === "alpha" &&
          Array.isArray(event.session.tags) &&
          event.session.tags.includes("ops")
      )
    );
    const updatedSessionEvent = events.find(
      (event) =>
        event.type === "session.updated" &&
        event.session &&
        event.session.id === createdSession.id &&
        event.session.name === "alpha"
    );
    assertApiSessionShape(updatedSessionEvent.session);

    const moveRes = await fetch(`${baseUrl}/decks/${createdDeck.id}/sessions/${createdSession.id}:move`, {
      method: "POST"
    });
    assert.equal(moveRes.status, 204);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.updated" &&
          event.session &&
          event.session.id === createdSession.id &&
          event.session.deckId === createdDeck.id
      )
    );

    const deleteDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}?force=true`, {
      method: "DELETE"
    });
    assert.equal(deleteDeckRes.status, 204);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.updated" &&
          event.session &&
          event.session.id === createdSession.id &&
          event.session.deckId === "default"
      )
    );
    await waitFor(() =>
      events.some(
        (event) => event.type === "deck.deleted" && event.deckId === createdDeck.id && event.fallbackDeckId === "default"
      )
    );

    ws.close();
  } finally {
    await runtime.stop();
  }
});

test("WS emits persisted activity completion events after quiet transition", async () => {
  const { runtime, baseUrl, wsUrl, dataPath } = await createStartedRuntime({
    sessionActivityQuietMs: 10
  });
  const events = [];

  try {
    const ws = new WebSocket(wsUrl);
    ws.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => events.some((event) => event.type === "snapshot"));

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo NOTIFY_DONE\n" })
    });

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.activity.completed" &&
          event.sessionId === created.id &&
          event.session?.activityState === "inactive"
      )
    );

    const completionEvent = events.find(
      (event) => event.type === "session.activity.completed" && event.sessionId === created.id
    );
    assertApiSessionShape(completionEvent.session);
    assert.equal(completionEvent.session.activityState, "inactive");
    assert.equal(typeof completionEvent.activityCompletedAt, "number");

    const persisted = JSON.parse(await readFile(dataPath, "utf8"));
    const persistedSession = persisted.sessions.find((session) => session.id === created.id);
    assert.equal(persistedSession.activityState, "inactive");
    assert.equal(persistedSession.activityCompletedAt, completionEvent.activityCompletedAt);

    ws.close();
  } finally {
    await runtime.stop();
  }
});

test("WS custom-command lifecycle events are broadcast to multiple connected clients", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime();
  const firstEvents = [];
  const secondEvents = [];

  try {
    const firstWs = new WebSocket(wsUrl);
    firstWs.on("message", (buffer) => {
      firstEvents.push(JSON.parse(buffer.toString()));
    });
    const secondWs = new WebSocket(wsUrl);
    secondWs.on("message", (buffer) => {
      secondEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() => firstEvents.some((event) => event.type === "snapshot"));
    await waitFor(() => secondEvents.some((event) => event.type === "snapshot"));

    const createRes = await fetch(`${baseUrl}/custom-commands/SyncCmd`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo SYNC_A\n" })
    });
    assert.equal(createRes.status, 200);
    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "custom-command.created" &&
          event.command &&
          event.command.name === "synccmd" &&
          event.command.content === "echo SYNC_A\n"
      )
    );
    await waitFor(() =>
      secondEvents.some(
        (event) =>
          event.type === "custom-command.created" &&
          event.command &&
          event.command.name === "synccmd" &&
          event.command.content === "echo SYNC_A\n"
      )
    );

    const updateRes = await fetch(`${baseUrl}/custom-commands/synccmd`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo SYNC_B\n" })
    });
    assert.equal(updateRes.status, 200);
    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "custom-command.updated" &&
          event.command &&
          event.command.name === "synccmd" &&
          event.command.content === "echo SYNC_B\n"
      )
    );
    await waitFor(() =>
      secondEvents.some(
        (event) =>
          event.type === "custom-command.updated" &&
          event.command &&
          event.command.name === "synccmd" &&
          event.command.content === "echo SYNC_B\n"
      )
    );

    const deleteRes = await fetch(`${baseUrl}/custom-commands/SYNCCMD`, {
      method: "DELETE"
    });
    assert.equal(deleteRes.status, 204);
    await waitFor(() =>
      firstEvents.some(
        (event) => event.type === "custom-command.deleted" && event.command && event.command.name === "synccmd"
      )
    );
    await waitFor(() =>
      secondEvents.some(
        (event) => event.type === "custom-command.deleted" && event.command && event.command.name === "synccmd"
      )
    );

    firstWs.close();
    secondWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS auth rejects missing token and accepts valid dev token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-ws-auth-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    authMode: "dev",
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const unauthEvents = [];
    const unauthWs = new WebSocket(wsUrl);
    unauthWs.on("error", () => {
      unauthEvents.push("error");
    });
    unauthWs.on("close", () => {
      unauthEvents.push("close");
    });
    await waitFor(() => unauthEvents.includes("close"));

    const tokenRes = await fetch(`${baseUrl}/auth/dev-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(tokenRes.status, 200);
    const tokenPayload = await tokenRes.json();

    const legacyQueryEvents = [];
    const legacyQueryWs = new WebSocket(`${wsUrl}?access_token=${encodeURIComponent(tokenPayload.accessToken)}`);
    legacyQueryWs.on("error", () => {
      legacyQueryEvents.push("error");
    });
    legacyQueryWs.on("close", () => {
      legacyQueryEvents.push("close");
    });
    await waitFor(() => legacyQueryEvents.includes("close"));

    const wsTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenPayload.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });
    assert.equal(wsTicketRes.status, 200);
    const wsTicketPayload = await wsTicketRes.json();

    const events = [];
    const authedWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${wsTicketPayload.ticket}`]);
    authedWs.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => events.some((event) => event.type === "snapshot"));

    const reusedEvents = [];
    const reusedWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${wsTicketPayload.ticket}`]);
    reusedWs.on("error", () => {
      reusedEvents.push("error");
    });
    reusedWs.on("close", () => {
      reusedEvents.push("close");
    });
    await waitFor(() => reusedEvents.includes("close"));

    const metricsRes = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.match(metricsText, /ptydeck_ws_connections_active 1/);
    assert.match(metricsText, /ptydeck_ws_errors_total [1-9]\d*/);
    assert.match(metricsText, /ptydeck_ws_errors_by_reason_total\{reason="upgrade_auth_rejected"\} [1-9]\d*/);

    authedWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS operator clients keep stable trusted-local control identity across reconnect and stale expiry", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime({
    createPty: createEchoPtyFactory(),
    authMode: "dev",
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900,
    sessionControlStaleClientTtlMs: 120
  });

  try {
    const operatorToken = await issueDevToken(baseUrl);
    const operatorJsonHeaders = createAuthHeaders(operatorToken, { json: true });
    const firstStableClientId = "trusted-device-1";
    const secondStableClientId = "trusted-device-2";
    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ name: "controlled-shell" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();

    const firstTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ clientId: firstStableClientId, label: "Desk Browser" })
    });
    assert.equal(firstTicketRes.status, 200);
    const firstTicket = await firstTicketRes.json();

    const firstEvents = [];
    const firstWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${firstTicket.ticket}`]);
    firstWs.on("message", (buffer) => {
      firstEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "snapshot" &&
          event.sessions.some((session) => session.id === createdSession.id && session.controlState.currentController)
      )
    );

    const firstSnapshot = firstEvents.find((event) => event.type === "snapshot");
    assert.equal(typeof firstSnapshot.clientId, "string");
    assert.equal(firstSnapshot.clientId, firstStableClientId);
    const firstSnapshotSession = firstSnapshot.sessions.find((session) => session.id === createdSession.id);
    assert.equal(firstSnapshotSession.controlState.owner.subject, "dev-user");
    assert.equal(firstSnapshotSession.controlState.attachedClients.length, 1);
    assert.equal(firstSnapshotSession.controlState.currentController.role, "controller");
    const firstControllerClientId = firstSnapshotSession.controlState.currentController.clientId;
    assert.equal(firstSnapshot.clientId, firstControllerClientId);
    assert.equal(firstSnapshotSession.controlState.currentController.label, "Desk Browser");
    assert.equal(firstSnapshotSession.controlState.currentController.active, true);
    assert.equal(firstSnapshotSession.controlState.currentController.activeConnectionCount, 1);

    const secondTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ clientId: secondStableClientId, label: "Laptop Browser" })
    });
    assert.equal(secondTicketRes.status, 200);
    const secondTicket = await secondTicketRes.json();

    const secondEvents = [];
    const secondWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${secondTicket.ticket}`]);
    secondWs.on("message", (buffer) => {
      secondEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.attachedClients.length === 2
      )
    );

    const secondAttachUpdate = firstEvents
      .filter((event) => event.type === "session.updated" && event.session?.id === createdSession.id)
      .at(-1);
    assert.equal(secondAttachUpdate.session.controlState.currentController.clientId, firstControllerClientId);
    assert.deepEqual(
      secondAttachUpdate.session.controlState.attachedClients.map((entry) => entry.role).sort(),
      ["controller", "owner"]
    );
    assert.deepEqual(
      secondAttachUpdate.session.controlState.attachedClients.map((entry) => entry.clientId).sort(),
      [firstStableClientId, secondStableClientId]
    );

    const inputRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/input`, {
      method: "POST",
      headers: {
        ...createAuthHeaders(operatorToken, { json: true }),
        "x-ptydeck-client-id": firstControllerClientId
      },
      body: JSON.stringify({ data: "CONTROLLED\n" })
    });
    assert.equal(inputRes.status, 204);

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.lastInput?.clientId === firstControllerClientId
      )
    );

    firstWs.close();

    await waitFor(() =>
      secondEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.currentController &&
          event.session.controlState.currentController.clientId === firstControllerClientId &&
          event.session.controlState.currentController.active === false
      )
    );

    const reservedUpdate = secondEvents
      .filter((event) => event.type === "session.updated" && event.session?.id === createdSession.id)
      .at(-1);
    assert.equal(reservedUpdate.session.controlState.attachedClients.length, 2);
    assert.equal(reservedUpdate.session.controlState.currentController.role, "controller");
    assert.equal(reservedUpdate.session.controlState.currentController.label, "Desk Browser");
    assert.equal(reservedUpdate.session.controlState.currentController.activeConnectionCount, 0);
    assert.equal(reservedUpdate.session.controlState.lastInput.clientId, firstControllerClientId);

    const reclaimTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ clientId: firstStableClientId, label: "Desk Browser" })
    });
    assert.equal(reclaimTicketRes.status, 200);
    const reclaimTicket = await reclaimTicketRes.json();

    const reclaimEvents = [];
    const reclaimWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${reclaimTicket.ticket}`]);
    reclaimWs.on("message", (buffer) => {
      reclaimEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      reclaimEvents.some(
        (event) =>
          event.type === "snapshot" &&
          event.clientId === firstStableClientId &&
          event.sessions.some(
            (session) =>
              session.id === createdSession.id &&
              session.controlState.currentController?.clientId === firstStableClientId &&
              session.controlState.currentController?.active === true
          )
      )
    );

    reclaimWs.close();

    await waitFor(() =>
      secondEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.attachedClients.length === 1 &&
          event.session.controlState.currentController?.clientId === secondStableClientId
      )
    );

    const reassignedUpdate = secondEvents
      .filter((event) => event.type === "session.updated" && event.session?.id === createdSession.id)
      .at(-1);
    assert.equal(reassignedUpdate.session.controlState.attachedClients.length, 1);
    assert.equal(reassignedUpdate.session.controlState.currentController.role, "controller");
    assert.equal(reassignedUpdate.session.controlState.currentController.clientId, secondStableClientId);
    assert.equal(reassignedUpdate.session.controlState.lastInput.clientId, firstControllerClientId);

    secondWs.close();
  } finally {
    await runtime.stop();
  }
});

test("session control endpoints allow deterministic takeover without prior release and support scope claims", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime({
    createPty: createEchoPtyFactory(),
    authMode: "dev",
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900
  });

  try {
    const ownerToken = await issueDevToken(baseUrl, { subject: "owner-user" });
    const peerToken = await issueDevToken(baseUrl, { subject: "peer-user" });
    const ownerJsonHeaders = createAuthHeaders(ownerToken, { json: true });
    const peerJsonHeaders = createAuthHeaders(peerToken, { json: true });
    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: ownerJsonHeaders,
      body: JSON.stringify({ name: "exclusive-shell" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();
    const secondSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: ownerJsonHeaders,
      body: JSON.stringify({ name: "exclusive-shell-2" })
    });
    assert.equal(secondSessionRes.status, 201);
    const secondSession = await secondSessionRes.json();

    const ownerTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: ownerJsonHeaders,
      body: JSON.stringify({})
    });
    assert.equal(ownerTicketRes.status, 200);
    const ownerTicket = await ownerTicketRes.json();

    const ownerEvents = [];
    const ownerWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${ownerTicket.ticket}`]);
    ownerWs.on("message", (buffer) => {
      ownerEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      ownerEvents.some(
        (event) =>
          event.type === "snapshot" &&
          event.sessions.some((session) => session.id === createdSession.id && session.controlState.currentController)
      )
    );

    const ownerSnapshot = ownerEvents.find((event) => event.type === "snapshot");
    const ownerSession = ownerSnapshot.sessions.find((session) => session.id === createdSession.id);
    const ownerClientId = ownerSnapshot.clientId;
    assert.equal(ownerSession.controlState.currentController.clientId, ownerClientId);

    const peerTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: peerJsonHeaders,
      body: JSON.stringify({})
    });
    assert.equal(peerTicketRes.status, 200);
    const peerTicket = await peerTicketRes.json();

    const peerEvents = [];
    const peerWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${peerTicket.ticket}`]);
    peerWs.on("message", (buffer) => {
      peerEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      ownerEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.attachedClients.length === 2
      )
    );
    await waitFor(() =>
      ownerEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === secondSession.id &&
          event.session.controlState.attachedClients.length === 2
      )
    );

    const peerSnapshot = peerEvents.find((event) => event.type === "snapshot");
    assert.equal(typeof peerSnapshot?.clientId, "string");
    const peerClientId = peerSnapshot.clientId;

    const deniedInputRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/input`, {
      method: "POST",
      headers: {
        ...peerJsonHeaders,
        "x-ptydeck-client-id": peerClientId
      },
      body: JSON.stringify({ data: "PEER_INPUT\n" })
    });
    assert.equal(deniedInputRes.status, 403);

    const deniedResizeRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/resize`, {
      method: "POST",
      headers: {
        ...peerJsonHeaders,
        "x-ptydeck-client-id": peerClientId
      },
      body: JSON.stringify({ cols: 100, rows: 30 })
    });
    assert.equal(deniedResizeRes.status, 403);

    const peerTakeRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/control/take`, {
      method: "POST",
      headers: {
        ...peerJsonHeaders,
        "x-ptydeck-client-id": peerClientId
      },
      body: "{}"
    });
    assert.equal(peerTakeRes.status, 200);
    const peerControlledSession = await peerTakeRes.json();
    assert.equal(peerControlledSession.controlState.currentController.clientId, peerClientId);

    const scopeTakeRes = await fetch(`${baseUrl}/session-control/take`, {
      method: "POST",
      headers: {
        ...peerJsonHeaders,
        "x-ptydeck-client-id": peerClientId
      },
      body: JSON.stringify({ scope: "all" })
    });
    assert.equal(scopeTakeRes.status, 200);
    const scopeTakePayload = await scopeTakeRes.json();
    assert.equal(scopeTakePayload.scope, "all");
    assert.equal(scopeTakePayload.controllerClientId, peerClientId);
    assert.deepEqual(
      scopeTakePayload.updatedSessions.map((session) => session.id).sort(),
      [createdSession.id, secondSession.id].sort()
    );
    assert.ok(
      scopeTakePayload.updatedSessions.every(
        (session) => session.controlState.currentController?.clientId === peerClientId
      )
    );

    const ownerDeniedAfterTakeRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/input`, {
      method: "POST",
      headers: {
        ...ownerJsonHeaders,
        "x-ptydeck-client-id": ownerClientId
      },
      body: JSON.stringify({ data: "OWNER_INPUT\n" })
    });
    assert.equal(ownerDeniedAfterTakeRes.status, 403);

    const transferRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/control/transfer`, {
      method: "POST",
      headers: {
        ...peerJsonHeaders,
        "x-ptydeck-client-id": peerClientId
      },
      body: JSON.stringify({ clientId: ownerClientId })
    });
    assert.equal(transferRes.status, 200);
    const transferredSession = await transferRes.json();
    assert.equal(transferredSession.controlState.currentController.clientId, ownerClientId);

    await waitFor(() =>
      ownerEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.currentController?.clientId === ownerClientId
      )
    );
    await waitFor(() =>
      ownerEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === secondSession.id &&
          event.session.controlState.currentController?.clientId === peerClientId
      )
    );

    ownerWs.close();
    peerWs.close();
  } finally {
    await runtime.stop();
  }
});

test("trusted-local device rename and stale-device forget endpoints update session control metadata", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime({
    createPty: createEchoPtyFactory(),
    authMode: "dev",
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900
  });

  try {
    const operatorToken = await issueDevToken(baseUrl, { subject: "trusted-local-user" });
    const operatorJsonHeaders = createAuthHeaders(operatorToken, { json: true });
    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ name: "trusted-local-shell" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();

    const firstTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ clientId: "device-1", label: "Desk Browser" })
    });
    assert.equal(firstTicketRes.status, 200);
    const firstTicket = await firstTicketRes.json();

    const firstEvents = [];
    const firstWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${firstTicket.ticket}`]);
    firstWs.on("message", (buffer) => {
      firstEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "snapshot" &&
          event.sessions.some((session) => session.id === createdSession.id)
      )
    );

    const secondTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ clientId: "device-2", label: "Tablet" })
    });
    assert.equal(secondTicketRes.status, 200);
    const secondTicket = await secondTicketRes.json();

    const secondWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${secondTicket.ticket}`]);
    secondWs.on("message", () => {});

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.attachedClients.length === 2
      )
    );

    const renameRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/control/rename-client`, {
      method: "POST",
      headers: {
        ...operatorJsonHeaders,
        "x-ptydeck-client-id": "device-1"
      },
      body: JSON.stringify({ label: "Desk Left" })
    });
    assert.equal(renameRes.status, 200);
    const renamedSession = await renameRes.json();
    assert.equal(
      renamedSession.controlState.attachedClients.find((entry) => entry.clientId === "device-1")?.label,
      "Desk Left"
    );

    secondWs.close();
    await waitFor(() => secondWs.readyState === WebSocket.CLOSED);

    await waitFor(() =>
      firstEvents.some(
        (event) =>
          event.type === "session.updated" &&
          event.session?.id === createdSession.id &&
          event.session.controlState.attachedClients.some(
            (entry) => entry.clientId === "device-2" && entry.active === false
          )
      )
    );

    const forgetRes = await fetch(`${baseUrl}/sessions/${createdSession.id}/control/forget-client`, {
      method: "POST",
      headers: {
        ...operatorJsonHeaders,
        "x-ptydeck-client-id": "device-1"
      },
      body: JSON.stringify({ clientId: "device-2" })
    });
    assert.equal(forgetRes.status, 200);
    const forgottenSession = await forgetRes.json();
    assert.equal(
      forgottenSession.controlState.attachedClients.some((entry) => entry.clientId === "device-2"),
      false
    );

    firstWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS spectator shares receive filtered snapshot and session events", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime({
    createPty: createEchoPtyFactory(),
    authMode: "dev",
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900
  });

  try {
    const operatorToken = await issueDevToken(baseUrl);
    const operatorJsonHeaders = createAuthHeaders(operatorToken, { json: true });

    const createDeckRes = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ id: "ops", name: "Ops" })
    });
    assert.equal(createDeckRes.status, 201);

    const createSharedSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ name: "shared-session" })
    });
    assert.equal(createSharedSessionRes.status, 201);
    const sharedSession = await createSharedSessionRes.json();

    const createHiddenSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ name: "hidden-session" })
    });
    assert.equal(createHiddenSessionRes.status, 201);
    const hiddenSession = await createHiddenSessionRes.json();

    const moveSharedRes = await fetch(`${baseUrl}/decks/ops/sessions/${sharedSession.id}:move`, {
      method: "POST",
      headers: createAuthHeaders(operatorToken)
    });
    assert.equal(moveSharedRes.status, 204);

    const createCustomCommandRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ content: "echo DOCU\n" })
    });
    assert.equal(createCustomCommandRes.status, 200);

    const sharedInputRes = await fetch(`${baseUrl}/sessions/${sharedSession.id}/input`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ data: "SHARED-SNAPSHOT\n" })
    });
    assert.equal(sharedInputRes.status, 204);

    const hiddenInputRes = await fetch(`${baseUrl}/sessions/${hiddenSession.id}/input`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ data: "HIDDEN-SNAPSHOT\n" })
    });
    assert.equal(hiddenInputRes.status, 204);

    const createShareRes = await fetch(`${baseUrl}/shares`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({
        targetType: "deck",
        targetId: "ops",
        expiresInSeconds: 3600
      })
    });
    assert.equal(createShareRes.status, 201);
    const createdShare = await createShareRes.json();
    const spectatorToken = extractShareToken(createdShare.joinUrl);

    const wsTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: createAuthHeaders(spectatorToken, { json: true }),
      body: JSON.stringify({})
    });
    assert.equal(wsTicketRes.status, 200);
    const wsTicketPayload = await wsTicketRes.json();

    const events = [];
    const spectatorWs = new WebSocket(wsUrl, ["ptydeck.v1", `ptydeck.auth.${wsTicketPayload.ticket}`]);
    spectatorWs.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() => events.some((event) => event.type === "snapshot"));
    const snapshot = events.find((event) => event.type === "snapshot");
    assert.deepEqual(snapshot.sessions.map((session) => session.id), [sharedSession.id]);
    assert.deepEqual(snapshot.decks.map((deck) => deck.id), ["ops"]);
    assert.deepEqual(snapshot.customCommands, []);
    assert.ok(snapshot.outputs.every((entry) => entry.sessionId === sharedSession.id));
    assert.ok(snapshot.outputs.some((entry) => typeof entry.data === "string" && entry.data.includes("SHARED-SNAPSHOT")));
    assert.ok(snapshot.outputs.every((entry) => !String(entry.data || "").includes("HIDDEN-SNAPSHOT")));

    const sharedFollowupRes = await fetch(`${baseUrl}/sessions/${sharedSession.id}/input`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ data: "SHARED-LIVE\n" })
    });
    assert.equal(sharedFollowupRes.status, 204);

    const hiddenFollowupRes = await fetch(`${baseUrl}/sessions/${hiddenSession.id}/input`, {
      method: "POST",
      headers: operatorJsonHeaders,
      body: JSON.stringify({ data: "HIDDEN-LIVE\n" })
    });
    assert.equal(hiddenFollowupRes.status, 204);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "session.data" &&
          event.sessionId === sharedSession.id &&
          typeof event.data === "string" &&
          event.data.includes("SHARED-LIVE")
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      events.some(
        (event) =>
          event.type === "session.data" &&
          event.sessionId === hiddenSession.id &&
          typeof event.data === "string" &&
          event.data.includes("HIDDEN-LIVE")
      ),
      false
    );
    assert.equal(events.some((event) => String(event.type || "").startsWith("custom-command.")), false);

    spectatorWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS TLS ingress enforcement rejects non-HTTPS and accepts trusted forwarded HTTPS", async () => {
  const { runtime, wsUrl } = await createStartedRuntime({
    enforceTlsIngress: true,
    trustedProxy: { mode: "all", ips: [] },
    corsOrigin: "https://app.example.com",
    corsAllowedOrigins: ["https://app.example.com"]
  });

  try {
    const rejectedEvents = [];
    const rejectedWs = new WebSocket(wsUrl);
    rejectedWs.on("error", () => {
      rejectedEvents.push("error");
    });
    rejectedWs.on("close", () => {
      rejectedEvents.push("close");
    });
    await waitFor(() => rejectedEvents.includes("close"));

    const acceptedEvents = [];
    const acceptedWs = new WebSocket(wsUrl, {
      origin: "https://app.example.com",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "api.example.com"
      }
    });
    acceptedWs.on("message", (buffer) => {
      acceptedEvents.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => acceptedEvents.some((event) => event.type === "snapshot"));
    acceptedWs.close();
  } finally {
    await runtime.stop();
  }
});

test("WS origin allowlist rejects missing or disallowed origin and accepts allowed origin", async () => {
  const { runtime, wsUrl, baseUrl } = await createStartedRuntime({
    corsOrigin: "https://app.example.com",
    corsAllowedOrigins: ["https://app.example.com"]
  });

  try {
    const missingOriginEvents = [];
    const missingOriginWs = new WebSocket(wsUrl);
    missingOriginWs.on("error", () => {
      missingOriginEvents.push("error");
    });
    missingOriginWs.on("close", () => {
      missingOriginEvents.push("close");
    });
    await waitFor(() => missingOriginEvents.includes("close"));

    const disallowedOriginEvents = [];
    const disallowedOriginWs = new WebSocket(wsUrl, {
      origin: "https://evil.example.com"
    });
    disallowedOriginWs.on("error", () => {
      disallowedOriginEvents.push("error");
    });
    disallowedOriginWs.on("close", () => {
      disallowedOriginEvents.push("close");
    });
    await waitFor(() => disallowedOriginEvents.includes("close"));

    const allowedEvents = [];
    const allowedWs = new WebSocket(wsUrl, {
      origin: "https://app.example.com"
    });
    allowedWs.on("message", (buffer) => {
      allowedEvents.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => allowedEvents.some((event) => event.type === "snapshot"));

    const metricsRes = await fetch(`http://${new URL(baseUrl).host}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.match(metricsText, /ptydeck_ws_errors_by_reason_total\{reason="upgrade_origin_rejected"\} [1-9]\d*/);

    allowedWs.close();
  } finally {
    await runtime.stop();
  }
});
