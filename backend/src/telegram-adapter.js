const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized;
}

function normalizeTelegramApiBaseUrl(value) {
  const normalized = normalizeNonEmptyString(value);
  return normalized || DEFAULT_TELEGRAM_API_BASE_URL;
}

function buildTargetStateKey(target, threadKey) {
  const chatId = String(target?.chatId || "").trim();
  const messageThreadId = Number.isInteger(target?.messageThreadId) ? target.messageThreadId : 0;
  return `${chatId}:${messageThreadId}:${String(threadKey || "status")}`;
}

async function parseTelegramResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload?.result) {
    const description =
      typeof payload?.description === "string" && payload.description.trim()
        ? payload.description.trim()
        : `Telegram API request failed with status ${response.status}.`;
    throw new Error(description);
  }
  return payload.result;
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

  async function request(methodName, body) {
    const response = await fetchImpl(`${apiBaseUrl}/bot${botToken}/${methodName}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return parseTelegramResponse(response);
  }

  return {
    async sendMessage({ chatId, messageThreadId, text }) {
      const result = await request("sendMessage", {
        chat_id: chatId,
        ...(Number.isInteger(messageThreadId) ? { message_thread_id: messageThreadId } : {}),
        text: String(text || "")
      });
      return {
        messageId: Number.isInteger(result?.message_id) ? result.message_id : null,
        raw: result
      };
    },
    async editMessage({ chatId, messageId, messageThreadId, text }) {
      const result = await request("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        ...(Number.isInteger(messageThreadId) ? { message_thread_id: messageThreadId } : {}),
        text: String(text || "")
      });
      return {
        messageId: Number.isInteger(result?.message_id) ? result.message_id : messageId,
        raw: result
      };
    }
  };
}

export function createTelegramAdapter(options = {}) {
  const enabled = options.enabled === true;
  const transport = enabled ? options.transport : null;
  if (enabled && (!transport || typeof transport.sendMessage !== "function" || typeof transport.editMessage !== "function")) {
    throw new Error("Telegram adapter requires sendMessage/editMessage transport methods when enabled.");
  }
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const configuredTargets = Number.isInteger(options.configuredTargets) && options.configuredTargets >= 0 ? options.configuredTargets : 0;
  const threadState = new Map();
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

    try {
      let result = null;
      if (action === "update") {
        if (Number.isInteger(state.messageId)) {
          try {
            result = await transport.editMessage({
              chatId: target.chatId,
              messageThreadId: target.messageThreadId,
              messageId: state.messageId,
              text
            });
          } catch {
            result = await transport.sendMessage({
              chatId: target.chatId,
              messageThreadId: target.messageThreadId,
              text
            });
          }
        } else {
          result = await transport.sendMessage({
            chatId: target.chatId,
            messageThreadId: target.messageThreadId,
            text
          });
        }
        state.messageId = Number.isInteger(result?.messageId) ? result.messageId : state.messageId;
        state.lastText = text;
        state.lastUpdatedAt = nowFn();
        metrics.deliveredTotal += 1;
        metrics.updatedTotal += 1;
        metrics.lastDeliveredAt = state.lastUpdatedAt;
        return { delivered: true, action, messageId: state.messageId };
      }

      result = await transport.sendMessage({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        text
      });
      if (action === "new") {
        state.messageId = Number.isInteger(result?.messageId) ? result.messageId : state.messageId;
        state.lastText = text;
        state.lastUpdatedAt = nowFn();
      }
      metrics.deliveredTotal += 1;
      if (action === "alert") {
        metrics.alertedTotal += 1;
      }
      metrics.lastDeliveredAt = nowFn();
      return {
        delivered: true,
        action,
        messageId: Number.isInteger(result?.messageId) ? result.messageId : null
      };
    } catch (error) {
      metrics.failedTotal += 1;
      metrics.lastErrorAt = nowFn();
      metrics.lastError = error instanceof Error ? error.message : String(error || "Telegram adapter delivery failed.");
      return {
        delivered: false,
        action,
        error: metrics.lastError
      };
    }
  }

  function getStatus() {
    return {
      adapter: "telegram",
      enabled,
      configuredTargets,
      deliveredTotal: metrics.deliveredTotal,
      updatedTotal: metrics.updatedTotal,
      alertedTotal: metrics.alertedTotal,
      failedTotal: metrics.failedTotal,
      lastDeliveredAt: metrics.lastDeliveredAt,
      lastErrorAt: metrics.lastErrorAt,
      lastError: metrics.lastError
    };
  }

  function renderMetricLines() {
    const enabledValue = enabled ? 1 : 0;
    return [
      `ptydeck_messaging_adapter_enabled{adapter="telegram"} ${enabledValue}`,
      `ptydeck_messaging_adapter_configured_targets{adapter="telegram"} ${configuredTargets}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="success"} ${metrics.deliveredTotal}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="failure"} ${metrics.failedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="update"} ${metrics.updatedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="alert"} ${metrics.alertedTotal}`
    ];
  }

  return {
    handleEvent,
    getStatus,
    renderMetricLines
  };
}
