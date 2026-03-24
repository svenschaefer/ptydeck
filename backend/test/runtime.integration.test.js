import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createRuntime } from "../src/runtime.js";

function createFallbackAwarePtyFactory() {
  return ({ shell, cwd }) => {
    if (typeof shell === "string" && shell.startsWith("/definitely/not/")) {
      throw new Error(`ENOENT: shell ${shell}`);
    }
    if (typeof cwd === "string" && cwd.startsWith("/definitely/not/")) {
      throw new Error(`ENOENT: cwd ${cwd}`);
    }

    let exitHandler = null;
    let dataHandler = null;
    return {
      onExit(handler) {
        exitHandler = handler;
      },
      onData(handler) {
        dataHandler = handler;
      },
      write(data) {
        if (dataHandler) {
          dataHandler(String(data));
        }
      },
      resize() {},
      kill() {
        if (exitHandler) {
          exitHandler({ exitCode: 0, signal: 0 });
        }
      }
    };
  };
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    assert.equal(created.state, "running");

    const listRes = await fetch(`${baseUrl}/sessions`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.ok(listed.some((session) => session.id === created.id));
    assert.ok(listed.some((session) => session.id === created.id && session.state === "running"));

    const getRes = await fetch(`${baseUrl}/sessions/${created.id}`);
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(typeof getPayload.cwd, "string");
    assert.ok(getPayload.cwd.length > 0);
    assert.equal(getPayload.state, "running");

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
    assert.equal(restarted.state, "running");

    const deleteRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteRes.status, 204);
  } finally {
    await runtime.stop();
  }
});

test("session startup settings persist through patch and apply on restart", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shell: "sh",
        name: "ops-shell",
        startCwd: "/tmp",
        startCommand: "echo BOOT",
        env: { APP_MODE: "dev" },
        tags: ["ops", "Prod", "ops"],
        themeProfile: {
          background: "#111111",
          foreground: "#eeeeee",
          cursor: "#ffcc00",
          black: "#000000",
          red: "#ff0000",
          green: "#00ff00",
          yellow: "#ffff00",
          blue: "#0000ff",
          magenta: "#ff00ff",
          cyan: "#00ffff",
          white: "#ffffff",
          brightBlack: "#222222",
          brightRed: "#ff6666",
          brightGreen: "#66ff66",
          brightYellow: "#ffff66",
          brightBlue: "#6666ff",
          brightMagenta: "#ff66ff",
          brightCyan: "#66ffff",
          brightWhite: "#fefefe"
        }
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.state, "running");
    assert.equal(created.startCwd, "/tmp");
    assert.equal(created.startCommand, "echo BOOT");
    assert.deepEqual(created.env, { APP_MODE: "dev" });
    assert.deepEqual(created.tags, ["ops", "prod"]);
    assert.equal(created.themeProfile.background, "#111111");
    assert.equal(created.themeProfile.brightWhite, "#fefefe");

    const patchRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startCwd: "/var/tmp",
        startCommand: "echo RESTART",
        env: { APP_MODE: "prod", FEATURE_X: "1" },
        tags: ["critical", "ops", "critical"],
        themeProfile: {
          background: "#202020",
          foreground: "#dddddd",
          cursor: "#aaffaa",
          black: "#0a0a0a",
          red: "#ff1010",
          green: "#10ff10",
          yellow: "#ffff10",
          blue: "#1010ff",
          magenta: "#ff10ff",
          cyan: "#10ffff",
          white: "#f0f0f0",
          brightBlack: "#303030",
          brightRed: "#ff8080",
          brightGreen: "#80ff80",
          brightYellow: "#ffff80",
          brightBlue: "#8080ff",
          brightMagenta: "#ff80ff",
          brightCyan: "#80ffff",
          brightWhite: "#ffffff"
        }
      })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.state, "running");
    assert.equal(patched.startCwd, "/var/tmp");
    assert.equal(patched.startCommand, "echo RESTART");
    assert.deepEqual(patched.env, { APP_MODE: "prod", FEATURE_X: "1" });
    assert.deepEqual(patched.tags, ["critical", "ops"]);
    assert.equal(patched.themeProfile.background, "#202020");
    assert.equal(patched.themeProfile.brightWhite, "#ffffff");

    const restartRes = await fetch(`${baseUrl}/sessions/${created.id}/restart`, {
      method: "POST"
    });
    assert.equal(restartRes.status, 200);
    const restarted = await restartRes.json();
    assert.equal(restarted.id, created.id);
    assert.equal(restarted.state, "running");
    assert.equal(restarted.cwd, "/var/tmp");
    assert.equal(restarted.startCwd, "/var/tmp");
    assert.equal(restarted.startCommand, "echo RESTART");
    assert.deepEqual(restarted.env, { APP_MODE: "prod", FEATURE_X: "1" });
    assert.deepEqual(restarted.tags, ["critical", "ops"]);
    assert.equal(restarted.themeProfile.background, "#202020");
    assert.equal(restarted.themeProfile.cursor, "#aaffaa");
  } finally {
    await runtime.stop();
  }
});

test("session tag validation rejects invalid payloads", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createInvalidRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["ok", "invalid tag"] })
    });
    assert.equal(createInvalidRes.status, 400);
    const createInvalidBody = await createInvalidRes.json();
    assert.equal(createInvalidBody.error, "ValidationError");

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const patchInvalidRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: "not-array" })
    });
    assert.equal(patchInvalidRes.status, 400);
    const patchInvalidBody = await patchInvalidRes.json();
    assert.equal(patchInvalidBody.error, "ValidationError");
  } finally {
    await runtime.stop();
  }
});

test("custom command endpoints work end-to-end and persist across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-custom-"));
  const dataPath = join(dir, "sessions.json");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024
  });
  await runtimeA.start();
  const baseUrlA = `http://127.0.0.1:${runtimeA.getAddress().port}/api/v1`;

  try {
    const putRes = await fetch(`${baseUrlA}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo DOCU_A\n" })
    });
    assert.equal(putRes.status, 200);
    const putPayload = await putRes.json();
    assert.equal(putPayload.name, "docu");
    assert.equal(putPayload.content, "echo DOCU_A\n");
    assert.equal(Number.isInteger(putPayload.createdAt), true);
    assert.equal(Number.isInteger(putPayload.updatedAt), true);

    const listRes = await fetch(`${baseUrlA}/custom-commands`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "docu");

    const overwriteRes = await fetch(`${baseUrlA}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo DOCU_B\n" })
    });
    assert.equal(overwriteRes.status, 200);
    const overwritePayload = await overwriteRes.json();
    assert.equal(overwritePayload.name, "docu");
    assert.equal(overwritePayload.content, "echo DOCU_B\n");
    assert.equal(overwritePayload.createdAt, putPayload.createdAt);
    assert.ok(overwritePayload.updatedAt >= putPayload.updatedAt);
  } finally {
    await runtimeA.stop();
  }

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024
  });
  await runtimeB.start();
  const baseUrlB = `http://127.0.0.1:${runtimeB.getAddress().port}/api/v1`;
  try {
    const getRes = await fetch(`${baseUrlB}/custom-commands/docu`);
    assert.equal(getRes.status, 200);
    const payload = await getRes.json();
    assert.equal(payload.name, "docu");
    assert.equal(payload.content, "echo DOCU_B\n");

    const deleteRes = await fetch(`${baseUrlB}/custom-commands/docu`, { method: "DELETE" });
    assert.equal(deleteRes.status, 204);
  } finally {
    await runtimeB.stop();
  }
});

test("custom command names normalize deterministically and list order is stable", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const firstPutRes = await fetch(`${baseUrl}/custom-commands/Docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo A\n" })
    });
    assert.equal(firstPutRes.status, 200);
    const firstPutBody = await firstPutRes.json();
    assert.equal(firstPutBody.name, "docu");

    const secondPutRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo B\n" })
    });
    assert.equal(secondPutRes.status, 200);
    const secondPutBody = await secondPutRes.json();
    assert.equal(secondPutBody.name, "docu");
    assert.equal(secondPutBody.createdAt, firstPutBody.createdAt);
    assert.ok(secondPutBody.updatedAt >= firstPutBody.updatedAt);

    const zetaPutRes = await fetch(`${baseUrl}/custom-commands/Zeta`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo Z\n" })
    });
    assert.equal(zetaPutRes.status, 200);

    const alphaPutRes = await fetch(`${baseUrl}/custom-commands/alpha`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo C\n" })
    });
    assert.equal(alphaPutRes.status, 200);

    const getUpperRes = await fetch(`${baseUrl}/custom-commands/DOCU`);
    assert.equal(getUpperRes.status, 200);
    const getUpperBody = await getUpperRes.json();
    assert.equal(getUpperBody.name, "docu");
    assert.equal(getUpperBody.content, "echo B\n");

    const listRes = await fetch(`${baseUrl}/custom-commands`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.deepEqual(
      listed.map((entry) => entry.name),
      ["alpha", "docu", "zeta"]
    );

    const deleteMixedCaseRes = await fetch(`${baseUrl}/custom-commands/DoCu`, {
      method: "DELETE"
    });
    assert.equal(deleteMixedCaseRes.status, 204);
  } finally {
    await runtime.stop();
  }
});

test("custom command guardrails reject reserved names, invalid names, oversized payloads, and count overflow", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    customCommandMaxCount: 1,
    customCommandMaxNameLength: 8,
    customCommandMaxContentLength: 16
  });

  try {
    const reservedRes = await fetch(`${baseUrl}/custom-commands/new`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo ok\n" })
    });
    assert.equal(reservedRes.status, 409);
    const reservedBody = await reservedRes.json();
    assert.equal(reservedBody.error, "CustomCommandNameReserved");

    const invalidNameRes = await fetch(`${baseUrl}/custom-commands/bad%20name`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo ok\n" })
    });
    assert.equal(invalidNameRes.status, 400);
    const invalidNameBody = await invalidNameRes.json();
    assert.equal(invalidNameBody.error, "CustomCommandNameInvalid");

    const longNameRes = await fetch(`${baseUrl}/custom-commands/toolongggg`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo ok\n" })
    });
    assert.equal(longNameRes.status, 400);
    const longNameBody = await longNameRes.json();
    assert.equal(longNameBody.error, "CustomCommandNameTooLong");

    const largeContentRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(17) })
    });
    assert.equal(largeContentRes.status, 400);
    const largeContentBody = await largeContentRes.json();
    assert.equal(largeContentBody.error, "CustomCommandContentTooLarge");

    const firstCreateRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo ok\n" })
    });
    assert.equal(firstCreateRes.status, 200);

    const overflowRes = await fetch(`${baseUrl}/custom-commands/build`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo ok\n" })
    });
    assert.equal(overflowRes.status, 409);
    const overflowBody = await overflowRes.json();
    assert.equal(overflowBody.error, "CustomCommandLimitExceeded");
  } finally {
    await runtime.stop();
  }
});

test("deck lifecycle and session move endpoints work end-to-end", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createDeckRes = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Operations", settings: { terminal: { cols: 80, rows: 24 } } })
    });
    assert.equal(createDeckRes.status, 201);
    const createdDeck = await createDeckRes.json();
    assert.equal(createdDeck.name, "Operations");
    assert.ok(typeof createdDeck.id === "string" && createdDeck.id.length > 0);
    assert.deepEqual(createdDeck.settings, { terminal: { cols: 80, rows: 24 } });

    const listDeckRes = await fetch(`${baseUrl}/decks`);
    assert.equal(listDeckRes.status, 200);
    const listedDecks = await listDeckRes.json();
    assert.ok(Array.isArray(listedDecks));
    assert.ok(listedDecks.some((deck) => deck.id === "default"));
    assert.ok(listedDecks.some((deck) => deck.id === createdDeck.id));

    const getDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}`);
    assert.equal(getDeckRes.status, 200);

    const patchDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ops", settings: { terminal: { cols: 100, rows: 30 } } })
    });
    assert.equal(patchDeckRes.status, 200);
    const patchedDeck = await patchDeckRes.json();
    assert.equal(patchedDeck.name, "Ops");
    assert.deepEqual(patchedDeck.settings, { terminal: { cols: 100, rows: 30 } });

    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "deck-move-target" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();

    const moveRes = await fetch(`${baseUrl}/decks/${createdDeck.id}/sessions/${createdSession.id}:move`, {
      method: "POST"
    });
    assert.equal(moveRes.status, 204);

    const moveUnknownDeckRes = await fetch(`${baseUrl}/decks/missing/sessions/${createdSession.id}:move`, {
      method: "POST"
    });
    assert.equal(moveUnknownDeckRes.status, 404);
    const moveUnknownDeckBody = await moveUnknownDeckRes.json();
    assert.equal(moveUnknownDeckBody.error, "DeckNotFound");

    const moveUnknownSessionRes = await fetch(`${baseUrl}/decks/${createdDeck.id}/sessions/missing:move`, {
      method: "POST"
    });
    assert.equal(moveUnknownSessionRes.status, 404);
    const moveUnknownSessionBody = await moveUnknownSessionRes.json();
    assert.equal(moveUnknownSessionBody.error, "SessionNotFound");

    const deleteNonEmptyDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteNonEmptyDeckRes.status, 409);
    const deleteNonEmptyDeckBody = await deleteNonEmptyDeckRes.json();
    assert.equal(deleteNonEmptyDeckBody.error, "DeckNotEmpty");

    const idempotentMoveRes = await fetch(`${baseUrl}/decks/${createdDeck.id}/sessions/${createdSession.id}:move`, {
      method: "POST"
    });
    assert.equal(idempotentMoveRes.status, 204);

    const forceDeleteDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}?force=true`, {
      method: "DELETE"
    });
    assert.equal(forceDeleteDeckRes.status, 204);

    const movedBackToDefaultRes = await fetch(`${baseUrl}/sessions/${createdSession.id}`);
    assert.equal(movedBackToDefaultRes.status, 200);
    const movedBackToDefault = await movedBackToDefaultRes.json();
    assert.equal(movedBackToDefault.deckId, "default");

    const deleteDeckRes = await fetch(`${baseUrl}/decks/${createdDeck.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteDeckRes.status, 404);
  } finally {
    await runtime.stop();
  }
});

test("session list/get are deck-aware with optional deckId query filter", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createDeckRes = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ops", name: "Operations" })
    });
    assert.equal(createDeckRes.status, 201);

    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "deck-aware-session" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();
    assert.equal(createdSession.deckId, "default");

    const moveRes = await fetch(`${baseUrl}/decks/ops/sessions/${createdSession.id}:move`, {
      method: "POST"
    });
    assert.equal(moveRes.status, 204);

    const getSessionRes = await fetch(`${baseUrl}/sessions/${createdSession.id}`);
    assert.equal(getSessionRes.status, 200);
    const movedSession = await getSessionRes.json();
    assert.equal(movedSession.deckId, "ops");

    const listOpsRes = await fetch(`${baseUrl}/sessions?deckId=ops`);
    assert.equal(listOpsRes.status, 200);
    const listOps = await listOpsRes.json();
    assert.ok(listOps.some((session) => session.id === createdSession.id));

    const listDefaultRes = await fetch(`${baseUrl}/sessions?deckId=default`);
    assert.equal(listDefaultRes.status, 200);
    const listDefault = await listDefaultRes.json();
    assert.ok(!listDefault.some((session) => session.id === createdSession.id));
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

    const invalidCustomCommandPutRes = await fetch(`${baseUrl}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: 123 })
    });
    assert.equal(invalidCustomCommandPutRes.status, 400);
    const invalidCustomCommandPutBody = await invalidCustomCommandPutRes.json();
    assert.equal(invalidCustomCommandPutBody.error, "ValidationError");

    const unknownCustomCommandGetRes = await fetch(`${baseUrl}/custom-commands/missing`);
    assert.equal(unknownCustomCommandGetRes.status, 404);
    const unknownCustomCommandGetBody = await unknownCustomCommandGetRes.json();
    assert.equal(unknownCustomCommandGetBody.error, "CustomCommandNotFound");

    const unknownCustomCommandDeleteRes = await fetch(`${baseUrl}/custom-commands/missing`, {
      method: "DELETE"
    });
    assert.equal(unknownCustomCommandDeleteRes.status, 404);
    const unknownCustomCommandDeleteBody = await unknownCustomCommandDeleteRes.json();
    assert.equal(unknownCustomCommandDeleteBody.error, "CustomCommandNotFound");

    const invalidForceDeleteDeckRes = await fetch(`${baseUrl}/decks/default?force=maybe`, {
      method: "DELETE"
    });
    assert.equal(invalidForceDeleteDeckRes.status, 400);
    const invalidForceDeleteDeckBody = await invalidForceDeleteDeckRes.json();
    assert.equal(invalidForceDeleteDeckBody.error, "ValidationError");
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

test("REST create enforces max concurrent session guardrail", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    sessionMaxConcurrent: 1
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
    assert.equal(secondRes.status, 409);
    const secondBody = await secondRes.json();
    assert.equal(secondBody.error, "SessionLimitExceeded");
  } finally {
    await runtime.stop();
  }
});

test("idle-timeout and max-lifetime guardrails close sessions automatically", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    sessionIdleTimeoutMs: 40,
    sessionMaxLifetimeMs: 80,
    sessionGuardrailSweepMs: 10
  });

  try {
    const firstRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(firstRes.status, 201);
    const first = await firstRes.json();

    await sleep(120);
    const firstGetRes = await fetch(`${baseUrl}/sessions/${first.id}`);
    assert.equal(firstGetRes.status, 404);

    const secondRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(secondRes.status, 201);
    const second = await secondRes.json();
    await sleep(120);
    const secondGetRes = await fetch(`${baseUrl}/sessions/${second.id}`);
    assert.equal(secondGetRes.status, 404);
  } finally {
    await runtime.stop();
  }
});

test("OPTIONS advertises PATCH/PUT and authorization header for CORS preflight", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();
  try {
    const res = await fetch(`${baseUrl}/sessions/test-id`, {
      method: "OPTIONS"
    });
    assert.equal(res.status, 204);
    const allowMethods = res.headers.get("access-control-allow-methods") || "";
    assert.ok(allowMethods.includes("PATCH"));
    assert.ok(allowMethods.includes("PUT"));
    const allowHeaders = res.headers.get("access-control-allow-headers") || "";
    assert.ok(allowHeaders.includes("authorization"));
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

test("TLS ingress enforcement rejects non-HTTPS requests", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    enforceTlsIngress: true,
    trustedProxy: { mode: "all", ips: [] },
    corsOrigin: "https://app.example.com",
    corsAllowedOrigins: ["https://app.example.com"]
  });
  try {
    const res = await fetch(`${baseUrl}/sessions`);
    assert.equal(res.status, 426);
    const body = await res.json();
    assert.equal(body.error, "TlsRequired");
  } finally {
    await runtime.stop();
  }
});

test("TLS ingress enforcement accepts trusted forwarded HTTPS requests", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    enforceTlsIngress: true,
    trustedProxy: { mode: "all", ips: [] },
    corsOrigin: "https://app.example.com",
    corsAllowedOrigins: ["https://app.example.com"]
  });
  try {
    const res = await fetch(`${baseUrl}/sessions`, {
      headers: {
        origin: "https://app.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "api.example.com"
      }
    });
    assert.equal(res.status, 200);
  } finally {
    await runtime.stop();
  }
});

test("auth dev mode issues token and protects session routes", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    authMode: "dev",
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
    assert.equal(typeof wsTicketPayload.ticket, "string");

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

test("metrics endpoint exposes request counters and lifecycle/session gauges", async () => {
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
    assert.match(metrics, /# TYPE ptydeck_http_request_duration_ms_bucket histogram/);
    assert.match(metrics, /ptydeck_http_request_duration_ms_bucket\{le="\+Inf"\} \d+/);
    assert.match(metrics, /# TYPE ptydeck_sessions_active gauge/);
    assert.match(metrics, /ptydeck_sessions_active 1/);
    assert.match(metrics, /# TYPE ptydeck_sessions_active_by_lifecycle gauge/);
    assert.match(metrics, /ptydeck_sessions_active_by_lifecycle\{state="running"\} 1/);
    assert.match(metrics, /# TYPE ptydeck_sessions_created_total counter/);
    assert.match(metrics, /ptydeck_sessions_created_total 1/);
    assert.match(metrics, /# TYPE ptydeck_sessions_started_total counter/);
    assert.match(metrics, /ptydeck_sessions_started_total 1/);
    assert.match(metrics, /# TYPE ptydeck_sessions_exited_total counter/);
    assert.match(metrics, /ptydeck_sessions_exited_total 0/);
    assert.match(metrics, /# TYPE ptydeck_sessions_unrestored_total counter/);
    assert.match(metrics, /ptydeck_sessions_unrestored_total 0/);
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

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSessions = Array.isArray(persistedRaw) ? persistedRaw : persistedRaw.sessions;
  const persistedSession = persistedSessions.find((session) => session.id === createdId);
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
    assert.ok(restored.updatedAt >= updatedAt);
  } finally {
    await runtimeB.stop();
  }
});

test("session create persists immediately before response completes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const { runtime, baseUrl } = await createStartedRuntime({ dataPath });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "persist-now-check" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    const persistedSessions = Array.isArray(persistedRaw) ? persistedRaw : persistedRaw.sessions;
    assert.ok(Array.isArray(persistedSessions));
    assert.ok(persistedSessions.some((session) => session.id === created.id));
  } finally {
    await runtime.stop();
  }
});

test("session persistence stores default deck catalog and default deckId assignment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const { runtime, baseUrl } = await createStartedRuntime({ dataPath });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "deck-default-check" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    const persistedSessions = Array.isArray(persistedRaw) ? persistedRaw : persistedRaw.sessions;
    const persistedDecks = Array.isArray(persistedRaw.decks) ? persistedRaw.decks : [];
    assert.ok(Array.isArray(persistedSessions));
    assert.ok(Array.isArray(persistedDecks));
    assert.ok(persistedDecks.some((deck) => deck.id === "default"));

    const persistedSession = persistedSessions.find((session) => session.id === created.id);
    assert.ok(persistedSession);
    assert.equal(persistedSession.deckId, "default");
  } finally {
    await runtime.stop();
  }
});

test("runtime migrates legacy persistence to default deck catalog and deckId assignment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const sessionId = "legacy-no-deck";

  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [{ id: sessionId, cwd: homedir(), shell: "sh", startCwd: homedir(), createdAt: 1, updatedAt: 1 }],
        customCommands: []
      },
      null,
      2
    ),
    "utf8"
  );

  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory()
  });
  try {
    await runtime.start();
  } finally {
    await runtime.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSessions = Array.isArray(persistedRaw.sessions) ? persistedRaw.sessions : [];
  const persistedDecks = Array.isArray(persistedRaw.decks) ? persistedRaw.decks : [];
  assert.ok(persistedDecks.some((deck) => deck.id === "default"));
  const migratedSession = persistedSessions.find((session) => session.id === sessionId);
  assert.ok(migratedSession);
  assert.equal(migratedSession.deckId, "default");
});

test("runtime restore falls back to home when persisted startCwd is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const sessionId = "restore-invalid-cwd";
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: sessionId,
            cwd: "/definitely/not/a/real/path",
            shell: "bash",
            name: "invalid-cwd",
            startCwd: "/definitely/not/a/real/path",
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        customCommands: []
      },
      null,
      2
    ),
    "utf8"
  );

  const { runtime, baseUrl } = await createStartedRuntime({
    dataPath,
    shell: "bash",
    createPty: createFallbackAwarePtyFactory()
  });
  try {
    const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
    assert.equal(res.status, 200);
    const restored = await res.json();
    assert.equal(restored.id, sessionId);
    assert.equal(restored.startCwd, homedir());
    assert.equal(restored.state, "running");
  } finally {
    await runtime.stop();
  }
});

test("runtime restore falls back to configured shell when persisted shell is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const sessionId = "restore-invalid-shell";
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: sessionId,
            cwd: homedir(),
            shell: "/definitely/not/a/real/shell",
            name: "invalid-shell",
            startCwd: homedir(),
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        customCommands: []
      },
      null,
      2
    ),
    "utf8"
  );

  const { runtime, baseUrl } = await createStartedRuntime({
    dataPath,
    shell: "bash",
    createPty: createFallbackAwarePtyFactory()
  });
  try {
    const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
    assert.equal(res.status, 200);
    const restored = await res.json();
    assert.equal(restored.id, sessionId);
    assert.equal(restored.shell, "bash");
    assert.equal(restored.state, "running");
  } finally {
    await runtime.stop();
  }
});

test("runtime keeps unrestored persisted sessions visible across restart cycles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const activeSessionId = "restore-active";
  const unrestoredSessionId = "restore-unrestored";
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: activeSessionId,
            cwd: homedir(),
            shell: "sh",
            name: "active",
            startCwd: homedir(),
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          {
            id: unrestoredSessionId,
            cwd: homedir(),
            shell: "sh",
            name: "unrestored",
            startCwd: homedir(),
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        customCommands: []
      },
      null,
      2
    ),
    "utf8"
  );

  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    sessionMaxConcurrent: 1
  });

  try {
    await runtimeA.start();
    const metricsResA = await fetch(`http://127.0.0.1:${runtimeA.getAddress().port}/metrics`);
    assert.equal(metricsResA.status, 200);
    const metricsA = await metricsResA.text();
    assert.match(metricsA, /ptydeck_sessions_unrestored_total 1/);
    assert.match(metricsA, /ptydeck_sessions_active_by_lifecycle\{state="unrestored"\} 1/);
    const baseUrlA = `http://127.0.0.1:${runtimeA.getAddress().port}/api/v1`;
    const listResA = await fetch(`${baseUrlA}/sessions`);
    assert.equal(listResA.status, 200);
    const sessionsA = await listResA.json();
    const activeA = sessionsA.find((session) => session.id === activeSessionId);
    assert.ok(activeA);
    assert.equal(activeA.state, "running");
    const unrestoredA = sessionsA.find((session) => session.id === unrestoredSessionId);
    assert.ok(unrestoredA);
    assert.equal(unrestoredA.state, "unrestored");

    const getResA = await fetch(`${baseUrlA}/sessions/${unrestoredSessionId}`);
    assert.equal(getResA.status, 200);
    const getPayloadA = await getResA.json();
    assert.equal(getPayloadA.id, unrestoredSessionId);
    assert.equal(getPayloadA.state, "unrestored");
    await runtimeA.stop();
  } finally {
    await runtimeA.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSessions = Array.isArray(persistedRaw) ? persistedRaw : persistedRaw.sessions;
  assert.ok(Array.isArray(persistedSessions));
  assert.ok(persistedSessions.some((session) => session.id === unrestoredSessionId));

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    sessionMaxConcurrent: 1
  });
  try {
    await runtimeB.start();
    const baseUrlB = `http://127.0.0.1:${runtimeB.getAddress().port}/api/v1`;
    const getResB = await fetch(`${baseUrlB}/sessions/${unrestoredSessionId}`);
    assert.equal(getResB.status, 200);
    const getPayloadB = await getResB.json();
    assert.equal(getPayloadB.id, unrestoredSessionId);
    assert.equal(getPayloadB.state, "unrestored");
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
