import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    ...overrides
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    wsUrl: `ws://127.0.0.1:${port}/ws`
  };
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
    assert.equal(createdEvent.session.deckId, "default");

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
    const reconnectSession = reconnectSnapshot.sessions.find((session) => session.id === created.id);
    assert.ok(reconnectSession);
    assert.equal(reconnectSession.deckId, "default");
    assert.ok(Array.isArray(reconnectSnapshot.customCommands));
    assert.equal(reconnectSnapshot.customCommands.length, 1);
    assert.equal(reconnectSnapshot.customCommands[0].name, "docu");

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

    const events = [];
    const authedWs = new WebSocket(`${wsUrl}?access_token=${encodeURIComponent(tokenPayload.accessToken)}`);
    authedWs.on("message", (buffer) => {
      events.push(JSON.parse(buffer.toString()));
    });
    await waitFor(() => events.some((event) => event.type === "snapshot"));

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
