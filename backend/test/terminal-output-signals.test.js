import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeTerminalSignals,
  createEmptyTerminalSignalState,
  normalizeTerminalSignalState
} from "../src/terminal-output-signals.js";

test("consumeTerminalSignals parses shell markers, current directory metadata, and alternate-screen transitions", () => {
  const result = consumeTerminalSignals(
    createEmptyTerminalSignalState(),
    "\u001b]133;A\u0007\u001b]633;B\u0007\u001b]1337;CurrentDir=/workspace/code/ptydeck\u0007\u001b[?1049h",
    { updatedAt: 1710000001000 }
  );

  assert.deepEqual(
    result.signals.map((entry) => ({ kind: entry.kind, protocol: entry.protocol, marker: entry.marker || entry.mode || entry.key })),
    [
      { kind: "shell-marker", protocol: "osc-133", marker: "prompt-start" },
      { kind: "shell-marker", protocol: "osc-633", marker: "command-start" },
      { kind: "metadata", protocol: "osc-1337", marker: "current-directory" },
      { kind: "terminal-mode", protocol: "csi", marker: "alternate-screen" }
    ]
  );
  assert.equal(result.state.shellPhase, "command");
  assert.equal(result.state.lastShellMarkerProtocol, "osc-633");
  assert.equal(result.state.currentDirectory, "/workspace/code/ptydeck");
  assert.equal(result.state.alternateScreenActive, true);
  assert.equal(result.state.alternateScreenCode, 1049);
});

test("consumeTerminalSignals preserves incomplete OSC fragments across chunks", () => {
  const first = consumeTerminalSignals(createEmptyTerminalSignalState(), "prefix\u001b]1337;CurrentDir=/tmp/work", {
    updatedAt: 1710000001001
  });
  assert.equal(first.signals.length, 0);
  assert.match(first.state.pendingBuffer, /^\u001b]1337;/);

  const second = consumeTerminalSignals(first.state, "space\u0007", {
    updatedAt: 1710000001002
  });
  assert.equal(second.signals.length, 1);
  assert.equal(second.signals[0].key, "current-directory");
  assert.equal(second.state.currentDirectory, "/tmp/workspace");
  assert.equal(second.state.pendingBuffer, "");
});

test("consumeTerminalSignals tracks alternate-screen exit and VS Code cwd metadata", () => {
  const entered = consumeTerminalSignals(createEmptyTerminalSignalState(), "\u001b]633;P;Cwd=/repo\u0007\u001b[?1047h", {
    updatedAt: 1710000001003
  });
  assert.equal(entered.state.currentDirectory, "/repo");
  assert.equal(entered.state.alternateScreenActive, true);

  const exited = consumeTerminalSignals(entered.state, "\u001b[?1047l", {
    updatedAt: 1710000001004
  });
  assert.equal(exited.signals.length, 1);
  assert.equal(exited.state.alternateScreenActive, false);
});

test("normalizeTerminalSignalState falls back to the empty contract for malformed input", () => {
  assert.deepEqual(normalizeTerminalSignalState(null), createEmptyTerminalSignalState());
  assert.deepEqual(normalizeTerminalSignalState({ pendingBuffer: 10, shellPhase: "bogus" }), createEmptyTerminalSignalState());
});
