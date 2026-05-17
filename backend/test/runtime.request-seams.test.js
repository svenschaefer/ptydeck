import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime } from "../src/runtime.js";
import { JsonPersistence } from "../src/persistence.js";

function createStubPtyFactory() {
  return () => {
    let exitHandler = null;
    return {
      onExit(handler) {
        exitHandler = handler;
      },
      onData() {},
      write() {},
      resize() {},
      kill() {
        if (exitHandler) {
          exitHandler({ exitCode: 0, signal: 0 });
        }
      }
    };
  };
}

function createExternallyControlledPtyFactory() {
  const ptys = [];
  return {
    ptys,
    createPty() {
      let exitHandler = null;
      let dataHandler = null;
      const pty = {
        onExit(handler) {
          exitHandler = handler;
        },
        onData(handler) {
          dataHandler = handler;
        },
        emitData(data) {
          if (typeof dataHandler === "function") {
            dataHandler(data);
          }
        },
        write() {},
        resize() {},
        kill() {
          if (exitHandler) {
            exitHandler({ exitCode: 0, signal: 0 });
          }
        }
      };
      ptys.push(pty);
      return pty;
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createStartedRuntime(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-seams-"));
  const runtime = createRuntime({
    port: 0,
    shell: "sh",
    dataPath: join(dir, "sessions.json"),
    corsOrigin: "*",
    corsAllowedOrigins: ["*"],
    maxBodyBytes: 1024 * 1024,
    startupWarmupQuietMs: 20,
    createPty: createStubPtyFactory(),
    ...overrides
  });
  await runtime.start();
  const { port } = runtime.getAddress();
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${port}/api/v1`
  };
}

async function createSession(baseUrl, body = { shell: "sh" }) {
  const response = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function expectApiError(response, statusCode, code, messagePattern) {
  assert.equal(response.status, statusCode);
  const payload = await response.json();
  assert.equal(payload.error, code);
  assert.match(payload.message, messagePattern);
}

test("runtime rejects invalid sessionId path encoding across session routes", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const badSessionId = "%E0%A4%A";
    const cases = [
      {
        url: `${baseUrl}/sessions/${badSessionId}`,
        options: { method: "GET" }
      },
      {
        url: `${baseUrl}/sessions/${badSessionId}/input`,
        options: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: "echo test\n" })
        }
      },
      {
        url: `${baseUrl}/sessions/${badSessionId}/replay-excerpt?slice=l:5`,
        options: { method: "GET" }
      },
      {
        url: `${baseUrl}/sessions/${badSessionId}/file-transfer/download`,
        options: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: "note.txt" })
        }
      },
      {
        url: `${baseUrl}/sessions/${badSessionId}/control/take`,
        options: { method: "POST" }
      },
      {
        url: `${baseUrl}/sessions/${badSessionId}/restart`,
        options: { method: "POST" }
      }
    ];

    for (const entry of cases) {
      const response = await fetch(entry.url, entry.options);
      await expectApiError(response, 400, "ValidationError", /Invalid path parameter encoding for 'sessionId'\./);
    }
  } finally {
    await runtime.stop();
  }
});

test("runtime logs debounced persistence failures without aborting the active runtime", async () => {
  const factory = createExternallyControlledPtyFactory();
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: () => factory.createPty()
  });
  const originalSaveState = JsonPersistence.prototype.saveState;
  const originalConsoleError = console.error;
  const consoleErrors = [];

  try {
    await createSession(baseUrl);
    await delay(150);

    JsonPersistence.prototype.saveState = async function saveStateReject() {
      throw new Error("persist-failed");
    };
    console.error = (...args) => {
      consoleErrors.push(args);
    };

    factory.ptys[0].emitData("OUT\n");
    await delay(150);

    assert.equal(
      consoleErrors.some(
        (entry) => entry[0] === "failed to persist runtime state" && entry[1] instanceof Error && entry[1].message === "persist-failed"
      ),
      true
    );
  } finally {
    JsonPersistence.prototype.saveState = originalSaveState;
    console.error = originalConsoleError;
    await runtime.stop();
  }
});

test("runtime clears a pending debounced persistence timer before immediate persistence", async () => {
  const factory = createExternallyControlledPtyFactory();
  const { runtime, baseUrl } = await createStartedRuntime({
    createPty: () => factory.createPty()
  });
  const originalSaveState = JsonPersistence.prototype.saveState;
  const saveCalls = [];

  try {
    await createSession(baseUrl);
    await delay(150);

    JsonPersistence.prototype.saveState = async function saveStateSpy(state) {
      saveCalls.push({
        sessions: Array.isArray(state?.sessions) ? state.sessions.length : -1,
        decks: Array.isArray(state?.decks) ? state.decks.length : -1
      });
    };

    factory.ptys[0].emitData("OUT\n");

    const response = await fetch(`${baseUrl}/decks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ops" })
    });
    assert.equal(response.status, 201);

    await delay(150);

    assert.equal(saveCalls.length, 1);
    assert.deepEqual(saveCalls[0], {
      sessions: 1,
      decks: 2
    });
  } finally {
    JsonPersistence.prototype.saveState = originalSaveState;
    await runtime.stop();
  }
});

test("runtime rejects malformed JSON bodies before route-specific handling", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const cases = [
      {
        url: `${baseUrl}/sessions`,
        options: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{\"name\":\"oops\""
        }
      },
      {
        url: `${baseUrl}/custom-commands/Build`,
        options: {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: "{\"content\":\"npm test\""
        }
      },
      {
        url: `${baseUrl}/shares`,
        options: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{\"targetType\":\"session\""
        }
      },
      {
        url: `${baseUrl}/session-control/take`,
        options: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{\"scope\":\"all\""
        }
      }
    ];

    for (const entry of cases) {
      const response = await fetch(entry.url, entry.options);
      await expectApiError(response, 400, "InvalidJson", /Malformed JSON body\./);
    }
  } finally {
    await runtime.stop();
  }
});

test("runtime enforces file-transfer path and base64 rules through direct REST seams", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const session = await createSession(baseUrl);

    const traversalUpload = await fetch(`${baseUrl}/sessions/${session.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "../escape.txt", contentBase64: "aGk=" })
    });
    await expectApiError(traversalUpload, 400, "ValidationError", /must stay within the session root/);

    const invalidBase64Upload = await fetch(`${baseUrl}/sessions/${session.id}/file-transfer/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "notes.txt", contentBase64: "not-base64*" })
    });
    await expectApiError(invalidBase64Upload, 400, "ValidationError", /contentBase64.*valid base64 string/);

    const directoryDownload = await fetch(`${baseUrl}/sessions/${session.id}/file-transfer/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "logs/" })
    });
    await expectApiError(directoryDownload, 400, "ValidationError", /must reference a file path, not a directory/);
  } finally {
    await runtime.stop();
  }
});

test("runtime rejects invalid custom-command template variables through the REST path", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const response = await fetch(`${baseUrl}/custom-commands/BuildNotice`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "template",
        scope: "project",
        content: "cwd={{var:session.cwd}} deck={{var:deck.name}}",
        templateVariables: ["session.cwd"]
      })
    });

    await expectApiError(
      response,
      400,
      "CustomCommandTemplateVariableNotAllowed",
      /unallowed built-in variable\(s\): deck\.name/
    );
  } finally {
    await runtime.stop();
  }
});

test("runtime surfaces replay-excerpt request validation directly through REST", async () => {
  const { runtime, baseUrl } = await createStartedRuntime();

  try {
    const session = await createSession(baseUrl);
    const response = await fetch(`${baseUrl}/sessions/${session.id}/replay-excerpt?slice=bad`, {
      method: "GET"
    });
    await expectApiError(response, 400, "ValidationError", /must match 'l:N', 'c:N', or 'sp:N'/);
  } finally {
    await runtime.stop();
  }
});
