import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordAdapter, createDiscordTransport } from "../src/discord-adapter.js";
import { applyMessagingMessagePolicy, advanceMessagingThreadPolicyState } from "../src/messaging-runtime.js";
import { createDeliveryAdapterDescriptor, createMessageIntent } from "../src/terminal-messaging-core.js";

test("discord transport sends webhook posts and edits with thread query parameters", async () => {
  const requests = [];
  const transport = createDiscordTransport({
    apiBaseUrl: "https://discord.example.test/api/v10",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            id: requests.length === 1 ? "m-1" : "m-2"
          };
        }
      };
    }
  });

  const sent = await transport.sendMessage({
    webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
    threadId: "777",
    text: "hello"
  });
  const edited = await transport.editMessage({
    webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
    threadId: "777",
    messageId: "m-1",
    text: "updated"
  });

  assert.equal(sent.messageId, "m-1");
  assert.equal(edited.messageId, "m-2");
  assert.equal(
    requests[0].url,
    "https://discord.example.test/api/v10/webhooks/123/token?wait=true&thread_id=777"
  );
  assert.equal(
    requests[1].url,
    "https://discord.example.test/api/v10/webhooks/123/token/messages/m-1?wait=true&thread_id=777"
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    content: "hello",
    allowed_mentions: { parse: [] }
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    content: "updated",
    allowed_mentions: { parse: [] }
  });
});

test("discord adapter consumes adapter-neutral message intents with the same bounded new/update vocabulary", async () => {
  const sends = [];
  const edits = [];
  const session = {
    id: "session-1",
    name: "codex",
    quickIdToken: "7"
  };
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: "discord",
    channel: "discord",
    capabilities: ["send_message", "edit_message", "thread_channels"]
  });
  const adapter = createDiscordAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: `m-${sends.length}` };
      },
      async editMessage(payload) {
        edits.push(payload);
        return { messageId: payload.messageId || "m-edit" };
      }
    },
    nowFn: (() => {
      let now = 300;
      return () => ++now;
    })(),
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });

  const target = {
    adapterId: "discord",
    channelId: "ops-room",
    chatId: "ops-room",
    threadId: 77,
    messageThreadId: 77,
    webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
    stateKey: "ops-room:77"
  };
  const firstIntent = createMessageIntent({
    sessionId: session.id,
    intentKind: "turn-primary-reply",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: "Ok, delivered",
    comparableText: "ok delivered",
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      deliveryBlockKey: "reply-1"
    },
    metadata: {
      aggregationReason: "explicit_reply"
    }
  });
  const secondIntent = createMessageIntent({
    sessionId: session.id,
    intentKind: "turn-primary-reply",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: "Ok, delivered with more detail",
    comparableText: "ok delivered with more detail",
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      deliveryBlockKey: "reply-1"
    },
    metadata: {
      aggregationReason: "explicit_reply"
    }
  });

  const firstResult = await adapter.handleMessageIntent({
    target,
    session,
    profile: "coding-agent",
    trace: { traceId: "discord-intent-1" },
    intent: firstIntent
  });
  const secondResult = await adapter.handleMessageIntent({
    target,
    session,
    profile: "coding-agent",
    trace: { traceId: "discord-intent-2" },
    intent: secondIntent
  });

  assert.equal(firstResult.delivered, true);
  assert.equal(firstResult.action, "new");
  assert.equal(secondResult.delivered, true);
  assert.equal(secondResult.action, "update");
  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(sends[0].text, /\[7\] codex: Ok, delivered/u);
  assert.match(edits[0].text, /Ok, delivered with more detail/u);
  const status = adapter.getStatus();
  assert.equal(status.adapter, "discord");
  assert.equal(status.configuredTargets, 1);
  assert.equal(status.deliveredTotal, 2);
  assert.equal(status.updatedTotal, 1);
});

test("discord adapter suppresses explicit message intents while outbound delivery is disabled", async () => {
  const sends = [];
  const adapter = createDiscordAdapter({
    configured: true,
    deliveryEnabled: false,
    configuredTargets: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: "m-allowlist" };
      },
      async editMessage(payload) {
        sends.push(payload);
        return { messageId: payload.messageId || "m-allowlist" };
      }
    },
    nowFn: () => 400
  });
  const session = { id: "session-allowlist", name: "codex", quickIdToken: "7" };
  const deliveryAdapter = createDeliveryAdapterDescriptor({
    adapterId: "discord",
    channel: "discord",
    capabilities: ["send_message"]
  });
  const intent = createMessageIntent({
    sessionId: session.id,
    intentKind: "turn-primary-reply",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: "Ok, Discord signal delivered",
    comparableText: "ok discord signal delivered",
    deliveryAdapters: [deliveryAdapter],
    routing: {
      threadKey: "status",
      deliveryBlockKey: "status-block"
    },
    metadata: {
      deliverySignal: "status-update"
    }
  });

  const result = await adapter.handleMessageIntent({
    target: {
      adapterId: "discord",
      channelId: "ops-room",
      chatId: "ops-room",
      threadId: 77,
      messageThreadId: 77,
      webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
      stateKey: "ops-room:77"
    },
    session,
    profile: "coding-agent",
    trace: { traceId: "discord-signal" },
    intent
  });

  assert.equal(result.delivered, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "delivery_disabled");
  assert.equal(sends.length, 0);
});

test("discord transport rejects invalid webhook URLs and surfaces API error payloads", async () => {
  const transport = createDiscordTransport({
    apiBaseUrl: "https://discord.example.test/api/v10",
    fetchImpl: async () => {
      throw new Error("fetch should not be called for invalid webhook URLs");
    }
  });

  await assert.rejects(
    transport.sendMessage({
      webhookUrl: "ftp://discord.example.test/webhooks/123/token",
      text: "hello"
    }),
    /valid webhookUrl/
  );

  const failingTransport = createDiscordTransport({
    apiBaseUrl: "https://discord.example.test/api/v10",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() {
        return { message: "rate limited" };
      }
    })
  });

  await assert.rejects(
    failingTransport.sendMessage({
      webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
      text: "hello"
    }),
    /rate limited/
  );
});

test("discord adapter validates targets, falls back from edit to send, and records alert/failure metrics", async () => {
  const sends = [];
  const edits = [];
  let editFailures = 0;
  const adapter = createDiscordAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        if (payload.text.includes("delivery failure")) {
          throw new Error("discord send failed");
        }
        return { messageId: `m-${sends.length}` };
      },
      async editMessage(payload) {
        edits.push(payload);
        editFailures += 1;
        throw new Error("discord edit failed");
      }
    },
    nowFn: (() => {
      let now = 800;
      return () => ++now;
    })(),
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });

  const invalidTargetResult = await adapter.ensureTarget({
    channelId: "ops-room",
    webhookUrl: "notaurl"
  });
  assert.equal(invalidTargetResult.ok, false);
  assert.equal(invalidTargetResult.reason, "invalid_target");

  const target = {
    channelId: "ops-room",
    chatId: "ops-room",
    threadId: 77,
    messageThreadId: 77,
    webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
    stateKey: "ops-room:77"
  };
  const validTargetResult = await adapter.ensureTarget(target);
  assert.equal(validTargetResult.ok, true);

  const first = await adapter.handleEvent({
    target,
    threadKey: "status",
    text: "first status",
    occurredAt: 1,
    decision: {
      action: "new",
      messageKey: "status",
      reason: "status_new"
    }
  });
  const second = await adapter.handleEvent({
    target,
    threadKey: "status",
    text: "updated status",
    occurredAt: 2,
    decision: {
      action: "update",
      messageKey: "status",
      reason: "status_update"
    }
  });
  const alert = await adapter.handleEvent({
    target,
    threadKey: "attention",
    text: "attention required",
    occurredAt: 3,
    decision: {
      action: "alert",
      messageKey: "attention",
      reason: "attention_new"
    }
  });
  const failed = await adapter.handleEvent({
    target,
    threadKey: "status",
    text: "delivery failure",
    occurredAt: 4,
    decision: {
      action: "new",
      messageKey: "status",
      reason: "status_new"
    }
  });

  assert.equal(first.delivered, true);
  assert.equal(second.delivered, true);
  assert.equal(alert.delivered, true);
  assert.equal(failed.delivered, false);
  assert.equal(editFailures, 1);
  assert.equal(sends.length, 4);
  assert.equal(edits.length, 1);
  const status = adapter.getStatus();
  assert.equal(status.failedTotal, 1);
  assert.equal(status.alertedTotal, 1);
  assert.match(status.lastError, /discord send failed/);
  assert.equal(status.targetTrace.capturedTotal, 2);
  assert.equal(status.targetTrace.recent[0].outcome, "target_invalid");
  assert.equal(status.targetTrace.recent[1].outcome, "target_validated");
});

test("discord transport validates fetch prerequisites, normalizes webhook variants, and falls back on status-only API errors", async () => {
  assert.throws(() => createDiscordTransport({ fetchImpl: null }), /requires a fetch implementation/);

  const requests = [];
  const transport = createDiscordTransport({
    apiBaseUrl: "https://discord.example.test/custom",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {};
        }
      };
    }
  });

  const sent = await transport.sendMessage({
    webhookUrl: "https://discord.example.test/api/webhooks/123/token",
    threadId: 44,
    text: "hello"
  });

  assert.equal(sent.messageId, "");
  assert.equal(
    requests[0].url,
    "https://discord.example.test/api/webhooks/123/token?wait=true&thread_id=44"
  );

  await assert.rejects(
    () =>
      transport.editMessage({
        webhookUrl: "https://discord.example.test/api/webhooks/123/token",
        text: "updated"
      }),
    /valid webhookUrl and messageId/
  );

  const failingTransport = createDiscordTransport({
    apiBaseUrl: "https://discord.example.test/api/v10",
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      async json() {
        throw new Error("invalid json");
      }
    })
  });

  await assert.rejects(
    () =>
      failingTransport.sendMessage({
        webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
        text: "hello"
      }),
    /status 502/
  );
});

test("discord adapter handles disabled, invalid-intent, suppressed, empty, and unmapped branches deterministically", async () => {
  const disabled = createDiscordAdapter();
  const disabledTarget = await disabled.ensureTarget({ channelId: "ops-room", webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token" });
  assert.equal(disabledTarget.ok, false);
  assert.equal(disabledTarget.reason, "disabled");

  const adapter = createDiscordAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 0,
    transport: {
      async sendMessage() {
        throw new Error("send should not run");
      },
      async editMessage() {
        throw new Error("edit should not run");
      }
    }
  });

  const validTarget = {
    channelId: "ops-room",
    chatId: "ops-room",
    threadId: 77,
    messageThreadId: 77,
    webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token"
  };

  const invalidIntent = await adapter.handleMessageIntent({ target: validTarget, intent: null });
  const suppressed = await adapter.handleEvent({
    target: validTarget,
    text: "ignored",
    decision: { action: "suppress", messageKey: "status", reason: "duplicate_signature" }
  });
  const empty = await adapter.handleEvent({
    target: validTarget,
    text: "   ",
    decision: { action: "new", messageKey: "status", reason: "status_new" }
  });
  const unmapped = await adapter.handleEvent({
    target: { channelId: "ops-room" },
    text: "hello",
    decision: { action: "new", messageKey: "status", reason: "status_new" }
  });

  assert.equal(invalidIntent.reason, "invalid_intent");
  assert.equal(suppressed.reason, "suppressed");
  assert.equal(empty.reason, "empty");
  assert.equal(unmapped.reason, "unmapped");
  assert.equal(
    adapter.renderMetricLines().includes('ptydeck_messaging_adapter_configured_targets{adapter="discord"} 0'),
    true
  );
});
