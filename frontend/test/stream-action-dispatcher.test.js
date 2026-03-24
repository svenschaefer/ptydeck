import test from "node:test";
import assert from "node:assert/strict";

import {
  createStreamActionDispatcher,
  normalizeStreamInterpretationAction
} from "../src/public/stream-action-dispatcher.js";

test("normalizeStreamInterpretationAction validates the supported action contract", () => {
  assert.deepEqual(
    normalizeStreamInterpretationAction({
      type: "setSessionBadges",
      pluginId: "codex",
      badges: [
        { id: "working", text: "Working", tone: "active" },
        { text: "" }
      ]
    }),
    {
      type: "setSessionBadges",
      pluginId: "codex",
      badges: [{ id: "working", text: "Working", tone: "active", pluginId: "codex" }]
    }
  );

  assert.throws(
    () => normalizeStreamInterpretationAction({ type: "unsupported" }),
    /Unsupported interpretation action type/
  );
});

test("stream action dispatcher normalizes valid actions and isolates invalid ones", () => {
  const calls = [];
  const errors = [];
  const dispatcher = createStreamActionDispatcher({
    store: {
      applySessionInterpretationActions(sessionId, actions) {
        calls.push({ sessionId, actions });
      }
    },
    onError(details) {
      errors.push(details);
    }
  });

  const applied = dispatcher.dispatch(
    "s1",
    [
      { type: "setSessionStatus", value: "Working..." },
      { type: "mergeSessionMeta", patch: { tool: "codex" } },
      { type: "upsertSessionArtifact", artifact: { id: "summary", kind: "summary", title: "Summary" } },
      { type: "pushSessionNotification", notification: { message: "Done" } },
      { type: "unsupported", value: "bad" }
    ],
    { hook: "onLine" }
  );

  assert.equal(applied.length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, "s1");
  assert.deepEqual(
    calls[0].actions.map((action) => action.type),
    ["setSessionStatus", "mergeSessionMeta", "upsertSessionArtifact", "pushSessionNotification"]
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].error.message, /Unsupported interpretation action type/);
});
