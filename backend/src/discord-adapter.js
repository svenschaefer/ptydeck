import {
  buildDeliveryEventFromMessageIntent,
  buildFallbackSessionLabel,
  createDefaultMessageIntentDecision,
  normalizeNonEmptyString
} from "./delivery-adapter-utils.js";

const DEFAULT_DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const MAX_DISCORD_TARGET_TRACE_ENTRIES = 25;
const MAX_DISCORD_EVENT_SUMMARY_LENGTH = 280;

function normalizeDiscordApiBaseUrl(value) {
  const normalized = normalizeNonEmptyString(value);
  return normalized || DEFAULT_DISCORD_API_BASE_URL;
}

function buildTargetStateKey(target, threadKey) {
  const stateKey = normalizeNonEmptyString(target?.stateKey);
  if (stateKey) {
    return `${stateKey}:${String(threadKey || "status")}`;
  }
  return `${normalizeNonEmptyString(target?.channelId || target?.chatId)}:${Number.isInteger(target?.threadId || target?.messageThreadId) ? target.threadId || target.messageThreadId : 0}:${String(threadKey || "status")}`;
}

function normalizeWebhookUrl(value, apiBaseUrl = DEFAULT_DISCORD_API_BASE_URL) {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized);
    const apiBase = new URL(normalizeDiscordApiBaseUrl(apiBaseUrl));
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    if (!url.pathname.startsWith(`${apiBase.pathname.replace(/\/$/, "")}/webhooks/`) && !url.pathname.startsWith("/api/webhooks/")) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeThreadId(value) {
  if (Number.isInteger(value) && value > 0) {
    return String(value);
  }
  const normalized = normalizeNonEmptyString(value);
  return normalized || "";
}

function appendDiscordQuery(urlString, query = {}) {
  const url = new URL(urlString);
  for (const [key, value] of Object.entries(query)) {
    const normalized = normalizeNonEmptyString(value);
    if (!normalized) {
      continue;
    }
    url.searchParams.set(key, normalized);
  }
  return url.toString();
}

async function parseDiscordResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = normalizeNonEmptyString(payload?.message) || `Discord API request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

export function createDiscordTransport({ apiBaseUrl = DEFAULT_DISCORD_API_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Discord transport requires a fetch implementation.");
  }
  const normalizedApiBaseUrl = normalizeDiscordApiBaseUrl(apiBaseUrl);

  async function sendMessage({ webhookUrl, threadId, text }) {
    const normalizedWebhookUrl = normalizeWebhookUrl(webhookUrl, normalizedApiBaseUrl);
    if (!normalizedWebhookUrl) {
      throw new Error("Discord sendMessage requires a valid webhookUrl.");
    }
    const url = appendDiscordQuery(normalizedWebhookUrl, {
      wait: "true",
      thread_id: normalizeThreadId(threadId)
    });
    const result = await parseDiscordResponse(
      await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: String(text || ""),
          allowed_mentions: { parse: [] }
        })
      })
    );
    return {
      messageId: normalizeNonEmptyString(result?.id),
      raw: result
    };
  }

  async function editMessage({ webhookUrl, threadId, messageId, text }) {
    const normalizedWebhookUrl = normalizeWebhookUrl(webhookUrl, normalizedApiBaseUrl);
    const normalizedMessageId = normalizeNonEmptyString(messageId);
    if (!normalizedWebhookUrl || !normalizedMessageId) {
      throw new Error("Discord editMessage requires a valid webhookUrl and messageId.");
    }
    const baseUrl = normalizedWebhookUrl.replace(/\/$/, "");
    const url = appendDiscordQuery(`${baseUrl}/messages/${normalizedMessageId}`, {
      wait: "true",
      thread_id: normalizeThreadId(threadId)
    });
    const result = await parseDiscordResponse(
      await fetchImpl(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: String(text || ""),
          allowed_mentions: { parse: [] }
        })
      })
    );
    return {
      messageId: normalizeNonEmptyString(result?.id) || normalizedMessageId,
      raw: result
    };
  }

  return {
    sendMessage,
    editMessage
  };
}

export function createDiscordAdapter({
  configured = false,
  deliveryEnabled = false,
  allowlistDeliveryScopes = [],
  allowlistDeliverySignals = [],
  configuredTargets = 0,
  transport = null,
  nowFn = () => Date.now(),
  logDebug = () => {},
  formatSessionLabel = buildFallbackSessionLabel,
  applyMessagePolicy = null,
  advanceThreadPolicyState = null
} = {}) {
  const normalizedAllowlistDeliveryScopes = Array.isArray(allowlistDeliveryScopes)
    ? allowlistDeliveryScopes.map((entry) => normalizeNonEmptyString(entry)).filter(Boolean)
    : [];
  const normalizedAllowlistDeliverySignals = Array.isArray(allowlistDeliverySignals)
    ? allowlistDeliverySignals.map((entry) => normalizeNonEmptyString(entry)).filter(Boolean)
    : [];
  const threadStates = new Map();
  const targetTraceEntries = [];
  let targetTraceCapturedTotal = 0;
  const metrics = {
    deliveredTotal: 0,
    updatedTotal: 0,
    alertedTotal: 0,
    failedTotal: 0,
    lastDeliveredAt: null,
    lastErrorAt: null,
    lastError: ""
  };

  function getThreadState(target, threadKey) {
    const key = buildTargetStateKey(target, threadKey);
    let state = threadStates.get(key);
    if (state) {
      return state;
    }
    state = {
      messageId: "",
      messageCreated: false,
      lastText: "",
      lastUpdatedAt: null
    };
    threadStates.set(key, state);
    return state;
  }

  function recordTargetObservation(target, outcome, extra = {}) {
    targetTraceCapturedTotal += 1;
    targetTraceEntries.push(
      Object.freeze({
        recordedAt: nowFn(),
        outcome: normalizeNonEmptyString(outcome),
        channelId: normalizeNonEmptyString(target?.channelId || target?.chatId),
        threadId: normalizeThreadId(target?.threadId || target?.messageThreadId) || null,
        webhookUrl: normalizeNonEmptyString(target?.webhookUrl),
        ...extra
      })
    );
    if (targetTraceEntries.length > MAX_DISCORD_TARGET_TRACE_ENTRIES) {
      targetTraceEntries.splice(0, targetTraceEntries.length - MAX_DISCORD_TARGET_TRACE_ENTRIES);
    }
  }

  function canDeliverEvent(event) {
    const deliveryScope = normalizeNonEmptyString(event?.deliveryScope || event?.aggregationReason);
    const deliverySignal = normalizeNonEmptyString(event?.deliverySignal || event?.messageIntent?.metadata?.deliverySignal || event?.messageIntent?.intentKind);
    if (deliveryEnabled) {
      return true;
    }
    return Boolean(
      (deliveryScope && normalizedAllowlistDeliveryScopes.includes(deliveryScope)) ||
        (deliverySignal && normalizedAllowlistDeliverySignals.includes(deliverySignal))
    );
  }

  async function ensureTarget(target) {
    if (!configured) {
      return { ok: false, reason: "disabled", target };
    }
    if (!normalizeNonEmptyString(target?.channelId || target?.chatId) || !normalizeWebhookUrl(target?.webhookUrl)) {
      recordTargetObservation(target, "target_invalid", { ok: false });
      return { ok: false, reason: "invalid_target", target };
    }
    recordTargetObservation(target, "target_validated", { ok: true });
    return { ok: true, target };
  }

  async function deliverPreparedEvent({ event, decision, effectiveTarget }) {
    const action = normalizeNonEmptyString(decision?.action);
    if (!action || action === "suppress") {
      return { delivered: false, skipped: true, reason: "suppressed", decision, event, target: effectiveTarget };
    }
    const text = normalizeNonEmptyString(event?.text);
    if (!text) {
      return { delivered: false, skipped: true, reason: "empty", decision, event, target: effectiveTarget };
    }
    if (!canDeliverEvent(event)) {
      return { delivered: false, skipped: true, reason: "delivery_disabled", decision, event, target: effectiveTarget };
    }
    const state = getThreadState(effectiveTarget, decision?.messageKey || event?.threadKey || "status");
    if (typeof advanceThreadPolicyState === "function") {
      advanceThreadPolicyState(state, event, decision, { delivered: false });
    }
    try {
      let result = null;
      if (action === "update") {
        if (normalizeNonEmptyString(state.messageId)) {
          try {
            result = await transport.editMessage({
              webhookUrl: effectiveTarget.webhookUrl,
              threadId: effectiveTarget.threadId || effectiveTarget.messageThreadId,
              messageId: state.messageId,
              text
            });
          } catch {
            result = await transport.sendMessage({
              webhookUrl: effectiveTarget.webhookUrl,
              threadId: effectiveTarget.threadId || effectiveTarget.messageThreadId,
              text
            });
          }
        } else {
          result = await transport.sendMessage({
            webhookUrl: effectiveTarget.webhookUrl,
            threadId: effectiveTarget.threadId || effectiveTarget.messageThreadId,
            text
          });
        }
        state.messageId = normalizeNonEmptyString(result?.messageId) || state.messageId;
        state.lastText = text;
        state.lastUpdatedAt = nowFn();
        metrics.deliveredTotal += 1;
        metrics.updatedTotal += 1;
        metrics.lastDeliveredAt = state.lastUpdatedAt;
        metrics.lastErrorAt = null;
        metrics.lastError = "";
        if (typeof advanceThreadPolicyState === "function") {
          advanceThreadPolicyState(state, event, decision, { delivered: true });
        }
        return {
          delivered: true,
          action,
          decision,
          event,
          messageId: state.messageId,
          target: effectiveTarget
        };
      }

      result = await transport.sendMessage({
        webhookUrl: effectiveTarget.webhookUrl,
        threadId: effectiveTarget.threadId || effectiveTarget.messageThreadId,
        text
      });
      state.messageId = normalizeNonEmptyString(result?.messageId) || state.messageId;
      state.lastText = text;
      state.lastUpdatedAt = nowFn();
      metrics.deliveredTotal += 1;
      if (action === "alert") {
        metrics.alertedTotal += 1;
      }
      metrics.lastDeliveredAt = state.lastUpdatedAt;
      metrics.lastErrorAt = null;
      metrics.lastError = "";
      if (typeof advanceThreadPolicyState === "function") {
        advanceThreadPolicyState(state, event, decision, { delivered: true });
      }
      return {
        delivered: true,
        action,
        decision,
        event,
        messageId: state.messageId,
        target: effectiveTarget
      };
    } catch (error) {
      metrics.failedTotal += 1;
      metrics.lastErrorAt = nowFn();
      metrics.lastError = error instanceof Error ? error.message : String(error || "Discord adapter delivery failed.");
      logDebug(
        "messaging.discord.delivery_failed",
        {
          channelId: normalizeNonEmptyString(effectiveTarget?.channelId || effectiveTarget?.chatId),
          threadId: normalizeThreadId(effectiveTarget?.threadId || effectiveTarget?.messageThreadId) || null,
          error: metrics.lastError,
          action
        },
        event?.trace || null
      );
      return {
        delivered: false,
        action,
        decision,
        event,
        error: metrics.lastError,
        target: effectiveTarget
      };
    }
  }

  async function handleMessageIntent({ target, session, profile = "", trace = null, intent } = {}) {
    if (!configured) {
      return { delivered: false, skipped: true, reason: "disabled" };
    }
    if (!intent || intent.entityType !== "MessageIntent") {
      return { delivered: false, skipped: true, reason: "invalid_intent" };
    }
    if (!normalizeNonEmptyString(target?.channelId || target?.chatId) || !normalizeWebhookUrl(target?.webhookUrl)) {
      return { delivered: false, skipped: true, reason: "unmapped" };
    }
    const event = buildDeliveryEventFromMessageIntent(intent, {
      session,
      profile,
      trace,
      nowFn,
      formatSessionLabel,
      maxEventSummaryLength: MAX_DISCORD_EVENT_SUMMARY_LENGTH
    });
    const state = getThreadState(target, event.threadKey);
    const decision =
      typeof applyMessagePolicy === "function"
        ? applyMessagePolicy(event, state)
        : createDefaultMessageIntentDecision(event, state);
    return deliverPreparedEvent({ event, decision, effectiveTarget: target });
  }

  async function handleEvent(event) {
    if (!configured) {
      return { delivered: false, skipped: true, reason: "disabled" };
    }
    const target = event?.target;
    if (!normalizeNonEmptyString(target?.channelId || target?.chatId) || !normalizeWebhookUrl(target?.webhookUrl)) {
      return { delivered: false, skipped: true, reason: "unmapped" };
    }
    const decision = event?.decision || { action: "", messageKey: event?.threadKey || "status", reason: "" };
    return deliverPreparedEvent({ event, decision, effectiveTarget: target });
  }

  function getStatus() {
    return {
      adapter: "discord",
      enabled: configured,
      deliveryEnabled,
      allowlistDeliveryActive:
        !deliveryEnabled && (normalizedAllowlistDeliveryScopes.length > 0 || normalizedAllowlistDeliverySignals.length > 0),
      allowlistDeliveryScopes: normalizedAllowlistDeliveryScopes.slice(),
      allowlistDeliverySignals: normalizedAllowlistDeliverySignals.slice(),
      configuredTargets,
      deliveredTotal: metrics.deliveredTotal,
      updatedTotal: metrics.updatedTotal,
      alertedTotal: metrics.alertedTotal,
      failedTotal: metrics.failedTotal,
      lastDeliveredAt: metrics.lastDeliveredAt,
      lastErrorAt: metrics.lastErrorAt,
      lastError: metrics.lastError,
      targetTrace: {
        capacity: MAX_DISCORD_TARGET_TRACE_ENTRIES,
        capturedTotal: targetTraceCapturedTotal,
        recent: targetTraceEntries.slice(-MAX_DISCORD_TARGET_TRACE_ENTRIES)
      }
    };
  }

  function renderMetricLines() {
    const enabledValue = configured ? 1 : 0;
    const deliveryEnabledValue = deliveryEnabled ? 1 : 0;
    const allowlistDeliveryValue =
      !deliveryEnabled && (normalizedAllowlistDeliveryScopes.length > 0 || normalizedAllowlistDeliverySignals.length > 0)
        ? 1
        : 0;
    return [
      `ptydeck_messaging_adapter_enabled{adapter="discord"} ${enabledValue}`,
      `ptydeck_messaging_delivery_enabled{adapter="discord"} ${deliveryEnabledValue}`,
      `ptydeck_messaging_allowlist_delivery_enabled{adapter="discord"} ${allowlistDeliveryValue}`,
      `ptydeck_messaging_adapter_configured_targets{adapter="discord"} ${configuredTargets}`,
      `ptydeck_messaging_deliveries_total{adapter="discord",outcome="success"} ${metrics.deliveredTotal}`,
      `ptydeck_messaging_deliveries_total{adapter="discord",outcome="failure"} ${metrics.failedTotal}`,
      `ptydeck_messaging_actions_total{adapter="discord",action="update"} ${metrics.updatedTotal}`,
      `ptydeck_messaging_actions_total{adapter="discord",action="alert"} ${metrics.alertedTotal}`
    ];
  }

  return {
    ensureTarget,
    handleMessageIntent,
    handleEvent,
    getStatus,
    renderMetricLines
  };
}
