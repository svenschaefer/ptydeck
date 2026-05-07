import test from "node:test";
import assert from "node:assert/strict";
import { createSessionManagerReplayRuntime } from "../src/session-manager-replay-runtime.js";

function createSessionRecord({
  id = "session-1",
  outputBuffer = "",
  outputTruncated = false,
  replayShellBlocks = [],
  currentShellBlockStart = null,
  replayShellBlockTrackingSupported = true
} = {}) {
  return {
    id,
    meta: { id },
    outputBuffer,
    outputTruncated,
    replayShellBlocks,
    currentShellBlockStart,
    replayShellBlockTrackingSupported
  };
}

test("session-manager replay runtime appends replay output and prompt boundaries deterministically", () => {
  const runtime = createSessionManagerReplayRuntime({
    sessionReplayMemoryMaxChars: 64
  });
  const session = createSessionRecord();

  runtime.appendReplayOutput(session, "wsl$ ", [5]);
  assert.equal(session.outputBuffer, "wsl$ ");
  assert.equal(session.outputTruncated, false);
  assert.deepEqual(session.replayShellBlocks, []);
  assert.equal(session.currentShellBlockStart, 5);

  runtime.appendReplayOutput(session, "echo hi\nhi\nwsl$ ", [16, 0, 99, -1]);
  assert.equal(session.outputBuffer, "wsl$ echo hi\nhi\nwsl$ ");
  assert.equal(session.outputTruncated, false);
  assert.deepEqual(session.replayShellBlocks, [{ start: 5, end: 21 }]);
  assert.equal(session.currentShellBlockStart, 21);
});

test("session-manager replay runtime trims retained output and shell-block pointers fail-closed", () => {
  const runtime = createSessionManagerReplayRuntime({
    sessionReplayMemoryMaxChars: 6
  });
  const session = createSessionRecord({
    outputBuffer: "A> ",
    currentShellBlockStart: 3
  });

  runtime.appendReplayOutput(session, "cmd\nA> ", [7]);

  assert.equal(session.outputBuffer, "md\nA> ");
  assert.equal(session.outputTruncated, true);
  assert.deepEqual(session.replayShellBlocks, []);
  assert.equal(session.currentShellBlockStart, 6);
  assert.equal(runtime.trimReplayOutput("abcdef", 3), "def");
});

test("session-manager replay runtime snapshots and replay exports keep truncation metadata deterministic", () => {
  const runtime = createSessionManagerReplayRuntime({
    sessionReplayMemoryMaxChars: 4
  });
  const retained = createSessionRecord({
    id: "retained",
    outputBuffer: "abcdef"
  });
  const truncatedEmpty = createSessionRecord({
    id: "truncated-empty",
    outputBuffer: "",
    outputTruncated: true
  });

  const snapshot = runtime.getSnapshot([retained, truncatedEmpty], {
    outputMaxChars: 99,
    includeTruncationMetadata: true,
    includeEmptyOutputs: true
  });

  assert.deepEqual(snapshot.sessions, [{ id: "retained" }, { id: "truncated-empty" }]);
  assert.deepEqual(snapshot.outputs, [
    {
      sessionId: "retained",
      data: "cdef",
      truncated: true
    },
    {
      sessionId: "truncated-empty",
      data: "",
      truncated: true
    }
  ]);

  assert.deepEqual(runtime.getReplayExport(retained), {
    sessionId: "retained",
    data: "abcdef",
    retainedChars: 6,
    retentionLimitChars: 4,
    truncated: false
  });
});

test("session-manager replay runtime validates replay excerpts and unsupported shell blocks fail closed", () => {
  const runtime = createSessionManagerReplayRuntime({
    sessionReplayMemoryMaxChars: 32
  });
  const shellSession = createSessionRecord({
    id: "shell",
    outputBuffer: "one\r\ntwo\r\nthree\r\n",
    replayShellBlocks: [{ start: 0, end: 17 }],
    replayShellBlockTrackingSupported: true
  });
  const plainSession = createSessionRecord({
    id: "plain",
    outputBuffer: "plain shell\r\n",
    replayShellBlocks: [],
    replayShellBlockTrackingSupported: false,
    outputTruncated: true
  });

  const excerpt = runtime.getReplayExcerpt("shell", shellSession, "l:2");
  assert.equal(excerpt.data, "two\nthree");
  assert.equal(excerpt.sourceRetainedChars, shellSession.outputBuffer.length);
  assert.equal(excerpt.sourceRetentionLimitChars, 32);
  assert.equal(excerpt.sourceTruncated, false);

  assert.throws(
    () => runtime.getReplayExcerpt("plain", plainSession, "sp:1"),
    /Selector 'sp:1' is unavailable/
  );
  assert.throws(
    () => runtime.getReplayExcerpt("plain", plainSession, "bad"),
    /Field 'slice' must match 'l:N', 'c:N', or 'sp:N'/
  );
});
