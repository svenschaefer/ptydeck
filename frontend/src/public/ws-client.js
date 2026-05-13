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
    if (closed || reconnectTimer) {
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

    try {
      socket = new WebSocket(url, protocols);
    } catch (error) {
      if (closed || generation !== connectGeneration) {
        return;
      }
      if (debug) {
        log("ws.connect.error", { message: error instanceof Error ? error.message : String(error) });
      }
      handlers.onState("error");
      scheduleReconnect();
      return;
    }

    const currentSocket = socket;

    currentSocket.addEventListener("open", () => {
      if (closed || generation !== connectGeneration || socket !== currentSocket) {
        return;
      }
      reconnectAttempts = 0;
      if (debug) {
        log("ws.open", { url });
      }
      handlers.onState("connected");
    });

    currentSocket.addEventListener("message", (event) => {
      if (closed || generation !== connectGeneration || socket !== currentSocket) {
        return;
      }
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

    currentSocket.addEventListener("error", () => {
      if (closed || generation !== connectGeneration || socket !== currentSocket) {
        return;
      }
      if (debug) {
        log("ws.error", { url });
      }
      handlers.onState("error");
    });

    currentSocket.addEventListener("close", () => {
      if (closed) {
        if (debug) {
          log("ws.closed.manual", { url });
        }
        return;
      }
      if (generation !== connectGeneration || socket !== currentSocket) {
        return;
      }
      socket = null;
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
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
      }
      if (debug) {
        log("ws.close.requested", { url });
      }
    }
  };
}
