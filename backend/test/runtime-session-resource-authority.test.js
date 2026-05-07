import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionResourceAuthority } from "../src/runtime-session-resource-authority.js";

function createHarness(overrides = {}) {
  const persistedReplayOutputs = overrides.persistedReplayOutputs || new Map();
  const authority = createRuntimeSessionResourceAuthority({
    manager: {
      getReplayExport: () => {
        throw new ApiError(404, "SessionNotFound", "missing replay");
      },
      getReplayExcerpt: () => ({
        selector: "tail:20",
        selectorKind: "tail",
        requestedCount: 20,
        resolvedCount: 12,
        availableCount: 12,
        selectorSatisfied: false,
        shellBlocksSupported: true,
        data: "excerpt",
        chars: 7,
        lines: 1,
        sourceRetainedChars: 70,
        sourceRetentionLimitChars: 140,
        sourceTruncated: true
      }),
      get: () => ({
        id: "session-1",
        meta: {
          cwd: overrides.transferRoot || "/tmp"
        }
      }),
      create: (payload) => payload,
      sessionReplayMemoryMaxChars: 4096,
      ...(overrides.manager || {})
    },
    getApiSessionOrThrow: overrides.getApiSessionOrThrow || ((sessionId) => ({
      id: sessionId,
      state: "running",
      kind: overrides.sessionKind || "local"
    })),
    getPersistedReplayOutputs: () => persistedReplayOutputs,
    sessionFileTransferMaxBytes: overrides.sessionFileTransferMaxBytes || 256 * 1024
  });
  return {
    authority,
    persistedReplayOutputs
  };
}

test("runtime session resource authority falls back to persisted replay output for export payloads", () => {
  const { authority, persistedReplayOutputs } = createHarness();
  persistedReplayOutputs.set("session-1", {
    data: "persisted tail",
    retainedChars: 14,
    retentionLimitChars: 128,
    truncated: true
  });

  const payload = authority.buildSessionReplayExportOrThrow("session-1");
  assert.deepEqual(payload, {
    sessionId: "session-1",
    sessionState: "running",
    scope: "retained_replay_tail",
    format: "text",
    contentType: "text/plain; charset=utf-8",
    fileName: "ptydeck-session-session-1-replay.txt",
    data: "persisted tail",
    retainedChars: 14,
    retentionLimitChars: 128,
    truncated: true
  });
});

test("runtime session resource authority shapes replay excerpts deterministically", () => {
  const { authority } = createHarness({
    manager: {
      getReplayExcerpt: (sessionId, selector) => ({
        selector,
        selectorKind: "tail",
        requestedCount: 30,
        resolvedCount: 10,
        availableCount: 18,
        selectorSatisfied: false,
        shellBlocksSupported: false,
        data: `excerpt:${sessionId}`,
        chars: 18,
        lines: 2,
        sourceRetainedChars: 90,
        sourceRetentionLimitChars: 180,
        sourceTruncated: false
      })
    }
  });

  const payload = authority.buildSessionReplayExcerptOrThrow("session-7", "tail:30");
  assert.deepEqual(payload, {
    sessionId: "session-7",
    sessionState: "running",
    scope: "visible_replay_excerpt",
    format: "text",
    contentType: "text/plain; charset=utf-8",
    selector: "tail:30",
    selectorKind: "tail",
    requestedCount: 30,
    resolvedCount: 10,
    availableCount: 18,
    selectorSatisfied: false,
    shellBlocksSupported: false,
    data: "excerpt:session-7",
    chars: 18,
    lines: 2,
    sourceRetainedChars: 90,
    sourceRetentionLimitChars: 180,
    sourceTruncated: false
  });
});

test("runtime session resource authority downloads and uploads files within the session root", async () => {
  const transferRoot = await mkdtemp(join(tmpdir(), "ptydeck-session-resource-"));
  await mkdir(join(transferRoot, "nested"), { recursive: true });
  await writeFile(join(transferRoot, "nested", "download.txt"), "hello");

  const { authority } = createHarness({ transferRoot });

  const download = await authority.buildSessionFileDownloadOrThrow("session-1", "./nested/download.txt");
  assert.deepEqual(download, {
    sessionId: "session-1",
    path: "nested/download.txt",
    fileName: "download.txt",
    contentType: "application/octet-stream",
    encoding: "base64",
    contentBase64: Buffer.from("hello").toString("base64"),
    sizeBytes: 5
  });

  const uploadCreated = await authority.uploadSessionFileOrThrow(
    "session-1",
    "nested/upload.txt",
    Buffer.from("first").toString("base64")
  );
  assert.deepEqual(uploadCreated, {
    sessionId: "session-1",
    path: "nested/upload.txt",
    fileName: "upload.txt",
    sizeBytes: 5,
    created: true
  });
  assert.equal(await readFile(join(transferRoot, "nested", "upload.txt"), "utf8"), "first");

  const uploadUpdated = await authority.uploadSessionFileOrThrow(
    "session-1",
    "nested/upload.txt",
    Buffer.from("second").toString("base64")
  );
  assert.deepEqual(uploadUpdated, {
    sessionId: "session-1",
    path: "nested/upload.txt",
    fileName: "upload.txt",
    sizeBytes: 6,
    created: false
  });
  assert.equal(await readFile(join(transferRoot, "nested", "upload.txt"), "utf8"), "second");
});

test("runtime session resource authority rejects unsupported or escaping file transfer targets", async () => {
  const transferRoot = await mkdtemp(join(tmpdir(), "ptydeck-session-resource-"));

  const remoteHarness = createHarness({
    transferRoot,
    sessionKind: "ssh"
  });
  await assert.rejects(
    () => remoteHarness.authority.buildSessionFileDownloadOrThrow("session-ssh", "file.txt"),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 409);
      assert.equal(error.error, "FileTransferUnsupported");
      return true;
    }
  );

  const localHarness = createHarness({ transferRoot });
  await assert.rejects(
    () => localHarness.authority.uploadSessionFileOrThrow("session-1", "../escape.txt", Buffer.from("x").toString("base64")),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 400);
      assert.equal(error.error, "ValidationError");
      return true;
    }
  );
});

test("runtime session resource authority rejects missing roots, oversized downloads, and invalid upload payloads", async () => {
  const transferRoot = await mkdtemp(join(tmpdir(), "ptydeck-session-resource-"));
  await writeFile(join(transferRoot, "huge.bin"), Buffer.alloc(12, 0x61));

  const missingRootHarness = createHarness({
    manager: {
      get: () => ({
        id: "session-1",
        meta: {
          cwd: ""
        }
      })
    }
  });
  await assert.rejects(
    () => missingRootHarness.authority.buildSessionFileDownloadOrThrow("session-1", "file.txt"),
    (error) => error instanceof ApiError && error.statusCode === 409 && error.error === "FileTransferUnavailable"
  );

  const hugeHarness = createHarness({
    transferRoot,
    sessionFileTransferMaxBytes: 8
  });
  await assert.rejects(
    () => hugeHarness.authority.buildSessionFileDownloadOrThrow("session-1", "huge.bin"),
    (error) => error instanceof ApiError && error.statusCode === 413 && error.error === "FileTransferTooLarge"
  );

  const invalidBase64Harness = createHarness({ transferRoot });
  await assert.rejects(
    () => invalidBase64Harness.authority.uploadSessionFileOrThrow("session-1", "upload.txt", ""),
    (error) => error instanceof ApiError && error.statusCode === 400 && error.error === "ValidationError"
  );
});

test("runtime session resource authority rejects directory targets during upload replacement", async () => {
  const transferRoot = await mkdtemp(join(tmpdir(), "ptydeck-session-resource-"));
  await mkdir(join(transferRoot, "nested"), { recursive: true });

  const { authority } = createHarness({ transferRoot });
  await assert.rejects(
    () => authority.uploadSessionFileOrThrow("session-1", "nested", Buffer.from("x").toString("base64")),
    (error) => error instanceof ApiError && error.statusCode === 400 && error.error === "ValidationError"
  );
});

test("runtime session resource authority forwards restored session creation payloads to the manager", () => {
  const createCalls = [];
  const { authority } = createHarness({
    manager: {
      create: (payload) => {
        createCalls.push(payload);
        return { id: payload.id };
      }
    }
  });

  const payload = authority.tryCreateRestoredSession({
    session: {
      id: "session-restore",
      name: "restored",
      deckId: "ops",
      createdAt: 10,
      updatedAt: 20
    },
    kind: "ssh",
    remoteConnection: { host: "example.com", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" },
    shell: "ssh",
    cwd: "/srv/app",
    startCwd: "/srv/app",
    startCommand: "tmux a",
    replayOutput: "tail",
    replayOutputTruncated: true,
    remoteSecret: "secret",
    env: { LANG: "C" },
    note: "restored note",
    mouseForwardingMode: "force",
    inputSafetyProfile: { mode: "allow" },
    tags: ["prod"],
    quickSendUsage: [{ lookupKey: "deploy", count: 4 }],
    themeProfile: { background: "#000000" },
    activeThemeProfile: { background: "#111111" },
    inactiveThemeProfile: { background: "#222222" }
  });

  assert.deepEqual(payload, { id: "session-restore" });
  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0], {
    id: "session-restore",
    kind: "ssh",
    remoteConnection: { host: "example.com", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" },
    remoteSecret: "secret",
    cwd: "/srv/app",
    shell: "ssh",
    name: "restored",
    deckId: "ops",
    startCwd: "/srv/app",
    startCommand: "tmux a",
    replayOutput: "tail",
    replayOutputTruncated: true,
    env: { LANG: "C" },
    note: "restored note",
    mouseForwardingMode: "force",
    inputSafetyProfile: { mode: "allow" },
    tags: ["prod"],
    quickSendUsage: [{ lookupKey: "deploy", count: 4 }],
    themeProfile: { background: "#000000" },
    activeThemeProfile: { background: "#111111" },
    inactiveThemeProfile: { background: "#222222" },
    createdAt: 10,
    updatedAt: 20
  });
});
