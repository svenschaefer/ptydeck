import test from "node:test";
import assert from "node:assert/strict";

import { createBuiltInStreamPlugins } from "../src/public/stream-builtins.js";

function getPlugin(id) {
  return createBuiltInStreamPlugins().find((plugin) => plugin.id === id);
}

test("activity-status plugin detects active processing output from data chunks", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({}, "Working on plan...\r");

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.equal(actions[0].value, "working");
  assert.equal(actions[1].value, "Working");
  assert.deepEqual(actions[2].badges, [{ id: "working", text: "Working", tone: "active" }]);
});

test("activity-status plugin normalizes codex-style status lines with timer", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({}, "•Identifying a path issue (7m 04s • esc to interrupt)\n");

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.equal(actions[1].value, "Identifying a path issue (7m 04s • esc to interrupt)");
});

test("activity-status plugin upgrades split chunks to the richer timed status", () => {
  const plugin = getPlugin("activity-status");

  const initialActions = plugin.onData({ id: "s1" }, "\rWorking");
  const upgradedActions = plugin.onData({ id: "s1" }, " (1m 32s • esc to interrupt)");

  assert.deepEqual(
    initialActions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.equal(initialActions[1].value, "Working");
  assert.deepEqual(
    upgradedActions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.equal(upgradedActions[1].value, "Working (1m 32s • esc to interrupt)");
});

test("activity-status plugin prefers richer timed status over generic working lines", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData(
    { id: "s2" },
    "Working (7m 04s • esc to interrupt)\nWorking\n"
  );

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.equal(actions[1].value, "Working (7m 04s • esc to interrupt)");
});

test("activity-status plugin extracts completed-files progress with optional speed and uses it as the richer status", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({ id: "s3" }, "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s\n");

  assert.ok(Array.isArray(actions));
  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.equal(actions[1].value, "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s");
  assert.deepEqual(actions[3].patch, {
    progress: {
      filesDone: 0,
      filesTotal: 1,
      bytesDone: "94.5MiB",
      bytesTotal: "279.5MiB",
      speed: "6.8MiB/s"
    }
  });
});

test("activity-status plugin extracts completed-files progress without speed and keeps the byte-level status text", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({ id: "s4" }, "⠧ Completed files 0/1 | 32.0MiB/279.5MiB\n");

  assert.ok(Array.isArray(actions));
  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.equal(actions[1].value, "Completed files 0/1 | 32.0MiB/279.5MiB");
  assert.deepEqual(actions[3].patch, {
    progress: {
      filesDone: 0,
      filesTotal: 1,
      bytesDone: "32MiB",
      bytesTotal: "279.5MiB",
      speed: ""
    }
  });
});

test("activity-status plugin supports completed-files count-only status and prefers richer progress variants", () => {
  const plugin = getPlugin("activity-status");

  const countOnlyActions = plugin.onData({ id: "s5" }, "Completed files 0/1");
  const richerActions = plugin.onData({ id: "s5" }, " | 32.0MiB/279.5MiB | 6.8MiB/s");
  const mixedPriorityActions = plugin.onData(
    { id: "s6" },
    "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s\nCompleted files 0/1\n"
  );

  assert.deepEqual(
    countOnlyActions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.equal(countOnlyActions[1].value, "Completed files 0/1");
  assert.deepEqual(countOnlyActions[3].patch, {
    progress: {
      filesDone: 0,
      filesTotal: 1,
      bytesDone: "",
      bytesTotal: "",
      speed: ""
    }
  });
  assert.equal(richerActions[1].value, "Completed files 0/1 | 32.0MiB/279.5MiB | 6.8MiB/s");
  assert.equal(mixedPriorityActions[1].value, "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s");
});

test("prompt-idle-recovery plugin clears working state on prompt or idle", () => {
  const plugin = getPlugin("prompt-idle-recovery");
  const session = {
    interpretationState: "working",
    statusText: "Working on plan",
    pluginBadges: [{ id: "working", text: "Working" }]
  };

  const promptActions = plugin.onLine(session, "user@host:~/repo$ ");
  const idleActions = plugin.onIdle(session);

  assert.deepEqual(
    promptActions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.deepEqual(promptActions, idleActions);
  assert.equal(promptActions[0].value, "idle");
  assert.deepEqual(promptActions[2].badges, []);
});

test("attention-errors plugin raises attention state and notification on error-like output", () => {
  const plugin = getPlugin("attention-errors");
  const actions = plugin.onData({}, "Fatal error: build failed\n");

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "markSessionAttention", "pushSessionNotification"]
  );
  assert.equal(actions[0].value, "attention");
  assert.equal(actions[2].active, true);
  assert.match(actions[3].notification.message, /build failed/i);
});
