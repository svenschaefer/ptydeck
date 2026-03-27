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
    "GET /layout-profiles",
    "POST /layout-profiles",
    "GET /layout-profiles/{profileId}",
    "PATCH /layout-profiles/{profileId}",
    "DELETE /layout-profiles/{profileId}",
    "GET /workspace-presets",
    "POST /workspace-presets",
    "GET /workspace-presets/{presetId}",
    "PATCH /workspace-presets/{presetId}",
    "DELETE /workspace-presets/{presetId}",
    "GET /ssh-trust-entries",
    "POST /ssh-trust-entries",
    "DELETE /ssh-trust-entries/{entryId}",
    "GET /sessions",
    "POST /sessions",
    "GET /sessions/{sessionId}",
    "GET /sessions/{sessionId}/replay-export",
    "PATCH /sessions/{sessionId}",
    "DELETE /sessions/{sessionId}",
    "POST /sessions/{sessionId}/input",
    "POST /sessions/{sessionId}/resize",
    "POST /sessions/{sessionId}/restart",
    "POST /sessions/{sessionId}/interrupt",
    "POST /sessions/{sessionId}/terminate",
    "POST /sessions/{sessionId}/kill"
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

async function contractFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("connection", "close");
  return fetch(url, {
    ...options,
    headers
  });
}

test("runtime routes and statuses conform to openapi contract", async () => {
  const openapiPath = fileURLToPath(new URL("../openapi/openapi.yaml", import.meta.url));
  const openapiRaw = await readFile(openapiPath, "utf8");
  const operations = parseOperations(openapiRaw);
  const openapiKeys = new Set(operations.keys());

  assert.deepEqual(openapiKeys, runtimeOperationKeys());

  const { runtime, baseUrl } = await startRuntime();
  try {
    const tokenRes = await contractFetch(`${baseUrl}/auth/dev-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.ok(operations.get("POST /auth/dev-token").has(tokenRes.status));
    const tokenPayload = await tokenRes.json();
    const authHeaders = { authorization: `Bearer ${tokenPayload.accessToken}`, "content-type": "application/json" };

    const wsTicketRes = await contractFetch(`${baseUrl}/auth/ws-ticket`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({})
    });
    const wsTicketText = await wsTicketRes.text();
    assert.ok(
      operations.get("POST /auth/ws-ticket").has(wsTicketRes.status),
      `unexpected ws-ticket status ${wsTicketRes.status}: ${wsTicketText}`
    );

    const createRes = await contractFetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({})
    });
    assert.ok(operations.get("POST /sessions").has(createRes.status));
    const createdSession = await createRes.json();

    const createInvalidRes = await contractFetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify([])
    });
    assert.ok(operations.get("POST /sessions").has(createInvalidRes.status));

    const listRes = await contractFetch(`${baseUrl}/sessions`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /sessions").has(listRes.status));

    const replayExportRes = await contractFetch(`${baseUrl}/sessions/${createdSession.id}/replay-export`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /sessions/{sessionId}/replay-export").has(replayExportRes.status));

    const listCustomCommandsRes = await contractFetch(`${baseUrl}/custom-commands`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /custom-commands").has(listCustomCommandsRes.status));

    const listDecksRes = await contractFetch(`${baseUrl}/decks`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /decks").has(listDecksRes.status));

    const createDeckRes = await contractFetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ id: "ops", name: "Ops" })
    });
    assert.ok(operations.get("POST /decks").has(createDeckRes.status));

    const getDeckRes = await contractFetch(`${baseUrl}/decks/ops`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /decks/{deckId}").has(getDeckRes.status));

    const patchDeckRes = await contractFetch(`${baseUrl}/decks/ops`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "Operations" })
    });
    assert.ok(operations.get("PATCH /decks/{deckId}").has(patchDeckRes.status));

    const putCustomCommandRes = await contractFetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ content: "echo DOCU\\n" })
    });
    assert.ok(operations.get("PUT /custom-commands/{commandName}").has(putCustomCommandRes.status));

    const getCustomCommandRes = await contractFetch(`${baseUrl}/custom-commands/docu`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /custom-commands/{commandName}").has(getCustomCommandRes.status));

    const deleteCustomCommandRes = await contractFetch(`${baseUrl}/custom-commands/docu`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /custom-commands/{commandName}").has(deleteCustomCommandRes.status));

    const listLayoutProfilesRes = await contractFetch(`${baseUrl}/layout-profiles`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /layout-profiles").has(listLayoutProfilesRes.status));

    const createLayoutProfileRes = await contractFetch(`${baseUrl}/layout-profiles`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Focus Layout",
        layout: {
          activeDeckId: "default",
          sidebarVisible: true,
          sessionFilterText: "",
          deckTerminalSettings: {
            default: { cols: 100, rows: 30 }
          }
        }
      })
    });
    assert.ok(operations.get("POST /layout-profiles").has(createLayoutProfileRes.status));
    const createdLayoutProfile = await createLayoutProfileRes.json();

    const getLayoutProfileRes = await contractFetch(`${baseUrl}/layout-profiles/${createdLayoutProfile.id}`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /layout-profiles/{profileId}").has(getLayoutProfileRes.status));

    const patchLayoutProfileRes = await contractFetch(`${baseUrl}/layout-profiles/${createdLayoutProfile.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "Focus Layout Updated" })
    });
    assert.ok(operations.get("PATCH /layout-profiles/{profileId}").has(patchLayoutProfileRes.status));

    const listWorkspacePresetsRes = await contractFetch(`${baseUrl}/workspace-presets`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /workspace-presets").has(listWorkspacePresetsRes.status));

    const createWorkspacePresetRes = await contractFetch(`${baseUrl}/workspace-presets`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Ops Workspace",
        workspace: {
          activeDeckId: "default",
          layoutProfileId: createdLayoutProfile.id,
          deckGroups: {}
        }
      })
    });
    assert.ok(operations.get("POST /workspace-presets").has(createWorkspacePresetRes.status));
    const createdWorkspacePreset = await createWorkspacePresetRes.json();

    const getWorkspacePresetRes = await contractFetch(`${baseUrl}/workspace-presets/${createdWorkspacePreset.id}`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /workspace-presets/{presetId}").has(getWorkspacePresetRes.status));

    const patchWorkspacePresetRes = await contractFetch(`${baseUrl}/workspace-presets/${createdWorkspacePreset.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Ops Workspace Updated",
        workspace: {
          activeDeckId: "default",
          layoutProfileId: createdLayoutProfile.id,
          deckGroups: {}
        }
      })
    });
    assert.ok(operations.get("PATCH /workspace-presets/{presetId}").has(patchWorkspacePresetRes.status));

    const deleteWorkspacePresetRes = await contractFetch(`${baseUrl}/workspace-presets/${createdWorkspacePreset.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /workspace-presets/{presetId}").has(deleteWorkspacePresetRes.status));

    const listSshTrustEntriesRes = await contractFetch(`${baseUrl}/ssh-trust-entries`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /ssh-trust-entries").has(listSshTrustEntriesRes.status));

    const createSshTrustEntryRes = await contractFetch(`${baseUrl}/ssh-trust-entries`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        host: "example.internal",
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      })
    });
    assert.ok(operations.get("POST /ssh-trust-entries").has(createSshTrustEntryRes.status));
    const createdSshTrustEntry = await createSshTrustEntryRes.json();

    const deleteSshTrustEntryRes = await contractFetch(`${baseUrl}/ssh-trust-entries/${createdSshTrustEntry.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /ssh-trust-entries/{entryId}").has(deleteSshTrustEntryRes.status));

    const deleteLayoutProfileRes = await contractFetch(`${baseUrl}/layout-profiles/${createdLayoutProfile.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /layout-profiles/{profileId}").has(deleteLayoutProfileRes.status));

    const getMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id`, {
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("GET /sessions/{sessionId}").has(getMissingRes.status));

    const patchMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "renamed" })
    });
    assert.ok(operations.get("PATCH /sessions/{sessionId}").has(patchMissingRes.status));

    const deleteMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /sessions/{sessionId}").has(deleteMissingRes.status));

    const inputMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/input`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ data: "echo hi\n" })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/input").has(inputMissingRes.status));

    const resizeMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/resize`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ cols: 80, rows: 24 })
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/resize").has(resizeMissingRes.status));

    const restartMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/restart`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/restart").has(restartMissingRes.status));

    const interruptMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/interrupt`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/interrupt").has(interruptMissingRes.status));

    const terminateMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/terminate`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/terminate").has(terminateMissingRes.status));

    const killMissingRes = await contractFetch(`${baseUrl}/sessions/missing-id/kill`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /sessions/{sessionId}/kill").has(killMissingRes.status));

    const moveMissingSessionRes = await contractFetch(`${baseUrl}/decks/ops/sessions/missing-id:move`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("POST /decks/{deckId}/sessions/{sessionId}:move").has(moveMissingSessionRes.status));

    const deleteDeckRes = await contractFetch(`${baseUrl}/decks/ops`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenPayload.accessToken}` }
    });
    assert.ok(operations.get("DELETE /decks/{deckId}").has(deleteDeckRes.status));
  } finally {
    await runtime.stop();
  }
});
