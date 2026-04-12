const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

function captureEntry({ timestamp, sessionId, sessionName, deckId, appLabel, cleanedText }) {
  return JSON.stringify({
    timestamp,
    session: { id: sessionId, name: sessionName, deckId },
    appIdentity: { label: appLabel },
    cleaned: {
      chars: cleanedText.length,
      base64: Buffer.from(cleanedText, "utf8").toString("base64"),
      visiblePreview: cleanedText
    }
  });
}

function debugLine(timestamp, event, payload) {
  return `[ptydeck-backend][${timestamp}] ${event} ${JSON.stringify(payload)}`;
}

test("analyze-live-messaging-runtime summarizes inbound, allowlist delivery, and blocked summary misses", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-live-analysis-"));
  const logFile = path.join(dir, "backend.log");
  const captureFile = path.join(dir, "capture.jsonl");

  await writeFile(
    captureFile,
    [
      captureEntry({
        timestamp: "2026-04-12T08:00:05.000Z",
        sessionId: "s-pty",
        sessionName: "ptydeck",
        deckId: "ptydeck",
        appLabel: "codex",
        cleanedText: "Nachlauf nach Telegram-Input"
      }),
      captureEntry({
        timestamp: "2026-04-12T08:00:06.000Z",
        sessionId: "s-ai",
        sessionName: "ai-playbooks",
        deckId: "ai-playbooks",
        appLabel: "codex",
        cleanedText: "validated:"
      })
    ].join("\n") + "\n",
    "utf8"
  );

  await writeFile(
    logFile,
    [
      debugLine("2026-04-12T08:00:00.000Z", "messaging.inbound.update", {
        phase: "received",
        reason: "input_text",
        chatId: "-100",
        messageThreadId: 17,
        preview: "hello"
      }),
      debugLine("2026-04-12T08:00:01.000Z", "messaging.inbound.action", {
        action: "input",
        ok: true,
        chatId: "-100",
        messageThreadId: 17,
        sessionId: "s-pty",
        preview: "hello"
      }),
      debugLine("2026-04-12T08:00:02.000Z", "messaging.inbound.update", {
        phase: "handled",
        reason: "input_text",
        chatId: "-100",
        messageThreadId: 17,
        preview: "hello",
        ok: true,
        responsePreview: "Input sent to [7] ptydeck."
      }),
      debugLine("2026-04-12T08:00:03.000Z", "messaging.event.trace", {
        sessionId: "s-pty",
        type: "session.output.summary",
        action: "new",
        reason: "codex_separator_section_new_block",
        aggregationReason: "codex_separator_section",
        deliveryScope: "codex_separator_section",
        targetThreadId: 17,
        comparableText: "The restart is clean.",
        delivery: [{ adapter: "telegram", delivered: true, action: "new", error: "", rateLimited: false }]
      }),
      debugLine("2026-04-12T08:00:04.000Z", "messaging.event.trace", {
        sessionId: "s-ai",
        type: "session.output.summary",
        action: "new",
        reason: "status_update",
        aggregationReason: "separator_hint",
        deliveryScope: "",
        targetThreadId: 16,
        comparableText: "validated:",
        delivery: [{ adapter: "telegram", delivered: false, action: "new", error: "", rateLimited: false }]
      }),
      debugLine("2026-04-12T08:00:05.000Z", "messaging.event.trace", {
        sessionId: "s-pty",
        type: "session.attention.required",
        action: "alert",
        reason: "attention_required",
        aggregationReason: "",
        deliveryScope: "",
        targetThreadId: 17,
        comparableText: "Too Many Requests",
        delivery: [{ adapter: "telegram", delivered: false, action: "alert", error: "", rateLimited: false }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-live-messaging-runtime.mjs"),
      "--log",
      logFile,
      "--capture-file",
      captureFile,
      "--since-minutes",
      "0",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.window.parsedLines, 6);
  assert.deepEqual(parsed.analysis.inboundReasonCounts, [{ key: "input_text", count: 2 }]);
  assert.deepEqual(parsed.analysis.deliveredScopeCounts, [{ key: "codex_separator_section", count: 1 }]);
  assert.equal(parsed.analysis.summaryOnlyMisses.length, 1);
  assert.equal(parsed.analysis.summaryOnlyMisses[0].sessionName, "ai-playbooks");
  assert.equal(parsed.analysis.blockedAttentionExamples.length, 1);
  assert.equal(parsed.analysis.recentHandledInputs.length, 1);
  assert.equal(parsed.analysis.recentHandledInputs[0].followupEntries, 1);
  assert.equal(parsed.analysis.sessionSummaries[0].sessionName, "ptydeck");
});

test("analyze-live-messaging-runtime can resolve deck and session metadata from target updates", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-live-analysis-"));
  const logFile = path.join(dir, "backend.log");
  const captureFile = path.join(dir, "capture.jsonl");

  await writeFile(captureFile, "", "utf8");

  await writeFile(
    logFile,
    [
      debugLine("2026-04-12T08:10:00.000Z", "messaging.target.update", {
        adapter: "telegram",
        phase: "topic_reused",
        sessionId: "s-ai",
        chatId: "-100",
        messageThreadId: 16,
        topicName: "ai-playbooks + ai-playbooks"
      }),
      debugLine("2026-04-12T08:10:01.000Z", "messaging.event.trace", {
        sessionId: "s-ai",
        type: "session.output.summary",
        action: "new",
        reason: "status_update",
        aggregationReason: "separator_hint",
        deliveryScope: "",
        targetThreadId: 16,
        comparableText: "validated:",
        delivery: [{ adapter: "telegram", delivered: false, action: "new", error: "", rateLimited: false }]
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "analyze-live-messaging-runtime.mjs"),
      "--log",
      logFile,
      "--capture-file",
      captureFile,
      "--since-minutes",
      "0",
      "--deck-id",
      "ai-playbooks",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.window.parsedLines, 2);
  assert.equal(parsed.analysis.summaryOnlyMisses.length, 1);
  assert.equal(parsed.analysis.summaryOnlyMisses[0].sessionName, "ai-playbooks");
  assert.equal(parsed.analysis.summaryOnlyMisses[0].deckId, "ai-playbooks");
  assert.equal(parsed.analysis.sessionSummaries.length, 1);
  assert.equal(parsed.analysis.sessionSummaries[0].sessionName, "ai-playbooks");
});
