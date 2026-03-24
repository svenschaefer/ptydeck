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
  assert.equal(typeof session?.state, "string");
  assert.ok(session.state === "starting" || session.state === "running" || session.state === "unrestored");
  assert.equal(typeof session?.cwd, "string");
  assert.equal(typeof session?.shell, "string");
  assert.ok(Array.isArray(session?.tags));
  assert.ok(session?.activityState === "active" || session?.activityState === "inactive");
  assert.equal(typeof session?.activityUpdatedAt, "number");
  assert.equal(typeof session?.createdAt, "number");
  assert.equal(typeof session?.updatedAt, "number");
}

function assertCustomCommandShape(command) {
  assert.equal(typeof command?.name, "string");
  assert.equal(typeof command?.content, "string");
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

    await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo WS_OK\n" })
    });

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

    authedWs.close();
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
