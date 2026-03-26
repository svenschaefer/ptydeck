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
    ["setSessionState", "setSessionBadges"]
  );
  assert.equal(actions[0].value, "working");
  assert.deepEqual(actions[1].badges, [{ id: "working", text: "Working", tone: "active" }]);
});

test("activity-status plugin normalizes codex-style status lines with timer", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({}, "•Identifying a path issue (7m 04s • esc to interrupt)\n");

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionBadges"]
  );
  assert.equal(actions[0].value, "working");
});

test("activity-status plugin upgrades split chunks to the richer timed status", () => {
  const plugin = getPlugin("activity-status");

  const initialActions = plugin.onData({ id: "s1" }, "\rWorking");
  const upgradedActions = plugin.onData({ id: "s1" }, " (1m 32s • esc to interrupt)");

  assert.deepEqual(
    initialActions.map((action) => action.type),
    ["setSessionState", "setSessionBadges"]
  );
  assert.deepEqual(
    upgradedActions.map((action) => action.type),
    ["setSessionState", "setSessionBadges"]
  );
  assert.equal(upgradedActions[0].value, "working");
});

test("activity-status plugin does not downgrade a richer timed status to a plain activity verb in later chunks", () => {
  const plugin = getPlugin("activity-status");

  const richerActions = plugin.onData({ id: "s1" }, "Working (1m 32s • esc to interrupt)\n");
  const downgradedActions = plugin.onData({ id: "s1" }, "Working");

  assert.equal(richerActions[0].value, "working");
  assert.equal(downgradedActions, null);
});

test("activity-status plugin prefers richer timed status over generic working lines", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData(
    { id: "s2" },
    "Working (7m 04s • esc to interrupt)\nWorking\n"
  );

  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionBadges"]
  );
  assert.equal(actions[0].value, "working");
});

test("activity-status plugin extracts completed-files progress with optional speed and uses it as the richer status", () => {
  const plugin = getPlugin("activity-status");
  const actions = plugin.onData({ id: "s3" }, "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s\n");

  assert.ok(Array.isArray(actions));
  assert.deepEqual(
    actions.map((action) => action.type),
    ["setSessionState", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.deepEqual(actions[2].patch, {
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
    ["setSessionState", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.deepEqual(actions[2].patch, {
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
    ["setSessionState", "setSessionBadges", "mergeSessionMeta"]
  );
  assert.deepEqual(countOnlyActions[2].patch, {
    progress: {
      filesDone: 0,
      filesTotal: 1,
      bytesDone: "",
      bytesTotal: "",
      speed: ""
    }
  });
  assert.equal(richerActions[0].value, "working");
  assert.equal(mixedPriorityActions[0].value, "working");
});

test("activity-status plugin does not downgrade richer completed-files progress during the same activity", () => {
  const plugin = getPlugin("activity-status");

  const richerActions = plugin.onData({ id: "s7" }, "Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s\n");
  const downgradedActions = plugin.onData({ id: "s7" }, "Completed files 0/1\n");

  assert.equal(richerActions[0].value, "working");
  assert.equal(downgradedActions, null);
});

test("prompt-idle-recovery plugin clears working state on prompt or idle", () => {
  const plugins = createBuiltInStreamPlugins();
  const activityPlugin = plugins.find((plugin) => plugin.id === "activity-status");
  const plugin = plugins.find((entry) => entry.id === "prompt-idle-recovery");
  const session = {
    id: "s8",
    interpretationState: "working",
    statusText: "Working on plan",
    pluginBadges: [{ id: "working", text: "Working" }]
  };

  activityPlugin.onData(session, "Working (1m 32s • esc to interrupt)\n");
  const promptActions = plugin.onLine(session, "user@host:~/repo$ ");
  const idleActions = plugin.onIdle(session);
  const nextActivityActions = activityPlugin.onData(session, "Working");

  assert.deepEqual(
    promptActions.map((action) => action.type),
    ["setSessionState", "setSessionStatus", "setSessionBadges"]
  );
  assert.deepEqual(promptActions, idleActions);
  assert.equal(promptActions[0].value, "idle");
  assert.deepEqual(promptActions[2].badges, []);
  assert.equal(nextActivityActions[0].value, "working");
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
