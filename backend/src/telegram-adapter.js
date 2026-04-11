const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_CALLBACK_PREFIX = "ptydeck:";
const DEFAULT_POLL_TIMEOUT_SECONDS = 3;
const POLL_RETRY_DELAY_MS = 250;
const TELEGRAM_ALLOWED_UPDATES = Object.freeze(["message", "callback_query"]);
const TELEGRAM_RATE_LIMIT_PATTERN = /\bretry after\s+(\d+)\b/i;

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeTelegramApiBaseUrl(value) {
  const normalized = normalizeNonEmptyString(value);
  return normalized || DEFAULT_TELEGRAM_API_BASE_URL;
}

function normalizeChatId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return normalizeNonEmptyString(value);
}

function buildTargetStateKey(target, threadKey) {
  const chatId = normalizeChatId(target?.chatId);
  const messageThreadId = Number.isInteger(target?.messageThreadId) ? target.messageThreadId : 0;
  return `${chatId}:${messageThreadId}:${String(threadKey || "status")}`;
}

function buildTelegramReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "Status", callback_data: `${TELEGRAM_CALLBACK_PREFIX}status` },
        { text: "Replay", callback_data: `${TELEGRAM_CALLBACK_PREFIX}replay` }
      ],
      [
        { text: "Stop", callback_data: `${TELEGRAM_CALLBACK_PREFIX}stop` },
        { text: "Retry", callback_data: `${TELEGRAM_CALLBACK_PREFIX}retry` }
      ]
    ]
  };
}

function normalizeTelegramPollTimeoutSeconds(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_POLL_TIMEOUT_SECONDS;
}

async function parseTelegramResponse(response) {
  const payload = await response.json().catch(() => null);
  const hasResult = payload && Object.prototype.hasOwnProperty.call(payload, "result");
  if (!response.ok || payload?.ok !== true || !hasResult) {
    const description =
      typeof payload?.description === "string" && payload.description.trim()
        ? payload.description.trim()
        : `Telegram API request failed with status ${response.status}.`;
    throw new Error(description);
  }
  return payload.result;
}

function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateCallbackText(value, maxLength = 120) {
  const normalized = normalizeNonEmptyString(value).replace(/\s+/g, " ");
  if (!normalized) {
    return "Action processed.";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function parseTelegramRateLimitMetadata(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(TELEGRAM_RATE_LIMIT_PATTERN);
  if (!match) {
    return {
      rateLimited: false,
      retryAfterSeconds: null,
      recommendedBackoffMs: null
    };
  }
  const retryAfterSeconds = Number.parseInt(match[1], 10);
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return {
      rateLimited: false,
      retryAfterSeconds: null,
      recommendedBackoffMs: null
    };
  }
  return {
    rateLimited: true,
    retryAfterSeconds,
    recommendedBackoffMs: retryAfterSeconds * 1000
  };
}

export function parseTelegramInboundCommand(input = {}) {
  const callbackData = normalizeNonEmptyString(input.callbackData);
  if (callbackData) {
    if (!callbackData.startsWith(TELEGRAM_CALLBACK_PREFIX)) {
      return null;
    }
    const token = callbackData.slice(TELEGRAM_CALLBACK_PREFIX.length);
    if (token === "status" || token === "stop" || token === "retry" || token === "replay") {
      return Object.freeze({ action: token });
    }
    if (token.startsWith("replay:")) {
      const selector = normalizeNonEmptyString(token.slice("replay:".length));
      if (!selector || /\s/.test(selector)) {
        return null;
      }
      return Object.freeze({ action: "replay", selector });
    }
    return null;
  }

  const text = normalizeNonEmptyString(input.text);
  if (!text) {
    return null;
  }
  const match = text.match(/^\/(status|stop|retry|replay)(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }
  const action = String(match[1] || "").toLowerCase();
  const rawArg = normalizeNonEmptyString(match[2]);
  if (action === "replay") {
    if (!rawArg) {
      return Object.freeze({ action });
    }
    if (/\s/.test(rawArg)) {
      return null;
    }
    return Object.freeze({ action, selector: rawArg });
  }
  if (rawArg) {
    return null;
  }
  return Object.freeze({ action });
}

function normalizeTelegramInboundUpdate(update = {}) {
  const updateId = Number.isInteger(update?.update_id) ? update.update_id : null;
  const callbackQuery = update?.callback_query;
  if (callbackQuery && typeof callbackQuery === "object") {
    const message = callbackQuery.message && typeof callbackQuery.message === "object" ? callbackQuery.message : null;
    const chatId = normalizeChatId(message?.chat?.id);
    const command = parseTelegramInboundCommand({ callbackData: callbackQuery.data });
    if (!chatId || !command) {
      return null;
    }
    return {
      updateId,
      source: "callback",
      callbackQueryId: normalizeNonEmptyString(callbackQuery.id),
      target: {
        chatId,
        ...(Number.isInteger(message?.message_thread_id) ? { messageThreadId: message.message_thread_id } : {})
      },
      command
    };
  }

  const message = update?.message;
  if (message && typeof message === "object") {
    const chatId = normalizeChatId(message?.chat?.id);
    const command = parseTelegramInboundCommand({ text: message.text });
    if (!chatId || !command) {
      return null;
    }
    return {
      updateId,
      source: "message",
      target: {
        chatId,
        ...(Number.isInteger(message?.message_thread_id) ? { messageThreadId: message.message_thread_id } : {})
      },
      command
    };
  }

  return null;
}

export function createTelegramTransport(options = {}) {
  const botToken = normalizeNonEmptyString(options.botToken);
  if (!botToken) {
    throw new Error("Telegram transport requires a bot token.");
  }
  const apiBaseUrl = normalizeTelegramApiBaseUrl(options.apiBaseUrl);
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Telegram transport requires a fetch implementation.");
  }

  async function request(methodName, body, requestOptions = {}) {
    const response = await fetchImpl(`${apiBaseUrl}/bot${botToken}/${methodName}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      ...(requestOptions.signal ? { signal: requestOptions.signal } : {})
    });
    return parseTelegramResponse(response);
  }

  return {
    async sendMessage({ chatId, messageThreadId, text, replyMarkup }) {
      const result = await request("sendMessage", {
        chat_id: chatId,
        ...(Number.isInteger(messageThreadId) ? { message_thread_id: messageThreadId } : {}),
        text: String(text || ""),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
      return {
        messageId: Number.isInteger(result?.message_id) ? result.message_id : null,
        raw: result
      };
    },
    async editMessage({ chatId, messageId, messageThreadId, text, replyMarkup }) {
      const result = await request("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        ...(Number.isInteger(messageThreadId) ? { message_thread_id: messageThreadId } : {}),
        text: String(text || ""),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
      return {
        messageId: Number.isInteger(result?.message_id) ? result.message_id : messageId,
        raw: result
      };
    },
    async getUpdates({ offset, timeoutSeconds, limit, allowedUpdates, signal } = {}) {
      const result = await request(
        "getUpdates",
        {
          ...(Number.isInteger(offset) ? { offset } : {}),
          timeout: normalizeTelegramPollTimeoutSeconds(timeoutSeconds),
          ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
          ...(Array.isArray(allowedUpdates) && allowedUpdates.length > 0 ? { allowed_updates: allowedUpdates } : {})
        },
        { signal }
      );
      return Array.isArray(result) ? result : [];
    },
    async answerCallbackQuery({ callbackQueryId, text, showAlert = false, signal } = {}) {
      return request(
        "answerCallbackQuery",
        {
          callback_query_id: String(callbackQueryId || ""),
          ...(text ? { text: String(text) } : {}),
          ...(showAlert ? { show_alert: true } : {})
        },
        { signal }
      );
    }
  };
}

export function createTelegramAdapter(options = {}) {
  const enabled = options.enabled === true;
  const inboundEnabled = enabled && options.inboundEnabled === true;
  const transport = enabled ? options.transport : null;
  if (enabled && (!transport || typeof transport.sendMessage !== "function" || typeof transport.editMessage !== "function")) {
    throw new Error("Telegram adapter requires sendMessage/editMessage transport methods when enabled.");
  }
  if (
    inboundEnabled &&
    (!transport || typeof transport.getUpdates !== "function" || typeof transport.answerCallbackQuery !== "function")
  ) {
    throw new Error("Telegram inbound adapter requires getUpdates/answerCallbackQuery transport methods when enabled.");
  }
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const configuredTargets = Number.isInteger(options.configuredTargets) && options.configuredTargets >= 0 ? options.configuredTargets : 0;
  const pollTimeoutSeconds = normalizeTelegramPollTimeoutSeconds(options.pollTimeoutSeconds);
  const threadState = new Map();
  const replyMarkup = inboundEnabled ? buildTelegramReplyMarkup() : null;
  const metrics = {
    deliveredTotal: 0,
    updatedTotal: 0,
    alertedTotal: 0,
    failedTotal: 0,
    lastDeliveredAt: null,
    lastErrorAt: null,
    lastError: "",
    lastRateLimitedAt: null,
    lastRetryAfterSeconds: null,
    lastRecommendedBackoffMs: null,
    backoffUntil: null,
    inboundHandledTotal: 0,
    inboundFailedTotal: 0,
    inboundBacklogSkippedTotal: 0,
    lastInboundAt: null,
    lastInboundErrorAt: null,
    lastInboundError: "",
    pollingActive: false
  };
  const pollState = {
    stopRequested: false,
    promise: null,
    abortController: null,
    nextUpdateOffset: null
  };

  function getThreadState(target, threadKey) {
    const stateKey = buildTargetStateKey(target, threadKey);
    let state = threadState.get(stateKey);
    if (state) {
      return state;
    }
    state = {
      messageId: null,
      lastText: "",
      lastUpdatedAt: null
    };
    threadState.set(stateKey, state);
    return state;
  }

  async function handleEvent(event) {
    if (!enabled) {
      return { delivered: false, skipped: true, reason: "disabled" };
    }
    const target = event?.target;
    if (!target?.chatId) {
      return { delivered: false, skipped: true, reason: "unmapped" };
    }
    const action = String(event?.decision?.action || "");
    if (!action || action === "suppress") {
      return { delivered: false, skipped: true, reason: "suppressed" };
    }
    const state = getThreadState(target, event.decision?.messageKey || event.threadKey || "status");
    const text = String(event.text || "").trim();
    if (!text) {
      return { delivered: false, skipped: true, reason: "empty" };
    }
    const now = nowFn();
    if (Number.isInteger(metrics.backoffUntil) && now < metrics.backoffUntil) {
      const remainingMs = Math.max(1, metrics.backoffUntil - now);
      return {
        delivered: false,
        skipped: true,
        reason: "backoff_active",
        action,
        rateLimited: true,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
        recommendedBackoffMs: remainingMs
      };
    }

    try {
      let result = null;
      if (action === "update") {
        if (Number.isInteger(state.messageId)) {
          try {
            result = await transport.editMessage({
              chatId: target.chatId,
              messageThreadId: target.messageThreadId,
              messageId: state.messageId,
              text,
              ...(replyMarkup ? { replyMarkup } : {})
            });
          } catch {
            result = await transport.sendMessage({
              chatId: target.chatId,
              messageThreadId: target.messageThreadId,
              text,
              ...(replyMarkup ? { replyMarkup } : {})
            });
          }
        } else {
          result = await transport.sendMessage({
            chatId: target.chatId,
            messageThreadId: target.messageThreadId,
            text,
            ...(replyMarkup ? { replyMarkup } : {})
          });
        }
        state.messageId = Number.isInteger(result?.messageId) ? result.messageId : state.messageId;
        state.lastText = text;
        state.lastUpdatedAt = nowFn();
        metrics.deliveredTotal += 1;
        metrics.updatedTotal += 1;
        metrics.lastDeliveredAt = state.lastUpdatedAt;
        metrics.backoffUntil = null;
        return { delivered: true, action, messageId: state.messageId };
      }

      result = await transport.sendMessage({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        text,
        ...(replyMarkup ? { replyMarkup } : {})
      });
      if (action === "new" || action === "alert") {
        state.messageId = Number.isInteger(result?.messageId) ? result.messageId : state.messageId;
        state.lastText = text;
        state.lastUpdatedAt = nowFn();
      }
      metrics.deliveredTotal += 1;
      if (action === "alert") {
        metrics.alertedTotal += 1;
      }
      metrics.lastDeliveredAt = nowFn();
      metrics.backoffUntil = null;
      return {
        delivered: true,
        action,
        messageId: Number.isInteger(result?.messageId) ? result.messageId : null
      };
    } catch (error) {
      const rateLimit = parseTelegramRateLimitMetadata(error);
      metrics.failedTotal += 1;
      metrics.lastErrorAt = nowFn();
      metrics.lastError = error instanceof Error ? error.message : String(error || "Telegram adapter delivery failed.");
      metrics.lastRateLimitedAt = rateLimit.rateLimited ? metrics.lastErrorAt : metrics.lastRateLimitedAt;
      metrics.lastRetryAfterSeconds = rateLimit.rateLimited ? rateLimit.retryAfterSeconds : metrics.lastRetryAfterSeconds;
      metrics.lastRecommendedBackoffMs = rateLimit.rateLimited
        ? rateLimit.recommendedBackoffMs
        : metrics.lastRecommendedBackoffMs;
      metrics.backoffUntil =
        rateLimit.rateLimited && Number.isInteger(rateLimit.recommendedBackoffMs)
          ? metrics.lastErrorAt + rateLimit.recommendedBackoffMs
          : metrics.backoffUntil;
      return {
        delivered: false,
        action,
        error: metrics.lastError,
        ...rateLimit
      };
    }
  }

  function updateNextOffset(updates) {
    for (const update of Array.isArray(updates) ? updates : []) {
      if (!Number.isInteger(update?.update_id)) {
        continue;
      }
      const candidate = update.update_id + 1;
      if (!Number.isInteger(pollState.nextUpdateOffset) || candidate > pollState.nextUpdateOffset) {
        pollState.nextUpdateOffset = candidate;
      }
    }
  }

  async function requestUpdates(timeoutSeconds = pollTimeoutSeconds) {
    const abortController = typeof AbortController === "function" ? new AbortController() : null;
    pollState.abortController = abortController;
    try {
      const updates = await transport.getUpdates({
        offset: pollState.nextUpdateOffset,
        timeoutSeconds,
        limit: 100,
        allowedUpdates: TELEGRAM_ALLOWED_UPDATES,
        ...(abortController ? { signal: abortController.signal } : {})
      });
      updateNextOffset(updates);
      return Array.isArray(updates) ? updates : [];
    } finally {
      pollState.abortController = null;
    }
  }

  async function drainBacklog() {
    while (!pollState.stopRequested) {
      const updates = await requestUpdates(0);
      if (!Array.isArray(updates) || updates.length === 0) {
        return;
      }
      metrics.inboundBacklogSkippedTotal += updates.length;
      if (updates.length < 100) {
        return;
      }
    }
  }

  async function emitInboundResponse(inbound, result = {}) {
    const responseText = normalizeNonEmptyString(result.text);
    if (!responseText) {
      return;
    }
    await transport.sendMessage({
      chatId: inbound.target.chatId,
      messageThreadId: inbound.target.messageThreadId,
      text: responseText,
      ...(replyMarkup ? { replyMarkup } : {})
    });
  }

  async function acknowledgeCallback(inbound, result = {}) {
    if (!inbound.callbackQueryId) {
      return;
    }
    await transport.answerCallbackQuery({
      callbackQueryId: inbound.callbackQueryId,
      text: truncateCallbackText(result.callbackText || result.text),
      showAlert: result.ok === false
    });
  }

  async function startInbound(options = {}) {
    if (!enabled || !inboundEnabled) {
      return { started: false, reason: enabled ? "inbound_disabled" : "disabled" };
    }
    if (pollState.promise) {
      return { started: true, reason: "already_started" };
    }
    const onCommand = typeof options.onCommand === "function" ? options.onCommand : null;
    if (!onCommand) {
      throw new Error("Telegram inbound adapter requires an onCommand handler.");
    }
    pollState.stopRequested = false;
    metrics.pollingActive = true;
    pollState.promise = (async () => {
      try {
        try {
          while (!pollState.stopRequested) {
            try {
              await drainBacklog();
              break;
            } catch (error) {
              if (isAbortError(error) && pollState.stopRequested) {
                break;
              }
              metrics.inboundFailedTotal += 1;
              metrics.lastInboundErrorAt = nowFn();
              metrics.lastInboundError =
                error instanceof Error ? error.message : String(error || "Telegram inbound polling failed.");
              await delay(POLL_RETRY_DELAY_MS);
            }
          }
          while (!pollState.stopRequested) {
            let updates = [];
            try {
              updates = await requestUpdates(pollTimeoutSeconds);
            } catch (error) {
              if (isAbortError(error) && pollState.stopRequested) {
                break;
              }
              metrics.inboundFailedTotal += 1;
              metrics.lastInboundErrorAt = nowFn();
              metrics.lastInboundError = error instanceof Error ? error.message : String(error || "Telegram inbound polling failed.");
              await delay(POLL_RETRY_DELAY_MS);
              continue;
            }
            for (const update of updates) {
              if (pollState.stopRequested) {
                break;
              }
              const inbound = normalizeTelegramInboundUpdate(update);
              if (!inbound) {
                continue;
              }
              try {
                const result = await onCommand(inbound);
                await acknowledgeCallback(inbound, result);
                await emitInboundResponse(inbound, result);
                metrics.inboundHandledTotal += 1;
                metrics.lastInboundAt = nowFn();
              } catch (error) {
                metrics.inboundFailedTotal += 1;
                metrics.lastInboundErrorAt = nowFn();
                metrics.lastInboundError = error instanceof Error ? error.message : String(error || "Telegram inbound command failed.");
                try {
                  await acknowledgeCallback(inbound, { ok: false, text: metrics.lastInboundError });
                } catch {
                  // Ignore callback acknowledgement failures after the command already failed.
                }
              }
            }
          }
        } catch (error) {
          metrics.inboundFailedTotal += 1;
          metrics.lastInboundErrorAt = nowFn();
          metrics.lastInboundError = error instanceof Error ? error.message : String(error || "Telegram inbound loop failed.");
        }
      } finally {
        metrics.pollingActive = false;
        pollState.abortController = null;
        pollState.promise = null;
      }
    })();
    return { started: true };
  }

  async function stop() {
    pollState.stopRequested = true;
    if (pollState.abortController) {
      pollState.abortController.abort();
    }
    if (pollState.promise) {
      await pollState.promise;
    }
  }

  function getStatus() {
    const now = nowFn();
    const backoffActive = Number.isInteger(metrics.backoffUntil) && metrics.backoffUntil > now;
    const backoffRemainingMs = backoffActive ? metrics.backoffUntil - now : 0;
    return {
      adapter: "telegram",
      enabled,
      inboundEnabled,
      configuredTargets,
      deliveredTotal: metrics.deliveredTotal,
      updatedTotal: metrics.updatedTotal,
      alertedTotal: metrics.alertedTotal,
      failedTotal: metrics.failedTotal,
      lastDeliveredAt: metrics.lastDeliveredAt,
      lastErrorAt: metrics.lastErrorAt,
      lastError: metrics.lastError,
      lastRateLimitedAt: metrics.lastRateLimitedAt,
      lastRetryAfterSeconds: metrics.lastRetryAfterSeconds,
      lastRecommendedBackoffMs: metrics.lastRecommendedBackoffMs,
      backoffActive,
      backoffUntil: Number.isInteger(metrics.backoffUntil) ? metrics.backoffUntil : null,
      backoffRemainingMs,
      inboundHandledTotal: metrics.inboundHandledTotal,
      inboundFailedTotal: metrics.inboundFailedTotal,
      inboundBacklogSkippedTotal: metrics.inboundBacklogSkippedTotal,
      lastInboundAt: metrics.lastInboundAt,
      lastInboundErrorAt: metrics.lastInboundErrorAt,
      lastInboundError: metrics.lastInboundError,
      pollingActive: metrics.pollingActive,
      pollTimeoutSeconds
    };
  }

  function renderMetricLines() {
    const enabledValue = enabled ? 1 : 0;
    const inboundEnabledValue = inboundEnabled ? 1 : 0;
    const pollingValue = metrics.pollingActive ? 1 : 0;
    return [
      `ptydeck_messaging_adapter_enabled{adapter="telegram"} ${enabledValue}`,
      `ptydeck_messaging_adapter_configured_targets{adapter="telegram"} ${configuredTargets}`,
      `ptydeck_messaging_inbound_enabled{adapter="telegram"} ${inboundEnabledValue}`,
      `ptydeck_messaging_inbound_polling{adapter="telegram"} ${pollingValue}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="success"} ${metrics.deliveredTotal}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="failure"} ${metrics.failedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="update"} ${metrics.updatedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="alert"} ${metrics.alertedTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="handled"} ${metrics.inboundHandledTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="failure"} ${metrics.inboundFailedTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="skipped_backlog"} ${metrics.inboundBacklogSkippedTotal}`
    ];
  }

  return {
    handleEvent,
    startInbound,
    stop,
    getStatus,
    renderMetricLines
  };
}
