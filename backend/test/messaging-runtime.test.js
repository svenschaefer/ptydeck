import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMessagingMessagePolicy,
  createMessagingRuntime,
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
    controlState: {
      currentController: null,
      attachedClients: [],
      readOnly: false
    },
    ...overrides
  };
}

test("messaging runtime normalizes targets and resolves trigger profiles deterministically", () => {
  const targets = normalizeMessagingTargets([
    null,
    { chatId: "1001" },
    { chatId: "1002", sessionName: "build", profile: "build-test" },
    { chatId: 1003, quickId: "A1", profile: "coding-agent" }
  ]);

  assert.deepEqual(targets, [
    { chatId: "1002", sessionId: "", quickIdToken: "", sessionName: "build", profile: "build-test" },
    { chatId: "1003", sessionId: "", quickIdToken: "A1", sessionName: "", profile: "coding-agent" }
  ]);

  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "Codex agent", startCommand: "codex" })), "coding-agent");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "build-run", startCommand: "npm test" })), "build-test");
  assert.equal(resolveMessagingTriggerProfile(createSession({ name: "plain-shell", startCommand: "bash" })), "generic-shell");
});

test("messaging message policy returns explicit new update alert and suppress decisions", () => {
  const created = applyMessagingMessagePolicy({ type: "session.lifecycle.created", threadKey: "status", text: "created" }, {});
  const updated = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary" },
    { messageCreated: true }
  );
  const alerted = applyMessagingMessagePolicy(
    { type: "session.attention.required", threadKey: "attention", text: "failed" },
    { messageCreated: true }
  );
  const suppressed = applyMessagingMessagePolicy(
    { type: "session.output.summary", threadKey: "status", text: "summary" },
    { lastText: "summary", messageCreated: true }
  );

  assert.equal(created.action, "new");
  assert.equal(updated.action, "update");
  assert.equal(alerted.action, "alert");
  assert.equal(suppressed.action, "suppress");
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
  await runtime.observeSessionData({ session, data: "Plan updated\n", promptBoundaries: [], trace: { traceId: "t-2" } });
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
  assert.ok(edits.some((entry) => /Plan updated/.test(entry.text)));
  assert.ok(edits.some((entry) => /Prompt ready/.test(entry.text)));
  assert.ok(edits.some((entry) => /Controller changed to notebook/.test(entry.text)));
  assert.ok(edits.some((entry) => /Share access created/.test(entry.text)));
  assert.ok(edits.some((entry) => /Session idle/.test(entry.text)));
  assert.equal(runtime.buildStatusSummary().enabled, true);
});

test("messaging runtime ignores unmapped sessions and exposes adapter metrics", async () => {
  const runtime = createMessagingRuntime({
    telegramBotToken: "bot-token",
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
