import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionStreamAdapter,
  hasMeaningfulStreamActivity,
  normalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator,
  withSingleTrailingNewline
} from "../src/public/terminal-stream.js";

test("withSingleTrailingNewline normalizes CRLF mode to exactly one terminator", () => {
  assert.equal(withSingleTrailingNewline("echo 1\n\n", "crlf"), "echo 1\r\n");
});

test("withSingleTrailingNewline preserves normal LF line breaks inside multiline payloads", () => {
  assert.equal(withSingleTrailingNewline("alpha\nbeta\n", "crlf"), "alpha\nbeta\r\n");
  assert.equal(withSingleTrailingNewline("alpha\r\nbeta\r\n", "cr"), "alpha\nbeta\r");
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
    { sessionId: "s1", payload: "hello\nworld" },
    { sessionId: "s1", payload: "\r" }
  ]);
});

test("normalizeCustomCommandPayloadForShell escapes only unmatched single quotes", () => {
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'unterminated"), "echo \\'unterminated");
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'ok'"), "echo 'ok'");
});

test("hasMeaningfulStreamActivity ignores ANSI-only and control-only redraw chunks", () => {
  assert.equal(hasMeaningfulStreamActivity(""), false);
  assert.equal(hasMeaningfulStreamActivity("\u001b[2J\u001b[H"), false);
  assert.equal(hasMeaningfulStreamActivity("\r\n\t "), false);
  assert.equal(hasMeaningfulStreamActivity("\u001b]0;title\u0007"), false);
  assert.equal(hasMeaningfulStreamActivity("\u001b7\u001b8\u001b=\u001b>"), false);
  assert.equal(hasMeaningfulStreamActivity("\u001b(B\u001b)0\u001b#8"), false);
  assert.equal(hasMeaningfulStreamActivity("\u001bP1$r0 q\u001b\\"), false);
  assert.equal(hasMeaningfulStreamActivity("\u200b\u200c\u200d\ufeff"), false);
  assert.equal(hasMeaningfulStreamActivity("Working (1m 32s • esc to interrupt)"), true);
  assert.equal(hasMeaningfulStreamActivity("Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s"), true);
});

test("hasMeaningfulStreamActivity treats real micro redraw glyphs as activity but ignores pure invisible redraws", () => {
  const invisibleRedraw =
    "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l";
  const microVisibleRedraw =
    "\u001b[?2026h\u001b[38;2H\u001b[0m\u001b[49m\u001b[K\u001b[39;2H\u001b[0m\u001b[49m\u001b[K\u001b[40;28H\u001b[0m\u001b[49m\u001b[K\u001b[41;2H\u001b[0m\u001b[49m\u001b[K\u001b[42;92H\u001b[2m1\u001b[39m\u001b[49m\u001b[0m\u001b[?25h\u001b[40;3H\u001b[?2026l";

  assert.equal(hasMeaningfulStreamActivity(invisibleRedraw), false);
  assert.equal(hasMeaningfulStreamActivity(microVisibleRedraw), true);
});

test("createSessionStreamAdapter skips line reconstruction when no line consumer is configured", async () => {
  const events = [];
  const adapter = createSessionStreamAdapter({
    idleMs: 0,
    onData(sessionId, chunk) {
      events.push(["data", sessionId, chunk]);
    },
    onIdle(sessionId) {
      events.push(["idle", sessionId]);
    }
  });

  adapter.push("s1", "alpha\nbeta");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events, [
    ["data", "s1", "alpha\nbeta"],
    ["idle", "s1"]
  ]);
  assert.equal(adapter.getPendingLine("s1"), "");
});

test("createSessionStreamAdapter reconstructs lines across chunk boundaries", async () => {
  const events = [];
  const adapter = createSessionStreamAdapter({
    idleMs: 0,
    onData(sessionId, chunk) {
      events.push(["data", sessionId, chunk]);
    },
    onLine(sessionId, line) {
      events.push(["line", sessionId, line]);
    },
    onIdle(sessionId) {
      events.push(["idle", sessionId]);
    }
  });

  adapter.push("s1", "alpha");
  adapter.push("s1", " beta\ncharlie");
  adapter.push("s1", "\n");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events, [
    ["data", "s1", "alpha"],
    ["data", "s1", " beta\ncharlie"],
    ["line", "s1", "alpha beta"],
    ["data", "s1", "\n"],
    ["line", "s1", "charlie"],
    ["idle", "s1"]
  ]);
});

test("createSessionStreamAdapter applies carriage return overwrite semantics", async () => {
  const lines = [];
  const adapter = createSessionStreamAdapter({
    idleMs: 0,
    onLine(_sessionId, line) {
      lines.push(line);
    }
  });

  adapter.push("s1", "Working 1");
  adapter.push("s1", "\rWorking 2");
  adapter.push("s1", "\rDone\n");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(lines, ["Done"]);
  assert.equal(adapter.getPendingLine("s1"), "");
});

test("createSessionStreamAdapter can strip ANSI codes for emitted lines", async () => {
  const lines = [];
  const adapter = createSessionStreamAdapter({
    idleMs: 0,
    stripAnsiForLines: true,
    onLine(_sessionId, line) {
      lines.push(line);
    }
  });

  adapter.push("s1", "\u001b[31mred\u001b[0m\n");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(lines, ["red"]);
});

test("createSessionStreamAdapter isolates pending lines and idle timers per session", async () => {
  const events = [];
  const adapter = createSessionStreamAdapter({
    idleMs: 0,
    onLine(sessionId, line) {
      events.push(["line", sessionId, line]);
    },
    onIdle(sessionId) {
      events.push(["idle", sessionId]);
    }
  });

  adapter.push("s1", "alpha");
  adapter.push("s2", "bravo\n");
  adapter.push("s1", "\n");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events, [
    ["line", "s2", "bravo"],
    ["line", "s1", "alpha"],
    ["idle", "s2"],
    ["idle", "s1"]
  ]);
});
