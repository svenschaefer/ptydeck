import test from "node:test";
import assert from "node:assert/strict";

import { createSessionViewModel, formatSessionDisplayName } from "../src/public/session-view-model.js";

const model = createSessionViewModel({
  defaultDeckId: "default",
  sessionTagPattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  sessionTagMaxEntries: 3,
  sessionTagMaxLength: 8,
  sessionEnvKeyPattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
  sessionEnvMaxEntries: 2,
  formatSessionToken: (id) => id.slice(0, 2)
});

test("session view model normalizes tags deterministically", () => {
  assert.deepEqual(model.normalizeSessionTags(["Beta", "alpha", "beta", "bad tag", "toolongtag"]), ["alpha", "beta"]);
});

test("session view model validates environment payloads", () => {
  assert.deepEqual(model.parseSessionEnv("FOO=1\nBAR=two"), {
    ok: true,
    env: { FOO: "1", BAR: "two" }
  });
  assert.equal(model.parseSessionEnv("1BAD=value").ok, false);
});

test("session runtime helpers produce exited messaging", () => {
  const session = { id: "abcd1234", name: "build", state: "exited", exitCode: 2, exitSignal: "" };
  assert.equal(model.getSessionStateBadgeText(session), "EXITED");
  assert.match(model.getExitedSessionMessage(session), /exit code 2/);
});

test("session runtime helpers prefer formal lifecycle state and expose starting badge", () => {
  const startingSession = { id: "abcd1234", name: "build", state: "running", lifecycleState: "starting" };
  const busySession = { id: "efgh5678", name: "ops", state: "running", lifecycleState: "busy" };
  const idleSession = { id: "ijkl9012", name: "ops", state: "running", lifecycleState: "idle" };
  const closedSession = { id: "mnop3456", name: "ops", state: "closed" };

  assert.equal(model.getSessionRuntimeState(startingSession), "starting");
  assert.equal(model.getSessionStateBadgeText(startingSession), "STARTING");
  assert.match(model.getSessionStateHintText(startingSession), /PTY is ready/i);
  assert.equal(model.getSessionRuntimeState(busySession), "busy");
  assert.equal(model.getSessionRuntimeState(idleSession), "idle");
  assert.equal(model.getSessionRuntimeState(closedSession), "closed");
});

test("session view model formats visible non-shell app identity details", () => {
  const codexSession = {
    id: "codex-1",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.91,
      details: {},
      updatedAt: 42
    }
  };
  const shellSession = {
    id: "shell-1",
    appIdentity: {
      family: "shell",
      label: "bash",
      source: "foreground-process",
      confidence: 0.82,
      details: {},
      updatedAt: 42
    }
  };

  assert.equal(model.getSessionAppIdentityText(codexSession), "codex");
  assert.match(model.getSessionAppIdentityTitle(codexSession), /foreground process/i);
  assert.equal(model.getSessionAppIdentityText(shellSession), "");
});

test("session view model appends visible active app labels to the session header without duplicating matching names", () => {
  const plainSession = { id: "plain-1", name: "ptydeck" };
  const codexSession = {
    id: "codex-1",
    name: "ptydeck",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.91,
      details: {},
      updatedAt: 42
    }
  };
  const duplicateSession = {
    id: "codex-2",
    name: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.91,
      details: {},
      updatedAt: 42
    }
  };

  assert.equal(model.getSessionHeaderLabel(plainSession), "ptydeck");
  assert.equal(model.getSessionHeaderLabel(codexSession), "ptydeck (codex)");
  assert.equal(model.getSessionHeaderLabel(duplicateSession), "codex");
});

test("session view model covers blocked-state messaging, env/tag guardrails, and startup normalization", () => {
  const unrestored = {
    id: "uvwx1234",
    name: "ops",
    lifecycleState: "unrestored",
    hasLiveActivity: true
  };
  const exited = {
    id: "yzab5678",
    name: "build",
    state: "exited",
    exitSignal: "SIGTERM",
    hasUnreadActivity: true
  };

  assert.equal(formatSessionDisplayName({ id: "1234567890" }), "12345678");
  assert.equal(model.resolveSessionDeckId({ deckId: "" }), "default");
  assert.equal(model.isSessionUnrestored(unrestored), true);
  assert.equal(model.isSessionActionBlocked(unrestored), true);
  assert.equal(model.getSessionActivityIndicatorState(unrestored), "live");
  assert.equal(model.getSessionActivityIndicatorState(exited), "unseen");
  assert.match(model.getSessionStateHintText(unrestored), /could not be restored/i);
  assert.match(model.getUnrestoredSessionMessage(unrestored), /Session \[uv\] ops is unrestored/);
  assert.match(model.getBlockedSessionActionMessage([unrestored], "Restart"), /Restart blocked for unrestored session \[uv\] ops\./);
  assert.match(
    model.getBlockedSessionActionMessage([unrestored, exited], "Restart"),
    /Restart blocked for non-interactive sessions: \[uv\] ops \[unrestored\], \[yz\] build \[exited\]\./
  );
  assert.equal(model.formatSessionEnv({ BETA: "2", ALPHA: "1", DROP: 3 }), "ALPHA=1\nBETA=2");
  assert.equal(model.formatSessionTags(["Beta", "alpha", "beta"]), "alpha, beta");
  assert.equal(model.parseSessionTags("one two three four").ok, false);
  assert.equal(model.parseSessionTags("bad*tag").ok, false);
  assert.equal(model.parseSessionEnv("NOVALUE").ok, false);
  assert.equal(model.parseSessionEnv("1BAD=value").ok, false);
  assert.deepEqual(
    model.normalizeSessionStartupFromSession({
      startCwd: 7,
      startCommand: null,
      env: "bad",
      mouseForwardingMode: "bogus",
      tags: ["Beta", "beta", "bad tag"]
    }),
    {
      startCwd: "",
      startCommand: "",
      env: {},
      mouseForwardingMode: "off",
      tags: ["beta"]
    }
  );
});
