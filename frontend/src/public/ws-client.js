export function createWsClient(url, handlers, options = {}) {
  const BASE_RECONNECT_MS = 500;
  const MAX_RECONNECT_MS = 10000;
  const JITTER_RATIO = 0.2;
  let socket = null;
  let closed = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const debug = options.debug === true;
  const log = typeof options.log === "function" ? options.log : () => {};

  function nextReconnectDelayMs() {
    const base = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * (2 ** reconnectAttempts));
    const jitterMultiplier = 1 + ((Math.random() * 2 - 1) * JITTER_RATIO);
    const jittered = Math.round(base * jitterMultiplier);
    reconnectAttempts += 1;
    return Math.max(100, Math.min(MAX_RECONNECT_MS, jittered));
  }

  function connect() {
    if (debug) {
      log("ws.connecting", { url });
    }
    handlers.onState("connecting");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      if (debug) {
        log("ws.open", { url });
      }
      handlers.onState("connected");
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (debug) {
          log("ws.message", { type: message?.type || "unknown" });
        }
        handlers.onMessage(message);
      } catch {
        if (debug) {
          log("ws.message.parse_error", {});
        }
        // ignore malformed payloads
      }
    });

    socket.addEventListener("error", () => {
      if (debug) {
        log("ws.error", { url });
      }
      handlers.onState("error");
    });

    socket.addEventListener("close", () => {
      if (closed) {
        if (debug) {
          log("ws.closed.manual", { url });
        }
        return;
      }
      const delayMs = nextReconnectDelayMs();
      if (debug) {
        log("ws.closed.reconnect", { url, delayMs, reconnectAttempts });
      }
      handlers.onState("reconnecting");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
      if (debug) {
        log("ws.close.requested", { url });
      }
    }
  };
}
