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

test("analyze-restart-resends flags prior-history startup deliveries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-restart-resends-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-12T07:45:30.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_summary_sentence",
        reason: "codex_separator_summary_sentence_new_block",
        comparableText: "updated and aligned all markdown files to us english, with clear separation",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      }),
      debugLine("2026-04-12T08:52:10.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_summary_sentence",
        reason: "codex_separator_summary_sentence_new_block",
        comparableText: "updated and aligned all markdown files to us english, with clear separation",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      }),
      debugLine("2026-04-12T08:53:42.000Z", "runtime.ready", {
        port: 18080,
        sessionCount: 15
      }),
      debugLine("2026-04-12T08:54:30.000Z", "messaging.inbound.action", {
        sessionId: "s1",
        messageThreadId: 17,
        reason: "input_text",
        ok: true,
        preview: "hello"
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-restart-resends.mjs"),
      "--log",
      logFile,
      "--restart-count",
      "1",
      "--startup-lookback-seconds",
      "180",
      "--post-ready-seconds",
      "120",
      "--history-lookback-hours",
      "24",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const report = JSON.parse(stdout);
  assert.equal(report.restarts.length, 1);
  assert.equal(report.restarts[0].deliveredTotal, 1);
  assert.equal(report.restarts[0].priorHistoryMatches, 1);
  assert.equal(report.restarts[0].strategySummary.preReadySuppression, 1);
  assert.equal(report.restarts[0].strategySummary.priorHistorySuppression, 1);
  assert.equal(report.restarts[0].strategySummary.hybridSuppression, 1);
});

test("analyze-restart-resends leaves novel post-startup delivery untouched", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-restart-resends-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-12T08:53:42.000Z", "runtime.ready", {
        port: 18080,
        sessionCount: 15
      }),
      debugLine("2026-04-12T08:54:05.000Z", "messaging.inbound.action", {
        sessionId: "s1",
        messageThreadId: 17,
        reason: "input_text",
        ok: true,
        preview: "hello"
      }),
      debugLine("2026-04-12T08:54:15.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_info",
        reason: "codex_separator_info_new_block",
        comparableText: "this is a fresh post-startup item",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-restart-resends.mjs"),
      "--log",
      logFile,
      "--restart-count",
      "1",
      "--startup-lookback-seconds",
      "180",
      "--post-ready-seconds",
      "120",
      "--history-lookback-hours",
      "24",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const report = JSON.parse(stdout);
  assert.equal(report.restarts.length, 1);
  assert.equal(report.restarts[0].deliveredTotal, 1);
  assert.equal(report.restarts[0].priorHistoryMatches, 0);
  assert.equal(report.restarts[0].strategySummary.preReadySuppression, 0);
  assert.equal(report.restarts[0].strategySummary.priorHistorySuppression, 0);
  assert.equal(report.restarts[0].strategySummary.hybridSuppression, 0);
});
