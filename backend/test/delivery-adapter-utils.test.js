import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryEventFromMessageIntent,
  createDefaultMessageIntentDecision,
  truncateMiddleNormalizedText,
  truncateStructuredMessageText
} from "../src/delivery-adapter-utils.js";
import { createDeliveryAdapterDescriptor, createMessageIntent } from "../src/terminal-messaging-core.js";

test("delivery adapter utils truncate display and structured text deterministically", () => {
  assert.equal(truncateMiddleNormalizedText("", 12), "");
  assert.equal(truncateMiddleNormalizedText("alpha beta gamma", 1), "…");
  assert.equal(truncateMiddleNormalizedText("alpha beta gamma", 9), "alph…amma");
  assert.equal(truncateStructuredMessageText("alpha beta gamma", 11), "alpha beta…");
  assert.equal(truncateStructuredMessageText("alpha\nbeta\ngamma", 7), "alpha…");
});

test("delivery adapter utils build structured delivery events and default decisions without semantic-era contracts", () => {
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: "telegram",
    channel: "telegram",
    capabilities: ["send_message"]
  });
  const intent = createMessageIntent({
    sessionId: "session-1",
    intentKind: "turn-primary-reply",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    format: "structured_text",
    text: "alpha beta gamma",
    comparableText: "alpha beta gamma",
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      deliveryBlockKey: "reply-1"
    },
    metadata: {
      summaryMaxLength: 11,
      deliverySignal: "turn-primary-reply",
      aggregationReason: "explicit_reply"
    }
  });

  const event = buildDeliveryEventFromMessageIntent(intent, {
    session: {
      id: "session-1",
      name: "build-run",
      quickIdToken: "4"
    },
    profile: "transport-only",
    nowFn: () => 123
  });

  assert.equal(event.occurredAt, 123);
  assert.equal(event.deliverySignal, "turn-primary-reply");
  assert.equal(event.summary, "alpha beta…");
  assert.equal(event.text, "[4] build-run: alpha beta…");
  assert.equal(event.aggregationReason, "explicit_reply");
  assert.deepEqual(createDefaultMessageIntentDecision(event, {}), {
    action: "new",
    messageKey: "status",
    reason: "message_intent_default"
  });
  assert.deepEqual(createDefaultMessageIntentDecision(event, { messageCreated: true }), {
    action: "update",
    messageKey: "status",
    reason: "message_intent_default"
  });
});
