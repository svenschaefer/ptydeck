import test from "node:test";
import assert from "node:assert/strict";

import { createArtifactStreamPlugins } from "../src/public/stream-artifact-plugins.js";

function getPlugin() {
  return createArtifactStreamPlugins()[0];
}

test("artifact plugin extracts inline summary/result lines into session artifacts", () => {
  const plugin = getPlugin();
  const summaryActions = plugin.onLine({ id: "s1" }, "Summary: fixed the scroll bug");
  const resultActions = plugin.onLine({ id: "s1" }, "Result: green test suite");

  assert.equal(summaryActions[0].type, "upsertSessionArtifact");
  assert.equal(summaryActions[0].artifact.id, "artifact:summary");
  assert.match(summaryActions[0].artifact.text, /scroll bug/i);
  assert.equal(resultActions[0].artifact.id, "artifact:result");
});

test("artifact plugin captures short summary blocks and flushes them on idle", () => {
  const plugin = getPlugin();
  assert.equal(plugin.onLine({ id: "s2" }, "## Summary"), null);
  assert.equal(plugin.onLine({ id: "s2" }, "- fixed send path"), null);
  assert.equal(plugin.onLine({ id: "s2" }, "- improved deck sync"), null);

  const idleActions = plugin.onIdle({ id: "s2" });
  assert.equal(idleActions[0].type, "upsertSessionArtifact");
  assert.equal(idleActions[0].artifact.id, "artifact:summary");
  assert.match(idleActions[0].artifact.text, /fixed send path/i);
  assert.match(idleActions[0].artifact.text, /improved deck sync/i);
});
