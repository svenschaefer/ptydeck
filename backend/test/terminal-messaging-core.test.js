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

test("terminal messaging core normalizes descriptor and intent payload metadata deterministically", () => {
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: " telegram ",
    channel: " chat ",
    capabilities: [" send_message ", "", null, "thread_topics"],
    metadata: {
      " display ": " Telegram ",
      enabled: true,
      retries: 2,
      empty: "   ",
      skip: null,
      nested: { nope: true }
    }
  });

  const intent = createMessageIntent({
    sessionId: " session-4 ",
    text: "  Multi   word  summary  ",
    deliveryAdapters: "invalid",
    routing: {
      " deliveryBlockKey ": " block-4 ",
      active: true,
      retryCount: 1,
      empty: " ",
      nested: { skip: true }
    },
    metadata: {
      " actor ": " operator ",
      muted: false,
      attempts: 3,
      empty: "",
      nested: ["skip"]
    }
  });

  assert.deepEqual(deliveryAdapter, {
    entityType: "DeliveryAdapter",
    adapterId: "telegram",
    channel: "chat",
    capabilities: Object.freeze(["send_message", "thread_topics"]),
    metadata: Object.freeze({
      display: "Telegram",
      enabled: true,
      retries: 2
    })
  });
  assert.match(intent.intentId, /^intent:/u);
  assert.equal(intent.sessionId, "session-4");
  assert.equal(intent.comparableText, "multi word summary");
  assert.deepEqual(intent.deliveryAdapters, Object.freeze([]));
  assert.deepEqual(intent.routing, Object.freeze({ deliveryBlockKey: "block-4", active: true, retryCount: 1 }));
  assert.deepEqual(intent.metadata, Object.freeze({ actor: "operator", muted: false, attempts: 3 }));
});

test("terminal messaging core rejects missing descriptor identities and falls back for invalid optional containers", () => {
  assert.throws(() => createDeliveryAdapterDescriptor({ adapterId: "", channel: "telegram" }), /requires adapterId and channel/);
  assert.throws(() => createDeliveryAdapterDescriptor({ adapterId: "telegram", channel: "" }), /requires adapterId and channel/);

  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: " telegram ",
    channel: " ops-room ",
    capabilities: "invalid",
    metadata: ["invalid"]
  });

  assert.deepEqual(deliveryAdapter, {
    entityType: "DeliveryAdapter",
    adapterId: "telegram",
    channel: "ops-room",
    capabilities: Object.freeze([]),
    metadata: Object.freeze({})
  });
});

test("terminal messaging core applies default intent fields when optional metadata is malformed or blank", () => {
  const intent = createMessageIntent({
    sessionId: " session-5 ",
    intentKind: " ",
    eventType: "",
    severity: "",
    threadKey: " ",
    text: "  Multi   word  summary  ",
    format: "",
    comparableText: "",
    routing: null,
    metadata: null
  });

  assert.equal(intent.sessionId, "session-5");
  assert.equal(intent.intentKind, "status-update");
  assert.equal(intent.eventType, "session.output.summary");
  assert.equal(intent.severity, "info");
  assert.equal(intent.threadKey, "status");
  assert.equal(intent.format, "plain_text");
  assert.equal(intent.comparableText, "multi word summary");
  assert.deepEqual(intent.routing, Object.freeze({}));
  assert.deepEqual(intent.metadata, Object.freeze({}));
});
