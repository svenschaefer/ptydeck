import test from "node:test";
import assert from "node:assert/strict";

import { createStreamInterpretationPluginEngine } from "../src/public/stream-interpretation-plugin-engine.js";

test("stream interpretation plugin engine emits ordered session action batches", () => {
  const sessions = new Map([["s1", { id: "s1", name: "one" }]]);
  const engine = createStreamInterpretationPluginEngine({
    plugins: [
      {
        id: "status-plugin",
        priority: 20,
        eventTypes: ["session.data"],
        interpret: (context) => {
          assert.equal(context.session?.name, "one");
          assert.equal(context.data, "build complete\n");
          return [
            { type: "unknownAction", value: "ignored" },
            { type: "setSessionStatus", value: "Build complete" },
            {
              type: "upsertSessionArtifact",
              artifact: { id: "summary", kind: "summary", title: "Summary" }
            }
          ];
        }
      },
      {
        id: "attention-plugin",
        priority: 10,
        eventTypes: ["session.data"],
        interpret: () => [{ type: "markSessionAttention", active: true }]
      }
    ]
  });

  assert.deepEqual(engine.listPlugins(), [
    { id: "attention-plugin", priority: 10, eventTypes: ["session.data"] },
    { id: "status-plugin", priority: 20, eventTypes: ["session.data"] }
  ]);

  const result = engine.interpretRuntimeEvent(
    { type: "session.data", sessionId: "s1", data: "build complete\n" },
    { getSessionById: (sessionId) => sessions.get(sessionId), timestamp: 123 }
  );

  assert.deepEqual(result, {
    batches: [
      {
        sessionId: "s1",
        actions: [
          { type: "markSessionAttention", active: true },
          { type: "setSessionStatus", value: "Build complete" },
          {
            type: "upsertSessionArtifact",
            artifact: { id: "summary", kind: "summary", title: "Summary", pluginId: "status-plugin" }
          }
        ]
      }
    ],
    errors: []
  });
});

test("stream interpretation plugin engine isolates plugin failures and explicit batches", () => {
  const engine = createStreamInterpretationPluginEngine();
  assert.equal(engine.registerPlugin({ id: "bad", interpret: () => { throw new Error("boom"); } }), true);
  assert.equal(
    engine.registerPlugin({
      id: "batch",
      interpret: () => ({
        batches: [
          {
            sessionId: "s2",
            actions: [
              {
                type: "pushSessionNotification",
                notification: { id: "n1", level: "info", message: "Plugin completed." }
              }
            ]
          }
        ]
      })
    }),
    true
  );
  assert.equal(engine.registerPlugin({ id: "batch", interpret: () => [] }), false);

  const result = engine.interpretRuntimeEvent({ type: "session.updated", session: { id: "s1" } });

  assert.deepEqual(result, {
    batches: [
      {
        sessionId: "s2",
        actions: [
          {
            type: "pushSessionNotification",
            notification: {
              id: "n1",
              level: "info",
              message: "Plugin completed.",
              pluginId: "batch"
            }
          }
        ]
      }
    ],
    errors: [{ pluginId: "bad", message: "boom" }]
  });
});

test("stream interpretation plugin engine fails closed for invalid registrations, non-events, and malformed plugin batches", () => {
  const engine = createStreamInterpretationPluginEngine();

  assert.equal(engine.registerPlugin(null), false);
  assert.equal(engine.registerPlugin({ id: "", interpret: () => [] }), false);
  assert.equal(
    engine.registerPlugin({
      id: "bad-batch",
      eventTypes: ["session.data"],
      interpret: () => ({
        batches: [
          null,
          { sessionId: "", actions: [{ type: "setSessionStatus", value: "ignored" }] },
          {
            sessionId: "s-2",
            actions: [
              { type: "unknown", value: "ignored" },
              { type: "setSessionBadges", badges: [{ id: "b-1", text: "ready" }] }
            ]
          }
        ]
      })
    }),
    true
  );

  assert.deepEqual(engine.interpretRuntimeEvent(null), { batches: [], errors: [] });
  assert.deepEqual(engine.interpretRuntimeEvent({ type: "" }), { batches: [], errors: [] });
  assert.deepEqual(engine.interpretRuntimeEvent({ type: "session.updated" }), { batches: [], errors: [] });

  const result = engine.interpretRuntimeEvent({ type: "session.data", sessionId: "s-1", data: "ok" });
  assert.deepEqual(result, {
    batches: [
      {
        sessionId: "s-1",
        actions: [{ type: "setSessionStatus", value: "ignored" }]
      },
      {
        sessionId: "s-2",
        actions: [
          {
            type: "setSessionBadges",
            badges: [{ id: "b-1", text: "ready", pluginId: "bad-batch" }]
          }
        ]
      }
    ],
    errors: []
  });
});
