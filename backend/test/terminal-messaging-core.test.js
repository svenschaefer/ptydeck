import test from "node:test";
import assert from "node:assert/strict";
import { createDeliveryAdapterDescriptor, createMessageIntent } from "../src/terminal-messaging-core.js";

test("terminal messaging core builds a transport-neutral explicit message intent", () => {
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: "telegram",
    channel: "telegram",
    capabilities: ["send_message", "thread_topics"]
  });

  const intent = createMessageIntent({
    intentId: "intent-1",
    sessionId: "session-1",
    intentKind: "status-update",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: "Ok, verstanden",
    format: "plain_text",
    comparableText: "ok, verstanden",
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      deliveryBlockKey: "block-1",
      priority: "primary"
    },
    metadata: {
      aggregationReason: "explicit_operator_status",
      summaryMaxLength: 1200
    }
  });

  assert.equal(intent.entityType, "MessageIntent");
  assert.equal(intent.sessionId, "session-1");
  assert.equal(intent.deliveryAdapters[0]?.entityType, "DeliveryAdapter");
  assert.equal(intent.routing.deliveryBlockKey, "block-1");
  assert.equal(intent.metadata.aggregationReason, "explicit_operator_status");
  assert.equal(Object.isFrozen(intent), true);
});

test("terminal messaging core permits explicit sessionless intents for transport-only notifications", () => {
  const intent = createMessageIntent({
    intentId: "intent-2",
    intentKind: "status-update",
    text: "Transport connected",
    threadKey: "transport",
    metadata: {
      deliveryBlockKey: "transport-connected"
    }
  });

  assert.equal(intent.sessionId, "");
  assert.equal(intent.threadKey, "transport");
  assert.equal(intent.metadata.deliveryBlockKey, "transport-connected");
});

test("terminal messaging core rejects malformed explicit message intent input", () => {
  assert.throws(
    () =>
      createMessageIntent({
        sessionId: "session-3",
        text: ""
      }),
    /requires text/
  );

  assert.throws(
    () =>
      createMessageIntent({
        sessionId: "session-3",
        text: "broken",
        deliveryAdapters: [{}]
      }),
    /deliveryAdapters entries must be DeliveryAdapter descriptors/
  );
});
