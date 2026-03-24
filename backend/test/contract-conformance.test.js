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

    const pathMatch = line.match(/^  (\/.+):\s*$/);
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
    "POST /auth/dev-token",
    "POST /auth/ws-ticket",
    "GET /custom-commands",
    "GET /custom-commands/{commandName}",
    "PUT /custom-commands/{commandName}",
    "DELETE /custom-commands/{commandName}",
    "GET /decks",
    "POST /decks",
    "GET /decks/{deckId}",
    "PATCH /decks/{deckId}",
    "DELETE /decks/{deckId}",
    "POST /decks/{deckId}/sessions/{sessionId}:move",
    "GET /sessions",
    "POST /sessions",
    "GET /sessions/{sessionId}",
    "PATCH /sessions/{sessionId}",
    "DELETE /sessions/{sessionId}",
    "POST /sessions/{sessionId}/input",
    "POST /sessions/{sessionId}/resize",
    "POST /sessions/{sessionId}/restart"
  ]);
}

async function startRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-contract-"));
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
    authDevTokenTtlSeconds: 900,
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
    const tokenRes = await fetch(`${baseUrl}/auth/dev-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.ok(operations.get("POST /auth/dev-token").has(tokenRes.status));
    const tokenPayload = await tokenRes.json();
    const authHeaders = { authorization: `Bearer ${tokenPayload.accessToken}`, "content-type": "application/json" };

    const wsTicketRes = await fetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({})
    });
    const wsTicketText = await wsTicketRes.text();
    assert.ok(
      operations.get("POST /auth/ws-ticket").has(wsTicketRes.status),
      `unexpected ws-ticket status ${wsTicketRes.status}: ${wsTicketText}`
    );

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({})
    });
    assert.ok(operations.get("POST /sessions").has(createRes.status));

    const createInvalidRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify([])
    });
    assert.ok(operations.get("POST /sessions").has(createInvalidRes.status));

    const listRes = await fetch(`${baseUrl}/sessions`, { headers: { authorization: `Bearer ${tokenPayload.accessToken}` } });
    assert.ok(operations.get("GET /sessions").has(listRes.status));

    const listCustomCommandsRes = await fetch(`${baseUrl}/custom-commands`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /custom-commands").has(listCustomCommandsRes.status));

    const listDecksRes = await fetch(`${baseUrl}/decks`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /decks").has(listDecksRes.status));

    const createDeckRes = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ id: "ops", name: "Ops" })
    });
    assert.ok(operations.get("POST /decks").has(createDeckRes.status));

    const getDeckRes = await fetch(`${baseUrl}/decks/ops`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /decks/{deckId}").has(getDeckRes.status));

    const patchDeckRes = await fetch(`${baseUrl}/decks/ops`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "Operations" })
    });
    assert.ok(operations.get("PATCH /decks/{deckId}").has(patchDeckRes.status));

    const putCustomCommandRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ content: "echo DOCU\\n" })
    });
    assert.ok(operations.get("PUT /custom-commands/{commandName}").has(putCustomCommandRes.status));

    const getCustomCommandRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /custom-commands/{commandName}").has(getCustomCommandRes.status));

    const deleteCustomCommandRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /custom-commands/{commandName}").has(deleteCustomCommandRes.status));

    const getMissingRes = await fetch(`${baseUrl}/sessions/missing-id`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /sessions/{sessionId}").has(getMissingRes.status));

    const patchMissingRes = await fetch(`${baseUrl}/sessions/missing-id`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "renamed" })
    });
    assert.ok(operations.get("PATCH /sessions/{sessionId}").has(patchMissingRes.status));

    const deleteMissingRes = await fetch(`${baseUrl}/sessions/missing-id`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /sessions/{sessionId}").has(deleteMissingRes.status));

    const inputMissingRes = await fetch(`${baseUrl}/sessions/missing-id/input`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ data: "echo hi\n" })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/input").has(inputMissingRes.status));

    const resizeMissingRes = await fetch(`${baseUrl}/sessions/missing-id/resize`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ cols: 80, rows: 24 })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/resize").has(resizeMissingRes.status));

    const restartMissingRes = await fetch(`${baseUrl}/sessions/missing-id/restart`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/restart").has(restartMissingRes.status));

    const moveMissingSessionRes = await fetch(`${baseUrl}/decks/ops/sessions/missing-id:move`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /decks/{deckId}/sessions/{sessionId}:move").has(moveMissingSessionRes.status));

    const deleteDeckRes = await fetch(`${baseUrl}/decks/ops`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /decks/{deckId}").has(deleteDeckRes.status));
  } finally {
    await runtime.stop();
  }
});
