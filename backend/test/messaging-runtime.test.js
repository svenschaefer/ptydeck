import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMessagingMessagePolicy,
  createMessagingRuntime,
  normalizeMessagingInboundInputPayload,
  normalizeMessagingInboundReplaySelector,
  normalizeMessagingTopicBindings,
  normalizeMessagingTargets,
  resolveMessagingTriggerProfile
} from "../src/messaging-runtime.js";

function createSession(overrides = {}) {
  return {
    id: "s1",
    name: "main-shell",
    quickIdToken: "4",
    shell: "bash",
    startCommand: "",
    state: "running",
    kind: "local",
    deckId: "ops",
    controlState: {
      currentController: null,
      attachedClients: [],
      readOnly: false
    },
    ...overrides
  };
}

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

function createTelegramTransportStub() {
  const sentMessages = [];
  const callbackAnswers = [];
  const publishedCommands = [];
  const createdTopics = [];
  const updateQueue = [];
  return {
    sentMessages,
    callbackAnswers,
    publishedCommands,
    createdTopics,
    updateQueue,
    transport: {
      async sendMessage(payload) {
        sentMessages.push(payload);
        return { messageId: sentMessages.length + 100 };
      },
      async editMessage(payload) {
        return { messageId: payload.messageId || 100 };
      },
      async answerCallbackQuery(payload) {
        callbackAnswers.push(payload);
        return true;
      },
      async getUpdates() {
        if (updateQueue.length > 0) {
          return updateQueue.splice(0, updateQueue.length);
        }
        await sleep(10);
        return [];
      },
      async setMyCommands(payload) {
        publishedCommands.push(payload);
        return true;
      },
      async getChat() {
        return { id: -100200300, type: "supergroup", is_forum: true, title: "ptydeck" };
      },
      async createForumTopic(payload) {
        createdTopics.push(payload);
        return { messageThreadId: 55, name: payload.name };
      },
      async editForumTopic(payload) {
        return { ok: true, ...payload };
      }
    }
  };
}

test("messaging runtime normalizes targets, topic bindings, and trigger profiles deterministically", () => {
  const targets = normalizeMessagingTargets([
    null,
    { chatId: "1001" },
    { chatId: "1002", sessionName: "build", profile: "build-test" },
    { chatId: 1003, quickId: "A1", profile: "coding-agent" },
    { chatId: "1004", sessionName: "ops", topicMode: "deck-session", profile: "coding-agent" },
    { chatId: "1005", topicMode: "deck-session", profile: "coding-agent" }
  ]);

  assert.deepEqual(targets, [
    { chatId: "1002", channelId: "1002", sessionId: "", quickIdToken: "", sessionName: "build", profile: "build-test" },
    { chatId: "1003", channelId: "1003", sessionId: "", quickIdToken: "A1", sessionName: "", profile: "coding-agent" },
    {
      chatId: "1004",
      channelId: "1004",
      sessionId: "",
      quickIdToken: "",
      sessionName: "ops",
      profile: "coding-agent",
      topicMode: "deck-session"
    },
    {
      chatId: "1005",
      channelId: "1005",
      sessionId: "",
      quickIdToken: "",
      sessionName: "",
      profile: "coding-agent",
      topicMode: "deck-session"
    }
  ]);

  const discordTargets = normalizeMessagingTargets(
    [{ channelId: "ops-room", threadId: 71, webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token", sessionName: "claude" }],
    { adapterId: "discord", includeAdapterId: true }
  );
  assert.deepEqual(discordTargets, [
    {
      adapterId: "discord",
      chatId: "ops-room",
      channelId: "ops-room",
      messageThreadId: 71,
      threadId: 71,
      webhookUrl: "https://discord.example.test/api/v10/webhooks/123/token",
      sessionId: "",
      quickIdToken: "",
      sessionName: "claude"
    }
  ]);

  const topicBindings = normalizeMessagingTopicBindings([
    null,
    { chatId: "1001", sessionId: "s-1", messageThreadId: 81, topicName: "Ops + codex", updatedAt: 123 },
    { chatId: "1001", sessionId: "", messageThreadId: 82 }
  ]);
  assert.deepEqual(topicBindings, [{ chatId: "1001", sessionId: "s-1", messageThreadId: 81, topicName: "Ops + codex", updatedAt: 123 }]);

  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "Codex agent", startCommand: "codex" })), "coding-agent");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "build-run", startCommand: "npm test" })), "build-test");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "plain-shell", startCommand: "bash" })), "generic-shell");
});

test("messaging inbound replay selector and input payload stay bounded and deterministic", () => {
  assert.equal(normalizeMessagingInboundReplaySelector(), "l:40");
  assert.equal(normalizeMessagingInboundReplaySelector("l:400"), "l:80");
  assert.equal(normalizeMessagingInboundReplaySelector("c:9000"), "c:3000");
  assert.equal(normalizeMessagingInboundReplaySelector("sp:9"), "sp:3");
  assert.throws(() => normalizeMessagingInboundReplaySelector("bad"), /Replay selector must match 'l:N', 'c:N', or 'sp:N'/);

  assert.equal(normalizeMessagingInboundInputPayload("status"), "status\r");
  assert.equal(normalizeMessagingInboundInputPayload("line 1\r\nline 2\n\n"), "line 1\nline 2\r");
  assert.equal(normalizeMessagingInboundInputPayload("   \n\t"), "");
});

test("messaging message policy returns explicit new, update, alert, and suppress decisions", () => {
  const created = applyMessagingMessagePolicy({ type: "session.lifecycle.created", threadKey: "status", text: "created" }, {});
  const updated = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary", comparableText: "summary" },
    { messageCreated: true }
  );
  const alerted = applyMessagingMessagePolicy(
    { type: "session.attention.required", threadKey: "attention", text: "failed", severity: "error" },
    { messageCreated: true }
  );
  const suppressed = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary", comparableText: "summary" },
    { lastComparableText: "summary", messageCreated: true }
  );

  assert.deepEqual(created, { action: "new", messageKey: "status", reason: "status_new" });
  assert.deepEqual(updated, { action: "update", messageKey: "status", reason: "status_update" });
  assert.deepEqual(alerted, { action: "alert", messageKey: "attention", reason: "attention_update" });
  assert.deepEqual(suppressed, { action: "suppress", messageKey: "status", reason: "duplicate_signature" });
});

test("transport-only messaging runtime reports adapter status and captures session traces", async () => {
  const telegram = createTelegramTransportStub();
  const runtime = createMessagingRuntime({
    telegramBotToken: "telegram-token",
    telegramTargets: [{ sessionName: "build-run", chatId: "1001" }],
    telegramOutboundEnabled: true,
    createTelegramTransport: () => telegram.transport,
    listCustomCommands: () => [{ name: "doc-u", description: "Custom command", content: "echo hi\n" }],
    logDebug() {}
  });

  await runtime.start();
  try {
    const session = createSession({ id: "s-transport", name: "build-run", startCommand: "npm test" });
    await runtime.observeSessionLifecycle("session.created", session, { traceId: "t-1", correlationId: "c-1" });
    await runtime.observeSessionData({ session, trace: { traceId: "t-2", correlationId: "c-1" } });
    runtime.observeSessionInput(session.id, { traceId: "t-3", correlationId: "c-2" });
    await runtime.observeSessionIdle({ session, trace: { traceId: "t-4", correlationId: "c-2" } });
    await runtime.observeShareChange({ session, trace: { traceId: "t-5", correlationId: "c-3" } });
    runtime.markRuntimeReady();

    const status = runtime.buildStatusSummary();
    assert.equal(status.mode, "transport_only");
    assert.deepEqual(status.boundaryContracts, ["DeliveryAdapter", "MessageIntent"]);
    assert.equal(status.enabled, true);
    assert.equal(status.deliveryEnabled, true);
    assert.equal(status.adapters[0].adapter, "telegram");
    assert.equal(status.adapters[0].publishedCommandCount >= 1, true);
    assert.equal(status.trace.capturedTotal >= 6, true);
    assert.equal(status.trace.recent.some((entry) => entry.type === "messaging.telegram.command_sync"), true);
    assert.equal(status.trace.recent.some((entry) => entry.type === "session.input.observed"), true);
    assert.equal(runtime.renderMetricLines().includes('ptydeck_messaging_runtime_mode{mode="transport_only"} 1'), true);
  } finally {
    await runtime.stop();
  }
});

test("transport-only messaging runtime treats unpublished slash commands as literal telegram input", async () => {
  const telegram = createTelegramTransportStub();
  const sentInputs = [];
  const session = createSession({ id: "s-inbound", name: "build-run", startCommand: "npm test" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "telegram-token",
    telegramTargets: [{ sessionName: "build-run", chatId: "-100200300" }],
    telegramOutboundEnabled: true,
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport: () => telegram.transport,
    resolveSessionForMessagingTarget: async () => session,
    requestMessagingSendInput: async (sessionId, payload) => {
      sentInputs.push({ sessionId, payload });
    },
    logDebug() {}
  });

  await runtime.start();
  try {
    telegram.updateQueue.push(
      {
        update_id: 1,
        message: {
          chat: { id: "-100200300", type: "supergroup", title: "ptydeck" },
          from: { id: 42, username: "sven" },
          text: "/status"
        }
      },
      {
        update_id: 2,
        message: {
          chat: { id: "-100200300", type: "supergroup", title: "ptydeck" },
          from: { id: 42, username: "sven" },
          text: "echo TELEGRAM_OK"
        }
      },
      {
        update_id: 3,
        message: {
          chat: { id: "-100200300", type: "supergroup", title: "ptydeck" },
          from: { id: 42, username: "sven" },
          text: "/replay l:5"
        }
      }
    );

    await waitFor(() => telegram.sentMessages.length >= 3, 2000);

    assert.deepEqual(sentInputs, [
      { sessionId: "s-inbound", payload: "/status\r" },
      { sessionId: "s-inbound", payload: "echo TELEGRAM_OK\r" },
      { sessionId: "s-inbound", payload: "/replay l:5\r" }
    ]);
    assert.match(telegram.sentMessages[0].text, /Input sent to \[4\] build-run\./);
    assert.match(telegram.sentMessages[1].text, /Input sent to \[4\] build-run\./);
    assert.match(telegram.sentMessages[2].text, /Input sent to \[4\] build-run\./);
  } finally {
    await runtime.stop();
  }
});

test("transport-only messaging runtime provisions deck-session telegram topics through ensureSessionTarget", async () => {
  const telegram = createTelegramTransportStub();
  const upserts = [];
  const runtime = createMessagingRuntime({
    telegramBotToken: "telegram-token",
    telegramTargets: [{ sessionName: "build-run", chatId: "-100200300", topicMode: "deck-session" }],
    telegramOutboundEnabled: false,
    createTelegramTransport: () => telegram.transport,
    resolveDeckNameForSession: () => "Operations",
    onTelegramTopicBindingUpsert: async (binding) => {
      upserts.push(binding);
    },
    logDebug() {}
  });

  try {
    const session = createSession({ id: "s-topic", name: "build-run", deckId: "ops" });
    const target = await runtime.ensureSessionTarget(session, { traceId: "topic-1", correlationId: "topic-1" });
    assert.equal(target.chatId, "-100200300");
    assert.equal(target.messageThreadId, 55);
    assert.deepEqual(telegram.createdTopics, [{ chatId: "-100200300", name: "Operations + build-run" }]);
    assert.deepEqual(upserts, [
      {
        chatId: "-100200300",
        sessionId: "s-topic",
        messageThreadId: 55,
        topicName: "Operations + build-run",
        updatedAt: upserts[0].updatedAt
      }
    ]);
    assert.equal(runtime.buildStatusSummary().adapters[0].activeTopicCount, 1);
  } finally {
    await runtime.stop();
  }
});
