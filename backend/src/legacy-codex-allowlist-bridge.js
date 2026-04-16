import { createMessageIntent, createOutputEpisode, createTurn } from "./terminal-messaging-core.js";

function normalizeNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLineBreaks(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function resolveLegacyMessageIntentTurn({ state, session, decision, trace, nowFn }) {
  const activeTurn = state?.activeTerminalTurn;
  const lastCompletedTurn = state?.lastCompletedTerminalTurn;
  if (activeTurn?.turn) {
    return activeTurn.turn;
  }
  if (
    lastCompletedTurn?.turn &&
    Number.isInteger(lastCompletedTurn.turn.closedAt) &&
    Number.isInteger(decision?.lastObservedAt) &&
    lastCompletedTurn.turn.closedAt >= decision.lastObservedAt
  ) {
    return lastCompletedTurn.turn;
  }
  if (lastCompletedTurn?.turn) {
    return lastCompletedTurn.turn;
  }
  return createTurn({
    turnId:
      normalizeNonEmptyString(decision?.deliveryBlockKey) ||
      normalizeNonEmptyString(decision?.key) ||
      normalizeNonEmptyString(trace?.correlationId) ||
      normalizeNonEmptyString(trace?.traceId),
    sessionId: normalizeNonEmptyString(session?.id),
    triggerKind: "submitted-input",
    inputSource: normalizeNonEmptyString(trace?.source),
    correlationId: normalizeNonEmptyString(trace?.correlationId),
    traceId: normalizeNonEmptyString(trace?.traceId),
    openedAt: Number.isInteger(decision?.firstObservedAt) ? decision.firstObservedAt : nowFn(),
    closedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : nowFn(),
    status: "completed"
  });
}

function resolveLegacyMessageIntentOutputEpisode({ state, session, decision, trace, nowFn }) {
  const activeEpisode = state?.activeOutputEpisode;
  const lastCompletedEpisode = state?.lastCompletedOutputEpisode;
  const runtimeEpisode = activeEpisode?.outputEpisode || lastCompletedEpisode?.outputEpisode || null;
  return createOutputEpisode({
    episodeId:
      normalizeNonEmptyString(decision?.deliveryBlockKey) ||
      normalizeNonEmptyString(decision?.key) ||
      normalizeNonEmptyString(trace?.traceId),
    sessionId: normalizeNonEmptyString(session?.id),
    episodeKind: "autonomous-output",
    sourceProjectionId: normalizeNonEmptyString(runtimeEpisode?.sourceProjectionId),
    completedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : nowFn(),
    startedAt:
      Number.isInteger(runtimeEpisode?.startedAt) && runtimeEpisode.startedAt > 0
        ? runtimeEpisode.startedAt
        : Number.isInteger(decision?.firstObservedAt)
          ? decision.firstObservedAt
          : nowFn(),
    status:
      normalizeNonEmptyString(runtimeEpisode?.status) ||
      (activeEpisode?.outputEpisode ? "open" : "completed"),
    metadata: {
      runtimeEpisodeId: normalizeNonEmptyString(runtimeEpisode?.episodeId),
      transcriptStartRevision:
        Number.isInteger(activeEpisode?.transcriptStartRevision) && activeEpisode.transcriptStartRevision >= 0
          ? activeEpisode.transcriptStartRevision
          : Number.isInteger(lastCompletedEpisode?.transcriptStartRevision) &&
              lastCompletedEpisode.transcriptStartRevision >= 0
            ? lastCompletedEpisode.transcriptStartRevision
            : 0
    }
  });
}

export function buildLegacyCodexMessageIntent({
  session,
  profile,
  state,
  trace,
  decision,
  deliveryIdentity,
  messageText,
  candidateKey,
  deliveryBlockKey,
  maxLength,
  buildMessageIntentProjection,
  buildAppSemanticAdapterDescriptorForSession,
  deliveryAdapterDescriptors,
  createComparableText,
  nowFn
}) {
  const traceId = normalizeNonEmptyString(trace?.traceId);
  const deliveryScope = normalizeNonEmptyString(deliveryIdentity?.scope);
  const deliverySignal = normalizeNonEmptyString(deliveryIdentity?.signal);
  const projection = buildMessageIntentProjection(state, session, profile, {
    deliveryScope,
    candidateKey,
    deliveryBlockKey,
    firstObservedAt: Number.isInteger(decision?.firstObservedAt) ? decision.firstObservedAt : 0,
    lastObservedAt: Number.isInteger(decision?.lastObservedAt) ? decision.lastObservedAt : 0,
    traceId,
    projectionSource: "legacy-candidate-bridge"
  });
  const semanticAdapter = buildAppSemanticAdapterDescriptorForSession(session, profile, "legacy-codex-allowlist");
  const structuredText = deliverySignal !== "turn-primary-reply" || /\n/u.test(messageText);
  if (deliverySignal === "turn-primary-reply") {
    const turn = resolveLegacyMessageIntentTurn({ state, session, decision, trace, nowFn });
    return createMessageIntent({
      intentId:
        deliveryBlockKey ||
        candidateKey ||
        normalizeNonEmptyString(turn?.correlationId) ||
        normalizeNonEmptyString(turn?.traceId) ||
        traceId,
      sessionId: session.id,
      intentKind: deliverySignal || "reply",
      eventType: "session.output.summary",
      severity: "info",
      threadKey: "status",
      text: messageText,
      format: structuredText ? "structured_text" : "plain_text",
      comparableText: createComparableText(messageText),
      projection,
      turn,
      semanticAdapter,
      deliveryAdapters: deliveryAdapterDescriptors,
      routing: {
        threadKey: "status",
        priority: "primary"
      },
      metadata: {
        aggregationReason: deliverySignal || deliveryScope,
        legacyDeliveryScope: deliveryScope,
        deliverySignal,
        summaryMaxLength: maxLength,
        preserveStructuredSummary: structuredText
      }
    });
  }
  const outputEpisode = resolveLegacyMessageIntentOutputEpisode({ state, session, decision, trace, nowFn });
  return createMessageIntent({
    intentId: deliveryBlockKey || candidateKey || traceId,
    sessionId: session.id,
    intentKind: deliverySignal || "autonomous-update",
    eventType: "session.output.summary",
    severity: "info",
    threadKey: "status",
    text: messageText,
    format: structuredText ? "structured_text" : "plain_text",
    comparableText: createComparableText(messageText),
    projection,
    outputEpisode,
    semanticAdapter,
    deliveryAdapters: deliveryAdapterDescriptors,
    routing: {
      threadKey: "status",
      priority: "secondary"
    },
    metadata: {
      aggregationReason: deliverySignal || deliveryScope,
      legacyDeliveryScope: deliveryScope,
      deliverySignal,
      summaryMaxLength: maxLength,
      preserveStructuredSummary: structuredText
    }
  });
}

export function createLegacyCodexAllowlistDispatchBridge({
  codexTelegramReplyScope,
  signalMaxTextLengths,
  normalizeAllowlistDeliveryIdentity,
  buildCodexSeparatorDeliveryBlockKey,
  buildLegacyMessageIntent,
  recordTurnPrimaryReplyCandidate,
  recordOutputEpisodePrimaryIntentCandidate,
  createEventFromMessageIntent,
  isCommentaryLikeCodexOutboundText,
  isCodexTelegramReplyActive,
  buildCodexRestartRecoveryDecision,
  dispatchMessageIntent,
  resolveTarget,
  bumpEventMetric,
  recordDispatchTrace,
  getLastAllowlistCandidateKey,
  setLastAllowlistCandidateKey
}) {
  return Object.freeze({
    async dispatchCandidate({ session, profile, state, trace, decision }) {
      const deliveryIdentity = normalizeAllowlistDeliveryIdentity(normalizeNonEmptyString(decision?.family), "");
      const maxLength = Number.isInteger(signalMaxTextLengths?.[deliveryIdentity.signal])
        ? signalMaxTextLengths[deliveryIdentity.signal]
        : signalMaxTextLengths.default;
      const messageText = normalizeLineBreaks(String(decision?.text || ""));
      const candidateKey = normalizeNonEmptyString(decision?.key);
      const deliveryBlockKey = buildCodexSeparatorDeliveryBlockKey(decision);
      const lastCandidateKey = getLastAllowlistCandidateKey(state, deliveryIdentity);
      if (!messageText || candidateKey === lastCandidateKey) {
        return null;
      }
      const messageIntent = buildLegacyMessageIntent({
        session,
        profile,
        state,
        trace,
        decision,
        deliveryIdentity,
        messageText,
        candidateKey,
        deliveryBlockKey,
        maxLength
      });
      if (deliveryIdentity.signal === "turn-primary-reply") {
        recordTurnPrimaryReplyCandidate(state, messageIntent);
      } else {
        recordOutputEpisodePrimaryIntentCandidate(state, messageIntent);
      }
      const event = createEventFromMessageIntent({
        session,
        profile,
        trace,
        intent: {
          ...messageIntent,
          metadata: {
            ...messageIntent.metadata,
            summaryMaxLength: maxLength
          }
        }
      });
      const target = resolveTarget(session);
      if (isCommentaryLikeCodexOutboundText(messageText, session, profile)) {
        const decisionResult = Object.freeze({
          action: "suppress",
          messageKey: event.threadKey,
          reason: "commentary_progress_chatter"
        });
        bumpEventMetric(event.profile, event.type, decisionResult.action);
        recordDispatchTrace(event, decisionResult, target, []);
        return Object.freeze({
          ...decisionResult,
          delivered: false,
          delivery: []
        });
      }
      if (
        deliveryIdentity.scope !== codexTelegramReplyScope &&
        isCodexTelegramReplyActive(state?.pendingCodexTelegramReply, event.occurredAt)
      ) {
        setLastAllowlistCandidateKey(state, deliveryIdentity, candidateKey);
        const decisionResult = Object.freeze({
          action: "suppress",
          messageKey: event.threadKey,
          reason: "telegram_reply_window_priority"
        });
        bumpEventMetric(event.profile, event.type, decisionResult.action);
        recordDispatchTrace(event, decisionResult, target, []);
        return Object.freeze({
          ...decisionResult,
          delivered: false,
          delivery: []
        });
      }
      const restartRecoveryDecision = buildCodexRestartRecoveryDecision(event, target);
      if (restartRecoveryDecision) {
        bumpEventMetric(event.profile, event.type, restartRecoveryDecision.action);
        recordDispatchTrace(event, restartRecoveryDecision, target, []);
        return Object.freeze({
          ...restartRecoveryDecision,
          delivered: false,
          delivery: []
        });
      }
      const dispatchResult = await dispatchMessageIntent(session, profile, trace, messageIntent);
      if (dispatchResult?.delivered === true) {
        setLastAllowlistCandidateKey(state, deliveryIdentity, candidateKey);
      }
      return dispatchResult;
    }
  });
}
