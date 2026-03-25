import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceRoot = new URL("../src/public/", import.meta.url);

function sourcePath(relativePath) {
  return fileURLToPath(new URL(relativePath, sourceRoot));
}

async function readSources(relativePaths) {
  return Promise.all(relativePaths.map((relativePath) => readFile(sourcePath(relativePath), "utf8")));
}

test("stream, interpretation, and state modules stay free of UI and DOM shortcuts", async () => {
  const [streamPluginEngineSource, streamActionDispatcherSource, storeSource] = await readSources([
    "stream-plugin-engine.js",
    "stream-action-dispatcher.js",
    "store.js"
  ]);

  const forbiddenMarkers = [
    "document.",
    "querySelector",
    "createElement",
    "classList",
    "textContent",
    "innerHTML",
    'from "./ui/',
    'from "../ui/'
  ];

  for (const source of [streamPluginEngineSource, streamActionDispatcherSource, storeSource]) {
    for (const marker of forbiddenMarkers) {
      assert.equal(source.includes(marker), false, `did not expect cross-layer marker ${marker}`);
    }
  }

  assert.match(
    streamActionDispatcherSource,
    /store\.applySessionInterpretationActions\(normalizedSessionId, normalizedActions\);/
  );
});

test("ui controllers stay free of store and interpretation internals", async () => {
  const [
    sessionGridSource,
    sessionTerminalRuntimeSource,
    sessionDisposalSource,
    sessionCardMetaSource,
    workspaceRenderSource
  ] = await readSources([
    "ui/session-grid-controller.js",
    "ui/session-terminal-runtime-controller.js",
    "ui/session-disposal-controller.js",
    "ui/session-card-meta-controller.js",
    "ui/workspace-render-controller.js"
  ]);

  const forbiddenMarkers = [
    "createStore(",
    "store.",
    "applySessionInterpretationActions",
    "createStreamActionDispatcher(",
    "createStreamPluginEngine(",
    "streamPluginEngine",
    "streamAdapter"
  ];

  for (const source of [
    sessionGridSource,
    sessionTerminalRuntimeSource,
    sessionDisposalSource,
    sessionCardMetaSource,
    workspaceRenderSource
  ]) {
    for (const marker of forbiddenMarkers) {
      assert.equal(source.includes(marker), false, `did not expect UI shortcut marker ${marker}`);
    }
  }
});

test("runtime composition preserves the plugin-engine to dispatcher to store contract", async () => {
  const source = await readFile(sourcePath("app-runtime-composition-controller.js"), "utf8");

  const requiredMarkers = [
    'import { createStore } from "./store.js";',
    'import { createStreamActionDispatcher } from "./stream-action-dispatcher.js";',
    'import { createStreamPluginEngine } from "./stream-plugin-engine.js";',
    "const store = createStore();",
    "const streamActionDispatcher = createStreamActionDispatcher({",
    "const streamPluginEngine = createStreamPluginEngine({",
    "const appliedActions = streamActionDispatcher.dispatch(sessionId, actions, meta);",
    "streamPluginEngine.handleData(sessionId, chunk);",
    "streamPluginEngine.handleLine(sessionId, line);",
    "streamPluginEngine.handleIdle(sessionId);",
    "store.clearSessionActivity(sessionId);"
  ];

  for (const marker of requiredMarkers) {
    assert.ok(source.includes(marker), `expected runtime composition marker ${marker}`);
  }
});

test("bootstrap composition keeps websocket data on the stream path and runtime events on the state path", async () => {
  const source = await readFile(sourcePath("app-bootstrap-composition-controller.js"), "utf8");

  assert.match(source, /pushSessionData: \(sessionId, data\) => streamAdapter\?\.push\?\.\(sessionId, data\),/);
  assert.match(
    source,
    /applyRuntimeEvent: \(event, runtimeOptions\) => appSessionRuntimeFacadeController\?\.applyRuntimeEvent\?\.\(event, runtimeOptions\) === true,/
  );
});
