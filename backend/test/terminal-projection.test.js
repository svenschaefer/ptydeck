import test from "node:test";
import assert from "node:assert/strict";
import {
  createTerminalProjectionTracker,
  diffTerminalProjectionSnapshots,
  normalizeTerminalProjectionResourceLimits
} from "../src/terminal-projection.js";

test("terminal projection tracker captures snapshots transcript deltas and diffs", async () => {
  const tracker = createTerminalProjectionTracker({
    sessionId: "projection-session",
    resourceLimits: {
      cols: 20,
      rows: 4,
      scrollback: 50,
      snapshotScrollbackLines: 12,
      transcriptEntryLimit: 10,
      transcriptCharLimit: 500,
      diffLineLimit: 20
    }
  });

  const baseline = tracker.createBaseline("before-output");
  await tracker.observeData("first line\nsecond line\n", { observedAt: 100 });
  await tracker.observeData("third line", { observedAt: 120, promptBoundaries: [5] });

  const snapshot = tracker.captureSnapshot();
  const transcriptDelta = tracker.getTranscriptDelta(baseline.revision);
  const diff = tracker.diffFromBaseline(baseline);

  assert.equal(snapshot.entityType, "TerminalProjectionSnapshot");
  assert.equal(snapshot.sessionId, "projection-session");
  assert.equal(snapshot.revision > baseline.revision, true);
  assert.equal(snapshot.activeVisibleLines.some((line) => line.includes("first line")), true);
  assert.equal(snapshot.activeVisibleLines.some((line) => line.includes("third line")), true);

  assert.equal(transcriptDelta.entityType, "TerminalProjectionTranscriptDelta");
  assert.equal(transcriptDelta.entries.length, 2);
  assert.equal(transcriptDelta.entries[1].promptBoundaryCount, 1);
  assert.equal(transcriptDelta.entries[1].visibleText.includes("third line"), true);

  assert.equal(diff.entityType, "TerminalProjectionDiff");
  assert.equal(diff.toRevision, snapshot.revision);
  assert.equal(diff.activeTailLines.totalChangedLines, 0);
  assert.equal(diff.activeVisibleLines.totalChangedLines > 0, true);
});

test("terminal projection tracker enforces bounded transcript retention", async () => {
  const tracker = createTerminalProjectionTracker({
    sessionId: "projection-retention",
    resourceLimits: {
      cols: 10,
      rows: 3,
      scrollback: 20,
      snapshotScrollbackLines: 8,
      transcriptEntryLimit: 10,
      transcriptCharLimit: 1000,
      diffLineLimit: 10
    }
  });

  for (let index = 0; index < 12; index += 1) {
    await tracker.observeData(`entry-${index}`, { observedAt: index + 1 });
  }

  const transcriptDelta = tracker.getTranscriptDelta(0);
  assert.equal(transcriptDelta.entries.length <= 10, true);
  assert.equal(transcriptDelta.retainedCharCount <= 1000, true);
  assert.deepEqual(
    transcriptDelta.entries.map((entry) => entry.visibleText),
    ["entry-2", "entry-3", "entry-4", "entry-5", "entry-6", "entry-7", "entry-8", "entry-9", "entry-10", "entry-11"]
  );
});

test("terminal projection helpers normalize limits and diff standalone snapshots deterministically", () => {
  const limits = normalizeTerminalProjectionResourceLimits({
    cols: 5,
    rows: 1,
    scrollback: 5,
    snapshotScrollbackLines: 2,
    transcriptEntryLimit: 3,
    transcriptCharLimit: 50,
    diffLineLimit: 2,
    convertEol: false
  });

  assert.equal(limits.cols >= 20, true);
  assert.equal(limits.rows >= 5, true);
  assert.equal(limits.convertEol, false);

  const diff = diffTerminalProjectionSnapshots(
    {
      revision: 1,
      activeBufferType: "normal",
      activeVisibleLines: Object.freeze(["before"]),
      activeTailLines: Object.freeze(["before"]),
      normalTailLines: Object.freeze([])
    },
    {
      revision: 2,
      activeBufferType: "normal",
      activeVisibleLines: Object.freeze(["after"]),
      activeTailLines: Object.freeze(["after"]),
      normalTailLines: Object.freeze([])
    },
    { maxLines: 1 }
  );

  assert.equal(diff.fromRevision, 1);
  assert.equal(diff.toRevision, 2);
  assert.equal(diff.activeVisibleLines.totalChangedLines, 1);
  assert.equal(diff.activeVisibleLines.lines.length, 1);
});
