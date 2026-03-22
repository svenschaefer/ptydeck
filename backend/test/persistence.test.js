import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
