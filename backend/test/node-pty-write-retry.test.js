import test from "node:test";
import assert from "node:assert/strict";
import {
  attachNodePtyAsyncWritePatch,
  queueNodePtyAsyncWriteMeta
} from "../src/node-pty-write-retry.js";

function createPatchablePty() {
  return {
    _writeStream: {
      _fd: 11,
      _encoding: "utf8",
      _writeQueue: [],
      _writeImmediate: undefined,
      dispose() {}
    },
    _write(data) {
      this._writeStream.write(data);
    },
    write(data) {
      this._write(data);
    }
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

test("node-pty async write patch retries EINTR and preserves queued writes", async () => {
  const pty = createPatchablePty();
  const events = [];
  const writeCalls = [];
  let interrupted = false;

  attachNodePtyAsyncWritePatch(pty, {
    fsWrite(fd, buffer, offset, callback) {
      writeCalls.push({ fd, text: buffer.toString("utf8"), offset });
      if (!interrupted) {
        interrupted = true;
        setImmediate(() => callback(Object.assign(new Error("interrupted"), { code: "EINTR" }), 0));
        return;
      }
      setImmediate(() => callback(null, buffer.byteLength - offset));
    },
    onAsyncWriteEvent(event) {
      events.push(event);
    },
    maxEintrRetries: 3
  });

  queueNodePtyAsyncWriteMeta(pty, {
    sessionId: "session-1",
    writeKind: "body",
    bytes: 3,
    trace: { correlationId: "corr-1", source: "rest" }
  });
  pty.write("abc");
  queueNodePtyAsyncWriteMeta(pty, {
    sessionId: "session-1",
    writeKind: "submit_cr",
    bytes: 1,
    trace: { correlationId: "corr-2", source: "rest" }
  });
  pty.write("\r");

  await waitFor(() => events.filter((event) => event.phase === "committed").length === 2);

  assert.deepEqual(
    writeCalls.map((call) => `${call.text}:${call.offset}`),
    ["abc:0", "abc:0", "\r:0"]
  );
  assert.deepEqual(
    events.map((event) => ({ phase: event.phase, writeKind: event.writeKind, retryCount: event.retryCount || 0 })),
    [
      { phase: "retry", writeKind: "body", retryCount: 1 },
      { phase: "committed", writeKind: "body", retryCount: 1 },
      { phase: "committed", writeKind: "submit_cr", retryCount: 0 }
    ]
  );
  assert.equal(pty._writeStream._writeQueue.length, 0);
});

test("node-pty async write patch surfaces structured failure after EINTR retry exhaustion", async () => {
  const pty = createPatchablePty();
  const events = [];

  attachNodePtyAsyncWritePatch(pty, {
    fsWrite(fd, buffer, offset, callback) {
      setImmediate(() => callback(Object.assign(new Error("interrupted"), { code: "EINTR" }), 0));
    },
    onAsyncWriteEvent(event) {
      events.push(event);
    },
    maxEintrRetries: 1
  });

  queueNodePtyAsyncWriteMeta(pty, {
    sessionId: "session-1",
    writeKind: "body",
    bytes: 3,
    trace: { correlationId: "corr-1", source: "rest" }
  });
  pty.write("abc");
  queueNodePtyAsyncWriteMeta(pty, {
    sessionId: "session-1",
    writeKind: "submit_cr",
    bytes: 1,
    trace: { correlationId: "corr-2", source: "rest" }
  });
  pty.write("\r");

  await waitFor(() => events.filter((event) => event.phase === "failed").length === 2);

  assert.deepEqual(
    events.map((event) => ({
      phase: event.phase,
      writeKind: event.writeKind,
      code: event.code || "",
      droppedByQueueFailure: event.droppedByQueueFailure === true
    })),
    [
      { phase: "retry", writeKind: "body", code: "EINTR", droppedByQueueFailure: false },
      { phase: "failed", writeKind: "body", code: "EINTR", droppedByQueueFailure: false },
      { phase: "failed", writeKind: "submit_cr", code: "EINTR", droppedByQueueFailure: true }
    ]
  );
  assert.equal(pty._writeStream._writeQueue.length, 0);
});
