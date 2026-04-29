import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveSessionLifecycleState,
  maybeMatchCommandCorrelation,
  reduceSessionActivityBump,
  reduceSessionActivityClear
} from "../src/public/session-activity-state.js";

function updateLatestCommandCorrelation(session, updater) {
  const correlations = Array.isArray(session?.commandCorrelations) ? session.commandCorrelations.slice() : [];
  if (correlations.length === 0) {
    return session;
  }
  const lastIndex = correlations.length - 1;
  const nextRecord = updater(correlations[lastIndex]);
  if (!nextRecord || nextRecord === correlations[lastIndex]) {
    return session;
  }
  correlations[lastIndex] = nextRecord;
  return {
    ...session,
    commandCorrelations: correlations
  };
}

test("deriveSessionLifecycleState preserves formal runtime states and derives busy or idle from activity markers", () => {
  assert.equal(deriveSessionLifecycleState("created", {}), "created");
  assert.equal(deriveSessionLifecycleState("starting", {}), "starting");
  assert.equal(deriveSessionLifecycleState("unrestored", {}), "unrestored");
  assert.equal(deriveSessionLifecycleState("closed", {}), "closed");
  assert.equal(deriveSessionLifecycleState("running", { hasLiveActivity: true }), "busy");
  assert.equal(deriveSessionLifecycleState("running", { activityState: "active" }), "busy");
  assert.equal(deriveSessionLifecycleState("running", { lastOutputAt: 10 }), "idle");
  assert.equal(deriveSessionLifecycleState("running", { activityCompletedAt: 11 }), "idle");
  assert.equal(deriveSessionLifecycleState("running", {}), "running");
});

test("maybeMatchCommandCorrelation matches only the latest pending correlation inside the output window", () => {
  const record = { id: "cmd-1", submittedAt: 100 };
  const preMatched = { ...record, matchedAt: 110 };

  assert.deepEqual(maybeMatchCommandCorrelation(record, 120), {
    id: "cmd-1",
    submittedAt: 100,
    matchedAt: 120,
    firstOutputAt: 120
  });
  assert.equal(maybeMatchCommandCorrelation(record, 40_000), record);
  assert.equal(maybeMatchCommandCorrelation(preMatched, 120), preMatched);
});

test("reduceSessionActivityBump marks the target session busy, unread when inactive, and matches the latest correlation", () => {
  const runtimeState = {
    activeSessionId: "active",
    sessions: [
      { id: "active", state: "running" },
      {
        id: "target",
        state: "running",
        commandCorrelations: [{ id: "cmd-1", submittedAt: 100 }]
      }
    ]
  };

  const nextState = reduceSessionActivityBump(
    runtimeState,
    { sessionId: "target", timestamp: 120 },
    { updateLatestCommandCorrelation }
  );

  assert.notEqual(nextState, runtimeState);
  const target = nextState.sessions.find((session) => session.id === "target");
  assert.deepEqual(target.commandCorrelations, [
    {
      id: "cmd-1",
      submittedAt: 100,
      matchedAt: 120,
      firstOutputAt: 120
    }
  ]);
  assert.equal(target.activityState, "active");
  assert.equal(target.activityUpdatedAt, 120);
  assert.equal(target.activityCompletedAt, null);
  assert.equal(target.hasLiveActivity, true);
  assert.equal(target.hasUnreadActivity, true);
  assert.equal(target.lastOutputAt, 120);
  assert.equal(target.lifecycleState, "busy");
});

test("reduceSessionActivityClear ignores stale idle cutoffs and completes the latest matched correlation on clear", () => {
  const runtimeState = {
    activeSessionId: "target",
    sessions: [
      {
        id: "target",
        state: "running",
        activityState: "active",
        hasLiveActivity: true,
        hasUnreadActivity: false,
        lastOutputAt: 220,
        commandCorrelations: [{ id: "cmd-1", submittedAt: 100, matchedAt: 220, firstOutputAt: 220 }]
      }
    ]
  };

  const staleState = reduceSessionActivityClear(
    runtimeState,
    { sessionId: "target", timestamp: 200 },
    { updateLatestCommandCorrelation }
  );
  assert.equal(staleState, runtimeState);

  const clearedState = reduceSessionActivityClear(
    runtimeState,
    { sessionId: "target", timestamp: 220 },
    { updateLatestCommandCorrelation }
  );
  const target = clearedState.sessions[0];

  assert.equal(target.activityState, "inactive");
  assert.equal(target.activityUpdatedAt, 220);
  assert.equal(target.activityCompletedAt, 220);
  assert.equal(target.hasLiveActivity, false);
  assert.equal(target.lifecycleState, "idle");
  assert.deepEqual(target.commandCorrelations, [
    {
      id: "cmd-1",
      submittedAt: 100,
      matchedAt: 220,
      firstOutputAt: 220,
      completedAt: 220
    }
  ]);
});
