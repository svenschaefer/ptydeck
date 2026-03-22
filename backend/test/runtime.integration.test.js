import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime } from "../src/runtime.js";

async function createStartedRuntime(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    ...overrides
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${port}/api/v1`
  };
}

test("REST lifecycle endpoints work end-to-end", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(typeof created.id, "string");

    const listRes = await fetch(`${baseUrl}/sessions`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.ok(listed.some((session) => session.id === created.id));

    const getRes = await fetch(`${baseUrl}/sessions/${created.id}`);
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(typeof getPayload.cwd, "string");
    assert.ok(getPayload.cwd.length > 0);

    const patchRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "main-shell" })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.name, "main-shell");

    const inputRes = await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo REST_OK\n" })
    });
    assert.equal(inputRes.status, 204);

    const resizeRes = await fetch(`${baseUrl}/sessions/${created.id}/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cols: 120, rows: 40 })
    });
    assert.equal(resizeRes.status, 204);

    const restartRes = await fetch(`${baseUrl}/sessions/${created.id}/restart`, {
      method: "POST"
    });
    assert.equal(restartRes.status, 200);
    const restarted = await restartRes.json();
    assert.equal(restarted.id, created.id);

    const deleteRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteRes.status, 204);
  } finally {
    await runtime.stop();
  }
});

test("REST negative routes return expected error responses", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const invalidJsonRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalidJsonRes.status, 400);
    const invalidJsonBody = await invalidJsonRes.json();
    assert.equal(invalidJsonBody.error, "InvalidJson");

    const unknownRouteRes = await fetch(`${baseUrl}/missing-route`);
    assert.equal(unknownRouteRes.status, 404);
    const unknownRouteBody = await unknownRouteRes.json();
    assert.equal(unknownRouteBody.error, "NotFound");

    const invalidResizeRes = await fetch(`${baseUrl}/sessions/unknown/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cols: 0, rows: -1 })
    });
    assert.equal(invalidResizeRes.status, 400);
    const invalidResizeBody = await invalidResizeRes.json();
    assert.equal(invalidResizeBody.error, "ValidationError");

    const unknownInputRes = await fetch(`${baseUrl}/sessions/unknown/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo hi\n" })
    });
    assert.equal(unknownInputRes.status, 404);
    const unknownInputBody = await unknownInputRes.json();
    assert.equal(unknownInputBody.error, "SessionNotFound");

    const unknownResizeRes = await fetch(`${baseUrl}/sessions/unknown/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cols: 80, rows: 24 })
    });
    assert.equal(unknownResizeRes.status, 404);
    const unknownResizeBody = await unknownResizeRes.json();
    assert.equal(unknownResizeBody.error, "SessionNotFound");

    const unknownDeleteRes = await fetch(`${baseUrl}/sessions/unknown`, {
      method: "DELETE"
    });
    assert.equal(unknownDeleteRes.status, 404);
    const unknownDeleteBody = await unknownDeleteRes.json();
    assert.equal(unknownDeleteBody.error, "SessionNotFound");

    const invalidPatchRes = await fetch(`${baseUrl}/sessions/unknown`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 123 })
    });
    assert.equal(invalidPatchRes.status, 400);
    const invalidPatchBody = await invalidPatchRes.json();
    assert.equal(invalidPatchBody.error, "ValidationError");

    const unknownRestartRes = await fetch(`${baseUrl}/sessions/unknown/restart`, {
      method: "POST"
    });
    assert.equal(unknownRestartRes.status, 404);
    const unknownRestartBody = await unknownRestartRes.json();
    assert.equal(unknownRestartBody.error, "SessionNotFound");
  } finally {
    await runtime.stop();
  }
});

test("REST rejects oversized request body with 413", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({ maxBodyBytes: 32 });

  try {
    const oversizeRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", cwd: "/tmp", data: "x".repeat(512) })
    });

    assert.equal(oversizeRes.status, 413);
    const oversizeBody = await oversizeRes.json();
    assert.equal(oversizeBody.error, "PayloadTooLarge");
  } finally {
    await runtime.stop();
  }
});

test("REST create session is rate limited per client", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    rateLimitWindowMs: 60000,
    rateLimitRestCreateMax: 1
  });

  try {
    const firstRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(firstRes.status, 201);

    const secondRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(secondRes.status, 429);
    const secondBody = await secondRes.json();
    assert.equal(secondBody.error, "RateLimitExceeded");
  } finally {
    await runtime.stop();
  }
});

test("OPTIONS advertises PATCH for CORS preflight", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();
  try {
    const res = await fetch(`${baseUrl}/sessions/test-id`, {
      method: "OPTIONS"
    });
    assert.equal(res.status, 204);
    const allowMethods = res.headers.get("access-control-allow-methods") || "";
    assert.ok(allowMethods.includes("PATCH"));
  } finally {
    await runtime.stop();
  }
});

test("CORS allowlist echoes allowed origin and omits disallowed origin", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    corsOrigin: "https://app.example.com",
    corsAllowedOrigins: ["https://app.example.com"]
  });
  try {
    const allowedRes = await fetch(`${baseUrl}/sessions`, {
      headers: { origin: "https://app.example.com" }
    });
    assert.equal(allowedRes.status, 200);
    assert.equal(allowedRes.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.equal(allowedRes.headers.get("vary"), "origin");

    const blockedRes = await fetch(`${baseUrl}/sessions`, {
      headers: { origin: "https://evil.example.com" }
    });
    assert.equal(blockedRes.status, 200);
    assert.equal(blockedRes.headers.get("access-control-allow-origin"), null);
    assert.equal(blockedRes.headers.get("vary"), "origin");
  } finally {
    await runtime.stop();
  }
});

test("HTTP responses include hardened security headers", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const healthRes = await fetch(`http://${new URL(baseUrl).host}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get("x-content-type-options"), "nosniff");
    assert.equal(healthRes.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      healthRes.headers.get("content-security-policy"),
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );

    const metricsRes = await fetch(`http://${new URL(baseUrl).host}/metrics`);
    assert.equal(metricsRes.status, 200);
    assert.equal(metricsRes.headers.get("x-content-type-options"), "nosniff");
    assert.equal(metricsRes.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      metricsRes.headers.get("content-security-policy"),
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
  } finally {
    await runtime.stop();
  }
});

test("auth dev mode issues token and protects session routes", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    authEnabled: true,
    authDevMode: true,
    authDevSecret: "test-secret",
    authIssuer: "test-issuer",
    authAudience: "test-audience",
    authDevTokenTtlSeconds: 900
  });

  try {
    const unauthorizedRes = await fetch(`${baseUrl}/sessions`);
    assert.equal(unauthorizedRes.status, 401);
    const unauthorizedBody = await unauthorizedRes.json();
    assert.equal(unauthorizedBody.error, "Unauthorized");

    const tokenRes = await fetch(`${baseUrl}/auth/dev-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scopes: ["sessions:read", "ws:connect"] })
    });
    assert.equal(tokenRes.status, 200);
    const tokenPayload = await tokenRes.json();
    assert.equal(typeof tokenPayload.accessToken, "string");

    const listRes = await fetch(`${baseUrl}/sessions`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.equal(listRes.status, 200);

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenPayload.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });
    assert.equal(createRes.status, 403);
    const createBody = await createRes.json();
    assert.equal(createBody.error, "Forbidden");
  } finally {
    await runtime.stop();
  }
});

test("metrics endpoint exposes request counters and active session gauge", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(createRes.status, 201);

    const metricsRes = await fetch(`http://${new URL(baseUrl).host}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.text();

    assert.match(metrics, /# TYPE ptydeck_http_requests_total counter/);
    assert.match(metrics, /ptydeck_http_requests_total \d+/);
    assert.match(metrics, /# TYPE ptydeck_sessions_active gauge/);
    assert.match(metrics, /ptydeck_sessions_active 1/);
    assert.match(metrics, /ptydeck_http_requests_by_route_total\{method="POST",route="\/api\/v1\/sessions"\} \d+/);
  } finally {
    await runtime.stop();
  }
});

test("runtime restore keeps persisted createdAt and updatedAt timestamps", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024
  });

  let createdId = "";
  let createdAt = 0;
  let updatedAt = 0;

  try {
    await runtimeA.start();
    const { port } = runtimeA.getAddress();
    const baseUrlA = `http://127.0.0.1:${port}/api/v1`;

    const createRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdId = created.id;
    createdAt = created.createdAt;

    const inputRes = await fetch(`${baseUrlA}/sessions/${createdId}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo timestamp\n" })
    });
    assert.equal(inputRes.status, 204);

    const sessionRes = await fetch(`${baseUrlA}/sessions/${createdId}`);
    assert.equal(sessionRes.status, 200);
    const afterInput = await sessionRes.json();
    updatedAt = afterInput.updatedAt;
    assert.equal(afterInput.createdAt, createdAt);
  } finally {
    await runtimeA.stop();
  }

  const persisted = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSession = persisted.find((session) => session.id === createdId);
  assert.ok(persistedSession);
  assert.equal(persistedSession.createdAt, createdAt);
  assert.equal(persistedSession.updatedAt, updatedAt);

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024
  });

  try {
    await runtimeB.start();
    const { port } = runtimeB.getAddress();
    const baseUrlB = `http://127.0.0.1:${port}/api/v1`;
    const restoredRes = await fetch(`${baseUrlB}/sessions/${createdId}`);
    assert.equal(restoredRes.status, 200);
    const restored = await restoredRes.json();
    assert.equal(restored.createdAt, createdAt);
    assert.equal(restored.updatedAt, updatedAt);
  } finally {
    await runtimeB.stop();
  }
});

test("ready endpoint returns starting before startup gate and ready after release", async () => {
  let releaseReadyGate = null;
  const readyGate = new Promise((resolve) => {
    releaseReadyGate = resolve;
  });

  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    onBeforeReady: async () => {
      await readyGate;
    }
  });

  const startPromise = runtime.start();
  while (!runtime.getAddress()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const { port } = runtime.getAddress();
  const readyBefore = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyBefore.status, 200);
  assert.deepEqual(await readyBefore.json(), { status: "starting" });

  releaseReadyGate();
  await startPromise;

  const readyAfter = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyAfter.status, 200);
  assert.deepEqual(await readyAfter.json(), { status: "ready" });

  await runtime.stop();
});

test("runtime stop is idempotent", async () => {
  const { runtime } = await createStartedRuntime();
  await runtime.stop();
  await runtime.stop();
});
