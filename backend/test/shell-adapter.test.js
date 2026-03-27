import test from "node:test";
import assert from "node:assert/strict";
import {
  createShellAdapter,
  listShellCwdTrackingCapabilities
} from "../src/shell-adapter.js";

test("shell adapter exposes explicit cwd-tracking capability matrix", () => {
  const capabilities = listShellCwdTrackingCapabilities();
  assert.deepEqual(
    capabilities.map((entry) => ({
      family: entry.family,
      cwdTrackingSupported: entry.cwdTrackingSupported,
      cwdTrackingMode: entry.cwdTrackingMode,
      fallbackBehavior: entry.fallbackBehavior
    })),
    [
      {
        family: "bash",
        cwdTrackingSupported: true,
        cwdTrackingMode: "prompt_command_marker",
        fallbackBehavior: "n/a"
      },
      {
        family: "zsh",
        cwdTrackingSupported: false,
        cwdTrackingMode: "unsupported",
        fallbackBehavior: "retain_last_known_cwd"
      },
      {
        family: "fish",
        cwdTrackingSupported: false,
        cwdTrackingMode: "unsupported",
        fallbackBehavior: "retain_last_known_cwd"
      },
      {
        family: "posix_sh",
        cwdTrackingSupported: false,
        cwdTrackingMode: "unsupported",
        fallbackBehavior: "retain_last_known_cwd"
      },
      {
        family: "unknown",
        cwdTrackingSupported: false,
        cwdTrackingMode: "unsupported",
        fallbackBehavior: "retain_last_known_cwd"
      }
    ]
  );
});

test("bash shell adapter injects PROMPT_COMMAND marker and consumes cwd markers", () => {
  const adapter = createShellAdapter("/usr/bin/bash");
  const env = adapter.prepareSpawnEnv({ PROMPT_COMMAND: "echo existing" });
  assert.match(env.PROMPT_COMMAND, /printf "__CWD__%s__\\n" "\$PWD"/);
  assert.match(env.PROMPT_COMMAND, /echo existing/);

  const session = {
    cwdTrackingBuffer: "",
    meta: { cwd: "/tmp" }
  };
  const cleaned = adapter.consumeOutput(session, '__CWD__/srv/project__\r\npwd\r\n/srv/project\r\n');
  assert.equal(session.meta.cwd, "/srv/project");
  assert.equal(cleaned, "pwd\r\n/srv/project\r\n");
});

test("bash shell adapter handles split cwd markers across chunks", () => {
  const adapter = createShellAdapter("bash");
  const session = {
    cwdTrackingBuffer: "",
    meta: { cwd: "/tmp" }
  };

  const first = adapter.consumeOutput(session, "__CWD__/srv/");
  const second = adapter.consumeOutput(session, "repo__\r\necho ok\r\nok\r\n");

  assert.equal(first, "");
  assert.equal(second, "echo ok\r\nok\r\n");
  assert.equal(session.meta.cwd, "/srv/repo");
  assert.equal(session.cwdTrackingBuffer, "");
});

test("unsupported shell adapters keep env/output unchanged and rely on last known cwd", () => {
  for (const shell of ["zsh", "fish", "sh", "/usr/bin/unknown-shell"]) {
    const adapter = createShellAdapter(shell);
    const env = adapter.prepareSpawnEnv({ PROMPT_COMMAND: "echo existing" });
    assert.deepEqual(env, { PROMPT_COMMAND: "echo existing" });

    const session = {
      cwdTrackingBuffer: "",
      meta: { cwd: "/tmp/original" }
    };
    const chunk = "pwd\r\n/tmp/current\r\n";
    const cleaned = adapter.consumeOutput(session, chunk);
    assert.equal(cleaned, chunk);
    assert.equal(session.meta.cwd, "/tmp/original");
    assert.equal(session.cwdTrackingBuffer, "");
    assert.equal(adapter.capability.cwdTrackingSupported, false);
  }
});
