const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

function debugLine(timestamp, event, payload) {
  return `[ptydeck-backend][${timestamp}] ${event} ${JSON.stringify(payload)}`;
}

test("analyze-terminal-semantic-shadow clusters debug and status comparisons deterministically", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-semantic-shadow-"));
  const logFile = path.join(dir, "backend.log");
  const statusFile = path.join(dir, "ready.json");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-15T08:00:00.000Z", "messaging.semantic.shadow", {
        sessionId: "s-overlap",
        entityKind: "turn",
        phase: "turn_completion",
        primaryMode: "projection",
        shadowModeEnabled: true,
        comparisonResult: "mismatched",
        comparisonClass: "overlapping_turn_ownership",
        primaryComparableText: "prior analysis line still running",
        shadowComparableText: "fresh reply owned by ja"
      }),
      debugLine("2026-04-15T08:00:10.000Z", "messaging.semantic.shadow", {
        sessionId: "s-restart",
        entityKind: "output_episode",
        phase: "quiet_window",
        primaryMode: "projection",
        shadowModeEnabled: true,
        comparisonResult: "primary_only",
        comparisonClass: "restart_remount_noise",
        primaryComparableText: "restored dev server output",
        shadowComparableText: ""
      })
    ].join("\n") + "\n",
    "utf8"
  );

  await writeFile(
    statusFile,
    JSON.stringify(
      {
        trace: {
          recent: [
            {
              recordedAt: "2026-04-15T08:00:20.000Z",
              type: "terminal.semantic.compare",
              decision: "shadow_only",
              comparisonClass: "semantic_adapter_divergence",
              summary: "turn shadow_only",
              reason: "turn_completion",
              sessionId: "s-shadow",
              traceId: "trace-shadow",
              correlationId: "corr-shadow",
              comparableText: "legacy-only reply"
            }
          ]
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-terminal-semantic-shadow.mjs"),
      "--log",
      logFile,
      "--status-file",
      statusFile,
      "--since-minutes",
      "0",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.window.parsedDebugComparisons, 2);
  assert.equal(parsed.window.parsedStatusComparisons, 1);
  assert.equal(parsed.window.includedComparisons, 3);
  assert.deepEqual(parsed.analysis.decisionCounts, [
    { key: "mismatched", count: 1 },
    { key: "primary_only", count: 1 },
    { key: "shadow_only", count: 1 }
  ]);
  assert.deepEqual(parsed.analysis.classCounts, [
    { key: "overlapping_turn_ownership", count: 1 },
    { key: "restart_remount_noise", count: 1 },
    { key: "semantic_adapter_divergence", count: 1 }
  ]);
  assert.equal(parsed.analysis.clusteredExamples.overlapping_turn_ownership[0].sessionId, "s-overlap");
  assert.equal(parsed.analysis.clusteredExamples.semantic_adapter_divergence[0].sessionId, "s-shadow");
});

test("analyze-terminal-semantic-shadow filters by session and decision", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-semantic-shadow-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-15T08:10:00.000Z", "messaging.semantic.shadow", {
        sessionId: "s-a",
        entityKind: "turn",
        phase: "turn_completion",
        primaryMode: "projection",
        shadowModeEnabled: true,
        comparisonResult: "primary_only",
        comparisonClass: "overlay_working_noise",
        primaryComparableText: "working overlay"
      }),
      debugLine("2026-04-15T08:10:05.000Z", "messaging.semantic.shadow", {
        sessionId: "s-b",
        entityKind: "turn",
        phase: "turn_completion",
        primaryMode: "projection",
        shadowModeEnabled: true,
        comparisonResult: "primary_only",
        comparisonClass: "semantic_adapter_divergence",
        primaryComparableText: "stable reply"
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-terminal-semantic-shadow.mjs"),
      "--log",
      logFile,
      "--since-minutes",
      "0",
      "--session-id",
      "s-b",
      "--decision",
      "primary_only",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.window.includedComparisons, 1);
  assert.deepEqual(parsed.analysis.sessionCounts, [{ key: "s-b", count: 1 }]);
  assert.deepEqual(parsed.analysis.classCounts, [{ key: "semantic_adapter_divergence", count: 1 }]);
});
