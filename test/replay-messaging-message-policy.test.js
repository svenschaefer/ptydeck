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

test("replay-messaging-message-policy replays recorded runtime decisions without drift", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-replay-policy-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-13T10:00:00.000Z", "messaging.event.trace", {
        sessionId: "s-1",
        type: "session.output.summary",
        action: "new",
        reason: "status_update",
        profile: "coding-agent",
        comparableText: "The gate is still closed.",
        aggregationReason: "separator_hint",
        deliveryScope: "",
        deliveryBlockKey: "",
        noiseClass: "",
        targetChatId: "-100",
        targetThreadId: 17,
        delivery: [{ adapter: "telegram", delivered: false, action: "new", error: "", rateLimited: false }]
      }),
      debugLine("2026-04-13T10:00:01.000Z", "messaging.event.trace", {
        sessionId: "s-1",
        type: "session.activity.idle",
        action: "suppress",
        reason: "idle_after_status_attempt",
        profile: "coding-agent",
        comparableText: "Session idle.",
        aggregationReason: "",
        deliveryScope: "",
        deliveryBlockKey: "",
        noiseClass: "",
        targetChatId: "-100",
        targetThreadId: 17,
        delivery: []
      }),
      debugLine("2026-04-13T10:00:02.000Z", "messaging.event.trace", {
        sessionId: "s-1",
        type: "session.output.summary",
        action: "new",
        reason: "codex_separator_info_new_block",
        profile: "coding-agent",
        comparableText: "Ja. Der Fall ist jetzt sauber eingegrenzt.",
        aggregationReason: "codex_separator_info",
        deliveryScope: "codex_separator_info",
        deliveryBlockKey: "anchor-1:info-1",
        noiseClass: "",
        targetChatId: "-100",
        targetThreadId: 17,
        delivery: [{ adapter: "telegram", delivered: true, action: "new", error: "", rateLimited: false }]
      }),
      debugLine("2026-04-13T10:00:03.000Z", "messaging.event.trace", {
        sessionId: "s-1",
        type: "session.output.summary",
        action: "update",
        reason: "codex_separator_info_block_update",
        profile: "coding-agent",
        comparableText: "Ja. Der Fall ist jetzt sauber eingegrenzt.",
        aggregationReason: "codex_separator_info",
        deliveryScope: "codex_separator_info",
        deliveryBlockKey: "anchor-1:info-1",
        noiseClass: "",
        targetChatId: "-100",
        targetThreadId: 17,
        delivery: [{ adapter: "telegram", delivered: true, action: "update", error: "", rateLimited: false }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "replay-messaging-message-policy.mjs"),
      "--log",
      logFile,
      "--since-minutes",
      "0",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.window.traceEvents, 4);
  assert.equal(parsed.analysis.matchedEvents, 4);
  assert.equal(parsed.analysis.mismatchCount, 0);
  assert.deepEqual(parsed.analysis.actionCounts.recorded, parsed.analysis.actionCounts.replayed);
});

test("replay-messaging-message-policy can fail in strict mode when recorded decisions drift", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-replay-policy-"));
  const logFile = path.join(dir, "backend.log");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-13T10:05:00.000Z", "messaging.event.trace", {
        sessionId: "s-2",
        type: "session.output.summary",
        action: "new",
        reason: "wrong_reason",
        profile: "coding-agent",
        comparableText: "The gate is still closed.",
        aggregationReason: "separator_hint",
        deliveryScope: "",
        deliveryBlockKey: "",
        noiseClass: "",
        targetChatId: "-100",
        targetThreadId: 18,
        delivery: [{ adapter: "telegram", delivered: false, action: "new", error: "", rateLimited: false }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        path.join(repoRoot, "scripts", "replay-messaging-message-policy.mjs"),
        "--log",
        logFile,
        "--since-minutes",
        "0",
        "--format",
        "json",
        "--strict"
      ],
      { cwd: repoRoot }
    ),
    (error) => error && error.code === 2
  );
});
