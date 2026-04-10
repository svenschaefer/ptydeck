import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramAdapter, createTelegramTransport } from "../src/telegram-adapter.js";

test("telegram transport sends and edits messages through the Telegram Bot API shape", async () => {
  const requests = [];
  const transport = createTelegramTransport({
    botToken: "bot-token",
    apiBaseUrl: "https://telegram.example.test",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
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

  assert.equal(sent.messageId, 1);
  assert.equal(edited.messageId, 2);
  assert.equal(requests[0].url, "https://telegram.example.test/botbot-token/sendMessage");
  assert.equal(requests[1].url, "https://telegram.example.test/botbot-token/editMessageText");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    chat_id: "1001",
    text: "hello"
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    chat_id: "1001",
    message_id: 41,
    text: "updated"
  });
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
