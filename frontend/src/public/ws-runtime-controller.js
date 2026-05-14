export function createWsRuntimeController(options = {}) {
  const createWsClient = options.createWsClient;
  const wsUrl = String(options.wsUrl || "");
  const debug = options.debug === true;
  const log = typeof options.log === "function" ? options.log : () => {};
  const setConnectionState = options.setConnectionState || (() => {});
  const getRuntimeBootstrapSource = options.getRuntimeBootstrapSource || (() => "pending");
  const onRuntimeConnected = options.onRuntimeConnected || (() => {});
  const hasTerminal = options.hasTerminal || (() => false);
  const pushSessionData = options.pushSessionData || (() => {});
  const observeSessionData = options.observeSessionData || (() => {});
  const applyRuntimeEvent = options.applyRuntimeEvent || (() => false);
  const interpretRuntimeEvent =
    typeof options.interpretRuntimeEvent === "function" ? options.interpretRuntimeEvent : () => ({ batches: [], errors: [] });
  const applySessionInterpretationActions =
    typeof options.applySessionInterpretationActions === "function"
      ? options.applySessionInterpretationActions
      : () => {};
  const recordTrace = typeof options.recordTrace === "function" ? options.recordTrace : () => {};
  const getWsAuthToken = options.getWsAuthToken || (() => "");
  const createWsTicket = typeof options.createWsTicket === "function" ? options.createWsTicket : null;
  const getTrustedLocalWsClientMetadata =
    typeof options.getTrustedLocalWsClientMetadata === "function" ? options.getTrustedLocalWsClientMetadata : null;
  const bootstrapDevAuthToken = options.bootstrapDevAuthToken || (() => Promise.resolve(false));

  function encodeBase64UrlUtf8(value = "") {
    const source = String(value);
    if (typeof TextEncoder === "function" && typeof btoa === "function") {
      const bytes = new TextEncoder().encode(source);
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    }
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(source))).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    }
    throw new Error("No base64 encoder is available for trusted-local WebSocket client metadata.");
  }

  function encodeTrustedLocalClientProtocol(value = {}) {
    const clientId = typeof value.clientId === "string" ? value.clientId.trim() : "";
    const label = typeof value.label === "string" ? value.label.trim() : "";
    if (!clientId) {
      return "";
    }
    const payload = JSON.stringify({ clientId, ...(label ? { label } : {}) });
    return `ptydeck.client.${encodeBase64UrlUtf8(payload)}`;
  }

  function normalizeInterpretationResult(result) {
    if (Array.isArray(result)) {
      return { batches: result, errors: [] };
    }
    if (!result || typeof result !== "object") {
      return { batches: [], errors: [] };
    }
    return {
      batches: Array.isArray(result.batches) ? result.batches : [],
      errors: Array.isArray(result.errors) ? result.errors : []
    };
  }

  function applyInterpretationResult(event) {
    let result;
    try {
      result = normalizeInterpretationResult(interpretRuntimeEvent(event));
    } catch (error) {
      log("ws.interpretation.error", {
        type: event?.type || "",
        sessionId: event?.sessionId || event?.session?.id || "",
        message: error?.message || "Stream interpretation failed."
      });
      return;
    }
    for (const error of result.errors) {
      log("ws.interpretation.error", {
        type: event?.type || "",
        sessionId: event?.sessionId || event?.session?.id || "",
        pluginId: error?.pluginId || "",
        message: error?.message || "Stream interpretation plugin failed."
      });
    }
    for (const batch of result.batches) {
      if (!batch?.sessionId || !Array.isArray(batch.actions) || batch.actions.length === 0) {
        continue;
      }
      applySessionInterpretationActions(batch.sessionId, batch.actions);
    }
  }

  function start() {
    return createWsClient(wsUrl, {
      onState(status) {
        log("ws.state", { status });
        setConnectionState(status);
        if (status === "connected" && getRuntimeBootstrapSource() !== "pending") {
          onRuntimeConnected();
        }
      },
      onMessage(event) {
        const trace = event && typeof event === "object" && event.trace && typeof event.trace === "object" ? event.trace : null;
        if (trace) {
          recordTrace({
            source: "ws",
            type: event.type,
            sessionId: event.sessionId || event.session?.id || trace.sessionId || "",
            trace
          });
        }
        log("ws.event", {
          type: event.type,
          sessionId: event.sessionId || null,
          traceId: trace?.traceId || "",
          correlationId: trace?.correlationId || ""
        });
        if (event.type === "session.data") {
          observeSessionData(event.sessionId, event.data);
          applyInterpretationResult(event);
          if (hasTerminal(event.sessionId)) {
            pushSessionData(event.sessionId, event.data);
            return;
          }
          applyRuntimeEvent(event);
          return;
        }
        applyRuntimeEvent(event);
        applyInterpretationResult(event);
      }
    }, {
      debug,
      log,
      protocolsProvider: async () => {
        let authToken = getWsAuthToken();
        if (!authToken && createWsTicket) {
          const refreshed = await bootstrapDevAuthToken({ reason: "ws-missing-auth" });
          if (refreshed) {
            authToken = getWsAuthToken();
          }
        }
        if (!authToken) {
          const trustedLocalProtocol = encodeTrustedLocalClientProtocol(getTrustedLocalWsClientMetadata?.() || {});
          return trustedLocalProtocol ? ["ptydeck.v1", trustedLocalProtocol] : ["ptydeck.v1"];
        }
        if (!createWsTicket) {
          return ["ptydeck.v1"];
        }
        let payload;
        try {
          payload = await createWsTicket();
        } catch (err) {
          const status = err && typeof err.status === "number" ? err.status : 0;
          if (status === 401 && authToken) {
            const refreshed = await bootstrapDevAuthToken({ reason: "ws-ticket-401" });
            if (!refreshed) {
              throw err;
            }
            payload = await createWsTicket();
          } else {
            throw err;
          }
        }
        const ticket = payload && typeof payload.ticket === "string" ? payload.ticket.trim() : "";
        if (!ticket) {
          throw new Error("WebSocket ticket response did not include a ticket.");
        }
        return ["ptydeck.v1", `ptydeck.auth.${ticket}`];
      }
    });
  }

  return {
    start
  };
}
