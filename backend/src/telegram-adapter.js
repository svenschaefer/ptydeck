const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_CALLBACK_PREFIX = "ptydeck:";
const DEFAULT_POLL_TIMEOUT_SECONDS = 3;
const POLL_RETRY_DELAY_MS = 250;
const TELEGRAM_ALLOWED_UPDATES = Object.freeze(["message", "callback_query"]);
const TELEGRAM_RATE_LIMIT_PATTERN = /\bretry after\s+(\d+)\b/i;
const MAX_TELEGRAM_INBOUND_TRACE_ENTRIES = 25;
const MAX_TELEGRAM_INBOUND_PREVIEW_LENGTH = 200;
const MAX_TELEGRAM_TARGET_TRACE_ENTRIES = 25;

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
  const stateKey = normalizeNonEmptyString(target?.stateKey);
  if (stateKey) {
    return `${stateKey}:${String(threadKey || "status")}`;
  }
  const chatId = normalizeChatId(target?.chatId);
  const messageThreadId = Number.isInteger(target?.messageThreadId) ? target.messageThreadId : 0;
  return `${chatId}:${messageThreadId}:${String(threadKey || "status")}`;
}

function buildForumTopicStateKey(target) {
  const stateKey = normalizeNonEmptyString(target?.topicStateKey) || normalizeNonEmptyString(target?.stateKey);
  if (stateKey) {
    return stateKey;
  }
  const chatId = normalizeChatId(target?.chatId);
  const sessionId = normalizeNonEmptyString(target?.sessionId);
  return `${chatId}:${sessionId || "session"}`;
}

function normalizeForumTopicName(value, fallback = "ptydeck") {
  const normalized = normalizeNonEmptyString(String(value || "").replace(/\s+/g, " "));
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, 128).trimEnd();
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

function truncateInboundPreview(value, maxLength = MAX_TELEGRAM_INBOUND_PREVIEW_LENGTH) {
  const normalized = normalizeNonEmptyString(String(value || "")).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
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

function normalizeTelegramInboundTextPayload(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) {
    return "";
  }
  if (normalized.startsWith("//")) {
    return normalized.slice(1);
  }
  return normalized;
}

function summarizeTelegramChat(chat) {
  if (!chat || typeof chat !== "object") {
    return {
      chatId: null,
      messageThreadId: null,
      chatType: "",
      chatTitle: "",
      chatUsername: "",
      chatIsForum: null,
      isTopicMessage: null
    };
  }
  return {
    chatId: normalizeChatId(chat.id) || null,
    messageThreadId: null,
    chatType: normalizeNonEmptyString(chat.type).toLowerCase(),
    chatTitle: normalizeNonEmptyString(chat.title),
    chatUsername: normalizeNonEmptyString(chat.username),
    chatIsForum: typeof chat.is_forum === "boolean" ? chat.is_forum : null,
    isTopicMessage: null
  };
}

function inspectTelegramInboundUpdate(update = {}) {
  const updateId = Number.isInteger(update?.update_id) ? update.update_id : null;
  const callbackQuery = update?.callback_query;
  if (callbackQuery && typeof callbackQuery === "object") {
    const message = callbackQuery.message && typeof callbackQuery.message === "object" ? callbackQuery.message : null;
    const chat = summarizeTelegramChat(message?.chat);
    const command = parseTelegramInboundCommand({ callbackData: callbackQuery.data });
    const observation = {
      updateId,
      source: "callback",
      reason: chat.chatId ? (command ? "command" : "unsupported_callback") : "missing_chat",
      chatId: chat.chatId,
      messageThreadId: Number.isInteger(message?.message_thread_id) ? message.message_thread_id : null,
      chatType: chat.chatType,
      chatTitle: chat.chatTitle,
      chatUsername: chat.chatUsername,
      chatIsForum: chat.chatIsForum,
      isTopicMessage: typeof message?.is_topic_message === "boolean" ? message.is_topic_message : null,
      fromUserId: Number.isInteger(callbackQuery?.from?.id) ? callbackQuery.from.id : null,
      fromUsername: normalizeNonEmptyString(callbackQuery?.from?.username),
      preview: truncateInboundPreview(callbackQuery.data),
      commandMatched: Boolean(command),
      action: command?.action || "",
      selector: command?.selector || "",
      callbackQueryId: normalizeNonEmptyString(callbackQuery.id)
    };
    if (!chat.chatId || !command) {
      return { observation, inbound: null };
    }
    return {
      observation,
      inbound: {
        updateId,
        source: "callback",
        callbackQueryId: normalizeNonEmptyString(callbackQuery.id),
        chatType: chat.chatType,
        chatTitle: chat.chatTitle,
        chatUsername: chat.chatUsername,
        chatIsForum: chat.chatIsForum,
        fromUserId: observation.fromUserId,
        fromUsername: observation.fromUsername,
        preview: observation.preview,
        target: {
          chatId: chat.chatId,
          ...(Number.isInteger(message?.message_thread_id) ? { messageThreadId: message.message_thread_id } : {})
        },
        command
      }
    };
  }

  const message = update?.message;
  if (message && typeof message === "object") {
    const chat = summarizeTelegramChat(message?.chat);
    const rawText = typeof message?.text === "string" ? message.text : "";
    const command = parseTelegramInboundCommand({ text: rawText });
    const inputText = command ? "" : normalizeTelegramInboundTextPayload(rawText);
    const hasText = rawText.length > 0;
    const observation = {
      updateId,
      source: "message",
      reason: chat.chatId ? (command ? "command" : inputText ? "input_text" : hasText ? "unsupported_text" : "non_text_message") : "missing_chat",
      chatId: chat.chatId,
      messageThreadId: Number.isInteger(message?.message_thread_id) ? message.message_thread_id : null,
      chatType: chat.chatType,
      chatTitle: chat.chatTitle,
      chatUsername: chat.chatUsername,
      chatIsForum: chat.chatIsForum,
      isTopicMessage: typeof message?.is_topic_message === "boolean" ? message.is_topic_message : null,
      fromUserId: Number.isInteger(message?.from?.id) ? message.from.id : null,
      fromUsername: normalizeNonEmptyString(message?.from?.username),
      preview: truncateInboundPreview(message?.text),
      commandMatched: Boolean(command),
      action: command?.action || "",
      selector: command?.selector || "",
      callbackQueryId: ""
    };
    if (!chat.chatId || (!command && !inputText)) {
      return { observation, inbound: null };
    }
    return {
      observation,
      inbound: {
        updateId,
        source: "message",
        chatType: chat.chatType,
        chatTitle: chat.chatTitle,
        chatUsername: chat.chatUsername,
        chatIsForum: chat.chatIsForum,
        fromUserId: observation.fromUserId,
        fromUsername: observation.fromUsername,
        preview: observation.preview,
        target: {
          chatId: chat.chatId,
          ...(Number.isInteger(message?.message_thread_id) ? { messageThreadId: message.message_thread_id } : {})
        },
        command: command || { action: "input" },
        ...(inputText ? { text: inputText } : {})
      }
    };
  }

  return {
    observation: {
      updateId,
      source: "unsupported",
      reason: "unsupported_update_type",
      chatId: null,
      messageThreadId: null,
      chatType: "",
      chatTitle: "",
      chatUsername: "",
      chatIsForum: null,
      isTopicMessage: null,
      fromUserId: null,
      fromUsername: "",
      preview: "",
      commandMatched: false,
      action: "",
      selector: "",
      callbackQueryId: ""
    },
    inbound: null
  };
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
    },
    async getChat({ chatId } = {}) {
      return request("getChat", {
        chat_id: normalizeChatId(chatId)
      });
    },
    async createForumTopic({ chatId, name, iconColor, iconCustomEmojiId }) {
      const result = await request("createForumTopic", {
        chat_id: chatId,
        name: normalizeForumTopicName(name),
        ...(Number.isInteger(iconColor) ? { icon_color: iconColor } : {}),
        ...(normalizeNonEmptyString(iconCustomEmojiId) ? { icon_custom_emoji_id: normalizeNonEmptyString(iconCustomEmojiId) } : {})
      });
      return {
        messageThreadId: Number.isInteger(result?.message_thread_id) ? result.message_thread_id : null,
        name: normalizeNonEmptyString(result?.name) || normalizeForumTopicName(name),
        raw: result
      };
    },
    async editForumTopic({ chatId, messageThreadId, name, iconCustomEmojiId }) {
      const result = await request("editForumTopic", {
        chat_id: chatId,
        message_thread_id: messageThreadId,
        ...(normalizeNonEmptyString(name) ? { name: normalizeForumTopicName(name) } : {}),
        ...(iconCustomEmojiId !== undefined
          ? { icon_custom_emoji_id: String(iconCustomEmojiId || "") }
          : {})
      });
      return {
        ok: result === true,
        raw: result
      };
    }
  };
}

export function createTelegramAdapter(options = {}) {
  const configured = options.configured === true;
  const deliveryEnabled = configured && options.deliveryEnabled === true;
  const deliveryHardBreakActive = options.deliveryHardBreakActive === true;
  const inboundEnabled = configured && options.inboundEnabled === true;
  const transport = configured ? options.transport : null;
  if (configured && (!transport || typeof transport.sendMessage !== "function" || typeof transport.editMessage !== "function")) {
    throw new Error("Telegram adapter requires sendMessage/editMessage transport methods when enabled.");
  }
  if (
    inboundEnabled &&
    (!transport || typeof transport.getUpdates !== "function" || typeof transport.answerCallbackQuery !== "function")
  ) {
    throw new Error("Telegram inbound adapter requires getUpdates/answerCallbackQuery transport methods when enabled.");
  }
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const logDebug = typeof options.logDebug === "function" ? options.logDebug : null;
  const configuredTargets = Number.isInteger(options.configuredTargets) && options.configuredTargets >= 0 ? options.configuredTargets : 0;
  const pollTimeoutSeconds = normalizeTelegramPollTimeoutSeconds(options.pollTimeoutSeconds);
  const threadState = new Map();
  const inboundTraceEntries = [];
  let inboundTraceCapturedTotal = 0;
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
    inboundObservedTotal: 0,
    inboundHandledTotal: 0,
    inboundFailedTotal: 0,
    inboundBacklogSkippedTotal: 0,
    lastInboundAt: null,
    lastInboundErrorAt: null,
    lastInboundError: "",
    pollingActive: false,
    provisionedTopicTotal: 0,
    renamedTopicTotal: 0,
    topicProvisionFailedTotal: 0,
    lastTopicProvisionAt: null,
    lastTopicRenameAt: null,
    lastTopicErrorAt: null,
    lastTopicError: "",
    activeTopicCount: 0,
    validatedForumTargetTotal: 0,
    lastTargetValidationAt: null,
    lastTargetValidationErrorAt: null,
    lastTargetValidationError: ""
  };
  const pollState = {
    stopRequested: false,
    promise: null,
    abortController: null,
    nextUpdateOffset: null
  };
  const forumTopicState = new Map();
  const forumTargetValidationState = new Map();
  const targetTraceEntries = [];
  let targetTraceCapturedTotal = 0;
  for (const binding of Array.isArray(options.topicBindings) ? options.topicBindings : []) {
    const stateKey = buildForumTopicStateKey({
      chatId: binding?.chatId,
      sessionId: binding?.sessionId
    });
    if (!stateKey || !Number.isInteger(binding?.messageThreadId)) {
      continue;
    }
    forumTopicState.set(stateKey, {
      messageThreadId: binding.messageThreadId,
      topicName: normalizeNonEmptyString(binding?.topicName),
      updatedAt: Number.isInteger(binding?.updatedAt) ? binding.updatedAt : null
    });
  }
  metrics.activeTopicCount = forumTopicState.size;

  function appendInboundTraceEntry(entry) {
    inboundTraceCapturedTotal += 1;
    inboundTraceEntries.push({
      recordedAt: nowFn(),
      ...entry
    });
    if (inboundTraceEntries.length > MAX_TELEGRAM_INBOUND_TRACE_ENTRIES) {
      inboundTraceEntries.splice(0, inboundTraceEntries.length - MAX_TELEGRAM_INBOUND_TRACE_ENTRIES);
    }
  }

  function appendTargetTraceEntry(entry) {
    targetTraceCapturedTotal += 1;
    targetTraceEntries.push({
      recordedAt: nowFn(),
      ...entry
    });
    if (targetTraceEntries.length > MAX_TELEGRAM_TARGET_TRACE_ENTRIES) {
      targetTraceEntries.splice(0, targetTraceEntries.length - MAX_TELEGRAM_TARGET_TRACE_ENTRIES);
    }
  }

  function recordInboundObservation(observation, phase, extra = {}) {
    const entry = {
      phase,
      updateId: Number.isInteger(observation?.updateId) ? observation.updateId : null,
      source: normalizeNonEmptyString(observation?.source) || "unknown",
      reason: normalizeNonEmptyString(observation?.reason),
      chatId: observation?.chatId || null,
      messageThreadId: Number.isInteger(observation?.messageThreadId) ? observation.messageThreadId : null,
      chatType: normalizeNonEmptyString(observation?.chatType),
      chatTitle: normalizeNonEmptyString(observation?.chatTitle),
      chatUsername: normalizeNonEmptyString(observation?.chatUsername),
      chatIsForum: typeof observation?.chatIsForum === "boolean" ? observation.chatIsForum : null,
      isTopicMessage: typeof observation?.isTopicMessage === "boolean" ? observation.isTopicMessage : null,
      fromUserId: Number.isInteger(observation?.fromUserId) ? observation.fromUserId : null,
      fromUsername: normalizeNonEmptyString(observation?.fromUsername),
      preview: truncateInboundPreview(observation?.preview),
      commandMatched: observation?.commandMatched === true,
      action: normalizeNonEmptyString(observation?.action),
      selector: normalizeNonEmptyString(observation?.selector),
      callbackQueryId: normalizeNonEmptyString(observation?.callbackQueryId),
      ...extra
    };
    appendInboundTraceEntry(entry);
    if (logDebug) {
      logDebug("messaging.inbound.update", {
        adapter: "telegram",
        ...entry
      });
    }
  }

  function recordTargetObservation(target, phase, extra = {}) {
    const entry = {
      phase: normalizeNonEmptyString(phase),
      chatId: normalizeChatId(target?.chatId) || null,
      messageThreadId: Number.isInteger(target?.messageThreadId) ? target.messageThreadId : null,
      topicMode: normalizeNonEmptyString(target?.topicMode),
      sessionId: normalizeNonEmptyString(target?.sessionId),
      topicName: normalizeNonEmptyString(target?.topicName),
      stateKey: normalizeNonEmptyString(target?.stateKey),
      error: normalizeNonEmptyString(extra?.error),
      reason: normalizeNonEmptyString(extra?.reason),
      chatType: normalizeNonEmptyString(extra?.chatType).toLowerCase(),
      chatTitle: normalizeNonEmptyString(extra?.chatTitle),
      chatIsForum: typeof extra?.chatIsForum === "boolean" ? extra.chatIsForum : null,
      topicAction: normalizeNonEmptyString(extra?.topicAction),
      validated: typeof extra?.validated === "boolean" ? extra.validated : null
    };
    appendTargetTraceEntry(entry);
    if (logDebug) {
      logDebug("messaging.target.update", {
        adapter: "telegram",
        ...entry
      });
    }
  }

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

  function getForumTopicState(target) {
    const stateKey = buildForumTopicStateKey(target);
    let state = forumTopicState.get(stateKey);
    if (state) {
      return state;
    }
    state = {
      messageThreadId: Number.isInteger(target?.messageThreadId) ? target.messageThreadId : null,
      topicName: normalizeNonEmptyString(target?.topicName),
      updatedAt: null
    };
    forumTopicState.set(stateKey, state);
    metrics.activeTopicCount = forumTopicState.size;
    return state;
  }

  async function validateForumTarget(target) {
    const chatId = normalizeChatId(target?.chatId);
    const cached = forumTargetValidationState.get(chatId);
    if (cached?.valid === true) {
      recordTargetObservation(target, "target_validated_cached", {
        validated: true,
        chatType: cached.type,
        chatTitle: cached.title,
        chatIsForum: cached.isForum
      });
      return cached;
    }
    if (!transport || typeof transport.getChat !== "function") {
      throw new Error("Telegram forum-topic provisioning requires getChat transport method.");
    }
    const chat = await transport.getChat({ chatId });
    const type = normalizeNonEmptyString(chat?.type).toLowerCase();
    const isForum = chat?.is_forum === true;
    const descriptor = {
      valid: type === "supergroup" && isForum === true,
      type,
      isForum,
      title: normalizeNonEmptyString(chat?.title)
    };
    metrics.lastTargetValidationAt = nowFn();
    if (!descriptor.valid) {
      const kind =
        type === "channel"
          ? "channel"
          : type === "supergroup"
            ? "non-forum supergroup"
            : type || "unknown chat type";
      const error = `Telegram target ${chatId} must be a forum-enabled supergroup for topicMode deck-session; got ${kind}.`;
      metrics.lastTargetValidationErrorAt = metrics.lastTargetValidationAt;
      metrics.lastTargetValidationError = error;
      recordTargetObservation(target, "target_validation_failed", {
        validated: false,
        error,
        chatType: descriptor.type,
        chatTitle: descriptor.title,
        chatIsForum: descriptor.isForum
      });
      throw new Error(error);
    }
    metrics.validatedForumTargetTotal += 1;
    metrics.lastTargetValidationErrorAt = null;
    metrics.lastTargetValidationError = "";
    forumTargetValidationState.set(chatId, descriptor);
    recordTargetObservation(target, "target_validated", {
      validated: true,
      chatType: descriptor.type,
      chatTitle: descriptor.title,
      chatIsForum: descriptor.isForum
    });
    return descriptor;
  }

  function noteTargetFailure(target, error, extra = {}) {
    const message = error instanceof Error ? error.message : String(error || "Telegram topic provisioning failed.");
    metrics.topicProvisionFailedTotal += 1;
    metrics.lastTopicErrorAt = nowFn();
    metrics.lastTopicError = message;
    if (!metrics.lastTargetValidationError) {
      metrics.lastTargetValidationErrorAt = metrics.lastTopicErrorAt;
      metrics.lastTargetValidationError = message;
    }
    recordTargetObservation(target, "topic_provision_failed", {
      error: message,
      ...extra
    });
    return message;
  }

  async function resolveEffectiveTarget(target) {
    if (target?.topicMode !== "deck-session") {
      return { target };
    }
    if (
      !transport ||
      typeof transport.createForumTopic !== "function" ||
      typeof transport.editForumTopic !== "function"
    ) {
      throw new Error("Telegram forum-topic provisioning requires createForumTopic/editForumTopic transport methods.");
    }
    await validateForumTarget(target);
    const topicState = getForumTopicState(target);
    const desiredTopicName = normalizeForumTopicName(target?.topicName, "ptydeck");
    if (!Number.isInteger(topicState.messageThreadId)) {
      const created = await transport.createForumTopic({
        chatId: target.chatId,
        name: desiredTopicName
      });
      if (!Number.isInteger(created?.messageThreadId)) {
        throw new Error("Telegram forum-topic provisioning did not return a message_thread_id.");
      }
      topicState.messageThreadId = created.messageThreadId;
      topicState.topicName = created.name || desiredTopicName;
      topicState.updatedAt = nowFn();
      metrics.provisionedTopicTotal += 1;
      metrics.lastTopicProvisionAt = topicState.updatedAt;
      metrics.lastTopicErrorAt = null;
      metrics.lastTopicError = "";
      recordTargetObservation(
        {
          ...target,
          messageThreadId: topicState.messageThreadId,
          topicName: topicState.topicName || desiredTopicName
        },
        "topic_provisioned",
        {
          validated: true,
          topicAction: "create",
          chatType: "supergroup",
          chatIsForum: true,
          chatTitle: "",
          reason: "topic_created"
        }
      );
    } else if (desiredTopicName && desiredTopicName !== topicState.topicName) {
      await transport.editForumTopic({
        chatId: target.chatId,
        messageThreadId: topicState.messageThreadId,
        name: desiredTopicName
      });
      topicState.topicName = desiredTopicName;
      topicState.updatedAt = nowFn();
      metrics.renamedTopicTotal += 1;
      metrics.lastTopicRenameAt = topicState.updatedAt;
      metrics.lastTopicErrorAt = null;
      metrics.lastTopicError = "";
      recordTargetObservation(
        {
          ...target,
          messageThreadId: topicState.messageThreadId,
          topicName: desiredTopicName
        },
        "topic_renamed",
        {
          validated: true,
          topicAction: "rename",
          chatType: "supergroup",
          chatIsForum: true,
          reason: "topic_renamed"
        }
      );
    } else {
      recordTargetObservation(
        {
          ...target,
          messageThreadId: topicState.messageThreadId,
          topicName: topicState.topicName || desiredTopicName
        },
        "topic_reused",
        {
          validated: true,
          topicAction: "reuse",
          chatType: "supergroup",
          chatIsForum: true,
          reason: "topic_reused"
        }
      );
    }
    return {
      target: {
        ...target,
        messageThreadId: topicState.messageThreadId
      },
      topicBinding: {
        chatId: target.chatId,
        sessionId: normalizeNonEmptyString(target?.sessionId),
        messageThreadId: topicState.messageThreadId,
        topicName: topicState.topicName || desiredTopicName,
        updatedAt: Number.isInteger(topicState.updatedAt) ? topicState.updatedAt : nowFn()
      }
    };
  }

  async function ensureTarget(target) {
    if (!configured) {
      return { ok: false, skipped: true, reason: "disabled" };
    }
    if (!target?.chatId) {
      return { ok: false, skipped: true, reason: "unmapped" };
    }
    try {
      const resolved = await resolveEffectiveTarget(target);
      return {
        ok: true,
        reason: target?.topicMode === "deck-session" ? "target_ready" : "target_valid",
        target: resolved.target,
        ...(resolved.topicBinding ? { topicBinding: resolved.topicBinding } : {})
      };
    } catch (error) {
      return {
        ok: false,
        skipped: true,
        reason: "topic_provision_failed",
        error: noteTargetFailure(target, error)
      };
    }
  }

  async function handleEvent(event) {
    if (!configured) {
      return { delivered: false, skipped: true, reason: "disabled" };
    }
    const target = event?.target;
    if (!target?.chatId) {
      return { delivered: false, skipped: true, reason: "unmapped" };
    }
    const action = String(event?.decision?.action || "");
    let effectiveTarget = target;
    let topicBinding = null;
    try {
      const resolved = await resolveEffectiveTarget(target);
      effectiveTarget = resolved.target;
      topicBinding = resolved.topicBinding || null;
    } catch (error) {
      return {
        delivered: false,
        skipped: true,
        reason: "topic_provision_failed",
        action,
        error: noteTargetFailure(target, error, { topicAction: action })
      };
    }
    if (!action || action === "suppress") {
      return {
        delivered: false,
        skipped: true,
        reason: "suppressed",
        ...(topicBinding ? { topicBinding } : {}),
        target: effectiveTarget
      };
    }
    const text = String(event.text || "").trim();
    if (!text) {
      return {
        delivered: false,
        skipped: true,
        reason: "empty",
        ...(topicBinding ? { topicBinding } : {}),
        target: effectiveTarget
      };
    }
    if (!deliveryEnabled) {
      return {
        delivered: false,
        skipped: true,
        reason: "delivery_disabled",
        action,
        ...(topicBinding ? { topicBinding } : {}),
        target: effectiveTarget
      };
    }
    const state = getThreadState(effectiveTarget, event.decision?.messageKey || event.threadKey || "status");
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
              chatId: effectiveTarget.chatId,
              messageThreadId: effectiveTarget.messageThreadId,
              messageId: state.messageId,
              text,
              ...(replyMarkup ? { replyMarkup } : {})
            });
          } catch {
            result = await transport.sendMessage({
              chatId: effectiveTarget.chatId,
              messageThreadId: effectiveTarget.messageThreadId,
              text,
              ...(replyMarkup ? { replyMarkup } : {})
            });
          }
        } else {
          result = await transport.sendMessage({
            chatId: effectiveTarget.chatId,
            messageThreadId: effectiveTarget.messageThreadId,
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
        return {
          delivered: true,
          action,
          messageId: state.messageId,
          target: effectiveTarget,
          ...(topicBinding ? { topicBinding } : {})
        };
      }

      result = await transport.sendMessage({
        chatId: effectiveTarget.chatId,
        messageThreadId: effectiveTarget.messageThreadId,
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
        messageId: Number.isInteger(result?.messageId) ? result.messageId : null,
        target: effectiveTarget,
        ...(topicBinding ? { topicBinding } : {})
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
    if (!deliveryEnabled) {
      return;
    }
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
    if (!configured || !inboundEnabled) {
      return { started: false, reason: configured ? "inbound_disabled" : "disabled" };
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
              const inspected = inspectTelegramInboundUpdate(update);
              const observation = inspected?.observation || null;
              const inbound = inspected?.inbound || null;
              if (observation) {
                metrics.inboundObservedTotal += 1;
                recordInboundObservation(observation, inbound ? "received" : "ignored");
              }
              if (!inbound) {
                continue;
              }
              try {
                const result = await onCommand(inbound);
                await acknowledgeCallback(inbound, result);
                await emitInboundResponse(inbound, result);
                metrics.inboundHandledTotal += 1;
                metrics.lastInboundAt = nowFn();
                recordInboundObservation(observation, "handled", {
                  ok: result?.ok !== false,
                  responsePreview: truncateInboundPreview(result?.text || result?.callbackText)
                });
              } catch (error) {
                metrics.inboundFailedTotal += 1;
                metrics.lastInboundErrorAt = nowFn();
                metrics.lastInboundError = error instanceof Error ? error.message : String(error || "Telegram inbound command failed.");
                recordInboundObservation(observation, "failed", {
                  ok: false,
                  error: metrics.lastInboundError
                });
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
      enabled: configured,
      deliveryEnabled,
      deliveryHardBreakActive,
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
      inboundObservedTotal: metrics.inboundObservedTotal,
      inboundHandledTotal: metrics.inboundHandledTotal,
      inboundFailedTotal: metrics.inboundFailedTotal,
      inboundBacklogSkippedTotal: metrics.inboundBacklogSkippedTotal,
      lastInboundAt: metrics.lastInboundAt,
      lastInboundErrorAt: metrics.lastInboundErrorAt,
      lastInboundError: metrics.lastInboundError,
      pollingActive: metrics.pollingActive,
      pollTimeoutSeconds,
      provisionedTopicTotal: metrics.provisionedTopicTotal,
      renamedTopicTotal: metrics.renamedTopicTotal,
      topicProvisionFailedTotal: metrics.topicProvisionFailedTotal,
      lastTopicProvisionAt: metrics.lastTopicProvisionAt,
      lastTopicRenameAt: metrics.lastTopicRenameAt,
      lastTopicErrorAt: metrics.lastTopicErrorAt,
      lastTopicError: metrics.lastTopicError,
      activeTopicCount: metrics.activeTopicCount,
      validatedForumTargetTotal: metrics.validatedForumTargetTotal,
      lastTargetValidationAt: metrics.lastTargetValidationAt,
      lastTargetValidationErrorAt: metrics.lastTargetValidationErrorAt,
      lastTargetValidationError: metrics.lastTargetValidationError,
      targetTrace: {
        capacity: MAX_TELEGRAM_TARGET_TRACE_ENTRIES,
        capturedTotal: targetTraceCapturedTotal,
        recent: targetTraceEntries.slice(-MAX_TELEGRAM_TARGET_TRACE_ENTRIES)
      },
      inboundTrace: {
        capacity: MAX_TELEGRAM_INBOUND_TRACE_ENTRIES,
        capturedTotal: inboundTraceCapturedTotal,
        recent: inboundTraceEntries.slice(-MAX_TELEGRAM_INBOUND_TRACE_ENTRIES)
      }
    };
  }

  function renderMetricLines() {
    const enabledValue = configured ? 1 : 0;
    const deliveryEnabledValue = deliveryEnabled ? 1 : 0;
    const inboundEnabledValue = inboundEnabled ? 1 : 0;
    const pollingValue = metrics.pollingActive ? 1 : 0;
    return [
      `ptydeck_messaging_adapter_enabled{adapter="telegram"} ${enabledValue}`,
      `ptydeck_messaging_delivery_enabled{adapter="telegram"} ${deliveryEnabledValue}`,
      `ptydeck_messaging_adapter_configured_targets{adapter="telegram"} ${configuredTargets}`,
      `ptydeck_messaging_inbound_enabled{adapter="telegram"} ${inboundEnabledValue}`,
      `ptydeck_messaging_inbound_polling{adapter="telegram"} ${pollingValue}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="success"} ${metrics.deliveredTotal}`,
      `ptydeck_messaging_deliveries_total{adapter="telegram",outcome="failure"} ${metrics.failedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="update"} ${metrics.updatedTotal}`,
      `ptydeck_messaging_actions_total{adapter="telegram",action="alert"} ${metrics.alertedTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="observed"} ${metrics.inboundObservedTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="handled"} ${metrics.inboundHandledTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="failure"} ${metrics.inboundFailedTotal}`,
      `ptydeck_messaging_inbound_total{adapter="telegram",outcome="skipped_backlog"} ${metrics.inboundBacklogSkippedTotal}`,
      `ptydeck_messaging_topics_total{adapter="telegram",outcome="provisioned"} ${metrics.provisionedTopicTotal}`,
      `ptydeck_messaging_topics_total{adapter="telegram",outcome="renamed"} ${metrics.renamedTopicTotal}`,
      `ptydeck_messaging_topics_total{adapter="telegram",outcome="provision_failed"} ${metrics.topicProvisionFailedTotal}`,
      `ptydeck_messaging_topics_active{adapter="telegram"} ${metrics.activeTopicCount}`
    ];
  }

  return {
    ensureTarget,
    handleEvent,
    startInbound,
    stop,
    getStatus,
    renderMetricLines
  };
}
