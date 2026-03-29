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
  const recordTrace = typeof options.recordTrace === "function" ? options.recordTrace : () => {};
  const getWsAuthToken = options.getWsAuthToken || (() => "");
  const createWsTicket = options.createWsTicket || (() => Promise.resolve({ ticket: "" }));
  const bootstrapDevAuthToken = options.bootstrapDevAuthToken || (() => Promise.resolve(false));

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
          if (hasTerminal(event.sessionId)) {
            pushSessionData(event.sessionId, event.data);
            return;
          }
        }
        applyRuntimeEvent(event);
      }
    }, {
      debug,
      log,
      protocolsProvider: async () => {
        if (!getWsAuthToken()) {
          return ["ptydeck.v1"];
        }
        let payload;
        try {
          payload = await createWsTicket();
        } catch (err) {
          const status = err && typeof err.status === "number" ? err.status : 0;
          if (status === 401) {
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
