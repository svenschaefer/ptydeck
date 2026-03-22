export function createWsClient(url, handlers) {
  let socket = null;
  let closed = false;
  let reconnectTimer = null;

  function connect() {
    handlers.onState("connecting");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      handlers.onState("connected");
    });

    socket.addEventListener("message", (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed payloads
      }
    });

    socket.addEventListener("close", () => {
      if (closed) {
        return;
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
    }
  };
}
