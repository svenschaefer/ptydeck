import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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
