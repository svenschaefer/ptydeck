import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime } from "../src/runtime.js";

async function createStartedRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
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
