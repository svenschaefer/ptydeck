import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCursorPositionReport,
  countCursorPositionQueries,
  createSessionManagerTraceRuntime,
  normalizeTraceSeed,
  normalizeTraceToken
} from "../src/session-manager-trace-runtime.js";

test("session-manager trace runtime normalizes tokens and trace seeds fail-closed", () => {
  assert.equal(normalizeTraceToken(null), "");
  assert.equal(normalizeTraceToken(" "), "");
  assert.equal(normalizeTraceToken(" trace-1 "), "trace-1");
  assert.equal(normalizeTraceToken("x".repeat(129)), "");

  assert.equal(normalizeTraceSeed(null), null);
  assert.equal(normalizeTraceSeed([]), null);
  assert.deepEqual(
    normalizeTraceSeed({
      traceId: " trace-1 ",
      correlationId: " corr-1 ",
      requestId: " req-1 ",
      connectionId: " conn-1 ",
      sessionId: " sess-1 ",
      deckId: " deck-1 ",
      source: " http ",
      ignored: "value"
    }),
    {
      traceId: "trace-1",
      correlationId: "corr-1",
      requestId: "req-1",
      connectionId: "conn-1",
      sessionId: "sess-1",
      deckId: "deck-1",
      source: "http"
    }
  );
  assert.equal(normalizeTraceSeed({ traceId: "x".repeat(129) }), null);
});

test("session-manager trace runtime creates trace envelopes with deterministic parent and correlation fallbacks", () => {
  const runtime = createSessionManagerTraceRuntime({
    createTraceId: () => " trace-new "
  });

  assert.deepEqual(
    runtime.createTraceEnvelope(
      {
        traceId: " trace-parent ",
        correlationId: " corr-seed ",
        requestId: " req-seed ",
        connectionId: " conn-seed "
      },
      {
        sessionId: " session-1 ",
        source: " pty "
      }
    ),
    {
      traceId: "trace-new",
      correlationId: "corr-seed",
      parentTraceId: "trace-parent",
      requestId: "req-seed",
      connectionId: "conn-seed",
      sessionId: "session-1",
      source: "pty"
    }
  );

  const overrideRuntime = createSessionManagerTraceRuntime({
    createTraceId: () => " "
  });
  const envelope = overrideRuntime.createTraceEnvelope(
    {
      traceId: " seed-trace ",
      correlationId: " seed-corr ",
      deckId: " deck-seed "
    },
    {
      traceId: " override-parent ",
      correlationId: " override-corr ",
      requestId: " override-req ",
      deckId: " deck-override "
    }
  );

  assert.match(envelope.traceId, /^[0-9a-f-]{36}$/);
  assert.equal(envelope.correlationId, "override-corr");
  assert.equal(envelope.parentTraceId, "override-parent");
  assert.equal(envelope.requestId, "override-req");
  assert.equal(envelope.deckId, "deck-override");
});

test("session-manager trace runtime counts terminal cursor queries and builds bounded reports deterministically", () => {
  assert.equal(countCursorPositionQueries(""), 0);
  assert.equal(countCursorPositionQueries("\u001b[6nhello\u001b[6n"), 2);
  assert.equal(buildCursorPositionReport(), "\u001b[1;1R");
  assert.equal(buildCursorPositionReport(4, 9), "\u001b[4;9R");
  assert.equal(buildCursorPositionReport(0, -2), "\u001b[1;1R");
});
