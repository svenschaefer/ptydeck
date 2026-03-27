import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDataEncryptionProvider } from "../src/key-provider.js";
import { JsonPersistence } from "../src/persistence.js";

test("JsonPersistence returns empty list when file does not exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const persistence = new JsonPersistence(join(dir, "sessions.json"));

  const result = await persistence.load();
  assert.deepEqual(result, []);
});

test("JsonPersistence loads and saves sessions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  const persistence = new JsonPersistence(file);

  const sessions = [
    {
      id: "a",
      cwd: "/tmp",
      shell: "bash",
      createdAt: 1,
      updatedAt: 2
    }
  ];

  await persistence.save(sessions);
  const loaded = await persistence.load();
  assert.deepEqual(loaded, sessions);

  await writeFile(file, "{\"invalid\":true}", "utf8");
  const fallback = await persistence.load();
  assert.deepEqual(fallback, []);
});

test("JsonPersistence save keeps previous file on write failure and avoids temp leftovers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  await writeFile(
    file,
    JSON.stringify([{ id: "stable", cwd: "/tmp", shell: "bash", createdAt: 1, updatedAt: 1 }], null, 2),
    "utf8"
  );

  let wroteTempFile = false;
  const persistence = new JsonPersistence(file, {
    writeFileFn: async (path, content, encoding) => {
      wroteTempFile = true;
      await writeFile(path, content, encoding);
      throw new Error("simulated write interruption");
    }
  });

  await assert.rejects(
    persistence.save([{ id: "next", cwd: "/srv", shell: "sh", createdAt: 2, updatedAt: 2 }]),
    /simulated write interruption/
  );
  assert.equal(wroteTempFile, true);

  const stableRaw = await persistence.load();
  assert.deepEqual(stableRaw, [{ id: "stable", cwd: "/tmp", shell: "bash", createdAt: 1, updatedAt: 1 }]);

  const entries = await readdir(dir);
  assert.equal(entries.some((name) => name.includes(".tmp-")), false);
});

test("JsonPersistence encrypts and decrypts payload when provider is configured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  const keyA = Buffer.alloc(32, 1).toString("base64");
  const provider = createDataEncryptionProvider(`a:${keyA}`, "a");
  const persistence = new JsonPersistence(file, { encryptionProvider: provider });
  const sessions = [{ id: "enc-1", cwd: "/tmp", shell: "bash", createdAt: 1, updatedAt: 1 }];

  await persistence.save(sessions);
  const rawEncrypted = await persistence.readFileFn(file, "utf8");
  assert.ok(rawEncrypted.includes("\"format\": \"ptydeck.encrypted.v1\""));
  assert.equal(rawEncrypted.includes("enc-1"), false);

  const loaded = await persistence.load();
  assert.deepEqual(loaded, sessions);
});

test("JsonPersistence supports key rotation via active key switch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  const keyA = Buffer.alloc(32, 1).toString("base64");
  const keyB = Buffer.alloc(32, 2).toString("base64");
  const sessions = [{ id: "enc-rotate", cwd: "/srv", shell: "sh", createdAt: 2, updatedAt: 3 }];

  const persistenceA = new JsonPersistence(file, {
    encryptionProvider: createDataEncryptionProvider(`a:${keyA},b:${keyB}`, "a")
  });
  await persistenceA.save(sessions);
  const firstRaw = await persistenceA.readFileFn(file, "utf8");
  assert.ok(firstRaw.includes("\"keyId\": \"a\""));

  const persistenceB = new JsonPersistence(file, {
    encryptionProvider: createDataEncryptionProvider(`a:${keyA},b:${keyB}`, "b")
  });
  const loaded = await persistenceB.load();
  assert.deepEqual(loaded, sessions);
  await persistenceB.save(loaded);
  const rotatedRaw = await persistenceB.readFileFn(file, "utf8");
  assert.ok(rotatedRaw.includes("\"keyId\": \"b\""));
});

test("JsonPersistence loads and saves runtime state with custom commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  const persistence = new JsonPersistence(file);

  const state = {
    sessions: [{ id: "a", cwd: "/tmp", shell: "bash", createdAt: 1, updatedAt: 2 }],
    sessionOutputs: [{ sessionId: "a", data: "hello\r\n" }],
    customCommands: [{ name: "docu", content: "echo hi\n", createdAt: 3, updatedAt: 4 }],
    decks: [{ id: "default", name: "Default", createdAt: 5, updatedAt: 5, settings: {} }]
  };

  await persistence.saveState(state);
  const loadedState = await persistence.loadState();
  assert.deepEqual(loadedState, state);

  const loadedSessions = await persistence.load();
  assert.deepEqual(loadedSessions, state.sessions);
});

test("JsonPersistence loadState supports legacy array payload format", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-persistence-"));
  const file = join(dir, "sessions.json");
  const persistence = new JsonPersistence(file);
  const legacySessions = [{ id: "legacy", cwd: "/tmp", shell: "sh", createdAt: 1, updatedAt: 1 }];

  await writeFile(file, JSON.stringify(legacySessions, null, 2), "utf8");
  const loadedState = await persistence.loadState();
  assert.deepEqual(loadedState, { sessions: legacySessions, sessionOutputs: [], customCommands: [], decks: [] });
});
