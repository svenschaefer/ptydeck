import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryEventFromMessageIntent,
  buildFallbackSessionLabel,
  createDefaultMessageIntentDecision,
  normalizeLineBreaks,
  truncateDisplayText,
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

test("delivery adapter utils normalize labels and degenerate truncation branches deterministically", () => {
  assert.equal(normalizeLineBreaks("\r\nalpha\r\nbeta \r\n"), "alpha\nbeta");
  assert.equal(truncateStructuredMessageText("alpha", 1), "…");
  assert.equal(truncateStructuredMessageText(" \n\t ", 5), "");
  assert.equal(truncateDisplayText(" alpha   beta gamma ", 5), "al…ma");
  assert.equal(buildFallbackSessionLabel({ quickIdToken: "7", shell: "bash" }), "[7] bash");
  assert.equal(buildFallbackSessionLabel({ id: "session-9" }), "session-9");
});

test("delivery adapter utils derive fallback delivery metadata without a session label", () => {
  const intent = createMessageIntent({
    intentKind: "attention-notice",
    text: "alpha beta gamma"
  });

  const event = buildDeliveryEventFromMessageIntent(intent, {
    formatSessionLabel: () => "",
    maxEventSummaryLength: 1,
    nowFn: () => 456
  });

  assert.equal(event.occurredAt, 456);
  assert.equal(event.summary, "…");
  assert.equal(event.text, "…");
  assert.equal(event.deliverySignal, "attention-notice");
  assert.equal(event.aggregationReason, "attention-notice");
  assert.equal(event.deliveryBlockKey, "status");
  assert.deepEqual(createDefaultMessageIntentDecision(event, { messageId: 42 }), {
    action: "update",
    messageKey: "status",
    reason: "message_intent_default"
  });
});
