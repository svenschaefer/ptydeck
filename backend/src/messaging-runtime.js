import { randomUUID } from "node:crypto";
import { normalizeVisibleReplayText } from "./replay-excerpt.js";
import { createTelegramAdapter, createTelegramTransport } from "./telegram-adapter.js";

export const MESSAGING_TRIGGER_PROFILES = Object.freeze(["generic-shell", "coding-agent", "build-test"]);
const MESSAGING_TRIGGER_PROFILE_SET = new Set(MESSAGING_TRIGGER_PROFILES);
const MAX_EVENT_SUMMARY_LENGTH = 280;
const MAX_RECENT_LINES = 4;
const CONTROL_EVENT_SIGNATURE_NONE = "none";

const PROFILE_PATTERNS = Object.freeze({
  "generic-shell": Object.freeze({
    attention: [
      /\b(?:error|failed|failure|fatal|traceback|exception|panic|timed out|timeout|refused|permission denied)\b/i,
      /\bsegmentation fault\b/i
    ],
    summary: [
      /\b(?:ready|listening|started|saved|completed|done|connected|copied|uploaded|downloaded)\b/i,
      /\b(?:created|updated|deleted|renamed|applied)\b/i
    ]
  }),
  "coding-agent": Object.freeze({
    attention: [
      /\b(?:error|failed|failure|traceback|exception|panic|blocked|conflict|validation failed|lint failed|tests failed)\b/i
    ],
    summary: [
      /\bplan updated\b/i,
      /\b(?:applied?|generated|wrote|updated|restored|reclaimed|validated|pushed|committed)\b/i,
      /\b(?:tests? passed|lint passed|coverage)\b/i
    ]
  }),
  "build-test": Object.freeze({
    attention: [
      /\b(?:FAIL|FAILED|ERROR|panic|traceback|exception|not ok|BUILD FAILED)\b/i,
      /\b(?:warning:|warnings?:\s*[1-9])\b/i
    ],
    summary: [
      /\b(?:PASS|passed|compiled successfully|build succeeded|finished|ran all test suites|coverage)\b/i,
      /\b(?:tests?:|summary:|results:)\b/i
    ]
  })
});

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizePositiveInteger(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function truncateSummary(value, maxLength = MAX_EVENT_SUMMARY_LENGTH) {
  const normalized = normalizeVisibleReplayText(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildSessionLabel(session) {
  const quickIdToken = normalizeNonEmptyString(session?.quickIdToken);
  const name = normalizeNonEmptyString(session?.name) || normalizeNonEmptyString(session?.shell) || normalizeNonEmptyString(session?.id);
  return quickIdToken ? `[${quickIdToken}] ${name}` : name;
}

function normalizeMessagingProfile(value) {
  const normalized = normalizeNonEmptyString(value).toLowerCase();
  return MESSAGING_TRIGGER_PROFILE_SET.has(normalized) ? normalized : "";
}

function normalizeMessagingTargetEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const quickIdToken = normalizeNonEmptyString(entry.quickIdToken || entry.quickId);
  const sessionName = normalizeNonEmptyString(entry.sessionName || entry.name);
  const chatId = normalizeNonEmptyString(entry.chatId) || String(entry.chatId ?? "").trim();
  const messageThreadId = normalizePositiveInteger(entry.messageThreadId);
  const profile = normalizeMessagingProfile(entry.profile);
  if (!chatId || (!sessionId && !quickIdToken && !sessionName)) {
    return null;
  }
  return Object.freeze({
    sessionId,
    quickIdToken,
    sessionName,
    chatId,
    ...(Number.isInteger(messageThreadId) ? { messageThreadId } : {}),
    ...(profile ? { profile } : {})
  });
}

export function normalizeMessagingTargets(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTargetEntry(entry)).filter(Boolean);
}

export function resolveMessagingTriggerProfile(session, target = null) {
  const targetProfile = normalizeMessagingProfile(target?.profile);
  if (targetProfile) {
    return targetProfile;
  }
  const fingerprint = [session?.name, session?.shell, session?.startCommand, session?.note]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
  if (/(?:codex|claude|agent|openai|apply_patch|plan updated)/.test(fingerprint)) {
    return "coding-agent";
  }
  if (/(?:npm test|pnpm test|yarn test|pytest|jest|vitest|cargo test|go test|gradle|mvn|build|compile|coverage)/.test(fingerprint)) {
    return "build-test";
  }
  return "generic-shell";
}

function buildControlEventSignature(session) {
  const controlState = session?.controlState;
  if (!controlState || typeof controlState !== "object") {
    return CONTROL_EVENT_SIGNATURE_NONE;
  }
  const controller = normalizeNonEmptyString(controlState.currentController);
  const attachedCount = Array.isArray(controlState.attachedClients) ? controlState.attachedClients.length : 0;
  const readOnly = controlState.readOnly === true ? "ro" : "rw";
  return `${controller || "none"}:${attachedCount}:${readOnly}`;
}

function buildControlEventSummary(session) {
  const controlState = session?.controlState;
  if (!controlState || typeof controlState !== "object") {
    return "Control state changed.";
  }
  const controller = normalizeNonEmptyString(controlState.currentController);
  const attachedCount = Array.isArray(controlState.attachedClients) ? controlState.attachedClients.length : 0;
  if (controller) {
    return `Controller changed to ${controller} (${attachedCount} attached client${attachedCount === 1 ? "" : "s"}).`;
  }
  return `Control became unclaimed (${attachedCount} attached client${attachedCount === 1 ? "" : "s"}).`;
}

function createSessionStreamState() {
  return {
    pendingLine: "",
    recentLines: [],
    lastControlSignature: CONTROL_EVENT_SIGNATURE_NONE,
    lastLifecycleType: ""
  };
}

function pushRecentLine(state, line) {
  state.recentLines.push(line);
  if (state.recentLines.length > MAX_RECENT_LINES) {
    state.recentLines.splice(0, state.recentLines.length - MAX_RECENT_LINES);
  }
}

function createEvent({ session, profile, type, summary, detail = "", severity = "info", threadKey = "status", trace = null, nowFn }) {
  const textSummary = truncateSummary(summary);
  const label = buildSessionLabel(session);
  const text = textSummary ? `${label}: ${textSummary}` : label;
  return Object.freeze({
    id: `msg-${randomUUID()}`,
    occurredAt: nowFn(),
    sessionId: session.id,
    session,
    profile,
    type,
    severity,
    threadKey,
    summary: textSummary,
    detail: truncateSummary(detail),
    text,
    trace
  });
}

function classifyTerminalLine(profile, line, recentLines = []) {
  const visibleLine = truncateSummary(line);
  if (!visibleLine) {
    return null;
  }
  const activeProfile = PROFILE_PATTERNS[profile] || PROFILE_PATTERNS["generic-shell"];
  const combinedTail = [...recentLines.slice(-1), visibleLine].filter(Boolean).join(" | ");
  if (/^traceback/i.test(recentLines[recentLines.length - 1] || "")) {
    return {
      type: "session.attention.required",
      severity: "attention",
      summary: `Traceback: ${visibleLine}`,
      threadKey: "attention"
    };
  }
  for (const pattern of activeProfile.attention) {
    if (pattern.test(visibleLine) || pattern.test(combinedTail)) {
      return {
        type: "session.attention.required",
        severity: "attention",
        summary: visibleLine,
        threadKey: "attention"
      };
    }
  }
  for (const pattern of activeProfile.summary) {
    if (pattern.test(visibleLine) || pattern.test(combinedTail)) {
      return {
        type: "session.output.summary",
        severity: "info",
        summary: combinedTail !== visibleLine ? combinedTail : visibleLine,
        threadKey: "status"
      };
    }
  }
  return null;
}

export function applyMessagingMessagePolicy(event, threadState = {}) {
  const type = normalizeNonEmptyString(event?.type);
  const text = normalizeNonEmptyString(event?.text);
  if (!type || !text) {
    return Object.freeze({ action: "suppress", messageKey: event?.threadKey || "status", reason: "empty" });
  }
  const messageKey = normalizeNonEmptyString(event?.threadKey) || "status";
  if (threadState.lastText === text) {
    return Object.freeze({ action: "suppress", messageKey, reason: "duplicate" });
  }
  if (type === "session.lifecycle.created") {
    return Object.freeze({ action: "new", messageKey, reason: "lifecycle_created" });
  }
  if (type === "session.lifecycle.started") {
    return Object.freeze({ action: threadState.messageCreated === true ? "update" : "new", messageKey, reason: "lifecycle_started" });
  }
  if (type === "session.lifecycle.exited") {
    return Object.freeze({
      action: event?.severity === "attention" ? "alert" : "new",
      messageKey: event?.severity === "attention" ? "attention" : messageKey,
      reason: "lifecycle_exited"
    });
  }
  if (type === "session.lifecycle.closed") {
    return Object.freeze({ action: "suppress", messageKey, reason: "lifecycle_closed" });
  }
  if (type === "session.attention.required") {
    return Object.freeze({ action: "alert", messageKey: "attention", reason: "attention_required" });
  }
  if (type === "session.prompt.ready") {
    const lastPromptAt = Number.isInteger(threadState.lastPromptAt) ? threadState.lastPromptAt : 0;
    if (lastPromptAt > 0 && Number.isInteger(event?.occurredAt) && event.occurredAt - lastPromptAt < 800) {
      return Object.freeze({ action: "suppress", messageKey, reason: "prompt_debounce" });
    }
    return Object.freeze({ action: threadState.messageCreated === true ? "update" : "new", messageKey, reason: "prompt_ready" });
  }
  if (
    type === "session.output.summary" ||
    type === "session.activity.idle" ||
    type === "session.control.changed" ||
    type === "session.share.changed"
  ) {
    return Object.freeze({ action: threadState.messageCreated === true ? "update" : "new", messageKey, reason: "status_update" });
  }
  return Object.freeze({ action: "suppress", messageKey, reason: "unsupported" });
}

function buildThreadStateKey(target, sessionId, threadKey) {
  return `${target.chatId}:${Number.isInteger(target.messageThreadId) ? target.messageThreadId : 0}:${sessionId}:${threadKey}`;
}

export function createMessagingRuntime(options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const targetMappings = normalizeMessagingTargets(options.telegramTargets);
  const sessionStates = new Map();
  const threadStates = new Map();
  const eventMetrics = new Map();
  const logDebug = typeof options.logDebug === "function" ? options.logDebug : () => {};
  const adapters = [];
  const telegramEnabled = Boolean(options.telegramBotToken && targetMappings.length > 0);
  const telegramTransportFactory =
    typeof options.createTelegramTransport === "function" ? options.createTelegramTransport : createTelegramTransport;
  const telegramTransport = telegramEnabled
    ? telegramTransportFactory({
        botToken: options.telegramBotToken,
        apiBaseUrl: options.telegramApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;
  const telegramAdapter = createTelegramAdapter({
    enabled: telegramEnabled,
    configuredTargets: targetMappings.length,
    transport: telegramTransport,
    nowFn
  });
  adapters.push(telegramAdapter);

  function bumpEventMetric(profile, type, action) {
    const key = `${profile}:${type}:${action}`;
    eventMetrics.set(key, (eventMetrics.get(key) || 0) + 1);
  }

  function getThreadState(target, sessionId, threadKey) {
    const key = buildThreadStateKey(target, sessionId, threadKey);
    let state = threadStates.get(key);
    if (state) {
      return state;
    }
    state = {
      messageCreated: false,
      lastText: "",
      lastPromptAt: 0,
      lastAction: ""
    };
    threadStates.set(key, state);
    return state;
  }

  function resolveTarget(session) {
    if (!session || !targetMappings.length) {
      return null;
    }
    let bestMatch = null;
    let bestScore = -1;
    for (const target of targetMappings) {
      if (target.sessionId && target.sessionId !== session.id) {
        continue;
      }
      if (target.quickIdToken && target.quickIdToken !== session.quickIdToken) {
        continue;
      }
      if (target.sessionName && target.sessionName !== session.name) {
        continue;
      }
      const score = (target.sessionId ? 100 : 0) + (target.quickIdToken ? 10 : 0) + (target.sessionName ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = target;
      }
    }
    return bestMatch;
  }

  function getOrCreateSessionState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (state) {
      return state;
    }
    state = createSessionStreamState();
    sessionStates.set(sessionId, state);
    return state;
  }

  async function dispatchEvent(event) {
    const target = resolveTarget(event.session);
    if (!target) {
      return null;
    }
    const threadState = getThreadState(target, event.sessionId, event.threadKey);
    const decision = applyMessagingMessagePolicy(event, threadState);
    bumpEventMetric(event.profile, event.type, decision.action);
    if (decision.action === "suppress") {
      return decision;
    }
    let delivered = false;
    for (const adapter of adapters) {
      const result = await adapter.handleEvent({
        ...event,
        target,
        decision
      });
      delivered = delivered || result?.delivered === true;
    }
    if (delivered) {
      threadState.messageCreated = decision.action === "new" || decision.action === "update" ? true : threadState.messageCreated;
      threadState.lastText = event.text;
      threadState.lastAction = decision.action;
      if (event.type === "session.prompt.ready") {
        threadState.lastPromptAt = event.occurredAt;
      }
    }
    logDebug(
      "messaging.event.dispatch",
      {
        sessionId: event.sessionId,
        type: event.type,
        action: decision.action,
        profile: event.profile,
        delivered
      },
      event.trace || null
    );
    return decision;
  }

  function observeControlChange(session, profile, trace) {
    const state = getOrCreateSessionState(session.id);
    const nextSignature = buildControlEventSignature(session);
    if (state.lastControlSignature === nextSignature) {
      return Promise.resolve(null);
    }
    state.lastControlSignature = nextSignature;
    return dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.control.changed",
        summary: buildControlEventSummary(session),
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  async function observeSessionLifecycle(type, session, trace, extra = {}) {
    const target = resolveTarget(session);
    if (!target) {
      return null;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const state = getOrCreateSessionState(session.id);
    if (type === "session.created") {
      state.lastControlSignature = buildControlEventSignature(session);
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.created",
          summary: "Session created.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.started") {
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.started",
          summary: "Session started.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.updated") {
      await observeControlChange(session, profile, trace);
      return null;
    }
    if (type === "session.exit") {
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.exited",
          summary:
            Number.isInteger(extra.exitCode) && extra.exitCode !== 0
              ? `Session exited with code ${extra.exitCode}.`
              : extra.signal
                ? `Session exited with signal ${extra.signal}.`
                : "Session completed.",
          severity: Number.isInteger(extra.exitCode) && extra.exitCode !== 0 ? "attention" : "info",
          threadKey: Number.isInteger(extra.exitCode) && extra.exitCode !== 0 ? "attention" : "status",
          trace,
          nowFn
        })
      );
    }
    if (type === "session.closed") {
      state.lastLifecycleType = type;
      return dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.lifecycle.closed",
          summary: `Session closed${extra.reason ? ` (${extra.reason})` : ""}.`,
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    return null;
  }

  async function observeSessionData({ session, data, promptBoundaries = [], trace }) {
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const state = getOrCreateSessionState(session.id);
    const chunk = typeof data === "string" ? data : String(data ?? "");
    if (Array.isArray(promptBoundaries) && promptBoundaries.length > 0) {
      await dispatchEvent(
        createEvent({
          session,
          profile,
          type: "session.prompt.ready",
          summary: "Prompt ready.",
          threadKey: "status",
          trace,
          nowFn
        })
      );
    }
    if (!chunk) {
      return;
    }
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      const nextChar = chunk[index + 1];
      if (char === "\r" && nextChar === "\n") {
        const classified = classifyTerminalLine(profile, state.pendingLine, state.recentLines);
        if (classified) {
          await dispatchEvent(
            createEvent({
              session,
              profile,
              type: classified.type,
              summary: classified.summary,
              severity: classified.severity,
              threadKey: classified.threadKey,
              trace,
              nowFn
            })
          );
        }
        pushRecentLine(state, truncateSummary(state.pendingLine));
        state.pendingLine = "";
        index += 1;
        continue;
      }
      if (char === "\r") {
        state.pendingLine = "";
        continue;
      }
      if (char === "\n") {
        const classified = classifyTerminalLine(profile, state.pendingLine, state.recentLines);
        if (classified) {
          await dispatchEvent(
            createEvent({
              session,
              profile,
              type: classified.type,
              summary: classified.summary,
              severity: classified.severity,
              threadKey: classified.threadKey,
              trace,
              nowFn
            })
          );
        }
        pushRecentLine(state, truncateSummary(state.pendingLine));
        state.pendingLine = "";
        continue;
      }
      state.pendingLine += char;
    }
  }

  async function observeSessionIdle({ session, trace }) {
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    await dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.activity.idle",
        summary: "Session idle.",
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  async function observeShareChange({ action, shareLink, session, trace }) {
    if (!session) {
      return;
    }
    const target = resolveTarget(session);
    if (!target) {
      return;
    }
    const profile = resolveMessagingTriggerProfile(session, target);
    const targetType = normalizeNonEmptyString(shareLink?.targetType) || "session";
    const summary =
      action === "revoked"
        ? `Share access revoked for ${targetType}.`
        : `Share access created for ${targetType}.`;
    await dispatchEvent(
      createEvent({
        session,
        profile,
        type: "session.share.changed",
        summary,
        threadKey: "status",
        trace,
        nowFn
      })
    );
  }

  function buildStatusSummary() {
    return {
      enabled: telegramEnabled,
      adapters: adapters.map((adapter) => adapter.getStatus())
    };
  }

  function renderMetricLines() {
    const lines = [];
    for (const [key, count] of eventMetrics.entries()) {
      const [profile, eventType, action] = key.split(":");
      lines.push(
        `ptydeck_messaging_events_total{profile="${profile}",event_type="${eventType}",decision="${action}"} ${count}`
      );
    }
    for (const adapter of adapters) {
      lines.push(...adapter.renderMetricLines());
    }
    return lines;
  }

  return {
    observeSessionLifecycle,
    observeSessionData,
    observeSessionIdle,
    observeShareChange,
    buildStatusSummary,
    renderMetricLines
  };
}
