import test from "node:test";
import assert from "node:assert/strict";

import { buildRestartSessionCreatePayload } from "../src/session-manager-lifecycle.js";

test("buildRestartSessionCreatePayload preserves restart-critical session metadata", () => {
  const trace = { traceId: "trace-1", sessionId: "session-1" };
  const payload = buildRestartSessionCreatePayload({
    sessionMeta: {
      id: "session-1",
      kind: "ssh",
      remoteConnection: { host: "example.internal", port: 22, username: "ops" },
      remoteAuth: { method: "password" },
      quickIdToken: "Q1",
      cwd: "/tmp/runtime",
      startCwd: "~/workspace",
      shell: "ssh",
      name: "ops-shell",
      startCommand: "hostname",
      env: { LANG: "C.UTF-8" },
      note: "keep this",
      mouseForwardingMode: "application",
      inputSafetyProfile: { mode: "prompt" },
      tags: ["ops"],
      quickSendUsage: [{ lookupKey: "session::build", count: 2, lastUsedAt: 1710000000000 }],
      themeProfile: { background: "#0a0d12" },
      activeThemeProfile: { background: "#111111" },
      inactiveThemeProfile: { background: "#222222" },
      createdAt: 1700000000000
    },
    remoteSecret: "super-secret",
    updatedAt: 1700000001234,
    trace
  });

  assert.deepEqual(payload, {
    id: "session-1",
    kind: "ssh",
    remoteConnection: { host: "example.internal", port: 22, username: "ops" },
    remoteAuth: { method: "password" },
    remoteSecret: "super-secret",
    quickIdToken: "Q1",
    cwd: "~/workspace",
    shell: "ssh",
    name: "ops-shell",
    startCwd: "~/workspace",
    startCommand: "hostname",
    env: { LANG: "C.UTF-8" },
    note: "keep this",
    mouseForwardingMode: "application",
    inputSafetyProfile: { mode: "prompt" },
    tags: ["ops"],
    quickSendUsage: [{ lookupKey: "session::build", count: 2, lastUsedAt: 1710000000000 }],
    themeProfile: { background: "#0a0d12" },
    activeThemeProfile: { background: "#111111" },
    inactiveThemeProfile: { background: "#222222" },
    createdAt: 1700000000000,
    updatedAt: 1700000001234,
    trace
  });
});

test("buildRestartSessionCreatePayload falls back deterministically when optional restart fields are missing", () => {
  const payload = buildRestartSessionCreatePayload({
    sessionMeta: {
      id: "session-2",
      kind: "local",
      cwd: "/tmp/runtime",
      shell: "bash",
      createdAt: 1700000000000
    },
    remoteSecret: undefined,
    updatedAt: 1700000001234,
    trace: null
  });

  assert.deepEqual(payload, {
    id: "session-2",
    kind: "local",
    remoteConnection: undefined,
    remoteAuth: undefined,
    remoteSecret: undefined,
    quickIdToken: undefined,
    cwd: "/tmp/runtime",
    shell: "bash",
    name: undefined,
    startCwd: "/tmp/runtime",
    startCommand: "",
    env: {},
    note: undefined,
    mouseForwardingMode: undefined,
    inputSafetyProfile: undefined,
    tags: [],
    quickSendUsage: [],
    themeProfile: {},
    activeThemeProfile: undefined,
    inactiveThemeProfile: undefined,
    createdAt: 1700000000000,
    updatedAt: 1700000001234,
    trace: null
  });
});
