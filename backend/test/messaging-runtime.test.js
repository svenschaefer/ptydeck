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
  const codexSeparatorInfo = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Der Commit ist gepusht.",
      comparableText: "der commit ist gepusht",
      aggregationReason: "codex_separator_info",
      deliveryScope: "codex_separator_info",
      deliveryBlockKey: "1:2",
      occurredAt: 8_000
    },
    {
      messageCreated: false,
      lastEventType: "session.control.changed",
      lastDeliveredAt: 7_000
    }
  );
  const codexSeparatorInfoSameBlockUpdate = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Der Commit ist gepusht.",
      comparableText: "der commit ist gepusht",
      aggregationReason: "codex_separator_info",
      deliveryScope: "codex_separator_info",
      deliveryBlockKey: "1:2",
      occurredAt: 8_200
    },
    {
      messageCreated: true,
      lastText: "ptydeck: Vorheriger Inhalt",
      lastComparableText: "vorheriger inhalt",
      lastDeliveryBlockKey: "1:2",
      lastEventType: "session.output.summary",
      lastDeliveredAt: 8_000
    }
  );
  const codexSeparatorInfoSameTextNewBlock = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Der Commit ist gepusht.",
      comparableText: "der commit ist gepusht",
      aggregationReason: "codex_separator_info",
      deliveryScope: "codex_separator_info",
      deliveryBlockKey: "3:4",
      occurredAt: 8_400
    },
    {
      messageCreated: true,
      lastText: "ptydeck: Der Commit ist gepusht.",
      lastComparableText: "der commit ist gepusht",
      lastDeliveryBlockKey: "1:2",
      lastEventType: "session.output.summary",
      lastDeliveredAt: 8_200
    }
  );
  const codexSeparatorSection = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Der Restart ist sauber.\n\nLive-Zustand\n- Backend: ok",
      comparableText: "der restart ist sauber live zustand backend ok",
      aggregationReason: "codex_separator_section",
      deliveryScope: "codex_separator_section",
      deliveryBlockKey: "7:8",
      occurredAt: 8_600
    },
    {
      messageCreated: false,
      lastEventType: "session.control.changed",
      lastDeliveredAt: 7_000
    }
  );
  const codexSeparatorSectionSameBlockUpdate = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Der Restart ist sauber.\n\nLive-Zustand\n- Backend: ok",
      comparableText: "der restart ist sauber live zustand backend ok",
      aggregationReason: "codex_separator_section",
      deliveryScope: "codex_separator_section",
      deliveryBlockKey: "7:8",
      occurredAt: 8_800
    },
    {
      messageCreated: true,
      lastText: "ptydeck: Vorheriger Abschnitt",
      lastComparableText: "vorheriger abschnitt",
      lastDeliveryBlockKey: "7:8",
      lastEventType: "session.output.summary",
      lastDeliveredAt: 8_600
    }
  );
  const codexSeparatorSummarySentence = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Validated the allowlist remains narrow enough for the next live check.",
      comparableText: "validated the allowlist remains narrow enough for the next live check",
      aggregationReason: "codex_separator_summary_sentence",
      deliveryScope: "codex_separator_summary_sentence",
      deliveryBlockKey: "9000:9400",
      occurredAt: 9_000
    },
    {
      messageCreated: false,
      lastEventType: "session.control.changed",
      lastDeliveredAt: 7_000
    }
  );
  const codexSeparatorSummarySentenceSameBlockUpdate = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Validated the allowlist remains narrow enough for the next live check.",
      comparableText: "validated the allowlist remains narrow enough for the next live check",
      aggregationReason: "codex_separator_summary_sentence",
      deliveryScope: "codex_separator_summary_sentence",
      deliveryBlockKey: "9000:9400",
      occurredAt: 9_200
    },
    {
      messageCreated: true,
      lastText: "ptydeck: Vorheriger Summary-Block",
      lastComparableText: "vorheriger summary-block",
      lastDeliveryBlockKey: "9000:9400",
      lastEventType: "session.output.summary",
      lastDeliveredAt: 9_000
    }
  );
  const codexTelegramReply = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Wenn kein neuer Blocker auftaucht, gehe ich direkt in H115 und liefere den Slice end-to-end.",
      comparableText: "wenn kein neuer blocker auftaucht gehe ich direkt in h115 und liefere den slice end-to-end",
      aggregationReason: "codex_input_reply",
      deliveryScope: "codex_input_reply",
      deliveryBlockKey: "reply:req-123",
      occurredAt: 9_400
    },
    {
      messageCreated: false,
      lastEventType: "session.output.summary",
      lastDeliveredAt: 9_200
    }
  );
  const codexTelegramReplySameBlockUpdate = applyMessagingMessagePolicy(
    {
      type: "session.output.summary",
      threadKey: "status",
      text: "ptydeck: Wenn kein neuer Blocker auftaucht, gehe ich direkt in H115 und liefere den Slice end-to-end.",
      comparableText: "wenn kein neuer blocker auftaucht gehe ich direkt in h115 und liefere den slice end-to-end",
      aggregationReason: "codex_input_reply",
      deliveryScope: "codex_input_reply",
      deliveryBlockKey: "reply:req-123",
      occurredAt: 9_500
    },
    {
      messageCreated: true,
      lastText: "ptydeck: Vorheriger Reply-Block",
      lastComparableText: "vorheriger reply-block",
      lastDeliveryBlockKey: "reply:req-123",
      lastEventType: "session.output.summary",
      lastDeliveredAt: 9_400
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
  assert.equal(codexSeparatorInfo.action, "new");
  assert.equal(codexSeparatorInfo.reason, "codex_separator_info_new_block");
  assert.equal(codexSeparatorInfoSameBlockUpdate.action, "update");
  assert.equal(codexSeparatorInfoSameBlockUpdate.reason, "codex_separator_info_block_update");
  assert.equal(codexSeparatorInfoSameTextNewBlock.action, "new");
  assert.equal(codexSeparatorInfoSameTextNewBlock.reason, "codex_separator_info_new_block");
  assert.equal(codexSeparatorSection.action, "new");
  assert.equal(codexSeparatorSection.reason, "codex_separator_section_new_block");
  assert.equal(codexSeparatorSectionSameBlockUpdate.action, "update");
  assert.equal(codexSeparatorSectionSameBlockUpdate.reason, "codex_separator_section_block_update");
  assert.equal(codexSeparatorSummarySentence.action, "new");
  assert.equal(codexSeparatorSummarySentence.reason, "codex_separator_summary_sentence_new_block");
  assert.equal(codexSeparatorSummarySentenceSameBlockUpdate.action, "update");
  assert.equal(codexSeparatorSummarySentenceSameBlockUpdate.reason, "codex_separator_summary_sentence_block_update");
  assert.equal(codexTelegramReply.action, "new");
  assert.equal(codexTelegramReply.reason, "codex_input_reply_new_block");
  assert.equal(codexTelegramReplySameBlockUpdate.action, "update");
  assert.equal(codexTelegramReplySameBlockUpdate.reason, "codex_input_reply_block_update");
});

test("messaging runtime exposes the neutral terminal messaging core bridge while preserving codex allowlist delivery", async () => {
  const sends = [];
  let now = 4_500;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 510 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 511 };
        }
      };
    }
  });

  const session = createSession({
    id: "terminal-core-bridge-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "terminal-core-bridge-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der Commit ist gepusht. Der finale Repo-Zustand ist sauber.\n",
    promptBoundaries: [],
    trace: { traceId: "terminal-core-bridge-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "  Damit der Analyse-Slice sauber abgeschlossen ist.\n",
    promptBoundaries: [],
    trace: { traceId: "terminal-core-bridge-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "terminal-core-bridge-4" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /^\[7\] ptydeck: Der Commit ist gepusht\. Der finale Repo-Zustand ist sauber\./u);
  assert.match(sends[0].text, /Damit der Analyse-Slice sauber abgeschlossen ist\./u);

  const status = runtime.buildStatusSummary();
  assert.equal(status.terminalMessagingCore.active, true);
  assert.equal(status.terminalMessagingCore.bridgeMode, "legacy-candidate-to-message-intent");
  assert.deepEqual(status.terminalMessagingCore.deliveryAdapters, ["telegram"]);
  assert.deepEqual(status.terminalMessagingCore.boundaryContracts, [
    "TerminalProjection",
    "Turn",
    "OutputEpisode",
    "MessageIntent",
    "DeliveryAdapter",
    "AppSemanticAdapter"
  ]);
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

test("messaging runtime delivers only codex allowlist candidates while generic delivery stays hard-disabled", async () => {
  const sends = [];
  const edits = [];
  let now = 220;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 200 };
        },
        async editMessage(payload) {
          edits.push(payload);
          return { messageId: payload.messageId || 201 };
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
      confidence: 0.99
    }
  });

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "h99-1" });
  assert.equal(sends.length, 0);

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h99-2" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der Commit ist gepusht. Der finale Repo-/Prozesszustand ist sauber,\n" +
      "  damit der Analyse-Slice sauber abgeschlossen ist.\n",
    promptBoundaries: [],
    trace: { traceId: "h99-3" }
  });

  assert.equal(sends.length, 0);
  assert.equal(edits.length, 0);

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h99-4" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der erste Ad-hoc-Read war ein reiner Shell-Fehler bei node -e.\n" +
      "  Die Chunks liegen jetzt sauber als ESM aus dem Capture vor.\n",
    promptBoundaries: [],
    trace: { traceId: "h99-5" }
  });

  assert.equal(sends.length, 1);
  assert.equal(edits.length, 0);
  assert.match(sends[0].text, /Der Commit ist gepusht/);
  assert.doesNotMatch(sends[0].text, /Session created/);

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h105-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der Restart ist sauber.›Find and fix a bug in @filename gpt-5.4 xhigh · 43% left · ~/workspace/code/ptydeck\n",
    promptBoundaries: [],
    trace: { traceId: "h105-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "  Live-Zustand\n  - Backend: ok\n  - Ready: ready\n  Wichtig\n  - Die Delivery-Counter sind nach dem Restart wieder bei 0.\n",
    promptBoundaries: [],
    trace: { traceId: "h105-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "h105-4" }
  });

  assert.equal(sends.length, 3);
  assert.match(sends[1].text, /Der erste Ad-hoc-Read war ein reiner Shell-Fehler bei node -e/);
  assert.match(sends[2].text, /Der Restart ist sauber\./);
  assert.match(sends[2].text, /Live-Zustand/);
  assert.match(sends[2].text, /Die Delivery-Counter sind nach dem Restart wieder bei 0/);

  runtime.markRuntimeReady();
  now += 20_000;
  runtime.observeSessionInput(session.id, { traceId: "h106-input" });

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "committed.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-4" }
  });

  assert.equal(sends.length, 4);
  assert.match(sends[3].text, /Validated the allowlist remains narrow enough for the next live check\./);
  assert.doesNotMatch(sends[3].text, /committed\./);

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-5" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-6" }
  });

  assert.equal(sends.length, 4);

  const status = runtime.buildStatusSummary();
  assert.equal(status.deliveryEnabled, false);
  assert.equal(status.deliveryHardBreakActive, true);
  assert.equal(status.allowlistDeliveryActive, true);
  assert.deepEqual(status.allowlistDeliveryScopes, [
    "codex_input_reply",
    "codex_separator_info",
    "codex_separator_section",
    "codex_separator_summary_sentence"
  ]);
  assert.equal(status.adapters[0].deliveryEnabled, false);
  assert.equal(status.adapters[0].allowlistDeliveryActive, true);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_info_new_block"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_section_new_block"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_summary_sentence_new_block"));
  assert.ok(status.trace.recent.some((entry) => entry.delivery[0]?.delivered === true));
});

test("messaging runtime promotes growing separator-anchored closing comments onto the section family instead of emitting early info", async () => {
  const sends = [];
  let now = 8_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 620 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 621 };
        }
      };
    }
  });

  const session = createSession({
    id: "h115-section-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h115-section-1" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der Scope ist sauber. Die letzten Validatoren sind grün.\n" +
      "  Die Docs sind konsistent und der Slice ist fast fertig.\n",
    promptBoundaries: [],
    trace: { traceId: "h115-section-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "  Danach pushe ich den finalen Stand.\n",
    promptBoundaries: [],
    trace: { traceId: "h115-section-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "h115-section-4" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Der Scope ist sauber\. Die letzten Validatoren sind grün\./);
  assert.match(sends[0].text, /Die Docs sind konsistent und der Slice ist fast fertig\./);
  assert.match(sends[0].text, /Danach pushe ich den finalen Stand\./);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_section_new_block"));
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "codex_separator_info_new_block"));
});

test("messaging runtime still delivers short separator-anchored bullets through the info family after shallow section rejection", async () => {
  const sends = [];
  let now = 9_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 720 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 721 };
        }
      };
    }
  });

  const session = createSession({
    id: "h115-info-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h115-info-1" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der Commit ist gepusht. Der finale Repo-Zustand ist sauber.\n" +
      "  Damit der Analyse-Slice sauber abgeschlossen ist.\n",
    promptBoundaries: [],
    trace: { traceId: "h115-info-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "h115-info-3" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Der Commit ist gepusht\. Der finale Repo-Zustand ist sauber\./);
  assert.match(sends[0].text, /Damit der Analyse-Slice sauber abgeschlossen ist\./);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_info_new_block"));
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "codex_separator_section_new_block"));
});

test("messaging runtime assembles a multiline codex closing block from an implicit contaminated start without leaking attention or status fragments", async () => {
  const sends = [];
  let now = 9_500;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 735 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 736 };
        }
      };
    }
  });

  const session = createSession({
    id: "h119-implicit-section-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "• H118 is delivered and pushed.›Explain this codebase gpt-5.4 xhigh · 58% left · ~/workspace/code/ptydeck\n",
    promptBoundaries: [],
    trace: { traceId: "h119-implicit-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "  Commit\n",
    promptBoundaries: [],
    trace: { traceId: "h119-implicit-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "  - d394e92 feat: add messaging policy replay harness\n",
    promptBoundaries: [],
    trace: { traceId: "h119-implicit-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "  What changed\n",
    promptBoundaries: [],
    trace: { traceId: "h119-implicit-4" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "  - Added shared thread-policy-state helpers in backend/src/messaging-runtime.js so live runtime state transitions and offline replay use the same semantics.\n" +
      "  - Supports strict failure mode for drift detection.\n",
    promptBoundaries: [],
    trace: { traceId: "h119-implicit-5" }
  });
  await runtime.observeSessionData({
    session,
    data: "",
    promptBoundaries: [0],
    trace: { traceId: "h119-implicit-6" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /^\[7\] ptydeck: H118 is delivered and pushed\./);
  assert.match(sends[0].text, /\n\nCommit\n\n- d394e92 feat: add messaging policy replay harness/);
  assert.match(sends[0].text, /\n\nWhat changed\n\n- Added shared thread-policy-state helpers/);
  assert.match(sends[0].text, /- Supports strict f/u);
  assert.ok(sends[0].text.length > 250);
  assert.doesNotMatch(sends[0].text, /ein…$/u);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_section_new_block"));
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "attention_required"));
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "status_update"));
});

test("messaging runtime keeps multiline section formatting and family length instead of generic 280-char truncation", async () => {
  const sends = [];
  let now = 11_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 880 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 881 };
        }
      };
    }
  });

  const session = createSession({
    id: "section-format-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Die H120-Änderungen sind damit live.›Use /skills to list available skills gpt-5.4 xhigh · 54% left\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "\nDie nächsten sinnvollen Feldchecks sind:\n\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "1. der frühere 15:51/16:03-Fall: kein stale Reply mehr aus Alt-Residue oder Input-Echo\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-4" }
  });
  await runtime.observeSessionData({
    session,
    data: "2. ein normaler freier Reply nach lokalem/REST-Submit: erste echte Codex-Antwort sollte nach Telegram gehen\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-5" }
  });
  await runtime.observeSessionData({
    session,
    data: "3. ein größerer mehrzeiliger Abschlussblock: weiter als codex_separator_section, nicht fragmentiert\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-6" }
  });
  await runtime.observeSessionData({
    session,
    data: "\nWenn der nächste auffällige Telegram- oder Terminal-Fall kommt, analysiere ich ihn direkt gegen die Live-Logs.\n",
    promptBoundaries: [],
    trace: { traceId: "section-format-7" }
  });
  await runtime.observeSessionData({
    session,
    data: "\n",
    promptBoundaries: [0],
    trace: { traceId: "section-format-8" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /^\[7\] ptydeck: Die H120-Änderungen sind damit live\./);
  assert.match(sends[0].text, /\n\nDie nächsten sinnvollen Feldchecks sind:\n\n1\. der frühere 15:51\/16:03-Fall/u);
  assert.match(sends[0].text, /\n2\. ein normaler freier Reply nach lokalem\/REST-Submit/u);
  assert.match(sends[0].text, /\n3\. ein größerer mehrzeiliger Abschlussblock: weiter als codex_separator_section, nicht fragmentiert/u);
  assert.match(sends[0].text, /\n\nWenn der nächste auffällige Telegram- oder Terminal-Fall kommt, analysiere ich ihn direkt gegen die Live-Logs\./u);
  assert.ok(sends[0].text.length > 450);
  assert.doesNotMatch(sends[0].text, /Use \/skills/u);
});

test("messaging runtime truncates oversized codex replies in the middle so both start and end remain visible", async () => {
  const sends = [];
  let now = 12_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 920 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 921 };
        }
      };
    }
  });

  const session = createSession({
    id: "reply-middle-truncation-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  runtime.observeSessionInput(session.id, {
    source: "rest",
    traceId: "reply-middle-open",
    correlationId: "req-reply-middle",
    replyPromotionEligible: true
  });

  await runtime.observeSessionData({
    session,
    data: "• Beginn des großen Reply-Blocks.›Use /skills to list available skills gpt-5.4 xhigh · 54% left\n",
    promptBoundaries: [],
    trace: { traceId: "reply-middle-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "Status\n",
    promptBoundaries: [],
    trace: { traceId: "reply-middle-2" }
  });
  for (let index = 1; index <= 3; index += 1) {
    await runtime.observeSessionData({
      session,
      data: `${index}. Dieser Listenpunkt erweitert den Telegram-Text bewusst über die Familiengrenze hinaus und hält den Mittelteil stabil für den Trunkierungstest.\n`,
      promptBoundaries: [],
      trace: { traceId: `reply-middle-list-${index}` }
    });
  }
  await runtime.observeSessionData({
    session,
    data:
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Dieser abschließende Absatz liefert zusätzlichen Fülltext für die Telegram-Kürzung und hält das Ende stabil. " +
      "Der abschließende Endmarker bleibt sichtbar und muss trotz Kürzung erhalten bleiben.\n",
    promptBoundaries: [],
    trace: { traceId: "reply-middle-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "\n",
    promptBoundaries: [],
    trace: { traceId: "reply-middle-4" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /^\[7\] ptydeck: Beginn des großen Reply-Blocks\./);
  assert.match(sends[0].text, /Der abschließende Endmarker bleibt sichtbar und muss trotz Kürzung erhalten bleiben\.$/u);
  assert.match(sends[0].text, /…/u);
  assert.ok(sends[0].text.length <= 1_220);
  assert.doesNotMatch(sends[0].text, /Use \/skills/u);
});

test("messaging runtime correlates the next substantial telegram question reply before later codex workflow chatter", async () => {
  const sends = [];
  let now = 4_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 520 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 521 };
        }
      };
    }
  });

  const session = createSession({
    id: "telegram-reply-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  runtime.observeSessionInput(session.id, {
    source: "messaging:telegram",
    traceId: "telegram-reply-open",
    correlationId: "req-telegram-reply",
    replyEligible: true
  });

  await runtime.observeSessionData({
    session,
    data: "4. MSG-063 Owner QA\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "In ROADMAP.md:\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "Wenn kein neuer Blocker auftaucht, gehe ich direkt in H115 und liefere den Slice end-to-end.\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-3" }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-4" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der erste capture-read war wegen shell-quoting unbrauchbar. Ich ziehe die Chunks jetzt sauber als ESM aus dem Capture.\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-5" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Wenn kein neuer Blocker auftaucht, gehe ich direkt in H115 und liefere den Slice end-to-end\./);
  assert.doesNotMatch(sends[0].text, /shell-quoting/i);

  const status = runtime.buildStatusSummary();
  assert.equal(status.codexTelegramReplyCorrelation.activeSessionCount, 0);
  assert.deepEqual(status.allowlistDeliveryScopes, [
    "codex_input_reply",
    "codex_separator_info",
    "codex_separator_section",
    "codex_separator_summary_sentence"
  ]);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_input_reply_new_block"));
});

test("messaging runtime promotes the next substantial submitted codex reply even without telegram origin", async () => {
  const sends = [];
  let now = 5_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 560 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 561 };
        }
      };
    }
  });

  const session = createSession({
    id: "rest-reply-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  runtime.observeSessionInput(session.id, {
    source: "rest",
    traceId: "rest-reply-char",
    correlationId: "req-rest-char"
  });
  assert.equal(runtime.buildStatusSummary().codexTelegramReplyCorrelation.activeSessionCount, 0);

  runtime.observeSessionInput(session.id, {
    source: "rest",
    traceId: "rest-reply-open",
    correlationId: "req-rest-reply",
    replyPromotionEligible: true
  });

  await runtime.observeSessionData({
    session,
    data: "4. MSG-063 Owner QA\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "In ROADMAP.md:\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ja. Der Fall ist jetzt sauber eingegrenzt.›Explain this codebase gpt-5.4 xhigh · 37% left\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "Kurzurteil\nDie neue Reply-Logik greift grundsätzlich.\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-4" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-5" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der erste capture-read war wegen shell-quoting unbrauchbar. Ich ziehe die Chunks jetzt sauber als ESM aus dem Capture.\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-6" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Ja\. Der Fall ist jetzt sauber eingegrenzt\./);
  assert.match(sends[0].text, /Kurzurteil/);
  assert.doesNotMatch(sends[0].text, /Explain this codebase/i);
  assert.doesNotMatch(sends[0].text, /shell-quoting/i);

  const status = runtime.buildStatusSummary();
  assert.equal(status.codexTelegramReplyCorrelation.activeSessionCount, 0);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_input_reply_new_block"));
});

test("messaging runtime ignores stale carryover and input echo before starting a submitted codex reply block", async () => {
  const sends = [];
  let now = 9_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 760 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 761 };
        }
      };
    }
  });

  const session = createSession({
    id: "rest-reply-stale-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "Keine Produktänderung in diesem Schritt.",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "155",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-2" }
  });

  runtime.observeSessionInput(session.id, {
    source: "rest",
    traceId: "rest-reply-stale-text",
    correlationId: "req-rest-stale-text",
    replyInputText: "ok, was machen wir dann jetzt da"
  });
  await runtime.observeSessionData({
    session,
    data: "ok, was machen wir dann jetzt da",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-echo" }
  });

  runtime.observeSessionInput(session.id, {
    source: "rest",
    traceId: "rest-reply-stale-open",
    correlationId: "req-rest-stale-open",
    replyPromotionEligible: true
  });

  await runtime.observeSessionData({
    session,
    data: "\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-flush" }
  });
  await runtime.observeSessionData({
    session,
    data: "› ok, was machen wir dann jetzt da Find and fix a bug in @filename\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-prompt-echo" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Jetzt nicht breit umbauen. Ein enger Korrektur-Slice reicht.›Find and fix a bug in @filename gpt-5.4 xhigh · 15% left\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-answer-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "Was wir als Nächstes tun sollten\n1. codex_input_reply härten\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-answer-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "\n",
    promptBoundaries: [],
    trace: { traceId: "rest-reply-stale-answer-end" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Jetzt nicht breit umbauen\. Ein enger Korrektur-Slice reicht\./);
  assert.match(sends[0].text, /Was wir als Nächstes tun sollten/);
  assert.doesNotMatch(sends[0].text, /Keine Produktänderung in diesem Schritt/i);
  assert.doesNotMatch(sends[0].text, /\b155\b/);
  assert.doesNotMatch(sends[0].text, /ok, was machen wir dann jetzt da/i);
  assert.doesNotMatch(sends[0].text, /Find and fix a bug/i);

  const status = runtime.buildStatusSummary();
  assert.equal(status.codexTelegramReplyCorrelation.activeSessionCount, 0);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_input_reply_new_block"));
});

test("messaging runtime ignores repeated stale short tails before starting a telegram reply block", async () => {
  const sends = [];
  let now = 12_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 860 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 861 };
        }
      };
    }
  });

  const session = createSession({
    id: "telegram-reply-stale-tail-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "- worktree clean\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-tail-1" }
  });

  runtime.observeSessionInput(session.id, {
    source: "messaging:telegram",
    traceId: "telegram-reply-tail-open",
    correlationId: "msg-telegram-tail-open",
    replyEligible: true,
    replyPromotionEligible: true,
    replyInputText: "/docu"
  });

  await runtime.observeSessionData({
    session,
    data: "- worktree clean\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-tail-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der aktuelle Status ist sauber.\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-tail-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "\n",
    promptBoundaries: [],
    trace: { traceId: "telegram-reply-tail-4" }
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Der aktuelle Status ist sauber\./);
  assert.doesNotMatch(sends[0].text, /^.*\[7\] ptydeck: - worktree clean$/m);
  assert.doesNotMatch(sends[0].text, /^\s*-\s*worktree clean\s*$/m);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_input_reply_new_block"));
  assert.ok(status.trace.recent.every((entry) => entry.comparableText !== "- worktree clean"));
});

test("messaging runtime suppresses commentary-like codex sections from telegram delivery", async () => {
  const sends = [];
  let now = 13_000;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ptydeck", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 960 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 961 };
        }
      };
    }
  });

  const session = createSession({
    id: "commentary-section-session",
    name: "ptydeck",
    quickIdToken: "7",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "commentary-section-1" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Ich prüfe jetzt die aktuelle Stream-to-message-Pipeline direkt im Code.\n" +
      "  Ich ziehe jetzt die kritischen Seams noch enger.\n",
    promptBoundaries: [],
    trace: { traceId: "commentary-section-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "commentary-section-3" }
  });

  assert.equal(sends.length, 0);
  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "commentary_progress_chatter"));
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "codex_separator_section_new_block"));
});

test("messaging runtime retries the same codex summary sentence after telegram backoff clears without duplicating once delivered", async () => {
  const sends = [];
  let now = 1_000;
  let firstSend = true;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          if (firstSend) {
            firstSend = false;
            throw new Error("Too Many Requests: retry after 1");
          }
          return { messageId: sends.length + 260 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 261 };
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
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-2" }
  });
  assert.equal(sends.length, 1);

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-4" }
  });
  assert.equal(sends.length, 1);

  now += 2_000;

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-5" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-6" }
  });
  assert.equal(sends.length, 2);

  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-7" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h106-retry-8" }
  });
  assert.equal(sends.length, 2);
});

test("messaging runtime suppresses codex summary sentence restart resends until ready quiet period and first fresh input, then persists the delivered summary ledger", async () => {
  const sends = [];
  const persistedLedgerEntries = [];
  let now = 2_000;
  const runtime = createMessagingRuntime({
    nowFn: () => now,
    codexSummaryRestartRecoveryQuietMs: 50,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    async onCodexRestartResendLedgerUpsert(entry) {
      persistedLedgerEntries.push(entry);
    },
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 360 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 361 };
        }
      };
    }
  });

  const session = createSession({
    id: "restart-summary-session",
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  async function emitSummaryCandidate(traceId, text = "Validated the allowlist remains narrow enough for the next live check.") {
    await runtime.observeSessionData({
      session,
      data: `${text}\n`,
      promptBoundaries: [],
      trace: { traceId: `${traceId}-text` }
    });
    await runtime.observeSessionData({
      session,
      data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
      promptBoundaries: [],
      trace: { traceId: `${traceId}-separator` }
    });
  }

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "h109-created" });
  await emitSummaryCandidate("h109-pre-ready");
  assert.equal(sends.length, 0);

  runtime.markRuntimeReady();
  now += 10;
  await emitSummaryCandidate("h109-quiet");
  assert.equal(sends.length, 0);

  runtime.observeSessionInput(session.id, { traceId: "h112-pre-quiet-input" });
  now += 30;
  await emitSummaryCandidate("h112-still-waiting-after-pre-quiet-input");
  assert.equal(sends.length, 0);

  now += 70;
  await emitSummaryCandidate("h109-waiting-input");
  assert.equal(sends.length, 0);

  runtime.observeSessionInput(session.id, { traceId: "h109-input" });
  now += 10;
  await emitSummaryCandidate("h109-allowed");
  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Validated the allowlist remains narrow enough for the next live check/);
  assert.equal(persistedLedgerEntries.length, 1);
  assert.equal(persistedLedgerEntries[0].deliveryScope, "codex_separator_summary_sentence");
  assert.equal(persistedLedgerEntries[0].sessionId, session.id);

  const status = runtime.buildStatusSummary();
  assert.equal(status.codexSummaryRestartRecovery.activeSessionCount, 0);
  assert.equal(status.codexSummaryRestartRecovery.ledgerSize, 1);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_pre_ready"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_quiet_window"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_waiting_for_input"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_summary_sentence_new_block"));
});

test("messaging runtime activates summary restart recovery for coding-agent restore sessions before codex identity is confirmed", async () => {
  const sends = [];
  let now = 5_000;
  const session = createSession({
    id: "delayed-codex-session",
    name: "infra-gcp",
    quickIdToken: "I",
    startCommand: "cody",
    appIdentity: {
      family: "unknown",
      label: "",
      source: "session-hints",
      confidence: 0.2
    }
  });
  const runtime = createMessagingRuntime({
    nowFn: () => now,
    codexSummaryRestartRecoveryQuietMs: 20,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "infra-gcp", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 480 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 481 };
        }
      };
    }
  });

  async function emitSummaryCandidate(traceId, text) {
    await runtime.observeSessionData({
      session,
      data: `${text}\n`,
      promptBoundaries: [],
      trace: { traceId: `${traceId}-text` }
    });
    await runtime.observeSessionData({
      session,
      data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
      promptBoundaries: [],
      trace: { traceId: `${traceId}-separator` }
    });
  }

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "h112-delayed-created" });
  runtime.markRuntimeReady();
  now += 25;
  session.appIdentity = {
    family: "coding-agent",
    label: "codex",
    source: "foreground-process",
    confidence: 0.99
  };

  await emitSummaryCandidate(
    "h112-delayed-waiting",
    "Completed and pushed multiple cycles on main with full local validation after"
  );
  assert.equal(sends.length, 0);

  runtime.observeSessionInput(session.id, { traceId: "h112-delayed-input" });
  now += 10;
  await emitSummaryCandidate(
    "h112-delayed-allowed",
    "Completed and pushed multiple cycles on main with full local validation after"
  );
  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Completed and pushed multiple cycles on main with full local validation after/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_waiting_for_input"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_summary_sentence_new_block"));
});

test("messaging runtime suppresses persisted summary-family restart history without affecting info and section families", async () => {
  const sends = [];
  let now = 3_000;
  const session = createSession({
    id: "persisted-summary-session",
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });
  const runtime = createMessagingRuntime({
    nowFn: () => now,
    codexSummaryRestartRecoveryQuietMs: 20,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    codexRestartResendLedger: [
      {
        deliveryScope: "codex_separator_summary_sentence",
        sessionId: session.id,
        chatId: "1001",
        targetStateKey: `1001:0:${session.id}`,
        comparableText: "validated the allowlist remains narrow enough for the next live check.",
        deliveredAt: now - 100
      }
    ],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 380 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 381 };
        }
      };
    }
  });

  async function emitSummaryCandidate(traceId, text) {
    await runtime.observeSessionData({
      session,
      data: `${text}\n`,
      promptBoundaries: [],
      trace: { traceId: `${traceId}-text` }
    });
    await runtime.observeSessionData({
      session,
      data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
      promptBoundaries: [],
      trace: { traceId: `${traceId}-separator` }
    });
  }

  await runtime.observeSessionLifecycle("session.created", session, { traceId: "h109-persisted-created" });
  runtime.markRuntimeReady();
  now += 30;
  runtime.observeSessionInput(session.id, { traceId: "h109-persisted-input" });

  await emitSummaryCandidate("h109-persisted-summary", "Validated the allowlist remains narrow enough for the next live check.");
  assert.equal(sends.length, 0);

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h109-info-1" }
  });
  await runtime.observeSessionData({
    session,
    data:
      "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-/Prozesszustand,\n" +
      "  damit der Analyse-Slice sauber abgeschlossen ist.\n",
    promptBoundaries: [],
    trace: { traceId: "h109-info-2" }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h109-section-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der Restart ist sauber.›Find and fix a bug in @filename gpt-5.4 xhigh · 43% left · ~/workspace/code/ptydeck\n",
    promptBoundaries: [],
    trace: { traceId: "h109-section-2" }
  });
  await runtime.observeSessionData({
    session,
    data: "  Live-Zustand\n  - Backend: ok\n  - Ready: ready\n  Wichtig\n  - Die Delivery-Counter sind nach dem Restart wieder bei 0.\n",
    promptBoundaries: [],
    trace: { traceId: "h109-section-3" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "h109-section-4" }
  });

  await emitSummaryCandidate(
    "h109-summary-new",
    "Validated the section assembly remains narrow enough for the next live check."
  );

  assert.equal(sends.length, 3);
  assert.match(sends[0].text, /Der Commit ist gepusht/);
  assert.match(sends[1].text, /Der Restart ist sauber/);
  assert.match(sends[2].text, /Validated the section assembly remains narrow enough for the next live check/);

  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_prior_history"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_info_new_block"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_section_new_block"));
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_summary_sentence_new_block"));
});

test("messaging runtime does not enter summary restart recovery for codex sessions created after runtime readiness", async () => {
  const sends = [];
  let now = 3_500;
  const runtime = createMessagingRuntime({
    nowFn: () => now,
    codexSummaryRestartRecoveryQuietMs: 25,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 395 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 396 };
        }
      };
    }
  });

  const session = createSession({
    id: "post-ready-created-session",
    name: "codex",
    quickIdToken: "C",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.99
    }
  });

  runtime.markRuntimeReady();
  now += 50;
  await runtime.observeSessionLifecycle("session.created", session, { traceId: "h110-post-ready-created" });
  await runtime.observeSessionData({
    session,
    data: "Validated the allowlist remains narrow enough for the next live check.\n",
    promptBoundaries: [],
    trace: { traceId: "h110-post-ready-summary-text" }
  });
  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h110-post-ready-summary-separator" }
  });

  assert.equal(sends.length, 1);
  const status = runtime.buildStatusSummary();
  assert.equal(status.codexSummaryRestartRecovery.activeSessionCount, 0);
  assert.equal(status.trace.recent.some((entry) => entry.reason === "summary_restart_recovery_waiting_for_input"), false);
  assert.ok(status.trace.recent.some((entry) => entry.reason === "codex_separator_summary_sentence_new_block"));
});

test("messaging runtime rejects anti-pattern and prompt-contaminated separator candidates", async () => {
  const sends = [];
  let now = 260;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 210 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 211 };
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
      confidence: 0.99
    }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-1" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Ran git status --short\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-2" }
  });
  await runtime.observeSessionIdle({ session, trace: { traceId: "h99-reject-3" } });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-4" }
  });
  await runtime.observeSessionData({
    session,
    data: "",
    promptBoundaries: [0],
    trace: { traceId: "h99-reject-5" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-/Prozesszustand.\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-6" }
  });

  await runtime.observeSessionData({
    session,
    data: "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-7" }
  });
  await runtime.observeSessionData({
    session,
    data: "• Der Commit ist gepusht. gpt-5.4 · 100% left · /ps to view\n",
    promptBoundaries: [],
    trace: { traceId: "h99-reject-8" }
  });
  await runtime.observeSessionIdle({ session, trace: { traceId: "h99-reject-9" } });

  assert.equal(sends.length, 0);
  const status = runtime.buildStatusSummary();
  assert.ok(status.trace.recent.every((entry) => entry.reason !== "codex_separator_info" || entry.delivery.length === 0));
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

test("messaging runtime delivers ai-playbooks-style separator candidates with tiny redraw-tail contamination", async () => {
  const sends = [];
  let now = 1_000;
  const runtime = createMessagingRuntime({
    nowFn: () => now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: false,
    telegramOutboundHardBreakActive: true,
    telegramTargets: [{ chatId: "1001", sessionName: "ai-playbooks", profile: "coding-agent" }],
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          sends.push(payload);
          return { messageId: sends.length + 320 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 321 };
        }
      };
    }
  });

  const session = createSession({
    name: "ai-playbooks",
    quickIdToken: "A",
    cwd: "/work/repo",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "foreground-process",
      confidence: 0.95
    }
  });

  await runtime.observeSessionData({
    session,
    data: "───────────────────────────────────────────────────────────ooor\n",
    promptBoundaries: [],
    trace: { traceId: "h104-1" }
  });
  now += 3_923;
  await runtime.observeSessionData({
    session,
    data:
      "• Die .local-Runtime ist weiter sauber (runtime-contract, healthz, manage alle grün). " +
      "Es fehlen jetzt noch der Diff-Whitespace-Check und der volle ci:check; danach committe und pushe ich.\n",
    promptBoundaries: [],
    trace: { traceId: "h104-2" }
  });
  now += 10;
  await runtime.observeSessionIdle({ session, trace: { traceId: "h104-3" } });

  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /Die \.local-Runtime ist weiter sauber/);
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

test("messaging runtime reuses persisted forum topic bindings without renaming manually named topics", async () => {
  const sends = [];
  const createdTopics = [];
  const editedTopics = [];
  let now = 500;
  const runtime = createMessagingRuntime({
    nowFn: () => ++now,
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", topicMode: "deck-session", profile: "coding-agent" }],
    telegramTopicBindings: [{ chatId: "1001", sessionId: "codex-session", messageThreadId: 81, topicName: "Manual topic name" }],
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
        async editForumTopic(payload) {
          editedTopics.push(payload);
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
  assert.equal(editedTopics.length, 0);
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

test("messaging runtime treats unpublished telegram slash commands as literal terminal input", async () => {
  const outboundMessages = [];
  const updateQueue = [];
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
      return session;
    }
  });

  await runtime.start();
  try {
    updateQueue.push(
      { update_id: 1, message: { chat: { id: 1001 }, text: "/status" } },
      { update_id: 2, message: { chat: { id: 1001 }, text: "echo FROM_TELEGRAM" } }
    );

    await waitFor(() => outboundMessages.length >= 2, 1500);

    assert.match(outboundMessages[0].text, /Input sent to \[9\] codex/);
    assert.match(outboundMessages[1].text, /Input sent to \[9\] codex/);
    assert.deepEqual(inputCalls, [
      { sessionId: "s-codex", data: "/status\r" },
      { sessionId: "s-codex", data: "echo FROM_TELEGRAM\r" }
    ]);
    assert.equal(runtime.buildStatusSummary().adapters[0].inboundHandledTotal >= 2, true);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime passes stable trace identifiers into telegram inbound input writes", async () => {
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
          return { messageId: outboundMessages.length + 240 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 240 };
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
    async requestMessagingSendInput(sessionId, data, options = {}) {
      inputCalls.push({ sessionId, data, trace: options.trace });
      return session;
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 99, message: { chat: { id: 1001 }, text: "echo FROM_TELEGRAM" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.equal(inputCalls.length, 1);
    assert.equal(inputCalls[0].sessionId, "s-codex");
    assert.equal(inputCalls[0].data, "echo FROM_TELEGRAM\r");
    assert.match(inputCalls[0].trace.traceId, /^msg-/);
    assert.equal(inputCalls[0].trace.requestId, inputCalls[0].trace.traceId);
    assert.equal(inputCalls[0].trace.correlationId, "msg-telegram-99");
    assert.equal(inputCalls[0].trace.source, "messaging:telegram");
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

test("messaging runtime executes published telegram custom commands against the mapped session", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const inputCalls = [];
  const session = createSession({ id: "s-codex", name: "codex", quickIdToken: "9", startCommand: "codex", deckId: "ops" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    listCustomCommands() {
      return [
        {
          name: "deploy-app",
          kind: "template",
          scope: "project",
          content: "echo deploy {{param:env}} {{var:deck.name}}",
          templateVariables: ["deck.name"]
        }
      ];
    },
    resolveDeckForSession() {
      return { id: "ops", name: "Ops" };
    },
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 280 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 280 };
        },
        async setMyCommands() {
          return true;
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
      return session;
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/deploy_dapp env=prod" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.deepEqual(inputCalls, [{ sessionId: "s-codex", data: "echo deploy prod Ops\r" }]);
    assert.match(outboundMessages[0].text, /Custom command \/deploy-app sent to \[9\] codex/);
    assert.equal(runtime.buildStatusSummary().adapters[0].publishedCommandCount >= 1, true);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects telegram custom-command target redirects", async () => {
  const outboundMessages = [];
  const updateQueue = [];
  const session = createSession({ id: "s-codex", name: "codex", quickIdToken: "9", startCommand: "codex" });
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
    telegramOutboundEnabled: true,
    telegramTargets: [{ chatId: "1001", sessionName: "codex", profile: "coding-agent" }],
    telegramInboundEnabled: true,
    telegramPollTimeoutSeconds: 1,
    listCustomCommands() {
      return [
        {
          name: "docu",
          kind: "plain",
          scope: "project",
          content: "echo DOCU"
        }
      ];
    },
    createTelegramTransport() {
      return {
        async sendMessage(payload) {
          outboundMessages.push(payload);
          return { messageId: outboundMessages.length + 290 };
        },
        async editMessage(payload) {
          return { messageId: payload.messageId || 290 };
        },
        async setMyCommands() {
          return true;
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
    }
  });

  await runtime.start();
  try {
    updateQueue.push({ update_id: 1, message: { chat: { id: 1001 }, text: "/docu other-target" } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /cannot redirect to another target/i);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects unmapped or unavailable callback fallback actions deterministically", async () => {
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
      { update_id: 1, callback_query: { id: "cb-1", data: "ptydeck:status", message: { chat: { id: 9999 } } } },
      { update_id: 2, callback_query: { id: "cb-2", data: "ptydeck:status", message: { chat: { id: 1001 } } } }
    );

    await waitFor(() => outboundMessages.length >= 2, 1500);
    assert.match(outboundMessages[0].text, /not mapped to a ptydeck session/);
    assert.match(outboundMessages[1].text, /Mapped ptydeck session is unavailable/);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects ambiguous callback fallback mappings deterministically", async () => {
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
    updateQueue.push({ update_id: 1, callback_query: { id: "cb-1", data: "ptydeck:status", message: { chat: { id: 1001 } } } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /matches multiple ptydeck messaging targets/i);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime falls back to the cached session snapshot for callback retry fallback actions", async () => {
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
    updateQueue.push({ update_id: 1, callback_query: { id: "cb-1", data: "ptydeck:retry", message: { chat: { id: 1001 } } } });
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

test("messaging runtime rejects callback fallback actions when the mapped session payload is missing", async () => {
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
    updateQueue.push({ update_id: 1, callback_query: { id: "cb-1", data: "ptydeck:status", message: { chat: { id: 1001 } } } });
    await waitFor(() => outboundMessages.length >= 1, 1500);
    assert.match(outboundMessages[0].text, /Mapped ptydeck session is unavailable/);
  } finally {
    await runtime.stop();
  }
});

test("messaging runtime rejects callback retry fallback while a live mapped session is still running", async () => {
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
    updateQueue.push({ update_id: 1, callback_query: { id: "cb-1", data: "ptydeck:retry", message: { chat: { id: 1001 } } } });
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
