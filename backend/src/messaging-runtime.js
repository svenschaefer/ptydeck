import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { normalizeVisibleReplayText, parseReplaySliceSelector } from "./replay-excerpt.js";
import { buildTelegramCommandCatalog } from "./telegram-command-surface.js";
import { createTelegramAdapter, createTelegramTransport } from "./telegram-adapter.js";
import { createDiscordAdapter, createDiscordTransport } from "./discord-adapter.js";
import {
  normalizeCustomCommandPayloadForShell,
  parseCustomCommandInvocation,
  renderCustomCommandForSession,
  resolveCustomCommandForSession
} from "./messaging-custom-command-utils.js";

export const MESSAGING_TRIGGER_PROFILES = Object.freeze(["generic-shell", "coding-agent", "build-test"]);
const MESSAGING_TRIGGER_PROFILE_SET = new Set(MESSAGING_TRIGGER_PROFILES);
const MAX_RUNTIME_TRACE_ENTRIES = 200;
const MAX_EVENT_SUMMARY_LENGTH = 280;
const MAX_INBOUND_REPLAY_LINES = 80;
const MAX_INBOUND_REPLAY_CHARS = 3000;
const MAX_INBOUND_REPLAY_SHELL_BLOCKS = 3;
const MAX_INBOUND_RESPONSE_TEXT_LENGTH = 3800;
const DEFAULT_INBOUND_REPLAY_SELECTOR = "l:40";
const TELEGRAM_TOPIC_NAME_MAX_LENGTH = 128;

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value) {
  return normalizeNonEmptyString(String(value || "").replace(/\s+/gu, " "));
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function truncateSummary(value, maxLength = MAX_EVENT_SUMMARY_LENGTH) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (!Number.isInteger(maxLength) || maxLength <= 0 || normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 1) {
    return "…";
  }
  if (maxLength <= 5) {
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
  const available = maxLength - 1;
  const headLength = Math.max(1, Math.ceil(available * 0.6));
  const tailLength = Math.max(1, available - headLength);
  const head = normalized.slice(0, headLength).trimEnd();
  const tail = normalized.slice(Math.max(headLength, normalized.length - tailLength)).trimStart();
  return tail ? `${head}…${tail}` : `${head}…`;
}

function truncateResponseText(value, maxLength = MAX_INBOUND_RESPONSE_TEXT_LENGTH) {
  const normalized = typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
  return truncateSummary(normalized, maxLength);
}

function truncateTraceText(value, maxLength = 240) {
  return truncateSummary(value, maxLength);
}

function buildSessionLabel(session) {
  const quickIdToken = normalizeNonEmptyString(session?.quickIdToken);
  const name =
    normalizeNonEmptyString(session?.name) ||
    normalizeNonEmptyString(session?.shell) ||
    normalizeNonEmptyString(session?.id);
  return quickIdToken ? `[${quickIdToken}] ${name}` : name;
}

function normalizeMessagingProfile(value) {
  const normalized = normalizeNonEmptyString(value).toLowerCase();
  return MESSAGING_TRIGGER_PROFILE_SET.has(normalized) ? normalized : "";
}

function normalizeMessagingTargetEntry(entry, options = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const defaultAdapterId = normalizeNonEmptyString(options.adapterId).toLowerCase();
  const adapterId = normalizeNonEmptyString(entry.adapterId || entry.adapter || defaultAdapterId).toLowerCase() || "telegram";
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const quickIdToken = normalizeNonEmptyString(entry.quickIdToken || entry.quickId);
  const sessionName = normalizeNonEmptyString(entry.sessionName || entry.name);
  const channelId =
    normalizeNonEmptyString(adapterId === "discord" ? entry.channelId || entry.chatId : entry.chatId || entry.channelId) ||
    String((adapterId === "discord" ? entry.channelId ?? entry.chatId : entry.chatId ?? entry.channelId) ?? "").trim();
  const threadId = normalizePositiveInteger(adapterId === "discord" ? entry.threadId ?? entry.messageThreadId : entry.messageThreadId ?? entry.threadId);
  const webhookUrl = normalizeNonEmptyString(entry.webhookUrl);
  const profile = normalizeMessagingProfile(entry.profile);
  const topicMode = normalizeNonEmptyString(entry.topicMode).toLowerCase() === "deck-session" ? "deck-session" : "";
  const hasSelector = Boolean(sessionId || quickIdToken || sessionName);
  const allowDynamicDeckSessionTarget = adapterId === "telegram" && topicMode === "deck-session" && !hasSelector;
  if (!channelId || (!hasSelector && !allowDynamicDeckSessionTarget)) {
    return null;
  }
  if (adapterId === "discord" && !webhookUrl) {
    return null;
  }
  const normalized = {
    sessionId,
    quickIdToken,
    sessionName,
    ...(options.includeAdapterId === true ? { adapterId } : {}),
    chatId: channelId,
    channelId,
    ...(Number.isInteger(threadId) ? { messageThreadId: threadId, threadId } : {}),
    ...(adapterId === "discord" ? { webhookUrl } : {}),
    ...(profile ? { profile } : {}),
    ...(topicMode ? { topicMode } : {})
  };
  return Object.freeze(normalized);
}

export function normalizeMessagingTargets(entries = [], options = {}) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTargetEntry(entry, options)).filter(Boolean);
}

function normalizeMessagingTopicBindingEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const chatId = normalizeNonEmptyString(entry.chatId) || String(entry.chatId ?? "").trim();
  const sessionId = normalizeNonEmptyString(entry.sessionId);
  const messageThreadId = normalizePositiveInteger(entry.messageThreadId);
  if (!chatId || !sessionId || !Number.isInteger(messageThreadId)) {
    return null;
  }
  const topicName = truncateSummary(normalizeNonEmptyString(entry.topicName), TELEGRAM_TOPIC_NAME_MAX_LENGTH);
  const updatedAt = Number.isInteger(entry.updatedAt) && entry.updatedAt > 0 ? entry.updatedAt : 0;
  return Object.freeze({
    chatId,
    sessionId,
    messageThreadId,
    ...(topicName ? { topicName } : {}),
    ...(updatedAt ? { updatedAt } : {})
  });
}

export function normalizeMessagingTopicBindings(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => normalizeMessagingTopicBindingEntry(entry)).filter(Boolean);
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
  if (/(?:codex|claude|gemini|agent|openai|apply_patch|plan updated)/.test(fingerprint)) {
    return "coding-agent";
  }
  if (/(?:npm test|pnpm test|yarn test|pytest|jest|vitest|cargo test|go test|gradle|mvn|build|compile|coverage)/.test(fingerprint)) {
    return "build-test";
  }
  return "generic-shell";
}

export function applyMessagingMessagePolicy(event, threadState = {}) {
  const messageKey = normalizeNonEmptyString(event?.threadKey) || "status";
  const comparableText = normalizeNonEmptyString(event?.comparableText) || normalizeWhitespace(event?.text || event?.summary).toLowerCase();
  if (!normalizeNonEmptyString(event?.text || event?.summary)) {
    return Object.freeze({ action: "suppress", messageKey, reason: "empty" });
  }
  const deliveryBlockKey = normalizeNonEmptyString(event?.deliveryBlockKey);
  const lastDeliveryBlockKey = normalizeNonEmptyString(threadState?.lastDeliveryBlockKey);
  const lastComparableText = normalizeNonEmptyString(threadState?.lastComparableText);
  if (comparableText && comparableText === lastComparableText && (!deliveryBlockKey || deliveryBlockKey === lastDeliveryBlockKey)) {
    return Object.freeze({ action: "suppress", messageKey, reason: "duplicate_signature" });
  }
  if (messageKey === "attention" || normalizeNonEmptyString(event?.severity) === "error") {
    return Object.freeze({
      action: threadState?.messageCreated ? "alert" : "new",
      messageKey,
      reason: threadState?.messageCreated ? "attention_update" : "attention_new"
    });
  }
  if (threadState?.messageCreated) {
    return Object.freeze({ action: "update", messageKey, reason: "status_update" });
  }
  return Object.freeze({ action: "new", messageKey, reason: "status_new" });
}

export function advanceMessagingThreadPolicyState(state, event, decision, result = {}) {
  if (!state || typeof state !== "object") {
    return;
  }
  state.lastEventType = normalizeNonEmptyString(event?.type);
  state.lastComparableText = normalizeNonEmptyString(event?.comparableText);
  state.lastText = normalizeNonEmptyString(event?.text);
  state.lastDeliveryBlockKey = normalizeNonEmptyString(event?.deliveryBlockKey);
  state.lastDeliveredAt = Number.isInteger(event?.occurredAt) ? event.occurredAt : Date.now();
  if (result.delivered) {
    state.messageCreated = true;
  }
}

function buildConversationKey(chatId, messageThreadId) {
  return `${normalizeNonEmptyString(chatId)}:${Number.isInteger(messageThreadId) ? messageThreadId : 0}`;
}

function buildTelegramTopicBindingKey(chatId, sessionId) {
  return `${normalizeNonEmptyString(chatId)}:${normalizeNonEmptyString(sessionId)}`;
}

function buildTelegramTopicName(deckName, session) {
  const normalizedDeckName = normalizeNonEmptyString(deckName) || normalizeNonEmptyString(session?.deckId) || "Default";
  const normalizedSessionName =
    normalizeNonEmptyString(session?.name) ||
    normalizeNonEmptyString(session?.shell) ||
    normalizeNonEmptyString(session?.quickIdToken) ||
    normalizeNonEmptyString(session?.id) ||
    "terminal";
  return truncateSummary(`${normalizedDeckName} + ${normalizedSessionName}`, TELEGRAM_TOPIC_NAME_MAX_LENGTH);
}

function buildInboundTrace(request, sessionId) {
  const adapter = normalizeNonEmptyString(request?.adapter) || "adapter";
  const updateId = Number.isInteger(request?.updateId) && request.updateId >= 0 ? String(request.updateId) : normalizeNonEmptyString(request?.updateId);
  const requestId = `msg-${randomUUID()}`;
  const correlationId = updateId ? `msg-${adapter}-${updateId}` : requestId;
  return {
    traceId: requestId,
    requestId,
    correlationId,
    source: `messaging:${adapter}`,
    sessionId: normalizeNonEmptyString(sessionId)
  };
}

function buildInboundLogDetails(request = {}, extra = {}) {
  return {
    adapter: request.adapter || "telegram",
    source: normalizeNonEmptyString(request.source) || "unknown",
    action: normalizeNonEmptyString(request.command?.action || request.action),
    selector: normalizeNonEmptyString(request.command?.selector || request.selector),
    chatId: normalizeNonEmptyString(request.target?.chatId) || null,
    messageThreadId: Number.isInteger(request.target?.messageThreadId) ? request.target.messageThreadId : null,
    chatType: normalizeNonEmptyString(request.chatType) || null,
    chatTitle: normalizeNonEmptyString(request.chatTitle) || null,
    chatUsername: normalizeNonEmptyString(request.chatUsername) || null,
    chatIsForum: typeof request.chatIsForum === "boolean" ? request.chatIsForum : null,
    fromUserId: Number.isInteger(request.fromUserId) ? request.fromUserId : null,
    fromUsername: normalizeNonEmptyString(request.fromUsername) || null,
    preview: truncateTraceText(request.preview, 200),
    ...extra
  };
}

function buildInboundStatusText(session, profile) {
  const lines = [
    `Status for ${buildSessionLabel(session)}`,
    `State: ${normalizeNonEmptyString(session?.state) || "unknown"}`
  ];
  if (profile) {
    lines.push(`Trigger profile: ${profile}`);
  }
  const kind = normalizeNonEmptyString(session?.kind);
  if (kind) {
    lines.push(`Kind: ${kind}`);
  }
  const controller =
    normalizeNonEmptyString(session?.controlState?.currentController?.clientId || session?.controlState?.currentController?.label || session?.controlState?.currentController);
  lines.push(`Controller: ${controller || "none"}`);
  const attachedCount = Array.isArray(session?.controlState?.attachedClients) ? session.controlState.attachedClients.length : 0;
  lines.push(`Attached clients: ${attachedCount}`);
  return truncateResponseText(lines.join("\n"));
}

export function normalizeMessagingInboundReplaySelector(selector) {
  const normalized = normalizeNonEmptyString(selector).toLowerCase() || DEFAULT_INBOUND_REPLAY_SELECTOR;
  const parsed = parseReplaySliceSelector(normalized);
  if (!parsed) {
    throw new ApiError(400, "ValidationError", "Replay selector must match 'l:N', 'c:N', or 'sp:N'.");
  }
  let maxCount = MAX_INBOUND_REPLAY_LINES;
  if (parsed.selectorKind === "chars") {
    maxCount = MAX_INBOUND_REPLAY_CHARS;
  } else if (parsed.selectorKind === "shell_blocks") {
    maxCount = MAX_INBOUND_REPLAY_SHELL_BLOCKS;
  }
  const boundedCount = Math.min(parsed.requestedCount, maxCount);
  return `${parsed.selectorToken}:${boundedCount}`;
}

function buildReplayResponseText(session, excerpt) {
  const header = `${buildSessionLabel(session)} replay ${excerpt.selector}`;
  const meta = `${excerpt.resolvedCount}/${excerpt.availableCount} ${excerpt.selectorKind.replace("_", " ")}${excerpt.selectorSatisfied ? "" : " (partial)"}`;
  const body = normalizeVisibleReplayText(excerpt.data || "").trim();
  const text = body ? `${header}\n${meta}\n\n${body}` : `${header}\n${meta}\n\n(no retained replay text)`;
  return truncateResponseText(text);
}

function normalizeInboundCustomInvocationText(rawText, customCommandName) {
  const normalizedName = normalizeNonEmptyString(customCommandName);
  const normalizedText = normalizeNonEmptyString(rawText);
  if (!normalizedName) {
    return normalizedText;
  }
  const match = normalizedText.match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?([\s\S]*)$/);
  if (!match) {
    return `/${normalizedName}`;
  }
  return `/${normalizedName}${match[2] || ""}`;
}

export function normalizeMessagingInboundInputPayload(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalizedLines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "");
  if (!normalizedLines.trim()) {
    return "";
  }
  return `${normalizedLines}\r`;
}

async function defaultNoop() {
  return null;
}

export function createMessagingRuntime(options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const logDebug = typeof options.logDebug === "function" ? options.logDebug : () => {};
  const resolveDeckNameForSession =
    typeof options.resolveDeckNameForSession === "function" ? options.resolveDeckNameForSession : (session) => normalizeNonEmptyString(session?.deckId) || "Default";
  const resolveDeckForSession =
    typeof options.resolveDeckForSession === "function"
      ? options.resolveDeckForSession
      : (session) => ({ id: normalizeNonEmptyString(session?.deckId) || "default", name: normalizeNonEmptyString(session?.deckId) || "Default" });
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const requestMessagingStop = typeof options.requestMessagingStop === "function" ? options.requestMessagingStop : defaultNoop;
  const requestMessagingRetry = typeof options.requestMessagingRetry === "function" ? options.requestMessagingRetry : defaultNoop;
  const requestMessagingSendInput =
    typeof options.requestMessagingSendInput === "function" ? options.requestMessagingSendInput : defaultNoop;
  const requestMessagingReplayExcerpt =
    typeof options.requestMessagingReplayExcerpt === "function" ? options.requestMessagingReplayExcerpt : defaultNoop;
  const resolveSessionForMessagingTarget =
    typeof options.resolveSessionForMessagingTarget === "function" ? options.resolveSessionForMessagingTarget : defaultNoop;
  const telegramTargetMappings = normalizeMessagingTargets(options.telegramTargets, { adapterId: "telegram", includeAdapterId: true });
  const discordTargetMappings = normalizeMessagingTargets(options.discordTargets, { adapterId: "discord", includeAdapterId: true });
  const telegramConfigured = Boolean(options.telegramBotToken && telegramTargetMappings.length > 0);
  const discordConfigured = discordTargetMappings.length > 0;
  const telegramOutboundEnabled = telegramConfigured && options.telegramOutboundEnabled === true;
  const telegramInboundEnabled = telegramConfigured && options.telegramInboundEnabled === true;
  const discordOutboundEnabled = discordConfigured && options.discordOutboundEnabled === true;
  const telegramTransportFactory =
    typeof options.createTelegramTransport === "function" ? options.createTelegramTransport : createTelegramTransport;
  const telegramTransport = telegramConfigured
    ? telegramTransportFactory({
        botToken: options.telegramBotToken,
        apiBaseUrl: options.telegramApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;
  const discordTransportFactory =
    typeof options.createDiscordTransport === "function" ? options.createDiscordTransport : createDiscordTransport;
  const discordTransport = discordConfigured
    ? discordTransportFactory({
        apiBaseUrl: options.discordApiBaseUrl,
        fetchImpl: options.fetchImpl
      })
    : null;

  const traceEntries = [];
  let traceCapturedTotal = 0;
  let runtimeReadyAt = 0;
  const telegramTopicBindings = new Map();
  const cachedSessionsBySessionId = new Map();
  const cachedSessionsByConversationKey = new Map();
  const conversationTargetIndex = new Map();
  const ambiguousConversationKeys = new Set();
  const pendingTargetEnsures = new Map();

  const telegramAdapter = createTelegramAdapter({
    configured: telegramConfigured,
    deliveryEnabled: telegramOutboundEnabled,
    deliveryHardBreakActive: false,
    allowlistDeliveryScopes: [],
    allowlistDeliverySignals: [],
    inboundEnabled: telegramInboundEnabled,
    configuredTargets: telegramTargetMappings.length,
    pollTimeoutSeconds: options.telegramPollTimeoutSeconds,
    transport: telegramTransport,
    topicBindings: normalizeMessagingTopicBindings(options.telegramTopicBindings),
    commandCatalog: buildTelegramCommandCatalog({ customCommands: listCustomCommands() }),
    nowFn,
    logDebug,
    formatSessionLabel: buildSessionLabel,
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });

  const discordAdapter = createDiscordAdapter({
    configured: discordConfigured,
    deliveryEnabled: discordOutboundEnabled,
    allowlistDeliveryScopes: [],
    allowlistDeliverySignals: [],
    configuredTargets: discordTargetMappings.length,
    transport: discordTransport,
    nowFn,
    logDebug,
    formatSessionLabel: buildSessionLabel,
    applyMessagePolicy: applyMessagingMessagePolicy,
    advanceThreadPolicyState: advanceMessagingThreadPolicyState
  });

  const adapters = [telegramAdapter, discordAdapter];

  function appendTraceEntry(entry) {
    traceCapturedTotal += 1;
    traceEntries.push(
      Object.freeze({
        recordedAt: nowFn(),
        type: normalizeNonEmptyString(entry?.type),
        reason: normalizeNonEmptyString(entry?.reason),
        sessionId: normalizeNonEmptyString(entry?.sessionId),
        adapter: normalizeNonEmptyString(entry?.adapter),
        summary: truncateTraceText(entry?.summary),
        text: truncateTraceText(entry?.text),
        traceId: normalizeNonEmptyString(entry?.traceId),
        correlationId: normalizeNonEmptyString(entry?.correlationId),
        target: entry?.target || null
      })
    );
    if (traceEntries.length > MAX_RUNTIME_TRACE_ENTRIES) {
      traceEntries.splice(0, traceEntries.length - MAX_RUNTIME_TRACE_ENTRIES);
    }
  }

  function rememberSessionForTarget(target, session) {
    if (!target || !session?.id) {
      return;
    }
    cachedSessionsBySessionId.set(session.id, session);
    cachedSessionsByConversationKey.set(buildConversationKey(target.chatId, target.messageThreadId), session);
  }

  function rememberSession(session) {
    if (!session?.id) {
      return;
    }
    cachedSessionsBySessionId.set(session.id, session);
  }

  function getCachedSessionForTarget(target) {
    const bySessionId = normalizeNonEmptyString(target?.sessionId);
    if (bySessionId && cachedSessionsBySessionId.has(bySessionId)) {
      return cachedSessionsBySessionId.get(bySessionId) || null;
    }
    return cachedSessionsByConversationKey.get(buildConversationKey(target?.chatId, target?.messageThreadId)) || null;
  }

  function rebuildConversationTargetIndex(bindings = normalizeMessagingTopicBindings(Array.from(telegramTopicBindings.values()))) {
    conversationTargetIndex.clear();
    ambiguousConversationKeys.clear();
    const addEntry = (key, target) => {
      if (!key || !target) {
        return;
      }
      if (conversationTargetIndex.has(key)) {
        ambiguousConversationKeys.add(key);
        return;
      }
      conversationTargetIndex.set(key, Object.freeze({ ...target }));
    };
    for (const target of telegramTargetMappings) {
      if (target.topicMode === "deck-session" && !Number.isInteger(target.messageThreadId)) {
        continue;
      }
      addEntry(buildConversationKey(target.chatId, target.messageThreadId), target);
    }
    for (const binding of bindings) {
      addEntry(buildConversationKey(binding.chatId, binding.messageThreadId), {
        adapterId: "telegram",
        chatId: binding.chatId,
        channelId: binding.chatId,
        messageThreadId: binding.messageThreadId,
        sessionId: binding.sessionId,
        topicMode: "deck-session",
        stateKey: `${binding.chatId}:${binding.sessionId}`,
        topicStateKey: `${binding.chatId}:${binding.sessionId}`
      });
    }
  }

  function replaceTelegramTopicBindings(entries = []) {
    telegramTopicBindings.clear();
    const normalizedBindings = normalizeMessagingTopicBindings(entries);
    for (const binding of normalizedBindings) {
      telegramTopicBindings.set(buildTelegramTopicBindingKey(binding.chatId, binding.sessionId), binding);
    }
    rebuildConversationTargetIndex(normalizedBindings);
    telegramAdapter.replaceTopicBindings?.(normalizedBindings);
  }

  rebuildConversationTargetIndex();

  function resolveTargetForAdapter(session, adapterId) {
    const mappings = adapterId === "discord" ? discordTargetMappings : telegramTargetMappings;
    const sessionProfile = resolveMessagingTriggerProfile(session);
    let bestMatch = null;
    let bestScore = -1;
    for (const target of mappings) {
      if (normalizeNonEmptyString(target.adapterId || adapterId) !== adapterId) {
        continue;
      }
      if (target.profile && target.profile !== sessionProfile) {
        continue;
      }
      if (target.sessionId && target.sessionId !== session.id) {
        continue;
      }
      if (target.quickIdToken && target.quickIdToken !== normalizeNonEmptyString(session?.quickIdToken)) {
        continue;
      }
      if (target.sessionName && target.sessionName !== normalizeNonEmptyString(session?.name)) {
        continue;
      }
      const score = (target.sessionId ? 100 : 0) + (target.quickIdToken ? 10 : 0) + (target.sessionName ? 1 : 0);
      if (score > bestScore) {
        bestMatch = target;
        bestScore = score;
      }
    }
    if (!bestMatch) {
      return null;
    }
    if (adapterId !== "telegram" || bestMatch.topicMode !== "deck-session") {
      return bestMatch;
    }
    const binding = telegramTopicBindings.get(buildTelegramTopicBindingKey(bestMatch.chatId, session.id)) || null;
    return Object.freeze({
      ...bestMatch,
      sessionId: session.id,
      topicMode: "deck-session",
      topicName: buildTelegramTopicName(resolveDeckNameForSession(session), session),
      stateKey: `${bestMatch.chatId}:${session.id}`,
      topicStateKey: `${bestMatch.chatId}:${session.id}`,
      ...(binding && Number.isInteger(binding.messageThreadId) ? { messageThreadId: binding.messageThreadId } : {})
    });
  }

  function resolveTarget(session) {
    return resolveTargetForAdapter(session, "telegram") || resolveTargetForAdapter(session, "discord");
  }

  function buildEnsureTargetKey(adapterId, session, target) {
    return [
      normalizeNonEmptyString(adapterId),
      normalizeNonEmptyString(target?.topicStateKey || target?.stateKey || target?.chatId),
      normalizeNonEmptyString(session?.id)
    ].join(":");
  }

  async function ensureSessionTarget(session, trace, resolvedTarget = null) {
    let finalTarget = null;
    for (const adapter of adapters) {
      const adapterId = normalizeNonEmptyString(adapter.getStatus?.().adapter);
      const target =
        resolvedTarget && (!adapterId || adapterId === normalizeNonEmptyString(resolvedTarget?.adapterId || "telegram"))
          ? resolvedTarget
          : resolveTargetForAdapter(session, adapterId);
      if (!target) {
        continue;
      }
      rememberSessionForTarget(target, session);
      const ensureKey = buildEnsureTargetKey(adapterId, session, target);
      let ensurePromise = pendingTargetEnsures.get(ensureKey);
      if (!ensurePromise) {
        ensurePromise = (async () => {
          let adapterFinalTarget = target;
          const result = typeof adapter.ensureTarget === "function" ? await adapter.ensureTarget(target) : { ok: true, target };
          if (result?.target?.chatId) {
            adapterFinalTarget = result.target;
          }
          if (result?.topicBinding) {
            replaceTelegramTopicBindings([...telegramTopicBindings.values(), result.topicBinding]);
            await options.onTelegramTopicBindingUpsert?.(result.topicBinding);
          }
          logDebug(
            "messaging.target.ensure",
            {
              adapter: adapterId || "adapter",
              sessionId: normalizeNonEmptyString(session?.id),
              ok: result?.ok === true,
              reason: normalizeNonEmptyString(result?.reason),
              error: normalizeNonEmptyString(result?.error),
              chatId: normalizeNonEmptyString(adapterFinalTarget?.chatId),
              messageThreadId: Number.isInteger(adapterFinalTarget?.messageThreadId) ? adapterFinalTarget.messageThreadId : null
            },
            trace || null
          );
          appendTraceEntry({
            type: "messaging.target.ensure",
            reason: normalizeNonEmptyString(result?.reason),
            adapter: adapterId,
            sessionId: normalizeNonEmptyString(session?.id),
            traceId: normalizeNonEmptyString(trace?.traceId),
            correlationId: normalizeNonEmptyString(trace?.correlationId),
            target: {
              chatId: normalizeNonEmptyString(adapterFinalTarget?.chatId),
              messageThreadId: Number.isInteger(adapterFinalTarget?.messageThreadId) ? adapterFinalTarget.messageThreadId : null
            }
          });
          rememberSessionForTarget(adapterFinalTarget, session);
          return adapterFinalTarget;
        })().finally(() => {
          pendingTargetEnsures.delete(ensureKey);
        });
        pendingTargetEnsures.set(ensureKey, ensurePromise);
      }
      const adapterFinalTarget = await ensurePromise;
      if (!finalTarget) {
        finalTarget = adapterFinalTarget;
      }
    }
    return finalTarget;
  }

  function resolveInboundTarget(target = {}) {
    const key = buildConversationKey(target.chatId, target.messageThreadId);
    if (ambiguousConversationKeys.has(key)) {
      return { error: "ambiguous" };
    }
    const mappedTarget = conversationTargetIndex.get(key);
    if (!mappedTarget) {
      return { error: "unmapped" };
    }
    return { target: mappedTarget };
  }

  async function executeInboundAction(request = {}) {
    const inboundResolution = resolveInboundTarget(request.target);
    if (inboundResolution.error === "unmapped") {
      const result = {
        ok: false,
        callbackText: "Unmapped chat.",
        text: "This Telegram chat is not mapped to a ptydeck session."
      };
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "unmapped" }), null);
      appendTraceEntry({ type: "messaging.inbound.reject", reason: "unmapped", adapter: request.adapter, text: result.text });
      return result;
    }
    if (inboundResolution.error === "ambiguous") {
      const result = {
        ok: false,
        callbackText: "Ambiguous mapping.",
        text: "This Telegram chat matches multiple ptydeck messaging targets. Narrow the mapping before using inbound actions."
      };
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "ambiguous" }), null);
      appendTraceEntry({ type: "messaging.inbound.reject", reason: "ambiguous", adapter: request.adapter, text: result.text });
      return result;
    }

    const target = inboundResolution.target;
    let session = null;
    let resolvedLiveSession = true;
    try {
      session = await resolveSessionForMessagingTarget(target);
    } catch (error) {
      resolvedLiveSession = false;
      session = getCachedSessionForTarget(target);
      if (!session) {
        const result = {
          ok: false,
          callbackText: "Session unavailable.",
          text: error instanceof Error ? error.message : "Mapped ptydeck session is unavailable."
        };
        logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "resolve_failed" }), null);
        appendTraceEntry({ type: "messaging.inbound.reject", reason: "resolve_failed", adapter: request.adapter, text: result.text });
        return result;
      }
    }
    if (!session || !normalizeNonEmptyString(session.id)) {
      const result = {
        ok: false,
        callbackText: "Session unavailable.",
        text: "Mapped ptydeck session is unavailable."
      };
      logDebug("messaging.inbound.reject", buildInboundLogDetails(request, { reason: "session_missing" }), null);
      appendTraceEntry({ type: "messaging.inbound.reject", reason: "session_missing", adapter: request.adapter, text: result.text });
      return result;
    }

    rememberSessionForTarget(target, session);
    const action = normalizeNonEmptyString(request.command?.action || request.action).toLowerCase();
    const trace = buildInboundTrace(request, session.id);
    const profile = resolveMessagingTriggerProfile(session, target);

    try {
      if (action === "input") {
        const payload = normalizeMessagingInboundInputPayload(request.text);
        if (!payload) {
          const result = {
            ok: false,
            callbackText: "Input rejected.",
            text: "Telegram text input was empty after normalization."
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "empty_input" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "empty_input", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        await requestMessagingSendInput(session.id, payload, {
          trace,
          sessionSnapshot: session,
          target,
          preview: request.preview || request.text || ""
        });
        const result = {
          ok: true,
          callbackText: "Input sent.",
          text: truncateResponseText(`Input sent to ${buildSessionLabel(session)}.`)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, inputLength: payload.length }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "input_sent", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      if (action === "status") {
        const result = {
          ok: true,
          callbackText: "Status ready.",
          text: buildInboundStatusText(session, profile)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "status", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      if (action === "stop") {
        if (session.state !== "running" && session.state !== "starting") {
          const result = {
            ok: true,
            callbackText: "Already stopped.",
            text: truncateResponseText(`${buildSessionLabel(session)} is already stopped.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, idempotent: true }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "stop_idempotent", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        await requestMessagingStop(session.id, { trace });
        const result = {
          ok: true,
          callbackText: "Stop requested.",
          text: truncateResponseText(`Stop requested for ${buildSessionLabel(session)}.`)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "stop", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      if (action === "retry") {
        if (resolvedLiveSession && (session.state === "running" || session.state === "starting")) {
          const result = {
            ok: false,
            callbackText: "Retry unavailable.",
            text: truncateResponseText(`Retry is unavailable while ${buildSessionLabel(session)} is ${session.state}.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "running" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "retry_unavailable", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        const restartedSession = await requestMessagingRetry(session.id, {
          trace,
          sessionSnapshot: session,
          target
        });
        const effectiveSession = restartedSession && restartedSession.id ? restartedSession : session;
        const result = {
          ok: true,
          callbackText: "Retry started.",
          text: truncateResponseText(`Retry started for ${buildSessionLabel(effectiveSession)}.`)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "retry", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      if (action === "replay") {
        const selector = normalizeMessagingInboundReplaySelector(request.command?.selector || request.selector);
        const excerpt = await requestMessagingReplayExcerpt(session.id, selector, { trace });
        const result = {
          ok: true,
          callbackText: `Replay ${selector}.`,
          text: buildReplayResponseText(session, excerpt)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, selector }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "replay", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      if (action === "custom") {
        const customCommandName = normalizeNonEmptyString(request.command?.customCommandName);
        const customCommand = resolveCustomCommandForSession(listCustomCommands(), customCommandName, session.id);
        if (!customCommand) {
          const result = {
            ok: false,
            callbackText: "Custom command unavailable.",
            text: truncateResponseText(`Custom command /${customCommandName || "unknown"} is unavailable for ${buildSessionLabel(session)}.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_missing" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_missing", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        const invocation = parseCustomCommandInvocation(
          normalizeInboundCustomInvocationText(
            normalizeNonEmptyString(request.text) || `/${request.command?.telegramCommand || customCommand.name}`,
            customCommand.name
          ),
          customCommand
        );
        if (!invocation?.ok) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(invocation?.error || `Custom command /${customCommand.name} is invalid.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_invalid" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_invalid", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        if (normalizeNonEmptyString(invocation.targetSelector)) {
          const result = {
            ok: false,
            callbackText: "Target redirect rejected.",
            text: truncateResponseText(`Telegram custom commands cannot redirect to another target. Use the mapped topic for /${customCommand.name}.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_target_redirect" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_target_redirect", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        const rendered = renderCustomCommandForSession(customCommand, session, resolveDeckForSession(session), invocation.parameterAssignments || {});
        if (!rendered?.ok) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(rendered?.error || `Custom command /${customCommand.name} is invalid.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_render_failed" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_render_failed", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        const payload = normalizeMessagingInboundInputPayload(normalizeCustomCommandPayloadForShell(rendered.text));
        if (!payload) {
          const result = {
            ok: false,
            callbackText: "Custom command rejected.",
            text: truncateResponseText(`Custom command /${customCommand.name} resolved to empty terminal input.`)
          };
          logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "custom_command_empty" }), trace);
          appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_empty", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
          return result;
        }
        await requestMessagingSendInput(session.id, payload, {
          trace,
          sessionSnapshot: session,
          target,
          preview: request.preview || request.text || ""
        });
        const result = {
          ok: true,
          callbackText: "Custom command sent.",
          text: truncateResponseText(`Custom command /${customCommand.name} sent to ${buildSessionLabel(session)}.`)
        };
        logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: true, customCommandName: customCommand.name }), trace);
        appendTraceEntry({ type: "messaging.inbound.action", reason: "custom_command_sent", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
        return result;
      }

      const result = {
        ok: false,
        callbackText: "Unsupported action.",
        text: "Unsupported messaging action. Use status, stop, retry, replay, or a published custom command."
      };
      logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, reason: "unsupported" }), trace);
      appendTraceEntry({ type: "messaging.inbound.action", reason: "unsupported", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
      return result;
    } catch (error) {
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Messaging action failed.";
      const result = {
        ok: false,
        callbackText: statusCode >= 500 ? "Action failed." : "Action rejected.",
        text: truncateResponseText(message)
      };
      logDebug("messaging.inbound.action", buildInboundLogDetails(request, { sessionId: session.id, ok: false, statusCode }), trace);
      appendTraceEntry({ type: "messaging.inbound.action", reason: "failed", sessionId: session.id, adapter: request.adapter, text: result.text, traceId: trace.traceId, correlationId: trace.correlationId });
      return result;
    }
  }

  async function syncTelegramCommandCatalog(trace = null) {
    if (!telegramConfigured || typeof telegramAdapter.syncCommands !== "function") {
      return { synced: false, reason: telegramConfigured ? "unsupported" : "disabled" };
    }
    const result = await telegramAdapter.syncCommands(
      buildTelegramCommandCatalog({
        customCommands: listCustomCommands()
      })
    );
    logDebug(
      "messaging.telegram.command_sync",
      {
        synced: result?.synced === true,
        reason: normalizeNonEmptyString(result?.reason),
        publishedCommandCount: Number.isInteger(result?.publishedCommandCount) ? result.publishedCommandCount : 0,
        skippedCommandCount: Number.isInteger(result?.skippedCommandCount) ? result.skippedCommandCount : 0,
        error: normalizeNonEmptyString(result?.error)
      },
      trace || null
    );
    appendTraceEntry({
      type: "messaging.telegram.command_sync",
      reason: normalizeNonEmptyString(result?.reason) || (result?.synced ? "synced" : "failed"),
      adapter: "telegram",
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
    return result;
  }

  async function start() {
    await syncTelegramCommandCatalog();
    for (const adapter of adapters) {
      if (typeof adapter.startInbound === "function") {
        await adapter.startInbound({
          onCommand: (request) =>
            executeInboundAction({
              ...request,
              adapter: "telegram"
            })
        });
      }
    }
  }

  async function stop() {
    for (const adapter of adapters) {
      if (typeof adapter.stop === "function") {
        await adapter.stop();
      }
    }
  }

  function buildStatusSummary() {
    const adapterStatuses = adapters.map((adapter) => adapter.getStatus());
    return {
      enabled: adapterStatuses.some((status) => status?.enabled === true),
      deliveryEnabled: adapterStatuses.some((status) => status?.deliveryEnabled === true),
      mode: "transport_only",
      runtimeReadyAt,
      boundaryContracts: ["DeliveryAdapter", "MessageIntent"],
      adapters: adapterStatuses,
      trace: {
        capacity: MAX_RUNTIME_TRACE_ENTRIES,
        capturedTotal: traceCapturedTotal,
        recent: traceEntries.slice(-MAX_RUNTIME_TRACE_ENTRIES)
      }
    };
  }

  function renderMetricLines() {
    return [
      'ptydeck_messaging_runtime_mode{mode="transport_only"} 1',
      ...adapters.flatMap((adapter) => (typeof adapter.renderMetricLines === "function" ? adapter.renderMetricLines() : []))
    ];
  }

  function prepareForRuntimeStart() {
    traceEntries.length = 0;
    traceCapturedTotal = 0;
    runtimeReadyAt = 0;
  }

  function markRuntimeReady() {
    runtimeReadyAt = nowFn();
  }

  async function observeSessionActivityStarted({ sessionId, trace } = {}) {
    appendTraceEntry({
      type: "session.activity.started",
      sessionId: normalizeNonEmptyString(sessionId),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  async function observeSessionData({ session, trace } = {}) {
    rememberSession(session);
    appendTraceEntry({
      type: "session.data.observed",
      sessionId: normalizeNonEmptyString(session?.id),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  async function observeSessionIdle({ session, trace } = {}) {
    rememberSession(session);
    appendTraceEntry({
      type: "session.activity.idle",
      sessionId: normalizeNonEmptyString(session?.id),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  async function observeSessionLifecycle(_eventName, session, trace) {
    rememberSession(session);
    appendTraceEntry({
      type: "session.lifecycle",
      sessionId: normalizeNonEmptyString(session?.id),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  async function observeShareChange({ session, trace } = {}) {
    rememberSession(session);
    appendTraceEntry({
      type: "session.share.changed",
      sessionId: normalizeNonEmptyString(session?.id),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  function observeSessionInput(sessionId, trace = {}) {
    appendTraceEntry({
      type: "session.input.observed",
      sessionId: normalizeNonEmptyString(sessionId),
      traceId: normalizeNonEmptyString(trace?.traceId),
      correlationId: normalizeNonEmptyString(trace?.correlationId)
    });
  }

  return {
    buildStatusSummary,
    ensureSessionTarget,
    markRuntimeReady,
    observeSessionActivityStarted,
    observeSessionData,
    observeSessionIdle,
    observeSessionInput,
    observeSessionLifecycle,
    observeShareChange,
    prepareForRuntimeStart,
    renderMetricLines,
    replaceTelegramTopicBindings,
    start,
    stop,
    syncTelegramCommandCatalog
  };
}
