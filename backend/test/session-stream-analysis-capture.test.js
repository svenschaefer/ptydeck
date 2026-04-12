import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
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

test("session stream analysis capture disables itself without a file path and normalizes labels", () => {
  const disabled = createSessionStreamAnalysisCapture({
    filePath: "   ",
    appLabels: ["  CODEX  ", "", "bash", "codex", null]
  });

  assert.equal(
    disabled.captureChunk({
      session: {
        id: "s0",
        appIdentity: { label: "codex" }
      },
      rawData: "echo hi\r\n",
      cleanedData: "echo hi\r\n"
    }),
    false
  );
  assert.deepEqual(disabled.buildStatusSummary(), {
    enabled: false,
    filePath: "",
    maxBytes: 32 * 1024 * 1024,
    appLabels: ["codex", "bash"],
    currentBytes: 0,
    capturedTotal: 0,
    rotatedTotal: 0,
    skippedTotal: 0,
    lastCapturedAt: null,
    lastError: ""
  });
});

test("session stream analysis capture skips matching sessions when both raw and cleaned payloads are empty", () => {
  const capture = createSessionStreamAnalysisCapture({
    filePath: join(tmpdir(), "ptydeck-empty-capture.jsonl"),
    appLabels: ["codex"]
  });

  const captured = capture.captureChunk({
    session: {
      id: "s-empty",
      appIdentity: { label: "CoDeX" }
    },
    rawData: "",
    cleanedData: ""
  });

  assert.equal(captured, false);
  assert.equal(capture.buildStatusSummary().skippedTotal, 1);
});

test("session stream analysis capture rotates the bounded file once the configured limit is exceeded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-stream-capture-rotate-"));
  const filePath = join(dir, "capture.jsonl");
  const capture = createSessionStreamAnalysisCapture({
    filePath,
    maxBytes: 800,
    appLabels: ["codex"]
  });

  const session = {
    id: "s-rotate",
    name: "ptydeck",
    deckId: "ptydeck",
    quickIdToken: "7",
    kind: "local",
    cwd: "/tmp",
    appIdentity: { family: "coding-agent", label: "codex", source: "foreground-process", confidence: 0.99 }
  };

  assert.equal(
    capture.captureChunk({
      session,
      rawData: "• First chunk with enough payload to force bounded file growth.\r\n",
      cleanedData: "• First chunk with enough payload to force bounded file growth.\r\n"
    }),
    true
  );
  await waitFor(async () => capture.buildStatusSummary().capturedTotal === 1);

  assert.equal(
    capture.captureChunk({
      session,
      rawData: "• Second chunk that should trigger rotation before it is appended to the active file.\r\n",
      cleanedData: "• Second chunk that should trigger rotation before it is appended to the active file.\r\n"
    }),
    true
  );
  await waitFor(async () => capture.buildStatusSummary().capturedTotal === 2);
  await waitFor(async () => {
    try {
      await stat(`${filePath}.1`);
      return true;
    } catch {
      return false;
    }
  });

  const activeContent = await readFile(filePath, "utf8");
  const rotatedContent = await readFile(`${filePath}.1`, "utf8");
  const activeLines = activeContent.trim().split("\n").filter(Boolean);
  const rotatedLines = rotatedContent.trim().split("\n").filter(Boolean);
  assert.equal(activeLines.length >= 1, true);
  assert.equal(rotatedLines.length >= 1, true);
  assert.equal(activeLines.length + rotatedLines.length, 2);

  const status = capture.buildStatusSummary();
  assert.equal(status.rotatedTotal, 1);
  assert.equal(status.capturedTotal, 2);
  assert.equal(status.lastError, "");
});

test("session stream analysis capture reports append failures without crashing the caller", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-stream-capture-error-"));
  const capture = createSessionStreamAnalysisCapture({
    filePath: dir,
    appLabels: ["codex"]
  });

  const captured = capture.captureChunk({
    session: {
      id: "s-error",
      appIdentity: { label: "codex" }
    },
    rawData: "• Trigger append failure\r\n",
    cleanedData: "• Trigger append failure\r\n"
  });

  assert.equal(captured, true);
  await waitFor(async () => Boolean(capture.buildStatusSummary().lastError));
  assert.match(capture.buildStatusSummary().lastError, /EISDIR|illegal operation on a directory/i);
  assert.equal(capture.buildStatusSummary().capturedTotal, 0);
});
