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

async function createStartedRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-ws-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*"
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    wsUrl: `ws://127.0.0.1:${port}/ws`
  };
}

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

    ws.close();
    await waitFor(() => ws.readyState === WebSocket.CLOSED);

    const reconnectEvents = [];
    const wsReconnect = new WebSocket(wsUrl);
    wsReconnect.on("message", (buffer) => {
      reconnectEvents.push(JSON.parse(buffer.toString()));
    });

    await waitFor(() => reconnectEvents.some((event) => event.type === "snapshot"));
    wsReconnect.close();
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
    authedWs.close();
  } finally {
    await runtime.stop();
  }
});
