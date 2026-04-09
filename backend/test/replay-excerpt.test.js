import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplayExcerpt,
  normalizeVisibleReplayText,
  parseReplaySliceSelector,
  stripAnsiCodes
} from "../src/replay-excerpt.js";

test("replay excerpt utilities parse supported slice selectors", () => {
  assert.deepEqual(parseReplaySliceSelector("l:80"), {
    selector: "l:80",
    selectorToken: "l",
    selectorKind: "lines",
    requestedCount: 80
  });
  assert.deepEqual(parseReplaySliceSelector("C:4000"), {
    selector: "c:4000",
    selectorToken: "c",
    selectorKind: "chars",
    requestedCount: 4000
  });
  assert.deepEqual(parseReplaySliceSelector("sp:2"), {
    selector: "sp:2",
    selectorToken: "sp",
    selectorKind: "shell_blocks",
    requestedCount: 2
  });
  assert.equal(parseReplaySliceSelector("lines:80"), null);
  assert.equal(parseReplaySliceSelector("sp:0"), null);
});

test("replay excerpt utilities normalize visible text and strip ansi content", () => {
  assert.equal(stripAnsiCodes("\u001b[31mred\u001b[0m"), "red");
  assert.equal(normalizeVisibleReplayText("a\r\nb\r\u0007\u001b[32mc\u001b[0m"), "a\nbc");
});

test("replay excerpt utilities extract line and char slices from visible replay text", () => {
  const lineExcerpt = buildReplayExcerpt({
    selector: "l:2",
    text: "one\r\ntwo\r\nthree\r\n"
  });
  assert.deepEqual(lineExcerpt, {
    selector: "l:2",
    selectorKind: "lines",
    requestedCount: 2,
    selectorSatisfied: true,
    availableCount: 3,
    resolvedCount: 2,
    data: "two\nthree",
    chars: 9,
    lines: 2,
    shellBlocksSupported: false
  });

  const charExcerpt = buildReplayExcerpt({
    selector: "c:5",
    text: "abc\u001b[31mde\u001b[0mf"
  });
  assert.deepEqual(charExcerpt, {
    selector: "c:5",
    selectorKind: "chars",
    requestedCount: 5,
    selectorSatisfied: true,
    availableCount: 6,
    resolvedCount: 5,
    data: "bcdef",
    chars: 5,
    lines: 1,
    shellBlocksSupported: false
  });
});

test("replay excerpt utilities extract shell-block slices only when supported", () => {
  const unsupported = buildReplayExcerpt({
    selector: "sp:1",
    text: "prompt$ echo hi\nhi\nprompt$ "
  });
  assert.deepEqual(unsupported, {
    selector: "sp:1",
    selectorToken: "sp",
    selectorKind: "shell_blocks",
    requestedCount: 1,
    shellBlocksSupported: false,
    unavailableReason: "shell_blocks_unavailable"
  });

  const supported = buildReplayExcerpt({
    selector: "sp:2",
    text: "a$ echo one\none\na$ echo two\ntwo\na$ ",
    shellBlocksSupported: true,
    shellBlocks: (() => {
      const text = "a$ echo one\none\na$ echo two\ntwo\na$ ";
      const secondBlockStart = text.indexOf("a$ echo two");
      const trailingPromptStart = text.lastIndexOf("a$ ");
      return [
        { start: 0, end: secondBlockStart },
        { start: secondBlockStart, end: trailingPromptStart }
      ];
    })()
  });
  assert.deepEqual(supported, {
    selector: "sp:2",
    selectorKind: "shell_blocks",
    requestedCount: 2,
    selectorSatisfied: true,
    availableCount: 2,
    resolvedCount: 2,
    data: "a$ echo one\none\na$ echo two\ntwo\n",
    chars: 32,
    lines: 4,
    shellBlocksSupported: true
  });
});

test("replay excerpt utilities normalize invalid shell blocks and report partial availability", () => {
  const excerpt = buildReplayExcerpt({
    selector: "sp:3",
    text: "a$ echo one\none\na$ echo two\ntwo\na$ ",
    shellBlocksSupported: true,
    shellBlocks: [
      { start: -1, end: 4 },
      { start: 16, end: 16 },
      { start: 31, end: 999 },
      { start: 16, end: 32 },
      { start: 0, end: 16 }
    ]
  });

  assert.deepEqual(excerpt, {
    selector: "sp:3",
    selectorKind: "shell_blocks",
    requestedCount: 3,
    selectorSatisfied: false,
    availableCount: 2,
    resolvedCount: 2,
    data: "a$ echo one\none\na$ echo two\ntwo\n",
    chars: 32,
    lines: 4,
    shellBlocksSupported: true
  });
});

test("replay excerpt utilities preserve shell-block unavailability and normalize mixed control output", () => {
  const visible = buildReplayExcerpt({
    selector: "l:3",
    text: "one\r\ntwo\r\n\u0007\u001b[31mthree\u001b[0m\r\n"
  });
  assert.deepEqual(visible, {
    selector: "l:3",
    selectorKind: "lines",
    requestedCount: 3,
    selectorSatisfied: true,
    availableCount: 3,
    resolvedCount: 3,
    data: "one\ntwo\nthree",
    chars: 13,
    lines: 3,
    shellBlocksSupported: false
  });

  const unsupported = buildReplayExcerpt({
    selector: "sp:2",
    text: "prompt$ echo hi\nhi\nprompt$ ",
    shellBlocksSupported: false,
    shellBlocks: [{ start: 0, end: 17 }]
  });
  assert.deepEqual(unsupported, {
    selector: "sp:2",
    selectorToken: "sp",
    selectorKind: "shell_blocks",
    requestedCount: 2,
    shellBlocksSupported: false,
    unavailableReason: "shell_blocks_unavailable"
  });
});
