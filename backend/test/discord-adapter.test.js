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
