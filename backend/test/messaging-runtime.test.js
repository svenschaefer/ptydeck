import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/errors.js";
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

test("messaging runtime normalizes targets and resolves trigger profiles deterministically", () => {
  const targets = normalizeMessagingTargets([
    null,
    { chatId: "1001" },
    { chatId: "1002", sessionName: "build", profile: "build-test" },
    { chatId: 1003, quickId: "A1", profile: "coding-agent" },
    { chatId: "1004", sessionName: "ops", topicMode: "deck-session", profile: "coding-agent" },
    { chatId: "1005", topicMode: "deck-session", profile: "coding-agent" }
  ]);

  assert.deepEqual(targets, [
    { chatId: "1002", sessionId: "", quickIdToken: "", sessionName: "build", profile: "build-test" },
    { chatId: "1003", sessionId: "", quickIdToken: "A1", sessionName: "", profile: "coding-agent" },
    { chatId: "1004", sessionId: "", quickIdToken: "", sessionName: "ops", profile: "coding-agent", topicMode: "deck-session" },
    { chatId: "1005", sessionId: "", quickIdToken: "", sessionName: "", profile: "coding-agent", topicMode: "deck-session" }
  ]);

  const topicBindings = normalizeMessagingTopicBindings([
    null,
    { chatId: "1001", sessionId: "s-1", messageThreadId: 81, topicName: "Ops + codex", updatedAt: 123 },
    { chatId: "1001", sessionId: "", messageThreadId: 82 }
  ]);
  assert.deepEqual(topicBindings, [
    { chatId: "1001", sessionId: "s-1", messageThreadId: 81, topicName: "Ops + codex", updatedAt: 123 }
  ]);

  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "Codex agent", startCommand: "codex" })), "coding-agent");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "build-run", startCommand: "npm test" })), "build-test");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "plain-shell", startCommand: "bash" })), "generic-shell");
});

test("messaging inbound replay selector stays bounded and rejects invalid values", () => {
  assert.equal(normalizeMessagingInboundReplaySelector(), "l:40");
  assert.equal(normalizeMessagingInboundReplaySelector("l:400"), "l:80");
  assert.equal(normalizeMessagingInboundReplaySelector("c:9000"), "c:3000");
  assert.equal(normalizeMessagingInboundReplaySelector("sp:9"), "sp:3");
  assert.throws(
    () => normalizeMessagingInboundReplaySelector("bad"),
    /Replay selector must match 'l:N', 'c:N', or 'sp:N'/
  );
});

test("messaging inbound input payload normalization stays bounded and deterministic", () => {
  assert.equal(normalizeMessagingInboundInputPayload("status"), "status\r");
  assert.equal(normalizeMessagingInboundInputPayload("line 1\r\nline 2\n\n"), "line 1\nline 2\r");
  assert.equal(normalizeMessagingInboundInputPayload("   \n\t"), "");
});

test("messaging message policy returns explicit new update alert and suppress decisions", () => {
  const created = applyMessagingMessagePolicy({ type: "session.lifecycle.created", threadKey: "status", text: "created" }, {});
  const started = applyMessagingMessagePolicy(
    { type: "session.lifecycle.started", threadKey: "status", text: "started", occurredAt: 2_000 },
    {}
  );
  const createdAfterStarted = applyMessagingMessagePolicy(
    { type: "session.lifecycle.created", threadKey: "status", text: "created", occurredAt: 3_000 },
    { lastEventType: "session.lifecycle.started", lastDeliveredAt: 1_000 }
  );
  const updated = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary", comparableText: "summary" },
    { messageCreated: true }
  );
  const alerted = applyMessagingMessagePolicy(
    { type: "session.attention.required", threadKey: "attention", text: "failed" },
    { messageCreated: true }
  );
  const suppressed = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary", comparableText: "summary" },
    { lastComparableText: "summary", messageCreated: true }
  );
  const noisy = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "tail", noiseClass: "status_tail" },
    { messageCreated: true }
  );
  const attentionChurn = applyMessagingMessagePolicy(
    {
      type: "session.attention.required",
      threadKey: "attention",
      text: "Retry blocked validation failed",
      comparableText: "retry blocked validation failed",
      occurredAt: 5_000
    },
    { lastComparableText: "validation failed", lastDeliveredAt: 1_000 }
  );
  const attentionFollowupUpdate = applyMessagingMessagePolicy(
    {
      type: "session.attention.required",
      threadKey: "attention",
      text: "Retry blocked because validation failed in workspace startup",
      comparableText: "retry blocked because validation failed in workspace startup",
      occurredAt: 5_500
    },
    {
      messageCreated: true,
      lastComparableText: "validation failed",
      lastDeliveredAt: 1_000
    }
  );
  const repeatedIdle = applyMessagingMessagePolicy(
    {
      type: "session.activity.idle",
      threadKey: "status",
      text: "Session idle.",
      comparableText: "session idle.",
      occurredAt: 10_000
    },
    {
      messageCreated: true,
      lastEventType: "session.activity.idle",
      lastComparableText: "session idle.",
      lastDeliveredAt: 5_000
    }
  );
  const idleAfterUndeliveredSummary = applyMessagingMessagePolicy(
    {
      type: "session.activity.idle",
      threadKey: "status",
      text: "Session idle.",
      comparableText: "session idle.",
      occurredAt: 9_000
    },
    {
      messageCreated: true,
      lastObservedEventType: "session.output.summary",
      lastObservedEventAt: 8_100
    }
  );
  const codingAgentIdleAfterRecentStatus = applyMessagingMessagePolicy(
    {
      type: "session.activity.idle",
      threadKey: "status",
      text: "Session idle.",
      comparableText: "session idle.",
      occurredAt: 28_000,
      profile: "generic-shell",
      session: createSession({
        name: "codex",
        startCommand: "codex",
        appIdentity: {
          family: "coding-agent",
          label: "codex",
          source: "explicit-hint",
          confidence: 0.98
        }
      })
    },
    {
      messageCreated: true,
      lastEventType: "session.output.summary",
      lastDeliveredAt: 10_000
    }
  );
  const attentionRepeatAfterWindow = applyMessagingMessagePolicy(
    {
      type: "session.attention.required",
      threadKey: "attention",
      text: "fatal: not a git repository",
      comparableText: "fatal: not a git repository",
      occurredAt: 50_000
    },
    {
      messageCreated: true,
      lastText: "fatal: not a git repository",
      lastComparableText: "fatal: not a git repository",
      lastDeliveredAt: 1_000,
      lastEventType: "session.attention.required"
    }
  );
  const promptAfterLifecycle = applyMessagingMessagePolicy(
    {
      type: "session.prompt.ready",
      threadKey: "status",
      text: "Prompt ready.",
      occurredAt: 6_000
    },
    {
      messageCreated: true,
      lastEventType: "session.lifecycle.created",
      lastDeliveredAt: 3_000
    }
  );
  const startupControlChatter = applyMessagingMessagePolicy(
    {
      type: "session.control.changed",
      threadKey: "status",
      text: "Control became unclaimed (1 attached client).",
      summary: "Control became unclaimed (1 attached client).",
      occurredAt: 7_000
    },
    {
      messageCreated: true,
      lastEventType: "session.lifecycle.created",
      lastDeliveredAt: 3_000
    }
  );

  assert.equal(created.action, "new");
  assert.equal(started.action, "suppress");
  assert.equal(started.reason, "lifecycle_started_noise");
  assert.equal(createdAfterStarted.action, "suppress");
  assert.equal(createdAfterStarted.reason, "lifecycle_created_after_started");
  assert.equal(updated.action, "update");
  assert.equal(alerted.action, "alert");
  assert.equal(suppressed.action, "suppress");
  assert.equal(suppressed.reason, "duplicate_signature");
  assert.equal(noisy.action, "suppress");
  assert.equal(noisy.reason, "noise_status_tail");
  assert.equal(attentionChurn.action, "suppress");
  assert.equal(attentionChurn.reason, "attention_duplicate_churn");
  assert.equal(attentionFollowupUpdate.action, "update");
  assert.equal(attentionFollowupUpdate.reason, "attention_followup_update");
  assert.equal(repeatedIdle.action, "suppress");
  assert.equal(repeatedIdle.reason, "idle_repeat");
  assert.equal(idleAfterUndeliveredSummary.action, "suppress");
  assert.equal(idleAfterUndeliveredSummary.reason, "idle_after_status_attempt");
  assert.equal(codingAgentIdleAfterRecentStatus.action, "suppress");
  assert.equal(codingAgentIdleAfterRecentStatus.reason, "idle_after_status_update");
  assert.equal(attentionRepeatAfterWindow.action, "alert");
  assert.equal(attentionRepeatAfterWindow.reason, "attention_required");
  assert.equal(promptAfterLifecycle.action, "suppress");
  assert.equal(promptAfterLifecycle.reason, "prompt_after_lifecycle");
  assert.equal(startupControlChatter.action, "suppress");
  assert.equal(startupControlChatter.reason, "startup_control_chatter");
});

test("messaging runtime emits lifecycle, summary, prompt, control, share, idle, and alert flows through the telegram adapter", async () => {
  const sends = [];
  const edits = [];
  const runtime = createMessagingRuntime({
    nowFn: (() => {
      let current = 100;
      return () => ++current;
    })(),
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 50 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId };
        }
      };
    }
  });

  const session = createSession({ name: "codex", startCommand: "codex", quickIdToken: "9" });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "t-1" });
  await runtime.observeSessionData({ session, data: "Validated copy deploy\n", promptBoundaries: [], trace: { traceId: "t-2" } });
  await runtime.observeSessionData({ session, data: "", promptBoundaries: [0], trace: { traceId: "t-3" } });
  await runtime.observeSessionLifecycle(
    "session.updated",
    {
      ...session,
      controlState: {
        ...session.controlState,
        currentController: "notebook",
        attachedClients: [{ clientId: "notebook", active: true }]
      }
    },
    { traceId: "t-4" }
  );
  await runtime.observeShareChange({
    action: "created",
    shareLink: { targetType: "session" },
    session,
    trace: { traceId: "t-5" }
  });
  await runtime.observeSessionIdle({ session, trace: { traceId: "t-6" } });
  await runtime.observeSessionData({ session, data: "Tests failed\n", promptBoundaries: [], trace: { traceId: "t-7" } });

  assert.equal(sends.length, 2);
  assert.match(sends[0].text, /\[9\] codex: Session created\./);
  assert.match(sends[1].text, /Tests failed/);
  assert.ok(edits.some((entry) => /Validated copy deploy/.test(entry.text)));
  assert.ok(edits.some((entry) => /Controller changed to notebook/.test(entry.text)));
  assert.ok(edits.some((entry) => /Share access created/.test(entry.text)));
  assert.ok(edits.some((entry) => /Session idle/.test(entry.text)));
  assert.equal(runtime.buildStatusSummary().enabled, true);
});

test("messaging runtime suppresses startup lifecycle, prompt, and initial control chatter after session creation", async () => {
  const sends = [];
  const edits = [];
  let now = 220;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 92 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 93 };
        }
      };
    }
  });

  const session = createSession({
    id: "startup-noise-session",
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "explicit-hint",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.started", session, { traceId: "startup-noise-1" });
  await runtime.observeSessionLifecycle("session.created", session, { traceId: "startup-noise-2" });
  await runtime.observeSessionData({
    session,
    data: "",
    promptBoundaries: [0],
    trace: { traceId: "startup-noise-3" }
  });
  await runtime.observeSessionLifecycle(
    "session.updated",
    {
      ...session,
      controlState: {
        currentController: null,
        attachedClients: [{ clientId: "local-browser", active: true }],
        readOnly: false
      }
    },
    { traceId: "startup-noise-4" }
  );

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 0);
  assert.match(sends[0].text, /Session created/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "lifecycle_started_noise"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "prompt_after_lifecycle"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "startup_control_chatter"));
});

test("messaging runtime provisions forum topics per terminal using deck name plus terminal name", async () => {
  const sends = [];
  const edits = [];
  const createdTopics = [];
  const topicBindings = [];
  let now = 400;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", topicMode: "deck-session", profile: "coding-agent" }],
    resolveDeckNameForSession: () => "Operations",
    onTelegramTopicBindingUpsert: async (binding) => {
      topicBindings.push(binding);
    },
    createTelegramTransport() {
      return {
        async getChat() {
          return { id: 1001, type: "supergroup", is_forum: true, title: "ptydeck" };
        },
        async createForumTopic({ chatId, name }) {
          createdTopics.push({ chatId, name });
          return { messageThreadId: 55, name };
        },
        async editForumTopic() {
          return { ok: true };
        },
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 70 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 71 };
        }
      };
    }
  });

  const session = createSession({
    id: "codex-session",
    name: "codex",
    deckId: "ops",
    startCommand: "codex"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "topic-1" });
  await runtime.observeSessionData({
    session,
    data: "Validated copy deploy\n",
    promptBoundaries: [],
    trace: { traceId: "topic-2" }
  });
  await runtime.observeSessionLifecycle(
    "session.updated",
    {
      ...session,
      controlState: {
        currentController: "local-browser",
        attachedClients: [{ clientId: "local-browser", active: true }],
        readOnly: false
      }
    },
    { traceId: "topic-3" }
  );

  assert.deepEqual(createdTopics, [{ chatId: "1001", name: "Operations + codex" }]);
  assert.equal(sends[0].messageThreadId, 55);
  assert.ok(edits.some((entry) => entry.messageThreadId === 55));
  assert.deepEqual(topicBindings, [
    {
      chatId: "1001",
      sessionId: "codex-session",
      messageThreadId: 55,
      topicName: "Operations + codex",
      updatedAt: topicBindings[0].updatedAt
    }
  ]);
});

test("messaging runtime dynamically maps selectorless deck-session forum targets to current sessions", async () => {
  const sends = [];
  const createdTopics = [];
  let now = 460;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", topicMode: "deck-session", profile: "coding-agent" }],
    resolveDeckNameForSession: () => "ptydeck",
    createTelegramTransport() {
      return {
        async getChat() {
          return { id: 1001, type: "supergroup", is_forum: true, title: "ptydeck" };
        },
        async createForumTopic({ chatId, name }) {
          createdTopics.push({ chatId, name });
          return { messageThreadId: 91, name };
        },
        async editForumTopic() {
          return { ok: true };
        },
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 90 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 91 };
        }
      };
    }
  });

  const session = createSession({
    id: "ptydeck-session",
    name: "ptydeck",
    deckId: "ptydeck",
    startCommand: "codex"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "dynamic-topic-1" });

  assert.deepEqual(createdTopics, [{ chatId: "1001", name: "ptydeck + ptydeck" }]);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].messageThreadId, 91);
  assert.match(sends[0].text, /Session created/);
});

test("messaging runtime prefers explicit session mappings over selectorless deck-session targets", async () => {
  const sends = [];
  const createdTopics = [];
  let now = 480;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [
      { chatId: "1001", topicMode: "deck-session", profile: "coding-agent" },
      { chatId: "1002", sessionName: "codex", profile: "coding-agent" }
    ],
    resolveDeckNameForSession: () => "ops",
    createTelegramTransport() {
      return {
        async getChat() {
          return { id: 1001, type: "supergroup", is_forum: true, title: "ptydeck" };
        },
        async createForumTopic({ chatId, name }) {
          createdTopics.push({ chatId, name });
          return { messageThreadId: 93, name };
        },
        async editForumTopic() {
          return { ok: true };
        },
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 92 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 93 };
        }
      };
    }
  });

  const session = createSession({
    id: "codex-session",
    name: "codex",
    deckId: "ops",
    startCommand: "codex"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "dynamic-topic-2" });

  assert.equal(createdTopics.length, 0);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].chatId, "1002");
  assert.equal(sends[0].messageThreadId, undefined);
});

test("messaging runtime reuses persisted forum topic bindings instead of reprovisioning topics", async () => {
  const sends = [];
  const createdTopics = [];
  let now = 500;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", topicMode: "deck-session", profile: "coding-agent" }],
    telegramTopicBindings: [{ chatId: "1001", sessionId: "codex-session", messageThreadId: 81, topicName: "Operations + codex" }],
    resolveDeckNameForSession: () => "Operations",
    createTelegramTransport() {
      return {
        async getChat() {
          return { id: 1001, type: "supergroup", is_forum: true, title: "ptydeck" };
        },
        async createForumTopic({ chatId, name }) {
          createdTopics.push({ chatId, name });
          return { messageThreadId: 82, name };
        },
        async editForumTopic() {
          return { ok: true };
        },
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 80 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 81 };
        }
      };
    }
  });

  const session = createSession({
    id: "codex-session",
    name: "codex",
    deckId: "ops",
    startCommand: "codex"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "topic-bind-1" });

  assert.equal(createdTopics.length, 0);
  assert.equal(sends[0].messageThreadId, 81);
});

test("messaging runtime flushes same-chunk summary content before prompt updates", async () => {
  const sends = [];
  const edits = [];
  let now = 300;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 70 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 71 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "same-chunk-1" });
  await runtime.observeSessionData({
    session,
    data: "Validated copy deploy\n",
    promptBoundaries: [22],
    trace: { traceId: "same-chunk-2" }
  });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /Validated copy deploy/);
  assert.doesNotMatch(edits[0].text, /Prompt ready/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.summary === "Validated copy deploy"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "prompt_after_status_update"));
});

test("messaging runtime keeps bounded traces and reports Telegram rate-limit delivery outcomes", async () => {
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex" }],
    createTelegramTransport() {
      return {
        async sendMessage() {
          throw new Error("Too Many Requests: retry after 8");
        },
        async editMessage() {
          throw new Error("Too Many Requests: retry after 8");
        }
      };
    }
  });

  await runtime.observeSessionLifecycle("session.created", createSession({ name: "codex", quickIdToken: "C" }), {
    traceId: "trace-rate-limit"
  });

  const status = runtime.buildStatusSummary();
  assert.equal(status.trace.capacity >= 100, true);
  assert.equal(status.trace.capturedTotal >= 1, true);
  assert.equal(status.trace.recent.length >= 1, true);
  assert.equal(status.trace.recent.at(-1).delivery[0].rateLimited, true);
  assert.equal(status.trace.recent.at(-1).delivery[0].retryAfterSeconds, 8);
  assert.equal(status.adapters[0].lastRetryAfterSeconds, 8);
});

test("messaging runtime aggregates coding-agent summaries and suppresses noisy duplicate churn", async () => {
  const sends = [];
  const edits = [];
  let now = 500;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 10 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 11 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.95
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "agg-1" });
  await runtime.observeSessionData({
    session,
    data: "gpt-5.4 xhigh · 55% left · C:\\code\\snixy · gpt-5.4 · sni…\nValidated copy deploy\nTests passed\n",
    promptBoundaries: [],
    trace: { traceId: "agg-2" }
  });
  await runtime.observeSessionData({ session, data: "", promptBoundaries: [0], trace: { traceId: "agg-3" } });
  await runtime.observeSessionData({
    session,
    data: "gpt-5.4 xhigh · 54% left · C:\\code\\snixy · gpt-5.4 · sni…\nValidated copy deploy\n",
    promptBoundaries: [],
    trace: { traceId: "agg-4" }
  });
  now += 2500;
  await runtime.observeSessionData({ session, data: "", promptBoundaries: [0], trace: { traceId: "agg-5" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /Validated copy deploy \| Tests passed/);
  assert.doesNotMatch(edits[0].text, /55% left/);
  assert.doesNotMatch(edits[0].text, /C:\\code\\snixy/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "duplicate_signature"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "prompt_after_status_update"));
});

test("messaging runtime filters low-value coding-agent run and edit updates while tracing them", async () => {
  const sends = [];
  const edits = [];
  let now = 900;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 20 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 21 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "filter-1" });
  await runtime.observeSessionData({
    session,
    data:
      "• Ran node --input-type=module <<'EOF'\n" +
      "Edited backend/test/runtime.integration.test.js (+3 -0)\n" +
      "Validated messaging trace coverage\n",
    promptBoundaries: [],
    trace: { traceId: "filter-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "",
    promptBoundaries: [0],
    trace: { traceId: "filter-3" }
  });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /Validated messaging trace coverage/);
  assert.doesNotMatch(edits[0].text, /\bRan node\b/);
  assert.doesNotMatch(edits[0].text, /\bEdited backend\/test\/runtime\.integration\.test\.js\b/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_run_update"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_edit_update"));
});

test("messaging runtime suppresses repeated identical attention churn and ignores structural tail lines", async () => {
  const sends = [];
  let now = 1200;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "plain-shell", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 30 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 31 };
        }
      };
    }
  });

  const session = createSession({
    name: "plain-shell",
    quickIdToken: "S",
    startCommand: "bash"
  });

  await runtime.observeSessionData({
    session,
    data: "\"Clearing the persisted still-capture session failed.\",\n}\n",
    promptBoundaries: [],
    trace: { traceId: "attention-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "\"Clearing the persisted still-capture session failed.\",\n}\n",
    promptBoundaries: [],
    trace: { traceId: "attention-2" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /still-capture session failed/);
  assert.doesNotMatch(sends[0].text, /\}\s*$/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_duplicate_churn"));
  assert.ok(status.trace.recent.every((entry) => entry.summary !== "}"));
});

test("messaging runtime strips coding-agent tails and terminal-control residue from repeated fatal alerts and suppresses zero-issue counts", async () => {
  const sends = [];
  const edits = [];
  let now = 1_320;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 35 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 36 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "fatal-tail-1" });
  await runtime.observeSessionData({
    session,
    data:
      "└ fatal: not a git repository (or any of the parent directories): .git ocumentation in @filename 38;5;2m• Ran Get-Content -Path src\\\\SnippingTool\\\\Services\\\\ScreenCaptureService.cs\n" +
      "0 Error(s)\n" +
      "└ fatal: not a git repository (or any of the parent directories): .git 9;1H high · 100% left · C:\\\\code\\\\snixy · gpt-5.4 · snixy\n",
    promptBoundaries: [],
    trace: { traceId: "fatal-tail-2" }
  });

  assert.equal(sends.length, 2);
  assert.equal(edits.length, 1);
  assert.match(sends[1].text, /fatal: not a git repository/);
  assert.match(edits[0].text, /fatal: not a git repository/);
  assert.doesNotMatch(sends[1].text, /Get-Content/);
  assert.doesNotMatch(sends[1].text, /38;5;2m/);
  assert.doesNotMatch(sends[1].text, /9;1H/);
  assert.doesNotMatch(sends[1].text, /100% left/);
  assert.doesNotMatch(edits[0].text, /100% left/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_followup_update"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_zero_issue_count"));
});

test("messaging runtime suppresses short coding-agent attention snippet tails after a stronger failure line", async () => {
  const sends = [];
  let now = 1_360;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 45 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 46 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "snippet-tail-1" });
  await runtime.observeSessionData({
    session,
    data:
      "└ fatal: unable to access 'https://github.com/svenschaefer/snixy/': Failed to connect\n" +
      "eine Exception geworfen.\n",
    promptBoundaries: [],
    trace: { traceId: "snippet-tail-2" }
  });

  assert.equal(sends.length, 2);
  assert.match(sends[1].text, /fatal: unable to access/);
  assert.doesNotMatch(sends[1].text, /eine Exception geworfen/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_snippet_tail"));
});

test("messaging runtime edits an existing attention thread when a richer follow-up for the same issue arrives", async () => {
  const sends = [];
  const edits = [];
  let now = 1_380;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 50 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 52 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "attention-update-1" });
  await runtime.observeSessionData({
    session,
    data: "fatal: unable to access 'https://github.com/svenschaefer/snixy/'\n",
    promptBoundaries: [],
    trace: { traceId: "attention-update-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "fatal: unable to access 'https://github.com/svenschaefer/snixy/': Failed to connect to github.com port 443\n",
    promptBoundaries: [],
    trace: { traceId: "attention-update-3" }
  });

  assert.equal(sends.length, 2);
  assert.equal(edits.length, 1);
  assert.match(sends[1].text, /fatal: unable to access/);
  assert.match(edits[0].text, /Failed to connect to github\.com port 443/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_followup_update"));
});

test("messaging runtime preserves actionable path diagnostics and keeps distinct path failures separate", async () => {
  const sends = [];
  let now = 1_385;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 53 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 54 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "path-distinct-1" });
  await runtime.observeSessionData({
    session,
    data: "error: build failed in C:\\code\\snixy\\src\\Foo.cs at line 12\n",
    promptBoundaries: [],
    trace: { traceId: "path-distinct-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "fatal: unable to access 'https://github.com/org-a/repo-a/': Failed to connect\n",
    promptBoundaries: [],
    trace: { traceId: "path-distinct-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "fatal: unable to access 'https://github.com/org-b/repo-b/': Failed to connect\n",
    promptBoundaries: [],
    trace: { traceId: "path-distinct-4" }
  });

  assert.equal(sends.length, 4);
  assert.match(sends[1].text, /C:\\code\\snixy\\src\\Foo\.cs at line 12/);
  assert.match(sends[2].text, /org-a\/repo-a/);
  assert.match(sends[3].text, /org-b\/repo-b/);
});

test("messaging runtime trims coding-agent identifier tails from attention lines and suppresses duplicate follow-on alerts", async () => {
  const sends = [];
  let now = 1_390;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 55 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 56 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "attention-tail-1" });
  await runtime.observeSessionData({
    session,
    data:
      "Die ersten Leseaufrufe sind an den 1s-Timeout gelaufen.\n" +
      "Die ersten Leseaufrufe sind an den 1s-Timeout gelaufen. │ ExecuteTrayActionAsync|OnRestoreControlRequested|\n",
    promptBoundaries: [],
    trace: { traceId: "attention-tail-2" }
  });

  assert.equal(sends.length, 2);
  assert.match(sends[1].text, /Die ersten Leseaufrufe sind an den 1s-Timeout gelaufen\./);
  assert.doesNotMatch(sends[1].text, /ExecuteTrayActionAsync/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_snippet_tail"));
});

test("messaging runtime trims review and path tails from coding-agent fatal lines and suppresses planning status chatter", async () => {
  const sends = [];
  let now = 1_395;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 57 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 58 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "review-tail-1" });
  await runtime.observeSessionData({
    session,
    data:
      "completed, der nächste aktive Block ist v0.41.0-control-shell-clarity-follow-up\n" +
      "- v0.3.0-reliability: make hotkey registration failure recoverable and clearly9;1H ?? src/SnippingTool/Services/CaptureSessionService.cs\n" +
      "└ fatal: not a git repository (or any of the parent directories): .git h 10…/review on my current changes m Run /review on my current changes \\code\\snixy ·\n",
    promptBoundaries: [],
    trace: { traceId: "review-tail-2" }
  });

  assert.equal(sends.length, 2);
  assert.match(sends[1].text, /fatal: not a git repository/);
  assert.doesNotMatch(sends[1].text, /review on my current changes/i);
  assert.doesNotMatch(sends[1].text, /\\code\\snixy/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_workflow_planning_status"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_workflow_version_bullet"));
});

test("messaging runtime avoids summary context bleed and trims coding-agent breadcrumb tails", async () => {
  const sends = [];
  const edits = [];
  let now = 1400;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 40 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 41 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "summary-1" });
  await runtime.observeSessionData({
    session,
    data:
      "Validated copy deploy\n" +
      "Coverage of the changes, apply fixes if needed, and so on, till done. Do a final validation.\n" +
      "gpt-5.4 xhigh · 100% left · C:\\\\code\\\\snixy · gpt-5.4 · snixy · main · 0% used … | └ # DONE\n" +
      "│ motion-session-handoff/export\\\" TODO.md ROADMAP.md DONE.md CHANGELOG.md\n",
    promptBoundaries: [],
    trace: { traceId: "summary-2" }
  });
  now += 3000;
  await runtime.observeSessionIdle({ session, trace: { traceId: "summary-3" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /# DONE/);
  assert.doesNotMatch(edits[0].text, /Coverage of the changes/);
  assert.doesNotMatch(edits[0].text, /C:\\\\code\\\\snixy/);
  assert.doesNotMatch(edits[0].text, /motion-session-handoff/);

  const status = runtime.buildStatusSummary();
  assert.ok(
    status.trace.recent.some((entry) =>
      ["noise_status_tail", "noise_low_value_workflow_instruction", "noise_low_value_markdown_file_list"].includes(entry.reason)
    )
  );
  assert.ok(status.trace.recent.every((entry) => !/Coverage of the changes/.test(entry.text || "")));
});

test("messaging runtime suppresses low-value coding-agent plan updates and the follow-on idle churn they would otherwise trigger", async () => {
  const sends = [];
  const edits = [];
  let now = 1_700;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 58 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 59 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "plan-noise-1" });
  await runtime.observeSessionData({
    session,
    data: "Updated Plan\n",
    promptBoundaries: [],
    trace: { traceId: "plan-noise-2" }
  });
  now += 10_000;
  await runtime.observeSessionIdle({ session, trace: { traceId: "plan-noise-3" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 0);
  assert.match(sends[0].text, /Session created/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_workflow_plan_update"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_idle_after_low_value_chatter"));
});

test("messaging runtime suppresses git-hash coding-agent commit subjects and their idle follow-on churn", async () => {
  const sends = [];
  const edits = [];
  let now = 1_730;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 88 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 89 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "git-subject-1" });
  await runtime.observeSessionData({
    session,
    data: "- 961f98a Plan remaining host window coverage hardening\n└ 961f98a Plan remaining host window coverage hardening\n",
    promptBoundaries: [],
    trace: { traceId: "git-subject-2" }
  });
  now += 10_000;
  await runtime.observeSessionIdle({ session, trace: { traceId: "git-subject-3" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 0);
  assert.match(sends[0].text, /Session created/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_low_value_git_commit_subject"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_idle_after_low_value_chatter"));
});

test("messaging runtime suppresses idle after unclassified coding-agent planning chatter", async () => {
  const sends = [];
  const edits = [];
  let now = 1_745;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 90 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 91 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "planning-fragment-1" });
  await runtime.observeSessionData({
    session,
    data: "coverage hardening\nhost-window smoke coverage for OverlayWindow,\nhidden-host and startup-routing smoke coverage for\n",
    promptBoundaries: [],
    trace: { traceId: "planning-fragment-2" }
  });
  now += 10_000;
  await runtime.observeSessionIdle({ session, trace: { traceId: "planning-fragment-3" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 0);
  assert.match(sends[0].text, /Session created/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "noise_idle_after_unclassified_chatter"));
  assert.ok(status.trace.recent.every((entry) => !/coverage hardening/i.test(entry.text || "")));
});

test("messaging runtime suppresses short low-value os error attention fragments", async () => {
  const sends = [];
  let now = 1_760;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 59 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 60 };
        }
      };
    }
  });

  const session = createSession({
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.98
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "os-error-1" });
  await runtime.observeSessionData({
    session,
    data: "falsch. (os error 123)\n".repeat(3),
    promptBoundaries: [],
    trace: { traceId: "os-error-2" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Session created/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "attention_low_value_fragment"));
});

test("messaging runtime suppresses repeated idle updates without intervening status changes", async () => {
  const sends = [];
  const edits = [];
  let now = 1800;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "plain-shell", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 60 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 61 };
        }
      };
    }
  });

  const session = createSession({
    name: "plain-shell",
    quickIdToken: "S",
    startCommand: "bash"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "idle-1" });
  await runtime.observeSessionIdle({ session, trace: { traceId: "idle-2" } });
  now += 5_000;
  await runtime.observeSessionIdle({ session, trace: { traceId: "idle-3" } });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0].text, /Session idle/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "idle_repeat"));
});

test("messaging runtime suppresses idle after a recent status attempt was skipped during telegram backoff", async () => {
  const sends = [];
  const edits = [];
  let now = 2_200;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "plain-shell", profile: "generic-shell" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          if (sends.length === 1) {
            return { messageId: 91 };
          }
          throw new Error("Too Many Requests: retry after 8");
        },
        async editMessage(payload) {
          edits.push(payload);
          throw new Error("message to edit not found");
        }
      };
    }
  });

  const session = createSession({
    name: "plain-shell",
    quickIdToken: "S",
    startCommand: "bash"
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "idle-backoff-1" });
  await runtime.observeSessionData({
    session,
    data: "Worker started successfully.\n",
    promptBoundaries: [],
    trace: { traceId: "idle-backoff-2" }
  });
  await runtime.observeSessionIdle({ session, trace: { traceId: "idle-backoff-3" } });

  assert.equal(sends.length, 2);
  assert.equal(edits.length, 1);
  assert.match(sends[0].text, /Session created/);
  assert.doesNotMatch(sends.at(-1).text, /Session idle/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "idle_after_status_attempt"));
});

test("messaging runtime handles bounded inbound status input stop retry and replay actions", async () => {
  const outboundMessages = [];
  const callbackAnswers = [];
  const updateQueue = [];
  const stopCalls = [];
  const retryCalls = [];
  const replaySelectors = [];
  const inputCalls = [];
  let session = createSession({ id: "s-codex", name: "codex", quickIdToken: "9", startCommand: "codex" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 200 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 200 };
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
      };
    },
    resolveSessionForMessagingTarget() {
      return session;
    },
    async requestMessagingStop(sessionId) {
      stopCalls.push(sessionId);
      session = { ...session, state: "exited" };
    },
    async requestMessagingRetry(sessionId) {
      retryCalls.push(sessionId);
      session = { ...session, state: "starting" };
      return session;
    },
    async requestMessagingSendInput(sessionId, data) {
      inputCalls.push({ sessionId, data });
      return session;
    },
    async requestMessagingReplayExcerpt(sessionId, selector) {
      replaySelectors.push({ sessionId, selector });
      return {
        selector,
        selectorKind: selector.startsWith("sp:") ? "shell_blocks" : "lines",
        resolvedCount: 2,
        availableCount: 2,
        selectorSatisfied: true,
        data: "prompt 1\nline 1\nprompt 2\nline 2"
      };
    }
  });

  await runtime.start();
  try {
    updateQueue.push(
      { update_id: 1, message: { chat: { id: 1001 }, text: "/status" } },
      { update_id: 2, message: { chat: { id: 1001 }, text: "echo FROM_TELEGRAM" } },
      {
        update_id: 3,
        callback_query: {
          id: "cb-1",
          data: "ptydeck:replay:sp:9",
          message: { chat: { id: 1001 } }
        }
      },
      { update_id: 4, message: { chat: { id: 1001 }, text: "/stop" } },
      { update_id: 5, message: { chat: { id: 1001 }, text: "/retry" } }
    );

    await waitFor(() => outboundMessages.length >= 5 && callbackAnswers.length >= 1, 1500);

    assert.match(outboundMessages[0].text, /Status for \[9\] codex/);
    assert.match(outboundMessages[0].text, /State: running/);
    assert.match(outboundMessages[1].text, /Input sent to \[9\] codex/);
    assert.match(outboundMessages[2].text, /\[9\] codex replay sp:3/);
    assert.match(outboundMessages[3].text, /Stop requested for \[9\] codex/);
    assert.match(outboundMessages[4].text, /Retry started for \[9\] codex/);
    assert.deepEqual(stopCalls, ["s-codex"]);
    assert.deepEqual(retryCalls, ["s-codex"]);
    assert.deepEqual(inputCalls, [{ sessionId: "s-codex", data: "echo FROM_TELEGRAM\r" }]);
    assert.deepEqual(replaySelectors, [{ sessionId: "s-codex", selector: "sp:3" }]);
    assert.equal(callbackAnswers[0].callbackQueryId, "cb-1");
    assert.match(callbackAnswers[0].text, /Replay sp:3/);
    assert.equal(runtime.buildStatusSummary().adapters[0].inboundHandledTotal >= 5, true);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime returns telegram input control failures without suppressing the rejection", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const inputCalls = [];
  const session = createSession({ id: "s-codex", name: "codex", quickIdToken: "9", startCommand: "codex" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 260 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 260 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    },
    resolveSessionForMessagingTarget() {
      return session;
    },
    async requestMessagingSendInput(sessionId, data) {
      inputCalls.push({ sessionId, data });
      throw new ApiError(403, "ControlDenied", "Only the active controller may send terminal input.");
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "pwd" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.deepEqual(inputCalls, [{ sessionId: "s-codex", data: "pwd\r" }]);
    assert.match(outboundMessages[0].text, /Only the active controller may send terminal input/);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects unmapped or unavailable inbound actions deterministically", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "mapped" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 300 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 300 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    },
    resolveSessionForMessagingTarget() {
      throw new Error("Mapped ptydeck session is unavailable.");
    }
  });

  await runtime.start();
  try {
    updateQueue.push(
      { update_id: 1, message: { chat: { id: 9999 }, text: "/status" } },
      { update_id: 2, message: { chat: { id: 1001 }, text: "/status" } }
    );

    await waitFor(() => outboundMessages.length >= 2, 1500);
    assert.match(outboundMessages[0].text, /not mapped to a ptydeck session/);
    assert.match(outboundMessages[1].text, /Mapped ptydeck session is unavailable/);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects ambiguous inbound mappings deterministically", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [
      { chatId: "1001", sessionName: "mapped-a" },
      { chatId: "1001", sessionName: "mapped-b" }
    ],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 320 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 320 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/status" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /matches multiple ptydeck messaging targets/i);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime falls back to the cached session snapshot when live target resolution fails", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const retryCalls = [];
  const session = createSession({ id: "s-cached", name: "codex", quickIdToken: "9", startCommand: "codex" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 330 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 330 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    },
    resolveSessionForMessagingTarget() {
      throw new Error("Live lookup failed.");
    },
    async requestMessagingRetry(sessionId, options = {}) {
      retryCalls.push({ sessionId, options });
      return { ...session, state: "starting" };
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "cached-1" });
  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/retry" } });
    await waitFor(() => outboundMessages.length >= 2, 1500);
    assert.match(outboundMessages[1].text, /Retry started for \[9\] codex/);
    assert.equal(retryCalls.length, 1);
    assert.equal(retryCalls[0].sessionId, "s-cached");
    assert.equal(retryCalls[0].options.sessionSnapshot.id, "s-cached");
    assert.equal(retryCalls[0].options.target.chatId, "1001");
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects inbound actions when the mapped session payload is missing", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "mapped" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 340 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 340 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    },
    resolveSessionForMessagingTarget() {
      return { id: "", name: "mapped" };
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/status" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /Mapped ptydeck session is unavailable/);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects retry while a live mapped session is still running", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const retryCalls = [];
  const session = createSession({ id: "s-live", name: "codex", quickIdToken: "9", startCommand: "codex", state: "running" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 350 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 350 };
        },
        async getUpdates() {
          if (updateQueue.length > 0) {
            return updateQueue.splice(0, updateQueue.length);
          }
          await sleep(5);
          return [];
        },
        async answerCallbackQuery() {
          return true;
        }
      };
    },
    resolveSessionForMessagingTarget() {
      return session;
    },
    async requestMessagingRetry(sessionId) {
      retryCalls.push(sessionId);
      return session;
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/retry" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /Retry is unavailable while \[9\] codex is running/);
    assert.deepEqual(retryCalls, []);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime ignores unmapped outbound sessions and exposes adapter metrics", async () => {
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "mapped" }],
    createTelegramTransport() {
      return {
        async sendMessage() {
          return { messageId: 1 };
        },
        async editMessage() {
          return { messageId: 1 };
        }
      };
    }
  });

  await runtime.observeSessionLifecycle("session.created", createSession({ name: "other" }), null);

  const metrics = runtime.renderMetricLines().join("\n");
  assert.match(metrics, /ptydeck_messaging_adapter_enabled\{adapter="telegram"\} 1/);
  assert.match(metrics, /ptydeck_messaging_adapter_configured_targets\{adapter="telegram"\} 1/);
});
