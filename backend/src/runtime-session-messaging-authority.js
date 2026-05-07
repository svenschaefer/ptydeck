import { Buffer } from "node:buffer";

import { ApiError } from "./errors.js";
import {
  deriveTerminalAppIdentityFromSessionHints as deriveTerminalAppIdentityFromSessionHintsBase,
  normalizeTerminalAppIdentity as normalizeTerminalAppIdentityBase
} from "./terminal-app-identity.js";

const DEFAULT_MESSAGING_CODEX_SUBMIT_DELAY_MS = 90;

export function createRuntimeSessionMessagingAuthority(dependencies = {}) {
  const {
    manager = {
      list: () => [],
      create: (payload) => payload,
      restart: () => null,
      terminate: () => {},
      sendInput: () => {}
    },
    withDeckId = (session) => session,
    buildApiSessionControlState = () => null,
    getApiSessionOrThrow = () => null,
    ensureMessagingSessionInputAccess = () => {},
    assignSessionQuickIdToken = () => "",
    getSessionQuickIdToken = () => "",
    observeSessionInput = () => {},
    recordSessionLastInput = () => {},
    broadcastSessionUpdated = () => {},
    buildSessionReplayExcerptOrThrow = () => null,
    normalizeTraceSeed = (trace) => trace,
    logDebug = () => {},
    setTimeoutFn = setTimeout,
    messagingCodexSubmitDelayMs = DEFAULT_MESSAGING_CODEX_SUBMIT_DELAY_MS,
    normalizeTerminalAppIdentity = normalizeTerminalAppIdentityBase,
    deriveTerminalAppIdentityFromSessionHints = deriveTerminalAppIdentityFromSessionHintsBase
  } = dependencies;

  function toApiSession(session, explicitState) {
    const sessionState =
      typeof explicitState === "string" && explicitState.trim()
        ? explicitState.trim()
        : String(session?.state || "").trim();
    const sessionModel = withDeckId(session);
    const fallbackUpdatedAt = Number.isInteger(sessionModel?.updatedAt) ? sessionModel.updatedAt : Date.now();
    const appIdentity = normalizeTerminalAppIdentity(sessionModel?.appIdentity, {
      fallbackUpdatedAt
    });
    const resolvedAppIdentity =
      appIdentity.source === "unknown" && !sessionModel?.appIdentity
        ? deriveTerminalAppIdentityFromSessionHints(sessionModel, {
            existingIdentity: sessionModel?.appIdentity,
            updatedAt: fallbackUpdatedAt
          })
        : appIdentity;
    return {
      ...sessionModel,
      appIdentity: resolvedAppIdentity,
      state: sessionState || "running",
      controlState: buildApiSessionControlState(session?.id, sessionModel)
    };
  }

  function resolveSessionForMessagingTarget(target) {
    const normalizedSessionId = typeof target?.sessionId === "string" ? target.sessionId.trim() : "";
    if (normalizedSessionId) {
      return getApiSessionOrThrow(normalizedSessionId);
    }

    const normalizedQuickIdToken = typeof target?.quickIdToken === "string" ? target.quickIdToken.trim() : "";
    const normalizedSessionName = typeof target?.sessionName === "string" ? target.sessionName.trim() : "";
    const matches = manager.list().filter((session) => {
      if (normalizedQuickIdToken && getSessionQuickIdToken(session.id) !== normalizedQuickIdToken) {
        return false;
      }
      if (normalizedSessionName && session.name !== normalizedSessionName) {
        return false;
      }
      return Boolean(normalizedQuickIdToken || normalizedSessionName);
    });
    if (matches.length === 0) {
      throw new ApiError(404, "SessionNotFound", "Mapped ptydeck session was not found.");
    }
    if (matches.length > 1) {
      throw new ApiError(
        409,
        "MessagingTargetAmbiguous",
        "Mapped ptydeck session is ambiguous. Narrow the Telegram target selector."
      );
    }
    return toApiSession(matches[0]);
  }

  function requestMessagingStop(sessionId, options = {}) {
    manager.terminate(sessionId, options);
    return null;
  }

  function requestMessagingRetry(sessionId, options = {}) {
    try {
      const payload = manager.restart(sessionId, options);
      assignSessionQuickIdToken(payload.id, payload.quickIdToken);
      return toApiSession(payload);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }

    const snapshot = options.sessionSnapshot && typeof options.sessionSnapshot === "object" ? options.sessionSnapshot : null;
    if (!snapshot || !snapshot.id) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    const payload = manager.create({
      id: snapshot.id,
      kind: snapshot.kind,
      remoteConnection: snapshot.remoteConnection,
      remoteAuth: snapshot.remoteAuth,
      remoteSecret: snapshot.remoteSecret,
      quickIdToken: snapshot.quickIdToken,
      cwd: snapshot.startCwd || snapshot.cwd,
      shell: snapshot.shell,
      name: snapshot.name,
      deckId: snapshot.deckId,
      startCwd: snapshot.startCwd || snapshot.cwd,
      startCommand: snapshot.startCommand || "",
      env: snapshot.env || {},
      note: snapshot.note,
      mouseForwardingMode: snapshot.mouseForwardingMode,
      inputSafetyProfile: snapshot.inputSafetyProfile,
      tags: snapshot.tags || [],
      themeProfile: snapshot.themeProfile || {},
      activeThemeProfile: snapshot.activeThemeProfile,
      inactiveThemeProfile: snapshot.inactiveThemeProfile,
      quickSendUsage: snapshot.quickSendUsage || [],
      createdAt: snapshot.createdAt,
      updatedAt: Date.now(),
      trace: options.trace
    });
    assignSessionQuickIdToken(payload.id, payload.quickIdToken);
    return toApiSession(payload);
  }

  function requestMessagingSendInput(sessionId, data, options = {}) {
    getApiSessionOrThrow(sessionId);
    ensureMessagingSessionInputAccess(sessionId, "send terminal input");
    const trace = {
      ...(options.trace && typeof options.trace === "object" ? options.trace : {}),
      sessionId
    };
    const normalizedData = typeof data === "string" ? data : "";
    const replyInputText = normalizedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "").trim();
    const useDelayedSubmit = /\r$/.test(normalizedData);
    const replyPromotionEligible = /[\r\n]/.test(normalizedData);
    const baseWriteDetails = {
      sessionId,
      source: normalizeTraceSeed(trace)?.source || "",
      useDelayedSubmit,
      replyPromotionEligible,
      payloadBytes: Buffer.byteLength(normalizedData, "utf8")
    };
    const preSubmitObservationTrace = {
      ...trace,
      ...(replyInputText ? { replyInputText } : {})
    };
    delete preSubmitObservationTrace.replyEligible;
    delete preSubmitObservationTrace.replyPromotionEligible;
    const directInputTrace = replyPromotionEligible ? { ...trace, replyPromotionEligible: true } : trace;
    const enrichedDirectInputTrace = replyInputText ? { ...directInputTrace, replyInputText } : directInputTrace;

    function logMessagingInputWrite(event, details = {}, traceContext = null) {
      logDebug(
        event,
        {
          ...baseWriteDetails,
          ...details
        },
        traceContext || trace
      );
    }

    if (useDelayedSubmit) {
      const body = normalizedData.replace(/\r+$/g, "");
      if (body) {
        observeSessionInput(sessionId, preSubmitObservationTrace);
        const bodyTrace = replyInputText ? { ...trace, replyInputText } : trace;
        logMessagingInputWrite(
          "messaging.input.write_attempt",
          {
            writeKind: "body",
            bytes: Buffer.byteLength(body, "utf8")
          },
          bodyTrace
        );
        try {
          manager.sendInput(sessionId, body, {
            trace: bodyTrace,
            writeKind: "body"
          });
          logMessagingInputWrite(
            "messaging.input.write_ok",
            {
              writeKind: "body",
              bytes: Buffer.byteLength(body, "utf8")
            },
            bodyTrace
          );
        } catch (error) {
          logMessagingInputWrite(
            "messaging.input.write_failed",
            {
              writeKind: "body",
              bytes: Buffer.byteLength(body, "utf8"),
              error: error instanceof Error ? error.message : String(error || "write failed")
            },
            bodyTrace
          );
          throw error;
        }
      }
      logMessagingInputWrite("messaging.input.delayed_submit_scheduled", {
        writeKind: "submit_cr",
        delayMs: messagingCodexSubmitDelayMs,
        bodyBytes: Buffer.byteLength(body, "utf8"),
        submitBytes: 1
      });
      return new Promise((resolve, reject) => {
        setTimeoutFn(() => {
          const submitTrace = replyPromotionEligible ? { ...trace, replyPromotionEligible: true } : trace;
          const enrichedSubmitTrace = replyInputText ? { ...submitTrace, replyInputText } : submitTrace;
          logMessagingInputWrite(
            "messaging.input.delayed_submit_fired",
            {
              writeKind: "submit_cr",
              bytes: 1
            },
            enrichedSubmitTrace
          );
          observeSessionInput(sessionId, enrichedSubmitTrace);
          logMessagingInputWrite(
            "messaging.input.write_attempt",
            {
              writeKind: "submit_cr",
              bytes: 1
            },
            enrichedSubmitTrace
          );
          try {
            manager.sendInput(sessionId, "\r", {
              trace: enrichedSubmitTrace,
              writeKind: "submit_cr"
            });
            logMessagingInputWrite(
              "messaging.input.write_ok",
              {
                writeKind: "submit_cr",
                bytes: 1
              },
              enrichedSubmitTrace
            );
            recordSessionLastInput(sessionId, null, null);
            broadcastSessionUpdated(sessionId, options.trace || null);
            resolve(getApiSessionOrThrow(sessionId));
          } catch (error) {
            logMessagingInputWrite(
              "messaging.input.write_failed",
              {
                writeKind: "submit_cr",
                bytes: 1,
                error: error instanceof Error ? error.message : String(error || "write failed")
              },
              enrichedSubmitTrace
            );
            reject(error);
          }
        }, messagingCodexSubmitDelayMs);
      });
    }

    observeSessionInput(sessionId, enrichedDirectInputTrace);
    logMessagingInputWrite(
      "messaging.input.write_attempt",
      {
        writeKind: "direct",
        bytes: Buffer.byteLength(normalizedData, "utf8")
      },
      enrichedDirectInputTrace
    );
    try {
      manager.sendInput(sessionId, normalizedData, {
        trace: enrichedDirectInputTrace,
        writeKind: "direct"
      });
      logMessagingInputWrite(
        "messaging.input.write_ok",
        {
          writeKind: "direct",
          bytes: Buffer.byteLength(normalizedData, "utf8")
        },
        enrichedDirectInputTrace
      );
    } catch (error) {
      logMessagingInputWrite(
        "messaging.input.write_failed",
        {
          writeKind: "direct",
          bytes: Buffer.byteLength(normalizedData, "utf8"),
          error: error instanceof Error ? error.message : String(error || "write failed")
        },
        enrichedDirectInputTrace
      );
      throw error;
    }
    recordSessionLastInput(sessionId, null, null);
    broadcastSessionUpdated(sessionId, options.trace || null);
    return getApiSessionOrThrow(sessionId);
  }

  function requestMessagingReplayExcerpt(sessionId, selector) {
    return buildSessionReplayExcerptOrThrow(sessionId, selector);
  }

  return {
    requestMessagingReplayExcerpt,
    requestMessagingRetry,
    requestMessagingSendInput,
    requestMessagingStop,
    resolveSessionForMessagingTarget,
    toApiSession
  };
}
