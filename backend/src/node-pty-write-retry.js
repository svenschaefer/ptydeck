import { write as defaultFsWrite } from "node:fs";

const PATCH_STATE = Symbol("ptydeck.nodePtyAsyncWritePatchState");
const QUEUED_WRITE_META = Symbol("ptydeck.nodePtyQueuedWriteMeta");

export const DEFAULT_NODE_PTY_EINTR_RETRY_LIMIT = 8;
export const RETRYABLE_NODE_PTY_WRITE_ERROR_CODES = new Set(["EINTR"]);

function normalizeTrace(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }
  return { ...trace };
}

function normalizeWriteMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  return {
    ...(typeof meta.sessionId === "string" && meta.sessionId ? { sessionId: meta.sessionId } : {}),
    ...(typeof meta.writeKind === "string" && meta.writeKind ? { writeKind: meta.writeKind } : {}),
    ...(Number.isInteger(meta.bytes) && meta.bytes >= 0 ? { bytes: meta.bytes } : {}),
    ...(normalizeTrace(meta.trace) ? { trace: normalizeTrace(meta.trace) } : {})
  };
}

function buildStructuredEvent(task, overrides = {}) {
  const meta = normalizeWriteMeta(task?.meta);
  return {
    ...(meta?.sessionId ? { sessionId: meta.sessionId } : {}),
    phase: typeof overrides.phase === "string" && overrides.phase ? overrides.phase : "failed",
    writeKind: overrides.writeKind || meta?.writeKind || "direct",
    bytes: Number.isInteger(overrides.bytes) ? overrides.bytes : meta?.bytes || task?.buffer?.byteLength || 0,
    ...(meta?.trace ? { trace: meta.trace } : {}),
    ...(typeof overrides.error === "string" && overrides.error ? { error: overrides.error } : {}),
    ...(typeof overrides.code === "string" && overrides.code ? { code: overrides.code } : {}),
    ...(typeof overrides.failureStage === "string" && overrides.failureStage ? { failureStage: overrides.failureStage } : {}),
    ...(Number.isInteger(overrides.retryCount) ? { retryCount: overrides.retryCount } : {}),
    ...(Number.isInteger(overrides.queueDepth) ? { queueDepth: overrides.queueDepth } : {}),
    ...(Number.isInteger(overrides.queueDroppedCount) ? { queueDroppedCount: overrides.queueDroppedCount } : {}),
    ...(overrides.droppedByQueueFailure === true ? { droppedByQueueFailure: true } : {}),
    ...(overrides.retryable === true ? { retryable: true } : {})
  };
}

function emitAsyncWriteEvent(state, task, overrides = {}) {
  if (!state || typeof state.onAsyncWriteEvent !== "function") {
    return;
  }
  try {
    state.onAsyncWriteEvent(buildStructuredEvent(task, overrides));
  } catch {
    // Structured observability must not break PTY writes.
  }
}

function scheduleWriteQueue(writeStream, state) {
  if (writeStream._writeImmediate) {
    return;
  }
  writeStream._writeImmediate = state.setImmediateFn(() => {
    writeStream._processWriteQueue();
  });
}

function isPatchableWriteStream(writeStream) {
  return Boolean(
    writeStream &&
      typeof writeStream === "object" &&
      Number.isInteger(writeStream._fd) &&
      Array.isArray(writeStream._writeQueue)
  );
}

function patchWriteStream(writeStream, state) {
  writeStream.write = function patchedNodePtyWrite(data, meta = null) {
    const buffer = typeof data === "string" ? Buffer.from(data, this._encoding || undefined) : Buffer.from(data);
    if (buffer.byteLength === 0) {
      return;
    }
    this._writeQueue.push({
      buffer,
      offset: 0,
      meta: normalizeWriteMeta(meta),
      interruptRetryCount: 0
    });
    if (this._writeQueue.length === 1 && !this._writeImmediate) {
      this._processWriteQueue();
    }
  };

  writeStream._processWriteQueue = function patchedNodePtyProcessWriteQueue() {
    this._writeImmediate = undefined;
    if (this._writeQueue.length === 0) {
      return;
    }

    const task = this._writeQueue[0];
    state.fsWrite(this._fd, task.buffer, task.offset, (error, written = 0) => {
      if (error) {
        const code = typeof error.code === "string" ? error.code : "";
        if (code === "EAGAIN") {
          scheduleWriteQueue(this, state);
          return;
        }
        if (RETRYABLE_NODE_PTY_WRITE_ERROR_CODES.has(code) && task.interruptRetryCount < state.maxEintrRetries) {
          task.interruptRetryCount += 1;
          emitAsyncWriteEvent(state, task, {
            phase: "retry",
            code,
            error: error.message || String(error),
            failureStage: "async",
            retryCount: task.interruptRetryCount,
            retryable: true,
            queueDepth: this._writeQueue.length
          });
          scheduleWriteQueue(this, state);
          return;
        }

        const droppedTasks = this._writeQueue.splice(0, this._writeQueue.length);
        const queueDroppedCount = droppedTasks.length;
        for (const [index, droppedTask] of droppedTasks.entries()) {
          emitAsyncWriteEvent(state, droppedTask, {
            phase: "failed",
            code,
            error: error.message || String(error),
            failureStage: "async",
            retryCount: droppedTask.interruptRetryCount,
            queueDroppedCount,
            droppedByQueueFailure: index > 0
          });
        }
        return;
      }

      task.offset += written;
      if (task.offset >= task.buffer.byteLength) {
        this._writeQueue.shift();
        emitAsyncWriteEvent(state, task, {
          phase: "committed",
          failureStage: "async",
          retryCount: task.interruptRetryCount
        });
      }

      this._processWriteQueue();
    });
  };

  writeStream.dispose = function patchedNodePtyDispose() {
    if (this._writeImmediate) {
      state.clearImmediateFn(this._writeImmediate);
      this._writeImmediate = undefined;
    }
  };
}

export function attachNodePtyAsyncWritePatch(ptyProcess, options = {}) {
  if (!ptyProcess || typeof ptyProcess !== "object") {
    return false;
  }
  const writeStream = ptyProcess._writeStream;
  if (!isPatchableWriteStream(writeStream) || typeof ptyProcess._write !== "function") {
    return false;
  }

  const nextState = {
    maxEintrRetries:
      Number.isInteger(options.maxEintrRetries) && options.maxEintrRetries >= 0
        ? options.maxEintrRetries
        : DEFAULT_NODE_PTY_EINTR_RETRY_LIMIT,
    fsWrite: typeof options.fsWrite === "function" ? options.fsWrite : defaultFsWrite,
    setImmediateFn: typeof options.setImmediateFn === "function" ? options.setImmediateFn : setImmediate,
    clearImmediateFn: typeof options.clearImmediateFn === "function" ? options.clearImmediateFn : clearImmediate,
    onAsyncWriteEvent: typeof options.onAsyncWriteEvent === "function" ? options.onAsyncWriteEvent : null
  };

  if (ptyProcess[PATCH_STATE]) {
    ptyProcess[PATCH_STATE].onAsyncWriteEvent = nextState.onAsyncWriteEvent;
    ptyProcess[PATCH_STATE].maxEintrRetries = nextState.maxEintrRetries;
    ptyProcess[PATCH_STATE].fsWrite = nextState.fsWrite;
    ptyProcess[PATCH_STATE].setImmediateFn = nextState.setImmediateFn;
    ptyProcess[PATCH_STATE].clearImmediateFn = nextState.clearImmediateFn;
    return true;
  }

  ptyProcess[PATCH_STATE] = nextState;
  patchWriteStream(writeStream, nextState);

  ptyProcess._write = function ptydeckPatchedNodePtyWrite(data) {
    const meta = normalizeWriteMeta(this[QUEUED_WRITE_META]);
    this[QUEUED_WRITE_META] = null;
    this._writeStream.write(data, meta);
  };
  ptyProcess.__ptydeckQueueAsyncWriteMeta = function queueAsyncWriteMeta(meta) {
    this[QUEUED_WRITE_META] = normalizeWriteMeta(meta);
  };
  ptyProcess.__ptydeckClearQueuedAsyncWriteMeta = function clearQueuedAsyncWriteMeta() {
    this[QUEUED_WRITE_META] = null;
  };
  return true;
}

export function queueNodePtyAsyncWriteMeta(ptyProcess, meta) {
  if (ptyProcess && typeof ptyProcess.__ptydeckQueueAsyncWriteMeta === "function") {
    ptyProcess.__ptydeckQueueAsyncWriteMeta(meta);
  }
}

export function clearNodePtyAsyncWriteMeta(ptyProcess) {
  if (ptyProcess && typeof ptyProcess.__ptydeckClearQueuedAsyncWriteMeta === "function") {
    ptyProcess.__ptydeckClearQueuedAsyncWriteMeta();
  }
}
