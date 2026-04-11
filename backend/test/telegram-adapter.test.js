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

test("telegram transport sends edits polls and answers through the Telegram Bot API shape", async () => {
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
  const updates = await transport.getUpdates({ offset: 8, timeoutSeconds: 5, limit: 50, allowedUpdates: ["message"] });
  const answered = await transport.answerCallbackQuery({ callbackQueryId: "cb-1", text: "ok", showAlert: true });

  assert.equal(sent.messageId, 1);
  assert.equal(edited.messageId, 2);
  assert.deepEqual(updates, [{ update_id: 7 }]);
  assert.equal(answered, true);
  assert.equal(requests[0].url, "https://telegram.example.test/botbot-token/sendMessage");
  assert.equal(requests[1].url, "https://telegram.example.test/botbot-token/editMessageText");
  assert.equal(requests[2].url, "https://telegram.example.test/botbot-token/getUpdates");
  assert.equal(requests[3].url, "https://telegram.example.test/botbot-token/answerCallbackQuery");
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
    offset: 8,
    timeout: 5,
    limit: 50,
    allowed_updates: ["message"]
  });
  assert.deepEqual(JSON.parse(requests[3].options.body), {
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

test("telegram adapter updates an existing thread and falls back to a new message when edit fails", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    enabled: true,
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
    enabled: true,
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

test("telegram adapter records delivery failures without throwing them through the runtime", async () => {
  const adapter = createTelegramAdapter({
    enabled: true,
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
    enabled: true,
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
    enabled: true,
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

test("telegram adapter polls bounded inbound commands and records metrics", async () => {
  const sends = [];
  const callbackAnswers = [];
  const updateQueue = [];
  const adapter = createTelegramAdapter({
    enabled: true,
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
