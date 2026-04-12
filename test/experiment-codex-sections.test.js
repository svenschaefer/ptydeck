const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

function captureEntry({ timestamp, sessionName, deckId, appLabel, cleanedText }) {
  return JSON.stringify({
    timestamp,
    event: "session.stream.chunk",
    session: { id: "s1", name: sessionName, deckId },
    appIdentity: { label: appLabel },
    cleaned: {
      chars: cleanedText.length,
      base64: Buffer.from(cleanedText, "utf8").toString("base64"),
      visiblePreview: cleanedText.slice(0, 200)
    }
  });
}

test("experiment-codex-sections keeps structured restart section as one candidate", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-codex-sections-"));
  const captureFile = path.join(dir, "capture.jsonl");
  const lines = [
    captureEntry({
      timestamp: "2026-04-12T10:00:00.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.100Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "• Der Restart ist sauber.›Find and fix a bug in @filename gpt-5.4 xhigh · 43% left · ~/workspace/code/ptydeck\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.200Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  Live-Zustand\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.300Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  - Backend: ok\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.400Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  - Ready: ready\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.500Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  Wichtig\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:00.600Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  - Die Delivery-Counter sind nach dem Restart wieder bei 0.\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:01.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "• Ran git status --short\n"
    })
  ];
  await writeFile(captureFile, `${lines.join("\n")}\n`, "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(repoRoot, "scripts", "experiment-codex-sections.mjs"), "--capture-file", captureFile, "--session-name", "ptydeck", "--format", "json"],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.analysis.candidates.length, 1);
  assert.match(parsed.analysis.candidates[0].text, /^Der Restart ist sauber\./);
  assert.match(parsed.analysis.candidates[0].text, /Live-Zustand/);
  assert.match(parsed.analysis.candidates[0].text, /- Backend: ok/);
  assert.match(parsed.analysis.candidates[0].text, /Wichtig/);
  assert.match(parsed.analysis.candidates[0].text, /Delivery-Counter sind nach dem Restart wieder bei 0/);
});

test("experiment-codex-sections still rejects separator without info bullet", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-codex-sections-"));
  const captureFile = path.join(dir, "capture.jsonl");
  const lines = [
    captureEntry({
      timestamp: "2026-04-12T10:10:00.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:10:00.100Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "Working\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:10:00.200Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "background terminal running · /ps to view · /stop to close\n"
    })
  ];
  await writeFile(captureFile, `${lines.join("\n")}\n`, "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(repoRoot, "scripts", "experiment-codex-sections.mjs"), "--capture-file", captureFile, "--session-name", "ptydeck", "--format", "json"],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.analysis.candidates.length, 0);
  assert.equal(parsed.analysis.rejections.length, 1);
  assert.equal(parsed.analysis.rejections[0].reason, "marker_before_info");
});
