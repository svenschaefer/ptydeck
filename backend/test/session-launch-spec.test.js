import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";

import {
  buildSessionLaunchSpec,
  normalizeRemoteAuth,
  normalizeRemoteConnection,
  normalizeRemoteSecret,
  remoteAuthRequiresSecret,
  resolveLocalShellCommand
} from "../src/session-launch-spec.js";

test("session launch spec normalizes remote connection defaults and rejects non-ssh payloads", () => {
  assert.equal(normalizeRemoteConnection(undefined, "local"), undefined);
  assert.throws(() => normalizeRemoteConnection({ host: "example.internal" }, "local"), /only supported for ssh sessions/);

  assert.deepEqual(
    normalizeRemoteConnection(
      {
        host: " example.internal ",
        port: "2222",
        username: " ops "
      },
      "ssh"
    ),
    {
      host: "example.internal",
      port: 2222,
      username: "ops"
    }
  );

  assert.deepEqual(
    normalizeRemoteConnection(
      {
        host: "example.internal"
      },
      "ssh"
    ),
    {
      host: "example.internal",
      port: 22
    }
  );
});

test("session launch spec rejects invalid remote connection forms", () => {
  assert.throws(() => normalizeRemoteConnection([], "ssh"), /required for ssh sessions and must be an object/);
  assert.throws(
    () => normalizeRemoteConnection({ host: "bad host" }, "ssh"),
    /must be a non-empty hostname or address without whitespace/
  );
  assert.throws(
    () => normalizeRemoteConnection({ host: "example.internal", port: 70000 }, "ssh"),
    /must be an integer between 1 and 65535/
  );
  assert.throws(
    () => normalizeRemoteConnection({ host: "example.internal", username: "ops team" }, "ssh"),
    /must be a non-empty token without whitespace/
  );
  assert.throws(
    () => normalizeRemoteConnection({ host: "example.internal", proxyJump: "jump" }, "ssh"),
    /remoteConnection\.proxyJump/
  );
});

test("session launch spec normalizes remote auth and secret handling", () => {
  assert.equal(normalizeRemoteAuth(undefined, "local"), undefined);
  assert.throws(() => normalizeRemoteAuth({ method: "password" }, "local"), /only supported for ssh sessions/);

  assert.deepEqual(normalizeRemoteAuth(undefined, "ssh"), { method: "privateKey" });
  assert.deepEqual(
    normalizeRemoteAuth(
      {
        method: " privateKey ",
        privateKeyPath: " ~/.ssh/id_ed25519 "
      },
      "ssh"
    ),
    {
      method: "privateKey",
      privateKeyPath: "~/.ssh/id_ed25519"
    }
  );
  assert.deepEqual(normalizeRemoteAuth({ method: "keyboardInteractive" }, "ssh"), { method: "keyboardInteractive" });

  assert.equal(remoteAuthRequiresSecret(undefined), false);
  assert.equal(remoteAuthRequiresSecret({ method: "privateKey" }), false);
  assert.equal(remoteAuthRequiresSecret({ method: "password" }), true);
  assert.equal(remoteAuthRequiresSecret({ method: "keyboardInteractive" }), true);

  assert.equal(normalizeRemoteSecret(undefined, { method: "privateKey" }, "ssh"), undefined);
  assert.equal(normalizeRemoteSecret(undefined, undefined, "local"), undefined);
  assert.equal(normalizeRemoteSecret("super-secret", { method: "password" }, "ssh"), "super-secret");
});

test("session launch spec rejects invalid remote auth and secret combinations", () => {
  assert.throws(() => normalizeRemoteAuth("password", "ssh"), /must be an object for ssh sessions/);
  assert.throws(
    () => normalizeRemoteAuth({ method: "token" }, "ssh"),
    /must be 'password', 'privateKey', or 'keyboardInteractive'/
  );
  assert.throws(
    () => normalizeRemoteAuth({ method: "password", privateKeyPath: "/keys/id_ed25519" }, "ssh"),
    /privateKeyPath' is only supported for privateKey ssh auth/
  );
  assert.throws(
    () => normalizeRemoteAuth({ method: "privateKey", privateKeyPath: "x".repeat(1025) }, "ssh"),
    /must not exceed 1024 characters/
  );
  assert.throws(
    () => normalizeRemoteAuth({ proxyCommand: "ssh jump" }, "ssh"),
    /remoteAuth\.proxyCommand/
  );

  assert.throws(
    () => normalizeRemoteSecret(undefined, { method: "password" }, "ssh"),
    /required for password and keyboardInteractive ssh auth/
  );
  assert.throws(
    () => normalizeRemoteSecret("super-secret", { method: "privateKey" }, "ssh"),
    /only supported for password and keyboardInteractive ssh auth/
  );
  assert.throws(
    () => normalizeRemoteSecret("", { method: "keyboardInteractive" }, "ssh"),
    /must be a non-empty string up to 4096 characters/
  );
});

test("session launch spec builds local launch payloads from normalized start commands", () => {
  const launchSpec = buildSessionLaunchSpec({
    kind: "local",
    shell: "/bin/bash",
    spawnCwd: "/workspace/project",
    startCwd: "/workspace/project",
    startCommand: "pwd\r\nnpm test\n\n"
  });

  assert.deepEqual(launchSpec, {
    shellAdapterId: "/bin/bash",
    command: "/bin/bash",
    args: [],
    spawnCwd: "/workspace/project",
    metaCwd: "/workspace/project",
    ptyEnvAdditions: {},
    postStartInput: "pwd\nnpm test\r"
  });
});

test("session launch spec normalizes direct PowerShell local shell aliases", () => {
  const powerShellShort = buildSessionLaunchSpec({
    kind: "local",
    shell: "ps",
    spawnCwd: "/workspace/project",
    startCwd: "/workspace/project",
    startCommand: ""
  });
  assert.equal(powerShellShort.shellAdapterId, "powershell.exe");
  assert.equal(powerShellShort.command, "powershell.exe");

  const windowsPowerShell = buildSessionLaunchSpec({
    kind: "local",
    shell: "powershell",
    spawnCwd: "/workspace/project",
    startCwd: "/workspace/project",
    startCommand: ""
  });
  assert.equal(windowsPowerShell.shellAdapterId, "powershell.exe");
  assert.equal(windowsPowerShell.command, "powershell.exe");

  const powerShellSeven = buildSessionLaunchSpec({
    kind: "local",
    shell: "pwsh",
    spawnCwd: "/workspace/project",
    startCwd: "/workspace/project",
    startCommand: ""
  });
  assert.equal(powerShellSeven.shellAdapterId, "pwsh.exe");
  assert.equal(powerShellSeven.command, "pwsh.exe");
});

test("session launch spec resolves local PowerShell launchers from PATH and WSL Windows fallback locations", () => {
  assert.equal(
    resolveLocalShellCommand("pwsh", {
      pathEnv: "/usr/bin",
      isExecutableFileFn: (path) => path === "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
      readDirFn: () => [
        {
          name: "7",
          isDirectory() {
            return true;
          }
        }
      ]
    }),
    "/mnt/c/Program Files/PowerShell/7/pwsh.exe"
  );

  assert.equal(
    resolveLocalShellCommand("ps", {
      pathEnv: "/usr/bin",
      isExecutableFileFn: (path) => path === "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe"
    }),
    "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe"
  );

  assert.equal(
    resolveLocalShellCommand("bash", {
      pathEnv: "/usr/local/bin:/bin",
      isExecutableFileFn: (path) => path === "/bin/bash"
    }),
    "/bin/bash"
  );

  assert.equal(
    resolveLocalShellCommand("/usr/bin/bash", {
      pathEnv: "/usr/local/bin:/bin",
      isExecutableFileFn: (path) => path === "/usr/bin/bash"
    }),
    "/usr/bin/bash"
  );

  assert.equal(
    resolveLocalShellCommand("pwsh", {
      pathEnv: "/usr/bin",
      isExecutableFileFn: () => false,
      readDirFn: () => []
    }),
    ""
  );
});

test("session launch spec builds deterministic password ssh launches with askpass env", () => {
  const launchSpec = buildSessionLaunchSpec({
    kind: "ssh",
    shell: " ",
    spawnCwd: "/ignored",
    startCwd: "/srv/it's-live",
    startCommand: "npm run deploy",
    remoteConnection: {
      host: "example.internal",
      port: 2222,
      username: "ops"
    },
    remoteAuth: {
      method: "password"
    },
    remoteSecret: "super-secret",
    sshAskpassPath: "/tmp/askpass.sh",
    sshKnownHostsPath: "/tmp/known_hosts"
  });

  assert.equal(launchSpec.shellAdapterId, "ssh");
  assert.equal(launchSpec.command, "ssh");
  assert.equal(launchSpec.spawnCwd, homedir());
  assert.equal(launchSpec.metaCwd, "/srv/it's-live");
  assert.deepEqual(launchSpec.ptyEnvAdditions, {
    DISPLAY: "ptydeck-ssh-askpass",
    SSH_ASKPASS_REQUIRE: "force",
    SSH_ASKPASS: "/tmp/askpass.sh",
    PTYDECK_SSH_SECRET: "super-secret"
  });
  assert.deepEqual(launchSpec.args.slice(0, 14), [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "UserKnownHostsFile=/tmp/known_hosts",
    "-o",
    "GlobalKnownHostsFile=/dev/null",
    "-o"
  ]);
  assert.equal(launchSpec.args.includes("-p"), true);
  assert.equal(launchSpec.args.includes("2222"), true);
  assert.equal(launchSpec.args.includes("-l"), true);
  assert.equal(launchSpec.args.includes("ops"), true);
  assert.equal(launchSpec.args.at(-2), "example.internal");
  const remoteCommand = launchSpec.args.at(-1);
  assert.equal(remoteCommand.startsWith("sh -lc "), true);
  assert.match(remoteCommand, /cd -- /);
  assert.match(remoteCommand, /\/srv\/it/);
  assert.match(remoteCommand, /s-live/);
  assert.match(remoteCommand, /npm run deploy/);
  assert.match(remoteCommand, /exec "\$\{SHELL:-\/bin\/sh\}" -il/);
});

test("session launch spec supports keyboard-interactive and private-key ssh variants", () => {
  const keyboardInteractiveSpec = buildSessionLaunchSpec({
    kind: "ssh",
    shell: "ssh-custom",
    spawnCwd: "/ignored",
    startCwd: "~",
    startCommand: "",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "keyboardInteractive"
    },
    remoteSecret: "otp-code",
    sshAskpassPath: "/tmp/askpass.sh",
    sshKnownHostsPath: "/tmp/known_hosts"
  });
  assert.equal(keyboardInteractiveSpec.command, "ssh-custom");
  assert.equal(keyboardInteractiveSpec.args.includes("PreferredAuthentications=keyboard-interactive"), true);
  assert.equal(keyboardInteractiveSpec.args.at(-1), "example.internal");

  const privateKeySpec = buildSessionLaunchSpec({
    kind: "ssh",
    shell: "ssh-custom",
    spawnCwd: "/ignored",
    startCwd: "~",
    startCommand: "",
    remoteConnection: {
      host: "example.internal",
      port: 22,
      username: "ops"
    },
    remoteAuth: {
      method: "privateKey",
      privateKeyPath: "/keys/id_ed25519"
    },
    remoteSecret: undefined,
    sshAskpassPath: "/tmp/askpass.sh",
    sshKnownHostsPath: "/tmp/known_hosts"
  });
  assert.equal(privateKeySpec.command, "ssh-custom");
  assert.equal(privateKeySpec.args.includes("PreferredAuthentications=publickey"), true);
  assert.deepEqual(privateKeySpec.ptyEnvAdditions, {});
  assert.equal(privateKeySpec.args.includes("-i"), true);
  assert.equal(privateKeySpec.args.includes("/keys/id_ed25519"), true);
  assert.equal(privateKeySpec.args.includes("-p"), false);
  assert.equal(privateKeySpec.args.at(-1), "example.internal");
});

test("session launch spec constrains SSH host key algorithms to the trusted types when provided", () => {
  const launchSpec = buildSessionLaunchSpec({
    kind: "ssh",
    shell: "ssh",
    spawnCwd: "/ignored",
    startCwd: "~",
    startCommand: "",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "privateKey",
      privateKeyPath: "/keys/id_rsa"
    },
    trustedHostKeyTypes: ["ssh-rsa", " ssh-rsa ", "ssh-ed25519", "", "bad key type"],
    sshAskpassPath: "/tmp/askpass.sh",
    sshKnownHostsPath: "/tmp/known_hosts"
  });

  assert.equal(launchSpec.args.includes("-o"), true);
  assert.equal(launchSpec.args.includes("HostKeyAlgorithms=ssh-rsa,ssh-ed25519"), true);
});
