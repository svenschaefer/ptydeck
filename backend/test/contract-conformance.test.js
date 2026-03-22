import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../src/runtime.js";

function parseOperations(yamlText) {
  const operations = new Map();
  let inPaths = false;
  let currentPath = "";
  let currentMethod = "";

  for (const line of yamlText.split("\n")) {
    if (line.startsWith("paths:")) {
      inPaths = true;
      continue;
    }
    if (!inPaths) {
      continue;
    }
    if (/^\S/.test(line) && !line.startsWith("paths:")) {
      break;
    }

    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = "";
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) {
      currentMethod = methodMatch[1].toUpperCase();
      operations.set(`${currentMethod} ${currentPath}`, new Set());
      continue;
    }

    const responseMatch = line.match(/^        '(\d{3})':/);
    if (responseMatch && currentPath && currentMethod) {
      operations.get(`${currentMethod} ${currentPath}`).add(Number(responseMatch[1]));
    }
  }

  return operations;
}

function runtimeOperationKeys() {
  return new Set([
    "GET /sessions",
    "POST /sessions",
    "GET /sessions/{sessionId}",
    "DELETE /sessions/{sessionId}",
    "POST /sessions/{sessionId}/input",
    "POST /sessions/{sessionId}/resize"
  ]);
}

async function startRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-contract-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    maxBodyBytes: 1024 * 1024
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return { runtime, baseUrl: `http://127.0.0.1:${port}/api/v1` };
}

test("runtime routes and statuses conform to openapi contract", async () => {
  const openapiPath = fileURLToPath(new URL("../openapi/openapi.yaml", import.meta.url));
  const openapiRaw = await readFile(openapiPath, "utf8");
  const operations = parseOperations(openapiRaw);
  const openapiKeys = new Set(operations.keys());

  assert.deepEqual(openapiKeys, runtimeOperationKeys());

  const { runtime, baseUrl } = await startRuntime();
  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.ok(operations.get("POST /sessions").has(createRes.status));

    const createInvalidRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([])
    });
    assert.ok(operations.get("POST /sessions").has(createInvalidRes.status));

    const listRes = await fetch(`${baseUrl}/sessions`);
    assert.ok(operations.get("GET /sessions").has(listRes.status));

    const getMissingRes = await fetch(`${baseUrl}/sessions/missing-id`);
    assert.ok(operations.get("GET /sessions/{sessionId}").has(getMissingRes.status));

    const deleteMissingRes = await fetch(`${baseUrl}/sessions/missing-id`, { method: "DELETE" });
    assert.ok(operations.get("DELETE /sessions/{sessionId}").has(deleteMissingRes.status));

    const inputMissingRes = await fetch(`${baseUrl}/sessions/missing-id/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "echo hi\n" })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/input").has(inputMissingRes.status));

    const resizeMissingRes = await fetch(`${baseUrl}/sessions/missing-id/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cols: 80, rows: 24 })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/resize").has(resizeMissingRes.status));
  } finally {
    await runtime.stop();
  }
});
