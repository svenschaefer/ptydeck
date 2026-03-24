import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator,
  withSingleTrailingNewline
} from "../src/public/terminal-stream.js";

test("withSingleTrailingNewline normalizes CRLF mode to exactly one terminator", () => {
  assert.equal(withSingleTrailingNewline("echo 1\n\n", "crlf"), "echo 1\r\n");
});

test("sendInputWithConfiguredTerminator emits delayed CR submit for cr_delay mode", async () => {
  const writes = [];
  await sendInputWithConfiguredTerminator(
    async (sessionId, payload) => {
      writes.push({ sessionId, payload });
    },
    "s1",
    "hello\nworld\n",
    "cr_delay",
    {
      normalizeMode: (mode) => mode,
      delayedSubmitMs: 0
    }
  );
  assert.deepEqual(writes, [
    { sessionId: "s1", payload: "hello\rworld" },
    { sessionId: "s1", payload: "\r" }
  ]);
});

test("normalizeCustomCommandPayloadForShell escapes only unmatched single quotes", () => {
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'unterminated"), "echo \\'unterminated");
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'ok'"), "echo 'ok'");
});
