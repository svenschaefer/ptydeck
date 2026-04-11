import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSessionStreamAnalysisCapture } from "../src/session-stream-analysis-capture.js";

async function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for predicate.");
}

test("session stream analysis capture writes codex chunk entries to a bounded file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-stream-capture-"));
  const filePath = join(dir, "capture.jsonl");
  const capture = createSessionStreamAnalysisCapture({
    filePath,
    maxBytes: 4096,
    appLabels: ["codex"]
  });

  const captured = capture.captureChunk({
    session: {
      id: "s1",
      name: "ptydeck",
      deckId: "ptydeck",
      quickIdToken: "7",
      kind: "local",
      cwd: "/tmp",
      appIdentity: { family: "coding-agent", label: "codex", source: "foreground-process", confidence: 0.99 }
    },
    rawData: "\u001b[1m• Hello\u001b[22m\r\n",
    cleanedData: "\u001b[1m• Hello\u001b[22m\r\n",
    promptBoundaries: [0],
    terminalSignalKinds: ["prompt_boundary"],
    trace: { traceId: "trace-1", correlationId: "corr-1" }
  });

  assert.equal(captured, true);
  await waitFor(async () => {
    try {
      const content = await readFile(filePath, "utf8");
      return content.includes("session.stream.chunk");
    } catch {
      return false;
    }
  });

  const content = await readFile(filePath, "utf8");
  const lines = content.trim().split("\n");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.session.name, "ptydeck");
  assert.equal(entry.appIdentity.label, "codex");
  assert.equal(entry.raw.chars > 0, true);
  assert.equal(entry.cleaned.visiblePreview.includes("• Hello"), true);
  assert.deepEqual(entry.promptBoundaries, [0]);
  assert.deepEqual(entry.terminalSignalKinds, ["prompt_boundary"]);
  assert.equal(entry.traceId, "trace-1");

  const status = capture.buildStatusSummary();
  assert.equal(status.enabled, true);
  assert.equal(status.capturedTotal, 1);
  assert.equal(status.lastError, "");
});

test("session stream analysis capture skips non-matching app labels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-stream-capture-filter-"));
  const filePath = join(dir, "capture.jsonl");
  const capture = createSessionStreamAnalysisCapture({
    filePath,
    appLabels: ["codex"]
  });

  const captured = capture.captureChunk({
    session: {
      id: "s2",
      name: "shell",
      deckId: "default",
      appIdentity: { family: "shell", label: "bash", source: "foreground-process", confidence: 0.8 }
    },
    rawData: "echo ok\r\n",
    cleanedData: "echo ok\r\n"
  });

  assert.equal(captured, false);
  const status = capture.buildStatusSummary();
  assert.equal(status.capturedTotal, 0);
  assert.equal(status.skippedTotal, 1);
});
