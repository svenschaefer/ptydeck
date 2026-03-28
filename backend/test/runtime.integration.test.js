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

function createDelayedBootPtyFactory({ bootChunk = "BOOT\n", bootDelayMs = 20 } = {}) {
  return () => {
    let exitHandler = null;
    let dataHandler = null;
    let bootTimer = null;

    function scheduleBoot() {
      if (bootTimer !== null) {
        return;
      }
      bootTimer = setTimeout(() => {
        bootTimer = null;
        if (dataHandler) {
          dataHandler(bootChunk);
        }
      }, bootDelayMs);
    }

    return {
      onExit(handler) {
        exitHandler = handler;
      },
      onData(handler) {
        dataHandler = handler;
        scheduleBoot();
      },
      write() {},
      resize() {},
      kill() {
        if (bootTimer !== null) {
          clearTimeout(bootTimer);
          bootTimer = null;
        }
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
    startupWarmupQuietMs: 20,
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

async function waitFor(predicate, timeoutMs = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(10);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
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

test("session PTY control endpoints send deterministic signals and remove killed sessions", async () => {
  const killSignals = [];
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty() {
      let exitHandler = null;
      return {
        onExit(handler) {
          exitHandler = handler;
        },
        onData() {},
        write() {},
        resize() {},
        kill(signal) {
          killSignals.push(signal || "SIGHUP");
          if (signal === "SIGKILL" && exitHandler) {
            exitHandler({ exitCode: 137, signal: "SIGKILL" });
          }
        }
      };
    }
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const interruptRes = await fetch(`${baseUrl}/sessions/${created.id}/interrupt`, {
      method: "POST"
    });
    assert.equal(interruptRes.status, 204);

    const terminateRes = await fetch(`${baseUrl}/sessions/${created.id}/terminate`, {
      method: "POST"
    });
    assert.equal(terminateRes.status, 204);

    const killRes = await fetch(`${baseUrl}/sessions/${created.id}/kill`, {
      method: "POST"
    });
    assert.equal(killRes.status, 204);

    assert.deepEqual(killSignals, ["SIGINT", "SIGTERM", "SIGKILL"]);

    const missingAfterKillRes = await fetch(`${baseUrl}/sessions/${created.id}`);
    assert.equal(missingAfterKillRes.status, 404);
    const missingAfterKillBody = await missingAfterKillRes.json();
    assert.equal(missingAfterKillBody.error, "SessionNotFound");
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
        note: "needs review\r\ncapture logs",
        inputSafetyProfile: {
          requireValidShellSyntax: true,
          confirmOnIncompleteShellConstruct: true,
          confirmOnNaturalLanguageInput: false,
          confirmOnDangerousShellCommand: true,
          confirmOnMultilineInput: false,
          confirmOnRecentTargetSwitch: true,
          targetSwitchGraceMs: 2500,
          pasteLengthConfirmThreshold: 320,
          pasteLineConfirmThreshold: 4
        },
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
    assert.equal(created.note, "needs review\ncapture logs");
    assert.equal(created.inputSafetyProfile.requireValidShellSyntax, true);
    assert.equal(created.inputSafetyProfile.confirmOnNaturalLanguageInput, false);
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
        note: "capture restart logs\nbefore restart",
        inputSafetyProfile: {
          requireValidShellSyntax: false,
          confirmOnIncompleteShellConstruct: true,
          confirmOnNaturalLanguageInput: true,
          confirmOnDangerousShellCommand: true,
          confirmOnMultilineInput: true,
          confirmOnRecentTargetSwitch: true,
          targetSwitchGraceMs: 5000,
          pasteLengthConfirmThreshold: 512,
          pasteLineConfirmThreshold: 8
        },
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
    assert.equal(patched.note, "capture restart logs\nbefore restart");
    assert.equal(patched.inputSafetyProfile.requireValidShellSyntax, false);
    assert.equal(patched.inputSafetyProfile.confirmOnMultilineInput, true);
    assert.equal(patched.inputSafetyProfile.targetSwitchGraceMs, 5000);
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
    assert.equal(restarted.note, "capture restart logs\nbefore restart");
    assert.equal(restarted.inputSafetyProfile.requireValidShellSyntax, false);
    assert.equal(restarted.inputSafetyProfile.confirmOnRecentTargetSwitch, true);
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

test("session notes preserve multiline text and clear through patch", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", note: "  keep   logs handy \r\n second line  " })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.note, "keep   logs handy\nsecond line");

    const clearRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "" })
    });
    assert.equal(clearRes.status, 200);
    const cleared = await clearRes.json();
    assert.equal(cleared.note, undefined);
  } finally {
    await runtime.stop();
  }
});

test("session input safety profile normalizes defaults and rejects invalid payloads", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.inputSafetyProfile.requireValidShellSyntax, false);
    assert.equal(created.inputSafetyProfile.targetSwitchGraceMs, 4000);

    const patchRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputSafetyProfile: {
          requireValidShellSyntax: true,
          confirmOnIncompleteShellConstruct: true,
          confirmOnNaturalLanguageInput: true,
          confirmOnDangerousShellCommand: true,
          confirmOnMultilineInput: true,
          confirmOnRecentTargetSwitch: true,
          targetSwitchGraceMs: 3000,
          pasteLengthConfirmThreshold: 256,
          pasteLineConfirmThreshold: 3
        }
      })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.inputSafetyProfile.requireValidShellSyntax, true);
    assert.equal(patched.inputSafetyProfile.pasteLineConfirmThreshold, 3);

    const invalidRes = await fetch(`${baseUrl}/sessions/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputSafetyProfile: {
          requireValidShellSyntax: "yes"
        }
      })
    });
    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.error, "ValidationError");
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
    assert.equal(putPayload.kind, "plain");
    assert.equal(putPayload.scope, "project");
    assert.equal(putPayload.sessionId, null);
    assert.equal(putPayload.precedence, 200);
    assert.deepEqual(putPayload.templateVariables, []);
    assert.equal(Number.isInteger(putPayload.createdAt), true);
    assert.equal(Number.isInteger(putPayload.updatedAt), true);

    const listRes = await fetch(`${baseUrlA}/custom-commands`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "docu");
    assert.equal(listed[0].kind, "plain");
    assert.equal(listed[0].scope, "project");
    assert.equal(listed[0].sessionId, null);
    assert.equal(listed[0].precedence, 200);
    assert.deepEqual(listed[0].templateVariables, []);

    const overwriteRes = await fetch(`${baseUrlA}/custom-commands/docu`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo DOCU_B\n" })
    });
    assert.equal(overwriteRes.status, 200);
    const overwritePayload = await overwriteRes.json();
    assert.equal(overwritePayload.name, "docu");
    assert.equal(overwritePayload.content, "echo DOCU_B\n");
    assert.equal(overwritePayload.kind, "plain");
    assert.equal(overwritePayload.scope, "project");
    assert.equal(overwritePayload.sessionId, null);
    assert.equal(overwritePayload.precedence, 200);
    assert.deepEqual(overwritePayload.templateVariables, []);
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
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await runtimeB.start();
  const baseUrlB = `http://127.0.0.1:${runtimeB.getAddress().port}/api/v1`;
  try {
    const getRes = await fetch(`${baseUrlB}/custom-commands/docu`);
    assert.equal(getRes.status, 200);
    const payload = await getRes.json();
    assert.equal(payload.name, "docu");
    assert.equal(payload.content, "echo DOCU_B\n");
    assert.equal(payload.kind, "plain");
    assert.equal(payload.scope, "project");
    assert.equal(payload.sessionId, null);
    assert.equal(payload.precedence, 200);
    assert.deepEqual(payload.templateVariables, []);

    const deleteRes = await fetch(`${baseUrlB}/custom-commands/docu`, { method: "DELETE" });
    assert.equal(deleteRes.status, 204);
  } finally {
    await runtimeB.stop();
  }
});

test("custom command endpoints persist template commands with validated built-in variables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-custom-template-"));
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
    const plainLiteralRes = await fetch(`${baseUrlA}/custom-commands/literal`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo {{var:session.cwd}}\n"
      })
    });
    assert.equal(plainLiteralRes.status, 200);
    const plainLiteralPayload = await plainLiteralRes.json();
    assert.equal(plainLiteralPayload.kind, "plain");
    assert.equal(plainLiteralPayload.scope, "project");
    assert.equal(plainLiteralPayload.precedence, 200);
    assert.deepEqual(plainLiteralPayload.templateVariables, []);

    const putRes = await fetch(`${baseUrlA}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo {{param:env}} from {{var:session.cwd}}\n",
        kind: "template",
        templateVariables: ["session.cwd"]
      })
    });
    assert.equal(putRes.status, 200);
    const payload = await putRes.json();
    assert.equal(payload.name, "deploy");
    assert.equal(payload.kind, "template");
    assert.equal(payload.scope, "project");
    assert.equal(payload.sessionId, null);
    assert.equal(payload.precedence, 200);
    assert.deepEqual(payload.templateVariables, ["session.cwd"]);

    const invalidRes = await fetch(`${baseUrlA}/custom-commands/bad`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo {{var:deck.name}}\n",
        kind: "template",
        templateVariables: []
      })
    });
    assert.equal(invalidRes.status, 400);
    const invalidPayload = await invalidRes.json();
    assert.equal(invalidPayload.error, "CustomCommandTemplateVariableNotAllowed");
  } finally {
    await runtimeA.stop();
  }

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await runtimeB.start();
  const baseUrlB = `http://127.0.0.1:${runtimeB.getAddress().port}/api/v1`;
  try {
    const getRes = await fetch(`${baseUrlB}/custom-commands/deploy`);
    assert.equal(getRes.status, 200);
    const payload = await getRes.json();
    assert.equal(payload.kind, "template");
    assert.equal(payload.scope, "project");
    assert.equal(payload.sessionId, null);
    assert.equal(payload.precedence, 200);
    assert.deepEqual(payload.templateVariables, ["session.cwd"]);
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
    assert.equal(firstPutBody.kind, "plain");
    assert.equal(firstPutBody.scope, "project");
    assert.equal(firstPutBody.sessionId, null);
    assert.equal(firstPutBody.precedence, 200);
    assert.deepEqual(firstPutBody.templateVariables, []);

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
    assert.equal(getUpperBody.kind, "plain");
    assert.equal(getUpperBody.scope, "project");
    assert.equal(getUpperBody.sessionId, null);
    assert.equal(getUpperBody.precedence, 200);
    assert.deepEqual(getUpperBody.templateVariables, []);

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

test("custom command scopes expose deterministic precedence, exact selectors, and session cleanup", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const createSessionRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "scope-target" })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();

    const globalRes = await fetch(`${baseUrl}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo GLOBAL\n", scope: "global" })
    });
    assert.equal(globalRes.status, 200);
    const globalBody = await globalRes.json();
    assert.equal(globalBody.scope, "global");
    assert.equal(globalBody.sessionId, null);
    assert.equal(globalBody.precedence, 100);

    const projectRes = await fetch(`${baseUrl}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "echo PROJECT\n" })
    });
    assert.equal(projectRes.status, 200);
    const projectBody = await projectRes.json();
    assert.equal(projectBody.scope, "project");
    assert.equal(projectBody.sessionId, null);
    assert.equal(projectBody.precedence, 200);

    const sessionRes = await fetch(`${baseUrl}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo SESSION\n",
        scope: "session",
        sessionId: createdSession.id
      })
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json();
    assert.equal(sessionBody.scope, "session");
    assert.equal(sessionBody.sessionId, createdSession.id);
    assert.equal(sessionBody.precedence, 300);

    const conflictingKindRes = await fetch(`${baseUrl}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo {{param:env}}\n",
        kind: "template",
        templateVariables: [],
        scope: "session",
        sessionId: createdSession.id
      })
    });
    assert.equal(conflictingKindRes.status, 409);
    const conflictingKindBody = await conflictingKindRes.json();
    assert.equal(conflictingKindBody.error, "CustomCommandKindConflict");

    const listRes = await fetch(`${baseUrl}/custom-commands`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.length, 3);
    assert.deepEqual(
      listed.map((entry) => [entry.name, entry.scope, entry.sessionId, entry.precedence]),
      [
        ["deploy", "session", createdSession.id, 300],
        ["deploy", "project", null, 200],
        ["deploy", "global", null, 100]
      ]
    );

    const filteredSessionListRes = await fetch(
      `${baseUrl}/custom-commands?scope=session&sessionId=${encodeURIComponent(createdSession.id)}`
    );
    assert.equal(filteredSessionListRes.status, 200);
    const filteredSessionList = await filteredSessionListRes.json();
    assert.equal(filteredSessionList.length, 1);
    assert.equal(filteredSessionList[0].scope, "session");
    assert.equal(filteredSessionList[0].sessionId, createdSession.id);

    const ambiguousGetRes = await fetch(`${baseUrl}/custom-commands/deploy`);
    assert.equal(ambiguousGetRes.status, 409);
    const ambiguousGetBody = await ambiguousGetRes.json();
    assert.equal(ambiguousGetBody.error, "CustomCommandAmbiguous");

    const exactSessionGetRes = await fetch(
      `${baseUrl}/custom-commands/deploy?scope=session&sessionId=${encodeURIComponent(createdSession.id)}`
    );
    assert.equal(exactSessionGetRes.status, 200);
    const exactSessionGetBody = await exactSessionGetRes.json();
    assert.equal(exactSessionGetBody.content, "echo SESSION\n");
    assert.equal(exactSessionGetBody.scope, "session");

    const missingSessionScopedRes = await fetch(`${baseUrl}/custom-commands/deploy`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "echo BAD\n",
        scope: "session",
        sessionId: "missing-session"
      })
    });
    assert.equal(missingSessionScopedRes.status, 404);
    const missingSessionScopedBody = await missingSessionScopedRes.json();
    assert.equal(missingSessionScopedBody.error, "SessionNotFound");

    const deleteGlobalRes = await fetch(`${baseUrl}/custom-commands/deploy?scope=global`, {
      method: "DELETE"
    });
    assert.equal(deleteGlobalRes.status, 204);

    const deleteSessionRes = await fetch(`${baseUrl}/sessions/${createdSession.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteSessionRes.status, 204);

    const postDeleteListRes = await fetch(`${baseUrl}/custom-commands`);
    assert.equal(postDeleteListRes.status, 200);
    const postDeleteList = await postDeleteListRes.json();
    assert.deepEqual(
      postDeleteList.map((entry) => [entry.name, entry.scope]),
      [["deploy", "project"]]
    );
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

test("legacy persisted custom commands migrate to project scope on restore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-custom-legacy-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [],
        sessionOutputs: [],
        customCommands: [
          {
            name: "docu",
            content: "echo LEGACY\n",
            kind: "plain",
            templateVariables: [],
            createdAt: 1,
            updatedAt: 2
          }
        ],
        decks: [],
        layoutProfiles: [],
        workspacePresets: []
      },
      null,
      2
    ),
    "utf8"
  );

  const { runtime, baseUrl } = await createStartedRuntime({ dataPath });

  try {
    const listRes = await fetch(`${baseUrl}/custom-commands`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "docu");
    assert.equal(listed[0].scope, "project");
    assert.equal(listed[0].sessionId, null);
    assert.equal(listed[0].precedence, 200);
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

test("layout profile lifecycle persists and restores across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-layout-profiles-"));
  const dataPath = join(dir, "sessions.json");
  const firstRuntime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await firstRuntime.start();
  const firstPort = firstRuntime.getAddress().port;
  const firstBaseUrl = `http://127.0.0.1:${firstPort}/api/v1`;
  let defaultSessionId = "";

  try {
    const createSessionRes = await fetch(`${firstBaseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", name: "default-shell" })
    });
    assert.equal(createSessionRes.status, 201);
    defaultSessionId = (await createSessionRes.json()).id;

    const createDeckRes = await fetch(`${firstBaseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ops", name: "Ops", settings: { terminal: { cols: 100, rows: 32 } } })
    });
    assert.equal(createDeckRes.status, 201);

    const createLayoutProfileRes = await fetch(`${firstBaseUrl}/layout-profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ops Focus",
        layout: {
          activeDeckId: "ops",
          sidebarVisible: false,
          sessionFilterText: "ops critical",
          controlPaneVisible: false,
          controlPanePosition: "left",
          controlPaneSize: 320,
          deckTerminalSettings: {
            default: { cols: 80, rows: 20 },
            ops: { cols: 132, rows: 40 }
          },
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: [defaultSessionId]
              }
            },
            ops: {
              root: {
                type: "row",
                weights: [3, 2],
                children: [
                  { type: "pane", paneId: "left" },
                  { type: "pane", paneId: "right" }
                ]
              },
              paneSessions: {
                left: [],
                right: []
              }
            }
          }
        }
      })
    });
    assert.equal(createLayoutProfileRes.status, 201);
    const created = await createLayoutProfileRes.json();
    assert.equal(created.layout.activeDeckId, "ops");
    assert.equal(created.layout.sidebarVisible, false);
    assert.equal(created.layout.sessionFilterText, "ops critical");
    assert.equal(created.layout.controlPaneVisible, false);
    assert.equal(created.layout.controlPanePosition, "left");
    assert.equal(created.layout.controlPaneSize, 320);
    assert.deepEqual(created.layout.deckSplitLayouts.ops.root.weights, [0.6, 0.4]);

    const patchLayoutProfileRes = await fetch(`${firstBaseUrl}/layout-profiles/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ops Focus Updated",
        layout: {
          activeDeckId: "default",
          sidebarVisible: true,
          sessionFilterText: "",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckTerminalSettings: {
            default: { cols: 96, rows: 26 }
          },
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: [defaultSessionId]
              }
            }
          }
        }
      })
    });
    assert.equal(patchLayoutProfileRes.status, 200);
    const updated = await patchLayoutProfileRes.json();
    assert.equal(updated.name, "Ops Focus Updated");
    assert.equal(updated.layout.activeDeckId, "default");
    assert.equal(updated.layout.sidebarVisible, true);
    assert.equal(updated.layout.controlPaneVisible, true);
    assert.equal(updated.layout.controlPanePosition, "bottom");
    assert.equal(updated.layout.controlPaneSize, 240);
    assert.deepEqual(updated.layout.deckSplitLayouts.default.paneSessions.main, [defaultSessionId]);

    const listLayoutProfilesRes = await fetch(`${firstBaseUrl}/layout-profiles`);
    assert.equal(listLayoutProfilesRes.status, 200);
    const listed = await listLayoutProfilesRes.json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    assert.ok(Array.isArray(persistedRaw.layoutProfiles));
    assert.equal(persistedRaw.layoutProfiles.length, 1);
    assert.equal(persistedRaw.layoutProfiles[0].name, "Ops Focus Updated");
    assert.equal(persistedRaw.layoutProfiles[0].layout.controlPaneVisible, true);
    assert.equal(persistedRaw.layoutProfiles[0].layout.controlPanePosition, "bottom");
    assert.equal(persistedRaw.layoutProfiles[0].layout.controlPaneSize, 240);
  } finally {
    await firstRuntime.stop();
  }

  const secondRuntime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await secondRuntime.start();
  const secondPort = secondRuntime.getAddress().port;
  const secondBaseUrl = `http://127.0.0.1:${secondPort}/api/v1`;

  try {
    const restoredListRes = await fetch(`${secondBaseUrl}/layout-profiles`);
    assert.equal(restoredListRes.status, 200);
    const restoredProfiles = await restoredListRes.json();
    assert.equal(restoredProfiles.length, 1);
    assert.equal(restoredProfiles[0].name, "Ops Focus Updated");
    assert.equal(restoredProfiles[0].layout.activeDeckId, "default");
    assert.equal(restoredProfiles[0].layout.controlPaneVisible, true);
    assert.equal(restoredProfiles[0].layout.controlPanePosition, "bottom");
    assert.equal(restoredProfiles[0].layout.controlPaneSize, 240);
    assert.deepEqual(restoredProfiles[0].layout.deckTerminalSettings, {
      default: { cols: 96, rows: 26 }
    });
    assert.deepEqual(restoredProfiles[0].layout.deckSplitLayouts.default.paneSessions.main, [defaultSessionId]);

    const deleteSessionRes = await fetch(`${secondBaseUrl}/sessions/${defaultSessionId}`, {
      method: "DELETE"
    });
    assert.equal(deleteSessionRes.status, 204);

    const cleanedLayoutProfileRes = await fetch(`${secondBaseUrl}/layout-profiles/${restoredProfiles[0].id}`);
    assert.equal(cleanedLayoutProfileRes.status, 200);
    const cleanedLayoutProfile = await cleanedLayoutProfileRes.json();
    assert.deepEqual(cleanedLayoutProfile.layout.deckSplitLayouts.default.paneSessions.main, []);

    const deleteLayoutProfileRes = await fetch(`${secondBaseUrl}/layout-profiles/${restoredProfiles[0].id}`, {
      method: "DELETE"
    });
    assert.equal(deleteLayoutProfileRes.status, 204);

    const emptyListRes = await fetch(`${secondBaseUrl}/layout-profiles`);
    assert.equal(emptyListRes.status, 200);
    const emptyProfiles = await emptyListRes.json();
    assert.deepEqual(emptyProfiles, []);
  } finally {
    await secondRuntime.stop();
  }
});

test("connection profile lifecycle persists, restores, cleans up deck references, and can launch sessions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-connection-profiles-"));
  const dataPath = join(dir, "sessions.json");
  const spawnCalls = [];
  const fallbackFactory = createFallbackAwarePtyFactory();
  const createPty = (options) => {
    spawnCalls.push({
      command: options.command || options.shell,
      shell: options.shell,
      cwd: options.cwd,
      args: Array.isArray(options.args) ? [...options.args] : []
    });
    return fallbackFactory(options);
  };

  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeA.start();
  const { port: portA } = runtimeA.getAddress();
  const baseUrlA = `http://127.0.0.1:${portA}/api/v1`;

  let profileId = "";

  try {
    const createDeckRes = await fetch(`${baseUrlA}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ops", name: "Ops" })
    });
    assert.equal(createDeckRes.status, 201);

    const createProfileRes = await fetch(`${baseUrlA}/connection-profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          deckId: "ops",
          startCwd: "~/workspace",
          startCommand: "pwd",
          env: {
            LANG: "en_US.UTF-8"
          },
          tags: ["ops", "ssh"],
          remoteConnection: {
            host: "ops.internal",
            port: 2222,
            username: "deploy"
          },
          remoteAuth: {
            method: "privateKey",
            privateKeyPath: "~/.ssh/ops"
          }
        }
      })
    });
    assert.equal(createProfileRes.status, 201);
    const createdProfile = await createProfileRes.json();
    profileId = createdProfile.id;
    assert.equal(createdProfile.name, "Ops SSH");
    assert.equal(createdProfile.launch.kind, "ssh");
    assert.equal(createdProfile.launch.deckId, "ops");
    assert.equal(createdProfile.launch.shell, "ssh");
    assert.equal(createdProfile.launch.startCwd, "~/workspace");
    assert.equal(createdProfile.launch.startCommand, "pwd");
    assert.deepEqual(createdProfile.launch.env, { LANG: "en_US.UTF-8" });
    assert.deepEqual(createdProfile.launch.tags, ["ops", "ssh"]);
    assert.deepEqual(createdProfile.launch.remoteConnection, {
      host: "ops.internal",
      port: 2222,
      username: "deploy"
    });
    assert.deepEqual(createdProfile.launch.remoteAuth, {
      method: "privateKey",
      privateKeyPath: "~/.ssh/ops"
    });

    const createSessionRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionProfileId: profileId,
        name: "ops-shell"
      })
    });
    assert.equal(createSessionRes.status, 201);
    const createdSession = await createSessionRes.json();
    assert.equal(createdSession.name, "ops-shell");
    assert.equal(createdSession.deckId, "ops");
    assert.equal(createdSession.kind, "ssh");
    assert.equal(createdSession.shell, "ssh");
    assert.equal(createdSession.cwd, "~/workspace");
    assert.deepEqual(createdSession.tags, ["ops", "ssh"]);
    assert.deepEqual(createdSession.remoteConnection, {
      host: "ops.internal",
      port: 2222,
      username: "deploy"
    });
    assert.deepEqual(createdSession.remoteAuth, {
      method: "privateKey",
      privateKeyPath: "~/.ssh/ops"
    });
    assert.equal(spawnCalls.at(-1).command, "ssh");

    const deleteSessionRes = await fetch(`${baseUrlA}/sessions/${createdSession.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteSessionRes.status, 204);

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    assert.ok(Array.isArray(persistedRaw.connectionProfiles));
    assert.equal(persistedRaw.connectionProfiles.length, 1);
    assert.equal(persistedRaw.connectionProfiles[0].id, profileId);
    assert.equal(persistedRaw.connectionProfiles[0].launch.deckId, "ops");
    assert.equal(persistedRaw.connectionProfiles[0].launch.remoteSecret, undefined);
  } finally {
    await runtimeA.stop();
  }

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeB.start();
  const { port: portB } = runtimeB.getAddress();
  const baseUrlB = `http://127.0.0.1:${portB}/api/v1`;

  try {
    const listProfilesRes = await fetch(`${baseUrlB}/connection-profiles`);
    assert.equal(listProfilesRes.status, 200);
    const listedProfiles = await listProfilesRes.json();
    assert.equal(listedProfiles.length, 1);
    assert.equal(listedProfiles[0].id, profileId);
    assert.equal(listedProfiles[0].launch.deckId, "ops");

    const createSessionRes = await fetch(`${baseUrlB}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionProfileId: profileId
      })
    });
    assert.equal(createSessionRes.status, 201);
    const launchedSession = await createSessionRes.json();
    assert.equal(launchedSession.deckId, "ops");
    assert.equal(launchedSession.kind, "ssh");

    const deleteSessionRes = await fetch(`${baseUrlB}/sessions/${launchedSession.id}`, {
      method: "DELETE"
    });
    assert.equal(deleteSessionRes.status, 204);

    const deleteDeckRes = await fetch(`${baseUrlB}/decks/ops?force=true`, {
      method: "DELETE"
    });
    assert.equal(deleteDeckRes.status, 204);

    const cleanedProfileRes = await fetch(`${baseUrlB}/connection-profiles/${profileId}`);
    assert.equal(cleanedProfileRes.status, 200);
    const cleanedProfile = await cleanedProfileRes.json();
    assert.equal(cleanedProfile.launch.deckId, "default");

    const deleteProfileRes = await fetch(`${baseUrlB}/connection-profiles/${profileId}`, {
      method: "DELETE"
    });
    assert.equal(deleteProfileRes.status, 204);

    const emptyListRes = await fetch(`${baseUrlB}/connection-profiles`);
    assert.equal(emptyListRes.status, 200);
    assert.deepEqual(await emptyListRes.json(), []);
  } finally {
    await runtimeB.stop();
  }
});

test("workspace preset lifecycle persists, restores, and cleans up deleted references", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-workspace-presets-"));
  const dataPath = join(dir, "sessions.json");
  const firstRuntime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await firstRuntime.start();
  const firstPort = firstRuntime.getAddress().port;
  const firstBaseUrl = `http://127.0.0.1:${firstPort}/api/v1`;

  let defaultSessionId = "";
  let opsSessionId = "";
  let workspacePresetId = "";

  try {
    const createDefaultSessionRes = await fetch(`${firstBaseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", name: "default-shell" })
    });
    assert.equal(createDefaultSessionRes.status, 201);
    defaultSessionId = (await createDefaultSessionRes.json()).id;

    const createOpsSessionRes = await fetch(`${firstBaseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", name: "ops-shell" })
    });
    assert.equal(createOpsSessionRes.status, 201);
    opsSessionId = (await createOpsSessionRes.json()).id;

    const createDeckRes = await fetch(`${firstBaseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ops", name: "Ops", settings: { terminal: { cols: 100, rows: 32 } } })
    });
    assert.equal(createDeckRes.status, 201);

    const moveRes = await fetch(`${firstBaseUrl}/decks/ops/sessions/${opsSessionId}:move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(moveRes.status, 204);

    const createLayoutProfileRes = await fetch(`${firstBaseUrl}/layout-profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "focus",
        name: "Focus Layout",
        layout: {
          activeDeckId: "ops",
          sidebarVisible: true,
          sessionFilterText: "",
          deckTerminalSettings: {
            default: { cols: 96, rows: 24 },
            ops: { cols: 132, rows: 40 }
          }
        }
      })
    });
    assert.equal(createLayoutProfileRes.status, 201);

    const createWorkspacePresetRes = await fetch(`${firstBaseUrl}/workspace-presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ops Workspace",
        workspace: {
          activeDeckId: "ops",
          layoutProfileId: "focus",
          controlPaneVisible: false,
          controlPanePosition: "right",
          controlPaneSize: 300,
          deckGroups: {
            default: {
              activeGroupId: "primary",
              groups: [
                {
                  id: "primary",
                  name: "Primary",
                  sessionIds: [defaultSessionId]
                }
              ]
            },
            ops: {
              activeGroupId: "runner",
              groups: [
                {
                  id: "runner",
                  name: "Runner",
                  sessionIds: [opsSessionId]
                }
              ]
            }
          },
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: [defaultSessionId]
              }
            },
            ops: {
              root: { type: "pane", paneId: "runner-pane" },
              paneSessions: {
                "runner-pane": [opsSessionId]
              }
            }
          }
        }
      })
    });
    assert.equal(createWorkspacePresetRes.status, 201);
    const createdPreset = await createWorkspacePresetRes.json();
    workspacePresetId = createdPreset.id;
    assert.equal(createdPreset.workspace.activeDeckId, "ops");
    assert.equal(createdPreset.workspace.layoutProfileId, "focus");
    assert.equal(createdPreset.workspace.controlPaneVisible, false);
    assert.equal(createdPreset.workspace.controlPanePosition, "right");
    assert.equal(createdPreset.workspace.controlPaneSize, 300);

    const patchWorkspacePresetRes = await fetch(`${firstBaseUrl}/workspace-presets/${workspacePresetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ops Workspace Updated",
        workspace: {
          activeDeckId: "ops",
          layoutProfileId: "focus",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckGroups: {
            default: {
              activeGroupId: "primary",
              groups: [
                {
                  id: "primary",
                  name: "Primary",
                  sessionIds: [defaultSessionId]
                }
              ]
            },
            ops: {
              activeGroupId: "runner",
              groups: [
                {
                  id: "runner",
                  name: "Runner",
                  sessionIds: [opsSessionId]
                }
              ]
            }
          },
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: [defaultSessionId]
              }
            },
            ops: {
              root: { type: "pane", paneId: "runner-pane" },
              paneSessions: {
                "runner-pane": [opsSessionId]
              }
            }
          }
        }
      })
    });
    assert.equal(patchWorkspacePresetRes.status, 200);
    const updatedPreset = await patchWorkspacePresetRes.json();
    assert.equal(updatedPreset.name, "Ops Workspace Updated");
    assert.equal(updatedPreset.workspace.controlPaneVisible, true);
    assert.equal(updatedPreset.workspace.controlPanePosition, "bottom");
    assert.equal(updatedPreset.workspace.controlPaneSize, 240);

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    assert.ok(Array.isArray(persistedRaw.workspacePresets));
    assert.equal(persistedRaw.workspacePresets.length, 1);
    assert.equal(persistedRaw.workspacePresets[0].name, "Ops Workspace Updated");
    assert.equal(persistedRaw.workspacePresets[0].workspace.controlPaneVisible, true);
    assert.equal(persistedRaw.workspacePresets[0].workspace.controlPanePosition, "bottom");
    assert.equal(persistedRaw.workspacePresets[0].workspace.controlPaneSize, 240);
  } finally {
    await firstRuntime.stop();
  }

  const secondRuntime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await secondRuntime.start();
  const secondPort = secondRuntime.getAddress().port;
  const secondBaseUrl = `http://127.0.0.1:${secondPort}/api/v1`;

  try {
    const listWorkspacePresetsRes = await fetch(`${secondBaseUrl}/workspace-presets`);
    assert.equal(listWorkspacePresetsRes.status, 200);
    const restoredPresets = await listWorkspacePresetsRes.json();
    assert.equal(restoredPresets.length, 1);
    assert.equal(restoredPresets[0].id, workspacePresetId);
    assert.equal(restoredPresets[0].name, "Ops Workspace Updated");
    assert.equal(restoredPresets[0].workspace.layoutProfileId, "focus");
    assert.equal(restoredPresets[0].workspace.controlPaneVisible, true);
    assert.equal(restoredPresets[0].workspace.controlPanePosition, "bottom");
    assert.equal(restoredPresets[0].workspace.controlPaneSize, 240);
    assert.deepEqual(restoredPresets[0].workspace.deckSplitLayouts.default.paneSessions.main, [defaultSessionId]);
    assert.deepEqual(restoredPresets[0].workspace.deckSplitLayouts.ops.paneSessions["runner-pane"], [opsSessionId]);

    const deleteDefaultSessionRes = await fetch(`${secondBaseUrl}/sessions/${defaultSessionId}`, {
      method: "DELETE"
    });
    assert.equal(deleteDefaultSessionRes.status, 204);

    const deleteLayoutProfileRes = await fetch(`${secondBaseUrl}/layout-profiles/focus`, {
      method: "DELETE"
    });
    assert.equal(deleteLayoutProfileRes.status, 204);

    const deleteDeckRes = await fetch(`${secondBaseUrl}/decks/ops?force=true`, {
      method: "DELETE"
    });
    assert.equal(deleteDeckRes.status, 204);

    const getWorkspacePresetRes = await fetch(`${secondBaseUrl}/workspace-presets/${workspacePresetId}`);
    assert.equal(getWorkspacePresetRes.status, 200);
    const cleanedPreset = await getWorkspacePresetRes.json();
    assert.equal(cleanedPreset.workspace.activeDeckId, "default");
    assert.equal(cleanedPreset.workspace.layoutProfileId, undefined);
    assert.equal(cleanedPreset.workspace.deckGroups.ops, undefined);
    assert.deepEqual(cleanedPreset.workspace.deckGroups.default.groups[0].sessionIds, []);
    assert.equal(cleanedPreset.workspace.deckSplitLayouts.ops, undefined);
    assert.deepEqual(cleanedPreset.workspace.deckSplitLayouts.default.paneSessions.main, []);

    const deleteWorkspacePresetRes = await fetch(`${secondBaseUrl}/workspace-presets/${workspacePresetId}`, {
      method: "DELETE"
    });
    assert.equal(deleteWorkspacePresetRes.status, 204);

    const emptyWorkspacePresetListRes = await fetch(`${secondBaseUrl}/workspace-presets`);
    assert.equal(emptyWorkspacePresetListRes.status, 200);
    const emptyPresets = await emptyWorkspacePresetListRes.json();
    assert.deepEqual(emptyPresets, []);
  } finally {
    await secondRuntime.stop();
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

    const unknownInterruptRes = await fetch(`${baseUrl}/sessions/unknown/interrupt`, {
      method: "POST"
    });
    assert.equal(unknownInterruptRes.status, 404);
    const unknownInterruptBody = await unknownInterruptRes.json();
    assert.equal(unknownInterruptBody.error, "SessionNotFound");

    const unknownTerminateRes = await fetch(`${baseUrl}/sessions/unknown/terminate`, {
      method: "POST"
    });
    assert.equal(unknownTerminateRes.status, 404);
    const unknownTerminateBody = await unknownTerminateRes.json();
    assert.equal(unknownTerminateBody.error, "SessionNotFound");

    const unknownKillRes = await fetch(`${baseUrl}/sessions/unknown/kill`, {
      method: "POST"
    });
    assert.equal(unknownKillRes.status, 404);
    const unknownKillBody = await unknownKillRes.json();
    assert.equal(unknownKillBody.error, "SessionNotFound");

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
  assert.ok(persistedSession.updatedAt >= updatedAt);
  updatedAt = persistedSession.updatedAt;

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

test("runtime persists bounded replay output when configured and restores it into snapshot replay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 6
  });

  let createdId = "";
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

    const inputRes = await fetch(`${baseUrlA}/sessions/${createdId}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "1234567890" })
    });
    assert.equal(inputRes.status, 204);
  } finally {
    await runtimeA.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  assert.ok(Array.isArray(persistedRaw.sessionOutputs));
  assert.deepEqual(persistedRaw.sessionOutputs, [{ sessionId: createdId, data: "567890", truncated: true }]);

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 6
  });

  try {
    await runtimeB.start();
    const snapshot = runtimeB.manager.getSnapshot();
    assert.deepEqual(snapshot.outputs, [{ sessionId: createdId, data: "567890" }]);
  } finally {
    await runtimeB.stop();
  }
});

test("runtime persists an empty truncated replay marker when persist depth is zero", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 0
  });

  let createdId = "";
  try {
    await runtime.start();
    const { port } = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdId = created.id;

    const inputRes = await fetch(`${baseUrl}/sessions/${createdId}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "abcdef" })
    });
    assert.equal(inputRes.status, 204);
  } finally {
    await runtime.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  assert.ok(Array.isArray(persistedRaw.sessionOutputs));
  assert.deepEqual(persistedRaw.sessionOutputs, [{ sessionId: createdId, data: "", truncated: true }]);
});

test("session replay export endpoint returns deterministic empty-tail metadata for a new session", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const exportRes = await fetch(`${baseUrl}/sessions/${created.id}/replay-export`);
    assert.equal(exportRes.status, 200);
    const payload = await exportRes.json();

    assert.equal(payload.sessionId, created.id);
    assert.equal(payload.sessionState, created.state);
    assert.equal(payload.scope, "retained_replay_tail");
    assert.equal(payload.format, "text");
    assert.equal(payload.contentType, "text/plain; charset=utf-8");
    assert.equal(payload.fileName, `ptydeck-session-${created.id}-replay.txt`);
    assert.equal(payload.data, "");
    assert.equal(payload.retainedChars, 0);
    assert.equal(payload.retentionLimitChars, 12);
    assert.equal(payload.truncated, false);
  } finally {
    await runtime.stop();
  }
});

test("session replay export endpoint reports truncation for active retained tails", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 5
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh" })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const inputRes = await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "1234567890" })
    });
    assert.equal(inputRes.status, 204);

    const exportRes = await fetch(`${baseUrl}/sessions/${created.id}/replay-export`);
    assert.equal(exportRes.status, 200);
    const payload = await exportRes.json();

    assert.equal(payload.sessionId, created.id);
    assert.equal(payload.sessionState, "running");
    assert.equal(payload.data, "67890");
    assert.equal(payload.retainedChars, 5);
    assert.equal(payload.retentionLimitChars, 5);
    assert.equal(payload.truncated, true);
  } finally {
    await runtime.stop();
  }
});

test("session replay export endpoint preserves truncation metadata across restart-restored replay tails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 6
  });

  let createdId = "";
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

    const inputRes = await fetch(`${baseUrlA}/sessions/${createdId}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "1234567890" })
    });
    assert.equal(inputRes.status, 204);
  } finally {
    await runtimeA.stop();
  }

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 6
  });

  try {
    await runtimeB.start();
    const { port } = runtimeB.getAddress();
    const baseUrlB = `http://127.0.0.1:${port}/api/v1`;

    const exportRes = await fetch(`${baseUrlB}/sessions/${createdId}/replay-export`);
    assert.equal(exportRes.status, 200);
    const payload = await exportRes.json();

    assert.equal(payload.sessionId, createdId);
    assert.equal(payload.sessionState, "running");
    assert.equal(payload.data, "567890");
    assert.equal(payload.retainedChars, 6);
    assert.equal(payload.retentionLimitChars, 12);
    assert.equal(payload.truncated, true);
  } finally {
    await runtimeB.stop();
  }
});

test("session replay export endpoint serves retained persisted tails for unrestored sessions", async () => {
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
        sessionOutputs: [{ sessionId: unrestoredSessionId, data: "567890", truncated: true }],
        customCommands: [],
        decks: []
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
    sessionMaxConcurrent: 1,
    sessionReplayMemoryMaxChars: 12,
    sessionReplayPersistMaxChars: 6,
    startupWarmupQuietMs: 20
  });

  try {
    await runtime.start();
    const { port } = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    const exportRes = await fetch(`${baseUrl}/sessions/${unrestoredSessionId}/replay-export`);
    assert.equal(exportRes.status, 200);
    const payload = await exportRes.json();

    assert.equal(payload.sessionId, unrestoredSessionId);
    assert.equal(payload.sessionState, "unrestored");
    assert.equal(payload.data, "567890");
    assert.equal(payload.retainedChars, 6);
    assert.equal(payload.retentionLimitChars, 6);
    assert.equal(payload.truncated, true);
  } finally {
    await runtime.stop();
  }
});

test("session replay export endpoint returns not found for unknown sessions", async () => {
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: createFallbackAwarePtyFactory()
  });

  try {
    const exportRes = await fetch(`${baseUrl}/sessions/does-not-exist/replay-export`);
    assert.equal(exportRes.status, 404);
    const payload = await exportRes.json();
    assert.equal(payload.error, "SessionNotFound");
  } finally {
    await runtime.stop();
  }
});

test("session file transfer upload and download endpoints normalize paths and persist local files", async () => {
  const sessionRoot = await mkdtemp(join(tmpdir(), "ptydeck-transfer-root-"));
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: createFallbackAwarePtyFactory(),
    sessionFileTransferMaxBytes: 64
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", cwd: sessionRoot })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const uploadRes = await fetch(`${baseUrl}/sessions/${created.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "./logs/../logs/output.txt",
        contentBase64: Buffer.from("hello transfer", "utf8").toString("base64")
      })
    });
    assert.equal(uploadRes.status, 200);
    const uploadPayload = await uploadRes.json();
    assert.equal(uploadPayload.sessionId, created.id);
    assert.equal(uploadPayload.path, "logs/output.txt");
    assert.equal(uploadPayload.fileName, "output.txt");
    assert.equal(uploadPayload.sizeBytes, "hello transfer".length);
    assert.equal(uploadPayload.created, true);

    const uploadOverwriteRes = await fetch(`${baseUrl}/sessions/${created.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "logs/output.txt",
        contentBase64: Buffer.from("updated", "utf8").toString("base64")
      })
    });
    assert.equal(uploadOverwriteRes.status, 200);
    const overwritePayload = await uploadOverwriteRes.json();
    assert.equal(overwritePayload.created, false);

    const stored = await readFile(join(sessionRoot, "logs", "output.txt"), "utf8");
    assert.equal(stored, "updated");

    const downloadRes = await fetch(`${baseUrl}/sessions/${created.id}/file-transfer/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "logs/output.txt" })
    });
    assert.equal(downloadRes.status, 200);
    const downloadPayload = await downloadRes.json();
    assert.equal(downloadPayload.sessionId, created.id);
    assert.equal(downloadPayload.path, "logs/output.txt");
    assert.equal(downloadPayload.fileName, "output.txt");
    assert.equal(downloadPayload.contentType, "application/octet-stream");
    assert.equal(downloadPayload.encoding, "base64");
    assert.equal(downloadPayload.sizeBytes, "updated".length);
    assert.equal(Buffer.from(downloadPayload.contentBase64, "base64").toString("utf8"), "updated");
  } finally {
    await runtime.stop();
  }
});

test("session file transfer endpoints reject traversal, missing files, oversize payloads, and ssh sessions", async () => {
  const sessionRoot = await mkdtemp(join(tmpdir(), "ptydeck-transfer-root-"));
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: createFallbackAwarePtyFactory(),
    sessionFileTransferMaxBytes: 4
  });

  try {
    const localCreateRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "sh", cwd: sessionRoot })
    });
    assert.equal(localCreateRes.status, 201);
    const localSession = await localCreateRes.json();

    const traversalRes = await fetch(`${baseUrl}/sessions/${localSession.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "../escape.txt",
        contentBase64: Buffer.from("nope", "utf8").toString("base64")
      })
    });
    assert.equal(traversalRes.status, 400);
    const traversalBody = await traversalRes.json();
    assert.equal(traversalBody.error, "ValidationError");

    const missingDownloadRes = await fetch(`${baseUrl}/sessions/${localSession.id}/file-transfer/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "missing.txt" })
    });
    assert.equal(missingDownloadRes.status, 404);
    const missingDownloadBody = await missingDownloadRes.json();
    assert.equal(missingDownloadBody.error, "FileNotFound");

    const oversizeUploadRes = await fetch(`${baseUrl}/sessions/${localSession.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "large.txt",
        contentBase64: Buffer.from("12345", "utf8").toString("base64")
      })
    });
    assert.equal(oversizeUploadRes.status, 413);
    const oversizeUploadBody = await oversizeUploadRes.json();
    assert.equal(oversizeUploadBody.error, "FileTransferTooLarge");

    await writeFile(join(sessionRoot, "big.txt"), "12345", "utf8");
    const oversizeDownloadRes = await fetch(`${baseUrl}/sessions/${localSession.id}/file-transfer/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "big.txt" })
    });
    assert.equal(oversizeDownloadRes.status, 413);
    const oversizeDownloadBody = await oversizeDownloadRes.json();
    assert.equal(oversizeDownloadBody.error, "FileTransferTooLarge");

    const sshCreateRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "privateKey"
        }
      })
    });
    assert.equal(sshCreateRes.status, 201);
    const sshSession = await sshCreateRes.json();

    const sshTransferRes = await fetch(`${baseUrl}/sessions/${sshSession.id}/file-transfer/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "remote.txt" })
    });
    assert.equal(sshTransferRes.status, 409);
    const sshTransferBody = await sshTransferRes.json();
    assert.equal(sshTransferBody.error, "FileTransferUnsupported");
  } finally {
    await runtime.stop();
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

test("quick-id swaps persist across restart restore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    startupWarmupQuietMs: 20
  });
  await runtimeA.start();
  const { port: portA } = runtimeA.getAddress();
  const baseUrlA = `http://127.0.0.1:${portA}/api/v1`;

  let leftId = "";
  let rightId = "";
  try {
    const leftRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "left" })
    });
    assert.equal(leftRes.status, 201);
    const leftSession = await leftRes.json();
    leftId = leftSession.id;
    assert.equal(leftSession.quickIdToken, "1");

    const rightRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "right" })
    });
    assert.equal(rightRes.status, 201);
    const rightSession = await rightRes.json();
    rightId = rightSession.id;
    assert.equal(rightSession.quickIdToken, "2");

    const swapRes = await fetch(`${baseUrlA}/sessions/${leftId}/swap-quick-id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ otherSessionId: rightId })
    });
    assert.equal(swapRes.status, 200);
    const swapped = await swapRes.json();
    assert.equal(swapped.leftSession.quickIdToken, "2");
    assert.equal(swapped.rightSession.quickIdToken, "1");

    const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
    const persistedSessions = Array.isArray(persistedRaw) ? persistedRaw : persistedRaw.sessions;
    const persistedLeft = persistedSessions.find((session) => session.id === leftId);
    const persistedRight = persistedSessions.find((session) => session.id === rightId);
    assert.ok(persistedLeft);
    assert.ok(persistedRight);
    assert.equal(persistedLeft.quickIdToken, "2");
    assert.equal(persistedRight.quickIdToken, "1");
  } finally {
    await runtimeA.stop();
  }

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    createPty: createFallbackAwarePtyFactory(),
    startupWarmupQuietMs: 20
  });
  await runtimeB.start();
  const { port: portB } = runtimeB.getAddress();
  const baseUrlB = `http://127.0.0.1:${portB}/api/v1`;

  try {
    const listRes = await fetch(`${baseUrlB}/sessions`);
    assert.equal(listRes.status, 200);
    const sessions = await listRes.json();
    const restoredLeft = sessions.find((session) => session.id === leftId);
    const restoredRight = sessions.find((session) => session.id === rightId);
    assert.ok(restoredLeft);
    assert.ok(restoredRight);
    assert.equal(restoredLeft.quickIdToken, "2");
    assert.equal(restoredRight.quickIdToken, "1");
  } finally {
    await runtimeB.stop();
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
    createPty: createFallbackAwarePtyFactory(),
    startupWarmupQuietMs: 20
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

test("runtime restore normalizes duplicate persisted quick-id tokens to unique values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: "dup-a",
            cwd: homedir(),
            shell: "sh",
            startCwd: homedir(),
            quickIdToken: "1",
            createdAt: 1,
            updatedAt: 1
          },
          {
            id: "dup-b",
            cwd: homedir(),
            shell: "sh",
            startCwd: homedir(),
            quickIdToken: "1",
            createdAt: 2,
            updatedAt: 2
          }
        ],
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
    createPty: createFallbackAwarePtyFactory(),
    startupWarmupQuietMs: 20
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    const listRes = await fetch(`${baseUrl}/sessions`);
    assert.equal(listRes.status, 200);
    const sessions = await listRes.json();
    const first = sessions.find((session) => session.id === "dup-a");
    const second = sessions.find((session) => session.id === "dup-b");
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.quickIdToken, "1");
    assert.equal(second.quickIdToken, "2");
    assert.notEqual(first.quickIdToken, second.quickIdToken);
  } finally {
    await runtime.stop();
  }
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

test("ssh session contract persists normalized metadata and restores through the same session model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const spawnCalls = [];
  const fallbackFactory = createFallbackAwarePtyFactory();
  const createPty = (options) => {
    spawnCalls.push({
      command: options.command || options.shell,
      shell: options.shell,
      cwd: options.cwd,
      args: Array.isArray(options.args) ? [...options.args] : []
    });
    return fallbackFactory(options);
  };

  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeA.start();
  const { port: portA } = runtimeA.getAddress();
  const baseUrlA = `http://127.0.0.1:${portA}/api/v1`;

  let createdId = "";
  try {
    const createRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 2222,
          username: "ops"
        },
        startCwd: "~/workspace",
        startCommand: "pwd"
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdId = created.id;
    assert.equal(created.kind, "ssh");
    assert.equal(created.shell, "ssh");
    assert.equal(created.cwd, "~/workspace");
    assert.deepEqual(created.remoteConnection, {
      host: "example.internal",
      port: 2222,
      username: "ops"
    });
    assert.equal(spawnCalls.at(-1).command, "ssh");
    assert.equal(spawnCalls.at(-1).shell, "ssh");
    assert.equal(spawnCalls.at(-1).cwd, homedir());
    assert.deepEqual(spawnCalls.at(-1).args.slice(0, 24), [
      "-tt",
      "-o",
      "ClearAllForwardings=yes",
      "-o",
      "ForwardAgent=no",
      "-o",
      "ForwardX11=no",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${join(dir, "ssh_known_hosts")}`,
      "-o",
      "GlobalKnownHostsFile=/dev/null",
      "-o",
      "PreferredAuthentications=publickey",
      "-o",
      "PasswordAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no",
      "-p",
      "2222",
      "-l",
      "ops",
      "example.internal"
    ]);
    assert.match(spawnCalls.at(-1).args[24], /^sh -lc '/);
    assert.match(spawnCalls.at(-1).args[24], /pwd/);
  } finally {
    await runtimeA.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSessions = Array.isArray(persistedRaw.sessions) ? persistedRaw.sessions : [];
  const persistedSession = persistedSessions.find((session) => session.id === createdId);
  assert.ok(persistedSession);
  assert.equal(persistedSession.kind, "ssh");
  assert.deepEqual(persistedSession.remoteConnection, {
    host: "example.internal",
    port: 2222,
    username: "ops"
  });

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeB.start();
  const { port: portB } = runtimeB.getAddress();
  const baseUrlB = `http://127.0.0.1:${portB}/api/v1`;

  try {
    const getRes = await fetch(`${baseUrlB}/sessions/${createdId}`);
    assert.equal(getRes.status, 200);
    const restored = await getRes.json();
    assert.equal(restored.id, createdId);
    assert.equal(restored.kind, "ssh");
    assert.equal(restored.shell, "ssh");
    assert.equal(restored.cwd, "~/workspace");
    assert.deepEqual(restored.remoteConnection, {
      host: "example.internal",
      port: 2222,
      username: "ops"
    });
    assert.equal(spawnCalls.at(-1).command, "ssh");
  } finally {
    await runtimeB.stop();
  }
});

test("password-auth ssh sessions persist metadata but fail closed into unrestored state after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const spawnCalls = [];
  const fallbackFactory = createFallbackAwarePtyFactory();
  const createPty = (options) => {
    spawnCalls.push({
      command: options.command || options.shell,
      shell: options.shell,
      cwd: options.cwd,
      args: Array.isArray(options.args) ? [...options.args] : [],
      env: {
        SSH_ASKPASS: options.env?.SSH_ASKPASS,
        SSH_ASKPASS_REQUIRE: options.env?.SSH_ASKPASS_REQUIRE,
        DISPLAY: options.env?.DISPLAY,
        PTYDECK_SSH_SECRET: options.env?.PTYDECK_SSH_SECRET
      }
    });
    return fallbackFactory(options);
  };

  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeA.start();
  const { port: portA } = runtimeA.getAddress();
  const baseUrlA = `http://127.0.0.1:${portA}/api/v1`;

  let createdId = "";
  try {
    const createRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "password"
        },
        remoteSecret: "super-secret"
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdId = created.id;
    assert.deepEqual(created.remoteAuth, { method: "password" });
    assert.equal("remoteSecret" in created, false);
    assert.equal(spawnCalls.at(-1).env.SSH_ASKPASS_REQUIRE, "force");
    assert.equal(spawnCalls.at(-1).env.DISPLAY, "ptydeck-ssh-askpass");
    assert.equal(spawnCalls.at(-1).env.PTYDECK_SSH_SECRET, "super-secret");
  } finally {
    await runtimeA.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  const persistedSessions = Array.isArray(persistedRaw.sessions) ? persistedRaw.sessions : [];
  const persistedSession = persistedSessions.find((session) => session.id === createdId);
  assert.ok(persistedSession);
  assert.deepEqual(persistedSession.remoteAuth, { method: "password" });
  assert.equal("remoteSecret" in persistedSession, false);

  const spawnCountBeforeRestore = spawnCalls.length;
  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtimeB.start();
  const { port: portB } = runtimeB.getAddress();
  const baseUrlB = `http://127.0.0.1:${portB}/api/v1`;

  try {
    assert.equal(spawnCalls.length, spawnCountBeforeRestore);
    const getRes = await fetch(`${baseUrlB}/sessions/${createdId}`);
    assert.equal(getRes.status, 200);
    const restored = await getRes.json();
    assert.equal(restored.state, "unrestored");
    assert.equal(restored.kind, "ssh");
    assert.deepEqual(restored.remoteAuth, { method: "password" });
  } finally {
    await runtimeB.stop();
  }
});

test("runtime restore normalizes invalid persisted ssh auth metadata to safe defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const sessionId = "restore-invalid-ssh-auth";
  const spawnCalls = [];
  const createPty = (options) => {
    spawnCalls.push({
      command: options.command || options.shell,
      args: Array.isArray(options.args) ? [...options.args] : []
    });
    return createFallbackAwarePtyFactory()(options);
  };

  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: sessionId,
            kind: "ssh",
            remoteConnection: {
              host: "example.internal",
              port: 99999,
              username: "ops user"
            },
            remoteAuth: {
              method: "token"
            },
            cwd: "~/workspace",
            shell: "ssh",
            name: "invalid-ssh-auth",
            startCwd: "~/workspace",
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: 1710000000000,
            updatedAt: 1710000000500
          }
        ],
        customCommands: [],
        sessionOutputs: []
      },
      null,
      2
    )
  );

  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    const getRes = await fetch(`${baseUrl}/sessions/${sessionId}`);
    assert.equal(getRes.status, 200);
    const restored = await getRes.json();
    assert.equal(restored.state, "running");
    assert.equal(restored.kind, "ssh");
    assert.deepEqual(restored.remoteConnection, {
      host: "example.internal",
      port: 22
    });
    assert.deepEqual(restored.remoteAuth, { method: "privateKey" });
    assert.equal(spawnCalls.length, 1);
    assert.ok(spawnCalls[0].args.includes("PreferredAuthentications=publickey"));
  } finally {
    await runtime.stop();
  }
});

test("ssh sessions expose degraded then connected remote runtime metadata after bounded reconnect", async () => {
  const ptys = [];
  const createPty = () => {
    let exitHandler = null;
    let dataHandler = null;
    const ptyInstance = {
      onExit(handler) {
        exitHandler = handler;
      },
      onData(handler) {
        dataHandler = handler;
      },
      write() {},
      resize() {},
      kill() {
        if (exitHandler) {
          exitHandler({ exitCode: 255, signal: "" });
        }
      },
      emitData(data) {
        if (dataHandler) {
          dataHandler(data);
        }
      },
      emitExit(payload = { exitCode: 255, signal: "" }) {
        if (exitHandler) {
          exitHandler(payload);
        }
      }
    };
    ptys.push(ptyInstance);
    return ptyInstance;
  };

  const { runtime, baseUrl } = await createStartedRuntime({
    createPty,
    remoteReconnectDelayMs: 5,
    remoteReconnectStableMs: 5
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "privateKey"
        }
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.remoteRuntime.connectivityState, "connected");
    assert.equal(created.remoteRuntime.reconnectPolicy.maxAttempts, 3);

    ptys[0].emitExit();

    await waitFor(async () => {
      const res = await fetch(`${baseUrl}/sessions/${created.id}`);
      const body = await res.json();
      return body.remoteRuntime?.connectivityState === "degraded";
    });

    await waitFor(() => ptys.length >= 2);
    ptys[1].emitData("reconnected\n");

    await waitFor(async () => {
      const res = await fetch(`${baseUrl}/sessions/${created.id}`);
      const body = await res.json();
      return body.remoteRuntime?.connectivityState === "connected" && body.remoteRuntime?.reconnectAttempts === 0;
    });

    const getRes = await fetch(`${baseUrl}/sessions/${created.id}`);
    assert.equal(getRes.status, 200);
    const reconnected = await getRes.json();
    assert.equal(reconnected.state, "running");
    assert.equal(reconnected.remoteRuntime.connectivityState, "connected");
    assert.equal(reconnected.remoteRuntime.reconnectAttempts, 0);
    assert.equal(typeof reconnected.remoteRuntime.lastReconnectAt, "number");
  } finally {
    await runtime.stop();
  }
});

test("ssh sessions become offline after bounded reconnect retries and reject direct input", async () => {
  const remoteRetryWaitMs = 20000;
  const ptys = [];
  const createPty = () => {
    let exitHandler = null;
    const ptyInstance = {
      onExit(handler) {
        exitHandler = handler;
      },
      onData() {},
      write() {},
      resize() {},
      kill() {
        if (exitHandler) {
          exitHandler({ exitCode: 255, signal: "" });
        }
      },
      emitExit(payload = { exitCode: 255, signal: "" }) {
        if (exitHandler) {
          exitHandler(payload);
        }
      }
    };
    ptys.push(ptyInstance);
    return ptyInstance;
  };

  const { runtime, baseUrl } = await createStartedRuntime({
    createPty,
    remoteReconnectMaxAttempts: 2,
    remoteReconnectDelayMs: 5,
    remoteReconnectStableMs: 5
  });

  try {
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 22
        },
        remoteAuth: {
          method: "privateKey"
        }
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    ptys[0].emitExit();
    await waitFor(() => ptys.length >= 2, remoteRetryWaitMs);
    ptys[1].emitExit();
    await waitFor(() => ptys.length >= 3, remoteRetryWaitMs);
    ptys[2].emitExit();

    await waitFor(async () => {
      const res = await fetch(`${baseUrl}/sessions/${created.id}`);
      const body = await res.json();
      return body.remoteRuntime?.connectivityState === "offline";
    }, remoteRetryWaitMs);

    const getRes = await fetch(`${baseUrl}/sessions/${created.id}`);
    assert.equal(getRes.status, 200);
    const offline = await getRes.json();
    assert.equal(offline.remoteRuntime.connectivityState, "offline");
    assert.equal(offline.remoteRuntime.reconnectAttempts, 2);
    assert.equal(typeof offline.remoteRuntime.disconnectedAt, "number");

    const inputRes = await fetch(`${baseUrl}/sessions/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "pwd\n" })
    });
    assert.equal(inputRes.status, 409);
    const errorBody = await inputRes.json();
    assert.equal(errorBody.error, "RemoteSessionOffline");

    const restartRes = await fetch(`${baseUrl}/sessions/${created.id}/restart`, {
      method: "POST"
    });
    assert.equal(restartRes.status, 200);
    const restarted = await restartRes.json();
    assert.equal(restarted.state, "running");
    assert.equal(restarted.remoteRuntime.connectivityState, "connected");
  } finally {
    await runtime.stop();
  }
});

test("ssh trust entries persist, render managed known_hosts, and reject conflicting replacements", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-ssh-trust-"));
  const dataPath = join(dir, "sessions.json");
  const knownHostsPath = join(dir, "ssh_known_hosts");
  const runtimeA = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await runtimeA.start();
  const { port: portA } = runtimeA.getAddress();
  const baseUrlA = `http://127.0.0.1:${portA}/api/v1`;

  let createdEntryId = "";
  try {
    const createRes = await fetch(`${baseUrlA}/ssh-trust-entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "example.internal",
        port: 2222,
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdEntryId = created.id;
    assert.equal(created.host, "example.internal");
    assert.equal(created.port, 2222);
    assert.equal(created.keyType, "ssh-ed25519");
    assert.match(created.id, /^trust-[a-f0-9]{24}$/);
    assert.match(created.fingerprintSha256, /^SHA256:/);

    const knownHostsRaw = await readFile(knownHostsPath, "utf8");
    assert.equal(
      knownHostsRaw,
      "[example.internal]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM\n"
    );

    const reuseRes = await fetch(`${baseUrlA}/ssh-trust-entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "example.internal",
        port: 2222,
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      })
    });
    assert.equal(reuseRes.status, 200);
    const reused = await reuseRes.json();
    assert.equal(reused.id, createdEntryId);

    const conflictRes = await fetch(`${baseUrlA}/ssh-trust-entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: "example.internal",
        port: 2222,
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      })
    });
    assert.equal(conflictRes.status, 409);
  } finally {
    await runtimeA.stop();
  }

  const persistedRaw = JSON.parse(await readFile(dataPath, "utf8"));
  assert.equal(Array.isArray(persistedRaw.sshTrustEntries), true);
  assert.equal(persistedRaw.sshTrustEntries.length, 1);
  assert.equal(persistedRaw.sshTrustEntries[0].id, createdEntryId);

  const runtimeB = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await runtimeB.start();
  const { port: portB } = runtimeB.getAddress();
  const baseUrlB = `http://127.0.0.1:${portB}/api/v1`;

  try {
    const listRes = await fetch(`${baseUrlB}/ssh-trust-entries`);
    assert.equal(listRes.status, 200);
    const entries = await listRes.json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, createdEntryId);

    const deleteRes = await fetch(`${baseUrlB}/ssh-trust-entries/${createdEntryId}`, {
      method: "DELETE"
    });
    assert.equal(deleteRes.status, 204);

    const emptyKnownHostsRaw = await readFile(knownHostsPath, "utf8");
    assert.equal(emptyKnownHostsRaw, "");
  } finally {
    await runtimeB.stop();
  }
});

test("runtime restore normalizes invalid persisted ssh trust entries before rendering managed known_hosts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-ssh-trust-"));
  const dataPath = join(dir, "sessions.json");
  const knownHostsPath = join(dir, "ssh_known_hosts");
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [],
        customCommands: [],
        sessionOutputs: [],
        decks: [],
        layoutProfiles: [],
        workspacePresets: [],
        sshTrustEntries: [
          {
            id: "trust-invalid-port",
            host: "example.internal",
            port: 99999,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
          },
          {
            id: "trust-valid",
            host: "example.internal",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
            createdAt: 10,
            updatedAt: 11
          },
          {
            id: "trust-conflict",
            host: "example.internal",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            createdAt: 12,
            updatedAt: 13
          },
          {
            id: "trust-invalid-key",
            host: "example.internal",
            port: 22,
            keyType: "ssh-ed25519",
            publicKey: "not base64"
          }
        ]
      },
      null,
      2
    )
  );

  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath,
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    const listRes = await fetch(`${baseUrl}/ssh-trust-entries`);
    assert.equal(listRes.status, 200);
    const entries = await listRes.json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].host, "example.internal");
    assert.equal(entries[0].port, 22);
    assert.equal(entries[0].keyType, "ssh-ed25519");

    const knownHostsRaw = await readFile(knownHostsPath, "utf8");
    assert.equal(
      knownHostsRaw,
      "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM\n"
    );
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
    sessionMaxConcurrent: 1,
    startupWarmupQuietMs: 20
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
    sessionMaxConcurrent: 1,
    startupWarmupQuietMs: 20
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
  const readyBeforeBody = await readyBefore.json();
  assert.equal(readyBeforeBody.status, "starting");
  assert.equal(readyBeforeBody.phase, "booting");
  assert.equal(readyBeforeBody.warmup.enabled, false);

  releaseReadyGate();
  await startPromise;

  const readyAfter = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyAfter.status, 200);
  const readyAfterBody = await readyAfter.json();
  assert.equal(readyAfterBody.status, "ready");
  assert.equal(readyAfterBody.phase, "ready");
  assert.equal(readyAfterBody.warmup.enabled, false);

  await runtime.stop();
});

test("ready endpoint stays in starting_sessions until restored sessions go quiet", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-"));
  const dataPath = join(dir, "sessions.json");
  const restoredSessionId = "restore-warmup";
  await writeFile(
    dataPath,
    JSON.stringify(
      {
        sessions: [
          {
            id: restoredSessionId,
            cwd: homedir(),
            shell: "sh",
            name: "warmup",
            startCwd: homedir(),
            startCommand: "",
            env: {},
            tags: [],
            themeProfile: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        customCommands: [],
        decks: []
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
    startupWarmupQuietMs: 60,
    sessionActivityQuietMs: 25,
    createPty: createDelayedBootPtyFactory({
      bootChunk: "booting\n",
      bootDelayMs: 15
    })
  });

  const startPromise = runtime.start();
  while (!runtime.getAddress()) {
    await sleep(5);
  }

  const { port } = runtime.getAddress();
  const readyDuringWarmup = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyDuringWarmup.status, 200);
  const readyDuringWarmupBody = await readyDuringWarmup.json();
  assert.equal(readyDuringWarmupBody.status, "starting");
  assert.equal(readyDuringWarmupBody.phase, "starting_sessions");
  assert.equal(readyDuringWarmupBody.warmup.enabled, true);
  assert.ok(readyDuringWarmupBody.warmup.quietPeriodMs >= 60);

  await startPromise;

  const readyAfter = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyAfter.status, 200);
  const readyAfterBody = await readyAfter.json();
  assert.equal(readyAfterBody.status, "ready");
  assert.equal(readyAfterBody.phase, "ready");
  assert.equal(readyAfterBody.warmup.enabled, true);

  await runtime.stop();
});

test("runtime stop is idempotent", async () => {
  const { runtime } = await createStartedRuntime();
  await runtime.stop();
  await runtime.stop();
});
