export function createWsClient(url, handlers, options = {}) {
  const BASE_RECONNECT_MS = 500;
  const MAX_RECONNECT_MS = 10000;
  const JITTER_RATIO = 0.2;
  let socket = null;
  let closed = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let connectGeneration = 0;
  const debug = options.debug === true;
  const log = typeof options.log === "function" ? options.log : () => {};
  const protocolsProvider = typeof options.protocolsProvider === "function" ? options.protocolsProvider : null;

  function nextReconnectDelayMs() {
    const base = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * (2 ** reconnectAttempts));
    const jitterMultiplier = 1 + ((Math.random() * 2 - 1) * JITTER_RATIO);
    const jittered = Math.round(base * jitterMultiplier);
    reconnectAttempts += 1;
    return Math.max(100, Math.min(MAX_RECONNECT_MS, jittered));
  }

  function scheduleReconnect() {
    const delayMs = nextReconnectDelayMs();
    if (debug) {
      log("ws.closed.reconnect", { url, delayMs, reconnectAttempts });
    }
    handlers.onState("reconnecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  async function connect() {
    const generation = ++connectGeneration;
    if (debug) {
      log("ws.connecting", { url });
    }
    handlers.onState("connecting");
    let protocols = undefined;
    try {
      const resolved = protocolsProvider ? await protocolsProvider() : undefined;
      if (Array.isArray(resolved) && resolved.length > 0) {
        protocols = resolved;
      }
    } catch (error) {
      if (closed || generation !== connectGeneration) {
        return;
      }
      if (debug) {
        log("ws.protocols.error", { message: error instanceof Error ? error.message : String(error) });
      }
      handlers.onState("error");
      scheduleReconnect();
      return;
    }

    if (closed || generation !== connectGeneration) {
      return;
    }

    socket = new WebSocket(url, protocols);

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
      scheduleReconnect();
    });
  }

  connect();

  return {
    close() {
      closed = true;
      connectGeneration += 1;
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
