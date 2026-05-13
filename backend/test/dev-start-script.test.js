import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("backend dev start script auto-loads the local backend env file when present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-backend-dev-env-"));
  const envFile = join(dir, "backend.env.local");
  await writeFile(
    envFile,
    [
      "BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log",
      "SESSION_STREAM_ANALYSIS_CAPTURE_FILE=/tmp/ptydeck-session-stream-analysis.jsonl",
      "SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex,gemini-cli",
      "SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432"
    ].join("\n"),
    "utf8"
  );

  const result = await runCommand(
    "bash",
    ["backend/scripts/run-dev.sh"],
    {
      cwd: "/home/wsl/workspace/code/ptydeck",
      env: {
        ...process.env,
        PTYDECK_BACKEND_ENV_FILE: envFile,
        PTYDECK_BACKEND_DEV_COMMAND: "env"
      }
    }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /BACKEND_DEBUG_LOG_FILE=\/tmp\/ptydeck-backend-debug\.log/);
  assert.match(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_FILE=\/tmp\/ptydeck-session-stream-analysis\.jsonl/);
  assert.match(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex,gemini-cli/);
  assert.match(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432/);
});

test("backend dev start script can skip the local backend env file for lightweight runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-backend-dev-env-skip-"));
  const envFile = join(dir, "backend.env.local");
  await writeFile(
    envFile,
    [
      "BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log",
      "SESSION_STREAM_ANALYSIS_CAPTURE_FILE=/tmp/ptydeck-session-stream-analysis.jsonl",
      "SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex,gemini-cli",
      "SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432"
    ].join("\n"),
    "utf8"
  );

  const result = await runCommand(
    "bash",
    ["backend/scripts/run-dev.sh"],
    {
      cwd: "/home/wsl/workspace/code/ptydeck",
      env: {
        ...process.env,
        BACKEND_DEBUG_LOG_FILE: "",
        SESSION_STREAM_ANALYSIS_CAPTURE_FILE: "",
        SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS: "",
        SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES: "",
        PTYDECK_BACKEND_ENV_FILE: envFile,
        PTYDECK_BACKEND_SKIP_LOCAL_ENV: "1",
        PTYDECK_BACKEND_DEV_COMMAND: "env"
      }
    }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /BACKEND_DEBUG_LOG_FILE=\/tmp\/ptydeck-backend-debug\.log/);
  assert.doesNotMatch(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_FILE=\/tmp\/ptydeck-session-stream-analysis\.jsonl/);
  assert.doesNotMatch(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex,gemini-cli/);
  assert.doesNotMatch(result.stdout, /SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432/);
});
