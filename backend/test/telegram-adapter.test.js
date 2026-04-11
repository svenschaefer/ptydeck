import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramAdapter, createTelegramTransport, parseTelegramInboundCommand } from "../src/telegram-adapter.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 1500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(10);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

test("telegram transport sends edits forum-topic calls polls, gets chats, and answers through the Telegram Bot API shape", async () => {
  const requests = [];
  const transport = createTelegramTransport({
    botToken: "bot-token",
    apiBaseUrl: "https://telegram.example.test",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          if (url.endsWith("/getUpdates")) {
            return {
              ok: true,
              result: [{ update_id: 7 }]
            };
          }
          if (url.endsWith("/answerCallbackQuery")) {
            return {
              ok: true,
              result: true
            };
          }
          if (url.endsWith("/editForumTopic")) {
            return {
              ok: true,
              result: true
            };
          }
          if (url.endsWith("/getChat")) {
            return {
              ok: true,
              result: {
                id: -1001,
                title: "ptydeck",
                type: "supergroup",
                is_forum: true
              }
            };
          }
          if (url.endsWith("/createForumTopic")) {
            return {
              ok: true,
              result: {
                message_thread_id: requests.length,
                name: "Ops + codex"
              }
            };
          }
          return {
            ok: true,
            result: {
              message_id: requests.length
            }
          };
        }
      };
    }
  });

  const sent = await transport.sendMessage({ chatId: "1001", text: "hello" });
  const edited = await transport.editMessage({ chatId: "1001", messageId: 41, text: "updated" });
  const topic = await transport.createForumTopic({ chatId: "-1001", name: "Ops + codex" });
  const editedTopic = await transport.editForumTopic({ chatId: "-1001", messageThreadId: 55, name: "Ops + codex renamed" });
  const chat = await transport.getChat({ chatId: "-1001" });
  const updates = await transport.getUpdates({ offset: 8, timeoutSeconds: 5, limit: 50, allowedUpdates: ["message"] });
  const answered = await transport.answerCallbackQuery({ callbackQueryId: "cb-1", text: "ok", showAlert: true });

  assert.equal(sent.messageId, 1);
  assert.equal(edited.messageId, 2);
  assert.equal(topic.messageThreadId, 3);
  assert.equal(editedTopic.ok, true);
  assert.equal(chat.type, "supergroup");
  assert.equal(chat.is_forum, true);
  assert.deepEqual(updates, [{ update_id: 7 }]);
  assert.equal(answered, true);
  assert.equal(requests[0].url, "https://telegram.example.test/botbot-token/sendMessage");
  assert.equal(requests[1].url, "https://telegram.example.test/botbot-token/editMessageText");
  assert.equal(requests[2].url, "https://telegram.example.test/botbot-token/createForumTopic");
  assert.equal(requests[3].url, "https://telegram.example.test/botbot-token/editForumTopic");
  assert.equal(requests[4].url, "https://telegram.example.test/botbot-token/getChat");
  assert.equal(requests[5].url, "https://telegram.example.test/botbot-token/getUpdates");
  assert.equal(requests[6].url, "https://telegram.example.test/botbot-token/answerCallbackQuery");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    chat_id: "1001",
    text: "hello"
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    chat_id: "1001",
    message_id: 41,
    text: "updated"
  });
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    chat_id: "-1001",
    name: "Ops + codex"
  });
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    chat_id: "-1001",
    message_thread_id: 55,
    name: "Ops + codex renamed"
  });
  assert.deepEqual(JSON.parse(requests[4].options.body), {
    chat_id: "-1001"
  });
  assert.deepEqual(JSON.parse(requests[5].options.body), {
    offset: 8,
    timeout: 5,
    limit: 50,
    allowed_updates: ["message"]
  });
  assert.deepEqual(JSON.parse(requests[6].options.body), {
    callback_query_id: "cb-1",
    text: "ok",
    show_alert: true
  });
});

test("telegram inbound command parsing stays deterministic for buttons and text fallbacks", () => {
  assert.deepEqual(parseTelegramInboundCommand({ callbackData: "ptydeck:status" }), { action: "status" });
  assert.deepEqual(parseTelegramInboundCommand({ callbackData: "ptydeck:replay:sp:2" }), { action: "replay", selector: "sp:2" });
  assert.deepEqual(parseTelegramInboundCommand({ text: "/status" }), { action: "status" });
  assert.deepEqual(parseTelegramInboundCommand({ text: "/retry@ptydeck_bot" }), { action: "retry" });
  assert.deepEqual(parseTelegramInboundCommand({ text: "/replay l:40" }), { action: "replay", selector: "l:40" });
  assert.equal(parseTelegramInboundCommand({ text: "/replay l:40 extra" }), null);
  assert.equal(parseTelegramInboundCommand({ text: "status" }), null);
  assert.equal(parseTelegramInboundCommand({ callbackData: "other:status" }), null);
});

test("telegram adapter validates transport requirements and inbound start states deterministically", async () => {
  assert.throws(
    () => createTelegramAdapter({ configured: true, transport: { sendMessage: async () => ({ messageId: 1 }) } }),
    /sendMessage\/editMessage transport methods/
  );
  assert.throws(
    () =>
      createTelegramAdapter({
        configured: true,
        inboundEnabled: true,
        transport: {
          sendMessage: async () => ({ messageId: 1 }),
          editMessage: async ({ messageId }) => ({ messageId })
        }
      }),
    /getUpdates\/answerCallbackQuery transport methods/
  );

  const disabled = createTelegramAdapter({ enabled: false });
  assert.deepEqual(await disabled.startInbound({ onCommand: async () => ({ ok: true }) }), {
    started: false,
    reason: "disabled"
  });

  const outboundOnly = createTelegramAdapter({
    configured: true,
    transport: {
      async sendMessage() {
        return { messageId: 1 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 1 };
      }
    }
  });
  assert.deepEqual(await outboundOnly.startInbound({ onCommand: async () => ({ ok: true }) }), {
    started: false,
    reason: "inbound_disabled"
  });

  const inbound = createTelegramAdapter({
    configured: true,
    inboundEnabled: true,
    transport: {
      async sendMessage() {
        return { messageId: 1 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 1 };
      },
      async getUpdates() {
        await sleep(5);
        return [];
      },
      async answerCallbackQuery() {
        return true;
      }
    }
  });

  await assert.rejects(() => inbound.startInbound({}), /requires an onCommand handler/);
  assert.deepEqual(await inbound.startInbound({ onCommand: async () => ({ ok: true }) }), { started: true });
  assert.deepEqual(await inbound.startInbound({ onCommand: async () => ({ ok: true }) }), {
    started: true,
    reason: "already_started"
  });
  await inbound.stop();
});

test("telegram adapter updates an existing thread and falls back to a new message when edit fails", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: () => 123,
    transport: {
      async sendMessage(payload) {
        calls.push({ method: "send", payload });
        return { messageId: calls.length + 10 };
      },
      async editMessage(payload) {
        calls.push({ method: "edit", payload });
        throw new Error("message not found");
      }
    }
  });

  const created = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created"
  });
  const updated = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "update", messageKey: "status" },
    threadKey: "status",
    text: "session updated"
  });

  assert.equal(created.delivered, true);
  assert.equal(updated.delivered, true);
  assert.deepEqual(calls.map((entry) => entry.method), ["send", "edit", "send"]);
  assert.equal(adapter.getStatus().failedTotal, 0);
  assert.equal(adapter.getStatus().updatedTotal, 1);
});

test("telegram adapter can update an existing attention thread after an initial alert send", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: () => 321,
    transport: {
      async sendMessage(payload) {
        calls.push({ method: "send", payload });
        return { messageId: 71 };
      },
      async editMessage(payload) {
        calls.push({ method: "edit", payload });
        return { messageId: payload.messageId };
      }
    }
  });

  const alerted = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "alert", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required"
  });
  const updated = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "update", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required with stack trace"
  });

  assert.equal(alerted.delivered, true);
  assert.equal(updated.delivered, true);
  assert.deepEqual(calls.map((entry) => entry.method), ["send", "edit"]);
  assert.equal(calls[1].payload.messageId, 71);
  assert.equal(adapter.getStatus().updatedTotal, 1);
  assert.equal(adapter.getStatus().alertedTotal, 1);
});

test("telegram adapter preserves alert thread continuity across edit fallback sends", async () => {
  const calls = [];
  let fallbackTriggered = false;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 500;
      return () => ++current;
    })(),
    transport: {
      async sendMessage(payload) {
        calls.push({ method: "send", payload });
        return { messageId: calls.length === 1 ? 71 : 72 };
      },
      async editMessage(payload) {
        calls.push({ method: "edit", payload });
        if (!fallbackTriggered) {
          fallbackTriggered = true;
          throw new Error("message not found");
        }
        return { messageId: payload.messageId };
      }
    }
  });

  await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "alert", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required"
  });
  await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "update", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required with context"
  });
  await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "update", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required with stack trace"
  });

  assert.deepEqual(calls.map((entry) => entry.method), ["send", "edit", "send", "edit"]);
  assert.equal(calls[1].payload.messageId, 71);
  assert.equal(calls[3].payload.messageId, 72);
  assert.equal(adapter.getStatus().updatedTotal, 2);
});

test("telegram adapter provisions and reuses forum topics per terminal thread", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 700;
      return () => ++current;
    })(),
    transport: {
      async getChat() {
        calls.push({ method: "getChat" });
        return { id: -1001, type: "supergroup", is_forum: true, title: "ptydeck" };
      },
      async createForumTopic(payload) {
        calls.push({ method: "createTopic", payload });
        return { messageThreadId: 44, name: payload.name };
      },
      async editForumTopic(payload) {
        calls.push({ method: "editTopic", payload });
        return { ok: true };
      },
      async sendMessage(payload) {
        calls.push({ method: "send", payload });
        return { messageId: 91 };
      },
      async editMessage(payload) {
        calls.push({ method: "edit", payload });
        return { messageId: payload.messageId || 91 };
      }
    }
  });

  const first = await adapter.handleEvent({
    target: {
      chatId: "-1001",
      sessionId: "s1",
      topicMode: "deck-session",
      topicName: "Operations + codex",
      stateKey: "-1001:s1",
      topicStateKey: "-1001:s1"
    },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created"
  });
  const second = await adapter.handleEvent({
    target: {
      chatId: "-1001",
      sessionId: "s1",
      topicMode: "deck-session",
      topicName: "Operations Renamed + codex",
      stateKey: "-1001:s1",
      topicStateKey: "-1001:s1"
    },
    decision: { action: "update", messageKey: "status" },
    threadKey: "status",
    text: "session updated"
  });

  assert.equal(first.delivered, true);
  assert.equal(second.delivered, true);
  assert.deepEqual(calls.map((entry) => entry.method), ["getChat", "createTopic", "send", "editTopic", "edit"]);
  assert.equal(calls[2].payload.messageThreadId, 44);
  assert.equal(calls[4].payload.messageThreadId, 44);
  assert.equal(first.topicBinding.messageThreadId, 44);
  assert.equal(first.topicBinding.topicName, "Operations + codex");
  assert.equal(second.topicBinding.topicName, "Operations Renamed + codex");
  assert.equal(adapter.getStatus().provisionedTopicTotal, 1);
  assert.equal(adapter.getStatus().renamedTopicTotal, 1);
  assert.equal(adapter.getStatus().activeTopicCount, 1);
  assert.equal(adapter.getStatus().validatedForumTargetTotal, 1);
  assert.deepEqual(
    adapter.getStatus().targetTrace.recent.map((entry) => entry.phase),
    ["target_validated", "topic_provisioned", "target_validated_cached", "topic_renamed"]
  );
  assert.equal(adapter.getStatus().targetTrace.recent[1].messageThreadId, 44);
  assert.equal(adapter.getStatus().targetTrace.recent[1].topicName, "Operations + codex");
});

test("telegram adapter can provision deck-session topics while delivery is disabled", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: false,
    configuredTargets: 1,
    nowFn: () => 880,
    transport: {
      async getChat() {
        calls.push({ method: "getChat" });
        return { id: -1001, type: "supergroup", is_forum: true };
      },
      async createForumTopic(payload) {
        calls.push({ method: "createTopic", payload });
        return { messageThreadId: 66, name: payload.name };
      },
      async editForumTopic() {
        calls.push({ method: "editTopic" });
        return { ok: true };
      },
      async sendMessage(payload) {
        calls.push({ method: "send", payload });
        return { messageId: 77 };
      },
      async editMessage(payload) {
        calls.push({ method: "edit", payload });
        return { messageId: payload.messageId || 77 };
      }
    }
  });

  const ensured = await adapter.ensureTarget({
    chatId: "-1001",
    sessionId: "s1",
    topicMode: "deck-session",
    topicName: "Operations + codex",
    stateKey: "-1001:s1",
    topicStateKey: "-1001:s1"
  });
  const event = await adapter.handleEvent({
    target: {
      chatId: "-1001",
      sessionId: "s1",
      topicMode: "deck-session",
      topicName: "Operations + codex",
      stateKey: "-1001:s1",
      topicStateKey: "-1001:s1"
    },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created"
  });

  assert.equal(ensured.ok, true);
  assert.equal(ensured.topicBinding.messageThreadId, 66);
  assert.equal(event.delivered, false);
  assert.equal(event.reason, "delivery_disabled");
  assert.equal(event.target.messageThreadId, 66);
  assert.deepEqual(calls.map((entry) => entry.method), ["getChat", "createTopic"]);
  assert.equal(adapter.getStatus().deliveryEnabled, false);
  assert.equal(adapter.getStatus().provisionedTopicTotal, 1);
  assert.deepEqual(
    adapter.getStatus().targetTrace.recent.map((entry) => entry.phase),
    ["target_validated", "topic_provisioned", "target_validated_cached", "topic_reused"]
  );
  assert.equal(adapter.getStatus().targetTrace.recent[3].messageThreadId, 66);
});

test("telegram adapter rejects channel targets for deck-session provisioning with a clear error", async () => {
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: false,
    configuredTargets: 1,
    nowFn: () => 901,
    transport: {
      async getChat() {
        return { id: -1001, type: "channel", title: "ptydeck" };
      },
      async createForumTopic() {
        throw new Error("should not create topic for channel");
      },
      async editForumTopic() {
        throw new Error("should not edit topic for channel");
      },
      async sendMessage() {
        return { messageId: 1 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 1 };
      }
    }
  });

  const result = await adapter.ensureTarget({
    chatId: "-1001",
    sessionId: "s1",
    topicMode: "deck-session",
    topicName: "Operations + codex",
    stateKey: "-1001:s1",
    topicStateKey: "-1001:s1"
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "topic_provision_failed");
  assert.match(result.error, /forum-enabled supergroup/);
  assert.match(adapter.getStatus().lastTargetValidationError, /forum-enabled supergroup/);
  assert.deepEqual(
    adapter.getStatus().targetTrace.recent.map((entry) => entry.phase),
    ["target_validation_failed", "topic_provision_failed"]
  );
  assert.equal(adapter.getStatus().targetTrace.recent[0].chatType, "channel");
});

test("telegram adapter records delivery failures without throwing them through the runtime", async () => {
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: () => 55,
    transport: {
      async sendMessage() {
        throw new Error("telegram offline");
      },
      async editMessage() {
        throw new Error("telegram offline");
      }
    }
  });

  const result = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "alert", messageKey: "attention" },
    threadKey: "attention",
    text: "attention required"
  });

  assert.equal(result.delivered, false);
  assert.equal(result.error, "telegram offline");
  assert.equal(adapter.getStatus().failedTotal, 1);
  assert.equal(adapter.getStatus().lastErrorAt, 55);
});

test("telegram adapter reports structured rate-limit metadata on delivery failures", async () => {
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: () => 77,
    transport: {
      async sendMessage() {
        throw new Error("Too Many Requests: retry after 8");
      },
      async editMessage() {
        throw new Error("Too Many Requests: retry after 8");
      }
    }
  });

  const result = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created"
  });

  assert.equal(result.delivered, false);
  assert.equal(result.rateLimited, true);
  assert.equal(result.retryAfterSeconds, 8);
  assert.equal(result.recommendedBackoffMs, 8000);
  assert.equal(adapter.getStatus().lastRetryAfterSeconds, 8);
  assert.equal(adapter.getStatus().lastRecommendedBackoffMs, 8000);
});

test("telegram adapter honors Telegram retry-after backoff before attempting another outbound send", async () => {
  let now = 100;
  let sendCalls = 0;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    configuredTargets: 1,
    nowFn: () => now,
    transport: {
      async sendMessage() {
        sendCalls += 1;
        if (sendCalls === 1) {
          throw new Error("Too Many Requests: retry after 8");
        }
        return { messageId: 91 };
      },
      async editMessage() {
        throw new Error("edit should not be used in this test");
      }
    }
  });

  const first = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created"
  });

  now = 200;
  const second = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created again"
  });

  now = 8_200;
  const third = await adapter.handleEvent({
    target: { chatId: "1001" },
    decision: { action: "new", messageKey: "status" },
    threadKey: "status",
    text: "session created after backoff"
  });

  assert.equal(first.delivered, false);
  assert.equal(first.rateLimited, true);
  assert.equal(second.delivered, false);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "backoff_active");
  assert.equal(second.rateLimited, true);
  assert.equal(sendCalls, 2);
  assert.equal(third.delivered, true);
  assert.equal(adapter.getStatus().backoffActive, false);
  assert.equal(adapter.getStatus().backoffRemainingMs, 0);
});

test("telegram adapter drains multi-batch backlog before polling live inbound commands", async () => {
  const sends = [];
  const getUpdatesCalls = [];
  let livePollReleased = false;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    inboundEnabled: true,
    configuredTargets: 2,
    nowFn: (() => {
      let current = 900;
      return () => ++current;
    })(),
    pollTimeoutSeconds: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: sends.length + 80 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 80 };
      },
      async getUpdates({ timeoutSeconds }) {
        getUpdatesCalls.push(timeoutSeconds);
        if (timeoutSeconds === 0 && getUpdatesCalls.filter((entry) => entry === 0).length === 1) {
          return Array.from({ length: 100 }, (_, index) => ({ update_id: index + 1 }));
        }
        if (timeoutSeconds === 0 && getUpdatesCalls.filter((entry) => entry === 0).length === 2) {
          return [
            { update_id: 101 },
            { update_id: 102 },
            { update_id: 103 }
          ];
        }
        if (!livePollReleased) {
          livePollReleased = true;
          return [
            { update_id: 104, message: { chat: { id: 1001 }, text: "/status" } },
            { update_id: 105, message: { chat: { id: 1001 }, text: "ignored free text" } }
          ];
        }
        await sleep(5);
        return [];
      },
      async answerCallbackQuery() {
        return true;
      }
    }
  });

  await adapter.startInbound({
    async onCommand() {
      return { ok: true, text: "Status for [4] backlog-run" };
    }
  });

  try {
    await waitFor(() => sends.length >= 1, 1500);
    assert.match(sends[0].text, /Status for \[4\] backlog-run/);
    assert.equal(adapter.getStatus().inboundBacklogSkippedTotal, 103);
    assert.deepEqual(getUpdatesCalls.slice(0, 3), [0, 0, 1]);
  } finally {
    await adapter.stop();
  }
});

test("telegram adapter records polling failures and recovers on a later inbound command", async () => {
  const sends = [];
  let pollCalls = 0;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    inboundEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 1_200;
      return () => ++current;
    })(),
    pollTimeoutSeconds: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: sends.length + 120 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 120 };
      },
      async getUpdates({ timeoutSeconds }) {
        pollCalls += 1;
        if (pollCalls === 1) {
          throw new Error("temporary telegram outage");
        }
        if (timeoutSeconds === 0 && pollCalls === 2) {
          return [];
        }
        if (pollCalls === 3) {
          return [{ update_id: 1, message: { chat: { id: 1001 }, text: "/status" } }];
        }
        await sleep(5);
        return [];
      },
      async answerCallbackQuery() {
        return true;
      }
    }
  });

  await adapter.startInbound({
    async onCommand() {
      return { ok: true, text: "Status for [4] recovered-run" };
    }
  });

  try {
    await waitFor(() => sends.length >= 1, 1500);
    assert.match(sends[0].text, /recovered-run/);
    assert.equal(adapter.getStatus().inboundFailedTotal >= 1, true);
    assert.match(adapter.getStatus().lastInboundError, /temporary telegram outage/);
    assert.equal(adapter.getStatus().inboundHandledTotal >= 1, true);
  } finally {
    await adapter.stop();
  }
});

test("telegram adapter swallows callback acknowledgement failures after command failures", async () => {
  const sends = [];
  const callbackAnswers = [];
  let liveServed = false;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    inboundEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 1_500;
      return () => ++current;
    })(),
    pollTimeoutSeconds: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: sends.length + 150 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 150 };
      },
      async getUpdates({ timeoutSeconds }) {
        if (timeoutSeconds === 0) {
          return [];
        }
        if (!liveServed) {
          liveServed = true;
          return [
            {
              update_id: 1,
              callback_query: {
                id: "cb-err",
                data: "ptydeck:status",
                message: { chat: { id: 1001 } }
              }
            }
          ];
        }
        await sleep(5);
        return [];
      },
      async answerCallbackQuery(payload) {
        callbackAnswers.push(payload);
        throw new Error("callback transport failed");
      }
    }
  });

  await adapter.startInbound({
    async onCommand() {
      throw new Error("command failed");
    }
  });

  try {
    await waitFor(() => adapter.getStatus().inboundFailedTotal >= 1, 1500);
    assert.equal(sends.length, 0);
    assert.equal(callbackAnswers.length, 1);
    assert.match(callbackAnswers[0].text, /command failed/i);
    assert.match(adapter.getStatus().lastInboundError, /command failed/);
  } finally {
    await adapter.stop();
  }
});

test("telegram adapter polls bounded inbound commands and records metrics", async () => {
  const sends = [];
  const callbackAnswers = [];
  const updateQueue = [];
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: true,
    inboundEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 400;
      return () => ++current;
    })(),
    pollTimeoutSeconds: 1,
    transport: {
      async sendMessage(payload) {
        sends.push(payload);
        return { messageId: sends.length + 40 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 40 };
      },
      async getUpdates() {
        if (updateQueue.length > 0) {
          return updateQueue.splice(0, updateQueue.length);
        }
        await sleep(5);
        return [];
      },
      async answerCallbackQuery(payload) {
        callbackAnswers.push(payload);
        return true;
      }
    }
  });

  await adapter.startInbound({
    async onCommand(command) {
      if (command.source === "callback") {
        return { ok: true, callbackText: "Replay ready.", text: "Replay for [4] build-run" };
      }
      return { ok: true, text: "Status for [4] build-run" };
    }
  });

  try {
    updateQueue.push(
      { update_id: 1, message: { chat: { id: 1001 }, text: "/status" } },
      {
        update_id: 2,
        callback_query: {
          id: "cb-1",
          data: "ptydeck:replay:l:20",
          message: { chat: { id: 1001 } }
        }
      }
    );

    await waitFor(() => sends.length >= 2 && callbackAnswers.length >= 1, 1500);

    assert.match(sends[0].text, /Status for \[4\] build-run/);
    assert.match(sends[1].text, /Replay for \[4\] build-run/);
    assert.equal(callbackAnswers[0].callbackQueryId, "cb-1");
    assert.match(callbackAnswers[0].text, /Replay ready/);
    assert.equal(adapter.getStatus().pollingActive, true);
    assert.equal(adapter.getStatus().inboundHandledTotal >= 2, true);
  } finally {
    await adapter.stop();
  }

  assert.equal(adapter.getStatus().pollingActive, false);
});

test("telegram adapter records unsupported inbound group messages with chat metadata for discovery", async () => {
  let commandCalls = 0;
  let served = false;
  const adapter = createTelegramAdapter({
    configured: true,
    deliveryEnabled: false,
    inboundEnabled: true,
    configuredTargets: 1,
    nowFn: (() => {
      let current = 2_000;
      return () => ++current;
    })(),
    pollTimeoutSeconds: 1,
    transport: {
      async sendMessage() {
        return { messageId: 1 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 1 };
      },
      async getUpdates({ timeoutSeconds }) {
        if (timeoutSeconds === 0) {
          return [];
        }
        if (!served) {
          served = true;
          return [
            {
              update_id: 1,
              message: {
                chat: {
                  id: -100200300,
                  type: "supergroup",
                  title: "ptydeck",
                  username: "ptydeck_group",
                  is_forum: true
                },
                message_thread_id: 77,
                is_topic_message: true,
                from: {
                  id: 42,
                  username: "sven"
                },
                text: "@ptydeck_bot ping"
              }
            }
          ];
        }
        await sleep(5);
        return [];
      },
      async answerCallbackQuery() {
        return true;
      }
    }
  });

  await adapter.startInbound({
    async onCommand() {
      commandCalls += 1;
      return { ok: true, text: "should not run" };
    }
  });

  try {
    await waitFor(() => adapter.getStatus().inboundTrace.capturedTotal >= 1, 1500);
    const status = adapter.getStatus();
    const last = status.inboundTrace.recent.at(-1);
    assert.equal(commandCalls, 0);
    assert.equal(status.inboundObservedTotal, 1);
    assert.equal(status.inboundHandledTotal, 0);
    assert.equal(last.phase, "ignored");
    assert.equal(last.reason, "unsupported_text");
    assert.equal(last.chatId, "-100200300");
    assert.equal(last.messageThreadId, 77);
    assert.equal(last.chatType, "supergroup");
    assert.equal(last.chatTitle, "ptydeck");
    assert.equal(last.chatUsername, "ptydeck_group");
    assert.equal(last.chatIsForum, true);
    assert.equal(last.isTopicMessage, true);
    assert.equal(last.fromUserId, 42);
    assert.equal(last.fromUsername, "sven");
    assert.equal(last.preview, "@ptydeck_bot ping");
    assert.equal(last.commandMatched, false);
  } finally {
    await adapter.stop();
  }
});
