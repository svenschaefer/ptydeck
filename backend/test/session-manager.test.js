import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { SessionManager } from "../src/session-manager.js";

const INPUT_SAFETY_PROFILE = {
  requireValidShellSyntax: true,
  confirmOnIncompleteShellConstruct: true,
  confirmOnNaturalLanguageInput: true,
  confirmOnDangerousShellCommand: false,
  confirmOnMultilineInput: true,
  confirmOnRecentTargetSwitch: true,
  targetSwitchGraceMs: 2500,
  pasteLengthConfirmThreshold: 320,
  pasteLineConfirmThreshold: 4
};

function createFakePty() {
  let lastExitHandler = null;
  let lastDataHandler = null;

  return {
    writes: [],
    resizeCalls: [],
    killSignals: [],
    killed: false,
    onExit(handler) {
      lastExitHandler = handler;
    },
    onData(handler) {
      lastDataHandler = handler;
    },
    write(data) {
      this.writes.push(data);
      if (lastDataHandler) {
        lastDataHandler(data);
      }
    },
    resize(cols, rows) {
      this.resizeCalls.push({ cols, rows });
    },
    kill(signal) {
      this.killSignals.push(signal || "SIGHUP");
      this.killed = true;
      if (lastExitHandler) {
        lastExitHandler({ exitCode: 0, signal: 0 });
      }
    }
  };
}

test("SessionManager create/list/get/delete lifecycle", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    defaultShell: "bash",
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  assert.equal(typeof created.id, "string");
  assert.equal(created.state, "running");
  assert.equal(typeof created.startedAt, "number");
  assert.equal(created.cwd, "/tmp");
  assert.equal(created.startCwd, "/tmp");
  assert.equal(created.startCommand, "");
  assert.equal(created.note, undefined);
  assert.deepEqual(created.env, {});
  assert.equal(typeof created.inputSafetyProfile, "object");
  assert.equal(created.inputSafetyProfile.requireValidShellSyntax, false);
  assert.equal(created.inputSafetyProfile.targetSwitchGraceMs, 4000);
  assert.deepEqual(created.tags, []);
  assert.equal(typeof created.themeProfile, "object");
  assert.equal(created.themeProfile.background, "#0a0d12");
  assert.equal(created.activityState, "inactive");
  assert.equal(typeof created.activityUpdatedAt, "number");
  assert.equal(created.activityCompletedAt, null);

  const listed = manager.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const session = manager.get(created.id);
  assert.equal(session.meta.shell, "bash");

  manager.delete(created.id);
  assert.equal(fakePty.killed, true);
  assert.equal(manager.list().length, 0);
});

test("SessionManager emits explicit created and started lifecycle events", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const events = [];

  manager.on("session.created", (event) => events.push({ type: "session.created", state: event.session.state }));
  manager.on("session.started", (event) => events.push({ type: "session.started", state: event.session.state }));
  manager.on("session.updated", (event) => events.push({ type: "session.updated", state: event.session.state }));

  const created = manager.create({ cwd: "/tmp" });

  assert.equal(created.state, "running");
  assert.deepEqual(events, [
    { type: "session.created", state: "starting" },
    { type: "session.started", state: "running" },
    { type: "session.updated", state: "running" }
  ]);
});

test("SessionManager emits stable exit metadata", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    nowFn: () => 1710000001234
  });
  const created = manager.create({ cwd: "/tmp" });
  const exits = [];
  manager.on("session.exit", (event) => exits.push(event));

  fakePty.kill();

  assert.equal(exits.length, 1);
  assert.equal(exits[0].sessionId, created.id);
  assert.equal(exits[0].exitCode, 0);
  assert.equal(exits[0].signal, "");
  assert.equal(exits[0].exitedAt, 1710000001234);
  assert.equal(exits[0].updatedAt, 1710000001234);
});

test("SessionManager emits activity completion after quiet period and persists inactive metadata in-session", async () => {
  const fakePty = createFakePty();
  let currentTime = 1710000000000;
  const manager = new SessionManager({
    createPty: () => fakePty,
    nowFn: () => currentTime,
    sessionActivityQuietMs: 5
  });
  const created = manager.create({ cwd: "/tmp" });
  const events = [];
  manager.on("session.activity.started", (event) =>
    events.push({ type: "session.activity.started", state: event.session.activityState })
  );
  manager.on("session.activity.completed", (event) =>
    events.push({
      type: "session.activity.completed",
      state: event.session.activityState,
      activityCompletedAt: event.activityCompletedAt
    })
  );

  currentTime += 1;
  fakePty.write("Working...\n");
  await new Promise((resolve) => setTimeout(resolve, 10));

  const session = manager.get(created.id).meta;
  assert.deepEqual(events, [
    { type: "session.activity.started", state: "active" },
    {
      type: "session.activity.completed",
      state: "inactive",
      activityCompletedAt: session.activityCompletedAt
    }
  ]);
  assert.equal(session.activityState, "inactive");
  assert.equal(typeof session.activityUpdatedAt, "number");
  assert.equal(typeof session.activityCompletedAt, "number");
});

test("SessionManager sendInput and resize call PTY", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({});
  manager.sendInput(created.id, "ls\n");
  manager.resize(created.id, 120, 40);

  assert.deepEqual(fakePty.writes, ["ls\n"]);
  assert.deepEqual(fakePty.resizeCalls, [{ cols: 120, rows: 40 }]);
});

test("SessionManager updates cwd from marker output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp" });
  fakePty.write("__CWD__/home/wsl/workspace__");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl/workspace");
});

test("SessionManager strips cwd markers from terminal output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });
  const chunks = [];
  manager.on("session.data", (event) => {
    if (event.sessionId === created.id) {
      chunks.push(event.data);
    }
  });

  fakePty.write("__CWD__/home/wsl__\r\n");
  fakePty.write("pwd\r\n/home/wsl\r\n");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl");
  assert.deepEqual(chunks, ["pwd\r\n/home/wsl\r\n"]);
});

test("SessionManager strips split cwd markers across chunks", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });
  const chunks = [];
  manager.on("session.data", (event) => {
    if (event.sessionId === created.id) {
      chunks.push(event.data);
    }
  });

  fakePty.write("__CWD__/home/");
  fakePty.write("wsl__\r\n");
  fakePty.write("echo ok\r\nok\r\n");

  assert.equal(manager.get(created.id).meta.cwd, "/home/wsl");
  assert.deepEqual(chunks, ["echo ok\r\nok\r\n"]);
});

test("SessionManager snapshot includes buffered terminal output", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp" });

  fakePty.write("hello\r\n");

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.sessions[0].id, created.id);
  assert.equal(snapshot.outputs.length, 1);
  assert.equal(snapshot.outputs[0].sessionId, created.id);
  assert.equal(snapshot.outputs[0].data, "hello\r\n");
});

test("SessionManager snapshot respects configurable replay memory limit", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionReplayMemoryMaxChars: 5
  });
  const created = manager.create({ cwd: "/tmp" });

  fakePty.write("hello world\r\n");

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.outputs.length, 1);
  assert.equal(snapshot.outputs[0].sessionId, created.id);
  assert.equal(snapshot.outputs[0].data, "rld\r\n");
});

test("SessionManager can seed replay output for restored sessions", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionReplayMemoryMaxChars: 8
  });

  const created = manager.create({
    id: "restore-1",
    cwd: "/tmp",
    replayOutput: "line-1\r\nline-2\r\n"
  });

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.outputs.length, 1);
  assert.equal(snapshot.outputs[0].sessionId, created.id);
  assert.equal(snapshot.outputs[0].data, "line-2\r\n");
});

test("SessionManager exposes replay export metadata including truncation state", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionReplayMemoryMaxChars: 5
  });
  const created = manager.create({ cwd: "/tmp" });

  fakePty.write("hello world\r\n");

  const replayExport = manager.getReplayExport(created.id);
  assert.equal(replayExport.sessionId, created.id);
  assert.equal(replayExport.data, "rld\r\n");
  assert.equal(replayExport.retainedChars, 5);
  assert.equal(replayExport.retentionLimitChars, 5);
  assert.equal(replayExport.truncated, true);
});

test("SessionManager replay export reports truncation when replay retention is disabled", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionReplayMemoryMaxChars: 0
  });
  const created = manager.create({ cwd: "/tmp" });

  fakePty.write("output that cannot be retained");

  const replayExport = manager.getReplayExport(created.id);
  assert.equal(replayExport.data, "");
  assert.equal(replayExport.retainedChars, 0);
  assert.equal(replayExport.retentionLimitChars, 0);
  assert.equal(replayExport.truncated, true);
});

test("SessionManager throws on unknown session", () => {
  const manager = new SessionManager({
    createPty: () => createFakePty()
  });

  assert.throws(() => manager.get("missing"));
  assert.throws(() => manager.sendInput("missing", "pwd\n"));
  assert.throws(() => manager.resize("missing", 80, 24));
  assert.throws(() => manager.delete("missing"));
});

test("SessionManager create honors persisted timestamps when provided", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({
    id: "restore-1",
    cwd: "/tmp",
    shell: "bash",
    createdAt: 1710000000000,
    updatedAt: 1710000001234
  });

  assert.equal(created.createdAt, 1710000000000);
  assert.equal(created.updatedAt, 1710000001234);
});

test("SessionManager defaults cwd to user home when not provided", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ shell: "bash" });
  assert.equal(created.cwd, homedir());
});

test("SessionManager builds deterministic ssh launch options and persists remote metadata", () => {
  const fakePty = createFakePty();
  let spawnOptions = null;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions = options;
      return fakePty;
    }
  });

  const created = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 2222,
      username: "ops"
    },
    startCwd: "~/workspace",
    startCommand: "pwd"
  });

  assert.equal(created.kind, "ssh");
  assert.deepEqual(created.remoteConnection, {
    host: "example.internal",
    port: 2222,
    username: "ops"
  });
  assert.equal(created.shell, "ssh");
  assert.equal(created.cwd, "~/workspace");
  assert.ok(spawnOptions);
  assert.equal(spawnOptions.command, "ssh");
  assert.equal(spawnOptions.shell, "ssh");
  assert.equal(spawnOptions.cwd, homedir());
  assert.deepEqual(spawnOptions.args.slice(0, 18), [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-p",
    "2222",
    "-l",
    "ops",
    "example.internal"
  ]);
  assert.equal(fakePty.writes.length, 0);
  assert.match(spawnOptions.args[18], /^sh -lc '/);
  assert.match(spawnOptions.args[18], /pwd/);
});

test("SessionManager wires askpass env for password ssh auth without persisting the secret", () => {
  const fakePty = createFakePty();
  let spawnOptions = null;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions = options;
      return fakePty;
    },
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh"
  });

  const created = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "password"
    },
    remoteSecret: "super-secret"
  });

  assert.equal(created.kind, "ssh");
  assert.deepEqual(created.remoteAuth, { method: "password" });
  assert.equal(created.remoteSecret, undefined);
  assert.ok(spawnOptions);
  assert.deepEqual(spawnOptions.args.slice(0, 13), [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "PreferredAuthentications=password",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no"
  ]);
  assert.equal(spawnOptions.env.SSH_ASKPASS, "/tmp/ptydeck-test-askpass.sh");
  assert.equal(spawnOptions.env.SSH_ASKPASS_REQUIRE, "force");
  assert.equal(spawnOptions.env.DISPLAY, "ptydeck-ssh-askpass");
  assert.equal(spawnOptions.env.PTYDECK_SSH_SECRET, "super-secret");
});

test("SessionManager supports keyboardInteractive and privateKey ssh launch variants", () => {
  const spawned = [];
  const manager = new SessionManager({
    createPty: (options) => {
      const fakePty = createFakePty();
      spawned.push({ options, fakePty });
      return fakePty;
    },
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh"
  });

  const keyboardInteractive = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22,
      username: "ops"
    },
    remoteAuth: {
      method: "keyboardInteractive"
    },
    remoteSecret: "otp-code"
  });
  const keyboardLaunch = spawned[0].options;
  assert.equal(keyboardInteractive.kind, "ssh");
  assert.deepEqual(keyboardInteractive.remoteAuth, { method: "keyboardInteractive" });
  assert.deepEqual(keyboardLaunch.args.slice(0, 15), [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "PreferredAuthentications=keyboard-interactive",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=yes",
    "-o",
    "NumberOfPasswordPrompts=1"
  ]);
  assert.equal(keyboardLaunch.env.SSH_ASKPASS, "/tmp/ptydeck-test-askpass.sh");
  assert.equal(keyboardLaunch.env.PTYDECK_SSH_SECRET, "otp-code");

  const privateKey = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 2222
    },
    remoteAuth: {
      method: "privateKey",
      privateKeyPath: "/keys/id_ed25519"
    }
  });
  const privateKeyLaunch = spawned[1].options;
  assert.deepEqual(privateKey.remoteAuth, {
    method: "privateKey",
    privateKeyPath: "/keys/id_ed25519"
  });
  assert.equal(privateKeyLaunch.args.includes("-i"), true);
  assert.equal(privateKeyLaunch.args[privateKeyLaunch.args.indexOf("-i") + 1], "/keys/id_ed25519");
});

test("SessionManager updateSession enforces ssh auth secret transitions and signal helpers", () => {
  const fakePty = createFakePty();
  fakePty.kill = function kill(signal) {
    this.killSignals.push(signal || "SIGHUP");
    this.killed = true;
  };
  let currentTime = 1000;
  const manager = new SessionManager({
    createPty: () => fakePty,
    nowFn: () => {
      currentTime += 1;
      return currentTime;
    }
  });

  const created = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "privateKey"
    }
  });

  assert.throws(() => {
    manager.updateSession(created.id, {
      remoteAuth: { method: "password" }
    });
  }, /Field 'remoteSecret' is required when changing to password or keyboardInteractive ssh auth\./);

  const passwordUpdated = manager.updateSession(created.id, {
    remoteAuth: { method: "password" },
    remoteSecret: "super-secret"
  });
  assert.deepEqual(passwordUpdated.remoteAuth, { method: "password" });
  assert.equal(manager.get(created.id).remoteSecret, "super-secret");

  const privateKeyUpdated = manager.updateSession(created.id, {
    remoteAuth: { method: "privateKey", privateKeyPath: "/keys/id_ed25519" }
  });
  assert.deepEqual(privateKeyUpdated.remoteAuth, {
    method: "privateKey",
    privateKeyPath: "/keys/id_ed25519"
  });
  assert.equal(manager.get(created.id).remoteSecret, undefined);

  manager.interrupt(created.id);
  manager.terminate(created.id);
  manager.kill(created.id);
  assert.deepEqual(fakePty.killSignals, ["SIGINT", "SIGTERM", "SIGKILL"]);
});

test("SessionManager rejects unsupported proxy and forwarding overrides for ssh sessions", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22,
        proxyJump: "bastion.internal"
      }
    });
  });
  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "privateKey",
        forwardAgent: true
      }
    });
  });
});

test("SessionManager rejects invalid ssh auth payloads and secret combinations", () => {
  const manager = new SessionManager({
    createPty: () => createFakePty()
  });

  assert.throws(() => {
    manager.create({
      remoteAuth: { method: "password" }
    });
  }, /Field 'remoteAuth' is only supported for ssh sessions\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: "password"
    });
  }, /Field 'remoteAuth' must be an object for ssh sessions\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "token"
      }
    });
  }, /Field 'remoteAuth\.method' must be 'password', 'privateKey', or 'keyboardInteractive'\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "password",
        privateKeyPath: "/keys/id_ed25519"
      },
      remoteSecret: "super-secret"
    });
  }, /Field 'remoteAuth\.privateKeyPath' is only supported for privateKey ssh auth\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "x".repeat(1025)
      }
    });
  }, /Field 'remoteAuth\.privateKeyPath' must not exceed 1024 characters\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "password"
      }
    });
  }, /Field 'remoteSecret' is required for password and keyboardInteractive ssh auth\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "privateKey"
      },
      remoteSecret: "super-secret"
    });
  }, /Field 'remoteSecret' is only supported for password and keyboardInteractive ssh auth\./);

  assert.throws(() => {
    manager.create({
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "keyboardInteractive"
      },
      remoteSecret: ""
    });
  }, /Field 'remoteSecret' must be a non-empty string up to 4096 characters\./);
});

test("SessionManager can rename sessions", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const updated = manager.rename(created.id, "ops-shell");
  assert.equal(updated.name, "ops-shell");
});

test("SessionManager stores, normalizes, clears, and restarts session notes", () => {
  const firstPty = createFakePty();
  const secondPty = createFakePty();
  let spawnCount = 0;
  const manager = new SessionManager({
    createPty: () => {
      spawnCount += 1;
      return spawnCount === 1 ? firstPty : secondPty;
    }
  });

  const created = manager.create({
    cwd: "/tmp",
    note: "  Needs   follow-up   "
  });
  assert.equal(created.note, "Needs follow-up");

  const updated = manager.updateSession(created.id, {
    note: "  capture logs before restart  "
  });
  assert.equal(updated.note, "capture logs before restart");

  const cleared = manager.updateSession(created.id, {
    note: ""
  });
  assert.equal(cleared.note, undefined);

  manager.updateSession(created.id, {
    note: "restart marker"
  });
  const restarted = manager.restart(created.id);
  assert.equal(restarted.note, "restart marker");
});

test("SessionManager stores, updates, and restarts session input safety profiles", () => {
  const firstPty = createFakePty();
  const secondPty = createFakePty();
  let spawnCount = 0;
  const manager = new SessionManager({
    createPty: () => {
      spawnCount += 1;
      return spawnCount === 1 ? firstPty : secondPty;
    }
  });

  const created = manager.create({
    cwd: "/tmp",
    inputSafetyProfile: {
      requireValidShellSyntax: true,
      confirmOnIncompleteShellConstruct: true,
      confirmOnNaturalLanguageInput: false,
      confirmOnDangerousShellCommand: true,
      confirmOnMultilineInput: false,
      confirmOnRecentTargetSwitch: true,
      targetSwitchGraceMs: 2500,
      pasteLengthConfirmThreshold: 320,
      pasteLineConfirmThreshold: 4
    }
  });
  assert.equal(created.inputSafetyProfile.requireValidShellSyntax, true);
  assert.equal(created.inputSafetyProfile.confirmOnNaturalLanguageInput, false);
  assert.equal(created.inputSafetyProfile.pasteLineConfirmThreshold, 4);

  const updated = manager.updateSession(created.id, {
    inputSafetyProfile: INPUT_SAFETY_PROFILE
  });
  assert.deepEqual(updated.inputSafetyProfile, INPUT_SAFETY_PROFILE);

  const restarted = manager.restart(created.id);
  assert.deepEqual(restarted.inputSafetyProfile, INPUT_SAFETY_PROFILE);
});

test("SessionManager injects cwd marker into bash PROMPT_COMMAND", () => {
  const originalPromptCommand = process.env.PROMPT_COMMAND;
  const fakePty = createFakePty();
  let capturedEnv = null;
  const manager = new SessionManager({
    createPty: ({ env }) => {
      capturedEnv = env;
      return fakePty;
    }
  });

  try {
    process.env.PROMPT_COMMAND = "echo existing";
    manager.create({ shell: "bash" });
    assert.ok(capturedEnv);
    assert.ok(typeof capturedEnv.PROMPT_COMMAND === "string");
    assert.ok(capturedEnv.PROMPT_COMMAND.includes('printf "__CWD__%s__\\n" "$PWD"'));
    assert.ok(capturedEnv.PROMPT_COMMAND.includes("echo existing"));
  } finally {
    if (originalPromptCommand === undefined) {
      delete process.env.PROMPT_COMMAND;
    } else {
      process.env.PROMPT_COMMAND = originalPromptCommand;
    }
  }
});

test("SessionManager leaves unsupported shells on deterministic cwd fallback without prompt injection", () => {
  const fakePty = createFakePty();
  let capturedEnv = null;
  const manager = new SessionManager({
    createPty: ({ env }) => {
      capturedEnv = env;
      return fakePty;
    }
  });

  const created = manager.create({ shell: "zsh", cwd: "/tmp/project" });
  assert.ok(capturedEnv);
  assert.equal(capturedEnv.PROMPT_COMMAND, process.env.PROMPT_COMMAND);

  fakePty.write("pwd\r\n/tmp/runtime\r\n");

  assert.equal(manager.get(created.id).meta.cwd, "/tmp/project");
});

test("SessionManager restart preserves identity and restarts PTY", () => {
  const firstPty = createFakePty();
  const secondPty = createFakePty();
  let spawnCount = 0;
  const manager = new SessionManager({
    createPty: () => {
      spawnCount += 1;
      return spawnCount === 1 ? firstPty : secondPty;
    }
  });

  const created = manager.create({
    cwd: "/tmp",
    shell: "bash",
    name: "ops-shell",
    startCwd: "/var/tmp",
    startCommand: "echo START",
    env: { FOO: "BAR" },
    note: "keep this",
    inputSafetyProfile: INPUT_SAFETY_PROFILE
  });
  const restarted = manager.restart(created.id);

  assert.equal(firstPty.killed, true);
  assert.equal(restarted.id, created.id);
  assert.equal(restarted.cwd, "/var/tmp");
  assert.equal(restarted.shell, "bash");
  assert.equal(restarted.name, "ops-shell");
  assert.equal(restarted.startCwd, "/var/tmp");
  assert.equal(restarted.startCommand, "echo START");
  assert.equal(restarted.note, "keep this");
  assert.deepEqual(restarted.env, { FOO: "BAR" });
  assert.deepEqual(restarted.inputSafetyProfile, INPUT_SAFETY_PROFILE);
  assert.deepEqual(restarted.tags, []);
  assert.equal(restarted.themeProfile.cursor, "#8ec07c");
  assert.equal(restarted.createdAt, created.createdAt);
  assert.ok(restarted.updatedAt >= created.createdAt);
  assert.equal(manager.get(created.id).ptyProcess, secondPty);
  assert.deepEqual(secondPty.writes, ["echo START\n"]);
});

test("SessionManager passes startup env overrides to PTY spawn", () => {
  const fakePty = createFakePty();
  let spawnOptions = null;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions = options;
      return fakePty;
    }
  });

  manager.create({
    shell: "bash",
    startCwd: "/opt/work",
    startCommand: "",
    env: { FOO: "BAR", HELLO: "WORLD" }
  });

  assert.ok(spawnOptions);
  assert.equal(spawnOptions.cwd, "/opt/work");
  assert.equal(spawnOptions.env.FOO, "BAR");
  assert.equal(spawnOptions.env.HELLO, "WORLD");
});

test("SessionManager normalizes tags deterministically", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({
    tags: [" Ops ", "ops", "prod", "Dev", "invalid tag"]
  });
  assert.deepEqual(created.tags, ["dev", "ops", "prod"]);

  const updated = manager.updateSession(created.id, {
    tags: ["prod", "Zebra", "alpha", "alpha", " "]
  });
  assert.deepEqual(updated.tags, ["alpha", "prod", "zebra"]);
});

test("SessionManager stores and updates full theme profile deterministically", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({
    themeProfile: {
      background: "#111111",
      foreground: "#eeeeee",
      cursor: "#ffcc00",
      black: "#000000",
      red: "#ff0000",
      green: "#00ff00",
      yellow: "#ffff00",
      blue: "#0000ff",
      magenta: "#ff00ff",
      cyan: "#00ffff",
      white: "#ffffff",
      brightBlack: "#222222",
      brightRed: "#ff6666",
      brightGreen: "#66ff66",
      brightYellow: "#ffff66",
      brightBlue: "#6666ff",
      brightMagenta: "#ff66ff",
      brightCyan: "#66ffff",
      brightWhite: "#fefefe"
    }
  });
  assert.equal(created.themeProfile.background, "#111111");
  assert.equal(created.themeProfile.brightWhite, "#fefefe");

  const updated = manager.updateSession(created.id, {
    themeProfile: {
      background: "invalid",
      foreground: "#010203"
    }
  });
  assert.equal(updated.themeProfile.background, "#0a0d12");
  assert.equal(updated.themeProfile.foreground, "#010203");
  assert.equal(updated.themeProfile.cursor, "#8ec07c");
});

test("SessionManager enforces max concurrent session guardrail", () => {
  const manager = new SessionManager({
    sessionMaxConcurrent: 1,
    createPty: () => createFakePty()
  });

  manager.create({ cwd: "/tmp/a" });
  assert.throws(() => manager.create({ cwd: "/tmp/b" }), /Maximum concurrent session limit/);
});

test("SessionManager closes idle sessions via guardrail enforcement", () => {
  let currentTime = 1_000;
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionIdleTimeoutMs: 500,
    nowFn: () => currentTime
  });
  const closed = [];
  manager.on("session.closed", (event) => closed.push(event));

  const created = manager.create({ cwd: "/tmp" });
  currentTime = 1_400;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 1);

  currentTime = 1_500;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 0);
  assert.deepEqual(closed, [{ sessionId: created.id, reason: "idle-timeout" }]);
});

test("SessionManager closes over-lifetime sessions via guardrail enforcement", () => {
  let currentTime = 5_000;
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    sessionMaxLifetimeMs: 300,
    nowFn: () => currentTime
  });
  const closed = [];
  manager.on("session.closed", (event) => closed.push(event));

  const created = manager.create({ cwd: "/tmp" });
  currentTime = 5_250;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 1);

  currentTime = 5_300;
  manager.enforceGuardrails(currentTime);
  assert.equal(manager.list().length, 0);
  assert.deepEqual(closed, [{ sessionId: created.id, reason: "max-lifetime" }]);
});
