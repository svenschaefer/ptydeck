const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

function captureEntry({ timestamp, sessionName, deckId, appLabel, cleanedText, promptBoundaries = [] }) {
  return JSON.stringify({
    timestamp,
    type: "session.stream.chunk",
    session: {
      id: "s1",
      name: sessionName,
      deckId
    },
    appIdentity: {
      label: appLabel
    },
    cleaned: {
      chars: cleanedText.length,
      base64: Buffer.from(cleanedText, "utf8").toString("base64")
    },
    promptBoundaries
  });
}

test("experiment-codex-first-use-case replays capture through the shared evaluator", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-codex-first-use-case-"));
  const captureFile = path.join(dir, "capture.jsonl");
  const captureLines = [
    captureEntry({
      timestamp: "2026-04-12T10:00:00.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:01.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand.\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:01.300Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "  Damit der Analyse-Slice sauber abgeschlossen ist.\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:02.000Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:00:02.500Z",
      sessionName: "ptydeck",
      deckId: "ptydeck",
      appLabel: "codex",
      cleanedText: "• Ran git status --short\n"
    })
  ];
  await writeFile(captureFile, `${captureLines.join("\n")}\n`, "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "experiment-codex-first-use-case.mjs"),
      "--capture-file",
      captureFile,
      "--session-name",
      "ptydeck",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.maxGapMs, 4500);
  assert.equal(parsed.maxLookahead, 120);
  assert.equal(parsed.analysis.scopedEntries, 5);
  assert.equal(parsed.analysis.separatorAnchors, 2);
  assert.equal(parsed.analysis.candidates.length, 1);
  assert.equal(parsed.analysis.rejections.length, 1);
  assert.equal(parsed.analysis.decisions.length, 2);
  assert.equal(parsed.analysis.candidates[0].reason, "continuation_merged");
  assert.equal(
    parsed.analysis.candidates[0].text,
    "Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand. Damit der Analyse-Slice sauber abgeschlossen ist."
  );
  assert.equal(parsed.analysis.rejections[0].reason, "first_bullet_ran");
});

test("experiment-codex-first-use-case accepts ai-playbooks-style contaminated separators and wider bounded gaps", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptydeck-codex-first-use-case-"));
  const captureFile = path.join(dir, "capture.jsonl");
  const captureLines = [
    captureEntry({
      timestamp: "2026-04-12T10:10:00.000Z",
      sessionName: "ai-playbooks",
      deckId: "default",
      appLabel: "codex",
      cleanedText: "───────────────────────────────────────────────────────────ooor\n"
    }),
    captureEntry({
      timestamp: "2026-04-12T10:10:03.923Z",
      sessionName: "ai-playbooks",
      deckId: "default",
      appLabel: "codex",
      cleanedText: "• Die .local-Runtime ist weiter sauber (runtime-contract, healthz, manage alle grün). Es fehlen jetzt noch der Diff-Whitespace-Check und der volle ci:check; danach committe und pushe ich.\n"
    })
  ];
  await writeFile(captureFile, `${captureLines.join("\n")}\n`, "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "experiment-codex-first-use-case.mjs"),
      "--capture-file",
      captureFile,
      "--session-name",
      "ai-playbooks",
      "--format",
      "json"
    ],
    { cwd: repoRoot }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.maxGapMs, 4500);
  assert.equal(parsed.analysis.candidates.length, 1);
  assert.equal(parsed.analysis.rejections.length, 0);
  assert.equal(parsed.analysis.candidates[0].gapMs, 3923);
  assert.match(parsed.analysis.candidates[0].text, /Die \.local-Runtime ist weiter sauber/);
});
