import test from "node:test";
import assert from "node:assert/strict";

import { createStreamPluginEngine } from "../src/public/stream-plugin-engine.js";

test("stream plugin engine registers plugins deterministically by priority then registration order", () => {
  const engine = createStreamPluginEngine();

  engine.registerPlugin({ id: "middle" });
  engine.registerPlugin({ id: "high", priority: 10 });
  engine.registerPlugin({ id: "low", priority: -5 });
  engine.registerPlugin({ id: "middle-2" });

  assert.deepEqual(
    engine.listPlugins().map((plugin) => plugin.id),
    ["low", "middle", "middle-2", "high"]
  );
});

test("stream plugin engine rejects duplicate plugin ids", () => {
  const engine = createStreamPluginEngine();
  engine.registerPlugin({ id: "dup" });
  assert.throws(() => engine.registerPlugin({ id: "dup" }), /Duplicate stream plugin id/);
});

test("stream plugin engine dispatches session hooks and resolves action conflicts last-wins", () => {
  const actions = [];
  const starts = [];
  const disposes = [];
  const engine = createStreamPluginEngine({
    getSession(sessionId) {
      return {
        id: sessionId,
        deckId: "default",
        name: "alpha",
        state: "running",
        lifecycleState: "idle",
        tags: ["ops"]
      };
    },
    onActions(sessionId, nextActions, meta) {
      actions.push({ sessionId, nextActions, meta });
    }
  });

  engine.replacePlugins([
    {
      id: "base",
      priority: 0,
      onSessionStart(session) {
        starts.push(session.id);
      },
      onSessionDispose(session) {
        disposes.push(session.id);
      },
      onLine(session, line) {
        return [
          { type: "setSessionStatus", value: `${session.name}:${line}` },
          { type: "markSessionAttention", conflictKey: "attention", active: false }
        ];
      }
    },
    {
      id: "override",
      priority: 5,
      onLine() {
        return [
          { type: "markSessionAttention", conflictKey: "attention", active: true }
        ];
      }
    }
  ]);

  engine.ensureSession("s1");
  const resolved = engine.handleLine("s1", "hello");
  engine.disposeSession("s1");

  assert.deepEqual(starts, ["s1"]);
  assert.deepEqual(disposes, ["s1"]);
  assert.deepEqual(
    resolved,
    [
      { type: "setSessionStatus", value: "alpha:hello", pluginId: "base" },
      { type: "markSessionAttention", conflictKey: "attention", active: true, pluginId: "override" }
    ]
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].sessionId, "s1");
  assert.equal(actions[0].meta.hook, "onLine");
  assert.equal(actions[0].meta.session.name, "alpha");
});

test("stream plugin engine isolates plugin errors and passes frozen session context", () => {
  const errors = [];
  const observedSessions = [];
  const engine = createStreamPluginEngine({
    getSession(sessionId) {
      return {
        id: sessionId,
        deckId: "ops",
        name: "beta",
        state: "running",
        lifecycleState: "busy",
        tags: ["ops"],
        meta: { source: "runtime" }
      };
    },
    onPluginError(details) {
      errors.push(details);
    }
  });

  engine.replacePlugins([
    {
      id: "broken",
      onData() {
        throw new Error("boom");
      }
    },
    {
      id: "observer",
      onData(session, chunk) {
        observedSessions.push({ session, chunk });
        assert.throws(() => {
          session.name = "mutated";
        }, TypeError);
        return null;
      }
    }
  ]);

  const actions = engine.handleData("s2", "payload");

  assert.deepEqual(actions, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].pluginId, "broken");
  assert.equal(errors[0].hook, "onData");
  assert.equal(observedSessions.length, 1);
  assert.equal(observedSessions[0].session.name, "beta");
  assert.deepEqual(observedSessions[0].session.tags, ["ops"]);
});

test("stream plugin engine rejects non-array and invalid action payloads", () => {
  const engine = createStreamPluginEngine();
  const errors = [];
  const invalidEngine = createStreamPluginEngine({
    onPluginError(details) {
      errors.push(details);
    }
  });

  invalidEngine.registerPlugin({
    id: "bad-return",
    onIdle() {
      return { type: "nope" };
    }
  });
  invalidEngine.registerPlugin({
    id: "bad-action",
    onIdle() {
      return [{}];
    }
  });

  assert.deepEqual(invalidEngine.handleIdle("s3"), []);
  assert.equal(errors.length, 2);

  assert.throws(() => engine.registerPlugin(null), /must be an object/);
});
