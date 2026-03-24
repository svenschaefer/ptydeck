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
