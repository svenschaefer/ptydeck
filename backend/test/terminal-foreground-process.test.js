import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectLinuxTerminalForegroundProcess,
  parseLinuxProcStat,
  readLinuxProcessSnapshot
} from "../src/terminal-foreground-process.js";

function createProcFixtures(entries) {
  const files = new Map();
  for (const [pid, entry] of Object.entries(entries)) {
    files.set(`/proc/${pid}/stat`, entry.stat || "");
    files.set(`/proc/${pid}/status`, entry.status || "");
    files.set(`/proc/${pid}/cmdline`, entry.cmdline || "");
    files.set(`/proc/${pid}/exe`, entry.exe || "");
    files.set(`/proc/${pid}/fd/0`, entry.tty || "");
  }
  return {
    readFileSync(filePath) {
      if (!files.has(filePath) || filePath.endsWith("/exe") || filePath.endsWith("/fd/0")) {
        throw new Error(`missing file ${filePath}`);
      }
      return files.get(filePath);
    },
    readlinkSync(filePath) {
      if (!files.has(filePath) || (!filePath.endsWith("/exe") && !filePath.endsWith("/fd/0"))) {
        throw new Error(`missing link ${filePath}`);
      }
      return files.get(filePath);
    },
    readdirSync() {
      return Object.keys(entries).map((name) => ({
        name,
        isDirectory() {
          return true;
        }
      }));
    }
  };
}

test("parseLinuxProcStat extracts process-group and terminal fields", () => {
  const parsed = parseLinuxProcStat(
    "87287 (bash) S 87277 87287 87287 34821 87304 4194304 1112 1841 0 2 0 1 1 1 20 0 1 0 95424526 6389760 1280"
  );

  assert.deepEqual(parsed, {
    pid: 87287,
    comm: "bash",
    state: "S",
    ppid: 87277,
    pgrp: 87287,
    sessionId: 87287,
    ttyNr: 34821,
    tpgid: 87304
  });
});

test("parseLinuxProcStat rejects malformed proc stat payloads", () => {
  assert.equal(parseLinuxProcStat(null), null);
  assert.equal(parseLinuxProcStat(""), null);
  assert.equal(parseLinuxProcStat("200 bash S 100 200 200 34821 210"), null);
  assert.equal(parseLinuxProcStat("200 (bash S 100 200 200 34821 210"), null);
  assert.equal(parseLinuxProcStat("200 (bash) S 100 200 200"), null);
  assert.equal(parseLinuxProcStat("200 (bash) S nope 200 200 34821 210"), null);
});

test("readLinuxProcessSnapshot normalizes proc payloads", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    }
  });

  const snapshot = readLinuxProcessSnapshot(200, fixtures);

  assert.equal(snapshot.pid, 200);
  assert.equal(snapshot.ppid, 100);
  assert.equal(snapshot.pgrp, 200);
  assert.equal(snapshot.tpgid, 210);
  assert.equal(snapshot.name, "bash");
  assert.equal(snapshot.executableName, "bash");
  assert.deepEqual(snapshot.commandLine, ["bash", "--login"]);
  assert.equal(snapshot.ttyPath, "/dev/pts/5");
});

test("readLinuxProcessSnapshot rejects invalid pids and malformed proc payloads", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "invalid",
      status: "Name:\tbash\n",
      cmdline: "bash\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    }
  });

  assert.equal(readLinuxProcessSnapshot(0, fixtures), null);
  assert.equal(readLinuxProcessSnapshot("abc", fixtures), null);
  assert.equal(readLinuxProcessSnapshot(200, fixtures), null);
});

test("readLinuxProcessSnapshot tolerates missing optional proc files and falls back to stat metadata", () => {
  const snapshot = readLinuxProcessSnapshot(200, {
    readFileSync(filePath) {
      if (filePath.endsWith("/stat")) {
        return "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0";
      }
      if (filePath.endsWith("/status")) {
        throw new Error("missing status");
      }
      if (filePath.endsWith("/cmdline")) {
        throw new Error("missing cmdline");
      }
      throw new Error(`unexpected file ${filePath}`);
    },
    readlinkSync() {
      throw new Error("missing link");
    }
  });

  assert.equal(snapshot.pid, 200);
  assert.equal(snapshot.name, "bash");
  assert.equal(snapshot.executablePath, "");
  assert.equal(snapshot.executableName, "bash");
  assert.deepEqual(snapshot.commandLine, []);
  assert.equal(snapshot.ttyPath, "");
  assert.equal(snapshot.namespaceProcessGroupId, null);
  assert.equal(snapshot.namespaceSessionId, null);
});

test("inspectLinuxTerminalForegroundProcess resolves the foreground group representative and ancestry", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    210: {
      stat: "210 (codex) S 200 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tcodex\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "codex\u0000--json\u0000",
      exe: "/usr/local/bin/codex",
      tty: "/dev/pts/5"
    },
    211: {
      stat: "211 (node) S 210 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tnode\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "node\u0000worker.js\u0000",
      exe: "/usr/bin/node",
      tty: "/dev/pts/5"
    },
    300: {
      stat: "300 (other) S 1 300 300 34822 300 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tother\nNSpgid:\t300\nNSsid:\t300\n",
      cmdline: "other\u0000",
      exe: "/usr/bin/other",
      tty: "/dev/pts/6"
    }
  });

  const inspection = inspectLinuxTerminalForegroundProcess(200, fixtures);

  assert.equal(inspection.terminalPid, 200);
  assert.equal(inspection.foregroundProcessGroupId, 210);
  assert.equal(inspection.ttyPath, "/dev/pts/5");
  assert.equal(inspection.representativeProcess.pid, 210);
  assert.equal(inspection.representativeProcess.executableName, "codex");
  assert.deepEqual(
    inspection.foregroundProcesses.map((entry) => entry.pid),
    [210, 211]
  );
  assert.equal(inspection.ancestry.length, 1);
  assert.equal(inspection.ancestry[0].pid, 200);
  assert.equal(inspection.ancestry[0].executableName, "bash");
});

test("inspectLinuxTerminalForegroundProcess falls back to a foreground root when the process-group leader is absent", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    211: {
      stat: "211 (codex) S 999 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tcodex\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "codex\u0000--json\u0000",
      exe: "/usr/local/bin/codex",
      tty: "/dev/pts/5"
    },
    212: {
      stat: "212 (node) S 211 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tnode\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "node\u0000worker.js\u0000",
      exe: "/usr/bin/node",
      tty: "/dev/pts/5"
    }
  });

  const inspection = inspectLinuxTerminalForegroundProcess(200, fixtures);

  assert.equal(inspection.representativeProcess.pid, 211);
  assert.equal(inspection.representativeProcess.executableName, "codex");
  assert.deepEqual(
    inspection.foregroundProcesses.map((entry) => entry.pid),
    [211, 212]
  );
});

test("inspectLinuxTerminalForegroundProcess falls back to the lowest foreground pid when no leader or root exists", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    211: {
      stat: "211 (node) S 212 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tnode\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "node\u0000worker.js\u0000",
      exe: "/usr/bin/node",
      tty: "/dev/pts/5"
    },
    212: {
      stat: "212 (codex) S 211 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tcodex\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "codex\u0000--json\u0000",
      exe: "/usr/local/bin/codex",
      tty: "/dev/pts/5"
    }
  });

  const inspection = inspectLinuxTerminalForegroundProcess(200, fixtures);

  assert.equal(inspection.representativeProcess.pid, 211);
  assert.equal(inspection.ancestry.length, 1);
  assert.equal(inspection.ancestry[0].pid, 212);
});

test("inspectLinuxTerminalForegroundProcess returns null when the terminal has no active foreground group", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    300: {
      stat: "300 (other) S 1 300 300 34822 300 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tother\nNSpgid:\t300\nNSsid:\t300\n",
      cmdline: "other\u0000",
      exe: "/usr/bin/other",
      tty: "/dev/pts/6"
    }
  });

  assert.equal(inspectLinuxTerminalForegroundProcess(200, fixtures), null);
});

test("inspectLinuxTerminalForegroundProcess fails closed on non-linux platforms, invalid terminal metadata, and proc scan failures", () => {
  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", { value: "darwin" });
  try {
    assert.equal(inspectLinuxTerminalForegroundProcess(200), null);
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  }

  const invalidTerminalFixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    }
  });
  assert.equal(inspectLinuxTerminalForegroundProcess(200, invalidTerminalFixtures), null);

  const procScanFailureFixtures = {
    ...createProcFixtures({
      200: {
        stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
        status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
        cmdline: "bash\u0000--login\u0000",
        exe: "/usr/bin/bash",
        tty: "/dev/pts/5"
      }
    }),
    readdirSync() {
      throw new Error("proc unavailable");
    }
  };
  assert.equal(inspectLinuxTerminalForegroundProcess(200, procScanFailureFixtures), null);
});

test("inspectLinuxTerminalForegroundProcess stops ancestry at missing parents and respects the available foreground scope", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    210: {
      stat: "210 (codex) S 999 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Malformed\nName:\tcodex\n",
      cmdline: "codex\u0000--json\u0000",
      exe: "/usr/local/bin/codex",
      tty: "/dev/pts/5"
    }
  });

  const inspection = inspectLinuxTerminalForegroundProcess(200, fixtures);

  assert.equal(inspection.representativeProcess.pid, 210);
  assert.deepEqual(inspection.foregroundProcesses.map((entry) => entry.pid), [210]);
  assert.deepEqual(inspection.ancestry, []);
});

test("inspectLinuxTerminalForegroundProcess skips malformed peer proc entries while keeping the valid foreground process", () => {
  const fixtures = createProcFixtures({
    200: {
      stat: "200 (bash) S 100 200 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tbash\nNSpgid:\t200\nNSsid:\t200\n",
      cmdline: "bash\u0000--login\u0000",
      exe: "/usr/bin/bash",
      tty: "/dev/pts/5"
    },
    210: {
      stat: "210 (codex) S 200 210 200 34821 210 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0",
      status: "Name:\tcodex\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "codex\u0000--json\u0000",
      exe: "/usr/local/bin/codex",
      tty: "/dev/pts/5"
    },
    211: {
      stat: "invalid",
      status: "Name:\tbroken\nNSpgid:\t210\nNSsid:\t200\n",
      cmdline: "broken\u0000",
      exe: "/usr/bin/broken",
      tty: "/dev/pts/5"
    }
  });

  const inspection = inspectLinuxTerminalForegroundProcess(200, fixtures);

  assert.equal(inspection.representativeProcess.pid, 210);
  assert.deepEqual(inspection.foregroundProcesses.map((entry) => entry.pid), [210]);
});
