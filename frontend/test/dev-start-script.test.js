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

test("frontend dev start script auto-loads the local frontend env file when present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-frontend-dev-env-"));
  const envFile = join(dir, "frontend.env.local");
  await writeFile(
    envFile,
    [
      "FRONTEND_PORT=18091",
      "FRONTEND_CANONICAL_ORIGIN=https://ptydeck.local.secos.rocks",
      "FRONTEND_DEBUG_LOGS=1"
    ].join("\n"),
    "utf8"
  );

  const result = await runCommand(
    "bash",
    ["frontend/scripts/run-dev.sh"],
    {
      cwd: "/home/wsl/workspace/code/ptydeck",
      env: {
        ...process.env,
        PTYDECK_FRONTEND_ENV_FILE: envFile,
        PTYDECK_FRONTEND_DEV_COMMAND: "env"
      }
    }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /FRONTEND_PORT=18091/);
  assert.match(result.stdout, /FRONTEND_CANONICAL_ORIGIN=https:\/\/ptydeck\.local\.secos\.rocks/);
  assert.match(result.stdout, /FRONTEND_DEBUG_LOGS=1/);
});
