export function createWsClient(url, handlers, options = {}) {
  let socket = null;
  let closed = false;
  let reconnectTimer = null;
  const debug = options.debug === true;
  const log = typeof options.log === "function" ? options.log : () => {};

  function connect() {
    if (debug) {
      log("ws.connecting", { url });
    }
    handlers.onState("connecting");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
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
    });

    socket.addEventListener("close", () => {
      if (closed) {
        if (debug) {
          log("ws.closed.manual", { url });
        }
        return;
      }
      if (debug) {
        log("ws.closed.reconnect", { url, delayMs: 1000 });
      }
      handlers.onState("reconnecting");
      reconnectTimer = setTimeout(connect, 1000);
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
