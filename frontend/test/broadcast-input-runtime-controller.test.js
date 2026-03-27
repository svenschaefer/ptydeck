import test from "node:test";
import assert from "node:assert/strict";

import { createBroadcastInputRuntimeController } from "../src/public/broadcast-input-runtime-controller.js";

test("broadcast input runtime controller enables active workspace-group broadcast and formats status", () => {
  const sessions = [
    { id: "s1", name: "API", deckId: "ops" },
    { id: "s2", name: "Worker", deckId: "ops" },
    { id: "s3", name: "Docs", deckId: "docs" }
  ];
  const controller = createBroadcastInputRuntimeController({
    getActiveDeckId: () => "ops",
    getSessions: () => sessions,
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (value) => value.slice(),
    listGroupsForDeck: (deckId) =>
      deckId === "ops"
        ? [{ id: "build", name: "Build", sessionIds: ["s2", "s1"] }]
        : [],
    getActiveGroupIdForDeck: () => "build",
    applyGroupLocally: () => null
  });

  assert.equal(controller.getStatus(), "Broadcast: off.");
  assert.equal(controller.enableGroupBroadcast(), "Broadcasting to workspace group [build] Build on deck [ops].");
  assert.equal(controller.getMode(), "group");
  assert.equal(controller.formatTargetSummary(), "Target: group [build] Build · 2 sessions");
  assert.equal(
    controller.getStatus(),
    "Broadcast: workspace group [build] Build on deck [ops] (2 sessions)."
  );
  assert.deepEqual(
    controller.getBroadcastTargets(),
    {
      active: true,
      mode: "group",
      deckId: "ops",
      group: { id: "build", name: "Build", sessionIds: ["s2", "s1"] },
      sessions: [sessions[1], sessions[0]],
      error: "",
      summary: "Target: group [build] Build · 2 sessions",
      routeFeedback: "Sent to workspace group [build] Build (2 sessions)."
    }
  );
  assert.equal(controller.disableBroadcast(), "Broadcast mode disabled.");
  assert.equal(controller.getMode(), "single");
});

test("broadcast input runtime controller can activate a named group before enabling broadcast", () => {
  const calls = [];
  const controller = createBroadcastInputRuntimeController({
    getActiveDeckId: () => "ops",
    getSessions: () => [{ id: "s1", name: "API", deckId: "ops" }],
    resolveSessionDeckId: (session) => session.deckId,
    sortSessionsByQuickId: (value) => value.slice(),
    listGroupsForDeck: () => [{ id: "api", name: "API", sessionIds: ["s1"] }],
    getActiveGroupIdForDeck: () => "",
    applyGroupLocally: (groupId, deckId) => {
      calls.push([groupId, deckId]);
      return { id: groupId };
    }
  });

  assert.equal(controller.enableGroupBroadcast("api"), "Broadcasting to workspace group [api] API on deck [ops].");
  assert.deepEqual(calls, [["api", "ops"]]);
});
