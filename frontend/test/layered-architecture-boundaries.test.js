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

test("stream and state modules stay free of UI and DOM shortcuts", async () => {
  const [terminalStreamSource, storeSource] = await readSources(["terminal-stream.js", "store.js"]);

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

  for (const source of [terminalStreamSource, storeSource]) {
    for (const marker of forbiddenMarkers) {
      assert.equal(source.includes(marker), false, `did not expect cross-layer marker ${marker}`);
    }
  }
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

test("runtime composition keeps raw stream data on the terminal path and activity clearing on the idle path", async () => {
  const [compositionSource, foundationSource] = await readSources([
    "app-runtime-composition-controller.js",
    "app-runtime-foundation.js"
  ]);

  const compositionMarkers = [
    'import { createAppRuntimeFoundation } from "./app-runtime-foundation.js";',
    'import { createSessionStreamAuthorityController } from "./session-stream-authority-controller.js";',
    "const streamAdapter = createSessionStreamAuthorityController({",
    "recordTrace: (sessionId, eventType, payload) => streamDebugTraceController.record(sessionId, eventType, payload),",
    "appendTerminalChunk: (sessionId, chunk) => appSessionRuntimeFacadeController?.appendTerminalChunk(sessionId, chunk),",
    "clearSessionActivity: (sessionId) => store.clearSessionActivity(sessionId)"
  ];

  for (const marker of compositionMarkers) {
    assert.ok(compositionSource.includes(marker), `expected runtime composition marker ${marker}`);
  }

  const foundationMarkers = [
    'import { createStore as defaultCreateStore } from "./store.js";',
    "const store = createStore();"
  ];

  for (const marker of foundationMarkers) {
    assert.ok(foundationSource.includes(marker), `expected runtime foundation marker ${marker}`);
  }

  const forbiddenMarkers = [
    'import { createStreamActionDispatcher } from "./stream-action-dispatcher.js";',
    'import { createStreamPluginEngine } from "./stream-plugin-engine.js";',
    "streamPluginEngine.handleData(",
    "streamPluginEngine.handleLine(",
    "streamPluginEngine.handleIdle(",
    "createBuiltInStreamPlugins(",
    "createArtifactStreamPlugins("
  ];

  for (const marker of forbiddenMarkers) {
    assert.equal(compositionSource.includes(marker), false, `did not expect runtime stream-interpretation marker ${marker}`);
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
