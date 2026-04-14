import test from "node:test";
import assert from "node:assert/strict";
import {
  createAppSemanticAdapterDescriptor,
  createDeliveryAdapterDescriptor,
  createMessageIntent,
  createOutputEpisode,
  createTerminalProjection,
  createTurn
} from "../src/terminal-messaging-core.js";

test("terminal messaging core builds a reply intent from neutral boundary contracts", () => {
  const projection = createTerminalProjection({
    projectionId: "projection-1",
    sessionId: "session-1",
    transport: "pty",
    representation: "screen-buffer",
    sourceRevision: "rev-1",
    appFamily: "coding-agent",
    appLabel: "codex",
    profile: "coding-agent",
    metadata: {
      source: "unit-test",
      scrollbackDelta: 12
    }
  });
  const turn = createTurn({
    turnId: "turn-1",
    sessionId: "session-1",
    triggerKind: "submitted-input",
    inputSource: "messaging:telegram",
    correlationId: "corr-1",
    traceId: "trace-1",
    baselineProjectionId: "projection-baseline-1",
    openedAt: 100,
    closedAt: 150,
    status: "completed"
  });
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: "telegram",
    channel: "telegram",
    capabilities: ["send_message", "thread_topics"]
  });
  const semanticAdapter = createAppSemanticAdapterDescriptor({
    adapterId: "coding-agent-semantic-adapter",
    appFamily: "coding-agent",
    appLabels: ["codex"],
    strategy: "legacy-codex-allowlist"
  });

  const intent = createMessageIntent({
    intentId: "intent-1",
    sessionId: "session-1",
    intentKind: "reply",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: "Ok, verstanden",
    format: "plain_text",
    comparableText: "ok, verstanden",
    projection,
    turn,
    semanticAdapter,
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      priority: "primary"
    },
    metadata: {
      aggregationReason: "codex_input_reply",
      summaryMaxLength: 1200
    }
  });

  assert.equal(intent.entityType, "MessageIntent");
  assert.equal(intent.turn?.entityType, "Turn");
  assert.equal(intent.outputEpisode, null);
  assert.equal(intent.projection?.entityType, "TerminalProjection");
  assert.equal(intent.semanticAdapter?.entityType, "AppSemanticAdapter");
  assert.equal(intent.deliveryAdapters[0]?.entityType, "DeliveryAdapter");
  assert.equal(intent.metadata.aggregationReason, "codex_input_reply");
  assert.equal(Object.isFrozen(intent), true);
});

test("terminal messaging core builds an autonomous output intent from an output episode", () => {
  const projection = createTerminalProjection({
    projectionId: "projection-2",
    sessionId: "session-2",
    representation: "screen-buffer"
  });
  const outputEpisode = createOutputEpisode({
    episodeId: "episode-2",
    sessionId: "session-2",
    episodeKind: "autonomous-output",
    sourceProjectionId: "projection-2",
    startedAt: 200,
    completedAt: 260,
    status: "completed"
  });

  const intent = createMessageIntent({
    intentId: "intent-2",
    sessionId: "session-2",
    intentKind: "autonomous-update",
    text: "Background summary block",
    format: "structured_text",
    projection,
    outputEpisode,
    routing: {
      threadKey: "status",
      priority: "secondary"
    }
  });

  assert.equal(intent.outputEpisode?.entityType, "OutputEpisode");
  assert.equal(intent.turn, null);
  assert.equal(intent.format, "structured_text");
});

test("terminal messaging core rejects message intents without exactly one turn boundary", () => {
  const projection = createTerminalProjection({
    projectionId: "projection-3",
    sessionId: "session-3"
  });
  const turn = createTurn({
    turnId: "turn-3",
    sessionId: "session-3"
  });
  const outputEpisode = createOutputEpisode({
    episodeId: "episode-3",
    sessionId: "session-3"
  });

  assert.throws(
    () =>
      createMessageIntent({
        sessionId: "session-3",
        text: "broken",
        projection
      }),
    /requires exactly one of Turn or OutputEpisode/
  );

  assert.throws(
    () =>
      createMessageIntent({
        sessionId: "session-3",
        text: "broken",
        projection,
        turn,
        outputEpisode
      }),
    /requires exactly one of Turn or OutputEpisode/
  );
});
