import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createRuntime } from "../src/runtime.js";

const SESSION_BATCH_SIZE = Number(process.env.LOAD_SESSION_BATCH_SIZE || 12);
const INPUT_BATCH_SIZE = Number(process.env.LOAD_INPUT_BATCH_SIZE || 4);
const WS_CLIENT_COUNT = Number(process.env.LOAD_WS_CLIENT_COUNT || 8);
const FANOUT_SESSION_COUNT = Number(process.env.LOAD_FANOUT_SESSION_COUNT || 6);
const WAIT_TIMEOUT_MS = Number(process.env.LOAD_WAIT_TIMEOUT_MS || 5000);

const CREATE_P95_THRESHOLD_MS = Number(process.env.LOAD_CREATE_P95_MAX_MS || 400);
const INPUT_P95_THRESHOLD_MS = Number(process.env.LOAD_INPUT_P95_MAX_MS || 250);
const DELETE_P95_THRESHOLD_MS = Number(process.env.LOAD_DELETE_P95_MAX_MS || 300);

function percentile(values, fraction) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function measureMs(startNs) {
  const deltaNs = process.hrtime.bigint() - startNs;
  return Number(deltaNs / 1000000n);
}

function waitFor(predicate, timeoutMs = WAIT_TIMEOUT_MS) {
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
        reject(new Error("timeout waiting for load-test condition"));
      }
    }, 20);
  });
}

async function createStartedRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-load-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    rateLimitWindowMs: 60000,
    rateLimitRestCreateMax: 1000,
    rateLimitWsConnectMax: 1000
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    wsUrl: `ws://127.0.0.1:${port}/ws`
  };
}

async function createSession(baseUrl) {
  const startedNs = process.hrtime.bigint();
  const response = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shell: "sh" })
  });
  const durationMs = measureMs(startedNs);
  if (response.status !== 201) {
    throw new Error(`session create failed: status=${response.status}`);
  }
  const session = await response.json();
  return { session, durationMs };
}

async function postInput(baseUrl, sessionId, data) {
  const startedNs = process.hrtime.bigint();
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data })
  });
  const durationMs = measureMs(startedNs);
  if (response.status !== 204) {
    throw new Error(`session input failed: status=${response.status}`);
  }
  return durationMs;
}

async function deleteSession(baseUrl, sessionId) {
  const startedNs = process.hrtime.bigint();
  const response = await fetch(`${baseUrl}/sessions/${sessionId}`, {
    method: "DELETE"
  });
  const durationMs = measureMs(startedNs);
  if (response.status !== 204) {
    throw new Error(`session delete failed: status=${response.status}`);
  }
  return durationMs;
}

function connectWsClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(wsUrl);
    const state = {
      createdIds: new Set(),
      closedIds: new Set(),
      errored: false
    };
    client.on("message", (buffer) => {
      const event = JSON.parse(buffer.toString());
      if (event.type === "session.created" && event.session?.id) {
        state.createdIds.add(event.session.id);
      }
      if (event.type === "session.closed" && event.sessionId) {
        state.closedIds.add(event.sessionId);
      }
    });
    client.once("open", () => resolve({ client, state }));
    client.on("error", (error) => {
      state.errored = true;
      reject(error);
    });
    client.on("close", () => {
      state.errored = true;
    });
  });
}

test("non-functional load baseline: concurrent session lifecycle and WS fanout stability", async () => {
  const { runtime, baseUrl, wsUrl } = await createStartedRuntime();
  const wsConnections = [];
  const createdSessions = [];

  try {
    const connected = await Promise.all(
      Array.from({ length: WS_CLIENT_COUNT }, () => connectWsClient(wsUrl))
    );
    wsConnections.push(...connected);

    const createResults = await Promise.all(
      Array.from({ length: SESSION_BATCH_SIZE }, () => createSession(baseUrl))
    );
    for (const result of createResults) {
      createdSessions.push(result.session.id);
    }
    const createP95 = percentile(
      createResults.map((entry) => entry.durationMs),
      0.95
    );
    assert.ok(
      createP95 <= CREATE_P95_THRESHOLD_MS,
      `create p95 ${createP95}ms exceeded threshold ${CREATE_P95_THRESHOLD_MS}ms`
    );

    const inputDurations = [];
    await Promise.all(
      createdSessions.flatMap((sessionId, sessionIndex) =>
        Array.from({ length: INPUT_BATCH_SIZE }, (_, inputIndex) =>
          postInput(
            baseUrl,
            sessionId,
            `echo LOAD_${sessionIndex}_${inputIndex}\n`
          ).then((durationMs) => inputDurations.push(durationMs))
        )
      )
    );
    const inputP95 = percentile(inputDurations, 0.95);
    assert.ok(
      inputP95 <= INPUT_P95_THRESHOLD_MS,
      `input p95 ${inputP95}ms exceeded threshold ${INPUT_P95_THRESHOLD_MS}ms`
    );

    const fanoutCreateResults = [];
    for (let i = 0; i < FANOUT_SESSION_COUNT; i += 1) {
      const result = await createSession(baseUrl);
      fanoutCreateResults.push(result);
      createdSessions.push(result.session.id);
    }
    const fanoutIds = new Set(fanoutCreateResults.map((entry) => entry.session.id));

    await waitFor(() =>
      wsConnections.every(({ state }) => [...fanoutIds].every((id) => state.createdIds.has(id)))
    );

    const deleteDurations = [];
    await Promise.all(
      createdSessions.map((sessionId) =>
        deleteSession(baseUrl, sessionId).then((durationMs) => deleteDurations.push(durationMs))
      )
    );
    const deleteP95 = percentile(deleteDurations, 0.95);
    assert.ok(
      deleteP95 <= DELETE_P95_THRESHOLD_MS,
      `delete p95 ${deleteP95}ms exceeded threshold ${DELETE_P95_THRESHOLD_MS}ms`
    );

    await waitFor(() =>
      wsConnections.every(({ state }) => [...fanoutIds].every((id) => state.closedIds.has(id)))
    );

    assert.ok(
      wsConnections.every(({ state }) => state.errored === false),
      "websocket fanout clients must remain stable without error/close during scenario"
    );
  } finally {
    await Promise.all(
      wsConnections.map(
        ({ client }) =>
          new Promise((resolve) => {
            if (client.readyState === WebSocket.CLOSED) {
              resolve();
              return;
            }
            client.once("close", () => resolve());
            client.close();
          })
      )
    );
    await runtime.stop();
  }
});
