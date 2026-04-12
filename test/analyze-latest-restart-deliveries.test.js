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

test("analyze-latest-restart-deliveries classifies restart resend bursts as not sensible", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-latest-restart-deliveries-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-12T08:50:00.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_summary_sentence",
        reason: "codex_separator_summary_sentence_new_block",
        comparableText: "updated and synchronized the three files with current validated state.",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      }),
      debugLine("2026-04-12T08:53:42.000Z", "runtime.ready", {
        port: 18080,
        sessionCount: 15
      }),
      debugLine("2026-04-12T08:52:55.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_summary_sentence",
        reason: "codex_separator_summary_sentence_new_block",
        comparableText: "updated and synchronized the three files with current validated state.",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      }),
      debugLine("2026-04-12T08:53:05.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_summary_sentence",
        reason: "codex_separator_summary_sentence_new_block",
        comparableText: "updated and synchronized the three files with current validated state.",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      }),
      debugLine("2026-04-12T08:54:10.000Z", "messaging.inbound.action", {
        sessionId: "s1",
        messageThreadId: 17,
        reason: "input_text",
        ok: true,
        preview: "hello"
      }),
      debugLine("2026-04-12T08:54:20.000Z", "messaging.event.trace", {
        sessionId: "s1",
        targetThreadId: 17,
        deliveryScope: "codex_separator_info",
        reason: "codex_separator_info_new_block",
        comparableText: "fresh post-startup item",
        delivery: [{ adapter: "telegram", delivered: true, action: "new" }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-latest-restart-deliveries.mjs"),
      "--log",
      logFile,
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const report = JSON.parse(stdout);
  assert.equal(report.readyAt, "2026-04-12T08:53:42.000Z");
  assert.equal(report.deliveredTotal, 3);
  assert.equal(report.sensibleTotal, 1);
  assert.equal(report.notSensibleTotal, 2);
  assert.deepEqual(report.events[0].problemReasons, [
    "restart-history-resend",
    "pre-ready-delivery",
    "before-first-fresh-input",
    "duplicate-burst"
  ]);
  assert.equal(report.events[2].sensible, true);
});
