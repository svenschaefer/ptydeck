import test from "node:test";
import assert from "node:assert/strict";
import {
  createTraceEnvelope,
  createTraceId,
  inferTraceContextFromPayload,
  normalizeTraceSeed,
  normalizeTraceToken,
  withTracePayload
} from "../src/runtime-trace-helpers.js";

test("runtime trace helpers normalize trace tokens and seeds conservatively", () => {
  assert.equal(normalizeTraceToken("  abc  "), "abc");
  assert.equal(normalizeTraceToken(""), "");
  assert.equal(normalizeTraceToken("x".repeat(129)), "");
  assert.equal(normalizeTraceToken(42), "");

  assert.equal(normalizeTraceSeed(null), null);
  assert.equal(normalizeTraceSeed([]), null);
  assert.deepEqual(
    normalizeTraceSeed({
      traceId: " trace-1 ",
      correlationId: " corr-1 ",
      requestId: "",
      connectionId: " conn-1 ",
      sessionId: " session-1 ",
      deckId: " deck-1 ",
      source: " rest "
    }),
    {
      traceId: "trace-1",
      correlationId: "corr-1",
      connectionId: "conn-1",
      sessionId: "session-1",
      deckId: "deck-1",
      source: "rest"
    }
  );
});

test("runtime trace helpers build trace ids and envelopes deterministically when injected", () => {
  assert.equal(createTraceId("req", () => "uuid-1"), "req-uuid-1");

  const envelope = createTraceEnvelope(
    { traceId: "parent-trace", correlationId: "seed-corr", requestId: "seed-req", source: "rest" },
    { sessionId: "session-1", deckId: "deck-1" },
    () => "trc-fixed"
  );

  assert.deepEqual(envelope, {
    traceId: "trc-fixed",
    correlationId: "seed-corr",
    parentTraceId: "parent-trace",
    requestId: "seed-req",
    sessionId: "session-1",
    deckId: "deck-1",
    source: "rest"
  });
});

test("runtime trace helpers infer trace context from payloads and preserve pre-traced payloads", () => {
  assert.deepEqual(
    inferTraceContextFromPayload({
      session: { id: "session-1", deckId: "deck-1" }
    }),
    {
      sessionId: "session-1",
      deckId: "deck-1"
    }
  );

  const tracedPayload = {
    type: "session.updated",
    sessionId: "session-1",
    trace: {
      traceId: "trace-existing",
      correlationId: "corr-existing"
    }
  };
  assert.equal(withTracePayload(tracedPayload, { sessionId: "session-1" }), tracedPayload);
});

test("runtime trace helpers add trace envelopes only for object payloads missing trace metadata", () => {
  assert.equal(withTracePayload(null, { sessionId: "session-1" }), null);
  assert.deepEqual(withTracePayload(["ignore"], { sessionId: "session-1" }), ["ignore"]);

  const payload = {
    type: "session.updated",
    session: { id: "session-1", deckId: "deck-1" }
  };
  const tracedPayload = withTracePayload(
    payload,
    { correlationId: "corr-seed", requestId: "req-seed" },
    (seed, overrides) => {
      assert.deepEqual(seed, { correlationId: "corr-seed", requestId: "req-seed" });
      assert.deepEqual(overrides, { sessionId: "session-1", deckId: "deck-1" });
      return {
        traceId: "trace-new",
        correlationId: "corr-seed",
        sessionId: "session-1",
        deckId: "deck-1"
      };
    }
  );

  assert.deepEqual(tracedPayload, {
    type: "session.updated",
    session: { id: "session-1", deckId: "deck-1" },
    trace: {
      traceId: "trace-new",
      correlationId: "corr-seed",
      sessionId: "session-1",
      deckId: "deck-1"
    }
  });
});
