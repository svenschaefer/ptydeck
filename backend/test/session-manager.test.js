import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { SessionManager } from "../src/session-manager.js";

const INPUT_SAFETY_PROFILE = {
  confirmOnAnyInput: false,
  requireValidShellSyntax: true,
  confirmOnIncompleteShellConstruct: true,
  confirmOnNaturalLanguageInput: true,
  confirmOnDangerousShellCommand: false,
  confirmOnMultilineInput: true,
  autoContinueStalledPaste: false,
  confirmOnRecentTargetSwitch: true,
  targetSwitchGraceMs: 2500,
  pasteLengthConfirmThreshold: 320,
  pasteLineConfirmThreshold: 4
};

function createFakePty({ pid = 4001, ptyPath = "/dev/pts/test" } = {}) {
  let lastExitHandler = null;
  let lastDataHandler = null;

  return {
    pid,
    _pty: ptyPath,
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

function createPatchableAsyncWritePty({ pid = 4001, ptyPath = "/dev/pts/test" } = {}) {
  let lastExitHandler = null;
  let lastDataHandler = null;

  return {
    pid,
    _pty: ptyPath,
    _writeStream: {
      _fd: 11,
      _encoding: "utf8",
      _writeQueue: [],
      _writeImmediate: undefined,
      dispose() {}
    },
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
    _write(data) {
      this.writes.push(data);
      this._writeStream.write(data);
      if (lastDataHandler) {
        lastDataHandler(String(data));
      }
    },
    write(data) {
      this._write(data);
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

function createQueuedFakePtyFactory() {
  const ptys = [];
  return {
    ptys,
    createPty() {
      const pty = createFakePty();
      ptys.push(pty);
      return pty;
    }
  };
}

async function waitFor(predicate, timeoutMs = 200) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
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
  assert.equal(created.appIdentity.family, "shell");
  assert.equal(created.appIdentity.label, "bash");
  assert.equal(created.appIdentity.source, "explicit-hint");
  assert.equal(created.mouseForwardingMode, "off");
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
  assert.equal(session.meta.appIdentity.family, "shell");

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

test("SessionManager emits input write attempt and ok events with trace correlation", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const events = [];
  manager.on("session.input.write", (event) => events.push(event));

  manager.sendInput(created.id, "pwd\r", {
    writeKind: "submit_cr",
    trace: {
      traceId: "msg-1",
      correlationId: "msg-telegram-99",
      requestId: "msg-1",
      source: "messaging:telegram"
    }
  });

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => ({
      phase: event.phase,
      writeKind: event.writeKind,
      bytes: event.bytes,
      traceId: event.trace.traceId,
      correlationId: event.trace.correlationId,
      requestId: event.trace.requestId,
      source: event.trace.source
    })),
    [
      {
        phase: "attempt",
        writeKind: "submit_cr",
        bytes: Buffer.byteLength("pwd\r", "utf8"),
        traceId: events[0].trace.traceId,
        correlationId: "msg-telegram-99",
        requestId: "msg-1",
        source: "messaging:telegram"
      },
      {
        phase: "ok",
        writeKind: "submit_cr",
        bytes: Buffer.byteLength("pwd\r", "utf8"),
        traceId: events[1].trace.traceId,
        correlationId: "msg-telegram-99",
        requestId: "msg-1",
        source: "messaging:telegram"
      }
    ]
  );
  assert.match(events[0].trace.traceId, /^[a-f0-9-]{36}$/i);
  assert.equal(events[0].trace.traceId, events[1].trace.traceId);
});

test("SessionManager emits input write failed events when the PTY write throws", () => {
  const fakePty = createFakePty();
  fakePty.write = () => {
    throw new Error("PTY write failed.");
  };
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const events = [];
  manager.on("session.input.write", (event) => events.push(event));

  assert.throws(
    () =>
      manager.sendInput(created.id, "pwd\r", {
        writeKind: "submit_cr",
        trace: {
          traceId: "msg-2",
          correlationId: "msg-telegram-100",
          requestId: "msg-2",
          source: "messaging:telegram"
        }
      }),
    /PTY write failed\./
  );

  assert.equal(events.length, 2);
  assert.equal(events[0].phase, "attempt");
  assert.equal(events[1].phase, "failed");
  assert.equal(events[1].writeKind, "submit_cr");
  assert.match(events[1].trace.traceId, /^[a-f0-9-]{36}$/i);
  assert.equal(events[1].trace.correlationId, "msg-telegram-100");
  assert.equal(events[1].trace.requestId, "msg-2");
  assert.match(events[1].error, /PTY write failed\./);
});

test("SessionManager emits async retry and committed write events for retryable PTY interruptions", async () => {
  const fakePty = createPatchableAsyncWritePty();
  let interrupted = false;
  const manager = new SessionManager({
    createPty: () => fakePty,
    nodePtyAsyncWriteOptions: {
      maxEintrRetries: 2,
      fsWrite(fd, buffer, offset, callback) {
        if (!interrupted) {
          interrupted = true;
          setImmediate(() => callback(Object.assign(new Error("interrupted"), { code: "EINTR" }), 0));
          return;
        }
        setImmediate(() => callback(null, buffer.byteLength - offset));
      }
    }
  });
  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const events = [];
  manager.on("session.input.write", (event) => events.push(event));

  manager.sendInput(created.id, "pwd\r", {
    writeKind: "submit_cr",
    trace: {
      traceId: "msg-3",
      correlationId: "msg-telegram-101",
      requestId: "msg-3",
      source: "messaging:telegram"
    }
  });

  await waitFor(() => events.some((event) => event.phase === "committed"), 500);

  assert.deepEqual(
    events.map((event) => ({
      phase: event.phase,
      writeKind: event.writeKind,
      code: event.code || "",
      failureStage: event.failureStage || "",
      retryCount: event.retryCount || 0,
      correlationId: event.trace.correlationId
    })),
    [
      {
        phase: "attempt",
        writeKind: "submit_cr",
        code: "",
        failureStage: "",
        retryCount: 0,
        correlationId: "msg-telegram-101"
      },
      {
        phase: "ok",
        writeKind: "submit_cr",
        code: "",
        failureStage: "",
        retryCount: 0,
        correlationId: "msg-telegram-101"
      },
      {
        phase: "retry",
        writeKind: "submit_cr",
        code: "EINTR",
        failureStage: "async",
        retryCount: 1,
        correlationId: "msg-telegram-101"
      },
      {
        phase: "committed",
        writeKind: "submit_cr",
        code: "",
        failureStage: "async",
        retryCount: 1,
        correlationId: "msg-telegram-101"
      }
    ]
  );
});

test("SessionManager refreshes explicit app identity when startup hints change", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    nowFn: () => 1710000000000
  });

  const created = manager.create({
    cwd: "/tmp",
    shell: "/bin/bash",
    name: "codex",
    startCommand: "codex --json"
  });

  assert.equal(created.appIdentity.family, "coding-agent");
  assert.equal(created.appIdentity.label, "codex");
  assert.equal(created.appIdentity.source, "explicit-hint");

  const updated = manager.updateSession(created.id, {
    name: "build-run",
    startCommand: "npm test"
  });

  assert.equal(updated.appIdentity.family, "build-test");
  assert.equal(updated.appIdentity.label, "npm");
  assert.equal(updated.appIdentity.source, "explicit-hint");
  assert.equal(updated.appIdentity.updatedAt, 1710000000000);
});

test("SessionManager setSessionAppIdentity emits session.updated for later runtime sources", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty,
    nowFn: (() => {
      let current = 1710000000100;
      return () => current++;
    })()
  });
  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  const updates = [];
  manager.on("session.updated", (event) => updates.push(event));

  manager.setSessionAppIdentity(created.id, {
    family: "coding-agent",
    label: "codex",
    source: "foreground-process",
    confidence: 0.91,
    details: {
      processName: "codex",
      pid: 321
    }
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].session.appIdentity.family, "coding-agent");
  assert.equal(updates[0].session.appIdentity.label, "codex");
  assert.equal(updates[0].session.appIdentity.source, "foreground-process");
  assert.equal(updates[0].session.appIdentity.details.processName, "codex");
});

test("SessionManager schedules and applies foreground-process identity refresh for local PTYs", () => {
  const fakePty = createFakePty({ pid: 4321, ptyPath: "/dev/pts/9" });
  const scheduled = [];
  const cleared = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    inspectTerminalForegroundProcess(pid, details) {
      assert.equal(pid, 4321);
      assert.equal(details.ptyPath, "/dev/pts/9");
      return {
        terminalPid: 4321,
        foregroundProcessGroupId: 5000,
        representativeProcess: {
          pid: 5000,
          ppid: 4321,
          executableName: "codex",
          comm: "codex",
          name: "codex",
          executablePath: "/usr/local/bin/codex",
          commandLine: ["codex", "--json"],
          ttyPath: "/dev/pts/9"
        },
        foregroundProcesses: [],
        ancestry: [
          {
            pid: 4321,
            ppid: 100,
            executableName: "bash",
            comm: "bash",
            name: "bash",
            executablePath: "/usr/bin/bash",
            commandLine: ["bash"],
            ttyPath: "/dev/pts/9"
          }
        ]
      };
    },
    setTimeoutFn(fn) {
      scheduled.push(fn);
      return fn;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    }
  });
  const updates = [];
  manager.on("session.updated", (event) => updates.push(event));

  const created = manager.create({ cwd: "/tmp", shell: "bash" });
  assert.equal(created.appIdentity.family, "shell");
  assert.equal(scheduled.length, 1);

  updates.length = 0;
  const pendingRefresh = scheduled.shift();
  pendingRefresh();

  const refreshed = manager.get(created.id).meta.appIdentity;
  assert.equal(refreshed.family, "coding-agent");
  assert.equal(refreshed.label, "codex");
  assert.equal(refreshed.source, "foreground-process");
  assert.equal(updates.length, 1);

  manager.sendInput(created.id, "status\r");
  assert.equal(cleared.length >= 1, true);
  assert.equal(scheduled.length >= 1, true);
});

test("SessionManager detects codex from foreground group members and wrapper command lines", () => {
  const fakePty = createFakePty({ pid: 5321, ptyPath: "/dev/pts/11" });
  const scheduled = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    inspectTerminalForegroundProcess(pid, details) {
      assert.equal(pid, 5321);
      assert.equal(details.ptyPath, "/dev/pts/11");
      return {
        terminalPid: 5321,
        foregroundProcessGroupId: 6100,
        representativeProcess: {
          pid: 6100,
          ppid: 5321,
          executableName: "sh",
          comm: "sh",
          name: "sh",
          executablePath: "/usr/bin/sh",
          commandLine: ["sh", "-lc", "codex --json"],
          ttyPath: "/dev/pts/11"
        },
        foregroundProcesses: [
          {
            pid: 6100,
            ppid: 5321,
            executableName: "sh",
            comm: "sh",
            name: "sh",
            executablePath: "/usr/bin/sh",
            commandLine: ["sh", "-lc", "codex --json"],
            ttyPath: "/dev/pts/11"
          },
          {
            pid: 6101,
            ppid: 6100,
            executableName: "codex",
            comm: "codex",
            name: "codex",
            executablePath: "/usr/local/bin/codex",
            commandLine: ["codex", "--json"],
            ttyPath: "/dev/pts/11"
          }
        ],
        ancestry: []
      };
    },
    setTimeoutFn(fn) {
      scheduled.push(fn);
      return fn;
    }
  });

  const created = manager.create({ cwd: "/tmp", shell: "bash", name: "shell-session" });
  assert.equal(created.appIdentity.family, "shell");
  assert.equal(scheduled.length, 1);

  scheduled.shift()();

  const refreshed = manager.get(created.id).meta.appIdentity;
  assert.equal(refreshed.family, "coding-agent");
  assert.equal(refreshed.label, "codex");
  assert.equal(refreshed.source, "foreground-process");
  assert.equal(refreshed.details.foregroundProcess.foregroundProcesses.length, 2);
});

test("SessionManager applies shell-marker and alternate-screen identity hints from PTY output", () => {
  const fakePty = createFakePty({ pid: 4322, ptyPath: "/dev/pts/10" });
  const scheduled = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    inspectTerminalForegroundProcess() {
      return null;
    },
    setTimeoutFn(fn) {
      scheduled.push(fn);
      return fn;
    },
    clearTimeoutFn() {}
  });
  const updates = [];
  manager.on("session.updated", (event) => updates.push(event));

  const created = manager.create({ cwd: "/tmp", shell: "/bin/bash" });
  assert.equal(created.appIdentity.family, "shell");

  updates.length = 0;
  fakePty.write("\u001b]1337;CurrentDir=/workspace/code/ptydeck\u0007\u001b]133;A\u0007");

  const afterShellMarker = manager.get(created.id).meta;
  assert.equal(afterShellMarker.cwd, "/workspace/code/ptydeck");
  assert.equal(afterShellMarker.appIdentity.family, "shell");
  assert.equal(afterShellMarker.appIdentity.source, "shell-marker");
  assert.equal(updates.length, 1);

  updates.length = 0;
  fakePty.write("\u001b[?1049h");

  const afterAlternateScreen = manager.get(created.id).meta.appIdentity;
  assert.equal(afterAlternateScreen.family, "tui");
  assert.equal(afterAlternateScreen.source, "terminal-mode");
  assert.equal(updates.length, 1);
  assert.equal(scheduled.length >= 1, true);
});

test("SessionManager arbitration lets corroborated shell runtime signals override stale explicit coding-agent hints", () => {
  const fakePty = createFakePty({ pid: 4323, ptyPath: "/dev/pts/11" });
  const scheduled = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    inspectTerminalForegroundProcess() {
      return {
        terminalPid: 4323,
        foregroundProcessGroupId: 6000,
        representativeProcess: {
          pid: 6000,
          ppid: 4323,
          executableName: "bash",
          comm: "bash",
          name: "bash",
          executablePath: "/usr/bin/bash",
          commandLine: ["bash"],
          ttyPath: "/dev/pts/11"
        },
        foregroundProcesses: [],
        ancestry: []
      };
    },
    setTimeoutFn(fn) {
      scheduled.push(fn);
      return fn;
    },
    clearTimeoutFn() {}
  });

  const created = manager.create({
    cwd: "/tmp",
    shell: "/bin/bash",
    startCommand: "codex"
  });
  assert.equal(created.appIdentity.family, "coding-agent");

  scheduled.length = 0;
  fakePty.write("\u001b]133;A\u0007");
  const pendingTimers = [...scheduled];
  for (const pendingTimer of pendingTimers) {
    pendingTimer();
  }

  const current = manager.get(created.id).meta.appIdentity;
  assert.equal(current.family, "shell");
  assert.equal(current.label, "bash");
  assert.equal(current.source, "foreground-process");
});

test("SessionManager uses bounded output heuristics when no stronger runtime signal exists", () => {
  const fakePty = createFakePty({ pid: 4324, ptyPath: "/dev/pts/12" });
  const manager = new SessionManager({
    createPty: () => fakePty,
    inspectTerminalForegroundProcess() {
      return null;
    },
    setTimeoutFn(fn) {
      return fn;
    },
    clearTimeoutFn() {}
  });
  const updates = [];
  manager.on("session.updated", (event) => updates.push(event));

  const created = manager.create({ cwd: "/tmp", shell: "/bin/bash" });
  assert.equal(created.appIdentity.family, "shell");
  updates.length = 0;

  fakePty.write("────────────────────────────────────────────────────────────────────────────────\n");

  const current = manager.get(created.id).meta.appIdentity;
  assert.equal(current.family, "coding-agent");
  assert.equal(current.label, "codex");
  assert.equal(current.source, "output-heuristic");
  assert.equal(updates.length, 1);
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

test("SessionManager reconnects unexpected ssh exits and restores connected remote runtime state", async () => {
  const queued = createQueuedFakePtyFactory();
  const manager = new SessionManager({
    createPty: () => queued.createPty(),
    remoteReconnectDelayMs: 5,
    remoteReconnectStableMs: 5
  });

  const created = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22,
      username: "ops"
    },
    remoteAuth: {
      method: "privateKey"
    }
  });

  assert.equal(created.remoteRuntime.connectivityState, "connected");
  assert.equal(queued.ptys.length, 1);

  queued.ptys[0].kill();
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(manager.get(created.id).meta.remoteRuntime.connectivityState, "degraded");
  assert.equal(manager.get(created.id).meta.remoteRuntime.reconnectPolicy.maxAttempts, 3);

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(queued.ptys.length, 2);
  assert.equal(manager.get(created.id).meta.remoteRuntime.connectivityState, "connected");
  assert.equal(manager.get(created.id).meta.remoteRuntime.reconnectAttempts, 0);
  assert.equal(typeof manager.get(created.id).meta.remoteRuntime.lastReconnectAt, "number");
});

test("SessionManager marks ssh sessions offline after bounded reconnect failures", async () => {
  const queued = createQueuedFakePtyFactory();
  const manager = new SessionManager({
    createPty: () => queued.createPty(),
    remoteReconnectMaxAttempts: 2,
    remoteReconnectDelayMs: 5,
    remoteReconnectStableMs: 50
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

  queued.ptys[0].kill();
  await waitFor(() => queued.ptys.length === 2);
  assert.equal(queued.ptys.length, 2);
  queued.ptys[1].kill();
  await waitFor(() => queued.ptys.length === 3);
  assert.equal(queued.ptys.length, 3);
  queued.ptys[2].kill();
  await waitFor(() => manager.get(created.id).meta.remoteRuntime.connectivityState === "offline");

  const offline = manager.get(created.id).meta;
  assert.equal(offline.remoteRuntime.connectivityState, "offline");
  assert.equal(offline.remoteRuntime.reconnectAttempts, 2);
  assert.equal(typeof offline.remoteRuntime.disconnectedAt, "number");
  assert.throws(
    () => manager.sendInput(created.id, "pwd\n"),
    /Remote SSH session '.*' is offline/
  );
});

test("SessionManager delete clears pending ssh reconnect timers so degraded sessions do not respawn", async () => {
  const queued = createQueuedFakePtyFactory();
  const manager = new SessionManager({
    createPty: () => queued.createPty(),
    remoteReconnectDelayMs: 10,
    remoteReconnectStableMs: 5
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

  queued.ptys[0].kill();
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(manager.get(created.id).meta.remoteRuntime.connectivityState, "degraded");

  manager.delete(created.id);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(manager.list().length, 0);
  assert.equal(queued.ptys.length, 1);
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
  assert.deepEqual(chunks, ["", "pwd\r\n/home/wsl\r\n"]);
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
  assert.deepEqual(chunks, ["", "echo ok\r\nok\r\n"]);
});

test("SessionManager can forward raw and cleaned stream chunks to analysis capture", () => {
  const fakePty = createFakePty();
  const captured = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    captureSessionStreamChunk: (event) => captured.push(event)
  });
  const created = manager.create({ cwd: "/tmp", name: "codex" });

  fakePty.write("__CWD__/home/wsl__\r\n");
  fakePty.write("• Done\r\n");

  assert.equal(captured.length, 2);
  assert.equal(captured[0].session.id, created.id);
  assert.equal(captured[0].rawData, "__CWD__/home/wsl__\r\n");
  assert.equal(captured[0].cleanedData, "");
  assert.deepEqual(captured[0].promptBoundaries, [0]);
  assert.equal(Array.isArray(captured[0].terminalSignalKinds), true);
  assert.equal(captured[1].rawData, "• Done\r\n");
  assert.equal(captured[1].cleanedData, "• Done\r\n");
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

test("SessionManager builds replay excerpts for visible line and char selectors", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "sh" });

  fakePty.write("one\r\ntwo\r\nthree\r\n");

  const lineExcerpt = manager.getReplayExcerpt(created.id, "l:2");
  assert.equal(lineExcerpt.data, "two\nthree");
  assert.equal(lineExcerpt.availableCount, 3);
  assert.equal(lineExcerpt.resolvedCount, 2);
  assert.equal(lineExcerpt.selectorSatisfied, true);

  const charExcerpt = manager.getReplayExcerpt(created.id, "c:5");
  assert.equal(charExcerpt.data, "hree\n");
  assert.equal(charExcerpt.availableCount, "one\ntwo\nthree\n".length);
  assert.equal(charExcerpt.resolvedCount, 5);
  assert.equal(charExcerpt.shellBlocksSupported, false);
});

test("SessionManager tracks bash shell blocks for sp:N replay excerpts", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "bash" });

  fakePty.write("__CWD__/tmp__\r\nwsl$ ");
  fakePty.write("echo hi\r\nhi\r\n__CWD__/tmp__\r\nwsl$ ");
  fakePty.write("pwd\r\n/tmp\r\n__CWD__/tmp__\r\nwsl$ ");

  const excerpt = manager.getReplayExcerpt(created.id, "sp:2");
  assert.equal(excerpt.shellBlocksSupported, true);
  assert.equal(excerpt.availableCount, 2);
  assert.equal(excerpt.resolvedCount, 2);
  assert.equal(excerpt.data, "wsl$ echo hi\nhi\nwsl$ pwd\n/tmp\n");
});

test("SessionManager rejects sp:N replay excerpts when shell blocks are unavailable", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "sh" });

  fakePty.write("plain shell\r\n");

  assert.throws(
    () => manager.getReplayExcerpt(created.id, "sp:1"),
    /Selector 'sp:1' is unavailable/
  );
});

test("SessionManager rejects invalid replay excerpt selectors directly", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });
  const created = manager.create({ cwd: "/tmp", shell: "sh" });

  fakePty.write("plain shell\r\n");

  assert.throws(
    () => manager.getReplayExcerpt(created.id, "bad"),
    /Field 'slice' must match 'l:N', 'c:N', or 'sp:N'/
  );
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
    },
    sshKnownHostsPath: "/tmp/ptydeck-test-known_hosts"
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
  assert.deepEqual(spawnOptions.args.slice(0, 24), [
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
    "UserKnownHostsFile=/tmp/ptydeck-test-known_hosts",
    "-o",
    "GlobalKnownHostsFile=/dev/null",
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
  assert.match(spawnOptions.args[24], /^sh -lc '/);
  assert.match(spawnOptions.args[24], /pwd/);
});

test("SessionManager wires askpass env for password ssh auth without persisting the secret", () => {
  const fakePty = createFakePty();
  let spawnOptions = null;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions = options;
      return fakePty;
    },
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh",
    sshKnownHostsPath: "/tmp/ptydeck-test-known_hosts"
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
  assert.deepEqual(spawnOptions.args.slice(0, 21), [
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
    "UserKnownHostsFile=/tmp/ptydeck-test-known_hosts",
    "-o",
    "GlobalKnownHostsFile=/dev/null",
    "-o",
    "PreferredAuthentications=password",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "NumberOfPasswordPrompts=1"
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
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh",
    sshKnownHostsPath: "/tmp/ptydeck-test-known_hosts"
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
  assert.deepEqual(keyboardLaunch.args.slice(0, 21), [
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
    "UserKnownHostsFile=/tmp/ptydeck-test-known_hosts",
    "-o",
    "GlobalKnownHostsFile=/dev/null",
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

test("SessionManager updateSession clears ssh-only metadata and timers when switching back to local", () => {
  const fakePty = createFakePty();
  const clearedTimers = [];
  const manager = new SessionManager({
    createPty: () => fakePty,
    clearTimeoutFn: (timer) => clearedTimers.push(timer)
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
    remoteSecret: "super-secret",
    startCwd: "~/workspace"
  });

  const session = manager.get(created.id);
  session.remoteReconnectTimer = { id: "reconnect" };
  session.remoteReconnectStabilizeTimer = { id: "stabilize" };
  session.expectedExitReasonTimer = { id: "expected-exit" };
  session.expectedExitReason = "restart";

  const updated = manager.updateSession(created.id, {
    kind: "local",
    startCwd: "/tmp/local"
  });

  assert.equal(updated.kind, "local");
  assert.equal(updated.shell, "bash");
  assert.equal(updated.startCwd, "/tmp/local");
  assert.equal(updated.cwd, "/tmp/local");
  assert.equal(updated.remoteConnection, undefined);
  assert.equal(updated.remoteAuth, undefined);
  assert.equal(updated.remoteRuntime, undefined);
  assert.equal(manager.get(created.id).remoteSecret, undefined);
  assert.equal(session.remoteReconnectTimer, null);
  assert.equal(session.remoteReconnectStabilizeTimer, null);
  assert.equal(session.expectedExitReasonTimer, null);
  assert.equal(session.expectedExitReason, "");
  assert.deepEqual(clearedTimers, [{ id: "reconnect" }, { id: "stabilize" }, { id: "expected-exit" }]);
});

test("SessionManager updateSession requires explicit ssh metadata when switching from local to ssh", () => {
  const fakePty = createFakePty();
  const manager = new SessionManager({
    createPty: () => fakePty
  });

  const created = manager.create({
    cwd: "/tmp/local"
  });

  assert.throws(() => {
    manager.updateSession(created.id, {
      kind: "ssh"
    });
  }, /Field 'remoteConnection' is required for ssh sessions/);

  assert.throws(() => {
    manager.updateSession(created.id, {
      kind: "ssh",
      remoteConnection: {
        host: "example.internal",
        port: 22
      },
      remoteAuth: {
        method: "password"
      }
    });
  }, /Field 'remoteSecret' is required when changing to password or keyboardInteractive ssh auth/);

  const updated = manager.updateSession(created.id, {
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22
    },
    remoteAuth: {
      method: "privateKey"
    },
    startCwd: "~/ops"
  });

  assert.equal(updated.kind, "ssh");
  assert.equal(updated.shell, "ssh");
  assert.deepEqual(updated.remoteConnection, {
    host: "example.internal",
    port: 22
  });
  assert.deepEqual(updated.remoteAuth, {
    method: "privateKey"
  });
  assert.equal(updated.cwd, "~/ops");
  assert.equal(updated.startCwd, "~/ops");
  assert.deepEqual(updated.remoteRuntime.reconnectPolicy, {
    maxAttempts: 3,
    delayMs: 1500
  });
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

test("SessionManager stores, normalizes multiline notes, clears them, and restarts with preserved line breaks", () => {
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
    note: "  Needs   follow-up  \r\n  Capture logs  "
  });
  assert.equal(created.note, "Needs   follow-up\nCapture logs");

  const updated = manager.updateSession(created.id, {
    note: "  capture logs before restart  \n\n  restart marker  "
  });
  assert.equal(updated.note, "capture logs before restart\n\nrestart marker");

  const cleared = manager.updateSession(created.id, {
    note: ""
  });
  assert.equal(cleared.note, undefined);

  manager.updateSession(created.id, {
    note: "restart marker\nline two"
  });
  const restarted = manager.restart(created.id);
  assert.equal(restarted.note, "restart marker\nline two");
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
      confirmOnAnyInput: false,
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

test("SessionManager stores, updates, and restarts mouse forwarding mode", () => {
  const queued = createQueuedFakePtyFactory();
  const manager = new SessionManager({
    createPty: () => queued.createPty()
  });

  const created = manager.create({
    cwd: "/tmp",
    shell: "bash",
    mouseForwardingMode: "application"
  });
  assert.equal(created.mouseForwardingMode, "application");

  const updated = manager.updateSession(created.id, {
    mouseForwardingMode: "off"
  });
  assert.equal(updated.mouseForwardingMode, "off");

  const restarted = manager.restart(created.id);
  assert.equal(restarted.mouseForwardingMode, "off");
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
  assert.equal(restarted.mouseForwardingMode, "off");
  assert.deepEqual(restarted.env, { FOO: "BAR" });
  assert.deepEqual(restarted.inputSafetyProfile, INPUT_SAFETY_PROFILE);
  assert.deepEqual(restarted.tags, []);
  assert.equal(restarted.themeProfile.cursor, "#8ec07c");
  assert.equal(restarted.createdAt, created.createdAt);
  assert.ok(restarted.updatedAt >= created.createdAt);
  assert.equal(manager.get(created.id).ptyProcess, secondPty);
  assert.deepEqual(secondPty.writes, ["echo START\n"]);
});

test("SessionManager restart preserves ssh auth context and secret-backed reconnect state", () => {
  const firstPty = createFakePty();
  const secondPty = createFakePty();
  const spawnOptions = [];
  let spawnCount = 0;
  const manager = new SessionManager({
    createPty: (options) => {
      spawnOptions.push(options);
      spawnCount += 1;
      return spawnCount === 1 ? firstPty : secondPty;
    },
    sshAskpassPath: "/tmp/ptydeck-test-askpass.sh",
    sshKnownHostsPath: "/tmp/ptydeck-test-known_hosts"
  });

  const created = manager.create({
    kind: "ssh",
    remoteConnection: {
      host: "example.internal",
      port: 22,
      username: "ops"
    },
    remoteAuth: {
      method: "password"
    },
    remoteSecret: "super-secret",
    startCwd: "~/workspace",
    startCommand: "hostname"
  });

  const restarted = manager.restart(created.id);

  assert.equal(firstPty.killed, true);
  assert.equal(restarted.kind, "ssh");
  assert.deepEqual(restarted.remoteConnection, {
    host: "example.internal",
    port: 22,
    username: "ops"
  });
  assert.deepEqual(restarted.remoteAuth, { method: "password" });
  assert.equal(restarted.remoteRuntime.connectivityState, "connected");
  assert.equal(manager.get(created.id).remoteSecret, "super-secret");
  assert.equal(spawnOptions.length, 2);
  assert.equal(spawnOptions[1].env.SSH_ASKPASS, "/tmp/ptydeck-test-askpass.sh");
  assert.equal(spawnOptions[1].env.PTYDECK_SSH_SECRET, "super-secret");
  assert.equal(spawnOptions[1].args.includes("example.internal"), true);
  assert.equal(manager.get(created.id).ptyProcess, secondPty);
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
  assert.equal(closed.length, 1);
  assert.equal(closed[0].sessionId, created.id);
  assert.equal(closed[0].reason, "idle-timeout");
  assert.equal(closed[0].trace.sessionId, created.id);
  assert.equal(closed[0].trace.source, "rest");
  assert.equal(typeof closed[0].trace.traceId, "string");
  assert.equal(typeof closed[0].trace.correlationId, "string");
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
  assert.equal(closed.length, 1);
  assert.equal(closed[0].sessionId, created.id);
  assert.equal(closed[0].reason, "max-lifetime");
  assert.equal(closed[0].trace.sessionId, created.id);
  assert.equal(closed[0].trace.source, "rest");
  assert.equal(typeof closed[0].trace.traceId, "string");
  assert.equal(typeof closed[0].trace.correlationId, "string");
});
