import { createSessionStreamAdapter } from "./terminal-stream.js";

export function createSessionStreamAuthorityController(options = {}) {
  const idleMs = Number.isFinite(options.idleMs) ? Number(options.idleMs) : 1400;
  const appendTerminalChunk =
    typeof options.appendTerminalChunk === "function" ? options.appendTerminalChunk : () => false;
  const clearSessionActivity =
    typeof options.clearSessionActivity === "function" ? options.clearSessionActivity : () => {};
  const recordTrace = typeof options.recordTrace === "function" ? options.recordTrace : () => {};

  const streamAdapter = createSessionStreamAdapter({
    idleMs,
    onData(sessionId, chunk) {
      recordTrace(sessionId, "stream.data", { chunk });
      appendTerminalChunk(sessionId, chunk);
    },
    onIdle(sessionId) {
      recordTrace(sessionId, "stream.idle", {});
      clearSessionActivity(sessionId);
    }
  });

  return {
    push: streamAdapter.push,
    resetSession: streamAdapter.resetSession,
    disposeSession: streamAdapter.disposeSession,
    dispose: streamAdapter.dispose,
    getPendingLine: streamAdapter.getPendingLine
  };
}
